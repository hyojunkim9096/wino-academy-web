// src/features/admin/pages/AdminLoginPage.jsx
// ============================================================================
// 관리자 로그인 페이지
// - ✅ [수정] api/authApi
// - ✅ [수정] useAuth() Context
// - ✅ [수정] initSessionAfterLogin()  (AuthContext )
// ============================================================================

import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import AuthLayout from '@/components/layouts/AuthLayout';
// ✅ 1. [수정] API
// import { login, initSessionAfterLogin } from '@/api/authApi';
import { useAuth } from '@/contexts/AuthContext'; // ✅
import { alertError } from '@/ui/alert';

function useQuery() {
    const { search } = useLocation();
    return React.useMemo(() => new URLSearchParams(search), [search]);
}

export default function AdminLoginPage() {
    const navigate = useNavigate();
    const query = useQuery();

    // ✅ 2. [수정] Context
    const { login } = useAuth();

    const [form, setForm] = useState({ userId: '', password: '' });
    const [loading, setLoading] = useState(false);

    //
    useEffect(() => {
        try {
            //
            sessionStorage.removeItem('logout:inflight');

            // 1) sessionStorage
            const keys = ['logoutMessage', 'kickMsg'];
            let shown = false;
            for (const k of keys) {
                const msg = sessionStorage.getItem(k);
                if (msg) {
                    sessionStorage.removeItem(k);
                    Promise.resolve(alertError('알림', msg)).catch(() => {});
                    shown = true;
                    break;
                }
            }

            // 2) : reason
            if (!shown) {
                const reason = (query.get('reason') || '').toLowerCase();
                let msg = '';
                if (reason === 'conflict') msg = '다른 장소에서 로그인하여 로그아웃 되었습니다.';
                else if (reason === 'locked') msg = '계정이 잠겨 접속을 해제합니다.';
                else if (reason === 'expired') msg = '세션이 만료되었거나 해제되었습니다.';
                if (msg) Promise.resolve(alertError('알림', msg)).catch(() => {});
            }
        } catch {
            // storage
        }
    }, [query]);

    const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

    const onSubmit = async (e) => {
        e.preventDefault();
        if (loading) return; //

        const userId = (form.userId || '').trim();
        if (!userId) return alertError('입력 오류', '아이디를 입력하세요.');
        if (!form.password) return alertError('입력 오류', '비밀번호를 입력하세요.');

        try {
            setLoading(true);

            // ✅ 3. [수정] API  Context
            await login({ userId, password: form.password });

            // ✅ 4. [제거] initSessionAfterLogin()
            // await initSessionAfterLogin();

            // 5) next  ,
            const next = query.get('next');
            navigate(next || '/admin/dashboard', { replace: true });
        } catch (err) {
            const msg =
                err?.response?.data?.message ||
                err?.message ||
                '아이디 또는 비밀번호가 일치하지 않습니다.';
            alertError('로그인 실패', msg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthLayout title="WINO Academy" subtitle="관리자 로그인" maxWidth="max-w-md">
            <form onSubmit={onSubmit} className="space-y-5">
                {/* */}
                <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">아이디</label>
                    <input
                        type="text"
                        name="userId"
                        value={form.userId}
                        onChange={onChange}
                        placeholder="아이디를 입력하세요"
                        autoComplete="username"
                        autoFocus
                        className="w-full rounded-xl border px-4 py-2.5 outline-none focus:ring-2 focus:ring-indigo-300"
                        disabled={loading}
                    />
                </div>

                {/* */}
                <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">비밀번호</label>
                    <input
                        type="password"
                        name="password"
                        value={form.password}
                        onChange={onChange}
                        placeholder="비밀번호를 입력하세요"
                        autoComplete="current-password"
                        className="w-full rounded-xl border px-4 py-2.5 outline-none focus:ring-2 focus:ring-indigo-300"
                        disabled={loading}
                    />
                </div>

                {/* */}
                <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-xl bg-slate-900 text-white py-2.5 hover:bg-slate-700 disabled:opacity-60"
                >
                    {loading ? '로그인 중…' : '로그인'}
                </button>

                {/* */}
                <div className="flex items-center justify-between text-sm pt-1">
                    <Link className="text-slate-600 hover:underline" to="/admin/forgot-password">
                        비밀번호 찾기
                    </Link>
                    <Link className="text-slate-600 hover:underline" to="/admin/signUp">
                        신규 등록
                    </Link>
                </div>
            </form>
        </AuthLayout>
    );
}