// src/features/admin/pages/WeeklyGridPage.jsx
// ---------------------------------------------------------------------------
// 시간표(주간 그리드) - mode=teacher | class
// - 관 기준, 학부 미사용
// - 학기 목록 ACTIVE 기본
// - CSS: admin-system → admin-shared → admin-academy → admin-timetable
// ---------------------------------------------------------------------------
import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import LocationChips from '@/features/admin/components/LocationChips';
import HomeroomPicker from '@/features/admin/components/HomeroomPicker';
import TimetableGrid from '@/features/admin/components/timetable/TimetableGrid';
import { listSemesters as listSemestersApi } from '@/api/academySemesterApi';
import { listClasses } from '@/api/academyClassApi';
import { getTeacherEvents, getClassEvents } from '@/api/timetableApi';
import { alertError } from '@/ui/alert';

import '@/styles/admin-system.css';
import '@/styles/admin-shared.css';
import '@/styles/admin-academy.css';
import '@/styles/admin-timetable.css';

export default function WeeklyGridPage(){
    const [sp]=useSearchParams();
    const initMode = sp.get('mode')==='class' ? 'class' : 'teacher';

    const [mode,setMode]=useState(initMode);
    const [work,setWork]=useState('');

    const [semesters,setSemesters]=useState([]);
    const [semesterId,setSemesterId]=useState(null);

    const [teacherId,setTeacherId]=useState(null);
    const [classes,setClasses]=useState([]);
    const [classId,setClassId]=useState(null);

    const [events,setEvents]=useState([]);
    const [loading,setLoading]=useState(false);

    useEffect(()=>{ (async()=>{
        try{ setSemesters(await listSemestersApi(null,'ACTIVE')||[]);}catch{}
    })(); },[]);

    // 모드/관/학기 → 반 목록
    useEffect(()=>{ (async()=>{
        try{
            if(mode!=='class' || !work){ setClasses([]); setClassId(null); return; }
            const rows = await listClasses(work,null);
            const filtered = semesterId ? rows.filter(c=>c.semesterId===semesterId) : rows;
            setClasses(filtered||[]);
            setClassId(prev=> filtered?.some(c=>c.id===prev)? prev : (filtered?.[0]?.id ?? null));
        }catch{}
    })(); },[mode, work, semesterId]);

    const load=async()=>{
        setEvents([]); setLoading(true);
        try{
            if(mode==='teacher'){
                if(!work || !teacherId){ setLoading(false); return; }
                const list = await getTeacherEvents({ workLocation:work, teacherId, semesterId });
                setEvents(Array.isArray(list)? list : []);
            }else{
                if(!work || !classId){ setLoading(false); return; }
                const list = await getClassEvents({ workLocation:work, classId });
                setEvents(Array.isArray(list)? list : []);
            }
        }catch(e){
            const msg = e?.response?.data?.message || e?.message || '시간표를 불러오지 못했습니다.';
            await alertError('오류', msg);
        }finally{ setLoading(false); }
    };
    useEffect(()=>{ load(); /* eslint-disable-next-line */}, [mode, work, semesterId, teacherId, classId]);

    return (
        <div className="aa-page academy-page">
            <div className="aa-container">
                <div className="aa-toolbar aa-topbar">
                    <h1 className="aa-title">시간표(주간 그리드)</h1>

                    {/* 모드 토글 */}
                    <div className="aa-seg" role="tablist" aria-label="View Mode">
                        <button className={mode==='teacher'?'active':''} onClick={()=>setMode('teacher')}>교사</button>
                        <button className={mode==='class'  ?'active':''} onClick={()=>setMode('class')}>반</button>
                    </div>

                    <LocationChips value={work} onChange={setWork}/>

                    <select className="aa-select" value={semesterId??''}
                            onChange={e=>setSemesterId(e.target.value?Number(e.target.value):null)}>
                        <option value="">학기 전체</option>
                        {semesters.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>

                    {mode==='teacher' && (
                        <div className="grow" style={{maxWidth:420}}>
                            <HomeroomPicker
                                value={teacherId}
                                onChange={setTeacherId}
                                workLocation={work}
                                allowAllLocations={false}
                                placeholder="교사 선택"
                            />
                        </div>
                    )}
                    {mode==='class' && (
                        <select className="aa-select" value={classId??''}
                                onChange={e=>setClassId(e.target.value?Number(e.target.value):null)}>
                            <option value="">반 선택</option>
                            {classes.map(c=><option key={c.id} value={c.id}>{c.name} ({c.code})</option>)}
                        </select>
                    )}

                    <button className="aa-btn aa-btn-outline ml-auto" onClick={load}>새로고침</button>
                </div>

                {loading && <div className="aa-subtle">불러오는 중…</div>}
                {!loading && !events.length && <div className="aa-subtle">조건을 선택하면 그리드가 표시됩니다.</div>}
                {!!events.length && <TimetableGrid events={events} startHour={8} endHour={22}/>}
            </div>
        </div>
    );
}