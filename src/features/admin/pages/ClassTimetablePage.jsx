// src/features/admin/pages/ClassTimetablePage.jsx
// ---------------------------------------------------------------------------
// 반별 시간표 (관 기준, 학부 미사용)
// - 상단: 관 / (옵션)학기(ACTIVE 기본) / 반 선택
// - 데이터: GET /api/admin/timetable/class-events
// - CSS: admin-system → admin-shared → admin-academy → admin-timetable
// ---------------------------------------------------------------------------
import React, { useEffect, useState } from 'react';
import LocationChips from '@/features/admin/components/LocationChips';
import TimetableGrid from '@/features/admin/components/timetable/TimetableGrid';
import { listSemesters as listSemestersApi } from '@/api/academySemesterApi';
import { listClasses } from '@/api/academyClassApi';
import { getClassEvents } from '@/api/timetableApi';
import { alertError } from '@/ui/alert';

import '@/styles/admin-system.css';
import '@/styles/admin-shared.css';
import '@/styles/admin-academy.css';
import '@/styles/admin-timetable.css';

export default function ClassTimetablePage(){
    const [work,setWork]=useState('');
    const [semesterId,setSemesterId]=useState(null);
    const [semesters,setSemesters]=useState([]);

    const [classes,setClasses]=useState([]);
    const [classId,setClassId]=useState(null);

    const [events,setEvents]=useState([]);
    const [loading,setLoading]=useState(false);

    // 학기 목록
    useEffect(()=>{ (async()=>{
        try{ setSemesters(await listSemestersApi(null,'ACTIVE')||[]);}catch{}
    })(); },[]);

    // 관/학기 → 반 목록
    useEffect(()=>{ (async()=>{
        try{
            if(!work){ setClasses([]); setClassId(null); return; }
            const rows = await listClasses(work,null);
            const filtered = semesterId ? rows.filter(c=>c.semesterId===semesterId) : rows;
            setClasses(filtered||[]);
            setClassId(prev=> filtered?.some(c=>c.id===prev)? prev : (filtered?.[0]?.id ?? null));
        }catch{}
    })(); },[work,semesterId]);

    const load=async()=>{
        setEvents([]); if(!work || !classId) return; setLoading(true);
        try{
            const list = await getClassEvents({ workLocation:work, classId });
            setEvents(Array.isArray(list)?list:[]);
        }catch(e){
            await alertError('오류', e?.response?.data?.message || e?.message || '시간표를 불러오지 못했습니다.');
        }finally{ setLoading(false); }
    };
    useEffect(()=>{ load(); /* eslint-disable-next-line */},[work,classId]);

    return (
        <div className="aa-page academy-page">
            <div className="aa-container">
                <div className="aa-toolbar aa-topbar">
                    <h1 className="aa-title">시간표(반)</h1>
                    <LocationChips value={work} onChange={setWork}/>

                    <select className="aa-select" value={semesterId??''}
                            onChange={e=>setSemesterId(e.target.value?Number(e.target.value):null)} title="학기(옵션)">
                        <option value="">학기 전체</option>
                        {semesters.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>

                    <select className="aa-select" value={classId??''}
                            onChange={e=>setClassId(e.target.value?Number(e.target.value):null)} title="반 선택">
                        <option value="">반 선택</option>
                        {classes.map(c=><option key={c.id} value={c.id}>{c.name} ({c.code})</option>)}
                    </select>

                    <button className="aa-btn aa-btn-outline" onClick={load} disabled={!classId}>새로고침</button>
                </div>

                {loading && <div className="aa-subtle">불러오는 중…</div>}
                {!loading && !events.length && <div className="aa-subtle">반을 선택하면 시간표가 표시됩니다.</div>}
                {!!events.length && <TimetableGrid events={events} startHour={8} endHour={22}/>}
            </div>
        </div>
    );
}