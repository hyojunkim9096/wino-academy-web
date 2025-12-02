// src/common/contexts/CommonCodeContext.jsx
// ============================================================================
// 공통코드 전역 Context
// ----------------------------------------------------------------------------
// - 앱 전체에서 공통코드(SCHOOL_STAGE, WORK_LOCATION, STUDENT_STATUS, ...)
//   를 쉽게 조회하기 위해 사용.
// - v2 동작 방식:
//   1) DB에 등록된 그룹 목록을 /common-codes/groups 에서 "동적으로" 가져와서
//   2) 각 그룹에 대해 /common-codes/{groupCode}/items 를 호출하여
//      codeMap(Map<groupCode, items[]>) 으로 보관.
// - 로그인/로그아웃과 연동:
//   · authApi.setAuthToken / clearAuthState 가 window 에 'auth:token' 이벤트를 발행.
//   · 이 Context 가 이벤트를 구독해서, 로그인 상태에서만 공통코드 요청을 보낸다.
//   → 로그인 안 된 상태(로그인 페이지 등)에서는 403 없이 조용히 빈 맵 유지.
// ============================================================================

import React, {
    createContext,
    useContext,
    useEffect,
    useState,
    useMemo,
    useCallback,
} from 'react';

import { getCodes, listGroups } from '@/features/system/api/commonCodeAdminApi.js';

// Context 생성
const CommonCodeContext = createContext(null);

/**
 * CommonCodeProvider
 * - 앱의 상위(예: AdminApp)에서 감싸서 사용
 * - 내부 상태:
 *   · codeMap     : Map<string, Array<CommonCodeItem>>
 *   · codeLoading : boolean (전역 코드 로딩 중 여부)
 */
export function CommonCodeProvider({ children }) {
    // groupCode → items[] 매핑
    const [codeMap, setCodeMap] = useState(new Map());
    // 전역 공통코드 로딩 상태
    const [codeLoading, setCodeLoading] = useState(true);

    // ------------------------------------------------------------------------
    // 공통코드 전체 로딩 함수
    // - 로그인된 상태(accessToken 존재)에서만 호출한다.
    // - 로그인 전/권한 없음(401/403)일 땐 조용히 codeLoading=false 로만 전환.
    // ------------------------------------------------------------------------
    const loadAllCodes = useCallback(async () => {
        try {
            // 1) 로그인 여부 확인 (accessToken 존재 여부)
            let token = null;
            try {
                token = localStorage.getItem('accessToken');
            } catch {
                token = null;
            }

            if (!token) {
                // 로그인 안 된 상태 → 공통코드 로딩 스킵
                setCodeMap(new Map());
                setCodeLoading(false);
                return;
            }

            setCodeLoading(true);

            // 2) 그룹 목록 조회
            const allGroups = await listGroups();
            const groupCodesToLoad = (allGroups || [])
                .filter((group) => group && group.enabled !== false)
                .map((group) => group.groupCode)
                .filter(Boolean); // null/undefined 제거

            if (groupCodesToLoad.length === 0) {
                console.warn(
                    'CommonCodeProvider: No code groups found (groupCodesToLoad is empty).'
                );
                setCodeMap(new Map());
                setCodeLoading(false);
                return;
            }

            // 3) 각 그룹에 대해 코드 목록 병렬 로딩
            const promises = groupCodesToLoad.map((groupCode) =>
                getCodes(groupCode).then((items) => ({
                    groupCode,
                    items: Array.isArray(items) ? items : [],
                }))
            );

            const results = await Promise.allSettled(promises);

            const newMap = new Map();
            results.forEach((res) => {
                if (res.status === 'fulfilled' && res.value?.groupCode) {
                    newMap.set(res.value.groupCode, res.value.items);
                } else if (res.status === 'rejected') {
                    console.warn(
                        'CommonCodeProvider: Failed to load codes for a group',
                        res.reason
                    );
                }
            });

            setCodeMap(newMap);
            setCodeLoading(false);
        } catch (error) {
            const status = error?.response?.status;
            if (status === 401 || status === 403) {
                // 로그인 안 됐거나, 권한 없음 → 조용히 초기화만 하고 끝
                setCodeMap(new Map());
                setCodeLoading(false);
                return;
            }

            console.error('CommonCodeProvider failed to load', error);
            setCodeLoading(false);
        }
    }, []);

    // ------------------------------------------------------------------------
    // 1) 마운트 시 한 번: 저장된 토큰 있으면 공통코드 로딩
    //    (새로고침 후에도 토큰이 유지되면 자동 로딩)
    // ------------------------------------------------------------------------
    useEffect(() => {
        loadAllCodes();
    }, [loadAllCodes]);

    // ------------------------------------------------------------------------
    // 2) auth:token 이벤트 구독
    //    - authApi.setAuthToken / clearAuthState 에서 이 이벤트를 발생시킴
    //    - 토큰이 생기면(load) → 공통코드 전부 로딩
    //    - 토큰이 사라지면(logout) → codeMap 초기화
    // ------------------------------------------------------------------------
    useEffect(() => {
        const handler = (ev) => {
            const token = ev?.detail?.token || null;
            if (token) {
                // 로그인/토큰 복원 → 공통코드 로딩
                loadAllCodes();
            } else {
                // 로그아웃/토큰 삭제 → 코드 초기화
                setCodeMap(new Map());
                setCodeLoading(false);
            }
        };

        window.addEventListener('auth:token', handler);
        return () => window.removeEventListener('auth:token', handler);
    }, [loadAllCodes]);

    // ------------------------------------------------------------------------
    // groupCode로 해당 코드 목록 가져오기
    //   - 예: getCodesByGroup('SCHOOL_STAGE') → [{code, name, ...}, ...]
    // ------------------------------------------------------------------------
    const getCodesByGroup = useCallback(
        (groupCode) => {
            return codeMap.get(groupCode) || [];
        },
        [codeMap]
    );

    // Provider가 내려줄 값
    const value = {
        codeMap,         // 원본 Map (필요시 전체를 쓰는 화면에서 사용)
        getCodesByGroup, // 그룹별 코드 목록 조회 함수
        codeLoading,     // 전역 공통코드 로딩중 여부
    };

    return (
        <CommonCodeContext.Provider value={value}>
            {children}
        </CommonCodeContext.Provider>
    );
}

/**
 * useCommonCodes
 * - 특정 groupCode 에 대한 코드 목록과 로딩 상태를 반환하는 훅
 *
 * @param {string} groupCode - 예: 'SCHOOL_STAGE', 'WORK_LOCATION'
 * @returns {{codes: Array, codeLoading: boolean}}
 */
export function useCommonCodes(groupCode) {
    const context = useContext(CommonCodeContext);
    if (context === null) {
        throw new Error(
            'useCommonCodes must be used within a CommonCodeProvider'
        );
    }

    // codes 메모이제이션: groupCode 나 context 변경시에만 재계산
    const codes = useMemo(() => {
        return context.getCodesByGroup(groupCode);
    }, [context, groupCode]);

    return { codes, codeLoading: context.codeLoading };
}
