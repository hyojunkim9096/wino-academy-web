// src/api/guardianApi.js
// ============================================================================
// Guardian API 클라이언트
// - DDL: guardian, student_guardian_link
// - 백엔드 경로(현재/제안):
//   GET    /admin/guardians                        목록(필터: keyword, page,size)
//   POST   /admin/guardians                        신규
//   GET    /admin/guardians/{id}                   상세
//   PUT    /admin/guardians/{id}                   수정
//   GET    /admin/guardians/{id}/students          연결된 학생 목록(스냅샷 아님, 실시간)
//   ✅ [신규] POST   /admin/guardians/{id}/link-account    계정 생성 및 연결
//   ✅ [신규] POST   /admin/guardians/{id}/unlink-account  계정 연결 해제
//   ✅ [신규] DELETE /admin/guardians/{id}                 보호자 삭제 (제안)
//   ✅ [신규] POST   /admin/guardians/{id}/sync-family     형제/가족 동기화 (제안)
// ============================================================================

import api from './client';

// -----------------------------------------------------------------------------
// 목록 / 단건 / 수정
// -----------------------------------------------------------------------------

/** 보호자 목록 조회 */
export const listGuardians = (params = {}) =>
    api.get('/admin/guardians', { params }).then(r => r.data);

/** 보호자 신규 등록 */
export const createGuardian = (payload) =>
    api.post('/admin/guardians', payload).then(r => r.data);

/** 보호자 상세 조회 */
export const getGuardian = (id) =>
    api.get(`/admin/guardians/${id}`).then(r => r.data);

/** 보호자 정보 수정 */
export const updateGuardian = (id, payload) =>
    api.put(`/admin/guardians/${id}`, payload).then(r => r.data);

// -----------------------------------------------------------------------------
// 연결된 학생 조회
// -----------------------------------------------------------------------------

/**
 * 보호자와 연결된 학생 목록
 * - 스냅샷이 아니라 student_guardian_link 기준 실시간 조회용
 */
export const listGuardianStudents = (guardianId) =>
    api.get(`/admin/guardians/${guardianId}/students`).then(r => r.data);

// -----------------------------------------------------------------------------
// 계정 연결/해제
// -----------------------------------------------------------------------------

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

// -----------------------------------------------------------------------------
// [신규] 삭제 / 형제·가족 동기화
// -----------------------------------------------------------------------------

/**
 * ✅ [신규] 보호자 삭제 (제안)
 * - 백엔드에서 DELETE /admin/guardians/{id} 구현 필요
 * - student_guardian_link 제약(참조 중) 있을 경우 400 등으로 방어
 */
export const deleteGuardian = (guardianId) =>
    api.delete(`/admin/guardians/${guardianId}`).then(r => r.data);

/**
 * ✅ [신규] 형제/가족 동기화 (제안)
 * - 이 보호자와 연결된 학생들을 기준으로 sibling/family 그룹 재계산
 * - 백엔드: POST /admin/guardians/{id}/sync-family 에 로직 구현 필요
 */
export const syncGuardianFamily = (guardianId) =>
    api.post(`/admin/guardians/${guardianId}/sync-family`).then(r => r.data);
