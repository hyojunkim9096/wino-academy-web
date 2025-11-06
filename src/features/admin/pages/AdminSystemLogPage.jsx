// src/features/admin/pages/AdminSystemLogPage.jsx
// 시스템 로그 목록 화면 (프런트 전용 강화판)
// ─────────────────────────────────────────────────────────────────────────────
// - 백엔드가 저장한 AdminSystemLog를 보여줍니다.
// - admin_menu 매핑 결과: 화면명(screenName) / 화면코드(screenCode) 표시
// - 필터: Method, Actor(행위자), Path 검색(부분 일치), Status 대역(2xx/4xx/5xx)
// - UX   : 자동 새로고침(토글), CSV 내보내기, 클라이언트 페이징
// - API  : /admin/system-logs (프로젝트의 axios 프록시가 /api 접두 처리)
// - 스타일: 프로젝트 공통 다크스타일(admin-system.css) 유지
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useState } from 'react';
import api from '@/api/client';        // ✅ 프로젝트 공용 axios 인스턴스
import '@/styles/admin-system.css';

// ★ 공용 알림 모듈(SweetAlert2 래퍼) 사용
import { alertInfo, alertError } from '@/ui/alert';

// ───────────────────────── 유틸 ─────────────────────────

/** ISO-8601 "YYYY-MM-DDTHH:mm:ss" → "YYYY-MM-DD HH:mm:ss" */
function formatDateTime(s) {
    if (!s) return '';
    // 백엔드(LocalDateTime 직렬화) 예시: "2025-08-21T10:11:12"
    // 표시는 초 단위까지만
    return String(s).replace('T',' ').slice(0,19);
}

/** 상태 코드 대역 판별 (2xx/4xx/5xx/기타) */
function statusBand(statusCode) {
    if (typeof statusCode !== 'number') return 'etc';
    if (statusCode >= 200 && statusCode < 300) return '2xx';
    if (statusCode >= 400 && statusCode < 500) return '4xx';
    if (statusCode >= 500) return '5xx';
    return 'etc';
}

/** CSV 변환: 배열 → CSV 문자열 */
function toCsv(rows, headers) {
    const escape = (v) => {
        if (v == null) return '';
        const s = String(v);
        return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const head = headers.map(h => escape(h.label)).join(',');
    const body = rows.map(r => headers.map(h => escape(h.get(r))).join(',')).join('\n');
    return `${head}\n${body}`;
}

/** 텍스트 파일 다운로드 */
function downloadText(filename, text, mime = 'text/csv;charset=utf-8;') {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        URL.revokeObjectURL(url);
        document.body.removeChild(a);
    }, 0);
}

// ───────────────────────── 컴포넌트 ─────────────────────────

export default function AdminSystemLogPage() {
    // 데이터/상태
    const [items, setItems]       = useState([]);     // 서버에서 받은 원본 목록
    const [loading, setLoading]   = useState(false);  // 로딩 스피너
    const [method, setMethod]     = useState('');     // 필터: HTTP 메서드
    const [actor, setActor]       = useState('');     // 필터: 행위자(로그인 ID, 부분 일치)
    const [qPath, setQPath]       = useState('');     // 필터: 경로(부분 일치)
    const [statBand, setStatBand] = useState('');     // 필터: 상태코드 대역('', '2xx','4xx','5xx')
    const [auto, setAuto]         = useState(false);  // 자동 새로고침 토글
    const [page, setPage]         = useState(1);      // 클라이언트 페이지 (1-based)
    const [pageSize, setPageSize] = useState(50);     // 페이지 크기 (50/100/200)

    // 서버에서 목록 로드
    const load = async () => {
        setLoading(true);
        try {
            // ✅ 컨트롤러는 /api/admin/system-logs 이고,
            //    공용 axios 인스턴스(api)가 /api 프리픽스/인증을 알아서 붙여줍니다.
            //    여기선 프록시 경로로 호출.
            const { data } = await api.get('/admin/system-logs', { params: { size: 1000 } });
            setItems(Array.isArray(data) ? data : []);
            setPage(1); // 새 데이터 수신시 첫 페이지로 이동(UX)
        } catch (e) {
            const msg = e?.response?.data?.message || e.message || '알 수 없는 오류';
            // ❌ window.alert → ✅ SweetAlert2 래퍼
            await alertError('조회 실패', `시스템 로그 조회 실패:\n${msg}`);
        } finally {
            setLoading(false);
        }
    };

    // 최초 로드
    useEffect(() => { load(); }, []);

    // 자동 새로고침 (30초 간격)
    useEffect(() => {
        if (!auto) return;
        const id = setInterval(() => { load().catch(()=>{}); }, 30_000);
        return () => clearInterval(id);
    }, [auto]); // auto 토글에만 반응

    // 필터링 (메모이즈)
    const filtered = useMemo(() => {
        const m  = (method || '').trim();
        const a  = (actor  || '').trim().toLowerCase();
        const qp = (qPath  || '').trim().toLowerCase();
        const sb = (statBand||'').trim();

        return (items || []).filter((it) => {
            const byMethod = m ? (it.method === m) : true;
            const byActor  = a ? ((it.actorUserId || '').toLowerCase().includes(a)) : true;
            const byPath   = qp? ((it.path || '').toLowerCase().includes(qp)) : true;

            let byStatus = true;
            if (sb) {
                const band = statusBand(it.statusCode);
                byStatus = (band === sb);
            }
            return byMethod && byActor && byPath && byStatus;
        });
    }, [items, method, actor, qPath, statBand]);

    // 클라이언트 페이징
    const total = filtered.length;
    const lastPage = Math.max(1, Math.ceil(total / pageSize));
    const curPage = Math.min(page, lastPage);
    const start = (curPage - 1) * pageSize;
    const end   = Math.min(start + pageSize, total);
    const pageRows = filtered.slice(start, end);

    // CSV 내보내기
    const exportCsv = async () => {
        if (!filtered.length) {
            // ❌ window.alert → ✅ SweetAlert2 래퍼
            await alertInfo('안내', '내보낼 로그가 없습니다.');
            return;
        }
        const headers = [
            { label: 'id',           get: r => r.id },
            { label: 'createdAt',    get: r => formatDateTime(r.createdAt) },
            { label: 'actorUserId',  get: r => r.actorUserId || '' },
            { label: 'method',       get: r => r.method || '' },
            { label: 'path',         get: r => r.path || '' },
            { label: 'screenName',   get: r => r.screenName || '' },
            { label: 'screenCode',   get: r => r.screenCode || '' },
            { label: 'statusCode',   get: r => r.statusCode ?? '' },
            { label: 'elapsedMs',    get: r => r.elapsedMs ?? '' },
            { label: 'ipAddress',    get: r => r.ipAddress || '' },
            { label: 'userAgent',    get: r => r.userAgent || '' },
            { label: 'errorMessage', get: r => r.errorMessage || '' },
        ];
        const csv = toCsv(filtered, headers);
        downloadText(`system-logs_${new Date().toISOString().slice(0,10)}.csv`, csv);
    };

    // 필터 리셋 (편의)
    const clearFilters = () => {
        setMethod('');
        setActor('');
        setQPath('');
        setStatBand('');
        setPage(1);
    };

    // 메서드 뱃지(선택) — 프로젝트 CSS에 aa-badge만 있어도 동작. 색 분리 원하면 클래스 확장.
    const renderMethodBadge = (m) => (
        <span className="aa-badge aa-badge--muted">{m}</span>
    );

    // 상태코드 뱃지 (대역에 따른 시각 구분 — CSS에 따라 동일 색일 수 있음)
    const renderStatusBadge = (code) => {
        const band = statusBand(code);
        const cls =
            band === '2xx' ? 'aa-badge' :
                band === '4xx' ? 'aa-badge' :
                    band === '5xx' ? 'aa-badge' : 'aa-badge aa-badge--muted';
        return <span className={cls}>{code ?? ''}</span>;
    };

    // ───────────────────────── 렌더 ─────────────────────────
    return (
        <div className="aa-page">
            <div className="aa-container">

                {/* 상단 툴바 */}
                <div className="aa-toolbar">
                    <h1 className="aa-title">시스템 로그</h1>
                    <div className="aa-toolbar-right" style={{ gap: 8, display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
                        {/* 메서드 선택 */}
                        <select className="aa-select" style={{ width: 140 }} value={method} onChange={e=>setMethod(e.target.value)}>
                            <option value="">Method: ALL</option>
                            <option>GET</option><option>POST</option><option>PUT</option><option>PATCH</option><option>DELETE</option>
                        </select>

                        {/* 행위자 검색 */}
                        <input
                            className="aa-input"
                            style={{ width: 160 }}
                            placeholder="Actor 검색"
                            value={actor}
                            onChange={(e) => setActor(e.target.value)}
                        />

                        {/* 경로 검색 */}
                        <input
                            className="aa-input"
                            style={{ width: 200 }}
                            placeholder="Path 포함 검색"
                            value={qPath}
                            onChange={(e) => setQPath(e.target.value)}
                        />

                        {/* 상태코드 대역 */}
                        <select className="aa-select" style={{ width: 120 }} value={statBand} onChange={e=>setStatBand(e.target.value)}>
                            <option value="">Status: ALL</option>
                            <option value="2xx">2xx</option>
                            <option value="4xx">4xx</option>
                            <option value="5xx">5xx</option>
                        </select>

                        {/* 자동 새로고침 */}
                        <label className="aa-checkbox" style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
                            <input type="checkbox" checked={auto} onChange={e=>setAuto(e.target.checked)} />
                            <span>자동새로고침(30s)</span>
                        </label>

                        {/* 페이지 크기 */}
                        <select
                            className="aa-select"
                            style={{ width: 100 }}
                            value={pageSize}
                            onChange={(e)=>{ setPageSize(Number(e.target.value)); setPage(1); }}
                        >
                            <option value={50}>50행</option>
                            <option value={100}>100행</option>
                            <option value={200}>200행</option>
                        </select>

                        {/* 액션 버튼 */}
                        <button className="aa-btn" onClick={load} disabled={loading}>
                            {loading ? '불러오는 중…' : '새로고침'}
                        </button>
                        <button className="aa-btn" onClick={exportCsv} disabled={!filtered.length}>CSV 내보내기</button>
                        <button className="aa-btn aa-btn--ghost" onClick={clearFilters}>필터 초기화</button>
                    </div>
                </div>

                {/* 목록 테이블 */}
                <section className="aa-panel tight">
                    <div className="aa-table-wrap">
                        <table className="aa-table">
                            <thead>
                            <tr>
                                <th style={{ width: 170 }}>시각</th>
                                <th style={{ width: 140 }}>행위자</th>
                                <th style={{ width: 90  }}>메서드</th>
                                <th>경로</th>
                                {/* ✅ 추가된 컬럼: 화면명 / 화면코드 */}
                                <th style={{ width: 220 }}>화면명</th>
                                <th style={{ width: 200 }}>화면코드</th>
                                {/* 상태/지연시간 */}
                                <th style={{ width: 90  }}>Status</th>
                                <th style={{ width: 110 }}>Elapsed</th>
                                <th style={{ width: 150 }}>IP</th>
                            </tr>
                            </thead>
                            <tbody>
                            {pageRows.map((it) => (
                                <tr key={it.id}>
                                    <td>{formatDateTime(it.createdAt)}</td>
                                    <td className="aa-ellipsis" title={it.actorUserId || '-'}>{it.actorUserId || '-'}</td>
                                    <td>{renderMethodBadge(it.method)}</td>
                                    <td className="aa-ellipsis" title={it.path}>{it.path}</td>

                                    {/* ✅ 화면명/화면코드 (백엔드에서 자동 주입) */}
                                    <td className="aa-ellipsis" title={it.screenName || '-'}>{it.screenName || '-'}</td>
                                    <td className="aa-ellipsis" title={it.screenCode || '-'}>{it.screenCode || '-'}</td>

                                    {/* 상태/지연시간 */}
                                    <td title={String(it.statusCode ?? '')}>{renderStatusBadge(it.statusCode)}</td>
                                    <td>{typeof it.elapsedMs === 'number' ? `${it.elapsedMs} ms` : ''}</td>

                                    <td className="aa-ellipsis" title={it.userAgent}>{it.ipAddress || ''}</td>
                                </tr>
                            ))}
                            {!pageRows.length && (
                                <tr>
                                    <td className="aa-help" colSpan={9} style={{ textAlign:'center', padding:'1rem' }}>
                                        로그가 없습니다.
                                    </td>
                                </tr>
                            )}
                            </tbody>
                        </table>
                    </div>

                    {/* 하단 페이징 바 */}
                    <div
                        className="aa-table-footer"
                        style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 12px' }}
                    >
                        <div className="aa-help">
                            총 <b>{total}</b>건 / {curPage} / {lastPage} 페이지
                            {loading ? ' (갱신 중)' : ''}
                        </div>
                        <div style={{ display:'flex', gap:8 }}>
                            <button className="aa-btn" onClick={() => setPage(1)} disabled={curPage<=1}>⏮ 처음</button>
                            <button className="aa-btn" onClick={() => setPage(p=>Math.max(1,p-1))} disabled={curPage<=1}>‹ 이전</button>
                            <button className="aa-btn" onClick={() => setPage(p=>Math.min(lastPage,p+1))} disabled={curPage>=lastPage}>다음 ›</button>
                            <button className="aa-btn" onClick={() => setPage(lastPage)} disabled={curPage>=lastPage}>마지막 ⏭</button>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
}