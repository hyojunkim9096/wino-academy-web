// src/api/adminApi.js
import api from './client';

/**
 * 신규 등록 이중저장 방지 정책
 * 1) 진행 중 중복 클릭 차단 (in-flight lock)
 * 2) 너무 빠른 재시도 차단 (기본 5초 쿨다운)
 * 3) 서버 멱등성 키 전송 (X-Idempotency-Key)
 */
const REGISTER_COOLDOWN_MS = 5_000;
let registerInFlight = false;
let lastRegisterAt = 0;

// 간단 uuid
function uuidv4() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0; const v = c === 'x' ? r : (r & 0x3) | 0x8; return v.toString(16);
    });
}
function cooldownError(remainingMs) {
    const err = new Error(`너무 빠른 재시도입니다. ${Math.ceil(remainingMs / 1000)}초 후 다시 시도하세요.`);
    err.code = 'COOLDOWN_ACTIVE';
    err.remainingSeconds = Math.ceil(remainingMs / 1000);
    return err;
}
function inflightError() {
    const err = new Error('요청 처리 중입니다. 잠시만 기다려주세요.');
    err.code = 'IN_FLIGHT';
    return err;
}
const nz = (s) => {
    if (s == null) return null;
    const t = String(s).trim();
    return t.length ? t : null;
};

/** ✅ 신규 등록 */
export const registerAdmin = async (form, opts = {}) => {
    const now = Date.now();
    const { force = false, idempotencyKey = uuidv4() } = opts;

    if (!force) {
        if (registerInFlight) throw inflightError();
        const elapsed = now - lastRegisterAt;
        if (elapsed < REGISTER_COOLDOWN_MS) throw cooldownError(REGISTER_COOLDOWN_MS - elapsed);
    }

    const payload = {
        userId: nz(form.userId),
        userName: nz(form.userName),
        password: form.password,
        employeeType: form.employeeType,
        email: nz(form.email),
        phoneNumber: nz(form.phoneNumber),
        emergencyContact: nz(form.emergencyContact),
        postalCode: nz(form.postalCode),
        address: nz(form.address),
        detailAddress: nz(form.detailAddress),
    };

    if (!payload.userId) throw new Error('아이디는 필수입니다.');
    if (!payload.userName) throw new Error('이름은 필수입니다.');
    if (!payload.password || payload.password.length < 8) throw new Error('비밀번호는 8자 이상이어야 합니다.');

    try {
        registerInFlight = true;
        lastRegisterAt = now;

        await api.post('/admin/register', payload, {
            headers: { 'X-Idempotency-Key': idempotencyKey },
            skipAuthErrorPopup: true, // 공개 API라 인증팝업 불필요
        });
    } catch (err) {
        if (err?.response?.status === 409) {
            const norm = new Error(err?.response?.data?.message || '이미 존재하거나 중복 제출이 감지되었습니다.');
            norm.code = err?.response?.data?.code || 'CONFLICT';
            throw norm;
        }
        throw err;
    } finally {
        registerInFlight = false;
    }
};
