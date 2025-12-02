// src/features/student/api/enrollApi.js
// ============================================================================
// Enrollment(반 배정) API 클라이언트
// - DDL: student_class_enrollment
// - 백엔드 경로(제안):
//   GET    /admin/enrollments                      검색(필터: studentId|classId|status, page,size)
//   POST   /admin/students/{id}/enrollments        학생에 배정 추가 { classId, enrolledAt, memo }
//   PUT    /admin/enrollments/{id}                 수정(메모/기간 종료 등)
//   DELETE /admin/enrollments/{id}                 삭제(필요 시)
// ============================================================================

import api from '../../../common/api/client.js';

export const searchEnrollments = (params = {}) =>
    api.get('/admin/enrollments', { params }).then(r => r.data);

export const addEnrollmentToStudent = (studentId, payload) =>
    api.post(`/admin/students/${studentId}/enrollments`, payload).then(r => r.data);

export const updateEnrollment = (enrollId, payload) =>
    api.put(`/admin/enrollments/${enrollId}`, payload).then(r => r.data);

export const deleteEnrollment = (enrollId) =>
    api.delete(`/admin/enrollments/${enrollId}`).then(r => r.data);