// src/features/student/components/enrollment/TimeslotPickerModal.jsx
// ============================================================================
// TimeslotPickerModal — 타임슬롯 선택 모달 (반응형 + 콤팩트 테이블, 전체 코드)
// ----------------------------------------------------------------------------
// 포인트
//  1) 모바일(≤sm): 카드형 리스트
//  2) sm 이상: 콤팩트 테이블
//     - table width: 100% (minWidth:0)
//     - 헤더/셀 패딩 축소(thPad/tdPad)
//     - 과목/반 이름은 줄바끔 허용 + maxWidth 제한
//
//  3) 교차 수업 편의 기능
//     - 체크박스를 클릭하면 "같은 반 + 같은 요일"의 타임슬롯들을
//       한꺼번에 선택/해제 (화요일 하나 선택 → 화요일 수업 전부 선택)
//     - 이미 같은 요일 타임슬롯이 모두 선택되어 있으면 → 전체 해제
//
//  4) 백엔드 연동
//     - 후보 조회: GET /api/admin/enrollments/suggest (suggestTimeslots)
//     - 기존 매핑 조회: GET /api/admin/enrollments/{enrollId}/timeslots
//       (getEnrollmentTimeslots)
//     - 저장 시: onSubmit(Array.from(selected)) → 상위에서
//       replaceEnrollmentTimeslots(enrollId, ids) 호출
// ============================================================================

import React, { useEffect, useMemo, useState } from 'react';
import Modal from '@/common/components/ui/Modal.jsx';
import { suggestTimeslots, getEnrollmentTimeslots } from '@/features/student/api/studentEnrollmentApi.js';
import { alertError } from '@/common/ui/alert.js';

const DAY_LABELS = { 1: '월', 2: '화', 3: '수', 4: '목', 5: '금', 6: '토', 7: '일' };
const safeError = (t, m) => Promise.resolve(alertError(t, m)).catch(() => {});

/** ⏱️ LocalTime/문자열 → 'HH:mm' (기본 폴백) */
function toHHmm(v) {
    if (!v) return '-';
    if (typeof v === 'string') {
        // "HH:mm" 또는 "HH:mm:ss" 형태
        if (/^\d{2}:\d{2}(:\d{2})?$/.test(v)) return v.slice(0, 5);
        // "2025-01-01T17:20:00" 같이 들어오는 경우
        const m = v.match(/T?(\d{2}:\d{2})(:\d{2})?/);
        return m ? m[1] : v;
    }
    // Date 타입 등
    try {
        const d = new Date(v);
        if (!isNaN(d)) {
            const h = String(d.getHours()).padStart(2, '0');
            const m = String(d.getMinutes()).padStart(2, '0');
            return `${h}:${m}`;
        }
    } catch {
        /* noop */
    }
    return String(v);
}

/**
 * TimeslotPickerModal
 * - CROSS 배정 시 타임슬롯 선택/수정용 모달
 * - enrollId 를 기준으로 기존 매핑을 불러와서 체크박스에 반영
 */
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
                                            }) {
    const [querying, setQuerying] = useState(false);

    // 필터 상태
    const [days, setDays]   = useState(new Set()); // 선택된 요일 Set<number>
    const [from, setFrom]   = useState('');        // 시작일
    const [to, setTo]       = useState('');        // 종료일
    const [limit, setLimit] = useState(50);        // 최대 표시 개수 (UI 제한)

    // 후보/선택 상태
    const [rows, setRows]         = useState([]);                 // TimeslotSuggestion[] 후보 목록
    const [selected, setSelected] = useState(new Set(initialSelectedIds || [])); // 선택된 timeslotId 집합

    // ------------------------------------------------------------------------
    // 기존 매핑 불러오기 (edit 시, 이미 선택된 타임슬롯 복원)
    // ------------------------------------------------------------------------
    useEffect(() => {
        let alive = true;
        (async () => {
            if (!enrollmentId) return;
            try {
                const ids = await getEnrollmentTimeslots(enrollmentId);
                if (!alive) return;
                setSelected(
                    new Set(
                        Array.isArray(ids)
                            ? ids.map((x) => Number(x))
                            : []
                    )
                );
            } catch {
                // 조회 실패 시에는 그냥 빈 상태로 두고, 사용자가 다시 선택
            }
        })();
        return () => {
            alive = false;
        };
    }, [enrollmentId]);

    // ------------------------------------------------------------------------
    // 후보 정렬 기준: 요일 → 시간 → 반 이름
    // ------------------------------------------------------------------------
    const sortByDayTimeClass = (arr = []) =>
        arr.slice().sort((a, b) => {
            const da = Number(a.dayOfWeek || 0),
                db = Number(b.dayOfWeek || 0);
            if (da !== db) return da - db;

            const ta = `${a.classTimeLabel || ''}${a.startTime || ''}`;
            const tb = `${b.classTimeLabel || ''}${b.startTime || ''}`;
            const tcmp = ta.localeCompare(tb);
            if (tcmp !== 0) return tcmp;

            return String(a.className || '').localeCompare(
                String(b.className || '')
            );
        });

    // ------------------------------------------------------------------------
    // 후보 조회: /api/admin/enrollments/suggest 호출
    // ------------------------------------------------------------------------
    const fetchSuggest = async () => {
        setQuerying(true);
        try {
            const daysParam = days.size ? Array.from(days) : undefined;

            // 잘못된 기간(시작>종료) guard
            if (from && to && String(from) > String(to)) {
                setQuerying(false);
                return;
            }

            const userLimit    = Math.max(1, Number(limit || 50));     // UI 상 표시 개수
            const requestLimit = Math.min(200, userLimit * 3);         // 서버 요청 제한 (넉넉히)

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

            // 현재 반(classId) 기준으로만 필터링
            const filtered = (list || []).filter(
                (x) => Number(x.classId) === Number(classId)
            );
            const sorted = sortByDayTimeClass(filtered);

            // UI 상에는 userLimit 개수만 노출
            setRows(sorted.slice(0, userLimit));
        } catch (e) {
            safeError(
                '오류',
                e?.response?.data?.message || '타임슬롯 후보 조회 실패'
            );
        } finally {
            setQuerying(false);
        }
    };

    // 초기 1회 조회
    useEffect(() => {
        fetchSuggest();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ------------------------------------------------------------------------
    // 요일 필터 토글: Set<number> 에서 추가/삭제
    // ------------------------------------------------------------------------
    const toggleDay = (d) => {
        setDays((prev) => {
            const s = new Set(prev);
            if (s.has(d)) s.delete(d);
            else s.add(d);
            return s;
        });
    };

    // 현재 선택 여부
    const isChecked = (id) => selected.has(Number(id));

    // ------------------------------------------------------------------------
    // 핵심: 같은 반 + 같은 요일 그룹 토글
    //  - 행 하나의 체크박스를 클릭하면, rows 에서 같은 classId & dayOfWeek
    //    를 가진 모든 timeslotId 를 묶어서 선택/해제
    //  - 그룹의 모든 슬롯이 이미 선택되어 있으면 → 전체 해제
    //    그렇지 않으면 → 전체 선택
    // ------------------------------------------------------------------------
    const toggleGroupByDay = (row) => {
        const clickedId = Number(row.timeslotId);
        const classKey = Number(row.classId);
        const day = Number(row.dayOfWeek);

        // 같은 반 + 같은 요일에 속한 타임슬롯 목록
        const groupIds = rows
            .filter(
                (r) =>
                    Number(r.classId) === classKey &&
                    Number(r.dayOfWeek) === day
            )
            .map((r) => Number(r.timeslotId));

        if (groupIds.length === 0) {
            // 방어적인 fallback: 그래도 단일 토글은 되도록
            setSelected((prev) => {
                const s = new Set(prev);
                if (s.has(clickedId)) s.delete(clickedId);
                else s.add(clickedId);
                return s;
            });
            return;
        }

        setSelected((prev) => {
            const s = new Set(prev);
            const allSelected = groupIds.every((id) => s.has(id));

            if (allSelected) {
                // 같은 요일 그룹 모두 해제
                groupIds.forEach((id) => s.delete(id));
            } else {
                // 같은 요일 그룹 모두 선택
                groupIds.forEach((id) => s.add(id));
            }
            return s;
        });
    };

    const selectedCount = selected.size;
    const invalidRange  = !!(from && to && String(from) > String(to));

    // 공통: 축소 패딩 (인라인 스타일로 강제 적용)
    const thPad = { padding: '6px 8px' };
    const tdPad = { padding: '6px 8px' };

    return (
        <Modal
            title={title}
            onClose={onClose}
            size="max-w-[75vw] sm:max-w-[450px] md:max-w-[550px]"
        >
            <div className="space-y-3 w-[92vw] max-w-[500px] sm:w-auto">
                {/* ===================================================================== */}
                {/* 필터 영역 */}
                {/* ===================================================================== */}
                <div className="rounded border border-slate-700 p-3 bg-slate-900/40">
                    {/* 1줄: 요일 + 개수 */}
                    <div className="flex flex-wrap items-end justify-between gap-3">
                        {/* 요일 선택 버튼 */}
                        <div className="min-w-[240px] flex-1">
                            <div className="text-sm mb-1 text-slate-300">요일</div>
                            <div className="flex flex-wrap gap-1">
                                {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                                    <button
                                        key={d}
                                        type="button"
                                        className={`px-2 py-1 rounded border text-sm ${
                                            days.has(d)
                                                ? 'bg-indigo-600 border-indigo-500'
                                                : 'border-slate-600 hover:border-slate-500'
                                        }`}
                                        onClick={() => toggleDay(d)}
                                    >
                                        {DAY_LABELS[d]}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* 표시 개수 */}
                        <label className="block w-full sm:w-auto">
                            <div className="text-sm mb-1 text-slate-300">개수</div>
                            <input
                                className="aa-input w-full sm:w-[96px]"
                                type="number"
                                min={1}
                                max={200}
                                value={limit}
                                onChange={(e) => {
                                    const n = Number(e.target.value || 50);
                                    if (Number.isFinite(n)) {
                                        setLimit(Math.max(1, Math.min(200, n)));
                                    }
                                }}
                            />
                        </label>
                    </div>

                    {/* 2줄: 기간 필터 */}
                    <div className="mt-3 grid md:grid-cols-3 gap-3 items-end">
                        <label className="block">
                            <div className="text-sm mb-1 text-slate-300">
                                시작일(선택)
                            </div>
                            <input
                                className="aa-input w-full min-w-[160px]"
                                type="date"
                                value={from}
                                max={to || undefined}
                                onChange={(e) => setFrom(e.target.value)}
                            />
                        </label>
                        <label className="block">
                            <div className="text-sm mb-1 text-slate-300">
                                종료일(선택)
                            </div>
                            <input
                                className="aa-input w-full min-w-[160px]"
                                type="date"
                                value={to}
                                min={from || undefined}
                                onChange={(e) => setTo(e.target.value)}
                            />
                        </label>
                        <div className="hidden md:block" />
                    </div>

                    {/* 3줄: 버튼 영역 */}
                    <div className="mt-2 flex gap-2 justify-end">
                        <button
                            type="button"
                            className="aa-btn"
                            onClick={() => {
                                setFrom('');
                                setTo('');
                                setDays(new Set());
                                setLimit(50);
                            }}
                        >
                            초기화
                        </button>
                        <button
                            type="button"
                            className="aa-btn aa-btn-primary"
                            onClick={fetchSuggest}
                            disabled={querying || invalidRange}
                            title={invalidRange ? '기간을 확인하세요.' : undefined}
                        >
                            {invalidRange
                                ? '기간 확인'
                                : querying
                                    ? '조회 중…'
                                    : '조회'}
                        </button>
                    </div>

                    <div className="text-xs text-slate-400 mt-2">
                        * 학생의 기존 일정과 <b>요일·시간 겹치는 슬롯은 제외</b>되어 조회됩니다.
                    </div>
                </div>

                {/* ===================================================================== */}
                {/* 후보 목록: 모바일(≤sm) — 카드형 레이아웃 */}
                {/* ===================================================================== */}
                <div className="sm:hidden space-y-2">
                    {rows.length === 0 && (
                        <div className="px-3 py-2 rounded border border-slate-700 text-slate-300 bg-slate-900/40">
                            후보 없음
                        </div>
                    )}
                    {rows.map((r) => {
                        const id        = Number(r.timeslotId);
                        const subject   = r.subjectName || r.subjectCode || '-';
                        const timeLabel = r.classTimeLabel || toHHmm(r.startTime) || '-';
                        const dayLabel  =
                            DAY_LABELS[Number(r.dayOfWeek)] || '-';
                        const checked   = isChecked(id);

                        return (
                            <label
                                key={id}
                                className={`block rounded border px-3 py-2 bg-slate-900/40 ${
                                    checked
                                        ? 'border-indigo-500 ring-1 ring-indigo-500'
                                        : 'border-slate-700'
                                }`}
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={() => toggleGroupByDay(r)}
                                        />
                                        <div className="text-sm">
                                            <div className="font-medium">
                                                {subject}
                                            </div>
                                            <div className="text-slate-400">
                                                {r.className || '-'}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-right text-sm">
                                        <div className="aa-cell-mono">
                                            {timeLabel}
                                        </div>
                                        <div className="text-slate-400">
                                            {dayLabel}
                                        </div>
                                    </div>
                                </div>
                            </label>
                        );
                    })}
                </div>

                {/* ===================================================================== */}
                {/* 후보 목록: sm 이상 — 콤팩트 테이블 레이아웃 */}
                {/* ===================================================================== */}
                <div className="hidden sm:block aa-table-wrap relative max-h-[55vh] overflow-y-auto overflow-x-hidden border border-slate-700 rounded">
                    <table
                        className="aa-table table-auto text-[13px] leading-tight"
                        style={{ width: '100%', minWidth: 0 }}
                    >
                        <colgroup>
                            <col style={{ width: 36 }} /> {/* 체크박스 */}
                            <col style={{ width: 44 }} /> {/* 요일 */}
                            <col style={{ width: 68 }} /> {/* 시간 */}
                            <col />                       {/* 과목 */}
                            <col />                       {/* 반 이름 */}
                        </colgroup>

                        <thead className="sticky top-0 bg-slate-900/80 backdrop-blur z-10 text-xs">
                        <tr>
                            <th style={thPad}></th>
                            <th style={thPad} className="whitespace-nowrap">
                                요일
                            </th>
                            <th style={thPad} className="whitespace-nowrap">
                                시간
                            </th>
                            <th style={thPad}>과목</th>
                            <th style={thPad}>반 이름</th>
                        </tr>
                        </thead>

                        <tbody>
                        {rows.length === 0 && (
                            <tr>
                                <td style={tdPad} colSpan={5}>
                                    후보 없음
                                </td>
                            </tr>
                        )}

                        {rows.map((r) => {
                            const id        = Number(r.timeslotId);
                            const subject   = r.subjectName || r.subjectCode || '-';
                            const timeLabel = r.classTimeLabel || toHHmm(r.startTime) || '-';

                            return (
                                <tr key={id} className="hover:bg-slate-800/40">
                                    {/* 체크박스: 같은 요일 그룹 토글 */}
                                    <td
                                        style={tdPad}
                                        className="text-center align-middle"
                                    >
                                        <input
                                            type="checkbox"
                                            className="align-middle"
                                            checked={isChecked(id)}
                                            onChange={() => toggleGroupByDay(r)}
                                        />
                                    </td>

                                    {/* 요일 */}
                                    <td
                                        style={tdPad}
                                        className="text-center whitespace-nowrap"
                                    >
                                        {DAY_LABELS[Number(r.dayOfWeek)] || '-'}
                                    </td>

                                    {/* 시간 */}
                                    <td
                                        style={tdPad}
                                        className="aa-cell-mono whitespace-nowrap"
                                    >
                                        {timeLabel}
                                    </td>

                                    {/* 과목명/코드 */}
                                    <td style={tdPad} className="align-top">
                                        <div
                                            className="whitespace-normal break-words"
                                            style={{ maxWidth: 180 }}
                                        >
                                            {subject}
                                        </div>
                                    </td>

                                    {/* 반 이름 */}
                                    <td style={tdPad} className="align-top">
                                        <div
                                            className="whitespace-normal break-words"
                                            style={{ maxWidth: 160 }}
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

                {/* ===================================================================== */}
                {/* 푸터: 선택 개수 + 버튼 */}
                {/* ===================================================================== */}
                <div className="flex justify-between items-center pt-2">
                    <div className="text-sm">
                        현재 선택 <b>{selectedCount}</b>개
                    </div>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            className="aa-btn"
                            onClick={onClose}
                        >
                            취소
                        </button>
                        <button
                            type="button"
                            className="aa-btn aa-btn-primary"
                            onClick={() =>
                                onSubmit?.(
                                    Array.from(selected).map((id) => Number(id))
                                )
                            }
                        >
                            저장
                        </button>
                    </div>
                </div>
            </div>
        </Modal>
    );
}
