// src/common/api/client.js
// ============================================================================
// WINO Academy Admin — Axios 클라이언트
// ----------------------------------------------------------------------------
// 기능 요약
// 1) Axios 인스턴스 생성(+ 기본 옵션)
// 2) BroadcastChannel 로 탭 간 강제 로그아웃 동기화
// 3) 강제 로그아웃 유틸(forceLogout): 토큰/헤더 정리, 메시지 저장, 라우팅
// 4) 요청 인터셉터:
//    - Authorization 헤더 'Bearer ' 접두 정규화
//    - ★ event_by 기록용 현재 관리자 PK → 'X-App-User-Id' 자동 첨부
//    - ★ event_note 기록용 메모 → 'X-Event-Note' (옵션) 첨부
//    - Ajax 식별 헤더 'X-Requested-With' 추가
// 5) 응답 인터셉터:
//    - 401/403/423 → 세션 만료/충돌/잠금 케이스별 메시지 후 강제 로그아웃
//    - 로그인/공개 API/초기 레이스 등은 예외
// 6) 초기 부팅 시 기본 헤더 보정(토큰/유저ID 재적용)
// 7) ★ 부트 타임 가드: 로그인 안 된 상태에서 /admin/* 접근 → 로그인으로 리다이렉트
//    - /admin/login, /admin/forgot-password, /admin/signUp 등은 예외
// ----------------------------------------------------------------------------
// 사용법(이벤트 노트):
//   api.post(url, body, { meta: { eventNote: '스냅샷 저장' } })
//   또는
//   api.post(url, body, { headers: { 'X-Event-Note': '스냅샷 저장' } })
// 서버 측 인터셉터(AppUserSqlVarInterceptor)는 이 헤더를 읽어 AppUserContext에 넣고,
// 서비스(@Transactional)에서 DbSessionVars.setAppVars(userId, note)로 DB 세션 변수에 주입합니다.
// ============================================================================

import axios from 'axios';

// ---------------------------------------------------------------------------
// 0) 유틸: eventNote 정리(길이 제한/개행 정리 등)
// ---------------------------------------------------------------------------
function sanitizeEventNote(note) {
    if (!note) return '';
    try {
        let s = String(note);
        s = s.replace(/\r\n/g, '\n').replace(/\t/g, ' ');
        const MAX = 500; // 컬럼/트리거 길이에 맞춰 조정
        if (s.length > MAX) s = s.slice(0, MAX);
        return s;
    } catch {
        return '';
    }
}

// ---------------------------------------------------------------------------
// 1) Axios 인스턴스
// ---------------------------------------------------------------------------
const api = axios.create({
    baseURL: '/api',
    withCredentials: false // JWT는 Authorization 헤더로 운용
});

// ---------------------------------------------------------------------------
// 2) BroadcastChannel (다른 탭과 통신: 강제 로그아웃 브로드캐스트)
// ---------------------------------------------------------------------------
let bc;
try {
    bc = new BroadcastChannel('auth-channel');
} catch {
    bc = null;
}

// ---------------------------------------------------------------------------
// 3) 세션 종료 안내 메시지 & 중복 처리 가드
// ---------------------------------------------------------------------------
const MSG_KEY = 'logoutMessage';
const KICK_KEY = 'kickMsg';
const GUARD_KEY = 'logout:inflight';

function putMsg(msg) {
    try {
        sessionStorage.setItem(MSG_KEY, msg || '');
        sessionStorage.setItem(KICK_KEY, msg || '');
    } catch {}
}
function setGuard(on) {
    try {
        on ? sessionStorage.setItem(GUARD_KEY, '1') : sessionStorage.removeItem(GUARD_KEY);
    } catch {}
}
function hasGuard() {
    try {
        return !!sessionStorage.getItem(GUARD_KEY);
    } catch { return false; }
}

// ---------------------------------------------------------------------------
// 4) URL에서 경로만 뽑기(로그/분기용)
// ---------------------------------------------------------------------------
function pathOf(url) {
    if (!url) return '';
    try {
        if (url.startsWith('http://') || url.startsWith('https://')) {
            return new URL(url).pathname;
        }
        return url;
    } catch {
        return url;
    }
}

// ---------------------------------------------------------------------------
// 5) 코드→로그인 화면 reason 쿼리 매핑
// ---------------------------------------------------------------------------
function codeToReason(code) {
    switch (code) {
        case 'SESSION_CONFLICT': return 'conflict';
        case 'ACCOUNT_LOCKED'  : return 'locked';
        case 'SESSION_EXPIRED' :
        default                : return 'expired';
    }
}

// ---------------------------------------------------------------------------
// 6) ✅ 강제 로그아웃
// ---------------------------------------------------------------------------
function forceLogout(msg, code = 'SESSION_EXPIRED', opts = {}) {
    const { broadcast = true } = opts;
    if (hasGuard()) return;
    setGuard(true);

    // 1) 클라이언트 상태 정리
    try { localStorage.removeItem('accessToken'); } catch {}
    try { localStorage.removeItem('currentAdminId'); } catch {}

    // 2) 기본 헤더 정리
    try { delete api.defaults.headers.common.Authorization; } catch {}
    try { delete api.defaults.headers.common['X-App-User-Id']; } catch {}
    try { delete api.defaults.headers.common['X-Event-Note']; } catch {}

    // 3) 메시지 저장
    putMsg(msg);

    // 4) 브로드캐스트
    try { if (bc && broadcast) bc.postMessage({ type: 'force-logout', msg, code }); } catch {}

    // 5) 로그인 화면으로 이동
    const reason = codeToReason(code);
    if (typeof window !== 'undefined') {
        setTimeout(() => {
            window.location.href = `/admin/login?reason=${encodeURIComponent(reason)}`;
        }, 10);
    }
}

// 다른 탭에서의 방송 수신
try {
    if (bc) {
        bc.onmessage = (e) => {
            const data = e?.data;
            if (data?.type === 'force-logout') {
                forceLogout(data.msg, data.code, { broadcast: false });
            }
        };
    }
} catch {}

// ---------------------------------------------------------------------------
// 7) 요청 인터셉터
// ---------------------------------------------------------------------------
api.interceptors.request.use((config) => {
    // 1) Authorization 'Bearer ' 접두 보정
    const raw =
        config.headers?.Authorization ||
        config.headers?.authorization ||
        api.defaults.headers.common.Authorization ||
        (typeof localStorage !== 'undefined' && localStorage.getItem('accessToken')) ||
        '';
    if (raw) {
        const val = raw.startsWith('Bearer ') ? raw : `Bearer ${raw}`;
        config.headers = { ...(config.headers || {}), Authorization: val };
    }

    // 2) 현재 관리자 PK → X-App-User-Id
    try {
        const uid = localStorage.getItem('currentAdminId');
        if (uid) config.headers = { ...(config.headers || {}), 'X-App-User-Id': String(uid) };
    } catch {}

    // 3) (옵션) 이벤트 노트 → X-Event-Note
    const explicitHeaderNote = config?.headers?.['X-Event-Note'];
    const metaNote = config?.meta?.eventNote;
    const note = explicitHeaderNote ?? metaNote;
    if (note != null && note !== '') {
        const clean = sanitizeEventNote(note);
        if (clean) config.headers = { ...(config.headers || {}), 'X-Event-Note': clean };
    }

    // 4) Ajax 식별
    config.headers = { ...(config.headers || {}), 'X-Requested-With': 'XMLHttpRequest' };
    return config;
});

// ---------------------------------------------------------------------------
// 8) 응답 인터셉터
// ---------------------------------------------------------------------------
api.interceptors.response.use(
    (resp) => resp,
    (error) => {
        if (error?.config?.skipAuthErrorPopup) return Promise.reject(error);
        if (!error?.response) return Promise.reject(error);

        const status = error.response.status;
        const reqUrl = pathOf(error?.config?.url || '');

        // 로그인 유사 화면에서는 전역 세션 팝업 억제
        const pathname = (typeof window !== 'undefined' && window.location) ? window.location.pathname : '';
        const onLoginLikePage = /\/admin\/(login|forgot-password|password|reset|find|signUp)/.test(pathname || '');
        if (onLoginLikePage && (status === 401 || status === 403 || status === 423)) {
            return Promise.reject(error);
        }

        // /auth/login 실패는 각 페이지에서 처리
        if (/\/auth\/login(\b|\/|$)/.test(reqUrl)) return Promise.reject(error);

        // 토큰 없는 ping/me 401/403은 초기 레이스로 간주하고 무시
        const isPingOrMe = /\/auth\/(ping|me)(\b|\/|$)/.test(reqUrl);
        const hasJwt = !!(typeof localStorage !== 'undefined' && localStorage.getItem('accessToken'));
        if (!hasJwt && isPingOrMe && (status === 401 || status === 403)) {
            return Promise.reject(error);
        }

        // 인증/인가/잠금 관련 에러 통합 처리
        if (status === 401 || status === 403 || status === 423) {
            const headers = (error.response && error.response.headers) || {};
            const headerCode = (
                headers['x-auth-error']  || headers['X-Auth-Error'] ||
                headers['x-auth_code']   || headers['X-Auth_Code']  ||
                headers['x-auth-code']   || headers['X-Auth-Code']  || ''
            ).toString();
            const body = error.response.data;
            const bodyCode = (body && (body.error || body.code)) || '';

            if (status === 403) {
                const isConflict = (headerCode === 'SESSION_CONFLICT' || bodyCode === 'SESSION_CONFLICT');
                const isLocked   = (headerCode === 'ACCOUNT_LOCKED'   || bodyCode === 'ACCOUNT_LOCKED');
                if (!isConflict && !isLocked) return Promise.reject(error);
            }

            let msg = '', code = 'SESSION_EXPIRED';
            if (isPingOrMe || headerCode === 'SESSION_CONFLICT' || bodyCode === 'SESSION_CONFLICT') {
                msg = '다른 장소에서 로그인하여 로그아웃 되었습니다.'; code = 'SESSION_CONFLICT';
            } else if (headerCode === 'ACCOUNT_LOCKED' || bodyCode === 'ACCOUNT_LOCKED' || status === 423) {
                msg = '계정이 잠겨 접속을 해제합니다.'; code = 'ACCOUNT_LOCKED';
            } else {
                msg = '세션이 만료되었거나 해제되었습니다.'; code = 'SESSION_EXPIRED';
            }

            forceLogout(msg, code);
            return new Promise(() => {});
        }

        return Promise.reject(error);
    }
);

// ---------------------------------------------------------------------------
// 9) 초기 부팅 시: 저장된 토큰/현재관리자ID를 기본 헤더에 재적용
// ---------------------------------------------------------------------------
(() => {
    try {
        const saved = (typeof localStorage !== 'undefined') ? localStorage.getItem('accessToken') : '';
        if (saved) api.defaults.headers.common.Authorization = saved.startsWith('Bearer ') ? saved : `Bearer ${saved}`;
    } catch {}

    try {
        const uid = (typeof localStorage !== 'undefined') ? localStorage.getItem('currentAdminId') : '';
        if (uid) api.defaults.headers.common['X-App-User-Id'] = String(uid);
    } catch {}
})();

// ---------------------------------------------------------------------------
// 10) ★ 부트 타임 가드: 미인증 상태에서 /admin/* 직접 접근 시 로그인으로 보냄
// ---------------------------------------------------------------------------
(() => {
    if (typeof window === 'undefined') return;
    const path = window.location.pathname || '';
    const isAdminArea = path.startsWith('/admin/');
    const isLoginPage = /\/admin\/(login|forgot-password|signUp)(\/|$)?/.test(path);
    if (!isAdminArea || isLoginPage) return;

    let hasToken = false;
    try {
        const token = localStorage.getItem('accessToken') || '';
        hasToken = !!token;
    } catch {}

    if (!hasToken) {
        const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.replace(`/admin/login?returnTo=${returnTo}`);
    }
})();

export default api;