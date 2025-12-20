// src/common/components/ui/Modal.jsx
import React, { useEffect, useMemo } from 'react';

/**
 * 공통 모달
 * - 배경 클릭 / ESC 로 닫기
 * - size 프리셋으로 가로폭 제어 + contentClassName 으로 세밀 조정
 *
 * ✅ 개선(하위 호환 유지)
 *  - scroll 옵션 추가:
 *      scroll="panel"(기본): 패널 전체가 스크롤(기존과 동일)
 *      scroll="body": 헤더는 고정, 본문만 스크롤 (리스트가 긴 모달에 추천)
 *
 * 사용 예)
 *  <Modal title="보호자 검색" onClose={...} size="lg" scroll="body">
 *    ...내용...
 *  </Modal>
 */
export default function Modal({
                                  title,
                                  children,
                                  onClose,
                                  className = '',
                                  size = 'md',
                                  contentClassName = '',

                                  // ✅ 신규 옵션: 스크롤 방식 (기본은 기존과 동일)
                                  scroll = 'panel', // 'panel' | 'body'
                              }) {
    // ESC 로 닫기
    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    // 사이즈 프리셋 → Tailwind max-w 클래스 매핑
    const sizeClass =
        ({
            sm: 'max-w-md',
            md: 'max-w-xl',
            lg: 'max-w-2xl',
            xl: 'max-w-4xl',
            '2xl': 'max-w-6xl',
            full: 'max-w-[95vw]',
        }[size]) || size;

    // 스크롤 모드에 따라 패널/본문 클래스 분리
    const panelOverflowClass = useMemo(() => {
        // 기존 동작(패널 전체 스크롤)
        if (scroll === 'panel') return 'max-h-[85vh] overflow-auto';
        // 헤더 고정 + 본문만 스크롤
        return 'max-h-[85vh] overflow-hidden';
    }, [scroll]);

    const bodyOverflowClass = useMemo(() => {
        if (scroll === 'body') return 'overflow-auto max-h-[calc(85vh-56px)]';
        return ''; // panel 스크롤일 때는 별도 바디 스크롤 필요 없음
    }, [scroll]);

    return (
        <div
            className="fixed inset-0 z-[1000] flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-label={title || 'modal'}
        >
            {/* 오버레이 */}
            <div className="absolute inset-0 bg-black/60" onClick={onClose} />

            {/* 패널 */}
            <div
                className={[
                    'relative w-full',
                    sizeClass,
                    'mx-4 bg-slate-900 border border-slate-700 rounded-xl shadow-xl p-5',
                    panelOverflowClass,
                    className,
                    contentClassName,
                ].join(' ')}
            >
                {/* 헤더 */}
                <div className="flex items-center justify-between mb-3">
                    {title ? <div className="text-white font-semibold">{title}</div> : <div />}
                    <button className="aa-btn" onClick={onClose} title="닫기" aria-label="닫기">닫기</button>
                </div>

                {/* 본문 (scroll="body"일 때만 스크롤) */}
                <div className={bodyOverflowClass}>
                    {children}
                </div>
            </div>
        </div>
    );
}
