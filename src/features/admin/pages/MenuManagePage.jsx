// src/features/admin/pages/MenuManagePage.jsx
// 메뉴 관리 컨테이너
// - 좌측 트리 클릭 시 오른쪽 초기화 후 선택 상세 표시
// - 등록/수정 저장/삭제/정렬 로직
// - USER 메뉴에서만 BOARD_TYPE 코드 로딩
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getMenuTree, createMenu, updateMenu, deleteMenu, reorderMenu } from '@/api/menuApi';
import { getCodes as getCommonCodes } from '@/api/commonCodeAdminApi';
import { alertError, alertSuccess, alertInfo } from '@/ui/alert';
import MenuTree from '@/features/admin/components/menu/MenuTree';
import MenuEditor from '@/features/admin/components/menu/MenuEditor';
import '@/styles/admin.css';
import '@/styles/admin-menu.css';

const safeInfo    = (t,m)=>Promise.resolve(alertInfo(t,m)).catch(()=>{});
const safeSuccess = (t,m)=>Promise.resolve(alertSuccess(t,m)).catch(()=>{});
const safeError   = (t,m)=>Promise.resolve(alertError(t,m)).catch(()=>{});

export const TYPES = { FOLDER: 'FOLDER', SCREEN: 'SCREEN' };
export const AUDIENCES = { ADMIN: 'ADMIN', USER: 'USER' };

export default function MenuManagePage() {
    const [audience, setAudience] = useState(AUDIENCES.ADMIN);
    const [tree, setTree]         = useState([]);
    const [selected, setSelected] = useState(null);
    const [loading, setLoading]   = useState(false);

    // USER + SCREEN일 때만 쓰는 게시판 타입(공통코드)
    const [boardTypes, setBoardTypes] = useState([]);

    // 오른쪽 편집 상태: { mode: 'create'|'edit', parent, node, draft }
    const [editor, setEditor] = useState(null);
    const editorRef = useRef(editor);
    useEffect(()=>{ editorRef.current = editor; }, [editor]);

    // 헤더(메모)
    const Header = useMemo(() => (
        <div className="mb-5 aa-container-xxl">
            <h1 className="text-xl font-semibold text-white">메뉴 관리</h1>
            <p className="text-sm text-slate-400">최대 3뎁스 · 3뎁스는 SCREEN만 등록</p>
        </div>
    ), []);

    // USER 대상일 때만 BOARD_TYPE 로딩
    useEffect(() => {
        let ignore = false;
        (async () => {
            if (audience !== AUDIENCES.USER) { setBoardTypes([]); return; }
            try {
                const list = await getCommonCodes('BOARD_TYPE');
                if (!ignore) setBoardTypes(Array.isArray(list) ? list.filter(x => x.enabled !== false) : []);
            } catch (e) {
                safeError('오류', e?.response?.data?.message || '게시판 타입 조회 실패');
                if (!ignore) setBoardTypes([]);
            }
        })();
        return () => { ignore = true; };
    }, [audience]);

    // 트리 조회/새로고침 (에디터 열려있으면 자동 리프레시 차단)
    const findInTree = (nodes = [], id) => {
        for (const n of nodes) {
            if (n.id === id) return n;
            if (n.children?.length) {
                const m = findInTree(n.children, id);
                if (m) return m;
            }
        }
        return null;
    };

    const refresh = useCallback(async (opts = { force: false }) => {
        if (editorRef.current && !opts.force) return;
        setLoading(true);
        try {
            const next = await getMenuTree(audience);
            setTree(next);
            setSelected(prev => (prev && findInTree(next, prev.id) ? prev : null));
            setEditor(prev => {
                if (!prev) return prev;
                if (prev.mode === 'edit' && prev.node && !findInTree(next, prev.node.id)) return null;
                return prev;
            });
        } catch (e) {
            safeError('오류', e?.response?.data?.message || '메뉴 조회 실패');
        } finally { setLoading(false); }
    }, [audience]);

    useEffect(() => { refresh(); }, [refresh]);

    // 정렬(형제 간 순서 변경)
    const flatFromTree = (nodes, list = []) => { nodes.forEach(n => { list.push(n); if (n.children?.length) flatFromTree(n.children, list); }); return list; };
    const moveUpDown = async (node, dir) => {
        const flat = flatFromTree(tree);
        const siblings = flat.filter(x => x.parentId === node.parentId).sort((a,b)=> a.sortOrder - b.sortOrder);
        const idx = siblings.findIndex(s => s.id === node.id);
        const target = dir === 'up' ? idx - 1 : idx + 1;
        if (target < 0 || target >= siblings.length) return safeInfo('안내', '더 이상 이동할 수 없습니다.');
        const tmp = [...siblings]; const [cur] = tmp.splice(idx, 1); tmp.splice(target, 0, cur);
        const orderedIds = tmp.map(s => s.id);
        try {
            await reorderMenu(audience, node.parentId ?? null, orderedIds);
            await safeSuccess('성공', '순서가 변경되었습니다.');
            await refresh({ force: true });
        } catch (e) { safeError('오류', e?.response?.data?.message || '재정렬 실패'); }
    };

    // 열기/저장/삭제
    const openCreate = (parent) => {
        const targetDepth = parent ? parent.depth + 1 : 1;
        setEditor({
            mode: 'create',
            parent,
            node: null,
            draft: {
                name: '',
                type: targetDepth === 3 ? 'SCREEN' : 'FOLDER',
                path: '',
                componentKey: '',
                visible: true,
                enabled: true,
                boardType: ''
            }
        });
    };
    const openEdit = (node) => {
        setSelected(node);
        setEditor({
            mode: 'edit',
            parent: null,
            node,
            draft: {
                name: node.name || '',
                type: node.type || 'FOLDER',
                path: node.path || '',
                componentKey: node.componentKey || '',
                visible: !!node.visible,
                enabled: !!node.enabled,
                boardType: node.boardType || ''
            }
        });
    };
    const onDelete = async (node) => {
        if (!window.confirm(`'${node.name}' 삭제? 하위가 있으면 함께 삭제됩니다.`)) return;
        try {
            await deleteMenu(node.id);
            await safeSuccess('성공', '삭제되었습니다.');
            setSelected(null);
            setEditor(null);
            await refresh({ force: true });
        } catch (e) { safeError('오류', e?.response?.data?.message || '삭제 실패'); }
    };

    const onDraftChange = (k, v) => setEditor(prev => prev ? ({ ...prev, draft: { ...prev.draft, [k]: v } }) : prev);

    const saveEditor = async () => {
        if (!editor) return;
        const { mode, parent, node, draft } = editor;
        const depth = parent ? (parent.depth + 1) : (node ? node.depth : 1);
        const finalType = depth === 3 ? 'SCREEN' : draft.type;
        const isUserScreen = audience === AUDIENCES.USER && finalType === 'SCREEN';

        const { name, path, componentKey, visible, enabled, boardType } = draft;
        if (!name?.trim()) return safeInfo('안내', '메뉴명을 입력하세요.');
        if (finalType === 'SCREEN') {
            if (!path?.trim() || !componentKey?.trim()) {
                return safeInfo('안내', 'SCREEN 타입은 path, componentKey가 필요합니다.');
            }
            if (isUserScreen && !boardType) return safeInfo('안내', '게시판 타입을 선택하세요.');
        }

        try {
            if (mode === 'create') {
                await createMenu({
                    audience,
                    parentId: parent ? parent.id : null,
                    name: name.trim(),
                    type: finalType,
                    path: finalType === 'SCREEN' ? path.trim() : null,
                    componentKey: finalType === 'SCREEN' ? componentKey.trim() : null,
                    icon: null,
                    visible: !!visible,
                    enabled: !!enabled,
                    requiredRole: null,
                    boardType: (finalType === 'SCREEN' ? (boardType || null) : null)
                });
                await safeSuccess('성공', `${depth}뎁스 메뉴가 생성되었습니다.`);
            } else {
                await updateMenu(node.id, {
                    name: name.trim(),
                    type: finalType,
                    parentId: node.parentId,
                    path: finalType === 'SCREEN' ? path.trim() : null,
                    componentKey: finalType === 'SCREEN' ? componentKey.trim() : null,
                    icon: node.icon ?? null,
                    visible: !!visible,
                    enabled: !!enabled,
                    requiredRole: node.requiredRole ?? null,
                    boardType: (finalType === 'SCREEN' ? (boardType || null) : null)
                });
                await safeSuccess('성공', '수정되었습니다.');
            }
            setEditor(null);
            await refresh({ force: true });
        } catch (e) {
            safeError('오류', e?.response?.data?.message || (mode === 'create' ? '생성 실패' : '수정 실패'));
        }
    };

    return (
        <section className="aa-page-dark p-6">
            {Header}
            <div className="aa-container-xxl">
                <div className="aa-panel-dark p-5 shadow-sm">
                    <div className="mb-4 aa-toolbar">
                        <span className="text-sm text-slate-400">대상:</span>
                        <div className="flex gap-2">
                            <button
                                onClick={() => { setAudience(AUDIENCES.ADMIN); setEditor(null); setSelected(null); }}
                                className={`aa-btn ${audience === AUDIENCES.ADMIN ? 'bg-slate-900' : ''}`}
                            >관리자</button>
                            <button
                                onClick={() => { setAudience(AUDIENCES.USER); setEditor(null); setSelected(null); }}
                                className={`aa-btn ${audience === AUDIENCES.USER  ? 'bg-slate-900' : ''}`}
                            >유저</button>
                        </div>
                        {loading && <span className="text-sm text-slate-400">로딩 중…</span>}
                    </div>

                    <div className="menu-split">
                        {/* 왼쪽 트리 */}
                        <div className="menu-left">
                            <div className="aa-panel-dark p-3">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="font-semibold text-slate-100">
                                        {audience === AUDIENCES.ADMIN ? '관리자 메뉴' : '유저 메뉴'}
                                    </div>
                                    <button className="aa-btn aa-btn-primary" onClick={() => openCreate(null)}>
                                        등록하기 (1뎁스)
                                    </button>
                                </div>

                                <div className="mt-2">
                                    {tree.length === 0
                                        ? <div className="text-slate-400 text-sm">등록된 메뉴가 없습니다.</div>
                                        : <MenuTree
                                            tree={tree}
                                            selectedId={selected?.id}
                                            onSelect={(node) => { setEditor(null); setSelected(node); }} // ← 오른쪽 초기화 후 상세
                                        />
                                    }
                                </div>
                            </div>

                            {selected && (
                                <div className="mt-3 flex gap-2 flex-wrap">
                                    <button className="aa-btn" onClick={() => moveUpDown(selected, 'up')}>위</button>
                                    <button className="aa-btn" onClick={() => moveUpDown(selected, 'down')}>아래</button>
                                </div>
                            )}
                        </div>

                        {/* 오른쪽 패널 */}
                        <div className="menu-right">
                            <MenuEditor
                                editor={editor}
                                selected={selected}
                                audience={audience}
                                boardTypes={boardTypes}
                                onDraftChange={onDraftChange}
                                onCancel={()=> setEditor(null)}
                                onSave={saveEditor}
                                onOpenCreate={openCreate}
                                onOpenEdit={openEdit}
                                onDelete={onDelete}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
