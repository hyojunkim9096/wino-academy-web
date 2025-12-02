// src/features/dbconn/pages/AdminDbConnProfilesPage.jsx
import React, { useEffect, useMemo, useState } from 'react';
import {
    listDbProfilesAll,
    createDbProfile,
    updateDbProfile,
    deleteDbProfile,
    activateDbProfile,
    deactivateDbProfile, // ← 추가
    ymlSnippet,
    listDbProfilesDeleted,
} from '@/features/dbconn/api/dbConnApi.js';
import Swal from 'sweetalert2';
import { alertError, alertSuccess, confirmDialog } from '@/common/ui/alert.js';
import '@/features/system/styles/admin-system.css';

/* 👉 공통: 폼 초기값 */
const DEFAULT_FORM = {
    profileName: '',
    envCode: 'dev',
    jdbcUrl: '',
    username: '',
    passwordPlain: '',
    driverClass: 'com.mysql.cj.jdbc.Driver',
    maximumPoolSize: null,
    minimumIdle: null,
    idleTimeoutMs: null,
    maxLifetimeMs: null,
    remark: '',
};

const numOrNull = (v) => {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    const s = String(v).trim();
    if (s === '') return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
};

export default function AdminDbConnProfilesPage() {
    const [items, setItems] = useState([]);
    const [deletedAll, setDeletedAll] = useState([]);
    const [loading, setLoading] = useState(false);

    const [activatingId, setActivatingId] = useState(null);
    const [deactivatingId, setDeactivatingId] = useState(null);
    const [deletingId, setDeletingId] = useState(null);

    const [saving, setSaving] = useState(false);

    const [form, setForm] = useState({ ...DEFAULT_FORM });
    const [editingId, setEditingId] = useState(null);

    const load = async () => {
        setLoading(true);
        try {
            const [all, delAll] = await Promise.all([
                listDbProfilesAll(),
                listDbProfilesDeleted('all'),
            ]);
            setItems(all || []);
            setDeletedAll(delAll || []);
        } catch (e) {
            alertError('로드 실패', e?.response?.data?.message || e.message);
        } finally {
            setLoading(false);
            setActivatingId(null);
            setDeactivatingId(null);
            setDeletingId(null);
        }
    };
    useEffect(() => { load(); }, []);

    const groups = useMemo(() => {
        const g = { dev: [], prod: [], other: [] };
        (items || []).forEach(it => {
            const env = String(it.envCode || '').toLowerCase();
            if (env === 'dev') g.dev.push(it);
            else if (env === 'prod') g.prod.push(it);
            else g.other.push(it);
        });
        g.dev.sort((a, b) => a.id - b.id);
        g.prod.sort((a, b) => a.id - b.id);
        g.other.sort((a, b) => a.id - b.id);
        return g;
    }, [items]);

    const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
    const setNum = (k) => (e) => setForm((f) => ({ ...f, [k]: numOrNull(e.target.value) }));

    const onSubmit = async (e) => {
        e.preventDefault();
        if (saving) return;
        try {
            if (!form.profileName?.trim()) return Swal.fire('확인', 'profileName은 필수입니다.', 'info');
            if (!form.jdbcUrl?.trim()) return Swal.fire('확인', 'jdbcUrl은 필수입니다.', 'info');
            if (!form.username?.trim()) return Swal.fire('확인', 'username은 필수입니다.', 'info');

            const payload = {
                profileName: form.profileName.trim(),
                envCode: form.envCode,
                jdbcUrl: form.jdbcUrl.trim(),
                username: form.username.trim(),
                ...(form.passwordPlain?.trim() ? { passwordPlain: form.passwordPlain.trim() } : {}),
                driverClass: form.driverClass?.trim() || 'com.mysql.cj.jdbc.Driver',
                maximumPoolSize: numOrNull(form.maximumPoolSize),
                minimumIdle: numOrNull(form.minimumIdle),
                idleTimeoutMs: numOrNull(form.idleTimeoutMs),
                maxLifetimeMs: numOrNull(form.maxLifetimeMs),
                remark: form.remark?.trim() || '',
            };

            setSaving(true);
            if (editingId) {
                await updateDbProfile(editingId, payload);
                await alertSuccess('완료', '수정되었습니다.');
            } else {
                await createDbProfile(payload);
                await alertSuccess('완료', '등록되었습니다.');
            }

            setEditingId(null);
            setForm({ ...DEFAULT_FORM });
            load();
        } catch (e2) {
            alertError('실패', e2?.response?.data?.message || e2.message);
        } finally {
            setSaving(false);
        }
    };

    const onEdit = (it) => {
        setEditingId(it.id);
        setForm({
            profileName: it.profileName || '',
            envCode: it.envCode || 'dev',
            jdbcUrl: it.jdbcUrl || '',
            username: it.username || '',
            passwordPlain: '',
            driverClass: it.driverClass || 'com.mysql.cj.jdbc.Driver',
            maximumPoolSize: numOrNull(it.maximumPoolSize),
            minimumIdle: numOrNull(it.minimumIdle),
            idleTimeoutMs: numOrNull(it.idleTimeoutMs),
            maxLifetimeMs: numOrNull(it.maxLifetimeMs),
            remark: it.remark || '',
        });
    };

    const onCancel = () => {
        setEditingId(null);
        setForm({ ...DEFAULT_FORM });
    };

    const onDelete = async (id) => {
        const ok = await confirmDialog('삭제', '선택한 DB 연결 프로필을 삭제할까요?', { confirmText: '삭제' });
        if (!ok) return;
        try {
            setDeletingId(id);
            await deleteDbProfile(id);
            await alertSuccess('완료', '삭제되었습니다.');
            load();
        } catch (e) {
            setDeletingId(null);
            alertError('실패', e?.response?.data?.message || e.message);
        }
    };

    const onActivate = async (id) => {
        const ok = await confirmDialog(
            '활성화',
            '선택한 프로필을 활성화합니다.\n' +
            '· dev를 활성화하면 prod의 활성 프로필은 모두 비활성화됩니다.\n' +
            '· prod를 활성화하면 dev의 활성 프로필은 모두 비활성화됩니다.\n' +
            '· 동일 환경(dev/prod)에서는 여러 개 활성 상태를 유지할 수 있습니다.',
            { confirmText: '변경', cancelText: '취소', confirmColor: '#2563eb' }
        );
        if (!ok) return;
        try {
            setActivatingId(id);
            await activateDbProfile(id);
            await alertSuccess('완료', '활성화되었습니다.');
            load();
        } catch (e) {
            setActivatingId(null);
            alertError('실패', e?.response?.data?.message || e.message);
        }
    };

    const onDeactivate = async (id) => {
        const ok = await confirmDialog(
            '비활성화',
            '선택한 프로필을 비활성화합니다. 계속하시겠습니까?',
            { confirmText: '비활성', cancelText: '취소', confirmColor: '#ef4444' }
        );
        if (!ok) return;
        try {
            setDeactivatingId(id);
            await deactivateDbProfile(id);
            await alertSuccess('완료', '비활성화되었습니다.');
            load();
        } catch (e) {
            setDeactivatingId(null);
            alertError('실패', e?.response?.data?.message || e.message);
        }
    };

    const onSnippet = async (id) => {
        try {
            const text = await ymlSnippet(id);
            const safe = String(text || '').replace(/</g, '&lt;');
            await Swal.fire({
                title: 'application.yml snippet',
                html: `<pre class="aa-code" style="text-align:left">${safe}</pre>`,
                width: 860, confirmButtonColor: '#2563eb'
            });
        } catch (e) {
            alertError('실패', e?.response?.data?.message || e.message);
        }
    };

    const renderTable = (rows) => (
        <div className="aa-table-wrap">
            <table className="aa-table aa-table--lg">
                <thead>
                <tr>
                    <th style={{ width: 80, textAlign: 'center' }}>Active</th>
                    <th>Name</th>
                    <th style={{ width: 100 }}>Env</th>
                    <th>URL</th>
                    <th style={{ width: 160 }}>User</th>
                    <th style={{ textAlign: 'center' }}>Actions</th>
                </tr>
                </thead>
                <tbody>
                {rows.map(it => {
                    const isActive = !!it.isActive;
                    const isRowBusy = activatingId === it.id || deactivatingId === it.id || deletingId === it.id;
                    return (
                        <tr key={it.id}>
                            <td style={{ textAlign: 'center' }}>{isActive ? '✅' : ''}</td>
                            <td>{it.profileName}</td>
                            <td>{it.envCode}</td>
                            <td className="aa-ellipsis" title={it.jdbcUrl}>{it.jdbcUrl}</td>
                            <td className="aa-ellipsis" title={it.username}>{it.username}</td>
                            <td className="aa-actions-cell">
                                <div className="aa-btn-group" role="group" aria-label="행 동작">
                                    <button
                                        className="aa-btn aa-btn-outline aa-btn-sm"
                                        onClick={() => onEdit(it)}
                                        disabled={isRowBusy}
                                    >수정</button>

                                    <button
                                        className="aa-btn aa-btn-ghost aa-btn-sm"
                                        onClick={() => onActivate(it.id)}
                                        disabled={isRowBusy}
                                        title={isActive
                                            ? '이미 활성입니다. 누르면 반대 환경을 비활성화하고 이 프로필로 리로드합니다.'
                                            : '이 프로필을 활성화합니다.'}
                                    >
                                        {activatingId === it.id ? '활성 중…' : (isActive ? '재활성' : '활성')}
                                    </button>

                                    {isActive && (
                                        <button
                                            className="aa-btn aa-btn-warning aa-btn-sm"
                                            onClick={() => onDeactivate(it.id)}
                                            disabled={isRowBusy}
                                            title="이 프로필을 비활성화합니다."
                                        >
                                            {deactivatingId === it.id ? '비활성 중…' : '비활성'}
                                        </button>
                                    )}

                                    <button
                                        className="aa-btn aa-btn-ghost aa-btn-sm"
                                        onClick={() => onSnippet(it.id)}
                                        disabled={isRowBusy}
                                    >yml</button>

                                    <button
                                        className="aa-btn aa-btn-danger aa-btn-sm"
                                        disabled={isActive || isRowBusy}
                                        title={isActive ? '활성 중에는 삭제할 수 없습니다.' : ''}
                                        onClick={() => onDelete(it.id)}
                                    >
                                        {deletingId === it.id ? '삭제 중…' : '삭제'}
                                    </button>
                                </div>
                            </td>
                        </tr>
                    );
                })}
                {!rows.length && (
                    <tr><td className="aa-help" colSpan={6} style={{ textAlign:'center', padding:'1rem' }}>없음</td></tr>
                )}
                </tbody>
            </table>
        </div>
    );

    return (
        <div className="aa-page">
            <div className="aa-container">
                <div className="aa-toolbar" style={{ margin: '1rem 0 .75rem' }}>
                    <div className="aa-row">
                        <h1 className="aa-title">DB 연결정보 프로필</h1>
                        <span className="aa-subtle">/ dev & prod</span>
                    </div>
                    <div className="aa-toolbar-right">
                        <button className="aa-btn" onClick={load} disabled={loading}>
                            {loading ? '불러오는 중…' : '새로고침'}
                        </button>
                    </div>
                </div>

                <div className="aa-grid cols-10">
                    <div className="col-span-6 aa-sticky-lg">
                        <section className="aa-panel">
                            <div className="aa-row" style={{ justifyContent: 'space-between', marginBottom: '.5rem' }}>
                                <div className="aa-row">
                                    <strong>프로필 (dev)</strong>
                                    <span className="aa-badge aa-badge--muted">{groups.dev.length}</span>
                                </div>
                            </div>
                            {renderTable(groups.dev)}
                        </section>

                        <div style={{ height: '.75rem' }} />

                        <section className="aa-panel">
                            <div className="aa-row" style={{ justifyContent: 'space-between', marginBottom: '.5rem' }}>
                                <div className="aa-row">
                                    <strong>프로필 (prod)</strong>
                                    <span className="aa-badge aa-badge--muted">{groups.prod.length}</span>
                                </div>
                            </div>
                            {renderTable(groups.prod)}
                        </section>

                        {groups.other.length > 0 && (
                            <>
                                <div style={{ height: '.75rem' }} />
                                <section className="aa-panel">
                                    <div className="aa-row" style={{ justifyContent: 'space-between', marginBottom: '.5rem' }}>
                                        <div className="aa-row">
                                            <strong>프로필 (기타)</strong>
                                            <span className="aa-badge aa-badge--muted">{groups.other.length}</span>
                                        </div>
                                    </div>
                                    {renderTable(groups.other)}
                                </section>
                            </>
                        )}

                        <div style={{ height: '1rem' }} />

                        <section className="aa-panel">
                            <div className="aa-row" style={{ alignItems: 'center', gap: '.5rem', marginBottom: '.5rem' }}>
                                <div style={{ fontWeight: 700 }}>삭제 이력 (전체)</div>
                                <span className="aa-badge aa-badge--muted">{deletedAll.length}</span>
                            </div>
                            <div className="aa-table-wrap">
                                <table className="aa-table">
                                    <thead>
                                    <tr>
                                        <th style={{ width: 180 }}>Deleted At</th>
                                        <th>Name</th>
                                        <th style={{ width: 100 }}>Env</th>
                                        <th>URL</th>
                                        <th style={{ width: 160 }}>User</th>
                                        <th style={{ width: 140 }}>Deleted By</th>
                                    </tr>
                                    </thead>
                                    <tbody>
                                    {deletedAll.map(h => (
                                        <tr key={h.id}>
                                            <td className="aa-cell-mono">{(h.deletedAt || '').replace('T',' ').slice(0,19)}</td>
                                            <td className="aa-ellipsis" title={h.profileName}>{h.profileName}</td>
                                            <td>{h.envCode}</td>
                                            <td className="aa-ellipsis" title={h.jdbcUrl}>{h.jdbcUrl}</td>
                                            <td className="aa-ellipsis" title={h.username}>{h.username}</td>
                                            <td className="aa-cell-mono">{h.deletedBy || '-'}</td>
                                        </tr>
                                    ))}
                                    {!deletedAll.length && (
                                        <tr><td className="aa-help" colSpan={6} style={{ textAlign:'center', padding:'1rem' }}>삭제 이력이 없습니다.</td></tr>
                                    )}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    </div>

                    <div className="col-span-4">
                        <section className="aa-panel">
                            <h3 className="aa-title aa-title--sm" style={{ marginBottom: '.45rem' }}>
                                {editingId ? '프로필 수정' : '새 프로필 등록'}
                            </h3>

                            <form onSubmit={onSubmit} className="aa-form-grid-3">
                                <div className="aa-field">
                                    <label>profileName</label>
                                    <input className="aa-input" value={form.profileName} onChange={set('profileName')} />
                                </div>
                                <div className="aa-field">
                                    <label>envCode</label>
                                    <select className="aa-select" value={form.envCode} onChange={set('envCode')}>
                                        <option value="dev">dev</option>
                                        <option value="prod">prod</option>
                                    </select>
                                </div>
                                <div className="aa-field">
                                    <label>driverClass</label>
                                    <input className="aa-input" value={form.driverClass} onChange={set('driverClass')} />
                                </div>

                                <div className="aa-field" style={{ gridColumn: '1 / -1' }}>
                                    <label>jdbcUrl</label>
                                    <input className="aa-input" value={form.jdbcUrl} onChange={set('jdbcUrl')}
                                           placeholder="jdbc:mysql://host:3306/wino_db?params..." />
                                </div>

                                <div className="aa-field">
                                    <label>username</label>
                                    <input className="aa-input" value={form.username} onChange={set('username')} />
                                </div>
                                <div className="aa-field">
                                    <label>password (평문 입력 시 저장 시 암호화)</label>
                                    <input type="password" className="aa-input" value={form.passwordPlain} onChange={set('passwordPlain')} />
                                </div>

                                <div className="aa-field">
                                    <label>maximumPoolSize</label>
                                    <input type="number" className="aa-input" value={form.maximumPoolSize ?? ''} onChange={setNum('maximumPoolSize')} />
                                </div>
                                <div className="aa-field">
                                    <label>minimumIdle</label>
                                    <input type="number" className="aa-input" value={form.minimumIdle ?? ''} onChange={setNum('minimumIdle')} />
                                </div>
                                <div className="aa-field">
                                    <label>idleTimeoutMs</label>
                                    <input type="number" className="aa-input" value={form.idleTimeoutMs ?? ''} onChange={setNum('idleTimeoutMs')} />
                                </div>
                                <div className="aa-field">
                                    <label>maxLifetimeMs</label>
                                    <input type="number" className="aa-input" value={form.maxLifetimeMs ?? ''} onChange={setNum('maxLifetimeMs')} />
                                </div>

                                <div className="aa-field" style={{ gridColumn: '1 / -1' }}>
                                    <label>remark</label>
                                    <input className="aa-input" value={form.remark} onChange={set('remark')} />
                                </div>

                                <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '.5rem' }}>
                                    <button className="aa-btn aa-btn-primary" disabled={saving}>
                                        {saving ? (editingId ? '수정 중…' : '등록 중…') : (editingId ? '수정' : '등록')}
                                    </button>
                                    {editingId && (
                                        <button type="button" className="aa-btn aa-btn-outline" onClick={onCancel} disabled={saving}>취소</button>
                                    )}
                                </div>
                            </form>

                            <div className="aa-help">
                                ※ 정책: dev 활성화 → prod 전체 비활성 / prod 활성화 → dev 전체 비활성. 동일 env에서는 복수 활성 허용.
                            </div>
                        </section>
                    </div>
                </div>
            </div>
        </div>
    );
}
