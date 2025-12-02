// src/features/member/api/staffApi.js
import api from '../../../common/api/client.js';

/* ============================================================================
 * 직원(교사/스태프) API
 * - 기본 목록/단건/수정/비밀번호/사진 업로드
 * - + 교사 전용 검색(searchTeachers) 헬퍼 추가
 * ----------------------------------------------------------------------------
 * 서버 쿼리 파라미터 가이드(관례):
 *   - employeeType: 'ALL' | 'TEACHER' | 'STAFF'
 *   - workLocation: 지점 코드 (예: 'N' | 'W' | 'Q' ...)
 *   - keyword     : 이름, 전화, 이메일 등 통합 검색어
 *   - page / size : (서버가 지원할 경우) 페이지네이션
 * ========================================================================== */

/** 목록 조회
 * @param {Object} params
 * @param {'ALL'|'TEACHER'|'STAFF'} [params.employeeType]
 * @param {string} [params.workLocation]
 * @param {string} [params.keyword]
 * @param {number} [params.page]
 * @param {number} [params.size]
 * @returns {Promise<Array|Object>} 서버 구현에 따라 배열 또는 페이지 오브젝트
 */
export const listStaffs = async (params = {}) => {
    // 불필요한 공백/빈 값 방지: keyword 정리, workLocation 대문자
    const keyword =
        typeof params.keyword === 'string' ? params.keyword.trim() : params.keyword;

    const query = {
        ...params,
        ...(keyword ? { keyword } : {}), // 빈 문자열은 제외
        ...(params.workLocation
            ? { workLocation: String(params.workLocation).toUpperCase() }
            : {}),
    };

    return (await api.get('/admin/staffs', { params: query })).data;
};

/** 단건 조회 */
export const getStaff = async (id) =>
    (await api.get(`/admin/staffs/${id}`)).data;

/** 수정 */
export const updateStaff = async (id, payload) =>
    (await api.put(`/admin/staffs/${id}`, payload)).data;

/** 비밀번호 변경 */
export const changeStaffPassword = async (id, newPassword) =>
    (await api.post(`/admin/staffs/${id}/password`, { newPassword })).data;

/** 프로필 이미지 업로드 (multipart) */
export const uploadStaffPhoto = async (id, file) => {
    const fd = new FormData();
    fd.append('file', file);
    return (
        await api.post(`/admin/staffs/${id}/photo`, fd, {
            headers: { 'Content-Type': 'multipart/form-data' },
        })
    ).data; // { fileId }
};

/* -------------------------------------------------------------------------- */
/* ✅ 추가: 교사 전용 검색 헬퍼 (검색형 셀렉트/오토컴플리트용)                  */
/* - employeeType='TEACHER'를 기본으로 강제                                     */
/* - workLocation, keyword, size, page 등 그대로 전달                           */
/* - 서버가 페이지객체를 리턴하는 경우/배열을 리턴하는 경우 모두 대응            */
/* - 셀렉트 옵션에 바로 쓸 수 있도록 최소 필드만 매핑                           */
/* -------------------------------------------------------------------------- */

/** 셀렉트 라벨 생성 유틸: "이름 · (지점) · 연락처/이메일 일부" */
export function buildTeacherLabel(t) {
    const parts = [
        t?.name ?? `#${t?.id ?? '?'}`,
        t?.workLocation ? `· ${t.workLocation}` : null,
        t?.mobile ? `· ${maskPhone(t.mobile)}` : t?.email ? `· ${t.email}` : null,
    ].filter(Boolean);
    return parts.join(' ');
}

/** 전화번호 마스킹(가독성용, 단순 처리) */
function maskPhone(m) {
    // 010-1234-5678 → 010-****-5678
    const s = String(m);
    return s.replace(/(\d{3})-?(\d{3,4})-?(\d{4})/, (_m, a, b, c) => {
        const star = '*'.repeat(b.length);
        return `${a}-${star}-${c}`;
    });
}

/**
 * 교사 검색(셀렉트용 옵션 배열)
 * @param {Object} opts
 * @param {string=} opts.workLocation  - 지점 코드(예: 'N'|'W'|'Q')
 * @param {string=} opts.keyword       - 검색어(이름/전화/이메일)
 * @param {number=} opts.size          - 최대 개수(서버 지원 시)
 * @param {number=} opts.page          - 페이지(서버 지원 시)
 * @returns {Promise<Array<{id:number, name:string, workLocation?:string, mobile?:string, email?:string, label:string}>>}
 */
export async function searchTeachers(opts = {}) {
    const params = {
        employeeType: 'TEACHER', // ✅ 강제
        ...(opts.workLocation ? { workLocation: String(opts.workLocation).toUpperCase() } : {}),
        ...(opts.keyword ? { keyword: String(opts.keyword).trim() } : {}),
        ...(Number.isFinite(opts.size) ? { size: opts.size } : {}),
        ...(Number.isFinite(opts.page) ? { page: opts.page } : {}),
    };

    const raw = await listStaffs(params);

    // 서버가 페이지 객체를 반환하는 경우: content/records/rows 등 관용 키 우선 탐색
    const rows =
        (Array.isArray(raw) && raw) ||
        raw?.content ||
        raw?.records ||
        raw?.rows ||
        [];

    // 필요한 필드만 얕게 매핑 + label 생성
    return (rows || []).map((r) => {
        const item = {
            id: r.id,
            name: r.name || r.fullName || r.displayName || `#${r.id}`,
            workLocation: r.workLocation,
            mobile: r.mobile,
            email: r.email,
        };
        return { ...item, label: buildTeacherLabel(item) };
    });
}

/* -------------------------------------------------------------------------- */
/* ✅ (선택) 교사 검색: select의 onScroll 로드 등에서 그대로 쓰는 원본 전달     */
/* - 셀렉트가 "커스텀 페이지네이션"을 직접 제어해야 할 경우 유용                */
/* - 서버의 페이지 객체를 그대로 돌려받고, params는 그대로 패스                 */
/* -------------------------------------------------------------------------- */

/**
 * 원본 페이지 객체 반환형 교사 검색
 * @param {Object} opts same as searchTeachers
 * @returns {Promise<Object|Array>} 서버 원본(페이지객체/배열)
 */
export async function searchTeachersRaw(opts = {}) {
    const params = {
        employeeType: 'TEACHER',
        ...(opts.workLocation ? { workLocation: String(opts.workLocation).toUpperCase() } : {}),
        ...(opts.keyword ? { keyword: String(opts.keyword).trim() } : {}),
        ...(Number.isFinite(opts.size) ? { size: opts.size } : {}),
        ...(Number.isFinite(opts.page) ? { page: opts.page } : {}),
    };
    return listStaffs(params);
}