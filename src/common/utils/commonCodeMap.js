// src/common/utils/commonCodeMap.js
// 공통코드 매핑 유틸 (WINO 공용)
// - DB 스키마: id, group_code, code, name, sort_order, enabled, meta_json, created_at, updated_at
// - 프론트에서 쓰기 좋은 형태 { code, name, raw } 로 변환
// - 사용/정렬 컬럼명이 서비스마다 다를 수 있어( enabled/useYn, sort_order/sortOrder )
//   모두 허용하는 탄력 매핑으로 구현

/** 다양한 형태의 truthy(1, '1', true, 'Y' 등)를 boolean으로 */
const toBool = (v) =>
    v === true || v === 1 || v === '1' || v === 'Y' || v === 'y';

/**
 * 공통코드 배열을 화면에서 쓰기 좋은 형태로 매핑
 * @param {Array<Object>} items - /common-codes 응답 배열
 * @returns {{code:string, name:string, raw:any}[]}
 */
export const mapCodeItems = (items = []) => {
    return (items || [])
        // 사용 여부 필터: enabled 우선, 없으면 useYn, 둘 다 없으면 전체 노출
        .filter((it) => {
            if (it.enabled !== undefined && it.enabled !== null) return toBool(it.enabled);
            if (it.useYn !== undefined && it.useYn !== null)     return toBool(it.useYn);
            return true;
        })
        // 정렬: sort_order 우선, 없으면 sortOrder, 없으면 0
        .sort((a, b) => {
            const sa = Number(a.sort_order ?? a.sortOrder ?? 0);
            const sb = Number(b.sort_order ?? b.sortOrder ?? 0);
            return sa - sb;
        })
        // 표준 필드로 매핑
        .map((it) => ({
            code: String(it.code ?? it.value ?? it.key ?? ''),
            // 우리 스키마는 name 컬럼 사용. 혹시 호환 필요시 label/title/desc도 백업으로 허용
            name: String(it.name ?? it.label ?? it.title ?? it.desc ?? it.code ?? ''),
            raw: it, // 원본 유지(디버깅/부가정보 필요 시)
        }));
};
