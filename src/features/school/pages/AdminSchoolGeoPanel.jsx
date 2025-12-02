// src/features/school/pages/AdminSchoolGeoPanel.jsx
/**
 * 관리자용 좌표/법정동코드 수동 편집 패널
 * ⛔ 지오코딩(주소→좌표/코드) 기능은 제거되었습니다.
 * - 학교 ID로 로드 → admCode/lat/lng 수동 입력 → 저장
 */
import React, { useState } from 'react';
import { getSchool, patchSchool } from '@/features/school/api/schoolAdminApi.js';

export default function AdminSchoolGeoPanel({ initialId, onUpdated }) {
    const [busy, setBusy] = useState(false);
    const [school, setSchool] = useState(null);
    const [schoolId, setSchoolId] = useState(initialId ?? '');
    const [lat, setLat] = useState('');      // 위도
    const [lng, setLng] = useState('');      // 경도
    const [admCode, setAdmCode] = useState(''); // 10자리

    const run = async (fn) => {
        setBusy(true);
        try { await fn(); } finally { setBusy(false); }
    };

    const loadSchool = async (id) => {
        const s = await getSchool(id); // 관리자 전용 엔드포인트
        setSchool(s);
        setAdmCode(s?.admCode ?? '');
        setLat(s?.lat != null ? String(s.lat) : '');
        setLng(s?.lng != null ? String(s.lng) : '');
        onUpdated?.(s);
    };

    // ── 유틸 ─────────────────────────────────
    const toFixed7 = (v) => {
        const n = Number(v);
        if (!Number.isFinite(n)) return '';
        return n.toFixed(7); // 문자열
    };
    const isValidLat = (v) => Number.isFinite(Number(v)) && Math.abs(Number(v)) <= 90;
    const isValidLng = (v) => Number.isFinite(Number(v)) && Math.abs(Number(v)) <= 180;
    const isValidAdm = (v) => /^\d{10}$/.test(v || '');

    const canSave = !!(school?.id) && (
        (admCode ? isValidAdm(admCode) : true) &&
        (lat === '' || isValidLat(lat)) &&
        (lng === '' || isValidLng(lng))
    );

    const save = async () => {
        if (!school?.id) return;
        const payload = {
            admCode: admCode || null,
            lat: lat === '' ? null : Number(toFixed7(lat)),
            lng: lng === '' ? null : Number(toFixed7(lng)),
        };
        await patchSchool(school.id, payload);
        const s = await getSchool(school.id);
        setSchool(s);
        setAdmCode(s?.admCode ?? '');
        setLat(s?.lat != null ? String(s.lat) : '');
        setLng(s?.lng != null ? String(s.lng) : '');
        onUpdated?.(s);
    };

    return (
        <div className="aa-panel aa-panel--card space-y-3">
            <div className="aa-title sm">좌표/법정동코드 수동 편집</div>

            {/* 0) 현재 학교 상태 보드 */}
            {school && (
                <div className="text-xs text-gray-600 grid sm:grid-cols-2 gap-x-4 gap-y-1 border rounded p-2 bg-gray-50">
                    <div><b>학교명</b> : {school.name}</div>
                    <div><b>학부</b> : {school.stage}</div>
                    <div><b>도로명</b> : {school.address || '-'}</div>
                    <div><b>지번(옛 주소)</b> : {school.detailAddress || '-'}</div>
                    <div><b>법정동코드</b> : {school.admCode || '-'}</div>
                    <div><b>좌표</b> : {school.lat ?? '-'}, {school.lng ?? '-'}</div>
                </div>
            )}

            {/* 1) 대상 학교 불러오기 */}
            <div className="aa-row gap-2 items-center">
                <label className="aa-label" style={{ minWidth: 110 }}>학교 ID</label>
                <input
                    className="aa-input"
                    style={{ width: 160 }}
                    value={schoolId}
                    onChange={(e) => setSchoolId(e.target.value.replace(/[^\d]/g, ''))}
                    onKeyDown={(e) => { if (e.key === 'Enter' && schoolId) run(() => loadSchool(Number(schoolId))); }}
                    placeholder="숫자"
                />
                <button
                    className="aa-btn"
                    disabled={busy || !schoolId}
                    onClick={() => run(() => loadSchool(Number(schoolId)))}
                >
                    불러오기
                </button>
                {school && <div className="text-sm text-gray-600"> {school.name} </div>}
            </div>

            {/* 2) 좌표/코드 편집 */}
            <div className="grid grid-cols-3 gap-2">
                <label className="aa-label col-span-1">법정동코드</label>
                <input
                    className={`aa-input col-span-2 ${admCode && !isValidAdm(admCode) ? 'aa-input--error' : ''}`}
                    value={admCode}
                    onChange={(e) => setAdmCode(e.target.value.replace(/[^\d]/g, '').slice(0, 10))}
                    placeholder="10자리 숫자"
                />

                <label className="aa-label col-span-1">위도(lat)</label>
                <input
                    type="number"
                    step={0.0000001}
                    className={`aa-input col-span-2 ${lat && !isValidLat(lat) ? 'aa-input--error' : ''}`}
                    value={lat}
                    onChange={(e) => setLat(e.target.value)}
                    onBlur={() => { if (isValidLat(lat)) setLat(toFixed7(lat)); }}
                    placeholder="예) 37.5662953"
                />

                <label className="aa-label col-span-1">경도(lng)</label>
                <input
                    type="number"
                    step={0.0000001}
                    className={`aa-input col-span-2 ${lng && !isValidLng(lng) ? 'aa-input--error' : ''}`}
                    value={lng}
                    onChange={(e) => setLng(e.target.value)}
                    onBlur={() => { if (isValidLng(lng)) setLng(toFixed7(lng)); }}
                    placeholder="예) 126.9779451"
                />
            </div>

            {/* 3) 저장 */}
            <div className="flex gap-2">
                <button
                    className="aa-btn aa-btn-primary"
                    disabled={busy || !canSave}
                    onClick={() => run(save)}
                    title={!canSave ? '유효한 값인지 확인하세요' : undefined}
                >
                    저장
                </button>
            </div>

            <p className="text-xs text-gray-500">
                · 지오코딩 기능은 제거되었습니다. 좌표/법정동코드는 필요 시 수동으로 입력/관리하세요.
            </p>
        </div>
    );
}
