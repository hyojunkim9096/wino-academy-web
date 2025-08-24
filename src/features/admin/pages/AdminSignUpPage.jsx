// 전체 교체 (성공/검증 팝업 + 이중저장 방지/쿨다운 적용)
import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthLayout from '@/components/layouts/AuthLayout';
import AddressSearch from '@/components/AddressSearch';
import { registerAdmin } from '@/api/adminApi';
import { alertError, alertSuccess } from '@/ui/alert';

function AdminSignUpPage() {
    const navigate = useNavigate();
    const timerRef = useRef(null);

    const [form, setForm] = useState({
        userId: '',
        userName: '',
        password: '',
        passwordConfirm: '',
        email: '',
        employeeType: 'STAFF',
        phoneNumber: '',
        emergencyContact: '',
        postalCode: '',
        address: '',
        detailAddress: '',
    });

    // 이중저장 방지 상태
    const [submitting, setSubmitting] = useState(false);
    const [cooldown, setCooldown] = useState(0); // 남은 대기초 (버튼에 표시)

    useEffect(() => {
        if (cooldown <= 0 && timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [cooldown]);

    const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });
    const onAddressComplete = ({ postalCode, address }) =>
        setForm((p) => ({ ...p, postalCode, address }));

    const onSubmit = async (e) => {
        e.preventDefault();
        if (submitting || cooldown > 0) return; // 더블클릭/쿨다운 중에는 무시

        // 1) 프론트 1차 검증
        if (!form.userId.trim()) return alertError('입력 오류', '아이디를 입력하세요.');
        if (!form.userName.trim()) return alertError('입력 오류', '이름을 입력하세요.');
        if (!form.password || form.password.length < 8)
            return alertError('입력 오류', '비밀번호는 8자 이상이어야 합니다.');
        if (form.password !== form.passwordConfirm)
            return alertError('입력 오류', '비밀번호와 비밀번호 확인이 일치하지 않습니다.');

        try {
            setSubmitting(true);

            // 2) 등록 호출 (api 모듈이 in-flight/쿨다운/멱등키 관리)
            await registerAdmin({
                ...form,
                userId: form.userId.trim(),
                userName: form.userName.trim(),
                email: form.email?.trim() || '',
            });

            // 3) 성공 안내 후 이동
            await alertSuccess('등록 완료', '계정이 등록되었습니다.');
            navigate('/admin/login');
        } catch (err) {
            // api 모듈에서 표준화한 코드 처리
            if (err?.code === 'COOLDOWN_ACTIVE') {
                // 남은 초로 버튼 카운트다운 시작
                const seconds = Number(err.remainingSeconds) || 5;
                setCooldown(seconds);
                if (!timerRef.current) {
                    timerRef.current = setInterval(() => setCooldown((s) => s - 1), 1000);
                }
                return alertError('잠시 후 재시도', `너무 빠른 재시도입니다. ${seconds}초 후 다시 시도하세요.`);
            }
            if (err?.code === 'IN_FLIGHT') {
                return alertError('처리 중', '요청 처리 중입니다. 잠시만 기다려주세요.');
            }
            if (err?.code === 'CONFLICT' || err?.response?.status === 409) {
                const msg =
                    err?.message ||
                    err?.response?.data?.message ||
                    '이미 존재하거나 중복 제출이 감지되었습니다.';
                return alertError('중복 확인', msg);
            }

            const msg = err?.response?.data?.message ?? err?.message ?? '등록에 실패했습니다.';
            alertError('오류', msg);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <AuthLayout title="WINO Academy" subtitle="관리자 신규 등록" size="2xl">
            <form className="space-y-8" onSubmit={onSubmit}>
                {/* 아이디 | 이름 */}
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">아이디</label>
                        <input
                            name="userId"
                            value={form.userId}
                            onChange={onChange}
                            placeholder="아이디를 입력하세요"
                            className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-4 py-2
                         focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                            disabled={submitting || cooldown > 0}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">이름</label>
                        <input
                            name="userName"
                            value={form.userName}
                            onChange={onChange}
                            className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-4 py-2
                         focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                            disabled={submitting || cooldown > 0}
                        />
                    </div>

                    {/* 비밀번호 | 비밀번호 확인 */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700">비밀번호</label>
                        <input
                            type="password"
                            name="password"
                            value={form.password}
                            onChange={onChange}
                            placeholder="8자 이상"
                            className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-4 py-2
                         focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                            disabled={submitting || cooldown > 0}
                            autoComplete="new-password"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">비밀번호 확인</label>
                        <input
                            type="password"
                            name="passwordConfirm"
                            value={form.passwordConfirm}
                            onChange={onChange}
                            className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-4 py-2
                         focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                            disabled={submitting || cooldown > 0}
                            autoComplete="new-password"
                        />
                    </div>

                    {/* 이메일 | 직원구분 */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700">이메일(선택)</label>
                        <input
                            type="email"
                            name="email"
                            value={form.email}
                            onChange={onChange}
                            placeholder="notice@company.com"
                            className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-4 py-2
                         focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                            disabled={submitting || cooldown > 0}
                            autoComplete="email"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">직원 구분</label>
                        <select
                            name="employeeType"
                            value={form.employeeType}
                            onChange={onChange}
                            className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-4 py-2
                         focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                            disabled={submitting || cooldown > 0}
                        >
                            <option value="STAFF">직원</option>
                            <option value="TEACHER">선생님</option>
                        </select>
                    </div>

                    {/* 핸드폰 번호 | 비상연락처 */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700">핸드폰 번호</label>
                        <input
                            name="phoneNumber"
                            value={form.phoneNumber}
                            onChange={onChange}
                            placeholder="01012345678"
                            className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-4 py-2
                         focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                            disabled={submitting || cooldown > 0}
                            inputMode="tel"
                            autoComplete="tel"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">비상연락처</label>
                        <input
                            name="emergencyContact"
                            value={form.emergencyContact}
                            onChange={onChange}
                            placeholder="01067894321"
                            className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-4 py-2
                         focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                            disabled={submitting || cooldown > 0}
                            inputMode="tel"
                        />
                    </div>
                </div>

                {/* 우편번호 */}
                <div>
                    <label className="block text-sm font-medium text-gray-700">우편번호</label>
                    <div className="mt-2 flex gap-2">
                        <input
                            name="postalCode"
                            value={form.postalCode}
                            readOnly
                            placeholder="우편번호"
                            className="flex-1 rounded-lg border border-gray-300 bg-gray-50 px-4 py-2"
                        />
                        <AddressSearch
                            onComplete={onAddressComplete}
                            className="rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white
                         hover:bg-indigo-700 focus:ring-4 focus:ring-indigo-200"
                            disabled={submitting || cooldown > 0}
                        />
                    </div>
                </div>

                {/* 주소 */}
                <div>
                    <label className="block text-sm font-medium text-gray-700">주소</label>
                    <input
                        name="address"
                        value={form.address}
                        readOnly
                        placeholder="우편번호 찾기로 자동 입력"
                        className="mt-2 w-full rounded-lg border border-gray-300 bg-gray-50 px-4 py-2"
                    />
                </div>

                {/* 상세주소 */}
                <div>
                    <label className="block text-sm font-medium text-gray-700">상세주소</label>
                    <input
                        name="detailAddress"
                        value={form.detailAddress}
                        onChange={onChange}
                        placeholder="동/호수 등 상세 입력"
                        className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-4 py-2
                       focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                        disabled={submitting || cooldown > 0}
                    />
                </div>

                <div className="flex items-center justify-between">
                    <Link to="/admin/login" className="text-sm text-gray-500 hover:text-gray-700">
                        ← 로그인으로
                    </Link>

                    <button
                        type="submit"
                        disabled={submitting || cooldown > 0}
                        className={
                            'inline-flex items-center rounded-xl px-6 py-2.5 text-white font-semibold shadow ' +
                            (submitting || cooldown > 0
                                ? 'bg-gray-400 cursor-not-allowed'
                                : 'bg-indigo-600 hover:bg-indigo-700 focus:ring-4 focus:ring-indigo-200')
                        }
                    >
                        {submitting ? '등록 중...' : cooldown > 0 ? `${cooldown}s 후 재시도` : '등록하기'}
                    </button>
                </div>
            </form>

            <div className="mt-6 text-center text-xs text-gray-500">
                가입 후 계정은 임시 상태로 생성됩니다. 로그인은 담당자에게 문의하세요.
            </div>
        </AuthLayout>
    );
}
export default AdminSignUpPage;
