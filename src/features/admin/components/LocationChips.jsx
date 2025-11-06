// src/features/admin/components/LocationChips.jsx
// 지점 선택 칩 (공통코드: WORK_LOCATION)
// - 공통코드 API에서 WORK_LOCATION 목록을 가져와 칩 형태로 렌더링
// - 최초 로드 시 value가 비어 있으면 첫 항목을 자동 선택
// - 접근성: role="tablist"/"tab" 사용, aria-selected 표시

import React, { useEffect, useState } from 'react';
import { getCommonCodes } from '@/api/commonCodeAdminApi';
import { mapCodeItems } from '@/utils/commonCodeMap';

export default function LocationChips({ value, onChange }) {
    const [items, setItems] = useState([]);

    useEffect(() => {
        (async () => {
            try {
                const res = await getCommonCodes('WORK_LOCATION'); // [{ code, name, useYn, sortOrder, ... }]
                const mapped = mapCodeItems(res);                  // [{ code, name, raw }]
                setItems(mapped);

                // 현재 value가 없거나, 목록에 존재하지 않는 경우 → 첫 항목으로 보정
                if ((!value || !mapped.some(m => m.code === value)) && mapped[0]) {
                    onChange?.(mapped[0].code);
                }
            } catch (e) {
                console.error('[LocationChips] WORK_LOCATION fetch failed:', e);
            }
        })();
        // value/onChange 의존성 포함: 외부에서 value를 지울 때도 보정 로직이 1회 더 작동
    }, [value, onChange]);

    return (
        <div className="aa-seg" role="tablist" aria-label="Work Location">
            {items.map(w => (
                <button
                    key={w.code}
                    type="button"
                    className={value === w.code ? 'active' : ''}
                    onClick={() => onChange?.(w.code)}
                    role="tab"
                    aria-selected={value === w.code}
                >
                    {w.name}
                </button>
            ))}
        </div>
    );
}
