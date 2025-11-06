// ============================================================================
// TimeslotPickerModal — 타임슬롯 선택 모달 (반응형 + 콤팩트 테이블, 전체 코드)
// ----------------------------------------------------------------------------
// 포인트
//  - 모바일(≤sm): 카드형 리스트(변경 없음) → 가로 스크롤 0
//  - sm 이상: "콤팩트 테이블" 적용
//      · table width: 100% (minWidth:0)
//      · 헤더/셀 패딩을 인라인 스타일로 강하게 축소
//      · 고정폭 더 줄임(체크박스/요일/시간)
//      · 과목/반 이름은 최대폭 제한 + 줄바꿈
// ============================================================================

import React, { useEffect, useMemo, useState } from 'react';
import Modal from '@/components/ui/Modal';
import { suggestTimeslots, getEnrollmentTimeslots } from '@/api/studentEnrollmentApi';
import { alertError } from '@/ui/alert';

const DAY_LABELS = {1:'월',2:'화',3:'수',4:'목',5:'금',6:'토',7:'일'};
const safeError = (t, m) => Promise.resolve(alertError(t, m)).catch(()=>{});

/** ⏱️ LocalTime/문자열 → 'HH:mm' 폴백 'HH:mm' */
function toHHmm(v){
    if (!v) return '-';
    if (typeof v === 'string') {
        if (/^\d{2}:\d{2}(:\d{2})?$/.test(v)) return v.slice(0,5);
        const m = v.match(/T?(\d{2}:\d{2})(:\d{2})?/);
        return m ? m[1] : v;
    }
    try{
        const d = new Date(v);
        if (!isNaN(d)) {
            const h = String(d.getHours()).padStart(2,'0');
            const m = String(d.getMinutes()).padStart(2,'0');
            return `${h}:${m}`;
        }
    }catch{/* noop */}
    return String(v);
}

export default function TimeslotPickerModal({
                                                title = '타임슬롯 선택',
                                                studentId,
                                                classId,
                                                locCode,
                                                stage,
                                                gradeCode,
                                                enrollmentId,
                                                initialSelectedIds = [],
                                                onClose,
                                                onSubmit,
                                            }){
    const [querying, setQuerying] = useState(false);

    // 필터
    const [days, setDays]   = useState(new Set());
    const [from, setFrom]   = useState('');
    const [to, setTo]       = useState('');
    const [limit, setLimit] = useState(50);

    // 후보/선택
    const [rows, setRows]         = useState([]);
    const [selected, setSelected] = useState(new Set(initialSelectedIds || []));

    // 기존 매핑 불러오기
    useEffect(()=>{
        let alive = true;
        (async ()=>{
            if (!enrollmentId) return;
            try{
                const ids = await getEnrollmentTimeslots(enrollmentId);
                if (!alive) return;
                setSelected(new Set(Array.isArray(ids) ? ids : []));
            }catch{/* ignore */}
        })();
        return ()=>{ alive = false; };
    },[enrollmentId]);

    // 정렬
    const sortByDayTimeClass = (arr=[]) =>
        arr.slice().sort((a,b)=>{
            const da = Number(a.dayOfWeek||0), db = Number(b.dayOfWeek||0);
            if (da !== db) return da - db;
            const ta = `${a.classTimeLabel||''}${a.startTime||''}`;
            const tb = `${b.classTimeLabel||''}${b.startTime||''}`;
            const tcmp = ta.localeCompare(tb);
            if (tcmp !== 0) return tcmp;
            return String(a.className||'').localeCompare(String(b.className||''));
        });

    // 조회
    const fetchSuggest = async ()=>{
        setQuerying(true);
        try{
            const daysParam = days.size ? Array.from(days) : undefined;
            if (from && to && String(from) > String(to)) { setQuerying(false); return; }

            const userLimit    = Math.max(1, Number(limit || 50));
            const requestLimit = Math.min(200, userLimit * 3);

            const params = {
                loc: locCode || undefined,
                stage: stage || undefined,
                grade: gradeCode || undefined,
                days: daysParam,
                from: from || undefined,
                to: to || undefined,
                excludeStudentId: studentId || undefined,
                limit: requestLimit,
            };

            const list = await suggestTimeslots(params);
            const filtered = (list||[]).filter(x => Number(x.classId) === Number(classId));
            const sorted   = sortByDayTimeClass(filtered);
            setRows(sorted.slice(0, userLimit));
        }catch(e){
            safeError('오류', e?.response?.data?.message || '타임슬롯 후보 조회 실패');
        }finally{
            setQuerying(false);
        }
    };

    useEffect(()=>{ fetchSuggest(); /* eslint-disable-next-line */ },[]);

    const toggleDay = (d)=>{
        setDays(prev=>{
            const s = new Set(prev);
            if (s.has(d)) s.delete(d); else s.add(d);
            return s;
        });
    };

    const isChecked = (id)=> selected.has(Number(id));
    const toggleOne = (id)=>{
        setSelected(prev=>{
            const s = new Set(prev);
            const n = Number(id);
            if (s.has(n)) s.delete(n); else s.add(n);
            return s;
        });
    };

    const selectedCount = selected.size;
    const invalidRange  = !!(from && to && String(from) > String(to));

    // 공통: 축소 패딩 (인라인 스타일로 강제)
    const thPad = { padding: '6px 8px' };
    const tdPad = { padding: '6px 8px' };

    return (
        <Modal title={title} onClose={onClose} size="max-w-[75vw] sm:max-w-[450px] md:max-w-[550px]">
            <div className="space-y-3 w-[92vw] max-w-[500px] sm:w-auto">

                {/* =================== 필터 =================== */}
                <div className="rounded border border-slate-700 p-3 bg-slate-900/40">
                    {/* 1줄: 요일 + 개수 */}
                    <div className="flex flex-wrap items-end justify-between gap-3">
                        <div className="min-w-[240px] flex-1">
                            <div className="text-sm mb-1 text-slate-300">요일</div>
                            <div className="flex flex-wrap gap-1">
                                {[1,2,3,4,5,6,7].map(d=>(
                                    <button
                                        key={d}
                                        className={`px-2 py-1 rounded border text-sm ${
                                            days.has(d) ? 'bg-indigo-600 border-indigo-500'
                                                : 'border-slate-600 hover:border-slate-500'
                                        }`}
                                        onClick={()=>toggleDay(d)}
                                    >{DAY_LABELS[d]}</button>
                                ))}
                            </div>
                        </div>

                        <label className="block w-full sm:w-auto">
                            <div className="text-sm mb-1 text-slate-300">개수</div>
                            <input
                                className="aa-input w-full sm:w-[96px]"
                                type="number" min={1} max={200}
                                value={limit}
                                onChange={e=>{
                                    const n = Number(e.target.value||50);
                                    if (Number.isFinite(n)) setLimit(Math.max(1, Math.min(200, n)));
                                }}
                            />
                        </label>
                    </div>

                    {/* 2줄: 날짜 */}
                    <div className="mt-3 grid md:grid-cols-3 gap-3 items-end">
                        <label className="block">
                            <div className="text-sm mb-1 text-slate-300">시작일(선택)</div>
                            <input className="aa-input w-full min-w-[160px]" type="date"
                                   value={from} max={to||undefined} onChange={e=>setFrom(e.target.value)} />
                        </label>
                        <label className="block">
                            <div className="text-sm mb-1 text-slate-300">종료일(선택)</div>
                            <input className="aa-input w-full min-w-[160px]" type="date"
                                   value={to} min={from||undefined} onChange={e=>setTo(e.target.value)} />
                        </label>
                        <div className="hidden md:block" />
                    </div>

                    {/* 3줄: 버튼(하단 우측) */}
                    <div className="mt-2 flex gap-2 justify-end">
                        <button className="aa-btn"
                                onClick={()=>{ setFrom(''); setTo(''); setDays(new Set()); setLimit(50); }}>초기화</button>
                        <button className="aa-btn aa-btn-primary"
                                onClick={fetchSuggest}
                                disabled={querying || invalidRange}
                                title={invalidRange ? '기간을 확인하세요.' : undefined}>
                            {invalidRange ? '기간 확인' : (querying ? '조회 중…' : '조회')}
                        </button>
                    </div>

                    <div className="text-xs text-slate-400 mt-2">
                        * 학생의 기존 일정과 <b>요일·시간 겹치는 슬롯은 제외</b>되어 조회됩니다.
                    </div>
                </div>

                {/* =================== 후보 목록 =================== */}

                {/* 모바일(≤sm): 카드형 */}
                <div className="sm:hidden space-y-2">
                    {rows.length === 0 && (
                        <div className="px-3 py-2 rounded border border-slate-700 text-slate-300 bg-slate-900/40">후보 없음</div>
                    )}
                    {rows.map(r=>{
                        const id = Number(r.timeslotId);
                        const subject = r.subjectName || r.subjectCode || '-';
                        const timeLabel = r.classTimeLabel || toHHmm(r.startTime) || '-';
                        const dayLabel = DAY_LABELS[Number(r.dayOfWeek)] || '-';
                        const checked = isChecked(id);
                        return (
                            <label key={id}
                                   className={`block rounded border px-3 py-2 bg-slate-900/40 ${
                                       checked ? 'border-indigo-500 ring-1 ring-indigo-500' : 'border-slate-700'
                                   }`}>
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                        <input type="checkbox" checked={checked} onChange={()=>toggleOne(id)} />
                                        <div className="text-sm">
                                            <div className="font-medium">{subject}</div>
                                            <div className="text-slate-400">{r.className || '-'}</div>
                                        </div>
                                    </div>
                                    <div className="text-right text-sm">
                                        <div className="aa-cell-mono">{timeLabel}</div>
                                        <div className="text-slate-400">{dayLabel}</div>
                                    </div>
                                </div>
                            </label>
                        );
                    })}
                </div>

                {/* sm 이상: 콤팩트 테이블 */}
                <div className="hidden sm:block aa-table-wrap relative max-h-[55vh] overflow-y-auto overflow-x-hidden border border-slate-700 rounded">
                    <table
                        className="aa-table table-auto text-[13px] leading-tight"
                        style={{ width: '100%', minWidth: 0 }}   // ← 컨테이너 안에서만 배치
                    >
                        <colgroup>
                            <col style={{ width: 36 }} />  {/* 체크박스 */}
                            <col style={{ width: 44 }} />  {/* 요일 */}
                            <col style={{ width: 68 }} />  {/* 시간 */}
                            <col />                         {/* 과목 */}
                            <col />                         {/* 반 이름 */}
                        </colgroup>

                        <thead className="sticky top-0 bg-slate-900/80 backdrop-blur z-10 text-xs">
                        <tr>
                            <th style={thPad}></th>
                            <th style={thPad} className="whitespace-nowrap">요일</th>
                            <th style={thPad} className="whitespace-nowrap">시간</th>
                            <th style={thPad}>과목</th>
                            <th style={thPad}>반 이름</th>
                        </tr>
                        </thead>

                        <tbody>
                        {rows.length === 0 && (
                            <tr><td style={tdPad} colSpan={5}>후보 없음</td></tr>
                        )}

                        {rows.map(r=>{
                            const id = Number(r.timeslotId);
                            const subject = r.subjectName || r.subjectCode || '-';
                            const timeLabel = r.classTimeLabel || toHHmm(r.startTime) || '-';
                            return (
                                <tr key={id} className="hover:bg-slate-800/40">
                                    <td style={tdPad} className="text-center align-middle">
                                        <input type="checkbox" className="align-middle"
                                               checked={isChecked(id)} onChange={()=>toggleOne(id)} />
                                    </td>

                                    <td style={tdPad} className="text-center whitespace-nowrap">
                                        {DAY_LABELS[Number(r.dayOfWeek)] || '-'}
                                    </td>

                                    <td style={tdPad} className="aa-cell-mono whitespace-nowrap">
                                        {timeLabel}
                                    </td>

                                    {/* 텍스트 컬럼: 최대폭을 더 줄이고 줄바꿈 허용 */}
                                    <td style={tdPad} className="align-top">
                                        <div
                                            className="whitespace-normal break-words"
                                            style={{ maxWidth: 180 }}                 // 기본 180px
                                        >
                                            {subject}
                                        </div>
                                    </td>

                                    <td style={tdPad} className="align-top">
                                        <div
                                            className="whitespace-normal break-words"
                                            style={{ maxWidth: 160 }}                 // 기본 160px
                                        >
                                            {r.className || '-'}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                        </tbody>
                    </table>
                </div>

                {/* 푸터 */}
                <div className="flex justify-between items-center pt-2">
                    <div className="text-sm">현재 선택 <b>{selectedCount}</b>개</div>
                    <div className="flex gap-2">
                        <button className="aa-btn" onClick={onClose}>취소</button>
                        <button className="aa-btn aa-btn-primary" onClick={()=> onSubmit?.(Array.from(selected))}>
                            저장
                        </button>
                    </div>
                </div>
            </div>
        </Modal>
    );
}