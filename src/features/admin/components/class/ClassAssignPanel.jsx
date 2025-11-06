import React, { useEffect, useState } from 'react';
import HomeroomPicker from '@/features/admin/components/HomeroomPicker';
import { listClassSubjects, listSlots, saveAssignmentsBulk } from '@/api/academyClassApi';
import { listSubjectsByParent } from '@/api/academySubjectApi';
import { getCodes } from '@/api/commonCodeAdminApi';
import { alertSuccess, alertError } from '@/ui/alert';

const DAY_LABELS = { 1:'월', 2:'화', 3:'수', 4:'목', 5:'금', 6:'토', 7:'일' };

/** ▷ enabled 필터(공통코드 전용)
 *  - DB enabled: 1/0 (또는 true/false/'1'/'0'/'true'/'y')
 *  - 값이 없을 땐 호환을 위해 true로 간주
 */
const isEnabledCode = (item) => {
    const v = item?.enabled;
    if (v === undefined || v === null) return true;
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v === 1;
    const s = String(v).trim().toLowerCase();
    return s === '1' || s === 'true' || s === 'y';
};

// 어떤 형태여도 HH:mm으로 통일
const toHHmm = (raw) => {
    if (!raw) return '';
    const s = String(raw).trim();
    const m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (m) return `${m[1].padStart(2,'0')}:${m[2]}`;
    const digits = s.replace(/\D/g, '');
    if (digits.length === 4) return `${digits.slice(0,2)}:${digits.slice(2)}`;
    return s; // ← 시간 형식이 아니면 원문 유지(아래에서 HH:mm 필터로 제외)
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

    /** 시간 선택 옵션 — 공통코드 CLASS_TIME
     *  - code: 공통코드.code (예: "1630" or "T1630")
     *  - label: 사람이 읽는 라벨(예: "16:30")
     *  - ✅ enabled=1만 사용, ✅ HH:mm 라벨만 사용(형식 불일치 삭제)
     */
    const [timeOpts, setTimeOpts] = useState([]); // [{code, label}]
    const findTimeByCode  = (code) => timeOpts.find(o=>o.code===code) || null;
    const findCodeByLabel = (label) => (timeOpts.find(o=>o.label===label)?.code) || null;

    /** 편집행
     *  - startTime: "HH:mm" (겹침 검증/종료 자동계산용)
     *  - startTimeCode/startTimeName: 공통코드 스냅샷(저장용, 서버 DDL: class_time_code/label)
     */
    const [rows, setRows] = useState([]); // [{ csId, subjectId, teacherId|null, dayOfWeek, startTime, startTimeCode, startTimeName, room }]
    const [loading, setLoading] = useState(true);
    const [saving,  setSaving]  = useState(false);

    useEffect(()=>{ (async ()=>{
        try{
            setLoading(true);

            // 1) 과목 캐시(표시용 이름 매핑)
            const roots = await listSubjectsByParent(stageCode, null).catch(()=>[]);
            const m = {}; (roots||[]).forEach(n => m[n.id] = n.name);

            // 2) 시간 옵션 로딩(공통코드 CLASS_TIME)
            //    ✅ enabled=1만 노출 / ✅ 라벨이 HH:mm 형식이 아닌 항목은 제외
            const codes = await getCodes('CLASS_TIME').catch(()=>[]);
            const optsRaw = (codes||[])
                .filter(isEnabledCode)
                .map(c => {
                    const label = toHHmm(c.name || c.code);
                    if (!/^\d{2}:\d{2}$/.test(label)) return null; // HH:mm 아닌 라벨은 사용하지 않음
                    return { code: String(c.code ?? '').trim(), label };
                })
                .filter(Boolean);

            //    중복 code 제거(선행 우선)
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
            const csList = await listClassSubjects(classId).catch(()=>[]);
            const draft = [];
            for (const cs of (csList||[])){
                const slots = await listSlots(cs.id).catch(()=>[]);
                const p = slots?.[0] || null;

                // 기존 데이터 호환: startTimeCode가 없으면 라벨 매칭으로 코드 추정
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
    })(); }, [classId, stageCode]); // eslint-disable-line

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

    // 같은 선생님/같은 요일/동시간대 겹침(클라 선제)
    const validateTeacherOverlapInView = (rows) => {
        if (isExamPrep) return null; // ✅ 시험대비 학기는 교사 배정 제한(검증 불필요)
        const prepared = rows
            .filter(r => r.teacherId && r.dayOfWeek && r.startTime)
            .map(r => ({ teacherId:r.teacherId, day:r.dayOfWeek, s:r.startTime, e:endPlus50(r.startTime), subjectId:r.subjectId }));

        const groups = new Map(); // key: `${teacherId}-${day}`
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

        // 서버에 업서트/삭제/교사변경/초기화 명시적으로 전달
        const items = rows.map(r => {
            const base = { classSubjectId: r.csId };

            if (r.startTime) {
                base.dayOfWeek = r.dayOfWeek;
                base.startTime = toHHmm(r.startTime); // 겹침 검증/서버 계산용(백워드 호환)

                // ✅ 공통코드 스냅샷 동봉(DDL: class_time_code / label)
                if (r.startTimeCode) base.startTimeCode = r.startTimeCode;
                if (r.startTimeName) base.startTimeName = r.startTimeName;

                base.room = r.room || '';
            } else {
                base.clearSlot = true; // 슬롯 삭제
            }

            // ✅ 시험대비 학기는 교사지정 사용 안 함 → 항상 비우기
            if (isExamPrep) {
                base.clearTeacher = true;
            } else {
                if (r.teacherId == null) base.clearTeacher = true; // 담당 비우기
                else base.teacherId = r.teacherId;                 // 담당 지정/변경
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

            // 저장 후 재조회(스냅샷/시간 다시 반영)
            const csList = await listClassSubjects(classId).catch(()=>[]);
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

                        {/* ✅ 시험대비는 교사 선택 UI 자체를 숨김 */}
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

                                    {/* ✅ 시간: 공통코드 code를 값으로 사용, 라벨은 HH:mm
                      ✅ 공통코드가 비어있으면 안내 */}
                                    {timeOpts.length ? (
                                        <select className="aa-select w-28"
                                                value={r.startTimeCode || ''}
                                                onChange={e=>{
                                                    const code = e.target.value;
                                                    const opt = findTimeByCode(code);
                                                    setField(idx, {
                                                        startTimeCode: code || '',
                                                        startTimeName: opt?.label || '',
                                                        startTime: toHHmm(opt?.label || '') // 겹침검증/종료계산용
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