// src/features/admin/pages/SchoolImportPage.jsx
/**
 * Admin > 학교 데이터 업로드/동기화 (알리미 기반)
 * - 전국 동기화(E/M/H 선택)
 * - 단건 범위(시도/시군구/학부) 동기화
 * - CSV 업로드
 * ⛔ 지오코딩(카카오) 기능은 전면 제거되었습니다.
 *
 * ⚠️ CSS 임포트 규칙:
 *   - '@/styles/admin-system.css' → '@/styles/admin-school.css'
 */
import React, { useState, useMemo } from 'react';
import {
    // ✅ Alimi sync APIs (유지)
    syncSchoolInfo,
    syncSchoolInfoAll,
    // ✅ CSV 업로드 (유지)
    importSchoolsCsv,
} from '@/api/schoolAdminApi';

// ✅ CSS 임포트 — 순서 중요!
import '@/styles/admin-system.css';
import '@/styles/admin-school.css';

export default function SchoolImportPage() {
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState('');

    // 동기화 옵션 (요청 타임아웃)
    const [syncTimeoutMs, setSyncTimeoutMs] = useState(10 * 60 * 1000); // 기본 10분

    // 단건 범위 동기화 입력
    const [sidoCode, setSidoCode] = useState(''); // 예: '11'
    const [sggCode, setSggCode] = useState('');   // 예: '11110'
    const [stageOne, setStageOne] = useState('E'); // E/M/H

    /** 간단 유효성 */
    const isValidSido = useMemo(() => /^\d{2}$/.test(sidoCode), [sidoCode]);
    const isValidSgg  = useMemo(() => /^\d{5}$/.test(sggCode), [sggCode]);
    const isValidStage = useMemo(() => ['E','M','H'].includes(stageOne), [stageOne]);

    /** 에러 메시지 가공 */
    const friendlyError = (e) => {
        const st = e?.response?.status;
        const payload = e?.response?.data;
        if (st === 401 || st === 403) return '권한이 없습니다. 관리자 계정으로 로그인 후 다시 시도하세요.';
        if (payload?.message) return payload.message;
        if (typeof payload === 'object') return JSON.stringify(payload, null, 2);
        return e?.message || '오류가 발생했습니다.';
    };

    /** 공통 실행 래퍼: 완료 결과를 JSON 문자열로 예쁘게 표시 */
    const run = async (fn) => {
        try {
            setBusy(true);
            setMsg('');
            const res = await fn();
            setMsg(typeof res === 'string' ? res : JSON.stringify(res, null, 2)); // ← pretty
        } catch (e) {
            setMsg(friendlyError(e));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="aa-container-xl aa-page school-page">
            {/* 상단 툴바 */}
            <div className="aa-toolbar">
                <div className="aa-title">학교 데이터 업로드/동기화</div>
            </div>

            <div className="aa-panel aa-panel--card space-y-4">
                {/* 동기화 설정 */}
                <div className="aa-row items-center gap-2">
                    <label className="aa-label" style={{ minWidth: 110 }}>동기화 타임아웃</label>
                    <input
                        type="number"
                        min={60_000}
                        max={60 * 60 * 1000}
                        step={30_000}
                        className="aa-input"
                        style={{ width: 160 }}
                        value={syncTimeoutMs}
                        onChange={(e) => {
                            const v = Number(e.target.value);
                            const c = Number.isFinite(v) ? Math.max(60_000, Math.min(60 * 60 * 1000, v)) : 600_000;
                            setSyncTimeoutMs(c);
                        }}
                        disabled={busy}
                        title="동기화 요청 타임아웃(ms)"
                    />
                </div>

                {/* ✅ 전국 동기화(알리미) */}
                <div className="aa-row flex-wrap gap-2">
                    <button
                        className="aa-btn aa-btn-primary"
                        disabled={busy}
                        onClick={() => run(() => syncSchoolInfoAll(['E','M','H'], syncTimeoutMs))}
                        title="전국(초/중/고) 일괄"
                    >
                        전국 동기화(전체: 초/중/고)
                    </button>

                    <button
                        className="aa-btn"
                        disabled={busy}
                        onClick={() => run(() => syncSchoolInfoAll(['E'], syncTimeoutMs))}
                        title="전국(초등) 일괄"
                    >
                        전국 동기화(초등)
                    </button>

                    <button
                        className="aa-btn"
                        disabled={busy}
                        onClick={() => run(() => syncSchoolInfoAll(['M'], syncTimeoutMs))}
                        title="전국(중등) 일괄"
                    >
                        전국 동기화(중등)
                    </button>

                    <button
                        className="aa-btn"
                        disabled={busy}
                        onClick={() => run(() => syncSchoolInfoAll(['H'], syncTimeoutMs))}
                        title="전국(고등) 일괄"
                    >
                        전국 동기화(고등)
                    </button>
                </div>

                {/* ✅ 단건 범위 동기화(시도+시군구+학부) */}
                <div className="space-y-2">
                    <div className="aa-title sm">단건 범위 동기화</div>
                    <div className="aa-row items-center gap-2">
                        <label className="aa-label" style={{ minWidth: 110 }}>시도코드</label>
                        <input
                            className="aa-input"
                            style={{ width: 140 }}
                            placeholder="예) 11"
                            value={sidoCode}
                            onChange={(e) => setSidoCode(e.target.value.replace(/[^\d]/g, '').slice(0, 2))}
                            disabled={busy}
                        />

                        <label className="aa-label">시군구코드</label>
                        <input
                            className="aa-input"
                            style={{ width: 160 }}
                            placeholder="예) 11110"
                            value={sggCode}
                            onChange={(e) => setSggCode(e.target.value.replace(/[^\d]/g, '').slice(0, 5))}
                            disabled={busy}
                        />

                        <label className="aa-label">학부</label>
                        <select
                            className="aa-select"
                            value={stageOne}
                            onChange={(e) => setStageOne(e.target.value)}
                            disabled={busy}
                        >
                            <option value="E">초</option>
                            <option value="M">중</option>
                            <option value="H">고</option>
                        </select>

                        <button
                            className="aa-btn aa-btn-accent"
                            disabled={busy || !isValidSido || !isValidSgg || !isValidStage}
                            onClick={() => run(() => syncSchoolInfo({ sidoCode, sggCode, stage: stageOne }, syncTimeoutMs))}
                            title="해당 범위(시도+시군구+학부)만 동기화"
                        >
                            단건 범위 동기화 실행
                        </button>
                    </div>
                    <div className="aa-help">
                        * 코드 레퍼런스: 운영이 제공한 <b>시도시군구코드.xlsx</b> 기준을 사용하세요.
                    </div>
                </div>

                {/* ⛳ CSV 업로드 */}
                <div className="aa-field">
                    <label className="aa-label">
                        CSV 업로드 (externalCode,name,stage,postalCode,address,detailAddress,homepageUrl,phone...)
                    </label>
                    <input
                        type="file"
                        accept=".csv"
                        onChange={async (e) => {
                            const f = e.target.files?.[0];
                            if (!f) return;
                            await run(() => importSchoolsCsv(f));
                            e.target.value = '';
                        }}
                        disabled={busy}
                    />
                </div>

                {/* 결과/로그 */}
                {msg && <pre className="aa-pre" style={{ whiteSpace: 'pre-wrap' }}>{msg}</pre>}

                {/* 안내 */}
                <div className="aa-help">
                    관리자 권한이 필요합니다. 401/403 발생 시 토큰/권한을 확인하세요.
                </div>
            </div>
        </div>
    );
}