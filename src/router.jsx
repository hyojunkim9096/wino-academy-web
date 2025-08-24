// src/router.jsx
import React from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';

import AdminLoginPage from '@/features/admin/pages/AdminLoginPage';
import ForgotPasswordPage from '@/features/admin/pages/ForgotPasswordPage';
import ResetPasswordPage from '@/features/admin/pages/ResetPasswordPage';
import AdminSignUpPage from '@/features/admin/pages/AdminSignUpPage';

import ProtectedRoute from '@/components/router/ProtectedRoute';
import AdminLayout from '@/features/admin/layouts/AdminLayout';

// ⬇ DB 기반 페이지 동적 로더
import DynamicMenuRenderer from '@/router/DynamicMenuRenderer';

const router = createBrowserRouter([
    // 공개
    { path: '/', element: <Navigate to="/admin/login" replace /> },
    { path: '/admin/login', element: <AdminLoginPage /> },
    { path: '/admin/forgot-password', element: <ForgotPasswordPage /> },
    { path: '/admin/reset-password', element: <ResetPasswordPage /> },
    { path: '/admin/signUp', element: <AdminSignUpPage /> },

    // /admin → /admin/dashboard
    { path: '/admin', element: <Navigate to="/admin/dashboard" replace /> },

    // 보호: /admin/* 전부 DB 매핑으로 랜더
    {
        path: '/admin/*',
        element: (
            <ProtectedRoute>
                <AdminLayout>
                    <DynamicMenuRenderer />
                </AdminLayout>
            </ProtectedRoute>
        ),
    },

    // 그 외
    { path: '*', element: <Navigate to="/admin/login" replace /> },
]);

export default router;
