// src/contexts/CommonCodeContext.jsx
import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
// ✅ 1. getCodes와 함께 listGroups를 import합니다.
import { getCodes, listGroups } from '@/api/commonCodeAdminApi';

// ✅ 2. 하드코딩된 ALL_CODES_TO_LOAD 배열을 제거합니다.
// (DB에서 group 목록을 동적으로 불러옵니다)

/**
 * 1. 공통코드 Context 생성
 * 앱 전역에서 codeMap(원본 Map), getCodesByGroup(추출 함수), codeLoading(로딩)을 공유합니다.
 */
const CommonCodeContext = createContext(null);

/**
 * 2. 공통코드 Provider
 * 앱의 최상단을 감싸며, 모든 공통 코드를 "동적으로" 로드합니다.
 */
export function CommonCodeProvider({ children }) {
    //
    const [codeMap, setCodeMap] = useState(new Map());
    const [codeLoading, setCodeLoading] = useState(true);

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                // ✅ 3. 먼저 /api/common-codes/groups API를 호출하여
                //         DB에 등록된 모든 코드 그룹 목록을 가져옵니다.
                const allGroups = await listGroups();
                if (!alive) return;

                // ✅ 4. API로 가져온 그룹 목록에서 groupCode만 추출합니다.
                const groupCodesToLoad = (allGroups || [])
                    .filter(group => group?.enabled !== false) //
                    .map(group => group.groupCode)
                    .filter(Boolean); // null

                if (groupCodesToLoad.length === 0) {
                    console.warn("CommonCodeProvider: No code groups found.");
                    setCodeLoading(false);
                    return;
                }

                // ✅ 5. 동적으로 가져온 groupCodesToLoad 목록을 기반으로
                //         Promise.allSettled를 실행합니다.
                const promises = groupCodesToLoad.map(groupCode =>
                    getCodes(groupCode).then(items => ({ groupCode, items: Array.isArray(items) ? items : [] }))
                );

                const results = await Promise.allSettled(promises);

                if (alive) {
                    const newMap = new Map();
                    results.forEach(res => {
                        if (res.status === 'fulfilled' && res.value?.groupCode) {
                            newMap.set(res.value.groupCode, res.value.items);
                        }
                    });
                    setCodeMap(newMap);
                }
            } catch (error) {
                console.error("CommonCodeProvider failed to load", error);
            } finally {
                if (alive) {
                    setCodeLoading(false);
                }
            }
        })();

        return () => { alive = false; };
    }, []); //

    //
    //
    const getCodesByGroup = useCallback((groupCode) => {
        return codeMap.get(groupCode) || [];
    }, [codeMap]);

    //
    const value = {
        codeMap, // Map
        getCodesByGroup, //
        codeLoading, //
    };

    return (
        <CommonCodeContext.Provider value={value}>
            {children}
        </CommonCodeContext.Provider>
    );
}

/**
 * 3. Consumer (Custom Hook)
 * @param {string} groupCode -
 * @returns {{codes: Array, codeLoading: boolean}}
 */
export function useCommonCodes(groupCode) {
    const context = useContext(CommonCodeContext);
    if (context === null) {
        throw new Error('useCommonCodes must be used within a CommonCodeProvider');
    }

    //
    //
    const codes = useMemo(() => {
        return context.getCodesByGroup(groupCode);
    }, [context, groupCode]);

    return { codes, codeLoading: context.codeLoading };
}