// src/features/student/api/consultApi.js
// ============================================================================
// Consult(상담) API 클라이언트
// - DDL: consult_note, consult_note_guardian
// - 백엔드 경로(제안):
//   GET    /admin/consults                           검색(필터: studentId, dateFrom,dateTo, writerId, page,size)
//   GET    /admin/consults/{id}                      상세
//   POST   /admin/consults                           생성
//   PUT    /admin/consults/{id}                      수정
//   POST   /admin/consults/{id}/approve              ✅ [신규] 승인
//   POST   /admin/consults/{id}/guardians            상담 참석자(보호자) 추가
//   DELETE /admin/consults/guardians/{cngId}         참석자 제거
// ============================================================================

import api from '../../../common/api/client.js';

/**
 * 상담 목록 검색 (권한은 백엔드에서 자동 적용)
 * @param {object} params - { studentId, studentName, writerId, writerName, from, to, page, size }
 */
export const searchConsults = (params = {}) =>
    api.get('/admin/consults', { params }).then(r => r.data);

/**
 * 상담 단건 조회
 * @param {number} id - consult_note.id
 */
export const getConsult = (id) =>
    api.get(`/admin/consults/${id}`).then(r => r.data);

/**
 * 상담 생성
 * @param {object} payload - ConsultCreateRequest
 */
export const createConsult = (payload) =>
    api.post('/admin/consults', payload).then(r => r.data);

/**
 * 상담 수정
 * @param {number} id - consult_note.id
 * @param {object} payload - ConsultUpdateRequest
 */
export const updateConsult = (id, payload) =>
    api.put(`/admin/consults/${id}`, payload).then(r => r.data);

/**
 * ✅ [신규] 상담 승인
 * @param {number} id - consult_note.id
 */
export const approveConsult = (id) =>
    api.post(`/admin/consults/${id}/approve`).then(r => r.data);


// ... (보호자 참석자 관련 API는 생략 없이 동일) ...
export const addConsultGuardian = (consultId, payload) =>
    api.post(`/admin/consults/${consultId}/guardians`, payload).then(r => r.data);

export const removeConsultGuardian = (cngId) =>
    api.delete(`/admin/consults/guardians/${cngId}`).then(r => r.data);