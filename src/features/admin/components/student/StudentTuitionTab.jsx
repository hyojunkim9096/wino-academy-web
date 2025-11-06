// src/features/admin/components/student/StudentTuitionTab.jsx
// ============================================================================
// 수강료/청구 탭 (좌 40%: 등록+목록 / 우 60%: 청구 생성+최근 청구) — 전체 파일
// 변경사항 요약
//  - ✅ 서버에 stage(E/M/H) + gradeCode(M01 등)를 camel/snake 동시 전달
//  - ✅ 프론트 2차 방어: 가격표 라벨/경로 한글(초/중/고 + 1~6학년)까지 파싱하여 E01~H03로 변환 후 "정확 일치" 필터
//  - ✅ 납부 모달 memo 전달
//  - ✅ 등록 "수정/삭제/활성토글" 추가 (Edit 모달, 삭제 확인)
// ============================================================================

import React, { useEffect, useMemo, useState } from 'react';
import {
    listStudentTuitions,
    addStudentTuition,
    updateStudentTuition,
    deleteStudentTuition,
    generateMonthlyInvoices,
    listRecentInvoices,
    payInvoice,
} from '@/api/studentTuitionApi';
import { listActiveTuitionPricesByStage } from '@/api/tuitionCategoryApi';

import Modal from '@/components/ui/Modal';
import { alertError, alertInfo, alertSuccess } from '@/ui/alert';

// ---------------------------------------------------------------------------
// 안전 알림 (throw 방지)
// ---------------------------------------------------------------------------
const safeInfo  = (t, m) => Promise.resolve(alertInfo(t, m)).catch(() => {});
const safeOk    = (t, m) => Promise.resolve(alertSuccess(t, m)).catch(() => {});
const safeError = (t, m) => Promise.resolve(alertError(t, m)).catch(() => {});

// ---------------------------------------------------------------------------
// 날짜/포맷 유틸
// ---------------------------------------------------------------------------
function thisMonth() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}`;
}
function nextMonth(ym) {
    if (!ym) return thisMonth();
    const [y, m] = ym.split('-').map(Number);
    const d = new Date(y, (m - 1) + 1, 1);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}`;
}
function lastMonth() {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}`;
}
function toStamp(dtLocal) {
    if (!dtLocal) return '';
    let s = String(dtLocal).trim().replace('T', ' ');
    if (/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}$/.test(s)) return `${s}:00`;
    return s;
}
function nowLocalInput() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ---------------------------------------------------------------------------
// 단위 표시
// ---------------------------------------------------------------------------
const unitKo = (u) => {
    const m = String(u || '').toUpperCase();
    if (m === 'MONTH')   return '월';
    if (m === 'TERM')    return '학기';
    if (m === 'SESSION') return '회차';
    return u || '';
};

// ---------------------------------------------------------------------------
// 학부/학년 파싱 강화 유틸(영문/한글 라벨 모두 커버)
// ---------------------------------------------------------------------------
function pickUpper(obj, ...keys) {
    for (const k of keys) {
        const path = k.split('.');
        let cur = obj;
        let ok = true;
        for (const seg of path) {
            if (cur && Object.prototype.hasOwnProperty.call(cur, seg)) cur = cur[seg];
            else { ok = false; break; }
        }
        if (ok && cur != null && String(cur).trim() !== '') return String(cur).toUpperCase();
    }
    return '';
}
function normalizeStage(stageLike) {
    if (!stageLike) return '';
    const s = String(stageLike).toUpperCase();
    if (s.startsWith('E')) return 'E';
    if (s.startsWith('M')) return 'M';
    if (s.startsWith('H')) return 'H';
    if (s.includes('초')) return 'E';
    if (s.includes('중')) return 'M';
    if (s.includes('고')) return 'H';
    return '';
}
function deriveGradeCodeFromText(text) {
    if (!text) return '';
    const t = String(text).toUpperCase();
    const mCode = t.match(/\b([EMH]\d{2})\b/);
    if (mCode) return mCode[1];
    const mKo = t.match(/(초|중|고)\s*등?\s*([1-6])\s*학?\s*년?/);
    if (mKo) {
        const g = mKo[1]; const n = Number(mKo[2]);
        if (g === '초' && n >= 1 && n <= 6) return `E0${n}`;
        if (g === '중' && n >= 1 && n <= 3) return `M0${n}`;
        if (g === '고' && n >= 1 && n <= 3) return `H0${n}`;
    }
    const mEn = t.match(/(ELEM|ELEMENT|ELEMENTARY|PRIMARY|MIDDLE|JUNIOR|HIGH|SECONDARY)[^\d]*([1-6])/);
    if (mEn) {
        const grp = mEn[1]; const n = Number(mEn[2]);
        if (/^ELEM|ELEMENT|PRIMARY/.test(grp) && n >= 1 && n <= 6) return `E0${n}`;
        if (/MIDDLE|JUNIOR/.test(grp) && n >= 1 && n <= 3) return `M0${n}`;
        if (/HIGH|SECONDARY/.test(grp) && n >= 1 && n <= 3) return `H0${n}`;
    }
    return '';
}
function getStudentGradeCode(studentDetail) {
    if (!studentDetail) return '';
    const byField =
        pickUpper(
            studentDetail,
            'gradeCode', 'grade_code',
            'grade.code', 'grade.grade_code',
            'schoolGradeCode', 'school_grade_code'
        );
    if (byField) return byField;
    const stage = getStudentStage(studentDetail);
    const hay = [
        pickUpper(studentDetail, 'gradeName', 'grade.name', 'gradeLabel', 'grade_label'),
        pickUpper(studentDetail, 'classGradeName', 'schoolGradeName', 'school_grade_name'),
        pickUpper(studentDetail, 'description', 'memo'),
    ].filter(Boolean).join(' ');
    let gc = deriveGradeCodeFromText(hay);
    if (!gc && stage) {
        const mOnlyNum = hay.match(/([1-6])/);
        if (mOnlyNum) {
            const n = Number(mOnlyNum[1]);
            if (stage === 'E' && n >= 1 && n <= 6) gc = `E0${n}`;
            if (stage === 'M' && n >= 1 && n <= 3) gc = `M0${n}`;
            if (stage === 'H' && n >= 1 && n <= 3) gc = `H0${n}`;
        }
    }
    return gc || '';
}
function getStudentStage(studentDetail) {
    if (!studentDetail) return '';
    const raw =
        pickUpper(studentDetail, 'schoolStage', 'school_stage', 'stage') ||
        pickUpper(studentDetail, 'schoolLevel', 'school_level');
    return normalizeStage(raw);
}
function getPriceGradeCode(price) {
    if (!price) return '';
    const byField = pickUpper(
        price,
        'gradeCode', 'grade_code',
        'grade.code', 'grade.grade_code',
        'category.gradeCode', 'category.grade_code',
        'categoryGradeCode', 'category_grade_code'
    );
    if (byField) return byField;
    const hay = [
        price.categoryPath,
        price.name,
        price.priceName,
        price.label,
        (price.category && (price.category.name || price.category.label || price.category.path)),
    ].filter(Boolean).join(' ');
    const byText = deriveGradeCodeFromText(hay);
    if (byText) return byText;
    return '';
}

// ---------------------------------------------------------------------------
// 납부 모달
// ---------------------------------------------------------------------------
function PayModal({ open, onClose, invoice, onSubmit }) {
    const [form, setForm] = useState({
        paidAt: nowLocalInput(),
        amount: invoice?.amount ?? 0,
        method: 'CASH',
        memo: '',
    });

    useEffect(() => {
        if (open && invoice) {
            setForm({
                paidAt: nowLocalInput(),
                amount: invoice.amount ?? 0,
                method: 'CASH',
                memo: '',
            });
        }
    }, [open, invoice]);

    if (!open || !invoice) return null;

    return (
        <Modal title="납부 처리" onClose={onClose} size="lg">
            <div className="space-y-4">
                <div className="text-sm text-slate-300">
                    청구서: <span className="font-semibold">{invoice.itemName}</span> · {invoice.billMonth} · 금액 {Number(invoice.amount).toLocaleString()}원 · 상태 {invoice.status}
                </div>

                <div className="grid md:grid-cols-2 gap-3">
                    <label className="block">
                        <div className="text-sm mb-1">납부일시 *</div>
                        <input
                            type="datetime-local"
                            className="aa-input aa-input-contrast w-full"
                            value={form.paidAt}
                            onChange={(e) => setForm((f) => ({ ...f, paidAt: e.target.value }))}
                        />
                        <div className="text-xs text-slate-400 mt-1">서버는 'yyyy-MM-dd HH:mm:ss' 로 파싱합니다.</div>
                    </label>
                    <label className="block">
                        <div className="text-sm mb-1">납부금액(원) *</div>
                        <input
                            type="number"
                            className="aa-input aa-input-contrast w-full"
                            value={form.amount}
                            onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                            min={1}
                        />
                    </label>
                </div>

                <div className="grid md:grid-cols-2 gap-3">
                    <label className="block">
                        <div className="text-sm mb-1">결제수단 *</div>
                        <select
                            className="aa-select w-full"
                            value={form.method}
                            onChange={(e) => setForm((f) => ({ ...f, method: e.target.value }))}
                        >
                            <option value="CASH">현금</option>
                            <option value="BANK">계좌입금</option>
                            <option value="TRANSFER">계좌이체</option>
                            <option value="CARD">카드(단순)</option>
                            <option value="POS_CARD">POS 카드</option>
                            <option value="PG_CARD">PG 카드</option>
                            <option value="VBANK">가상계좌</option>
                            <option value="ETC">기타</option>
                        </select>
                    </label>
                    <label className="block">
                        <div className="text-sm mb-1">메모(선택)</div>
                        <input
                            className="aa-input aa-input-contrast w-full"
                            value={form.memo}
                            onChange={(e) => setForm((f) => ({ ...f, memo: e.target.value }))}
                            placeholder="현금영수증요청 등"
                        />
                    </label>
                </div>

                <div className="flex justify-end gap-2">
                    <button className="aa-btn" onClick={onClose}>취소</button>
                    <button
                        className="aa-btn aa-btn-primary"
                        onClick={() => {
                            const amt = Number(form.amount);
                            if (!form.paidAt) return safeInfo('안내', '납부일시를 입력하세요.');
                            if (!amt || amt <= 0) return safeInfo('안내', '납부금액을 올바르게 입력하세요.');
                            onSubmit({
                                paidAt: toStamp(form.paidAt),
                                amount: amt,
                                method: form.method || 'CASH',
                                memo: (form.memo || '').trim() || undefined,
                            });
                        }}
                    >납부 완료</button>
                </div>
            </div>
        </Modal>
    );
}

// ---------------------------------------------------------------------------
// 등록 수정 모달 (startMonth, active 토글)
// ---------------------------------------------------------------------------
function EditAssignModal({ open, onClose, row, onSubmit }) {
    const [form, setForm] = useState({
        startMonth: row?.startMonth || thisMonth(),
        active: !!row?.active,
    });

    useEffect(() => {
        if (open && row) {
            setForm({ startMonth: row.startMonth || thisMonth(), active: !!row.active });
        }
    }, [open, row]);

    if (!open || !row) return null;

    return (
        <Modal title="등록 수정" onClose={onClose} size="md">
            <div className="space-y-4">
                <div className="text-sm text-slate-300">
                    대상: <span className="font-semibold">{row.categoryPath || '-'}</span>{' '}
                    {(row.priceName || row.name) ? <>· {row.priceName || row.name}</> : null}
                </div>

                <div className="grid md:grid-cols-2 gap-3">
                    <label className="block">
                        <div className="text-sm mb-1">시작월 *</div>
                        <input
                            type="month"
                            className="aa-input aa-input-contrast w-full"
                            value={form.startMonth}
                            onChange={(e) => setForm((f) => ({ ...f, startMonth: e.target.value }))}
                        />
                    </label>
                    <label className="block">
                        <div className="text-sm mb-1">활성 여부</div>
                        <div className="flex items-center gap-2">
                            <input
                                id="edit-active"
                                type="checkbox"
                                className="aa-checkbox"
                                checked={form.active}
                                onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
                            />
                            <label htmlFor="edit-active" className="text-sm">활성</label>
                        </div>
                    </label>
                </div>

                <div className="flex justify-end gap-2">
                    <button className="aa-btn" onClick={onClose}>취소</button>
                    <button
                        className="aa-btn aa-btn-primary"
                        onClick={() => {
                            if (!/^\d{4}-\d{2}$/.test(form.startMonth)) {
                                return safeInfo('안내', '시작월을 YYYY-MM 형식으로 선택하세요.');
                            }
                            onSubmit({ startMonth: form.startMonth, active: form.active });
                        }}
                    >저장</button>
                </div>
            </div>
        </Modal>
    );
}

// ---------------------------------------------------------------------------
// 메인 컴포넌트
// ---------------------------------------------------------------------------
export default function StudentTuitionTab({ studentId, studentDetail, priceOptions, onChanged }) {
    const canUse = !!studentId;

    // 목록 상태
    const [assigns, setAssigns] = useState([]);
    const [invoices, setInvoices] = useState([]);
    const [loading, setLoading] = useState(false);
    const [invLoading, setInvLoading] = useState(false);

    // 가격표(내부 로딩용)
    const [stagePrices, setStagePrices] = useState([]);
    const [priceLoading, setPriceLoading] = useState(false);

    // 폼
    const [assignForm, setAssignForm] = useState(() => ({ priceId: '', priceIdx: 0, startMonth: thisMonth() }));
    const [genForm, setGenForm]       = useState(() => ({ fromMonth: lastMonth(), toMonth: lastMonth() }));

    // 납부 모달
    const [payOpen, setPayOpen] = useState(false);
    const [payTarget, setPayTarget] = useState(null);

    // 수정 모달
    const [editOpen, setEditOpen] = useState(false);
    const [editTarget, setEditTarget] = useState(null);

    // ------------------------------ 데이터 로드 ------------------------------
    const loadAssigns = async () => {
        if (!canUse) { setAssigns([]); return; }
        setLoading(true);
        try {
            const rows = await listStudentTuitions(studentId);
            setAssigns(Array.isArray(rows) ? rows : []);
            if (Array.isArray(rows) && rows.length > 0) {
                const ym = rows[rows.length - 1].startMonth;
                setAssignForm((f) => ({ ...f, startMonth: nextMonth(ym) }));
            }
        } finally {
            setLoading(false);
        }
    };

    const loadInvoices = async () => {
        if (!canUse) { setInvoices([]); return; }
        setInvLoading(true);
        try {
            const rows = await listRecentInvoices(studentId, { size: 20 });
            setInvoices(Array.isArray(rows) ? rows : []);
        } finally {
            setInvLoading(false);
        }
    };

    const loadStagePrices = async () => {
        const stage = getStudentStage(studentDetail);          // E/M/H
        const gc    = getStudentGradeCode(studentDetail);      // E01..H03

        if (!canUse || !stage) { setStagePrices([]); return; }
        setPriceLoading(true);
        try {
            const rows = await listActiveTuitionPricesByStage(stage, {
                gradeCode: gc || null,
                grade_code: gc || null, // 서버 snake_case 대응
            });
            setStagePrices(Array.isArray(rows) ? rows : []);
            setAssignForm((f) => ({ ...f, priceIdx: 0 }));
        } catch {
            setStagePrices([]);
        } finally {
            setPriceLoading(false);
        }
    };

    useEffect(() => { loadAssigns();  /* eslint-disable-next-line */ }, [studentId]);
    useEffect(() => { loadInvoices(); /* eslint-disable-next-line */ }, [studentId]);

    useEffect(() => {
        if (!Array.isArray(priceOptions) || priceOptions.length === 0) {
            loadStagePrices();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        studentId,
        studentDetail?.schoolStage,
        studentDetail?.school_stage,
        studentDetail?.stage,
        studentDetail?.schoolLevel,
        studentDetail?.school_level,
        studentDetail?.gradeCode,
        studentDetail?.grade_code,
        studentDetail?.grade?.code,
        studentDetail?.schoolGradeCode,
        studentDetail?.school_grade_code,
        studentDetail?.gradeName,
        studentDetail?.grade?.name,
    ]);

    // 실제 사용 가격표 소스
    const effectivePrices = useMemo(() => {
        if (Array.isArray(priceOptions) && priceOptions.length > 0) return priceOptions;
        return stagePrices;
    }, [priceOptions, stagePrices]);

    // 학생 gradeCode 계산
    const studentGC = useMemo(() => getStudentGradeCode(studentDetail), [studentDetail]);

    // 2차 방어: 학생 학년코드 정확 일치만 통과
    const gradeStrictPrices = useMemo(() => {
        if (!studentGC) return effectivePrices;
        return (effectivePrices || []).filter((p) => getPriceGradeCode(p) === studentGC);
    }, [effectivePrices, studentGC]);

    // 드롭다운 라벨
    const priceList = useMemo(() => {
        if (!Array.isArray(gradeStrictPrices) || gradeStrictPrices.length === 0) return [];
        return gradeStrictPrices.map((p) => {
            const path = p.categoryPath || '';
            const name = p.name || p.priceName || '';
            const won  = p.price != null ? `(${Number(p.price).toLocaleString()}원)` : '';
            const unit = p.unit ? unitKo(p.unit) : '';
            const label = `${path ? path + ' · ' : ''}${name} ${won}`.trim();
            const title = `${path}${path ? ' / ' : ''}${name}${unit ? ` / ${unit}` : ''} ${won}`.trim();
            return { id: p.id, label, title, raw: p };
        });
    }, [gradeStrictPrices]);

    // 선택된 가격표 ID
    const chosenPriceId = useMemo(() => {
        if (priceList.length > 0) {
            const idx = assignForm.priceIdx ?? 0;
            const clamped = Math.max(0, Math.min(idx, priceList.length - 1));
            return priceList[clamped]?.id ?? null;
        }
        return assignForm.priceId ? Number(assignForm.priceId) : null;
    }, [priceList, assignForm.priceIdx, assignForm.priceId]);

    // ------------------------------ 액션 ------------------------------
    const doAssign = async () => {
        if (!canUse) return;
        const priceId = chosenPriceId;
        const ym = (assignForm.startMonth || '').trim();
        if (!priceId) return safeInfo('안내', '가격표를 선택하거나 ID를 입력하세요.');
        if (!/^\d{4}-\d{2}$/.test(ym)) return safeInfo('안내', '시작월을 YYYY-MM 형식으로 선택하세요.');
        try {
            await addStudentTuition(studentId, { tuitionPriceId: priceId, startMonth: ym });
            await safeOk('등록 완료', '수강료가 등록되었습니다.');
            await loadAssigns();
            onChanged?.();
        } catch (e) {
            const st = e?.response?.status;
            if (st === 409) return safeError('중복', '이미 활성 등록된 동일 수강료가 있습니다.');
            const msg = e?.response?.data?.message || e?.message || '등록 실패';
            safeError('오류', msg);
        }
    };

    const doGenerate = async () => {
        if (!canUse) return;
        const { fromMonth, toMonth } = genForm;
        if (!/^\d{4}-\d{2}$/.test(fromMonth) || !/^\d{4}-\d{2}$/.test(toMonth)) {
            return safeInfo('안내', '기간을 YYYY-MM 형식으로 선택하세요.');
        }
        try {
            const res = await generateMonthlyInvoices(studentId, { fromMonth, toMonth });
            await safeOk('청구 생성', `생성: ${res?.createdCount ?? 0}건`);
            await loadInvoices();
            onChanged?.();
        } catch (e) {
            const msg = e?.response?.data?.message || e?.message || '청구 생성 실패';
            safeError('오류', msg);
        }
    };

    const doPay = async (payload) => {
        if (!payTarget) return;
        try {
            await payInvoice(payTarget.id, payload);
            await safeOk('납부 처리', '완료되었습니다.');
            setPayOpen(false);
            setPayTarget(null);
            await loadInvoices();
            onChanged?.();
        } catch (e) {
            const msg = e?.response?.data?.message || e?.message || '납부 처리 실패';
            safeError('오류', msg);
        }
    };

    // 수정/삭제/토글
    const openEdit = (row) => { setEditTarget(row); setEditOpen(true); };
    const doSaveEdit = async (payload) => {
        try {
            await updateStudentTuition(studentId, editTarget.id, payload);
            await safeOk('수정 완료', '등록 정보가 수정되었습니다.');
            setEditOpen(false);
            setEditTarget(null);
            await loadAssigns();
            onChanged?.();
        } catch (e) {
            const st = e?.response?.status;
            if (st === 409) return safeError('충돌', '동일 수강료가 이미 활성 상태입니다.');
            const msg = e?.response?.data?.message || e?.message || '수정 실패';
            safeError('오류', msg);
        }
    };
    const doToggleActive = async (row) => {
        try {
            await updateStudentTuition(studentId, row.id, { active: !row.active, startMonth: row.startMonth });
            await safeOk('저장 완료', `등록이 ${!row.active ? '활성' : '비활성'} 처리되었습니다.`);
            await loadAssigns();
            onChanged?.();
        } catch (e) {
            const st = e?.response?.status;
            if (st === 409) return safeError('충돌', '동일 수강료의 활성 등록이 이미 존재합니다.');
            const msg = e?.response?.data?.message || e?.message || '처리 실패';
            safeError('오류', msg);
        }
    };
    const doDelete = async (row) => {
        // 간단 확인(프로젝트 공통 confirm 래퍼가 있으면 교체)
        const ok = window.confirm('이 등록을 삭제할까요?\n※ 연결된 청구서가 있으면 삭제할 수 없고 비활성화를 권장합니다.');
        if (!ok) return;
        try {
            await deleteStudentTuition(studentId, row.id);
            await safeOk('삭제 완료', '등록이 삭제되었습니다.');
            await loadAssigns();
            onChanged?.();
        } catch (e) {
            const msg = e?.response?.data?.message || e?.message || '삭제 실패';
            safeError('오류', msg);
        }
    };

    const stageCode = getStudentStage(studentDetail);
    const selectTitle = priceList[(assignForm.priceIdx ?? 0)]?.title || '';

    return (
        <div className="space-y-3 student-page">
            <div className="tuition-split">
                {/* ===================== 좌(40%) — 수강료 등록 & 목록 ===================== */}
                <div className="aa-card">
                    <div className="panel-header"><div className="panel-title">수강료 등록 &amp; 목록</div></div>

                    {/* 등록 폼 */}
                    <div className="space-y-3">
                        <div className="grid gap-3">
                            <label className="block">
                                <div className="text-sm mb-1 text-slate-300">
                                    가격표 * {priceLoading && <span className="ml-2 text-xs text-slate-400">(로딩…)</span>}
                                </div>

                                {priceList.length > 0 ? (
                                    <select
                                        className="aa-select w-full"
                                        value={assignForm.priceIdx}
                                        onChange={(e) => setAssignForm((f) => ({ ...f, priceIdx: Number(e.target.value) }))}
                                        title={selectTitle}
                                    >
                                        {priceList.map((p, idx) => (
                                            <option key={p.id} value={idx} title={p.title}>
                                                {p.label} (#{p.id})
                                            </option>
                                        ))}
                                    </select>
                                ) : (
                                    <>
                                        <input
                                            className="aa-input aa-input-contrast w-full"
                                            placeholder="가격표 ID (학부/학년 연동이 없으면 직접 입력)"
                                            value={assignForm.priceId}
                                            onChange={(e) => setAssignForm((f) => ({ ...f, priceId: e.target.value }))}
                                        />
                                        <div className="text-xs text-slate-400 mt-1">
                                            {stageCode
                                                ? '현재 학부/학년에 해당하는 활성 가격표가 없어요. ID를 직접 입력해 등록할 수 있습니다.'
                                                : '학생 학부/학년 정보가 없어 가격표를 불러올 수 없습니다.'}
                                        </div>
                                    </>
                                )}

                                {priceList.length > 0 && (
                                    <div className="text-xs text-slate-400 mt-1">
                                        학생 학부(<b>{stageCode || '-'}</b>) · 학년(<b>{studentGC || '-'}</b>) 기준으로 필터링된 가격표입니다.
                                    </div>
                                )}
                            </label>

                            <label className="block">
                                <div className="text-sm mb-1 text-slate-300">시작월 *</div>
                                <input
                                    type="month"
                                    className="aa-input aa-input-contrast w-full"
                                    value={assignForm.startMonth}
                                    onChange={(e) => setAssignForm((f) => ({ ...f, startMonth: e.target.value }))}
                                />
                            </label>
                        </div>

                        <div className="flex justify-end">
                            <button className="aa-btn aa-btn-primary" onClick={doAssign} disabled={!canUse}>등록</button>
                        </div>
                    </div>

                    {/* 등록 목록 */}
                    <div className="mt-3">
                        <div className="student-list-panel aa-table-wrap">
                            <table className="aa-table">
                                <thead>
                                <tr>
                                    <th style={{ width: 90 }}>시작월</th>
                                    <th>가격표</th>
                                    <th style={{ width: 100 }}>단위</th>
                                    <th style={{ width: 120 }}>금액</th>
                                    <th style={{ width: 70 }}>활성</th>
                                    <th style={{ width: 160 }}>동작</th>
                                </tr>
                                </thead>
                                <tbody>
                                {loading && <tr><td colSpan={6}>불러오는 중…</td></tr>}
                                {!loading && assigns.length === 0 && <tr><td colSpan={6}>등록 내역이 없습니다.</td></tr>}
                                {!loading && assigns.map((r) => (
                                    <tr key={r.id}>
                                        <td>{r.startMonth}</td>
                                        <td className="aa-ellipsis" title={r.categoryPath || ''}>
                                            {r.categoryPath || '-'} {(r.priceName || r.name) ? `· ${r.priceName || r.name}` : ''}
                                        </td>
                                        <td>{unitKo(r.unit) || '-'}</td>
                                        <td>{r.price != null ? Number(r.price).toLocaleString() : '-'}</td>
                                        <td>{r.active ? 'Y' : 'N'}</td>
                                        <td>
                                            <div className="flex gap-2">
                                                <button className="aa-btn aa-btn-sm" onClick={() => openEdit(r)}>수정</button>
                                                <button className="aa-btn aa-btn-sm" onClick={() => doToggleActive(r)}>
                                                    {r.active ? '비활성화' : '활성화'}
                                                </button>
                                                <button className="aa-btn aa-btn-danger aa-btn-sm" onClick={() => doDelete(r)}>삭제</button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="text-xs text-slate-400 mt-2">※ 삭제는 연결 청구서가 없는 경우에만 가능합니다. 그 외에는 비활성화를 사용하세요.</div>
                    </div>
                </div>

                {/* ===================== 우(60%) — 청구 생성 & 최근 청구서 ===================== */}
                <div className="aa-card">
                    <div className="panel-header"><div className="panel-title">청구 생성 &amp; 최근 청구서</div></div>

                    <div className="space-y-3">
                        <div className="grid md:grid-cols-4 gap-3 items-end">
                            <label className="block">
                                <div className="text-sm mb-1 text-slate-300">시작월 *</div>
                                <input
                                    type="month"
                                    className="aa-input aa-input-contrast w-full"
                                    value={genForm.fromMonth}
                                    onChange={(e) => setGenForm((f) => ({ ...f, fromMonth: e.target.value }))}
                                />
                            </label>
                            <label className="block">
                                <div className="text-sm mb-1 text-slate-300">종료월 *</div>
                                <input
                                    type="month"
                                    className="aa-input aa-input-contrast w-full"
                                    value={genForm.toMonth}
                                    onChange={(e) => setGenForm((f) => ({ ...f, toMonth: e.target.value }))}
                                />
                            </label>
                            <div className="flex gap-2 md:col-span-2">
                                <button className="aa-btn aa-btn-primary" onClick={doGenerate} disabled={!canUse}>청구 생성</button>
                                <button className="aa-btn" onClick={loadInvoices}>최근 청구 새로고침</button>
                            </div>
                        </div>
                        <div className="text-xs text-slate-400">※ 현재 로직은 요금 단위가 MONTH 인 가격표만 자동 청구합니다.</div>
                    </div>

                    <div className="mt-3">
                        <div className="student-list-panel aa-table-wrap">
                            <table className="aa-table">
                                <thead>
                                <tr>
                                    <th style={{ width: 90 }}>월</th>
                                    <th>항목</th>
                                    <th style={{ width: 120 }}>금액</th>
                                    <th style={{ width: 100 }}>상태</th>
                                    <th style={{ width: 120 }}>동작</th>
                                </tr>
                                </thead>
                                <tbody>
                                {invLoading && <tr><td colSpan={5}>불러오는 중…</td></tr>}
                                {!invLoading && invoices.length === 0 && <tr><td colSpan={5}>청구 내역이 없습니다.</td></tr>}
                                {!invLoading && invoices.map((inv) => (
                                    <tr key={inv.id}>
                                        <td>{inv.billMonth}</td>
                                        <td className="aa-ellipsis" title={inv.itemName}>{inv.itemName}</td>
                                        <td>{inv.amount != null ? Number(inv.amount).toLocaleString() : '-'}</td>
                                        <td>{inv.status}</td>
                                        <td>
                                            {(inv.status === 'PENDING' || inv.status === 'PARTIAL') ? (
                                                <button className="aa-btn aa-btn-primary aa-btn-sm"
                                                        onClick={() => { setPayTarget(inv); setPayOpen(true); }}>
                                                    납부
                                                </button>
                                            ) : (
                                                <span className="text-xs text-slate-400">-</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="text-xs text-slate-400 mt-2">※ 납부 저장 후 상태/누적금액은 DB 트리거로 자동 집계됩니다.</div>
                    </div>
                </div>
            </div>

            {/* 모달들 */}
            <PayModal
                open={payOpen}
                onClose={() => { setPayOpen(false); setPayTarget(null); }}
                invoice={payTarget}
                onSubmit={doPay}
            />
            <EditAssignModal
                open={editOpen}
                onClose={() => { setEditOpen(false); setEditTarget(null); }}
                row={editTarget}
                onSubmit={doSaveEdit}
            />
        </div>
    );
}