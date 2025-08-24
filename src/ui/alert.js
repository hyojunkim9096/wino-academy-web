// 전체 추가
import Swal from 'sweetalert2';
import 'sweetalert2/dist/sweetalert2.min.css';

const c = '#4f46e5';

export const alertInfo = (title, text) =>
    Swal.fire({ icon: 'info', title, text, confirmButtonColor: c });

export const alertSuccess = (title, text) =>
    Swal.fire({ icon: 'success', title, text, confirmButtonColor: c });

export const alertError = (title, text) =>
    Swal.fire({ icon: 'error', title, text, confirmButtonColor: c });

export async function confirmDialog(
    title = '확인',
    text = '계속할까요?',
    { confirmText = '확인', cancelText = '취소', confirmColor = '#ef4444', cancelColor = '#334155' } = {}
) {
    const r = await Swal.fire({
        title, text, icon: 'question',
        showCancelButton: true,
        confirmButtonText: confirmText,
        cancelButtonText: cancelText,
        confirmButtonColor: confirmColor,
        cancelButtonColor: cancelColor,
        reverseButtons: true,
        focusCancel: true
    });
    return r.isConfirmed;
}