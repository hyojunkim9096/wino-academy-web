// src/features/admin/pages/AdminConsultPage.jsx
// ============================================================================
// 상담 관리 화면(학생 중심 조회)
// - 상단: 학생ID/기간 필터
// - 좌: 목록(최신순)
// - 우: 상세/수정 + 참석 보호자 관리
// - 중요: 상담 유형/가시성은 공통코드 그룹:
//         COUNSELING_TYPE (CALL/VISIT/OFFICE/APP_CHAT)
//         COUNSELING_SCOPE (HOMEROOM_ONLY/TEACHERS/ADMIN)
// - 스타일: admin-system.css, admin-shared.css, admin-consult.css
// ============================================================================

import React, { useCallback, useEffect, useState } from 'react';
import { searchConsults, getConsult, createConsult, updateConsult, addConsultGuardian, removeConsultGuardian } from '@/api/consultApi';
import { listGuardians } from '@/api/guardianApi';
import { getCodes } from '@/api/commonCodeAdminApi';
import { alertError, alertInfo, alertSuccess, confirmDialog } from '@/ui/alert';
import Modal from '@/components/ui/Modal';

import '@/styles/admin-system.css';
import '@/styles/admin-shared.css';
import '@/styles/admin-consult.css';

const safeInfo  = (t,m)=>Promise.resolve(alertInfo(t,m)).catch(()=>{});
const safeOk    = (t,m)=>Promise.resolve(alertSuccess(t,m)).catch(()=>{});
const safeError = (t,m)=>Promise.resolve(alertError(t,m)).catch(()=>{});

// 공통코드 그룹 키
const CODE_TYPE  = 'COUNSELING_TYPE';
const CODE_SCOPE = 'COUNSELING_SCOPE';

export default function AdminConsultPage(){
    const [studentId, setStudentId] = useState('');
    const [dateFrom, setDateFrom]   = useState('');
    const [dateTo, setDateTo]       = useState('');
    const [rows, setRows]           = useState([]);
    const [loading, setLoading]     = useState(false);

    const [selId, setSelId]   = useState(null);
    const [detail, setDetail] = useState(null);
    const [edit, setEdit]     = useState(null);
    const [saving, setSaving] = useState(false);

    const [typeCodes, setTypeCodes]   = useState([]);
    const [scopeCodes, setScopeCodes] = useState([]);

    const [modalNew, setModalNew] = useState(false);
    const [addForm, setAddForm]   = useState({ title:'', content:'', consultAt:'', consultType:'CALL', consultScope:'HOMEROOM_ONLY' });

    // 보호자 참석자 추가(검색 모달)
    const [pickOpen, setPickOpen] = useState(false);
    const [pickKey, setPickKey]   = useState('');
    const [pickList, setPickList] = useState([]);
    const [pickLoading, setPickLoading] = useState(false);

    // 코드 로드
    useEffect(()=>{
        let alive = true;
        (async ()=>{
            try{
                const [t, s] = await Promise.all([getCodes(CODE_TYPE), getCodes(CODE_SCOPE)]);
                if (!alive) return;
                setTypeCodes((t||[]).sort((a,b)=>(a.sortOrder??0)-(b.sortOrder??0)));
                setScopeCodes((s||[]).sort((a,b)=>(a.sortOrder??0)-(b.sortOrder??0)));
            }catch{ /* no-op */ }
        })();
        return ()=>{ alive=false; };
    },[]);

    const load = useCallback(async ()=>{
        setLoading(true);
        try{
            const res = await searchConsults({
                studentId: studentId || undefined,
                dateFrom: dateFrom || undefined,
                dateTo: dateTo || undefined,
                size: 100
            });
            const list = Array.isArray(res?.content)?res.content:(Array.isArray(res)?res:[]);
            list.sort((a,b)=> String(b.consultAt||'').localeCompare(String(a.consultAt||'')));
            setRows(list);
            setSelId(list[0]?.id ?? null);
        }catch{
            setRows([]); setSelId(null);
        }finally{ setLoading(false); }
    },[studentId, dateFrom, dateTo]);

    useEffect(()=>{ if (studentId) load(); },[studentId, dateFrom, dateTo, load]);

    const loadDetail = useCallback(async (id)=>{
        if (!id) { setDetail(null); setEdit(null); return; }
        try{
            const d = await getConsult(id);
            setDetail(d);
            setEdit({
                title: d.title || '',
                content: d.content || '',
                actionPlan: d.actionPlan || '',
                consultAt: d.consultAt?.slice(0,16)?.replace('T',' ') || '',
                consultType: d.consultType || 'CALL',              // COUNSELING_TYPE
                consultScope: d.consultScope || 'HOMEROOM_ONLY',   // COUNSELING_SCOPE
                useYn: d.useYn ? 1 : 1
            });
        }catch{
            setDetail(null); setEdit(null);
        }
    },[]);

    useEffect(()=>{ if (selId) loadDetail(selId); else { setDetail(null); setEdit(null); } },[selId, loadDetail]);

    const onSave = async ()=>{
        if (!selId || !edit) return;
        setSaving(true);
        try{
            await updateConsult(selId, edit);
            await safeOk('성공','저장되었습니다.');
            await loadDetail(selId);
            await load();
        }catch(e){
            safeError('오류', e?.response?.data?.message || '저장 실패');
        }finally{ setSaving(false); }
    };

    const onCreate = async ()=>{
        const sid = Number(studentId||0);
        if (!sid) return safeInfo('안내','학생 ID를 먼저 입력하세요.');
        if (!addForm.title?.trim()) return safeInfo('안내','제목을 입력하세요.');
        const consultAt = addForm.consultAt || new Date().toISOString().slice(0,16).replace('T',' ');
        try{
            const res = await createConsult({
                studentId: sid,
                title: addForm.title,
                content: addForm.content || '',
                consultAt,
                consultType: addForm.consultType || 'CALL',
                consultScope: addForm.consultScope || 'HOMEROOM_ONLY',
                useYn: 1
            });
            setModalNew(false); setAddForm({title:'',content:'',consultAt:'', consultType:'CALL', consultScope:'HOMEROOM_ONLY'});
            await safeOk('성공','등록되었습니다.');
            await load();
            if (res?.id) setSelId(res.id);
        }catch(e){
            safeError('오류', e?.response?.data?.message || '등록 실패');
        }
    };

    const searchGuardians = async ()=>{
        setPickLoading(true);
        try{
            const res = await listGuardians({ keyword: pickKey || undefined, size: 20 });
            const rows = Array.isArray(res?.content)?res.content:(Array.isArray(res)?res:[]);
            rows.sort((a,b)=>(a.name||'').localeCompare(b.name||'','ko',{sensitivity:'base'}));
            setPickList(rows);
        }catch{ setPickList([]); }
        finally{ setPickLoading(false); }
    };

    const onAddPresent = async (g)=>{
        if (!detail?.id) return;
        try{
            await addConsultGuardian(detail.id, {
                guardianId: g.id,
                relationCode: g.relationCode || 'LEGAL_GUARDIAN',
                nameSnapshot: g.name,
                phoneSnapshot: g.phone,
                presentYn: 1
            });
            await safeOk('성공','참석자 추가');
            await loadDetail(detail.id);
        }catch(e){
            safeError('오류', e?.response?.data?.message || '추가 실패');
        }
    };

    const onRemovePresent = async (cng)=>{
        const ok = await confirmDialog('확인','참석자를 삭제할까요?');
        if (!ok) return;
        try{
            await removeConsultGuardian(cng.id);
            await safeOk('성공','삭제 완료');
            await loadDetail(detail.id);
        }catch(e){
            safeError('오류', e?.response?.data?.message || '삭제 실패');
        }
    };

    return (
        <section className="aa-page academy-page consult-page">
            <div className="aa-container">
                <div className="aa-toolbar">
                    <h1 className="aa-title">상담 관리</h1>
                    <div className="aa-toolbar-right">
                        <input className="aa-input w-28" placeholder="학생 ID" value={studentId} onChange={e=>setStudentId(e.target.value.replace(/[^0-9]/g,''))}/>
                        <input className="aa-input" style={{width:160}} type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}/>
                        <input className="aa-input" style={{width:160}} type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}/>
                        <button className="aa-btn" onClick={load}>조회</button>
                        <button className="aa-btn aa-btn-primary" onClick={()=>setModalNew(true)}>상담 등록</button>
                    </div>
                </div>

                <div className="aa-split aa-split-4-6">
                    {/* 좌: 목록 */}
                    <div className="aa-card">
                        {loading ? <div>불러오는 중…</div> : (
                            <div className="aa-table-wrap consult-list-panel">
                                <table className="aa-table">
                                    <thead><tr><th>일시</th><th>제목</th><th>유형</th><th>가시성</th></tr></thead>
                                    <tbody>
                                    {rows.length===0 && <tr><td colSpan={4}>데이터 없음</td></tr>}
                                    {rows.map(r=>(
                                        <tr key={r.id} className={selId===r.id ? 'bg-slate-800' : ''} onClick={()=>setSelId(r.id)} style={{cursor:'pointer'}}>
                                            <td>{r.consultAt}</td>
                                            <td className="aa-ellipsis" title={r.title}>{r.title}</td>
                                            <td>{r.consultType}</td>
                                            <td>{r.consultScope || 'HOMEROOM_ONLY'}</td>
                                        </tr>
                                    ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    {/* 우: 상세/편집 */}
                    <div className="aa-card">
                        {!detail ? <div>좌측에서 상담을 선택하거나 상단에서 등록하세요.</div> : (
                            <div className="space-y-3">
                                <div className="flex justify-between">
                                    <div className="text-lg font-semibold">{detail.title}</div>
                                    <div className="aa-btn-group">
                                        <button className="aa-btn aa-btn-primary" disabled={saving} onClick={onSave}>{saving?'저장 중…':'저장'}</button>
                                        <button className="aa-btn" onClick={()=>loadDetail(detail.id)}>새로고침</button>
                                    </div>
                                </div>

                                <div className="aa-form-grid-2">
                                    <Field label="제목"><input className="aa-input" value={edit.title} onChange={e=>setEdit(f=>({...f,title:e.target.value}))}/></Field>
                                    <Field label="일시"><input className="aa-input" type="datetime-local"
                                                             value={edit.consultAt?.replace(' ','T') || ''} onChange={e=>setEdit(f=>({...f,consultAt:e.target.value}))}/></Field>
                                    <Field label="유형(COUNSELING_TYPE)">
                                        <select className="aa-select" value={edit.consultType} onChange={e=>setEdit(f=>({...f,consultType:e.target.value}))}>
                                            {typeCodes.map(x=>(<option key={x.code} value={x.code}>{x.name} ({x.code})</option>))}
                                        </select>
                                    </Field>
                                    <Field label="가시성(COUNSELING_SCOPE)">
                                        <select className="aa-select" value={edit.consultScope} onChange={e=>setEdit(f=>({...f,consultScope:e.target.value}))}>
                                            {scopeCodes.map(x=>(<option key={x.code} value={x.code}>{x.name} ({x.code})</option>))}
                                        </select>
                                    </Field>
                                </div>

                                <Field label="내용"><textarea className="aa-textarea" value={edit.content} onChange={e=>setEdit(f=>({...f,content:e.target.value}))}/></Field>
                                <Field label="후속 조치"><textarea className="aa-textarea" value={edit.actionPlan||''} onChange={e=>setEdit(f=>({...f,actionPlan:e.target.value}))}/></Field>

                                <div className="border-t border-slate-700 pt-3">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="text-base font-semibold">참석 보호자</div>
                                        <button className="aa-btn" onClick={()=>{ setPickOpen(true); setPickKey(''); setPickList([]); }}>추가</button>
                                    </div>
                                    <div className="aa-table-wrap">
                                        <table className="aa-table">
                                            <thead><tr><th>이름</th><th>관계</th><th>연락처</th><th>참석</th><th style={{width:80}}></th></tr></thead>
                                            <tbody>
                                            {(!detail.guardians || detail.guardians.length===0) && <tr><td colSpan={5}>없음</td></tr>}
                                            {(detail.guardians||[]).map(g=>(
                                                <tr key={g.id}><td>{g.nameSnapshot}</td><td>{g.relationCode}</td><td>{g.phoneSnapshot||'-'}</td><td>{g.presentYn? 'Y':'N'}</td>
                                                    <td><button className="aa-btn aa-btn-danger aa-btn-sm" onClick={()=>onRemovePresent(g)}>삭제</button></td></tr>
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

            {/* 상담 등록 모달 */}
            {modalNew && (
                <Modal title="상담 등록" onClose={()=>setModalNew(false)}>
                    <div className="space-y-3">
                        <div className="aa-field"><label>제목</label><input className="aa-input" value={addForm.title} onChange={e=>setAddForm(f=>({...f,title:e.target.value}))}/></div>
                        <div className="aa-field"><label>일시</label><input className="aa-input" type="datetime-local" value={addForm.consultAt} onChange={e=>setAddForm(f=>({...f,consultAt:e.target.value}))}/></div>
                        <div className="aa-field">
                            <label>유형(COUNSELING_TYPE)</label>
                            <select className="aa-select" value={addForm.consultType} onChange={e=>setAddForm(f=>({...f,consultType:e.target.value}))}>
                                {typeCodes.map(x=>(<option key={x.code} value={x.code}>{x.name} ({x.code})</option>))}
                            </select>
                        </div>
                        <div className="aa-field">
                            <label>가시성(COUNSELING_SCOPE)</label>
                            <select className="aa-select" value={addForm.consultScope} onChange={e=>setAddForm(f=>({...f,consultScope:e.target.value}))}>
                                {scopeCodes.map(x=>(<option key={x.code} value={x.code}>{x.name} ({x.code})</option>))}
                            </select>
                        </div>
                        <div className="aa-field"><label>내용</label><textarea className="aa-textarea" value={addForm.content} onChange={e=>setAddForm(f=>({...f,content:e.target.value}))}/></div>
                        <div className="flex justify-end gap-2">
                            <button className="aa-btn" onClick={()=>setModalNew(false)}>취소</button>
                            <button className="aa-btn aa-btn-primary" onClick={onCreate}>등록</button>
                        </div>
                    </div>
                </Modal>
            )}

            {/* 보호자 검색 모달 */}
            {pickOpen && (
                <Modal title="보호자 검색" onClose={()=>setPickOpen(false)}>
                    <div className="space-y-3">
                        <div className="aa-field"><label>검색어</label>
                            <div className="flex gap-2">
                                <input className="aa-input" value={pickKey} onChange={e=>setPickKey(e.target.value)} placeholder="이름/연락처/이메일"/>
                                <button className="aa-btn" onClick={searchGuardians} disabled={pickLoading}>{pickLoading?'검색…':'검색'}</button>
                            </div>
                        </div>
                        <div className="aa-table-wrap">
                            <table className="aa-table">
                                <thead><tr><th>이름</th><th>연락처</th><th>이메일</th><th style={{width:80}}></th></tr></thead>
                                <tbody>
                                {pickList.length===0 && <tr><td colSpan={4}>결과 없음</td></tr>}
                                {pickList.map(g=>(
                                    <tr key={g.id}>
                                        <td>{g.name}</td><td>{g.phone||'-'}</td><td>{g.email||'-'}</td>
                                        <td><button className="aa-btn aa-btn-primary aa-btn-sm" onClick={()=>onAddPresent(g)}>추가</button></td>
                                    </tr>
                                ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </Modal>
            )}
        </section>
    );
}

function Field({label, children}){ return <label className="block"><div className="text-sm mb-1 text-slate-300">{label}</div>{children}</label>; }