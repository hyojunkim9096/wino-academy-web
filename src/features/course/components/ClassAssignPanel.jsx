// src/features/course/components/ClassAssignPanel.jsx
import React, { useEffect, useState } from 'react';
import HomeroomPicker from '@/features/member/components/HomeroomPicker.jsx';
// ✅ 변경: academyClassApi -> academyCourseApi
import { listCourseSubjects, listSlots, saveAssignmentsBulk } from '@/features/course/api/academyCourseApi.js';
import { listSubjectsByParent } from '@/features/subject/api/academySubjectApi.js';
import { getCodes } from '@/features/system/api/commonCodeAdminApi.js';
import { alertSuccess, alertError } from '@/common/ui/alert.js';

const DAY_LABELS = { 1:'월', 2:'화', 3:'수', 4:'목', 5:'금', 6:'토', 7:'일' };

/** ▷ enabled 필터(공통코드 전용) */
const isEnabledCode = (item) => {
    const v = item?.enabled;
    if (v === undefined || v === null) return true;
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v === 1;
    const s = String(v).trim().toLowerCase();
    return s === '1' || s === 'true' || s === 'y';
};

// 시간 포맷 유틸
const toHHmm = (raw) => {
    if (!raw) return '';
    const s = String(raw).trim();
    const m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (m) return `${m[1].padStart(2,'0')}:${m[2]}`;
    const digits = s.replace(/\D/g, '');
    if (digits.length === 4) return `${digits.slice(0,2)}:${digits.slice(2)}`;
    return s;
};
const toMinutes = (hhmm) => {
    const [h,m] = String(hhmm||'').split(':').map(Number);
    return (h||0)*60 + (m||0);
};
const fmtMinutes = (min) => `${String(Math.floor(min/60)).padStart(2,'0')}:${String(min%60).padStart(2,'0')}`;
const endPlus50 = (start) => fmtMinutes(toMinutes(start) + 50);
const overlaps = (s1, e1, s2, e2) => toMinutes(s1) < toMinutes(e2) && toMinutes(s2) < toMinutes(e1);

export default function ClassAssignPanel({ classId, stageCode, workLocation, isExamPrep }){
    const [subjectNameMap, setSubjectNameMap] = useState({});
    const sName = (sid)=> subjectNameMap[sid] || '';

    // 시간 옵션 (공통코드 CLASS_TIME)
    const [timeOpts, setTimeOpts] = useState([]);
    const findTimeByCode  = (code) => timeOpts.find(o=>o.code===code) || null;
    const findCodeByLabel = (label) => (timeOpts.find(o=>o.label===label)?.code) || null;

    // 편집행
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving,  setSaving]  = useState(false);

    useEffect(()=>{ (async ()=>{
        try{
            setLoading(true);

            // 1) 과목 캐시
            const roots = await listSubjectsByParent(stageCode, null).catch(()=>[]);
            const m = {}; (roots||[]).forEach(n => m[n.id] = n.name);

            // 2) 시간 옵션 로딩
            const codes = await getCodes('CLASS_TIME').catch(()=>[]);
            const optsRaw = (codes||[])
                .filter(isEnabledCode)
                .map(c => {
                    const label = toHHmm(c.name || c.code);
                    if (!/^\d{2}:\d{2}$/.test(label)) return null;
                    return { code: String(c.code ?? '').trim(), label };
                })
                .filter(Boolean);

            const seen = new Set();
            const opts = [];
            for (const o of optsRaw) {
                if (!o.code) continue;
                if (seen.has(o.code)) continue;
                seen.add(o.code);
                opts.push(o);
            }
            opts.sort((a,b)=> toMinutes(a.label) - toMinutes(b.label));
            setTimeOpts(opts);

            // 3) 반-과목 + (첫)슬롯 로딩
            // ✅ 함수명 변경: listClassSubjects -> listCourseSubjects
            const csList = await listCourseSubjects(classId).catch(()=>[]);
            const draft = [];
            for (const cs of (csList||[])){
                const slots = await listSlots(cs.id).catch(()=>[]);
                const p = slots?.[0] || null;

                const hhmm = toHHmm(p?.startTime) || '';
                const codeFromDb = p?.startTimeCode || null;
                const nameFromDb = p?.startTimeName || (hhmm || null);

                const finalCode = codeFromDb || (hhmm ? findCodeByLabel(hhmm) : null);
                const finalName = nameFromDb || (finalCode ? (findTimeByCode(finalCode)?.label ?? null) : null);

                draft.push({
                    csId: cs.id,
                    subjectId: cs.subjectId,
                    teacherId: cs.teacherId ?? null,
                    dayOfWeek: p?.dayOfWeek ?? 1,
                    startTime: hhmm,
                    startTimeCode: finalCode ?? '',
                    startTimeName: finalName ?? '',
                    room: p?.room ?? ''
                });
                if (cs.subjectName) m[cs.subjectId] = cs.subjectName;
            }
            setSubjectNameMap(m);
            setRows(draft);
        }catch(e){
            console.error('[ClassAssignPanel] init fail:', e);
            alertError('로딩 실패', '담당/시간 데이터를 불러오지 못했습니다.');
        }finally{
            setLoading(false);
        }
    })(); }, [classId, stageCode]);

    // 입력 헬퍼
    const setTeacher = (idx, teacherId)=> setRows(v=> v.map((r,i)=> i===idx ? {...r, teacherId:teacherId??null} : r));
    const setField   = (idx, patch)=> setRows(v=> v.map((r,i)=> i===idx ? {...r, ...patch} : r));
    const clearTime  = (idx)=> setRows(v=> v.map((r,i)=> i===idx ? {
        ...r, startTime:'', startTimeCode:'', startTimeName:'', room:''
    } : r));

    // 반 내부 겹침(클라 선제)
    const validateInside = (rows) => {
        const items = rows
            .filter(r => r.startTime && r.dayOfWeek)
            .map(r => ({ day:r.dayOfWeek, s:r.startTime, e:endPlus50(r.startTime), subjectId:r.subjectId }))
            .sort((a,b)=> a.day-b.day || toMinutes(a.s)-toMinutes(b.s));

        for (let i=0;i<items.length-1;i++){
            const A = items[i], B = items[i+1];
            if (A.day===B.day && toMinutes(A.e) > toMinutes(B.s)){
                const subjA = sName(A.subjectId) || `과목#${A.subjectId}`;
                const subjB = sName(B.subjectId) || `과목#${B.subjectId}`;
                return [
                    '해당 반 내부에서 시간이 겹칩니다:',
                    `[ ${subjA} ↔ ${subjB} ] ${DAY_LABELS[A.day]} ${A.s}~${A.e} ↔ ${B.s}~${B.e}`
                ].join('\n');
            }
        }
        return null;
    };

    // 교사 겹침(클라 선제)
    const validateTeacherOverlapInView = (rows) => {
        if (isExamPrep) return null;
        const prepared = rows
            .filter(r => r.teacherId && r.dayOfWeek && r.startTime)
            .map(r => ({ teacherId:r.teacherId, day:r.dayOfWeek, s:r.startTime, e:endPlus50(r.startTime), subjectId:r.subjectId }));

        const groups = new Map();
        for (const it of prepared){
            const key = `${it.teacherId}-${it.day}`;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(it);
        }

        const lines = [];
        for (const listRaw of groups.values()){
            const list = listRaw.sort((a,b)=> toMinutes(a.s)-toMinutes(b.s));
            for (let i=0;i<list.length-1;i++){
                const A = list[i], B = list[i+1];
                if (overlaps(A.s,A.e,B.s,B.e)){
                    const subjA = sName(A.subjectId) || `과목#${A.subjectId}`;
                    const subjB = sName(B.subjectId) || `과목#${B.subjectId}`;
                    lines.push(`[ ${subjA} ↔ ${subjB} ] ${DAY_LABELS[A.day]} ${A.s}~${A.e} ↔ ${DAY_LABELS[B.day]} ${B.s}~${B.e}`);
                }
            }
        }
        if (lines.length){
            return ['같은 선생님이 같은 요일에 동시간대 수업으로 겹칩니다.', '', ...lines].join('\n');
        }
        return null;
    };

    // 저장
    const onSave = async () => {
        if (saving) return;

        const items = rows.map(r => {
            const base = { classSubjectId: r.csId }; // DTO 호환 위해 classSubjectId 유지 (필요시 courseSubjectId로 변경 가능)

            if (r.startTime) {
                base.dayOfWeek = r.dayOfWeek;
                base.startTime = toHHmm(r.startTime);
                if (r.startTimeCode) base.startTimeCode = r.startTimeCode;
                if (r.startTimeName) base.startTimeName = r.startTimeName;
                base.room = r.room || '';
            } else {
                base.clearSlot = true;
            }

            if (isExamPrep) {
                base.clearTeacher = true;
            } else {
                if (r.teacherId == null) base.clearTeacher = true;
                else base.teacherId = r.teacherId;
            }

            return base;
        });

        const quick = validateInside(rows);
        if (quick) return alertError('겹침', quick);

        const tconf = validateTeacherOverlapInView(rows);
        if (tconf) return alertError('겹침(동일 선생님)', tconf);

        try{
            setSaving(true);
            await saveAssignmentsBulk(classId, items);
            await alertSuccess('저장 완료', '담당/시간이 저장되었습니다.');

            // 저장 후 재조회
            // ✅ 함수명 변경: listClassSubjects -> listCourseSubjects
            const csList = await listCourseSubjects(classId).catch(()=>[]);
            const draft = [];
            for (const cs of (csList||[])){
                const slots = await listSlots(cs.id).catch(()=>[]);
                const p = slots?.[0] || null;

                const hhmm = toHHmm(p?.startTime) || '';
                const codeFromDb = p?.startTimeCode || null;
                const nameFromDb = p?.startTimeName || (hhmm || null);

                const finalCode = codeFromDb || (hhmm ? findCodeByLabel(hhmm) : null);
                const finalName = nameFromDb || (finalCode ? (findTimeByCode(finalCode)?.label ?? null) : null);

                draft.push({
                    csId: cs.id,
                    subjectId: cs.subjectId,
                    teacherId: cs.teacherId ?? null,
                    dayOfWeek: p?.dayOfWeek ?? 1,
                    startTime: hhmm,
                    startTimeCode: finalCode ?? '',
                    startTimeName: finalName ?? '',
                    room: p?.room ?? ''
                });
            }
            setRows(draft);
        }catch(e){
            const msg = e?.response?.data?.message || e?.message || '저장 중 오류가 발생했습니다.';
            await alertError('저장 실패', msg);
        }finally{
            setSaving(false);
        }
    };

    if (loading) return <div className="aa-subtle">불러오는 중…</div>;
    if (!rows.length) return <div className="aa-subtle">과목이 아직 없습니다. 먼저 "과목 편성" 탭에서 과목을 추가하세요.</div>;

    return (
        <div>
            <div className="aa-subtle" style={{marginBottom:8}}>
                과목별로 <b>담당 선생님</b>과 <b>수업 시간(요일·시작)</b>을 지정합니다. 종료시간은 <b>시작+50분</b>으로 자동 설정됩니다.
                저장 시, 같은 시간대에 해당 선생님에게 배정된 <b>다른 반(타관 포함)</b> 수업이 있으면 저장이 차단됩니다.
            </div>

            <div className="assign-list">
                {rows.map((r, idx)=>(
                    <div key={r.csId} className="assign-card">
                        <div className="assign-head">
                            <div className="assign-title" title={sName(r.subjectId)}>
                                {sName(r.subjectId) || `과목#${r.subjectId}`}
                            </div>
                        </div>

                        {!isExamPrep && (
                            <div className="assign-row">
                                <label className="assign-label">담당 선생님</label>
                                <div className="assign-control">
                                    <HomeroomPicker
                                        value={r.teacherId ?? null}
                                        onChange={(tid)=>setTeacher(idx, tid)}
                                        workLocation={workLocation}
                                        allowAllLocations={true}
                                        placeholder="담당 선택"
                                    />
                                </div>
                            </div>
                        )}

                        <div className="assign-row">
                            <label className="assign-label">시간</label>
                            <div className="assign-control">
                                <div className="assign-slot-line">
                                    <select className="aa-select w-28"
                                            value={r.dayOfWeek}
                                            onChange={e=>setField(idx, {dayOfWeek:Number(e.target.value)})}>
                                        {[1,2,3,4,5,6,7].map(d => <option key={d} value={d}>{DAY_LABELS[d]}요일</option>)}
                                    </select>

                                    {timeOpts.length ? (
                                        <select className="aa-select w-28"
                                                value={r.startTimeCode || ''}
                                                onChange={e=>{
                                                    const code = e.target.value;
                                                    const opt = findTimeByCode(code);
                                                    setField(idx, {
                                                        startTimeCode: code || '',
                                                        startTimeName: opt?.label || '',
                                                        startTime: toHHmm(opt?.label || '')
                                                    });
                                                }}>
                                            {!r.startTimeCode && <option value="">시작시간 선택</option>}
                                            {timeOpts.map(o=><option key={`S:${o.code}`} value={o.code}>{o.label}</option>)}
                                        </select>
                                    ) : (
                                        <span className="aa-subtle">CLASS_TIME 공통코드(사용 중)가 없습니다.</span>
                                    )}

                                    <button className="aa-btn aa-btn-ghost aa-btn-sm" onClick={()=>clearTime(idx)}>지우기</button>
                                </div>

                                {!!r.startTime && (
                                    <div className="aa-subtle" style={{marginTop:4}}>
                                        종료시간은 <b>{endPlus50(r.startTime)}</b> 으로 자동 설정됩니다.
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <div className="aa-row" style={{justifyContent:'flex-end', marginTop:10}}>
                <button className="aa-btn aa-btn-primary" onClick={onSave} disabled={saving}>
                    {saving ? '저장 중…' : '변경사항 저장'}
                </button>
            </div>
        </div>
    );
}