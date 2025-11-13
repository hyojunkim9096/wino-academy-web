// src/features/admin/components/AdminHeader.jsx

import React, { useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
// ✅ 1.
import { useAuth } from '@/contexts/AuthContext';
// ✅ 2.  API
// import { apiLogout, clearAuthState } from '@/api/authApi';
import { alertError } from '@/ui/alert';

export default function AdminHeader() {
    const nav = useNavigate();

    // ✅ 3. me, remaining
    const { me, remaining, logout } = useAuth();

    const logoutOnceRef = useRef(false);
    const bcRef = useRef(null);

    //
    useEffect(() => {
        try {
            //
            bcRef.current = new BroadcastChannel('auth-channel');
            bcRef.current.onmessage = (e) => {
                const msg = e?.data;
                if (!msg) return;
                //
                if (msg.type === 'force-logout' || msg.type === 'logout') {
                    //
                    //
                    window.location.href = '/admin/login?reason=conflict';
                }
            };
        } catch {}
        return () => { try { bcRef.current?.close(); } catch {} };
    }, []);

    // ✅ 4. [ ]
    //
    const doLogout = async (message = '로그아웃 되었습니다.') => {
        //
        await logout(message, true);
        nav('/admin/login', { replace: true });
    };

    //
    const showThenLogout = (message = '세션이 만료되었거나 해제되었습니다.') => {
        if (logoutOnceRef.current) return;
        logoutOnceRef.current = true;

        let handledAsync = false;
        try {
            const ret = alertError('알림', message);
            if (ret && typeof ret.then === 'function') {
                handledAsync = true;
                //
                ret.finally(() => doLogout(message));
            }
        } catch {}

        if (!handledAsync) {
            setTimeout(() => doLogout(message), 1600);
        }
    };

    //
    useEffect(() => {
        //
        if (typeof remaining === 'number' && remaining <= 0 && me) {
            showThenLogout('세션이 만료되었거나 해제되었습니다.');
        }
    }, [remaining, me]); //

    const mmss = useMemo(() => {
        const s = typeof remaining === 'number' ? remaining : 0;
        const m = String(Math.floor(s / 60)).padStart(2, '0');
        const sec = String(s % 60).padStart(2, '0');
        return `${m}:${sec}`;
    }, [remaining]);

    if (!me) {
        return (
            <header className="h-14 bg-white border-b flex items-center justify-between px-4">
                <div className="text-sm text-slate-500">...</div>
            </header>
        );
    }

    return (
        <header className="h-14 bg-white border-b flex items-center justify-between px-4">
            <div className="font-semibold text-slate-800">학원관리 시스템</div>
            <div className="flex items-center gap-4">
                <span className="text-slate-600 text-sm"> <b>{mmss}</b></span>
                <span className="text-slate-800 text-sm"> <b>[ {me.userId} ( {me.id} ) ] | [ {me.userName} ]</b></span>
                <button
                    // ✅ 5. [수정]
                    onClick={() => doLogout('로그아웃 되었습니다.')}
                    className="rounded-md px-3 py-1.5 bg-slate-900 text-white hover:bg-slate-700"
                >
                    로그아웃
                </button>
            </div>
        </header>
    );
}