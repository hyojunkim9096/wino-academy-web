// src/api/roomAdminApi.js
// ----------------------------------------------------------------------------
// 관리자용 강의실(Room) 관리 API 모듈
// - 공통 axios 인스턴스: ./client
// - v2: listRoomDaySchedule()
//      1) 정식 엔드포인트(/admin/rooms/schedule/day) 호출 시
//         ★ classTimeCodes 배열을 반복 파라미터로 직렬화하여 전송 (Spring List 바인딩 호환)
//      2) 실패 시 PREVIEW를 '요일+교시' 단위로 여러 번 호출해서 합침(필수 파라미터 준수)
// ----------------------------------------------------------------------------
// ★ FIX(핵심): normalizeSchedule()에 assumedDay 옵션 추가 + dayOfWeek 없는 슬롯도 살려서 표시
//              (기존에는 dayOfWeek가 없으면 필터에서 제거되어 '반 목록'이 안 보였음)
// ============================================================================

import api from './client';

/** ★ 배열을 '반복 파라미터'로 직렬화 (a=1&a=2) → Spring List 바인딩 호환 */
function toQueryString(obj = {}) {
    const params = new URLSearchParams();
    Object.entries(obj).forEach(([k, v]) => {
        if (v == null) return;
        if (Array.isArray(v)) v.forEach(each => params.append(k, each ?? ''));
        else params.append(k, String(v));
    });
    return params.toString();
}

/** 목록/검색/페이징 */
export async function listRooms(params){
    const { data } = await api.get("/admin/rooms", { params });
    return data; // { items, total, page, size }
}

/** 생성 (성공 시 id 반환) */
export async function createRoom(body){
    const { data } = await api.post("/admin/rooms", body);
    return data; // id (Long)
}

/** 수정 (성공 시 변경 row수 반환) */
export async function updateRoom(id, body){
    const { data } = await api.put(`/admin/rooms/${id}`, body);
    return data; // affected rows
}

/** 사용여부 토글 (성공 시 변경 row수 반환) */
export async function toggleRoomUse(body){
    const { data } = await api.post("/admin/rooms/toggle-use", body);
    return data; // affected rows
}

/** (기존) 배정 PREVIEW — ⚠️ 서버가 dayOfWeek / classTimeCode 필수로 검증 */
export async function getRoomAssignPreview(params){
    const { data } = await api.get("/admin/rooms/assign/preview", { params });
    return data; // { rooms, timeslots }
}

/** 배정 실행 (dryRun 지원) */
export async function postRoomAssign(body){
    const { data } = await api.post("/admin/rooms/assign", body);
    return data; // { message, updated, cleared }
}

/** NEW: 지점 내 정렬 저장 (orderedIds 순서대로 0..n) */
export async function reorderRooms(workLocationCode, orderedIds = []) {
    const { data } = await api.post(
        "/admin/rooms/reorder",
        { workLocationCode, orderedIds },
        { validateStatus: (st) => st >= 200 && st < 300 }
    );
    return data;
}

/* 내부 유틸: 응답 정규화 */
function normalizeSchedule(raw, opts = {}) {
    const { assumedDay } = opts;

    const rooms = Array.isArray(raw?.rooms)
        ? raw.rooms.map(r => ({
            id:   r.id   ?? r.roomId   ?? r.room_id,
            code: r.code ?? r.roomCode ?? r.room_code,
            name: r.name ?? r.roomName ?? r.room_name ?? (r.code ?? ''),
        })).filter(r => r.id && (r.code || r.name))
        : [];

    const slotsSrc =
        Array.isArray(raw?.slots) ? raw.slots
            : Array.isArray(raw?.timeslots) ? raw.timeslots
                : Array.isArray(raw?.items) ? raw.items
                    : [];

    const toDow = (v) => {
        if (v == null) return undefined;
        const n = Number(v);
        if (Number.isFinite(n)) return n === 0 ? 7 : n;
        const s = String(v).toUpperCase();
        const map = { MON:1, TUE:2, WED:3, THU:4, FRI:5, SAT:6, SUN:7 };
        return map[s];
    };

    const slots = slotsSrc.map(t => {
        const dow = toDow(t.dayOfWeek ?? t.day_of_week ?? t.dow ?? assumedDay);
        return {
            roomId:        t.roomId ?? t.room_id,
            dayOfWeek:     dow,
            classTimeCode: t.classTimeCode ?? t.class_time_code ?? t.classTime ?? t.slotCode,
            classId:       t.classId ?? t.class_id,
            className:     t.className ?? t.class_name ?? t.groupName ?? t.courseName,
            teacherName:   t.teacherName ?? t.teacher_name ?? t.instructorName,
            memo:          t.memo ?? t.note ?? '',
        };
    })
        // dayOfWeek 없어도 허용, roomId & classTimeCode만 필수
        .filter(s => s.roomId && s.classTimeCode);

    return { rooms, slots };
}

/** NEW: 하루 단위(요일) 강의실×슬롯 배정 조회 */
export async function listRoomDaySchedule({ workLocationCode, day, classTimeCodes }){
    if (!workLocationCode) throw new Error("listRoomDaySchedule: workLocationCode is required");
    if (!day) throw new Error("listRoomDaySchedule: day(1~7) is required");
    if (!Array.isArray(classTimeCodes) || classTimeCodes.length === 0) {
        return { rooms: [], slots: [] };
    }

    // 1) 정식 엔드포인트 호출
    try {
        const qs = toQueryString({ workLocationCode, day, classTimeCodes });
        const { data } = await api.get(`/admin/rooms/schedule/day?${qs}`);
        return normalizeSchedule(data, { assumedDay: Number(day) });
    } catch (e1) {
        // 2) PREVIEW 폴백 — (요일+각 교시)로 N회 호출 병합
        const calls = classTimeCodes.map(code =>
            getRoomAssignPreview({
                workLocationCode,
                dayOfWeek: Number(day),
                classTimeCode: String(code)
            })
                .then(res => normalizeSchedule(res, { assumedDay: Number(day) }))
                .catch(() => ({ rooms: [], slots: [] }))
        );

        const parts = await Promise.all(calls);

        const roomMap = new Map();
        for (const p of parts) for (const r of p.rooms) if (r?.id) roomMap.set(r.id, r);

        const slotMap = new Map();
        for (const p of parts) for (const s of p.slots) {
            if (!s?.roomId || !s?.classTimeCode) continue;
            const key = `${s.roomId}|${String(s.classTimeCode).replace(':','')}`;
            if (!slotMap.has(key)) slotMap.set(key, s);
        }

        return { rooms: Array.from(roomMap.values()), slots: Array.from(slotMap.values()) };
    }
}