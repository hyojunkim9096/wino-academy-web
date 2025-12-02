// src/router.jsx
// ============================================================================
// WINO Academy — 라우터 정의(createBrowserRouter)
// ----------------------------------------------------------------------------
// 핵심 포인트
// 1) 공개 라우트: /admin/login, /admin/forgot-password, /admin/reset-password, /admin/signUp
// 2) 보호 라우트: /admin/* → ProtectedRoute가 인증 검사 후에만 AdminLayout + 페이지 렌더
//    - 미인증이면 반드시 <Navigate to="/admin/login" replace /> 해야 함 (ProtectedRoute 책임)
// 3) 루트(/) 및 /admin → 올바른 위치로 리다이렉트
// 4) 동적 화면: <DynamicMenuRenderer /> 가 DB의 메뉴/컴포넌트 키에 따라 실제 페이지 결정
// ============================================================================
import React from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';

import AdminLoginPage from '@/features/admin/pages/AdminLoginPage';
import ForgotPasswordPage from '@/features/admin/pages/ForgotPasswordPage';
import ResetPasswordPage from '@/features/admin/pages/ResetPasswordPage';
import AdminSignUpPage from '@/features/admin/pages/AdminSignUpPage';

import ProtectedRoute from '@/common/components/router/ProtectedRoute';
import AdminLayout from '@/features/system/layouts/AdminLayout.jsx';

// DB 기반 페이지 동적 로더(메뉴-컴포넌트 매핑)
import DynamicMenuRenderer from '@/router/DynamicMenuRenderer';

const router = createBrowserRouter([
    // 공개 라우트 ---------------------------------------------------------------
    { path: '/', element: <Navigate to="/admin/login" replace /> }, // ✅ 자기 자신 루프 방지
    { path: '/admin/login', element: <AdminLoginPage /> },
    { path: '/admin/forgot-password', element: <ForgotPasswordPage /> },
    { path: '/admin/reset-password', element: <ResetPasswordPage /> },
    { path: '/admin/signUp', element: <AdminSignUpPage /> },

    // /admin → /admin/dashboard
    { path: '/admin', element: <Navigate to="/admin/dashboard" replace /> },

    // 보호 라우트 --------------------------------------------------------------
    // * 반드시 ProtectedRoute가 인증 검사를 하고, 실패 시 바로 Login으로 보낸다.
    {
        path: '/admin/*',
        element: (
            <ProtectedRoute>
                {/* 인증 통과시에만 레이아웃/페이지가 렌더됨 */}
                <AdminLayout>
                    <DynamicMenuRenderer />
                </AdminLayout>
            </ProtectedRoute>
        ),
    },

    // 그 외는 로그인으로
    { path: '*', element: <Navigate to="/admin/login" replace /> },
]);

export default router;