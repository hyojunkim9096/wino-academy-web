// src/features/region/api/regionApi.js
/**
 * regionApi.js
 * - 공개 조회 + 관리자 동기화 호출모듈
 *
 * 백엔드 매핑
 *  - GET  /api/common/regions?depth=1|2|3|4
 *  - GET  /api/common/regions?parent={10자리}
 *  - GET  /api/common/regions/prefix?code={prefix}
 *  - POST /api/admin/regions/sync?mode=upsert|replace[&sourceUrl=...]
 *  - POST /api/admin/regions/sync-missing?limit=100
 *  - POST /api/admin/regions/sync-missing-all?chunkSize=100&prefixes=11,26...&hardStopSeconds=900
 *
 * 변경점(이번 수정)
 *  - ✅ 응답 표준화(normalize): code를 항상 "문자열"로, name/depth/pathName도 유연 매핑
 *  - ✅ RegionSelect와의 비교/렌더 호환성 보장(숫자 code로 내려와도 안전)
 *  - ✅ JSON 판별 완화(application/problem+json 등도 허용)
 */

/* ─────────────────────────────────────────────────────────────
 * 공용 응답 파서 (status 포함 throw)
 *  - 204 No Content → 빈 객체
 *  - JSON 우선, 그 외는 text로 파싱
 *  - 실패 시 Error(message) + err.status 세팅
 * ───────────────────────────────────────────────────────────── */
const parseResponse = async (res) => {
    if (res.status === 204) return {};
    if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try {
            const ct = (res.headers.get('content-type') || '').toLowerCase();
            if (ct.includes('json')) {
                const j = await res.json();
                msg = j?.message || j?.error || JSON.stringify(j);
            } else {
                const t = await res.text();
                if (t) msg = t;
            }
        } catch (_) {}
        const err = new Error(msg);
        err.status = res.status;
        throw err;
    }
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (ct.includes('json')) return res.json();
    const t = await res.text();
    try { return JSON.parse(t); } catch { return { message: t }; }
};

/* ─────────────────────────────────────────────────────────────
 * 토큰 정규화/주입
 * ───────────────────────────────────────────────────────────── */
const normalizeBearer = (t) => (t?.startsWith('Bearer ') ? t : `Bearer ${t}`);
const resolveToken = (overrideToken) => {
    if (overrideToken) return normalizeBearer(overrideToken);
    const raw =
        localStorage.getItem('accessToken') ||
        sessionStorage.getItem('accessToken') ||
        localStorage.getItem('adminToken') ||
        sessionStorage.getItem('adminToken') ||
        null;
    return raw ? normalizeBearer(raw) : null;
};
const authHeader = (overrideToken) => {
    const bearer = resolveToken(overrideToken);
    return bearer ? { Authorization: bearer } : {};
};

/* ─────────────────────────────────────────────────────────────
 * URL 빌더 (+ 캐시 버스터)
 * ───────────────────────────────────────────────────────────── */
const buildUrl = (path, params = {}) => {
    const qs = new URLSearchParams();
    qs.set('_cb', Date.now().toString());
    Object.entries(params).forEach(([k, v]) => {
        if (v === undefined || v === null || v === '') return;
        qs.set(k, String(v));
    });
    const query = qs.toString();
    return query ? `${path}?${query}` : path;
};

/* ─────────────────────────────────────────────────────────────
 * fetch 유틸 (+ 타임아웃/AbortSignal)
 * ───────────────────────────────────────────────────────────── */
const doFetch = async (url, init = {}, timeoutMs) => {
    if (!timeoutMs) return fetch(url, init);
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        return await fetch(url, { ...init, signal: ctrl.signal });
    } finally {
        clearTimeout(id);
    }
};

/* ─────────────────────────────────────────────────────────────
 * 타임아웃 기본값
 * ───────────────────────────────────────────────────────────── */
const DEFAULT_TIMEOUT_REGION_SYNC_MS = 5 * 60 * 1000;   // 5분
const DEFAULT_TIMEOUT_REGION_ALL_MS  = 30 * 60 * 1000;  // 30분

/* ─────────────────────────────────────────────────────────────
 * ✅ 응답 표준화 유틸(프런트 기대 스키마로 통일)
 *  - code: 문자열(필수, trim)
 *  - name: 문자열(trim)
 *  - depth: 숫자(1~4; 문자열로 와도 Number 캐스팅)
 *  - pathName: 전체 경로명(선택, trim)
 * ───────────────────────────────────────────────────────────── */
const trimOrEmpty = (s) => (s == null ? '' : String(s).trim());
const trimOrUndef = (s) => {
    if (s == null) return undefined;
    const t = String(s).trim();
    return t ? t : undefined;
};

const normalizeRegion = (r) => {
    if (!r || typeof r !== 'object') return r;
    // 가능한 키 이름들을 유연하게 매핑
    const rawCode =
        r.code ?? r.admCode ?? r.regionCode ?? r.cd ?? r.id ?? '';
    const rawName =
        r.name ?? r.regionName ?? r.label ?? r.nm ?? '';
    const rawDepth =
        r.depth ?? r.level ?? r.lv ?? undefined;
    const rawPathName =
        r.pathName ?? r.path ?? r.fullName ?? r.full_nm ?? undefined;

    const code = trimOrEmpty(rawCode);      // 문자열 + trim
    const name = trimOrEmpty(rawName);
    const pathName = trimOrUndef(rawPathName);
    const depth = rawDepth != null && rawDepth !== ''
        ? Number(rawDepth)
        : undefined;

    return {
        ...r,
        code,
        name,
        depth,
        pathName,
    };
};

const normalizeList = (arr) => Array.isArray(arr) ? arr.map(normalizeRegion) : [];

/* ========================= 공개 조회 API ========================= */

/** 1뎁스(시/도) 등 "깊이"로 조회 */
export async function listRegionsByDepth(depth, opts = {}) {
    const url = buildUrl('/api/common/regions', {
        depth,
        ...(opts.refresh ? { refresh: true } : {}),
    });
    const res = await doFetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        signal: opts.signal,
    }, opts.timeoutMs);
    const data = await parseResponse(res);
    return normalizeList(data);
}

/** 부모코드(10자리)로 하위 조회 */
export async function listRegionsByParent(parentCode, opts = {}) {
    const url = buildUrl('/api/common/regions', {
        parent: parentCode,
        ...(opts.refresh ? { refresh: true } : {}),
    });
    const res = await doFetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        signal: opts.signal,
    }, opts.timeoutMs);
    const data = await parseResponse(res);
    return normalizeList(data);
}

/**
 * ✅ 코드 접두(prefix)로 조회 (RegionSelect 폴백에 유용)
 * - GET /api/common/regions/prefix?code=PREFIX
 */
export async function listRegionsByPrefix(codePrefix, opts = {}) {
    const url = buildUrl('/api/common/regions/prefix', { code: codePrefix });
    const res = await doFetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        signal: opts.signal,
    }, opts.timeoutMs);
    const data = await parseResponse(res);
    return normalizeList(data);
}

/* ========================= 관리자 동기화 API ========================= */

export async function syncRegions(mode = 'upsert', sourceUrlOverride, tokenOverride, opts = {}) {
    const m = String(mode).toLowerCase() === 'replace' ? 'replace' : 'upsert';
    const qs = new URLSearchParams();
    qs.set('mode', m);
    if (sourceUrlOverride && sourceUrlOverride.trim()) {
        qs.set('sourceUrl', sourceUrlOverride.trim());
    }
    const res = await doFetch(`/api/admin/regions/sync?${qs.toString()}`, {
        method: 'POST',
        headers: {
            Accept: 'application/json',
            ...authHeader(tokenOverride),
        },
        cache: 'no-store',
        signal: opts.signal,
    }, opts.timeoutMs ?? DEFAULT_TIMEOUT_REGION_SYNC_MS);
    return parseResponse(res);
}

/** ✅ 누락 상위 N건만 처리(점진 개선용) */
export async function syncRegionsMissing(limit = 100, tokenOverride, opts = {}) {
    const url = buildUrl('/api/admin/regions/sync-missing', { limit });
    const res = await doFetch(url, {
        method: 'POST',
        headers: {
            Accept: 'application/json',
            ...authHeader(tokenOverride),
        },
        cache: 'no-store',
        signal: opts.signal,
    }, opts.timeoutMs ?? DEFAULT_TIMEOUT_REGION_SYNC_MS);
    return parseResponse(res); // { processed }
}

/**
 * ✅ 누락 전량 처리(배치 반복)
 * - 서버 우선: POST /api/admin/regions/sync-missing-all
 * - 폴백: 404/405/501 → syncRegionsMissing(chunkSize) 반복
 */
export async function syncRegionsMissingAll(opts = {}) {
    const {
        chunkSize = 100,
        prefixes = [],
        hardStopSeconds = 900,
        timeoutMs = DEFAULT_TIMEOUT_REGION_ALL_MS,
        tokenOverride,
        fallbackLoop = true,
        onBatch,
        signal,
    } = opts || {};

    const prefixCsv = Array.isArray(prefixes)
        ? prefixes.filter(Boolean).join(',')
        : (typeof prefixes === 'string' ? prefixes : '');

    const url = buildUrl('/api/admin/regions/sync-missing-all', {
        chunkSize,
        hardStopSeconds,
        ...(prefixCsv ? { prefixes: prefixCsv } : {}),
    });

    try {
        const res = await doFetch(url, {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                ...authHeader(tokenOverride),
            },
            cache: 'no-store',
            signal,
        }, timeoutMs);
        return parseResponse(res);
    } catch (e) {
        const st = e?.status;
        const notSupported = st === 404 || st === 405 || st === 501;
        if (!fallbackLoop || !notSupported) throw e;

        const started = Date.now();
        const perBatch = [];
        let processedTotal = 0;
        let batches = 0;

        while (true) {
            if (signal?.aborted) break;
            const elapsedSec = Math.floor((Date.now() - started) / 1000);
            if (elapsedSec >= hardStopSeconds) break;

            const r = await syncRegionsMissing(chunkSize, tokenOverride, { timeoutMs, signal });
            const processed = r?.processed ?? 0;

            perBatch.push(processed);
            onBatch?.({ batch: batches + 1, processed });

            if (!processed || processed <= 0) break;

            processedTotal += processed;
            batches += 1;
        }

        return {
            processedTotal,
            batches,
            perBatch,
            elapsedMs: Date.now() - started,
            prefixesUsed: prefixCsv ? prefixCsv.split(',') : undefined,
            fallback: true,
        };
    }
}
