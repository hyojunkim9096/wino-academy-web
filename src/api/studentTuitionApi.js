// src/api/studentTuitionApi.js
// ============================================================================
// 학생별 수강료 등록/청구/납부 API 클라이언트 (v2.2 - 하위호환 별칭 추가)
// ----------------------------------------------------------------------------
// 내보내는 함수(현재 화면 기준):
//  - listStudentTuitions(studentId)
//  - createStudentTuition(studentId, { priceId | tuitionPriceId, startMonth })
//  - updateStudentTuition(studentId, tuitionId, { startMonth?, active? })
//  - deleteStudentTuition(studentId, tuitionId, { force? })
//  - generateInvoices(studentId, { month } | { fromMonth, toMonth })
//  - listRecentInvoices(studentId, { size })
//  - payInvoice(invoiceId, { paidAt, amount, method?, memo? })
// ----------------------------------------------------------------------------
// 하위호환 별칭:
//  - addStudentTuition → createStudentTuition
//  - generateMonthlyInvoices → generateInvoices  ← ★ 이번 오류 원인 해결
// ----------------------------------------------------------------------------
// BE 경로 원칙: axios 인스턴스(api)의 baseURL이 '/api' 이므로
// 여기서는 '/admin/...' 경로만 적으면 최종 '/api/admin/...' 로 호출됩니다.
// ============================================================================

import api from './client';

/** 공통: 응답에서 data만 안전하게 추출 */
const dataOf = (p) => p.then((res) => res.data);

/** 학생의 수강료 등록 목록 */
export function listStudentTuitions(studentId) {
    return dataOf(api.get(`/admin/students/${studentId}/tuitions`));
}

/**
 * 수강료 등록 추가
 * - 프런트 사용 명세: createStudentTuition(studentId, { priceId, startMonth })
 * - 서버가 tuitionPriceId를 기대하는 경우를 대비해 방어적으로 매핑
 *   (priceId | tuitionPriceId 둘 중 하나만 넘어와도 동작)
 */
export function createStudentTuition(studentId, payload) {
    const { priceId, tuitionPriceId, startMonth, ...rest } = payload || {};
    const body = {
        tuitionPriceId: tuitionPriceId ?? priceId, // 두 키 중 하나만 와도 서버가 인지하도록 보정
        startMonth,                                 // 'YYYY-MM'
        ...rest,
    };
    return dataOf(api.post(`/admin/students/${studentId}/tuitions`, body));
}

/** ⛳ 하위호환 별칭: 과거 API명(addStudentTuition)을 그대로 지원 */
export { createStudentTuition as addStudentTuition };

/** 수강료 등록 수정({ startMonth?, active? }) */
export function updateStudentTuition(studentId, tuitionId, payload) {
    return dataOf(api.put(`/admin/students/${studentId}/tuitions/${tuitionId}`, payload));
}

/**
 * 수강료 등록 삭제
 * - 연결된 청구서가 있으면 400(비활성 권장)
 * - force 옵션은 서버가 지원할 때만 의미 있음
 */
export function deleteStudentTuition(studentId, tuitionId, { force = false } = {}) {
    return dataOf(
        api.delete(`/admin/students/${studentId}/tuitions/${tuitionId}`, { params: { force } })
    );
}

/**
 * 청구 생성(학생 단건)
 * - 기본: month 한 달만 생성 → POST /admin/students/{id}/invoices/generate?month=YYYY-MM
 * - 확장: 기간 생성({fromMonth,toMonth})을 받으면 body로 전송(서버 지원 시)
 *   => 서버 호환을 위해 두 방식 모두 지원
 */
export function generateInvoices(studentId, payload) {
    const { month, fromMonth, toMonth, ...rest } = payload || {};
    if (month) {
        // MONTH 단위(기본 정책)
        return dataOf(
            api.post(
                `/admin/students/${studentId}/invoices/generate`,
                { ...rest },
                { params: { month } }
            )
        );
    }
    // 기간형(서버가 지원하는 경우)
    if (fromMonth || toMonth) {
        return dataOf(
            api.post(`/admin/students/${studentId}/invoices/generate`, { fromMonth, toMonth, ...rest })
        );
    }
    // 방어적 실패 메시지
    return Promise.reject(
        new Error('generateInvoices: month 또는 fromMonth/toMonth 중 하나는 필수입니다.')
    );
}

/** ⛳ 하위호환 별칭: 과거 API명(generateMonthlyInvoices)을 그대로 지원 */
export { generateInvoices as generateMonthlyInvoices };

/** 최근 청구서 목록 */
export function listRecentInvoices(studentId, { size = 20 } = {}) {
    return dataOf(api.get(`/admin/students/${studentId}/invoices/recent`, { params: { size } }));
}

/** 청구서 납부 처리 */
export function payInvoice(invoiceId, payload) {
    return dataOf(api.post(`/admin/invoices/${invoiceId}/pay`, payload));
}