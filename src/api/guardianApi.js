// src/api/guardianApi.js
// ============================================================================
// Guardian API 클라이언트
// - DDL: guardian, student_guardian_link
// - 백엔드 경로(제안):
//   GET    /admin/guardians                     목록(필터: keyword, page,size)
//   POST   /admin/guardians                     신규
//   GET    /admin/guardians/{id}                상세
//   PUT    /admin/guardians/{id}                수정
//   GET    /admin/guardians/{id}/students       연결된 학생 목록(스냅샷 아님, 실시간)
//   ✅ [신규] POST /admin/guardians/{id}/link-account   계정 생성 및 연결
//   ✅ [신규] POST /admin/guardians/{id}/unlink-account 계정 연결 해제
// ============================================================================

import api from './client';

export const listGuardians = (params = {}) =>
    api.get('/admin/guardians', { params }).then(r => r.data);

export const createGuardian = (payload) =>
    api.post('/admin/guardians', payload).then(r => r.data);

export const getGuardian = (id) =>
    api.get(`/admin/guardians/${id}`).then(r => r.data);

export const updateGuardian = (id, payload) =>
    api.put(`/admin/guardians/${id}`, payload).then(r => r.data);

export const listGuardianStudents = (guardianId) =>
    api.get(`/admin/guardians/${guardianId}/students`).then(r => r.data);

/**
 * ✅ [신규] 보호자 프로필에 계정 생성 및 연결
 * @param {number} guardianId
 * @param {object} payload - { loginId, password }
 */
export const linkGuardianAccount = (guardianId, payload) =>
    api.post(`/admin/guardians/${guardianId}/link-account`, payload).then(r => r.data);

/**
 * ✅ [신규] 보호자 프로필과 계정 연결 해제
 * @param {number} guardianId
 */
export const unlinkGuardianAccount = (guardianId) =>
    api.post(`/admin/guardians/${guardianId}/unlink-account`).then(r => r.data);