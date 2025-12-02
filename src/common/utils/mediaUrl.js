// src/common/utils/mediaUrl.js
// 공개 업로드 URL 빌더
// - 상대 경로('staff/123/a.jpg') 또는 절대 경로('D:\\..' '/data/...') 모두 입력 허용
// - 절대 경로면 basePath 제거는 서버에서 해주는 게 이상적(Backend DTO에서 처리)
// - 여기선 단순 정규화만: 백슬래시 -> 슬래시, 선행 슬래시 제거
export function uploadsUrl(pathLike) {
    if (!pathLike) return '';
    let s = String(pathLike).replace(/\\/g, '/');
    s = s.replace(/^\/+/, ''); // 선행 슬래시 제거
    return `/uploads/${s}`;
}

// 캐시 버스터 (업로드 직후 최신 이미지 보이도록)
export function withBust(url, seed) {
    if (!url) return url;
    const v = seed ? String(seed) : Date.now();
    return url + (url.includes('?') ? '&' : '?') + 'v=' + v;
}
