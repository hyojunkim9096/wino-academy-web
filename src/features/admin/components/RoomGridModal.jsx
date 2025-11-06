// ============================================================================
// src/features/admin/components/RoomGridModal.jsx
// ----------------------------------------------------------------------------
// “강의실 조회” 전용 모달 콘텐츠(그리드)
// - 기본 관/요일을 props로 받아서 초기화
// - 모달 내부에서 관(LocationChips)·요일(탭) 변경 가능
// - 가로=강의실(층별 그룹), 세로=CLASS_TIME
// - RoomSearchPage.jsx 의 검증/정렬 로직 경량 이식
//
// ✅ 개선/수정 포인트
// 1) 같은 시간·같은 강의실의 여러 반 → ‘ / ’로 한 줄 표기(중복 제거 포함)
// 2) 셀 맵 키를 콜론 없는 코드(‘1630’)로 단일화
// 3) 헤더 굵게는 room.name (코드는 title로만)
// 4) .room-grid 클래스 연결(CSS에서 한 줄 말줄임/정렬 적용)
// 5) 모달은 sessionStorage 비사용(타 페이지와 영향 없음)
// 6) ✅ CLASS_TIME 공통코드: enabled=1(또는 true)인 코드만 사용
// 7) ✅ 서버 정렬 유지: 클라이언트 재정렬 제거(그룹 순서도 서버 등장 순서대로)
//    - RoomService.daySchedule 의 정렬(sort_order ASC, code ASC)을 신뢰
//
// 🔒 보강(권장)
// - [NEW] 부모 프롭 변경시 내부 state 동기화(useEffect)
// - [NEW] loadRooms try/catch로 네트워크 실패 폴백
// ============================================================================

import React, { useEffect, useMemo, useState } from "react";

import LocationChips from "@/features/admin/components/LocationChips";
import { getCodes } from "@/api/commonCodeAdminApi";
import { listRooms, listRoomDaySchedule } from "@/api/roomAdminApi";
import { alertError } from "@/ui/alert";

import "@/styles/admin-system.css";
import "@/styles/admin-academy.css";
import "@/styles/admin-room.css";

/* ──────────────────────────────────────────────────────────────────────────
 * 유틸: CLASS_TIME → { code, hhmm } 정규화
 *  - code: '1630' 또는 'P1' 등 (DB 코드)
 *  - name: 보통 '16:30' 형태(없으면 code를 사용)
 *  - hhmm: 화면 왼쪽 시간 열에 찍히는 표시 문자열('16:30' 등)
 *  - 반환: { code: '1630', hhmm: '16:30' } 형태
 * ────────────────────────────────────────────────────────────────────────── */
const toSlotItem = (x) => {
    const code = String(x?.code ?? "").trim();
    const name = String(x?.name ?? "").trim();

    // name이 "HH:mm" 형태면 그대로 사용, 아니면 code가 4자리 숫자면 code로부터 "HH:mm" 생성
    const hhmm =
        /^\d{2}:\d{2}$/.test(name)
            ? name
            : /^\d{4}$/.test(code)
                ? `${code.slice(0, 2)}:${code.slice(2)}`
                : name || code;

    // code 또는 hhmm 어느 하나라도 있으면 유효
    return code || hhmm ? { code: code || hhmm.replace(":", ""), hhmm } : null;
};

/* ✅ 공통코드 enabled 판정 (boolean/number/string 혼용 대응)
   - 응답에 enabled 속성이 없으면 '사용(true)'으로 간주 */
function isEnabledCode(item) {
    const v = item?.enabled;
    if (v === undefined || v === null) return true;      // 속성 없음 → 사용
    if (typeof v === "boolean") return v;
    if (typeof v === "number") return v === 1;
    const s = String(v).trim().toLowerCase();
    return s === "1" || s === "true" || s === "y";
}

/* 요일 탭 정의 */
const DAYS = [
    { value: 1, label: "월" },
    { value: 2, label: "화" },
    { value: 3, label: "수" },
    { value: 4, label: "목" },
    { value: 5, label: "금" },
    { value: 6, label: "토" },
    { value: 7, label: "일" },
];

/* 보조 유틸
   - normSlotCode: 서버/프론트 혼용될 수 있는 '16:30' → '1630' 변환
   - slotUniqKey : 같은 방/같은 시간대에 여러 반이 올 수 있으므로, 표시 중복 제거용 키 생성 */
const normSlotCode = (c) => String(c ?? "").replace(/:/g, ""); // '16:30' → '1630'
const slotUniqKey = (s) => {
    // 우선순위: classId → classCode → (className + teacher)
    const id = s?.classId ?? s?.groupId ?? null;
    if (id) return `id:${id}`;
    const code = s?.classCode ?? s?.groupCode ?? null;
    if (code) return `code:${code}`;
    const name = s?.className ?? s?.groupName ?? "";
    const teacher = s?.teacherId ?? s?.teacherName ?? "";
    return `name:${name}|teacher:${teacher}`;
};
const dedupeBy = (arr, keyFn) => {
    const seen = new Set();
    const out = [];
    for (const x of arr) {
        const k = keyFn(x);
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(x);
    }
    return out;
};

/**
 * RoomGridModal
 * @param {string} initialWork - 부모로부터 전달된 초기 관(지점) 코드
 * @param {number} initialDay  - 부모로부터 전달된 초기 요일(1~7)
 */
export default function RoomGridModal({ initialWork = "", initialDay = 1 }) {
    /* 관/요일 상태 (초깃값은 부모에서 전달) */
    const [work, setWork] = useState(initialWork || "");
    const [day, setDay] = useState(initialDay || 1);

    // [NEW] 부모 프롭 변경 시 모달 내부 상태도 동기화(모달 재오픈 등 케이스)
    useEffect(() => {
        setWork(initialWork || "");
    }, [initialWork]);
    useEffect(() => {
        setDay(initialDay || 1);
    }, [initialDay]);

    /* CLASS_TIME (enabled=1만 사용) */
    const [slotItems, setSlotItems] = useState([]);
    const timeSlotsHHMM = useMemo(() => slotItems.map((s) => s.hhmm), [slotItems]); // 화면 표시용
    const timeSlotCodes = useMemo(() => slotItems.map((s) => s.code), [slotItems]); // API 쿼리용

    useEffect(() => {
        (async () => {
            // CLASS_TIME 공통코드 조회 실패 시 → [] (그리드 호출 자체를 건너뜀)
            const list = await getCodes("CLASS_TIME").catch(() => []);
            // enabled=true(또는 1)인 항목만 사용
            const enabledOnly = (list || []).filter(isEnabledCode);
            const items = enabledOnly
                .map(toSlotItem)
                .filter(Boolean)
                // 'HH:mm' 문자열 기준 정렬 (문자열 비교로도 의도대로 정렬됨)
                .sort((a, b) => a.hhmm.localeCompare(b.hhmm));
            setSlotItems(items);
        })();
    }, []);

    /* 방 목록 — 서버 정렬을 신뢰(sort_order ASC, code ASC) */
    const [rooms, setRooms] = useState([]);

    const loadRooms = async () => {
        if (!work) {
            setRooms([]);
            return;
        }
        // [NEW] 네트워크 실패 방어: try/catch
        try {
            const page = await listRooms({
                workLocationCode: work,
                useYn: "1",     // 사용중인 방만
                page: 1,
                size: 500,      // 충분한 상한
            });
            setRooms(Array.isArray(page?.items) ? page.items : []);
        } catch {
            setRooms([]);     // 실패 시 빈 목록 폴백
        }
    };

    // 관이 바뀌면 방 목록 재조회
    useEffect(() => {
        loadRooms(); // eslint-disable-line react-hooks/exhaustive-deps
    }, [work]);

    /* 하루 그리드 데이터 (DayScheduleRes → normalizeSchedule() 거쳐 slots으로 수신) */
    const [slots, setSlots] = useState([]);      // [{roomId, classTimeCode, className, teacherName?, memo?}, ...]
    const [loading, setLoading] = useState(false);

    const loadDay = async () => {
        // 관/요일 미선택 시 비움
        if (!work || !day) {
            setSlots([]);
            return;
        }
        // CLASS_TIME 코드가 비어 있으면 서버 호출 생략(가드)
        if (!Array.isArray(timeSlotCodes) || timeSlotCodes.length === 0) {
            setSlots([]);
            return;
        }

        setLoading(true);
        try {
            // listRoomDaySchedule() 내부에서:
            // 1) /admin/rooms/schedule/day?workLocationCode=..&day=..&classTimeCodes=A&classTimeCodes=B ...
            // 2) 실패 시 preview를 교시별로 폴백 호출 → 결과 병합
            const { rooms: serverRooms, slots: rows } = await listRoomDaySchedule({
                workLocationCode: work,
                day,
                classTimeCodes: timeSlotCodes,
            });

            // 서버가 rooms를 내려주면(정렬 포함), 클라이언트 재정렬 없이 그대로 사용
            if (Array.isArray(serverRooms) && serverRooms.length) {
                setRooms(serverRooms);
            }

            // 셀 데이터 세팅(없으면 [])
            setSlots(Array.isArray(rows) ? rows : []);
        } catch (e) {
            // 경고창으로 알림 + 비움
            const msg = e?.message || "강의실 시간표(하루)를 불러오지 못했습니다.";
            await alertError("오류", msg);
            setSlots([]);
        } finally {
            setLoading(false);
        }
    };

    // 관/요일/클래스타임코드 변하면 하루 스케줄 재조회
    useEffect(() => {
        // dependency로 배열 자체를 넣으면 참조가 바뀔 때마다 트리거 → join("|")로 안정화
        loadDay(); // eslint-disable-line react-hooks/exhaustive-deps
    }, [work, day, timeSlotCodes.join("|")]);

    /** ★ 그룹핑: 등장 순서(서버 정렬) 유지
     *  - 그룹 키: 강의실 코드 첫 글자(숫자 한 글자면 '층'의 의미)
     *  - 그룹 내부/그룹 순서 모두 서버 응답 '등장 순서'를 유지
     */
    const groupedRooms = useMemo(() => {
        const groups = [];
        const index = new Map(); // key → groups 배열 인덱스
        for (const r of Array.isArray(rooms) ? rooms : []) {
            const key = (String(r?.code ?? "").trim().charAt(0) || "#");
            if (!index.has(key)) {
                index.set(key, groups.length);
                groups.push({ key, rooms: [] });
            }
            groups[index.get(key)].rooms.push(r);
        }
        return groups;
    }, [rooms]);

    /* ★ look-up (여러 반 지원)
       - 단일 키: `${roomId}|${normSlotCode(classTimeCode)}`
       - 값: DaySlot[] (중복 제거 + 반 이름/교사명 정렬)
     */
    const cellMap = useMemo(() => {
        const m = new Map();
        for (const s of slots) {
            if (!s?.roomId || !s?.classTimeCode) continue;
            const k = `${s.roomId}|${normSlotCode(s.classTimeCode)}`;
            if (!m.has(k)) m.set(k, []);
            m.get(k).push(s);
        }

        // 표시 중복 제거 + 정렬(반 이름 → 교사명)
        for (const [k, arr] of m.entries()) {
            const deduped = dedupeBy(arr, slotUniqKey).sort((a, b) => {
                const an = a.className || a.groupName || "";
                const bn = b.className || b.groupName || "";
                const t1 = a.teacherName || "";
                const t2 = b.teacherName || "";
                return an.localeCompare(bn) || t1.localeCompare(t2);
            });
            m.set(k, deduped);
        }
        return m;
    }, [slots]);

    /* 렌더링 시작 */
    return (
        <div
            className="room-grid"
            // 모달 크기 제어: 가로 최대 1600px, 높이 82vh 스크롤
            style={{ width: "min(1600px, 95vw)", maxHeight: "82vh", overflow: "auto" }}
        >
            {/* 상단 컨트롤: 관(칩) · 요일(세그먼트) */}
            <div
                className="aa-row"
                style={{
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 8,
                    gap: 8,
                    flexWrap: "wrap",
                }}
            >
                {/* 관 선택 칩(서버의 WORK_LOCATION 코드 목록 기반) */}
                <div style={{ display: "flex", gap: 6, overflowX: "auto" }}>
                    <LocationChips value={work} onChange={(v) => setWork(v)} />
                </div>

                {/* 요일 탭 */}
                <div className="aa-seg" role="tablist" aria-label="요일">
                    {DAYS.map((d) => (
                        <button
                            key={d.value}
                            className={day === d.value ? "active" : ""}
                            onClick={() => setDay(d.value)}
                        >
                            {d.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* 로딩/가드 메시지 */}
            {(!work || loading) && (
                <div className="aa-subtle">
                    {!work ? "관(지점)을 선택하세요." : "불러오는 중…"}
                </div>
            )}

            {/* 그룹별 테이블(서버 정렬 유지) */}
            {!!work &&
                !!timeSlotsHHMM.length &&
                groupedRooms.map(({ key, rooms: groupRooms }) => (
                    <div key={key} style={{ marginTop: 12 }}>
                        {/* 그룹 타이틀: 첫 글자가 숫자(1자리)면 '층'으로 표시 */}
                        <h3 className="aa-title--sm" style={{ marginBottom: 4 }}>
                            {/^\d$/.test(key) ? `${key}층` : `그룹 ${key}`}
                        </h3>

                        <div className="aa-table-wrap">
                            <table className="aa-table aa-table--lg" style={{ tableLayout: "fixed" }}>
                                <colgroup>
                                    {/* 왼쪽 시간 열 고정폭 */}
                                    <col className="col-time" style={{ width: 120 }} />
                                    {/* 강의실 수만큼 동적 컬럼 */}
                                    {groupRooms.map((r) => (
                                        <col key={r.id} />
                                    ))}
                                </colgroup>

                                {/* 헤더: 시간 + 강의실명(굵게), 코드는 title로 제공 */}
                                <thead>
                                <tr>
                                    <th style={{ textAlign: "center" }}>시간</th>
                                    {groupRooms.map((r) => (
                                        <th key={r.id} style={{ textAlign: "center" }}>
                        <span className="head-name aa-ellipsis" title={r.name || r.code}>
                          {r.name || r.code}
                        </span>
                                        </th>
                                    ))}
                                </tr>
                                </thead>

                                {/* 바디: 시간(행) × 강의실(열) */}
                                <tbody>
                                {timeSlotsHHMM.map((hhmm) => {
                                    const code = normSlotCode(hhmm);
                                    return (
                                        <tr key={`${key}-${hhmm}`}>
                                            {/* 좌측 시간 표시(고정폭, 모노폰트) */}
                                            <td className="aa-cell-mono cell-time">{hhmm}</td>

                                            {/* 각 방의 셀: 여러 반이면 ' / '로 한 줄 표기(중복 제거 포함) */}
                                            {groupRooms.map((r) => {
                                                const list = cellMap.get(`${r.id}|${code}`) || [];
                                                const names = list
                                                    .map((s) => s.className || s.groupName || "(반)")
                                                    .join(" / ");
                                                const only = list.length === 1 ? list[0] : null;

                                                return (
                                                    <td key={`${r.id}-${hhmm}`} style={{ textAlign: "center" }}>
                                                        {/* 데이터 없음 → '—' 회색 */}
                                                        {!list.length ? (
                                                            <span className="aa-subtle" style={{ opacity: 0.4 }}>
                                  —
                                </span>
                                                        ) : (
                                                            <div>
                                                                {/* 여러 반: ' / '로 한 줄 표기 + 말줄임 */}
                                                                <span className="cell-names aa-ellipsis" title={names}>
                                    {names}
                                  </span>

                                                                {/* 단일 반일 때만 보조 정보(교사/메모) 표시 */}
                                                                {only && (only.teacherName || only.memo) && (
                                                                    <div
                                                                        className="aa-subtle aa-ellipsis"
                                                                        title={only.teacherName || only.memo || ""}
                                                                    >
                                                                        {only.teacherName ? only.teacherName : ""}
                                                                        {only.teacherName && only.memo ? " · " : ""}
                                                                        {only.memo ? only.memo : ""}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    );
                                })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ))}

            {/* 가드 메시지들 */}
            {!!work && !loading && !!rooms.length && !timeSlotsHHMM.length && (
                <div className="aa-subtle">CLASS_TIME 공통코드가 비어 있습니다.</div>
            )}
            {!!work && !loading && !rooms.length && (
                <div className="aa-subtle">해당 관에 등록된 강의실이 없습니다.</div>
            )}
        </div>
    );
}