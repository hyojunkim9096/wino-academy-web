// src/features/admin/components/guardian/GuardianFormPanel.jsx
import React, { useState } from 'react';
import { createGuardian } from '@/api/guardianApi';
import { alertError, alertInfo, alertSuccess } from '@/ui/alert';
import AddressSearch from '@/components/AddressSearch';

//
const safeInfo  = (t,m)=>Promise.resolve(alertInfo(t,m)).catch(()=>{});
const safeOk    = (t,m)=>Promise.resolve(alertSuccess(t,m)).catch(()=>{});
const safeError = (t,m)=>Promise.resolve(alertError(t,m)).catch(()=>{});

//
function Field({label, children}){ return <label className="block"><div className="text-sm mb-1 text-slate-300">{label}</div>{children}</label>; }

/**
 * 신규 보호자 등록 폼
 * @param {object} props
 * @param {'create'} props.mode
 * @param {function} props.onSaveSuccess -
 * @param {function} props.onCancel -
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

    const set = (k)=>(e)=>setForm(f=>({ ...f, [k]: e.target.value }));

    //
    const onAddressComplete = ({ postalCode, address }) => {
        setForm(f => ({ ...f, postalCode: postalCode || '', address: address || '' }));
    };

    //
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
                memo: form.memo?.trim() || null,
            };
            const savedGuardian = await createGuardian(payload);
            await safeOk('성공', '신규 보호자가 등록되었습니다.');
            onSaveSuccess?.(savedGuardian); //
        } catch (e) {
            safeError('오류', e?.response?.data?.message || '등록 실패');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex justify-between">
                <div className="text-lg font-semibold">신규 보호자 등록</div>
                <div className="flex gap-2">
                    <button className="aa-btn" onClick={onCancel}>취소</button>
                    <button className="aa-btn aa-btn-primary" disabled={saving} onClick={onSave}>
                        {saving ? '저장 중…' : '저장'}
                    </button>
                </div>
            </div>

            <div className="border-t border-slate-700 pt-3">
                <div className="text-base font-semibold mb-2">기본 정보</div>
                <div className="guardian-form-grid">
                    <Field label="이름 *">
                        <input className="aa-input" value={form.name} onChange={set('name')}/>
                    </Field>
                    <Field label="연락처 *">
                        <input className="aa-input" value={form.phone} onChange={set('phone')}/>
                    </Field>
                    <Field label="이메일">
                        <input className="aa-input" value={form.email} onChange={set('email')}/>
                    </Field>
                    <Field label="푸시키">
                        <input className="aa-input" value={form.pushUserKey} onChange={set('pushUserKey')}/>
                    </Field>
                    <Field label="SMS 동의">
                        <select className="aa-select" value={form.preferSms?1:0} onChange={e=>setForm(f=>({...f,preferSms:Number(e.target.value)===1}))}>
                            <option value={1}>동의</option><option value={0}>미동의</option>
                        </select>
                    </Field>
                    <Field label="Email 동의">
                        <select className="aa-select" value={form.preferEmail?1:0} onChange={e=>setForm(f=>({...f,preferEmail:Number(e.target.value)===1}))}>
                            <option value={1}>동의</option><option value={0}>미동의</option>
                        </select>
                    </Field>
                </div>
            </div>

            <div className="border-t border-slate-700 pt-3">
                <div className="text-base font-semibold mb-2">주소 (선택)</div>
                <div className="guardian-form-grid">
                    <div className="md:col-span-2">
                        <Field label="우편번호">
                            <div className="flex gap-2">
                                <input className="aa-input" value={form.postalCode||''}
                                       onChange={e=>setForm(f=>({...f,postalCode:e.target.value.replace(/[^0-9]/g,'').slice(0,5)}))}
                                       maxLength={5} inputMode="numeric"/>
                                <AddressSearch
                                    onComplete={onAddressComplete}
                                    className="aa-btn aa-btn-primary" buttonLabel="우편번호 검색"
                                />
                            </div>
                        </Field>
                    </div>
                    <Field label="주소"><input className="aa-input" value={form.address||''} readOnly/></Field>
                    <Field label="상세주소"><input className="aa-input" value={form.detailAddress||''} onChange={set('detailAddress')}/></Field>
                    <Field label="메모"><textarea className="aa-textarea" value={form.memo||''} onChange={set('memo')}/></Field>
                </div>
            </div>
        </div>
    );
}