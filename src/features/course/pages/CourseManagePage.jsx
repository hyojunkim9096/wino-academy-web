// src/features/course/pages/CourseManagePage.jsx
// ============================================================================
// 반(Course) 관리 페이지 (단일/일괄)
// ----------------------------------------------------------------------------
// - 리팩토링 반영: Class -> Course
// - 공통코드(CLASS_CODE) 로드 및 2단계 필터링 적용
//   1단계: 학부(Stage) 기준 필터링 (Meta: stages)
//   2단계: 학기유형(SemesterType) 기준 필터링 (Meta: semesterTypes)
// - 저장 시 gradeCode, classCode 포함 전송
// ============================================================================

import React, { useEffect, useMemo, useState } from 'react';

// 상단 공통 UI
import StageTabs from '@/features/school/components/StageTabs.jsx';
import LocationChips from '@/features/member/components/LocationChips.jsx';
import HomeroomPicker from '@/features/member/components/HomeroomPicker.jsx';

// API
import {
    listCourses,
    createCourse,
    updateCourse,
    reorderCourses,
} from '@/features/course/api/academyCourseApi.js';
import { listSemesters as listSemestersApi, getSemester } from '@/features/semester/api/academySemesterApi.js';
import { getCodes } from '@/features/system/api/commonCodeAdminApi.js';

// 서브탭 컴포넌트
import SubjectsPickPanel from '@/features/course/components/SubjectsPickPanel.jsx';
import ClassAssignPanel from '@/features/course/components/ClassAssignPanel.jsx';

// 공통 스타일 & 알럿
import '@/features/system/styles/admin.css';
import '@/features/school/styles/admin-school.css';
import '@/features/admin/styles/admin-academy.css';
import '@/features/system/styles/admin-system.css';
import '@/features/course/styles/admin-class.css';
import { alertSuccess, alertError, alertInfo } from '@/common/ui/alert.js';

const DEFAULT_WEEKS = { E: 13, M: 8, H: 8 };

// --- 헬퍼 함수 ---

/** 메타데이터 기반 필터링 헬퍼 */
function filterClassOptions(options, stage, semesterType) {
    if (!options) return [];

    return options.filter(opt => {
        if (!opt.metaJson) return true; // 설정 없으면 통과

        try {
            const meta = JSON.parse(opt.metaJson);

            // 1. 학부(Stage) 체크
            if (stage && meta.stages && Array.isArray(meta.stages)) {
                if (!meta.stages.includes(stage)) return false;
            }

            // 2. 학기 유형(SemesterType) 체크
            // (학기 유형이 선택된 경우에만 체크, 선택 안 됐으면 통과 or 모두 표시)
            if (semesterType && meta.semesterTypes && Array.isArray(meta.semesterTypes)) {
                if (!meta.semesterTypes.includes(semesterType)) return false;
            }

            return true;
        } catch (e) {
            return true; // 파싱 에러 시 안전하게 표시
        }
    });
}

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

function deriveSemesterMeta(semester) {
    const type = semester?.semesterType || 'REGULAR';
    const weeks = weeksBetweenInclusive(semester?.startDate, semester?.endDate);
    return { isExamPrep: type === 'EXAM_PREP', weeksFromRange: weeks };
}

function findDuplicateCode(codes) {
    const seen = new Set();
    for (const c of codes) {
        if (!c) continue;
        if (seen.has(c)) return c;
        seen.add(c);
    }
    return null;
}

function arrayMove(arr, from, to) {
    if (from === to) return arr;
    const copy = arr.slice();
    const item = copy.splice(from, 1)[0];
    copy.splice(to, 0, item);
    return copy;
}

// ============================================================================
// Main Component
// ============================================================================
export default function CourseManagePage() {
    const [stage, setStage] = useState('');
    const [work, setWork] = useState('');
    const [mode, setMode] = useState('single');

    const [classes, setClasses] = useState([]);
    const [sel, setSel] = useState(null);
    const [createMode, setCreateMode] = useState(false);

    const [draggingId, setDraggingId] = useState(null);
    const [dropTargetId, setDropTargetId] = useState(null);
    const [orderDirty, setOrderDirty] = useState(false);
    const [savingOrder, setSavingOrder] = useState(false);

    const [gradeOptions, setGradeOptions] = useState([]);
    const [classOptions, setClassOptions] = useState([]); // 전체 CLASS_CODE

    const blankForm = useMemo(() => ({
        code: '', name: '', capacity: 20, status: 'OPEN',
        semesterId: null, homeroomTeacherId: null, gradeCode: '', classCode: '',
    }), []);

    const [form, setForm] = useState(blankForm);

    const [semesters, setSemesters] = useState([]);
    const [isExamPrep, setIsExamPrep] = useState(false);
    const [weekCount, setWeekCount] = useState(8);
    const [subTab, setSubTab] = useState('subjects');

    // 1. 공통코드 로드 (CLASS_CODE)
    useEffect(() => {
        (async () => {
            try {
                const rows = await getCodes('CLASS_CODE');
                setClassOptions(rows || []);
            } catch { setClassOptions([]); }
        })();
    }, []);

    // 2. 1차 필터링: 학부(Stage) 기준 (단일/일괄 공통 사용)
    const optionsFilteredByStage = useMemo(() => {
        return filterClassOptions(classOptions, stage, null);
    }, [classOptions, stage]);

    // 3. 2차 필터링 (단일 모드): 선택된 학기의 유형 기준
    const singleModeOptions = useMemo(() => {
        if (!form.semesterId) return optionsFilteredByStage; // 학기 미선택시 Stage 필터만 적용

        const selectedSem = semesters.find(s => s.id === form.semesterId);
        const semType = selectedSem?.semesterType; // REGULAR, SEASONAL ...

        return filterClassOptions(optionsFilteredByStage, null, semType);
        // stage는 이미 걸러졌으므로 null 전달하여 중복 체크 방지 (해도 상관없음)
    }, [optionsFilteredByStage, form.semesterId, semesters]);

    // 초기화 로직들
    useEffect(() => {
        setSel(null); setCreateMode(false); setSubTab('subjects');
        setForm(blankForm); setIsExamPrep(false);
    }, [mode, blankForm]);

    useEffect(() => {
        (async () => {
            setSel(null); setCreateMode(false);
            setForm((f)=>({ ...blankForm, classCode: f.classCode }));
            setIsExamPrep(false); setOrderDirty(false);
            try {
                if (!stage) { setSemesters([]); setClasses([]); setGradeOptions([]); return; }
                const list = await listSemestersApi(stage);
                const filtered = String(stage).toUpperCase() === 'E'
                    ? (list || []).filter((s) => s.semesterType !== 'EXAM_PREP')
                    : list || [];
                setSemesters(filtered);

                const gradeKey = `GRADE_${String(stage).toUpperCase()}`;
                try {
                    const gRows = await getCodes(gradeKey);
                    setGradeOptions(gRows || []);
                } catch { setGradeOptions([]); }

                const def = DEFAULT_WEEKS[stage] ?? 8;
                const override = await fetchTermWeekCount(stage);
                setWeekCount(override ?? def);
            } catch (e) {
                console.error(e);
                alertError('로드 실패', '기초 데이터를 불러오지 못했습니다.');
            }
        })();
    }, [stage]);

    useEffect(() => {
        setSel(null); setCreateMode(false);
        setForm((f)=>({ ...blankForm, classCode: f.classCode }));
        setIsExamPrep(false); setOrderDirty(false);
    }, [work]);

    // 목록 로드
    const load = async () => {
        try {
            if (!stage || !work) { setClasses([]); return; }
            const data = await listCourses(work, stage);
            setClasses(Array.isArray(data) ? data : []);
            setOrderDirty(false);
        } catch (e) {
            console.error(e);
            alertError('로드 실패', '반 목록을 불러오지 못했습니다.');
        }
    };
    useEffect(() => { load(); }, [stage, work, mode]);

    // 선택 / 신규
    const selectClass = async (cls) => {
        if (mode === 'bulk') return;
        setSel(cls); setCreateMode(false); setSubTab('subjects');
        setForm({
            code: cls.code, name: cls.name, capacity: cls.capacity ?? 20, status: cls.status ?? 'OPEN',
            semesterId: cls.semesterId ?? null, homeroomTeacherId: cls.homeroomTeacherId ?? null,
            gradeCode: cls.gradeCode ?? '', classCode: cls.classCode ?? '',
        });
        await applySemesterMeta(cls.semesterId);
    };

    const beginCreate = async () => {
        setSel(null); setCreateMode(true);
        setForm((f)=>({ ...blankForm, classCode: f.classCode }));
        setIsExamPrep(false); setSubTab('subjects');
    };

    const applySemesterMeta = async (semesterId) => {
        if (semesterId) {
            try {
                const sem = await getSemester(semesterId);
                const { isExamPrep, weeksFromRange } = deriveSemesterMeta(sem);
                setIsExamPrep(isExamPrep);
                if (weeksFromRange) setWeekCount(weeksFromRange);
                else {
                    const def = DEFAULT_WEEKS[stage] ?? 8;
                    const override = await fetchTermWeekCount(stage);
                    setWeekCount(override ?? def);
                }
            } catch (e) {
                console.warn(e);
                setIsExamPrep(false);
            }
        } else {
            setIsExamPrep(false);
            const def = DEFAULT_WEEKS[stage] ?? 8;
            const override = await fetchTermWeekCount(stage);
            setWeekCount(override ?? def);
        }
    };

    const save = async () => {
        if (!work || !stage) return alertInfo('안내', '학부/지점을 먼저 선택하세요.');
        if (!form.code?.trim() || !form.name?.trim()) return alertInfo('확인', '코드/이름은 필수입니다.');
        if (!sel && (form.semesterId == null || form.semesterId === '')) return alertInfo('확인', '신규 반 생성 시 학기를 선택하세요.');

        const payload = {
            workLocationCode: work, schoolStage: stage,
            code: form.code.trim(), name: form.name.trim(), capacity: Number(form.capacity || 0), status: form.status || 'OPEN',
            gradeCode: form.gradeCode || null, classCode: form.classCode || null,
        };
        if (form.semesterId != null && form.semesterId !== '') payload.semesterId = Number(form.semesterId);
        if (form.homeroomTeacherId != null && form.homeroomTeacherId !== '') payload.homeroomTeacherId = Number(form.homeroomTeacherId);

        try {
            const saved = sel ? await updateCourse(sel.id, payload) : await createCourse(payload);
            await load();
            if (mode === 'single') { setCreateMode(false); selectClass(saved); }
            else { setForm((f)=>({ ...blankForm, classCode: f.classCode })); setSel(null); setCreateMode(false); }
            await alertSuccess('저장 완료', '반 정보가 저장되었습니다.');
        } catch (e) {
            const msg = e?.response?.data?.message || e.message || '저장 중 오류가 발생했습니다.';
            await alertError('저장 실패', msg);
        }
    };

    const onPickSemester = async (semesterId) => {
        setForm((f) => ({ ...f, semesterId: semesterId || null }));
        await applySemesterMeta(semesterId);
    };

    // 드래그 관련 (생략 없이)
    const onDragStartHandle = (e, id) => {
        setDraggingId(id);
        if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', String(id));
            if (e.dataTransfer.setDragImage) {
                const img = new Image();
                img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
                e.dataTransfer.setDragImage(img, 0, 0);
            }
        }
    };
    const onDragOverItem = (e, overId) => { e.preventDefault(); if (dropTargetId !== overId) setDropTargetId(overId); };
    const onDropItem = (e, overId) => {
        e.preventDefault();
        const dragged = draggingId || e.dataTransfer?.getData('text/plain');
        if (!dragged || String(dragged) === String(overId)) { setDraggingId(null); setDropTargetId(null); return; }
        const from = classes.findIndex((c) => String(c.id) === String(dragged));
        const to = classes.findIndex((c) => String(c.id) === String(overId));
        if (from < 0 || to < 0) { setDraggingId(null); setDropTargetId(null); return; }
        setClasses((prev) => arrayMove(prev, from, to));
        setOrderDirty(true);
        setDraggingId(null); setDropTargetId(null);
    };
    const onDragEndList = () => { setDraggingId(null); setDropTargetId(null); };
    const moveOne = (idx, dir) => {
        const to = idx + dir;
        if (to < 0 || to >= classes.length) return;
        setClasses((prev) => arrayMove(prev, idx, to));
        setOrderDirty(true);
    };
    const saveClassOrder = async () => {
        if (!work || !stage) return alertInfo('안내', '학부/지점을 먼저 선택하세요.');
        try {
            setSavingOrder(true);
            const ids = classes.map((c) => c.id);
            await reorderCourses(work, stage, ids);
            setOrderDirty(false);
            await alertSuccess('저장 완료', '반 순서가 저장되었습니다.');
        } catch (e) {
            await alertError('저장 실패', e.message);
        } finally { setSavingOrder(false); }
    };

    const rightKey = `${sel?.id || 'none'}:${stage}:${work}:${subTab}`;
    const bulkKey = `${stage}:${work}`;

    return (
        <div className="aa-page academy-page">
            <div className="aa-container">
                <div className="aa-toolbar aa-topbar">
                    <h1 className="aa-title">반 관리</h1>
                    <StageTabs value={stage} onChange={setStage} />
                    <LocationChips value={work} onChange={setWork} />
                    <div className="aa-seg" role="tablist" style={{ marginLeft: 'auto' }}>
                        <button className={mode === 'single' ? 'active' : ''} onClick={() => setMode('single')}>단일</button>
                        <button className={mode === 'bulk' ? 'active' : ''} onClick={() => setMode('bulk')}>일괄</button>
                    </div>
                </div>

                <div className="aa-split">
                    {/* 좌: 반 목록 */}
                    <section className="aa-card aa-sticky-lg">
                        <div className="aa-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                            <h2 className="aa-title--sm">반 목록</h2>
                            <div className="aa-row" style={{ gap: '.5rem' }}>
                                {orderDirty && <span className="aa-badge aa-badge--warn">순서 변경됨</span>}
                                <button className="aa-btn aa-btn-outline aa-btn-sm" onClick={load}>새로고침</button>
                                <button className="aa-btn aa-btn-primary aa-btn-sm" onClick={saveClassOrder} disabled={!orderDirty || savingOrder || !classes.length}>
                                    {savingOrder ? '저장 중…' : '순서 저장'}
                                </button>
                                {mode === 'single' && <button className="aa-btn aa-btn-primary aa-btn-sm" onClick={beginCreate} style={{ marginLeft: '.25rem' }}>+ 새 반</button>}
                            </div>
                        </div>
                        <div className="aa-subtle" style={{ marginTop: '.35rem' }}>※ <b>≡</b> 핸들을 드래그하여 순서를 바꾼 뒤 저장하세요.</div>
                        <ul className="school-list" onDragEnd={onDragEndList} style={{ maxHeight: '72vh', overflow: 'auto', marginTop: '.6rem' }}>
                            {(classes || []).map((c, idx) => {
                                const isSel = sel?.id === c.id;
                                const dragging = String(draggingId) === String(c.id);
                                const dropping = String(dropTargetId) === String(c.id);
                                return (
                                    <li key={c.id} tabIndex={0} role="button" aria-current={isSel}
                                        className={`school-item ${isSel ? 'on' : ''} ${dragging ? 'dragging' : ''} ${dropping ? 'drop-target' : ''}`}
                                        onClick={() => mode === 'single' && selectClass(c)}
                                        onDragOver={(e) => onDragOverItem(e, c.id)} onDrop={(e) => onDropItem(e, c.id)}
                                        style={{ cursor: mode === 'bulk' ? 'default' : 'pointer', opacity: mode === 'bulk' ? 0.85 : 1, position: 'relative' }}
                                    >
                                        <div className="school-item-top" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.5rem' }}>
                                            <div className="school-name aa-ellipsis">{c.name}</div>
                                            <div className="school-right-badges" style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                                {c.gradeCode && <span className="aa-badge">{c.gradeCode}</span>}
                                                {c.classCode && <span className="aa-badge">{c.classCode}</span>}
                                                <span className="aa-badge aa-cell-mono">{c.code}</span>
                                                <span className="aa-badge">정원 {c.capacity ?? '-'}</span>
                                                <span className="aa-badge aa-badge--muted">{c.status ?? '-'}</span>
                                                <span className="reorder-handle" role="button" draggable onDragStart={(e) => onDragStartHandle(e, c.id)}>≡</span>
                                                <div className="reorder-arrows">
                                                    <button type="button" className="aa-icon-btn" onClick={(e) => { e.stopPropagation(); moveOne(idx, -1); }} disabled={idx === 0}>↑</button>
                                                    <button type="button" className="aa-icon-btn" onClick={(e) => { e.stopPropagation(); moveOne(idx, +1); }} disabled={idx === classes.length - 1}>↓</button>
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
                    <section className="aa-card">
                        {mode === 'single' ? (
                            <>
                                {(sel || createMode) ? (
                                    <ClassInfoForm
                                        form={form} setForm={setForm} semesters={semesters} onPickSemester={onPickSemester}
                                        onSave={save} work={work} isExamPrep={isExamPrep} isNew={createMode}
                                        gradeOptions={gradeOptions} stage={stage}
                                        // ✅ 필터링된 학급코드 전달
                                        classOptions={singleModeOptions}
                                    />
                                ) : (
                                    <div className="aa-subtle">왼쪽에서 반을 선택하거나 우측 상단의 [+ 새 반]을 눌러주세요.</div>
                                )}
                                <hr className="aa-divider" style={{ margin: '14px 0' }} />
                                {sel && (
                                    <>
                                        <div className="aa-seg" role="tablist" style={{ marginBottom: '10px' }}>
                                            <button className={subTab === 'subjects' ? 'active' : ''} onClick={() => setSubTab('subjects')}>과목 편성</button>
                                            <button className={subTab === 'assign' ? 'active' : ''} onClick={() => setSubTab('assign')}>담당 관리</button>
                                        </div>
                                        {subTab === 'subjects' ? (
                                            <SubjectsPickPanel key={rightKey} classId={sel.id} stageCode={stage} />
                                        ) : (
                                            <ClassAssignPanel key={rightKey} classId={sel.id} stageCode={stage} workLocation={work} isExamPrep={isExamPrep} />
                                        )}
                                    </>
                                )}
                                {!sel && !createMode && <div className="aa-subtle">반을 선택해야 과목/담당을 관리할 수 있어요.</div>}
                            </>
                        ) : (
                            // ✅ 일괄 모드: stageFilteredOptions (학부 기준) 전달 -> 내부에서 학기별로 추가 필터링 필요
                            <BulkCreatePanel
                                key={bulkKey} work={work} stage={stage} semesters={semesters}
                                onDone={load} gradeOptions={gradeOptions}
                                // 일괄 모드는 학기가 로우마다 다를 수 없으므로(상단 일괄 선택),
                                // 패널 내부에서 선택된 학기ID에 맞춰 재필터링 해야 함.
                                // 여기서는 일단 학부로 필터링된 전체를 넘김.
                                classOptions={optionsFilteredByStage}
                            />
                        )}
                    </section>
                </div>
            </div>
        </div>
    );
}

// ──────────────────────────────────────────────────────────────
// 기본 정보 폼
// ──────────────────────────────────────────────────────────────
function ClassInfoForm({ form, setForm, semesters, onPickSemester, onSave, work, isExamPrep, isNew, gradeOptions, classOptions, stage }) {
    return (
        <div className="class-info-card">
            <div className="class-info-header">
                <div>
                    <h3>기본 정보</h3>
                    {isNew ? <p className="class-info-sub">새 반을 생성합니다.</p> : <p className="class-info-sub">반 정보를 수정합니다.</p>}
                </div>
                <div><button className="aa-btn aa-btn-primary aa-btn-lg" onClick={onSave}>저장</button></div>
            </div>
            <div className="class-info-grid">
                <div className="aa-field">
                    <label className="aa-label aa-label-lg">학기</label>
                    <select className="aa-select aa-select-lg" value={form.semesterId ?? ''} onChange={(e) => onPickSemester(e.target.value ? Number(e.target.value) : null)}>
                        <option value="">(선택 안 함)</option>
                        {semesters.map((s) => {
                            let typeLabel = '(정규)';
                            if (s.semesterType === 'EXAM_PREP') typeLabel = '(시험대비)';
                            else if (s.semesterType === 'SEASONAL') typeLabel = '(계절학기)';
                            return <option key={s.id} value={s.id}>{s.name} {typeLabel}</option>;
                        })}
                    </select>
                </div>
                <div className="aa-field">
                    <label className="aa-label aa-label-lg">학년 코드</label>
                    <select className="aa-select aa-select-lg" value={form.gradeCode || ''} onChange={(e)=> setForm((v)=>({ ...v, gradeCode: e.target.value }))} disabled={!stage}>
                        <option value="">(선택 안 함)</option>
                        {gradeOptions.map((g)=>(<option key={g.code} value={g.code}>{g.name || g.code}</option>))}
                    </select>
                </div>
                <div className="aa-field">
                    <label className="aa-label aa-label-lg">학급 코드</label>
                    <select className="aa-select aa-select-lg" value={form.classCode || ''} onChange={(e)=> setForm((v)=>({ ...v, classCode: e.target.value }))}>
                        <option value="">(선택 안 함)</option>
                        {/* ✅ 2차 필터링된 옵션 렌더링 */}
                        {classOptions.map((c)=>(<option key={c.code} value={c.code}>{c.name || c.code}</option>))}
                    </select>
                </div>
                <div className="aa-field"><label className="aa-label aa-label-lg">상태</label>
                    <select className="aa-select aa-select-lg" value={form.status} onChange={(e) => setForm((v) => ({ ...v, status: e.target.value }))}>
                        <option value="OPEN">OPEN</option><option value="CLOSED">CLOSED</option>
                    </select>
                </div>
                <div className="aa-field aa-field--wide"><label className="aa-label aa-label-lg">담임 선생님</label>
                    <div className="class-info-teacher">
                        <HomeroomPicker value={form.homeroomTeacherId} onChange={(id) => setForm((v) => ({ ...v, homeroomTeacherId: id }))} workLocation={work} allowAllLocations={true} placeholder="담임 선택" />
                    </div>
                </div>
                <div className="aa-field"><label className="aa-label aa-label-lg">코드</label>
                    <input className="aa-input aa-input-lg" value={form.code} onChange={(e) => setForm((v) => ({ ...v, code: e.target.value }))} placeholder="예: 1Ga" />
                </div>
                <div className="aa-field"><label className="aa-label aa-label-lg">반 이름</label>
                    <input className="aa-input aa-input-lg" value={form.name} onChange={(e) => setForm((v) => ({ ...v, name: e.target.value }))} placeholder="예: 1Ga 반" />
                </div>
                <div className="aa-field"><label className="aa-label aa-label-lg">정원</label>
                    <input className="aa-input aa-input-lg text-right" type="number" value={form.capacity} onChange={(e) => setForm((v) => ({ ...v, capacity: Number(e.target.value) || 0 }))} placeholder="예: 20" />
                </div>
                {isExamPrep && <div className="class-info-banner" role="note"><b>시험대비 학기</b>입니다. 과목별 담당 지정을 사용할 수 없고, <b>담임 선생님</b>만 수업합니다.</div>}
            </div>
        </div>
    );
}

// ──────────────────────────────────────────────────────────────
// 일괄 생성 패널
// ──────────────────────────────────────────────────────────────
function BulkCreatePanel({ work, stage, semesters, onDone, gradeOptions, classOptions }) {
    const [rows, setRows] = useState([{ gradeCode: '', classCode: '', code: '', name: '', capacity: 20, status: 'OPEN' }]);
    const [bulkSemesterId, setBulkSemesterId] = useState(null);

    // ✅ 일괄 생성용 2차 필터링 (학기가 선택되면 그에 맞는 classOptions 필터링)
    const currentClassOptions = useMemo(() => {
        if (!bulkSemesterId) return classOptions; // 학기 미선택시 학부 필터만 된 것 사용
        const selectedSem = semesters.find(s => s.id === bulkSemesterId);
        return filterClassOptions(classOptions, null, selectedSem?.semesterType);
    }, [classOptions, bulkSemesterId, semesters]);

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
            ...r, code: (r.code || '').trim(), name: (r.name || '').trim(), capacity: Number(r.capacity || 0),
            status: r.status || 'OPEN', gradeCode: r.gradeCode || null, classCode: r.classCode || null,
        }));
        if (normalized.some((p) => !p.code || !p.name)) return alertInfo('확인', '코드/이름은 필수입니다.');
        for (const p of normalized) {
            if (p.gradeCode) {
                const g0 = String(p.gradeCode)[0]?.toUpperCase?.(); const s0 = String(stage)[0]?.toUpperCase?.();
                if (g0 && s0 && g0 !== s0) return alertInfo('확인', `학년코드(${p.gradeCode})가 학부(${stage})와 일치하지 않습니다.`);
            }
        }
        const dup = findDuplicateCode(normalized.map((r) => (r.code || '').toUpperCase()));
        if (dup) return alertInfo('중복 코드', `중복 코드가 있습니다: ${dup}`);
        const payloads = normalized.map((r) => {
            const p = { workLocationCode: work, schoolStage: stage, code: r.code, name: r.name, capacity: r.capacity, status: r.status, gradeCode: r.gradeCode, classCode: r.classCode };
            if (bulkSemesterId != null) p.semesterId = Number(bulkSemesterId);
            return p;
        });
        try {
            const results = await Promise.allSettled(payloads.map((p) => createCourse(p)));
            const fail = results.filter((r) => r.status === 'rejected').length;
            if (fail) { console.warn('[BulkCreatePanel] fails:', results.filter((r) => r.status === 'rejected')); await alertError('일부 실패', `일부 실패(${fail}건). 콘솔을 확인하세요.`); }
            else { await alertSuccess('완료', '일괄 생성이 완료되었습니다.'); }
            onDone?.(); setRows([{ gradeCode: '', classCode: '', code: '', name: '', capacity: 20, status: 'OPEN' }]);
        } catch (e) { console.error('[BulkCreatePanel] createCourse fail:', e); await alertError('오류', '일괄 생성 중 오류가 발생했습니다.'); }
    };

    return (
        <>
            <div className="bulk-head"><h2 className="aa-title--sm">일괄 생성</h2>
                <div className="bulk-actions">
                    <select className="aa-select" value={bulkSemesterId ?? ''} onChange={(e) => setBulkSemesterId(e.target.value ? Number(e.target.value) : null)}><option value="">학기(선택 안 함)</option>
                        {semesters.map((s) => {
                            let typeLabel = '(정규)';
                            if (s.semesterType === 'EXAM_PREP') typeLabel = '(시험대비)';
                            else if (s.semesterType === 'SEASONAL') typeLabel = '(계절학기)';
                            return <option key={s.id} value={s.id}>{s.name} {typeLabel}</option>;
                        })}
                    </select>
                    <button className="aa-btn aa-btn-outline aa-btn-sm" onClick={addRow}>+ 행 추가</button>
                    <button className="aa-btn aa-btn-primary aa-btn-sm" onClick={saveAll}>저장</button>
                </div>
            </div>
            <div className="aa-table-wrap" style={{ marginTop: '.6rem' }}><table className="aa-table aa-table--lg"><thead><tr><th>학년코드</th><th>학급코드</th><th>코드</th><th>이름</th><th>정원</th><th>상태</th><th></th></tr></thead>
                <tbody>{rows.map((r, idx) => (<tr key={idx}>
                    <td><select className="aa-select" value={r.gradeCode || ''} onChange={(e)=> update(idx, { gradeCode: e.target.value })} disabled={!stage}><option value="">(선택 안 함)</option>{gradeOptions.map((g)=>(<option key={g.code} value={g.code}>{g.name || g.code}</option>))}</select></td>
                    <td><select className="aa-select" value={r.classCode || ''} onChange={(e)=> update(idx, { classCode: e.target.value })}>
                        <option value="">(선택 안 함)</option>
                        {/* ✅ currentClassOptions (2차 필터링됨) 사용 */}
                        {currentClassOptions.map((c)=>(<option key={c.code} value={c.code}>{c.name || c.code}</option>))}
                    </select></td>
                    <td><input className="aa-input" value={r.code} onChange={(e) => update(idx, { code: e.target.value })} placeholder="예: 1Ga" /></td>
                    <td><input className="aa-input" value={r.name} onChange={(e) => update(idx, { name: e.target.value })} placeholder="예: 1Ga 반" /></td>
                    <td><input className="aa-input text-right" type="number" value={r.capacity} onChange={(e) => update(idx, { capacity: Number(e.target.value) || 0 })} /></td>
                    <td><select className="aa-select" value={r.status} onChange={(e) => update(idx, { status: e.target.value })}><option value="OPEN">OPEN</option><option value="CLOSED">CLOSED</option></select></td>
                    <td className="text-right"><button className="aa-btn aa-btn-danger aa-btn-sm" onClick={() => removeRow(idx)}>삭제</button></td>
                </tr>))}</tbody></table></div>
            <div className="aa-subtle" style={{ marginTop: '.6rem' }}>※ 중복코드 제약: <code>(work_location_code, code)</code> 유니크. 같은 지점에서 코드가 겹치지 않게 입력하세요.</div>
        </>
    );
}