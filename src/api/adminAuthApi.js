// src/api/adminAuthApi.js
// ✅ 변경 요약
// - 역할(ROLE) 목록은 "공통코드" API(getCodes('ROLE'))로 관리하므로
//   여기서는 역할↔메뉴 "매핑" API만 둔다 (문자열 roleCode 기반).
// - baseURL은 api 클라이언트에서 '/api/v1' 로 잡혀있어야 함.
//   아니라면 경로를 '/api/admin/auth/...' 로 바꿔주세요.

import api from './client';

/** 역할코드(공통코드 ROLE) ↔ 메뉴 매핑 조회 */
export const getRoleMenusByCode = async (roleCode) =>
    (await api.get(`/admin/auth/roles/${encodeURIComponent(roleCode)}/menus`)).data;

/** 역할코드(공통코드 ROLE) ↔ 메뉴 매핑 저장(전체 교체 방식) */
export const updateRoleMenusByCode = async (roleCode, menuIds) =>
    (await api.put(`/admin/auth/roles/${encodeURIComponent(roleCode)}/menus`, { menuIds })).data;

// ⚠️ 아래와 같은 id 기반 역할 CRUD는 더 이상 사용하지 않습니다.
// export const listRoles   = async () => (await api.get('/admin/auth/roles')).data;
// export const createRole  = async (body) => (await api.post('/admin/auth/roles', body)).data;
// export const updateRole  = async (id, body) => (await api.put(`/admin/auth/roles/${id}`, body)).data;
// export const deleteRole  = async (id) => (await api.delete(`/admin/auth/roles/${id}`)).data;
// export const getRoleMenus    = async (id) => (await api.get(`/admin/auth/roles/${id}/menus`)).data;
// export const updateRoleMenus = async (id, menuIds) => (await api.put(`/admin/auth/roles/${id}/menus`, { menuIds })).data;
