// src/features/admin/components/menu/MenuEditor.jsx
import React, { useEffect, useRef } from 'react';
import { AUDIENCES, TYPES } from '@/features/admin/pages/MenuManagePage';

export default function MenuEditor({
                                       editor, selected, audience, boardTypes,
                                       onDraftChange, onCancel, onSave,
                                       onOpenCreate, onOpenEdit, onDelete,
                                   }) {
    // 에디터 열릴 때 '한 번만' 자동 포커스 (포커스 흔들림 방지)
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

    // 폼 모드
    if (editor) {
        const { mode, parent, node, draft } = editor;
        const depth = parent ? (parent.depth + 1) : (node ? node.depth : 1);
        const isCreate = mode === 'create';
        const maxDepth = 3;
        const canChooseType = depth < maxDepth;                 // 3뎁스는 SCREEN 고정
        const finalType = (depth === 3) ? TYPES.SCREEN : draft.type;
        const isUserScreen = audience === AUDIENCES.USER && finalType === TYPES.SCREEN;

        return (
            <div className="aa-panel-dark p-4 space-y-4">
                <div className="flex items-center justify-between">
                    <div>
                        <div className="font-semibold">
                            {isCreate ? `${depth}뎁스 메뉴 등록` : `메뉴 수정`}
                        </div>
                        <div className="text-xs text-slate-400">
                            depth: {depth} {parent ? `· parent: ${parent.name}` : node ? `· parent: ${node.parentId ?? 'root'}` : ''}
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button className="aa-btn" onClick={onCancel}>취소</button>
                        <button className="aa-btn aa-btn-primary" onClick={onSave}>{isCreate ? '등록' : '저장'}</button>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    {/* 메뉴명 */}
                    <div className="col-span-2">
                        <label className="block text-sm font-semibold text-slate-300 mb-1">메뉴명</label>
                        <input
                            ref={nameRef}
                            className="w-full bg-slate-800 text-white border border-slate-700 rounded px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
                            value={draft.name}
                            onChange={(e)=>onDraftChange('name', e.target.value)}  // ✅ 단순 컨트롤드 인풋 (IME 자연 처리)
                            placeholder="메뉴명을 입력하세요"
                            inputMode="text"
                            autoComplete="off"
                            spellCheck={false}
                        />
                    </div>

                    {/* 타입 */}
                    <div>
                        <label className="block text-sm font-semibold text-slate-300 mb-1">타입</label>
                        {canChooseType ? (
                            <select
                                className="w-full bg-slate-800 text-white border border-slate-700 rounded px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
                                value={draft.type}
                                onChange={(e)=>onDraftChange('type', e.target.value)}
                            >
                                <option value={TYPES.FOLDER}>FOLDER</option>
                                <option value={TYPES.SCREEN}>SCREEN</option>
                            </select>
                        ) : (
                            <input className="w-full bg-slate-800 text-white border border-slate-700 rounded px-3 py-2" value="SCREEN (3뎁스 고정)" disabled />
                        )}
                    </div>

                    {/* 뎁스 */}
                    <div>
                        <label className="block text-sm font-semibold text-slate-300 mb-1">뎁스</label>
                        <input className="w-full bg-slate-800 text-white border border-slate-700 rounded px-3 py-2" value={depth} disabled />
                    </div>

                    {/* SCREEN 전용 */}
                    {finalType === TYPES.SCREEN && (
                        <>
                            <div className="col-span-2">
                                <label className="block text-sm font-semibold text-slate-300 mb-1">경로 (path)</label>
                                <input
                                    className="w-full bg-slate-800 text-white border border-slate-700 rounded px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
                                    value={draft.path || ''}
                                    onChange={(e)=>onDraftChange('path', e.target.value)}
                                    placeholder="/admin/users"
                                />
                            </div>
                            <div className="col-span-2">
                                <label className="block text-sm font-semibold text-slate-300 mb-1">컴포넌트 키 (componentKey)</label>
                                <input
                                    className="w-full bg-slate-800 text-white border border-slate-700 rounded px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
                                    value={draft.componentKey || ''}
                                    onChange={(e)=>onDraftChange('componentKey', e.target.value)}
                                    placeholder="AdminUsersPage"
                                />
                            </div>

                            {isUserScreen && (
                                <div className="col-span-2">
                                    <label className="block text-sm font-semibold text-slate-300 mb-1">게시판 타입 (BOARD_TYPE)</label>
                                    <select
                                        className="w-full bg-slate-800 text-white border border-slate-700 rounded px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
                                        value={draft.boardType || ''}
                                        onChange={(e)=>onDraftChange('boardType', e.target.value || '')}
                                    >
                                        <option value="">-- 선택 --</option>
                                        {boardTypes
                                            .slice()
                                            .sort((a,b)=>(a.sortOrder??0)-(b.sortOrder??0) || a.code.localeCompare(b.code))
                                            .map(bt => (
                                                <option key={bt.code} value={bt.code}>
                                                    {bt.name} ({bt.code})
                                                </option>
                                            ))}
                                    </select>
                                </div>
                            )}
                        </>
                    )}

                    {/* 표시/활성 */}
                    <div>
                        <label className="block text-sm font-semibold text-slate-300 mb-1">표시 (visible)</label>
                        <div className="flex items-center gap-2">
                            <input type="checkbox" className="w-4 h-4" checked={!!draft.visible} onChange={(e)=>onDraftChange('visible', e.target.checked)} />
                            <span className="text-sm text-slate-300">{String(!!draft.visible)}</span>
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-slate-300 mb-1">활성 (enabled)</label>
                        <div className="flex items-center gap-2">
                            <input type="checkbox" className="w-4 h-4" checked={!!draft.enabled} onChange={(e)=>onDraftChange('enabled', e.target.checked)} />
                            <span className="text-sm text-slate-300">{String(!!draft.enabled)}</span>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // 보기 모드
    if (!selected) {
        return (
            <div className="aa-panel-dark p-4">
                <div className="font-semibold mb-1">선택된 메뉴 없음</div>
                <div className="text-sm text-slate-400">왼쪽에서 메뉴를 선택하거나 상단 “등록하기 (1뎁스)”로 추가하세요.</div>
            </div>
        );
    }

    const canAddD2 = selected.type === TYPES.FOLDER && selected.depth === 1;
    const canAddD3 = selected.type === TYPES.FOLDER && selected.depth === 2;

    return (
        <div className="aa-panel-dark p-4 space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <div className="font-semibold">{selected.name}</div>
                    <div className="text-xs text-slate-400">
                        depth: {selected.depth} · type: {selected.type} · parent: {selected.parentId ?? 'root'}
                    </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                    {canAddD2 && <button className="aa-btn" onClick={() => onOpenCreate(selected)}>등록하기 (하위 2뎁스)</button>}
                    {canAddD3 && <button className="aa-btn" onClick={() => onOpenCreate(selected)}>등록하기 (하위 3뎁스)</button>}
                    <button className="aa-btn aa-btn-primary" onClick={() => onOpenEdit(selected)}>수정</button>
                    <button className="aa-btn aa-btn-danger" onClick={() => onDelete(selected)}>삭제</button>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                    <div className="text-slate-400 mb-1">경로(path)</div>
                    <div className="border border-slate-700 rounded px-2 py-1 bg-slate-800 text-slate-100 font-mono">{selected.path || '-'}</div>
                </div>
                <div>
                    <div className="text-slate-400 mb-1">컴포넌트 키(componentKey)</div>
                    <div className="border border-slate-700 rounded px-2 py-1 bg-slate-800 text-slate-100 font-mono">{selected.componentKey || '-'}</div>
                </div>

                {audience === AUDIENCES.USER && selected.type === TYPES.SCREEN && (
                    <div className="col-span-2">
                        <div className="text-slate-400 mb-1">게시판 타입(boardType)</div>
                        <div className="border border-slate-700 rounded px-2 py-1 bg-slate-800 text-slate-100 font-mono">
                            {selected.boardType || '-'}
                        </div>
                    </div>
                )}

                <div>
                    <div className="text-slate-400 mb-1">표시(visible)</div>
                    <div className="border border-slate-700 rounded px-2 py-1 bg-slate-800">{String(selected.visible)}</div>
                </div>
                <div>
                    <div className="text-slate-400 mb-1">활성(enabled)</div>
                    <div className="border border-slate-700 rounded px-2 py-1 bg-slate-800">{String(selected.enabled)}</div>
                </div>
            </div>
        </div>
    );
}
