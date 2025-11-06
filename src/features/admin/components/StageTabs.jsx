// src/features/admin/components/StageTabs.jsx
// 학부 탭 (공통코드: SCHOOL_STAGE)
// - getCommonCodes('SCHOOL_STAGE')로 실데이터 로딩
// - value가 없으면 첫 항목 자동 선택
// - .aa-seg 클래스는 admin-system.css 스타일 사용(세그먼트 UI)

import React, { useEffect, useState } from 'react';
import { getCommonCodes } from '@/api/commonCodeAdminApi';
import { mapCodeItems } from '@/utils/commonCodeMap';

export default function StageTabs({ value, onChange }) {
    const [items, setItems] = useState([]);

    useEffect(() => {
        (async () => {
            try {
                const res = await getCommonCodes('SCHOOL_STAGE');
                const mapped = mapCodeItems(res);
                setItems(mapped);
                // 최초 진입 시 자동 선택
                if (!value && mapped[0]) onChange?.(mapped[0].code);
            } catch (e) {
                console.error(e);
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // 최초 1회만 로드

    return (
        <div className="aa-seg" role="tablist" aria-label="School Stage">
            {items.map(s => (
                <button
                    key={s.code}
                    className={value === s.code ? 'active' : ''}
                    onClick={() => onChange?.(s.code)}
                    role="tab"
                    aria-selected={value === s.code}
                    title={s.name}
                >
                    {s.name}
                </button>
            ))}
        </div>
    );
}
