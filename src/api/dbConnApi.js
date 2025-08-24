// src/api/dbConnApi.js
// DB 연결 프로필 API 클라이언트 (백엔드: /api/admin/db-connections)
//
// 변경사항
// - 모든 경로를 /admin/db-connections 로 통일
// - 목록: 전체(listAll) 또는 env별(listByEnv)
// - 삭제 이력: /admin/db-connections/deleted?env=dev|prod|all
// - yml 스니펫: /admin/db-connections/{id}/yml (text/plain)
// - 활성화:   /admin/db-connections/{id}/activate  (204 No Content)
// - 비활성화: /admin/db-connections/{id}/deactivate (204 No Content)
//
// 정책(2025-08):
// - prod 활성화 시 → dev 전체 비활성화
// - dev  활성화 시 → prod 전체 비활성화
// - 동일 env(dev/prod) 내에서는 여러 개 활성 허용

import api from './client';

// 전체 목록(한 화면 통합)
export const listDbProfilesAll = async () =>
    (await api.get('/admin/db-connections')).data;

// env별 목록(필요 시 사용: 'dev' | 'prod')
export const listDbProfilesByEnv = async (env) =>
    (await api.get('/admin/db-connections', { params: { env } })).data;

// 생성/수정/삭제/활성/비활성
export const createDbProfile = async (payload) =>
    (await api.post('/admin/db-connections', payload)).data;

export const updateDbProfile = async (id, payload) =>
    (await api.put(`/admin/db-connections/${id}`, payload)).data;

export const deleteDbProfile = async (id) =>
    (await api.delete(`/admin/db-connections/${id}`)).data;

// 204(No Content) 기대 — .data는 undefined일 수 있음
export const activateDbProfile = async (id) =>
    (await api.post(`/admin/db-connections/${id}/activate`)).data;

// 204(No Content) 기대 — .data는 undefined일 수 있음
export const deactivateDbProfile = async (id) =>
    (await api.post(`/admin/db-connections/${id}/deactivate`)).data;

// yml 스니펫(plain text)
export const ymlSnippet = async (id) =>
    (await api.get(`/admin/db-connections/${id}/yml`, { responseType: 'text' })).data;

// 삭제 이력 (env별: dev|prod|all)
export const listDbProfilesDeleted = async (env) =>
    (await api.get('/admin/db-connections/deleted', { params: { env } })).data;
