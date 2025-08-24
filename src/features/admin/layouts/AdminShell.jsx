// 고정 헤더 + 고정 사이드바 + 컨텐츠 스크롤 전용 컨테이너
// - 헤더: 고정(fixed) 상단 56px (h-14)
// - 사이드바: 고정(fixed) 좌측 256px (w-64), 상단은 헤더 아래부터
// - 컨텐츠: 헤더 높이만큼 padding-top, 사이드바 너비만큼 padding-left, 내부에서만 스크롤
// - 반응형: md 미만에서는 사이드바 숨김(필요시 토글 버튼은 추후 추가 가능)

import React from 'react';
import { Outlet } from 'react-router-dom';
import AdminHeader from '@/features/admin/components/AdminHeader';
import AdminSidebar from '@/features/admin/components/AdminSidebar';

export default function AdminShell({ children }) {
    return (
        <div className="relative min-h-screen bg-slate-50">
            {/* 고정 헤더 */}
            <div className="fixed top-0 inset-x-0 z-40 h-14">
                <AdminHeader />
            </div>

            {/* 고정 사이드바 (md 이상에서만 표시) */}
            <aside className="fixed top-14 left-0 bottom-0 z-30 hidden md:block w-64 border-r bg-white overflow-y-auto">
                <AdminSidebar />
            </aside>

            {/* 컨텐츠 영역: 헤더/사이드바 자리만큼 여백 → 내부 스크롤 */}
            <main className="pt-14 md:pl-64">
                {/* 높이를 뷰포트에 맞추고 내부만 스크롤 */}
                <div className="h-[calc(100vh-3.5rem)] overflow-y-auto">
                    {/* children이 있으면 children 사용, 없으면 <Outlet/> 사용 */}
                    {children ?? <Outlet />}
                </div>
            </main>
        </div>
    );
}
