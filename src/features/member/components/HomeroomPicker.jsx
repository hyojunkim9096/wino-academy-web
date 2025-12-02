// src/features/member/components/HomeroomPicker.jsx
// ------------------------------------------------------------
// 담임/담당 선택 인풋(모달 열기)
//  - 표시 라벨: "이름 (관이름)"
//  - [선택] → TeacherPickerModal, [✕] → 값 지우기
//  - 관 코드 키(workLocationCode, work_location, workLocation...) 변형 대응
// ------------------------------------------------------------

import React, { useEffect, useMemo, useState } from 'react';
import TeacherPickerModal from './TeacherPickerModal.jsx';
import { listStaffs } from '@/features/member/api/staffApi.js';
import { getCodes } from '@/features/system/api/commonCodeAdminApi.js';

// 안전 호출 유틸
async function safe(fn) { try { return await fn(); } catch { return null; } }
// 객체 경로 접근 유틸
function getByPath(obj, path) {
    try { return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj); }
    catch { return undefined; }
}
// 여러 후보 키 중 첫 값
function pickFirst(obj, paths) {
    for (const p of paths) {
        const v = getByPath(obj, p);
        if (v != null && String(v).trim() !== '') return String(v).trim();
    }
    return '';
}

/** 교사 객체 → "이름 (관이름)" */
function makeLabel(t, locNameByCode) {
    const name =
        pickFirst(t, ['userName','username','name','fullName','displayName','user_name','full_name','display_name']) ||
        pickFirst(t, ['userId','user_id','email','phone_number','phone']) ||
        `ID ${t?.id}`;

    // 관 코드 키를 최대한 넓게 커버
    const locCode =
        pickFirst(t, ['workLocationCode','work_location_code','workLocation','work_location','workLoc','work_loc']) || '';

    const locName = locCode && locNameByCode?.[locCode] ? locNameByCode[locCode] : (locCode || '-');
    return `${name} (${locName})`;
}

export default function HomeroomPicker({
                                           value = null,
                                           onChange,
                                           workLocation = '',
                                           allowAllLocations = true,         // (전체) 허용 여부
                                           placeholder = '담당 선택',
                                       }) {
    const [open, setOpen] = useState(false);
    const [label, setLabel] = useState('');

    const [locCodes, setLocCodes] = useState([]);
    const locNameByCode = useMemo(
        () => Object.fromEntries((locCodes || []).map((c) => [String(c.code), c.name || ''])),
        [locCodes]
    );

    // 관 코드 → 이름 매핑 로드
    useEffect(() => {
        (async () => {
            const locs = (await safe(() => getCodes('WORK_LOCATION'))) || [];
            setLocCodes(locs);
        })();
    }, []);

    // value가 있을 때(초기/외부 변경) 라벨 표시
    useEffect(() => {
        (async () => {
            if (!value) { setLabel(''); return; }
            const res  = await safe(() => listStaffs({ employeeType: 'TEACHER', page: 0, size: 500 }));
            const list = Array.isArray(res?.content) ? res.content : Array.isArray(res) ? res : [];
            const t    = list.find((r) => String(r.id) === String(value));
            setLabel(t ? makeLabel(t, locNameByCode) : `ID ${value}`);
        })();
    }, [value, locNameByCode]);

    const clear = () => onChange?.(null);

    return (
        <>
            {/* 인풋/버튼 줄 */}
            <div className="aa-row" style={{ gap: '.4rem', alignItems: 'center' }}>
                <div className="aa-input" style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
          <span className="aa-ellipsis" style={{ opacity: label ? 1 : 0.6 }}>
            {label || placeholder}
          </span>
                </div>
                <button type="button" className="aa-btn aa-btn-outline" onClick={() => setOpen(true)}>
                    선택
                </button>
                {!!value && (
                    <button type="button" className="aa-btn aa-btn-ghost" onClick={clear} aria-label="지우기">
                        ✕
                    </button>
                )}
            </div>

            {/* 선택 모달 */}
            {/* JSX 내부 속성 옆에 주석을 넣으면 Babel에서 파싱 에러가 날 수 있으니
          설명 주석은 태그 '밖'에서 달아둡니다. */}
            <TeacherPickerModal
                open={open}
                onClose={() => setOpen(false)}
                /* allowAllLocations=false이면 현재 관으로 초기 필터 고정 */
                initialWorkLocation={allowAllLocations ? '' : (workLocation || '')}
                enableAllLocations={allowAllLocations}   // (전체) 토글 노출 여부
                onPick={(t) => {
                    onChange?.(t?.id ?? null);
                    setLabel(makeLabel(t, locNameByCode)); // 즉시 라벨 업데이트
                    setOpen(false);
                }}
            />
        </>
    );
}