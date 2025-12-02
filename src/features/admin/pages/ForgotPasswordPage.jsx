// src/features/admin/pages/ForgotPasswordPage.jsx
// ✅ 수정 내용
// - 하단에 "로그인 페이지로 이동" 링크 추가
// - 제출 중 중복 클릭 방지(disabled) 적용

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AuthLayout from '@/common/components/layouts/AuthLayout';
import { requestPasswordReset } from '@/common/api/authApi.js';
import { alertError, alertSuccess } from '@/common/ui/alert.js';

function ForgotPasswordPage() {
    const navigate = useNavigate();
    const [userId, setUserId] = useState('');
    const [submitting, setSubmitting] = useState(false); // ✅ 더블클릭 방지

    const onSubmit = async (e) => {
        e.preventDefault();
        if (submitting) return;

        if (!userId.trim()) return alertError('입력 오류', '아이디를 입력하세요.');
        try {
            setSubmitting(true);
            await requestPasswordReset(userId.trim());
            await alertSuccess('발송 완료', '인증코드를 전송했습니다.');
            navigate('/admin/reset-password', { state: { userId: userId.trim() } });
        } catch (err) {
            const msg = err?.message || err?.response?.data?.message || '전송에 실패했습니다.';
            alertError('오류', msg);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <AuthLayout title="비밀번호 찾기" subtitle="아이디를 입력하면 인증코드를 보내드립니다.">
            <form onSubmit={onSubmit} className="space-y-5">
                <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">아이디</label>
                    <input
                        name="userId"
                        placeholder="아이디"
                        className="w-full rounded-xl border px-4 py-2.5 outline-none focus:ring-2 focus:ring-indigo-300"
                        value={userId}
                        onChange={(e) => setUserId(e.target.value)}
                        autoFocus
                        disabled={submitting}
                    />
                </div>

                <button
                    type="submit"
                    disabled={submitting}
                    className="w-full rounded-xl bg-indigo-600 px-4 py-2.5 font-semibold text-white
                     hover:bg-indigo-700 focus:ring-4 focus:ring-indigo-200 disabled:opacity-60"
                >
                    {submitting ? '전송 중…' : '인증코드 보내기'}
                </button>
            </form>

            {/* ✅ 로그인 페이지로 이동 링크 추가 */}
            <div className="mt-6 text-center text-sm">
                <button
                    type="button"
                    onClick={() => navigate('/admin/login')}
                    className="font-semibold text-indigo-700 hover:underline"
                >
                    로그인 페이지로 이동
                </button>
            </div>
        </AuthLayout>
    );
}

export default ForgotPasswordPage;
