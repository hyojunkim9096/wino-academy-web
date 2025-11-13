// src/contexts/AuthContext.jsx
import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
// ✅ [수정] login(API), logout(API), setAuthToken(헤더설정), clearAuthState(헤더제거) import
import { fetchMe, ping, initSessionAfterLogin, login as apiLogin, logout as apiLogout, setAuthToken, clearAuthState } from '@/api/authApi';
import { getMyMenus } from '@/api/menuApi';
import { alertError } from '@/ui/alert';
import { useNavigate } from 'react-router-dom';

/**
 * 1. 인증 Context 생성
 */
const AuthContext = createContext(null);

/**
 * 2. 인증 Provider
 */
export function AuthProvider({ children }) {
    const [me, setMe] = useState(null);
    const [menuTree, setMenuTree] = useState([]);
    const [remaining, setRemaining] = useState(null);
    const [authLoading, setAuthLoading] = useState(true); //

    const mountedRef = useRef(false);
    const countdownRef = useRef(null);
    const pingIntervalRef = useRef(null);
    const activityTimerRef = useRef(null);
    const lastActivityPingAtRef = useRef(0);
    const bcRef = useRef(null);

    // ---
    const stopCountdown = () => { if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; } };
    const stopPing = () => { if (pingIntervalRef.current) { clearInterval(pingIntervalRef.current); pingIntervalRef.current = null; } };
    const clearActivityTimer = () => { if (activityTimerRef.current) { clearTimeout(activityTimerRef.current); activityTimerRef.current = null; } };

    //
    const startCountdown = () => {
        if (countdownRef.current) return;
        countdownRef.current = setInterval(() => {
            setRemaining((s) => (typeof s !== 'number' ? s : Math.max(0, s - 1)));
        }, 1000);
    };

    //
    const startPing = () => {
        if (pingIntervalRef.current) return;
        pingIntervalRef.current = setInterval(async () => {
            if (document?.hidden) return;
            try {
                const res = await ping();
                if (!mountedRef.current) return;
                const n = Number(res?.remainingSeconds);
                if (Number.isFinite(n)) setRemaining(n);
            } catch (error) {
                //
                if (error?.response?.status === 401 || error?.response?.status === 403 || error?.response?.status === 423) {
                    //
                }
            }
        }, 30_000);
    };

    //
    const triggerActivityPing = () => {
        const now = Date.now();
        if (now - lastActivityPingAtRef.current < 15_000) return; // 15
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

    // ---  ---
    //
    const loadAuthData = useCallback(async () => {
        try {
            //
            const meData = await initSessionAfterLogin();
            const menus = await getMyMenus('ADMIN');

            if (mountedRef.current) {
                setMe({ id: meData.id, userId: meData.userId, userName: meData.userName });
                setMenuTree(Array.isArray(menus) ? menus : []);

                const n = Number(meData?.remainingSeconds);
                if (Number.isFinite(n)) {
                    setRemaining(n);
                    startCountdown();
                    startPing();
                } else {
                    startPing();
                }
            }
            return meData; //
        } catch (error) {
            console.error("AuthContext failed to load", error);
            //
            //
            if (error?.response?.status === 401 || error?.response?.status === 403 || error?.response?.status === 423) {
                clearAuthState(); //
            }
            throw error; //
        } finally {
            if (mountedRef.current) {
                setAuthLoading(false);
            }
        }
    }, []); //

    // ✅ [신규] 로그인 페이지가 호출할 함수
    const login = useCallback(async (credentials) => {
        // 1. API
        const headerToken = await apiLogin(credentials); //

        // 2.  (API ,  )
        //

        // 3.
        setAuthLoading(true);
        try {
            await loadAuthData(); // me, menu
        } catch (e) {
            //
            throw e;
        } finally {
            setAuthLoading(false);
        }
    }, [loadAuthData]); //

    // ✅ [신규] 헤더가 호출할 로그아웃 함수
    const logout = useCallback(async (message = '로그아웃 되었습니다.', broadcast = true) => {
        stopCountdown();
        stopPing();
        clearActivityTimer();

        try { await apiLogout(); } catch {}

        clearAuthState(); //

        setMe(null); //
        setMenuTree([]);
        setRemaining(null);

        try { sessionStorage.setItem('logoutMessage', message); } catch {}

        //
        try {
            if (broadcast && bcRef.current) {
                bcRef.current.postMessage({ type: 'logout', message });
            }
        } catch {}

        //
        //
    }, []);

    //
    useEffect(() => {
        mountedRef.current = true;

        // ✅ [수정]
        try {
            const token = localStorage.getItem('accessToken');
            if (token) {
                setAuthToken(token); //
                loadAuthData(); //
            } else {
                setAuthLoading(false); //
            }
        } catch {
            setAuthLoading(false); //
        }

        const onAct = () => triggerActivityPing();
        const onVis = () => { if (!document.hidden) triggerActivityPing(); };
        window.addEventListener('mousemove', onAct);
        window.addEventListener('keydown', onAct);
        window.addEventListener('click', onAct);
        document.addEventListener('visibilitychange', onVis);

        //
        try {
            bcRef.current = new BroadcastChannel('auth-channel');
            bcRef.current.onmessage = (e) => {
                const msg = e?.data;
                if (!msg) return;
                if (msg.type === 'force-logout' || msg.type === 'logout') {
                    logout(msg.message || msg.msg || '세션이 만료되었습니다.', false);
                }
            };
        } catch {}

        return () => {
            mountedRef.current = false;
            stopPing();
            stopCountdown();
            clearActivityTimer();
            window.removeEventListener('mousemove', onAct);
            window.removeEventListener('keydown', onAct);
            window.removeEventListener('click', onAct);
            document.removeEventListener('visibilitychange', onVis);
            try { bcRef.current?.close(); } catch {}
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loadAuthData]);

    //
    useEffect(() => {
        if (typeof remaining === 'number' && remaining <= 0 && me) {
            (async () => {
                try {
                    await alertError('알림', '세션이 만료되었거나 해제되었습니다.');
                } finally {
                    await logout('세션이 만료되었습니다.', true);
                    //
                    window.location.href = '/admin/login?reason=expired';
                }
            })();
        }
    }, [remaining, me, logout]);

    //
    const value = {
        me,
        menuTree,
        remaining,
        authLoading,
        login,    // ✅
        logout,   // ✅
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}

// 3. Consumer
export function useAuth() {
    const context = useContext(AuthContext);
    if (context === null) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}