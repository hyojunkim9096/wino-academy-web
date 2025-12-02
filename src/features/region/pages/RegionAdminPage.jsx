// src/features/region/pages/RegionAdminPage.jsx
/**
 * Admin > 지역 관리
 * - upsert/replace + (선택) sourceUrl override
 * - ✅ 누락 N건 동기화 / 누락 전량 일괄(batch) 실행
 * - 관리자 권한 필요(ROLE_SYSTEM_ADMIN). regionApi가 Bearer 자동 주입.
 *
 * ⚠️ CSS 임포트 규칙:
 *   - '@/styles/admin-system.css' → '@/styles/admin-school.css'
 */
import React, { useMemo, useState } from 'react';
import {
    syncRegions,
    syncRegionsMissing,
    syncRegionsMissingAll,
} from '@/features/region/api/regionApi.js';

// ✅ CSS 임포트 — 순서 중요!
import '@/features/system/styles/admin-system.css';
import '@/features/school/styles/admin-school.css';

export default function RegionAdminPage() {
    const [busy, setBusy] = useState(false);

    // ===== 전체 동기화(upsert/replace) =====
    const [mode, setMode] = useState('upsert');          // 'upsert' | 'replace'
    const [overrideUrl, setOverrideUrl] = useState('');   // 선택 입력
    const [result, setResult] = useState(null);           // { total, inserted, updated, disabled } / 기타 응답
    const [error, setError] = useState('');
    const [elapsed, setElapsed] = useState(0);            // ms

    // ===== 누락 N건 동기화 =====
    const [limit, setLimit] = useState(100);              // 1~500 권장

    // ===== 누락 전량 일괄(batch) =====
    const [chunkSize, setChunkSize] = useState(100);      // 1~500
    const [prefixesText, setPrefixesText] = useState(''); // 예: "11,26,27" (비우면 시/도 2자리 자동)
    const [hardStop, setHardStop] = useState(900);        // 60~3600 (초)
    const [timeoutAllMs, setTimeoutAllMs] = useState(30 * 60 * 1000); // 기본 30분
    const [log, setLog] = useState('');                   // 진행 로그(배치별)

    // 안전한 override URL (빈 문자열 → undefined)
    const safeOverride = useMemo(() => {
        const v = (overrideUrl || '').trim();
        return v.length === 0 ? undefined : v;
    }, [overrideUrl]);

    // http 스킴이면 경고
    const warnInsecure = useMemo(
        () => safeOverride && safeOverride.startsWith('http://'),
        [safeOverride]
    );

    // ───────────────── 유틸 ─────────────────
    const clamp = (n, min, max, fallback) =>
        Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;

    const fmtElapsed = (ms) => {
        if (!ms || ms < 1000) return `${ms ?? 0} ms`;
        const s = (ms / 1000).toFixed(1);
        return `${s}s (${ms.toLocaleString()} ms)`;
    };

    // 공통 에러 메시지 변환
    const friendlyError = (e) => {
        // fetch 계열 Abort(타임아웃)
        if (e?.name === 'AbortError') return '요청이 시간 초과로 중단되었습니다.';
        // regionApi.parseResponse가 넣어주는 status 우선
        const st = e?.status ?? e?.response?.status;
        const data = e?.response?.data;
        if (st === 401 || st === 403) {
            return '권한이 없습니다. 관리자 계정으로 로그인 후 다시 시도하세요.';
        }
        if (data && typeof data === 'object') {
            const msg = data.message || data.detail || data.error;
            if (msg) return msg;
        }
        return e?.message || '요청 처리 중 오류가 발생했습니다.';
    };

    // ===== 액션: 전체 동기화 =====
    const runSync = async () => {
        if (mode === 'replace') {
            const ok = window.confirm(
                '정말 전체 교체(REPLACE) 하시겠습니까?\n기존 데이터가 초기화됩니다.'
            );
            if (!ok) return;
        }
        setBusy(true);
        setResult(null);
        setError('');
        setElapsed(0);
        setLog('');

        const t0 = performance.now();
        try {
            const res = await syncRegions(mode, safeOverride /* tokenOverride 생략 */);
            setResult(res ?? null);
        } catch (e) {
            setError(friendlyError(e));
        } finally {
            setElapsed(Math.round(performance.now() - t0));
            setBusy(false);
        }
    };

    // ===== 액션: 누락 상위 N건 =====
    const runMissingTopN = async () => {
        setBusy(true);
        setResult(null);
        setError('');
        setElapsed(0);
        setLog('');

        const t0 = performance.now();
        try {
            const n = clamp(Number(limit), 1, 500, 100);
            const res = await syncRegionsMissing(n /* tokenOverride 생략 */);
            setResult(res ?? null); // { processed }
        } catch (e) {
            setError(friendlyError(e));
        } finally {
            setElapsed(Math.round(performance.now() - t0));
            setBusy(false);
        }
    };

    // ===== 액션: 누락 전량 일괄 =====
    const runMissingAll = async () => {
        setBusy(true);
        setResult(null);
        setError('');
        setElapsed(0);
        setLog('지역 전체 배치 실행을 시작합니다...\n');

        const t0 = performance.now();
        try {
            const cs = clamp(Number(chunkSize), 1, 500, 100);
            const hs = clamp(Number(hardStop), 60, 3600, 900);
            const prefixes = (prefixesText || '').trim();

            const res = await syncRegionsMissingAll({
                chunkSize: cs,
                hardStopSeconds: hs,
                prefixes: prefixes ? prefixes : undefined, // 비우면 시/도 2자리 자동
                timeoutMs: clamp(Number(timeoutAllMs), 60_000, 60 * 60 * 1000, 30 * 60 * 1000),
                fallbackLoop: true,
                onBatch: ({ batch, processed }) => {
                    setLog((prev) => `${prev}배치 ${batch} 처리: ${processed}건\n`);
                },
            });

            setResult(res ?? null); // { processedTotal, batches, perBatch, elapsedMs, prefixesUsed, [fallback] }
            setLog((prev) => `${prev}\n=== 최종 리포트 ===\n${JSON.stringify(res, null, 2)}\n`);
        } catch (e) {
            setError(friendlyError(e));
        } finally {
            setElapsed(Math.round(performance.now() - t0));
            setBusy(false);
        }
    };

    return (
        <div className="aa-container-xl aa-page school-page">
            <div className="aa-toolbar">
                <div className="aa-title">지역 관리</div>
            </div>

            <div className="aa-panel aa-panel--card space-y-4">
                {/* ===== 전체 동기화 섹션 ===== */}
                <div className="aa-section">
                    <div className="aa-section__title">전체 동기화</div>

                    {/* 모드 선택 */}
                    <div className="aa-row items-center gap-4">
                        <label className="aa-label">모드</label>

                        <label className="aa-check">
                            <input
                                type="radio"
                                name="region-sync-mode"
                                value="upsert"
                                checked={mode === 'upsert'}
                                onChange={() => setMode('upsert')}
                                disabled={busy}
                            />
                            <span>업서트(권장)</span>
                        </label>

                        <label className="aa-check">
                            <input
                                type="radio"
                                name="region-sync-mode"
                                value="replace"
                                checked={mode === 'replace'}
                                onChange={() => setMode('replace')}
                                disabled={busy}
                            />
                            <span>전체 교체</span>
                        </label>
                    </div>

                    {/* (선택) 소스 URL 오버라이드 */}
                    <div className="aa-field">
                        <label className="aa-label">Source URL Override (선택)</label>
                        <input
                            type="url"
                            className="aa-input"
                            placeholder="미입력 시 백엔드 설정(app.region.sync.api-url) 사용"
                            value={overrideUrl}
                            onChange={(e) => setOverrideUrl(e.target.value)}
                            disabled={busy}
                        />
                        <div className="aa-help">
                            예) https://apis.data.go.kr/1741000/StanReginCd/getStanReginCdList
                            {warnInsecure && (
                                <span style={{ color: '#c00', marginLeft: 8 }}>
                  (경고: http는 게이트웨이/브라우저에서 차단될 수 있습니다)
                </span>
                            )}
                        </div>
                    </div>

                    {/* 실행 버튼 */}
                    <div className="aa-row">
                        <button className="aa-btn aa-btn-primary" disabled={busy} onClick={runSync}>
                            {busy ? '동기화 중…' : '동기화 실행'}
                        </button>
                        {elapsed > 0 && (
                            <div className="aa-help" style={{ marginLeft: 12 }}>
                                경과시간: {fmtElapsed(elapsed)}
                            </div>
                        )}
                    </div>
                </div>

                <hr className="aa-divider" />

                {/* ===== 누락 N건 섹션 ===== */}
                <div className="aa-section">
                    <div className="aa-section__title">누락 N건 동기화</div>

                    <div className="aa-row items-center gap-2">
                        <label className="aa-label" style={{ minWidth: 120 }}>
                            limit
                        </label>
                        <input
                            type="number"
                            min={1}
                            max={500}
                            step={1}
                            className="aa-input"
                            style={{ width: 120 }}
                            value={limit}
                            onChange={(e) => {
                                setLimit(clamp(Number(e.target.value), 1, 500, 100));
                            }}
                            disabled={busy}
                            title="상위 N건 처리(1~500)"
                        />
                        <button className="aa-btn" disabled={busy} onClick={runMissingTopN}>
                            누락 {limit}건 동기화
                        </button>
                    </div>
                </div>

                <hr className="aa-divider" />

                {/* ===== 누락 전량 일괄 섹션 ===== */}
                <div className="aa-section">
                    <div className="aa-section__title">누락 전량 일괄(한 번에)</div>

                    <div className="aa-row items-center gap-3">
                        <div className="aa-inline-field">
                            <span className="aa-inline-label">chunk</span>
                            <input
                                type="number"
                                min={1}
                                max={500}
                                step={1}
                                className="aa-input"
                                style={{ width: 90 }}
                                value={chunkSize}
                                onChange={(e) => {
                                    setChunkSize(clamp(Number(e.target.value), 1, 500, 100));
                                }}
                                disabled={busy}
                                title="한 번에 처리할 건수(1~500)"
                            />
                        </div>

                        <div className="aa-inline-field" style={{ minWidth: 300 }}>
                            <span className="aa-inline-label">prefixes</span>
                            <input
                                type="text"
                                className="aa-input"
                                placeholder='예: "11,26,27" (비우면 시/도 2자리 자동)'
                                value={prefixesText}
                                onChange={(e) => setPrefixesText(e.target.value)}
                                disabled={busy}
                            />
                        </div>

                        <div className="aa-inline-field">
                            <span className="aa-inline-label">hardStop(s)</span>
                            <input
                                type="number"
                                min={60}
                                max={3600}
                                step={30}
                                className="aa-input"
                                style={{ width: 110 }}
                                value={hardStop}
                                onChange={(e) => {
                                    setHardStop(clamp(Number(e.target.value), 60, 3600, 900));
                                }}
                                disabled={busy}
                                title="안전 중단 시간(초)"
                            />
                        </div>

                        <div className="aa-inline-field">
                            <span className="aa-inline-label">timeout(ms)</span>
                            <input
                                type="number"
                                min={60_000}
                                max={60 * 60 * 1000}
                                step={30_000}
                                className="aa-input"
                                style={{ width: 140 }}
                                value={timeoutAllMs}
                                onChange={(e) => {
                                    setTimeoutAllMs(
                                        clamp(Number(e.target.value), 60_000, 60 * 60 * 1000, 1_800_000)
                                    );
                                }}
                                disabled={busy}
                                title="요청 타임아웃(ms)"
                            />
                        </div>

                        <button
                            className="aa-btn aa-btn-accent"
                            disabled={busy}
                            onClick={runMissingAll}
                            title="누락분이 0이 될 때까지 chunkSize 단위로 반복 처리"
                        >
                            전체 동기화(배치)
                        </button>
                    </div>
                </div>

                {/* ===== 결과/로그 ===== */}
                {(result || error || log) && (
                    <pre
                        className="aa-pre"
                        style={{ maxHeight: 360, overflow: 'auto', whiteSpace: 'pre-wrap' }}
                    >
            {error ? error : (log || JSON.stringify(result, null, 2))}
          </pre>
                )}

                {/* ===== 안내 ===== */}
                <div className="aa-help">
                    • 전체 동기화는 소스 전량을 기준으로 <b>업서트</b> 또는 <b>리플레이스</b>합니다.
                    <br />
                    • 누락 동기화는 <b>변경/누락 후보</b>만 처리하며, <b>chunk</b> 단위 반복으로 타임아웃/쿼터를 피합니다.
                    <br />
                    • <code>prefixes</code>를 비우면 시/도(2자리)로 자동 분할됩니다. 프록시가 있다면 <code>read timeout</code>을 충분히 늘려주세요(권장 30분).
                </div>
            </div>
        </div>
    );
}