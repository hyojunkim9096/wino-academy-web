import React from 'react';

/** Daum 우편번호 팝업 버튼 */
function AddressSearch({ onComplete, className = '' }) {
    const openPostcode = () => {
        if (!window.daum || !window.daum.Postcode) {
            alert('우편번호 서비스를 불러올 수 없습니다.');
            return;
        }
        new window.daum.Postcode({
            oncomplete: function (data) {
                const road = data.roadAddress;
                const jibun = data.jibunAddress;
                const zone = data.zonecode;
                const addr = road && road.trim() ? road : jibun;
                onComplete?.({ postalCode: zone, address: addr });
            },
        }).open();
    };

    return (
        <button type="button" onClick={openPostcode} className={className}>
            우편번호 찾기
        </button>
    );
}

export default AddressSearch;
