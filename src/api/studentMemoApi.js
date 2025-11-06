// ============================================================================
// Student Memo API — student_memo 전용
// ============================================================================

import api from './client';

export const listStudentMemos = (studentId, params = {}) =>
    api.get(`/admin/students/${studentId}/memos`, { params }).then(r => r.data);

export const addStudentMemo = (studentId, payload = { content: '', pinned: false }) =>
    api.post(`/admin/students/${studentId}/memos`, payload).then(r => r.data);

export const updateStudentMemo = (studentId, memoId, payload = {}) =>
    api.put(`/admin/students/${studentId}/memos/${memoId}`, payload).then(r => r.data);

export const deleteStudentMemo = (studentId, memoId) =>
    api.delete(`/admin/students/${studentId}/memos/${memoId}`).then(r => r.data);