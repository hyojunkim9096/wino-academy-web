// src/features/system/pages/CommonCodePage.jsx
// =============================================================================
// 공통코드 관리 페이지
// -----------------------------------------------------------------------------
// - 왼쪽: 그룹 목록 (선택/추가/수정/삭제)
// - 오른쪽: 선택된 그룹의 상세 코드 목록 (Meta JSON 컬럼 포함)
// - ✅ Fix: 저장 시 알림창이 모달 뒤에 가려지는 문제 해결 (모달 선닫기)
// =============================================================================

import React, { useEffect, useMemo, useState } from 'react';
import { alertError, alertSuccess, alertInfo, confirmDialog } from '@/common/ui/alert.js';
import {
    listGroups, createGroup, updateGroup, deleteGroup,
    getCodes, createCode, updateCode, deleteCode,
} from '@/features/system/api/commonCodeAdminApi.js';

// 스타일 임포트
import '@/features/system/styles/admin.css';
import '@/features/system/styles/admin-system.css';
import '@/features/system/styles/admin-codes.css';

const safeInfo = (t, m) => Promise.resolve(alertInfo(t, m)).catch(() => {});
const safeSuccess = (t, m) => Promise.resolve(alertSuccess(t, m)).catch(() => {});
const safeError = (t, m) => Promise.resolve(alertError(t, m)).catch(() => {});

export default function CommonCodePage() {
    /* ── 상태 ─────────────────────────────────────────────── */
    const [groups, setGroups] = useState([]);
    const [selectedGroup, setSelectedGroup] = useState(null);

    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // 에디터(오버레이)
    const [groupEditor, setGroupEditor] = useState(null);
    const [codeEditor, setCodeEditor] = useState(null);

    /* ── 초기 부팅 ────────────────────────────────────────── */
    useEffect(() => {
        (async () => {
            try {
                const list = await listGroups();
                setGroups(list || []);
                setSelectedGroup((prev) => {
                    if (prev && list?.some(g => g.groupCode === prev.groupCode)) return prev;
                    return list?.[0] || null;
                });
            } catch (e) {
                safeError('오류', e?.response?.data?.message || e?.message || '그룹 조회 실패');
            }
        })();
    }, []);

    /* ── 그룹 선택 시 코드 로딩 ───────────────────────────── */
    useEffect(() => {
        (async () => {
            if (!selectedGroup) { setItems([]); return; }
            setLoading(true);
            try {
                const list = await getCodes(selectedGroup.groupCode);
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
        <div className="mb-4 aa-container-xxl">
            <h1 className="text-xl font-semibold text-white">공통코드 관리</h1>
            <p className="text-sm text-slate-400">
                시스템 기준 정보 및 옵션을 관리합니다.
            </p>
        </div>
    ), []);

    /* ===== 그룹 핸들러 ===== */
    const openCreateGroup = () => {
        setGroupEditor({
            mode: 'create',
            draft: { groupCode: '', name: '', description: '', sortOrder: groups.length * 10, enabled: true }
        });
    };

    const openEditGroup = (g) => {
        setGroupEditor({
            mode: 'edit',
            originalGroupCode: g.groupCode,
            draft: {
                groupCode: g.groupCode,
                name: g.name || '',
                description: g.description || '',
                sortOrder: Number.isFinite(g.sortOrder) ? g.sortOrder : 0,
                enabled: !!g.enabled
            }
        });
    };

    const saveGroup = async () => {
        if (!groupEditor || isSaving) return;
        const { mode, originalGroupCode, draft } = groupEditor;

        if (!draft.groupCode?.trim() || !draft.name?.trim()) {
            return safeInfo('안내', '코드와 이름은 필수입니다.');
        }

        try {
            setIsSaving(true);
            if (mode === 'create') {
                await createGroup({
                    groupCode: draft.groupCode.trim().toUpperCase(),
                    name: draft.name.trim(),
                    description: draft.description || null,
                    sortOrder: Number(draft.sortOrder || 0),
                    enabled: !!draft.enabled
                });
            } else {
                await updateGroup(originalGroupCode, {
                    name: draft.name.trim(),
                    description: draft.description || null,
                    sortOrder: Number(draft.sortOrder || 0),
                    enabled: !!draft.enabled
                });
            }

            // ✅ 순서 변경: 모달 먼저 닫기 -> 알림 -> 데이터 갱신
            setGroupEditor(null);

            await safeSuccess('성공', mode === 'create' ? '그룹이 등록되었습니다.' : '그룹이 수정되었습니다.');

            const list = await listGroups();
            setGroups(list || []);

            // 선택 상태 복구
            const nextSel = list?.find(g => g.groupCode === (draft.groupCode || originalGroupCode)) || list?.[0] || null;
            setSelectedGroup(nextSel);

        } catch (e) {
            safeError('오류', e?.response?.data?.message || '그룹 저장 실패');
        } finally {
            setIsSaving(false);
        }
    };

    const removeGroup = async (g) => {
        const ok = await confirmDialog(
            '그룹 삭제 확인',
            `그룹 '${g.name}' (${g.groupCode})을 삭제하시겠습니까?\n⚠️ 포함된 상세 코드도 모두 삭제됩니다.`,
            { confirmText: '삭제', cancelText: '취소', confirmColor: '#ef4444' }
        );
        if (!ok) return;

        try {
            await deleteGroup(g.groupCode);
            await safeSuccess('성공', '삭제되었습니다.');
            const list = await listGroups();
            setGroups(list || []);
            if (selectedGroup?.groupCode === g.groupCode) {
                setSelectedGroup(list?.[0] || null);
            }
        } catch (e) {
            safeError('오류', '삭제 중 오류가 발생했습니다.');
        }
    };


    /* ===== 코드 핸들러 ===== */
    const openCreateCode = () => {
        if (!selectedGroup) return;
        setCodeEditor({
            mode: 'create',
            draft: { code: '', name: '', sortOrder: items.length * 10, enabled: true, metaJson: '' }
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
        if (!codeEditor || !selectedGroup || isSaving) return;
        const { mode, originalCode, draft } = codeEditor;

        if (!draft.code?.trim() || !draft.name?.trim()) {
            return safeInfo('안내', '코드와 이름은 필수입니다.');
        }

        let finalMeta = null;
        if (draft.metaJson && draft.metaJson.trim()) {
            try {
                JSON.parse(draft.metaJson);
                finalMeta = draft.metaJson.trim();
            } catch (e) {
                return safeError('형식 오류', 'Meta JSON이 올바른 JSON 형식이 아닙니다.');
            }
        }

        try {
            setIsSaving(true);
            const payload = {
                code: draft.code.trim(),
                name: draft.name.trim(),
                sortOrder: Number(draft.sortOrder || 0),
                enabled: !!draft.enabled,
                metaJson: finalMeta
            };

            if (mode === 'create') {
                await createCode(selectedGroup.groupCode, payload);
            } else {
                await updateCode(selectedGroup.groupCode, originalCode, payload);
            }

            // ✅ 순서 변경: 모달 먼저 닫기 -> 알림 -> 데이터 갱신
            setCodeEditor(null);

            await safeSuccess('성공', mode === 'create' ? '코드가 등록되었습니다.' : '코드가 수정되었습니다.');

            const list = await getCodes(selectedGroup.groupCode);
            setItems(Array.isArray(list) ? list : []);

        } catch (e) {
            safeError('오류', e?.response?.data?.message || '코드 저장 실패');
        } finally {
            setIsSaving(false);
        }
    };

    const removeCode = async (row) => {
        if (!selectedGroup) return;
        const ok = await confirmDialog(
            '코드 삭제 확인',
            `'${row.name}' (${row.code}) 코드를 삭제하시겠습니까?`,
            { confirmText: '삭제', cancelText: '취소', confirmColor: '#ef4444' }
        );
        if (!ok) return;

        try {
            await deleteCode(selectedGroup.groupCode, row.code);
            await safeSuccess('성공', '삭제되었습니다.');
            const list = await getCodes(selectedGroup.groupCode);
            setItems(Array.isArray(list) ? list : []);
        } catch (e) {
            safeError('오류', '삭제 실패');
        }
    };


    /* ── 렌더링 ──────────────────────────────────────────────── */
    return (
        <section className="aa-page p-4 md:p-6">
            {Header}

            <div className="aa-container-xxl">
                <div className="aa-split aa-split-3-7">

                    {/* [왼쪽] 그룹 목록 */}
                    <div className="cc-box">
                        <div className="cc-box-head">
                            <span className="font-bold text-lg text-slate-100">코드 그룹</span>
                            <button className="aa-btn aa-btn-sm aa-btn-primary" onClick={openCreateGroup}>
                                + 그룹 추가
                            </button>
                        </div>
                        <div className="cc-box-body">
                            <div className="cc-list">
                                {groups.length === 0 ? (
                                    <div className="cc-empty">등록된 그룹이 없습니다.</div>
                                ) : groups.map((g) => (
                                    <button
                                        key={g.groupCode}
                                        className={`cc-item ${selectedGroup?.groupCode === g.groupCode ? 'is-active' : ''}`}
                                        onClick={() => { setSelectedGroup(g); setCodeEditor(null); }}
                                    >
                                        <span className="cc-badge">{g.sortOrder}</span>
                                        <div className="flex-1 min-w-0">
                                            <div className="cc-name">{g.name}</div>
                                            <div className="cc-code">{g.groupCode}</div>
                                        </div>
                                        {selectedGroup?.groupCode === g.groupCode && (
                                            <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                                                <button className="aa-btn aa-btn-xs" onClick={() => openEditGroup(g)}>✏️</button>
                                                <button className="aa-btn aa-btn-xs aa-btn-danger" onClick={() => removeGroup(g)}>🗑️</button>
                                            </div>
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* [오른쪽] 상세 코드 목록 */}
                    <div className="cc-box">
                        <div className="cc-box-head">
                            <div className="flex flex-col">
                                <span className="font-bold text-lg text-slate-100">
                                    {selectedGroup ? selectedGroup.name : '선택된 그룹 없음'}
                                </span>
                                {selectedGroup && <span className="text-xs text-slate-400 font-mono">{selectedGroup.groupCode}</span>}
                            </div>
                            <button
                                className="aa-btn aa-btn-sm aa-btn-primary"
                                onClick={openCreateCode}
                                disabled={!selectedGroup}
                            >
                                + 코드 추가
                            </button>
                        </div>

                        <div className="cc-box-body">
                            {loading && <div className="text-center py-4 text-slate-400">데이터 로딩 중...</div>}

                            {!loading && items.length === 0 && (
                                <div className="cc-empty">
                                    {selectedGroup ? '등록된 코드가 없습니다.' : '왼쪽에서 그룹을 선택해주세요.'}
                                </div>
                            )}

                            {!loading && items.length > 0 && (
                                <table className="cc-table">
                                    <thead>
                                    <tr>
                                        <th style={{ width: '60px' }}>정렬</th>
                                        <th style={{ width: '120px' }}>코드</th>
                                        <th style={{ width: '150px' }}>이름</th>
                                        {/* Meta JSON 컬럼 */}
                                        <th>Meta (JSON)</th>
                                        <th style={{ width: '80px', textAlign: 'center' }}>사용</th>
                                        <th style={{ width: '120px', textAlign: 'right' }}>관리</th>
                                    </tr>
                                    </thead>
                                    <tbody>
                                    {items.map((row) => (
                                        <tr key={row.code}>
                                            <td className="text-center text-slate-500">{row.sortOrder}</td>
                                            <td className="font-mono text-indigo-300 font-bold">{row.code}</td>
                                            <td className="font-semibold">{row.name}</td>

                                            <td className="text-sm">
                                                {row.metaJson ? (
                                                    <code className="bg-slate-800 text-slate-300 px-2 py-1 rounded border border-slate-700 block truncate max-w-[240px]" title={row.metaJson}>
                                                        {row.metaJson}
                                                    </code>
                                                ) : (
                                                    <span className="text-slate-600">-</span>
                                                )}
                                            </td>

                                            <td className="text-center">
                                                {row.enabled
                                                    ? <span className="text-green-400 text-xs font-bold">사용</span>
                                                    : <span className="text-slate-600 text-xs">미사용</span>}
                                            </td>
                                            <td className="text-right">
                                                <div className="flex justify-end gap-2">
                                                    <button className="aa-btn aa-btn-xs" onClick={() => openEditCode(row)}>수정</button>
                                                    <button className="aa-btn aa-btn-xs aa-btn-danger" onClick={() => removeCode(row)}>삭제</button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* 그룹 에디터 (Modal) */}
            {groupEditor && (
                <div className="cc-editor">
                    <div className="cc-editor-card">
                        <div className="cc-editor-head">
                            <h3 className="cc-editor-title">
                                {groupEditor.mode === 'create' ? '새 그룹 등록' : '그룹 정보 수정'}
                            </h3>
                            <button className="aa-btn aa-btn-ghost" onClick={() => setGroupEditor(null)}>✕</button>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="cc-label">그룹 코드 <span className="text-red-400">*</span></label>
                                <input
                                    className="cc-input"
                                    value={groupEditor.draft.groupCode}
                                    onChange={(e) => setGroupEditor(prev => ({...prev, draft:{...prev.draft, groupCode:e.target.value.toUpperCase()}}))}
                                    disabled={groupEditor.mode === 'edit'}
                                    placeholder="GROUP_CODE"
                                />
                            </div>
                            <div>
                                <label className="cc-label">그룹 명칭 <span className="text-red-400">*</span></label>
                                <input
                                    className="cc-input"
                                    value={groupEditor.draft.name}
                                    onChange={(e) => setGroupEditor(prev => ({...prev, draft:{...prev.draft, name:e.target.value}}))}
                                />
                            </div>
                            <div className="col-span-2">
                                <label className="cc-label">설명</label>
                                <input
                                    className="cc-input"
                                    value={groupEditor.draft.description || ''}
                                    onChange={(e) => setGroupEditor(prev => ({...prev, draft:{...prev.draft, description:e.target.value}}))}
                                />
                            </div>
                            <div>
                                <label className="cc-label">정렬 순서</label>
                                <input
                                    type="number"
                                    className="cc-input"
                                    value={groupEditor.draft.sortOrder}
                                    onChange={(e) => setGroupEditor(prev => ({...prev, draft:{...prev.draft, sortOrder: Number(e.target.value)}}))}
                                />
                            </div>
                            <div className="flex items-center pt-6">
                                <label className="flex items-center cursor-pointer gap-2">
                                    <input
                                        type="checkbox"
                                        className="w-5 h-5 accent-indigo-500"
                                        checked={groupEditor.draft.enabled}
                                        onChange={(e) => setGroupEditor(prev => ({...prev, draft:{...prev.draft, enabled:e.target.checked}}))}
                                    />
                                    <span className="text-slate-200">사용 여부</span>
                                </label>
                            </div>
                        </div>
                        <div className="cc-btn-row">
                            <button className="aa-btn" onClick={() => setGroupEditor(null)} disabled={isSaving}>취소</button>
                            <button className="aa-btn aa-btn-primary" onClick={saveGroup} disabled={isSaving}>저장</button>
                        </div>
                    </div>
                </div>
            )}

            {/* 코드 에디터 (Modal) */}
            {codeEditor && (
                <div className="cc-editor">
                    <div className="cc-editor-card">
                        <div className="cc-editor-head">
                            <h3 className="cc-editor-title">
                                {codeEditor.mode === 'create' ? '새 코드 등록' : '코드 정보 수정'}
                            </h3>
                            <button className="aa-btn aa-btn-ghost" onClick={() => setCodeEditor(null)}>✕</button>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="cc-label">코드 <span className="text-red-400">*</span></label>
                                <input
                                    className="cc-input"
                                    value={codeEditor.draft.code}
                                    onChange={(e) => setCodeEditor(prev => ({...prev, draft:{...prev.draft, code:e.target.value}}))}
                                    placeholder="CODE_VAL"
                                />
                            </div>
                            <div>
                                <label className="cc-label">명칭 <span className="text-red-400">*</span></label>
                                <input
                                    className="cc-input"
                                    value={codeEditor.draft.name}
                                    onChange={(e) => setCodeEditor(prev => ({...prev, draft:{...prev.draft, name:e.target.value}}))}
                                />
                            </div>
                            <div>
                                <label className="cc-label">정렬 순서</label>
                                <input
                                    type="number"
                                    className="cc-input"
                                    value={codeEditor.draft.sortOrder}
                                    onChange={(e) => setCodeEditor(prev => ({...prev, draft:{...prev.draft, sortOrder: Number(e.target.value)}}))}
                                />
                            </div>
                            <div className="flex items-center pt-6">
                                <label className="flex items-center cursor-pointer gap-2">
                                    <input
                                        type="checkbox"
                                        className="w-5 h-5 accent-indigo-500"
                                        checked={codeEditor.draft.enabled}
                                        onChange={(e) => setCodeEditor(prev => ({...prev, draft:{...prev.draft, enabled:e.target.checked}}))}
                                    />
                                    <span className="text-slate-200">사용 여부</span>
                                </label>
                            </div>
                            <div className="col-span-2">
                                <label className="cc-label flex justify-between">
                                    <span>Meta Data (JSON)</span>
                                    <span className="text-xs text-indigo-400">Ex: {"{\"stages\": [\"E\"]}"}</span>
                                </label>
                                <textarea
                                    className="cc-textarea"
                                    value={codeEditor.draft.metaJson}
                                    onChange={(e) => setCodeEditor(prev => ({...prev, draft:{...prev.draft, metaJson:e.target.value}}))}
                                    placeholder='JSON 형식으로 입력 (선택)'
                                />
                            </div>
                        </div>
                        <div className="cc-btn-row">
                            <button className="aa-btn" onClick={() => setCodeEditor(null)} disabled={isSaving}>취소</button>
                            <button className="aa-btn aa-btn-primary" onClick={saveCode} disabled={isSaving}>저장</button>
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
}