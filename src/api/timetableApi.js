// Timetable 전용 API 래퍼
// - semesterId: 선택 (null/undefined 전달 시 '전체 학기'로 조회됨)
import api from './client';

export async function getTeacherEvents({ teacherId, semesterId = null, workLocation = null }) {
    if (!teacherId) throw new Error('teacherId는 필수입니다.');
    const params = { teacherId };
    if (semesterId != null) params.semesterId = semesterId;   // ★ optional
    if (workLocation) params.workLocation = String(workLocation).toUpperCase();
    const { data } = await api.get('/admin/timetable/teacher-events', { params });
    return Array.isArray(data) ? data : [];
}

export async function getAllTeacherEvents({ semesterId = null, workLocation = null }) {
    const params = {};
    if (semesterId != null) params.semesterId = semesterId;   // ★ optional
    if (workLocation) params.workLocation = String(workLocation).toUpperCase();
    const { data } = await api.get('/admin/timetable/teacher-events-all', { params });
    return Array.isArray(data) ? data : [];
}

export async function getClassEvents({ workLocation, classId }) {
    if (!workLocation) throw new Error('workLocation는 필수입니다.');
    if (!classId) throw new Error('classId는 필수입니다.');
    const { data } = await api.get('/admin/timetable/class-events', {
        params: { workLocation: String(workLocation).toUpperCase(), classId }
    });
    return Array.isArray(data) ? data : [];
}

export default { getTeacherEvents, getAllTeacherEvents, getClassEvents };