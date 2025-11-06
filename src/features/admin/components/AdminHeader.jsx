// src/features/admin/components/AdminHeader.jsx
// ============================================================================
// 관리자 헤더
// - /auth/me, /auth/ping 기반으로 세션 남은 시간 표시
// - 브로드캐스트 로그아웃(sync) 지원
// - ✅ 변경점:
//   1) fetchMe() 응답에서 id/userId/userName 모두 보존 → me.id 표시 가능
//   2) 가장 중요: 로그인 상태 확정 시 localStorage.currentAdminId 저장 +
//      axios 기본 헤더 'X-App-User-Id' 세팅 → 서버 히스토리 트리거 event_by에 사용됨
// ============================================================================

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { fetchMe, ping, logout as apiLogout } from '@/api/authApi';
import { alertError } from '@/ui/alert';

export default function AdminHeader() {
    const nav = useNavigate();
    const loc = useLocation();

    const [me, setMe] = useState(null);
    const [remaining, setRemaining] = useState(null); // 숫자 확정 전엔 null

    const mountedRef = useRef(false);
    const countdownRef = useRef(null);
    const pingIntervalRef = useRef(null);
    const activityTimerRef = useRef(null);
    const lastActivityPingAtRef = useRef(0);
    const bcRef = useRef(null);
    const logoutOnceRef = useRef(false);

    const getToken = () => { try { return localStorage.getItem('accessToken') || ''; } catch { return ''; } };
    const hasToken = () => !!getToken();

    const stopCountdown = () => { if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; } };
    const stopPing = () => { if (pingIntervalRef.current) { clearInterval(pingIntervalRef.current); pingIntervalRef.current = null; } };
    const clearActivityTimer = () => { if (activityTimerRef.current) { clearTimeout(activityTimerRef.current); activityTimerRef.current = null; } };

    // 팝업 먼저 → 로그아웃 이동
    const showThenLogout = (message = '세션이 만료되었거나 해제되었습니다.') => {
        if (logoutOnceRef.current) return;
        logoutOnceRef.current = true;

        stopCountdown(); stopPing(); clearActivityTimer();

        let handledAsync = false;
        try {
            const ret = alertError('알림', message);
            if (ret && typeof ret.then === 'function') {
                handledAsync = true;
                ret.finally(() => doLogout(message, false));
            }
        } catch {}

        if (!handledAsync) {
            setTimeout(() => doLogout(message, false), 1600);
        }
    };

    // 공통 로그아웃
    const doLogout = async (message = '로그아웃 되었습니다.', broadcast = true) => {
        try { await apiLogout(); } catch {}
        try { localStorage.removeItem('accessToken'); } catch {}
        try { localStorage.removeItem('currentAdminId'); } catch {}
        try { sessionStorage.setItem('logoutMessage', message); } catch {}

        // 브로드캐스트(다른 탭도 동일 팝업 → 이동)
        try {
            if (broadcast) {
                if (!bcRef.current) bcRef.current = new BroadcastChannel('auth-channel');
                bcRef.current.postMessage({ type: 'logout', message });
            }
        } catch {}

        nav('/admin/login', { replace: true });
    };

    const startCountdown = () => {
        if (countdownRef.current) return;
        countdownRef.current = setInterval(() => {
            setRemaining((s) => (typeof s !== 'number' ? s : Math.max(0, s - 1)));
        }, 1000);
    };

    const startPing = () => {
        if (pingIntervalRef.current || !hasToken()) return;
        pingIntervalRef.current = setInterval(async () => {
            if (document?.hidden) return;
            try {
                const res = await ping();
                if (!mountedRef.current) return;
                const n = Number(res?.remainingSeconds);
                if (Number.isFinite(n)) setRemaining(n);
            } catch {}
        }, 30_000);
    };

    const triggerActivityPing = () => {
        if (!hasToken()) return;
        const now = Date.now();
        if (now - lastActivityPingAtRef.current < 15_000) return; // 15초 스로틀
        clearActivityTimer();
        activityTimerRef.current = setTimeout(async () => {
            try {
                const res = await ping();
                lastActivityPingAtRef.current = Date.now();
                if (!mountedRef.current) return;
                const n = Number(res?.remainingSeconds);
                if (Number.isFinite(n)) setRemaining(n);
            } catch {}
        }, 3_000);
    };

    useEffect(() => {
        mountedRef.current = true;
        try {
            bcRef.current = new BroadcastChannel('auth-channel');
            bcRef.current.onmessage = (e) => {
                const msg = e?.data;
                if (!msg) return;
                if (msg.type === 'force-logout' || msg.type === 'logout') {
                    const message = msg.message || msg.msg || '세션이 만료되었거나 해제되었습니다.';
                    showThenLogout(message);
                }
            };
        } catch {}

        const onAct = () => triggerActivityPing();
        const onVis = () => { if (!document.hidden) triggerActivityPing(); };
        window.addEventListener('mousemove', onAct);
        window.addEventListener('keydown', onAct);
        window.addEventListener('click', onAct);
        document.addEventListener('visibilitychange', onVis);

        return () => {
            mountedRef.current = false;
            try { bcRef.current?.close(); } catch {}
            stopPing(); stopCountdown(); clearActivityTimer();
            window.removeEventListener('mousemove', onAct);
            window.removeEventListener('keydown', onAct);
            window.removeEventListener('click', onAct);
            document.removeEventListener('visibilitychange', onVis);
        };
    }, []);

    // 🔑 최초 부팅: 토큰 있을 때만 me 호출 & 타이머 시작
    useEffect(() => {
        let cancelled = false;
        const boot = async () => {
            if (!hasToken()) {
                setMe(null); setRemaining(null);
                stopPing(); stopCountdown();
                return;
            }
            try {
                const data = await fetchMe(); // { id, userId, userName, remainingSeconds, ... }
                if (cancelled) return;

                // ✅ id/userId/userName 모두 보존
                setMe({ id: data.id, userId: data.userId, userName: data.userName });

                // ✅ 가장 중요: currentAdminId 저장 + X-App-User-Id 전역헤더 세팅
                try {
                    if (data?.id != null) {
                        localStorage.setItem('currentAdminId', String(data.id));
                        // axios 전역 헤더(요청 인터셉터 이전 기본값): event_by에 쓰임
                        // (client.js가 없더라도 즉시 반영되도록 안전망)
                        const api = (await import('@/api/client')).default;
                        api.defaults.headers.common['X-App-User-Id'] = String(data.id);
                    }
                } catch {}

                const n = Number(data?.remainingSeconds);
                if (Number.isFinite(n)) {
                    setRemaining(n);
                    startCountdown(); startPing();
                } else {
                    startPing();
                }
            } catch {}
        };
        boot();
        return () => { cancelled = true; };
    }, [loc.key]);

    // 라우트 변경 시 활동 ping 트리거
    useEffect(() => { triggerActivityPing(); /* eslint-disable-next-line */ }, [loc.pathname, loc.search]);

    // 남은 시간이 0 이하면 팝업 후 로그아웃
    useEffect(() => {
        if (typeof remaining === 'number' && remaining <= 0 && me) {
            showThenLogout('세션이 만료되었거나 해제되었습니다.');
        }
    }, [remaining, me]);

    const mmss = useMemo(() => {
        const s = typeof remaining === 'number' ? remaining : 0;
        const m = String(Math.floor(s / 60)).padStart(2, '0');
        const sec = String(s % 60).padStart(2, '0');
        return `${m}:${sec}`;
    }, [remaining]);

    if (!me) {
        return (
            <header className="h-14 bg-white border-b flex items-center justify-between px-4">
                <div className="text-sm text-slate-500">로딩 중…</div>
            </header>
        );
    }

    return (
        <header className="h-14 bg-white border-b flex items-center justify-between px-4">
            <div className="font-semibold text-slate-800">관리자 시스템</div>
            <div className="flex items-center gap-4">
                <span className="text-slate-600 text-sm">세션 남은시간 <b>{mmss}</b></span>
                <span className="text-slate-800 text-sm">안녕하세요, <b>[ {me.userId} ( {me.id} ) ] | [ {me.userName} ]</b>님</span>
                <button
                    onClick={() => doLogout('로그아웃 되었습니다.')}
                    className="rounded-md px-3 py-1.5 bg-slate-900 text-white hover:bg-slate-700"
                >
                    로그아웃
                </button>
            </div>
        </header>
    );
}