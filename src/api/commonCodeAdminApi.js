// src/api/commonCodeAdminApi.js
// 공통코드(관리) API — axios client(baseURL='/api') 사용
// 예: GET /api/common-codes/WORK_LOCATION/items

import api from './client';

/** 특정 그룹의 코드 목록 조회 (예: 'WORK_LOCATION') */
export async function listCommonCodeItems(groupCode) {
    const { data } = await api.get(`/common-codes/${encodeURIComponent(groupCode)}/items`);
    return Array.isArray(data) ? data : [];
}

// ===== 관리 CRUD 유틸 =====
export const listGroups = async () =>
    (await api.get('/common-codes/groups')).data;

export const createGroup = async (payload) =>
    (await api.post('/common-codes/groups', payload)).data;

export const updateGroup = async (groupCode, payload) =>
    (await api.put(`/common-codes/groups/${encodeURIComponent(groupCode)}`, payload)).data;

// ⚠️ 경로 보정: /common-codes/groups/{groupCode}
export const deleteGroup = async (groupCode) =>
    (await api.delete(`/common-codes/groups/${encodeURIComponent(groupCode)}`)).data;

export const getCodes = async (groupCode) =>
    (await api.get(`/common-codes/${encodeURIComponent(groupCode)}/items`)).data;

export const getCommonCodes = getCodes;

export const createCode = async (groupCode, payload) =>
    (await api.post(`/common-codes/${encodeURIComponent(groupCode)}/items`, payload)).data;

export const updateCode = async (groupCode, code, payload) =>
    (await api.put(`/common-codes/${encodeURIComponent(groupCode)}/items/${encodeURIComponent(code)}`, payload)).data;

export const deleteCode = async (groupCode, code) =>
    (await api.delete(`/common-codes/${encodeURIComponent(groupCode)}/items/${encodeURIComponent(code)}`)).data;