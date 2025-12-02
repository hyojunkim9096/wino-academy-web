// src/features/finance/TuitionCategoryManagePage.js
// ============================================================================
// 수강료 관리(카테고리 + 수강료) — 개선 UI v2.4
// - two-level/flat + 삭제/강제삭제
// - 🔁 DDL/백엔드 최신 스펙 반영:
//    * 카테고리(leaf)는 학년코드(공통코드) 필수 → gradeGroup/gradeCode 저장
//    * 수강료는 unit/price/enabled/memo/sortOrder 만 사용
// - 좌: 수강료 카테고리 트리 / 우: 선택 카테고리(leaf 또는 단일)의 수강료
// - StageTabs 전환 시 학부별 학년코드 목록 재로딩
// - 편집 중엔 정렬 저장/추가 일부 버튼 비활성 (오조작 방지)
// - SweetAlert 래퍼(alert.js): alertInfo/alertSuccess/alertError/confirmDialog
// - 코드/학부는 "편집 모드에서 불변" 정책(SubjectManagePage UX)
// - ✅ 용어
//     * 상위 카테고리: 1뎁스 분류
//     * 세부 카테고리: 2뎁스(leaf) — 수강료가 실제로 붙는 단위
// - ✅ TWO_LEVEL: true=상/세부 2뎁스, false=1뎁스(평면; 1뎁스=leaf)
// - ✅ 삭제 흐름: 일반 삭제 → 사용중(409) → 강제 삭제 여부 확인 → 처리
// ============================================================================

import React, { useEffect, useMemo, useRef, useState } from 'react';
// ※ 예전 TERM/TUITION_TYPE 공통코드 사용 제거됨
import {
    listTuitionCategoriesByParent,
    upsertTuitionCategoryNode,
    deleteTuitionCategory,
    reorderTuitionCategoriesByParent,
    listCategoryPrices,
    saveCategoryPrices,
    // ✅ 추가: 학부(stage)별 학년 공통코드 조회 API (E/M/H)
    //    - 예: GET /api/admin/tuition/grade-codes?stage=E|M|H
    //    - 반환: [{ code:'E01', name:'1학년' }, ...]
    listGradeCodesByStage,
} from '@/features/finance/api/tuitionCategoryApi.js';

import '@/features/system/styles/admin-system.css';
import '@/features/admin/styles/admin-academy.css';
import '@/features/finance/styles/admin-tuition.css';

import { alertInfo, alertSuccess, alertError, confirmDialog } from '@/common/ui/alert.js';

/** 운영 모드
 *  true  : 상/세부 2뎁스 트리. "세부 카테고리(leaf)"에만 수강료 등록
 *  false : 1뎁스(평면). 카테고리 자체가 leaf 역할
 */
const TWO_LEVEL = true;

/** 2뎁스 명칭(문구 한 곳에서 교체) */
const LOWER_LABEL = '세부 카테고리';

/** 학부(stage) → 공통코드 그룹 매핑 (DDL/백엔드와 동일해야 함) */
const stageToGroup = (s) => (s === 'E' ? 'GRADE_E' : s === 'M' ? 'GRADE_M' : s === 'H' ? 'GRADE_H' : null);

/** 학부 탭 */
function StageTabs({ value, onChange }) {
    const TABS = [
        { key: 'E', label: '초등부(E)' },
        { key: 'M', label: '중등부(M)' },
        { key: 'H', label: '고등부(H)' },
    ];
    const handle = (k, e) => {
        e?.preventDefault();
        e?.stopPropagation();
        if (k !== value) onChange(k);
    };
    return (
        <div className="aa-seg" role="tablist" aria-label="학부 선택">
            {TABS.map((t) => (
                <button
                    key={t.key}
                    type="button"
                    role="tab"
                    aria-selected={value === t.key}
                    className={value === t.key ? 'active' : ''}
                    onPointerDown={(e) => handle(t.key, e)}
                    onClick={(e) => handle(t.key, e)}
                >
                    {t.label}
                </button>
            ))}
        </div>
    );
}

export default function TuitionCategoryManagePage() {
    // ------------------------- 상태 -------------------------
    const [stage, setStage] = useState('E'); // 기본 E
    const [roots, setRoots] = useState([]); // 1뎁스(상위 카테고리)
    const [children, setChildren] = useState([]); // 2뎁스(세부 카테고리) — TWO_LEVEL에서만 사용
    const [parent, setParent] = useState(null); // 선택된 상위 카테고리 — TWO_LEVEL에서만 사용
    const [selected, setSelected] = useState(null); // 선택된 대상(leaf 또는 1뎁스)

    const [rootsDirty, setRootsDirty] = useState(false);
    const [childrenDirty, setChildrenDirty] = useState(false);

    const [q, setQ] = useState('');
    const [nodeForm, setNodeForm] = useState({ name: '', code: '', description: '' });
    const [editTarget, setEditTarget] = useState(null); // 편집 노드
    const formRef = useRef(null);

    // 우측: 수강료 (DDL 변경으로 단순화)
    //   - termCode/tuitionType/sessionsPerWeek/minutesPerSession/taxIncluded 제거
    //   - unit/price/enabled/memo/sortOrder 만 다룸
    const [priceRows, setPriceRows] = useState([]);

    // ✅ 학년 코드(공통코드) 상태
    const [grades, setGrades] = useState([]); // [{code:'E01', name:'1학년'}, ...]
    const [gradeCode, setGradeCode] = useState(''); // 선택된 학년 코드

    // ------------------------- 유틸 -------------------------
    const resetLeft = () => {
        setParent(null);
        setChildren([]);
        setSelected(null);
        setRootsDirty(false);
        setChildrenDirty(false);
    };
    const resetForm = () => {
        setNodeForm({ name: '', code: '', description: '' });
        setEditTarget(null);
        setGradeCode(''); // ← 폼 리셋 시 학년 선택 초기화
    };
    const scrollToForm = () => {
        try {
            formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } catch {}
    };

    // ------------------------- 로딩 -------------------------
    // ※ 예전 공통코드(TERM/TUITION_TYPE) 로딩 제거됨
    async function loadRoots() {
        const list = await listTuitionCategoriesByParent(stage, null);
        setRoots([...(list || [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)));
        setRootsDirty(false);
    }

    async function loadChildren(p) {
        if (!p) {
            setChildren([]);
            setParent(null);
            return;
        }
        setParent(p);
        const list = await listTuitionCategoriesByParent(stage, p.id);
        setChildren([...(list || [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)));
        setChildrenDirty(false);
    }

    // ✅ 학부별 학년(공통코드) 로딩
    async function loadGrades() {
        try {
            const list = await listGradeCodesByStage(stage);
            setGrades(list || []);
        } catch (e) {
            // 학년코드 로드 실패해도 카테고리 목록은 사용 가능하므로 경고만
            console.warn('학년 코드 로드 실패:', e);
        }
    }

    // 학부 전환 → 전체 초기화 + 학년코드 재로딩
    useEffect(() => {
        resetLeft();
        resetForm();
        setQ('');
        loadRoots().catch((e) => alertError('로드 실패', `루트 로딩 실패: ${String(e?.message || e)}`));
        setPriceRows([]);
        setSelected(null);
        loadGrades(); // ← 학년 코드 재로딩
    }, [stage]);

    // ------------------------- 트리 클릭 -------------------------
    async function clickRootRow(r) {
        resetForm();
        if (TWO_LEVEL) {
            // 2뎁스 모드: leaf면 우측 수강료, 아니면 children 로딩
            if (r.isLeaf) {
                setSelected(r);
                setChildren([]);
                setParent(null);
                const rows = await listCategoryPrices(r.id);
                setPriceRows((rows || []).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)));
            } else {
                await loadChildren(r);
                setSelected(null);
                setPriceRows([]);
            }
        } else {
            // 1뎁스(평면) 모드: r 선택 즉시 우측 수강료 (isLeaf 여부 무시)
            setSelected(r);
            setChildren([]);
            setParent(null);
            const rows = await listCategoryPrices(r.id);
            setPriceRows((rows || []).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)));
        }
    }

    async function clickChildRow(n) {
        // TWO_LEVEL=false 에선 children을 쓰지 않으므로 호출되지 않음
        resetForm();
        setSelected(n);
        const rows = await listCategoryPrices(n.id);
        setPriceRows((rows || []).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)));
    }

    async function backToRoot() {
        resetLeft();
        resetForm();
        setQ('');
        await loadRoots();
        setPriceRows([]);
        setSelected(null);
    }

    // ------------------------- 편집/저장 -------------------------
    function beginEdit(row) {
        setSelected(null);
        setPriceRows([]);
        setEditTarget(row);
        setNodeForm({
            name: row.name ?? '',
            code: row.code ?? '',
            description: row.description ?? '',
        });
        // ✅ 편집 대상이 leaf면 현재 학년코드를 폼에 바인딩
        setGradeCode(row.isLeaf ? (row.gradeCode || '') : '');
        scrollToForm();
    }

    async function saveCategoryCreate() {
        // 2뎁스: 상위 카테고리 추가
        // 1뎁스(flat): "카테고리 추가" == leaf(단일) 추가 → 학년 필수
        if (!nodeForm.name?.trim()) return alertInfo('입력 필요', '이름을 입력하세요.');

        const payload = {
            schoolStage: stage,
            name: nodeForm.name.trim(),
            code: nodeForm.code || null,
            description: nodeForm.description || null,
            depth: 1,
            parentId: null,
            sortOrder: 0,
            isLeaf: TWO_LEVEL ? false : true, // flat에서는 1뎁스가 곧 leaf
            useYn: true,
            // grade 필드는 아래에서 조건부로 채움
        };

        // ✅ flat 모드(=leaf 생성)일 때 학년 필수
        if (!TWO_LEVEL) {
            if (!gradeCode) return alertInfo('입력 필요', '학년을 선택하세요.');
            payload.gradeGroup = stageToGroup(stage);
            payload.gradeCode = gradeCode;
        }

        try {
            const saved = await upsertTuitionCategoryNode(payload, null);
            await loadRoots();
            resetForm();

            if (!TWO_LEVEL && saved?.id) {
                // flat 모드: 방금 추가한 항목 선택 → 우측 수강료 표시
                setSelected(saved);
                const rows = await listCategoryPrices(saved.id);
                setPriceRows((rows || []).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)));
            }
            alertSuccess('완료', '카테고리가 추가되었습니다.');
        } catch (e) {
            if (e?.response?.status === 409) alertError('충돌(409)', '동일 코드가 이미 존재합니다.');
            else alertError('오류', `저장 실패: ${String(e?.message || e)}`);
        }
    }

    async function saveLeafCreate() {
        // 2뎁스 전용: 세부(leaf) 추가 → 학년 필수
        if (!TWO_LEVEL) return; // flat 모드에선 사용 안 함
        if (!nodeForm.name?.trim()) return alertInfo('입력 필요', '이름을 입력하세요.');
        if (!parent) return alertInfo('안내', `${LOWER_LABEL}를 추가하려면 먼저 좌측에서 상위 카테고리를 선택하세요.`);
        if (!gradeCode) return alertInfo('입력 필요', '학년을 선택하세요.');

        const payload = {
            schoolStage: stage,
            name: nodeForm.name.trim(),
            code: nodeForm.code || null,
            description: nodeForm.description || null,
            depth: (parent.depth || 1) + 1,
            parentId: parent.id,
            sortOrder: 0,
            isLeaf: true,
            useYn: true,
            // ✅ leaf 저장: 학부→그룹 매핑 + 선택한 학년코드 동시 전송
            gradeGroup: stageToGroup(stage),
            gradeCode,
        };

        try {
            const saved = await upsertTuitionCategoryNode(payload, null);
            await loadChildren(parent);
            setSelected(saved);
            const rows = await listCategoryPrices(saved.id);
            setPriceRows((rows || []).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)));
            resetForm();
            alertSuccess('완료', `${LOWER_LABEL}가 추가되었습니다.`);
        } catch (e) {
            if (e?.response?.status === 409) alertError('충돌(409)', '동일 코드가 이미 존재합니다.');
            else alertError('오류', `저장 실패: ${String(e?.message || e)}`);
        }
    }

    async function saveEdit() {
        if (!editTarget) return;
        if (!nodeForm.name?.trim()) return alertInfo('입력 필요', '이름을 입력하세요.');

        // ✅ 편집 저장 시 leaf면 grade 필수, 비-leaf면 grade null 처리
        const isLeaf = !!editTarget.isLeaf;
        if (isLeaf && !gradeCode) return alertInfo('입력 필요', '학년을 선택하세요.');

        const payload = {
            schoolStage: editTarget.schoolStage, // 불변
            name: nodeForm.name.trim(),
            code: editTarget.code ?? null, // 불변(코드 수정 금지)
            description: nodeForm.description || null,
            depth: editTarget.depth,
            parentId: editTarget.parentId ?? null,
            sortOrder: editTarget.sortOrder ?? 0,
            isLeaf,
            useYn: editTarget.useYn !== false,
            gradeGroup: isLeaf ? stageToGroup(editTarget.schoolStage) : null,
            gradeCode:  isLeaf ? gradeCode : null,
        };

        try {
            await upsertTuitionCategoryNode(payload, editTarget.id);

            if (TWO_LEVEL) {
                if (editTarget.parentId == null) await loadRoots();
                else if (parent && parent.id === editTarget.parentId) await loadChildren(parent);
            } else {
                await loadRoots();
                // flat 모드: 수정 대상이 현재 선택이면 최신 수강료 갱신
                if (selected?.id === editTarget.id) {
                    const rows = await listCategoryPrices(editTarget.id);
                    setPriceRows((rows || []).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)));
                }
            }

            resetForm();
            alertSuccess(
                '완료',
                TWO_LEVEL ? (editTarget.isLeaf ? `${LOWER_LABEL}가 수정되었습니다.` : '카테고리가 수정되었습니다.') : '카테고리가 수정되었습니다.',
            );
        } catch (e) {
            if (e?.response?.status === 409) alertError('충돌(409)', '동일 코드가 있어 수정할 수 없습니다.(코드는 수정 불가)');
            else alertError('오류', `저장 실패: ${String(e?.message || e)}`);
        }
    }

    function cancelEdit() {
        resetForm();
    }

    // ------------------------- 삭제(일반/강제) -------------------------
    async function _deleteNodeWithConfirm(node) {
        if (!node) return;

        // 1차: 일반 삭제 확인
        const ok = await confirmDialog('삭제 확인', `"${node.name}" 을(를) 삭제할까요?`, { confirmText: '삭제' });
        if (!ok) return;

        const afterDeleteRefresh = async () => {
            // 선택/열린 상태 정리 및 목록 리프레시
            if (node.parentId == null) {
                // 상위 카테고리 삭제
                await loadRoots();
                if (selected?.id === node.id) {
                    setSelected(null);
                    setPriceRows([]);
                }
                if (parent?.id === node.id) {
                    setParent(null);
                    setChildren([]);
                }
            } else {
                // 세부 카테고리 삭제
                if (TWO_LEVEL) {
                    if (parent?.id === node.parentId) {
                        await loadChildren(parent);
                    } else {
                        await loadRoots();
                    }
                } else {
                    await loadRoots();
                }
                if (selected?.id === node.id) {
                    setSelected(null);
                    setPriceRows([]);
                }
            }
        };

        try {
            await deleteTuitionCategory(node.id, { force: false });
            await afterDeleteRefresh();
            alertSuccess('삭제 완료', '정상적으로 삭제되었습니다.');
        } catch (e) {
            const status = e?.response?.status;
            const msg = e?.response?.data?.message || '삭제할 수 없습니다.';
            if (status === 409) {
                // 2차: 사용중(409) → 강제 삭제 여부 확인
                const forceOk = await confirmDialog(
                    '사용 중으로 삭제 불가',
                    `${msg}\n\n정말 강제로 삭제할까요?\n(하위/수강료는 함께 삭제됩니다)`,
                    { confirmText: '강제 삭제' },
                );
                if (!forceOk) return;
                try {
                    await deleteTuitionCategory(node.id, { force: true });
                    await afterDeleteRefresh();
                    alertSuccess('강제 삭제 완료', '관련 항목을 포함해 삭제했습니다.');
                } catch (e2) {
                    alertError('삭제 실패', e2?.response?.data?.message || '강제 삭제에 실패했습니다.');
                }
            } else {
                alertError('삭제 실패', msg);
            }
        }
    }

    // ------------------------- 정렬 -------------------------
    const filteredRoots = useMemo(() => {
        const s = q.trim().toLowerCase();
        if (!s) return roots;
        return roots.filter((r) => (r.name || '').toLowerCase().includes(s) || (r.code || '').toLowerCase().includes(s));
    }, [q, roots]);

    function moveRoot(idx, dir) {
        if (q.trim()) return;
        if (editTarget) return;
        setRoots((curr) => {
            const to = Math.max(0, Math.min(curr.length - 1, idx + dir));
            if (to === idx) return curr;
            const arr = [...curr];
            const [x] = arr.splice(idx, 1);
            arr.splice(to, 0, x);
            return arr.map((n, i) => ({ ...n, sortOrder: i }));
        });
        setRootsDirty(true);
    }

    async function saveRootOrder() {
        if (q.trim()) return alertInfo('안내', '검색 중에는 순서를 저장할 수 없어요.');
        if (editTarget) return alertInfo('안내', '편집 중에는 순서를 저장할 수 없어요.');
        const ok = await confirmDialog('카테고리 순서 저장', '현재 순서를 저장할까요?', { confirmText: '저장' });
        if (!ok) return;
        try {
            const ids = roots.map((r) => r.id);
            await reorderTuitionCategoriesByParent(stage, null, ids);
            await loadRoots();
            alertSuccess('완료', '카테고리 순서를 저장했습니다.');
        } catch (e) {
            alertError('오류', '순서 저장 실패');
        }
    }

    function moveChild(idx, dir) {
        if (!TWO_LEVEL) return; // flat 모드에선 사용 안 함
        if (editTarget) return;
        setChildren((curr) => {
            const to = Math.max(0, Math.min(curr.length - 1, idx + dir));
            if (to === idx) return curr;
            const arr = [...curr];
            const [x] = arr.splice(idx, 1);
            arr.splice(to, 0, x);
            return arr.map((n, i) => ({ ...n, sortOrder: i }));
        });
        setChildrenDirty(true);
    }

    async function saveChildrenOrder() {
        if (!TWO_LEVEL) return;
        if (!parent) return;
        if (editTarget) return alertInfo('안내', '편집 중에는 순서를 저장할 수 없어요.');
        const ok = await confirmDialog(`${LOWER_LABEL} 순서 저장`, `현재 ${LOWER_LABEL} 순서를 저장할까요?`, { confirmText: '저장' });
        if (!ok) return;
        try {
            const ids = children.map((c) => c.id);
            await reorderTuitionCategoriesByParent(stage, parent.id, ids);
            await loadChildren(parent);
            alertSuccess('완료', `${LOWER_LABEL} 순서를 저장했습니다.`);
        } catch (e) {
            alertError('오류', '순서 저장 실패');
        }
    }

    const isDepth1On = (r) => parent?.id === r.id || selected?.id === r.id;

    // ------------------------- 우측: 수강료 행 (단순 스펙) -------------------------
    const addPriceRow = () =>
        setPriceRows((v) => [
            ...v,
            {
                unit: 'MONTH', // 'MONTH' | 'TERM' | 'SESSION'
                price: 0,
                enabled: true,
                memo: '',
                sortOrder: v.length,
            },
        ]);

    const removePriceRow = (idx) => setPriceRows((v) => v.filter((_, i) => i !== idx));

    const movePriceRow = (idx, dir) =>
        setPriceRows((v) => {
            const to = Math.max(0, Math.min(v.length - 1, idx + dir));
            const arr = [...v];
            const [x] = arr.splice(idx, 1);
            arr.splice(to, 0, x);
            return arr.map((r, i) => ({ ...r, sortOrder: i }));
        });

    const savePriceRowsAll = async () => {
        if (!selected)
            return alertInfo('안내', TWO_LEVEL ? `좌측에서 ${LOWER_LABEL}(leaf)을 선택하세요.` : '좌측에서 카테고리를 선택하세요.');
        // ✅ 더 이상 학기/유형 등 필수값 검사 없음
        const ok = await confirmDialog('수강료 저장', '현재 목록으로 저장할까요?', { confirmText: '저장' });
        if (!ok) return;
        try {
            const body = priceRows.map((r, i) => ({
                unit: r.unit || 'MONTH',
                price: Number(r.price || 0),
                enabled: r.enabled !== false,
                memo: r.memo || '',
                sortOrder: i,
            }));
            await saveCategoryPrices(selected.id, body);
            const fresh = await listCategoryPrices(selected.id);
            setPriceRows((fresh || []).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)));
            alertSuccess('완료', '수강료가 저장되었습니다.');
        } catch (e) {
            alertError('오류', e?.response?.data?.message || '수강료 저장 실패');
        }
    };

    // ------------------------- 렌더 -------------------------
    // 학년 드롭다운 노출 조건:
    // - 생성: (TWO_LEVEL && parent 선택됨) || (!TWO_LEVEL)  → 즉 leaf가 될 상황
    // - 수정: editTarget?.isLeaf === true
    const showGradeSelector =
        (!editTarget && ((TWO_LEVEL && !!parent) || !TWO_LEVEL)) || (editTarget && !!editTarget.isLeaf);

    return (
        <div className="aa-page academy-page tuition-page">
            <div className="aa-container">
                {/* 상단 툴바 */}
                <div className="aa-toolbar aa-topbar" style={{ gap: '.75rem', alignItems: 'center' }}>
                    <div style={{ marginRight: 'auto' }}>
                        <h1 className="aa-title">수강료 관리</h1>
                        <p className="aa-subtle">
                            {TWO_LEVEL
                                ? `수강료 카테고리(좌: 상위/${LOWER_LABEL})와 선택 항목의 수강료(우)를 한 화면에서 관리합니다.`
                                : '수강료 카테고리(좌)와 선택 카테고리의 수강료(우)를 한 화면에서 관리합니다.'}
                        </p>
                    </div>
                </div>

                <div className="aa-split">
                    {/* 좌: 카테고리 트리 */}
                    <section className="aa-card">
                        <div className="flex items-center justify-between mb-2">
                            <StageTabs value={stage} onChange={(k) => setStage(k)} />
                            <button className="aa-btn" onClick={backToRoot}>
                                초기화
                            </button>
                        </div>

                        {/* TWO_LEVEL에 따라 2열/1열 레이아웃 */}
                        <div className={`tr-tree ${TWO_LEVEL ? '' : 'flat'}`}>
                            {/* Depth 1 (상위 카테고리) */}
                            <div className="tr-col">
                                <div className="tr-col-title">{TWO_LEVEL ? '상위 카테고리' : '카테고리'}</div>

                                {/* 검색 */}
                                <div className="aa-search mb-6">
                                    <input
                                        className="aa-input"
                                        placeholder="카테고리 검색(이름/코드)"
                                        value={q}
                                        onChange={(e) => setQ(e.target.value)}
                                    />
                                    {q && (
                                        <button type="button" className="aa-btn aa-btn-sm" onClick={() => setQ('')}>
                                            ×
                                        </button>
                                    )}
                                </div>

                                {filteredRoots.map((r, idx) => (
                                    <div
                                        key={r.id}
                                        className={`tr-node clickable ${isDepth1On(r) ? 'on' : ''}`}
                                        onClick={() => clickRootRow(r)}
                                    >
                                        <div className="tr-label">
                                            <span className="tr-name">{r.name}</span>
                                        </div>

                                        {/* 우측 액션들(정렬/편집/삭제) — 클릭 전파 방지 */}
                                        <div className="tr-actions" onClick={(e) => e.stopPropagation()}>
                                            {!q && (
                                                <span className="tr-reorder">
                          <button
                              className="aa-btn aa-btn-sm"
                              onClick={() => moveRoot(idx, -1)}
                              title="위로"
                              disabled={!!editTarget}
                          >
                            ▲
                          </button>
                          <button
                              className="aa-btn aa-btn-sm"
                              onClick={() => moveRoot(idx, 1)}
                              title="아래로"
                              disabled={!!editTarget}
                          >
                            ▼
                          </button>
                        </span>
                                            )}
                                            <button className="aa-btn aa-btn-sm" onClick={() => beginEdit(r)}>
                                                편집
                                            </button>
                                            <button className="aa-btn aa-btn-danger aa-btn-sm" onClick={() => _deleteNodeWithConfirm(r)}>
                                                삭제
                                            </button>
                                        </div>
                                    </div>
                                ))}
                                {filteredRoots.length === 0 && <div className="aa-subtle">카테고리가 없습니다.</div>}
                            </div>

                            {/* Depth 2 (세부 카테고리 / leaf) — TWO_LEVEL에서만 표시 */}
                            {TWO_LEVEL && (
                                <div className="tr-col">
                                    <div className="tr-col-title">
                                        {LOWER_LABEL} {parent ? <strong>({parent.name})</strong> : null}
                                    </div>

                                    {children.map((n, idx) => (
                                        <div
                                            key={n.id}
                                            className={`tr-node clickable ${selected?.id === n.id ? 'on' : ''}`}
                                            onClick={() => clickChildRow(n)}
                                        >
                                            <div className="tr-label">
                                                <span className="tr-name">{n.name}</span>
                                            </div>
                                            <div className="tr-actions" onClick={(e) => e.stopPropagation()}>
                        <span className="tr-reorder">
                          <button
                              className="aa-btn aa-btn-sm"
                              onClick={() => moveChild(idx, -1)}
                              title="위로"
                              disabled={!!editTarget}
                          >
                            ▲
                          </button>
                          <button
                              className="aa-btn aa-btn-sm"
                              onClick={() => moveChild(idx, 1)}
                              title="아래로"
                              disabled={!!editTarget}
                          >
                            ▼
                          </button>
                        </span>
                                                <button className="aa-btn aa-btn-sm" onClick={() => beginEdit(n)}>
                                                    편집
                                                </button>
                                                <button className="aa-btn aa-btn-danger aa-btn-sm" onClick={() => _deleteNodeWithConfirm(n)}>
                                                    삭제
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                    {children.length === 0 && (
                                        <div className="aa-subtle">{parent ? `${LOWER_LABEL}가 없습니다.` : '좌측 카테고리를 선택하세요.'}</div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* 하단 폼 */}
                        <hr className="aa-divider" />
                        <div ref={formRef} className="subject-form-block">
                            {editTarget && (
                                <div className="form-mode-banner">
                                    <span className="badge">편집중</span>
                                    <span className="text">
                    {TWO_LEVEL ? (editTarget.isLeaf ? `${LOWER_LABEL}` : '카테고리') : '카테고리'}{' '}
                                        <strong>{editTarget.name}</strong> 를 수정하고 있습니다.
                  </span>
                                    <div style={{ marginLeft: 'auto', display: 'flex', gap: '.35rem' }}>
                                        <button className="aa-btn aa-btn-sm" onClick={cancelEdit}>
                                            취소
                                        </button>
                                        {/* 편집 배너에서도 바로 삭제 가능 */}
                                        <button className="aa-btn aa-btn-danger aa-btn-sm" onClick={() => _deleteNodeWithConfirm(editTarget)}>
                                            삭제
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* 이름/코드/설명 */}
                            <div className="aa-form-grid-3">
                                <label className="aa-field">
                                    <span className="aa-label">이름</span>
                                    <input
                                        className="aa-input"
                                        value={nodeForm.name}
                                        onChange={(e) => setNodeForm((v) => ({ ...v, name: e.target.value }))}
                                    />
                                </label>
                                <label className="aa-field">
                  <span className="aa-label">
                    코드 {editTarget && <small className="aa-subtle">(수정 불가)</small>}
                  </span>
                                    <input
                                        className="aa-input"
                                        value={nodeForm.code}
                                        onChange={(e) => setNodeForm((v) => ({ ...v, code: e.target.value }))}
                                        disabled={!!editTarget}
                                        title={editTarget ? '코드는 수정할 수 없습니다.' : ''}
                                    />
                                </label>
                                <label className="aa-field">
                                    <span className="aa-label">설명</span>
                                    <input
                                        className="aa-input"
                                        value={nodeForm.description}
                                        onChange={(e) => setNodeForm((v) => ({ ...v, description: e.target.value }))}
                                    />
                                </label>
                            </div>

                            {/* ✅ (조건부) 학년 선택 — leaf 생성/수정 또는 flat 모드에서 노출 */}
                            {showGradeSelector && (
                                <div className="aa-form-grid-3">
                                    <label className="aa-field">
                                        <span className="aa-label">학년</span>
                                        <select
                                            className="aa-select"
                                            value={gradeCode}
                                            onChange={(e) => setGradeCode(e.target.value)}
                                        >
                                            <option value="">-- 학년 선택 --</option>
                                            {grades.map((g) => (
                                                <option key={g.code} value={g.code}>
                                                    {g.name} ({g.code})
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                </div>
                            )}

                            {/* 하단 액션 — 좌: 생성/수정, 우: 정렬 저장 */}
                            <div className="actions-footer" style={{ marginTop: '.7rem' }}>
                                <div className="left">
                                    {!editTarget && (
                                        <>
                                            {/* 1뎁스 추가 버튼: flat 모드에선 leaf 자체 추가로 동작(학년 필수) */}
                                            <button className="aa-btn" onClick={saveCategoryCreate}>
                                                카테고리 추가
                                            </button>

                                            {/* 2뎁스 전용: 세부(leaf) 추가(학년 필수) */}
                                            {TWO_LEVEL && (
                                                <button className="aa-btn aa-btn-primary" onClick={saveLeafCreate}>
                                                    {LOWER_LABEL} 추가
                                                </button>
                                            )}
                                        </>
                                    )}

                                    {editTarget && !editTarget.isLeaf && (
                                        <>
                                            <button className="aa-btn aa-btn-primary" onClick={saveEdit}>
                                                카테고리 수정
                                            </button>
                                            <button className="aa-btn" disabled>
                                                {LOWER_LABEL} 추가
                                            </button>
                                        </>
                                    )}

                                    {editTarget && editTarget.isLeaf && (
                                        <>
                                            <button className="aa-btn" disabled>
                                                카테고리 추가
                                            </button>
                                            <button className="aa-btn aa-btn-primary" onClick={saveEdit}>
                                                {LOWER_LABEL} 수정
                                            </button>
                                        </>
                                    )}
                                </div>

                                <div className="right">
                                    <button
                                        className="aa-btn"
                                        disabled={!rootsDirty || !!q || !!editTarget}
                                        onClick={saveRootOrder}
                                        title={q ? '검색 중 비활성' : editTarget ? '편집 중 비활성' : ''}
                                    >
                                        카테고리 순서 저장
                                    </button>

                                    {/* 2뎁스 전용: 세부 카테고리 순서 저장 */}
                                    {TWO_LEVEL && (
                                        <button
                                            className="aa-btn"
                                            disabled={!childrenDirty || !parent || !!editTarget}
                                            onClick={saveChildrenOrder}
                                            title={editTarget ? '편집 중 비활성' : ''}
                                        >
                                            {LOWER_LABEL} 순서 저장
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* 우: 수강료(선택 대상) */}
                    <section className="aa-card">
                        <div className="flex items-center justify-between">
                            <h2 className="aa-title--sm">수강료</h2>
                            <div className="aa-subtle">
                                {selected
                                    ? `선택 대상: ${selected.name}`
                                    : TWO_LEVEL
                                        ? `좌측에서 ${LOWER_LABEL}(leaf)을 선택하세요.`
                                        : '좌측에서 카테고리를 선택하세요.'}
                            </div>
                        </div>

                        {!selected ? (
                            <div className="aa-subtle">
                                {TWO_LEVEL ? `${LOWER_LABEL}(leaf)을 선택하면 수강료 행을 편집할 수 있어요.` : '카테고리를 선택하면 수강료 행을 편집할 수 있어요.'}
                            </div>
                        ) : (
                            <>
                                <div className="aa-row mb-3 price-actions">
                                    <button className="aa-btn aa-btn-outline" onClick={addPriceRow}>
                                        행 추가
                                    </button>
                                    <button className="aa-btn aa-btn-primary" onClick={savePriceRowsAll}>
                                        수강료 저장
                                    </button>
                                </div>

                                <div className="aa-table-wrap">
                                    <table className="aa-table">
                                        <thead>
                                        <tr>
                                            <th className="price-col-sm">단위</th>
                                            <th className="price-col-sm">금액</th>
                                            <th className="price-mini-col">사용</th>
                                            <th>메모</th>
                                            <th className="price-mini-col">정렬</th>
                                            <th className="price-mini-col">삭제</th>
                                        </tr>
                                        </thead>
                                        <tbody>
                                        {priceRows.map((r, idx) => (
                                            <tr key={idx}>
                                                <td>
                                                    <select
                                                        className="aa-select"
                                                        value={r.unit || 'MONTH'}
                                                        onChange={(e) =>
                                                            setPriceRows((v) => v.map((x, i) => (i === idx ? { ...x, unit: e.target.value } : x)))
                                                        }
                                                    >
                                                        <option value="MONTH">월</option>
                                                        <option value="TERM">학기</option>
                                                        <option value="SESSION">회차</option>
                                                    </select>
                                                </td>
                                                <td>
                                                    <input
                                                        type="number"
                                                        className="aa-input"
                                                        value={r.price}
                                                        onChange={(e) =>
                                                            setPriceRows((v) =>
                                                                v.map((x, i) => (i === idx ? { ...x, price: Number(e.target.value || 0) } : x)),
                                                            )
                                                        }
                                                    />
                                                </td>
                                                <td>
                                                    <select
                                                        className="aa-select"
                                                        value={r.enabled ? '1' : '0'}
                                                        onChange={(e) =>
                                                            setPriceRows((v) =>
                                                                v.map((x, i) => (i === idx ? { ...x, enabled: e.target.value === '1' } : x)),
                                                            )
                                                        }
                                                    >
                                                        <option value="1">사용</option>
                                                        <option value="0">중지</option>
                                                    </select>
                                                </td>
                                                <td>
                                                    <input
                                                        className="aa-input"
                                                        value={r.memo || ''}
                                                        onChange={(e) =>
                                                            setPriceRows((v) => v.map((x, i) => (i === idx ? { ...x, memo: e.target.value } : x)))
                                                        }
                                                    />
                                                </td>
                                                <td className="text-center">
                                                    <div className="aa-btn-group">
                                                        <button className="aa-btn aa-btn-sm" onClick={() => movePriceRow(idx, -1)}>
                                                            ▲
                                                        </button>
                                                        <button className="aa-btn aa-btn-sm" onClick={() => movePriceRow(idx, 1)}>
                                                            ▼
                                                        </button>
                                                    </div>
                                                </td>
                                                <td className="text-center">
                                                    <button className="aa-btn aa-btn-danger aa-btn-sm" onClick={() => removePriceRow(idx)}>
                                                        삭제
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                        {priceRows.length === 0 && (
                                            <tr>
                                                <td colSpan={6} className="aa-subtle">
                                                    수강료가 없습니다. 상단 “행 추가”로 등록하세요.
                                                </td>
                                            </tr>
                                        )}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        )}
                    </section>
                </div>
            </div>
        </div>
    );
}