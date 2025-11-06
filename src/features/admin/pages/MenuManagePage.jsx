// src/features/admin/pages/MenuManagePage.jsx
// ============================================================================
// 메뉴 관리 컨테이너
// - 좌: 트리(접기/펼치기) + 자체 스크롤(.tree-scroll)
// - 우: 에디터를 카드 레이아웃(.menu-editor-card)으로 감싸 UI 정돈
// - USER 메뉴에서만 BOARD_TYPE 공통코드 로딩(1/0/true/false 모두 처리)
// - “하위 추가/삭제” 버튼은 에디터(보기 모드) 내부에서만 노출 → 중복/겹침 방지
// - 상단 대상 토글은 .aa-seg 로 “불 들어오게” 시각 강화 (초기 ADMIN 활성)
// - 삭제 확인: SweetAlert2 confirmDialog 사용(기본 confirm 미사용)
// ============================================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getMenuTree, createMenu, updateMenu, deleteMenu, reorderMenu } from '@/api/menuApi';
import { getCodes as getCommonCodes } from '@/api/commonCodeAdminApi';
import { alertError, alertSuccess, alertInfo, confirmDialog } from '@/ui/alert'; // ★ confirmDialog 추가
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
    // ✅ 처음 들어오면 관리자 선택 상태
    const [audience, setAudience] = useState(AUDIENCES.ADMIN);
    const [tree, setTree]         = useState([]);
    const [selected, setSelected] = useState(null);
    const [loading, setLoading]   = useState(false);

    // USER + SCREEN일 때 쓰는 게시판 타입(공통코드)
    const [boardTypes, setBoardTypes] = useState([]);

    // 오른쪽 편집 상태: { mode: 'create'|'edit', parent, node, draft }
    const [editor, setEditor] = useState(null);
    const editorRef = useRef(editor);
    useEffect(() => { editorRef.current = editor; }, [editor]);

    // 상단 헤더
    const Header = useMemo(() => (
        <div className="mb-5 aa-container-xxl">
            <h1 className="text-xl font-semibold text-white">메뉴 관리</h1>
            <p className="text-sm text-slate-400">최대 3뎁스 · 3뎁스는 SCREEN만 등록</p>
        </div>
    ), []);

    // USER 대상일 때만 BOARD_TYPE 로딩 (enabled 1/0/true/false 호환)
    useEffect(() => {
        let ignore = false;
        (async () => {
            if (audience !== AUDIENCES.USER) { setBoardTypes([]); return; }
            try {
                const list = await getCommonCodes('BOARD_TYPE');
                const filtered = (Array.isArray(list) ? list : []).filter((x) => {
                    const en = x?.enabled;
                    // 어떤 포맷이와도 true만 통과
                    const enabledBool = en === true || en === 1 || en === '1';
                    return enabledBool;
                });
                if (!ignore) setBoardTypes(filtered);
            } catch (e) {
                safeError('오류', e?.response?.data?.message || '게시판 타입 조회 실패');
                if (!ignore) setBoardTypes([]);
            }
        })();
        return () => { ignore = true; };
    }, [audience]);

    // 트리 갱신(에디터 열려 있으면 자동 리프레시 차단)
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
            setSelected((prev) => (prev && findInTree(next, prev.id) ? prev : null));
            setEditor((prev) => {
                if (!prev) return prev;
                if (prev.mode === 'edit' && prev.node && !findInTree(next, prev.node.id)) return null;
                return prev;
            });
        } catch (e) {
            safeError('오류', e?.response?.data?.message || '메뉴 조회 실패');
        } finally {
            setLoading(false);
        }
    }, [audience]);

    useEffect(() => { refresh(); }, [refresh]);

    // 정렬(형제 간 순서 변경)
    const flatFromTree = (nodes, list = []) => {
        nodes.forEach((n) => {
            list.push(n);
            if (n.children?.length) flatFromTree(n.children, list);
        });
        return list;
    };
    const moveUpDown = async (node, dir) => {
        const flat = flatFromTree(tree);
        const siblings = flat
            .filter((x) => x.parentId === node.parentId)
            .sort((a, b) => a.sortOrder - b.sortOrder);
        const idx = siblings.findIndex((s) => s.id === node.id);
        const target = dir === 'up' ? idx - 1 : idx + 1;
        if (target < 0 || target >= siblings.length) return safeInfo('안내', '더 이상 이동할 수 없습니다.');

        const tmp = [...siblings];
        const [cur] = tmp.splice(idx, 1);
        tmp.splice(target, 0, cur);
        const orderedIds = tmp.map((s) => s.id);

        try {
            await reorderMenu(audience, node.parentId ?? null, orderedIds);
            await safeSuccess('성공', '순서가 변경되었습니다.');
            await refresh({ force: true });
        } catch (e) {
            safeError('오류', e?.response?.data?.message || '재정렬 실패');
        }
    };

    // 신규 열기
    const openCreate = (parent) => {
        const targetDepth = parent ? parent.depth + 1 : 1;
        setEditor({
            mode: 'create',
            parent,
            node: null,
            draft: {
                name: '',
                type: targetDepth === 3 ? TYPES.SCREEN : TYPES.FOLDER, // 3뎁스 고정
                path: '',
                componentKey: '',
                visible: true,
                enabled: true,
                boardType: '',
            },
        });
    };

    // 수정 열기
    const openEdit = (node) => {
        setSelected(node);
        setEditor({
            mode: 'edit',
            parent: null,
            node,
            draft: {
                name: node.name || '',
                type: node.type || TYPES.FOLDER,
                path: node.path || '',
                componentKey: node.componentKey || '',
                visible: !!node.visible,
                enabled: !!node.enabled,
                boardType: node.boardType || '',
            },
        });
    };

    // 삭제 (SweetAlert2 confirm 사용)
    const onDelete = async (node) => {
        const ok = await confirmDialog(
            '삭제 확인',
            `'${node.name}' 메뉴를 삭제할까요?\n하위 메뉴가 있으면 함께 삭제됩니다.`,
            { confirmText: '삭제', cancelText: '취소', confirmColor: '#ef4444' }
        );
        if (!ok) return;

        try {
            await deleteMenu(node.id);
            await safeSuccess('성공', '삭제되었습니다.');
            setSelected(null);
            setEditor(null);
            await refresh({ force: true });
        } catch (e) {
            safeError('오류', e?.response?.data?.message || '삭제 실패');
        }
    };

    // draft 변경
    const onDraftChange = (k, v) =>
        setEditor((prev) => (prev ? { ...prev, draft: { ...prev.draft, [k]: v } } : prev));

    // 저장
    const saveEditor = async () => {
        if (!editor) return;
        const { mode, parent, node, draft } = editor;
        const depth = parent ? parent.depth + 1 : (node ? node.depth : 1);
        const finalType = depth === 3 ? TYPES.SCREEN : draft.type;
        const isUserScreen = audience === AUDIENCES.USER && finalType === TYPES.SCREEN;

        const { name, path, componentKey, visible, enabled, boardType } = draft;
        if (!name?.trim()) return safeInfo('안내', '메뉴명을 입력하세요.');
        if (finalType === TYPES.SCREEN) {
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
                    path: finalType === TYPES.SCREEN ? path.trim() : null,
                    componentKey: finalType === TYPES.SCREEN ? componentKey.trim() : null,
                    icon: null,
                    visible: !!visible,
                    enabled: !!enabled,
                    requiredRole: null,
                    boardType: finalType === TYPES.SCREEN ? (boardType || null) : null,
                });
                await safeSuccess('성공', `${depth}뎁스 메뉴가 생성되었습니다.`);
            } else {
                await updateMenu(node.id, {
                    name: name.trim(),
                    type: finalType,
                    parentId: node.parentId,
                    path: finalType === TYPES.SCREEN ? path.trim() : null,
                    componentKey: finalType === TYPES.SCREEN ? componentKey.trim() : null,
                    icon: node.icon ?? null,
                    visible: !!visible,
                    enabled: !!enabled,
                    requiredRole: node.requiredRole ?? null,
                    boardType: finalType === TYPES.SCREEN ? (boardType || null) : null,
                });
                await safeSuccess('성공', '수정되었습니다.');
            }
            setEditor(null);
            await refresh({ force: true });
        } catch (e) {
            safeError('오류', e?.response?.data?.message || (mode === 'create' ? '생성 실패' : '수정 실패'));
        }
    };

    // 대상 토글 렌더(세그: 시각 명확)
    const AudienceSeg = (
        <div className="aa-seg" role="tablist" aria-label="대상">
            <button
                className={audience === AUDIENCES.ADMIN ? 'active' : ''}
                aria-pressed={audience === AUDIENCES.ADMIN}
                onClick={() => { setAudience(AUDIENCES.ADMIN); setEditor(null); setSelected(null); }}
            >관리자</button>
            <button
                className={audience === AUDIENCES.USER ? 'active' : ''}
                aria-pressed={audience === AUDIENCES.USER}
                onClick={() => { setAudience(AUDIENCES.USER); setEditor(null); setSelected(null); }}
            >유저</button>
        </div>
    );

    return (
        <section className="aa-page-dark p-6">
            {Header}
            <div className="aa-container-xxl">
                <div className="aa-panel-dark p-5 shadow-sm">
                    {/* 상단 툴바 */}
                    <div className="mb-4 aa-toolbar" style={{ alignItems: 'center' }}>
                        {AudienceSeg}
                        {loading && <span className="text-sm text-slate-400">로딩 중…</span>}
                    </div>

                    {/* 좌/우 분할 */}
                    <div className="menu-split">
                        {/* 좌: 트리 + 스크롤 */}
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

                                {/* 트리 스크롤 컨테이너 */}
                                <div className="tree-scroll">
                                    {tree.length === 0
                                        ? <div className="text-slate-400 text-sm">등록된 메뉴가 없습니다.</div>
                                        : (
                                            <MenuTree
                                                tree={tree}
                                                selectedId={selected?.id}
                                                onSelect={(node) => { setEditor(null); setSelected(node); }}
                                                defaultExpandedDepth={2}  // 1,2뎁스 기본 펼침
                                            />
                                        )}
                                </div>
                            </div>

                            {/* 형제 재정렬 */}
                            {selected && (
                                <div className="mt-3 flex gap-2 flex-wrap">
                                    <button className="aa-btn" onClick={() => moveUpDown(selected, 'up')}>위</button>
                                    <button className="aa-btn" onClick={() => moveUpDown(selected, 'down')}>아래</button>
                                </div>
                            )}
                        </div>

                        {/* 우: 에디터 카드 */}
                        <div className="menu-right">
                            <div className="menu-editor-card">
                                <div className="menu-editor-header">
                                    <div className="text-slate-200 font-semibold">
                                        {editor?.mode === 'create'
                                            ? '메뉴 등록'
                                            : (selected ? `메뉴 상세/수정: ${selected.name}` : '메뉴 상세')}
                                    </div>
                                </div>

                                <MenuEditor
                                    editor={editor}
                                    selected={selected}
                                    audience={audience}
                                    boardTypes={boardTypes}
                                    onDraftChange={onDraftChange}
                                    onCancel={() => setEditor(null)}
                                    onSave={saveEditor}
                                    onOpenCreate={openCreate}
                                    onOpenEdit={openEdit}
                                    onDelete={onDelete}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}