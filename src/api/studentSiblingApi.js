// src/api/studentSiblingApi.js
// ============================================================================
// Student Sibling API — 학생-학생(형제) 연결 전용
// 백엔드: StudentAdminController
// ============================================================================
import api from './client';

/**
 * (GET) 특정 학생에 연결된 형제 목록 조회
 * @param {number} studentId - 기준 학생 ID
 * @returns {Promise<Array>} - SiblingLinkDto[] (상대방 학생 정보)
 */
export const listStudentSiblings = (studentId) =>
    api.get(`/admin/students/${studentId}/siblings`).then(r => r.data);

/**
 * (POST) 두 학생을 형제로 연결
 * @param {number} studentId1 - 기준 학생 ID (현재 학생)
 * @param {number} studentId2 - 연결할 학생 ID (상대방 학생)
 * @param {string} [relationNote] - (선택) 관계 메모
 * @returns {Promise<number>} - 생성된 linkId
 */
export const linkSibling = (studentId1, studentId2, relationNote = null) =>
    api.post(`/admin/students/${studentId1}/siblings`, {
        studentId2,
        relationNote
    }).then(r => r.data);

/**
 * (DELETE) 형제 연결 해제
 * @param {number} linkId - student_sibling.id (연결 ID)
 */
export const unlinkSibling = (linkId) =>
    api.delete(`/admin/students/siblings/${linkId}`).then(r => r.data);