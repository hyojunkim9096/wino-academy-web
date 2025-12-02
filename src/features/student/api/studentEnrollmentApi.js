// src/features/student/api/studentEnrollmentApi.js
// ============================================================================
// Student Enrollment API (배정 전용) — 전체 코드(수정본)
// ----------------------------------------------------------------------------
// ✅ 2025-10 스키마 대응
//  - roleCode(OLD) → classStatusCode(MAIN|CROSS)
//  - attendDays(csv) 제거 → timeslotIds로 관리 (/enrollments/{enrollId}/timeslots)
//  - add/update 시 입력 정규화(normalizeEnrollmentPayload)
//     · classId 숫자화(추가 시만 허용), 날짜 YYYY-MM-DD 정규화
//     · classStatusCode 대문자화 + 허용값 가드('MAIN'|'CROSS')
//     · timeslotIds: number 배열만 허용(중복 제거)
//     · 빈 문자열 제거(pruneEmpty)
//  - update 시 classId는 서버에서 수정 불가 가정 → 강제 제거
//  - (신규) 타임슬롯 매핑 API: getEnrollmentTimeslots / replaceEnrollmentTimeslots
//  - (신규) 타임슬롯 후보 API: suggestTimeslots
// ----------------------------------------------------------------------------
// ✅ 이번 수정 포인트 (500 NoResourceFoundException 대응)
//  - axios client의 baseURL이 '/api' 인 환경에서, 상대경로를 사용해야
//    최종 호출이 '/api/...'로 맞게 나갑니다.
//  - ❌ (문제) 절대경로 '/api/admin/enrollments/suggest' 사용 → '/api'가 이중으로 붙음
//  - ✅ (해결) 상대경로 '/admin/enrollments/suggest' 로 변경
//  - days 배열이면 CSV('1,3')로 직렬화하여 전달(스프링 파싱 호환)
// ============================================================================

import api from '../../../common/api/client.js';

/** 공통 유틸: 빈 문자열 → undefined 정리 */
function pruneEmpty(obj = {}) {
    const out = { ...obj };
    Object.keys(out).forEach((k) => {
        if (out[k] === '') out[k] = undefined;
    });
    return out;
}

/** 내부: YYYY-MM-DD 형태로 정규화 (다른 형식이 오면 앞 10자 추출) */
function normalizeDate(d) {
    if (d == null || d === '') return undefined;
    const s = String(d).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const head = s.slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(head) ? head : s;
}

/** 내부: classStatusCode 정규화(대문자 + 허용값 가드) */
function normalizeClassStatusCode(v) {
    if (v == null || v === '') return undefined;
    const up = String(v).trim().toUpperCase();
    return up === 'MAIN' || up === 'CROSS' ? up : undefined;
}

/** 내부: timeslotIds 정규화(배열, 숫자만, 중복 제거) */
function normalizeTimeslotIds(arr) {
    if (!Array.isArray(arr)) return undefined; // 미전달(null/undefined)은 그대로 무시
    const nums = arr
        .map((x) => Number(x))
        .filter((n) => Number.isInteger(n) && n > 0);
    if (nums.length === 0) return []; // 빈 배열 전달 시 "전체 제거" 의미로 서버에 전달
    return Array.from(new Set(nums));
}

/**
 * 내부: enrollment payload 정규화
 *  - mode: 'add' | 'update'
 */
function normalizeEnrollmentPayload(payload = {}, mode = 'add') {
    const src = { ...(payload || {}) };

    // 날짜 정규화
    if ('enrolledAt' in src) src.enrolledAt = normalizeDate(src.enrolledAt);
    if ('leftAt' in src) src.leftAt = normalizeDate(src.leftAt);

    // classStatusCode 정규화
    if ('classStatusCode' in src) {
        src.classStatusCode = normalizeClassStatusCode(src.classStatusCode);
    }

    // timeslotIds 정규화 (배열/중복 제거)
    if ('timeslotIds' in src) {
        src.timeslotIds = normalizeTimeslotIds(src.timeslotIds);
    }

    // classId 처리
    if (mode === 'add') {
        const n = Number(src.classId);
        src.classId = Number.isFinite(n) ? n : undefined;
    } else {
        // update: classId는 서버에서 변경 불가로 보고 제거
        delete src.classId;
    }

    // 상태/메모 등 빈문자 제거
    return pruneEmpty(src);
}

/** 학생 배정 목록(Page<EnrollmentSummary>) */
export const listStudentEnrollments = (studentId, params = {}) =>
    api.get(`/admin/students/${studentId}/enrollments`, { params }).then((r) => r.data);

/** 배정 추가 */
export const addEnrollmentToStudent = (
    studentId,
    payload = {
        classId: null,
        enrolledAt: null,
        memo: undefined,
        status: undefined,
        classStatusCode: undefined,
        timeslotIds: undefined,
    },
) =>
    api
        .post(`/admin/students/${studentId}/enrollments`, normalizeEnrollmentPayload(payload, 'add'))
        .then((r) => r.data);

/** 배정 수정 */
export const updateStudentEnrollment = (
    studentId,
    enrollmentId,
    payload = {
        leftAt: undefined,
        status: undefined,
        memo: undefined,
        classStatusCode: undefined,
        timeslotIds: undefined,
    },
) =>
    api
        .put(
            `/admin/students/${studentId}/enrollments/${enrollmentId}`,
            normalizeEnrollmentPayload(payload, 'update'),
        )
        .then((r) => r.data);

/** 배정 삭제 */
export const removeStudentEnrollment = (studentId, enrollmentId) =>
    api.delete(`/admin/students/${studentId}/enrollments/${enrollmentId}`).then((r) => r.data);

/** 현재원 집계 (STATUS=ACTIVE) */
export async function getActiveEnrollCountsByClassIds(classIds = []) {
    if (!Array.isArray(classIds) || classIds.length === 0) return {};
    const params = new URLSearchParams();
    classIds.forEach((id) => params.append('classIds', id));
    const { data } = await api.get(`/admin/enrollments/active-count?${params.toString()}`);
    return data || {};
}

/* ==================== ⬇️ 타임슬롯 매핑 API 헬퍼 ==================== */

/** (GET) 해당 배정의 timeslotId 배열 */
export const getEnrollmentTimeslots = (enrollmentId) =>
    api.get(`/admin/enrollments/${enrollmentId}/timeslots`).then((r) => r.data);

/**
 * (PUT) 해당 배정의 타임슬롯 치환
 * - ids: number[] | null | undefined
 * - null/undefined → 기존 유지, [] → 전체 제거
 */
export const replaceEnrollmentTimeslots = (enrollmentId, ids) =>
    api
        .put(`/admin/enrollments/${enrollmentId}/timeslots`, Array.isArray(ids) ? ids : [])
        .then((r) => r.data);

/* ==================== ⬇️ 타임슬롯 후보(교차) API ==================== */
/**
 * 교차수업 후보 조회
 * params: {
 *   loc?: string,
 *   stage?: string,
 *   grade?: string,
 *   days?: number[]|string,  // [1,3] 또는 '1,3'  (선택 없으면 omit)
 *   from?: 'YYYY-MM-DD',
 *   to?: 'YYYY-MM-DD',
 *   excludeStudentId?: number,
 *   limit?: number
 * }
 *
 * ✅ 호출 경로 주의:
 *    - axios baseURL === '/api' 라면, 여기서는 **상대경로** '/admin/...' 를 사용해야
 *      최종 요청이 '/api/admin/...' 로 나가서 백엔드 매핑(@RequestMapping("/api/..."))과 일치합니다.
 *    - 절대경로 '/api/admin/...' 를 쓰면 최종 '/api/api/admin/...' 가 되어 404/NoResourceFound가 납니다.
 *
 * ✅ days 배열 → CSV('1,3')로 직렬화(빈 배열이면 days 제거)
 */
export const suggestTimeslots = (params = {}) => {
    const clean = { ...(params || {}) };
    if (Array.isArray(clean.days)) {
        const arr = clean.days
            .map((x) => Number(x))
            .filter((n) => Number.isInteger(n) && n >= 1 && n <= 7);
        if (arr.length > 0) clean.days = arr.join(',');
        else delete clean.days;
    }
    // 🔧 경로 수정: '/admin/...' (상대경로)
    return api.get('/admin/enrollments/suggest', { params: clean }).then((r) => r.data);
};