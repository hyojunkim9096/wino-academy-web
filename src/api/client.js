// src/api/client.js
import axios from 'axios';

const api = axios.create({ baseURL: '/api', withCredentials: false });

// BroadcastChannel (탭 간 통신)
let bc;
try { bc = new BroadcastChannel('auth-channel'); } catch { bc = null; }

// 메시지 키/가드
const MSG_KEY   = 'logoutMessage';
const GUARD_KEY = 'logout:inflight';

// 유틸: 메시지 저장(로그인 화면에서 읽어서 안내)
function putMsg(msg){
    try{
        sessionStorage.setItem(MSG_KEY, msg || '');
        sessionStorage.setItem('kickMsg', msg || '');
    }catch{}
}

// 유틸: 가드(중복 강제 로그아웃 방지)
function setGuard(on){
    try{ on ? sessionStorage.setItem(GUARD_KEY,'1') : sessionStorage.removeItem(GUARD_KEY);}catch{}
}
function hasGuard(){
    try{ return !!sessionStorage.getItem(GUARD_KEY);}catch{ return false;}
}

// 유틸: 경로만 뽑기
function pathOf(url){
    if(!url) return '';
    try{
        if(url.startsWith('http://') || url.startsWith('https://')) return new URL(url).pathname;
        return url;
    }catch{ return url; }
}

// 코드→쿼리 매핑 (백업 경로용)
function codeToReason(code) {
    switch (code) {
        case 'SESSION_CONFLICT': return 'conflict';
        case 'ACCOUNT_LOCKED'  : return 'locked';
        case 'SESSION_EXPIRED' :
        default                : return 'expired';
    }
}

// ✅ 강제 로그아웃 & 이동(BC 방송 여부 옵션 추가)
// - 메시지는 sessionStorage에 저장
// - /admin/login?reason=... 쿼리로도 전달(백업 안내)
// - 다른 탭으로 code 포함 방송(옵션)
// - 동일 탭/중복 호출 가드는 hasGuard()/setGuard()
function forceLogout(msg, code='SESSION_EXPIRED', opts = {}) {
    const { broadcast = true } = opts;
    if (hasGuard()) return;
    setGuard(true);

    // 토큰 제거
    try{ localStorage.removeItem('accessToken'); }catch{}
    try{ delete api.defaults.headers.common.Authorization; }catch{}

    // 메시지 저장
    putMsg(msg);

    // 다른 탭에 알림 (code 포함)
    try{ if (bc && broadcast) bc.postMessage({ type:'force-logout', msg, code }); }catch{}

    // 이동 (백업 쿼리 동봉)
    const reason = codeToReason(code);
    if (typeof window!=='undefined') {
        setTimeout(() => { window.location.href = `/admin/login?reason=${encodeURIComponent(reason)}`; }, 10);
    }
}

// ✅ 다른 탭에서 오는 강제 로그아웃 방송 수신
try{
    if (bc) {
        bc.onmessage = (e) => {
            const data = e?.data;
            if (data?.type === 'force-logout') {
                // 방송을 받고 처리할 때는 재방송(broadcast=false)로 루프 방지
                forceLogout(data.msg, data.code, { broadcast: false });
            }
        };
    }
}catch{}

// 요청 인터셉터: Authorization 보정(Bearer 접두 보장)
api.interceptors.request.use((config) => {
    const raw = (
        config.headers?.Authorization ||
        config.headers?.authorization ||
        api.defaults.headers.common.Authorization ||
        (typeof localStorage !== 'undefined' && localStorage.getItem('accessToken')) ||
        ''
    );
    if (raw) {
        const val = raw.startsWith('Bearer ') ? raw : `Bearer ${raw}`;
        config.headers = { ...(config.headers || {}), Authorization: val };
    }
    return config;
});

// 응답 인터셉터: 전역 401/403/423 처리
api.interceptors.response.use(
    (resp) => resp,
    (error) => {
        // 공개 API 등에서 전역 처리 끄기
        if (error?.config?.skipAuthErrorPopup) return Promise.reject(error);
        if (!error?.response) return Promise.reject(error);

        const status = error.response.status;
        const reqUrl = pathOf(error?.config?.url || '');

        // 로그인/비번/리셋 화면에서는 전역 팝업 무시
        const pathname = (typeof window !== 'undefined' && window.location) ? window.location.pathname : '';
        const onLoginLikePage = /\/admin\/(login|password|reset|find)/.test(pathname || '');
        if (onLoginLikePage && (status===401 || status===403 || status===423)) return Promise.reject(error);

        // /auth/login 실패는 각 페이지에서 처리
        if (/\/auth\/login(\b|\/|$)/.test(reqUrl)) return Promise.reject(error);

        // 토큰 없는 ping/me 401/403은 무시 (초기 레이스 방지)
        const isPingOrMe = /\/auth\/(ping|me)(\b|\/|$)/.test(reqUrl);
        const hasJwt = !!(typeof localStorage !== 'undefined' && localStorage.getItem('accessToken'));
        if (!hasJwt && isPingOrMe && (status===401 || status===403)) return Promise.reject(error);

        if (status===401 || status===403 || status===423) {
            // ✅ 헤더 파싱 강화(대소문자/하이픈/언더스코어 변형 다 대응)
            const headers = (error.response && error.response.headers) || {};
            const headerCode = (
                headers['x-auth-error']  || headers['X-Auth-Error'] ||
                headers['x-auth_code']   || headers['X-Auth_Code']  ||
                headers['x-auth-code']   || headers['X-Auth-Code']  ||  // ← 보강
                ''
            ).toString();
            const body = error.response.data;
            const bodyCode = (body && (body.error || body.code)) || '';

            // 403은 '권한 없음'일 수 있으므로 세션 종료 대신 안내만 (충돌/잠금은 예외)
            if (status === 403) {
                const isConflict = (headerCode==='SESSION_CONFLICT' || bodyCode==='SESSION_CONFLICT');
                const isLocked   = (headerCode==='ACCOUNT_LOCKED'   || bodyCode==='ACCOUNT_LOCKED');
                if (!isConflict && !isLocked) {
                    return Promise.reject(error);
                }
            }

            // 메시지 & 코드 결정
            let msg='', code='SESSION_EXPIRED';
            if (isPingOrMe || headerCode==='SESSION_CONFLICT' || bodyCode==='SESSION_CONFLICT'){
                msg='다른 장소에서 로그인하여 로그아웃 되었습니다.'; code='SESSION_CONFLICT';
            } else if (headerCode==='ACCOUNT_LOCKED' || bodyCode==='ACCOUNT_LOCKED' || status===423){
                msg='계정이 잠겨 접속을 해제합니다.'; code='ACCOUNT_LOCKED';
            } else {
                msg='세션이 만료되었거나 해제되었습니다.'; code='SESSION_EXPIRED';
            }

            forceLogout(msg, code); // 기본: 방송 on
            // 체인 종료(중복 처리 방지)
            return new Promise(()=>{});
        }
        return Promise.reject(error);
    }
);

// 새로고침 시 헤더 보정
(() => {
    const saved = (typeof localStorage !== 'undefined') ? localStorage.getItem('accessToken') : '';
    if (saved) api.defaults.headers.common.Authorization = saved.startsWith('Bearer ') ? saved : `Bearer ${saved}`;
})();

export default api;
