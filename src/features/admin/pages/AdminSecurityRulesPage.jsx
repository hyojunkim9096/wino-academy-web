// src/features/admin/pages/AdminSecurityRulesPage.jsx
import React, { useEffect, useState } from 'react';
import { listSecurityRules, createSecurityRule, updateSecurityRule, deleteSecurityRule, listSecurityRulesDeleted } from '@/api/adminSettingsApi';
import { alertError, alertSuccess, alertInfo, confirmDialog } from '@/ui/alert';
import '@/styles/admin-system.css';

const ACCESS_TYPES = ['PERMIT_ALL','DENY_ALL','AUTHENTICATED','HAS_ANY_AUTHORITY'];

export default function AdminSecurityRulesPage(){
    const [items, setItems] = useState([]);
    const [deleted, setDeleted] = useState([]);
    const [form, setForm] = useState({ httpMethod:'', pattern:'', accessType:'AUTHENTICATED', authoritiesCsv:'', orderIndex:1000, enabled:true, remark:'' });
    const [editingId, setEditingId] = useState(null);
    const [loading, setLoading] = useState(false);

    const load = async ()=>{
        setLoading(true);
        try{
            const [a,d] = await Promise.all([listSecurityRules(), listSecurityRulesDeleted()]);
            setItems(Array.isArray(a)?a:[]); setDeleted(Array.isArray(d)?d:[]);
        }catch(e){
            console.error('[SecurityRules] load error:', e);
            alertError('로드 실패', e?.response?.data?.message || e.message);
        }finally{ setLoading(false); }
    };
    useEffect(()=>{ load(); }, []);

    const onSubmit = async (e)=>{
        e.preventDefault();
        try{
            if(!form.pattern?.trim()) return alertInfo('확인','pattern은 필수입니다.');
            const payload = { ...form, httpMethod: form.httpMethod||null, authoritiesCsv: (form.authoritiesCsv||'').trim()||null };
            if(editingId){ await updateSecurityRule(editingId, payload); await alertSuccess('완료','수정되었습니다.'); }
            else { await createSecurityRule(payload); await alertSuccess('완료','등록되었습니다.'); }
            setEditingId(null);
            setForm({ httpMethod:'', pattern:'', accessType:'AUTHENTICATED', authoritiesCsv:'', orderIndex:1000, enabled:true, remark:'' });
            load();
        }catch(e){
            console.error('[SecurityRules] submit error:', e);
            alertError('실패', e?.response?.data?.message || e.message);
        }
    };

    const onEdit = (it)=> setEditingId(it.id) || setForm({
        httpMethod:it.httpMethod||'', pattern:it.pattern, accessType:it.accessType,
        authoritiesCsv:it.authoritiesCsv||'', orderIndex:it.orderIndex??1000, enabled:!!it.enabled, remark:it.remark||''
    });

    const onDelete = async (id)=>{
        const ok = await confirmDialog('삭제','선택한 보안 규칙을 삭제할까요?',{ confirmText:'삭제' });
        if(!ok) return;
        try{ await deleteSecurityRule(id); await alertSuccess('완료','삭제되었습니다.'); load(); }
        catch(e){ alertError('실패', e?.response?.data?.message || e.message); }
    };

    return (
        <div className="aa-page">
            <div className="aa-container">
                <div className="aa-toolbar">
                    <h1 className="aa-title">보안 규칙 (Security Rules)</h1>
                    <button className="aa-btn" onClick={load} disabled={loading}>{loading?'불러오는 중…':'새로고침'}</button>
                </div>

                <div className="aa-grid cols-10">
                    {/* 좌(7): 목록 + 삭제 이력 */}
                    <div className="col-span-7 aa-sticky-lg">
                        <section className="aa-panel tight">
                            <div className="aa-row" style={{alignItems:'center', gap:'.5rem', marginBottom:'.4rem'}}>
                                <div style={{fontWeight:700}}>현재 규칙</div>
                                <span className="aa-badge aa-badge--muted">{items.length}</span>
                            </div>
                            <div className="aa-table-wrap">
                                <table className="aa-table aa-table--lg">
                                    <thead>
                                    <tr><th>Order</th><th>Method</th><th className="aa-cell-mono">Pattern</th><th>Type</th><th>Auths</th><th>Enabled</th><th>Remark</th><th style={{textAlign:'center'}}>Actions</th></tr>
                                    </thead>
                                    <tbody>
                                    {items.sort((a,b)=>(a.orderIndex??0)-(b.orderIndex??0)).map(it=>(
                                        <tr key={it.id}>
                                            <td className="aa-cell-mono" style={{textAlign:'center'}}>{it.orderIndex}</td>
                                            <td style={{textAlign:'center'}}><span className="aa-badge aa-badge--muted">{it.httpMethod || 'ALL'}</span></td>
                                            <td className="aa-cell-mono">{it.pattern}</td>
                                            <td style={{textAlign:'center'}}>
                                                <span className={`aa-badge ${it.accessType==='PERMIT_ALL' ? 'aa-badge--ok' : it.accessType==='DENY_ALL' ? 'aa-badge--warn' : 'aa-badge--muted'}`}>{it.accessType}</span>
                                            </td>
                                            <td>{it.authoritiesCsv}</td>
                                            <td style={{textAlign:'center'}}><span className={`aa-badge ${it.enabled?'aa-badge--ok':'aa-badge--warn'}`}>{String(it.enabled)}</span></td>
                                            <td>{it.remark}</td>
                                            <td style={{textAlign:'center', whiteSpace:'nowrap'}}>
                                                <button className="aa-btn aa-btn-outline" onClick={()=>onEdit(it)}>수정</button>{' '}
                                                <button className="aa-btn aa-btn-danger" onClick={()=>onDelete(it.id)}>삭제</button>
                                            </td>
                                        </tr>
                                    ))}
                                    {!items.length && <tr><td className="aa-help" colSpan={8} style={{padding:'1rem', textAlign:'center'}}>등록된 규칙이 없습니다.</td></tr>}
                                    </tbody>
                                </table>
                            </div>
                        </section>

                        <div style={{height:'.8rem'}} />

                        <section className="aa-panel tight">
                            <div className="aa-row" style={{alignItems:'center', gap:'.5rem', marginBottom:'.4rem'}}>
                                <div style={{fontWeight:700}}>삭제 이력</div>
                                <span className="aa-badge aa-badge--muted">{deleted.length}</span>
                            </div>
                            <div className="aa-table-wrap">
                                <table className="aa-table">
                                    <thead><tr><th>Deleted At</th><th>Method</th><th>Pattern</th><th>Type</th><th>Auths</th><th>By</th></tr></thead>
                                    <tbody>
                                    {deleted.map(h=>(
                                        <tr key={h.id}>
                                            <td className="aa-cell-mono">{h.deletedAt}</td>
                                            <td className="aa-cell-mono">{h.httpMethod || 'ALL'}</td>
                                            <td className="aa-cell-mono">{h.pattern}</td>
                                            <td>{h.accessType}</td>
                                            <td>{h.authoritiesCsv}</td>
                                            <td className="aa-cell-mono">{h.deletedBy || '-'}</td>
                                        </tr>
                                    ))}
                                    {!deleted.length && <tr><td className="aa-help" colSpan={6} style={{padding:'1rem', textAlign:'center'}}>삭제 이력이 없습니다.</td></tr>}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    </div>

                    {/* 우(3): 폼 */}
                    <div className="col-span-3">
                        <section className="aa-panel tight">
                            <form onSubmit={onSubmit} className="aa-form-grid-3">
                                <div className="aa-field"><label>HTTP Method</label>
                                    <input className="aa-input" value={form.httpMethod} onChange={e=>setForm({...form, httpMethod:e.target.value.toUpperCase()})} placeholder="예) GET (비우면 전체)"/></div>
                                <div className="aa-field"><label>Access Type</label>
                                    <select className="aa-select" value={form.accessType} onChange={e=>setForm({...form, accessType:e.target.value})}>
                                        {ACCESS_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
                                    </select></div>
                                <div className="aa-field"><label>Order</label>
                                    <input type="number" className="aa-input" value={form.orderIndex} onChange={e=>setForm({...form, orderIndex:Number(e.target.value)})}/></div>
                                <div className="aa-field" style={{gridColumn:'1 / -1'}}><label>Pattern</label>
                                    <input className="aa-input" value={form.pattern} onChange={e=>setForm({...form, pattern:e.target.value})} placeholder="/api/admin/**"/></div>
                                <div className="aa-field" style={{gridColumn:'1 / -1'}}><label>Authorities CSV</label>
                                    <input className="aa-input" value={form.authoritiesCsv} onChange={e=>setForm({...form, authoritiesCsv:e.target.value})} placeholder="ROLE_SYSTEM_ADMIN,ROLE_ADMIN"/></div>
                                <div className="aa-field" style={{gridColumn:'1 / -1'}}><label>Enabled</label>
                                    <select className="aa-select" value={String(form.enabled)} onChange={e=>setForm({...form, enabled:e.target.value==='true'})}>
                                        <option value="true">true</option><option value="false">false</option>
                                    </select></div>
                                <div className="aa-field" style={{gridColumn:'1 / -1'}}><label>Remark</label>
                                    <input className="aa-input" value={form.remark} onChange={e=>setForm({...form, remark:e.target.value})}/></div>
                                <div style={{gridColumn:'1 / -1', display:'flex', gap:'.5rem'}}>
                                    <button className="aa-btn aa-btn-primary">{editingId?'수정':'등록'}</button>
                                    {editingId && <button type="button" className="aa-btn aa-btn-outline" onClick={()=>{
                                        setEditingId(null);
                                        setForm({ httpMethod:'', pattern:'', accessType:'AUTHENTICATED', authoritiesCsv:'', orderIndex:1000, enabled:true, remark:'' });
                                    }}>취소</button>}
                                </div>
                            </form>
                        </section>
                    </div>
                </div>
            </div>
        </div>
    );
}
