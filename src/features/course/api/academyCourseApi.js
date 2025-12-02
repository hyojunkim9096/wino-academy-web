// src/features/course/api/academyCourseApi.js
// ============================================================================
// 반(Course)/과목/시간표 API 클라이언트 (Admin 전용)
// ----------------------------------------------------------------------------
// - 리네이밍: 기존 academyClassApi.js 를 대체함 (Class -> Course)
// - 백엔드 경로: /api/admin/courses (기존 /api/admin/classes)
// ----------------------------------------------------------------------------
// - saveAssignmentsBulk 는 HTTP 2xx 만 성공으로 간주(409 등은 반드시 reject → 호출부에서 catch)
// - 시간표 슬롯 저장은 하이브리드:
//     startTime(HH:mm) + (옵션) startTimeCode / startTimeName 을 함께 전송
// - 운영 작업(미리보기 / 스냅샷+마감 / 스냅샷에서 되돌리기) API를 정식화
//     - preview  : GET  /admin/courses/ops/preview (params)
//     - close    : POST /admin/courses/ops/close   (body)
//     - restore  : POST /admin/courses/ops/restore (body)
//
// ⚠️ 중요(한글 헤더 오류 방지):
//   브라우저는 헤더 값에 비 ASCII 문자가 포함되면 에러를 던집니다.
//   → 메모(note)는 기본적으로 "요청 바디"로만 보내고,
//     서버 필터가 헤더를 요구하는 경우에 대비해
//     안전하게 Base64(UTF-8)로 인코딩한 'X-Event-Note-B64' 헤더를 **추가로** 보냅니다.
// ============================================================================

import api from '../../../common/api/client.js';

/** UTF-8 → Base64 (헤더 안전 전송용) */
function toB64Utf8(input) {
    try {
        // encodeURIComponent로 UTF-8 바이트 시퀀스로 바꾼 뒤 unescape → btoa
        return btoa(unescape(encodeURIComponent(String(input))));
    } catch {
        return '';
    }
}

// ============================================================================
// 반(Course)
// ============================================================================

/** 반 목록(지점×학부별)
 * @param {string} workLocationCode
 * @param {string} schoolStage
 * @returns {Promise<Array>} 정렬된 반 배열
 */
export const listCourses = (workLocationCode, schoolStage) =>
    api
        .get('/admin/courses', { params: { workLocationCode, schoolStage } }) // ✅ URL 변경
        .then((r) => {
            const rows = Array.isArray(r?.data) ? r.data : [];
            // displayOrder → sortOrder → order 우선 + 이름 tie-break
            return rows.sort((a, b) => {
                const sa = (a.displayOrder ?? a.sortOrder ?? a.order ?? 0);
                const sb = (b.displayOrder ?? b.sortOrder ?? b.order ?? 0);
                if (sa !== sb) return sa - sb;
                return String(a.name ?? '').localeCompare(String(b.name ?? ''));
            });
        });

/** (별칭) 반 목록 — 기존 호출부 호환 */
export const listCoursesByPartition = (workLocationCode, schoolStage) =>
    listCourses(workLocationCode, schoolStage);

/** 반 생성 */
export const createCourse = (payload) =>
    api.post('/admin/courses', payload).then((r) => r.data); // ✅ URL 변경

/** 반 수정 */
export const updateCourse = (id, payload) =>
    api.put(`/admin/courses/${id}`, payload).then((r) => r.data); // ✅ URL 변경

/** ✅ 반 순서 저장 (쿼리스트링 + 바디 분리)
 * - Query: workLocationCode, schoolStage
 * - Body : courseIdsInOrder
 */
export const reorderCourses = (workLocationCode, schoolStage, courseIdsInOrder) =>
    api
        .put(
            '/admin/courses/reorder', // ✅ URL 변경
            { courseIdsInOrder }, // body → DTO: ReorderCourseReq
            { params: { workLocationCode, schoolStage } } // query → @RequestParam
        )
        .then((r) => r.data);

// ============================================================================
// 반-과목(CourseSubject)
// ============================================================================

/** 반-과목 목록 (subjectName 포함) */
export const listCourseSubjects = (courseId) =>
    api.get(`/admin/courses/${courseId}/subjects`).then((r) => r.data); // ✅ URL 변경

/** 반에 과목 추가
 * - EXAM_PREP 학기에서는 teacherId 가 서버에서 무시될 수 있음
 */
export const addCourseSubject = (courseId, subjectId, teacherId = null) =>
    api
        .post(`/admin/courses/${courseId}/subjects`, { subjectId, teacherId }) // ✅ URL 변경
        .then((r) => r.data);

/** 반-과목 삭제 */
export const removeCourseSubject = (courseId, csId) =>
    api.delete(`/admin/courses/${courseId}/subjects/${csId}`); // ✅ URL 변경

/** 반-과목 담당 교사 지정
 * - 일부 학기(EXAM_PREP)에서는 서버에서 4xx 또는 무시
 */
export const setCourseSubjectTeacher = (csId, teacherId) =>
    api.put(`/admin/courses/subjects/${csId}/teacher`, null, { // ✅ URL 변경
        params: { teacherId },
    });

/** 반-과목 정렬(드래그 앤 드롭 결과 반영) */
export const reorderCourseSubjects = (courseId, ids) =>
    api
        .put(`/admin/courses/${courseId}/subjects/reorder`, { // ✅ URL 변경
            courseSubjectIdsInOrder: ids,
        })
        .then((r) => r.data);

// ============================================================================
// 시간표 슬롯(TimeSlot)
// ============================================================================

/** 시간표 슬롯 목록 */
export const listSlots = (courseSubjectId) =>
    api.get(`/admin/courses/subjects/${courseSubjectId}/slots`).then((r) => r.data); // ✅ URL 변경

/**
 * 단건 슬롯 추가(업서트처럼 사용 가능)
 * - payload 예:
 * {
 * courseSubjectId, dayOfWeek, startTime: "16:30", endTime: "17:20",
 * startTimeCode: "T1630", startTimeName: "16:30", ...
 * }
 */
export const addSlot = (courseSubjectId, payload = {}) => {
    // 서버 DTO에 존재하는 필드만 선별 전송
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
        .post(`/admin/courses/subjects/${courseSubjectId}/slots`, { // ✅ URL 변경
            courseSubjectId,    // 서버가 body.courseSubjectId 를 참고하는 구현과의 호환
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
    api.delete(`/admin/courses/slots/${slotId}`); // ✅ URL 변경

// ============================================================================
// 담당/시간 일괄 저장(Bulk Assignments)
// ============================================================================

/** ✅ 담당/시간 일괄 저장 (검증+반영)
 * - HTTP 2xx 만 성공으로 간주, 409/4xx/5xx 는 반드시 reject → 호출부에서 catch
 */
export const saveAssignmentsBulk = (courseId, items) =>
    api
        .post(
            `/admin/courses/${courseId}/assignments/bulk`, // ✅ URL 변경
            { items },
            { validateStatus: (st) => st >= 200 && st < 300 }
        )
        .then((r) => r.data);

// ============================================================================
// 반 운영 작업 API (미리보기 / 마감 / 되돌리기)
// ============================================================================

/** 영향 범위 카운트(반/과목/시간표, 마지막 스냅샷 시각) */
export const previewCourseOps = (workLocationCode, schoolStage, semesterId) =>
    api
        .get('/admin/courses/ops/preview', { // ✅ URL 변경
            params: { workLocationCode, schoolStage, semesterId },
        })
        .then((r) => r.data);

/** (별칭) opsPreview — 기존 호출부 호환 */
export const opsPreview = (params) =>
    previewCourseOps(params?.workLocationCode, params?.schoolStage, params?.semesterId);

/**
 * 스냅샷 저장 + 초기화(학기/담임/과목담당 NULL, 시간표 삭제)
 */
export const snapshotAndCloseCourses = (
    { workLocationCode, schoolStage, semesterId, note },
    appUserId
) => {
    const headers = {};
    if (appUserId != null) headers['X-App-User-Id'] = String(appUserId);
    if (note && String(note).trim()) headers['X-Event-Note-B64'] = toB64Utf8(note);

    return api
        .post(
            '/admin/courses/ops/close', // ✅ URL 변경
            { workLocationCode, schoolStage, semesterId, note },
            Object.keys(headers).length ? { headers } : undefined
        )
        .then((r) => r.data);
};

/** (별칭) opsClose — 기존 호출부 호환 */
export const opsClose = (body, headersArg) => {
    const { workLocationCode, schoolStage, semesterId, note } = body || {};
    return snapshotAndCloseCourses(
        { workLocationCode, schoolStage, semesterId, note },
        undefined
    );
};

/**
 * 마지막 스냅샷 기준 선택 항목 복원
 */
export const restoreCoursesFromSemester = (
    { workLocationCode, schoolStage, semesterId, targets, note, preSnapshot = true },
    appUserId
) => {
    const payloadTargets = {
        clazz: !!targets?.class,
        subject: !!targets?.subject,
        timeslot: !!targets?.timeslot,
    };

    const headers = {};
    if (appUserId != null) headers['X-App-User-Id'] = String(appUserId);
    if (note && String(note).trim()) headers['X-Event-Note-B64'] = toB64Utf8(note);

    return api
        .post(
            '/admin/courses/ops/restore', // ✅ URL 변경
            {
                workLocationCode,
                schoolStage,
                semesterId,
                targets: payloadTargets,
                note,
                preSnapshot: preSnapshot !== false,
            },
            Object.keys(headers).length ? { headers } : undefined
        )
        .then((r) => r.data);
};

/** (별칭) opsRestore — 기존 호출부 호환 */
export const opsRestore = (body, headersArg) => {
    const { workLocationCode, schoolStage, semesterId, targets, note, preSnapshot } = body || {};
    return restoreClassesFromSemester( // (주의: 이 함수명은 아래 alias 유지)
        { workLocationCode, schoolStage, semesterId, targets, note, preSnapshot },
        undefined
    );
};

// (기존 호출부 호환을 위한 alias 유지 - 함수명 변경에 따른 사이드이펙트 최소화)
export const restoreClassesFromSemester = restoreCoursesFromSemester;

/** ✅ (편의) 전체 되돌리기 헬퍼 */
export const restoreCoursesAll = (
    { workLocationCode, schoolStage, semesterId, note },
    appUserId
) =>
    restoreCoursesFromSemester(
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