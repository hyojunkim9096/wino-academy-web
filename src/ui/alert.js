// src/ui/alert.js
// SweetAlert2 래퍼 유틸리티
// - 프로젝트 전역 알림/확인 다이얼로그 UI 일관성
// - 개행(\n) 표시를 위해 didOpen에서 .swal2-html-container 에 pre-line 적용
// - 오버레이/툴바 충돌 방지: willOpen/didClose에서 body에 modal-open 클래스 토글

import Swal from 'sweetalert2';
import 'sweetalert2/dist/sweetalert2.min.css';

// 기본 포인트 컬러(확인 버튼)
const c = '#4f46e5';

// 공통 훅: 모달 열고 닫을 때 body 상태 반영
const commonHooks = {
    willOpen: () => { document.body.classList.add('modal-open'); },
    didClose: () => { document.body.classList.remove('modal-open'); }
};

// 내부 공통: 개행 유지
function applyPreLine() {
    const el = Swal.getHtmlContainer(); // .swal2-html-container (text/html 모두 이 컨테이너 사용)
    if (el) el.style.whiteSpace = 'pre-line';
}

/** 정보 알림 */
export const alertInfo = (title, text) =>
    Swal.fire({
        icon: 'info',
        title,
        text,
        confirmButtonColor: c,
        didOpen: applyPreLine,
        ...commonHooks
    });

/** 성공 알림 */
export const alertSuccess = (title, text) =>
    Swal.fire({
        icon: 'success',
        title,
        text,
        confirmButtonColor: c,
        didOpen: applyPreLine,
        ...commonHooks
    });

/** 오류 알림 */
export const alertError = (title, text) =>
    Swal.fire({
        icon: 'error',
        title,
        text,
        confirmButtonColor: c,
        didOpen: applyPreLine,
        ...commonHooks
    });

/**
 * 확인 다이얼로그
 * @param {string} title - 타이틀
 * @param {string} text  - 본문(\\n 개행 지원)
 * @param {object} opts  - { confirmText, cancelText, confirmColor, cancelColor }
 * @returns {Promise<boolean>} 사용자가 "확인"을 눌렀는지 여부
 */
export async function confirmDialog(
    title = '확인',
    text = '계속할까요?',
    { confirmText = '확인', cancelText = '취소', confirmColor = '#ef4444', cancelColor = '#334155' } = {}
) {
    const r = await Swal.fire({
        title,
        text,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: confirmText,
        cancelButtonText: cancelText,
        confirmButtonColor: confirmColor,
        cancelButtonColor: cancelColor,
        reverseButtons: true,   // 실수 방지(확인/취소 위치 반전)
        focusCancel: true,      // 기본 포커스를 취소로
        didOpen: applyPreLine,
        ...commonHooks
    });
    return r.isConfirmed;
}

/** ✅ 기존 호출부 호환용 별칭: import { confirm } from '@/ui/alert' 형태 지원 */
export async function confirm(title, text, opts) {
    return confirmDialog(title, text, opts);
}