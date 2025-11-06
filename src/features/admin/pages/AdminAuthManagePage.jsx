// src/features/admin/pages/AdminAuthManagePage.jsx
// ============================================================================
// 권한 관리 (AdminAuth)
// - 좌: 역할(ROLE 코드) 목록 — 박스(틀) + 내부 스크롤
// - 우: 메뉴 권한 트리 — 박스(틀) + 내부 스크롤 + 접기/펼치기(caret)
// - 체크 규칙(covered/indeterminate) 유지, 토글 시 서브트리 전체 on/off
// - 저장 시 checked(Set)를 통째로 서버에 전달(전체 교체)
// - 스타일: src/styles/admin-auth.css (auth-box, auth-scroll, caret 등)
// ============================================================================

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getCodes } from '@/api/commonCodeAdminApi';
import { getMenuTree } from '@/api/menuApi';
import { getRoleMenusByCode, updateRoleMenusByCode } from '@/api/adminAuthApi';
import { alertSuccess, alertError } from '@/ui/alert';

// 🔽 다크/공통 유틸 + 이 페이지 전용 스킨
import '@/styles/admin.css';
import '@/styles/admin-system.css';
import '@/styles/admin-auth.css';

const safeOk  = (t,m)=>Promise.resolve(alertSuccess(t,m)).catch(()=>{});
const safeErr = (t,m)=>Promise.resolve(alertError(t,m)).catch(()=>{});

export default function AdminAuthManagePage() {
    // ▸ 좌측 역할 목록
    const [roles, setRoles]   = useState([]);
    const [sel, setSel]       = useState(null);

    // ▸ 우측 메뉴 트리 + 체크 상태
    const [tree, setTree]     = useState([]);
    const [checked, setChecked] = useState(new Set());   // ✅ menuId Set (소스 오브 트루스)

    // ▸ 트리 접기/펼치기 상태 (true=펼침)
    const [expanded, setExpanded] = useState(new Map());

    const AUDIENCE = 'ADMIN';

    /* 1) 초기 로딩: 역할(ROLE) / 메뉴 트리 */
    useEffect(() => {
        (async () => {
            try {
                const [roleCodes, menus] = await Promise.all([
                    getCodes('ROLE'),
                    getMenuTree(AUDIENCE),
                ]);
                const enabled = (roleCodes||[]).filter(r => r.enabled);
                enabled.sort((a,b)=>(a.sortOrder??0)-(b.sortOrder??0) || String(a.name).localeCompare(String(b.name),'ko'));

                setRoles(enabled);
                setTree(Array.isArray(menus) ? menus : []);

                // 첫 진입 시 첫 역할 선택
                if (enabled.length) setSel(enabled[0]);
            } catch (e) {
                safeErr('오류','데이터 조회 실패');
            }
        })();
    }, []);

    /* 2) 역할 변경 → 해당 역할의 menuIds 로 checked Set 구성 */
    useEffect(() => {
        if (!sel) { setChecked(new Set()); return; }
        (async () => {
            try {
                const ids = await getRoleMenusByCode(sel.code);
                setChecked(new Set((ids||[]).map(Number)));
            } catch {
                setChecked(new Set());
            }
        })();
    }, [sel?.code]);

    /* 3) 트리 기본 펼침(깊이 2까지 오픈) */
    useEffect(() => {
        const next = new Map();
        const apply = (nodes, depth=1) => {
            for (const n of nodes || []) {
                if (depth <= 2) next.set(n.id, true);
                if (n.children?.length) apply(n.children, depth+1);
            }
        };
        apply(tree, 1);
        setExpanded(next);
    }, [tree]);

    /* 4) 저장(전체 교체) */
    const saveMenus = async () => {
        if (!sel) return;
        try {
            await updateRoleMenusByCode(sel.code, Array.from(checked));
            await safeOk('성공','권한이 저장되었습니다.');
            // 메뉴 변경 브로드캐스트(선택)
            try { const bc = new BroadcastChannel('menu-channel'); bc.postMessage('refresh'); bc.close(); } catch {}
        } catch (e) {
            safeErr('오류', e?.response?.data?.message || '저장 실패 (서버 오류)');
        }
    };

    /* 5) 전체선택/전체해제 + 모두펼치기/모두접기 */
    const selectAll   = () => setChecked(new Set(collectAllIds(tree)));
    const clearAll    = () => setChecked(new Set());
    // ✅ 간단 버전
    const expandAll = () => {
        const ids = collectAllIds(tree);
        setExpanded(new Map(ids.map(id => [id, true])));
    };
    const collapseAll = () => setExpanded(new Map());

    return (
        <section className="aa-page-dark p-6">
            <div className="aa-container-xxl">
                <h1 className="text-xl font-semibold text-white mb-4">권한 관리</h1>

                {/* 좌:4 / 우:8 → lg 에서 3:9 느낌으로 보정 (admin-auth.css: .auth-split) */}
                <div className="auth-split">
                    {/* ────────────────────────────────────────────────
              좌측: 역할 리스트 (틀 + 스크롤)
              ──────────────────────────────────────────────── */}
                    <div>
                        <div className="aa-panel-dark p-3">
                            <div className="auth-box">
                                <div className="auth-box-head">
                                    <div className="auth-box-title">역할 (공통코드 ROLE)</div>
                                </div>
                                <div className="auth-box-body">
                                    <div className="auth-scroll">
                                        {roles.length===0 ? (
                                            <div className="p-3 text-slate-400">역할 코드가 없습니다.</div>
                                        ) : (
                                            <div className="auth-role-list">
                                                {roles.map(r=>(
                                                    <button
                                                        key={r.code}
                                                        className={`auth-role-item ${sel?.code===r.code ? 'is-active' : ''}`}
                                                        onClick={()=>setSel(r)}
                                                        title={r.code}
                                                    >
                                                        <div className="auth-role-name">{r.name}</div>
                                                        <div className="auth-role-code">{r.code}</div>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ────────────────────────────────────────────────
              우측: 메뉴 권한 트리 (틀 + 스크롤)
              ──────────────────────────────────────────────── */}
                    <div>
                        {!sel ? (
                            <div className="aa-panel-dark p-6">좌측에서 역할을 선택하세요.</div>
                        ) : (
                            <div className="aa-panel-dark p-3">
                                <div className="auth-box">
                                    {/* 헤더(타이틀 + 우측 버튼) */}
                                    <div className="auth-box-head">
                                        <div>
                                            <div className="auth-box-title">
                                                메뉴 권한 — {sel.name} <span className="auth-box-subtitle">({sel.code})</span>
                                            </div>
                                        </div>
                                        <div className="aa-row">
                                            <button className="aa-btn" onClick={selectAll}>전체선택</button>
                                            <button className="aa-btn" onClick={clearAll}>전체해제</button>
                                            <button className="aa-btn" onClick={expandAll}>모두 펼치기</button>
                                            <button className="aa-btn" onClick={collapseAll}>모두 접기</button>
                                            <button className="aa-btn aa-btn-primary" onClick={saveMenus}>권한 저장</button>
                                        </div>
                                    </div>

                                    {/* 본문(트리 스크롤) */}
                                    <div className="auth-box-body">
                                        <div className="auth-scroll">
                                            <MenuCheckTree
                                                tree={tree}
                                                checked={checked}
                                                setChecked={setChecked}
                                                expanded={expanded}
                                                setExpanded={setExpanded}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                </div>
            </div>
        </section>
    );
}

/* ===================== 트리 계산 규칙 ===================== */
/** ✔ covered: node.id ∈ checked || 모든 자식이 covered */
const isCovered = (node, checked) => {
    if (checked.has(Number(node.id))) return true;
    const cs = node.children || [];
    if (cs.length === 0) return false;
    return cs.every(ch => isCovered(ch, checked));
};
/** ━ indeterminate: covered는 아니지만, 일부라도 하위가 covered/indeterminate */
const isIndeterminate = (node, checked) => {
    if (isCovered(node, checked)) return false;
    const cs = node.children || [];
    return cs.some(ch => isCovered(ch, checked) || isIndeterminate(ch, checked));
};

/* ===================== 트리 컴포넌트 ===================== */
function MenuCheckTree({ tree, checked, setChecked, expanded, setExpanded }) {
    // ▸ 서브트리 전체 on/off
    const toggleNode = (node, on) => {
        const next = new Set(checked);
        const ids = collectIds(node);
        if (on) ids.forEach(id => next.add(id));
        else     ids.forEach(id => next.delete(id));
        setChecked(next);
    };

    // ▸ caret 토글
    const toggleExpand = (id) => {
        setExpanded(prev => {
            const next = new Map(prev);
            next.set(id, !next.get(id));
            return next;
        });
    };

    return (
        <div className="auth-tree">
            {(tree||[]).length ? tree.map(n=>(
                <MenuNode
                    key={n.id}
                    node={n}
                    checked={checked}
                    onToggle={toggleNode}
                    expanded={expanded}
                    onExpand={toggleExpand}
                    depth={0}
                />
            )) : <div className="text-slate-400">메뉴가 없습니다.</div>}
        </div>
    );
}

function MenuNode({ node, checked, onToggle, expanded, onExpand, depth }) {
    const covered     = useMemo(()=>isCovered(node, checked), [node, checked]);
    const partial     = useMemo(()=>isIndeterminate(node, checked), [node, checked]);
    const hasChildren = Array.isArray(node.children) && node.children.length > 0;
    const isOpen      = !!expanded.get(node.id);

    return (
        <div className="auth-node" style={{ paddingLeft: depth ? 0 : 0 }}>
            {/* 한 줄: caret + 체크/라벨 */}
            <div className="auth-node-row">
                {/* caret (자식이 있을 때만 활성) */}
                <div
                    className={`auth-caret ${hasChildren ? (isOpen ? 'expanded' : '') : 'disabled'}`}
                    role={hasChildren ? 'button' : 'presentation'}
                    tabIndex={hasChildren ? 0 : -1}
                    aria-label={hasChildren ? (isOpen ? '접기' : '펼치기') : undefined}
                    aria-expanded={hasChildren ? isOpen : undefined}
                    onClick={hasChildren ? () => onExpand(node.id) : undefined}
                    onKeyDown={(e)=>{ if(hasChildren && (e.key==='Enter'||e.key===' ')){ e.preventDefault(); onExpand(node.id); } }}
                >
                    <span className="caret" />
                </div>

                {/* 체크 + 라벨 */}
                <label className="auth-label">
                    <IndeterminateCheckbox
                        checked={covered}           // ✅ 모든 자식이 커버되면 부모도 체크 표기
                        indeterminate={partial}     // ✅ 일부만 커버되면 부분 체크
                        onChange={(e)=> onToggle(node, e.target.checked)}
                    />
                    <span className="name">{node.name}</span>
                    <span className="type">({node.type})</span>
                </label>
            </div>

            {/* 자식 (펼침일 때만 노출) */}
            {hasChildren && isOpen && (
                <div className="auth-node-children">
                    {node.children.map(c=>(
                        <MenuNode
                            key={c.id}
                            node={c}
                            checked={checked}
                            onToggle={onToggle}
                            expanded={expanded}
                            onExpand={onExpand}
                            depth={depth+1}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

/* ===================== 체크박스(부분 체크 지원) ===================== */
function IndeterminateCheckbox({ checked, indeterminate, onChange }) {
    const ref = useRef(null);
    useEffect(() => { if (ref.current) ref.current.indeterminate = !!indeterminate; }, [indeterminate]);
    return (
        <input
            ref={ref}
            type="checkbox"
            className="auth-check"
            checked={checked}
            onChange={onChange}
        />
    );
}

/* ===================== 유틸 ===================== */
function collectIds(node) {
    const out = [];
    const dfs = (n) => { out.push(Number(n.id)); (n.children||[]).forEach(dfs); };
    dfs(node);
    return out;
}
function collectAllIds(nodes=[]) {
    const out = [];
    const dfs = (n) => { out.push(Number(n.id)); (n.children||[]).forEach(dfs); };
    nodes.forEach(dfs);
    return out;
}