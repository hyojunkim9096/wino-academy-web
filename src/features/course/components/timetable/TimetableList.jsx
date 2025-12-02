// src/features/course/components/timetable/TimetableList.jsx
// --------------------------------------------------------------------
// 타임테이블 "리스트" 뷰
// - props.events: [{ dayOfWeek:1..7, start:'HH:mm', end:'HH:mm', title, subtitle, teacherName?, workLocationCode? }]
// - props.showTeacher: true 이면 교사명까지 표시 (여러 교사 혼합 조회용)
// - props.locNameByCode: { [code]: name } 맵 전달 → [관이름] 표기용
// - 정렬: 요일(1~7) → 시작시간 오름차순
// --------------------------------------------------------------------
import React, { useMemo } from 'react';
import '@/features/system/styles/admin-system.css';
import '@/features/course/styles/admin-timetable.css';

const DAY_LABELS = {1:'월',2:'화',3:'수',4:'목',5:'금',6:'토',7:'일'};

/** 'HH:mm' → 분 */
function toMin(t){
    if(!t) return 0;
    const [h,m] = String(t).split(':').map(Number);
    return (h*60 + (m||0))|0;
}

export default function TimetableList({ events = [], showTeacher = false, locNameByCode = {} }){
    // 요일별 그룹 → 시간순 정렬
    const byDay = useMemo(()=>{
        const g = {1:[],2:[],3:[],4:[],5:[],6:[],7:[]};
        for(const e of events){ if(e?.dayOfWeek>=1 && e.dayOfWeek<=7) g[e.dayOfWeek].push(e); }
        for(const d of [1,2,3,4,5,6,7]) g[d].sort((a,b)=>toMin(a.start)-toMin(b.start));
        return g;
    }, [events]);

    const total = events.length;

    // 과목명만 추출(서브타이틀: "과목 / 강의실" 포맷을 사용하므로 왼쪽만 가져온다)
    const subjectOnly = (sub) => (String(sub||'').split('/')[0] || '').trim();

    // 관 이름 매핑
    const locNameOf = (code) => {
        const c = (code || '').toString();
        return c ? (locNameByCode[c] || c) : '';
    };

    return (
        <div className="tt-list">
            {/* 상단 메타 */}
            <div className="tt-headrow">
                <div className="aa-badge aa-badge--muted">이벤트 {total}개</div>
            </div>

            {[1,2,3,4,5,6,7].map(d=>{
                const rows = byDay[d];
                return (
                    <div key={d} className="tt-daygroup">
                        <div className="tt-daygroup-header">
                            <div className="tt-dayname">{DAY_LABELS[d]}요일</div>
                            <div className="aa-badge aa-badge--muted">{rows.length}개</div>
                        </div>

                        <div className="tt-rows">
                            {rows.length===0 && (
                                <div className="tt-row">
                                    <div className="tt-time">-</div>
                                    <div className="tt-info aa-subtle">수업 없음</div>
                                </div>
                            )}

                            {rows.map((e, i)=>{
                                const loc = locNameOf(e.workLocationCode);
                                const subj = subjectOnly(e.subtitle);
                                return (
                                    <div key={i} className="tt-row">
                                        <div className="tt-time">{e.start} ~ {e.end}</div>

                                        {/* 오른쪽 정보: [관이름] 반명 · 과목 · (담당)교사 */}
                                        <div className="tt-info">
                                            {!!loc && <span className="tt-loc">[{loc}] </span>}
                                            {!!e.title && <span className="tt-title">{e.title}</span>}
                                            {!!subj && <span className="tt-sub">· {subj}</span>}
                                            {showTeacher && !!e.teacherName && (
                                                <span className="tt-sub">· {e.teacherName}</span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}