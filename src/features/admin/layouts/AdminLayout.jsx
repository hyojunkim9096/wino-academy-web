// src/features/admin/layouts/AdminLayout.jsx
import React from 'react';
import { Outlet } from 'react-router-dom';
import AdminHeader from '@/features/admin/components/AdminHeader';
import AdminSidebar from '@/features/admin/components/AdminSidebar';

/** 로그인 이후 공통 레이아웃 */
export default function AdminLayout({ children }) {
    return (
        <div className="relative min-h-screen">
            {/* 헤더 */}
            <div className="fixed top-0 inset-x-0 z-40 h-14">
                <AdminHeader />
            </div>

            {/* 사이드바 */}
            <aside className="fixed top-14 left-0 bottom-0 z-30 hidden md:block w-64 border-r bg-white overflow-y-auto">
                <AdminSidebar />
            </aside>

            {/* 본문: 다크 배경으로 통일 */}
            <main className="pt-14 md:pl-64">
                <div className="h-[calc(100vh-3.5rem)] overflow-y-auto bg-slate-950 text-slate-100">
                    {children ?? <Outlet />}
                </div>
            </main>
        </div>
    );
}
