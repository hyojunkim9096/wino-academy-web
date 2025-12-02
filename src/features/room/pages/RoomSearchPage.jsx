// ============================================================================
// src/features/room/pages/RoomSearchPage.jsx
// ----------------------------------------------------------------------------
// 강의실 조회(그리드 v2)
//  - 상단: 관 칩 + 요일 탭(월~일)
//  - 그리드: 가로=강의실, 세로=CLASS_TIME
//  - ★ CLASS_TIME 코드가 로딩되기 전에는 서버 호출을 하지 않도록 가드
//
// ★ 개선점(요청 반영)
//   1) 여러 반일 때 ' / '로 한 줄 표기(중복 제거 포함)
//   2) 룸/셀 헤더를 중앙 정렬 + table-layout:fixed
//   3) 헤더의 굵은 텍스트는 room.name
//   4) 세션키 네임스페이스 분리(roomSearch.activeWorkCode)
//   5) ✅ CLASS_TIME 공통코드: enabled=1(true)인 항목만 노출 (0/false는 숨김)
//      - DB: wino_db.common_code.enabled (0/1)
//      - API 응답에서 enabled 속성이 없으면 기본적으로 사용(true)으로 간주
//   6) ✅ 서버 정렬 유지: 클라이언트 재정렬 제거(그룹 순서도 서버 등장 순서대로)
//      - RoomService.list / daySchedule 가 sort_order ASC, code ASC 로 내려준 순서를 신뢰
// ============================================================================

import React, { useEffect, useMemo, useState } from "react";

import LocationChips from "@/features/member/components/LocationChips.jsx";
import { getCodes } from "@/features/system/api/commonCodeAdminApi.js";
import { listRooms, listRoomDaySchedule } from "@/features/room/api/roomAdminApi.js";
import { alertError } from "@/common/ui/alert.js";

import "@/features/system/styles/admin-system.css";
import "@/features/admin/styles/admin-academy.css";
import "@/features/room/styles/admin-room.css";

/* 세션 저장 키(타 페이지와 충돌 방지) */
const STORAGE_KEY = "roomSearch.activeWorkCode";

/* CLASS_TIME → { code, hhmm } 정규화 */
const toSlotItem = (x) => {
    const code = String(x?.code ?? "").trim();   // 예: '1630' or 'P1'
    const name = String(x?.name ?? "").trim();   // 예: '16:30'
    const hhmm =
        /^\d{2}:\d{2}$/.test(name)
            ? name
            : /^\d{4}$/.test(code)
                ? `${code.slice(0, 2)}:${code.slice(2)}`
                : name || code;
    return code || hhmm ? { code: code || hhmm.replace(":", ""), hhmm } : null;
};

/* 공통코드 enabled 필터 (1/0, '1'/'0', true/false 모두 대응)
   - 응답에 enabled가 없으면 기본적으로 사용(true)으로 처리 */
function isEnabledCode(item) {
    const v = item?.enabled;
    if (v === undefined || v === null) return true;           // 속성 없으면 사용으로 간주
    if (typeof v === "boolean") return v;
    if (typeof v === "number") return v === 1;
    const s = String(v).trim().toLowerCase();
    return s === "1" || s === "y" || s === "true";
}

/* 요일 탭 */
const DAYS = [
    { value: 1, label: "월" },
    { value: 2, label: "화" },
    { value: 3, label: "수" },
    { value: 4, label: "목" },
    { value: 5, label: "금" },
    { value: 6, label: "토" },
    { value: 7, label: "일" },
];

/* 보조 유틸 */
const normSlotCode = (c) => String(c ?? "").replace(/:/g, ""); // '16:30' → '1630'
const slotUniqKey = (s) => {
    // 동일 반(중복 응답) 제거용 우선순위 키
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
        if (!seen.has(k)) {
            seen.add(k);
            out.push(x);
        }
    }
    return out;
};

export default function RoomSearchPage() {
    /* 관 선택 프리셋 */
    const [work, setWork] = useState("");
    useEffect(() => {
        // URL 파라미터 또는 세션 프리셋을 초기값으로
        try {
            const sp = new URLSearchParams(window.location.search);
            const w = sp.get("work") || sessionStorage.getItem(STORAGE_KEY) || "";
            if (w) setWork(w);
        } catch {}
    }, []);
    useEffect(() => {
        // 같은 앱 내 타 페이지와 충돌 막기 위해 자체 키에만 저장
        try {
            if (work) sessionStorage.setItem(STORAGE_KEY, work);
        } catch {}
    }, [work]);

    /* 요일 */
    const [day, setDay] = useState(1);

    /* 시간 슬롯 */
    const [slotItems, setSlotItems] = useState([]);
    const timeSlotsHHMM = useMemo(() => slotItems.map((s) => s.hhmm), [slotItems]);
    const timeSlotCodes = useMemo(() => slotItems.map((s) => s.code), [slotItems]);

    useEffect(() => {
        (async () => {
            const list = await getCodes("CLASS_TIME").catch(() => []);
            // ✅ enabled=1(true)만 사용
            const enabledList = (list || []).filter(isEnabledCode);
            const items = enabledList
                .map(toSlotItem)
                .filter(Boolean)
                .sort((a, b) => a.hhmm.localeCompare(b.hhmm));
            setSlotItems(items);
        })();
    }, []);

    /* 강의실 목록(가로축) — 서버 정렬( sort_order ASC, code ASC )을 신뢰 */
    const [rooms, setRooms] = useState([]);
    const loadRooms = async () => {
        if (!work) {
            setRooms([]);
            return;
        }
        const page = await listRooms({
            workLocationCode: work,
            useYn: "1",
            page: 1,
            size: 500,
        });
        // 서버가 정렬해서 내려줌 → 그대로 사용
        setRooms(Array.isArray(page?.items) ? page.items : []);
    };
    useEffect(() => {
        loadRooms(); // eslint-disable-line react-hooks/exhaustive-deps
    }, [work]);

    /* 하루 스케줄 데이터 */
    const [slots, setSlots] = useState([]); // [{roomId, classTimeCode, className, ...}]
    const [loading, setLoading] = useState(false);

    const loadDay = async () => {
        if (!work || !day) {
            setSlots([]);
            return;
        }
        // ✅ CLASS_TIME 코드가 아직 없으면(없거나 모두 비활성) 서버 호출 생략
        if (!Array.isArray(timeSlotCodes) || timeSlotCodes.length === 0) {
            setSlots([]);
            return;
        }
        setLoading(true);
        try {
            const { rooms: serverRooms, slots: rows } = await listRoomDaySchedule({
                workLocationCode: work,
                day,
                classTimeCodes: timeSlotCodes, // 서버 검증/폴백 대비
            });
            if (Array.isArray(serverRooms) && serverRooms.length) {
                // 서버 정렬을 그대로 적용(클라이언트 재정렬 금지)
                setRooms(serverRooms);
            }
            setSlots(Array.isArray(rows) ? rows : []);
        } catch (e) {
            const msg = e?.message || "강의실 시간표(하루)를 불러오지 못했습니다.";
            await alertError("오류", msg);
            setSlots([]);
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => {
        loadDay(); // eslint-disable-line react-hooks/exhaustive-deps
    }, [work, day, timeSlotCodes.join("|")]);

    /** ★ 그룹핑: '첫 글자(층/그룹)' 기준으로 묶되,
     *  - 그룹 순서: 서버가 내려준 rooms '등장 순서' 유지
     *  - 그룹 내부 순서: 역시 등장 순서 유지(재정렬 X)
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

    /* 룩업: (roomId|slotCode) → DaySlot[] (여러 반 지원 + dedupe) */
    const cellMap = useMemo(() => {
        const m = new Map();
        for (const s of slots) {
            if (!s?.roomId || !s?.classTimeCode) continue;
            const k = `${s.roomId}|${normSlotCode(s.classTimeCode)}`; // 단일 키
            if (!m.has(k)) m.set(k, []);
            m.get(k).push(s);
        }
        // 중복 제거 + 정렬(반 이름 → 교사명)
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

    /* 렌더 */
    return (
        <div className="aa-page academy-page room-page">
            <div className="aa-container">
                {/* Topbar */}
                <div className="aa-toolbar aa-topbar">
                    <div className="aa-topbar-title" style={{ flex: "1 1 100%" }}>
                        <h1 className="aa-title">강의실 조회</h1>
                    </div>

                    {/* 관 칩 */}
                    <div
                        className="aa-topbar-left"
                        style={{ display: "flex", gap: 6, overflowX: "auto" }}
                    >
                        <LocationChips value={work} onChange={(v) => setWork(v)} />
                    </div>

                    {/* 요일 탭 */}
                    <div
                        className="aa-topbar-right"
                        style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: ".5rem" }}
                    >
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
                </div>

                {/* 본문: 그룹별 테이블 (room-grid 클래스 → 한 줄 말줄임 CSS 적용) */}
                <section className="aa-card room-grid" aria-label="강의실×시간 그리드">
                    {!work && <div className="aa-subtle">상단에서 관(지점)을 먼저 선택하세요.</div>}
                    {work && loading && <div className="aa-subtle">불러오는 중…</div>}

                    {work &&
                        !!timeSlotsHHMM.length &&
                        groupedRooms.map(({ key, rooms: groupRooms }) => (
                            <div key={key} style={{ marginTop: 16 }}>
                                {/* 그룹 표시: 숫자 한 글자면 '층' */}
                                <div
                                    className="aa-row"
                                    style={{ justifyContent: "space-between", margin: "0 0 4px 0" }}
                                >
                                    <h3 className="aa-title--sm" style={{ opacity: 0.9 }}>
                                        {/^\d$/.test(key) ? `${key}층` : `그룹 ${key}`}
                                    </h3>
                                </div>

                                <div className="aa-table-wrap">
                                    <table className="aa-table aa-table--lg" style={{ tableLayout: "fixed" }}>
                                        <colgroup>
                                            <col className="col-time" style={{ width: 120 }} />
                                            {groupRooms.map((r) => (
                                                <col key={r.id} />
                                            ))}
                                        </colgroup>

                                        <thead>
                                        <tr>
                                            <th style={{ textAlign: "center" }}>시간</th>
                                            {groupRooms.map((r) => (
                                                <th key={r.id} style={{ textAlign: "center" }}>
                                                    {/* 헤더: 이름 굵게(한 줄 말줄임) */}
                                                    <span className="head-name aa-ellipsis" title={r.name || r.code}>
                              {r.name || r.code}
                            </span>
                                                </th>
                                            ))}
                                        </tr>
                                        </thead>

                                        <tbody>
                                        {timeSlotsHHMM.map((hhmm) => {
                                            const code = normSlotCode(hhmm);
                                            return (
                                                <tr key={`${key}-${hhmm}`}>
                                                    <td className="aa-cell-mono cell-time">{hhmm}</td>
                                                    {groupRooms.map((r) => {
                                                        const list = cellMap.get(`${r.id}|${code}`) || [];
                                                        const names = list
                                                            .map((s) => s.className || s.groupName || "(반)")
                                                            .join(" / ");
                                                        const only = list.length === 1 ? list[0] : null;

                                                        return (
                                                            <td key={`${r.id}-${hhmm}`} style={{ textAlign: "center" }}>
                                                                {!list.length ? (
                                                                    <span className="aa-subtle" style={{ opacity: 0.4 }}>
                                      —
                                    </span>
                                                                ) : (
                                                                    <div>
                                                                        {/* 여러 반: ' / '로 한 줄 표기 */}
                                                                        <span className="cell-names aa-ellipsis" title={names}>
                                        {names}
                                      </span>
                                                                        {/* 단일 반일 때만 보조 정보 노출 */}
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
                    {work && !loading && !!rooms.length && !timeSlotsHHMM.length && (
                        <div className="aa-subtle">CLASS_TIME 공통코드가 비어 있거나 모두 비활성입니다.</div>
                    )}
                    {work && !loading && !rooms.length && (
                        <div className="aa-subtle">해당 관에 등록된 강의실이 없습니다.</div>
                    )}
                </section>
            </div>
        </div>
    );
}