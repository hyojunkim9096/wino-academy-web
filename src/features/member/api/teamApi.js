// src/features/member/api/teamApi.js
import api from '../../../common/api/client.js';

/** Team(팀) API - /api/admin/teams */

export const listTeams = async (params = {}) => {
    const res = await api.get('/admin/teams', { params });
    return res.data; // Spring Page<TeamSummaryRes>
};

export const getTeam = async (id, { activeOnly = false } = {}) => {
    const res = await api.get(`/admin/teams/${id}`, { params: { activeOnly }});
    return res.data; // TeamDetailRes
};

export const createTeam = async (payload) => {
    const res = await api.post('/admin/teams', payload);
    return res.data; // { id }
};

export const updateTeam = async (id, payload) => {
    const res = await api.put(`/admin/teams/${id}`, payload);
    return res.data; // { result: 'ok' }
};

export const deleteTeam = async (id) => {
    const res = await api.delete(`/admin/teams/${id}`);
    return res.data;
};

export const listTeamMembers = async (id, { activeOnly = false } = {}) => {
    const res = await api.get(`/admin/teams/${id}/members`, { params: { activeOnly }});
    return res.data;
};

export const addTeamMember = async (id, payload) => {
    const res = await api.post(`/admin/teams/${id}/members`, payload); // {adminId, roleInTeam}
    return res.data; // { memberId }
};

export const updateTeamMember = async (id, memberId, payload) => {
    const res = await api.put(`/admin/teams/${id}/members/${memberId}`, payload); // {roleInTeam, activeYn}
    return res.data;
};

export const removeTeamMember = async (id, memberId) => {
    const res = await api.delete(`/admin/teams/${id}/members/${memberId}`);
    return res.data;
};

export const setTeamLeader = async (id, adminId) => {
    const res = await api.post(`/admin/teams/${id}/leader`, { adminId });
    return res.data;
};