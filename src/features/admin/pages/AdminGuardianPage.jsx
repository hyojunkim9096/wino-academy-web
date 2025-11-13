// src/features/admin/pages/AdminGuardianPage.jsx
// ============================================================================
// 보호자 관리 화면 (v2 - 마스터/디테일 레이아웃)
// - ✅ [수정] 3:7 레이아웃 셸
// - ✅ [수정] 좌: 필터 + 목록 + "신규" 버튼
// - ✅ [수정] 우: viewMode ('detail' | 'create')에 따라 패널 교체
// ============================================================================

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { listGuardians } from '@/api/guardianApi';
import { alertError } from '@/ui/alert';

// ✅ [신규] 분리된 우측 패널 컴포넌트 import
import GuardianDetailPanel from '@/features/admin/components/guardian/GuardianDetailPanel';
import GuardianFormPanel from '@/features/admin/components/guardian/GuardianFormPanel';

import '@/styles/admin-system.css';
import '@/styles/admin-shared.css';
import '@/styles/admin-guardian.css'; // ✅ 3:7 레이아웃 CSS

const safeError = (t,m)=>Promise.resolve(alertError(t,m)).catch(()=>{});

export default function AdminGuardianPage(){
    // ===== 필터 =====
    const [keyword, setKeyword] = useState('');
    const [kwDebounced, setKwDebounced] = useState('');

    // ===== 목록/선택 =====
    const [list, setList] = useState([]); //
    const [loading, setLoading] = useState(false);
    const [selectedId, setSelectedId] = useState(null);

    // ===== 우측 패널 상태 =====
    // ✅ [신규] 'detail' (상세보기/편집) 또는 'create' (신규등록)
    const [viewMode, setViewMode] = useState('detail');

    //
    useEffect(()=>{
        const t = setTimeout(()=> setKwDebounced(keyword.trim()), 250);
        return ()=> clearTimeout(t);
    },[keyword]);

    //
    const inflight = useRef(0);
    const loadList = useCallback(async (keep=false)=>{
        setLoading(true);
        const my = ++inflight.current;
        try{
            const res = await listGuardians({ keyword: kwDebounced || undefined, page:0, size:30 });
            if (my !== inflight.current) return;
            const rows = Array.isArray(res?.content)?res.content:(Array.isArray(res)?res:[]);
            rows.sort((a,b)=>(a.name||'').localeCompare(b.name||'','ko',{sensitivity:'base'}));
            setList(rows);

            //
            if (!keep) {
                const firstId = rows[0]?.id ?? null;
                setSelectedId(firstId);
                //
                setViewMode(firstId ? 'detail' : 'create');
            } else if (keep && selectedId && !rows.some(r => r.id === selectedId)) {
                //
                const firstId = rows[0]?.id ?? null;
                setSelectedId(firstId);
                setViewMode(firstId ? 'detail' : 'create');
            }

        }catch(e){
            setList([]);
            safeError('오류', e?.response?.data?.message || '보호자 목록 조회 실패');
        }finally{
            if (my===inflight.current) setLoading(false);
        }
    },[kwDebounced]); //

    useEffect(()=>{ loadList(false); },[loadList]);

    // ===== 핸들러 =====

    //
    const onSelectRow = (id) => {
        setSelectedId(id);
        setViewMode('detail'); //
    };

    //
    const onBeginCreate = () => {
        setSelectedId(null);
        setViewMode('create'); //
    };

    //
    const onCancelCreate = () => {
        setViewMode('detail'); //
        if (list.length > 0) {
            setSelectedId(list[0].id); //
        }
    };

    //
    const onSaveSuccess = async (savedGuardian) => {
        await loadList(true); //
        if (savedGuardian?.id) {
            setSelectedId(savedGuardian.id); //
        }
        setViewMode('detail'); //
    };

    return (
        <section className="aa-page academy-page guardian-page">
            <div className="aa-container">
                <div className="aa-toolbar">
                    <h1 className="aa-title">보호자 관리</h1>
                    <div className="aa-toolbar-right">
                        {/* */}
                        <button className="aa-btn" onClick={()=>loadList(true)}>새로고침</button>
                    </div>
                </div>

                {/* ✅ [수정] 3:7 스플릿 레이아웃 */}
                <div className="aa-split">
                    {/* =====================
                      좌측 패널 (30%)
                      =====================
                    */}
                    <div className="aa-card">
                        <div className="flex gap-2 mb-2">
                            <input
                                className="aa-input w-full"
                                placeholder="이름/연락처/이메일/로그인ID"
                                value={keyword}
                                onChange={e=>setKeyword(e.target.value)}
                            />
                            {/* */}
                            <button className="aa-btn aa-btn-primary" onClick={onBeginCreate}>
                                신규
                            </button>
                        </div>

                        {loading ? <div>불러오는 중…</div> : (
                            <div className="aa-panel guardian-list-panel divide-y">
                                {list.length===0 && <div className="p-3 text-slate-400">결과 없음</div>}
                                {list.map(row=>{
                                    const sel = selectedId===row.id && viewMode === 'detail';
                                    return (
                                        <button key={row.id} type="button"
                                                className={`w-full text-left p-3 relative ${sel?'bg-slate-800 font-semibold':'hover:bg-slate-800/60'}`}
                                                onClick={()=>onSelectRow(row.id)}>
                                            {sel && <span aria-hidden className="absolute left-0 top-0 h-full" style={{width:3,background:'var(--aa-accent)'}}/>}
                                            <div className="truncate">{row.name}</div>
                                            <div className="text-xs text-slate-400 truncate">
                                                {row.phone || '-'}
                                                {row.loginId ? ` · ${row.loginId}` : ' (미연결)'}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* =====================
                      우측 패널 (70%)
                      =====================
                    */}
                    <div className="aa-card">
                        {viewMode === 'create' ? (
                            //
                            <GuardianFormPanel
                                mode="create"
                                onSaveSuccess={onSaveSuccess}
                                onCancel={onCancelCreate}
                            />
                        ) : (selectedId ? (
                            //
                            <GuardianDetailPanel
                                key={selectedId} //
                                guardianId={selectedId}
                                onListReload={() => loadList(true)} //
                            />
                        ) : (
                            //
                            <div>좌측에서 대상을 선택하세요.</div>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
}