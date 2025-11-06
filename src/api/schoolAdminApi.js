// src/api/schoolAdminApi.js
// 목적: 학교 관리/조회 API 모듈 (알리미 기반 동기화)
// - 공개 조회(403 방지): GET /api/common/schools
// - CRUD(관리자):        /api/admin/schools
// - 운영(관리자):        /api/admin/schools/ops/**
//   · ✅ 동기화(알리미):  POST /sync-schoolinfo, POST /sync-schoolinfo-all
//   · ✅ CSV 업로드 / (선택) 간단 정리: /import, /enrich
//
// 보안:
//   * 공개 조회는 permitAll (GET /api/common/schools/**)
//   * 관리자 경로는 hasAnyAuthority("ROLE_SYSTEM_ADMIN","ROLE_ADMIN")
// 요청 헤더:
//   * Authorization 은 src/lib/axios.js 인터셉터가 자동 세팅
//   * FormData 업로드 시 Content-Type 은 절대 수동 지정하지 말 것!

import axios from '@/lib/axios';

/* ──────────────────────────────────────────────────────────────
 * 상수/유틸
 * ────────────────────────────────────────────────────────────── */

// ⏱ 타임아웃 기본값(현장 상황 반영)
const DEFAULT_TIMEOUT_SYNC_MS = 600000;   // 10분
const DEFAULT_TIMEOUT_ENRICH_MS = 300000; // 5분

function withCacheBuster(params = {}) {
    return { ...params, _cb: Date.now() }; // 브라우저/프록시 캐시 우회
}

function onlyDigits(s) {
    return String(s ?? '').replace(/\D+/g, '');
}

function normalizeListParams(params = {}) {
    const out = { ...params };

    // page/size 클램프
    if (out.page != null) {
        const p = Number(out.page);
        out.page = Number.isFinite(p) && p >= 0 ? p : 0;
    }
    if (out.size != null) {
        const s = Number(out.size);
        out.size = Number.isFinite(s) ? Math.min(Math.max(1, s), 100) : 20;
    }

    // stage 정규화: E/M/H만 허용, 아니면 제거
    if (out.stage != null) {
        const u = String(out.stage).trim().toUpperCase();
        if (['E', 'M', 'H'].includes(u)) out.stage = u;
        else delete out.stage;
    }

    // active 정규화
    if (out.active === 'true') out.active = true;
    else if (out.active === 'false') out.active = false;
    else if (out.active === '') delete out.active;

    // keyword 트림
    if (typeof out.keyword === 'string') {
        out.keyword = out.keyword.trim();
        if (!out.keyword) delete out.keyword;
    }

    // admPrefix: 숫자만, 최대 10자리
    if (out.admPrefix != null) {
        const ap = onlyDigits(out.admPrefix).slice(0, 10);
        if (ap) out.admPrefix = ap;
        else delete out.admPrefix;
    }

    return out;
}

/* ─────────────────────────────
 * 목록 조회
 * ───────────────────────────── */
export async function listSchools(params = {}, optionsMaybe) {
    const adminPath = '/api/admin/schools';
    const publicPath = '/api/common/schools';
    const base = normalizeListParams(params);

    // ⛑ options 호환 처리
    const options =
        typeof optionsMaybe === 'boolean'
            ? { admin: optionsMaybe }
            : (optionsMaybe ?? {});
    const isAdmin = !!options.admin;
    const timeout = options.timeoutMs;

    if (!isAdmin) {
        const qpPublic = withCacheBuster({
            page: base.page ?? 0,
            size: base.size ?? 20,
            ...(base.stage != null ? { stage: base.stage } : {}),
            ...(base.active != null ? { active: base.active } : {}),
            ...(base.keyword ? { keyword: base.keyword } : {}),
            ...(base.admPrefix ? { admPrefix: base.admPrefix } : {}),
        });

        const { data } = await axios.get(publicPath, {
            params: qpPublic,
            timeout,
            headers: { Accept: 'application/json' },
        });
        return data;
    }

    // 관리자 API에는 admCodePrefix/admLike도 함께(백엔드 혼용 지원)
    const qpAdmin = withCacheBuster({
        page: base.page ?? 0,
        size: base.size ?? 20,
        ...(base.stage != null ? { stage: base.stage } : {}),
        ...(base.active != null ? { active: base.active } : {}),
        ...(base.keyword ? { keyword: base.keyword } : {}),
        ...(base.admPrefix
            ? { admPrefix: base.admPrefix, admCodePrefix: base.admPrefix, admLike: `${base.admPrefix}%` }
            : {}),
    });

    try {
        const { data } = await axios.get(adminPath, { params: qpAdmin, timeout });
        return data;
    } catch (e) {
        const st = e?.response?.status;
        if (st === 401 || st === 403) {
            // 권한 없으면 공개 API로 폴백
            const { data } = await axios.get(publicPath, {
                params: withCacheBuster({
                    page: base.page ?? 0,
                    size: base.size ?? 20,
                    ...(base.stage != null ? { stage: base.stage } : {}),
                    ...(base.active != null ? { active: base.active } : {}),
                    ...(base.keyword ? { keyword: base.keyword } : {}),
                    ...(base.admPrefix ? { admPrefix: base.admPrefix } : {}),
                }),
                timeout,
                headers: { Accept: 'application/json' },
            });
            return data;
        }
        throw e;
    }
}

/* ─────────────────────────────
 * 상세/CRUD (관리자 전용)
 * ───────────────────────────── */
export async function getSchool(id) {
    const { data } = await axios.get(`/api/admin/schools/${id}`);
    return data;
}

export async function createSchool(payload) {
    const { data } = await axios.post('/api/admin/schools', payload);
    return data; // new id
}

export async function patchSchool(id, payload) {
    await axios.patch(`/api/admin/schools/${id}`, payload);
}

export async function deleteSchool(id) {
    await axios.delete(`/api/admin/schools/${id}`);
}

/* ─────────────────────────────
 * 운영(동기화/CSV/정리) — 관리자 전용
 *  ✅ 알리미 전용 엔드포인트
 * ───────────────────────────── */

/**
 * ✅ 단건 범위 동기화(시도 + 시군구 + 학교급)
 * @param {{sidoCode:string, sggCode:string, stage:'E'|'M'|'H'}} body
 */
export async function syncSchoolInfo(body, timeoutMs = DEFAULT_TIMEOUT_SYNC_MS) {
    const payload = {
        sidoCode: body?.sidoCode ?? '',
        sggCode: body?.sggCode ?? '',
        stage: String(body?.stage ?? '').toUpperCase(),
    };
    const { data } = await axios.post('/api/admin/schools/ops/sync-schoolinfo', payload, { timeout: timeoutMs });
    return data; // {sidoCode, sggCode, stage, result, elapsedMs}
}

/**
 * ✅ 전국 일괄 동기화 (학부 목록; 생략 시 E/M/H 전체)
 * @param {Array<'E'|'M'|'H'>} stages
 */
export async function syncSchoolInfoAll(stages, timeoutMs = DEFAULT_TIMEOUT_SYNC_MS) {
    let arr = Array.isArray(stages) ? stages.map(s => String(s).toUpperCase()).filter(s => ['E','M','H'].includes(s)) : [];
    if (arr.length === 0) arr = ['E','M','H'];
    const { data } = await axios.post('/api/admin/schools/ops/sync-schoolinfo-all', { stages: arr }, { timeout: timeoutMs });
    return data; // {stages, result, elapsedMs}
}

/* ====== ⛔️ 레거시 호환(콘솔 경고만 띄우고 새 API로 위임) ====== */
export async function syncSchools(_extra = {}, timeoutMs = DEFAULT_TIMEOUT_SYNC_MS) {
    console.warn('[schoolAdminApi] syncSchools()는 폐지되었습니다. syncSchoolInfoAll()로 위임합니다.');
    return syncSchoolInfoAll(['E','M','H'], timeoutMs);
}
export async function syncByStage(stage, _extra = {}, timeoutMs = DEFAULT_TIMEOUT_SYNC_MS) {
    console.warn('[schoolAdminApi] syncByStage()는 폐지되었습니다. syncSchoolInfoAll([stage])로 위임합니다.');
    return syncSchoolInfoAll([stage], timeoutMs);
}
export async function syncPartitionedNationwide(_chunk = 3, timeoutMs = DEFAULT_TIMEOUT_SYNC_MS) {
    console.warn('[schoolAdminApi] syncPartitionedNationwide()는 폐지되었습니다. syncSchoolInfoAll()로 위임합니다.');
    return syncSchoolInfoAll(['E','M','H'], timeoutMs);
}
export async function syncNationwideBatched(_batch = 4, timeoutPerBatchMs = DEFAULT_TIMEOUT_SYNC_MS, onProgress) {
    console.warn('[schoolAdminApi] syncNationwideBatched()는 폐지되었습니다. syncSchoolInfoAll()로 위임합니다.');
    onProgress?.({ step: 1, total: 1, atpts: ['nationwide'] });
    return [{ atpts: ['nationwide'], result: await syncSchoolInfoAll(['E','M','H'], timeoutPerBatchMs) }];
}

/* ─────────────────────────────
 * CSV 임포트/간단 정리 — 관리자 전용
 * ───────────────────────────── */
export async function importSchoolsCsv(file) {
    const form = new FormData();
    form.append('file', file);
    const { data } = await axios.post('/api/admin/schools/ops/import', form);
    return data;
}

export async function enrichSchools(timeoutMs = DEFAULT_TIMEOUT_ENRICH_MS) {
    // 백엔드가 no-op일 수 있음(지오코딩 제거). 유지해도 무해.
    const { data } = await axios.post('/api/admin/schools/ops/enrich', null, { timeout: timeoutMs });
    return data;
}

/* ─────────────────────────────
 * 디폴트 익스포트(구 코드 호환)
 * ───────────────────────────── */
export default {
    // 조회/CRUD
    listSchools,
    getSchool,
    createSchool,
    patchSchool,
    deleteSchool,

    // 동기화(알리미)
    syncSchoolInfo,
    syncSchoolInfoAll,
    // 레거시 래퍼(경고)
    syncSchools,
    syncByStage,
    syncPartitionedNationwide,
    syncNationwideBatched,

    // CSV/정리
    importSchoolsCsv,
    enrichSchools,
};
