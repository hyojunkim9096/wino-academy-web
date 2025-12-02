// src/common/components/router/ProtectedRoute.jsx
// ─────────────────────────────────────────────────────────────
// Admin 화면 보호용 라우터 가드 (Redux 없이 동작)
// 핵심:
// 1) 로컬/세션 스토리지의 accessToken/WINO_ADMIN_TOKEN 유무로 보호
// 2) 인증이 아니면 /admin/login 으로 즉시 리다이렉트
//    - state.from 에 원래 경로를 보존(react-router 표준 방식)
//    - 동시에 쿼리스트링 ?next= 도 함께 전달(로그인 페이지 구현이 어느 방식을 쓰든 호환)
// 3) 렌더 단계에서 <Navigate/> 로 바로 전환 → 깜빡임 최소화
// 4) 스토리지 접근은 try/catch 로 안전하게
// ─────────────────────────────────────────────────────────────

import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

const TOKEN_KEYS = ['accessToken', 'WINO_ADMIN_TOKEN'];

/** 스토리지에서 토큰을 안전하게 읽어온다. (local → session 순서) */
function safeReadToken() {
    try {
        for (const k of TOKEN_KEYS) {
            const v =
                (typeof localStorage !== 'undefined' && localStorage.getItem(k)) ||
                (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(k)) ||
                '';
            if (v && v.trim()) return v.trim();
        }
    } catch {
        // 스토리지 접근 불가(프라이빗 모드 등)면 무시하고 빈 문자열 반환
    }
    return '';
}

/** 현재 경로(+쿼리)를 next 용 문자열로 만든다. */
function buildNext(location) {
    const next = location.pathname + (location.search || '');
    try {
        return encodeURIComponent(next);
    } catch {
        return '';
    }
}

export default function ProtectedRoute({ children }) {
    const location = useLocation();
    const token = safeReadToken();
    const isAuthed = !!token;

    // 인증 실패 → 로그인으로 즉시 전환
    if (!isAuthed) {
        const next = buildNext(location);
        return (
            <Navigate
                to={`/admin/login${next ? `?next=${next}` : ''}`}
                replace
                // state.from 도 함께 넘겨서 어느 방식이든 로그인 후 복귀 가능
                state={{ from: location }}
            />
        );
    }

    // 통과: children 우선, 없으면 Outlet(중첩 라우트)
    return children ? children : <Outlet />;
}