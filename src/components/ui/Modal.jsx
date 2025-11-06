// src/components/ui/Modal.jsx
import React, { useEffect } from 'react';

/**
 * 공통 모달
 * - 배경 클릭 / ESC 로 닫기
 * - size 프리셋으로 가로폭 제어 + contentClassName 으로 세밀 조정
 *
 * 사용법 예)
 *  <Modal title="학교 검색" onClose={...} size="2xl" contentClassName="max-h-[85vh]">
 *    ...컨텐츠...
 *  </Modal>
 */
export default function Modal({
                                  title,
                                  children,
                                  onClose,
                                  className = '',          // 기존 호환을 위해 유지(패널에 추가로 붙는 클래스)
                                  size = 'md',             // 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full' | 커스텀 클래스 문자열
                                  contentClassName = '',   // 패널에 세밀한 커스텀 클래스 추가(높이/패딩 등)
                              }) {
    // ESC 로 닫기
    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    // 사이즈 프리셋 → Tailwind max-w 클래스 매핑
    // 필요 시 size 에 커스텀 클래스 문자열을 바로 넘겨도 동작함(아래에서 그대로 적용)
    const sizeClass =
        ({
            sm: 'max-w-md',     // ~ 28rem
            md: 'max-w-xl',     // ~ 36rem (기본 너비 조금 키움: 기존 max-w-md 보다 여유)
            lg: 'max-w-2xl',    // ~ 42rem
            xl: 'max-w-4xl',    // ~ 56rem
            '2xl': 'max-w-6xl', // ~ 72rem
            full: 'max-w-[95vw]',
        }[size]) || size;     // 프리셋 외 문자열을 직접 넘기면 그대로 사용

    return (
        <div
            className="fixed inset-0 z-[1000] flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-label={title || 'modal'}
        >
            {/* 오버레이(배경) */}
            <div className="absolute inset-0 bg-black/60" onClick={onClose} />

            {/* 패널: 사이즈/높이 스크롤/테두리/둥근모서리/그림자/패딩 적용 */}
            <div
                className={`relative w-full ${sizeClass} mx-4 bg-slate-900 border border-slate-700 rounded-xl shadow-xl p-5 max-h-[85vh] overflow-auto ${className} ${contentClassName}`}
            >
                {/* 헤더(제목 + 닫기 버튼) */}
                <div className="flex items-center justify-between mb-3">
                    {title ? <div className="text-white font-semibold">{title}</div> : <div />}
                    <button className="aa-btn" onClick={onClose} title="닫기" aria-label="닫기">닫기</button>
                </div>

                {/* 컨텐츠 */}
                {children}
            </div>
        </div>
    );
}