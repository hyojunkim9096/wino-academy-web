// src/features/admin/components/AdminSidebar.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
// ✅ 1. getMyMenus
// import { getMyMenus } from '@/api/menuApi';
import { useAuth } from '@/contexts/AuthContext'; // ✅ AuthContext

//
const TYPES = { FOLDER: 'FOLDER', SCREEN: 'SCREEN' };
const AUDIENCE = 'ADMIN'; //
const EXPANDED_STORE_KEY = 'adminSidebarExpandedIds';

export default function AdminSidebar() {
    const location = useLocation();

    // ✅ 2. API  Context
    const { menuTree, authLoading } = useAuth();

    const [tree, setTree] = useState([]);                //
    const [loading, setLoading] = useState(false); //
    const [expanded, setExpanded] = useState(new Set()); // ( id )
    const bcRef = useRef(null);

    //
    useEffect(() => {
        try {
            const raw = localStorage.getItem(EXPANDED_STORE_KEY);
            if (raw) {
                const arr = JSON.parse(raw);
                if (Array.isArray(arr)) setExpanded(new Set(arr));
            }
        } catch {}
    }, []);

    //
    useEffect(() => {
        try {
            localStorage.setItem(EXPANDED_STORE_KEY, JSON.stringify([...expanded]));
        } catch {}
    }, [expanded]);

    //
    const linkClass = ({ isActive }) =>
        `block px-3 py-2 rounded-md text-sm border transition-colors ${
            isActive
                ? 'bg-slate-900 text-white border-slate-700 shadow-sm'
                : 'text-slate-300 border-transparent hover:bg-slate-800 hover:text-white'
        }`;

    /** */
    const load = useCallback(async () => {
        // ✅ 3. API
        setLoading(authLoading);
        if (authLoading) return;

        try {
            // ✅ 4. Context
            const nodes = Array.isArray(menuTree) ? menuTree : [];
            setTree(nodes);

            //
            const autoOpen = new Set(findAncestorIdsByPath(nodes, location.pathname));

            // ✅   +
            setExpanded((prev) => new Set([...prev, ...autoOpen]));
        } catch (e) {
            console.error(' ', e);
            setTree([]);
        } finally {
            setLoading(false);
        }
    }, [authLoading, menuTree, location.pathname]); // ✅

    // (/)
    useEffect(() => { load(); }, [load]);

    /** ( ) */
    useEffect(() => {
        try {
            bcRef.current = new BroadcastChannel('menu-channel');
            bcRef.current.onmessage = (e) => {
                // ✅ 'menuChanged'  'refresh'
                if (e?.data?.type === 'menuChanged' || e?.data === 'refresh') {
                    //
                    //
                    window.location.reload();
                }
            };
        } catch {}
        return () => { try { bcRef.current?.close(); } catch {} };
    }, [load]);

    /** */
    const toggle = (id) => {
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    /** ( ) */
    const isFolderActive = useCallback((node, pathname) => {
        if (!node) return false;
        if (node.type === TYPES.SCREEN && node.path) {
            //
            return normalizePath(pathname).startsWith(normalizePath(node.path));
        }
        //
        return (node.children || []).some((c) => isFolderActive(c, pathname));
    }, []);

    /** () */
    const renderNode = (node) => {
        if (!node) return null;
        if (node.type === TYPES.FOLDER) {
            const active  = isFolderActive(node, location.pathname);
            const opened  = expanded.has(node.id) || active; //
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
                // end
            >
                {node.name}
            </NavLink>
        );
    };

    // (/)
    const Header = useMemo(() => (
        <div className="h-14 flex items-center px-4 font-semibold text-white border-b border-slate-800">
            WINO Admin
        </div>
    ), []);

    return (
        <aside className="w-64 bg-slate-950 text-slate-200 min-h-screen border-r border-slate-800">
            {Header}

            <nav className="p-3 space-y-1">
                {/* () */}
                <NavLink to="/admin/dashboard" className={linkClass} end>
                    대시보드
                </NavLink>

                {/* */}
                {loading && (
                    <div className="px-3 py-2 text-xs text-slate-400">…</div>
                )}

                {/* */}
                {tree.map(renderNode)}
            </nav>
        </aside>
    );
}

/* ---------------------  --------------------- */

/** (pathname)  id  */
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
    return ('/' + (p||'')).replace(/\/+/g,'/').replace(/\/$/, '') || '/';
}