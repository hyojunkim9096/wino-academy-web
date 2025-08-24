// src/api/commonCodeAdminApi.js
// 공통코드(관리) API 모듈
// - 백엔드 엔드포인트: /common-codes/**  (axios baseURL '/api' 기준 → 실제 호출은 '/api/common-codes/**')
// - 페이지에서 과거 이름(getCommonCodes)도 쓸 수 있게 alias 제공

import api from './client';

// ===== 그룹 =====

// 그룹 목록
export const listGroups = async () =>
    (await api.get('/common-codes/groups')).data;

// 그룹 생성
export const createGroup = async (payload) =>
    (await api.post('/common-codes/groups', payload)).data;

// 그룹 수정 (groupCode 기준)
export const updateGroup = async (groupCode, payload) =>
    (await api.put(`/common-codes/groups/${encodeURIComponent(groupCode)}`, payload)).data;

// 그룹 삭제 (groupCode 기준)
export const deleteGroup = async (groupCode) =>
    (await api.delete(`/common-codes/groups/${encodeURIComponent(groupCode)}`)).data;


// ===== 코드(아이템) =====

// 코드 목록 (groupCode 기준)
export const getCodes = async (groupCode) =>
    (await api.get(`/common-codes/${encodeURIComponent(groupCode)}/items`)).data;

// 과거 import 호환: getCommonCodes
export const getCommonCodes = getCodes;

// 코드 생성
export const createCode = async (groupCode, payload) =>
    (await api.post(`/common-codes/${encodeURIComponent(groupCode)}/items`, payload)).data;

// 코드 수정 (code를 path 파라미터로 사용)
export const updateCode = async (groupCode, code, payload) =>
    (await api.put(`/common-codes/${encodeURIComponent(groupCode)}/items/${encodeURIComponent(code)}`, payload)).data;

// 코드 삭제
export const deleteCode = async (groupCode, code) =>
    (await api.delete(`/common-codes/${encodeURIComponent(groupCode)}/items/${encodeURIComponent(code)}`)).data;
