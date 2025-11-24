// src/features/admin/pages/AdminSignUpPage.jsx
// ============================================================================
// 관리자 신규 등록 페이지
//  - 공개 페이지(비로그인)에서 접근
//  - 성공 시 /admin/login 으로 이동
//  - 백엔드 /api/admin/register (SignUpRequest) 호출
//
//  필수 입력:
//    - 아이디(userId)
//    - 비밀번호(password, 8자 이상)
//    - 비밀번호 확인(passwordConfirm)
//    - 이름(userName)
//    - 생년월일(birthdate)
//    - 이메일(email)
//    - 직원 구분(employeeType: STAFF / TEACHER)
// ============================================================================

import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthLayout from '@/components/layouts/AuthLayout';
import AddressSearch from '@/components/AddressSearch';
import { registerAdmin } from '@/api/adminApi';
import { alertError, alertSuccess } from '@/ui/alert';
import '@/styles/admin-signup.css';

function AdminSignUpPage() {
    const navigate = useNavigate();

    // 쿨다운 타이머 ID (setInterval 핸들)
    const timerIdRef = useRef(null);

    // 폼 상태
    const [form, setForm] = useState({
        userId: '',
        password: '',
        passwordConfirm: '',
        userName: '',
        birthdate: '',          // input type="date" → "YYYY-MM-DD"
        email: '',
        employeeType: 'STAFF',  // 기본값: STAFF
        phoneNumber: '',
        emergencyContact: '',
        postalCode: '',
        address: '',
        detailAddress: '',
    });

    // 제출 중 여부 / 쿨다운 남은 시간
    const [submitting, setSubmitting] = useState(false);
    const [cooldown, setCooldown] = useState(0);

    // 1. 페이지 진입 시 기존 인증 토큰 제거 (403 방지)
    useEffect(() => {
        try {
            localStorage.removeItem('accessToken');
            localStorage.removeItem('currentAdminId');
            sessionStorage.removeItem('accessToken');
        } catch {
            // storage 오류는 무시
        }
        return () => clearTimer();
    }, []);

    // 2. 쿨다운 타이머
    useEffect(() => {
        if (cooldown > 0) {
            if (!timerIdRef.current) {
                timerIdRef.current = setInterval(() => {
                    setCooldown((prev) => {
                        if (prev <= 1) {
                            clearTimer();
                            return 0;
                        }
                        return prev - 1;
                    });
                }, 1000);
            }
        } else {
            clearTimer();
        }
    }, [cooldown]);

    const clearTimer = () => {
        if (timerIdRef.current) {
            clearInterval(timerIdRef.current);
            timerIdRef.current = null;
        }
    };

    // 입력 핸들러
    const onChange = (e) => {
        const { name, value } = e.target;
        setForm((prev) => ({ ...prev, [name]: value }));
    };

    // 주소검색 완료 핸들러
    const onAddressComplete = ({ postalCode, address }) =>
        setForm((prev) => ({ ...prev, postalCode, address }));

    // 제출 핸들러
    const onSubmit = async (e) => {
        e.preventDefault();

        if (submitting || cooldown > 0) return;

        // === 클라이언트 측 1차 검증 =========================================
        if (!form.userId.trim()) {
            return alertError('입력', '아이디를 입력하세요.');
        }
        if (!form.password || form.password.length < 8) {
            return alertError('입력', '비밀번호는 8자 이상이어야 합니다.');
        }
        if (form.password !== form.passwordConfirm) {
            return alertError('입력', '비밀번호가 일치하지 않습니다.');
        }
        if (!form.userName.trim()) {
            return alertError('입력', '이름을 입력하세요.');
        }
        if (!form.birthdate) {
            return alertError('입력', '생년월일을 입력하세요.');
        }
        if (!form.email.trim()) {
            return alertError('입력', '이메일을 입력하세요.');
        }

        try {
            setSubmitting(true);

            console.log('Registration Payload:', form);

            await registerAdmin({
                ...form,
                userId: form.userId.trim(),
                userName: form.userName.trim(),
                birthdate: form.birthdate,   // "YYYY-MM-DD"
                email: form.email.trim(),
            });

            await alertSuccess(
                '성공',
                '계정이 등록되었습니다.\n관리자 승인 후 로그인하세요.'
            );
            navigate('/admin/login');
        } catch (err) {
            console.error('등록 실패:', err);
            console.error('등록 실패 응답:', err?.response?.data);

            const resp = err?.response?.data;
            const serverMsg = resp?.message;
            const serverCode = resp?.code;

            // 409 CONFLICT
            if (serverCode === 'CONFLICT' || err?.response?.status === 409) {
                return alertError('중복', serverMsg || '이미 존재하는 정보입니다.');
            }

            // 400 BAD_REQUEST
            if (serverCode === 'BAD_REQUEST' || err?.response?.status === 400) {
                return alertError('입력 오류', serverMsg || '요청 값이 올바르지 않습니다.');
            }

            const msg = serverMsg || err?.message || '등록 실패';
            alertError('오류', msg);
        } finally {
            setSubmitting(false);
        }
    };

    const getButtonText = () => {
        if (submitting) return '등록 처리 중...';
        if (cooldown > 0) return `${cooldown}초 후 재시도 가능`;
        return '등록하기';
    };

    // 렌더링
    return (
        <AuthLayout title="WINO Academy" subtitle="관리자 신규 등록" size="xl">
            <div className="su-container">
                <form className="su-grid" onSubmit={onSubmit}>
                    {/* 1행: 아이디 | 비번 | 비번확인 */}
                    <div className="su-field span-2">
                        <label className="su-label">
                            아이디<span className="su-req">*</span>
                        </label>
                        <input
                            name="userId"
                            value={form.userId}
                            onChange={onChange}
                            placeholder="아이디"
                            className="su-input"
                            disabled={submitting}
                            autoComplete="username"
                        />
                    </div>
                    <div className="su-field span-2">
                        <label className="su-label">
                            비밀번호<span className="su-req">*</span>
                        </label>
                        <input
                            type="password"
                            name="password"
                            value={form.password}
                            onChange={onChange}
                            placeholder="8자 이상"
                            className="su-input"
                            disabled={submitting}
                            autoComplete="new-password"
                        />
                    </div>
                    <div className="su-field span-2">
                        <label className="su-label">
                            비밀번호 확인<span className="su-req">*</span>
                        </label>
                        <input
                            type="password"
                            name="passwordConfirm"
                            value={form.passwordConfirm}
                            onChange={onChange}
                            className="su-input"
                            disabled={submitting}
                            autoComplete="new-password"
                            placeholder="확인"
                        />
                    </div>

                    {/* 2행: 이름 | 생년월일(필수) */}
                    <div className="su-field span-3">
                        <label className="su-label">
                            이름<span className="su-req">*</span>
                        </label>
                        <input
                            name="userName"
                            value={form.userName}
                            onChange={onChange}
                            className="su-input"
                            disabled={submitting}
                            placeholder="이름"
                        />
                    </div>
                    <div className="su-field span-3">
                        <label className="su-label">
                            생년월일<span className="su-req">*</span>
                        </label>
                        <input
                            type="date"
                            name="birthdate"
                            value={form.birthdate}
                            onChange={(e) => {
                                const v = e.target.value;
                                if (v && v.split('-')[0].length > 4) return;
                                setForm((p) => ({ ...p, birthdate: v }));
                            }}
                            max="9999-12-31"
                            className="su-input"
                            disabled={submitting}
                        />
                    </div>

                    {/* 3행: 이메일 | 직원구분 */}
                    <div className="su-field span-3">
                        <label className="su-label">
                            이메일<span className="su-req">*</span>
                        </label>
                        <input
                            type="email"
                            name="email"
                            value={form.email}
                            onChange={onChange}
                            placeholder="user@example.com"
                            className="su-input"
                            disabled={submitting}
                            autoComplete="email"
                        />
                    </div>
                    <div className="su-field span-3">
                        <label className="su-label">
                            직원 구분<span className="su-req">*</span>
                        </label>
                        <select
                            name="employeeType"
                            value={form.employeeType}
                            onChange={onChange}
                            className="su-select"
                            disabled={submitting}
                        >
                            <option value="STAFF">직원</option>
                            <option value="TEACHER">선생님</option>
                        </select>
                    </div>

                    {/* 4행: 핸드폰 | 비상연락처 */}
                    <div className="su-field span-3">
                        <label className="su-label">핸드폰 번호</label>
                        <input
                            name="phoneNumber"
                            value={form.phoneNumber}
                            onChange={onChange}
                            placeholder="010..."
                            className="su-input"
                            disabled={submitting}
                            inputMode="tel"
                        />
                    </div>
                    <div className="su-field span-3">
                        <label className="su-label">비상연락처</label>
                        <input
                            name="emergencyContact"
                            value={form.emergencyContact}
                            onChange={onChange}
                            placeholder="010..."
                            className="su-input"
                            disabled={submitting}
                            inputMode="tel"
                        />
                    </div>

                    {/* 5행: 우편번호 */}
                    <div className="su-field span-6">
                        <label className="su-label">우편번호</label>
                        <div className="su-postal-row">
                            <input
                                name="postalCode"
                                value={form.postalCode}
                                readOnly
                                placeholder="번호"
                                className="su-input su-postal-input"
                                disabled={submitting}
                            />
                            <AddressSearch
                                onComplete={onAddressComplete}
                                className="px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition font-medium text-sm"
                                buttonLabel="주소 검색"
                                disabled={submitting}
                            />
                        </div>
                    </div>

                    {/* 6행: 주소 */}
                    <div className="su-field span-6">
                        <label className="su-label">주소</label>
                        <input
                            name="address"
                            value={form.address}
                            readOnly
                            placeholder="주소 검색 시 자동 입력"
                            className="su-input"
                            disabled={submitting}
                        />
                    </div>

                    {/* 7행: 상세주소 */}
                    <div className="su-field span-6">
                        <label className="su-label">상세주소</label>
                        <input
                            name="detailAddress"
                            value={form.detailAddress}
                            onChange={onChange}
                            placeholder="상세 주소 입력"
                            className="su-input"
                            disabled={submitting}
                        />
                    </div>

                    {/* 제출 버튼 */}
                    <div className="span-6">
                        <button
                            type="submit"
                            disabled={submitting || cooldown > 0}
                            className="su-btn-submit"
                        >
                            {getButtonText()}
                        </button>
                    </div>
                </form>

                <div className="su-link-area">
                    <Link to="/admin/login" className="su-link">
                        이미 계정이 있으신가요? <b>로그인하기</b>
                    </Link>
                </div>
            </div>
        </AuthLayout>
    );
}

export default AdminSignUpPage;
