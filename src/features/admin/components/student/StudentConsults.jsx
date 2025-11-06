// src/features/admin/components/student/StudentConsults.jsx
// ============================================================================
// 학생 상담 탭 컴포넌트 (v3.2 - 2025-11-03)
// ----------------------------------------------------------------------------
// ✅ 이번 변경 요약
//  1) 목록 테이블의 "방식 / 유형" 옆에 "팀장 승인" 배지 추가
//     - row.homeroomOk (boolean) 값을 사용하여 승인/미승인 표기
//     - 컬럼 헤더/라벨: "팀장 승인" (요청에 따라 명칭 통일)
//  2) 생성/상세 모달의 "담임 승인" → "팀장 승인"으로 라벨 변경
//     - UI는 표시하되 항상 disabled/readOnly (팀장 전용 화면에서만 승인 변경)
//  3) (유지) "상담 등록" 모달은 열릴 때마다 폼 초기화
//     - CreateConsultModal: open 시 fresh()로 reset
// ----------------------------------------------------------------------------
// 기타 동작
//  - 날짜/시간: 'YYYY-MM-DDTHH:mm:ss' (초까지, Z 없음)로 서버 전송
//  - consultType 은 DB 제약(REGULAR|EMERGENCY)으로 클램프
//  - TYPE 그룹은 COUNSELING_CATEGORY 를 최우선 후보로 조회
//  - 목록 정렬: consultAt desc, id desc
//  - 알림: SweetAlert2 래퍼(alertInfo/alertSuccess/alertError)
// ============================================================================

import React, { useEffect, useMemo, useState } from 'react';

// 상담 전용 API
import { listStudentConsults, createConsult, updateConsult } from '@/api/studentConsultApi';

// 공통코드 API(단일 그룹 조회)
import { getCodes } from '@/api/commonCodeAdminApi';

// 알림 (SweetAlert2 래퍼)
import { alertError, alertInfo, alertSuccess } from '@/ui/alert';

// 공용 모달
import Modal from '@/components/ui/Modal';

// ---- 공용 알림 safe 래퍼 ----------------------------------------------------
const safeInfo  = (t,m)=>Promise.resolve(alertInfo(t,m)).catch(()=>{});
const safeOk    = (t,m)=>Promise.resolve(alertSuccess(t,m)).catch(()=>{});
const safeError = (t,m)=>Promise.resolve(alertError(t,m)).catch(()=>{});

// ---- 그룹 코드 후보 ---------------------------------------------------------
const GROUP_CANDIDATES = {
    METHOD: ['COUNSELING_METHOD', 'CONSULT_METHOD', 'CONSULTING_METHOD'],
    TYPE:   ['COUNSELING_CATEGORY', 'COUNSELING_TYPE', 'CONSULT_TYPE', 'CONSULTING_TYPE'],
    SCOPE:  ['COUNSELING_SCOPE', 'CONSULT_SCOPE', 'CONSULTING_SCOPE', 'VISIBILITY_ROLE'],
};

// ---- 폴백 라벨 --------------------------------------------------------------
const FALLBACK_METHOD_LABELS = { CALL:'전화', VISIT:'방문', OFFICE:'면담', APP_CHAT:'앱채팅' };
const FALLBACK_TYPE_LABELS   = { REGULAR:'정기상담', EMERGENCY:'긴급상담' };
const FALLBACK_SCOPE_LABELS  = { ALL:'전체', HOMEROOM_ONLY:'담임', TEACHERS:'교사', ADMIN:'관리자' };

// ---- DB 체크 제약(consult_type) 허용셋 -------------------------------------
const ALLOWED_TYPES = new Set(['REGULAR', 'EMERGENCY']);

// ============================================================================
// 날짜/시간 유틸
// ============================================================================
function nowLocalIso() {
    const d = new Date();
    const p = (n)=> String(n).padStart(2,'0');
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
function nowLocalInputValue() {
    const d = new Date();
    const p = (n)=> String(n).padStart(2,'0');
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
/** datetime-local 값 → '...:ss' 보장 (Z 제거) */
function ensureLocalIsoSeconds(v) {
    const s = String(v||'').trim();
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) return `${s}:00`;
    return s.replace('Z',''); // 로컬 시각 전송 목적
}
/** ISO → input[type=datetime-local] 값(분까지) */
function isoToInputValue(s) {
    if (!s) return '';
    let t = String(s).replace('Z','');
    if (t.includes('.')) t = t.split('.')[0];
    return t.slice(0,16); // YYYY-MM-DDTHH:mm
}
/** 표시용 */
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

// ============================================================================
// 공통코드 로딩 헬퍼
// ============================================================================
async function loadFirstNonEmptyGroup(candidates) {
    for (const gc of candidates) {
        try {
            const list = await getCodes(gc);
            if (Array.isArray(list) && list.length > 0) {
                return { groupCode: gc, items: list };
            }
        } catch { /* 다음 후보 시도 */ }
    }
    return { groupCode: null, items: [] };
}
function toOptions(items, fallbackMap) {
    if (items && items.length > 0) {
        return items
            .filter(x => (x.enabled ?? true))
            .slice()
            .sort((a,b)=>(a.sortOrder??0)-(b.sortOrder??0) || String(a.code).localeCompare(String(b.code)))
            .map(x => ({ code: String(x.code).toUpperCase(), name: x.name || x.code }));
    }
    return Object.entries(fallbackMap).map(([code, name])=>({ code, name }));
}

// ============================================================================
// 생성 모달 (팀장 승인: 표시하되 항상 비활성)
//  - open 될 때마다 fresh()로 완전 초기화
//  - 승인 체크는 UI 표시만, disabled + readOnly (항상 false로 생성)
// ============================================================================
function CreateConsultModal({ open, onClose, onSubmit, methodOptions, typeOptions, scopeOptions }) {
    const fresh = () => ({
        title: '',
        content: '',
        consultMethod: methodOptions?.[0]?.code || 'CALL',
        consultType:   typeOptions?.[0]?.code   || 'REGULAR',
        visibilityRole: scopeOptions?.[0]?.code || 'ALL',
        consultAt: nowLocalInputValue(),
        nextFollowupAt: '',
        homeroomOk: false, // 생성 기본값: 미승인
        actionPlan: ''
    });
    const [form, setForm] = useState(fresh);

    // 모달이 열릴 때마다 폼 초기화
    useEffect(()=>{
        if (open) setForm(fresh());
        // eslint-disable-next-line react-hooks/exhaustive-deps
    },[open]);

    // 옵션이 늦게 로드되면 빈 값일 때만 보정
    useEffect(()=>{
        if (!open) return;
        setForm(f=>({
            ...f,
            consultMethod: f.consultMethod || methodOptions?.[0]?.code || 'CALL',
            consultType:   f.consultType   || typeOptions?.[0]?.code   || 'REGULAR',
            visibilityRole: f.visibilityRole || scopeOptions?.[0]?.code || 'ALL',
            consultAt: f.consultAt || nowLocalInputValue(),
        }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    },[methodOptions?.length, typeOptions?.length, scopeOptions?.length]);

    if (!open) return null;

    return (
        <Modal title="상담 등록" onClose={onClose} size="2xl">
            <div className="space-y-4">
                {/* 제목/일시 */}
                <div className="grid md:grid-cols-2 gap-3">
                    <label className="block">
                        <div className="text-sm mb-1">제목 *</div>
                        <input
                            className="aa-input w-full"
                            value={form.title}
                            onChange={e=>setForm(f=>({...f, title:e.target.value}))}
                            placeholder="예: 1주차 전화상담"
                        />
                    </label>
                    <label className="block">
                        <div className="text-sm mb-1">상담 일시 *</div>
                        <input
                            type="datetime-local"
                            className="aa-input w-full"
                            value={form.consultAt}
                            onChange={e=>setForm(f=>({...f, consultAt:e.target.value}))}
                        />
                        <div className="text-xs text-slate-400 mt-1">타임존/‘Z’ 없이 전송됩니다.</div>
                    </label>
                </div>

                {/* 방식/유형/가시성 */}
                <div className="grid md:grid-cols-3 gap-3">
                    <label className="block">
                        <div className="text-sm mb-1">상담 방식 *</div>
                        <select
                            className="aa-select w-full"
                            value={form.consultMethod}
                            onChange={e=>setForm(f=>({...f, consultMethod:e.target.value}))}
                        >
                            {methodOptions.map(o=>(
                                <option key={o.code} value={o.code}>{o.name} ({o.code})</option>
                            ))}
                        </select>
                    </label>
                    <label className="block">
                        <div className="text-sm mb-1">상담 유형 *</div>
                        <select
                            className="aa-select w-full"
                            value={form.consultType}
                            onChange={e=>setForm(f=>({...f, consultType:e.target.value}))}
                        >
                            {typeOptions.map(o=>(
                                <option key={o.code} value={o.code}>{o.name} ({o.code})</option>
                            ))}
                        </select>
                        <div className="text-xs text-slate-400 mt-1">
                            DB 제약과 불일치 시 REGULAR/EMERGENCY로 자동 보정됩니다.
                        </div>
                    </label>
                    <label className="block">
                        <div className="text-sm mb-1">가시성 *</div>
                        <select
                            className="aa-select w-full"
                            value={form.visibilityRole}
                            onChange={e=>setForm(f=>({...f, visibilityRole:e.target.value}))}
                        >
                            {scopeOptions.map(o=>(
                                <option key={o.code} value={o.code}>{o.name} ({o.code})</option>
                            ))}
                        </select>
                    </label>
                </div>

                {/* 내용/액션플랜 */}
                <div className="grid md:grid-cols-2 gap-3">
                    <label className="block">
                        <div className="text-sm mb-1">상담 내용 *</div>
                        <textarea
                            className="aa-textarea w-full"
                            rows={6}
                            value={form.content}
                            onChange={e=>setForm(f=>({...f, content:e.target.value}))}
                            placeholder="상담 주요 내용과 논의 사항을 입력하세요."
                        />
                    </label>
                    <label className="block">
                        <div className="text-sm mb-1">액션 플랜(선택)</div>
                        <textarea
                            className="aa-textarea w-full"
                            rows={6}
                            value={form.actionPlan}
                            onChange={e=>setForm(f=>({...f, actionPlan:e.target.value}))}
                            placeholder="추후 실행 계획(과제, 연락 예정, 지도 포인트 등)"
                        />
                    </label>
                </div>

                {/* 후속일정 / 팀장 승인(표시하지만 비활성) */}
                <div className="grid md:grid-cols-2 gap-3">
                    <label className="block">
                        <div className="text-sm mb-1">다음 후속 예정(선택)</div>
                        <input
                            type="datetime-local"
                            className="aa-input w-full"
                            value={form.nextFollowupAt}
                            onChange={e=>setForm(f=>({...f, nextFollowupAt:e.target.value}))}
                        />
                    </label>
                    <label className="block">
                        <div className="text-sm mb-1">팀장 승인</div>
                        <label
                            className="inline-flex items-center gap-2 px-3 py-2 rounded border border-slate-700 bg-slate-800"
                            title="승인은 팀장 전용 '상담 관리'에서 처리합니다."
                        >
                            {/* 표시하되 비활성: onChange 없음, disabled + readOnly */}
                            <input type="checkbox" checked={!!form.homeroomOk} disabled readOnly />
                            <span className="text-sm">승인됨</span>
                        </label>
                        <div className="text-xs text-slate-400 mt-1">승인 변경은 상담 관리 화면에서만 가능</div>
                    </label>
                </div>

                {/* 액션 */}
                <div className="flex justify-end gap-2 pt-2">
                    <button className="aa-btn" onClick={onClose}>취소</button>
                    <button
                        className="aa-btn aa-btn-primary"
                        onClick={()=>{
                            const title = (form.title||'').trim();
                            const content = (form.content||'').trim();
                            if (!title)   return safeInfo('안내','제목을 입력하세요.');
                            if (!content) return safeInfo('안내','상담 내용을 입력하세요.');
                            onSubmit({
                                ...form,
                                consultAt: ensureLocalIsoSeconds(form.consultAt),
                                nextFollowupAt: ensureLocalIsoSeconds(form.nextFollowupAt) || null,
                                homeroomOk: false, // 생성 시 항상 미승인
                            });
                        }}
                    >등록</button>
                </div>
            </div>
        </Modal>
    );
}

// ============================================================================
// 상세 모달 (팀장 승인: 항상 비활성)
//  - editMode 여도 승인 체크박스는 disabled/readOnly
//  - 저장 시 homeroomOk 는 원본(row.homeroomOk) 그대로 서버로 전달 (변경 불가)
// ============================================================================
function ConsultViewEditModal({
                                  open, onClose, row,
                                  methodOptions, typeOptions, scopeOptions,
                                  onSave
                              }) {
    const [editMode, setEditMode] = useState(false);
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
    const disabled = !editMode; // 편집모드 토글(승인은 편집모드여도 비활성)

    return (
        <Modal title="상담 상세" onClose={onClose} size="2xl">
            <div className="space-y-4">
                {/* 제목/일시 */}
                <div className="grid md:grid-cols-2 gap-3">
                    <label className="block">
                        <div className="text-sm mb-1">제목</div>
                        <input
                            className="aa-input w-full"
                            value={form.title}
                            onChange={e=>setForm(f=>({...f, title:e.target.value}))}
                            readOnly={disabled}
                        />
                    </label>
                    <label className="block">
                        <div className="text-sm mb-1">상담 일시</div>
                        <input
                            type="datetime-local"
                            className="aa-input w-full"
                            value={form.consultAt}
                            onChange={e=>setForm(f=>({...f, consultAt:e.target.value}))}
                            readOnly={disabled}
                            disabled={disabled}
                        />
                    </label>
                </div>

                {/* 방식/유형/가시성 */}
                <div className="grid md:grid-cols-3 gap-3">
                    <label className="block">
                        <div className="text-sm mb-1">상담 방식</div>
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
                    </label>
                    <label className="block">
                        <div className="text-sm mb-1">상담 유형</div>
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
                    </label>
                    <label className="block">
                        <div className="text-sm mb-1">가시성</div>
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
                    </label>
                </div>

                {/* 내용/액션플랜 */}
                <div className="grid md:grid-cols-2 gap-3">
                    <label className="block">
                        <div className="text-sm mb-1">상담 내용</div>
                        <textarea
                            className="aa-textarea w-full"
                            rows={6}
                            value={form.content}
                            onChange={e=>setForm(f=>({...f, content:e.target.value}))}
                            readOnly={disabled}
                        />
                    </label>
                    <label className="block">
                        <div className="text-sm mb-1">액션 플랜</div>
                        <textarea
                            className="aa-textarea w-full"
                            rows={6}
                            value={form.actionPlan}
                            onChange={e=>setForm(f=>({...f, actionPlan:e.target.value}))}
                            readOnly={disabled}
                        />
                    </label>
                </div>

                {/* 후속일정 / 팀장 승인 (표시하지만 항상 비활성) */}
                <div className="grid md:grid-cols-2 gap-3">
                    <label className="block">
                        <div className="text-sm mb-1">다음 후속 예정</div>
                        <input
                            type="datetime-local"
                            className="aa-input w-full"
                            value={form.nextFollowupAt}
                            onChange={e=>setForm(f=>({...f, nextFollowupAt:e.target.value}))}
                            readOnly={disabled}
                            disabled={disabled}
                        />
                    </label>
                    <label className="block">
                        <div className="text-sm mb-1">팀장 승인</div>
                        <label
                            className="inline-flex items-center gap-2 px-3 py-2 rounded border border-slate-700 bg-slate-800"
                            title="승인은 팀장 전용 '상담 관리'에서 처리합니다."
                        >
                            {/* 편집모드여도 비활성 (변경 불가) */}
                            <input type="checkbox" checked={!!form.homeroomOk} disabled readOnly />
                            <span className="text-sm">승인됨</span>
                        </label>
                        <div className="text-xs text-slate-400 mt-1">승인 변경은 상담 관리 화면에서만 가능</div>
                    </label>
                </div>

                {/* 액션 */}
                <div className="flex justify-between items-center pt-2">
                    <div className="text-xs text-slate-400">
                        생성: {prettyDateTime(row.createdAt)} · 수정: {prettyDateTime(row.updatedAt)}
                    </div>
                    <div className="flex gap-2">
                        {!editMode ? (
                            <>
                                <button className="aa-btn" onClick={onClose}>닫기</button>
                                <button className="aa-btn aa-btn-primary" onClick={()=>setEditMode(true)}>수정</button>
                            </>
                        ) : (
                            <>
                                <button
                                    className="aa-btn"
                                    onClick={()=>{
                                        setEditMode(false);
                                        // 원본으로 되돌리기
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
                                    }}
                                >취소</button>
                                <button
                                    className="aa-btn aa-btn-primary"
                                    onClick={()=>{
                                        const payload = {
                                            title: (form.title||'').trim(),
                                            content: (form.content||'').trim() || '(내용을 입력하세요)',
                                            // ✅ 승인 값은 변경 불가 → 원본(row.homeroomOk) 그대로 보냄
                                            homeroomOk: !!row?.homeroomOk,
                                            consultMethod: up(form.consultMethod || 'CALL'),
                                            consultType: ALLOWED_TYPES.has(up(form.consultType || '')) ? up(form.consultType) : 'REGULAR',
                                            visibilityRole: up(form.visibilityRole || 'ALL'),
                                            consultAt: ensureLocalIsoSeconds(form.consultAt) || nowLocalIso(),
                                            nextFollowupAt: ensureLocalIsoSeconds(form.nextFollowupAt) || null,
                                            actionPlan: (form.actionPlan||'').trim() || null,
                                            useYn: row?.useYn ?? true
                                        };
                                        onSave(payload, ()=>setEditMode(false));
                                    }}
                                >저장</button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </Modal>
    );
}

// ============================================================================
// 메인 탭 컴포넌트
//  - 목록 로드/정렬 및 생성/수정 위임
//  - 목록 컬럼: "방식 / 유형" 옆에 "팀장 승인" 배지 추가 (NEW)
// ============================================================================
export default function StudentConsults({ studentId }) {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);

    // 공통코드
    const [codeMap, setCodeMap] = useState({
        METHOD: { groupCode: null, items: [] },
        TYPE:   { groupCode: null, items: [] },
        SCOPE:  { groupCode: null, items: [] },
    });
    const [codesLoading, setCodesLoading] = useState(false);

    // 모달 상태
    const [createOpen, setCreateOpen] = useState(false);
    const [viewRow, setViewRow] = useState(null);
    const [viewOpen, setViewOpen] = useState(false);

    const canUse = useMemo(()=> !!studentId, [studentId]);

    // 공통코드 로드
    useEffect(() => {
        let alive = true;
        (async ()=>{
            setCodesLoading(true);
            try {
                const [m,t,s] = await Promise.all([
                    loadFirstNonEmptyGroup(GROUP_CANDIDATES.METHOD),
                    loadFirstNonEmptyGroup(GROUP_CANDIDATES.TYPE),
                    loadFirstNonEmptyGroup(GROUP_CANDIDATES.SCOPE),
                ]);
                if (!alive) return;
                setCodeMap({ METHOD: m, TYPE: t, SCOPE: s });
            } finally {
                if (alive) setCodesLoading(false);
            }
        })();
        return ()=>{ alive=false; };
    }, []);

    // 라벨 맵
    const methodLabels = useMemo(
        () => buildLabelMap(codeMap.METHOD.items, FALLBACK_METHOD_LABELS),
        [codeMap.METHOD.items]
    );
    const typeLabelsAll = useMemo(
        () => buildLabelMap(codeMap.TYPE.items, FALLBACK_TYPE_LABELS),
        [codeMap.TYPE.items]
    );

    // 입력 옵션
    const methodOptions = useMemo(
        () => toOptions(codeMap.METHOD.items, FALLBACK_METHOD_LABELS),
        [codeMap.METHOD.items]
    );
    const typeOptions   = useMemo(()=>{
        const raw = toOptions(codeMap.TYPE.items, FALLBACK_TYPE_LABELS);
        const filtered = raw.filter(o => ALLOWED_TYPES.has(o.code));
        return filtered.length ? filtered : toOptions([], FALLBACK_TYPE_LABELS);
    }, [codeMap.TYPE.items]);
    const scopeOptions  = useMemo(
        () => toOptions(codeMap.SCOPE.items, FALLBACK_SCOPE_LABELS),
        [codeMap.SCOPE.items]
    );

    // 목록 로드
    const load = async ()=>{
        if (!canUse) { setRows([]); return; }
        setLoading(true);
        try{
            const res = await listStudentConsults(studentId, { size: 100 });
            const arr = Array.isArray(res) ? res : (res?.content || []);
            // consultAt desc, id desc
            arr.sort((a,b)=>{
                const ax = a.consultAt ? String(a.consultAt) : '';
                const bx = b.consultAt ? String(b.consultAt) : '';
                if (ax !== bx) return bx.localeCompare(ax);
                return (b.id||0) - (a.id||0);
            });
            setRows(arr);
        }catch{
            setRows([]);
        }finally{
            setLoading(false);
        }
    };
    useEffect(()=>{ load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ },[studentId]);

    // 등록 처리
    const submitCreate = async (formData) => {
        if (!canUse) return;
        const payload = {
            title: (formData.title || '').trim(),
            content: (formData.content || '').trim() || '(내용을 입력하세요)',
            homeroomOk: false, // 생성 시 항상 미승인
            consultMethod: up(formData.consultMethod || 'CALL'),
            consultType: ALLOWED_TYPES.has(up(formData.consultType || '')) ? up(formData.consultType) : 'REGULAR',
            visibilityRole: up(formData.visibilityRole || 'ALL'),
            consultAt: ensureLocalIsoSeconds(formData.consultAt) || nowLocalIso(),
            nextFollowupAt: ensureLocalIsoSeconds(formData.nextFollowupAt) || null,
            actionPlan: (formData.actionPlan || '').trim() || null,
            useYn: true
        };
        try{
            await createConsult({ studentId, ...payload });
            setCreateOpen(false);
            await safeOk('성공','상담이 등록되었습니다.');
            await load();
        }catch(e){
            const msg = e?.response?.data?.message || e?.message || '상담 등록 실패';
            if (/chk_cn_type/i.test(msg) || /constraint/i.test(msg)) {
                return safeError('유형 값 오류', 'DB 허용 상담유형은 REGULAR/EMERGENCY 입니다. 공통코드와 제약을 일치시켜 주세요.');
            }
            safeError('오류', msg);
        }
    };

    // 수정 처리
    const submitUpdate = async (consultId, payload, after) => {
        try{
            await updateConsult({ studentId, consultId, ...payload });
            await safeOk('성공','수정되었습니다.');
            after?.();
            setViewOpen(false);
            setViewRow(null);
            await load();
        }catch(e){
            const msg = e?.response?.data?.message || e?.message || '상담 수정 실패';
            if (/chk_cn_type/i.test(msg) || /constraint/i.test(msg)) {
                return safeError('유형 값 오류', 'DB 허용 상담유형은 REGULAR/EMERGENCY 입니다. 공통코드와 제약을 일치시켜 주세요.');
            }
            safeError('오류', msg);
        }
    };

    return (
        <div className="space-y-3">
            {/* 상단 액션 */}
            <div className="flex items-center justify-between">
                <div className="font-semibold text-slate-100">상담</div>
                <div className="flex gap-2">
                    <button className="aa-btn" onClick={load}>새로고침</button>
                    <button
                        className="aa-btn aa-btn-primary"
                        onClick={()=>setCreateOpen(true)}
                        disabled={!canUse || codesLoading}
                        title={!canUse ? '학생을 먼저 선택하세요.' : undefined}
                    >
                        상담 등록
                    </button>
                </div>
            </div>

            {/* 목록 테이블
          - "방식 / 유형" 옆에 "팀장 승인" 배지 추가 (NEW) */}
            <div className="aa-table-wrap" style={{ maxHeight: 240, overflowY: 'auto' }}>
                <table className="aa-table consult-table">
                    <thead>
                    <tr>
                        <th className="date-col" style={{width:160}}>일시</th>
                        <th className="title-col">제목</th>
                        <th style={{width:320}}>방식 / 유형 · 팀장 승인</th>
                        <th style={{width:120}}>동작</th>
                    </tr>
                    </thead>
                    <tbody>
                    {(loading || codesLoading) && (
                        <tr><td colSpan={4}>불러오는 중…</td></tr>
                    )}
                    {!loading && !codesLoading && rows.length===0 && (
                        <tr><td colSpan={4}>상담 기록이 없습니다.</td></tr>
                    )}
                    {!loading && !codesLoading && rows.map(c=>(
                        <tr key={c.id}>
                            <td className="date-col">{prettyDateTime(c.consultAt)}</td>
                            <td className="aa-ellipsis title-col">{c.title}</td>
                            <td>
                                {/* 방법/유형 라벨 */}
                                {labelOf(methodLabels, c.consultMethod)} / {labelOf(typeLabelsAll, c.consultType)}
                                {/* NEW: 팀장 승인 배지 */}
                                <span
                                    className={`ml-2 inline-flex items-center px-2 py-0.5 rounded border text-xs
                                ${c.homeroomOk ? 'border-emerald-500 text-emerald-300' : 'border-slate-600 text-slate-300'}`}
                                    title="팀장 승인 여부"
                                >
                    팀장 승인: {c.homeroomOk ? '승인' : '미승인'}
                  </span>
                            </td>
                            <td>
                                <button
                                    className="aa-btn aa-btn-primary aa-btn-sm"
                                    onClick={()=>{
                                        setViewRow(c);
                                        setViewOpen(true);
                                    }}
                                >
                                    확인
                                </button>
                            </td>
                        </tr>
                    ))}
                    </tbody>
                </table>
            </div>

            {/* 생성 모달 */}
            <CreateConsultModal
                open={createOpen}
                onClose={()=>setCreateOpen(false)}
                onSubmit={submitCreate}
                methodOptions={methodOptions}
                typeOptions={typeOptions}
                scopeOptions={scopeOptions}
            />

            {/* 상세/수정 모달 */}
            <ConsultViewEditModal
                open={viewOpen}
                onClose={()=>{ setViewOpen(false); setViewRow(null); }}
                row={viewRow}
                methodOptions={methodOptions}
                typeOptions={typeOptions}
                scopeOptions={scopeOptions}
                onSave={(payload, after)=> submitUpdate(viewRow?.id, payload, after)}
            />
        </div>
    );
}