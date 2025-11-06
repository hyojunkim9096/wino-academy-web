// src/features/admin/pages/CommonCodeManagePage.jsx
// -----------------------------------------------------------------------------
// 공통코드 관리
// - 왼쪽: 그룹(1뎁스) 목록 (+ 등록/수정/삭제)
// - 오른쪽: 선택 그룹의 코드 목록(표) (+ 등록/수정/삭제)
// - IME(한글) 안전: 입력은 로컬 상태만 변경 (폼 리마운트 방지)
// - 🔆 UI 보강: 그룹/권한 영역에 .cc-box 프레임(테두리) 추가
// - 🔆 confirm: window.confirm → SweetAlert2 confirmDialog 로 교체
// -----------------------------------------------------------------------------
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { alertError, alertSuccess, alertInfo, confirmDialog } from '@/ui/alert'; // ★ confirmDialog 추가
import {
    listGroups, createGroup, updateGroup, deleteGroup,
    getCodes, createCode, updateCode, deleteCode,
} from '@/api/commonCodeAdminApi';
import '@/styles/admin.css';
import '@/styles/admin-codes.css';
import '@/styles/admin-system.css'; // 베이스/토큰(다크) - 항상 마지막

const safeInfo = (t, m) => Promise.resolve(alertInfo(t, m)).catch(() => {});
const safeSuccess = (t, m) => Promise.resolve(alertSuccess(t, m)).catch(() => {});
const safeError = (t, m) => Promise.resolve(alertError(t, m)).catch(() => {});

export default function CommonCodeManagePage() {
    /* ── 상태 ─────────────────────────────────────────────── */
    // 왼쪽 그룹
    const [groups, setGroups] = useState([]);
    const [selectedGroup, setSelectedGroup] = useState(null);

    // 오른쪽 코드 목록
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);

    // 에디터(오버레이) — groupEditor / codeEditor
    // groupEditor = { mode:'create'|'edit', originalGroupCode?:string, draft:{groupCode,name,description,sortOrder,enabled} }
    const [groupEditor, setGroupEditor] = useState(null);
    // codeEditor = { mode:'create'|'edit', originalCode?:string, draft:{code,name,sortOrder,enabled,metaJson} }
    const [codeEditor, setCodeEditor] = useState(null);

    /* ── 초기 부팅: 그룹 목록 로딩 ─────────────────────────── */
    useEffect(() => {
        (async () => {
            try {
                const list = await listGroups();
                setGroups(list || []);
                // 선택 유지 or 첫 번째 자동 선택
                setSelectedGroup((prev) => {
                    if (prev && list?.some(g => g.groupCode === prev.groupCode)) return prev;
                    return list?.[0] || null;
                });
            } catch (e) {
                safeError('오류', e?.response?.data?.message || e?.message || '그룹 조회 실패');
            }
        })();
    }, []);

    /* ── 그룹 선택 변경 → 코드 목록 로딩 ──────────────────── */
    useEffect(() => {
        (async () => {
            if (!selectedGroup) { setItems([]); return; }
            setLoading(true);
            try {
                const list = await getCodes(selectedGroup.groupCode);
                // list: [{code,name,sortOrder,enabled,metaJson}, ...] 라고 가정
                setItems(Array.isArray(list) ? list : []);
            } catch (e) {
                safeError('오류', e?.response?.data?.message || e?.message || '코드 조회 실패');
            } finally {
                setLoading(false);
            }
        })();
    }, [selectedGroup?.groupCode]);

    /* ── 헤더 ──────────────────────────────────────────────── */
    const Header = useMemo(() => (
        <div className="mb-5 aa-container-xxl">
            <h1 className="text-xl font-semibold text-white">공통코드 관리</h1>
            <p className="text-sm text-slate-400">왼쪽에서 그룹을 고르고, 오른쪽에서 코드들을 관리합니다.</p>
        </div>
    ), []);

    /* ===== 그룹 핸들러 ===== */
    const openCreateGroup = () => {
        setGroupEditor({
            mode: 'create',
            draft: { groupCode: '', name: '', description: '', sortOrder: groups.length || 0, enabled: true }
        });
    };
    const openEditGroup = (g) => {
        setGroupEditor({
            mode: 'edit',
            originalGroupCode: g.groupCode,
            draft: {
                groupCode: g.groupCode,     // 편집에서는 groupCode 바꾸지 않는 것을 권장(잠금)
                name: g.name || '',
                description: g.description || '',
                sortOrder: Number.isFinite(g.sortOrder) ? g.sortOrder : 0,
                enabled: !!g.enabled
            }
        });
    };
    const saveGroup = async () => {
        if (!groupEditor) return;
        const { mode, originalGroupCode, draft } = groupEditor;
        if (!draft.groupCode?.trim() || !draft.name?.trim()) {
            return safeInfo('안내', 'groupCode, name은 필수입니다.');
        }
        try {
            if (mode === 'create') {
                await createGroup({
                    groupCode: draft.groupCode.trim(),
                    name: draft.name.trim(),
                    description: draft.description || null,
                    sortOrder: Number(draft.sortOrder || 0),
                    enabled: !!draft.enabled
                });
                await safeSuccess('성공', '그룹이 등록되었습니다.');
            } else {
                await updateGroup(originalGroupCode, {
                    name: draft.name.trim(),
                    description: draft.description || null,
                    sortOrder: Number(draft.sortOrder || 0),
                    enabled: !!draft.enabled
                });
                await safeSuccess('성공', '그룹이 수정되었습니다.');
            }

            setGroupEditor(null);
            // 그룹 목록 리로드
            const list = await listGroups();
            setGroups(list || []);
            // 선택 유지 or 신규 선택
            const nextSel = list?.find(g => g.groupCode === (draft.groupCode || originalGroupCode)) || list?.[0] || null;
            setSelectedGroup(nextSel);
        } catch (e) {
            safeError('오류', e?.response?.data?.message || e?.message || '그룹 저장 실패');
        }
    };
    const removeGroup = async (g) => {
        // 🔆 SweetAlert2 confirm 모달
        const ok = await confirmDialog(
            '그룹 삭제 확인',
            `그룹 '${g.name}'를 삭제할까요?\n소속 코드가 있으면 함께 삭제됩니다.`,
            { confirmText: '삭제', cancelText: '취소', confirmColor: '#ef4444' }
        );
        if (!ok) return;

        try {
            await deleteGroup(g.groupCode);
            await safeSuccess('성공', '그룹이 삭제되었습니다.');
            const list = await listGroups();
            setGroups(list || []);
            // 삭제된 그룹이 선택되어 있었으면 옆으로 이동
            if (selectedGroup?.groupCode === g.groupCode) {
                setSelectedGroup(list?.[0] || null);
            }
        } catch (e) {
            safeError('오류', e?.response?.data?.message || e?.message || '그룹 삭제 실패');
        }
    };

    /* ===== 코드 핸들러 ===== */
    const openCreateCode = () => {
        if (!selectedGroup) return;
        setCodeEditor({
            mode: 'create',
            draft: { code: '', name: '', sortOrder: items.length || 0, enabled: true, metaJson: '' }
        });
    };
    const openEditCode = (row) => {
        if (!selectedGroup) return;
        setCodeEditor({
            mode: 'edit',
            originalCode: row.code,
            draft: {
                code: row.code || '',
                name: row.name || '',
                sortOrder: Number.isFinite(row.sortOrder) ? row.sortOrder : 0,
                enabled: !!row.enabled,
                metaJson: row.metaJson || ''
            }
        });
    };
    const saveCode = async () => {
        if (!codeEditor || !selectedGroup) return;
        const { mode, originalCode, draft } = codeEditor;
        if (!draft.code?.trim() || !draft.name?.trim()) {
            return safeInfo('안내', 'code, name은 필수입니다.');
        }
        try {
            if (mode === 'create') {
                await createCode(selectedGroup.groupCode, {
                    code: draft.code.trim(),
                    name: draft.name.trim(),
                    sortOrder: Number(draft.sortOrder || 0),
                    enabled: !!draft.enabled,
                    metaJson: draft.metaJson || null
                });
                await safeSuccess('성공', '코드가 등록되었습니다.');
            } else {
                await updateCode(selectedGroup.groupCode, originalCode, {
                    // code 자체도 바꿀 수 있게 반영
                    code: draft.code.trim(),
                    name: draft.name.trim(),
                    sortOrder: Number(draft.sortOrder || 0),
                    enabled: !!draft.enabled,
                    metaJson: draft.metaJson || null
                });
                await safeSuccess('성공', '코드가 수정되었습니다.');
            }

            setCodeEditor(null);
            const list = await getCodes(selectedGroup.groupCode);
            setItems(Array.isArray(list) ? list : []);
        } catch (e) {
            safeError('오류', e?.response?.data?.message || e?.message || '코드 저장 실패');
        }
    };
    const removeCode = async (row) => {
        if (!selectedGroup) return;
        // 🔆 SweetAlert2 confirm 모달
        const ok = await confirmDialog(
            '코드 삭제 확인',
            `'${row.name}' 코드를 삭제할까요?`,
            { confirmText: '삭제', cancelText: '취소', confirmColor: '#ef4444' }
        );
        if (!ok) return;

        try {
            await deleteCode(selectedGroup.groupCode, row.code);
            await safeSuccess('성공', '코드가 삭제되었습니다.');
            const list = await getCodes(selectedGroup.groupCode);
            setItems(Array.isArray(list) ? list : []);
        } catch (e) {
            safeError('오류', e?.response?.data?.message || e?.message || '코드 삭제 실패');
        }
    };

    /* ── 렌더 ──────────────────────────────────────────────── */
    return (
        <section className="aa-page-dark p-6">
            {Header}
            <div className="aa-container-xxl">
                <div className="aa-panel-dark p-5 shadow-sm">
                    {/* 3:7 레이아웃 */}
                    <div className="aa-split aa-split-3-7">
                        {/* ── 왼쪽: 그룹 ───────────────────────────── */}
                        <div className="aa-left-3">
                            <div className="aa-sticky-lg aa-panel-scroll">
                                <div className="aa-panel-dark p-3">
                                    {/* 🔆 그룹 박스(프레임) */}
                                    <div className="cc-box">
                                        <div className="cc-box-head">
                                            <div className="font-semibold text-slate-100">그룹</div>
                                            <div className="flex gap-2">
                                                <button className="aa-btn aa-btn-primary" onClick={openCreateGroup}>그룹 등록</button>
                                                {selectedGroup && (
                                                    <>
                                                        <button className="aa-btn" onClick={() => openEditGroup(selectedGroup)}>그룹 수정</button>
                                                        <button className="aa-btn aa-btn-danger" onClick={() => removeGroup(selectedGroup)}>그룹 삭제</button>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                        <div className="cc-box-body">
                                            <div className="cc-list">
                                                {groups.length === 0 ? (
                                                    <div className="text-slate-400 text-sm">등록된 그룹이 없습니다.</div>
                                                ) : groups.map((g) => (
                                                    <button
                                                        key={g.groupCode}
                                                        className={`cc-item ${selectedGroup?.groupCode === g.groupCode ? 'is-active' : ''}`}
                                                        onClick={() => { setSelectedGroup(g); setCodeEditor(null); }}
                                                        title={g.description || g.groupCode}
                                                    >
                                                        <span className="cc-badge">{Number.isFinite(g.sortOrder) ? g.sortOrder : '-'}</span>
                                                        <span className="cc-name">{g.name}</span>
                                                        <span className="cc-code">{g.groupCode}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* ── 오른쪽: 코드 목록(= 권한 쪽으로 이해) ───── */}
                        <div className="aa-right-7">
                            <div className="aa-sticky-lg aa-panel-scroll">
                                <div className="aa-panel-dark p-4">
                                    {/* 🔆 권한/코드 박스(프레임) */}
                                    <div className="cc-box">
                                        <div className="cc-box-head">
                                            <div>
                                                <div className="font-semibold">{selectedGroup?.name || '-'}</div>
                                                <div className="text-xs text-slate-400">{selectedGroup?.groupCode || ''}</div>
                                            </div>
                                            <div className="flex gap-2">
                                                <button className="aa-btn aa-btn-primary" onClick={openCreateCode} disabled={!selectedGroup}>코드 등록</button>
                                            </div>
                                        </div>

                                        <div className="cc-box-body">
                                            {loading ? (
                                                <div className="text-slate-400">로딩 중…</div>
                                            ) : (
                                                <table className="cc-table">
                                                    <thead>
                                                    <tr>
                                                        <th style={{width:'160px'}}>code</th>
                                                        <th>name</th>
                                                        <th style={{width:'80px'}}>정렬</th>
                                                        <th style={{width:'120px'}}>사용</th>
                                                        <th style={{width:'140px'}}>액션</th>
                                                    </tr>
                                                    </thead>
                                                    <tbody>
                                                    {items.length === 0 ? (
                                                        <tr><td colSpan={5} className="cc-empty">등록된 코드가 없습니다.</td></tr>
                                                    ) : items
                                                        .slice()
                                                        .sort((a,b) => (a.sortOrder??0) - (b.sortOrder??0) || a.code.localeCompare(b.code))
                                                        .map((row) => (
                                                            <tr key={row.code}>
                                                                <td><span className="font-mono">{row.code}</span></td>
                                                                <td>{row.name}</td>
                                                                <td>{Number.isFinite(row.sortOrder) ? row.sortOrder : '-'}</td>
                                                                <td>{row.enabled ? 'true' : 'false'}</td>
                                                                <td>
                                                                    <div className="flex gap-2">
                                                                        <button className="aa-btn" onClick={() => openEditCode(row)}>수정</button>
                                                                        <button className="aa-btn aa-btn-danger" onClick={() => removeCode(row)}>삭제</button>
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            )}
                                        </div>
                                    </div>

                                    {/* 그룹 에디터(오버레이) */}
                                    {groupEditor && (
                                        <div className="cc-editor">
                                            <div className="cc-editor-card">
                                                <div className="flex items-center justify-between mb-3">
                                                    <div className="font-semibold">
                                                        {groupEditor.mode === 'create' ? '그룹 등록' : '그룹 수정'}
                                                    </div>
                                                    <button className="aa-btn" onClick={() => setGroupEditor(null)}>닫기</button>
                                                </div>
                                                <div className="grid grid-cols-2 gap-3">
                                                    <div className="col-span-1">
                                                        <label className="cc-label">groupCode</label>
                                                        <input
                                                            className="cc-input"
                                                            value={groupEditor.draft.groupCode}
                                                            onChange={(e) => setGroupEditor(prev => ({...prev, draft:{...prev.draft, groupCode:e.target.value}}))}
                                                            disabled={groupEditor.mode === 'edit'}
                                                            placeholder="BOARD_TYPE"
                                                        />
                                                    </div>
                                                    <div className="col-span-1">
                                                        <label className="cc-label">name</label>
                                                        <input
                                                            className="cc-input"
                                                            value={groupEditor.draft.name}
                                                            onChange={(e) => setGroupEditor(prev => ({...prev, draft:{...prev.draft, name:e.target.value}}))}
                                                            placeholder="게시판 타입"
                                                        />
                                                    </div>
                                                    <div className="col-span-2">
                                                        <label className="cc-label">description</label>
                                                        <input
                                                            className="cc-input"
                                                            value={groupEditor.draft.description || ''}
                                                            onChange={(e) => setGroupEditor(prev => ({...prev, draft:{...prev.draft, description:e.target.value}}))}
                                                            placeholder="설명(선택)"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="cc-label">정렬</label>
                                                        <input
                                                            type="number"
                                                            className="cc-input"
                                                            value={groupEditor.draft.sortOrder ?? 0}
                                                            onChange={(e) => setGroupEditor(prev => ({...prev, draft:{...prev.draft, sortOrder:Number(e.target.value)}}))}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="cc-label">사용</label>
                                                        <input
                                                            type="checkbox"
                                                            className="w-4 h-4 align-middle ml-2"
                                                            checked={!!groupEditor.draft.enabled}
                                                            onChange={(e) => setGroupEditor(prev => ({...prev, draft:{...prev.draft, enabled:e.target.checked}}))}
                                                        />
                                                    </div>
                                                </div>
                                                <div className="mt-4 flex justify-end gap-2">
                                                    <button className="aa-btn" onClick={() => setGroupEditor(null)}>취소</button>
                                                    <button className="aa-btn aa-btn-primary" onClick={saveGroup}>저장</button>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* 코드 에디터(오버레이) */}
                                    {codeEditor && (
                                        <div className="cc-editor">
                                            <div className="cc-editor-card">
                                                <div className="flex items-center justify-between mb-3">
                                                    <div className="font-semibold">
                                                        {codeEditor.mode === 'create' ? '코드 등록' : '코드 수정'}
                                                    </div>
                                                    <button className="aa-btn" onClick={() => setCodeEditor(null)}>닫기</button>
                                                </div>
                                                <div className="grid grid-cols-2 gap-3">
                                                    <div className="col-span-1">
                                                        <label className="cc-label">code</label>
                                                        <input
                                                            className="cc-input"
                                                            value={codeEditor.draft.code}
                                                            onChange={(e) => setCodeEditor(prev => ({...prev, draft:{...prev.draft, code:e.target.value}}))}
                                                            placeholder="TABLE or GALLERY"
                                                        />
                                                    </div>
                                                    <div className="col-span-1">
                                                        <label className="cc-label">name</label>
                                                        <input
                                                            className="cc-input"
                                                            value={codeEditor.draft.name}
                                                            onChange={(e) => setCodeEditor(prev => ({...prev, draft:{...prev.draft, name:e.target.value}}))}
                                                            placeholder="테이블형 / 갤러리형"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="cc-label">정렬</label>
                                                        <input
                                                            type="number"
                                                            className="cc-input"
                                                            value={codeEditor.draft.sortOrder ?? 0}
                                                            onChange={(e) => setCodeEditor(prev => ({...prev, draft:{...prev.draft, sortOrder:Number(e.target.value)}}))}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="cc-label">사용</label>
                                                        <input
                                                            type="checkbox"
                                                            className="w-4 h-4 align-middle ml-2"
                                                            checked={!!codeEditor.draft.enabled}
                                                            onChange={(e) => setCodeEditor(prev => ({...prev, draft:{...prev.draft, enabled:e.target.checked}}))}
                                                        />
                                                    </div>
                                                    <div className="col-span-2">
                                                        <label className="cc-label">metaJson</label>
                                                        <textarea
                                                            className="cc-input"
                                                            rows={3}
                                                            value={codeEditor.draft.metaJson || ''}
                                                            onChange={(e) => setCodeEditor(prev => ({...prev, draft:{...prev.draft, metaJson:e.target.value}}))}
                                                            placeholder='{"thumb":"on","cols":3}'
                                                        />
                                                    </div>
                                                </div>
                                                <div className="mt-4 flex justify-end gap-2">
                                                    <button className="aa-btn" onClick={() => setCodeEditor(null)}>취소</button>
                                                    <button className="aa-btn aa-btn-primary" onClick={saveCode}>저장</button>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                </div>
                            </div>
                        </div>

                    </div>
                </div>
            </div>
        </section>
    );
}