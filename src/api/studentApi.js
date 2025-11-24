// src/api/studentApi.js

import api from './client';

/**
 * 학생 목록 조회 (검색)
 * (v2: DTO 프로젝션 + N+1 해결 쿼리 사용)
 * @param {object} params - { workLocationCode, schoolStage, keyword, page, size }
 * @returns {Promise<Page<StudentSummary>>}
 */
export const listStudents = (params = {}) =>
    api.get('/admin/students', { params }).then(r => r.data);

/**
 * 학생 상세 조회
 * @param {number} id
 * @returns {Promise<StudentSummary>}
 */
export const getStudent = (id) =>
    api.get(`/admin/students/${id}`).then(r => r.data);

/**
 * 학생 생성
 * @param {object} payload - StudentCreateRequest
 *   - 프로젝트 기준: name, schoolStage, workLocationCode, birthdate, gender,
 *     phone, email, postalCode, address, detailAddress, status, schoolId,
 *     gradeLabel, memo, preferSms/Email/Push, pushUserKey 등
 * @returns {Promise<StudentSummary>}
 */
export const createStudent = (payload) =>
    api.post('/admin/students', payload).then(r => r.data);

/**
 * 학생 수정
 * @param {number} id
 * @param {object} payload - StudentUpdateRequest
 *   - 프로젝트 기준: name, schoolStage, workLocationCode, birthdate, gender,
 *     phone, email, postalCode, address, detailAddress, status, schoolId,
 *     gradeLabel, memo, preferSms/Email/Push, pushUserKey 등
 */
export const updateStudent = (id, payload) =>
    api.put(`/admin/students/${id}`, payload).then(r => r.data);

/**
 * 학생 삭제
 * @param {number} id
 */
export const deleteStudent = (id) =>
    api.delete(`/admin/students/${id}`).then(r => r.data);

/**
 * 학생 프로필 사진 업로드
 * @param {number} id
 * @param {File} file
 */
export const uploadStudentPhoto = (id, file) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post(`/admin/students/${id}/photo`, fd).then(r => r.data);
};

/**
 * 학생 메타 조회 (최초/최종 등록자, 일시 등)
 * @param {number} id
 */
export const getStudentMeta = (id) =>
    api.get(`/admin/students/${id}/meta`).then(r => r.data);

/**
 * 관리자 유저 이름 조회 (id → name 매핑)
 * @param {number[]} ids
 * @returns {Promise<Record<number,string>>}
 */
export const lookupAdminUsers = (ids = []) => {
    if (!ids.length) return Promise.resolve({});
    return api.post('/admin/meta/lookup/admin-users', { ids }).then(r => r.data);
};
