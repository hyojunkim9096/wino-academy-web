// src/api/authApi.js
import api from './client';

/**
 * 로그인
 * - 서버가 'Bearer <jwt>' 또는 '<jwt>' 둘 다 가능 → 항상 'Bearer ' 접두로 정규화
 * - 받은 토큰을 저장하고, axios 기본 헤더에 즉시 반영
 * - (선택) 로그인 직후 3초 그레이스 윈도우 기록 → ping/me 401/423 일시무시
 */
export const login = async ({ userId, password }) => {
    const res = await api.post('/auth/login', { userId, password });
    const raw = typeof res.data === 'string' ? res.data : res.data?.token;
    if (!raw) throw new Error('토큰 응답이 없습니다.');

    // ✅ 핵심: 토큰을 항상 'Bearer ' 1번만 붙인 형태로 정규화
    const headerToken = raw.startsWith('Bearer ') ? raw : `Bearer ${raw}`;

    // 저장 및 전역 헤더 적용
    localStorage.setItem('accessToken', headerToken);
    api.defaults.headers.common.Authorization = headerToken;

    // 로그인 직후 잠깐 발생할 수 있는 ping/me 401/423 무시용 (선택)
    try { sessionStorage.setItem('auth:graceUntil', String(Date.now() + 3000)); } catch {}

    return headerToken;
};

/** 내 정보 조회 */
export const fetchMe = async () => (await api.get('/auth/me')).data;

/** 세션 연장(ping) */
export const ping   = async () => (await api.post('/auth/ping')).data;

/** 로그아웃(서버 세션 종료) — 전역 팝업 억제 */
export const logout = async () => {
    try { await api.post('/auth/logout', null, { skipAuthErrorPopup: true }); } catch {}
};

// 공개 API — 전역 인증 팝업 비활성화
export const requestPasswordReset = async (userId) =>
    api.post('/auth/password-reset/request', { userId }, { skipAuthErrorPopup: true });

export const confirmPasswordReset = async ({ userId, code, newPassword }) =>
    api.post('/auth/password-reset/confirm', { userId, code, newPassword }, { skipAuthErrorPopup: true });
