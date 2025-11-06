// src/features/admin/components/menu/MenuEditor.jsx
// ============================================================================
// 메뉴 에디터(오른쪽 패널)
// - 3뎁스는 SCREEN 고정, USER+SCREEN일 때 보드 타입 노출
// - 에디터 최초 오픈 시 한 번만 자동 포커스(IME/한글 입력 끊김 방지)
// - 보기 모드: 상단 우측에 "하위 추가 / 수정 / 삭제" 버튼(한 곳에서만 노출)
// ============================================================================

import React, { useEffect, useRef } from 'react';

// (중요) 순환 import 방지: 로컬 상수로 대체
const TYPES = { FOLDER: 'FOLDER', SCREEN: 'SCREEN' };

export default function MenuEditor({
                                       editor,
                                       selected,
                                       audience,          // 'ADMIN' | 'USER'
                                       boardTypes = [],   // USER + SCREEN일 때 필요
                                       onDraftChange,
                                       onCancel,
                                       onSave,
                                       onOpenCreate,
                                       onOpenEdit,
                                       onDelete,
                                   }) {
    // 에디터 최초 오픈 시 한 번만 자동 포커스
    const nameRef = useRef(null);
    const didAutoFocusRef = useRef(false);
    useEffect(() => {
        if (editor && !didAutoFocusRef.current && nameRef.current) {
            didAutoFocusRef.current = true;
            requestAnimationFrame(() => {
                if (!nameRef.current) return;
                nameRef.current.focus();
                try {
                    const len = nameRef.current.value?.length ?? 0;
                    nameRef.current.setSelectionRange(len, len);
                } catch {}
            });
        }
        if (!editor) didAutoFocusRef.current = false;
    }, [!!editor]);

    // ── 편집/등록 모드 ────────────────────────────────────────
    if (editor) {
        const { mode, parent, node, draft } = editor;
        const depth = parent ? (parent.depth + 1) : (node ? node.depth : 1);
        const isCreate = mode === 'create';

        // 3뎁스는 SCREEN 고정
        const maxDepth = 3;
        const canChooseType = depth < maxDepth;
        const finalType = (depth === 3) ? TYPES.SCREEN : draft.type;

        // USER + SCREEN일 때만 게시판 타입 필요
        const isUserScreen = audience === 'USER' && finalType === TYPES.SCREEN;

        return (
            <div className="aa-panel-dark p-4 space-y-4">
                {/* 헤더 */}
                <div className="flex items-center justify-between">
                    <div>
                        <div className="font-semibold">
                            {isCreate ? `${depth}뎁스 메뉴 등록` : `메뉴 수정`}
                        </div>
                        <div className="text-xs text-slate-400">
                            depth: {depth}{' '}
                            {parent
                                ? `· parent: ${parent.name}`
                                : node
                                    ? `· parent: ${node.parentId ?? 'root'}`
                                    : ''}
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button className="aa-btn" onClick={onCancel}>취소</button>
                        <button className="aa-btn aa-btn-primary" onClick={onSave}>
                            {isCreate ? '등록' : '저장'}
                        </button>
                    </div>
                </div>

                {/* 폼 */}
                <div className="grid grid-cols-2 gap-4">
                    {/* 메뉴명 */}
                    <div className="col-span-2">
                        <label className="block text-sm font-semibold text-slate-300 mb-1">메뉴명</label>
                        <input
                            ref={nameRef}
                            className="w-full bg-slate-800 text-white border border-slate-700 rounded px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
                            value={draft.name}
                            onChange={(e) => onDraftChange('name', e.target.value)}
                            placeholder="메뉴명을 입력하세요"
                            inputMode="text"
                            autoComplete="off"
                            spellCheck={false}
                        />
                    </div>

                    {/* 타입 (3뎁스는 선택 불가) */}
                    <div>
                        <label className="block text-sm font-semibold text-slate-300 mb-1">타입</label>
                        {canChooseType ? (
                            <select
                                className="w-full bg-slate-800 text-white border border-slate-700 rounded px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
                                value={draft.type}
                                onChange={(e) => onDraftChange('type', e.target.value)}
                            >
                                <option value={TYPES.FOLDER}>FOLDER</option>
                                <option value={TYPES.SCREEN}>SCREEN</option>
                            </select>
                        ) : (
                            <input
                                className="w-full bg-slate-800 text-white border border-slate-700 rounded px-3 py-2"
                                value="SCREEN (3뎁스 고정)"
                                disabled
                            />
                        )}
                    </div>

                    {/* 뎁스 표기(읽기전용) */}
                    <div>
                        <label className="block text-sm font-semibold text-slate-300 mb-1">뎁스</label>
                        <input
                            className="w-full bg-slate-800 text-white border border-slate-700 rounded px-3 py-2"
                            value={depth}
                            disabled
                        />
                    </div>

                    {/* SCREEN 전용 입력 */}
                    {finalType === TYPES.SCREEN && (
                        <>
                            <div className="col-span-2">
                                <label className="block text-sm font-semibold text-slate-300 mb-1">경로 (path)</label>
                                <input
                                    className="w-full bg-slate-800 text-white border border-slate-700 rounded px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
                                    value={draft.path || ''}
                                    onChange={(e) => onDraftChange('path', e.target.value)}
                                    placeholder="/admin/users"
                                />
                            </div>

                            <div className="col-span-2">
                                <label className="block text-sm font-semibold text-slate-300 mb-1">컴포넌트 키 (componentKey)</label>
                                <input
                                    className="w-full bg-slate-800 text-white border border-slate-700 rounded px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
                                    value={draft.componentKey || ''}
                                    onChange={(e) => onDraftChange('componentKey', e.target.value)}
                                    placeholder="AdminUsersPage"
                                />
                            </div>

                            {/* USER + SCREEN: 게시판 타입 */}
                            {isUserScreen && (
                                <div className="col-span-2">
                                    <label className="block text-sm font-semibold text-slate-300 mb-1">게시판 타입 (BOARD_TYPE)</label>
                                    <select
                                        className="w-full bg-slate-800 text-white border border-slate-700 rounded px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
                                        value={draft.boardType || ''}
                                        onChange={(e) => onDraftChange('boardType', e.target.value || '')}
                                    >
                                        <option value="">-- 선택 --</option>
                                        {boardTypes
                                            .slice()
                                            .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || String(a.code).localeCompare(String(b.code)))
                                            .map((bt) => (
                                                <option key={bt.code} value={bt.code}>
                                                    {bt.name} ({bt.code})
                                                </option>
                                            ))}
                                    </select>
                                </div>
                            )}
                        </>
                    )}

                    {/* 표시/활성 토글 */}
                    <div>
                        <label className="block text-sm font-semibold text-slate-300 mb-1">표시 (visible)</label>
                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                className="w-4 h-4"
                                checked={!!draft.visible}
                                onChange={(e) => onDraftChange('visible', e.target.checked)}
                            />
                            <span className="text-sm text-slate-300">{String(!!draft.visible)}</span>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-semibold text-slate-300 mb-1">활성 (enabled)</label>
                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                className="w-4 h-4"
                                checked={!!draft.enabled}
                                onChange={(e) => onDraftChange('enabled', e.target.checked)}
                            />
                            <span className="text-sm text-slate-300">{String(!!draft.enabled)}</span>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // ── 보기 모드(선택만 보여줌) ─────────────────────────────────
    if (!selected) {
        return (
            <div className="aa-panel-dark p-4">
                <div className="font-semibold mb-1">선택된 메뉴 없음</div>
                <div className="text-sm text-slate-400">
                    왼쪽에서 메뉴를 선택하거나 상단 “등록하기 (1뎁스)”로 추가하세요.
                </div>
            </div>
        );
    }

    const canAddD2 = selected.type === TYPES.FOLDER && selected.depth === 1;
    const canAddD3 = selected.type === TYPES.FOLDER && selected.depth === 2;

    return (
        <div className="aa-panel-dark p-4 space-y-4">
            {/* 상단: 제목 + 액션(한 곳에서만 노출 → 겹침 방지) */}
            <div className="flex items-center justify-between">
                <div>
                    <div className="font-semibold">{selected.name}</div>
                    <div className="text-xs text-slate-400">
                        depth: {selected.depth} · type: {selected.type} · parent: {selected.parentId ?? 'root'}
                    </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                    {canAddD2 && (
                        <button className="aa-btn" onClick={() => onOpenCreate(selected)}>
                            등록하기 (하위 2뎁스)
                        </button>
                    )}
                    {canAddD3 && (
                        <button className="aa-btn" onClick={() => onOpenCreate(selected)}>
                            등록하기 (하위 3뎁스)
                        </button>
                    )}
                    <button className="aa-btn aa-btn-primary" onClick={() => onOpenEdit(selected)}>수정</button>
                    <button className="aa-btn aa-btn-danger" onClick={() => onDelete(selected)}>삭제</button>
                </div>
            </div>

            {/* 상세 필드 뷰 */}
            <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                    <div className="text-slate-400 mb-1">경로(path)</div>
                    <div className="border border-slate-700 rounded px-2 py-1 bg-slate-800 text-slate-100 font-mono">
                        {selected.path || '-'}
                    </div>
                </div>
                <div>
                    <div className="text-slate-400 mb-1">컴포넌트 키(componentKey)</div>
                    <div className="border border-slate-700 rounded px-2 py-1 bg-slate-800 text-slate-100 font-mono">
                        {selected.componentKey || '-'}
                    </div>
                </div>

                {/* USER + SCREEN 일 때만 보드 타입 표시 */}
                {audience === 'USER' && selected.type === TYPES.SCREEN && (
                    <div className="col-span-2">
                        <div className="text-slate-400 mb-1">게시판 타입(boardType)</div>
                        <div className="border border-slate-700 rounded px-2 py-1 bg-slate-800 text-slate-100 font-mono">
                            {selected.boardType || '-'}
                        </div>
                    </div>
                )}

                <div>
                    <div className="text-slate-400 mb-1">표시(visible)</div>
                    <div className="border border-slate-700 rounded px-2 py-1 bg-slate-800">
                        {String(selected.visible)}
                    </div>
                </div>
                <div>
                    <div className="text-slate-400 mb-1">활성(enabled)</div>
                    <div className="border border-slate-700 rounded px-2 py-1 bg-slate-800">
                        {String(selected.enabled)}
                    </div>
                </div>
            </div>
        </div>
    );
}