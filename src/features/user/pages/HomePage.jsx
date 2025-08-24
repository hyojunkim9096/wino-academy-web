// src/features/user/pages/HomePage.jsx
import React from 'react';

/**
 * 유저 메인(공개 페이지)
 * - 여기서는 AdminHeader/AdminSidebar 사용 금지
 * - 여기서 /api/auth/me 같은 관리자 인증 API 호출 금지
 */
export default function HomePage() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
            <div className="max-w-2xl w-full bg-white rounded-2xl shadow p-8">
                <h1 className="text-2xl font-bold text-slate-900">WINO 메인</h1>
                <p className="mt-2 text-slate-600">
                    여기는 공개 홈페이지 첫 화면입니다. (나중에 유저용 콘텐츠 추가)
                </p>
            </div>
        </div>
    );
}
