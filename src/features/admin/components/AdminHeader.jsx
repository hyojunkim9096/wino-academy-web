// src/features/admin/components/AdminHeader.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { fetchMe, ping, logout as apiLogout } from '@/api/authApi';
// 우리 프로젝트 팝업
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

    const getToken = () => { try{ return localStorage.getItem('accessToken')||''; }catch{ return '';} };
    const hasToken = () => !!getToken();

    const stopCountdown = ()=>{ if(countdownRef.current){ clearInterval(countdownRef.current); countdownRef.current=null; } };
    const stopPing = ()=>{ if(pingIntervalRef.current){ clearInterval(pingIntervalRef.current); pingIntervalRef.current=null; } };
    const clearActivityTimer = ()=>{ if(activityTimerRef.current){ clearTimeout(activityTimerRef.current); activityTimerRef.current=null; } };

    /**
     * ✅ 팝업 먼저 → (모달이면 닫힘을 기다렸다) → 로그아웃 이동
     * - alertError 가 Promise를 반환하지 않는(토스트 등) 환경에서도
     *   사용자가 볼 시간을 주기 위해 1.6초 지연 후 이동
     */
    const showThenLogout = (message='세션이 만료되었거나 해제되었습니다.') => {
        if (logoutOnceRef.current) return;
        logoutOnceRef.current = true;

        // 타이머 정리
        stopCountdown(); stopPing(); clearActivityTimer();

        let handledAsync = false;
        try {
            const ret = alertError('알림', message);
            if (ret && typeof ret.then === 'function') {
                handledAsync = true;
                ret.finally(() => doLogout(message, false)); // 닫히면 이동
            }
        } catch {
            // 팝업 호출 실패 시 폴백은 아래에서 처리
        }

        // 🆕 토스트/동기 등 thenable 아닌 경우 → 잠깐 보여주고 이동
        if (!handledAsync) {
            setTimeout(() => doLogout(message, false), 1600);
        }
    };

    /**
     * 공통 로그아웃
     * - 서버 로그아웃 호출(에러 무시)
     * - 토큰 정리 & 메시지 저장
     * - 필요 시 BroadcastChannel 송신
     * - 로그인으로 이동
     */
    const doLogout = async (message = '로그아웃 되었습니다.', broadcast = true) => {
        try{ await apiLogout(); }catch{}
        try{ localStorage.removeItem('accessToken'); }catch{}
        try{
            sessionStorage.setItem('logoutMessage', message);
            if (broadcast){
                if (!bcRef.current) bcRef.current = new BroadcastChannel('auth-channel');
                // 수신자 탭도 "팝업 먼저" 띄우도록 onmessage에서 showThenLogout 처리
                bcRef.current.postMessage({ type:'logout', message });
            }
        }catch{}
        nav('/admin/login', { replace: true });
    };

    const startCountdown = ()=>{
        if (countdownRef.current) return;
        countdownRef.current = setInterval(()=>{
            setRemaining((s)=>{
                if (typeof s !== 'number') return s; // 숫자 확정 전엔 미동작
                return Math.max(0, s - 1);
            });
        }, 1000);
    };

    const startPing = ()=>{
        if (pingIntervalRef.current || !hasToken()) return;
        pingIntervalRef.current = setInterval(async ()=>{
            if (document?.hidden) return;
            try{
                const res = await ping();
                if (!mountedRef.current) return;
                const n = Number(res?.remainingSeconds);
                if (Number.isFinite(n)) setRemaining(n);
            }catch{}
        }, 30_000);
    };

    const triggerActivityPing = ()=>{
        if (!hasToken()) return;
        const now = Date.now();
        if (now - lastActivityPingAtRef.current < 15_000) return; // 15초 스로틀
        clearActivityTimer();
        activityTimerRef.current = setTimeout(async ()=>{
            try{
                const res = await ping();
                lastActivityPingAtRef.current = Date.now();
                if (!mountedRef.current) return;
                const n = Number(res?.remainingSeconds);
                if (Number.isFinite(n)) setRemaining(n);
            }catch{}
        }, 3_000);
    };

    useEffect(()=>{
        mountedRef.current = true;
        try {
            bcRef.current = new BroadcastChannel('auth-channel');
            bcRef.current.onmessage = (e)=>{
                const msg = e?.data;
                if (!msg) return;

                // ✅ 다른 탭에서 강제 로그아웃 신호를 받으면: 팝업 먼저 → 이동
                if (msg.type === 'force-logout' || msg.type === 'logout') {
                    const message = msg.message || msg.msg || '세션이 만료되었거나 해제되었습니다.';
                    showThenLogout(message);
                }
            };
        } catch {}

        const onAct = ()=> triggerActivityPing();
        const onVis = ()=> { if (!document.hidden) triggerActivityPing(); };
        window.addEventListener('mousemove', onAct);
        window.addEventListener('keydown', onAct);
        window.addEventListener('click', onAct);
        document.addEventListener('visibilitychange', onVis);

        return ()=>{
            mountedRef.current = false;
            try{ bcRef.current?.close(); }catch{}
            stopPing(); stopCountdown(); clearActivityTimer();
            window.removeEventListener('mousemove', onAct);
            window.removeEventListener('keydown', onAct);
            window.removeEventListener('click', onAct);
            document.removeEventListener('visibilitychange', onVis);
        };
    },[]);

    // 최초 부팅: 토큰 있을 때만 me 호출 & 타이머 시작
    useEffect(()=>{
        let cancelled = false;
        const boot = async ()=>{
            if (!hasToken()){
                setMe(null); setRemaining(null);
                stopPing(); stopCountdown();
                return;
            }
            try{
                const data = await fetchMe();
                if (cancelled) return;
                setMe({ userId: data.userId, userName: data.userName });

                const n = Number(data?.remainingSeconds);
                if (Number.isFinite(n)) {
                    setRemaining(n);
                    startCountdown(); startPing();
                } else {
                    startPing();
                }
            }catch{}
        };
        boot();
        return ()=>{ cancelled = true; };
    }, [loc.key]);

    // 라우트 변경 시 활동 ping 트리거
    useEffect(()=>{ triggerActivityPing(); /* eslint-disable-next-line */ }, [loc.pathname, loc.search]);

    // ✅ 세션 만료 자동 로그아웃도 팝업 먼저
    useEffect(()=>{
        if (typeof remaining === 'number' && remaining <= 0 && me) {
            showThenLogout('세션이 만료되었거나 해제되었습니다.');
        }
    }, [remaining, me]);

    const mmss = useMemo(()=>{
        const s = typeof remaining === 'number' ? remaining : 0;
        const m = String(Math.floor(s/60)).padStart(2,'0');
        const sec = String(s%60).padStart(2,'0');
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
                <span className="text-slate-800 text-sm">안녕하세요, <b>{me.userName}</b>님</span>
                <button onClick={()=>doLogout('로그아웃 되었습니다.')}
                        className="rounded-md px-3 py-1.5 bg-slate-900 text-white hover:bg-slate-700">
                    로그아웃
                </button>
            </div>
        </header>
    );
}
