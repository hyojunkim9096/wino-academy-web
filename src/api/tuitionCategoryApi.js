// src/api/tuitionCategoryApi.js
// ============================================================================
// Tuition Category/Price API 클라이언트 (v2.7)
// ----------------------------------------------------------------------------
// - Axios client 기본 baseURL '/api' 전제.
//   이 파일의 basePath 는 '/admin/tuition' → 최종 경로: '/api/admin/tuition'.
// - 모든 함수는 named export.
// - listActiveTuitionPricesByStage:
//   1) 서버 엔드포인트 우선 호출:
//      GET /api/admin/tuition/prices/active?stage=E|M|H&gradeCode=E01&grade_code=E01
//   2) 실패 시 폴백: 카테고리/가격을 재귀로 모두 조회 → 활성만 합성 → 정규화.
// - getActivePrices(params): BillingConsole 전용 래퍼(프로젝트 합의 명칭). ✅ 신규 추가
// ============================================================================

import api from './client';

const basePath = '/admin/tuition';
const ok = (s) => s >= 200 && s < 300;

/** X-App-User-Id 헤더(옵션) */
const hdr = (actorId) => (actorId == null ? {} : { 'X-App-User-Id': Number(actorId) || 0 });

// ----------------------------------------------------------------------------
// 공통코드: 학부(stage)별 학년코드
// GET /api/admin/tuition/grade-codes?stage=E|M|H
// ----------------------------------------------------------------------------
export async function listGradeCodesByStage(stage) {
    const s = String(stage || '').toUpperCase();
    const { data } = await api.get(`${basePath}/grade-codes`, { params: { stage: s } });
    return Array.isArray(data) ? data : [];
}

// ----------------------------------------------------------------------------
// 카테고리 트리(특정 부모 바로 하위 조회)
// GET /api/admin/tuition/categories?stage=E|M|H&parentId
// ----------------------------------------------------------------------------
export async function listTuitionCategoriesByParent(stage, parentId = null) {
    const s = String(stage || '').toUpperCase();
    const { data } = await api.get(`${basePath}/categories`, { params: { stage: s, parentId } });
    return data || [];
}

// ----------------------------------------------------------------------------
// 카테고리 생성/수정
// POST /api/admin/tuition/categories
// PUT  /api/admin/tuition/categories/{id}
// ----------------------------------------------------------------------------
export async function upsertTuitionCategoryNode(payload, id = null, actorId = null) {
    const headers = hdr(actorId);
    if (id) {
        const { data } = await api.put(`${basePath}/categories/${id}`, payload, { validateStatus: ok, headers });
        return data;
    }
    const { data } = await api.post(`${basePath}/categories`, payload, { validateStatus: ok, headers });
    return data;
}

// ----------------------------------------------------------------------------
// 카테고리 삭제
// DELETE /api/admin/tuition/categories/{id}?force={true|false}
// ----------------------------------------------------------------------------
export async function deleteTuitionCategory(id, { force = false, actorId = null } = {}) {
    const headers = hdr(actorId);
    await api.delete(`${basePath}/categories/${id}`, { params: { force }, validateStatus: ok, headers });
}

// ----------------------------------------------------------------------------
// 카테고리 정렬 변경
// POST /api/admin/tuition/categories/reorder
// body: { stage, parentId, orderedIds }
// ----------------------------------------------------------------------------
export async function reorderTuitionCategoriesByParent(stage, parentId, orderedIds = [], actorId = null) {
    const headers = hdr(actorId);
    const s = String(stage || '').toUpperCase();
    await api.post(
        `${basePath}/categories/reorder`,
        { stage: s, parentId, orderedIds },
        { validateStatus: ok, headers }
    );
}

// ----------------------------------------------------------------------------
// 가격표(카테고리별)
// GET /api/admin/tuition/categories/{categoryId}/prices
// PUT /api/admin/tuition/categories/{categoryId}/prices
// ----------------------------------------------------------------------------
export async function listCategoryPrices(categoryId) {
    const { data } = await api.get(`${basePath}/categories/${categoryId}/prices`);
    return data || [];
}

export async function saveCategoryPrices(categoryId, rows = [], actorId = null) {
    const headers = hdr(actorId);
    await api.put(`${basePath}/categories/${categoryId}/prices`, rows, { validateStatus: ok, headers });
}

// ============================================================================
// 활성 가격표 조회(정규화) — 서버 우선, 실패 시 폴백 합성
// ============================================================================

function unitLabel(unit) {
    const u = String(unit || '').toUpperCase();
    if (u === 'MONTH') return '월 수강료';
    if (u === 'TERM') return '학기 수강료';
    if (u === 'SESSION') return '회차 수강료';
    return '수강료';
}

function normalizeRow(raw, leaf, path) {
    const id = raw?.id ?? raw?.priceId;
    const unit = raw?.unit ?? 'MONTH';
    const name = raw?.name || raw?.priceName || unitLabel(unit);
    const price = Number(raw?.price ?? 0);
    return {
        id,
        name,
        unit,
        price,
        categoryId: leaf?.id ?? raw?.categoryId ?? null,
        categoryName: leaf?.name ?? raw?.categoryName ?? '',
        categoryCode: leaf?.code ?? raw?.categoryCode ?? '',
        categoryPath: path ?? raw?.categoryPath ?? '',
        gradeGroup: leaf?.gradeGroup ?? raw?.gradeGroup ?? null,
        gradeCode: leaf?.gradeCode ?? raw?.gradeCode ?? null,
        enabled: raw?.enabled !== false,
        memo: raw?.memo ?? '',
        sortOrder: Number(raw?.sortOrder ?? 0),
    };
}

function getStageLetterFromGradeCode(gc) {
    const s = String(gc || '');
    return s ? s[0].toUpperCase() : ''; // 'E' | 'M' | 'H' | ''
}

function matchGradeFilter(row, gradeCode) {
    // gradeCode가 오면 E01/M02/H03 같은 완전코드 우선 비교
    if (!gradeCode) return true;
    const want = String(gradeCode).toUpperCase();

    if (row.gradeCode) return String(row.gradeCode).toUpperCase() === want;

    // gradeGroup 비교(서버는 'GRADE_E' 형태일 수 있음)
    if (row.gradeGroup) {
        const rowGroup = String(row.gradeGroup).toUpperCase(); // 'GRADE_E' 또는 'E'
        const letter = getStageLetterFromGradeCode(want);       // 'E' | 'M' | 'H'
        if (!letter) return true;
        return rowGroup === letter || rowGroup === `GRADE_${letter}`;
    }
    return true;
}

/** 재귀로 모든 리프 카테고리와 경로 수집 */
async function collectLeafCategoriesWithPath(stage, parentId = null, prefix = '') {
    const results = [];
    const nodes = await listTuitionCategoriesByParent(stage, parentId);
    for (const n of nodes || []) {
        const name = n?.name || '';
        const path = prefix ? `${prefix}/${name}` : name;
        if (n?.isLeaf) {
            results.push({ leaf: n, path });
        } else {
            const children = await collectLeafCategoriesWithPath(stage, n.id, path);
            results.push(...children);
        }
    }
    return results;
}

/**
 * 서버 우선/폴백 합성 버전의 "활성 가격표" 조회
 * @param {string} stage 'E' | 'M' | 'H'
 * @param {{gradeCode?: string, grade_code?: string, unit?: string, actorId?: number}} [opt]
 * @returns {Promise<Array<{id,name,unit,price,categoryId,categoryName,categoryCode,categoryPath,gradeGroup,gradeCode,enabled,memo,sortOrder}>>}
 */
export async function listActiveTuitionPricesByStage(
    stage,
    { gradeCode = null, grade_code = null, unit = null, actorId = null } = {}
) {
    const s = String(stage || '').toUpperCase();
    const gc = gradeCode || grade_code ? String(gradeCode || grade_code).toUpperCase() : null;

    // 1) 서버 엔드포인트 시도
    try {
        const params = { stage: s };
        if (gc) { params.gradeCode = gc; params.grade_code = gc; }
        if (unit) params.unit = String(unit).toUpperCase();

        const { data } = await api.get(`${basePath}/prices/active`, { params });
        const arr = Array.isArray(data) ? data : [];
        return arr
            .map((raw) => normalizeRow(raw, null, raw?.categoryPath))
            .filter((r) => r.enabled && matchGradeFilter(r, gc))
            .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || String(a.name).localeCompare(String(b.name), 'ko'));
    } catch (e) {
        console.warn('[listActiveTuitionPricesByStage] fallback composition.', e?.response?.status, e?.message);

        // 2) 폴백 합성(임의 깊이 재귀)
        const leavesWithPath = await collectLeafCategoriesWithPath(s, null, '');

        const flat = [];
        for (const { leaf, path } of leavesWithPath) {
            const prices = await listCategoryPrices(leaf.id);
            const active = (prices || [])
                .filter((p) => p?.enabled !== false)
                .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || String(a.name).localeCompare(String(b.name), 'ko'));
            for (const p of active) {
                const row = normalizeRow(p, leaf, path);
                if (matchGradeFilter(row, gc)) flat.push(row);
            }
        }

        return flat;
    }
}

// ============================================================================
// ✅ 프로젝트 합의 명칭: getActivePrices(params)
// - BillingConsolePage 등에서 import { getActivePrices } 사용
// - 내부적으로 listActiveTuitionPricesByStage 를 호출
// ============================================================================
/**
 * 활성 가격표 조회 래퍼
 * @param {{stage:string, gradeCode?:string, grade_code?:string, unit?:string, actorId?:number}} params
 */
export async function getActivePrices(params = {}) {
    const { stage, gradeCode, grade_code, unit, actorId } = params;
    return listActiveTuitionPricesByStage(stage, { gradeCode, grade_code, unit, actorId });
}