// 아바타: 이미지가 있으면 SafeImage, 없으면 이니셜 원형 뱃지
import React from 'react';
import SafeImage from './SafeImage';

function initials(name='') {
    const s = String(name).trim();
    if (!s) return 'U';
    const parts = s.split(/\s+/);
    if (parts.length === 1) return parts[0][0]?.toUpperCase() || 'U';
    return (parts[0][0] + parts[1][0]).toUpperCase();
}

/**
 * props:
 *  - src: 공개 URL(예: /uploads/staff/1/photo.jpg) — 권장
 *  - name: 표시명(이니셜용)
 *  - size: 픽셀 (기본 36)
 *  - version: 캐시버스터 seed (업로드 직후 강제갱신)
 *  - className, onClick
 */
export default function Avatar({ src, name, size=36, version, className='', onClick }) {
    const px = Number(size) || 36;

    if (src) {
        return (
            <SafeImage
                src={src}
                alt={name || 'avatar'}
                width={px}
                height={px}
                version={version}
                onClick={onClick}
                className={`rounded-full border border-slate-700 bg-slate-800 ${className}`}
                style={{ width: px, height: px }}
            />
        );
    }

    // fallback: 이니셜
    return (
        <div
            onClick={onClick}
            className={`flex items-center justify-center rounded-full border border-slate-700 bg-slate-800 text-slate-200 ${className}`}
            style={{ width: px, height: px, fontWeight: 700, fontSize: Math.max(11, Math.floor(px/3)) }}
            title={name}
        >
            {initials(name)}
        </div>
    );
}
