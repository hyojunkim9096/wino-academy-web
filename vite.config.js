// frontend/vite.config.js
// 목적: 개발 서버(5173)에서 /uploads 경로를 백엔드(8080)로 프록시해서
//       <img src="/uploads/..."> 가 정상적으로 백엔드의 정적 리소스를 바라보게 한다.
// 보강:
// 1) alias '@'를 현재 파일 기준으로 안전하게 계산(모노레포/서브디렉터리 실행 시에도 안정)
// 2) vite preview 시에도 /uploads 프록시 동작하도록 preview.proxy 추가

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
    plugins: [react(), tailwindcss()],

    resolve: {
        // ✅ 절대 경로 import용 별칭 (현재 파일 위치 기준으로 안전하게 계산)
        //   예: import Button from '@/components/Button'
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
        },
    },

    server: {
        port: 5173,
        strictPort: true, // 포트 충돌 시 자동 변경 방지(원치 않으면 제거 가능)
        proxy: {
            // ✅ API 프록시 (기존 유지)
            '/api': {
                target: 'http://localhost:8080',
                changeOrigin: true,
                secure: false,
                // ★ rewrite 금지: 백엔드 라우트가 그대로 /api/... 를 받도록 유지
            },

            // ✅ 업로드 정적 파일 프록시 추가
            // 백엔드(WebMvcConfigurer)가 /uploads/** → file:... 으로 매핑하므로
            // 프론트에서 /uploads/... 접근 시 개발 서버가 8080으로 프록시한다.
            '/uploads': {
                target: 'http://localhost:8080',
                changeOrigin: true,
                secure: false,
                // ★ rewrite 금지: 경로를 그대로 8080으로 전달
            },
        },
    },

    // ✅ 'vite preview' 로 확인할 때도 /uploads 가 백엔드로 넘어가도록 동일 프록시 적용
    preview: {
        port: 4173,
        strictPort: true,
        proxy: {
            '/api': {
                target: 'http://localhost:8080',
                changeOrigin: true,
                secure: false,
            },
            '/uploads': {
                target: 'http://localhost:8080',
                changeOrigin: true,
                secure: false,
            },
        },
    },
});
