// ============================================================================
// Student Family API — 학생-보호자(가족) 링크 전용
// ============================================================================

import api from './client';

export const listStudentFamilies = (studentId) =>
    api.get(`/admin/students/${studentId}/guardians`).then(r => r.data);

export const addStudentFamily = (studentId, payload) =>
    api.post(`/admin/students/${studentId}/guardians`, payload).then(r => r.data);

export const removeStudentFamily = (studentId, linkId) =>
    api.delete(`/admin/students/${studentId}/guardians/${linkId}`).then(r => r.data);

// 호환 별칭
export const listStudentGuardians = listStudentFamilies;
export const addStudentGuardian   = addStudentFamily;
export const removeStudentGuardian= removeStudentFamily;