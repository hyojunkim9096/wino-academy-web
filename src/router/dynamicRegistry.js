// src/router/dynamicRegistry.js
// -----------------------------------------------------------------------------
// 페이지 동적 로더: component_key → 파일 찾기 & import
// - <key>.jsx|tsx 우선, <key>/index.jsx|tsx 후보
// - Foo/FooPage 모두 허용
// - 캐시로 중복 import 방지, 실패 시 친절한 안내
// -----------------------------------------------------------------------------
const modules = import.meta.glob('/src/features/**/pages/**/*.{jsx,tsx}', { eager: false });

const cache = new Map();

function sanitizeKey(key) {
    return String(key || '').replace(/\.(jsx|tsx)$/i, '').trim();
}

function toCandidates(key) {
    const k = sanitizeKey(key);
    if (!k) return [];

    const baseNames = new Set([k, `${k}Page`]); // Page 접미사 허용
    const items = [];

    for (const p of Object.keys(modules)) {
        const filename = p.split('/').pop() || '';
        const nameNoExt = filename.replace(/\.(jsx|tsx)$/i, '');
        const isIndex = /\/index\.(jsx|tsx)$/i.test(p);
        const parentName = isIndex ? p.split('/').slice(-2, -1)[0] : null;

        let score = -1;
        if (baseNames.has(nameNoExt)) score = 100; // 정확 파일명
        else if (isIndex && parentName && baseNames.has(parentName)) score = 80; // 폴더/index
        else {
            for (const bn of baseNames) {
                if (nameNoExt.toLowerCase() === bn.toLowerCase()) { score = 70; break; }
                if (isIndex && parentName && parentName.toLowerCase() === bn.toLowerCase()) { score = 60; break; }
            }
        }
        if (score > 0) items.push([p, score]);
    }

    items.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    return items.map(([p]) => p);
}

export async function loadByComponentKey(key) {
    const k = sanitizeKey(key);
    if (cache.has(k)) return cache.get(k);

    const candidates = toCandidates(k);
    if (candidates.length === 0) {
        const err = new Error(
            `[dynamic] component_key "${key}"에 해당하는 페이지 파일을 찾을 수 없습니다.
- 기대 경로:
  /src/features/**/pages/${k}.jsx|tsx
  /src/features/**/pages/${k}/index.jsx|tsx
- 스캔된 파일 수: ${Object.keys(modules).length}`
        );
        err.code = 'COMPONENT_NOT_FOUND';
        throw err;
    }

    let lastErr;
    for (const path of candidates) {
        try {
            const mod = await modules[path]();
            const C = mod?.default ?? Object.values(mod || {})[0];
            if (C) {
                cache.set(k, C);
                return C;
            }
            lastErr = new Error(`[dynamic] ${path} 에 default export 컴포넌트가 없습니다.`);
        } catch (e) {
            lastErr = e;
        }
    }
    throw lastErr || new Error(`[dynamic] "${key}" 로드 실패`);
}

// 호환용 이름
export async function resolveComponentByKey(key) {
    return loadByComponentKey(key);
}

export { modules as dynamicModules };
