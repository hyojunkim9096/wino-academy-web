// src/api/billingApi.js
// ============================================================================
// Billing Console 전용 API 클라이언트
// BE 예상 엔드포인트:
//   - GET  /api/admin/tuition/billing/preview : 일괄 청구 대상 미리보기
//   - POST /api/admin/tuition/billing/run     : 선택(또는 전체) 실행
// ※ 공통 axios 인스턴스(client)는 X-App-User-Id 헤더 주입을 이미 지원한다고 가정
// ============================================================================

import api from './client';

const BASE = '/admin/tuition/billing';

/**
 * 미리보기 조회
 * @param {Object} params
 *  - {string} month                'yyyy-MM'
 *  - {string=} stage               'E' | 'M' | 'H'
 *  - {boolean=} onlyActiveStudents 기본 true
 *  - {number=} limit               기본 1000
 */
export async function previewBilling(params) {
    const { month, stage, onlyActiveStudents = true, limit = 1000 } = params || {};
    const { data } = await api.get(`${BASE}/preview`, {
        params: { month, stage, onlyActiveStudents, limit },
    });
    return data;
}

/**
 * 실행(청구 생성)
 * @param {Object} body
 *  - {string} month                'yyyy-MM'
 *  - {Array<number>=} tuitionIds   선택 실행 대상(stu_tuition.id). 없으면 전체 후보에서 정책대로 실행
 *  - {string=} stage
 *  - {boolean=} onlyActiveStudents
 */
export async function runBilling(body) {
    const { data } = await api.post(`${BASE}/run`, body);
    return data;
}