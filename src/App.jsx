// src/App.jsx
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

// 공개 페이지
import HomePage from '@/features/user/pages/HomePage';
import AdminLoginPage from '@/features/admin/pages/AdminLoginPage.jsx';
import AdminSignUpPage from '@/features/admin/pages/AdminSignUpPage';
import ForgotPasswordPage from '@/features/admin/pages/ForgotPasswordPage';

// 보호 페이지
import DashboardPage from '@/features/admin/pages/DashboardPage';
import MenuManagePage from '@/features/admin/pages/MenuManagePage';

// 레이아웃/가드
import AdminLayout from '@/features/admin/layouts/AdminLayout';
import ProtectedRoute from '@/components/router/ProtectedRoute';

export default function App() {
    return (
        <BrowserRouter>
            <Routes>
                {/* 1) 유저 메인(공개) */}
                <Route path="/" element={<HomePage />} />

                {/* 2) 관리자 공개 라우트 */}
                <Route path="/admin/login" element={<AdminLoginPage />} />
                <Route path="/admin/signUp" element={<AdminSignUpPage />} />
                <Route path="/admin/forgot-password" element={<ForgotPasswordPage />} />

                {/* 3) 관리자 보호 구간: /admin/* */}
                <Route path="/admin/*" element={<ProtectedRoute />}>
                    {/* 레이아웃으로 감싸고 Outlet에 실제 페이지 렌더 */}
                    <Route element={<AdminLayout />}>
                        {/* 기본 진입 → 대시보드 */}
                        <Route index element={<Navigate to="dashboard" replace />} />

                        {/* 실제 페이지들 */}
                        <Route path="dashboard" element={<DashboardPage />} />
                        <Route path="menus" element={<MenuManagePage />} /> {/* ✅ /admin/menus */}
                    </Route>
                </Route>

                {/* 4) 그 외는 홈으로 */}
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </BrowserRouter>
    );
}
