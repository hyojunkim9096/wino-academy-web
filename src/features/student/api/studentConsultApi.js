// src/features/student/api/studentConsultApi.js
// ============================================================================
// Student Consult API — 상담 전용
// ============================================================================

import api from '../../../common/api/client.js';

/** 학생별 상담 목록 */
export const listStudentConsults = (studentId, params = {}) =>
    api.get(`/admin/students/${studentId}/consults`, { params }).then(r => r.data);

/** 학생별 상담 생성 (path의 studentId를 서버가 body에 보정해줌) */
export const createConsult = ({ studentId, ...rest }) =>
    api.post(`/admin/students/${studentId}/consults`, rest).then(r => r.data);

/** 학생별 상담 단건 수정 */
export const updateConsult = ({ studentId, consultId, ...rest }) =>
    api.put(`/admin/students/${studentId}/consults/${consultId}`, rest).then(r => r.data);

// (선택) 단건 조회/삭제가 필요하면 사용
export const getConsult = (studentId, consultId) =>
    api.get(`/admin/students/${studentId}/consults/${consultId}`).then(r => r.data);

export const deleteConsult = (studentId, consultId) =>
    api.delete(`/admin/students/${studentId}/consults/${consultId}`).then(r => r.data);