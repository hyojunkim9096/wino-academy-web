// src/features/finance/pages/BillingConsolePage.jsx
// ============================================================================
// BillingConsolePage — 학생 선택 → 수강료 생성/납부/히스토리 콘솔 (v2.6)
// ----------------------------------------------------------------------------
// ✅ StudentTuitionTab 미사용(이 페이지 전용 UI)
// ✅ "수강료 등록 & 목록" 상단: 가격표 | 시작월 | 등록 (한 줄 인라인 폼)
// ✅ alert.js 래퍼(confirmDialog/alert*)만 사용. window.confirm 금지
// ✅ 전역 --aa-topbar-height 의존 제거: 실제 툴바 높이를 측정해 --bp-topbar 주입
// ✅ 반응형: 오른쪽 폭 기준 자동 가로/세로 + 수동 토글(자동/세로/가로)
// ✅ 겹침 방지: CSS는 admin-billing.css v2.6에 반영 (inline-row/mini-field 등)
// ✅ API 파라미터 혼용: stage|schoolStage, workLocation|workLocationCode 등
// ✅ 가격표 API: /api/admin/tuition/prices/active (gradeCode & grade_code 모두 허용)
// ✅ 시작월 inline 편집(blur)에 바로 저장
// ✅ 등록 시 서버 구현 차이 방어: { priceId, tuitionPriceId } 동시 전송
// ============================================================================

import React, { useEffect, useRef, useState, useCallback } from 'react';

// ⚠️ CSS import 순서: system → shared → page(권장)
import '@/features/system/styles/admin-system.css';
import '@/features/admin/styles/admin-shared.css';
import '@/features/finance/styles/admin-billing.css';

import { listCommonCodeItems } from '@/features/system/api/commonCodeAdminApi.js';
import { listStudents, getStudent } from '@/features/student/api/studentApi.js';

// ▶ 이 페이지 전용: 학생-수강료 관련 API (StudentTuitionTab 미사용)
import {
    listStudentTuitions,      // (studentId) => [{id, startMonth, priceName, unit, price, active, ...}]
    createStudentTuition,     // (studentId, { priceId|tuitionPriceId, startMonth }) => created
    updateStudentTuition,     // (studentId, tuitionId, { startMonth?, active? }) => updated
    deleteStudentTuition,     // (studentId, tuitionId, { force? }) => void
    listRecentInvoices,       // (studentId, { size }) => [{id, month, items[], amount, paidAmount, status, ...}]
    generateInvoices,         // (studentId, { month } | { fromMonth,toMonth }) => result
    payInvoice,               // (invoiceId, { paidAt, amount, method?, memo? }) => updated
} from '@/features/finance/api/studentTuitionApi.js';

// 활성 가격표 조회(학부/학년 기준; 서버 미구현 시 내부 폴백 합성/정규화 포함)
import { getActivePrices } from '@/features/finance/api/tuitionCategoryApi.js';

// SweetAlert2 래퍼
import { alertInfo, alertSuccess, alertError, confirmDialog } from '@/common/ui/alert.js';

/* ────────────────────────────────────────────────────────────────────────── */
/* 유틸: 정렬/학년 코드 변환                                                   */
/* ────────────────────────────────────────────────────────────────────────── */
const sorted = (arr = []) =>
    arr
        .slice()
        .sort(
            (a, b) =>
                (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
                String(a.name).localeCompare(String(b.name), 'ko', { sensitivity: 'base' })
        );

/** 화면 학년 라벨('1','2','3' 등)을 서버 학년코드(E01/M01/H01)로 변환 */
function toGradeCode(stage, gradeLabel) {
    const s = String(stage || '').toUpperCase();       // E|M|H
    const n = String(gradeLabel || '').replace(/[^0-9]/g, '');
    if (!s || !n) return '';
    const num = String(n).padStart(2, '0');
    return `${s}${num}`;
}

/* ────────────────────────────────────────────────────────────────────────── */
/* 훅: 오른쪽 패널 폭을 관찰해 자동 세로 전환 임계값을 판정                    */
/* ────────────────────────────────────────────────────────────────────────── */
function useAutoVertical(ref, threshold = 1280) {
    const [autoVertical, setAutoVertical] = useState(false);
    useEffect(() => {
        if (!ref.current) return;
        const el = ref.current;
        const ro = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const w = entry.contentRect?.width ?? el.clientWidth ?? 0;
                setAutoVertical(w < threshold);
            }
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, [ref, threshold]);
    return autoVertical;
}

/* ────────────────────────────────────────────────────────────────────────── */
/* 훅: 실제 툴바 높이를 측정해 컨테이너 루트에 --bp-topbar 주입                */
/* (전역 --aa-topbar-height 미정의여도 sticky offset이 안전하게 동작)         */
/* ────────────────────────────────────────────────────────────────────────── */
function useTopbarOffset(rootRef) {
    useEffect(() => {
        const root = rootRef.current;
        if (!root) return;
        const toolbar = root.querySelector('.aa-topbar') || root.querySelector('.aa-toolbar');
        const update = () => {
            const h = toolbar ? toolbar.offsetHeight : 64;
            root.style.setProperty('--bp-topbar', `${h}px`);
        };
        update();
        const ro = new ResizeObserver(update);
        if (toolbar) ro.observe(toolbar);
        window.addEventListener('resize', update);
        return () => {
            ro.disconnect();
            window.removeEventListener('resize', update);
        };
    }, [rootRef]);
}

/* ────────────────────────────────────────────────────────────────────────── */
/* 오른쪽 패널 — 수강료 등록/목록 + 청구 생성/최근 청구서                      */
/* ────────────────────────────────────────────────────────────────────────── */
function TuitionConsole({ student, onChanged }) {
    const studentId = student?.id;
    const stage = student?.schoolStage || '';
    const gradeLabel = student?.gradeLabel || '';
    const gradeCode = toGradeCode(stage, gradeLabel);

    // 활성 가격표
    const [activePrices, setActivePrices] = useState([]);  // [{id, categoryPath, name, unit, price, ...}]
    const [priceId, setPriceId] = useState('');
    const [startMonth, setStartMonth] = useState('');      // 'YYYY-MM'
    const [saving, setSaving] = useState(false);

    // 등록 목록
    const [tuitionList, setTuitionList] = useState([]);
    const [loadingList, setLoadingList] = useState(false);

    // 청구 생성 & 최근 청구
    const [billMonth, setBillMonth] = useState('');        // 'YYYY-MM'
    const [recentInvoices, setRecentInvoices] = useState([]);
    const [loadingInv, setLoadingInv] = useState(false);
    const [generating, setGenerating] = useState(false);

    // 활성 가격표 로드
    const loadActivePrices = useCallback(async () => {
        if (!studentId) return;
        try {
            // getActivePrices: 서버 구현(/prices/active) + 폴백 합성 모두 지원
            const prices = await getActivePrices({ stage, gradeCode });
            const rows = Array.isArray(prices) ? prices : prices?.content || [];
            setActivePrices(rows);
            if (rows.length > 0) setPriceId(String(rows[0].id));
        } catch {
            setActivePrices([]);
        }
    }, [studentId, stage, gradeCode]);

    // 등록 목록 로드
    const loadTuitions = useCallback(async () => {
        if (!studentId) return;
        setLoadingList(true);
        try {
            const rows = await listStudentTuitions(studentId);
            setTuitionList(Array.isArray(rows) ? rows : rows?.content || []);
        } catch {
            setTuitionList([]);
        } finally {
            setLoadingList(false);
        }
    }, [studentId]);

    // 최근 청구 로드
    const loadRecentInvoices = useCallback(async () => {
        if (!studentId) return;
        setLoadingInv(true);
        try {
            const rows = await listRecentInvoices(studentId, { size: 10 });
            setRecentInvoices(Array.isArray(rows) ? rows : rows?.content || []);
        } catch {
            setRecentInvoices([]);
        } finally {
            setLoadingInv(false);
        }
    }, [studentId]);

    // 최초/학생 변경 시 데이터 로드
    useEffect(() => {
        if (!studentId) return;
        loadActivePrices();
        loadTuitions();
        loadRecentInvoices();
    }, [studentId, loadActivePrices, loadTuitions, loadRecentInvoices]);

    // 등록 실행
    const handleCreate = async () => {
        if (!studentId) return;
        if (!priceId) return alertInfo('안내', '가격표를 선택하세요.');
        if (!startMonth) return alertInfo('안내', '시작월을 선택하세요.');
        try {
            setSaving(true);
            // ⚠️ 서버 구현별 호환: priceId | tuitionPriceId 둘 다 제공(동일 값)
            await createStudentTuition(studentId, {
                priceId: Number(priceId),
                tuitionPriceId: Number(priceId),
                startMonth,
            });
            await alertSuccess('성공', '수강료 등록이 완료되었습니다.');
            setStartMonth('');
            await loadTuitions();
            await onChanged?.(); // 상위 목록/선택 갱신
        } catch (e) {
            const msg = e?.response?.data?.message || e?.message || '등록에 실패했습니다.';
            await alertError('오류', msg);
        } finally {
            setSaving(false);
        }
    };

    // 활성 토글
    const handleToggleActive = async (row) => {
        try {
            await updateStudentTuition(studentId, row.id, { active: !row.active });
            await loadTuitions();
            await onChanged?.();
        } catch (e) {
            await alertError('오류', e?.response?.data?.message || '상태 변경 실패');
        }
    };

    // 시작월 수정(blur 시)
    const handleEditStartMonth = async (row, newMonth) => {
        if (!newMonth || newMonth === row.startMonth) return;
        // YYYY-MM 안전 검사(브라우저 month input이 보통 보장하지만 방어 로직 추가)
        if (!/^\d{4}-\d{2}$/.test(newMonth)) {
            return alertInfo('안내', '시작월 형식은 YYYY-MM 입니다.');
        }
        try {
            await updateStudentTuition(studentId, row.id, { startMonth: newMonth });
            await loadTuitions();
            await onChanged?.();
        } catch (e) {
            await alertError('오류', e?.response?.data?.message || '수정 실패');
        }
    };

    // 삭제 (연결 청구 없을 때만)
    const handleDelete = async (row) => {
        const ok = await confirmDialog('삭제할까요?', '연결된 청구서가 없는 경우에만 삭제할 수 있습니다.');
        if (!ok) return;
        try {
            await deleteStudentTuition(studentId, row.id);
            await alertSuccess('성공', '삭제되었습니다.');
            await loadTuitions();
            await onChanged?.();
        } catch (e) {
            await alertError('오류', e?.response?.data?.message || '삭제 실패');
        }
    };

    // 청구 생성(MONTH 단위 기본)
    const handleGenerateInvoices = async () => {
        if (!billMonth) return alertInfo('안내', '청구월을 선택하세요.');
        try {
            setGenerating(true);
            await generateInvoices(studentId, { month: billMonth }); // 정책: MONTH 단위만 자동 청구
            await alertSuccess('성공', '청구가 생성되었습니다.');
            await loadRecentInvoices();
            await onChanged?.();
        } catch (e) {
            await alertError('오류', e?.response?.data?.message || '청구 생성 실패');
        } finally {
            setGenerating(false);
        }
    };

    // 납부 처리(간단 전액납부 예시)
    const handlePay = async (inv) => {
        const ok = await confirmDialog('납부 처리할까요?', `청구 #${inv.id} 에 대해 납부 처리합니다.`);
        if (!ok) return;
        try {
            const now = new Date(); // 로컬(Asia/Seoul) 브라우저 시간
            const y = now.getFullYear();
            const m = String(now.getMonth() + 1).padStart(2, '0');
            const d = String(now.getDate()).padStart(2, '0');
            const hh = String(now.getHours()).padStart(2, '0');
            const mm = String(now.getMinutes()).padStart(2, '0');
            const ss = String(now.getSeconds()).padStart(2, '0');
            const paidAt = `${y}-${m}-${d} ${hh}:${mm}:${ss}`; // 'yyyy-MM-dd HH:mm:ss'

            await payInvoice(inv.id, { paidAt, amount: inv.amount, memo: '' });
            await alertSuccess('성공', '납부 처리되었습니다.');
            await loadRecentInvoices();
            await onChanged?.();
        } catch (e) {
            await alertError('오류', e?.response?.data?.message || '납부 처리 실패');
        }
    };

    return (
        <div className="tuition-grid">
            {/* 좌측 카드: 수강료 등록 & 목록 */}
            <section className="aa-card">
                <div className="panel-header">
                    <div className="panel-title">수강료 등록 &amp; 목록</div>
                </div>

                {/* ✅ 인라인 한 줄: 가격표 | 시작월 | 등록 */}
                <div className="inline-row">
                    {/* 가격표 */}
                    <label className="mini-field">
                        <div className="mini-label">가격표 *</div>
                        <select
                            className="aa-select"
                            value={priceId}
                            onChange={(e) => setPriceId(e.target.value)}
                        >
                            {activePrices.length === 0 && <option value="">활성 가격표가 없습니다</option>}
                            {activePrices.map((p) => (
                                <option key={p.id} value={p.id}>
                                    {p.categoryPath} · {p.name} ({p.unit}) · {Number(p.price).toLocaleString()}원  #{p.id}
                                </option>
                            ))}
                        </select>
                        <div className="mini-hint">
                            학부(<b>{stage || '-'}</b>) · 학년(<b>{student?.gradeLabel || '-'}</b>) 기준으로 필터링됩니다.
                        </div>
                    </label>

                    {/* 시작월 */}
                    <label className="mini-field">
                        <div className="mini-label">시작월 *</div>
                        <input
                            type="month"
                            className="aa-input aa-input-contrast month-sm"
                            value={startMonth}
                            onChange={(e) => setStartMonth(e.target.value)}
                        />
                    </label>

                    {/* 등록 버튼 */}
                    <div className="mini-actions">
                        <button
                            type="button"
                            className="aa-btn aa-btn-primary"
                            onClick={handleCreate}
                            disabled={!priceId || !startMonth || saving}
                        >
                            {saving ? '등록 중…' : '등록'}
                        </button>
                    </div>
                </div>

                {/* 등록 목록 */}
                <div className="aa-table-wrap">
                    <table className="aa-table">
                        <thead>
                        <tr>
                            <th style={{ width: 120 }}>시작월</th>
                            <th>가격표</th>
                            <th style={{ width: 72 }}>단위</th>
                            <th style={{ width: 120 }}>금액</th>
                            <th style={{ width: 64 }}>활성</th>
                            <th style={{ width: 180 }}>동작</th>
                        </tr>
                        </thead>
                        <tbody>
                        {loadingList && (
                            <tr><td colSpan={6} className="aa-subtle">불러오는 중…</td></tr>
                        )}
                        {!loadingList && tuitionList.length === 0 && (
                            <tr><td colSpan={6} className="aa-subtle">등록 내역이 없습니다.</td></tr>
                        )}
                        {tuitionList.map((row) => (
                            <tr key={row.id}>
                                <td>
                                    <input
                                        type="month"
                                        className="aa-input aa-input-contrast month-sm"
                                        defaultValue={row.startMonth}
                                        onBlur={(e) => {
                                            const v = e.target.value;
                                            if (v && v !== row.startMonth) handleEditStartMonth(row, v);
                                        }}
                                    />
                                </td>
                                <td className="aa-ellipsis" title={row.priceName}>{row.priceName}</td>
                                <td>{row.unit || '-'}</td>
                                <td>{Number(row.price).toLocaleString()}</td>
                                <td>{row.active ? 'Y' : 'N'}</td>
                                <td>
                                    <div className="flex gap-2">
                                        <button className="aa-btn aa-btn-sm" onClick={() => handleToggleActive(row)}>
                                            {row.active ? '비활성화' : '활성화'}
                                        </button>
                                        <button className="aa-btn aa-btn-danger aa-btn-sm" onClick={() => handleDelete(row)}>
                                            삭제
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                </div>

                <div className="aa-subtle mt-2">
                    ※ 삭제는 연결 청구서가 없는 경우에만 가능합니다. 그 외에는 비활성화를 사용하세요.
                </div>
            </section>

            {/* 우측 카드: 청구 생성 & 최근 청구서 */}
            <section className="aa-card">
                <div className="panel-header">
                    <div className="panel-title">청구 생성 &amp; 최근 청구서</div>
                </div>

                {/* 인라인: 청구월 | 새로고침 | 생성 */}
                <div className="inline-row">
                    <label className="mini-field">
                        <div className="mini-label">청구월 *</div>
                        <input
                            type="month"
                            className="aa-input aa-input-contrast month-sm"
                            value={billMonth}
                            onChange={(e) => setBillMonth(e.target.value)}
                        />
                    </label>
                    <div className="mini-actions">
                        <button
                            type="button"
                            className="aa-btn"
                            onClick={loadRecentInvoices}
                            disabled={loadingInv}
                        >
                            {loadingInv ? '새로고침…' : '최근 청구 새로고침'}
                        </button>
                    </div>
                    <div className="mini-actions">
                        <button
                            type="button"
                            className="aa-btn aa-btn-primary"
                            onClick={handleGenerateInvoices}
                            disabled={!billMonth || generating}
                        >
                            {generating ? '생성 중…' : '청구 생성'}
                        </button>
                    </div>
                </div>

                {/* 최근 청구 목록 */}
                <div className="aa-table-wrap">
                    <table className="aa-table">
                        <thead>
                        <tr>
                            <th style={{ width: 100 }}>청구월</th>
                            <th>항목</th>
                            <th style={{ width: 120 }}>금액</th>
                            <th style={{ width: 120 }}>납부</th>
                            <th style={{ width: 100 }}>상태</th>
                            <th style={{ width: 160 }}>동작</th>
                        </tr>
                        </thead>
                        <tbody>
                        {loadingInv && (
                            <tr><td colSpan={6} className="aa-subtle">불러오는 중…</td></tr>
                        )}
                        {!loadingInv && recentInvoices.length === 0 && (
                            <tr><td colSpan={6} className="aa-subtle">최근 청구가 없습니다.</td></tr>
                        )}
                        {recentInvoices.map((inv, idx) => (
                            <tr key={`${inv.id}-${idx}`}>
                                <td>{inv.month}</td>
                                <td className="aa-ellipsis" title={(inv.items || []).map(it => it.name).join(', ')}>
                                    {(inv.items || []).map(it => it.name).join(', ') || '-'}
                                </td>
                                <td>{Number(inv.amount).toLocaleString()}</td>
                                <td>{Number(inv.paidAmount || 0).toLocaleString()}</td>
                                <td>
                                    {inv.status === 'PAID' ? <span className="badge badge-green">PAID</span>
                                        : inv.status === 'PENDING' ? <span className="badge">PENDING</span>
                                            : <span className="badge badge-red">{inv.status || '-'}</span>}
                                </td>
                                <td>
                                    <div className="flex gap-2">
                                        <button className="aa-btn aa-btn-sm" onClick={() => handlePay(inv)} disabled={inv.status === 'PAID'}>
                                            납부
                                        </button>
                                        {/* TODO: 상세/영수증 버튼 필요 시 추가 */}
                                    </div>
                                </td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* 메인 페이지                                                                 */
/* ────────────────────────────────────────────────────────────────────────── */
function StageTabs({ value, onChange }) {
    const tabs = [
        { key: 'E', label: '초등부(E)' },
        { key: 'M', label: '중등부(M)' },
        { key: 'H', label: '고등부(H)' },
    ];
    return (
        <div className="aa-seg" role="tablist" aria-label="학부 선택">
            {tabs.map((t) => (
                <button
                    key={t.key}
                    type="button"
                    role="tab"
                    aria-selected={value === t.key}
                    className={value === t.key ? 'active' : ''}
                    onClick={() => onChange(t.key)}
                    title={t.label}
                >
                    {t.label}
                </button>
            ))}
        </div>
    );
}

export default function BillingConsolePage() {
    // ===== 루트/오른쪽 레퍼런스 & 오프셋 세팅 =====
    const rootRef = useRef(null);
    const rightRef = useRef(null);
    useTopbarOffset(rootRef);
    const autoVertical = useAutoVertical(rightRef, 1280);

    // ===== 필터 =====
    const [stage, setStage] = useState('E');
    const [keyword, setKeyword] = useState('');
    const [kwDebounced, setKwDebounced] = useState('');

    // 지점 단일 선택
    const [branches, setBranches] = useState([]);             // [{code,name}]
    const [selectedBranch, setSelectedBranch] = useState(''); // '' = 전체

    // ===== 목록/선택 =====
    const [loading, setLoading] = useState(false);
    const [list, setList] = useState([]);
    const [selectedId, setSelectedId] = useState(null);
    const [detail, setDetail] = useState(null);

    // 레이아웃 강제 토글: null(자동) | 'vertical' | 'horizontal'
    const [forceLayout, setForceLayout] = useState(null);
    const verticalOn = forceLayout ? (forceLayout === 'vertical') : autoVertical;

    // 디바운스
    useEffect(() => {
        const t = setTimeout(() => setKwDebounced(keyword.trim()), 250);
        return () => clearTimeout(t);
    }, [keyword]);

    // 지점 코드 로드(WORK_LOCATION)
    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const items = await listCommonCodeItems('WORK_LOCATION');
                if (!alive) return;
                setBranches(sorted(items || []));
            } catch {
                setBranches([]);
            }
        })();
        return () => { alive = false; };
    }, []);

    // 학생 목록 로드
    const inflight = useRef(0);
    const loadList = useCallback(async () => {
        setLoading(true);
        const my = ++inflight.current;
        try {
            // ⚠️ 서버 필터 혼용(stage|schoolStage, workLocation|workLocationCode) 고려
            const res = await listStudents({
                workLocationCode: selectedBranch || undefined,
                workLocation: selectedBranch || undefined,
                schoolStage: stage || undefined,
                stage: stage || undefined,
                keyword: kwDebounced || undefined,
                page: 0, size: 30,
            });
            if (my !== inflight.current) return;
            const rows = Array.isArray(res?.content) ? res.content : Array.isArray(res) ? res : [];
            rows.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko', { sensitivity: 'base' }));
            setList(rows);
            setSelectedId((prev) => (prev && rows.some((r) => r.id === prev)) ? prev : (rows[0]?.id ?? null));
        } catch {
            setList([]);
        } finally {
            if (my === inflight.current) setLoading(false);
        }
    }, [stage, kwDebounced, selectedBranch]);

    useEffect(() => { loadList(); }, [loadList]);

    // 상세 로드
    useEffect(() => {
        let alive = true;
        (async () => {
            if (!selectedId) { setDetail(null); return; }
            try {
                const d = await getStudent(selectedId);
                if (!alive) return;
                setDetail(d || null);
            } catch {
                if (!alive) return;
                setDetail(null);
            }
        })();
        return () => { alive = false; };
    }, [selectedId]);

    return (
        <section className="aa-page billing-page" ref={rootRef}>
            <div className="aa-container">
                {/* 헤더 */}
                <div className="aa-toolbar aa-topbar">
                    <div>
                        <h1 className="aa-title">수강료 생성·납부 콘솔</h1>
                        <p className="aa-subtle">왼쪽에서 학생을 선택하고, 오른쪽에서 등록/청구/납부를 처리합니다.</p>
                    </div>
                    <div className="right-actions">
                        {/* 레이아웃 토글: 자동 ↔ 세로 ↔ 가로 */}
                        <div className="aa-seg" role="group" aria-label="레이아웃 전환">
                            <button type="button" className={!forceLayout ? 'active' : ''} onClick={() => setForceLayout(null)} title="자동 전환(권장)">자동</button>
                            <button type="button" className={forceLayout === 'vertical' ? 'active' : ''} onClick={() => setForceLayout('vertical')} title="세로(스택) 강제">세로</button>
                            <button type="button" className={forceLayout === 'horizontal' ? 'active' : ''} onClick={() => setForceLayout('horizontal')} title="가로(2열) 강제">가로</button>
                        </div>

                        <button className="aa-btn" onClick={() => { setKeyword(''); setSelectedBranch(''); }}>필터 초기화</button>
                        <button className="aa-btn" onClick={loadList} disabled={loading}>{loading ? '새로고침…' : '새로고침'}</button>
                    </div>
                </div>

                {/* 좌3 : 우7 */}
                <div className="billing-split">
                    {/* 왼쪽: 필터 + 목록 */}
                    <div className="billing-left">
                        <section className="aa-card">
                            <div className="grid gap-3">
                                {/* 학부 (단일) */}
                                <label className="block">
                                    <div className="f-label">학부</div>
                                    <StageTabs value={stage} onChange={(v) => { setStage(v); }} />
                                </label>

                                {/* 지점 (라디오 스타일 단일 선택) */}
                                <label className="block">
                                    <div className="f-label">지점</div>
                                    <div className="branch-cloud" role="radiogroup" aria-label="지점 선택">
                                        <button
                                            type="button"
                                            className={`tag ${selectedBranch === '' ? 'active' : ''}`}
                                            onClick={() => setSelectedBranch('')}
                                            role="radio"
                                            aria-checked={selectedBranch === ''}
                                            title="전체 지점"
                                        >전체</button>

                                        {branches.map((b) => (
                                            <button
                                                key={b.code}
                                                type="button"
                                                className={`tag ${selectedBranch === b.code ? 'active' : ''}`}
                                                onClick={() => setSelectedBranch(b.code)}
                                                role="radio"
                                                aria-checked={selectedBranch === b.code}
                                                title={`${b.name} (${b.code})`}
                                            >
                                                {b.name}
                                            </button>
                                        ))}
                                        {branches.length === 0 && <span className="aa-subtle">지점 코드가 없습니다.</span>}
                                    </div>
                                </label>

                                {/* 검색 */}
                                <label className="block">
                                    <div className="f-label">검색</div>
                                    <input
                                        className="aa-input w-full"
                                        placeholder="이름/연락처/이메일/아이디"
                                        value={keyword}
                                        onChange={(e) => setKeyword(e.target.value)}
                                    />
                                </label>
                            </div>
                        </section>

                        {/* 학생 목록 */}
                        <section className="aa-card">
                            <div className="panel-header">
                                <div className="panel-title">학생 목록</div>
                            </div>
                            <div className="list-scroll">
                                {loading && <div className="p-3 aa-subtle">불러오는 중…</div>}
                                {!loading && list.length === 0 && <div className="p-3 aa-subtle">결과 없음</div>}
                                <div className="divide-y divide-slate-700/40">
                                    {list.map((row) => {
                                        const sel = selectedId === row.id;
                                        return (
                                            <button
                                                key={row.id}
                                                type="button"
                                                className={`w-full text-left p-3 block ${sel ? 'bg-slate-800/70' : ''}`}
                                                onClick={() => setSelectedId(row.id)}
                                                aria-current={sel ? 'true' : 'false'}
                                            >
                                                <div className="font-medium">{row.name}</div>
                                                <div className="text-xs aa-subtle mt-0.5">
                                                    #{row.id} · {row.schoolStage || '-'} · {row.workLocationCode || '-'}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </section>
                    </div>

                    {/* 오른쪽: 이 페이지 전용 수강료 콘솔 */}
                    <div className={`aa-card tuition-host ${verticalOn ? 'is-vertical' : ''}`} ref={rightRef}>
                        {!selectedId || !detail ? (
                            <div className="aa-subtle">좌측에서 학생을 선택하세요.</div>
                        ) : (
                            <TuitionConsole
                                student={detail}
                                onChanged={async () => { await loadList(); }}
                            />
                        )}
                    </div>
                </div>
            </div>
        </section>
    );
}