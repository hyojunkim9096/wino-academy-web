// src/common/components/ui/ImagePreview.jsx
import React, { useCallback, useEffect, useState } from 'react';

/** 파일 ID로 원본 이미지 URL 생성 (캐시버스팅용 version 지원) */
export function buildFileUrl(fileId, version) {
    const origin = import.meta?.env?.VITE_API_ORIGIN || '';
    const base = origin ? origin.replace(/\/$/, '') : '';
    const v = Number.isFinite(version) ? version : 0;
    return `${base}/api/files/${fileId}/raw?v=${v}`;
}

/** 쿼리스트링에 v(버전) 붙이기 */
function withBust(url, version) {
    const v = Number.isFinite(version) ? version : 0;
    if (!url) return '';
    const hasQuery = url.includes('?');
    return `${url}${hasQuery ? '&' : '?'}v=${v}`;
}

/** 이미지 확대 모달 (src 직접 전달) */
export function ImagePreviewModal({ src, alt, onClose }) {
    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center">
            <div className="absolute inset-0 bg-black/70" onClick={onClose} />
            <div className="relative mx-4 max-w-[90vw]">
                <button
                    onClick={onClose}
                    className="absolute -top-3 -right-3 bg-slate-900 text-white border border-slate-700 rounded-full px-2 py-1"
                    aria-label="닫기"
                    title="닫기"
                >×</button>
                <img
                    src={src}
                    alt={alt || '이미지'}
                    className="max-h-[85vh] w-auto max-w-[90vw] object-contain rounded-lg shadow-2xl border border-slate-700 bg-black"
                />
            </div>
        </div>
    );
}

/**
 * 이미지 프리뷰 훅
 * - openPreview(fileIdOrSrc, alt?, explicitUrl?)
 *     · explicitUrl 이 있으면 그걸 그대로 사용 (+ 캐시버스터)
 *     · 없으면 fileId 숫자/UUID 추정 시 /api/files/{id}/raw (+ 캐시버스터)
 *     · 그 외는 문자열을 src 로 간주
 * - PreviewPortal: 모달 JSX
 */
export function useImagePreview(version) {
    const [preview, setPreview] = useState(null); // { src, alt }

    const openPreview = useCallback((fileIdOrSrc, alt, explicitUrl) => {
        let src = '';

        // 1) 명시 URL이 오면 최우선 사용
        if (explicitUrl && typeof explicitUrl === 'string') {
            src = withBust(explicitUrl, version);
        } else {
            const s = String(fileIdOrSrc ?? '');

            // 2) 파일ID(숫자 또는 UUID 형태)로 추정되면 /api/files/{id}/raw 사용
            const isNumericId = /^\d+$/.test(s);
            const looksUuid   = /^[0-9a-fA-F-]{16,}$/.test(s); // 간단 UUID 탐지(하이픈 포함)

            if (isNumericId || looksUuid) {
                src = buildFileUrl(s, version);
            } else {
                // 3) 그냥 src 로 취급 (상대/절대/업로드 경로 모두 포함)
                src = withBust(s, version);
            }
        }

        setPreview({ src, alt });
    }, [version]);

    const closePreview = useCallback(() => setPreview(null), []);
    const PreviewPortal = preview ? (
        <ImagePreviewModal src={preview.src} alt={preview.alt} onClose={closePreview} />
    ) : null;

    return { preview, openPreview, closePreview, PreviewPortal };
}
