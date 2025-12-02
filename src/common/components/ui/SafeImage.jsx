// src/common/components/ui/SafeImage.jsx
// 안전한 이미지 컴포넌트
// - 타사 <Image> 대신 네이티브 <img>만 사용 (Vite 환경에서 가장 안정)
// - onError 시 placeholder 로 대체
// - object-fit: cover로 아바타/썸네일에 적합
// - cache busting 파라미터(version) 지원

import React, { useMemo, useState } from 'react';

export default function SafeImage({
                                      src,
                                      alt = '',
                                      className = '',
                                      width,
                                      height,
                                      style,
                                      version,        // 캐시 버스터 seed (숫자/문자열)
                                      placeholder = '/assets/avatar-placeholder.svg', // 프로젝트에 있는 기본 아이콘
                                      onClick,
                                  }) {
    const [broken, setBroken] = useState(false);

    const finalSrc = useMemo(() => {
        if (!src || broken) return placeholder;
        // version이 있으면 ?v= 로 캐시 무효화
        const withV = String(src) + (String(src).includes('?') ? '&' : '?') + 'v=' + (version ?? '');
        return withV;
    }, [src, version, broken, placeholder]);

    return (
        <img
            src={finalSrc}
            alt={alt}
            width={width}
            height={height}
            onClick={onClick}
            className={`block object-cover ${className || ''}`}
            style={style}
            onError={() => setBroken(true)}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
        />
    );
}
