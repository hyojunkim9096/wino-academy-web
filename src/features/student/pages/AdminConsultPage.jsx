// src/features/student/pages/AdminConsultPage.jsx
// ============================================================================
// 상담 관리 페이지 (v4.1 - 필터/UI 개선)
// ----------------------------------------------------------------------------
// ✅ [리팩토링]
// - 기능: '상담 등록' 기능 제거 (StudentAdminPage에서만 수행)
// - 목적: "조회", "필터링", "승인" 전용 관리 페이지
// - 레이아웃: 좌/우 분할 제거 → "필터 + 전체 목록(테이블)" 구조로 단순화
// - 권한:
//   - 백엔드 API(searchConsults)가 로그인한 사용자(관리자/팀장/팀원)에 맞춰
//     자동으로 필터링된 목록을 반환함.
// - 워크플로우:
//   1. 목록에서 [보기] 클릭
//   2. 상세 모달(ConsultViewEditModal) 팝업
//   3. 모달 내부에서 '승인' 버튼 노출 (권한 확인: me.id !== writerId)
// ============================================================================

import React, { useCallback, useEffect, useMemo, useState } from 'react';
// ✅ [리팩토링] API 변경: 'createConsult' 제거, 'approveConsult' 의존성 추가
import {
    searchConsults,
    getConsult,
    // createConsult, //
    updateConsult,
    addConsultGuardian,
    removeConsultGuardian,
    approveConsult // ✅ [신규] 승인 API
} from '@/features/student/api/consultApi.js';
import { listGuardians } from '@/features/member/api/guardianApi.js'; //

// ✅ [리팩토링] 공통코드/인증 정보는 Context에서 로드
import { useCommonCodes } from '@/common/components/contexts/CommonCodeContext.jsx';
import { useAuth } from '@/common/components/contexts/AuthContext.jsx'; // ✅ me 정보 (승인 버튼 제어용)

import { alertError, alertInfo, alertSuccess, confirmDialog } from '@/common/ui/alert.js';
import Modal from '@/common/components/ui/Modal.jsx';

// ✅ [오류 수정] 분리된 모달 컴포넌트 import
import ConsultViewEditModal from '@/features/student/components/consult/ConsultViewEditModal.jsx';

import '@/features/system/styles/admin-system.css';
import '@/features/admin/styles/admin-shared.css';
import '@/features/student/styles/admin-consult.css';

// ---- 알림 래퍼 ----------------------------------------------------
const safeInfo  = (t,m)=>Promise.resolve(alertInfo(t,m)).catch(()=>{});
const safeOk    = (t,m)=>Promise.resolve(alertSuccess(t,m)).catch(()=>{});
const safeError = (t,m)=>Promise.resolve(alertError(t,m)).catch(()=>{});

// ---- 공통코드 그룹 키 ---------------------------------------------------------
// ✅ [리팩토링] 상담 방식(METHOD) 추가
const GROUP_METHOD = 'COUNSELING_METHOD';
const GROUP_TYPE   = 'COUNSELING_CATEGORY'; // (DB 데이터 기준 COUNSELING_TYPE -> COUNSELING_CATEGORY 로 변경)
const GROUP_SCOPE  = 'COUNSELING_SCOPE';

// ---- 폴백 라벨 --------------------------------------------------------------
const FALLBACK_METHOD_LABELS = { CALL:'전화', VISIT:'방문', OFFICE:'면담', APP_CHAT:'앱채팅' };
const FALLBACK_TYPE_LABELS   = { REGULAR:'정기상담', EMERGENCY:'긴급상담' };
const FALLBACK_SCOPE_LABELS  = { ALL:'전체', HOMEROOM_ONLY:'담임', TEACHERS:'교사', ADMIN:'관리자' };

// ============================================================================
// 날짜/시간 유틸
// ============================================================================
// (날짜/시간 유틸 함수들은 이전과 동일하게 유지)
function prettyDateTime(s) {
    if (!s) return '-';
    const t = String(s).replace('T',' ').replace('Z','');
    return t.includes('.') ? t.split('.')[0] : t;
}

// ============================================================================
// 코드 → 라벨 매핑 유틸
// ============================================================================
const up = (s)=> String(s ?? '').trim().toUpperCase();
function buildLabelMap(items, fallbackMap) {
    const map = { ...(fallbackMap || {}) };
    (items || []).forEach(it => {
        const code = up(it?.code);
        if (!code) return;
        const name = it?.name ?? it?.code;
        map[code] = name;
        const tail = code.split(/[:._-]/).pop();
        if (tail) map[tail] = name;
    });
    return map;
}
function labelOf(map, code) {
    const K = up(code);
    if (!K) return '-';
    if (map[K]) return map[K];
    const tail = K.split(/[:._-]/).pop();
    return map[tail] || code || '-';
}

function toOptions(items, fallbackMap) {
    if (items && items.length > 0) {
        return items
            .filter(x => (x.enabled ?? true)) //
            .slice()
            .sort((a,b)=>(a.sortOrder??0)-(b.sortOrder??0) || String(a.code).localeCompare(String(b.code)))
            .map(x => ({ code: String(x.code).toUpperCase(), name: x.name || x.code }));
    }
    return Object.entries(fallbackMap).map(([code, name])=>({ code, name }));
}

// ============================================================================
// (제거) 상세/수정 모달 ConsultViewEditModal
// ✅ 별도 파일로 분리
// ============================================================================

// ============================================================================
// (제거) 필드 컴포넌트 Field, RO
// ✅ 별도 파일로 분리
// ============================================================================

// ============================================================================
// (제거) 생성 모달 CreateConsultModal
// ✅ 기능 제거
// ============================================================================


// ============================================================================
// 메인 페이지 컴포넌트
// ============================================================================
export default function AdminConsultPage(){
    // ✅ [수정] ID 필터를 문자열 키워드 필터로 변경
    const [studentFilter, setStudentFilter] = useState('');
    const [writerFilter, setWriterFilter] = useState('');
    const [dateFrom, setDateFrom]   = useState('');
    const [dateTo, setDateTo]       = useState('');

    const [rows, setRows]           = useState([]);
    const [loading, setLoading]     = useState(false);
    const [saving, setSaving]       = useState(false); // ✅ 저장/승인 공용 saving

    // ✅ [리팩토링] 현재 로그인 사용자 정보 (승인 버튼 제어용)
    const { me, authLoading } = useAuth(); //

    // ✅ [리팩토링] 공통코드 (Context 사용)
    const { codes: methodCodes, codeLoading: methodLoading } = useCommonCodes(GROUP_METHOD);
    const { codes: typeCodes,   codeLoading: typeLoading }   = useCommonCodes(GROUP_TYPE);
    const { codes: scopeCodes,  codeLoading: scopeLoading }  = useCommonCodes(GROUP_SCOPE);

    // ⚠️ [제거] 생성 모달 관련 상태 제거

    // 보호자 참석자 추가(검색 모달)
    const [pickOpen, setPickOpen] = useState(false);
    const [pickKey, setPickKey]   = useState('');
    const [pickList, setPickList] = useState([]);
    const [pickLoading, setPickLoading] = useState(false);

    // ✅ [수정] 상세 모달 전용 상태
    const [viewRow, setViewRow] = useState(null); //
    const [viewOpen, setViewOpen] = useState(false);

    // (로딩 플래그는 공통코드 로딩도 포함)
    const isCodeLoading = methodLoading || typeLoading || scopeLoading;

    // 라벨 맵
    const typeLabelsAll = useMemo(
        () => buildLabelMap(typeCodes, FALLBACK_TYPE_LABELS),
        [typeCodes]
    );
    // (옵션)
    const methodOptions = useMemo(
        () => toOptions(methodCodes, FALLBACK_METHOD_LABELS),
        [methodCodes]
    );
    const typeOptions   = useMemo(
        () => toOptions(typeCodes, FALLBACK_TYPE_LABELS), //
        [typeCodes]
    );
    const scopeOptions  = useMemo(
        () => toOptions(scopeCodes, FALLBACK_SCOPE_LABELS),
        [scopeCodes]
    );

    // 목록 로드
    const load = useCallback(async ()=>{
        setLoading(true);
        try{
            // ✅ [수정] 검색어가 숫자이면 ID로, 아니면 Name으로 API 호출
            const studentKw = (studentFilter || '').trim();
            const writerKw = (writerFilter || '').trim();

            const isStudentId = /^\d+$/.test(studentKw);
            const isWriterId = /^\d+$/.test(writerKw);

            const params = {
                studentId: isStudentId ? Number(studentKw) : undefined,
                studentName: !isStudentId ? (studentKw || undefined) : undefined,
                writerId: isWriterId ? Number(writerKw) : undefined,
                writerName: !isWriterId ? (writerKw || undefined) : undefined,
                from: dateFrom ? `${dateFrom}T00:00:00` : undefined,
                to: dateTo ? `${dateTo}T23:59:59` : undefined,
                size: 100
            };

            const res = await searchConsults(params);
            const list = Array.isArray(res?.content)?res.content:(Array.isArray(res)?res:[]);
            setRows(list);
        }catch(e){
            setRows([]);
        }finally{ setLoading(false); }
    },[studentFilter, writerFilter, dateFrom, dateTo]); // ✅

    useEffect(()=>{
        load(); //
    },[load]);

    // ⚠️ [제거] selId 의존 상세 로드 제거 (모달에서 필요 시 로드)

    // 저장
    const onSave = async (payload, afterSuccess) => {
        if (!viewRow?.id) return;
        setSaving(true);
        try{
            await updateConsult(viewRow.id, payload);
            await safeOk('성공','저장되었습니다.');
            afterSuccess?.(); //
            setViewOpen(false); //
            setViewRow(null);
            await load(); //
        }catch(e){
            safeError('오류', e?.response?.data?.message || '저장 실패');
        }finally{ setSaving(false); }
    };

    // ⚠️ [제거] onCreate 함수 제거 (이 페이지에서 등록 안 함)

    // ✅ [신규] 승인
    const onApprove = async () => {
        if (!viewRow || !me) return;
        if (viewRow.writerId === me.id) {
            return safeInfo('안내', '본인이 작성한 상담은 승인할 수 없습니다.');
        }
        const ok = await confirmDialog('승인 확인', '이 상담 기록을 "팀장 승인" 처리합니다.', { confirmText: '승인' });
        if (!ok) return;
        setSaving(true);
        try {
            await approveConsult(viewRow.id);
            await safeOk('성공', '승인 처리되었습니다.');
            setViewOpen(false);
            setViewRow(null);
            await load();
        } catch(e) {
            safeError('오류', e?.response?.data?.message || '승인 실패');
        } finally {
            setSaving(false);
        }
    };

    // ( )
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
        if (!viewRow?.id) return;
        try{
            await addConsultGuardian(viewRow.id, {
                guardianId: g.id,
                relationCode: g.relationCode || 'LEGAL_GUARDIAN',
                nameSnapshot: g.name,
                phoneSnapshot: g.phone,
                presentYn: true
            });
            await safeOk('성공','참석자 추가');
            const d = await getConsult(viewRow.id);
            setViewRow(d);
        }catch(e){
            safeError('오류', e?.response?.data?.message || '추가 실패');
        }
    };

    const onRemovePresent = async (cng)=>{
        const ok = await confirmDialog('확인','참석자를 삭제할까요?', { confirmText: '삭제' });
        if (!ok) return;
        try{
            await removeConsultGuardian(cng.id);
            await safeOk('성공','삭제 완료');
            const d = await getConsult(viewRow.id);
            setViewRow(d);
        }catch(e){
            safeError('오류', e?.response?.data?.message || '삭제 실패');
        }
    };

    // ✅ [신규] 필터 초기화 함수
    const onResetFilters = () => {
        setStudentFilter('');
        setWriterFilter('');
        setDateFrom('');
        setDateTo('');
        // (load()는 useEffect에 의해 자동 호출됩니다)
    };

    return (
        <section className="aa-page academy-page consult-page">
            <div className="aa-container">
                <div className="aa-toolbar">
                    <h1 className="aa-title">상담 관리 (조회/승인)</h1>
                    <div className="aa-toolbar-right">
                        {/* ✅ [리팩토링] 필터 변경 (ID -> 키워드) */}
                        <input className="aa-input w-28" placeholder="학생명/ID" value={studentFilter} onChange={e=>setStudentFilter(e.target.value)}/>
                        <input className="aa-input w-28" placeholder="작성자명/ID" value={writerFilter} onChange={e=>setWriterFilter(e.target.value)}/>
                        <input
                            className="aa-input"
                            style={{width:160}}
                            type="date"
                            value={dateFrom}
                            onChange={e=>setDateFrom(e.target.value)}
                        />
                        <input
                            className="aa-input"
                            style={{width:160}}
                            type="date"
                            value={dateTo}
                            onChange={e=>setDateTo(e.target.value)}
                            min={dateFrom || undefined} // ✅ [수정] 시작일 이전 날짜 선택 방지
                        />
                        <button className="aa-btn" onClick={load}>조회</button>
                        {/* ✅ [신규] 필터 초기화 버튼 */}
                        <button className="aa-btn" onClick={onResetFilters}>초기화</button>
                    </div>
                </div>

                {/* ✅ [리팩토링] aa-split  →  */}
                <div className="aa-card" style={{ marginTop: '12px' }}>
                    {(loading || isCodeLoading || authLoading) ? <div>불러오는 중…</div> : (
                        <div className="aa-table-wrap consult-list-panel">
                            <table className="aa-table">
                                <thead>
                                <tr>
                                    {/* ✅ [수정] 컬럼 폭 조절 (일시 180px) */}
                                    <th style={{width:'180px'}}>일시</th>
                                    <th style={{width:'110px'}}>학생</th>
                                    <th style={{width:'130px'}}>반 (담임)</th>
                                    <th style={{width:'110px'}}>작성자</th>
                                    <th>제목</th>
                                    <th style={{width:'100px'}}>유형</th>
                                    <th style={{width:'80px'}}>승인</th>
                                    <th style={{width:'80px'}}>동작</th>
                                </tr>
                                </thead>
                                <tbody>
                                {rows.length===0 && <tr><td colSpan={8}>데이터 없음</td></tr>}
                                {rows.map(r=>(
                                    <tr key={r.id}>
                                        {/* ✅ [수정] 날짜 셀: 줄바꿈 방지 */}
                                        <td style={{ whiteSpace: 'nowrap' }}>{prettyDateTime(r.consultAt)}</td>
                                        <td>{r.studentName || `(ID: ${r.studentId})`}</td>
                                        <td>{r.className || '-'} ({r.homeroomTeacherName || '-'})</td>
                                        <td>{r.writerName || `(ID: ${r.writerId})`}</td>

                                        <td className="aa-ellipsis" title={r.title}>{r.title}</td>
                                        <td>{labelOf(typeLabelsAll, r.consultType)}</td>
                                        <td>
                                            {r.homeroomOk ?
                                                <span className="aa-badge aa-badge--ok">승인</span> :
                                                <span className="aa-badge aa-badge--muted">미승인</span>
                                            }
                                        </td>
                                        <td>
                                            <button
                                                className="aa-btn aa-btn-primary aa-btn-sm"
                                                onClick={()=>{
                                                    setViewRow(r);
                                                    setViewOpen(true);
                                                }}
                                            >
                                                보기
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {/* ⚠️ [제거] 상담 등록 모달 (CreateConsultModal) 제거 */}

            {/* ✅ [수정] 상세/수정 모달 (ConsultViewEditModal) */}
            {viewOpen && (
                <ConsultViewEditModal
                    open={viewOpen}
                    onClose={()=>{ setViewOpen(false); setViewRow(null); }}
                    row={viewRow}
                    methodOptions={methodOptions}
                    typeOptions={typeOptions}
                    scopeOptions={scopeOptions}
                    onSave={(payload, after)=> onSave(payload, after)}
                    currentUser={me}
                    isApproving={saving}
                    isSaving={saving}
                    onApprove={onApprove}
                    onAddGuardian={() => {
                        setPickOpen(true);
                        setPickKey('');
                        setPickList([]);
                    }}
                    onRemoveGuardian={onRemovePresent}
                />
            )}

            {/* ✅ [수정] 보호자 검색 모달 (상세 모달이 열려있을 때만 렌더링) */}
            {viewOpen && pickOpen && (
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