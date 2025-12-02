// src/common/api/authApi.js
// ============================================================================
// 인증/세션 API 모듈
// ----------------------------------------------------------------------------
// 이 모듈은 다음 책임을 가진다.
// 1) 로그인: JWT를 'Bearer ' 접두사가 1번만 붙은 형태로 정규화해 저장하고,
//    axios 기본 헤더(Authorization)에 즉시 반영한다.
// 2) 로그인 직후 /auth/me 로 현재 관리자 정보를 읽어와
//    localStorage.currentAdminId 에 저장한다.
//    → 모든 API 요청 인터셉터에서 'X-App-User-Id' 헤더로 자동 첨부(이벤트 이력 event_by 용).
// 3) 공개(비인증) API인 비밀번호 재설정 요청/확정은 전역 인증 팝업을 비활성화한다.
// 4) ping/me/logout 등 기본 인증 관련 호출을 한 곳에서 관리한다.
// 5) 🔔 [추가] 토큰이 변경될 때마다 window 에 'auth:token' 이벤트를 발생시킨다.
//    - CommonCodeProvider 등에서 이 이벤트를 구독해, 로그인/로그아웃에 반응할 수 있게 함.
// ============================================================================

import api from './client.js';

// ---------------------------------------------------------------------------
// 내부 유틸: 'Bearer ' 접두사 정규화
// - 서버가 'Bearer <jwt>' 또는 '<jwt>' 둘 다 반환할 수 있으므로 일관화 필요
// ---------------------------------------------------------------------------
function normalizeBearer(raw) {
    if (!raw || typeof raw !== 'string') return '';
    return raw.startsWith('Bearer ') ? raw : `Bearer ${raw}`;
}

// ---------------------------------------------------------------------------
// 토큰 변경 이벤트 전파 유틸
// - setAuthToken / clearAuthState 에서 호출
// - detail: { token: string | null }
// ---------------------------------------------------------------------------
function fireAuthTokenEvent(token) {
    try {
        window.dispatchEvent(
            new CustomEvent('auth:token', {
                detail: { token: token || null },
            })
        );
    } catch {
        // window 또는 CustomEvent 를 사용할 수 없는 환경이면 조용히 무시
    }
}

// ---------------------------------------------------------------------------
// 토큰/헤더 적용 & 정리 헬퍼 (필요 시 외부에서 재사용할 수 있게 export)
// ---------------------------------------------------------------------------
export function setAuthToken(headerToken) {
    // 1) localStorage 에 토큰 저장/삭제
    try {
        if (headerToken) {
            // 유효한 토큰이면 그대로 저장
            localStorage.setItem('accessToken', headerToken);
        } else {
            // null/빈 값 → 키 자체를 제거
            localStorage.removeItem('accessToken');
        }
    } catch {
        // storage 접근 실패해도 치명적이지 않으므로 무시
    }

    // 2) axios 전역 Authorization 헤더 적용/삭제
    if (headerToken) {
        api.defaults.headers.common.Authorization = headerToken;
    } else {
        try {
            delete api.defaults.headers.common.Authorization;
        } catch {
            /* noop */
        }
    }

    // 3) 🔔 토큰 변경 이벤트 전파
    //    - 로그인/새로고침 시: token 문자열
    //    - 로그아웃/초기화 시: null
    fireAuthTokenEvent(headerToken || null);
}

/**
 * 인증 상태 전체 클리어
 * - 토큰/현재관리자ID 제거 + 헤더 정리
 * - 로그아웃, 403 처리 등에서 사용
 */
export function clearAuthState() {
    // 1) 저장된 토큰/현재관리자ID 제거
    try {
        localStorage.removeItem('accessToken');
    } catch {}
    try {
        localStorage.removeItem('currentAdminId');
    } catch {}

    // 2) axios 전역 헤더 제거
    try {
        delete api.defaults.headers.common.Authorization;
    } catch {}
    try {
        delete api.defaults.headers.common['X-App-User-Id'];
    } catch {}

    // 3) 🔔 토큰 null 이벤트도 한 번 더 쏴줌 (로그아웃 알림용)
    fireAuthTokenEvent(null);
}

// ---------------------------------------------------------------------------
// 현재 관리자 ID 보관(X-App-User-Id 연동)
// - 서버 히스토리 트리거 event_by에 admin_user_info.id를 넣기 위해,
//   모든 요청 인터셉터에서 localStorage.currentAdminId를 읽어 헤더로 싣는다.
// ---------------------------------------------------------------------------
export function saveCurrentAdminId(id) {
    if (id == null) return;
    const val = String(id);
    try {
        localStorage.setItem('currentAdminId', val);
    } catch {}
    api.defaults.headers.common['X-App-User-Id'] = val;
}

// ---------------------------------------------------------------------------
// 로그인
// - 서버가 'Bearer <jwt>' 또는 '<jwt>' 둘 다 가능 → 항상 'Bearer ' 접두로 정규화
// - 받은 토큰을 저장하고, axios 기본 헤더에 즉시 반영
// - (선택) 로그인 직후 3초 그레이스 윈도우 기록 → ping/me 401/423 일시무시
// ---------------------------------------------------------------------------
export const login = async ({ userId, password }) => {
    const res = await api.post('/auth/login', { userId, password });

    // 서버 응답: 문자열 자체 또는 { token: '...' } 형식
    const raw = typeof res.data === 'string' ? res.data : res.data?.token;
    if (!raw) throw new Error('토큰 응답이 없습니다.');

    // ✅ 핵심: 토큰을 항상 'Bearer ' 1번만 붙인 형태로 정규화
    const headerToken = normalizeBearer(raw);

    // 저장 및 전역 헤더 적용 + auth:token 이벤트 발행
    setAuthToken(headerToken);

    // 로그인 직후 잠깐 발생할 수 있는 ping/me 401/423 무시용 (선택)
    try {
        sessionStorage.setItem(
            'auth:graceUntil',
            String(Date.now() + 3000)
        );
    } catch {}

    return headerToken;
};

// ---------------------------------------------------------------------------
// 로그인 직후 세션 초기화
// - /auth/me 로부터 id를 받아 currentAdminId 저장(X-App-User-Id 자동 첨부)
// - 호출부: 로그인 성공 직후(AdminLoginPage 등)
// ---------------------------------------------------------------------------
export const initSessionAfterLogin = async () => {
    const me = await fetchMe(); // { id, userId, userName, remainingSeconds, ... }
    if (me?.id != null) saveCurrentAdminId(me.id);
    return me;
};

// ---------------------------------------------------------------------------
// 내 정보 조회 (/auth/me)
// - 남은 세션 시간(remainingSeconds) 등도 함께 수신할 수 있음
// ---------------------------------------------------------------------------
export const fetchMe = async () => (await api.get('/auth/me')).data;

// ---------------------------------------------------------------------------
// 세션 연장(ping)
// ---------------------------------------------------------------------------
export const ping = async () => (await api.post('/auth/ping')).data;

// ---------------------------------------------------------------------------
// 로그아웃(서버 세션 종료)
// - 전역 인증 팝업 억제(skipAuthErrorPopup)
//   (로그아웃 시도 도중 401/403이 나도 화면이 크게 흔들리지 않게 하기 위함)
// ---------------------------------------------------------------------------
export const logout = async () => {
    try {
        await api.post('/auth/logout', null, { skipAuthErrorPopup: true });
    } catch {
        // 서버 세션이 이미 끊긴 상태여도 무시
    } finally {
        // 클라이언트 쪽 상태도 정리
        clearAuthState();
    }
};

// ---------------------------------------------------------------------------
// 공개 API: 비밀번호 재설정 요청/확정
// - 공개 엔드포인트이므로 전역 인증 오류 팝업을 끈다(skipAuthErrorPopup: true).
// - ForgotPasswordPage / ResetPasswordPage 에서 import 해서 사용.
// ---------------------------------------------------------------------------
export const requestPasswordReset = async (userId) =>
    (
        await api.post(
            '/auth/password-reset/request',
            { userId },
            { skipAuthErrorPopup: true }
        )
    ).data;

export const confirmPasswordReset = async ({ userId, code, newPassword }) =>
    (
        await api.post(
            '/auth/password-reset/confirm',
            { userId, code, newPassword },
            { skipAuthErrorPopup: true }
        )
    ).data;

// ---------------------------------------------------------------------------
// 모듈 로드 시: 저장된 토큰/관리자ID를 axios 전역 헤더에 복원(페이지 새로고침 대응)
// - 새로고침 이후에도 로그인 유지.
// - setAuthToken(..) 호출 시 auth:token 이벤트도 자동 발행됨.
// ---------------------------------------------------------------------------
(() => {
    try {
        const saved = localStorage.getItem('accessToken');
        if (saved) {
            // 저장된 토큰이 있으면 Authorization 헤더/이벤트까지 한 번에 복원
            setAuthToken(normalizeBearer(saved));
        }
    } catch {
        /* noop */
    }

    try {
        const uid = localStorage.getItem('currentAdminId');
        if (uid) {
            api.defaults.headers.common['X-App-User-Id'] = String(uid);
        }
    } catch {
        /* noop */
    }
})();
