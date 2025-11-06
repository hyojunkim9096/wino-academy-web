// src/features/admin/pages/AdminGuardianPage.jsx
// ============================================================================
// 보호자 관리 화면
// - 좌: 보호자 목록(키워드 검색)
// - 우: 상세/편집 + 연결된 학생 읽기
// - 스타일: admin-system.css, admin-shared.css, admin-guardian.css
// - 목록 스크롤 클래스: .guardian-list-panel
// ============================================================================

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { listGuardians, getGuardian, createGuardian, updateGuardian, listGuardianStudents } from '@/api/guardianApi';
import { alertError, alertInfo, alertSuccess } from '@/ui/alert';
import Modal from '@/components/ui/Modal';
import AddressSearch from '@/components/AddressSearch';

import '@/styles/admin-system.css';
import '@/styles/admin-shared.css';
import '@/styles/admin-guardian.css';

const safeInfo  = (t,m)=>Promise.resolve(alertInfo(t,m)).catch(()=>{});
const safeOk    = (t,m)=>Promise.resolve(alertSuccess(t,m)).catch(()=>{});
const safeError = (t,m)=>Promise.resolve(alertError(t,m)).catch(()=>{});

export default function AdminGuardianPage(){
    const [keyword, setKeyword] = useState('');
    const [kwDebounced, setKwDebounced] = useState('');
    const [list, setList] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedId, setSelectedId] = useState(null);

    const [detail, setDetail] = useState(null);
    const [edit, setEdit]     = useState(null);
    const [editing, setEditing] = useState(false);
    const [saving, setSaving]   = useState(false);

    const [students, setStudents] = useState([]);

    const [newOpen, setNewOpen] = useState(false);
    const [newForm, setNewForm] = useState({ name:'', phone:'', email:'' });

    // 검색 디바운스
    useEffect(()=>{
        const t = setTimeout(()=> setKwDebounced(keyword.trim()), 250);
        return ()=> clearTimeout(t);
    },[keyword]);

    // 목록
    const inflight = useRef(0);
    const loadList = useCallback(async (keep=false)=>{
        setLoading(true);
        const my = ++inflight.current;
        try{
            const res = await listGuardians({ keyword: kwDebounced || undefined, page:0, size:30 });
            if (my !== inflight.current) return;
            const rows = Array.isArray(res?.content)?res.content:(Array.isArray(res)?res:[]);
            rows.sort((a,b)=>(a.name||'').localeCompare(b.name||'','ko',{sensitivity:'base'}));
            setList(rows);
            setSelectedId(prev => (keep && prev && rows.some(r=>r.id===prev)) ? prev : (rows[0]?.id ?? null));
        }catch{
            setList([]);
        }finally{
            if (my===inflight.current) setLoading(false);
        }
    },[kwDebounced]);

    useEffect(()=>{ loadList(false); },[loadList]);

    // 상세
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

    const loadDetail = useCallback(async (id)=>{
        try{
            const d = await getGuardian(id);
            setDetail(d); setEdit(toEdit(d)); setEditing(false);
            const s = await listGuardianStudents(id);
            const rows = Array.isArray(s)?s:(s?.content||[]);
            rows.sort((a,b)=>(a.name||'').localeCompare(b.name||'','ko',{sensitivity:'base'}));
            setStudents(rows);
        }catch{
            setDetail(null); setEdit(null); setStudents([]);
        }
    },[]);

    useEffect(()=>{ if (selectedId) loadDetail(selectedId); else { setDetail(null); setEdit(null); setStudents([]);} },[selectedId, loadDetail]);

    // 저장
    const onSave = async ()=>{
        setSaving(true);
        try{
            await updateGuardian(selectedId, edit);
            await safeOk('성공','저장되었습니다.');
            await loadDetail(selectedId);
            await loadList(true);
        }catch(e){
            safeError('오류', e?.response?.data?.message || '저장 실패');
        }finally{ setSaving(false); }
    };

    // 생성
    const onCreate = async ()=>{
        const name = newForm.name?.trim();
        if (!name) return safeInfo('안내','이름을 입력하세요.');
        try{
            const res = await createGuardian(newForm);
            setNewOpen(false); setNewForm({name:'',phone:'',email:''});
            await safeOk('성공','보호자가 생성되었습니다.');
            await loadList(false);
            if (res?.id) setSelectedId(res.id);
        }catch(e){
            safeError('오류', e?.response?.data?.message || '생성 실패');
        }
    };

    return (
        <section className="aa-page academy-page guardian-page">
            <div className="aa-container">
                <div className="aa-toolbar">
                    <h1 className="aa-title">보호자 관리</h1>
                    <div className="aa-toolbar-right">
                        <button className="aa-btn" onClick={()=>setNewOpen(true)}>신규 보호자</button>
                        <button className="aa-btn" onClick={()=>loadList(true)}>새로고침</button>
                    </div>
                </div>

                <div className="aa-split">
                    <div className="aa-card">
                        <div className="mb-2">
                            <input className="aa-input w-full" placeholder="이름/연락처/이메일" value={keyword} onChange={e=>setKeyword(e.target.value)}/>
                        </div>
                        {loading ? <div>불러오는 중…</div> : (
                            <div className="aa-panel guardian-list-panel divide-y">
                                {list.length===0 && <div className="p-3 text-slate-400">결과 없음</div>}
                                {list.map(row=>{
                                    const sel = selectedId===row.id;
                                    return (
                                        <button key={row.id} type="button"
                                                className={`w-full text-left p-3 relative ${sel?'bg-slate-800 font-semibold':'hover:bg-slate-800/60'}`}
                                                onClick={()=>setSelectedId(row.id)}>
                                            {sel && <span aria-hidden className="absolute left-0 top-0 h-full" style={{width:3,background:'var(--aa-accent)'}}/>}
                                            <div className="truncate">{row.name}</div>
                                            <div className="text-xs text-slate-400 truncate">{row.phone || '-'} · {row.email || '-'}</div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    <div className="aa-card">
                        {!detail ? <div>좌측에서 대상을 선택하세요.</div> : (
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

                                <div className="grid md:grid-cols-2 gap-3">
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

                                    <div className="md:col-span-2 border-t border-slate-700 pt-3">
                                        <div className="grid md:grid-cols-2 gap-3">
                                            <Field label="우편번호">
                                                {!editing ? <RO>{detail.postalCode || '-'}</RO> : (
                                                    <div className="flex gap-2">
                                                        <input className="aa-input" value={edit.postalCode||''}
                                                               onChange={e=>setEdit(f=>({...f,postalCode:e.target.value.replace(/[^0-9]/g,'').slice(0,5)}))}
                                                               maxLength={5} inputMode="numeric"/>
                                                        <AddressSearch
                                                            onComplete={({postalCode,address})=> setEdit(f=>({...f, postalCode:postalCode||'', address:address||''}))}
                                                            className="aa-btn aa-btn-primary" buttonLabel="우편번호 검색"
                                                        />
                                                    </div>
                                                )}
                                            </Field>
                                            <Field label="주소">{!editing ? <RO>{detail.address || '-'}</RO> : <input className="aa-input" value={edit.address||''} readOnly/>}</Field>
                                            <Field label="상세주소">{!editing ? <RO>{detail.detailAddress || '-'}</RO> : <input className="aa-input" value={edit.detailAddress||''} onChange={e=>setEdit(f=>({...f,detailAddress:e.target.value}))}/>}</Field>
                                            <Field label="메모">{!editing ? <RO>{detail.memo || '-'}</RO> : <textarea className="aa-textarea" value={edit.memo||''} onChange={e=>setEdit(f=>({...f,memo:e.target.value}))}/>}</Field>
                                        </div>
                                    </div>
                                </div>

                                {/* 연결 학생 */}
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
                                                    <td>{s.isPrimary ? 'Y':'N'}</td>
                                                </tr>
                                            ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                            </div>
                        )}
                    </div>
                </div>
            </div>

            {newOpen && (
                <Modal title="신규 보호자" onClose={()=>setNewOpen(false)}>
                    <div className="space-y-3">
                        <div className="aa-field"><label>이름</label><input className="aa-input" value={newForm.name} onChange={e=>setNewForm(f=>({...f,name:e.target.value}))}/></div>
                        <div className="aa-field"><label>연락처</label><input className="aa-input" value={newForm.phone} onChange={e=>setNewForm(f=>({...f,phone:e.target.value}))}/></div>
                        <div className="aa-field"><label>이메일</label><input className="aa-input" value={newForm.email} onChange={e=>setNewForm(f=>({...f,email:e.target.value}))}/></div>
                        <div className="flex justify-end gap-2">
                            <button className="aa-btn" onClick={()=>setNewOpen(false)}>취소</button>
                            <button className="aa-btn aa-btn-primary" onClick={onCreate}>생성</button>
                        </div>
                    </div>
                </Modal>
            )}
        </section>
    );
}

function Field({label, children}){ return <label className="block"><div className="text-sm mb-1 text-slate-300">{label}</div>{children}</label>; }
function RO({children}){ return <div className="px-3 py-2 rounded border border-slate-700 bg-slate-800">{children ?? '-'}</div>; }