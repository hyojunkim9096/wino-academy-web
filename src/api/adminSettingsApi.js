// src/api/adminSettingsApi.js
// ✅ 409 무시하지 말고 그대로 throw 하도록 원복
import api from './client';

/* =========================
 * AppSetting
 * ========================= */
export const listAppSettings = async () =>
    (await api.get('/admin/app-settings')).data;

export const createAppSetting = async (payload) =>
    (await api.post('/admin/app-settings', payload)).data;

export const updateAppSetting = async (id, payload) =>
    (await api.put(`/admin/app-settings/${encodeURIComponent(id)}`, payload)).data;

export const deleteAppSetting = async (id) =>
    (await api.delete(`/admin/app-settings/${encodeURIComponent(id)}`)).data;

export const listAppSettingsDeleted = async () =>
    (await api.get('/admin/app-settings/deleted')).data;

/* =========================
 * SecurityRule
 * ========================= */
export const listSecurityRules = async () =>
    (await api.get('/admin/security-rules')).data;

export const createSecurityRule = async (payload) =>
    (await api.post('/admin/security-rules', payload)).data;

export const updateSecurityRule = async (id, payload) =>
    (await api.put(`/admin/security-rules/${encodeURIComponent(id)}`, payload)).data;

export const deleteSecurityRule = async (id) =>
    (await api.delete(`/admin/security-rules/${encodeURIComponent(id)}`)).data;

export const listSecurityRulesDeleted = async () =>
    (await api.get('/admin/security-rules/deleted')).data;

/* =========================
 * CORS (단건)
 * ========================= */
export const getCors  = async () =>
    (await api.get('/admin/cors-setting')).data;

export const saveCors = async (payload) =>
    (await api.post('/admin/cors-setting', payload)).data;
