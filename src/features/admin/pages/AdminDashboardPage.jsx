// src/features/admin/pages/AdminDashboardPage.jsx
// -----------------------------------------------------------------------------
// 대시보드: admin.css를 import 하지 않음 (요청사항)
// 필요 시 Tailwind 유틸리티로 다크 톤 구성.
// -----------------------------------------------------------------------------
import React from 'react';

export default function AdminDashboardPage() {
    return (
        <section className="min-h-[calc(100vh-3.5rem)] bg-slate-50 text-slate-900 p-6 md:p-8 dark:bg-slate-950 dark:text-slate-100">
            <div className="rounded-xl border bg-white p-5 shadow-sm dark:bg-slate-900 dark:border-slate-800">
                <h1 className="text-xl font-semibold">대시보드</h1>
                <p className="text-slate-600 mt-2 dark:text-slate-300">
                    위젯/통계를 배치하세요.
                </p>
            </div>
        </section>
    );
}
