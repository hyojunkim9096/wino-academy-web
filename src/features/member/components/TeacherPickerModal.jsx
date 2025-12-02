// src/features/member/components/TeacherPickerModal.jsx
// ------------------------------------------------------------
// 담임/교사 선택 모달
// - 좌: 관 목록(공통코드 WORK_LOCATION)  /  우: 검색 + 결과 리스트
// - '한 줄로 붙는' 문제 방지: 2열 Grid + min-width:0 + white-space:normal
// - 라벨: "이름 (관이름)"
// - 변경점 요약
//   1) enableAllLocations prop 추가 → (전체) 필터 노출 제어
//   2) open 시 initialWorkLocation 을 state로 반영(하이라이트/검색 일치)
//   3) 관/강사 레이아웃을 grid로 강제, 우측 열에 minWidth:0 적용
//   4) 리스트 아이템 display:block + white-space:normal 로 줄바꿈 허용
// ------------------------------------------------------------

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { listStaffs } from '@/features/member/api/staffApi.js';
import { getCodes } from '@/features/system/api/commonCodeAdminApi.js';

async function safe(fn, d = null) { try { return await fn(); } catch { return d; } }
function getByPath(obj, path) {
    try { return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj); }
    catch { return undefined; }
}
function pickFirst(obj, paths) {
    for (const p of paths) {
        const v = getByPath(obj, p);
        if (v != null && String(v).trim() !== '') return String(v).trim();
    }
    return '';
}
function getDisplayLabel(t, locNameByCode) {
    const name =
        pickFirst(t, ['userName','username','name','fullName','displayName','user_name','full_name','display_name']) ||
        pickFirst(t, ['userId','user_id','email','phone_number','phone']) ||
        `ID ${t?.id}`;

    const locCode =
        pickFirst(t, ['workLocationCode','work_location_code','workLocation','work_location','workLoc','work_loc']) || '';

    const locName = locCode && locNameByCode?.[locCode] ? locNameByCode[locCode] : (locCode || '-');
    return `${name} (${locName})`;
}

// 교사 객체에서 관 코드만 추출(대문자)
const getLocCode = (t) =>
    String(
        t?.workLocation ??
        t?.work_location ??
        t?.workLocationCode ??
        t?.work_location_code ??
        ''
    ).toUpperCase();

export default function TeacherPickerModal({
                                               open = false,
                                               onClose = () => {},
                                               onPick = () => {},
                                               initialWorkLocation = '',
                                               enableAllLocations = true,
                                           }) {
    const [kw, setKw] = useState('');
    const [work, setWork] = useState(String(initialWorkLocation || '').toUpperCase()); // 현재 선택 관
    const [loading, setLoading] = useState(false);
    const [items, setItems] = useState([]);

    // 관 코드 목록 + 맵
    const [locCodes, setLocCodes] = useState([]);
    const locNameByCode = useMemo(
        () => Object.fromEntries((locCodes || []).map((c) => [String(c.code).toUpperCase(), c.name || ''])),
        [locCodes]
    );

    // 모달 열릴 때 데이터 로드 + 초기 관 반영
    useEffect(() => {
        if (!open) return;
        (async () => {
            const [locs, staffPage] = await Promise.all([
                safe(() => getCodes('WORK_LOCATION'), []),
                safe(() => listStaffs({ employeeType: 'TEACHER', page: 0, size: 1000 }), { content: [] }),
            ]);
            setLocCodes(Array.isArray(locs) ? locs : []);
            const list = Array.isArray(staffPage?.content) ? staffPage.content : (Array.isArray(staffPage) ? staffPage : []);
            setItems(list);
        })();
    }, [open]);

    // 모달이 열릴 때마다 초기 관 코드 state 동기화
    useEffect(() => {
        if (!open) return;
        setWork(String(initialWorkLocation || '').toUpperCase());
    }, [open, initialWorkLocation]);

    // 현재 필터 적용된 목록
    const filtered = useMemo(() => {
        const L = (work || '').toUpperCase();
        const qq = (kw || '').trim().toLowerCase();

        return (items || [])
            .filter(t => !L || getLocCode(t) === L)
            .filter(t => {
                if (!qq) return true;
                const hay = `${getDisplayLabel(t, locNameByCode)} ${t?.email || ''} ${t?.phone || t?.phone_number || ''}`.toLowerCase();
                return hay.includes(qq);
            });
    }, [items, work, kw, locNameByCode]);

    // 관 클릭 시
    const setWorkAndSearch = useCallback((code) => {
        setWork(String(code || '').toUpperCase());
        // 서버 필터가 필요하면 여기서 listStaffs 재호출하도록 변경 가능
    }, []);

    // 선택
    const pick = useCallback((t) => { onPick?.(t); }, [onPick]);

    if (!open) return null;

    const currentWorkName =
        (work && locNameByCode?.[work]) ? locNameByCode[work] : (work ? work : '(전체)');

    return (
        <div className="aa-modal">
            {/* 바깥 클릭 닫기 */}
            <div className="aa-modal-backdrop" onClick={onClose} />
            <div className="aa-modal-panel" role="dialog" aria-modal="true" style={{ maxWidth: 960 }}>
                {/* 헤더: 한 줄 고정 */}
                <div
                    className="aa-modal-header"
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.5rem', flexWrap: 'nowrap' }}
                >
                    <h3 className="aa-title--sm" style={{ margin: 0 }}>담임 교사 선택</h3>
                    <div className="aa-row" style={{ gap: '.4rem', alignItems: 'center', flexWrap: 'nowrap' }}>
                        <span className="aa-badge">{currentWorkName}</span>
                        <button className="aa-btn aa-btn-ghost" onClick={onClose} aria-label="닫기">✕</button>
                    </div>
                </div>

                {/* 바디 */}
                <div className="aa-modal-body">
                    {/* === 2열 Grid 레이아웃 === */}
                    <div
                        className="teacher-picker-grid"
                        style={{
                            display: 'grid',
                            gridTemplateColumns: '200px minmax(360px, 1fr)',
                            gap: '12px',
                            alignItems: 'start',
                            minWidth: 0,
                        }}
                    >
                        {/* 좌: 관 리스트(스크롤) */}
                        <aside
                            className="aa-panel teacher-picker-left"
                            aria-label="관 선택"
                            style={{
                                minWidth: 180,
                                maxHeight: 'calc(100vh - 14rem)',
                                overflow: 'auto',
                            }}
                        >
                            <div className="aa-subtle" style={{ marginBottom: 6 }}>관</div>

                            <ul className="picker-list" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {/* (전체) — enableAllLocations가 true일 때만 노출 */}
                                {enableAllLocations && (
                                    <li
                                        className={`picker-item ${work === '' ? 'on' : ''}`}
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => setWorkAndSearch('')}
                                        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setWorkAndSearch('')}
                                        title="전체"
                                        style={{ display: 'block', whiteSpace: 'normal', padding: '.5rem .6rem', borderRadius: '.5rem', cursor: 'pointer' }}
                                    >
                                        <span>(전체)</span>
                                    </li>
                                )}

                                {/* WORK_LOCATION 코드 목록 */}
                                {(locCodes || []).map((c) => {
                                    const code = String(c.code).toUpperCase();
                                    return (
                                        <li
                                            key={code}
                                            className={`picker-item ${work === code ? 'on' : ''}`}
                                            role="button"
                                            tabIndex={0}
                                            onClick={() => setWorkAndSearch(code)}
                                            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setWorkAndSearch(code)}
                                            title={c.name || code}
                                            style={{ display: 'block', whiteSpace: 'normal', padding: '.5rem .6rem', borderRadius: '.5rem', cursor: 'pointer' }}
                                        >
                                            <div className="aa-row" style={{ justifyContent: 'space-between', gap: '.5rem' }}>
                                                <span className="aa-ellipsis">{c.name || code}</span>
                                                {/*<span className="aa-badge">{code}</span>*/}
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        </aside>

                        {/* 우: 검색 + 결과 */}
                        <section className="teacher-picker-right" style={{ minWidth: 0, maxHeight: 'calc(100vh - 14rem)', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {/* 검색바: 한 줄(줄바꿈 방지) */}
                            <form
                                className="teacher-search-row"
                                onSubmit={(e) => { e.preventDefault(); /* 클라이언트 필터 기준이면 noop */ }}
                                style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'nowrap' }}
                            >
                                <input
                                    className="aa-input"
                                    style={{ flex: 1, minWidth: 0 }}
                                    value={kw}
                                    onChange={(e) => setKw(e.target.value)}
                                    placeholder="이름/전화/이메일"
                                    aria-label="검색어"
                                />
                                {kw && (
                                    <button type="button" className="aa-btn aa-btn-ghost" onClick={() => setKw('')}>지우기</button>
                                )}
                                {/* 서버 재조회가 필요하면 onClick에서 listStaffs 호출하도록 확장 */}
                                <button type="button" className="aa-btn">검색</button>
                            </form>

                            {/* 결과 리스트(세로) */}
                            <div className="aa-panel teacher-result-panel" style={{ minWidth: 0 }}>
                                {!filtered.length && <div className="aa-subtle" style={{ padding: '.5rem' }}>검색 결과가 없습니다.</div>}

                                <ul
                                    className="school-list teacher-result-list"
                                    style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}
                                >
                                    {filtered.map((t) => {
                                        const label = getDisplayLabel(t, locNameByCode);
                                        const code  = getLocCode(t);
                                        return (
                                            <li
                                                key={t.id}
                                                className="school-item"
                                                role="button"
                                                onClick={() => pick(t)}
                                                style={{ display: 'block', whiteSpace: 'normal', padding: '.55rem .7rem', borderRadius: '.5rem', background: 'var(--aa-panel)', border: '1px solid var(--aa-border)' }}
                                            >
                                                <div className="school-item-top" style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap' }}>
                                                    <div className="aa-ellipsis"><b>{label}</b></div>
                                                    {/*{code && <span className="aa-badge">{code}</span>}*/}
                                                </div>
                                                {/* 필요하면 이메일/전화 부가 정보 추가 */}
                                                {/*{t?.email && <div className="aa-subtle">{t.email}</div>}*/}
                                                {(t?.phone || t?.phone_number) && <div className="aa-subtle">{t.phone || t.phone_number}</div>}
                                            </li>
                                        );
                                    })}
                                </ul>
                            </div>
                        </section>
                    </div>
                </div>
            </div>
        </div>
    );
}