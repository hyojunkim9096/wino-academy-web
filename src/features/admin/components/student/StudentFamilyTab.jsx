// /src/features/admin/components/student/StudentFamilyTab.jsx
// ============================================================================
// StudentFamilyTab — 가족(보호자) 탭 전용(내부 로딩)
//  - 연결 목록 조회/해제
//  - 보호자 마스터 검색/연결 (guardianAdminApi)
//  - 관계코드 셀렉트는 부모가 내려준 familyRelCodes 사용
// ============================================================================

import React, { useEffect, useMemo, useState } from 'react';
import Swal from 'sweetalert2';

import {
    listStudentFamilies, addStudentFamily, removeStudentFamily,
} from '@/api/studentFamilyApi';

import { listFamiliesMaster } from '@/api/guardianAdminApi'; // ✅ 분리 파일에서 export

import Modal from '@/components/ui/Modal';
import { alertError, alertInfo, alertSuccess } from '@/ui/alert';

const safeInfo  = (t,m)=>Promise.resolve(alertInfo(t,m)).catch(()=>{});
const safeOk    = (t,m)=>Promise.resolve(alertSuccess(t,m)).catch(()=>{});
const safeError = (t,m)=>Promise.resolve(alertError(t,m)).catch(()=>{});

const themeColor = '#4f46e5';
const commonHooks = {
    willOpen: () => { document.body.classList.add('modal-open'); },
    didClose: () => { document.body.classList.remove('modal-open'); }
};

const sorted = (arr=[]) =>
    arr.slice().sort((a,b)=>(a.sortOrder??0)-(b.sortOrder??0) || String(a.name).localeCompare(b.name,'ko'));

export default function StudentFamilyTab({ studentId, familyRelCodes=[], onChanged }){
    const [familyLinks, setFamilyLinks] = useState([]);
    const [loading, setLoading] = useState(false);

    const [pickOpen, setPickOpen] = useState(false);
    const [pickKey, setPickKey]   = useState('');
    const [pickList, setPickList] = useState([]);
    const [pickLoading, setPickLoading] = useState(false);
    const [relSel, setRelSel] = useState('');

    const relOptions = useMemo(()=>sorted(familyRelCodes),[familyRelCodes]);

    const load = async ()=>{
        if(!studentId){ setFamilyLinks([]); return; }
        setLoading(true);
        try{
            const fl = await listStudentFamilies(studentId);
            setFamilyLinks(Array.isArray(fl)?fl:(fl?.content||[]));
        }catch{
            setFamilyLinks([]);
        }finally{
            setLoading(false);
        }
    };

    useEffect(()=>{ load(); },[studentId]);

    const searchFamilies = async ()=>{
        setPickLoading(true);
        try{
            const res = await listFamiliesMaster({ keyword: pickKey || undefined, size: 20 });
            const rows = Array.isArray(res?.content)?res.content:(Array.isArray(res)?res:[]);
            rows.sort((a,b)=>(a.name||'').localeCompare(b.name||'','ko',{sensitivity:'base'}));
            setPickList(rows);
        }catch{ setPickList([]); }finally{ setPickLoading(false); }
    };

    const onLinkFamily = async (family)=>{
        if (!studentId || !family?.id) return;
        if (!relSel) return safeInfo('안내','가족 관계 코드를 선택하세요.');
        try{
            await addStudentFamily(studentId, {
                guardianId: family.id,
                relationCode: relSel,
                primary: true,
                legalGuardian: ['FATHER','MOTHER','LEGAL_GUARDIAN'].includes(relSel),
                receiveNotice: true,
                receiveBilling: true
            });
            await safeOk('성공','가족 연결됨');
            setPickOpen(false); setPickList([]); setPickKey(''); setRelSel('');
            await load();
            onChanged?.();
        }catch(e){
            safeError('오류', e?.response?.data?.message || '가족 연결 실패');
        }
    };

    const onUnlinkFamily = async (link)=>{
        if (!studentId || !link?.id) return;
        const ok = await Swal.fire({
            title:'확인', text:'해당 가족 연결을 해제할까요?',
            showCancelButton:true, confirmButtonText:'확인', cancelButtonText:'취소',
            confirmButtonColor:themeColor, reverseButtons:true, ...commonHooks
        }).then(r=>r.isConfirmed);
        if(!ok) return;
        try{
            await removeStudentFamily(studentId, link.id);
            await safeOk('성공','연결이 해제되었습니다.');
            await load();
            onChanged?.();
        }catch(e){
            safeError('오류', e?.response?.data?.message || '연결 해제 실패');
        }
    };

    return (
        <div className="space-y-2">
            <div className="flex gap-2">
                <button className="aa-btn aa-btn-primary" onClick={()=>{ setPickOpen(true); setPickKey(''); setPickList([]); }}>가족 연결</button>
            </div>
            <div className="aa-table-wrap">
                <table className="aa-table">
                    <thead>
                    <tr>
                        <th style={{width:110}}>관계</th>
                        <th>이름</th>
                        <th>연락처</th>
                        <th>이메일</th>
                        <th style={{width:110}}>수신</th>
                        <th style={{width:100}}></th>
                    </tr>
                    </thead>
                    <tbody>
                    {loading && <tr><td colSpan={6}>불러오는 중…</td></tr>}
                    {!loading && familyLinks.length===0 && (
                        <tr><td colSpan={6}>연결된 가족이 없습니다.</td></tr>
                    )}
                    {familyLinks.map(g=>(
                        <tr key={g.id}>
                            <td>{g.relationCode}</td>
                            <td>{g.guardianName || '-'}</td>
                            <td>{g.guardianPhone || '-'}</td>
                            <td>{g.guardianEmail || '-'}</td>
                            <td className="text-sm">
                                {g.receiveNotice ? <span className="aa-badge aa-badge--ok">알림</span> : <span className="aa-badge aa-badge--muted">-</span>}
                            </td>
                            <td>
                                <div className="aa-actions">
                                    <button className="aa-btn aa-btn-danger aa-btn-sm" onClick={()=>onUnlinkFamily(g)}>해제</button>
                                </div>
                            </td>
                        </tr>
                    ))}
                    </tbody>
                </table>
            </div>

            {/* 가족 검색/연결 모달 */}
            {pickOpen && (
                <Modal title="가족 검색/연결" onClose={()=>setPickOpen(false)}>
                    <div className="space-y-3">
                        <div className="aa-field">
                            <label>관계(필수)</label>
                            <select className="aa-select" value={relSel} onChange={e=>setRelSel(e.target.value)}>
                                <option value="">선택</option>
                                {relOptions.map(r=>(<option key={r.code} value={r.code}>{r.name} ({r.code})</option>))}
                            </select>
                        </div>
                        <div className="aa-field">
                            <label>검색어</label>
                            <div className="flex gap-2">
                                <input className="aa-input" placeholder="이름/연락처/이메일" value={pickKey} onChange={e=>setPickKey(e.target.value)} />
                                <button className="aa-btn" onClick={searchFamilies} disabled={pickLoading}>{pickLoading?'검색…':'검색'}</button>
                            </div>
                        </div>
                        <div className="aa-table-wrap">
                            <table className="aa-table">
                                <thead>
                                <tr>
                                    <th>이름</th>
                                    <th>연락처</th>
                                    <th>이메일</th>
                                    <th style={{width:80}}></th>
                                </tr>
                                </thead>
                                <tbody>
                                {pickList.length===0 && (
                                    <tr><td colSpan={4}>검색 결과가 없습니다.</td></tr>
                                )}
                                {pickList.map(f=>(
                                    <tr key={f.id}>
                                        <td>{f.name}</td>
                                        <td>{f.phone || '-'}</td>
                                        <td>{f.email || '-'}</td>
                                        <td><button className="aa-btn aa-btn-primary aa-btn-sm" onClick={()=>onLinkFamily(f)}>연결</button></td>
                                    </tr>
                                ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}