// src/api/staffApi.js
import api from './client';

// 목록 조회 (필터: employeeType=ALL|TEACHER|STAFF, workLocation=N|W|Q, keyword)
export const listStaffs = async (params = {}) =>
    (await api.get('/admin/staffs', { params })).data;

// 단건 조회
export const getStaff = async (id) =>
    (await api.get(`/admin/staffs/${id}`)).data;

// 수정
export const updateStaff = async (id, payload) =>
    (await api.put(`/admin/staffs/${id}`, payload)).data;

// 비밀번호 변경
export const changeStaffPassword = async (id, newPassword) =>
    (await api.post(`/admin/staffs/${id}/password`, { newPassword })).data;

// 프로필 이미지 업로드 (multipart)
export const uploadStaffPhoto = async (id, file) => {
    const fd = new FormData();
    fd.append('file', file);
    return (await api.post(`/admin/staffs/${id}/photo`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
    })).data; // { fileId }
};
