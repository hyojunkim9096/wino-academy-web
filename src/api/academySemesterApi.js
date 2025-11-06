// src/api/academySemesterApi.js
// -----------------------------------------------------------------------------
// 학기 관리 API 래퍼 (관리자 전용)
// - 베이스: api 인스턴스(axios)에서 baseURL='/api' 로 설정되어 있다고 가정
// - 컨트롤러: /api/admin/semesters  (백엔드에서 schoolStage 파라미터는 선택값)
// - 목록:   GET    /admin/semesters?schoolStage=E|M|H&use=ACTIVE|INACTIVE|ALL
//           · schoolStage 생략 → 전체 학부
//           · use 미지정 시 프론트에서 'ACTIVE'로 기본값 강제
//           · 구버전 호환을 위해 stage 파라미터도 함께 전송(백엔드에서 어느 쪽이든 수신 가능)
// - 단건:   GET    /admin/semesters/{id}
// - 업서트: POST   /admin/semesters[?id={id}]  (id 존재 시 수정, 없으면 생성)
// - 비활성: DELETE /admin/semesters/{id}      (권장: 서버에서 useYn=false 처리)
// -----------------------------------------------------------------------------
//
// ✅ 이 모듈의 목표
//  1) 호출자가 schoolStage=null 로 넘겨도 정상 동작(전체 학부 조회).
//  2) 서버 구현 차이(배열 / Page 객체 / {list:[]} 등)를 모두 배열로 “정규화”.
//  3) 불필요한 빈 파라미터('', null, undefined)는 쿼리에서 제외(서버 캐시/로그 깔끔).
//  4) 예외는 그대로 throw → 상위(ui/alert 등)에서 메시지 처리.
//
// 사용 예:
//   import { listSemesters } from '@/api/academySemesterApi';
//   const rows = await listSemesters(null);         // 전체 학부 + ACTIVE
//   const rows = await listSemesters('M', 'ALL');   // 중등부 전체
// -----------------------------------------------------------------------------

import api from './client';

/** ---------------------------------------------------------------------------
 * 내부 유틸: 파라미터에서 null/undefined/'' 제거
 * --------------------------------------------------------------------------- */
function cleanParams(obj = {}) {
    const out = {};
    for (const k of Object.keys(obj)) {
        const v = obj[k];
        if (v == null) continue;                          // null / undefined 제거
        if (typeof v === 'string' && v.trim() === '') continue; // '' 제거
        out[k] = v;
    }
    return out;
}

/** ---------------------------------------------------------------------------
 * 내부 유틸: 어떤 응답 포맷이 와도 "배열"로 정규화
 *  - [ ... ]
 *  - { content:[ ... ] } (Spring Page)
 *  - { list:[ ... ] }
 *  - 그 외 → []
 * --------------------------------------------------------------------------- */
function normalizeList(data) {
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.content)) return data.content;
    if (data && Array.isArray(data.list)) return data.list;
    return [];
}

/** ---------------------------------------------------------------------------
 * 학기 목록 조회
 * @param {('E'|'M'|'H'|null|undefined)} schoolStage  학부 - 생략/Null이면 전체 학부
 * @param {('ACTIVE'|'INACTIVE'|'ALL')}   use         사용 필터 (기본 'ACTIVE')
 * @returns {Promise<Array>}                           표준화된 배열
 * --------------------------------------------------------------------------- */
export async function listSemesters(schoolStage = null, use = 'ACTIVE') {
    // stage 별칭을 함께 보냄(구버전 호환) — cleanParams 로 불필요 파라미터 자동 제거
    const stageVal = schoolStage || undefined; // '' → undefined 로 치환
    const params = cleanParams({
        schoolStage: stageVal, // 신버전
        stage: stageVal,       // 구버전 호환
        use: use || 'ACTIVE',  // 서버 기본값과 무관하게 프론트에서 ACTIVE로 강제
    });

    const { data } = await api.get('/admin/semesters', { params });
    return normalizeList(data);
}

/** ---------------------------------------------------------------------------
 * 학기 단건 조회
 * @param {number|string} id
 * @returns {Promise<Object>}
 * --------------------------------------------------------------------------- */
export async function getSemester(id) {
    if (!id && id !== 0) throw new Error('id는 필수입니다.');
    const { data } = await api.get(`/admin/semesters/${id}`);
    return data;
}

/** ---------------------------------------------------------------------------
 * 학기 업서트(신규/수정)
 * - id 가 있으면 수정, 없으면 생성
 * - payload 형식(백엔드 DTO 기준):
 *   {
 *     schoolStage: 'E'|'M'|'H',
 *     code: string,
 *     name: string,
 *     semesterType: 'REGULAR'|'EXAM_PREP',
 *     startDate: 'YYYY-MM-DD',
 *     endDate:   'YYYY-MM-DD',
 *     sortOrder?: number,
 *     useYn?: boolean
 *   }
 * @param {Object} payload
 * @param {number|null} id
 * @returns {Promise<Object>}
 * --------------------------------------------------------------------------- */
export async function upsertSemester(payload, id = null) {
    const params = cleanParams({ id }); // id 없으면 쿼리에서 제외
    const { data } = await api.post('/admin/semesters', payload, { params });
    return data;
}

/** ---------------------------------------------------------------------------
 * 학기 비활성(Soft Delete 권장)
 * - 서버에서 실제 삭제 대신 useYn=false 로 처리하는 구현을 권장
 * @param {number|string} id
 * @returns {Promise<any>}
 * --------------------------------------------------------------------------- */
export async function deleteSemester(id) {
    if (!id && id !== 0) throw new Error('id는 필수입니다.');
    const { data } = await api.delete(`/admin/semesters/${id}`);
    return data;
}

/** 기본 내보내기(편의) */
export default {
    listSemesters,
    getSemester,
    upsertSemester,
    deleteSemester,
};