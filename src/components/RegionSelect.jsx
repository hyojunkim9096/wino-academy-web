/**
 * RegionSelect — 시/도 → 시/군/구 → (구) → 읍/면/동 (적응형 4단 + 폴백 로직)
 * - 기본: /api/common/regions?depth=1, /api/common/regions?parent=CODE
 * - 폴백: /api/common/regions/prefix?code=PREFIX  (도→시→구 잘못 연결된 DB 호환)
 *
 * 변경점(내성 보강)
 * - 각 비동기 로딩 구간에 try/catch 추가 → 백엔드 5xx/네트워크 오류 시에도 UI 일관성 유지
 * - 실패 시 해당 뎁스 목록을 안전하게 [] 로 세팅(“덮어쓰기 레이스”는 버전 가드로 방지)
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { listRegionsByDepth, listRegionsByParent, listRegionsByPrefix } from '@/api/regionApi';

export default function RegionSelect({
                                         value,
                                         onChange,
                                         disabled = false,
                                         className = '',
                                         selectClassName = 'aa-select',
                                         showReset = false,
                                     }) {
    const [d1, setD1] = useState([]);
    const [d2, setD2] = useState([]);
    const [d3, setD3] = useState([]);
    const [d4, setD4] = useState([]);
    const [loading, setLoading] = useState({ d1: false, d2: false, d3: false, d4: false });
    const [usedFallback, setUsedFallback] = useState(false); // ✅ 3뎁스 폴백 여부 표시(디버깅/UX)
    const v = value || {};

    // ── 요청 버전 관리(늦게 도착한 응답이 최신 상태를 덮어쓰지 않도록) ─────────
    const ver = useRef({ d1: 0, d2: 0, d3: 0, d4: 0 });
    const bump = (key) => (ver.current[key] = ver.current[key] + 1);

    // 라벨 유틸: "경기도 수원시 권선구" → "수원시 권선구"
    const lastTwoTokens = (path) => {
        const toks = (path || '').trim().split(/\s+/);
        return toks.length >= 2 ? toks.slice(-2).join(' ') : (path || '');
    };
    // 2뎁스 라벨: '구'가 도의 직계로 잘못 붙은 경우 혼동 방지용으로 "시 구" 표기
    const labelD2 = (r, parentName) => {
        if (!r) return '';
        if (/구$/.test(r.name)) {
            if (r.pathName) return lastTwoTokens(r.pathName);
            if (parentName) return `${parentName} ${r.name}`;
        }
        return r.name;
    };

    const asCode = (c) => (c == null ? '' : String(c));
    const sameCode = (a, b) => asCode(a) === asCode(b);

    // 1단계(시/도)
    useEffect(() => {
        let mounted = true;
        const my = bump('d1');
        (async () => {
            setLoading((s) => ({ ...s, d1: true }));
            try {
                const items = await listRegionsByDepth(1);
                if (mounted && my === ver.current.d1) setD1(items || []);
            } catch (e) {
                console.warn('[RegionSelect] depth1 load failed:', e);
                if (mounted && my === ver.current.d1) setD1([]);
            } finally {
                if (mounted && my === ver.current.d1) setLoading((s) => ({ ...s, d1: false }));
            }
        })();
        return () => {
            mounted = false;
        };
    }, []);

    // 2단계(시/군/구) — parent=시/도코드
    useEffect(() => {
        let mounted = true;
        const my = bump('d2');

        if (v.depth1?.code) {
            (async () => {
                setLoading((s) => ({ ...s, d2: true }));
                try {
                    const items = await listRegionsByParent(asCode(v.depth1.code));
                    if (mounted && my === ver.current.d2) {
                        setD2(items || []);
                        setD3([]);
                        setD4([]);
                    }
                } catch (e) {
                    console.warn('[RegionSelect] depth2 load failed:', e);
                    if (mounted && my === ver.current.d2) {
                        setD2([]);
                        setD3([]);
                        setD4([]);
                    }
                } finally {
                    if (mounted && my === ver.current.d2) setLoading((s) => ({ ...s, d2: false }));
                }
            })();
        } else {
            setD2([]);
            setD3([]);
            setD4([]);
            setUsedFallback(false);
        }
        return () => {
            mounted = false;
        };
    }, [asCode(v.depth1?.code)]); // 코드 문자열 기준으로 변화 감지

    // 3단계 — parent=시/군/구 코드 (여기서 폴백을 적용)
    useEffect(() => {
        let mounted = true;
        const my = bump('d3');
        (async () => {
            setLoading((s) => ({ ...s, d3: true }));
            setUsedFallback(false);
            try {
                if (!v.depth2?.code) {
                    if (mounted && my === ver.current.d3) {
                        setD3([]);
                        setD4([]);
                    }
                    return;
                }

                // 기본 시도: 정상 parent → 자식
                let children = await listRegionsByParent(asCode(v.depth2.code));

                if (!children || children.length === 0) {
                    // ✅ 폴백: 선택된 2뎁스가 '시/군'인데 DB가 '구'를 도 밑으로 갖고 있는 케이스
                    const isCityLike = /시$|군$/.test(v.depth2?.name || '');
                    if (isCityLike) {
                        const prefix = asCode(v.depth2.code).slice(0, 5);
                        const pref = await listRegionsByPrefix(prefix);
                        const guList = (pref || []).filter(
                            (x) => x.depth === 2 && /구$/.test(x.name) && asCode(x.code).startsWith(prefix),
                        );
                        if (guList.length > 0) {
                            children = guList;
                            if (mounted && my === ver.current.d3) setUsedFallback(true);
                        }
                    }
                }

                if (mounted && my === ver.current.d3) {
                    setD3(children || []);
                    setD4([]);
                }
            } catch (e) {
                console.warn('[RegionSelect] depth3 load failed:', e);
                if (mounted && my === ver.current.d3) {
                    setD3([]);
                    setD4([]);
                    setUsedFallback(false);
                }
            } finally {
                if (mounted && my === ver.current.d3) setLoading((s) => ({ ...s, d3: false }));
            }
        })();
        return () => {
            mounted = false;
        };
    }, [asCode(v.depth2?.code), v.depth2?.name]);

    // 4단계 — parent=3뎁스(구) 코드
    useEffect(() => {
        let mounted = true;
        const my = bump('d4');
        (async () => {
            setLoading((s) => ({ ...s, d4: true }));
            try {
                if (!v.depth3?.code) {
                    if (mounted && my === ver.current.d4) setD4([]);
                    return;
                }
                const children = await listRegionsByParent(asCode(v.depth3.code));
                if (mounted && my === ver.current.d4) setD4(children || []);
            } catch (e) {
                console.warn('[RegionSelect] depth4 load failed:', e);
                if (mounted && my === ver.current.d4) setD4([]);
            } finally {
                if (mounted && my === ver.current.d4) setLoading((s) => ({ ...s, d4: false }));
            }
        })();
        return () => {
            mounted = false;
        };
    }, [asCode(v.depth3?.code)]);

    const update = (part) => onChange?.({ ...v, ...part });

    const reset = () => {
        update({ depth1: null, depth2: null, depth3: null, depth4: null, code: '', label: '' });
        setD2([]);
        setD3([]);
        setD4([]);
        setUsedFallback(false);
    };

    const safeValue = (list, code) => (list.some((r) => sameCode(r.code, code)) ? asCode(code) : '');

    // 4단 필요 여부: 3단 선택했고 자식이 있으면 표시
    const hasLevel4 = useMemo(() => !!(v.depth3?.code && d4.length > 0), [asCode(v.depth3?.code), d4.length]);

    // 레이아웃 컬럼 수
    const gridCols = hasLevel4 ? '1fr 1fr 1fr 1fr' : '1fr 1fr 1fr';

    // 부모(시/도) 이름 — 2뎁스 라벨 보조용
    const parentNameD1 = useMemo(() => v.depth1?.name || '', [v.depth1?.name]);

    return (
        <div className={`aa-grid ${className}`} style={{ gridTemplateColumns: gridCols, gap: '.5rem' }}>
            {/* 시/도 (depth1) */}
            <select
                className={selectClassName}
                disabled={disabled}
                value={safeValue(d1, v.depth1?.code || '')}
                onChange={(e) => {
                    const code = e.target.value;
                    const item = d1.find((r) => sameCode(r.code, code));
                    update({
                        depth1: item || null,
                        depth2: null,
                        depth3: null,
                        depth4: null,
                        code: item?.code || '',
                        label: item?.name || '',
                    });
                }}
            >
                <option value="">{loading.d1 ? '로딩중…' : '시/도'}</option>
                {d1.map((r) => (
                    <option key={asCode(r.code)} value={asCode(r.code)}>
                        {r.name}
                    </option>
                ))}
            </select>

            {/* 시/군/구 (depth2) — 라벨 보강: '수원시 권선구'처럼 표기 */}
            <select
                className={selectClassName}
                disabled={disabled || !v.depth1?.code}
                value={safeValue(d2, v.depth2?.code || '')}
                onChange={(e) => {
                    const code = e.target.value;
                    const item = d2.find((r) => sameCode(r.code, code));
                    update({
                        depth2: item || null,
                        depth3: null,
                        depth4: null,
                        code: item?.code || v.depth1?.code || '',
                        label: item?.name || v.depth1?.name || '',
                    });
                }}
            >
                <option value="">{loading.d2 ? '로딩중…' : '시/군/구'}</option>
                {d2.map((r) => (
                    <option key={asCode(r.code)} value={asCode(r.code)}>
                        {labelD2(r, parentNameD1)}
                    </option>
                ))}
            </select>

            {/* 3단: '구' 또는 '읍/면/동' (depth3) — 폴백 시 구 목록이 내려옴 */}
            <select
                className={selectClassName}
                disabled={disabled || !v.depth2?.code}
                value={safeValue(d3, v.depth3?.code || '')}
                onChange={(e) => {
                    const code = e.target.value;
                    const item = d3.find((r) => sameCode(r.code, code));
                    update({
                        depth3: item || null,
                        depth4: null,
                        code: item?.code || v.depth2?.code || v.depth1?.code || '',
                        label: item?.name || v.depth2?.name || v.depth1?.name || '',
                    });
                }}
            >
                <option value="">{loading.d3 ? '로딩중…' : usedFallback ? '구 (폴백)' : '구 / 읍·면·동'}</option>
                {d3.map((r) => (
                    <option key={asCode(r.code)} value={asCode(r.code)}>
                        {r.name}
                    </option>
                ))}
            </select>

            {/* 4단: 읍/면/동 */}
            {hasLevel4 && (
                <select
                    className={selectClassName}
                    disabled={disabled}
                    value={safeValue(d4, v.depth4?.code || '')}
                    onChange={(e) => {
                        const code = e.target.value;
                        const item = d4.find((r) => sameCode(r.code, code));
                        update({
                            depth4: item || null,
                            code: item?.code || v.depth3?.code || '',
                            label: item?.name || v.depth3?.name || '',
                        });
                    }}
                >
                    <option value="">{loading.d4 ? '로딩중…' : '읍·면·동'}</option>
                    {d4.map((r) => (
                        <option key={asCode(r.code)} value={asCode(r.code)}>
                            {r.name}
                        </option>
                    ))}
                </select>
            )}

            {showReset && (
                <div className={hasLevel4 ? 'col-span-4' : 'col-span-3'}>
                    <button type="button" className="aa-btn" onClick={reset} disabled={disabled}>
                        초기화
                    </button>
                </div>
            )}
        </div>
    );
}
