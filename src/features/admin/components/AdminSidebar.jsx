// src/features/admin/components/AdminSidebar.jsx
// ✅ 변경 요약
// - 서버에서 "내 권한" 기준으로 필터된 트리를 주는 getMyMenus 사용
// - BroadcastChannel('menu-channel') 수신 시 자동 새로고침 (type: 'menuChanged' 또는 'refresh')
// - 현재 경로 조상 폴더 자동 펼침 + 사용자가 펼친 상태 로컬 스토리지에 저장
// - 다크톤, 접근성 aria-* 속성 추가

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { getMyMenus } from '@/api/menuApi'; // ✅ 권한 필터된 트리 API

// 트리 노드 타입 (백엔드와 일치)
const TYPES = { FOLDER: 'FOLDER', SCREEN: 'SCREEN' };
const AUDIENCE = 'ADMIN'; // 이 사이드바는 관리자용
const EXPANDED_STORE_KEY = 'adminSidebarExpandedIds';

export default function AdminSidebar() {
    const location = useLocation();
    const [tree, setTree] = useState([]);                // 백엔드에서 받아온 트리
    const [loading, setLoading] = useState(false);
    const [expanded, setExpanded] = useState(new Set()); // 펼침 상태(폴더 id 집합)
    const bcRef = useRef(null);

    // 초기: 저장된 펼침 상태 복원
    useEffect(() => {
        try {
            const raw = localStorage.getItem(EXPANDED_STORE_KEY);
            if (raw) {
                const arr = JSON.parse(raw);
                if (Array.isArray(arr)) setExpanded(new Set(arr));
            }
        } catch {}
    }, []);

    // 펼침 상태 저장
    useEffect(() => {
        try {
            localStorage.setItem(EXPANDED_STORE_KEY, JSON.stringify([...expanded]));
        } catch {}
    }, [expanded]);

    // 링크 공통 클래스 (다크 톤)
    const linkClass = ({ isActive }) =>
        `block px-3 py-2 rounded-md text-sm border transition-colors ${
            isActive
                ? 'bg-slate-900 text-white border-slate-700 shadow-sm'
                : 'text-slate-300 border-transparent hover:bg-slate-800 hover:text-white'
        }`;

    /** 메뉴 트리 로드 */
    const load = useCallback(async () => {
        setLoading(true);
        try {
            // ✅ 서버가 권한/visible/enabled 필터링을 끝낸 트리 반환
            const data = await getMyMenus(AUDIENCE);
            const nodes = Array.isArray(data) ? data : [];
            setTree(nodes);

            // 현재 경로 기준으로 조상 폴더 자동 펼침
            const autoOpen = new Set(findAncestorIdsByPath(nodes, location.pathname));

            // ✅ 사용자가 이미 펼쳐둔 폴더는 유지 + 조상 폴더 자동 병합
            setExpanded((prev) => new Set([...prev, ...autoOpen]));
        } catch (e) {
            console.error('메뉴 로드 실패:', e);
            setTree([]);
        } finally {
            setLoading(false);
        }
    }, [location.pathname]);

    // 경로가 바뀔 때마다 트리 로드 (권한/메뉴 변경 시에도 호출됨)
    useEffect(() => { load(); }, [load]);

    /** 메뉴 변경 브로드캐스트(다른 화면에서 등록/수정/삭제 시 자동 리프레시) */
    useEffect(() => {
        try {
            bcRef.current = new BroadcastChannel('menu-channel');
            bcRef.current.onmessage = (e) => {
                // ✅ 'menuChanged' 객체 또는 'refresh' 문자열 모두 허용
                if (e?.data?.type === 'menuChanged' || e?.data === 'refresh') {
                    load();
                }
            };
        } catch {}
        return () => { try { bcRef.current?.close(); } catch {} };
    }, [load]);

    /** 폴더 토글 */
    const toggle = (id) => {
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    /** 현재 경로가 활성인 하위 노드를 포함하는지(폴더 활성 표시 용) */
    const isFolderActive = useCallback((node, pathname) => {
        if (!node) return false;
        if (node.type === TYPES.SCREEN && node.path) {
            // 현재 경로가 정확히 일치하거나 하위 경로인 경우 활성으로 판정
            return normalizePath(pathname).startsWith(normalizePath(node.path));
        }
        // 자식 중 하나라도 활성이라면 활성
        return (node.children || []).some((c) => isFolderActive(c, pathname));
    }, []);

    /** 트리 렌더러 (재귀) */
    const renderNode = (node) => {
        if (!node) return null;
        if (node.type === TYPES.FOLDER) {
            const active  = isFolderActive(node, location.pathname);
            const opened  = expanded.has(node.id) || active; // 활성 폴더는 자동 펼침
            const sectionId = `menu-folder-${node.id}`;

            return (
                <div key={node.id} className="mb-1">
                    <button
                        type="button"
                        onClick={() => toggle(node.id)}
                        aria-expanded={opened}
                        aria-controls={sectionId}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-sm border transition-colors ${
                            active
                                ? 'bg-slate-900 text-white border-slate-700 shadow-sm'
                                : 'text-slate-300 border-transparent hover:bg-slate-800 hover:text-white'
                        } focus:outline-none focus:ring-2 focus:ring-indigo-500/40`}
                        title={node.name}
                    >
                        <span className="truncate">{node.name}</span>
                        <span aria-hidden className="text-xs">{opened ? '▾' : '▸'}</span>
                    </button>

                    {opened && node.children?.length > 0 && (
                        <div id={sectionId} className="ml-2 pl-2 border-l border-slate-800 mt-1">
                            {node.children.map(renderNode)}
                        </div>
                    )}
                </div>
            );
        }
        // SCREEN
        return (
            <NavLink
                key={node.id}
                to={node.path || '#'}
                className={linkClass}
                title={node.name}
                // end 를 주지 않아 하위 경로에서도 상위 메뉴가 활성 처리되도록 함
            >
                {node.name}
            </NavLink>
        );
    };

    // 최상단 영역(로고/섹션 라벨)
    const Header = useMemo(() => (
        <div className="h-14 flex items-center px-4 font-semibold text-white border-b border-slate-800">
            WINO Admin
        </div>
    ), []);

    return (
        <aside className="w-64 bg-slate-950 text-slate-200 min-h-screen border-r border-slate-800">
            {Header}

            <nav className="p-3 space-y-1">
                {/* 항상 보이는 기본 항목(대시보드) */}
                <NavLink to="/admin/dashboard" className={linkClass} end>
                    대시보드
                </NavLink>

                {/* 로딩 표시 */}
                {loading && (
                    <div className="px-3 py-2 text-xs text-slate-400">메뉴 불러오는 중…</div>
                )}

                {/* 동적 메뉴 트리 */}
                {tree.map(renderNode)}
            </nav>
        </aside>
    );
}

/* --------------------- 유틸리티 --------------------- */

/** 현재 경로(pathname)의 조상 폴더 id 목록을 찾아서 펼치기 */
function findAncestorIdsByPath(nodes = [], pathname = '') {
    const hit = [];
    const norm = normalizePath(pathname);
    const dfs = (node, ancestors) => {
        if (!node) return;
        if (node.type === TYPES.SCREEN && node.path) {
            const np = normalizePath(node.path);
            if (norm === np || norm.startsWith(np + '/')) {
                hit.push(...ancestors);
            }
        }
        (node.children || []).forEach((c) =>
            dfs(c, [...ancestors, node.type === TYPES.FOLDER ? node.id : null].filter(Boolean))
        );
    };
    nodes.forEach((n) => dfs(n, []));
    return Array.from(new Set(hit));
}

function normalizePath(p) {
    if (!p) return '/';
    return ('/' + p).replace(/\/+/g, '/').replace(/\/$/, '') || '/';
}
