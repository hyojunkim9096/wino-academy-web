// src/api/adminApi.js
// ============================================================================
// 관리자 관련 공개 API (특히 "신규 등록" 전용)
// ----------------------------------------------------------------------------
// registerAdmin:
//   1) in-flight 플래그로 중복 클릭 방지
//   2) 기본 5초 쿨다운 정책(프론트 측에서만)
//   3) 서버로 X-Idempotency-Key 헤더 전송 (멱등성 보장)
//   4) SignUpRequest DTO 와 1:1 매핑되는 payload 구성
//      - userId, userName, birthdate, password, employeeType, email (필수)
//      - 그 외 연락처/주소는 null 허용
// ============================================================================

import api from './client';

// ----------------------------------------------------------------------------
// 신규 등록 이중저장 방지 정책
// ----------------------------------------------------------------------------
const REGISTER_COOLDOWN_MS = 5_000; // 5초
let registerInFlight = false;
let lastRegisterAt = 0;

// 간단 uuid (멱등키 생성용)
function uuidv4() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    // 브라우저 호환용 폴백
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

// 쿨다운 에러 객체
function cooldownError(remainingMs) {
    const err = new Error(
        `너무 빠른 재시도입니다. ${Math.ceil(remainingMs / 1000)}초 후 다시 시도하세요.`
    );
    err.code = 'COOLDOWN_ACTIVE';
    err.remainingSeconds = Math.ceil(remainingMs / 1000);
    return err;
}

// in-flight 중복 요청 에러 객체
function inflightError() {
    const err = new Error('요청 처리 중입니다. 잠시만 기다려주세요.');
    err.code = 'IN_FLIGHT';
    return err;
}

// 문자열: null/undefined → null, 공백 문자열 → null
const nz = (s) => {
    if (s == null) return null;
    const t = String(s).trim();
    return t.length ? t : null;
};

/**
 * 관리자 신규 등록
 *
 * @param form {object}
 *   { userId, userName, password, employeeType, birthdate, email,
 *     phoneNumber, emergencyContact, postalCode, address, detailAddress }
 *
 * @param opts {object}
 *   { force?: boolean, idempotencyKey?: string }
 *
 * - force = true 이면 in-flight / 쿨다운 체크를 무시 (테스트용)
 */
export const registerAdmin = async (form, opts = {}) => {
    const now = Date.now();
    const { force = false, idempotencyKey = uuidv4() } = opts;

    // -------------------------------
    // in-flight / 쿨다운 체크
    // -------------------------------
    if (!force) {
        if (registerInFlight) throw inflightError();
        const elapsed = now - lastRegisterAt;
        if (elapsed < REGISTER_COOLDOWN_MS) {
            throw cooldownError(REGISTER_COOLDOWN_MS - elapsed);
        }
    }

    // -------------------------------
    // 서버로 보낼 payload 구성
    //  - SignUpRequest DTO 와 1:1 매핑
    // -------------------------------
    const payload = {
        userId: nz(form.userId),
        userName: nz(form.userName),
        password: form.password,         // 비밀번호는 공백 허용 X, 아래에서 길이 체크
        employeeType: form.employeeType, // "STAFF" / "TEACHER"
        // ✅ 생년월일은 필수값: 값이 없으면 undefined/'' 그대로 두고 아래 검증에서 막음
        birthdate: form.birthdate,
        email: nz(form.email),
        phoneNumber: nz(form.phoneNumber),
        emergencyContact: nz(form.emergencyContact),
        postalCode: nz(form.postalCode),
        address: nz(form.address),
        detailAddress: nz(form.detailAddress),
    };

    // -------------------------------
    // 프런트 단 1차 검증 (사용자 친화적인 메시지)
    //  - 백엔드에서도 @Valid 로 2차 검증됨
    // -------------------------------
    if (!payload.userId) {
        throw new Error('아이디는 필수입니다.');
    }
    if (!payload.userName) {
        throw new Error('이름은 필수입니다.');
    }
    if (!payload.password || payload.password.length < 8) {
        throw new Error('비밀번호는 8자 이상이어야 합니다.');
    }
    if (!payload.birthdate) {
        throw new Error('생년월일은 필수입니다.');
    }
    if (!payload.email) {
        throw new Error('이메일은 필수입니다.');
    }

    try {
        registerInFlight = true;
        lastRegisterAt = now;

        await api.post('/admin/register', payload, {
            headers: { 'X-Idempotency-Key': idempotencyKey },
            // 공개 API라 인증 에러 팝업은 스킵
            skipAuthErrorPopup: true,
        });
    } catch (err) {
        // 409(CONFLICT)인 경우 메시지 가공
        if (err?.response?.status === 409) {
            const norm = new Error(
                err?.response?.data?.message || '이미 존재하거나 중복 제출이 감지되었습니다.'
            );
            norm.code = err?.response?.data?.code || 'CONFLICT';
            throw norm;
        }
        throw err;
    } finally {
        registerInFlight = false;
    }
};
