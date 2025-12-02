// src/features/member/components/GuardianFormPanel.jsx
// ============================================================================
// 신규 보호자 등록 폼
// - AdminGuardianPage 우측에서 "신규" 모드일 때 사용
// - 저장 성공 시 상위(onSaveSuccess)로 생성된 GuardianSummary 전달
// ============================================================================

import React, { useState } from 'react';
import { createGuardian } from '@/features/member/api/guardianApi.js';
import { alertError, alertInfo, alertSuccess } from '@/common/ui/alert.js';
import AddressSearch from '@/common/components/AddressSearch.jsx';

// SweetAlert 안전 래퍼
const safeInfo  = (t, m) => Promise.resolve(alertInfo(t, m)).catch(() => {});
const safeOk    = (t, m) => Promise.resolve(alertSuccess(t, m)).catch(() => {});
const safeError = (t, m) => Promise.resolve(alertError(t, m)).catch(() => {});

// 필드 공통 레이아웃
function Field({ label, children }) {
    return (
        <label className="block">
            <div className="text-sm mb-1 text-slate-300">{label}</div>
            {children}
        </label>
    );
}

/**
 * 신규 보호자 등록 폼
 * @param {object} props
 * @param {'create'} props.mode           - 현재 모드(지금은 'create'만 사용)
 * @param {function} props.onSaveSuccess  - 저장 성공 시 호출 (savedGuardian 인자)
 * @param {function} props.onCancel       - 취소 시 호출 (우측 패널 닫기용)
 */
export default function GuardianFormPanel({ mode, onSaveSuccess, onCancel }) {
    const [form, setForm] = useState({
        name: '',
        phone: '',
        email: '',
        postalCode: '',
        address: '',
        detailAddress: '',
        preferSms: true,
        preferEmail: false,
        preferPush: false,
        pushUserKey: '',
        memo: ''
    });
    const [saving, setSaving] = useState(false);

    const set = (k) => (e) =>
        setForm((f) => ({
            ...f,
            [k]: e.target.value
        }));

    // 주소 검색 콜백
    const onAddressComplete = ({ postalCode, address }) => {
        setForm((f) => ({
            ...f,
            postalCode: postalCode || '',
            address: address || ''
        }));
    };

    // 저장 처리
    const onSave = async () => {
        if (!form.name?.trim()) return safeInfo('안내', '이름은 필수입니다.');
        if (!form.phone?.trim()) return safeInfo('안내', '연락처는 필수입니다.');

        setSaving(true);
        try {
            const payload = {
                ...form,
                name: form.name.trim(),
                phone: form.phone.trim(),
                email: form.email?.trim() || null,
                pushUserKey: form.pushUserKey?.trim() || null,
                postalCode: form.postalCode?.trim() || null,
                address: form.address?.trim() || null,
                detailAddress: form.detailAddress?.trim() || null,
                memo: form.memo?.trim() || null
            };

            const savedGuardian = await createGuardian(payload);

            await safeOk('성공', '신규 보호자가 등록되었습니다.');

            // 상위에서 목록 재조회 + 선택 변경
            onSaveSuccess?.(savedGuardian);
        } catch (e) {
            console.error(e);
            safeError('오류', e?.response?.data?.message || '등록 실패');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-4">
            {/* 헤더: 타이틀 + 액션 버튼 */}
            <div className="flex justify-between items-center">
                <div className="text-lg font-semibold">신규 보호자 등록</div>
                <div className="flex gap-2">
                    <button className="aa-btn" type="button" onClick={onCancel}>
                        취소
                    </button>
                    <button
                        className="aa-btn aa-btn-primary"
                        type="button"
                        disabled={saving}
                        onClick={onSave}
                    >
                        {saving ? '저장 중…' : '저장'}
                    </button>
                </div>
            </div>

            {/* 기본 정보 */}
            <div className="border-t border-slate-700 pt-3">
                <div className="text-base font-semibold mb-2">기본 정보</div>
                <div className="guardian-form-grid">
                    <Field label="이름 *">
                        <input
                            className="aa-input"
                            value={form.name}
                            onChange={set('name')}
                        />
                    </Field>
                    <Field label="연락처 *">
                        <input
                            className="aa-input"
                            value={form.phone}
                            onChange={set('phone')}
                        />
                    </Field>
                    <Field label="이메일">
                        <input
                            className="aa-input"
                            value={form.email}
                            onChange={set('email')}
                        />
                    </Field>
                    <Field label="푸시키">
                        <input
                            className="aa-input"
                            value={form.pushUserKey}
                            onChange={set('pushUserKey')}
                        />
                    </Field>
                    <Field label="SMS 동의">
                        <select
                            className="aa-select"
                            value={form.preferSms ? 1 : 0}
                            onChange={(e) =>
                                setForm((f) => ({
                                    ...f,
                                    preferSms: Number(e.target.value) === 1
                                }))
                            }
                        >
                            <option value={1}>동의</option>
                            <option value={0}>미동의</option>
                        </select>
                    </Field>
                    <Field label="Email 동의">
                        <select
                            className="aa-select"
                            value={form.preferEmail ? 1 : 0}
                            onChange={(e) =>
                                setForm((f) => ({
                                    ...f,
                                    preferEmail: Number(e.target.value) === 1
                                }))
                            }
                        >
                            <option value={1}>동의</option>
                            <option value={0}>미동의</option>
                        </select>
                    </Field>
                </div>
            </div>

            {/* 주소/메모 */}
            <div className="border-t border-slate-700 pt-3">
                <div className="text-base font-semibold mb-2">주소 (선택)</div>
                <div className="guardian-form-grid">
                    <div className="md:col-span-2">
                        <Field label="우편번호">
                            <div className="flex gap-2">
                                <input
                                    className="aa-input"
                                    value={form.postalCode || ''}
                                    onChange={(e) =>
                                        setForm((f) => ({
                                            ...f,
                                            postalCode: e.target.value
                                                .replace(/[^0-9]/g, '')
                                                .slice(0, 5)
                                        }))
                                    }
                                    maxLength={5}
                                    inputMode="numeric"
                                />
                                <AddressSearch
                                    onComplete={onAddressComplete}
                                    className="aa-btn aa-btn-primary"
                                    buttonLabel="우편번호 검색"
                                />
                            </div>
                        </Field>
                    </div>
                    <Field label="주소">
                        <input
                            className="aa-input"
                            value={form.address || ''}
                            readOnly
                        />
                    </Field>
                    <Field label="상세주소">
                        <input
                            className="aa-input"
                            value={form.detailAddress || ''}
                            onChange={set('detailAddress')}
                        />
                    </Field>
                    <Field label="메모">
                        <textarea
                            className="aa-textarea"
                            value={form.memo || ''}
                            onChange={set('memo')}
                        />
                    </Field>
                </div>
            </div>
        </div>
    );
}
