// src/features/student/components/consult/ConsultViewEditModal.jsx
// ============================================================================
// 상담 상세/수정/승인 모달
// - AdminConsultPage (관리 페이지)에서 호출됨
// - '승인' 버튼 권한 로직 포함
// ============================================================================

import React, { useEffect, useMemo, useState } from 'react';
import Modal from '@/common/components/ui/Modal.jsx';

// (날짜/시간 유틸)
function nowLocalInputValue() {
    const d = new Date();
    const p = (n)=> String(n).padStart(2,'0');
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function ensureLocalIsoSeconds(v) {
    const s = String(v||'').trim();
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) return `${s}:00`;
    return s.replace('Z','');
}
function isoToInputValue(s) {
    if (!s) return '';
    let t = String(s).replace('Z','');
    if (t.includes('.')) t = t.split('.')[0];
    return t.slice(0,16); // YYYY-MM-DDTHH:mm
}
function prettyDateTime(s) {
    if (!s) return '-';
    const t = String(s).replace('T',' ').replace('Z','');
    return t.includes('.') ? t.split('.')[0] : t;
}
const up = (s)=> String(s ?? '').trim().toUpperCase();

// (Field / RO 헬퍼)
function Field({label, children}){ return <label className="block"><div className="text-sm mb-1 text-slate-300">{label}</div>{children}</label>; }
function RO({children}){ return <div className="px-3 py-2 rounded border border-slate-700 bg-slate-800">{children ?? '-'}</div>; }


export default function ConsultViewEditModal({
                                                 open, onClose, row,
                                                 methodOptions, typeOptions, scopeOptions,
                                                 onSave,
                                                 onApprove, // ✅ 승인 콜백
                                                 currentUser, // ✅ 현재 사용자 정보
                                                 isApproving, // ✅ 승인 버튼 saving 플래그
                                                 isSaving,    // ✅ 저장 버튼 saving 플래그
                                                 onAddGuardian,  // ✅ 보호자 추가 콜백
                                                 onRemoveGuardian // ✅ 보호자 삭제 콜백
                                             }) {
    const [editMode, setEditMode] = useState(false);
    // (폼 상태는 동일)
    const [form, setForm] = useState(()=>({
        title: row?.title || '',
        content: row?.content || '',
        consultMethod: up(row?.consultMethod || 'CALL'),
        consultType:   up(row?.consultType || 'REGULAR'),
        visibilityRole: up(row?.visibilityRole || 'ALL'),
        consultAt: isoToInputValue(row?.consultAt) || nowLocalInputValue(),
        nextFollowupAt: isoToInputValue(row?.nextFollowupAt) || '',
        homeroomOk: !!row?.homeroomOk,
        actionPlan: row?.actionPlan || ''
    }));

    // 모달이 다시 열릴 때 폼 상태를 원본(row) 기준으로 리셋
    useEffect(()=>{
        if (open) {
            setEditMode(false);
            setForm({
                title: row?.title || '',
                content: row?.content || '',
                consultMethod: up(row?.consultMethod || 'CALL'),
                consultType:   up(row?.consultType || 'REGULAR'),
                visibilityRole: up(row?.visibilityRole || 'ALL'),
                consultAt: isoToInputValue(row?.consultAt) || nowLocalInputValue(),
                nextFollowupAt: isoToInputValue(row?.nextFollowupAt) || '',
                homeroomOk: !!row?.homeroomOk,
                actionPlan: row?.actionPlan || ''
            });
        }
    },[open, row]);

    if (!open || !row) return null;
    const disabled = !editMode; //

    // ✅ 승인 버튼 표시 여부 계산
    const canApprove = useMemo(() => {
        if (!currentUser || !row) return false;
        // 1. 내가 쓴 글 아님
        const isMyPost = currentUser.id === row.writerId;
        // 2. 아직 승인 안 됨
        const isNotApproved = !row.homeroomOk;

        return !isMyPost && isNotApproved;
    }, [currentUser, row]);

    return (
        <Modal title="상담 상세" onClose={onClose} size="2xl">
            <div className="space-y-4">
                {/* 제목/일시 */}
                <div className="grid md:grid-cols-2 gap-3">
                    <Field label="제목">
                        <input
                            className="aa-input w-full"
                            value={form.title}
                            onChange={e=>setForm(f=>({...f, title:e.target.value}))}
                            readOnly={disabled}
                        />
                    </Field>
                    <Field label="상담 일시">
                        <input
                            type="datetime-local"
                            className="aa-input w-full"
                            value={form.consultAt}
                            onChange={e=>setForm(f=>({...f, consultAt:e.target.value}))}
                            readOnly={disabled}
                            disabled={disabled}
                        />
                    </Field>
                </div>

                {/* 방식/유형/가시성 */}
                <div className="grid md:grid-cols-3 gap-3">
                    <Field label="상담 방식">
                        <select
                            className="aa-select w-full"
                            value={form.consultMethod}
                            onChange={e=>setForm(f=>({...f, consultMethod:e.target.value}))}
                            disabled={disabled}
                        >
                            {methodOptions.map(o=>(
                                <option key={o.code} value={o.code}>{o.name} ({o.code})</option>
                            ))}
                        </select>
                    </Field>
                    <Field label="상담 유형">
                        <select
                            className="aa-select w-full"
                            value={form.consultType}
                            onChange={e=>setForm(f=>({...f, consultType:e.target.value}))}
                            disabled={disabled}
                        >
                            {typeOptions.map(o=>(
                                <option key={o.code} value={o.code}>{o.name} ({o.code})</option>
                            ))}
                        </select>
                    </Field>
                    <Field label="가시성">
                        <select
                            className="aa-select w-full"
                            value={form.visibilityRole}
                            onChange={e=>setForm(f=>({...f, visibilityRole:e.target.value}))}
                            disabled={disabled}
                        >
                            {scopeOptions.map(o=>(
                                <option key={o.code} value={o.code}>{o.name} ({o.code})</option>
                            ))}
                        </select>
                    </Field>
                </div>

                {/* 내용/액션플랜 */}
                <div className="grid md:grid-cols-2 gap-3">
                    <Field label="상담 내용">
                        <textarea
                            className="aa-textarea w-full"
                            rows={6}
                            value={form.content}
                            onChange={e=>setForm(f=>({...f, content:e.target.value}))}
                            readOnly={disabled}
                        />
                    </Field>
                    <Field label="액션 플랜">
                        <textarea
                            className="aa-textarea w-full"
                            rows={6}
                            value={form.actionPlan}
                            onChange={e=>setForm(f=>({...f, actionPlan:e.target.value}))}
                            readOnly={disabled}
                        />
                    </Field>
                </div>

                {/* 후속일정 / 팀장 승인 */}
                <div className="grid md:grid-cols-2 gap-3">
                    <Field label="다음 후속 예정">
                        <input
                            type="datetime-local"
                            className="aa-input w-full"
                            value={form.nextFollowupAt}
                            onChange={e=>setForm(f=>({...f, nextFollowupAt:e.target.value}))}
                            readOnly={disabled}
                            disabled={disabled}
                        />
                    </Field>
                    <Field label="팀장 승인">
                        <label
                            className="inline-flex items-center gap-2 px-3 py-2 rounded border border-slate-700 bg-slate-800"
                        >
                            <input type="checkbox" checked={!!row?.homeroomOk} disabled readOnly />
                            <span className="text-sm">{row?.homeroomOk ? "승인됨" : "미승인"}</span>
                        </label>
                    </Field>
                </div>

                {/* 참석 보호자 섹션 */}
                <div className="border-t border-slate-700 pt-3">
                    <div className="flex items-center justify-between mb-2">
                        <div className="text-base font-semibold">참석 보호자</div>
                        {editMode && (
                            <button className="aa-btn" onClick={onAddGuardian}>추가</button>
                        )}
                    </div>
                    <div className="aa-table-wrap">
                        <table className="aa-table">
                            <thead><tr><th>이름</th><th>관계</th><th>연락처</th><th>참석</th><th style={{width:80}}></th></tr></thead>
                            <tbody>
                            {(!row.attendees || row.attendees.length===0) && <tr><td colSpan={5}>없음</td></tr>}
                            {(row.attendees||[]).map((g, idx)=>(
                                <tr key={g.id || `g-${idx}`}>
                                    <td>{g.name}</td>
                                    <td>{g.relationCode}</td>
                                    <td>{g.phone}</td>
                                    <td>{g.presentYn? 'Y':'N'}</td>
                                    <td>
                                        {editMode && (
                                            <button className="aa-btn aa-btn-danger aa-btn-sm" onClick={()=>onRemoveGuardian(g)}>삭제</button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* 액션 */}
                <div className="flex justify-between items-center pt-2">
                    <div className="text-xs text-slate-400">
                        작성자: {row.writerName || `ID ${row.writerId}`}
                    </div>
                    <div className="flex gap-2">
                        {!editMode ? (
                            <>
                                {canApprove && (
                                    <button
                                        className="aa-btn aa-btn-primary"
                                        onClick={onApprove}
                                        disabled={isApproving}
                                    >
                                        {isApproving ? "승인 중..." : "승인"}
                                    </button>
                                )}
                                <button className="aa-btn" onClick={onClose}>닫기</button>
                                <button className="aa-btn aa-btn-primary" onClick={()=>setEditMode(true)}>수정</button>
                            </>
                        ) : (
                            <>
                                <button
                                    className="aa-btn"
                                    onClick={()=>{
                                        setEditMode(false);
                                        setForm({ //
                                            title: row?.title || '',
                                            content: row?.content || '',
                                            consultMethod: up(row?.consultMethod || 'CALL'),
                                            consultType:   up(row?.consultType || 'REGULAR'),
                                            visibilityRole: up(row?.visibilityRole || 'ALL'),
                                            consultAt: isoToInputValue(row?.consultAt) || nowLocalInputValue(),
                                            nextFollowupAt: isoToInputValue(row?.nextFollowupAt) || '',
                                            homeroomOk: !!row?.homeroomOk,
                                            actionPlan: row?.actionPlan || ''
                                        });
                                    }}
                                >취소</button>
                                <button
                                    className="aa-btn aa-btn-primary"
                                    disabled={isSaving}
                                    onClick={()=>{
                                        const payload = {
                                            title: (form.title||'').trim(),
                                            content: (form.content||'').trim() || '(내용을 입력하세요)',
                                            homeroomOk: !!row?.homeroomOk,
                                            consultMethod: up(form.consultMethod || 'CALL'),
                                            consultType: up(form.consultType || 'REGULAR'),
                                            visibilityRole: up(form.visibilityRole || 'ALL'),
                                            consultAt: ensureLocalIsoSeconds(form.consultAt) || nowLocalIso(),
                                            nextFollowupAt: ensureLocalIsoSeconds(form.nextFollowupAt) || null,
                                            actionPlan: (form.actionPlan||'').trim() || null,
                                            useYn: row?.useYn ?? true
                                        };
                                        onSave(payload, ()=>setEditMode(false));
                                    }}
                                >
                                    {isSaving ? '저장 중…' : '저장'}
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </Modal>
    );
}