// src/features/student/api/studentAccountApi.js
// ============================================================================
// Student Account API — 계정/비밀번호 전용
// ============================================================================

import api from '../../../common/api/client.js';

function nullIfEmpty(v) {
    return (v === '' || v === undefined) ? null : v;
}

/** 비밀번호 변경 */
export const changeStudentPassword = (id, newPassword) =>
    api.post(`/admin/students/${id}/password`, { password: newPassword }).then(r => r.data);

/** 계정 upsert
 *  - loginId/password가 ''(빈문자)로 들어오면 null로 치환
 *  - 둘 다 null이면 서버 호출 생략(Early return)
 */
export const upsertStudentAccount = (studentId, { loginId = null, password = null } = {}) => {
    const body = {
        loginId: nullIfEmpty(loginId),
        password: nullIfEmpty(password),
    };
    if (body.loginId == null && body.password == null) {
        // 변경 사항 없음 → 서버 호출 생략
        return Promise.resolve({ skipped: true });
    }
    return api.post(`/admin/students/${studentId}/account`, body).then(r => r.data);
};
export { upsertStudentAccount as setStudentAccount };