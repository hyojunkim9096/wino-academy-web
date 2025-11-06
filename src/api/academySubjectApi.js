// ============================================================================
// src/api/academySubjectApi.js
// ----------------------------------------------------------------------------
// 관리자 과목 관리 API 클라이언트(axios 기반)
// - 백엔드 /api/admin/subjects 엔드포인트와 1:1 매핑
// - ✅ 추가: reorderSubjectsByParent (Depth1/Children 배치 정렬 저장)
// ============================================================================

import api from './client';

/** 트리: 부모 기준 하위 목록 조회 (parentId=null → 루트) */
export const listSubjectsByParent = (schoolStage, parentId = null) =>
    api.get('/admin/subjects/nodes', { params: { schoolStage, parentId } })
        .then(r => r.data);

/** 트리 노드 업서트(생성/수정) - id 없으면 생성, 있으면 수정 */
export const upsertSubjectNode = (payload, id = null) =>
    api.post('/admin/subjects/nodes', payload, { params: id ? { id } : {} })
        .then(r => r.data);

/** 리프 과목 평가 항목 조회 */
export const listSubjectItems = (subjectId) =>
    api.get(`/admin/subjects/${subjectId}/items`)
        .then(r => r.data);

/** 과목 항목(SDL/DT) 전체 저장(덮어쓰기) */
export const saveSubjectItems = (subjectId, items) =>
    api.post(`/admin/subjects/${subjectId}/items`, items)
        .then(r => r.data);

/** ✅ 배치 정렬 저장(Depth1/Children 공용) */
export const reorderSubjectsByParent = (schoolStage, parentId, ids /* 배열 */) =>
    api.post('/admin/subjects/nodes/reorder', { schoolStage, parentId, ids })
        .then(r => r.data);

/** 최신 코멘트 세트 헤더 조회(밴드 제외) */
export const latestCommentSet = (subjectId, params) =>
    api.get(`/admin/subjects/${subjectId}/comments/latest`, { params })
        .then(r => r.data ?? null);

/** 최신 코멘트 세트(밴드 포함) 조회(full) */
export const latestCommentSetFull = (subjectId, params) =>
    api.get(`/admin/subjects/${subjectId}/comments/latest/full`, { params })
        .then(r => r.data ?? null);

/** 코멘트 세트 + 밴드 일괄 업서트 */
export const upsertCommentSet = (subjectId, payload) =>
    api.post(`/admin/subjects/${subjectId}/comments`, payload)
        .then(r => r.data);