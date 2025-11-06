// src/api/consultApi.js
// ============================================================================
// Consult(상담) API 클라이언트
// - DDL: consult_note, consult_note_guardian
// - 백엔드 경로(제안):
//   GET    /admin/consults                           검색(필터: studentId, dateFrom,dateTo, writerId, page,size)
//   GET    /admin/consults/{id}                      상세
//   POST   /admin/consults                           생성
//   PUT    /admin/consults/{id}                      수정
//   POST   /admin/consults/{id}/guardians            상담 참석자(보호자) 추가
//   DELETE /admin/consults/guardians/{cngId}         참석자 제거
// ============================================================================

import api from './client';

export const searchConsults = (params = {}) =>
    api.get('/admin/consults', { params }).then(r => r.data);

export const getConsult = (id) =>
    api.get(`/admin/consults/${id}`).then(r => r.data);

export const createConsult = (payload) =>
    api.post('/admin/consults', payload).then(r => r.data);

export const updateConsult = (id, payload) =>
    api.put(`/admin/consults/${id}`, payload).then(r => r.data);

export const addConsultGuardian = (consultId, payload) =>
    api.post(`/admin/consults/${consultId}/guardians`, payload).then(r => r.data);

export const removeConsultGuardian = (cngId) =>
    api.delete(`/admin/consults/guardians/${cngId}`).then(r => r.data);