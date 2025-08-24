// src/api/menuApi.js
// ✅ 변경 요약
// - 관리용(전체 트리)과 사용자용(내 권한 기준 트리)을 구분
// - 사이드바/동적 라우팅은 getMyMenus 사용 (서버에서 권한 적용 후 반환)

import api from './client';

/** (관리자용) 전체 트리 — 메뉴 관리 화면에서 사용 */
export const getMenuTree = async (audience) =>
    (await api.get('/admin/menus/tree', { params: { audience } })).data;

/** (관리자용) 평면 목록 — 필요 시 사용 */
export const getMenuFlat = async (audience) =>
    (await api.get('/admin/menus/flat', { params: { audience } })).data;

/** (공통) 생성/수정/삭제/재정렬 — 메뉴 관리 화면에서 사용 */
export const createMenu = async (payload) =>
    (await api.post('/admin/menus', payload)).data;

export const updateMenu = async (id, payload) =>
    (await api.put(`/admin/menus/${id}`, payload)).data;

export const deleteMenu = async (id) =>
    (await api.delete(`/admin/menus/${id}`)).data;

export const reorderMenu = async (audience, parentId, orderedIds) =>
    (await api.patch('/admin/menus/reorder', { audience, parentId, orderedIds })).data;

/** (사용자용) 내 권한 기준 트리 — 사이드바/동적 라우팅에서 사용 */
export const getMyMenus = async (audience = 'ADMIN') =>
    (await api.get('/admin/menus/my', { params: { audience } })).data;
