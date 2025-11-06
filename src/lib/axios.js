// src/lib/axios.js
// ─────────────────────────────────────────────────────────────
// 공용 Axios 인스턴스
// - /api/admin/** 요청에만 Authorization 헤더 부착
// - FormData 업로드 시 Content-Type 제거(브라우저가 boundary 자동 세팅)
// - GET/HEAD 요청은 캐시 버스터(_cb) 자동 부착
// - 401/403 응답 시, 현재 경로가 /admin/* 이면 토큰 제거 후 /admin/login 으로 즉시 이동
//   (next 파라미터로 원래 경로를 넘겨 로그인 후 복귀 가능)
// ─────────────────────────────────────────────────────────────

import Axios from 'axios';

const axios = Axios.create({
    baseURL: import.meta.env.VITE_API_BASE || '', // vite 프록시(/api, /uploads) 사용 시 빈문자
    withCredentials: false,                      // 토큰 인증 사용 → 쿠키 인증 비활성 권장
    timeout: 45000,
    headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/plain, */*',
    },
});

// ── 토큰 유틸: 프로젝트 내 혼용 대비(필요 시 키 추가) ───────────────────
const TOKEN_KEYS = ['accessToken', 'WINO_ADMIN_TOKEN'];

function readRawToken() {
    for (const k of TOKEN_KEYS) {
        const v = localStorage.getItem(k) || sessionStorage.getItem(k);
        if (v && v.trim()) return v.trim();
    }
    return '';
}

function clearTokens() {
    TOKEN_KEYS.forEach((k) => {
        localStorage.removeItem(k);
        sessionStorage.removeItem(k);
    });
}

function normalizeJwt(raw = '') {
    return raw.replace(/^Bearer\s+/i, '').trim();
}

function isFormData(v) {
    return typeof FormData !== 'undefined' && v instanceof FormData;
}

function isAdminApi(url = '') {
    // 절대/상대 URL 모두 대응
    return /\/api\/admin(\/|$)/.test(String(url));
}

function appendCacheBuster(config) {
    const method = String(config.method || 'get').toLowerCase();
    if (method === 'get' || method === 'head') {
        config.params = config.params || {};
        if (config.params._cb === undefined) {
            config.params._cb = Date.now();
        }
    }
}

// ── 요청 인터셉터 ───────────────────────────────────────────────
axios.interceptors.request.use(
    (config) => {
        config.headers = config.headers || {};

        // 1) 관리자 엔드포인트에만 Authorization 부착
        if (isAdminApi(config.url)) {
            const raw = readRawToken();
            const jwt = normalizeJwt(raw);
            if (jwt) config.headers.Authorization = `Bearer ${jwt}`;
            else delete config.headers.Authorization;
        } else {
            // 공개/비관리자 경로는 만료 토큰 영향 방지용으로 제거
            delete config.headers.Authorization;
        }

        // 2) 업로드(FormData)는 Content-Type 제거 → 브라우저가 boundary 포함하여 자동 세팅
        if (isFormData(config.data)) {
            delete config.headers['Content-Type'];
        }

        // 3) 캐시 버스터
        appendCacheBuster(config);

        return config;
    },
    (error) => Promise.reject(error)
);

// ── 응답 인터셉터: 401/403 → 로그인 화면 ─────────────────────────
axios.interceptors.response.use(
    (res) => res,
    (err) => {
        const status = err?.response?.status;
        const code = err?.code;

        if (code === 'ECONNABORTED') {
            console.warn('[axios] 요청 타임아웃');
        }

        if (status === 401 || status === 403) {
            const { pathname, search } = window.location;
            const isAdminArea = pathname.startsWith('/admin');
            const isOnLogin = pathname.startsWith('/admin/login');

            // 현재 화면이 관리자 영역일 때만 강제 로그아웃 & 리다이렉트
            if (isAdminArea && !isOnLogin) {
                clearTokens();
                const next = encodeURIComponent(pathname + (search || ''));
                window.location.replace(`/admin/login?next=${next}`); // replace: 뒤로가기 방지
                return;
            }
        }

        return Promise.reject(err);
    }
);

export default axios;
