// ============================================================================
// src/features/subject/pages/SubjectCommentPage.jsx
// ----------------------------------------------------------------------------
// 코멘트/구간 관리 (트리 내비 + 밴드 편집; 기간 TERM 고정, Excel 지원판)
// - 좌: 학부(E/M/H) → Depth1 → Children 드릴다운 (리프만 선택 가능; 과목 편집 X)
// - 우: 타입(SDL/DT) → 해당 항목 선택
// - URL 동기화: stage, subjectId, type, itemId
// - ✅ 기본 학부 E(초등부)로 시작
// - ✅ 딥링크 지원: subjectId/type/itemId로 진입 시 좌/우 자동 선택(트리 드릴다운)
// - ✅ itemId가 유효하면 유지, 아니면 현재 type의 첫 항목으로 폴백
// ============================================================================

import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx'; // ← Excel 읽기/쓰기
import {
    listSubjectsByParent,
    listSubjectItems,
    latestCommentSetFull,
    upsertCommentSet,
} from '@/features/subject/api/academySubjectApi.js';

import '@/features/system/styles/admin-system.css';
import '@/features/admin/styles/admin-academy.css';
import '@/features/subject/styles/admin-subject.css';

import { alertInfo, alertSuccess, alertError, confirmDialog } from '@/common/ui/alert.js';

/* ───────────────── StageTabs ───────────────── */
function StageTabs({ value, onChange }) {
    const TABS = [
        { key: 'E', label: '초등부(E)' },
        { key: 'M', label: '중등부(M)' },
        { key: 'H', label: '고등부(H)' },
    ];
    const handle = (k, e) => {
        e?.preventDefault();
        e?.stopPropagation();
        if (k !== value) onChange(k);
    };
    return (
        <div className="aa-seg" role="tablist" aria-label="학부 선택">
            {TABS.map((t) => (
                <button
                    key={t.key}
                    type="button"
                    role="tab"
                    aria-selected={value === t.key}
                    className={value === t.key ? 'active' : ''}
                    onPointerDown={(e) => handle(t.key, e)}
                    onClick={(e) => handle(t.key, e)}
                >
                    {t.label}
                </button>
            ))}
        </div>
    );
}

/* ──────────────── 커버리지/겹침 진단 ──────────────── */
function analyzeCoverage(bands, upperBound) {
    const rows = (bands || [])
        .map((b) => ({ min: Number(b.minScore), max: Number(b.maxScore) }))
        .filter(
            (b) =>
                Number.isFinite(b.min) &&
                Number.isFinite(b.max) &&
                b.max >= b.min
        )
        .map((b) => ({
            min: Math.max(0, Math.min(upperBound, b.min)),
            max: Math.max(0, Math.min(upperBound, b.max)),
        }))
        .sort((a, b) => a.min - b.min);

    let covered = 0,
        curStart = null,
        curEnd = null;
    const gaps = [],
        overlaps = [];
    for (const r of rows) {
        if (curStart === null) {
            curStart = r.min;
            curEnd = r.max;
            continue;
        }
        if (r.min > curEnd + 1) {
            gaps.push({ from: curEnd + 1, to: r.min - 1 });
            covered += curEnd - curStart + 1;
            curStart = r.min;
            curEnd = r.max;
        } else if (r.min <= curEnd) {
            overlaps.push({ from: r.min, to: Math.min(curEnd, r.max) });
            curEnd = Math.max(curEnd, r.max);
        } else {
            curEnd = Math.max(curEnd, r.max);
        }
    }
    if (curStart !== null) covered += curEnd - curStart + 1;
    const total = upperBound + 1;
    const pct =
        total > 0
            ? Math.max(0, Math.min(100, Math.round((covered / total) * 100)))
            : 0;
    return { pct, gaps, overlaps };
}

/* ──────────────── URL 유틸 ──────────────── */
function getQuery() {
    if (typeof window === 'undefined') return new URLSearchParams();
    return new URLSearchParams(window.location.search);
}
function syncQuery(upd) {
    if (typeof window === 'undefined') return;
    const q = getQuery();
    Object.entries(upd).forEach(([k, v]) => {
        if (v === undefined || v === null || v === '') q.delete(k);
        else q.set(k, String(v));
    });
    const url = `${window.location.pathname}?${q.toString()}`;
    window.history.replaceState({}, '', url);
}

export default function SubjectCommentPage() {
    // ===== 쿼리 파라미터 =====
    const initQ = getQuery();
    const initStage     = initQ.get('stage') || 'E';                  // ✅ 기본 E
    const initType      = (initQ.get('type') === 'DT') ? 'DT' : 'SDL';
    const initSubjectId = Number(initQ.get('subjectId') || 0);
    const initItemIdQ   = Number(initQ.get('itemId') || 0);

    // ===== 좌측 트리 상태 =====
    const [stage, setStage] = useState(initStage);
    const [roots, setRoots] = useState([]);
    const [parent, setParent] = useState(null);
    const [children, setChildren] = useState([]);
    const [selectedLeaf, setSelectedLeaf] = useState(null); // 리프 과목만 편집

    // ===== 우측: 편집 상태 =====
    const [type, setType] = useState(initType); // 'SDL' | 'DT'
    const [itemId, setItemId] = useState(initItemIdQ || 0); // ✅ 초기 쿼리값 보존
    const FIXED_PERIOD = 'TERM'; // 서버 저장 시 고정

    const [items, setItems] = useState([]); // [{id,name,kind,maxScore}]
    const [memo, setMemo] = useState('');
    const [bands, setBands] = useState([]);

    // 상한(upper) — SDL/DT 모두 "선택 항목" maxScore
    const upperBound = useMemo(() => {
        const it = items.find((x) => x.id === itemId);
        return Number(it?.maxScore || 0);
    }, [items, itemId]);

    const diag = useMemo(() => analyzeCoverage(bands, upperBound), [bands, upperBound]);
    const hasIssues = diag.overlaps.length > 0 || diag.gaps.length > 0;
    const editingDisabled = !selectedLeaf || !itemId;

    // 엑셀 업로드 input ref
    const xlsxRef = useRef(null);

    // ===== 데이터 로딩 =====
    async function loadRoots() {
        const list = await listSubjectsByParent(stage, null);
        const sorted = [...(list || [])].sort(
            (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
        );
        setRoots(sorted);
        return sorted; // ✅ 초기화 뒤 이어서 쓰기 위해 반환
    }
    async function loadChildren(p) {
        if (!p) {
            setParent(null);
            setChildren([]);
            return [];
        }
        setParent(p);
        const list = await listSubjectsByParent(stage, p.id);
        const sorted = [...(list || [])].sort(
            (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
        );
        setChildren(sorted);
        return sorted; // ✅ 반환
    }

    // ✅ subjectId로 진입 시 트리 드릴다운 & 리프 선택
    async function hydrateToSubject(targetId) {
        // 간단 DFS로 경로 탐색(Depth2~3 기준 호출 수 적음)
        async function dfs(parentId = null, acc = []) {
            const nodes = await listSubjectsByParent(stage, parentId);
            for (const n of (nodes || [])) {
                const path = [...acc, n];
                if (n.id === targetId) return path;
                if (!n.isLeaf) {
                    const found = await dfs(n.id, path);
                    if (found) return found;
                }
            }
            return null;
        }

        const path = await dfs(null, []);
        if (!path) return; // 대상 없음 → 기본 UX 유지

        const last = path[path.length - 1];
        if (path.length === 1) {
            // Depth1 바로 리프 or 카테고리
            if (last.isLeaf) {
                setParent(null); setChildren([]); setSelectedLeaf(last);
            } else {
                await loadChildren(last);
                setSelectedLeaf(null);
            }
        } else {
            // Depth1 하위(Children)에서 리프 선택될 케이스
            const p = path[path.length - 2];
            await loadChildren(p); // Children 칼럼 채우기
            if (last.isLeaf) setSelectedLeaf(last);
            else setSelectedLeaf(null);
        }
    }

    // ✅ 선택된 리프 & 타입 기준으로 항목 로드(쿼리 itemId 우선)
    async function loadItemsForSelected() {
        if (!selectedLeaf) {
            setItems([]);
            setItemId(0);
            return;
        }
        const list = await listSubjectItems(selectedLeaf.id);
        const normalized = (list || []).sort(
            (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
        );
        setItems(normalized);

        // ✅ 쿼리로 받은 itemId가 현재 타입과 일치하며 존재하면 유지
        const requested = normalized.find(x => x.id === itemId && x.kind === type);
        if (requested) return;

        // 그 외는 현재 타입의 첫 항목으로 폴백
        const firstByType = normalized.find((x) => x.kind === type);
        setItemId(firstByType ? firstByType.id : 0);
    }

    async function loadLatestSet() {
        if (!selectedLeaf) return;
        const params = {
            schoolStage: stage,
            scopeType: type === 'SDL' ? 'SDL_ITEM' : 'DT_ITEM',
            scopeRefId: itemId || null,
            periodType: FIXED_PERIOD,
            latest: true,
        };
        const res = await latestCommentSetFull(selectedLeaf.id, params);
        if (res) {
            setMemo(res.memo || '');
            const rows = (res.bands || [])
                .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
                .map((b, i) => ({
                    label: b.label ?? `B${i + 1}`,
                    minScore: Number(b.minScore),
                    maxScore: Number(b.maxScore),
                    commentTemplate: b.commentTemplate || '',
                    notifySms: !!b.notifySms,
                    notifyEmail: !!b.notifyEmail,
                    notifyPush: !!b.notifyPush,
                    sortOrder: i,
                }));
            setBands(rows);
        } else {
            setMemo('');
            setBands([]);
        }
    }

    // ===== 초기 진입/학부 전환 =====
    useEffect(() => {
        // 학부 바뀌면 전부 리셋
        (async () => {
            setParent(null);
            setChildren([]);
            setSelectedLeaf(null);
            setItems([]);
            setItemId(initItemIdQ || 0); // ✅ 초기 쿼리의 itemId를 보존 (없으면 0)
            setMemo('');
            setBands([]);
            // type은 유지(쿼리 반영)
            await loadRoots();
            // ✅ 쿼리에 subjectId가 있으면 해당 과목으로 드릴다운
            if (initSubjectId) {
                await hydrateToSubject(initSubjectId);
            }
        })().catch((e) =>
            alertError('로드 실패', `초기 로딩 실패: ${String(e?.message || e)}`)
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stage]);

    // 리프/타입 변경 → 항목 → 세트
    useEffect(() => {
        setItems([]);
        if (selectedLeaf) loadItemsForSelected().then(loadLatestSet);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedLeaf, type]);

    // itemId 변경 → 세트
    useEffect(() => {
        if (selectedLeaf && (type === 'SDL' || type === 'DT')) loadLatestSet();
    }, [itemId]); // eslint-disable-line react-hooks/exhaustive-deps

    // URL 동기화
    useEffect(() => {
        syncQuery({
            stage,
            subjectId: selectedLeaf?.id || '',
            type,
            itemId: itemId || '',
        });
    }, [stage, selectedLeaf, type, itemId]);

    // 저장 단축키
    useEffect(() => {
        const onKey = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                e.preventDefault();
                handleSave();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [stage, selectedLeaf, type, itemId, bands, memo, upperBound]);

    // ===== 좌측 트리 동작 =====
    async function clickRootRow(r) {
        // 카테고리면 Children 드릴다운, 리프면 선택
        if (r.isLeaf) {
            setSelectedLeaf(r);
        } else {
            await loadChildren(r);
            setSelectedLeaf(null);
            setType('SDL'); // ✅ 카테고리 열 때도 타입을 기본 SDL로
            setItemId(0);
        }
    }

    async function clickChildRow(n) {
        // ✅ 요구사항: Children 클릭 시 타입(SDL)로 초기화
        setType('SDL');
        setItemId(0);

        if (n.isLeaf) {
            setSelectedLeaf(n); // 리프 선택
            // 선택되면 useEffect(selectedLeaf, type)에서 항목/세트 로딩
        } else {
            await loadChildren(n); // 더 깊은 카테고리 드릴다운
            setSelectedLeaf(null);
        }
    }

    async function backToRoot() {
        // ✅ "초기화" 동작: 좌측 트리와 우측 편집 상태까지 모두 초기화
        setParent(null);
        setChildren([]);
        setSelectedLeaf(null);
        setItems([]);
        setItemId(0);
        setMemo('');
        setBands([]);
        setType('SDL'); // 타입도 리셋
        await loadRoots();
    }

    // ===== Excel: 양식 다운로드 / 업로드 / 내보내기 =====
    function downloadXlsxTemplate() {
        const sampleMax = Math.max(upperBound, 10); // 상한 미선택 시 예시값
        const data = [
            ['label', 'min', 'max', 'comment', 'notifySms', 'notifyEmail', 'notifyPush'],
            ['A', Math.max(sampleMax - 10, 0), sampleMax, '아주 잘했어요', 0, 0, 0],
            ['B', Math.max(sampleMax - 20, 0), Math.max(sampleMax - 11, 0), '괜찮아요. 조금만 더!', 0, 0, 0],
            ['C', 0, Math.max(sampleMax - 21, 0), '추가 학습이 필요합니다.', 0, 0, 0],
        ];
        const ws = XLSX.utils.aoa_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Bands');
        XLSX.writeFile(wb, 'comment_template.xlsx');
    }

    function openXlsxPicker() {
        if (!selectedLeaf) return alertInfo('안내', '좌측에서 리프 과목을 선택하세요.');
        if (!itemId) return alertInfo('안내', '해당 타입의 항목을 선택하세요.');
        xlsxRef.current?.click();
    }

    function toBool(v) {
        if (typeof v === 'boolean') return v;
        const s = String(v || '').trim().toLowerCase();
        return s === '1' || s === 'y' || s === 'yes' || s === 'true' || s === 't';
    }

    async function handleXlsxFile(e) {
        const file = e.target.files?.[0];
        e.target.value = ''; // 같은 파일 재업로드 허용
        if (!file) return;
        try {
            const buf = await file.arrayBuffer();
            const wb = XLSX.read(buf, { type: 'array' });
            const wsName = wb.SheetNames[0];
            const ws = wb.Sheets[wsName];
            const json = XLSX.utils.sheet_to_json(ws, { defval: '', raw: true }); // [{label,min,max,comment,notifySms...}]

            if (json.length === 0) return alertInfo('안내', '엑셀 시트에 데이터가 없습니다.');
            const parsed = json.map((row, i) => {
                const label = String(row.label ?? `B${i + 1}`).trim();
                const min = Number(row.min ?? 0);
                const max = Number(row.max ?? 0);
                const comment = String(row.comment ?? '').trim();
                return {
                    label,
                    minScore: Number.isFinite(min) ? min : 0,
                    maxScore: Number.isFinite(max) ? max : 0,
                    commentTemplate: comment,
                    notifySms: toBool(row.notifySms),
                    notifyEmail: toBool(row.notifyEmail),
                    notifyPush: toBool(row.notifyPush),
                    sortOrder: i,
                };
            });
            setBands(parsed);
            alertSuccess('완료', '엑셀을 적용했습니다. 저장을 눌러 반영하세요.');
        } catch (err) {
            alertError('오류', `엑셀 읽기 실패: ${String(err?.message || err)}`);
        }
    }

    function exportXlsx() {
        const rows = (bands || []).map((b) => ({
            label: b.label,
            min: b.minScore,
            max: b.maxScore,
            comment: b.commentTemplate || '',
            notifySms: b.notifySms ? 1 : 0,
            notifyEmail: b.notifyEmail ? 1 : 0,
            notifyPush: b.notifyPush ? 1 : 0,
        }));
        const ws = XLSX.utils.json_to_sheet(rows, {
            header: ['label', 'min', 'max', 'comment', 'notifySms', 'notifyEmail', 'notifyPush'],
        });
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Bands');
        XLSX.writeFile(wb, `comments_${selectedLeaf?.id || 'no-subject'}_${type}.xlsx`);
    }

    // ===== 저장 =====
    async function handleSave() {
        if (!selectedLeaf) return alertInfo('안내', '좌측에서 리프 과목을 선택하세요.');
        if (!itemId) return alertInfo('안내', '해당 타입의 항목을 선택하세요.');

        const rows = [...bands].sort(
            (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
        );
        for (let i = 0; i < rows.length; i++) {
            const r = rows[i];
            if (!r.label?.trim())
                return alertInfo('입력 필요', '라벨(label)을 입력하세요.');
            if (r.minScore > r.maxScore)
                return alertError('유효성 오류', `"${r.label}" : min ≤ max 이어야 합니다.`);
            if (r.minScore < 0 || r.maxScore > upperBound) {
                const ok = await confirmDialog(
                    '범위 경고',
                    `"${r.label}"가 0~${upperBound} 범위를 벗어납니다. 그래도 저장할까요?`,
                    { confirmText: '저장' }
                );
                if (!ok) return;
                break;
            }
            rows[i] = { ...r, sortOrder: i };
        }
        if (hasIssues) {
            const ok = await confirmDialog(
                '진단 경고',
                '겹침/공백이 있습니다. 그래도 저장할까요?',
                { confirmText: '저장' }
            );
            if (!ok) return;
        }

        const payload = {
            subjectId: selectedLeaf.id,
            schoolStage: stage,
            scopeType: type === 'SDL' ? 'SDL_ITEM' : 'DT_ITEM',
            scopeRefId: itemId,
            periodType: 'TERM', // 고정
            memo,
            bands: rows.map((r) => ({
                label: r.label,
                minScore: Number(r.minScore),
                maxScore: Number(r.maxScore),
                commentTemplate: r.commentTemplate || '',
                sortOrder: r.sortOrder,
                notifySms: !!r.notifySms,
                notifyEmail: !!r.notifyEmail,
                notifyPush: !!r.notifyPush,
            })),
        };

        try {
            await upsertCommentSet(selectedLeaf.id, payload);
            alertSuccess('완료', '코멘트 구간이 저장되었습니다.');
            await loadLatestSet();
        } catch (e) {
            alertError('오류', `저장 실패: ${String(e?.message || e)}`);
        }
    }

    // ===== 렌더 =====
    return (
        <div className="aa-page academy-page subject-page">
            <div className="aa-container">
                {/* 상단 툴바 */}
                <div className="aa-toolbar aa-topbar" style={{ gap: '.75rem', alignItems: 'center' }}>
                    <div style={{ marginRight: 'auto' }}>
                        <h1 className="aa-title">코멘트/구간 관리</h1>
                        <p className="aa-subtle">
                            학부/트리에서 리프 과목 선택 → 타입/항목 설정 → 엑셀 업로드 또는 수동 편집 → 저장
                            <br />
                            (기간은 TERM 고정, DT도 항목 만점이 상한으로 계산)
                        </p>
                    </div>
                </div>

                <div className="aa-split">
                    {/* 좌: 트리 내비 */}
                    <section className="aa-card">
                        <div className="flex items-center justify-between mb-2">
                            {/* ✅ 학부 변경 시 타입/아이템 초기화하여 혼동 방지 */}
                            <StageTabs value={stage} onChange={(k) => { setType('SDL'); setItemId(0); setStage(k); }} />
                            <button className="aa-btn" onClick={backToRoot}>초기화</button>
                        </div>

                        <div className="tr-tree">
                            {/* Depth 1 */}
                            <div className="tr-col">
                                <div className="tr-col-title">카테고리</div>
                                {roots.map((r) => (
                                    <div
                                        key={r.id}
                                        className={`tr-node clickable ${selectedLeaf?.id === r.id || parent?.id === r.id ? 'on' : ''}`}
                                        onClick={() => clickRootRow(r)}
                                        title={r.isLeaf ? '리프 선택' : '하위 열기'}
                                    >
                                        <div className="tr-label">
                                            <span className="tr-name">{r.name}</span>
                                            {r.code && <span className="tr-code">[{r.code}]</span>}
                                        </div>
                                        <div className="tr-actions" onClick={(e) => e.stopPropagation()}>
                                            {r.isLeaf ? <span className="aa-chip">리프</span> : <span className="aa-chip">카테고리</span>}
                                        </div>
                                    </div>
                                ))}
                                {roots.length === 0 && <div className="aa-subtle">루트 없음</div>}
                            </div>

                            {/* Children */}
                            <div className="tr-col">
                                <div className="tr-col-title">과목 {parent ? <strong>({parent.name})</strong> : null}</div>
                                {children.map((n) => (
                                    <div
                                        key={n.id}
                                        className={`tr-node clickable ${selectedLeaf?.id === n.id ? 'on' : ''}`}
                                        onClick={() => clickChildRow(n)}
                                        title={n.isLeaf ? '리프 선택' : '하위 열기'}
                                    >
                                        <div className="tr-label">
                                            <span className="tr-name">{n.name}</span>
                                            {n.code && <span className="tr-code">[{n.code}]</span>}
                                        </div>
                                        <div className="tr-actions" onClick={(e) => e.stopPropagation()}>
                                            {n.isLeaf ? <span className="aa-chip">리프</span> : <span className="aa-chip">카테고리</span>}
                                        </div>
                                    </div>
                                ))}
                                {children.length === 0 && (
                                    <div className="aa-subtle">
                                        {parent ? '하위 없음' : '좌측 카테고리에서 카테고리/리프를 선택하세요.'}
                                    </div>
                                )}
                            </div>
                        </div>
                    </section>

                    {/* 우: 밴드 편집 */}
                    <section className="aa-card">
                        <div className="flex items-center justify-between">
                            <h2 className="aa-title--sm">구간/코멘트</h2>
                            <div className="aa-subtle">
                                {selectedLeaf ? `선택 과목: ${selectedLeaf.name}` : '좌측에서 리프 과목을 선택하세요.'}
                            </div>
                        </div>

                        {/* 타입/항목 */}
                        <div className="grid md:grid-cols-12 gap-3 items-end my-4">
                            <div className="md:col-span-3">
                                <label className="aa-label">타입</label>
                                <div className="aa-seg">
                                    {['SDL', 'DT'].map((t) => (
                                        <button
                                            key={t}
                                            type="button"
                                            className={type === t ? 'active' : ''}
                                            onClick={() => setType(t)}
                                        >
                                            {t}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="md:col-span-9">
                                <label className={`aa-label ${!selectedLeaf ? 'opacity-60' : ''}`}>항목 ({type})</label>
                                <select
                                    className="aa-select w-full"
                                    disabled={!selectedLeaf}
                                    value={itemId || ''}
                                    onChange={(e) => setItemId(Number(e.target.value) || 0)}
                                >
                                    <option value="">항목 선택</option>
                                    {items
                                        .filter((x) => (type === 'SDL' ? x.kind === 'SDL' : x.kind === 'DT'))
                                        .map((it) => (
                                            <option key={it.id} value={it.id}>
                                                {it.name} ({it.maxScore})
                                            </option>
                                        ))}
                                </select>
                            </div>
                        </div>

                        {/* 요약/엑셀 툴바 */}
                        <div className="aa-card space-y-3">
                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <div className="font-semibold">커버리지 0–{upperBound}</div>
                                    <div className={`text-sm ${hasIssues ? 'text-amber-500' : 'text-emerald-500'}`}>{diag.pct}%</div>
                                </div>
                                <div className="h-3 w-full bg-slate-800/40 rounded overflow-hidden">
                                    <div
                                        className={`h-full ${hasIssues ? 'bg-amber-500' : 'bg-emerald-500'}`}
                                        style={{ width: `${diag.pct}%` }}
                                    />
                                </div>
                            </div>

                            <div className="flex flex-wrap gap-2 text-xs">
                                {diag.overlaps.length === 0 && diag.gaps.length === 0 && (
                                    <span className="aa-chip aa-chip-on">겹침/공백 없음</span>
                                )}
                                {diag.overlaps.map((o, i) => (
                                    <span key={'ov' + i} className="aa-chip">
                    겹침 {o.from}–{o.to}
                  </span>
                                ))}
                                {diag.gaps.map((g, i) => (
                                    <span key={'gp' + i} className="aa-chip">
                    공백 {g.from}–{g.to}
                  </span>
                                ))}
                            </div>

                            <div className="flex flex-wrap gap-2">
                                <button className="aa-btn" onClick={downloadXlsxTemplate}>엑셀 양식 다운로드</button>
                                <button className="aa-btn" onClick={openXlsxPicker} disabled={editingDisabled}>
                                    엑셀 업로드(일괄)
                                </button>
                                <input
                                    ref={xlsxRef}
                                    type="file"
                                    accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                                    className="hidden"
                                    onChange={handleXlsxFile}
                                />
                                <button className="aa-btn" onClick={exportXlsx} disabled={!selectedLeaf}>
                                    엑셀 내보내기
                                </button>

                                <div className="ml-auto flex items-center gap-2">
                                    <label className="aa-label m-0">메모</label>
                                    <input
                                        className="aa-input w-80"
                                        value={memo}
                                        onChange={(e) => setMemo(e.target.value)}
                                        placeholder="예: 2025-1 학기 적용"
                                        disabled={!selectedLeaf}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* 테이블 */}
                        <div className="aa-card overflow-hidden mt-4">
                            <table className="aa-table w-full text-sm">
                                <thead>
                                <tr>
                                    <th>라벨</th>
                                    <th className="text-right">min</th>
                                    <th className="text-right">max</th>
                                    <th>코멘트</th>
                                    <th>알림</th>
                                    <th>정렬</th>
                                    <th>행</th>
                                </tr>
                                </thead>
                                <tbody>
                                {bands.map((b, idx) => (
                                    <tr key={idx}>
                                        <td>
                                            <input
                                                className="aa-input w-24"
                                                value={b.label}
                                                onChange={(e) =>
                                                    setBands((v) =>
                                                        v.map((x, i) => (i === idx ? { ...x, label: e.target.value } : x))
                                                    )
                                                }
                                                disabled={editingDisabled}
                                            />
                                        </td>
                                        <td className="text-right">
                                            <input
                                                className="aa-input w-24 text-right"
                                                type="number"
                                                value={b.minScore}
                                                onChange={(e) =>
                                                    setBands((v) =>
                                                        v.map((x, i) =>
                                                            i === idx ? { ...x, minScore: Number(e.target.value) || 0 } : x
                                                        )
                                                    )
                                                }
                                                disabled={editingDisabled}
                                            />
                                        </td>
                                        <td className="text-right">
                                            <input
                                                className="aa-input w-24 text-right"
                                                type="number"
                                                value={b.maxScore}
                                                onChange={(e) =>
                                                    setBands((v) =>
                                                        v.map((x, i) =>
                                                            i === idx ? { ...x, maxScore: Number(e.target.value) || 0 } : x
                                                        )
                                                    )
                                                }
                                                disabled={editingDisabled}
                                            />
                                        </td>
                                        <td>
                                            <input
                                                className="aa-input w-full"
                                                value={b.commentTemplate}
                                                onChange={(e) =>
                                                    setBands((v) =>
                                                        v.map((x, i) =>
                                                            i === idx ? { ...x, commentTemplate: e.target.value } : x
                                                        )
                                                    )
                                                }
                                                disabled={editingDisabled}
                                            />
                                        </td>
                                        <td>
                                            <div className="flex items-center gap-2 justify-center">
                                                <label className="flex items-center gap-1 text-xs">
                                                    <input
                                                        type="checkbox"
                                                        checked={!!b.notifySms}
                                                        onChange={(e) =>
                                                            setBands((v) =>
                                                                v.map((x, i) =>
                                                                    i === idx ? { ...x, notifySms: e.target.checked } : x
                                                                )
                                                            )
                                                        }
                                                        disabled={editingDisabled}
                                                    />
                                                    SMS
                                                </label>
                                                <label className="flex items-center gap-1 text-xs">
                                                    <input
                                                        type="checkbox"
                                                        checked={!!b.notifyEmail}
                                                        onChange={(e) =>
                                                            setBands((v) =>
                                                                v.map((x, i) =>
                                                                    i === idx ? { ...x, notifyEmail: e.target.checked } : x
                                                                )
                                                            )
                                                        }
                                                        disabled={editingDisabled}
                                                    />
                                                    Email
                                                </label>
                                                <label className="flex items-center gap-1 text-xs">
                                                    <input
                                                        type="checkbox"
                                                        checked={!!b.notifyPush}
                                                        onChange={(e) =>
                                                            setBands((v) =>
                                                                v.map((x, i) =>
                                                                    i === idx ? { ...x, notifyPush: e.target.checked } : x
                                                                )
                                                            )
                                                        }
                                                        disabled={editingDisabled}
                                                    />
                                                    Push
                                                </label>
                                            </div>
                                        </td>
                                        <td className="text-center">
                                            <div className="aa-btn-group">
                                                <button
                                                    className="aa-btn aa-btn-sm"
                                                    onClick={() => setBands(v => {
                                                        const to = Math.max(0, Math.min(v.length - 1, idx - 1));
                                                        const arr = [...v]; const [x] = arr.splice(idx, 1); arr.splice(to, 0, x);
                                                        return arr.map((b, i) => ({ ...b, sortOrder: i }));
                                                    })}
                                                    disabled={editingDisabled}
                                                >
                                                    ▲
                                                </button>
                                                <button
                                                    className="aa-btn aa-btn-sm"
                                                    onClick={() => setBands(v => {
                                                        const to = Math.max(0, Math.min(v.length - 1, idx + 1));
                                                        const arr = [...v]; const [x] = arr.splice(idx, 1); arr.splice(to, 0, x);
                                                        return arr.map((b, i) => ({ ...b, sortOrder: i }));
                                                    })}
                                                    disabled={editingDisabled}
                                                >
                                                    ▼
                                                </button>
                                            </div>
                                        </td>
                                        <td className="text-center">
                                            <div className="aa-btn-group">
                                                <button
                                                    className="aa-btn aa-btn-sm"
                                                    onClick={() => setBands(v => {
                                                        const b0 = v[idx];
                                                        const copy = { ...b0, label: `${b0.label}-copy`, sortOrder: b0.sortOrder + 1 };
                                                        const arr = [...v]; arr.splice(idx + 1, 0, copy);
                                                        return arr.map((x, i) => ({ ...x, sortOrder: i }));
                                                    })}
                                                    disabled={editingDisabled}
                                                >
                                                    복제
                                                </button>
                                                <button
                                                    className="aa-btn aa-btn-danger aa-btn-sm"
                                                    onClick={() => setBands(v => v.filter((_, i) => i !== idx).map((b, i) => ({ ...b, sortOrder: i })))}
                                                    disabled={editingDisabled}
                                                >
                                                    삭제
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {bands.length === 0 && (
                                    <tr>
                                        <td colSpan={7} className="aa-subtle">
                                            구간이 없습니다. 엑셀 업로드(일괄) 또는 + 구간 추가를 사용하세요.
                                        </td>
                                    </tr>
                                )}
                                </tbody>
                            </table>

                            <div className="mt-3">
                                <button className="aa-btn" onClick={() => setBands(v => ([...v, {
                                    label: `B${v.length + 1}`,
                                    minScore: 0,
                                    maxScore: upperBound,
                                    commentTemplate: '',
                                    sortOrder: v.length,
                                    notifySms: false,
                                    notifyEmail: false,
                                    notifyPush: false,
                                }]))} disabled={editingDisabled}>
                                    + 구간 추가
                                </button>
                            </div>
                        </div>

                        {/* 푸터 */}
                        <div className="flex items-center justify-end mt-4">
                            <button className="aa-btn aa-btn-primary" onClick={handleSave} disabled={editingDisabled}>
                                저장
                            </button>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
}