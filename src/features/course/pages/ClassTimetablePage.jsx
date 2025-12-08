// src/features/course/pages/ClassTimetablePage.jsx
// ---------------------------------------------------------------------------
// 반별 시간표 (관 기준, 학부 미사용)
// - 상단: 관 / (옵션)학기(ACTIVE 기본) / 반 선택
// - 데이터: GET /api/admin/timetable/class-events
// - CSS: admin-system → admin-shared → admin-academy → admin-timetable
// - 리팩토링 반영: listClasses -> listCourses (academyCourseApi.js)
// ---------------------------------------------------------------------------
import React, { useEffect, useState } from 'react';

// ✅ [수정] 컴포넌트 경로 변경 (member, course 도메인 등)
import LocationChips from '@/features/member/components/LocationChips.jsx';
import TimetableGrid from '@/features/course/components/timetable/TimetableGrid.jsx';

// ✅ [수정] API 경로 변경 (semester, course 도메인)
import { listSemesters as listSemestersApi } from '@/features/semester/api/academySemesterApi.js';
import { listCourses } from '@/features/course/api/academyCourseApi.js';
import { getClassEvents } from '@/features/course/api/timetableApi.js';

// ✅ [수정] 공통 UI 유틸
import { alertError } from '@/common/ui/alert.js';

// ✅ [수정] 스타일 경로 변경 (system, admin, course 도메인)
import '@/features/system/styles/admin-system.css';
import '@/features/admin/styles/admin-shared.css';
import '@/features/admin/styles/admin-academy.css';
import '@/features/course/styles/admin-timetable.css';

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
            // ✅ 변경: listCourses 사용
            const rows = await listCourses(work,null);
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