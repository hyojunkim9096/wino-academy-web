// src/features/admin/pages/TeacherTimetablePage.jsx
// ---------------------------------------------------------------------------
// 교사별 시간표 페이지
// - 조회 조건: 학기(전체 가능) / 관(전체 가능) / 담임교사(전체 가능)
// - 그리드/리스트 전환 + "크게 보기" 모달(Portal) 제공
// - 프론트 동작 요약
//   • 학기 셀렉트 비움(null)  → 서버에 semesterId=null 전달(서버가 "전체 학기" 처리해야 함)
//   • 관 셀렉트 비움('')      → 전체 관 (서버 전달 시 null 로 변환해 미적용 처리)
//   • 담임교사 미선택(null)    → 전체 교사
//   • CLASS_TIME 공통코드를 'HH:mm'로 정규화 + enabled=1만 사용하여 그리드 시간축 구성
//   • CLASS_TIME 사용 불가(없거나 전부 disabled) 시, 그리드 시간축 비어 보일 수 있으므로 안내
//   • "크게 보기"는 TimetableFullscreenModal 로 body 최상단 오버레이로 표시
// ---------------------------------------------------------------------------

import React, { useEffect, useMemo, useState } from 'react';

import HomeroomPicker from '@/features/member/components/HomeroomPicker.jsx';
import TimetableGrid from '@/features/course/components/timetable/TimetableGrid';
import TimetableList from '@/features/course/components/timetable/TimetableList';
import TimetableFullscreenModal from '@/features/course/components/timetable/TimetableFullscreenModal';

import { listSemesters as listSemestersApi } from '@/features/semester/api/academySemesterApi.js';
import { getTeacherEvents, getAllTeacherEvents } from '@/features/course/api/timetableApi.js';
import { getStaff } from '@/features/member/api/staffApi.js';
import { getCodes } from '@/features/system/api/commonCodeAdminApi.js';
import { alertError } from '@/common/ui/alert.js';

// 공용 스타일 (순서 유지 권장)
import '@/features/system/styles/admin-system.css';
import '@/features/admin/styles/admin-shared.css';
import '@/features/admin/styles/admin-academy.css';
import '@/features/course/styles/admin-timetable.css';

/* ── 유틸 ───────────────────────────────────────────────────── */

/** 안전 실행: 실패 시 기본값 반환 */
const safe = async (fn, d = null) => { try { return await fn(); } catch { return d; } };

/** 교사 DTO → 소속 관 코드 추출(필드명 바리에이션 흡수) */
const pickLoc = (t) => (
    t?.workLocationCode ?? t?.work_location_code ?? t?.workLocation ??
    t?.work_location ?? t?.workLoc ?? t?.work_loc ?? ''
);

/** DB common_code.enabled → boolean
 *  - SQL: enabled=1 → true / 0 → false
 *  - 문자열/불리언/숫자 등 호환 처리
 *  - 값이 없으면(legacy) 기본 true로 간주
 */
const isEnabledCode = (item) => {
    const v = item?.enabled;
    if (v === undefined || v === null) return true;
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v === 1;
    const s = String(v).trim().toLowerCase();
    return s === '1' || s === 'true' || s === 'y';
};

/** 'HH:mm' 정규화 (CLASS_TIME 전용) */
const toHHMM = (x) => {
    const raw = String(x?.name ?? x?.code ?? '').trim();
    if (/^\d{2}:\d{2}$/.test(raw)) return raw;                 // '16:30'
    if (/^\d{4}$/.test(raw)) return `${raw.slice(0,2)}:${raw.slice(2)}`; // '1630' → '16:30'
    return null; // 시간 포맷이 아니면 사용하지 않음
};

/** HH:mm → 분 */
const toMinutes = (hhmm) => {
    const [h, m] = String(hhmm || '').split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
};

/** HH:mm 정렬 비교기 */
const compareHHMM = (a, b) => toMinutes(a) - toMinutes(b);

export default function TeacherTimetablePage() {
    /* ── 필터 상태 ───────────────────────────────────────────── */
    const [semesters, setSemesters]     = useState([]);   // 학기 목록
    const [semesterId, setSemesterId]   = useState(null); // 학기 선택값(null=전체 학기)
    const [work, setWork]               = useState('');   // 관 코드(''=전체 관)
    const [workCodes, setWorkCodes]     = useState([]);   // 관 코드 목록(✅ enabled=1만 사용)

    const [teacherId, setTeacherId]       = useState(null); // 담임교사(null=전체 교사)
    const [teacherName, setTeacherName]   = useState('');   // 헤더 표기
    const [teacherLoc, setTeacherLoc]     = useState('');   // 단일 교사 뱃지용 관 코드

    /* ── 시간 슬롯(그리드 Y축) ──────────────────────────────── */
    const [classTimes, setClassTimes]   = useState([]);   // 예: ['15:30','16:30','17:20',...]
    // ↑ ✅ CLASS_TIME 공통코드에서 enabled=1인 항목만 HH:mm으로 정규화/정렬하여 사용

    /* ── 데이터/상태 ────────────────────────────────────────── */
    const [events, setEvents]   = useState([]);           // 조회 결과(이벤트들)
    const [loading, setLoading] = useState(false);        // 로딩 플래그
    const [queried, setQueried] = useState(false);        // 한 번이라도 조회했는지

    /* ── 보기 모드 & 크게보기 모달 ─────────────────────────── */
    const [view, setView]       = useState('grid');       // 'grid' | 'list'
    const [openFull, setOpenFull] = useState(false);      // 크게보기 모달 on/off

    /* ── 관 코드 → 이름 매핑 ───────────────────────────────── */
    const locNameByCode = useMemo(
        () => Object.fromEntries((workCodes || []).map(c => [String(c.code), c.name || ''])),
        [workCodes]
    );

    /* ── 초기 로드: 학기/관/CLASS_TIME ──────────────────────── */
    useEffect(() => { (async () => {
        // 학기: "전체 학기"는 프론트에서 value="" → state null 로 관리
        const [sems, locsRaw, timesRaw] = await Promise.all([
            safe(() => listSemestersApi(null, 'ACTIVE'), []),   // 필요 시 파라미터 조정
            safe(() => getCodes('WORK_LOCATION'), []),
            safe(() => getCodes('CLASS_TIME'), []),
        ]);

        setSemesters(Array.isArray(sems) ? sems : []);

        // ✅ WORK_LOCATION: enabled=1만 필터 + 코드/이름 안전 처리
        const locs = (Array.isArray(locsRaw) ? locsRaw : [])
            .filter(isEnabledCode)
            .map(x => ({ code: String(x.code ?? '').trim(), name: x.name || String(x.code ?? '').trim() }));
        setWorkCodes(locs);

        // ✅ CLASS_TIME: enabled=1만 사용 + HH:mm 정규화 + 정렬
        //    (공통코드가 비어있거나 전부 disabled이면 classTimes는 빈 배열 → 그리드 안내 문구 표시)
        const times = (Array.isArray(timesRaw) ? timesRaw : [])
            .filter(isEnabledCode)
            .map(toHHMM)
            .filter(Boolean)
            .sort(compareHHMM);
        setClassTimes(times);
    })(); }, []);

    /* ── 필터 변경 시 결과 초기화 ───────────────────────────── */
    const onChangeSemester = (v) => {
        setSemesterId(v ? Number(v) : null); // '' → null(전체 학기)
        setEvents([]); setQueried(false);
    };
    const onChangeWork = (v) => {
        setWork(v || ''); // ''=전체 관
        setEvents([]); setQueried(false);
    };
    const onChangeTeacher = (id) => {
        setTeacherId(id ?? null); // null=전체 교사
        setTeacherName(''); setTeacherLoc('');
        setEvents([]); setQueried(false);
    };

    /* ── 조회 액션 ─────────────────────────────────────────── */
    const load = async () => {
        setEvents([]); setQueried(true); setLoading(true);
        try {
            const optWork = work || null; // '' → null (서버가 관 필터 미적용)

            if (!teacherId) {
                // 전체 교사
                // ⚠️ 서버는 semesterId=null 이면 "전체 학기"로 조회하도록 구현돼 있어야 한다.
                const list = await getAllTeacherEvents({ semesterId, workLocation: optWork });
                setTeacherName('전체 교사');
                setTeacherLoc('');
                setEvents(Array.isArray(list) ? list : []);
            } else {
                // 단일 교사
                const t = await getStaff(teacherId);
                setTeacherName(t?.userName || t?.name || '');
                setTeacherLoc(pickLoc(t) || '');

                const list = await getTeacherEvents({ teacherId, semesterId, workLocation: optWork });
                setEvents(Array.isArray(list) ? list : []);
            }
        } catch (e) {
            const status = e?.response?.status;
            if (status === 403) {
                await alertError('접근 거부', '권한이 없거나 세션이 만료되었습니다. 다시 로그인해 주세요.');
            } else {
                const msg = e?.response?.data?.message || e?.message || '시간표를 불러오지 못했습니다.';
                await alertError('오류', msg);
            }
        } finally {
            setLoading(false);
        }
    };

    /* ── 헤더 라벨/뱃지 ─────────────────────────────────────── */
    const isAllTeachers = !teacherId;
    const locName = (isAllTeachers ? work : teacherLoc)
        ? (locNameByCode[(isAllTeachers ? work : teacherLoc)] || (isAllTeachers ? work : teacherLoc))
        : '';

    /* ── 렌더 ───────────────────────────────────────────────── */
    return (
        <div className="aa-page academy-page">
            <div className="aa-container">
                {/* 상단 툴바 */}
                <div className="aa-toolbar aa-topbar">
                    <h1 className="aa-title">시간표(교사)</h1>
                </div>

                {/* 좌/우 40:60 */}
                <div className="tt-split">
                    {/* 좌: 컨트롤 패널 */}
                    <aside className="aa-card" aria-label="필터/선택">
                        {/* 학기 선택 */}
                        <label className="aa-field">
                            <div className="aa-label">
                                학기 <span className="aa-subtle">(비우면 전체 학기)</span>
                            </div>
                            <select
                                className="aa-select"
                                value={semesterId ?? ''}
                                onChange={(e) => onChangeSemester(e.target.value)}
                                title="학기(선택)"
                            >
                                {/* 전체 옵션: value="" → state 는 null */}
                                <option value="">전체 학기</option>
                                {(semesters || []).map(s => (
                                    <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                            </select>
                        </label>

                        {/* 관(지점) */}
                        <label className="aa-field" style={{ marginTop: '.6rem' }}>
                            <div className="aa-label">관(지점)</div>
                            <select
                                className="aa-select"
                                value={work}
                                onChange={(e) => onChangeWork(e.target.value)}
                                title="관(선택 시 해당 관으로 필터)"
                            >
                                <option value="">전체 관</option>
                                {(workCodes || []).map(c => (
                                    <option key={c.code} value={c.code}>{c.name}</option>
                                ))}
                            </select>
                        </label>

                        {/* 담임 교사 */}
                        <div className="aa-field" style={{ marginTop: '.6rem' }}>
                            <div className="aa-label">담임 교사</div>
                            <HomeroomPicker
                                value={teacherId}
                                onChange={onChangeTeacher}
                                workLocation={''}          // 초기 관 고정 필요 시 코드로 전달
                                allowAllLocations={true}   // (전체) 관 토글 허용
                                placeholder="(선택 안 하면 전체 교사)"
                            />
                        </div>

                        {/* 액션 */}
                        <div className="aa-row" style={{ marginTop: '.6rem', gap: '.5rem' }}>
                            <button className="aa-btn aa-btn-outline" onClick={load} disabled={loading}>
                                {loading ? '조회 중…' : '조회'}
                            </button>
                            <div className="aa-subtle">학기/관/교사 모두 선택/미선택 조합 가능</div>
                        </div>

                        {/* ✅ CLASS_TIME 사용 불가 시 안내 (그리드 시간축은 CLASS_TIME을 사용) */}
                        {!classTimes.length && (
                            <div className="aa-banner aa-banner--info" style={{ marginTop: '.6rem' }}>
                                CLASS_TIME 공통코드(사용 중)가 없습니다. 그리드 보기의 시간축이 비어 보일 수 있어요.
                                필요 시 리스트 보기를 사용해 주세요.
                            </div>
                        )}
                    </aside>

                    {/* 우: 결과 영역 */}
                    <section className="aa-card" aria-label="시간표 결과">
                        {/* 결과 헤더: 제목/뱃지 + 보기 탭 + 크게보기 */}
                        <div className="tt-headrow">
                            <h3 className="aa-title--sm" style={{ marginRight: '.25rem' }}>
                                {teacherName || (queried ? '결과 없음' : '조건을 선택 후 조회하세요')}
                            </h3>
                            {!!locName && <span className="aa-badge">{locName}</span>}

                            {/* 보기 탭 + 크게보기 버튼(그리드일 때만) */}
                            <div className="aa-row" style={{ marginLeft: 'auto', gap: 8, alignItems: 'center' }}>
                                <div className="aa-seg" role="tablist" aria-label="보기 방식">
                                    <button
                                        className={view === 'list' ? 'active' : ''}
                                        onClick={() => setView('list')}
                                    >
                                        리스트
                                    </button>
                                    <button
                                        className={view === 'grid' ? 'active' : ''}
                                        onClick={() => setView('grid')}
                                    >
                                        그리드
                                    </button>
                                </div>

                                {/* 그리드 + 데이터 있을 때만 노출 */}
                                {view === 'grid' && !!events.length && (
                                    <button className="aa-btn" onClick={() => setOpenFull(true)}>
                                        크게 보기
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* 본문 상태 메시지 */}
                        {loading && <div className="aa-subtle">불러오는 중…</div>}
                        {!loading && !events.length && queried && (
                            <div className="aa-subtle">조건에 해당하는 수업이 없습니다.</div>
                        )}
                        {!loading && !queried && (
                            <div className="aa-subtle">왼쪽에서 조건을 선택하고 [조회]를 눌러 주세요.</div>
                        )}

                        {/* 결과 렌더 */}
                        {!!events.length && (
                            view === 'grid'
                                ? (
                                    <TimetableGrid
                                        events={events}
                                        // ✅ 시간축: CLASS_TIME enabled=1만 사용해 정규화/정렬된 HH:mm 배열
                                        //    비어 있으면 컴포넌트 기본 동작(또는 이벤트 기반)으로 렌더되도록 undefined 전달
                                        timeSlots={classTimes.length ? classTimes : undefined}
                                        showTeacher={isAllTeachers}
                                        locNameByCode={locNameByCode}

                                        // 기본 보기(페이지 내) 크기 파라미터 (필요 시 튜닝)
                                        rowHeight={72}     // 슬롯 1행 높이(px): 72=보통
                                        wrapMaxVH={68}     // 세로 최대 높이(% of viewport)
                                        dayMinWidth={220}  // 요일 최소 폭(px)
                                        days={[1,2,3,4,5,6,7]} // 주중만 보고 싶으면 [1,2,3,4,5]
                                    />
                                )
                                : (
                                    <TimetableList
                                        events={events}
                                        showTeacher={isAllTeachers}
                                        locNameByCode={locNameByCode}
                                    />
                                )
                        )}
                    </section>
                </div>
            </div>

            {/* ── "크게 보기" 모달(Portal) ───────────────────────── */}
            <TimetableFullscreenModal
                open={openFull}
                onClose={() => setOpenFull(false)}
                events={events}
                // ✅ 크게보기 모달도 동일한 시간축 정책 적용
                timeSlots={classTimes.length ? classTimes : undefined}
                showTeacher={isAllTeachers}
                locNameByCode={locNameByCode}
                // 필요 시 기본값 튜닝 가능 (미지정 시 컴포넌트 내 기본 적용)
                // initialDensity="cozy"
                // dayMinWidth={180}
                // wrapMaxVH={84}
            />
        </div>
    );
}