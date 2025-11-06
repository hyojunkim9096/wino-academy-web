// src/features/admin/pages/ClassManagePage.jsx
/**
 * 반 관리 페이지 (단일/일괄)
 * -----------------------------------------------------------------------------
 * ✅ 변경 요약
 *  - 공통코드(학년 GRADE_* / 학급 CLASS_CODE) 로드 및 셀렉트 추가
 *  - 반 목록 카드에 gradeCode/classCode 뱃지 표시
 *  - 저장(단일/일괄) 시 gradeCode/classCode 함께 전송
 *  - EXAM_PREP 학기 안내/제어는 기존 로직 유지
 *
 * DDL 동기화 사항
 *  - 시간 스냅샷: ClassAssignPanel 에서 startTimeCode/startTimeName → 서버 전송
 *    → 서버는 class_timeslot.class_time_code/label 로 저장 (DDL 반영)
 * -----------------------------------------------------------------------------
 */

import React, { useEffect, useMemo, useState } from 'react';

// 상단 공통 UI
import StageTabs from '@/features/admin/components/StageTabs';
import LocationChips from '@/features/admin/components/LocationChips';
import HomeroomPicker from '@/features/admin/components/HomeroomPicker';

// API
import {
    listClasses,
    createClass,
    updateClass,
    reorderClasses, // 반 순서 저장 API
} from '@/api/academyClassApi';
import { listSemesters as listSemestersApi, getSemester } from '@/api/academySemesterApi';
import { getCodes } from '@/api/commonCodeAdminApi';

// 서브탭 컴포넌트
import SubjectsPickPanel from '@/features/admin/components/class/SubjectsPickPanel';
import ClassAssignPanel from '@/features/admin/components/class/ClassAssignPanel';

// 공통 스타일
import '@/styles/admin.css';
import '@/styles/admin-school.css';
import '@/styles/admin-academy.css';
import '@/styles/admin-system.css';
import '@/styles/admin-class.css';

// 알럿(공통)
import { alertSuccess, alertError, alertInfo } from '@/ui/alert';

// 기본 주차 (TERM_WEEK_COUNT 공통코드가 없을 때 폴백)
const DEFAULT_WEEKS = { E: 13, M: 8, H: 8 };

/** 공통코드 TERM_WEEK_COUNT(stage별) → 주차 기본값 가져오기 */
async function fetchTermWeekCount(stageCode) {
    try {
        const rows = await getCodes('TERM_WEEK_COUNT');
        const hit = (rows || []).find(
            (r) => String(r.code).toUpperCase() === String(stageCode || '').toUpperCase()
        );
        const raw = hit?.name ?? '';
        const m = String(raw).match(/\d+/);
        const n = m ? parseInt(m[0], 10) : NaN;
        return Number.isFinite(n) && n > 0 ? n : null;
    } catch {
        return null;
    }
}

/** 날짜 범위 → 주차수(포함) */
function weeksBetweenInclusive(startDate, endDate) {
    if (!startDate || !endDate) return null;
    try {
        const s = new Date(startDate + 'T00:00:00');
        const e = new Date(endDate + 'T00:00:00');
        const ms = e.getTime() - s.getTime() + 24 * 60 * 60 * 1000;
        if (ms <= 0) return 1;
        return Math.max(1, Math.ceil(ms / (7 * 24 * 60 * 60 * 1000)));
    } catch {
        return null;
    }
}

/** 학기 → 시험대비 여부 / 기간 기반 주차 */
function deriveSemesterMeta(semester) {
    const type = semester?.semesterType || 'REGULAR';
    const weeks = weeksBetweenInclusive(semester?.startDate, semester?.endDate);
    return { isExamPrep: type === 'EXAM_PREP', weeksFromRange: weeks };
}

/** 일괄생성용: 배열 중복코드 탐색 */
function findDuplicateCode(codes) {
    const seen = new Set();
    for (const c of codes) {
        if (!c) continue;
        if (seen.has(c)) return c;
        seen.add(c);
    }
    return null;
}

/** 배열 이동 유틸(드래그 정렬) */
function arrayMove(arr, from, to) {
    if (from === to) return arr;
    const copy = arr.slice();
    const item = copy.splice(from, 1)[0];
    copy.splice(to, 0, item);
    return copy;
}

export default function ClassManagePage() {
    // 상단 상태
    const [stage, setStage] = useState(''); // E/M/H
    const [work, setWork] = useState('');   // 지점 코드
    const [mode, setMode] = useState('single'); // 'single' | 'bulk'

    // 좌측 반 목록/선택
    const [classes, setClasses] = useState([]);
    const [sel, setSel] = useState(null);
    const [createMode, setCreateMode] = useState(false);

    // 좌측 정렬 상태(드래그)
    const [draggingId, setDraggingId] = useState(null);
    const [dropTargetId, setDropTargetId] = useState(null);
    const [orderDirty, setOrderDirty] = useState(false);
    const [savingOrder, setSavingOrder] = useState(false);

    // ✅ 공통코드 옵션(학년/학급)
    const [gradeOptions, setGradeOptions] = useState([]); // [{code,name,sortOrder,...}]
    const [classOptions, setClassOptions] = useState([]); // CLASS_CODE 공통코드

    // 우측 폼(기본 정보)
    const blankForm = useMemo(
        () => ({
            code: '',
            name: '',
            capacity: 20,
            status: 'OPEN',
            semesterId: null,
            homeroomTeacherId: null,
            // ✅ NEW: 공통코드
            gradeCode: '',
            classCode: '',
        }),
        []
    );
    const [form, setForm] = useState(blankForm);

    // 학기/시험대비
    const [semesters, setSemesters] = useState([]);
    const [isExamPrep, setIsExamPrep] = useState(false);

    // (정보용) 학기 주차 기본값
    const [weekCount, setWeekCount] = useState(8);

    // 우측 서브 탭: 과목 편성 | 담당 관리
    const [subTab, setSubTab] = useState('subjects'); // 'subjects' | 'assign'

    // ──────────────────────────────────────────────────────────────
    // CLASS_CODE 는 전 학부 공통 → 최초 1회 로드
    useEffect(() => {
        (async () => {
            try {
                const rows = await getCodes('CLASS_CODE');
                setClassOptions(rows || []);
            } catch {
                setClassOptions([]);
            }
        })();
    }, []);

    // 모드 전환 시 전체 초기화
    useEffect(() => {
        setSel(null);
        setCreateMode(false);
        setSubTab('subjects');
        setForm(blankForm);
        setIsExamPrep(false);
    }, [mode, blankForm]);

    // stage 변경 → 전체 초기화 + 학기/학년코드 로드
    useEffect(() => {
        (async () => {
            setSel(null);
            setCreateMode(false);
            setForm((f)=>({ ...blankForm, classCode: f.classCode })); // 학급코드는 유지 가능
            setIsExamPrep(false);
            setOrderDirty(false);
            setDraggingId(null);
            setDropTargetId(null);

            try {
                if (!stage) {
                    setSemesters([]);
                    setClasses([]);
                    setGradeOptions([]);
                    return;
                }
                const list = await listSemestersApi(stage);
                // 초등(E)에서는 EXAM_PREP 학기 숨김 (서버/DDL에서도 금지)
                const filtered =
                    String(stage).toUpperCase() === 'E'
                        ? (list || []).filter((s) => s.semesterType !== 'EXAM_PREP')
                        : list || [];
                setSemesters(filtered);

                // ✅ 학년코드: 학부별 키 매핑
                const gradeKey = `GRADE_${String(stage).toUpperCase()}`; // E/M/H
                try {
                    const gRows = await getCodes(gradeKey);
                    setGradeOptions(gRows || []);
                } catch {
                    setGradeOptions([]);
                }

                const def = DEFAULT_WEEKS[stage] ?? 8;
                const override = await fetchTermWeekCount(stage);
                setWeekCount(override ?? def);
            } catch (e) {
                console.error('[ClassManagePage] listSemesters fail:', e);
                alertError('로드 실패', '학기 목록을 불러오지 못했습니다.');
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stage]);

    // work 변경 → 전체 초기화
    useEffect(() => {
        setSel(null);
        setCreateMode(false);
        setForm((f)=>({ ...blankForm, classCode: f.classCode }));
        setIsExamPrep(false);
        setOrderDirty(false);
        setDraggingId(null);
        setDropTargetId(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [work]);

    // 반 목록 로드
    const load = async () => {
        try {
            if (!stage || !work) {
                setClasses([]);
                return;
            }
            const data = await listClasses(work, stage);
            setClasses(Array.isArray(data) ? data : []);
            setOrderDirty(false);
        } catch (e) {
            console.error('[ClassManagePage] listClasses fail:', e);
            alertError('로드 실패', '반 목록을 불러오지 못했습니다.');
        }
    };
    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stage, work, mode]);

    // 좌측 반 선택 (※ 일괄 모드에서는 선택 동작하지 않도록 처리)
    const selectClass = async (cls) => {
        if (mode === 'bulk') return; // UI에서도 막지만 안전장치
        setSel(cls);
        setCreateMode(false);
        setSubTab('subjects'); // 반 바뀌면 기본 탭으로
        setForm({
            code: cls.code,
            name: cls.name,
            capacity: cls.capacity ?? 20,
            status: cls.status ?? 'OPEN',
            semesterId: cls.semesterId ?? null,
            homeroomTeacherId: cls.homeroomTeacherId ?? null,
            // ✅ NEW
            gradeCode: cls.gradeCode ?? '',
            classCode: cls.classCode ?? '',
        });
        await applySemesterMeta(cls.semesterId);
    };

    // 신규
    const beginCreate = async () => {
        setSel(null);
        setCreateMode(true);
        setForm((f)=>({ ...blankForm, classCode: f.classCode })); // 학급코드는 유지 가능
        setIsExamPrep(false);
        setSubTab('subjects');
    };

    // 학기 파생 반영
    const applySemesterMeta = async (semesterId) => {
        if (semesterId) {
            try {
                const sem = await getSemester(semesterId);
                const { isExamPrep, weeksFromRange } = deriveSemesterMeta(sem);
                setIsExamPrep(isExamPrep);
                if (weeksFromRange) {
                    setWeekCount(weeksFromRange);
                } else {
                    const def = DEFAULT_WEEKS[stage] ?? 8;
                    const override = await fetchTermWeekCount(stage);
                    setWeekCount(override ?? def);
                }
            } catch (e) {
                console.warn('[applySemesterMeta] getSemester fail:', e);
                setIsExamPrep(false);
            }
        } else {
            setIsExamPrep(false);
            const def = DEFAULT_WEEKS[stage] ?? 8;
            const override = await fetchTermWeekCount(stage);
            setWeekCount(override ?? def);
        }
    };

    // 저장(반 기본정보)
    const save = async () => {
        if (!work || !stage) return alertInfo('안내', '학부/지점을 먼저 선택하세요.');
        if (!form.code?.trim() || !form.name?.trim())
            return alertInfo('확인', '코드/이름은 필수입니다.');
        if (!sel && (form.semesterId == null || form.semesterId === '')) {
            return alertInfo('확인', '신규 반 생성 시 학기를 선택하세요.');
        }

        // ✅ 간단 검증: gradeCode ↔ stage 접두 일치
        if (form.gradeCode) {
            const g0 = String(form.gradeCode)[0]?.toUpperCase?.();
            const s0 = String(stage)[0]?.toUpperCase?.();
            if (g0 && s0 && g0 !== s0) {
                return alertInfo('확인', '학년 코드는 학부(E/M/H)와 일치해야 합니다.');
            }
        }

        const payload = {
            workLocationCode: work,
            schoolStage: stage,
            code: form.code.trim(),
            name: form.name.trim(),
            capacity: Number(form.capacity || 0),
            status: form.status || 'OPEN',
            // ✅ NEW: 공통코드 동봉(선택)
            gradeCode: form.gradeCode || null,
            classCode: form.classCode || null,
        };
        if (form.semesterId != null && form.semesterId !== '') payload.semesterId = Number(form.semesterId);
        if (form.homeroomTeacherId != null && form.homeroomTeacherId !== '')
            payload.homeroomTeacherId = Number(form.homeroomTeacherId);

        try {
            const saved = sel ? await updateClass(sel.id, payload) : await createClass(payload);
            await load();
            if (mode === 'single') {
                setCreateMode(false);
                selectClass(saved);
            } else {
                setForm((f)=>({ ...blankForm, classCode: f.classCode }));
                setSel(null);
                setCreateMode(false);
            }
            await alertSuccess('저장 완료', '반 정보가 저장되었습니다.');
        } catch (e) {
            const data = e?.response?.data;
            console.error('[ClassManagePage] save fail:', e, '\n[server data]:', data);
            const msg =
                (data && (data.message || data.error || JSON.stringify(data))) ||
                e.message ||
                '저장 중 오류가 발생했습니다.';
            await alertError('저장 실패', msg);
        }
    };

    const onPickSemester = async (semesterId) => {
        setForm((f) => ({ ...f, semesterId: semesterId || null }));
        await applySemesterMeta(semesterId);
    };

    // 좌측: 드래그/드롭 핸들러들
    const onDragStartHandle = (e, id) => {
        setDraggingId(id);
        // 드래그 이미지를 투명 처리(브라우저 기본 미리보기 제거)
        if (e.dataTransfer && e.dataTransfer.setDragImage) {
            const img = new Image();
            img.src =
                'data:image/svg+xml;charset=utf-8,' +
                encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
            e.dataTransfer.setDragImage(img, 0, 0);
        }
        if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', String(id));
        }
    };
    const onDragOverItem = (e, overId) => {
        e.preventDefault();
        if (dropTargetId !== overId) setDropTargetId(overId);
    };
    const onDropItem = (e, overId) => {
        e.preventDefault();
        const dragged = draggingId || e.dataTransfer?.getData('text/plain');
        if (!dragged || String(dragged) === String(overId)) {
            setDraggingId(null);
            setDropTargetId(null);
            return;
        }
        const from = classes.findIndex((c) => String(c.id) === String(dragged));
        const to = classes.findIndex((c) => String(c.id) === String(overId));
        if (from < 0 || to < 0) {
            setDraggingId(null);
            setDropTargetId(null);
            return;
        }
        setClasses((prev) => arrayMove(prev, from, to));
        setOrderDirty(true);
        setDraggingId(null);
        setDropTargetId(null);
    };
    const onDragEndList = () => {
        setDraggingId(null);
        setDropTargetId(null);
    };

    // 좌측: 키보드/버튼으로 한 칸 이동
    const moveOne = (idx, dir) => {
        const to = idx + dir;
        if (to < 0 || to >= classes.length) return;
        setClasses((prev) => arrayMove(prev, idx, to));
        setOrderDirty(true);
    };

    // 좌측: 순서 저장
    const saveClassOrder = async () => {
        if (!work || !stage) return alertInfo('안내', '학부/지점을 먼저 선택하세요.');
        try {
            setSavingOrder(true);
            const ids = classes.map((c) => c.id);
            await reorderClasses(work, stage, ids);
            setOrderDirty(false);
            await alertSuccess('저장 완료', '반 순서가 저장되었습니다.');
        } catch (e) {
            console.error('[ClassManagePage] reorderClasses fail:', e);
            const msg =
                e?.response?.data?.message ||
                e?.response?.data?.error ||
                e?.message ||
                '반 순서 저장 중 오류가 발생했습니다.';
            await alertError('저장 실패', msg);
        } finally {
            setSavingOrder(false);
        }
    };

    // 우측 패널의 상태키 (반/학부/지점/서브탭 조합) → 탭 전환 시 내부 상태 초기화에 사용
    const rightKey = `${sel?.id || 'none'}:${stage}:${work}:${subTab}`;

    // Bulk 패널도 stage/work가 바뀌면 완전 초기화되도록 key 부여
    const bulkKey = `${stage}:${work}`;

    return (
        <div className="aa-page academy-page">
            <div className="aa-container">
                {/* 상단 툴바 */}
                <div className="aa-toolbar aa-topbar">
                    <h1 className="aa-title">반 관리</h1>

                    <StageTabs value={stage} onChange={setStage} />
                    <LocationChips value={work} onChange={setWork} />

                    <div className="aa-seg" role="tablist" aria-label="Mode" style={{ marginLeft: 'auto' }}>
                        <button
                            className={mode === 'single' ? 'active' : ''}
                            onClick={() => setMode('single')}
                            role="tab"
                            aria-selected={mode === 'single'}
                        >
                            단일
                        </button>
                        <button
                            className={mode === 'bulk' ? 'active' : ''}
                            onClick={() => setMode('bulk')}
                            role="tab"
                            aria-selected={mode === 'bulk'}
                        >
                            일괄
                        </button>
                    </div>
                </div>

                <div className="aa-split">
                    {/* 좌: 반 목록 */}
                    <section className="aa-card aa-sticky-lg" aria-label="반 목록">
                        <div className="aa-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                            <h2 className="aa-title--sm">반 목록</h2>

                            <div className="aa-row" style={{ gap: '.5rem' }}>
                                {orderDirty && <span className="aa-badge aa-badge--warn">순서 변경됨</span>}
                                <button className="aa-btn aa-btn-outline aa-btn-sm" onClick={load}>
                                    새로고침
                                </button>
                                <button
                                    className="aa-btn aa-btn-primary aa-btn-sm"
                                    onClick={saveClassOrder}
                                    disabled={!orderDirty || savingOrder || !classes.length}
                                    title="드래그 후 저장하여 순서를 반영"
                                >
                                    {savingOrder ? '저장 중…' : '순서 저장'}
                                </button>

                                {/* 단일 모드에서만 [+ 새 반] 버튼 노출 */}
                                {mode === 'single' && (
                                    <button
                                        className="aa-btn aa-btn-primary aa-btn-sm"
                                        onClick={beginCreate}
                                        style={{ marginLeft: '.25rem' }}
                                    >
                                        + 새 반
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="aa-subtle" style={{ marginTop: '.35rem' }}>
                            ※ <b>≡</b> 핸들을 드래그하여 순서를 바꾼 뒤 <b>순서 저장</b>을 눌러 반영하세요.
                        </div>

                        <ul
                            className="school-list"
                            onDragEnd={onDragEndList}
                            style={{ maxHeight: '72vh', overflow: 'auto', marginTop: '.6rem' }}
                        >
                            {(classes || []).map((c, idx) => {
                                const isSel = sel?.id === c.id;
                                const dragging = String(draggingId) === String(c.id);
                                const dropping = String(dropTargetId) === String(c.id);
                                return (
                                    <li
                                        key={c.id}
                                        tabIndex={0}
                                        role="button"
                                        aria-current={isSel ? 'true' : 'false'}
                                        className={`school-item ${isSel ? 'on' : ''} ${dragging ? 'dragging' : ''} ${
                                            dropping ? 'drop-target' : ''
                                        }`}
                                        onClick={() => mode === 'single' && selectClass(c)}
                                        title={`${c.name} (${c.code})`}
                                        onDragOver={(e) => onDragOverItem(e, c.id)}
                                        onDrop={(e) => onDropItem(e, c.id)}
                                        style={{
                                            cursor: mode === 'bulk' ? 'default' : 'pointer',
                                            opacity: mode === 'bulk' ? 0.85 : 1,
                                            position: 'relative',
                                        }}
                                    >
                                        <div
                                            className="school-item-top"
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                gap: '.5rem',
                                            }}
                                        >
                                            <div className="school-name aa-ellipsis">{c.name}</div>

                                            <div
                                                className="school-right-badges"
                                                style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap', alignItems: 'center' }}
                                            >
                                                {/* ✅ NEW: 학년/학급 코드 뱃지 */}
                                                {c.gradeCode && <span className="aa-badge">{c.gradeCode}</span>}
                                                {c.classCode && <span className="aa-badge">{c.classCode}</span>}

                                                <span className="aa-badge aa-cell-mono">{c.code}</span>
                                                <span className="aa-badge">정원 {c.capacity ?? '-'}</span>
                                                <span className="aa-badge aa-badge--muted">{c.status ?? '-'}</span>

                                                {/* 드래그 핸들 + 키보드 이동 버튼 */}
                                                <span
                                                    className="reorder-handle"
                                                    role="button"
                                                    aria-label="순서 이동 핸들"
                                                    aria-grabbed={dragging ? 'true' : 'false'}
                                                    draggable
                                                    onDragStart={(e) => onDragStartHandle(e, c.id)}
                                                    title="드래그하여 순서 변경"
                                                >
                                                  ≡
                                                </span>
                                                <div className="reorder-arrows" role="group" aria-label="순서 이동">
                                                    <button
                                                        type="button"
                                                        className="aa-icon-btn"
                                                        aria-label="위로 이동"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            moveOne(idx, -1);
                                                        }}
                                                        disabled={idx === 0}
                                                        title="위로"
                                                    >
                                                        ↑
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="aa-icon-btn"
                                                        aria-label="아래로 이동"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            moveOne(idx, +1);
                                                        }}
                                                        disabled={idx === classes.length - 1}
                                                        title="아래로"
                                                    >
                                                        ↓
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </li>
                                );
                            })}
                            {!classes?.length && <div className="school-empty">반이 없습니다.</div>}
                        </ul>
                    </section>

                    {/* 우: 상세/편성 */}
                    <section className="aa-card" aria-label="상세/편성">
                        {mode === 'single' ? (
                            <>
                                {(sel || createMode) ? (
                                    <ClassInfoForm
                                        form={form}
                                        setForm={setForm}
                                        semesters={semesters}
                                        onPickSemester={onPickSemester}
                                        onSave={save}
                                        work={work}
                                        isExamPrep={isExamPrep}
                                        isNew={createMode}
                                        // ✅ NEW
                                        gradeOptions={gradeOptions}
                                        classOptions={classOptions}
                                        stage={stage}
                                    />
                                ) : (
                                    <div className="aa-subtle">왼쪽에서 반을 선택하거나 우측 상단의 [+ 새 반]을 눌러주세요.</div>
                                )}

                                <hr className="aa-divider" style={{ margin: '14px 0' }} />

                                {sel && (
                                    <>
                                        {/* 서브 탭 */}
                                        <div className="aa-seg" role="tablist" aria-label="SubTab" style={{ marginBottom: '10px' }}>
                                            <button
                                                className={subTab === 'subjects' ? 'active' : ''}
                                                onClick={() => setSubTab('subjects')}
                                                role="tab"
                                                aria-selected={subTab === 'subjects'}
                                            >
                                                과목 편성
                                            </button>
                                            <button
                                                className={subTab === 'assign' ? 'active' : ''}
                                                onClick={() => setSubTab('assign')}
                                                role="tab"
                                                aria-selected={subTab === 'assign'}
                                            >
                                                담당 관리
                                            </button>
                                        </div>

                                        {subTab === 'subjects' ? (
                                            <SubjectsPickPanel key={rightKey} classId={sel.id} stageCode={stage} />
                                        ) : (
                                            <ClassAssignPanel
                                                key={rightKey}
                                                classId={sel.id}
                                                stageCode={stage}
                                                workLocation={work}
                                                isExamPrep={isExamPrep}
                                            />
                                        )}
                                    </>
                                )}

                                {!sel && !createMode && <div className="aa-subtle">반을 선택해야 과목/담당을 관리할 수 있어요.</div>}
                            </>
                        ) : (
                            <BulkCreatePanel
                                key={bulkKey}
                                work={work}
                                stage={stage}
                                semesters={semesters}
                                onDone={load}
                                // ✅ NEW
                                gradeOptions={gradeOptions}
                                classOptions={classOptions}
                            />
                        )}
                    </section>
                </div>
            </div>
        </div>
    );
}

// ──────────────────────────────────────────────────────────────
// 기본 정보 폼 (상단) — ✅ 학년/학급 코드 필드 추가
// ──────────────────────────────────────────────────────────────
function ClassInfoForm({ form, setForm, semesters, onPickSemester, onSave, work, isExamPrep, isNew, gradeOptions, classOptions, stage }) {
    return (
        <div className="class-info-card">
            <div className="class-info-header">
                <div>
                    <h3>기본 정보</h3>
                    {isNew ? (
                        <p className="class-info-sub">새 반을 생성합니다. 필수값을 입력 후 저장하세요.</p>
                    ) : (
                        <p className="class-info-sub">반 기본 정보를 수정할 수 있습니다.</p>
                    )}
                </div>
                <div>
                    <button className="aa-btn aa-btn-primary aa-btn-lg" onClick={onSave}>
                        저장
                    </button>
                </div>
            </div>

            <div className="class-info-grid">
                {/* 학기 */}
                <div className="aa-field">
                    <label className="aa-label aa-label-lg">학기</label>
                    <select
                        className="aa-select aa-select-lg"
                        value={form.semesterId ?? ''}
                        onChange={(e) => onPickSemester(e.target.value ? Number(e.target.value) : null)}
                    >
                        <option value="">(선택 안 함)</option>
                        {semesters.map((s) => (
                            <option key={s.id} value={s.id}>
                                {s.name} {s.semesterType === 'EXAM_PREP' ? '(시험대비)' : '(정규)'}
                            </option>
                        ))}
                    </select>
                </div>

                {/* ✅ NEW: 학년 코드 */}
                <div className="aa-field">
                    <label className="aa-label aa-label-lg">학년 코드</label>
                    <select
                        className="aa-select aa-select-lg"
                        value={form.gradeCode || ''}
                        onChange={(e)=> setForm((v)=>({ ...v, gradeCode: e.target.value }))}
                        disabled={!stage}
                        title="공통코드 GRADE_*"
                    >
                        <option value="">(선택 안 함)</option>
                        {gradeOptions.map((g)=>(
                            <option key={g.code} value={g.code}>{g.name || g.code}</option>
                        ))}
                    </select>
                </div>

                {/* ✅ NEW: 학급 코드 */}
                <div className="aa-field">
                    <label className="aa-label aa-label-lg">학급 코드</label>
                    <select
                        className="aa-select aa-select-lg"
                        value={form.classCode || ''}
                        onChange={(e)=> setForm((v)=>({ ...v, classCode: e.target.value }))}
                        title="공통코드 CLASS_CODE"
                    >
                        <option value="">(선택 안 함)</option>
                        {classOptions.map((c)=>(
                            <option key={c.code} value={c.code}>{c.name || c.code}</option>
                        ))}
                    </select>
                </div>

                {/* 상태 */}
                <div className="aa-field">
                    <label className="aa-label aa-label-lg">상태</label>
                    <select
                        className="aa-select aa-select-lg"
                        value={form.status}
                        onChange={(e) => setForm((v) => ({ ...v, status: e.target.value }))}
                    >
                        <option value="OPEN">OPEN</option>
                        <option value="CLOSED">CLOSED</option>
                    </select>
                </div>

                {/* 담임 */}
                <div className="aa-field aa-field--wide">
                    <label className="aa-label aa-label-lg">담임 선생님</label>
                    <div className="class-info-teacher">
                        <HomeroomPicker
                            value={form.homeroomTeacherId}
                            onChange={(id) => setForm((v) => ({ ...v, homeroomTeacherId: id }))}
                            workLocation={work}
                            allowAllLocations={true}
                            placeholder="담임 선택"
                        />
                    </div>
                </div>

                {/* 코드 */}
                <div className="aa-field">
                    <label className="aa-label aa-label-lg">코드</label>
                    <input
                        className="aa-input aa-input-lg"
                        value={form.code}
                        onChange={(e) => setForm((v) => ({ ...v, code: e.target.value }))}
                        placeholder="예: 1Ga"
                    />
                </div>

                {/* 반 이름 */}
                <div className="aa-field">
                    <label className="aa-label aa-label-lg">반 이름</label>
                    <input
                        className="aa-input aa-input-lg"
                        value={form.name}
                        onChange={(e) => setForm((v) => ({ ...v, name: e.target.value }))}
                        placeholder="예: 1Ga 반"
                    />
                </div>

                {/* 정원 */}
                <div className="aa-field">
                    <label className="aa-label aa-label-lg">정원</label>
                    <input
                        className="aa-input aa-input-lg text-right"
                        type="number"
                        value={form.capacity}
                        onChange={(e) => setForm((v) => ({ ...v, capacity: Number(e.target.value) || 0 }))}
                        placeholder="예: 20"
                    />
                </div>

                {/* 시험대비 안내 (EXAM_PREP) */}
                {isExamPrep && (
                    <div className="class-info-banner" role="note" aria-live="polite">
                        <b>시험대비 학기</b>입니다. 과목별 담당 지정을 사용할 수 없고, <b>담임 선생님</b>만 수업합니다.
                    </div>
                )}
            </div>
        </div>
    );
}

// ──────────────────────────────────────────────────────────────
/** 일괄 생성 패널
 *  - ✅ 학년/학급 코드 컬럼 추가
 *  - 저장 시 gradeCode/classCode 함께 전송
 */
// ──────────────────────────────────────────────────────────────
function BulkCreatePanel({ work, stage, semesters, onDone, gradeOptions, classOptions }) {
    const [rows, setRows] = useState([{ gradeCode: '', classCode: '', code: '', name: '', capacity: 20, status: 'OPEN' }]);
    const [bulkSemesterId, setBulkSemesterId] = useState(null);

    useEffect(() => {
        setRows([{ gradeCode: '', classCode: '', code: '', name: '', capacity: 20, status: 'OPEN' }]);
        setBulkSemesterId(null);
    }, [work, stage, semesters]);

    const addRow = () => setRows((v) => [...v, { gradeCode: '', classCode: '', code: '', name: '', capacity: 20, status: 'OPEN' }]);
    const removeRow = (idx) => setRows((v) => v.filter((_, i) => i !== idx));
    const update = (idx, patch) => setRows((v) => v.map((r, i) => (i === idx ? { ...r, ...patch } : r)));

    const saveAll = async () => {
        if (!work || !stage) return alertInfo('안내', '학부/지점을 먼저 선택하세요.');

        const normalized = rows.map((r) => ({
            ...r,
            code: (r.code || '').trim(),
            name: (r.name || '').trim(),
            capacity: Number(r.capacity || 0),
            status: r.status || 'OPEN',
            gradeCode: r.gradeCode || null,
            classCode: r.classCode || null,
        }));
        if (normalized.some((p) => !p.code || !p.name)) return alertInfo('확인', '코드/이름은 필수입니다.');

        // ✅ 학년코드 단계 검증(간단)
        for (const p of normalized) {
            if (p.gradeCode) {
                const g0 = String(p.gradeCode)[0]?.toUpperCase?.();
                const s0 = String(stage)[0]?.toUpperCase?.();
                if (g0 && s0 && g0 !== s0) {
                    return alertInfo('확인', `학년코드(${p.gradeCode})가 학부(${stage})와 일치하지 않습니다.`);
                }
            }
        }

        const dup = findDuplicateCode(normalized.map((r) => (r.code || '').toUpperCase()));
        if (dup) return alertInfo('중복 코드', `중복 코드가 있습니다: ${dup}`);

        const payloads = normalized.map((r) => {
            const p = {
                workLocationCode: work,
                schoolStage: stage,
                code: r.code,
                name: r.name,
                capacity: r.capacity,
                status: r.status,
                gradeCode: r.gradeCode,
                classCode: r.classCode,
            };
            if (bulkSemesterId != null) p.semesterId = Number(bulkSemesterId);
            return p;
        });

        try {
            const results = await Promise.allSettled(payloads.map((p) => createClass(p)));
            const fail = results.filter((r) => r.status === 'rejected').length;
            if (fail) {
                console.warn('[BulkCreatePanel] fails:', results.filter((r) => r.status === 'rejected'));
                await alertError('일부 실패', `일부 실패(${fail}건). 콘솔을 확인하세요.`);
            } else {
                await alertSuccess('완료', '일괄 생성이 완료되었습니다.');
            }
            onDone?.();
            setRows([{ gradeCode: '', classCode: '', code: '', name: '', capacity: 20, status: 'OPEN' }]);
        } catch (e) {
            console.error('[BulkCreatePanel] createClass fail:', e);
            await alertError('오류', '일괄 생성 중 오류가 발생했습니다.');
        }
    };

    return (
        <>
            <div className="bulk-head">
                <h2 className="aa-title--sm">일괄 생성</h2>
                <div className="bulk-actions">
                    <select
                        className="aa-select"
                        value={bulkSemesterId ?? ''}
                        onChange={(e) => setBulkSemesterId(e.target.value ? Number(e.target.value) : null)}
                        title="일괄 생성 시 적용할 학기"
                    >
                        <option value="">학기(선택 안 함)</option>
                        {semesters.map((s) => (
                            <option key={s.id} value={s.id}>
                                {s.name} {s.semesterType === 'EXAM_PREP' ? '(시험대비)' : '(정규)'}
                            </option>
                        ))}
                    </select>

                    <button className="aa-btn aa-btn-outline aa-btn-sm" onClick={addRow}>
                        + 행 추가
                    </button>
                    <button className="aa-btn aa-btn-primary aa-btn-sm" onClick={saveAll}>
                        저장
                    </button>
                </div>
            </div>

            <div className="aa-table-wrap" style={{ marginTop: '.6rem' }}>
                <table className="aa-table aa-table--lg">
                    <thead>
                    <tr>
                        {/* ✅ NEW: 학년/학급 코드 컬럼 */}
                        <th>학년코드</th>
                        <th>학급코드</th>
                        <th>코드</th>
                        <th>이름</th>
                        <th>정원</th>
                        <th>상태</th>
                        <th></th>
                    </tr>
                    </thead>
                    <tbody>
                    {rows.map((r, idx) => (
                        <tr key={idx}>
                            <td>
                                <select
                                    className="aa-select"
                                    value={r.gradeCode || ''}
                                    onChange={(e)=> update(idx, { gradeCode: e.target.value })}
                                    disabled={!stage}
                                >
                                    <option value="">(선택 안 함)</option>
                                    {gradeOptions.map((g)=>(
                                        <option key={g.code} value={g.code}>{g.name || g.code}</option>
                                    ))}
                                </select>
                            </td>
                            <td>
                                <select
                                    className="aa-select"
                                    value={r.classCode || ''}
                                    onChange={(e)=> update(idx, { classCode: e.target.value })}
                                >
                                    <option value="">(선택 안 함)</option>
                                    {classOptions.map((c)=>(
                                        <option key={c.code} value={c.code}>{c.name || c.code}</option>
                                    ))}
                                </select>
                            </td>
                            <td>
                                <input
                                    className="aa-input"
                                    value={r.code}
                                    onChange={(e) => update(idx, { code: e.target.value })}
                                    placeholder="예: 1Ga"
                                />
                            </td>
                            <td>
                                <input
                                    className="aa-input"
                                    value={r.name}
                                    onChange={(e) => update(idx, { name: e.target.value })}
                                    placeholder="예: 1Ga 반"
                                />
                            </td>
                            <td>
                                <input
                                    className="aa-input text-right"
                                    type="number"
                                    value={r.capacity}
                                    onChange={(e) => update(idx, { capacity: Number(e.target.value) || 0 })}
                                />
                            </td>
                            <td>
                                <select
                                    className="aa-select"
                                    value={r.status}
                                    onChange={(e) => update(idx, { status: e.target.value })}
                                >
                                    <option value="OPEN">OPEN</option>
                                    <option value="CLOSED">CLOSED</option>
                                </select>
                            </td>
                            <td className="text-right">
                                <button className="aa-btn aa-btn-danger aa-btn-sm" onClick={() => removeRow(idx)}>
                                    삭제
                                </button>
                            </td>
                        </tr>
                    ))}
                    </tbody>
                </table>
            </div>

            <div className="aa-subtle" style={{ marginTop: '.6rem' }}>
                ※ 중복코드 제약: <code>(work_location_code, code)</code> 유니크. 같은 지점에서 코드가 겹치지 않게 입력하세요.
            </div>
        </>
    );
}