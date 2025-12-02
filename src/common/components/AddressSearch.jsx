// ============================================================================
// src/common/components/AddressSearch.jsx
// ----------------------------------------------------------------------------
// Daum 우편번호 팝업 버튼 (개선판)
//  - 공용 알림 유틸 사용(alertError)로 일관된 UX
//  - daum Postcode 스크립트 자동 로딩(없으면 동적 주입)
//  - 기존/신규 모두 호환 API 유지:
//      · onComplete({ postalCode, address })
//      · className, disabled
//      · buttonLabel (children 없을 때 라벨로 사용)
//  - 접근성: aria-busy/aria-live 등 보강
// ============================================================================

import React, { useState } from 'react';
import { alertError } from '@/common/ui/alert.js';

// 모듈 스코프에 로딩 프라미스 보관해서 중복 주입 방지
let postcodeScriptPromise = null;

/** daum Postcode 스크립트를 보장합니다. (이미 로드돼 있으면 즉시 resolve) */
function ensureDaumPostcode() {
    // 이미 사용 가능하면 바로 성공
    if (window?.daum?.Postcode) return Promise.resolve();

    // 이전에 로딩 시도 중이면 그 프라미스를 재사용
    if (postcodeScriptPromise) return postcodeScriptPromise;

    postcodeScriptPromise = new Promise((resolve, reject) => {
        // 혹시 id만 있고 아직 로딩 중인 경우 이벤트 구독
        const existing = document.getElementById('daum-postcode-script');
        if (existing) {
            existing.addEventListener('load', () => resolve());
            existing.addEventListener('error', () => reject(new Error('Daum 우편번호 스크립트 로딩 실패')));
            return;
        }

        // 새로 주입
        const s = document.createElement('script');
        s.id = 'daum-postcode-script';
        // 프로토콜 상대 경로 사용(HTTP/HTTPS 자동)
        s.src = '//t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error('Daum 우편번호 스크립트 로딩 실패'));
        document.head.appendChild(s);
    });

    return postcodeScriptPromise.finally(() => {
        // 실패했다가 다시 시도할 수 있도록 실패 시에는 프라미스 리셋
        if (!window?.daum?.Postcode) {
            postcodeScriptPromise = null;
        }
    });
}

/**
 * Daum 우편번호 팝업 버튼
 * - 기존/신규 모두 호환:
 *    · onComplete({ postalCode, address }) 콜백
 *    · className, disabled 지원
 *    · ✅ buttonLabel 지원 (children 없이 레이블 제어)
 */
export default function AddressSearch({
                                          onComplete,
                                          className = '',
                                          disabled = false,
                                          buttonLabel = '우편번호 찾기',
                                          children, // (과거호환) 있으면 라벨로 사용
                                      }) {
    const [loading, setLoading] = useState(false);

    const openPostcode = async () => {
        if (disabled || loading) return;

        try {
            setLoading(true);
            await ensureDaumPostcode();
        } catch (e) {
            // 공용 알림으로 에러 노출
            await alertError('오류', '우편번호 서비스를 불러올 수 없습니다.\n잠시 후 다시 시도해주세요.');
            setLoading(false);
            return;
        }

        try {
            // window.daum.Postcode 가정
            // userSelectedType: 'R' (도로명) / 'J' (지번)
            new window.daum.Postcode({
                oncomplete: (data) => {
                    const postalCode = data.zonecode; // 5자리
                    const address =
                        data.userSelectedType === 'R'
                            ? (data.roadAddress || data.address || '')
                            : (data.jibunAddress || data.address || '');

                    onComplete?.({ postalCode, address });
                },
            }).open();
        } catch (e) {
            await alertError('오류', '우편번호 창을 열 수 없습니다.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <button
            type="button"
            onClick={openPostcode}
            className={className}
            disabled={disabled || loading}
            aria-busy={loading || undefined}
            aria-live="polite"
            title="Daum 우편번호 검색 열기"
        >
            {children ?? (loading ? '로딩 중…' : buttonLabel)}
        </button>
    );
}