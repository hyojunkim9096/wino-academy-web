// src/features/admin/pages/AdminCorsSettingPage.jsx
import React, { useEffect, useState } from 'react';
import { getCors, saveCors } from '@/api/adminSettingsApi';
import { alertError, alertSuccess } from '@/ui/alert';
import '@/styles/admin-system.css';

export default function AdminCorsSettingPage(){
    const [form, setForm] = useState({
        allowedOrigins:'*',
        allowedMethods:'GET,POST,PUT,DELETE,PATCH,OPTIONS',
        allowedHeaders:'*',
        exposedHeaders:'Authorization,X-Requested-With,Content-Disposition',
        maxAge:3600,
        allowCredentials:false
    });
    const [loading, setLoading] = useState(false);

    useEffect(()=>{ (async()=>{
        setLoading(true);
        try{ const v=await getCors(); if(v) setForm(v); }
        catch(e){ alertError('로드 실패', e?.response?.data?.message||e.message); }
        finally { setLoading(false); }
    })(); }, []);

    const onSubmit = async (e)=>{
        e.preventDefault();
        try{ await saveCors(form); await alertSuccess('완료','저장되었습니다.'); }
        catch(e){ alertError('실패', e?.response?.data?.message||e.message); }
    };

    return (
        <div className="aa-page">
            <div className="aa-container">
                <div className="aa-toolbar">
                    <h1 className="aa-title">CORS 설정</h1>
                    <div className="aa-row">
                        <button className="aa-btn" onClick={()=>window.location.reload()} disabled={loading}>
                            {loading?'불러오는 중…':'새로고침'}
                        </button>
                    </div>
                </div>

                <section className="aa-panel tight">
                    <form onSubmit={onSubmit} className="aa-form-grid-2">
                        <div className="aa-field"><label>allowedOrigins</label><input className="aa-input" value={form.allowedOrigins||''} onChange={e=>setForm({...form, allowedOrigins:e.target.value})}/></div>
                        <div className="aa-field"><label>allowedMethods</label><input className="aa-input" value={form.allowedMethods||''} onChange={e=>setForm({...form, allowedMethods:e.target.value})}/></div>
                        <div className="aa-field"><label>allowedHeaders</label><input className="aa-input" value={form.allowedHeaders||''} onChange={e=>setForm({...form, allowedHeaders:e.target.value})}/></div>
                        <div className="aa-field"><label>exposedHeaders</label><input className="aa-input" value={form.exposedHeaders||''} onChange={e=>setForm({...form, exposedHeaders:e.target.value})}/></div>
                        <div className="aa-field"><label>maxAge</label><input type="number" className="aa-input" value={form.maxAge||0} onChange={e=>setForm({...form, maxAge:Number(e.target.value)})}/></div>
                        <div className="aa-field"><label>allowCredentials</label>
                            <select className="aa-select" value={String(form.allowCredentials||false)} onChange={e=>setForm({...form, allowCredentials: e.target.value==='true'})}>
                                <option value="false">false</option><option value="true">true</option>
                            </select>
                        </div>
                        <div style={{gridColumn:'1 / -1', display:'flex', gap:'.5rem'}}>
                            <button className="aa-btn aa-btn-primary">저장</button>
                            <span className="aa-help" style={{alignSelf:'center'}}>도메인/자격증명은 운영 정책과 일치해야 합니다.</span>
                        </div>
                    </form>
                </section>
            </div>
        </div>
    );
}
