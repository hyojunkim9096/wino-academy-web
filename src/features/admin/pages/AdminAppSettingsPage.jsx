// src/features/admin/pages/AdminAppSettingsPage.jsx
import React, { useEffect, useState } from 'react';
import {
    listAppSettings, createAppSetting, updateAppSetting,
    deleteAppSetting, listAppSettingsDeleted
} from '@/api/adminSettingsApi';
import { alertError, alertSuccess, confirmDialog } from '@/ui/alert';
import '@/styles/admin-staff.css'; // ✅ 색상/포커스 토닝 일치
import '@/styles/admin-system.css';

/** 시스템 설정 - 애플리케이션 설정 */
export default function AdminAppSettingsPage() {
    const [items, setItems] = useState([]);
    const [deleted, setDeleted] = useState([]);
    const [form, setForm] = useState({ key: '', value: '', remark: '' });
    const [editingId, setEditingId] = useState(null);
    const [loading, setLoading] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const [a, d] = await Promise.all([listAppSettings(), listAppSettingsDeleted()]);
            setItems(Array.isArray(a) ? a : []);
            setDeleted(Array.isArray(d) ? d : []);
        } catch (e) {
            alertError('불러오기 실패', e?.response?.data?.message || e.message);
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => { load(); }, []);

    const onSubmit = async (e) => {
        e.preventDefault();
        try {
            if (!form.key?.trim()) return alertError('유효성 오류', 'key를 입력하세요.');
            if (editingId) {
                await updateAppSetting(editingId, form);
                await alertSuccess('수정 완료', '설정을 수정했습니다.');
            } else {
                await createAppSetting(form);
                await alertSuccess('등록 완료', '설정을 등록했습니다.');
            }
            setEditingId(null);
            setForm({ key:'', value:'', remark:'' });
            load();
        } catch (e) {
            alertError('실패', e?.response?.data?.message || e.message);
        }
    };

    return (
        <div className="aa-page">
            <div className="aa-container">
                <div className="aa-toolbar">
                    <h2 className="aa-title">애플리케이션 설정</h2>
                    <div className="aa-row">
                        {loading && <span className="aa-subtle">로딩중…</span>}
                        <button className="aa-btn" onClick={load} disabled={loading}>
                            {loading ? '불러오는 중…' : '새로고침'}
                        </button>
                    </div>
                </div>

                <div className="aa-grid cols-10">
                    {/* 좌(6): 목록/삭제이력 */}
                    <section className="aa-panel col-span-6 tight">
                        <div className="aa-row" style={{justifyContent:'space-between', marginBottom:'.35rem'}}>
                            <div className="aa-subtle">총 {items.length}건</div>
                        </div>

                        <div className="aa-table-wrap">
                            <table className="aa-table">
                                <thead>
                                <tr>
                                    <th style={{width:'30%'}}>Key</th>
                                    <th style={{width:'40%'}}>Value</th>
                                    <th style={{width:'20%'}}>Remark</th>
                                    <th className="aa-actions-cell">Action</th>
                                </tr>
                                </thead>
                                <tbody>
                                {items.map(it => (
                                    <tr key={it.id}>
                                        <td className="aa-cell-mono">{it.key}</td>
                                        <td><div className="aa-ellipsis" title={it.value}>{it.value}</div></td>
                                        <td><div className="aa-ellipsis" title={it.remark}>{it.remark}</div></td>
                                        <td className="aa-actions-cell">
                                            <div className="aa-actions">
                                                <button className="aa-btn aa-btn-outline" onClick={()=>{
                                                    setEditingId(it.id);
                                                    setForm({ key: it.key, value: it.value ?? '', remark: it.remark ?? '' });
                                                }}>수정</button>
                                                <button
                                                    className="aa-btn aa-btn-danger"
                                                    onClick={async ()=>{
                                                        if (!(await confirmDialog('삭제', '이 설정을 삭제할까요?', { confirmText:'삭제' }))) return;
                                                        try{
                                                            await deleteAppSetting(it.id);                 // 1) 실제 삭제 호출
                                                            await alertSuccess('삭제 완료', '설정을 삭제했습니다.');
                                                        }catch(e){
                                                            const msg = e?.response?.data?.message || e.message || '알 수 없는 오류';
                                                            // 409 같은 충돌은 그대로 사용자에게 알림 (거짓 성공 금지)
                                                            return alertError('삭제 실패', msg);
                                                        }finally{
                                                            // 2) 항상 재조회 → 실제 목록에서 사라졌는지 확인하게 함
                                                            await load();
                                                            if (editingId === it.id) {
                                                                setEditingId(null);
                                                                setForm({ key:'', value:'', remark:'' });
                                                            }
                                                        }
                                                    }}
                                                >삭제</button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {items.length === 0 && (
                                    <tr><td colSpan={4} style={{textAlign:'center'}} className="aa-subtle">데이터가 없습니다.</td></tr>
                                )}
                                </tbody>
                            </table>
                        </div>

                        <h3 className="aa-title aa-title--sm" style={{marginTop:'.5rem'}}>삭제 이력</h3>
                        <div className="aa-table-wrap">
                            <table className="aa-table">
                                <thead>
                                <tr>
                                    <th style={{width:'32%'}}>Key</th>
                                    <th style={{width:'38%'}}>Value(삭제 당시)</th>
                                    <th style={{width:'15%'}}>Deleted By</th>
                                    <th style={{width:'15%'}}>Deleted At</th>
                                </tr>
                                </thead>
                                <tbody>
                                {deleted.map(d => (
                                    <tr key={d.id}>
                                        <td className="aa-cell-mono">{d.key}</td>
                                        <td><div className="aa-ellipsis" title={d.value}>{d.value}</div></td>
                                        <td>{d.deletedBy || '-'}</td>
                                        <td>{d.deletedAt?.replace('T',' ').substring(0,19) || '-'}</td>
                                    </tr>
                                ))}
                                {deleted.length === 0 && (
                                    <tr><td colSpan={4} style={{textAlign:'center'}} className="aa-subtle">이력이 없습니다.</td></tr>
                                )}
                                </tbody>
                            </table>
                        </div>
                    </section>

                    {/* 우(4): 등록/수정 폼 */}
                    <section className="aa-panel col-span-4 tight">
                        <h3 className="aa-title aa-title--sm" style={{marginBottom:'.4rem'}}>
                            {editingId ? '설정 수정' : '새 설정 등록'}
                        </h3>
                        <form onSubmit={onSubmit} className="aa-form-grid-1">
                            <div>
                                <label className="aa-label">Key</label>
                                <input className="aa-input" value={form.key}
                                       onChange={e=>setForm(p=>({...p, key:e.target.value}))}
                                       placeholder="예) storage.attach.base-path@dev" />
                            </div>
                            <div>
                                <label className="aa-label">Value</label>
                                <textarea className="aa-textarea" value={form.value}
                                          onChange={e=>setForm(p=>({...p, value:e.target.value}))}
                                          placeholder="설정 값" />
                            </div>
                            <div>
                                <label className="aa-label">Remark</label>
                                <input className="aa-input" value={form.remark}
                                       onChange={e=>setForm(p=>({...p, remark:e.target.value}))}
                                       placeholder="비고/설명" />
                            </div>
                            <div className="aa-row">
                                <button type="submit" className="aa-btn aa-btn-primary">{editingId ? '수정' : '등록'}</button>
                                {editingId && (
                                    <button type="button" className="aa-btn aa-btn-outline"
                                            onClick={()=>{ setEditingId(null); setForm({key:'', value:'', remark:''}); }}>
                                        취소
                                    </button>
                                )}
                            </div>
                            <div className="aa-help">※ 보안 민감값은 DB 대신 환경변수/시크릿 권장</div>
                        </form>
                    </section>
                </div>
            </div>
        </div>
    );
}
