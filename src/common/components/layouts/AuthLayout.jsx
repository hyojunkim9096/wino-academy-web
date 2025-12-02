// src/common/components/layouts/AuthLayout.jsx
import React from 'react';

/**
 * props
 * - title, subtitle: 상단 문구
 * - bgUrl: 배경 이미지 경로 (기본: /images/adminLoginBg.png)
 * - size: 카드 최대폭 프리셋
 *    'sm'  -> max-w-sm
 *    'md'  -> max-w-md (기본)
 *    'lg'  -> max-w-2xl
 *    'xl'  -> max-w-3xl   (신규등록에 추천)
 *    '2xl' -> max-w-4xl   (더 넓게 원할 때)
 *    또는 Tailwind 클래스 문자열 직접 전달 가능 (예: 'max-w-[920px]')
 * - cardClassName: 카드 추가 클래스
 */
export default function AuthLayout({
                                       title,
                                       subtitle,
                                       children,
                                       bgUrl = '/images/adminLoginBg.png',
                                       size = 'md',
                                       cardClassName = '',
                                   }) {
    // size 매핑 (문자열 직접 넘기면 그대로 사용)
    const preset = {
        sm: 'max-w-sm',
        md: 'max-w-md',
        lg: 'max-w-2xl',
        xl: 'max-w-3xl',
        '2xl': 'max-w-4xl',
    };
    const sizeClass = preset[size] || size; // 지정 프리셋 또는 사용자 정의 클래스

    return (
        <div className="relative min-h-screen w-full overflow-hidden">
            {/* 배경 이미지 */}
            <div className="absolute inset-0">
                <div
                    aria-hidden
                    className="h-full w-full bg-center bg-cover"
                    style={{ backgroundImage: `url('${bgUrl}')` }}
                />
                <div className="absolute inset-0 bg-gradient-to-b from-black/50 to-black/30" />
            </div>

            {/* 콘텐츠 (카드) */}
            <div className="relative z-10 flex min-h-screen items-center justify-center p-4">
                <div
                    className={`w-full ${sizeClass} rounded-2xl border border-white/20 bg-white/75 p-8 shadow-2xl backdrop-blur-md ${cardClassName}`}
                >
                    {title && (
                        <h1 className="mb-2 text-center text-2xl font-bold text-gray-900">
                            {title}
                        </h1>
                    )}
                    {subtitle && (
                        <p className="mb-6 text-center text-sm text-gray-600">{subtitle}</p>
                    )}

                    {children}
                </div>
            </div>
        </div>
    );
}
