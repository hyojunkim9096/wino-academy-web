// src/api/academyClassApi.js
// ============================================================================
// 반/과목/시간표 API 클라이언트 (Admin 전용)
// ----------------------------------------------------------------------------
// - saveAssignmentsBulk 는 HTTP 2xx 만 성공으로 간주(409 등은 반드시 reject → 호출부에서 catch)
// - 시간표 슬롯 저장은 하이브리드:
//     startTime(HH:mm) + (옵션) startTimeCode / startTimeName 을 함께 전송
// - 운영 작업(미리보기 / 스냅샷+마감 / 스냅샷에서 되돌리기) API를 정식화
//   ※ 백엔드 컨트롤러 경로/메서드와 "동일한 경로/메서드"로 맞춤
//     - preview  : GET  /admin/classes/ops/preview (params)
//     - close    : POST /admin/classes/ops/close   (body)
//     - restore  : POST /admin/classes/ops/restore (body)
//
// ⚠️ 경로 주의:
//   공용 axios 인스턴스(api)의 baseURL 이 "/api" 라는 가정 하에
//   아래 경로는 "/admin/classes" 로 사용합니다.
//   만약 baseURL 이 루트("")라면 아래 모든 경로 앞에 "/api" 를 붙이세요.
//
// ⚠️ 중요(한글 헤더 오류 방지):
//   브라우저는 헤더 값에 비 ASCII(라틴-1 외) 문자가 포함되면
//   "String contains non ISO-8859-1 code point" 에러를 던집니다.
//   → 메모(note)는 기본적으로 "요청 바디"로만 보내고,
//     서버 필터가 헤더를 요구하는 경우에 대비해
//     안전하게 Base64(UTF-8)로 인코딩한 'X-Event-Note-B64' 헤더를 **추가로** 보냅니다.
//     (서버에서 선택적으로 디코딩해서 사용)
// ============================================================================

import api from './client';

/** UTF-8 → Base64 (헤더 안전 전송용)
 *  - 한글/이모지 등 멀티바이트 문자를 안전하게 헤더로 보낼 때 사용
 *  - 실패 시 빈 문자열을 반환하여 헤더 전송을 생략(바디 note만 사용)
 */
function toB64Utf8(input) {
    try {
        // encodeURIComponent로 UTF-8 바이트 시퀀스로 바꾼 뒤 unescape → btoa
        return btoa(unescape(encodeURIComponent(String(input))));
    } catch {
        return '';
    }
}

// ============================================================================
// 반(Class)
// ============================================================================

/** 반 목록(지점×학부별)
 * @param {string} workLocationCode
 * @param {string} schoolStage
 * @returns {Promise<Array>} 정렬된 반 배열
 */
export const listClasses = (workLocationCode, schoolStage) =>
    api
        .get('/admin/classes', { params: { workLocationCode, schoolStage } })
        .then((r) => {
            const rows = Array.isArray(r?.data) ? r.data : [];
            // displayOrder → sortOrder → order 우선 + 이름 tie-break
            // ✨ 변경: 동일 정렬값일 때 이름으로 보조 정렬(서버 기본 정렬과 일치)
            return rows.sort((a, b) => {
                const sa = (a.displayOrder ?? a.sortOrder ?? a.order ?? 0);
                const sb = (b.displayOrder ?? b.sortOrder ?? b.order ?? 0);
                if (sa !== sb) return sa - sb;
                return String(a.name ?? '').localeCompare(String(b.name ?? ''));
            });
        });

/** (별칭) 반 목록 — 기존 호출부 호환
 *  - 다른 화면에서 listClassesByPartition 을 사용하고 있을 수 있어 안전하게 제공
 */
export const listClassesByPartition = (workLocationCode, schoolStage) =>
    listClasses(workLocationCode, schoolStage);

/** 반 생성 */
export const createClass = (payload) =>
    api.post('/admin/classes', payload).then((r) => r.data);

/** 반 수정 */
export const updateClass = (id, payload) =>
    api.put(`/admin/classes/${id}`, payload).then((r) => r.data);

/** ✅ 반 순서 저장 (쿼리스트링 + 바디 분리)
 *  - Query: workLocationCode, schoolStage
 *  - Body : classIdsInOrder
 */
export const reorderClasses = (workLocationCode, schoolStage, classIdsInOrder) =>
    api
        .put(
            '/admin/classes/reorder',
            { classIdsInOrder }, // body → DTO: ReorderClassReq
            { params: { workLocationCode, schoolStage } } // query → @RequestParam
        )
        .then((r) => r.data);

// ============================================================================
// 반-과목(ClassSubject)
// ============================================================================

/** 반-과목 목록 (subjectName 포함) */
export const listClassSubjects = (classId) =>
    api.get(`/admin/classes/${classId}/subjects`).then((r) => r.data);

/** 반에 과목 추가
 *  - EXAM_PREP 학기에서는 teacherId 가 서버에서 무시될 수 있음
 */
export const addClassSubject = (classId, subjectId, teacherId = null) =>
    api
        .post(`/admin/classes/${classId}/subjects`, { subjectId, teacherId })
        .then((r) => r.data);

/** 반-과목 삭제 */
export const removeClassSubject = (classId, csId) =>
    api.delete(`/admin/classes/${classId}/subjects/${csId}`);

/** 반-과목 담당 교사 지정
 *  - 일부 학기(EXAM_PREP)에서는 서버에서 4xx 또는 무시
 */
export const setClassSubjectTeacher = (csId, teacherId) =>
    api.put(`/admin/classes/subjects/${csId}/teacher`, null, {
        params: { teacherId },
    });

/** 반-과목 정렬(드래그 앤 드롭 결과 반영) */
export const reorderClassSubjects = (classId, ids) =>
    api
        .put(`/admin/classes/${classId}/subjects/reorder`, {
            classSubjectIdsInOrder: ids,
        })
        .then((r) => r.data);

// ============================================================================
// 시간표 슬롯(TimeSlot)
// ============================================================================

/** 시간표 슬롯 목록 */
export const listSlots = (classSubjectId) =>
    api.get(`/admin/classes/subjects/${classSubjectId}/slots`).then((r) => r.data);

/**
 * 단건 슬롯 추가(업서트처럼 사용 가능)
 * - payload 예:
 *   {
 *     classSubjectId, dayOfWeek, startTime: "16:30", endTime: "17:20",
 *     // 아래 2가지는 "표준 교시 스냅샷"과 매핑됨(DDL: class_time_code / class_time_label)
 *     startTimeCode: "T1630", // ← 서버에서는 class_time_code 로 들어감
 *     startTimeName: "16:30", // ← 서버에서는 class_time_label 로 들어감
 *
 *     // 강의실 지정: 문자열 'room'만 서버 DTO에 존재(현 버전)
 *     // (roomId 는 서버 DTO에 없음 → 서버가 알 수 없는 필드를 엄격히 검사하면 400 가능)
 *   }
 */
export const addSlot = (classSubjectId, payload = {}) => {
    // ✨ 변경: 서버 DTO에 존재하는 필드만 선별 전송(엄격 모드에서도 안전)
    const {
        dayOfWeek,
        startTime,
        endTime,
        room,
        startTimeCode,
        startTimeName,
        startDate,
        endDate,
        useYn,
    } = payload;

    return api
        .post(`/admin/classes/subjects/${classSubjectId}/slots`, {
            classSubjectId,    // 서버가 body.classSubjectId 를 참고하는 구현과의 호환
            dayOfWeek,
            startTime,
            endTime,
            room,
            startTimeCode,
            startTimeName,
            startDate,
            endDate,
            useYn,
        })
        .then((r) => r.data);
};

/** 슬롯 삭제(단건) */
export const removeSlot = (slotId) =>
    api.delete(`/admin/classes/slots/${slotId}`);

// ============================================================================
// 담당/시간 일괄 저장(Bulk Assignments)
// ============================================================================

/** ✅ 담당/시간 일괄 저장 (검증+반영)
 *  - items[*]에 startTime(HH:mm)와 함께 (옵션) startTimeCode/startTimeName 동봉 가능
 *  - HTTP 2xx 만 성공으로 간주, 409/4xx/5xx 는 반드시 reject → 호출부에서 catch
 */
export const saveAssignmentsBulk = (classId, items) =>
    api
        .post(
            `/admin/classes/${classId}/assignments/bulk`,
            { items },
            { validateStatus: (st) => st >= 200 && st < 300 }
        )
        .then((r) => r.data);

// ============================================================================
// 반 운영 작업 API (미리보기 / 마감 / 되돌리기)
// ============================================================================

/** 영향 범위 카운트(반/과목/시간표, 마지막 스냅샷 시각)
 *  ※ 백엔드는 GET → params 사용
 */
export const previewClassOps = (workLocationCode, schoolStage, semesterId) =>
    api
        .get('/admin/classes/ops/preview', {
            params: { workLocationCode, schoolStage, semesterId },
        })
        .then((r) => r.data);

/** (별칭) opsPreview — 기존 호출부 호환 */
export const opsPreview = (params) =>
    previewClassOps(params?.workLocationCode, params?.schoolStage, params?.semesterId);

/**
 * 스냅샷 저장 + 초기화(학기/담임/과목담당 NULL, 시간표 삭제)
 * - 메모(note)는 바디에 포함(권장) + 헤더(X-Event-Note-B64, 선택)로도 안전 전송
 * @param {{workLocationCode:string, schoolStage:string, semesterId:number, note?:string}} payload
 * @param {number} [appUserId]  ← 선택: /api/auth/me.id 를 헤더로 전송
 */
export const snapshotAndCloseClasses = (
    { workLocationCode, schoolStage, semesterId, note },
    appUserId
) => {
    // ⚠️ 헤더에는 오직 ASCII만: 한글 메모는 Base64(UTF-8)로 보조 전송
    const headers = {};
    if (appUserId != null) headers['X-App-User-Id'] = String(appUserId);
    if (note && String(note).trim()) headers['X-Event-Note-B64'] = toB64Utf8(note);

    return api
        .post(
            '/admin/classes/ops/close',
            // 바디에도 메모를 그대로 실어 보냄(서버에서 바로 사용 가능)
            { workLocationCode, schoolStage, semesterId, note },
            Object.keys(headers).length ? { headers } : undefined
        )
        .then((r) => r.data);
};

/** (별칭) opsClose — 기존 호출부 호환 */
export const opsClose = (body, headersArg) => {
    // 별칭은 단순 패스스루 대신, 안전 헤더를 자동 구성하는 정식 함수로 연결
    const { workLocationCode, schoolStage, semesterId, note } = body || {};
    // headersArg 는 무시(브라우저의 비-ASCII 헤더 문제를 회피하기 위해 내부에서 안전 헤더 구성)
    return snapshotAndCloseClasses(
        { workLocationCode, schoolStage, semesterId, note },
        undefined // appUserId 필요 시 상위에서 snapshotAndCloseClasses 를 직접 사용
    );
};

/**
 * 마지막 스냅샷 기준 선택 항목 복원
 * - 프론트 targets: { class, subject, timeslot } → 서버 targets: { clazz, subject, timeslot }
 * - 메모(note) 전송 방식은 close 와 동일
 * - ✅ 기본 동작: **되돌리기 직전 선(先) 스냅샷 후 복원**(preSnapshot=true)
 *
 * @param {{
 *   workLocationCode:string,
 *   schoolStage:string,
 *   semesterId:number,
 *   targets:{class?:boolean, subject?:boolean, timeslot?:boolean},
 *   note?:string,
 *   preSnapshot?:boolean // ← 선택. 기본값 true(명시 안 하면 서버/클라 모두 true로 동작)
 * }} payload
 * @param {number} [appUserId]  ← 선택: /api/auth/me.id 를 헤더로 전송
 */
export const restoreClassesFromSemester = (
    { workLocationCode, schoolStage, semesterId, targets, note, preSnapshot = true },
    appUserId
) => {
    // 프런트 → 서버 타깃 필드명 변환
    const payloadTargets = {
        clazz: !!targets?.class,
        subject: !!targets?.subject,
        timeslot: !!targets?.timeslot,
    };

    // 헤더(선택): 사용자/메모
    const headers = {};
    if (appUserId != null) headers['X-App-User-Id'] = String(appUserId);
    if (note && String(note).trim()) headers['X-Event-Note-B64'] = toB64Utf8(note);

    // 바디: 선스냅샷(preSnapshot) 기본 true로 강제 → 실수 방지
    return api
        .post(
            '/admin/classes/ops/restore',
            {
                workLocationCode,
                schoolStage,
                semesterId,
                targets: payloadTargets,
                note,
                preSnapshot: preSnapshot !== false, // undefined/true → true, 명시적 false만 허용
            },
            Object.keys(headers).length ? { headers } : undefined
        )
        .then((r) => r.data);
};

/** (별칭) opsRestore — 기존 호출부 호환 */
export const opsRestore = (body, headersArg) => {
    const { workLocationCode, schoolStage, semesterId, targets, note, preSnapshot } = body || {};
    // headersArg 는 무시(안전 헤더는 내부 자동 구성)
    return restoreClassesFromSemester(
        { workLocationCode, schoolStage, semesterId, targets, note, preSnapshot },
        undefined
    );
};

/** ✅ (편의) 전체 되돌리기 헬퍼
 * - 화면에서 항목 선택을 없애고 "무조건 전체 복원"만 제공하려면 이 함수를 사용하세요.
 * - 내부적으로 restoreClassesFromSemester를 호출하며 preSnapshot=true 보장.
 */
export const restoreClassesAll = (
    { workLocationCode, schoolStage, semesterId, note },
    appUserId
) =>
    restoreClassesFromSemester(
        {
            workLocationCode,
            schoolStage,
            semesterId,
            targets: { class: true, subject: true, timeslot: true }, // 무조건 전체
            note,
            preSnapshot: true, // 선스냅샷 보장
        },
        appUserId
    );

// ============================================================================
// (선택) 내보내기 일람 — 화면에서 auto import 시 가독성 향상 목적
// ============================================================================
// export {
//   listClasses, listClassesByPartition, createClass, updateClass, reorderClasses,
//   listClassSubjects, addClassSubject, removeClassSubject, setClassSubjectTeacher, reorderClassSubjects,
//   listSlots, addSlot, removeSlot,
//   saveAssignmentsBulk,
//   previewClassOps, opsPreview,
//   snapshotAndCloseClasses, opsClose,
//   restoreClassesFromSemester, restoreClassesAll, opsRestore
// };