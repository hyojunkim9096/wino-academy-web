// 전체 교체
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import AuthLayout from '@/components/layouts/AuthLayout';
import { confirmPasswordReset } from '@/api/authApi';
import { alertError, alertSuccess } from '@/ui/alert';

function ResetPasswordPage() {
    const navigate = useNavigate();
    const { state } = useLocation(); // ForgotPasswordPage에서 넘긴 userId
    const codeRef = useRef(null);

    // 쿼리스트링 fallback (직접 접근 대비)
    const userIdFromQS = useMemo(() => {
        const params = new URLSearchParams(window.location.search);
        return params.get('userId') || '';
    }, []);

    const [form, setForm] = useState({
        userId: '',
        code: '',
        newPassword: '',
    });
    const [submitting, setSubmitting] = useState(false);

    // location.state / QS 로 아이디 초기화 → ✅ 읽기전용으로 고정
    useEffect(() => {
        const initialUserId = state?.userId || userIdFromQS || '';
        setForm((prev) => ({ ...prev, userId: initialUserId }));
        setTimeout(() => codeRef.current?.focus(), 0);
    }, [state, userIdFromQS]);

    const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

    const onSubmit = async (e) => {
        e.preventDefault();
        if (submitting) return;
        if (!form.userId.trim()) return alertError('입력 오류', '아이디를 확인할 수 없습니다.');
        if (!form.code.trim()) return alertError('입력 오류', '인증코드를 입력하세요.');
        if (!form.newPassword || form.newPassword.length < 8)
            return alertError('입력 오류', '새 비밀번호는 8자 이상이어야 합니다.');

        try {
            setSubmitting(true);
            await confirmPasswordReset({
                userId: form.userId.trim(),
                code: form.code.trim(),
                newPassword: form.newPassword,
            });
            await alertSuccess('완료', '비밀번호가 변경되었습니다. 새 비밀번호로 로그인하세요.');
            navigate('/admin/login', { replace: true });
        } catch (error) {
            const msg = error?.response?.data?.message || error?.message || '비밀번호 변경에 실패했습니다.';
            alertError('실패', msg);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <AuthLayout title="비밀번호 재설정" subtitle="메일로 받은 인증코드와 새 비밀번호를 입력하세요.">
            <form onSubmit={onSubmit} className="space-y-5">
                <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">아이디</label>
                    <input
                        name="userId"
                        value={form.userId}
                        readOnly // ✅ 아이디 수정 불가
                        className="w-full rounded-xl border bg-gray-50 px-4 py-2.5 outline-none"
                    />
                </div>
                <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">인증코드</label>
                    <input
                        ref={codeRef}
                        name="code"
                        placeholder="메일로 받은 6자리 코드"
                        className="w-full rounded-xl border px-4 py-2.5 outline-none focus:ring-2 focus:ring-indigo-300"
                        value={form.code}
                        onChange={onChange}
                    />
                </div>
                <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">새 비밀번호</label>
                    <input
                        type="password"
                        name="newPassword"
                        placeholder="8자 이상"
                        className="w-full rounded-xl border px-4 py-2.5 outline-none focus:ring-2 focus:ring-indigo-300"
                        value={form.newPassword}
                        onChange={onChange}
                        autoComplete="new-password"
                    />
                </div>
                <button
                    type="submit"
                    disabled={submitting}
                    className="w-full rounded-xl bg-indigo-600 px-4 py-2.5 font-semibold text-white disabled:opacity-60 hover:bg-indigo-700 focus:ring-4 focus:ring-indigo-200"
                >
                    {submitting ? '변경 중…' : '비밀번호 변경'}
                </button>
            </form>
            <div className="mt-6 text-center text-sm">
                <button type="button" onClick={() => navigate('/admin/login')} className="font-semibold text-indigo-700 hover:underline">
                    로그인으로 이동
                </button>
            </div>
        </AuthLayout>
    );
}
export default ResetPasswordPage;
