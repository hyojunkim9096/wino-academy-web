// src/features/system/api/commonCodeAdminApi.js
// ============================================================================
// 공통코드(관리) API — axios client(baseURL='/api') 사용
// ----------------------------------------------------------------------------
// - /api/common-codes/groups               : 공통코드 그룹 목록 조회
// - /api/common-codes/groups (POST/PUT/DELETE)
// - /api/common-codes/{groupCode}/items    : 해당 그룹의 코드 목록 조회
// - /api/common-codes/{groupCode}/items... : 코드 생성/수정/삭제
// ============================================================================

import api from '../../../common/api/client.js';

/**
 * 특정 그룹의 코드 목록 조회 (예: 'WORK_LOCATION')
 * - 주로 선택박스에 사용할 때 직접 호출
 * - CommonCodeProvider 내부에서도 getCodes 로 재사용
 */
export async function listCommonCodeItems(groupCode) {
    const { data } = await api.get(
        `/common-codes/${encodeURIComponent(groupCode)}/items`
    );
    return Array.isArray(data) ? data : [];
}

// ===== 관리 CRUD 유틸 =====

/** 공통코드 그룹 목록 조회 */
export const listGroups = async () =>
    (await api.get('/common-codes/groups')).data;

/** 공통코드 그룹 생성 */
export const createGroup = async (payload) =>
    (await api.post('/common-codes/groups', payload)).data;

/** 공통코드 그룹 수정 */
export const updateGroup = async (groupCode, payload) =>
    (
        await api.put(
            `/common-codes/groups/${encodeURIComponent(groupCode)}`,
            payload
        )
    ).data;

/** 공통코드 그룹 삭제 */
export const deleteGroup = async (groupCode) =>
    (
        await api.delete(
            `/common-codes/groups/${encodeURIComponent(groupCode)}`
        )
    ).data;

/** 특정 그룹 코드들 조회 */
export const getCodes = async (groupCode) =>
    (
        await api.get(
            `/common-codes/${encodeURIComponent(groupCode)}/items`
        )
    ).data;

// 별칭
export const getCommonCodes = getCodes;

/** 코드 생성 */
export const createCode = async (groupCode, payload) =>
    (
        await api.post(
            `/common-codes/${encodeURIComponent(groupCode)}/items`,
            payload
        )
    ).data;

/** 코드 수정 */
export const updateCode = async (groupCode, code, payload) =>
    (
        await api.put(
            `/common-codes/${encodeURIComponent(groupCode)}/items/${encodeURIComponent(
                code
            )}`,
            payload
        )
    ).data;

/** 코드 삭제 */
export const deleteCode = async (groupCode, code) =>
    (
        await api.delete(
            `/common-codes/${encodeURIComponent(groupCode)}/items/${encodeURIComponent(
                code
            )}`
        )
    ).data;
