// ============================================================================
// src/features/subject/pages/SubjectManagePage.jsx
// ----------------------------------------------------------------------------
// 과목 관리(개선 UI v6)
// - ✅ 기본 학부를 초등부(E)로 시작
// - ✅ 편집 중: 코드/학부(stage) 불변 → 코드 입력 비활성화 + 저장 시 editTarget 값 사용
// - ✅ SweetAlert 래퍼(alert.js)로 알림/오류/확인 통일
// - ✅ 409(CONFLICT) 방어: 중복 코드·스테이지 불일치 등 충돌 시 안내
// - ✅ '코멘트' 이동 시 과목의 항목을 조회하여 SDL 우선 itemId를 붙여 딥링크 생성
// - 편집 시작 시 우측 평가항목 초기화(비움), 편집 중 정렬/순서저장 비활성은 유지
// ============================================================================

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    listSubjectsByParent,
    upsertSubjectNode,
    listSubjectItems,
    saveSubjectItems,
    reorderSubjectsByParent,
} from '@/features/subject/api/academySubjectApi.js';

// 공통/도메인 CSS
import '@/features/system/styles/admin-system.css';
import '@/features/admin/styles/admin-academy.css';
import '@/features/subject/styles/admin-subject.css';

// ✅ SweetAlert2 래퍼(알림 공통)
import { alertInfo, alertSuccess, alertError, confirmDialog } from '@/common/ui/alert.js';

/** 간단 학부 탭 (포인터 이중 처리로 클릭 보장) */
function StageTabs({ value, onChange }) {
    const TABS = [
        { key: 'E', label: '초등부(E)' },
        { key: 'M', label: '중등부(M)' },
        { key: 'H', label: '고등부(H)' },
    ];
    const handle = (k, e) => { e?.preventDefault(); e?.stopPropagation(); if (k !== value) onChange(k); };
    return (
        <div className="aa-seg" role="tablist" aria-label="학부 선택">
            {TABS.map(t => (
                <button key={t.key} type="button"
                        role="tab" aria-selected={value === t.key}
                        className={value === t.key ? 'active' : ''}
                        onPointerDown={(e) => handle(t.key, e)} onClick={(e) => handle(t.key, e)}>
                    {t.label}
                </button>
            ))}
        </div>
    );
}

export default function SubjectManagePage(){
    // ------------------------- 상태 -------------------------
    const [stage, setStage] = useState('E'); // ✅ 기본을 초등부(E)로 시작

    // 좌측 트리
    const [roots, setRoots] = useState([]);
    const [children, setChildren] = useState([]);
    const [parent, setParent] = useState(null);     // 선택된 카테고리
    const [selected, setSelected] = useState(null); // 선택된 과목(우측 항목용)

    // 정렬 변경 플래그
    const [rootsDirty, setRootsDirty] = useState(false);
    const [childrenDirty, setChildrenDirty] = useState(false);

    // 검색(Depth1)
    const [q, setQ] = useState('');

    // 편집 폼
    const [nodeForm, setNodeForm] = useState({ name:'', code:'', description:'' });

    // 편집 타깃(null=추가 모드)
    const [editTarget, setEditTarget] = useState(null); // { id, schoolStage, code, ... }
    const formRef = useRef(null);

    // 우측: 평가항목
    const [items, setItems] = useState([]);

    // ------------------------- 유틸 -------------------------
    const resetLeft = () => {
        setParent(null); setChildren([]);
        setSelected(null);
        setRootsDirty(false); setChildrenDirty(false);
    };
    const resetForm = () => {
        setNodeForm({ name:'', code:'', description:'' });
        setEditTarget(null);
    };
    const scrollToForm = () => {
        try { formRef.current?.scrollIntoView({ behavior:'smooth', block:'nearest' }); } catch {}
    };

    // ------------------------- 로딩 -------------------------
    async function loadRoots(){
        const list = await listSubjectsByParent(stage, null);
        const sorted = [...(list||[])].sort((a,b)=>(a.sortOrder??0)-(b.sortOrder??0));
        setRoots(sorted); setRootsDirty(false);
    }
    async function loadChildren(p){
        if(!p){ setChildren([]); setParent(null); return; }
        setParent(p);
        const list = await listSubjectsByParent(stage, p.id);
        const sorted = [...(list||[])].sort((a,b)=>(a.sortOrder??0)-(b.sortOrder??0));
        setChildren(sorted); setChildrenDirty(false);
    }

    // 학부 전환 → 전부 초기화
    useEffect(()=>{
        resetLeft(); resetForm(); setQ('');
        loadRoots().catch(e=>alertError('로드 실패', `루트 로딩 실패: ${String(e?.message||e)}`));
    }, [stage]);

    // ------------------------- 트리 클릭 -------------------------
    async function clickRootRow(r){
        resetForm();                 // 다른 노드 클릭 → 편집 종료 & 폼 초기화
        if(r.isLeaf){
            setSelected(r); setChildren([]); setParent(null);
            const its = await listSubjectItems(r.id);
            setItems((its||[]).sort((a,b)=>(a.sortOrder??0)-(b.sortOrder??0)));
        }else{
            await loadChildren(r);
            setSelected(null); setItems([]);
        }
    }
    async function clickChildRow(n){
        resetForm();
        if(n.isLeaf){
            setSelected(n);
            const its = await listSubjectItems(n.id);
            setItems((its||[]).sort((a,b)=>(a.sortOrder??0)-(b.sortOrder??0)));
        }else{
            await loadChildren(n);
            setSelected(null); setItems([]);
        }
    }
    async function backToRoot(){
        resetLeft(); resetForm(); setQ('');
        await loadRoots();
    }

    // ------------------------- 편집 시작 -------------------------
    function beginEdit(row){
        // 편집 시작 시 우측 패널 비우기
        setSelected(null);
        setItems([]);

        setEditTarget(row);
        setNodeForm({
            name: row.name ?? '',
            code: row.code ?? '',            // 표시만 (편집 비활성), 저장 시 editTarget.code 사용
            description: row.description ?? '',
        });
        scrollToForm();
    }

    // ------------------------- 생성/수정 저장 -------------------------
    async function saveCategoryCreate(){
        if(!nodeForm.name?.trim()) return alertInfo('입력 필요', '이름을 입력하세요.');
        const payload = {
            schoolStage: stage,
            name: nodeForm.name.trim(),
            code: nodeForm.code || null,
            description: nodeForm.description || null,
            depth: 1,
            parentId: null,
            sortOrder: 0,
            isLeaf: false,
            useYn: true
        };
        try{
            await upsertSubjectNode(payload, null);
            await loadRoots();
            resetForm();
            alertSuccess('완료', '카테고리가 추가되었습니다.');
        }catch(e){
            if (e?.response?.status === 409) alertError('충돌(409)', '같은 학부에 동일 코드가 이미 존재합니다.');
            else alertError('오류', `저장 실패: ${String(e?.message||e)}`);
        }
    }

    async function saveLeafCreate(){
        if(!nodeForm.name?.trim()) return alertInfo('입력 필요', '이름을 입력하세요.');
        if(!parent) return alertInfo('안내', '과목을 추가하려면 먼저 좌측에서 카테고리를 선택하세요.');
        const payload = {
            schoolStage: stage,
            name: nodeForm.name.trim(),
            code: nodeForm.code || null,
            description: nodeForm.description || null,
            depth: (parent.depth||1)+1,
            parentId: parent.id,
            sortOrder: 0,
            isLeaf: true,
            useYn: true
        };
        try{
            const saved = await upsertSubjectNode(payload, null);
            await loadChildren(parent);
            setSelected(saved);
            resetForm();
            alertSuccess('완료', '과목이 추가되었습니다.');
        }catch(e){
            if (e?.response?.status === 409) alertError('충돌(409)', '같은 학부에 동일 코드가 이미 존재합니다.');
            else alertError('오류', `저장 실패: ${String(e?.message||e)}`);
        }
    }

    async function saveEdit(){
        if(!editTarget) return;
        if(!nodeForm.name?.trim()) return alertInfo('입력 필요', '이름을 입력하세요.');

        // ✅ 편집 저장 시: code/schoolStage는 원본(editTarget) 고정
        const payload = {
            schoolStage: editTarget.schoolStage,                // ← 불변
            name: nodeForm.name.trim(),
            code: editTarget.code ?? null,                      // ← 불변
            description: nodeForm.description || null,
            depth: editTarget.depth,
            parentId: editTarget.parentId ?? null,
            sortOrder: editTarget.sortOrder ?? 0,
            isLeaf: !!editTarget.isLeaf,
            useYn: editTarget.useYn !== false
        };

        try{
            await upsertSubjectNode(payload, editTarget.id);

            // 갱신 반영
            if(editTarget.parentId==null){
                await loadRoots();
            }else if(parent && parent.id === editTarget.parentId){
                await loadChildren(parent);
            }
            resetForm();
            alertSuccess('완료', `${editTarget.isLeaf ? '과목' : '카테고리'}가 수정되었습니다.`);
        }catch(e){
            if (e?.response?.status === 409) {
                // 가장 흔한 원인: 동일 stage 내 code 충돌, 또는 stage를 바꿔 보낸 경우
                alertError('충돌(409)', '동일 학부에 같은 코드가 있어 수정할 수 없습니다. (코드는 수정 불가)');
            } else {
                alertError('오류', `저장 실패: ${String(e?.message||e)}`);
            }
        }
    }

    function cancelEdit(){ resetForm(); }

    // ------------------------- 재정렬(Depth1/Children) -------------------------
    const filteredRoots = useMemo(()=>{
        const s = q.trim().toLowerCase(); if(!s) return roots;
        return roots.filter(r => (r.name||'').toLowerCase().includes(s) || (r.code||'').toLowerCase().includes(s));
    }, [q, roots]);

    function moveRoot(idx, dir){
        if(q.trim()) return;            // 검색 중 정렬 금지
        if(editTarget) return;          // 편집 중 정렬 금지
        setRoots(curr => {
            const to = Math.max(0, Math.min(curr.length-1, idx+dir));
            if(to===idx) return curr;
            const arr=[...curr]; const [x]=arr.splice(idx,1); arr.splice(to,0,x);
            return arr.map((n,i)=>({ ...n, sortOrder:i }));
        });
        setRootsDirty(true);
    }
    async function saveRootOrder(){
        if(q.trim()) return alertInfo('안내', '검색 중에는 순서를 저장할 수 없어요.');
        if(editTarget) return alertInfo('안내', '편집 중에는 순서를 저장할 수 없어요.');
        const proceed = await confirmDialog('카테고리 순서 저장', '현재 순서를 저장할까요?', { confirmText:'저장' });
        if(!proceed) return;
        try{
            const ids = roots.map(r=>r.id);
            await reorderSubjectsByParent(stage, null, ids);
            await loadRoots();
            alertSuccess('완료', '카테고리 순서를 저장했습니다.');
        }catch(e){
            alertError('오류', `순서 저장 실패: ${String(e?.message||e)}`);
        }
    }

    function moveChild(idx, dir){
        if(editTarget) return;          // 편집 중 정렬 금지
        setChildren(curr => {
            const to = Math.max(0, Math.min(curr.length-1, idx+dir));
            if(to===idx) return curr;
            const arr=[...curr]; const [x]=arr.splice(idx,1); arr.splice(to,0,x);
            return arr.map((n,i)=>({ ...n, sortOrder:i }));
        });
        setChildrenDirty(true);
    }
    async function saveChildrenOrder(){
        if(!parent) return;
        if(editTarget) return alertInfo('안내', '편집 중에는 순서를 저장할 수 없어요.');
        const proceed = await confirmDialog('과목 순서 저장', '현재 과목 순서를 저장할까요?', { confirmText:'저장' });
        if(!proceed) return;
        try{
            const ids = children.map(c=>c.id);
            await reorderSubjectsByParent(stage, parent.id, ids);
            await loadChildren(parent);
            alertSuccess('완료', '과목 순서를 저장했습니다.');
        }catch(e){
            alertError('오류', `순서 저장 실패: ${String(e?.message||e)}`);
        }
    }

    // ------------------------- 코멘트 페이지로 이동 -------------------------
    async function gotoCommentPage(target){
        // ✅ 대상 과목의 항목 목록 확보: 현재 선택과 다르면 API로 받아온다.
        let its = items;
        if (selected?.id !== target.id) {
            const list = await listSubjectItems(target.id);
            its = (list||[]).sort((a,b)=>(a.sortOrder??0)-(b.sortOrder??0));
        }

        // ✅ 초기 type/itemId 선정 규칙: SDL 우선, 없으면 DT, 둘 다 없으면 type만(SDL)
        const firstSDL = its.find(x => x.kind === 'SDL');
        const firstDT  = its.find(x => x.kind === 'DT');
        const initType   = firstSDL ? 'SDL' : (firstDT ? 'DT' : 'SDL');
        const initItemId = firstSDL?.id ?? firstDT?.id; // 없으면 undefined

        const q = new URLSearchParams();
        q.set('stage', stage);
        q.set('type', initType);
        q.set('subjectId', String(target.id));
        if (initItemId) q.set('itemId', String(initItemId)); // ✅ 가능한 경우에만 부착

        window.location.href = `/admin/subject-comments?${q.toString()}`;
    }

    // ------------------------- 우측: 평가항목 -------------------------
    const addItem = (kind) => setItems(v => [...v, { id:null, subjectId:selected.id, kind, name:'', maxScore:0, sortOrder:v.length, useYn:true }]);
    const removeItem = (idx) => setItems(v => v.filter((_,i)=>i!==idx));
    const moveItem = (idx, dir) => setItems(v => {
        const to=Math.max(0,Math.min(v.length-1,idx+dir));
        const arr=[...v]; const [x]=arr.splice(idx,1); arr.splice(to,0,x);
        return arr.map((it,i)=>({ ...it, sortOrder:i }));
    });
    async function saveItemsAll(){
        if(!selected) return;
        if(items.some(x=>!x.name?.trim())) return alertInfo('입력 필요', '항목명은 필수입니다.');
        const proceed = await confirmDialog('평가 항목 저장', '현재 목록으로 저장할까요?', { confirmText:'저장' });
        if(!proceed) return;
        try{
            const body = items.map((it,i)=>({
                subjectId:selected.id, kind:it.kind, name:it.name.trim(),
                maxScore:Number(it.maxScore||0), sortOrder:i, useYn:it.useYn!==false
            }));
            await saveSubjectItems(selected.id, body);
            const its = await listSubjectItems(selected.id);
            setItems((its||[]).sort((a,b)=>(a.sortOrder??0)-(b.sortOrder??0)));
            alertSuccess('완료', '평가 항목이 저장되었습니다.');
        }catch(e){
            alertError('오류', `항목 저장 실패: ${String(e?.message||e)}`);
        }
    }

    const isDepth1On = (r) => (parent?.id===r.id) || (selected?.id===r.id);

    // ------------------------- 렌더 -------------------------
    return (
        <div className="aa-page academy-page subject-page">
            <div className="aa-container">
                {/* 상단 툴바 */}
                <div className="aa-toolbar aa-topbar" style={{ gap: '.75rem', alignItems:'center' }}>
                    <div style={{ marginRight:'auto' }}>
                        <h1 className="aa-title">과목 관리</h1>
                        <p className="aa-subtle">학부별 트리 관리 → 과목의 SDL/DT 항목 정의</p>
                    </div>
                </div>

                <div className="aa-split">
                    {/* 좌: 트리 */}
                    <section className="aa-card">
                        <div className="flex items-center justify-between mb-2">
                            <StageTabs value={stage} onChange={(k)=>{ setStage(k); }} />
                            <button className="aa-btn" onClick={backToRoot}>초기화</button>
                        </div>

                        <div className="tr-tree">
                            {/* Depth 1 */}
                            <div className="tr-col">
                                <div className="tr-col-title">카테고리</div>

                                {/* 검색 박스(목록 위) */}
                                <div className="aa-search mb-6">
                                    <input className="aa-input" placeholder="카테고리 검색(이름/코드)" value={q} onChange={e=>setQ(e.target.value)} />
                                    {q && <button type="button" className="aa-btn aa-btn-sm" onClick={()=>setQ('')}>×</button>}
                                </div>

                                {filteredRoots.map((r, idx)=>(
                                    <div key={r.id} className={`tr-node clickable ${isDepth1On(r)?'on':''}`} onClick={()=>clickRootRow(r)}>
                                        <div className="tr-label">
                                            <span className="tr-name">{r.name}</span>
                                            {r.code && <span className="tr-code">[{r.code}]</span>}
                                        </div>
                                        <div className="tr-actions" onClick={(e)=>e.stopPropagation()}>
                                            {!q && (
                                                <span className="tr-reorder">
                          <button
                              className="aa-btn aa-btn-sm"
                              onClick={()=>moveRoot(idx,-1)}
                              title="위로"
                              disabled={!!editTarget}        // 편집 중 비활성
                          >▲</button>
                          <button
                              className="aa-btn aa-btn-sm"
                              onClick={()=>moveRoot(idx, 1)}
                              title="아래로"
                              disabled={!!editTarget}        // 편집 중 비활성
                          >▼</button>
                        </span>
                                            )}
                                            <button className="aa-btn aa-btn-sm" onClick={()=>beginEdit(r)}>편집</button>
                                        </div>
                                    </div>
                                ))}
                                {filteredRoots.length===0 && <div className="aa-subtle">루트 없음</div>}
                            </div>

                            {/* Children */}
                            <div className="tr-col">
                                <div className="tr-col-title">과목 {parent? <strong>({parent.name})</strong>:null}</div>
                                {children.map((n, idx)=>(
                                    <div key={n.id} className={`tr-node clickable ${selected?.id===n.id ? 'on':''}`} onClick={()=>clickChildRow(n)}>
                                        <div className="tr-label">
                                            <span className="tr-name">{n.name}</span>
                                            {n.code && <span className="tr-code">[{n.code}]</span>}
                                        </div>
                                        <div className="tr-actions" onClick={(e)=>e.stopPropagation()}>
                      <span className="tr-reorder">
                        <button
                            className="aa-btn aa-btn-sm"
                            onClick={()=>moveChild(idx,-1)}
                            title="위로"
                            disabled={!!editTarget}          // 편집 중 비활성
                        >▲</button>
                        <button
                            className="aa-btn aa-btn-sm"
                            onClick={()=>moveChild(idx, 1)}
                            title="아래로"
                            disabled={!!editTarget}          // 편집 중 비활성
                        >▼</button>
                      </span>
                                            <button className="aa-btn aa-btn-sm" onClick={()=>beginEdit(n)}>편집</button>
                                        </div>
                                    </div>
                                ))}
                                {children.length===0 && <div className="aa-subtle">{parent? '하위 없음' : '좌측 카테고리를 선택하세요.'}</div>}
                            </div>
                        </div>

                        {/* 하단 폼(추가/수정 공용) */}
                        <hr className="aa-divider"/>
                        <div ref={formRef} className="subject-form-block">
                            {/* 편집 배너 */}
                            {editTarget && (
                                <div className="form-mode-banner">
                                    <span className="badge">편집중</span>
                                    <span className="text">
                    {editTarget.isLeaf ? '과목' : '카테고리'} <strong>{editTarget.name}</strong> 를 수정하고 있습니다.
                  </span>
                                    <button className="aa-btn aa-btn-sm" onClick={cancelEdit}>취소</button>
                                </div>
                            )}

                            <div className="subject-page aa-form-grid cols-2">
                                <div className="aa-field">
                                    <label className="aa-label">이름</label>
                                    <input className="aa-input" value={nodeForm.name} onChange={e=>setNodeForm(v=>({...v, name:e.target.value}))}/>
                                </div>
                                <div className="aa-field">
                                    <label className="aa-label">코드 {editTarget && <small className="aa-subtle">(수정 불가)</small>}</label>
                                    <input
                                        className="aa-input"
                                        value={nodeForm.code}
                                        onChange={e=>setNodeForm(v=>({...v, code:e.target.value}))}
                                        disabled={!!editTarget}                 // ✅ 편집 모드에서는 비활성(immutable)
                                        title={editTarget ? '코드는 수정할 수 없습니다.' : ''}
                                    />
                                </div>
                            </div>

                            {/* 버튼 줄: 좌(추가/수정) · 우(정렬 저장) */}
                            <div className="actions-row mt-8">
                                <div className="actions-left">
                                    {!editTarget && (
                                        <>
                                            <button className="aa-btn" onClick={saveCategoryCreate}>+ 카테고리 추가(1뎁스)</button>
                                            <button className="aa-btn aa-btn-primary" onClick={saveLeafCreate}>+ 과목 추가</button>
                                        </>
                                    )}
                                    {editTarget && !editTarget.isLeaf && (
                                        <>
                                            <button className="aa-btn aa-btn-primary" onClick={saveEdit}>카테고리 수정</button>
                                            <button className="aa-btn" disabled title="편집 중에는 과목 추가 비활성">+ 과목 추가</button>
                                        </>
                                    )}
                                    {editTarget && editTarget.isLeaf && (
                                        <>
                                            <button className="aa-btn" disabled title="과목 편집 중에는 1뎁스 카테고리 추가 비활성">+ 카테고리 추가(1뎁스)</button>
                                            <button className="aa-btn aa-btn-primary" onClick={saveEdit}>과목 수정</button>
                                        </>
                                    )}
                                </div>

                                <div className="actions-right">
                                    <button
                                        className="aa-btn"
                                        disabled={!rootsDirty || !!q || !!editTarget}   // 편집/검색 중 비활성
                                        onClick={saveRootOrder}
                                        title={q ? '검색 중 비활성' : (editTarget ? '편집 중 비활성' : '')}
                                    >카테고리 순서 저장</button>
                                    <button
                                        className="aa-btn"
                                        disabled={!childrenDirty || !parent || !!editTarget} // 편집 중 비활성
                                        onClick={saveChildrenOrder}
                                        title={editTarget ? '편집 중 비활성' : ''}
                                    >과목 순서 저장</button>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* 우: 평가 항목 */}
                    <section className="aa-card">
                        <div className="flex items-center justify-between">
                            <h2 className="aa-title--sm">평가 항목(SDL/DT)</h2>
                            <div className="aa-subtle">{selected ? `선택 과목: ${selected.name}` : '과목을 선택하세요.'}</div>
                        </div>

                        {!selected ? (
                            <div className="aa-subtle">왼쪽에서 과목을 선택하면 항목을 편집할 수 있어요.</div>
                        ) : (
                            <>
                                <div className="aa-row mb-6">
                                    <button className="aa-btn aa-btn-outline" onClick={()=>addItem('SDL')}>+ SDL 항목</button>
                                    <button className="aa-btn aa-btn-outline" onClick={()=>addItem('DT')}>+ DT 항목</button>
                                </div>

                                <div className="aa-table-wrap">
                                    <table className="aa-table w-full text-sm">
                                        <thead>
                                        <tr>
                                            <th>#</th><th>종류</th><th>항목명</th><th className="text-right">만점</th><th>정렬</th><th>삭제</th>
                                        </tr>
                                        </thead>
                                        <tbody>
                                        {items.map((it, idx)=>(
                                            <tr key={idx}>
                                                <td>{idx+1}</td>
                                                <td>
                                                    <select className="aa-select w-28" value={it.kind} onChange={e=>setItems(v=>v.map((x,i)=>i===idx?{...x,kind:e.target.value}:x))}>
                                                        <option value="SDL">SDL</option>
                                                        <option value="DT">DT</option>
                                                    </select>
                                                </td>
                                                <td><input className="aa-input w-full" value={it.name||''} onChange={e=>setItems(v=>v.map((x,i)=>i===idx?{...x,name:e.target.value}:x))}/></td>
                                                <td className="text-right"><input className="aa-input w-28 text-right" type="number" value={it.maxScore} onChange={e=>setItems(v=>v.map((x,i)=>i===idx?{...x,maxScore:Number(e.target.value)||0}:x))}/></td>
                                                <td className="text-center">
                                                    <div className="aa-btn-group">
                                                        <button className="aa-btn aa-btn-sm" onClick={()=>moveItem(idx,-1)}>▲</button>
                                                        <button className="aa-btn aa-btn-sm" onClick={()=>moveItem(idx, 1)}>▼</button>
                                                    </div>
                                                </td>
                                                <td className="text-center"><button className="aa-btn aa-btn-danger aa-btn-sm" onClick={()=>removeItem(idx)}>삭제</button></td>
                                            </tr>
                                        ))}
                                        {items.length===0 && <tr><td colSpan={6} className="aa-subtle">항목이 없습니다. 상단 버튼으로 추가하세요.</td></tr>}
                                        </tbody>
                                    </table>
                                </div>

                                <div className="aa-row mt-8">
                                    <button className="aa-btn aa-btn-primary" onClick={saveItemsAll}>항목 저장</button>
                                    <button className="aa-btn" onClick={()=>gotoCommentPage(selected)}>이 과목의 코멘트 관리로 이동</button>
                                </div>
                            </>
                        )}
                    </section>
                </div>
            </div>
        </div>
    );
}