// src/features/student/components/StudentEnrollments.jsx
// ============================================================================
// 학생 반 배정 관리 컴포넌트
// ----------------------------------------------------------------------------
// - 리팩토링 반영: academyCourseApi 사용
// - 탭 분리: 현재 수강중(ACTIVE) / 수강 이력(그 외: STOP, END, MOVE 등)
// - 기능:
//    · MAIN 배정: 시간표 자동 할당 (백엔드 처리)
//    · CROSS 배정: 배정 직후 타임슬롯 선택 모달 자동 오픈
//    · [종료] 버튼: 수강 중인 반을 오늘 날짜로 종료 처리 (ACTIVE -> STOP/END)
// ============================================================================

import React, { useEffect, useMemo, useState } from 'react';
import Modal from '@/common/components/ui/Modal.jsx';
import { alertError, alertInfo, alertSuccess, confirmDialog } from '@/common/ui/alert.js';

// API
import { listCoursesByPartition } from '@/features/course/api/academyCourseApi.js';
import {
    addEnrollmentToStudent,
    updateStudentEnrollment,
    removeStudentEnrollment,
    getActiveEnrollCountsByClassIds,
    replaceEnrollmentTimeslots,
} from '@/features/student/api/studentEnrollmentApi.js';

// 컴포넌트
import TimeslotPickerModal from '@/features/student/components/enrollment/TimeslotPickerModal.jsx';

// ------------------------------ 유틸 ------------------------------
const safeInfo  = (t, m) => Promise.resolve(alertInfo(t, m)).catch(() => {});
const safeOk    = (t, m) => Promise.resolve(alertSuccess(t, m)).catch(() => {});
const safeError = (t, m) => Promise.resolve(alertError(t, m)).catch(() => {});

function localToday() {
    return new Date().toLocaleDateString('en-CA');
}

function pruneEmpty(obj = {}) {
    const out = { ...obj };
    Object.keys(out).forEach((k) => {
        if (out[k] === '') out[k] = undefined;
    });
    return out;
}

function useEnrollStatusName(enrollStatusCodes = []) {
    return (c) => {
        const code = String(c || '').toUpperCase();
        const hit  = enrollStatusCodes.find(x => String(x.code).toUpperCase() === code);
        if (hit?.name) return hit.name;
        if (code === 'ACTIVE') return '활성';
        if (code === 'STOP')   return '종료';
        if (code === 'MOVE')   return '이동';
        if (code === 'END')    return '수료';
        return c || '-';
    };
}

function useClassNameMap(locCode, stage) {
    const [classMap, setClassMap] = useState({});
    useEffect(() => {
        let alive = true;
        (async () => {
            if (!locCode || !stage) { setClassMap({}); return; }
            try {
                const rows = await listCoursesByPartition(locCode, stage);
                const map = {};
                (rows || []).forEach((c) => {
                    if (c?.id != null) map[c.id] = c.name || String(c.id);
                });
                if (alive) setClassMap(map);
            } catch { setClassMap({}); }
        })();
        return () => { alive = false; };
    }, [locCode, stage]);

    return (classId, fallback) => (classMap[classId] ? classMap[classId] : (fallback || '-'));
}

function useClassStatusOptions(classStatusCodes = []) {
    return useMemo(() => {
        const base = (classStatusCodes && classStatusCodes.length > 0)
            ? classStatusCodes
            : [{ code: 'MAIN', name: '메인' }, { code: 'CROSS', name: '교차' }];

        return base.map((o) => {
            const codeUp = String(o.code || '').toUpperCase();
            const name   = o.name || (codeUp === 'CROSS' ? '교차' : '메인');
            return { code: codeUp, name, label: `${name} (${codeUp})` };
        });
    }, [classStatusCodes]);
}

// ============================================================================
// Main Component
// ============================================================================
export default function StudentEnrollments({
                                               studentId,
                                               studentDetail,
                                               enrolls = [],
                                               enrollStatusCodes = [],
                                               classStatusCodes = [],
                                               onReload,
                                           }) {
    // 탭 상태: 'active'(현재 수강) | 'history'(이력)
    const [tab, setTab] = useState('active');

    const [addOpen, setAddOpen] = useState(false);
    const [editRow, setEditRow] = useState(null);
    const [tsModal, setTsModal] = useState(null);

    const isActiveStudent = String(studentDetail?.status || '').toUpperCase() === 'ACTIVE';
    const locCode         = studentDetail?.workLocationCode || '';
    const stage           = studentDetail?.schoolStage || '';
    const gradeCode       = studentDetail?.gradeCode;

    const statusName      = useEnrollStatusName(enrollStatusCodes);
    const classNameOf     = useClassNameMap(locCode, stage);
    const classStatusOpts = useClassStatusOptions(classStatusCodes);

    // ✅ 데이터 분리: 현재 수강중인 반 vs 이력 (ACTIVE 기준 분리)
    const { activeList, historyList } = useMemo(() => {
        const active = [];
        const history = [];
        (enrolls || []).forEach(e => {
            if (String(e.status).toUpperCase() === 'ACTIVE') active.push(e);
            else history.push(e);
        });
        // 정렬 (최신순)
        active.sort((a,b) => b.id - a.id);
        history.sort((a,b) => (b.leftAt || b.enrolledAt).localeCompare(a.leftAt || a.enrolledAt));

        return { activeList: active, historyList: history };
    }, [enrolls]);

    const activeClassIdSet = useMemo(() => new Set(activeList.map(e => e.classId)), [activeList]);

    // ✅ 수강 종료 처리 핸들러 (ACTIVE -> STOP/END)
    const handleStopEnrollment = async (enroll) => {
        const ok = await confirmDialog(
            '수강 종료',
            `${classNameOf(enroll.classId, enroll.className)} 수업을 오늘 날짜로 종료하시겠습니까?`
        );
        if(!ok) return;

        try {
            await updateStudentEnrollment(studentId, enroll.id, {
                status: 'STOP', // 'END' 등으로 변경 가능 (공통코드에 따름)
                leftAt: localToday(),
                memo: enroll.memo // 기존 메모 유지
            });
            await safeOk('완료', '수강이 종료되었습니다.');
            onReload?.();
        } catch(e) {
            safeError('실패', e.message);
        }
    };

    // 테이블 렌더링 함수 (재사용: active/history 탭에 따라 내용만 교체)
    const renderTable = (list, isHistory) => (
        <div className="aa-table-wrap max-h-[60vh] overflow-auto border border-slate-700 rounded-lg">
            <table className="aa-table">
                <thead className="sticky top-0 bg-slate-800 z-10">
                <tr>
                    <th>반</th>
                    <th>시작일</th>
                    <th>{isHistory ? '종료일' : '종료예정'}</th>
                    <th>상태</th>
                    <th>구분</th>
                    <th>요일</th>
                    <th>메모</th>
                    <th style={{ width: 180, textAlign: 'right' }}>관리</th>
                </tr>
                </thead>
                <tbody>
                {list.length === 0 && <tr><td colSpan={8} className="text-center py-6 text-slate-500">내역이 없습니다.</td></tr>}
                {list.map((e) => {
                    const codeUp = String(e.classStatusCode || '').toUpperCase();
                    const hit = classStatusOpts.find(x => x.code === codeUp);
                    const label = hit?.name || (codeUp === 'CROSS' ? '교차' : '메인');

                    return (
                        <tr key={e.id} className={isHistory ? 'opacity-60 bg-slate-900/30' : ''}>
                            <td className="font-semibold text-slate-200">
                                {classNameOf(e.classId, e.className)}
                            </td>
                            <td>{e.enrolledAt}</td>
                            <td>{e.leftAt || '-'}</td>
                            <td>
                                <span className={`aa-badge ${e.status === 'ACTIVE' ? 'aa-badge--ok' : 'aa-badge--muted'}`}>
                                    {statusName(e.status)}
                                </span>
                            </td>
                            <td>
                                <span className={`aa-badge ${codeUp === 'MAIN' ? 'bg-indigo-900/50 text-indigo-200' : 'bg-amber-900/50 text-amber-200'}`}>
                                    {label}
                                </span>
                            </td>
                            <td className="text-xs">{e.attendDaysLabel || '-'}</td>
                            <td className="aa-ellipsis max-w-[120px] text-xs text-slate-400">{e.memo}</td>
                            <td className="text-right">
                                <div className="flex justify-end gap-1">
                                    {/* ✅ 활성 상태일 때만 '종료' 버튼 노출 */}
                                    {!isHistory && (
                                        <button
                                            className="aa-btn aa-btn-xs aa-btn-outline border-red-500/50 text-red-400 hover:bg-red-900/30"
                                            onClick={() => handleStopEnrollment(e)}
                                            title="오늘 날짜로 종료"
                                        >
                                            종료
                                        </button>
                                    )}

                                    <button
                                        className="aa-btn aa-btn-xs"
                                        onClick={() => setEditRow({
                                            id: e.id,
                                            classId: e.classId,
                                            className: classNameOf(e.classId, e.className),
                                            enrolledAt: (e.enrolledAt || '').slice(0, 10),
                                            leftAt: (e.leftAt || '').slice(0, 10),
                                            memo: e.memo || '',
                                            status: e.status || 'ACTIVE',
                                            classStatusCode: codeUp || 'MAIN',
                                        })}
                                    >
                                        수정
                                    </button>

                                    {/* ✅ CROSS & Active 인 경우 시간표 버튼 노출 */}
                                    {!isHistory && codeUp === 'CROSS' && (
                                        <button
                                            className="aa-btn aa-btn-xs aa-btn-ghost"
                                            onClick={() => setTsModal({ enrollId: e.id, classId: e.classId, locCode, stage, gradeCode })}
                                            title="시간표 설정"
                                        >
                                            📅
                                        </button>
                                    )}

                                    {/* (삭제 버튼은 실수 방지를 위해 제거하거나, 필요한 경우 주석 해제) */}
                                    {/*
                                    <button className="aa-btn aa-btn-xs aa-btn-danger" onClick={...}>삭제</button>
                                    */}
                                </div>
                            </td>
                        </tr>
                    );
                })}
                </tbody>
            </table>
        </div>
    );

    return (
        <div className="space-y-4">
            {/* 탭 & 버튼 */}
            <div className="flex justify-between items-end border-b border-slate-700 pb-2">
                <div className="flex gap-6">
                    <button
                        className={`text-sm font-bold px-1 py-2 border-b-2 transition-colors ${tab==='active' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
                        onClick={() => setTab('active')}
                    >
                        현재 수강중 ({activeList.length})
                    </button>
                    <button
                        className={`text-sm font-bold px-1 py-2 border-b-2 transition-colors ${tab==='history' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
                        onClick={() => setTab('history')}
                    >
                        수강 이력 ({historyList.length})
                    </button>
                </div>

                {isActiveStudent && tab === 'active' && (
                    <button
                        className="aa-btn aa-btn-sm aa-btn-primary"
                        onClick={() => {
                            if (!locCode || !stage) return safeInfo('안내', '지점/학부 정보가 없습니다.');
                            setAddOpen(true);
                        }}
                    >
                        + 반 배정 추가
                    </button>
                )}
            </div>

            {/* 탭에 따라 다른 테이블 렌더링 */}
            {tab === 'active' ? renderTable(activeList, false) : renderTable(historyList, true)}

            {/* 추가 모달 */}
            {addOpen && (
                <AddEnrollmentModal
                    locCode={locCode}
                    stage={stage}
                    classStatusOptions={classStatusOpts}
                    activeClassIds={activeClassIdSet}
                    onClose={() => setAddOpen(false)}
                    onSubmit={async (formData) => {
                        try {
                            const enrollId = await addEnrollmentToStudent(studentId, pruneEmpty(formData));

                            // CROSS면 바로 타임슬롯 모달 오픈
                            if (String(formData.classStatusCode).toUpperCase() === 'CROSS') {
                                setAddOpen(false);
                                setTsModal({
                                    enrollId,
                                    classId: formData.classId,
                                    locCode, stage, gradeCode
                                });
                                safeInfo('안내', '교차 수강은 시간표를 선택해야 합니다.');
                                return;
                            }

                            safeOk('완료', '배정이 추가되었습니다.');
                            setAddOpen(false);
                            onReload?.();
                        } catch (e) {
                            // 백엔드 409 에러 메시지 표시 (ex: 정규학기 메인 중복 등)
                            safeError('배정 실패', e.response?.data?.message || '배정 중 오류가 발생했습니다.');
                        }
                    }}
                />
            )}

            {/* 수정 모달 */}
            {editRow && (
                <EditEnrollmentModal
                    row={editRow}
                    classStatusOptions={classStatusOpts}
                    enrollStatusCodes={enrollStatusCodes}
                    onClose={() => setEditRow(null)}
                    onSubmit={async (formData) => {
                        try {
                            await updateStudentEnrollment(studentId, editRow.id, pruneEmpty(formData));
                            safeOk('완료', '수정되었습니다.');
                            setEditRow(null);
                            onReload?.();
                        } catch (e) {
                            safeError('수정 실패', e.response?.data?.message || '수정 중 오류가 발생했습니다.');
                        }
                    }}
                />
            )}

            {/* 타임슬롯 모달 */}
            {tsModal && (
                <TimeslotPickerModal
                    {...tsModal}
                    studentId={studentId}
                    onClose={() => setTsModal(null)}
                    onSubmit={async (ids) => {
                        try {
                            await replaceEnrollmentTimeslots(tsModal.enrollId, ids);
                            safeOk('완료', '시간표가 저장되었습니다.');
                            setTsModal(null);
                            onReload?.();
                        } catch (e) {
                            safeError('실패', e.message);
                        }
                    }}
                />
            )}
        </div>
    );
}

// ============================================================================
// 배정 추가 모달 (내부)
// ============================================================================
function AddEnrollmentModal({ locCode, stage, classStatusOptions, activeClassIds, onClose, onSubmit }) {
    const TODAY = useMemo(() => localToday(), []);
    const [list, setList] = useState([]);
    const [selId, setSelId] = useState(null);
    const [counts, setCounts] = useState({});
    const [form, setForm] = useState({ enrolledAt: TODAY, classStatusCode: 'MAIN' });
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        let alive = true;
        (async () => {
            setLoading(true);
            try {
                // ✅ [수정] listCoursesByPartition 사용
                const rows = await listCoursesByPartition(locCode, stage);
                const sorted = (rows || []).slice().sort((a,b) => (a.name||'').localeCompare(b.name||''));

                const ids = sorted.map(c => c.id);
                let cntMap = {};
                if (ids.length) {
                    try { cntMap = await getActiveEnrollCountsByClassIds(ids); } catch {}
                }

                if (alive) {
                    setList(sorted);
                    setCounts(cntMap);
                    // 기본 선택: 정원 안 찬 첫 번째 반
                    const first = sorted.find(c => {
                        const curr = cntMap[c.id] || 0;
                        return !c.capacity || curr < c.capacity;
                    });
                    if (first) setSelId(first.id);
                }
            } catch (e) { console.error(e); }
            finally { if (alive) setLoading(false); }
        })();
        return () => { alive = false; };
    }, [locCode, stage]);

    const handleSave = () => {
        if (!selId) return safeInfo('선택', '반을 선택해주세요.');
        if (!form.enrolledAt) return safeInfo('필수', '시작일을 입력해주세요.');

        // 정원 체크 (Client Side Check - Server Side가 최종)
        const target = list.find(c => c.id === selId);
        const curr = counts[selId] || 0;
        if (target?.capacity && curr >= target.capacity) {
            return safeInfo('정원 초과', '해당 반은 정원이 꽉 찼습니다.');
        }

        onSubmit({
            classId: selId,
            enrolledAt: form.enrolledAt,
            classStatusCode: form.classStatusCode
        });
    };

    return (
        <Modal title="신규 배정 추가" onClose={onClose} size="lg">
            <div className="space-y-4">
                <div className="aa-table-wrap h-64 overflow-y-auto border border-slate-700 rounded-lg">
                    <table className="aa-table">
                        <thead className="sticky top-0 z-10 bg-slate-800">
                        <tr>
                            <th w="50px"></th>
                            <th>반 이름</th>
                            <th>코드</th>
                            <th>인원</th>
                            <th>상태</th>
                        </tr>
                        </thead>
                        <tbody>
                        {loading && <tr><td colSpan={5} className="text-center py-8">로딩 중...</td></tr>}
                        {!loading && list.map(c => {
                            const curr = counts[c.id] || 0;
                            const isFull = c.capacity && curr >= c.capacity;
                            const isActive = activeClassIds.has(c.id);
                            return (
                                <tr key={c.id}
                                    className={`${isFull || isActive ? 'opacity-50 bg-slate-900' : 'hover:bg-slate-800/50 cursor-pointer'} ${selId===c.id ? 'bg-indigo-900/30' : ''}`}
                                    onClick={() => !isFull && !isActive && setSelId(c.id)}
                                >
                                    <td>
                                        <input type="radio" checked={selId === c.id} readOnly disabled={isFull || isActive} />
                                    </td>
                                    <td>{c.name}</td>
                                    <td className="font-mono text-slate-400">{c.code}</td>
                                    <td className={isFull ? 'text-red-400 font-bold' : ''}>
                                        {curr} / {c.capacity || '∞'}
                                    </td>
                                    <td>
                                        {isActive && <span className="aa-badge aa-badge--warn">수강중</span>}
                                        {isFull && <span className="aa-badge aa-badge--muted">만원</span>}
                                    </td>
                                </tr>
                            );
                        })}
                        </tbody>
                    </table>
                </div>

                <div className="grid grid-cols-2 gap-4 p-4 bg-slate-800/50 rounded-lg">
                    <div>
                        <label className="aa-label">시작일</label>
                        <input
                            type="date" className="aa-input"
                            value={form.enrolledAt}
                            onChange={e => setForm({ ...form, enrolledAt: e.target.value })}
                        />
                    </div>
                    <div>
                        <label className="aa-label">구분 (MAIN/CROSS)</label>
                        <select
                            className="aa-select"
                            value={form.classStatusCode}
                            onChange={e => setForm({ ...form, classStatusCode: e.target.value })}
                        >
                            {classStatusOptions.map(o => (
                                <option key={o.code} value={o.code}>{o.label}</option>
                            ))}
                        </select>
                        {form.classStatusCode === 'CROSS' && (
                            <p className="text-xs text-indigo-400 mt-1">
                                * 저장 후 시간표를 선택해야 합니다.
                            </p>
                        )}
                    </div>
                </div>

                <div className="flex justify-end gap-2">
                    <button className="aa-btn" onClick={onClose}>취소</button>
                    <button className="aa-btn aa-btn-primary" onClick={handleSave}>배정 저장</button>
                </div>
            </div>
        </Modal>
    );
}

// ============================================================================
// 배정 수정 모달 (내부)
// ============================================================================
function EditEnrollmentModal({ row, classStatusOptions, enrollStatusCodes, onClose, onSubmit }) {
    const [form, setForm] = useState({ ...row });

    const statusOpts = enrollStatusCodes.length ? enrollStatusCodes : [
        { code: 'ACTIVE', name: '활성' },
        { code: 'STOP', name: '종료' },
        { code: 'MOVE', name: '이동' },
        { code: 'END', name: '수료' }
    ];

    return (
        <Modal title="배정 정보 수정" onClose={onClose}>
            <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="aa-label">반 이름</label>
                        <div className="aa-input bg-slate-900 text-slate-400 cursor-not-allowed">
                            {row.className}
                        </div>
                    </div>
                    <div>
                        <label className="aa-label">상태</label>
                        <select
                            className="aa-select"
                            value={form.status}
                            onChange={e => setForm({ ...form, status: e.target.value })}
                        >
                            {statusOpts.map(o => <option key={o.code} value={o.code}>{o.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="aa-label">시작일</label>
                        <input type="date" className="aa-input" value={form.enrolledAt} onChange={e => setForm({ ...form, enrolledAt: e.target.value })} />
                    </div>
                    <div>
                        <label className="aa-label">종료일</label>
                        <input type="date" className="aa-input" value={form.leftAt || ''} onChange={e => setForm({ ...form, leftAt: e.target.value })} />
                    </div>
                    <div>
                        <label className="aa-label">구분</label>
                        <select
                            className="aa-select"
                            value={form.classStatusCode}
                            onChange={e => setForm({ ...form, classStatusCode: e.target.value })}
                        >
                            {classStatusOptions.map(o => <option key={o.code} value={o.code}>{o.label}</option>)}
                        </select>
                    </div>
                </div>
                <div>
                    <label className="aa-label">메모</label>
                    <textarea
                        className="aa-textarea" rows={3}
                        value={form.memo || ''}
                        onChange={e => setForm({ ...form, memo: e.target.value })}
                    />
                </div>
                <div className="flex justify-end gap-2">
                    <button className="aa-btn" onClick={onClose}>취소</button>
                    <button className="aa-btn aa-btn-primary" onClick={() => onSubmit(form)}>수정 저장</button>
                </div>
            </div>
        </Modal>
    );
}

// ... Field, RO 컴포넌트 기존 유지 ...
function Field({ label, children }) {
    return (
        <label className="block">
            <div className="text-sm mb-1 text-slate-300">{label}</div>
            {children}
        </label>
    );
}
function RO({ children }) {
    return (
        <div className="px-3 py-2 rounded border border-slate-700 bg-slate-800">
            {children ?? '-'}
        </div>
    );
}