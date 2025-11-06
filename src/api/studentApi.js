// ============================================================================
// Student API (관리자 전용) — 학생 CRUD + 메타 유틸만 유지
//  - 계정/비번/가족/메모/상담/마스터검색은 각각 전용 파일로 분리
// ============================================================================

import api from './client';

/** 내부 유틸: 학생 payload 필드 보정 */
function normalizeStudentPayload(payload = {}) {
    const { grade, gradeLabel, ...rest } = payload || {};
    const out = { ...rest };
    // gradeLabel 우선, 없으면 grade → gradeLabel로 전달
    const gl = gradeLabel != null && gradeLabel !== '' ? String(gradeLabel).trim() : undefined;
    const g  = grade      != null && grade      !== '' ? String(grade).trim()      : undefined;
    if (gl) out.gradeLabel = gl;
    else if (g) out.gradeLabel = g;

    // '' → undefined 치환
    Object.keys(out).forEach((k) => { if (out[k] === '') out[k] = undefined; });
    return out;
}

/** 학생 목록 */
export const listStudents = (params = {}) => {
    const {
        schoolStage, workLocationCode, stage, workLocation, keyword,
        page = 0, size = 30, ...rest
    } = params || {};

    // page/size 보정(+ size 상한 200)
    const p = Number.isFinite(+page) ? +page : 0;
    const s = Number.isFinite(+size) ? Math.min(Math.max(+size, 1), 200) : 30;

    const qp = {
        stage: (stage ?? schoolStage) || undefined,
        workLocation: (workLocation ?? workLocationCode) || undefined,
        keyword: keyword || undefined,
        page: p, size: s, ...rest,
    };
    return api.get('/admin/students', { params: qp }).then(r => r.data);
};

/** 학생 신규 */
export const createStudent = (payload = {}) =>
    api.post('/admin/students', normalizeStudentPayload(payload)).then(r => r.data);

/** 학생 상세(gradeLabel → grade 미러) */
export const getStudent = (id) =>
    api.get(`/admin/students/${id}`).then(r => {
        const d = r.data || {};
        return { ...d, grade: d.gradeLabel ?? d.grade };
    });

/** 학생 수정 */
export const updateStudent = (id, payload = {}) =>
    api.put(`/admin/students/${id}`, normalizeStudentPayload(payload)).then(r => r.data);

/** 학생 삭제 */
export const deleteStudent = (id) =>
    api.delete(`/admin/students/${id}`).then(r => r.data);

/** 프로필 사진 업로드
 * - Content-Type은 브라우저가 자동으로 설정(boundary 포함)
 */
export const uploadStudentPhoto = (id, file) => {
    const form = new FormData();
    form.append('file', file);
    return api.post(`/admin/students/${id}/photo`, form).then(r => r.data);
};

/* ============================================================================
   히스토리/메타 유틸
   -------------------------------------------------------------------------- */
export async function getStudentMeta(studentId) {
    try {
        const meta = await api.get(`/admin/students/${studentId}/meta`).then(r => r.data);
        if (meta) return {
            createdAt: meta.createdAt ?? null,
            createdBy: meta.createdBy ?? null,
            updatedAt: meta.updatedAt ?? null,
            updatedBy: meta.updatedBy ?? null,
        };
    } catch {}
    // 메타 엔드포인트 없을 때 히스토리로 유도
    try {
        const [firstPage, lastPage] = await Promise.all([
            api.get(`/admin/students/${studentId}/history`, { params: { page: 0, size: 1, sort: 'version,asc' } }).then(r => r.data).catch(()=>null),
            api.get(`/admin/students/${studentId}/history`, { params: { page: 0, size: 1, sort: 'version,desc' } }).then(r => r.data).catch(()=>null),
        ]);
        const first = firstPage?.content?.[0];
        const last  = lastPage?.content?.[0];
        return {
            createdAt: first?.eventAt ?? null,
            createdBy: first?.eventBy ?? null,
            updatedAt: last?.eventAt ?? null,
            updatedBy: last?.eventBy ?? null,
        };
    } catch {
        return { createdAt: null, createdBy: null, updatedAt: null, updatedBy: null };
    }
}

/** 관리자 이름 매핑 */
export async function lookupAdminUsers(ids = []) {
    const uniq = [...new Set(ids.filter(v => v != null))];
    if (uniq.length === 0) return {};
    try {
        const res = await api.get('/admin/users/lookup', { params: { ids: uniq.join(',') } });
        const rows = Array.isArray(res?.data) ? res.data : (res?.data?.content || []);
        const map = {};
        (rows || []).forEach(u => { map[u.id] = u.userName || u.name || u.loginId || `#${u.id}`; });
        return map;
    } catch {}
    const out = {};
    for (const id of uniq) {
        try {
            const u = await api.get(`/admin/users/${id}`).then(r => r.data);
            if (u) out[id] = u.userName || u.name || u.loginId || `#${id}`;
        } catch { out[id] = `#${id}`; }
    }
    return out;
}