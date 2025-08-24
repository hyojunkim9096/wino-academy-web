// src/features/admin/pages/AdminAuthManagePage.jsx
// ✅ 변경 요약
// - 서버에서 받은 menuIds(Set)만 '소스 오브 트루스'로 보관
// - 렌더링 시 "covered" 규칙으로 체크/부분체크 계산
//    * 체크(✔): node.id ∈ checked || 모든 자식이 covered
//    * 부분체크(━): 체크는 아니지만, 하나라도 하위 covered
// - 토글 시: 해당 노드 '서브트리 전체'를 켜거나 끔 (UX 일관성)
// - 저장: 현재 checked(Set)를 그대로 전달 → 백엔드가 "전체 교체"로 반영
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getCodes } from '@/api/commonCodeAdminApi';
import { getMenuTree } from '@/api/menuApi';
import { getRoleMenusByCode, updateRoleMenusByCode } from '@/api/adminAuthApi';
import { alertSuccess, alertError } from '@/ui/alert';
import '@/styles/admin.css';

const safeOk  = (t,m)=>Promise.resolve(alertSuccess(t,m)).catch(()=>{});
const safeErr = (t,m)=>Promise.resolve(alertError(t,m)).catch(()=>{});

export default function AdminAuthManagePage() {
    const [roles, setRoles] = useState([]);
    const [sel, setSel] = useState(null);
    const [tree, setTree] = useState([]);
    const [checked, setChecked] = useState(new Set()); // Long ids

    const AUDIENCE = 'ADMIN';

    // 초기 로딩: 역할/트리
    useEffect(() => {
        (async () => {
            try {
                const [roleCodes, menus] = await Promise.all([
                    getCodes('ROLE'),
                    getMenuTree(AUDIENCE), // 관리용 전체 트리
                ]);
                const enabled = (roleCodes||[]).filter(r => r.enabled);
                enabled.sort((a,b)=>(a.sortOrder??0)-(b.sortOrder??0) || a.name.localeCompare(b.name,'ko'));
                setRoles(enabled);
                setTree(Array.isArray(menus) ? menus : []);
                if (enabled.length) setSel(enabled[0]);
            } catch (e) {
                safeErr('오류','데이터 조회 실패');
            }
        })();
    }, []);

    // 역할 바뀌면 해당 역할 menuIds 로 기본 체크 상태 구성
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

    // 저장(전체 교체)
    const saveMenus = async () => {
        if (!sel) return;
        try {
            await updateRoleMenusByCode(sel.code, Array.from(checked));
            await safeOk('성공','권한이 저장되었습니다.');
            try { const bc = new BroadcastChannel('menu-channel'); bc.postMessage('refresh'); bc.close(); } catch {}
        } catch (e) {
            // ❗ 500시 서버 로그 확인 필요. 아래 백엔드 컨트롤러에 에러 메시지 노출 추가해둠.
            safeErr('오류', e?.response?.data?.message || '저장 실패 (서버 오류)');
        }
    };

    return (
        <section className="aa-page-dark p-6">
            <div className="aa-container-xxl">
                <h1 className="text-xl font-semibold text-white mb-4">권한 관리</h1>

                <div className="grid grid-cols-12 gap-4">
                    {/* 좌: ROLE 목록 */}
                    <div className="col-span-12 md:col-span-4 lg:col-span-3">
                        <div className="aa-panel-dark p-3 mb-3 font-semibold">역할 (공통코드 ROLE)</div>
                        <div className="aa-panel-dark divide-y">
                            {roles.length===0 ? (
                                <div className="p-3 text-slate-400">역할 코드가 없습니다.</div>
                            ) : roles.map(r=>(
                                <button
                                    key={r.code}
                                    className={`w-full text-left p-3 ${sel?.code===r.code?'bg-slate-800 text-white':'hover:bg-slate-800/60 text-slate-200'}`}
                                    onClick={()=>setSel(r)}
                                    title={r.code}
                                >
                                    <div className="font-medium">{r.name}</div>
                                    <div className="text-xs text-slate-400">{r.code}</div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* 우: 트리 매핑 */}
                    <div className="col-span-12 md:col-span-8 lg:col-span-9">
                        {!sel ? (
                            <div className="aa-panel-dark p-6">좌측에서 역할을 선택하세요.</div>
                        ) : (
                            <div className="aa-panel-dark p-4">
                                <div className="flex items-center justify-between mb-3">
                                    <div className="font-semibold">
                                        메뉴 권한 — {sel.name} <span className="text-xs text-slate-400">({sel.code})</span>
                                    </div>
                                    <div className="flex gap-2">
                                        <button className="aa-btn" onClick={()=>setChecked(new Set(collectAllIds(tree)))}>
                                            전체선택
                                        </button>
                                        <button className="aa-btn" onClick={()=>setChecked(new Set())}>
                                            전체해제
                                        </button>
                                        <button className="aa-btn aa-btn-primary" onClick={saveMenus}>권한 저장</button>
                                    </div>
                                </div>

                                <MenuCheckTree tree={tree} checked={checked} setChecked={setChecked}/>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </section>
    );
}

/* ===================== 트리 ===================== */

// ✔ covered 규칙: node가 '완전 커버' 되면 체크 표시
const isCovered = (node, checked) => {
    if (checked.has(Number(node.id))) return true;
    const cs = node.children || [];
    if (cs.length === 0) return false;
    return cs.every(ch => isCovered(ch, checked));
};

// ━ indeterminate 규칙: 커버는 아니지만 일부라도 커버된 하위가 있다
const isIndeterminate = (node, checked) => {
    if (isCovered(node, checked)) return false;
    const cs = node.children || [];
    return cs.some(ch => isCovered(ch, checked) || isIndeterminate(ch, checked));
};

function MenuCheckTree({ tree, checked, setChecked }) {
    // 노드 토글: 서브트리 전체 on/off
    const toggleNode = (node, on) => {
        const next = new Set(checked);
        const ids = collectIds(node);
        if (on) ids.forEach(id => next.add(id));
        else     ids.forEach(id => next.delete(id));
        setChecked(next);
    };
    return (
        <div className="space-y-2">
            {(tree||[]).length ? tree.map(n=>(
                <MenuNode key={n.id} node={n} checked={checked} onToggle={toggleNode} depth={0}/>
            )) : <div className="text-slate-400">메뉴가 없습니다.</div>}
        </div>
    );
}

function MenuNode({ node, checked, onToggle, depth }) {
    const covered = useMemo(()=>isCovered(node, checked), [node, checked]);
    const partial = useMemo(()=>isIndeterminate(node, checked), [node, checked]);

    return (
        <div style={{ paddingLeft: depth * 16 }}>
            <label className="inline-flex items-center gap-2">
                <IndeterminateCheckbox
                    checked={covered}                 // ✅ 모든 자식이 커버되면 부모도 자동 체크 표기
                    indeterminate={partial}           // ✅ 일부만 커버되면 부분체크
                    onChange={(e)=> onToggle(node, e.target.checked)}
                />
                <span className="text-slate-200">{node.name}</span>
                <span className="text-xs text-slate-400">({node.type})</span>
            </label>
            {node.children?.length>0 && (
                <div className="space-y-1 mt-1">
                    {node.children.map(c=>(
                        <MenuNode
                            key={c.id}
                            node={c}
                            checked={checked}
                            onToggle={onToggle}
                            depth={depth+1}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

// 표준 체크박스에 indeterminate 적용
function IndeterminateCheckbox({ checked, indeterminate, onChange }) {
    const ref = useRef(null);
    useEffect(() => {
        if (ref.current) ref.current.indeterminate = !!indeterminate;
    }, [indeterminate]);
    return (
        <input
            ref={ref}
            type="checkbox"
            className="accent-indigo-500"
            checked={checked}
            onChange={onChange}
        />
    );
}

/* ===================== 유틸 ===================== */

function collectIds(node) {
    const out = [];
    const dfs = (n) => {
        out.push(Number(n.id));
        (n.children||[]).forEach(dfs);
    };
    dfs(node);
    return out;
}
function collectAllIds(nodes=[]) {
    const out = [];
    const dfs = (n) => { out.push(Number(n.id)); (n.children||[]).forEach(dfs); };
    nodes.forEach(dfs);
    return out;
}
