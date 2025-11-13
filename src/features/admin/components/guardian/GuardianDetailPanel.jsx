// src/features/admin/components/guardian/GuardianDetailPanel.jsx
import React, { useEffect, useState, useMemo } from 'react';
import {
    getGuardian,
    updateGuardian,
    listGuardianStudents,
    linkGuardianAccount,
    unlinkGuardianAccount
} from '@/api/guardianApi';
import { alertError, alertInfo, alertSuccess, confirmDialog } from '@/ui/alert';
import Modal from '@/components/ui/Modal';
import AddressSearch from '@/components/AddressSearch';

//
const safeInfo  = (t,m)=>Promise.resolve(alertInfo(t,m)).catch(()=>{});
const safeOk    = (t,m)=>Promise.resolve(alertSuccess(t,m)).catch(()=>{});
const safeError = (t,m)=>Promise.resolve(alertError(t,m)).catch(()=>{});

//
function Field({label, children}){ return <label className="block"><div className="text-sm mb-1 text-slate-300">{label}</div>{children}</label>; }
function RO({children}){ return <div className="px-3 py-2 rounded border border-slate-700 bg-slate-800">{children ?? '-'}</div>; }

//
const toEdit = (d)=>({
    name: d?.name ?? '',
    phone: d?.phone ?? '',
    email: d?.email ?? '',
    postalCode: d?.postalCode ?? '',
    address: d?.address ?? '',
    detailAddress: d?.detailAddress ?? '',
    preferSms: d?.preferSms ?? true,
    preferEmail: d?.preferEmail ?? false,
    preferPush: d?.preferPush ?? false,
    pushUserKey: d?.pushUserKey ?? '',
    memo: d?.memo ?? ''
});

/**
 * 보호자 상세/편집 패널
 * @param {object} props
 * @param {number} props.guardianId -
 * @param {function} props.onListReload -
*/
export default function GuardianDetailPanel({ guardianId, onListReload }) {
    const [detail, setDetail]   = useState(null); //
    const [edit, setEdit]       = useState(null); //
    const [editing, setEditing] = useState(false);
    const [saving, setSaving]   = useState(false);

    const [students, setStudents] = useState([]); //
    const [loading, setLoading]   = useState(true);

    //
    const [linkOpen, setLinkOpen] = useState(false);
    const [linkForm, setLinkForm] = useState({ loginId: '', password: '' });
    const [linkSaving, setLinkSaving] = useState(false);

    //
    const loadDetail = useCallback(async () => {
        if (!guardianId) return;
        setLoading(true);
        try {
            const [d, s] = await Promise.all([
                getGuardian(guardianId),
                listGuardianStudents(guardianId)
            ]);
            setDetail(d);
            setEdit(toEdit(d));

            const rows = Array.isArray(s)?s:(s?.content||[]);
            rows.sort((a,b)=>(a.name||'').localeCompare(b.name||'','ko',{sensitivity:'base'}));
            setStudents(rows);

        } catch(e) {
            safeError('오류', e?.response?.data?.message || '상세 정보 로드 실패');
            setDetail(null);
            setEdit(null);
            setStudents([]);
        } finally {
            setLoading(false);
            setEditing(false);
        }
    }, [guardianId]);

    //
    useEffect(() => {
        loadDetail();
    }, [loadDetail]);

    //
    const onSave = async () => {
        if (!guardianId || !edit) return;
        setSaving(true);
        try {
            await updateGuardian(guardianId, edit);
            await safeOk('성공', '저장되었습니다.');
            await loadDetail(); //
            await onListReload?.(); //
        } catch (e) {
            safeError('오류', e?.response?.data?.message || '저장 실패');
        } finally {
            setSaving(false);
        }
    };

    //
    const onLinkAccount = async () => {
        const { loginId, password } = linkForm;
        if (!loginId?.trim()) return safeInfo('안내', '로그인 ID를 입력하세요.');
        if (!password?.trim() || password.trim().length < 6) return safeInfo('안내', '비밀번호를 6자리 이상 입력하세요.');

        setLinkSaving(true);
        try {
            await linkGuardianAccount(guardianId, { loginId: loginId.trim(), password: password.trim() });
            await safeOk('성공', '계정이 생성되고 연결되었습니다.');
            setLinkOpen(false);
            setLinkForm({ loginId: '', password: '' });
            await loadDetail();
            await onListReload?.();
        } catch (e) {
            safeError('오류', e?.response?.data?.message || '계정 연결 실패');
        } finally {
            setLinkSaving(false);
        }
    };

    //
    const onUnlinkAccount = async () => {
        const ok = await confirmDialog('연결 해제', '계정 연결을 해제할까요?\n(계정 자체가 삭제되지는 않습니다.)');
        if (!ok) return;

        setSaving(true);
        try {
            await unlinkGuardianAccount(guardianId);
            await safeOk('성공', '계정 연결이 해제되었습니다.');
            await loadDetail();
            await onListReload?.();
        } catch (e) {
            safeError('오류', e?.response?.data?.message || '연결 해제 실패');
        } finally {
            setSaving(false);
        }
    };

    //
    const onAddressComplete = ({ postalCode, address }) => {
        setEdit(f => ({ ...f, postalCode: postalCode || '', address: address || '' }));
    };

    if (loading) {
        return <div>상세 정보 로딩 중…</div>;
    }
    if (!detail || !edit) {
        return <div>보호자 정보를 불러오지 못했습니다.</div>;
    }

    return (
        <div className="space-y-4">
            <div className="flex justify-between">
                <div className="text-lg font-semibold">{detail.name}</div>
                <div className="flex gap-2">
                    {!editing ? (
                        <button className="aa-btn aa-btn-primary" onClick={()=>setEditing(true)}>수정</button>
                    ) : (
                        <>
                            <button className="aa-btn" onClick={()=>{ setEdit(toEdit(detail)); setEditing(false); }}>취소</button>
                            <button className="aa-btn aa-btn-primary" disabled={saving} onClick={onSave}>{saving?'저장 중…':'저장'}</button>
                        </>
                    )}
                </div>
            </div>

            {/* =======================

              =======================
            */}
            <div className="border-t border-slate-700 pt-3">
                <div className="flex items-center justify-between mb-2">
                    <div className="text-base font-semibold">계정 정보</div>
                    {!detail.userId ? (
                        <button className="aa-btn aa-btn-primary" onClick={() => setLinkOpen(true)} disabled={editing}>
                            계정 생성/연결
                        </button>
                    ) : (
                        <button className="aa-btn aa-btn-danger" onClick={onUnlinkAccount} disabled={editing || saving}>
                            계정 연결 해제
                        </button>
                    )}
                </div>
                {!detail.userId ? (
                    <RO>연결된 학부모 앱 계정이 없습니다.</RO>
                ) : (
                    <div className="grid md:grid-cols-2 gap-3">
                        <Field label="로그인 ID"><RO>{detail.loginId}</RO></Field>
                        <Field label="계정 상태"><RO>{detail.userStatus}</RO></Field>
                    </div>
                )}
            </div>

            {/* =======================

              =======================
            */}
            <div className="border-t border-slate-700 pt-3">
                <div className="text-base font-semibold mb-2">기본 정보</div>
                <div className="guardian-form-grid">
                    <Field label="이름">{!editing ? <RO>{detail.name}</RO> : <input className="aa-input" value={edit.name} onChange={e=>setEdit(f=>({...f,name:e.target.value}))}/>}</Field>
                    <Field label="연락처">{!editing ? <RO>{detail.phone || '-'}</RO> : <input className="aa-input" value={edit.phone||''} onChange={e=>setEdit(f=>({...f,phone:e.target.value}))}/>}</Field>
                    <Field label="이메일">{!editing ? <RO>{detail.email || '-'}</RO> : <input className="aa-input" value={edit.email||''} onChange={e=>setEdit(f=>({...f,email:e.target.value}))}/>}</Field>
                    <Field label="푸시키">{!editing ? <RO>{detail.pushUserKey || '-'}</RO> : <input className="aa-input" value={edit.pushUserKey||''} onChange={e=>setEdit(f=>({...f,pushUserKey:e.target.value}))}/>}</Field>
                    <Field label="SMS 동의">{!editing ? <RO>{detail.preferSms? '동의':'미동의'}</RO> : (
                        <select className="aa-select" value={edit.preferSms?1:0} onChange={e=>setEdit(f=>({...f,preferSms:Number(e.target.value)===1}))}>
                            <option value={1}>동의</option><option value={0}>미동의</option>
                        </select>
                    )}</Field>
                    <Field label="Email 동의">{!editing ? <RO>{detail.preferEmail? '동의':'미동의'}</RO> : (
                        <select className="aa-select" value={edit.preferEmail?1:0} onChange={e=>setEdit(f=>({...f,preferEmail:Number(e.target.value)===1}))}>
                            <option value={1}>동의</option><option value={0}>미동의</option>
                        </select>
                    )}</Field>
                </div>
            </div>

            {/* =======================

              =======================
            */}
            <div className="border-t border-slate-700 pt-3">
                <div className="text-base font-semibold mb-2">주소</div>
                <div className="guardian-form-grid">
                    <div className="md:col-span-2">
                        <Field label="우편번호">
                            {!editing ? <RO>{detail.postalCode || '-'}</RO> : (
                                <div className="flex gap-2">
                                    <input className="aa-input" value={edit.postalCode||''}
                                           onChange={e=>setEdit(f=>({...f,postalCode:e.target.value.replace(/[^0-9]/g,'').slice(0,5)}))}
                                           maxLength={5} inputMode="numeric"/>
                                    <AddressSearch
                                        onComplete={onAddressComplete}
                                        className="aa-btn aa-btn-primary" buttonLabel="우편번호 검색"
                                    />
                                </div>
                            )}
                        </Field>
                    </div>
                    <Field label="주소">{!editing ? <RO>{detail.address || '-'}</RO> : <input className="aa-input" value={edit.address||''} readOnly/>}</Field>
                    <Field label="상세주소">{!editing ? <RO>{detail.detailAddress || '-'}</RO> : <input className="aa-input" value={edit.detailAddress||''} onChange={e=>setEdit(f=>({...f,detailAddress:e.target.value}))}/>}</Field>
                    <Field label="메모">{!editing ? <RO>{detail.memo || '-'}</RO> : <textarea className="aa-textarea" value={edit.memo||''} onChange={e=>setEdit(f=>({...f,memo:e.target.value}))}/>}</Field>
                </div>
            </div>

            {/* =======================

              =======================
            */}
            <div className="border-t border-slate-700 pt-3">
                <div className="text-base font-semibold mb-2">연결된 학생</div>
                <div className="aa-table-wrap">
                    <table className="aa-table">
                        <thead><tr><th>ID</th><th>이름</th><th>학부</th><th>관계</th><th>대표</th></tr></thead>
                        <tbody>
                        {students.length===0 && <tr><td colSpan={5}>연결된 학생이 없습니다.</td></tr>}
                        {students.map(s=>(
                            <tr key={s.id}>
                                <td className="aa-cell-mono">{s.studentId || s.id}</td>
                                <td>{s.name || s.studentName}</td>
                                <td>{s.schoolStage || '-'}</td>
                                <td>{s.relationCode || '-'}</td>
                                <td>{s.primary ? 'Y':'N'}</td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* =======================

              =======================
            */}
            {linkOpen && detail && (
                <Modal title="계정 생성/연결" onClose={() => setLinkOpen(false)} size="md">
                    <div className="space-y-3">
                        <div className="text-sm text-slate-300">
                            보호자 <span className="font-semibold">{detail.name}</span> 님의 학부모 앱/웹 로그인 계정을 생성합니다.
                        </div>
                        <Field label="로그인 ID *">
                            <input
                                className="aa-input"
                                value={linkForm.loginId}
                                onChange={e=>setLinkForm(f=>({...f, loginId:e.target.value}))}
                                placeholder="사용할 로그인 ID"
                            />
                        </Field>
                        <Field label="비밀번호 *">
                            <input
                                type="password"
                                className="aa-input"
                                value={linkForm.password}
                                onChange={e=>setLinkForm(f=>({...f, password:e.target.value}))}
                                placeholder="6자리 이상"
                            />
                        </Field>
                        <div className="flex justify-end gap-2">
                            <button className="aa-btn" onClick={() => setLinkOpen(false)} disabled={linkSaving}>취소</button>
                            <button className="aa-btn aa-btn-primary" onClick={onLinkAccount} disabled={linkSaving}>
                                {linkSaving ? "생성 중..." : "생성 및 연결"}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}