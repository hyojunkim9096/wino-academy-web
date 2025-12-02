// src/features/course/components/timetable/TimetableFullscreenModal.jsx
// ---------------------------------------------------------------------------
// 시간표 '크게 보기' 모달(Portal)
// - .academy-page 스코프 안에 TimetableGrid를 넣어 .tt-* CSS가 100% 적용되도록 함
// - 밀도(촘촘/보통/넉넉) → 행 높이(rowHeight) + 요일 최소폭(colMin) 동시 조절
// - 모달 본문을 overflow:auto 로 만들어 가로/세로 스크롤 모두 활성화 (★ 일요일 잘림 방지)
// - ESC/백드롭 닫기 + 배경 스크롤 잠금
// - ✅ 개선점
//   1) days prop 추가(월~금 등 커스텀 지원) + CSS 변수 --tt-days 연동
//   2) open=true로 재오픈 시 density 를 initialDensity 로 리셋
//   3) TimetableGrid 가 이미 .aa-card 를 내장 → 중복 래핑 제거(여기서는 일반 div)
// ---------------------------------------------------------------------------

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import TimetableGrid from './TimetableGrid.jsx';

const canUseDOM = () =>
    typeof window !== 'undefined' && typeof document !== 'undefined';

export default function TimetableFullscreenModal({
                                                     open = false,
                                                     onClose = () => {},
                                                     events = [],
                                                     timeSlots = [],
                                                     showTeacher = false,
                                                     locNameByCode = {},
                                                     // 시작 프리셋 (원하면 페이지에서 props로 바꿔 넘겨도 됨)
                                                     initialDensity = 'cozy',            // 'compact' | 'cozy' | 'comfortable'
                                                     dayMinWidth = 220,                  // 기본 요일 최소폭(px) — density로 다시 보정함
                                                     wrapMaxVH = 84,                     // 세로 최대 높이(vh) — 모달에서 크게 보기
                                                     // ✅ 추가: 표시 요일(기본 월~일) — 페이지에서 [1,2,3,4,5] 같이 전달 가능
                                                     days = [1, 2, 3, 4, 5, 6, 7],
                                                 }) {
    const [density, setDensity] = useState(initialDensity);

    // ✅ 모달을 다시 열 때, density를 초기값으로 리셋
    useEffect(() => {
        if (open) setDensity(initialDensity);
    }, [open, initialDensity]);

    // 행 높이 / 열 최소폭을 밀도에 따라 보정
    const { rowHeight, colMin } = useMemo(() => {
        switch (density) {
            case 'compact':
                return { rowHeight: 56, colMin: Math.max(160, dayMinWidth - 40) };
            case 'comfortable':
                return { rowHeight: 90, colMin: Math.max(240, dayMinWidth + 20) };
            // 'cozy'
            default:
                return { rowHeight: 74, colMin: Math.max(200, dayMinWidth) };
        }
    }, [density, dayMinWidth]);

    // Portal 루트
    const [rootEl, setRootEl] = useState(null);
    useEffect(() => {
        if (!canUseDOM()) return;
        const el = document.createElement('div');
        el.setAttribute('data-timetable-modal-root', 'true');
        document.body.appendChild(el);
        setRootEl(el);
        return () => {
            document.body.removeChild(el);
        };
    }, []);

    // 배경 스크롤 잠금 + ESC 닫기
    useEffect(() => {
        if (!canUseDOM() || !open) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const onKey = (e) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => {
            document.body.style.overflow = prev;
            window.removeEventListener('keydown', onKey);
        };
    }, [open, onClose]);

    if (!open || !canUseDOM() || !rootEl) return null;

    // 레이아웃 스타일
    const overlayStyle = {
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    };
    const backdropStyle = {
        position: 'absolute',
        inset: 0,
        background: 'rgba(0,0,0,.45)',
    };
    const panelStyle = {
        position: 'relative',
        width: 'min(96vw, 1600px)',
        height: 'min(92vh, 1000px)',
        background: 'var(--aa-panel, #101214)',
        border: '1px solid var(--aa-border, #243041)',
        borderRadius: '12px',
        boxShadow: '0 20px 60px rgba(0,0,0,.45)',
        display: 'flex',
        flexDirection: 'column',
        // 패널 자체는 스크롤 숨김 (본문에서 스크롤 담당)
        overflow: 'hidden',
    };
    const headerStyle = {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '.5rem',
        padding: '.65rem .9rem',
        borderBottom: '1px solid var(--aa-border, #243041)',
    };
    // ★ 모달 본문을 스크롤 컨테이너로: 가로/세로 모두 auto (일요일 잘림 방지)
    const bodyStyle = {
        flex: 1,
        minHeight: 0,
        padding: '.4rem .6rem .6rem',
        overflow: 'auto', // ← 가로/세로 스크롤 활성화
    };

    // ★ Timetable 관련 CSS 변수 주입(선택): 일부 전역 CSS가 참조할 수 있어 유지
    //    TimetableGrid는 자체적으로 동일 변수를 설정하므로, 여기 값은 보조 역할입니다.
    const cssVars = {
        ['--tt-day-col-min']: `${colMin}px`,
        ['--tt-wrap-max-h']: `${wrapMaxVH}vh`,
        ['--tt-days']: days.length, // ✅ days 길이에 맞춤
    };

    return createPortal(
        <div style={overlayStyle} role="dialog" aria-modal="true" aria-label="시간표 크게 보기">
            {/* 배경 클릭 → 닫기 */}
            <div style={backdropStyle} onClick={onClose} />

            {/* 패널(클릭 시 닫히지 않음) */}
            <div className="tt-fullscreen-panel" style={panelStyle}>
                {/* 헤더 */}
                <div style={headerStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <h3 className="aa-title--sm" style={{ margin: 0 }}>
                            시간표 조회
                        </h3>
                        <div className="aa-row" style={{ gap: 6, alignItems: 'center' }}>
                            <div className="aa-seg" role="tablist" aria-label="행 높이">
                                <button
                                    className={density === 'compact' ? 'active' : ''}
                                    onClick={() => setDensity('compact')}
                                >
                                    촘촘
                                </button>
                                <button
                                    className={density === 'cozy' ? 'active' : ''}
                                    onClick={() => setDensity('cozy')}
                                >
                                    보통
                                </button>
                                <button
                                    className={density === 'comfortable' ? 'active' : ''}
                                    onClick={() => setDensity('comfortable')}
                                >
                                    넉넉
                                </button>
                            </div>
                        </div>
                    </div>
                    <button className="aa-btn aa-btn-ghost" onClick={onClose} aria-label="닫기">
                        ✕
                    </button>
                </div>

                {/* 본문(스크롤 컨테이너) */}
                <div style={bodyStyle}>
                    {/* ★ .academy-page 스코프 안에 두어 .tt-* 규칙 모두 적용 */}
                    <div className="academy-page" style={cssVars}>
                        {/* ⛔️ 여기서는 .aa-card 로 한 번 더 감싸지 않습니다.
                TimetableGrid 가 이미 .aa-card 를 포함하고 있어 이중 패딩/스크롤을 유발합니다. */}
                        <TimetableGrid
                            // 데이터
                            events={events}
                            timeSlots={timeSlots}
                            showTeacher={showTeacher}
                            locNameByCode={locNameByCode}
                            // 크게보기 전용 사이즈
                            rowHeight={rowHeight}
                            wrapMaxVH={wrapMaxVH}
                            dayMinWidth={colMin}
                            // ✅ days 전달(월~일 기본, 필요시 [1..5] 등)
                            days={days}
                        />
                    </div>
                </div>
            </div>
        </div>,
        rootEl
    );
}