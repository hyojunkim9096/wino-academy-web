// /src/features/admin/components/student/StudentEnrollments.jsx
// ============================================================================
// StudentEnrollments — 반 배정 탭 전용 컴포넌트
//  - 부모(AdminStudentPage)가 enrolls를 주입하고 onReload 제공
//  - CROSS 배정 시 타임슬롯 선택 모달 연동
//  - 서버 요일 집계(attendDaysLabel) 표시
// ============================================================================

import React, { useEffect, useMemo, useState } from 'react';
import Modal from '@/components/ui/Modal';
import { alertError, alertInfo, alertSuccess, confirmDialog } from '@/ui/alert';
import { listClassesByPartition } from '@/api/academyClassApi';
import {
    addEnrollmentToStudent,
    updateStudentEnrollment,
    removeStudentEnrollment,
    getActiveEnrollCountsByClassIds,
    replaceEnrollmentTimeslots,
} from '@/api/studentEnrollmentApi';
import TimeslotPickerModal from '@/features/admin/components/enrollment/TimeslotPickerModal';

// ------------------------------ 유틸 ------------------------------
const safeInfo  = (t,m)=>Promise.resolve(alertInfo(t,m)).catch(()=>{});
const safeOk    = (t,m)=>Promise.resolve(alertSuccess(t,m)).catch(()=>{});
const safeError = (t,m)=>Promise.resolve(alertError(t,m)).catch(()=>{});

function localToday() {
    return new Date().toLocaleDateString('en-CA');
}

/** 빈 문자열 → undefined */
function pruneEmpty(obj = {}) {
    const out = { ...obj };
    Object.keys(out).forEach((k)=>{ if (out[k] === '') out[k] = undefined; });
    return out;
}

function useEnrollStatusName(enrollStatusCodes=[]){
    return (c)=>{
        const code = String(c||'').toUpperCase();
        const hit = enrollStatusCodes.find(x=>String(x.code).toUpperCase()===code);
        if (hit?.name) return hit.name;
        if (code==='ACTIVE') return '활성';
        if (code==='STOP')   return '종료';
        if (code==='MOVE')   return '이동';
        if (code==='LEFT' || code==='END') return '종료';
        return c || '-';
    };
}

function useClassNameMap(locCode, stage){
    const [classMap, setClassMap] = useState({});
    useEffect(()=>{
        let alive = true;
        (async ()=>{
            if (!locCode || !stage) { setClassMap({}); return; }
            try{
                const rows = await listClassesByPartition(locCode, stage);
                const map = {};
                (rows||[]).forEach(c=>{
                    if (c?.id!=null) map[c.id] = c.name || String(c.id);
                });
                if (!alive) return;
                setClassMap(map);
            }catch{ setClassMap({}); }
        })();
        return ()=>{ alive=false; };
    },[locCode, stage]);

    const classNameOf = (classId, fallback) =>
        (classMap && classId in classMap) ? classMap[classId] : (fallback || String(classId ?? '-'));
    return classNameOf;
}

/** CLASS STATUS 옵션(라벨: "이름 (코드)") */
function useClassStatusOptions(classStatusCodes = []) {
    return useMemo(() => {
        const base = Array.isArray(classStatusCodes) && classStatusCodes.length > 0
            ? classStatusCodes
            : [
                { code: 'MAIN',  name: '메인' },
                { code: 'CROSS', name: '교차' },
            ];
        return base.map(o => ({
            code: String(o.code || '').toUpperCase(),
            name: o.name || (String(o.code||'').toUpperCase()==='CROSS' ? '교차' : '메인'),
            label: `${o.name || (String(o.code||'').toUpperCase()==='CROSS' ? '교차' : '메인')} (${String(o.code||'').toUpperCase()})`,
        }));
    }, [classStatusCodes]);
}

// ------------------------------ 메인 ------------------------------
export default function StudentEnrollments({
                                               studentId,
                                               studentDetail,
                                               enrolls = [],
                                               enrollStatusCodes = [],
                                               classStatusCodes = [],
                                               onReload
                                           }){
    const [addOpen, setAddOpen] = useState(false);
    const [editRow, setEditRow] = useState(null);

    // 타임슬롯 선택 모달
    const [tsModal, setTsModal] = useState(null);

    const isActiveStudent = String(studentDetail?.status||'').toUpperCase() === 'ACTIVE';
    const locCode = studentDetail?.workLocationCode || '';
    const stage   = studentDetail?.schoolStage || '';
    const gradeCode = studentDetail?.gradeCode || undefined;

    const statusName        = useEnrollStatusName(enrollStatusCodes);
    const classNameOf       = useClassNameMap(locCode, stage);
    const classStatusOpts   = useClassStatusOptions(classStatusCodes);

    // 이미 ACTIVE 상태인 반 classId 집합
    const activeClassIdSet = useMemo(()=>{
        const ids = (enrolls||[])
            .filter(e => String(e.status||'').toUpperCase() === 'ACTIVE')
            .map(e => e.classId)
            .filter(v => v!=null);
        return new Set(ids);
    },[enrolls]);

    return (
        <div className="space-y-2">
            {/* 상단 버튼 */}
            <div className="flex gap-2">
                <button
                    className="aa-btn aa-btn-primary"
                    disabled={!isActiveStudent}
                    title={!isActiveStudent ? '학생 상태가 재원(ACTIVE)일 때만 배정 추가가 가능합니다.' : undefined}
                    onClick={()=>{
                        if (!locCode || !stage) return safeInfo('안내','학생의 소속 관과 학부를 먼저 지정하세요.');
                        setAddOpen(true);
                    }}
                >
                    반 배정
                </button>
            </div>

            {/* 목록 */}
            <div className="aa-table-wrap max-h-[60vh] overflow-auto">
                <table className="aa-table">
                    <thead>
                    <tr>
                        <th>반</th>
                        <th>시작</th>
                        <th>종료</th>
                        <th>상태</th>
                        <th>CLASS</th>
                        <th>요일(집계)</th>
                        <th>메모</th>
                        <th style={{width:260}}></th>
                    </tr>
                    </thead>
                    <tbody>
                    {enrolls.length===0 && (
                        <tr><td colSpan={8}>배정 내역이 없습니다.</td></tr>
                    )}
                    {enrolls.map(e=>{
                        const codeUp = String(e.classStatusCode||'').toUpperCase();
                        const hit = classStatusOpts.find(x=>x.code===codeUp);
                        const classStatusLabel = e.classStatusName || hit?.name || (codeUp==='CROSS' ? '교차' : '메인');

                        return (
                            <tr key={e.id}>
                                <td className="aa-ellipsis">{classNameOf(e.classId, e.className)}</td>
                                <td>{e.enrolledAt}</td>
                                <td>{e.leftAt || '-'}</td>
                                <td>{statusName(e.status)}</td>
                                <td>{`${classStatusLabel} (${codeUp || 'MAIN'})`}</td>
                                <td>{e.attendDaysLabel || '-'}</td>
                                <td className="aa-ellipsis">{e.memo || '-'}</td>
                                <td className="text-right">
                                    <div className="aa-actions">
                                        <button
                                            className="aa-btn aa-btn-sm"
                                            onClick={()=> setEditRow({
                                                id: e.id,
                                                className: classNameOf(e.classId, e.className),
                                                enrolledAt: (e.enrolledAt||'').slice(0,10),
                                                leftAt: (e.leftAt||'').slice(0,10),
                                                memo: e.memo || '',
                                                status: e.status || 'ACTIVE',
                                                classStatusCode: codeUp || 'MAIN',
                                            })}
                                        >수정</button>

                                        {/* CROSS일 때만 노출 */}
                                        {codeUp === 'CROSS' && (
                                            <button
                                                className="aa-btn aa-btn-sm"
                                                onClick={()=>{
                                                    setTsModal({
                                                        enrollId: e.id,
                                                        classId: e.classId,
                                                        locCode,
                                                        stage,
                                                        gradeCode
                                                    });
                                                }}
                                            >타임슬롯</button>
                                        )}

                                        <button
                                            className="aa-btn aa-btn-danger aa-btn-sm"
                                            onClick={async ()=>{
                                                const ok = await confirmDialog(
                                                    '배정 삭제',
                                                    `${classNameOf(e.classId, e.className)} 배정을 삭제할까요?`,
                                                    { confirmText: '삭제', cancelText: '취소', confirmColor: '#ef4444' }
                                                );
                                                if(!ok) return;
                                                try{
                                                    await removeStudentEnrollment(studentId, e.id);
                                                    await safeOk('성공','배정이 삭제되었습니다.');
                                                    await onReload?.();
                                                }catch(err){
                                                    safeError('오류', err?.response?.data?.message || '배정 삭제 실패');
                                                }
                                            }}
                                        >삭제</button>
                                    </div>
                                </td>
                            </tr>
                        );
                    })}
                    </tbody>
                </table>
            </div>

            {/* 배정 추가 모달 */}
            {addOpen && (
                <AddEnrollmentModal
                    locCode={locCode}
                    stage={stage}
                    classStatusOptions={classStatusOpts}
                    activeClassIds={activeClassIdSet}
                    onClose={()=>setAddOpen(false)}
                    onSubmit={async ({ classId, enrolledAt, classStatusCode })=>{
                        const TODAY = localToday();
                        if (!enrolledAt || enrolledAt < TODAY) {
                            return safeInfo('안내','시작일은 오늘 이후만 선택할 수 있습니다.');
                        }
                        if (activeClassIdSet.has(classId)) {
                            return safeInfo('안내','이미 해당 반에 ACTIVE 배정이 존재합니다.');
                        }

                        try{
                            // 배정 생성
                            const enrollId = await addEnrollmentToStudent(studentId, pruneEmpty({
                                classId, enrolledAt, classStatusCode
                            }));

                            // CROSS면 타임슬롯 모달 오픈
                            if (String(classStatusCode).toUpperCase() === 'CROSS') {
                                setAddOpen(false);
                                setTsModal({
                                    enrollId,
                                    classId,
                                    locCode,
                                    stage,
                                    gradeCode
                                });
                                return;
                            }

                            await safeOk('성공','배정이 추가되었습니다.');
                            setAddOpen(false);
                            await onReload?.();
                        }catch(e){
                            const st = e?.response?.status;
                            if (st === 409) {
                                return safeInfo('중복','이미 해당 반에 ACTIVE 배정이 존재합니다.');
                            }
                            safeError('오류', e?.response?.data?.message || '배정 추가 실패');
                        }
                    }}
                />
            )}

            {/* 배정 수정 모달 */}
            {editRow && (
                <EditEnrollmentModal
                    row={editRow}
                    classStatusOptions={classStatusOpts}
                    enrollStatusCodes={enrollStatusCodes}
                    onClose={()=>setEditRow(null)}
                    onSubmit={async (form)=>{
                        // 종료일 ≥ 시작일 검사
                        if (form.enrolledAt && form.leftAt && String(form.leftAt) < String(form.enrolledAt)) {
                            return safeInfo('안내','종료일은 시작일보다 이전일 수 없습니다.');
                        }

                        try{
                            await updateStudentEnrollment(studentId, editRow.id, pruneEmpty({
                                leftAt: form.leftAt || null,
                                memo: form.memo || null,
                                status: form.status || null,
                                classStatusCode: form.classStatusCode || null,
                            }));
                            await safeOk('성공','배정이 수정되었습니다.');
                            setEditRow(null);
                            await onReload?.();
                        }catch(e){
                            const st = e?.response?.status;
                            if (st === 409) {
                                return safeInfo('중복','이미 해당 반에 ACTIVE 배정이 존재합니다.');
                            }
                            safeError('오류', e?.response?.data?.message || '반 수정 실패');
                        }
                    }}
                />
            )}

            {/* 타임슬롯 선택 모달 */}
            {tsModal && (
                <TimeslotPickerModal
                    title="타임슬롯 선택"
                    studentId={studentId}
                    classId={tsModal.classId}
                    locCode={tsModal.locCode}
                    stage={tsModal.stage}
                    gradeCode={tsModal.gradeCode}
                    enrollmentId={tsModal.enrollId}
                    onClose={()=> setTsModal(null)}
                    onSubmit={async (ids)=>{
                        try{
                            await replaceEnrollmentTimeslots(tsModal.enrollId, ids);
                            await safeOk('성공','타임슬롯이 저장되었습니다.');
                            setTsModal(null);
                            await onReload?.();
                        }catch(e){
                            safeError('오류', e?.response?.data?.message || '타임슬롯 저장 실패');
                        }
                    }}
                />
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// 배정 추가/수정 모달 (생략 없음, 상단과 동일)
// ---------------------------------------------------------------------------
function AddEnrollmentModal({ locCode, stage, classStatusOptions=[], activeClassIds = new Set(), onClose, onSubmit }){
    const TODAY = useMemo(()=>localToday(), []);
    const [loading, setLoading] = useState(false);
    const [list, setList]       = useState([]);
    const [selId, setSelId]     = useState(null);
    const [counts, setCounts]   = useState({});
    const [enrollDate, setEnrollDate] = useState(TODAY);

    const [classStatusCode, setClassStatusCode] = useState('MAIN');

    useEffect(()=>{
        let alive = true;
        (async ()=>{
            setLoading(true);
            try{
                const rows = await listClassesByPartition(locCode, stage);
                const sorted = (rows||[]).slice().sort(
                    (a,b)=>(a.sortOrder??0)-(b.sortOrder??0) || (a.name||'').localeCompare(b.name||'','ko')
                );

                const ids = sorted.map(c=>c.id).filter(v=>v!=null);
                let cntMap = {};
                if (ids.length>0) {
                    try{
                        cntMap = await getActiveEnrollCountsByClassIds(ids);
                    }catch{ cntMap = {}; }
                }

                if (!alive) return;
                setList(sorted);
                setCounts(cntMap);

                const firstOk = sorted.find(c=>{
                    const active = cntMap?.[c.id] ?? 0;
                    const cap = Number.isFinite(c.capacity) ? c.capacity : null;
                    const full = cap!=null && active >= cap;
                    return !full && !activeClassIds.has(c.id);
                })?.id ?? null;
                setSelId(firstOk);

            }catch{
                setList([]); setCounts({});
                safeError('오류','반 목록 조회 실패');
            }finally{ setLoading(false); }
        })();
        return ()=>{ alive=false; };
    },[locCode, stage, activeClassIds]);

    return (
        <Modal title="반 배정" onClose={onClose} size="lg">
            <div className="space-y-3 add-enroll">
                <div className="aa-table-wrap max-h-[50vh] md:max-h-[60vh] overflow-auto">
                    <table className="aa-table">
                        <thead>
                        <tr>
                            <th style={{width:60}}></th>
                            <th>반 이름</th>
                            <th>코드</th>
                            <th>현재원/정원</th>
                            <th>상태</th>
                            <th style={{width:180}}>비고</th>
                        </tr>
                        </thead>
                        <tbody>
                        {loading && <tr><td colSpan={6}>불러오는 중…</td></tr>}
                        {!loading && list.length===0 && <tr><td colSpan={6}>반이 없습니다.</td></tr>}
                        {list.map(c=>{
                            const curr = counts?.[c.id] ?? 0;
                            const cap  = Number.isFinite(c.capacity) ? c.capacity : null;
                            const full = cap!=null && curr >= cap;
                            const alreadyActive = activeClassIds.has(c.id);
                            return (
                                <tr key={c.id} className={`hover:bg-slate-800/60 ${full || alreadyActive ? 'opacity-75' : ''}`}>
                                    <td>
                                        <input
                                            type="radio"
                                            name="classSel"
                                            checked={selId===c.id}
                                            onChange={()=>setSelId(c.id)}
                                            disabled={full || alreadyActive}
                                            title={
                                                alreadyActive
                                                    ? '이미 이 반에 ACTIVE 배정이 있습니다.'
                                                    : (full ? '정원 초과로 선택할 수 없습니다.' : undefined)
                                            }
                                        />
                                    </td>
                                    <td className="aa-ellipsis">{c.name}</td>
                                    <td className="aa-cell-mono">{c.code}</td>
                                    <td className={full ? 'text-red-400 font-semibold' : ''}>
                                        {curr} / {cap ?? '-'}
                                    </td>
                                    <td>{c.status}</td>
                                    <td>
                                        {alreadyActive && <span className="aa-badge aa-badge--warn">현재 소속 반</span>}
                                        {full && <span className="aa-badge aa-badge--muted ml-1">정원 초과</span>}
                                    </td>
                                </tr>
                            );
                        })}
                        </tbody>
                    </table>
                </div>

                <div className="grid md:grid-cols-2 gap-3">
                    <label className="block">
                        <div className="text-sm mb-1 text-slate-300">시작일</div>
                        <input
                            className="aa-input"
                            type="date"
                            value={enrollDate}
                            min={TODAY}
                            onChange={e=>{
                                const v = e.target.value;
                                setEnrollDate(!v || v < TODAY ? TODAY : v);
                            }}
                        />
                    </label>
                    <label className="block">
                        <div className="text-sm mb-1 text-slate-300">CLASS STATUS</div>
                        <select
                            className="aa-select"
                            value={classStatusCode}
                            onChange={e=>setClassStatusCode(e.target.value)}
                        >
                            {classStatusOptions.map(o=>(
                                <option key={o.code} value={o.code}>{o.label}</option>
                            ))}
                        </select>
                    </label>
                </div>

                <div className="flex justify-between items-center pt-2">
                    <div className="text-xs text-slate-400">
                        * 현재원은 ACTIVE 배정 건수 기준입니다.
                    </div>
                    <div className="flex gap-2">
                        <button className="aa-btn" onClick={onClose}>취소</button>
                        <button
                            className="aa-btn aa-btn-primary"
                            disabled={!selId || !enrollDate}
                            onClick={async ()=>{
                                const selected = list.find(x=>x.id===selId);
                                if (!selected) return;
                                if (activeClassIds.has(selId)) {
                                    return safeInfo('안내','이미 해당 반에 ACTIVE 배정이 존재합니다.');
                                }
                                const curr = counts?.[selected.id] ?? 0;
                                const cap  = Number.isFinite(selected.capacity) ? selected.capacity : null;
                                if (cap!=null && curr >= cap) {
                                    return safeInfo('안내','해당 반은 정원 초과되어 선택할 수 없습니다.');
                                }
                                onSubmit?.({ classId: selId, enrolledAt: enrollDate, classStatusCode });
                            }}
                        >
                            배정
                        </button>
                    </div>
                </div>
            </div>
        </Modal>
    );
}

function EditEnrollmentModal({ row, classStatusOptions=[], enrollStatusCodes=[], onClose, onSubmit }){
    const [form, setForm] = useState({
        enrolledAt: row?.enrolledAt || '',
        leftAt:     row?.leftAt || '',
        memo:       row?.memo || '',
        status:     row?.status || 'ACTIVE',
        classStatusCode: row?.classStatusCode || 'MAIN',
    });

    useEffect(()=>{
        setForm({
            enrolledAt: row?.enrolledAt || '',
            leftAt:     row?.leftAt || '',
            memo:       row?.memo || '',
            status:     row?.status || 'ACTIVE',
            classStatusCode: row?.classStatusCode || 'MAIN',
        });
    },[row]);

    const statusOptions = useMemo(()=>{
        const arr = Array.isArray(enrollStatusCodes) ? enrollStatusCodes : [];
        if (arr.length>0) return arr;
        return [
            {code:'ACTIVE', name:'활성'},
            {code:'STOP',   name:'종료'},
            {code:'MOVE',   name:'이동'},
        ];
    },[enrollStatusCodes]);

    const leftMin = useMemo(()=> form.enrolledAt || '', [form.enrolledAt]);

    return (
        <Modal title={`반 수정 — ${row?.className || ''}`} onClose={onClose} size="lg">
            <div className="space-y-3">
                <Field label="반"><RO>{row?.className || '-'}</RO></Field>

                <div className="grid md:grid-cols-2 gap-3">
                    <Field label="시작일">
                        <input
                            type="date"
                            className="aa-input"
                            value={form.enrolledAt||''}
                            onChange={e=>{
                                const v = e.target.value;
                                setForm(f=>{
                                    const nextStart = v || '';
                                    const nextLeft = (f.leftAt && nextStart && f.leftAt < nextStart) ? nextStart : f.leftAt;
                                    return {...f, enrolledAt: nextStart, leftAt: nextLeft};
                                });
                            }}
                        />
                    </Field>
                    <Field label="종료일">
                        <input
                            type="date"
                            className="aa-input"
                            value={form.leftAt||''}
                            min={leftMin || undefined}
                            onChange={e=>{
                                const v = e.target.value;
                                setForm(f=>({...f, leftAt: v || ''}));
                            }}
                        />
                    </Field>
                </div>

                <div className="grid md:grid-cols-2 gap-3">
                    <Field label="상태">
                        <select
                            className="aa-select"
                            value={form.status||'ACTIVE'}
                            onChange={e=>{
                                const v = e.target.value;
                                setForm(f=>{
                                    const nextLeft = (v==='ACTIVE') ? '' : f.leftAt;
                                    return { ...f, status: v, leftAt: nextLeft };
                                });
                            }}
                        >
                            {statusOptions.map(s=>(
                                <option key={s.code} value={s.code}>{s.name} ({s.code})</option>
                            ))}
                        </select>
                    </Field>

                    <Field label="CLASS STATUS">
                        <select
                            className="aa-select"
                            value={form.classStatusCode || 'MAIN'}
                            onChange={e=>setForm(f=>({...f, classStatusCode: e.target.value}))}
                        >
                            {classStatusOptions.map(o=>(
                                <option key={o.code} value={o.code}>{o.label}</option>
                            ))}
                        </select>
                    </Field>
                </div>

                <Field label="메모">
          <textarea
              className="aa-textarea"
              rows={4}
              value={form.memo||''}
              onChange={e=>setForm(f=>({...f, memo:e.target.value}))}
          />
                </Field>

                <div className="flex justify-end gap-2 pt-2">
                    <button className="aa-btn" onClick={onClose}>취소</button>
                    <button className="aa-btn aa-btn-primary" onClick={()=>onSubmit?.(form)}>저장</button>
                </div>
            </div>
        </Modal>
    );
}

// ------------------------------ 공용 표시용 ------------------------------
function Field({label, children}){
    return (
        <label className="block">
            <div className="text-sm mb-1 text-slate-300">{label}</div>
            {children}
        </label>
    );
}
function RO({children}){
    return <div className="px-3 py-2 rounded border border-slate-700 bg-slate-800">{children ?? '-'}</div>;
}