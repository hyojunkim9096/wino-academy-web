// /src/api/guardianAdminApi.js
// ----------------------------------------------------------------------------
// Guardian Admin API — 보호자(가족) 마스터 검색 전용
//  - AdminStudentPage 및 StudentFamilyTab 에서 사용
// ----------------------------------------------------------------------------

import api from './client';

/** 보호자(가족) 마스터 검색
 *  @param {Object} params - { keyword?: string, page?: number, size?: number, ... }
 *  @returns Page<Guardian> | Guardian[]
 */
export const listFamiliesMaster = (params = {}) =>
    api.get('/admin/guardians', { params }).then(r => r.data);