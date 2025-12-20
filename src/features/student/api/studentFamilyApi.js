// src/features/student/api/studentFamilyApi.js
// ============================================================================
// Student Family API — 학생-보호자(가족) 링크 전용
// ----------------------------------------------------------------------------
// ✅ 이 파일이 담당하는 것
//  - 학생 1명 기준으로 "보호자(guardian)" 연결 목록 조회/추가/삭제
//  - (선택) 형제 그룹 기준 "가족 동기화(Family Sync)" 호출 래핑
//
// ✅ 백엔드 매핑
//  - GET    /api/admin/students/{studentId}/guardians
//  - POST   /api/admin/students/{studentId}/guardians
//  - DELETE /api/admin/students/{studentId}/guardians/{linkId}
//  - POST   /api/admin/students/{studentId}/guardians/sync   <-- 핵심 동기화
//
// 참고: api client의 baseURL이 '/api' 이므로 여기서는 '/admin/...'만 적습니다.
// ============================================================================

import api from '../../../common/api/client.js';

/** 학생의 보호자(가족) 링크 목록 조회 */
export const listStudentFamilies = (studentId) =>
    api.get(`/admin/students/${studentId}/guardians`).then(r => r.data);

/** 학생에 보호자(가족) 링크 추가 */
export const addStudentFamily = (studentId, payload) =>
    api.post(`/admin/students/${studentId}/guardians`, payload).then(r => r.data);

/** 학생의 보호자(가족) 링크 삭제 */
export const removeStudentFamily = (studentId, linkId) =>
    api.delete(`/admin/students/${studentId}/guardians/${linkId}`).then(r => r.data);

/**
 * ✅ 가족 동기화(Family Sync)
 * ----------------------------------------------------------------------------
 * 버튼 하나로 아래를 한 번에 처리하기 위해 “전용 래퍼”로 만들어 둡니다.
 *
 * 백엔드 StudentFamilyService.syncFamily()가 수행하는 것:
 *  1) 형제 그래프(BFS)로 연결된 모든 학생을 "한 그룹"으로 수집
 *  2) 그룹 내 학생들끼리 누락된 형제 링크를 자동 생성(완전 연결)
 *  3) 그룹 내 보호자 링크를 합집합(Union)으로 모아서,
 *     각 학생에게 누락된 보호자 링크만 추가
 *
 * 즉, 네가 말한 시나리오(김학생1에서 동기화 → 김학생2/3에 가족도 붙고,
 * 형제도 전체적으로 맞춰짐)를 백엔드가 이미 처리합니다.
 */
export const syncStudentFamily = (studentId) =>
    api.post(`/admin/students/${studentId}/guardians/sync`).then(r => r.data);

// ----------------------------------------------------------------------------
// 호환 별칭(기존 코드에서 guardians 용어를 쓰는 곳이 있을 수 있어 유지)
// ----------------------------------------------------------------------------
export const listStudentGuardians  = listStudentFamilies;
export const addStudentGuardian    = addStudentFamily;
export const removeStudentGuardian = removeStudentFamily;
