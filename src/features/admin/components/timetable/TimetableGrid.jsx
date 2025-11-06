// src/features/admin/components/timetable/TimetableGrid.jsx
// ---------------------------------------------------------------------------
// 주간 시간표 "그리드" 뷰 (sticky 헤더/시간축 + 단일 스크롤 컨테이너)
// - 눈금 기준: CLASS_TIME ∪ events.start (합집합, 정규화 후 중복 제거·정렬)
// - 배치 규칙: 같은 요일 & 같은 시작시각 이벤트는 "세로 스택"
// - 스크롤: .tt-scroll 하나에서 X/Y 모두 처리
// - props:
//    • events, timeSlots, showTeacher, locNameByCode (기존)
//    • rowHeight    : 각 슬롯(행) 높이(px)     (기본 72)
//    • wrapMaxVH    : 스크롤 최대 높이(vh)     (기본 68)
//    • dayMinWidth  : 요일 최소폭(px)          (기본 220)
//    • days        : 표시 요일 배열(기본 [1..7])
// ---------------------------------------------------------------------------

import React, { useMemo, useRef, useEffect } from 'react';
import '@/styles/admin-system.css';
import '@/styles/admin-timetable.css';

const DAY_LABELS = {1:'월',2:'화',3:'수',4:'목',5:'금',6:'토',7:'일'};

/* ── 시간 유틸(강화판) ─────────────────────────────────────── */
/** 어떤 형태여도 'HH:mm'으로 정규화
 *  - 허용: 'H:m', 'HH:mm', 'HH:mm:ss', '1630', 숫자형 등
 *  - 불가: 시간으로 해석 불가 시 null
 */
const normHHmm = (raw) => {
    const s = String(raw ?? '').trim();
    if (!s) return null;

    // 1) HH:mm 또는 HH:mm:ss
    let m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (m) return `${m[1].padStart(2,'0')}:${m[2]}`;

    // 2) 4자리 숫자(HHmm) → HH:mm
    const digits = s.replace(/\D/g, '');
    if (digits.length === 4) return `${digits.slice(0,2)}:${digits.slice(2)}`;

    return null;
};

/** 'HH:mm' → 분 (정규화 후 계산) */
const toMin = (t) => {
    const v = normHHmm(t);
    if (!v) return 0;
    const [h, m] = v.split(':').map(Number);
    return (h * 60 + m) | 0;
};

/** 표시용 보조(정규화 실패 시 '00:00') */
const hhmm = (t) => normHHmm(t) ?? '00:00';

/** 과목 표시 보조: '과목/세부' → '과목' */
const subjectOnly = (sub) => (String(sub || '').split('/')[0] || '').trim();

export default function TimetableGrid({
                                          events = [],
                                          timeSlots = [],
                                          showTeacher = false,
                                          locNameByCode = {},
                                          rowHeight = 72,            // ★ 슬롯(행) 높이
                                          wrapMaxVH = 68,            // ★ 세로 최대 높이 (vh)
                                          dayMinWidth = 220,         // ★ 요일 최소폭(px)
                                          days = [1,2,3,4,5,6,7],    // ★ 요일 표시 범위
                                      }) {
    /* 0) 눈금(ticks) = (CLASS_TIME) ∪ (이벤트 시작시각) → 정규화 → 중복 제거 → 정렬
     *    - 상위에서 timeSlots가 비었거나 CLASS_TIME이 전부 비활성이라도,
     *      events.start가 있으면 그 값으로 눈금을 구성한다.
     */
    const ticks = useMemo(() => {
        const fromSlots = (timeSlots || []).map(normHHmm).filter(Boolean);     // 이미 HH:mm인 경우 그대로, 아니면 정규화
        const fromEvts  = (events || []).map(e => normHHmm(e.start)).filter(Boolean);
        const uniq = Array.from(new Set([...fromSlots, ...fromEvts]));
        return uniq.sort((a, b) => toMin(a) - toMin(b));
    }, [timeSlots, events]);

    /* 'HH:mm' → 슬롯 index 매핑 */
    const slotIndexByLabel = useMemo(
        () => new Map(ticks.map((t, i) => [t, i])),
        [ticks]
    );

    /* 1) 요일별 → 슬롯별 그룹
     *    - 같은 요일/같은 시작 시각이면 같은 슬롯으로 묶고,
     *      그 슬롯 안에서는 타이틀/서브타이틀 기준으로 정렬하여 세로 스택한다.
     */
    const grouped = useMemo(() => {
        const g = Object.fromEntries(days.map(d => [d, {}]));
        for (const e of (events || [])) {
            const d = e?.dayOfWeek | 0;
            if (!days.includes(d)) continue;

            const sLabel = normHHmm(e.start);
            if (!sLabel) continue;             // 시작 시각 정규화 실패 → 배치 불가
            const sIdx = slotIndexByLabel.get(sLabel);
            if (sIdx == null) continue;        // 눈금에 없는 경우(이변) → 스킵

            (g[d][sIdx] ||= []).push(e);
        }
        // 슬롯 내 정렬(제목 → 부제)
        for (const d of days) {
            for (const k of Object.keys(g[d])) {
                g[d][k].sort((a,b) =>
                    (a.title||'').localeCompare(b.title||'') ||
                    (a.subtitle||'').localeCompare(b.subtitle||'')
                );
            }
        }
        return g;
    }, [events, slotIndexByLabel, days]);

    /* 2) 슬롯별 필요 행 수 = 요일 중 최대 그룹 크기(없어도 1행 유지) */
    const slotRows = useMemo(() => {
        const rows = Array(ticks.length).fill(1);
        for (let i = 0; i < ticks.length; i++) {
            let maxN = 1;
            for (const d of days) {
                const n = (grouped[d][i]?.length || 0);
                if (n > maxN) maxN = n;
            }
            rows[i] = maxN;
        }
        return rows;
    }, [ticks.length, grouped, days]);

    /* 3) 각 슬롯의 시작 Y(top) 좌표(누적 높이) & 전체 높이 */
    const slotTops = useMemo(() => {
        const tops = Array(ticks.length).fill(0);
        let y = 0;
        for (let i = 0; i < ticks.length; i++) {
            tops[i] = y;
            y += rowHeight * (slotRows[i] || 1);
        }
        return tops;
    }, [ticks.length, slotRows, rowHeight]);

    // at(-1) 대신 호환성 고려한 계산
    const totalHeight = useMemo(() => {
        if (!ticks.length) return 0;
        const lastIdx = ticks.length - 1;
        return (slotTops[lastIdx] ?? 0) + rowHeight * (slotRows[lastIdx] ?? 1);
    }, [ticks.length, slotTops, slotRows, rowHeight]);

    /* 4) 관 코드 → 이름 */
    const locNameOf = (code) => {
        const c = code == null ? '' : String(code);
        return c ? (locNameByCode[c] || c) : '';
    };

    /* 5) 최초 진입 시 "첫 수업이 있는 슬롯"으로 세로스크롤 이동 */
    const scrollRef = useRef(null);
    useEffect(() => {
        if (!scrollRef.current || !ticks.length) return;

        let firstIdx = 0;
        outer: for (let i = 0; i < ticks.length; i++) {
            for (const d of days) {
                if ((grouped[d][i]?.length || 0) > 0) { firstIdx = i; break outer; }
            }
        }
        // 헤더는 sticky라 여백 불필요, 살짝 위로 여유
        const PAD = 4;
        scrollRef.current.scrollTop = Math.max(0, (slotTops[firstIdx] ?? 0) - PAD);
    }, [ticks, grouped, slotTops, days]);

    /* ── 렌더 ───────────────────────────────────────────────── */
    return (
        <div className="aa-card">
            {/* 상단 메타(선택) */}
            <div className="tt-meta">
                <div className="tt-stat">
                    {ticks.length ? `표시 슬롯: ${ticks[0]} ~ ${ticks[ticks.length-1]}` : '표시 슬롯: -'}
                </div>
                <div className="tt-stat">수업 {events.length}개</div>
            </div>

            {/* 빈 눈금 가드(상위에서 CLASS_TIME이 없고 이벤트에도 시작시각이 없을 때) */}
            {!ticks.length && (
                <div className="aa-subtle" style={{ marginBottom: 8 }}>
                    표시할 시간 슬롯이 없습니다. CLASS_TIME이 없거나, 이벤트에 시작 시간이 없습니다.
                </div>
            )}

            {/* 단일 스크롤 컨테이너: CSS 변수로 크기 제어 */}
            <div
                ref={scrollRef}
                className="tt-scroll"
                style={{
                    // ★ 모달/일반에서 각각 다르게 오버라이드 가능
                    '--tt-wrap-max-h': `${wrapMaxVH}vh`,
                    '--tt-day-col-min': `${dayMinWidth}px`,
                    '--tt-days': days.length,
                }}
            >
                {/* 상단 요일 헤더 (sticky top) */}
                <div className="tt-days-header" role="rowgroup" aria-label="요일 헤더">
                    {/* 시간 패드(왼쪽 고정폭) */}
                    <div className="tt-timepad" aria-hidden="true" />
                    {/* 요일  */}
                    {days.map((d) => (
                        <div key={`h-${d}`} className="tt-dayhead"><b>{DAY_LABELS[d]}</b></div>
                    ))}
                </div>

                {/* 본문 그리드 (시간축 sticky left + 배경 라인 + 이벤트 카드) */}
                <div className="tt-grid" role="grid" aria-label="주간 시간표">
                    {/* 좌측 시간축 (sticky left) */}
                    <div className="tt-timecol" aria-hidden="true">
                        {/* 슬롯 라인 */}
                        {ticks.map((_, i) => (
                            <div key={`line-${i}`} className="tt-hourline" style={{ top: slotTops[i] }} />
                        ))}
                        {/* 라벨: 첫 라벨은 .is-first 로 translateY 해제 */}
                        {ticks.map((label, i) => (
                            <div
                                key={`lab-${label}`}
                                className={`tt-hourlabel ${i === 0 ? 'is-first' : ''}`}
                                style={{ top: slotTops[i] }}
                            >
                                {label}
                            </div>
                        ))}
                        {/* 마지막 바닥선 + 공간 확보 */}
                        <div className="tt-hourline" style={{ top: totalHeight }} />
                        <div style={{ height: totalHeight }} />
                    </div>

                    {/* 요일 본문 열 */}
                    {days.map((d) => {
                        // grouped[d] 는 { slotIdx: Event[] }
                        const entries = Object.entries(grouped[d] || {})
                            .map(([i, list]) => [Number(i), list])
                            .sort((a,b) => a[0] - b[0]);

                        return (
                            <div key={`col-${d}`} className="tt-daycol" role="column" aria-label={`${DAY_LABELS[d]}요일`}>
                                {/* 배경 라인 */}
                                {ticks.map((_, i) => (
                                    <div key={`col-${d}-${i}`} className="tt-hourline" style={{ top: slotTops[i] }} />
                                ))}
                                <div className="tt-hourline" style={{ top: totalHeight }} />

                                {/* 슬롯별 세로 스택 */}
                                {entries.map(([sIdx, list]) => {
                                    const baseTop = slotTops[sIdx];
                                    return list.map((e, iInSlot) => {
                                        const top = baseTop + iInSlot * rowHeight;
                                        const height = rowHeight;

                                        const loc  = locNameOf(e.workLocationCode);
                                        const subj = subjectOnly(e.subtitle);
                                        const title = [
                                            loc ? `[${loc}]` : null,
                                            e.title || null,
                                            subj || null,
                                            showTeacher ? (e.teacherName || null) : null
                                        ].filter(Boolean).join(' - ');

                                        const sDisp = hhmm(e.start);
                                        const eDisp = hhmm(e.end);

                                        return (
                                            <div
                                                key={`${d}-${sIdx}-${iInSlot}-${e.title||''}-${e.subtitle||''}`}
                                                className="tt-event"
                                                style={{ top, height, left: 6, right: 6, width: 'auto' }}
                                                title={`${sDisp}~${eDisp} ${title}`}
                                                tabIndex={0}
                                                role="button"
                                                aria-label={`${DAY_LABELS[d]} ${sDisp}~${eDisp} ${title}`}
                                            >
                                                {title && <div className="tt-event-title">{title}</div>}
                                                <div className="tt-event-time">{sDisp} ~ {eDisp}</div>
                                            </div>
                                        );
                                    });
                                })}

                                {/* 열 높이 확보 */}
                                <div style={{ height: totalHeight }} />
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}