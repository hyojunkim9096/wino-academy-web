// src/App.jsx
// ============================================================================
// WINO Academy — 앱 엔트리
// ----------------------------------------------------------------------------
// - createBrowserRouter 기반 router 를 RouterProvider로 주입
// - BrowserRouter/Routes 방식은 제거(이중 라우팅 충돌 방지)
// ============================================================================
import React from 'react';
import { RouterProvider } from 'react-router-dom';
import router from '@/router';

export default function App() {
    return <RouterProvider router={router} />;
}