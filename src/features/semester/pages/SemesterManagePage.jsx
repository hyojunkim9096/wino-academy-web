// ============================================================================
// src/features/semester/pages/SemesterManagePage.jsx
// ----------------------------------------------------------------------------
// 학기 관리 (좌: 목록 / 우: 등록·수정 폼)
// - 목록 클릭 → 우측 폼 로드/수정
// - 사용 상태 필터: 사용중/미사용/전체 (활성 칩을 확실히 보이게 인라인 스타일 적용)
// - 학기 유형: REGULAR/EXAM_PREP (E는 REGULAR 고정, M/H 선택 가능)
// - 레이아웃 간섭 방지: 최상단에 .academy-page .semester-page 사용
//
// ⚠️ listSemesters(stage, useFilter) 호출은 백엔드가 필터 파라미터를
//    받도록 업데이트되어야 100% 반영됩니다. (기존 API는 무시해도 동작은 함)
//
// ✅ 변경사항
//   - (알림) window.alert/confirm → 공용 SweetAlert 래퍼(alertInfo/Success/Error, confirmDialog)
//   - (스타일) 라이트 전용 admin.css 임포트 제거(다크 베이스와 충돌 방지)
// ============================================================================

import React, { useEffect, useMemo, useState } from 'react';
import StageTabs from '@/features/school/components/StageTabs.jsx';

import {
    listSemesters,
    getSemester,
    upsertSemester,
    deleteSemester
} from '@/features/semester/api/academySemesterApi.js';

// ✅ 공용 알림 유틸(브라우저 기본 alert/confirm 대체)
import { alertInfo, alertSuccess, alertError, confirmDialog } from '@/common/ui/alert.js';

// ── 스타일 임포트 ───────────────────────────────────────────────────────────
// ⚠ 라이트 전용 전역 CSS는 임포트하지 않습니다. (충돌 방지)
// import '@/styles/admin.css';
import '@/features/system/styles/admin-system.css';
import '@/features/admin/styles/admin-academy.css';   // 공통 레이아웃
import '@/features/semester/styles/admin-semester.css';  // 학기 전용(선택 하이라이트 등)

// 사용 상태 필터
const UseFilters = ['ACTIVE', 'INACTIVE', 'ALL'];
const UseFilterLabels = { ACTIVE: '사용중', INACTIVE: '미사용', ALL: '전체' };

// 학기 유형 옵션
const SemesterTypes = [
    { value: 'REGULAR',   label: '정규학기' },
    { value: 'EXAM_PREP', label: '시험대비' },
];

// 중/고 여부
const isExamStage = (stage) => ['M', 'H'].includes(String(stage || '').toUpperCase());

export default function SemesterManagePage() {
    // 상단 Stage/사용여부
    const [stage, setStage] = useState('');                // E/M/H
    const [useFilter, setUseFilter] = useState('ACTIVE');  // ACTIVE/INACTIVE/ALL

    // 좌측 목록/선택
    const [list, setList] = useState([]);
    const [selId, setSelId] = useState(null);

    // 우측 폼
    const [form, setForm] = useState({
        schoolStage: '', code: '', name: '',
        semesterType: 'REGULAR',
        startDate: '', endDate: '',
        sortOrder: 0, useYn: true,
    });

    // ✅ 활성 칩 스타일 (가시성 강화: 진한 인디고 배경/테두리/흰 글자)
    const activeChipStyle = { background: '#4f46e5', borderColor: '#4f46e5', color: '#fff' };

    // ===== 데이터 로딩 =====
    const reload = async () => {
        if (!stage) { setList([]); return; }
        const rows = await listSemesters(stage, useFilter);  // ★ 백엔드가 useFilter를 지원하면 서버 필터 반영
        setList(Array.isArray(rows) ? rows : []);
    };

    // Stage/필터 변경 시 목록 초기화/재로딩
    useEffect(() => {
        setSelId(null);
        setForm({
            schoolStage: stage || '',
            code: '', name: '',
            semesterType: 'REGULAR',     // E는 고정, M/H는 기본값에서 선택
            startDate: '', endDate: '',
            sortOrder: 0, useYn: true,
        });
        if (stage) reload();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stage, useFilter]);

    // 목록 행 클릭 → 단건 로드
    const onSelect = async (id) => {
        setSelId(id);
        try {
            const d = await getSemester(id);
            setForm({
                schoolStage: d.schoolStage,
                code: d.code,
                name: d.name,
                semesterType: d.semesterType || 'REGULAR',
                startDate: d.startDate,
                endDate: d.endDate,
                sortOrder: Number.isFinite(d.sortOrder) ? d.sortOrder : 0,
                useYn: !!d.useYn,
            });
        } catch (e) {
            // ❌ alert → ✅ alertError
            await alertError('상세 조회 실패', e?.response?.data?.message || e.message || '상세 조회 중 오류가 발생했습니다.');
        }
    };

    // 신규 작성
    const onNew = () => {
        setSelId(null);
        setForm({
            schoolStage: stage || '',
            code: '', name: '',
            semesterType: 'REGULAR',
            startDate: '', endDate: '',
            sortOrder: 0, useYn: true,
        });
    };

    // 저장(신규/수정)
    const onSave = async () => {
        // ❌ alert → ✅ alertInfo
        if (!form.schoolStage) return alertInfo('확인', '학부를 선택하세요.');
        if (!form.code?.trim() || !form.name?.trim()) return alertInfo('확인', '코드/이름을 입력하세요.');
        if (!form.startDate || !form.endDate) return alertInfo('확인', '기간을 입력하세요.');

        // E는 REGULAR 고정
        const payload = {
            ...form,
            semesterType: isExamStage(form.schoolStage) ? (form.semesterType || 'REGULAR') : 'REGULAR',
            sortOrder: Number(form.sortOrder || 0),
        };

        try {
            const saved = await upsertSemester(payload, selId); // id 있으면 수정, 없으면 생성
            setSelId(saved.id);
            await reload();
            // 방금 저장한 항목으로 스크롤 (UX 보강)
            setTimeout(() => document.getElementById('sem-row-' + saved.id)?.scrollIntoView({ block: 'center' }), 0);
            // ❌ alert → ✅ alertSuccess
            await alertSuccess('완료', '저장되었습니다.');
        } catch (e) {
            // ❌ alert → ✅ alertError
            await alertError('저장 실패', e?.response?.data?.message || e.message || '저장 중 오류가 발생했습니다.');
        }
    };

    // 삭제(=비활성화 권장)
    const onDelete = async () => {
        if (!selId) return alertInfo('확인', '삭제할 학기를 선택하세요.');
        // ❌ confirm → ✅ confirmDialog
        const ok = await confirmDialog('비활성화 확인', '이 학기를 비활성화 하시겠습니까?\n(useYn=false 전환 권장)');
        if (!ok) return;

        try {
            await deleteSemester(selId);         // ★ 서버에서 useYn=false 처리하는 방식 권장
            await reload();
            onNew();
            // ❌ alert → ✅ alertSuccess
            await alertSuccess('완료', '비활성화했습니다.');
        } catch (e) {
            // ❌ alert → ✅ alertError
            await alertError('비활성화 실패', e?.response?.data?.message || e.message || '삭제(비활성) 중 오류가 발생했습니다.');
        }
    };

    // 폼 입력 헬퍼
    const setField = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

    // 학기유형 셀렉트 비활성 조건(E는 선택 불가)
    const typeDisabled = useMemo(
        () => !isExamStage(form.schoolStage || stage),
        [form.schoolStage, stage]
    );

    // 비활성 구간에서는 항상 REGULAR 보장
    useEffect(() => {
        if (typeDisabled && form.semesterType !== 'REGULAR') {
            setField('semesterType', 'REGULAR');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [typeDisabled]);

    return (
        // ✅ academy-page + semester-page 스코프
        <div className="aa-page academy-page semester-page">
            <div className="aa-container">
                {/* 상단 툴바: 학부/사용상태 필터 */}
                <div className="aa-toolbar aa-topbar" style={{ marginBottom: 12 }}>
                    <h1 className="aa-title">학기 관리</h1>
                    <StageTabs value={stage} onChange={setStage} />

                    {/* ✅ 사용 상태 필터 탭 (활성 상태를 확실히 표시: aria-pressed + 인라인 스타일) */}
                    <div className="aa-seg" style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                        {UseFilters.map(f => {
                            const active = useFilter === f;
                            return (
                                <button
                                    key={f}
                                    type="button"
                                    className="aa-chip"
                                    aria-pressed={active}                 // ★ 접근성(선택 상태) 표시
                                    onClick={() => setUseFilter(f)}
                                    title={`목록을 ${UseFilterLabels[f]}만 보기`}
                                    style={active ? activeChipStyle : undefined}   // ★ 활성 시 색 반전
                                >
                                    {UseFilterLabels[f]}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* 좌/우 분할 */}
                <div className="aa-split">
                    {/* 왼쪽: 학기 목록 */}
                    <section className="aa-card">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="aa-title--sm">학기 목록</h2>
                            <button className="aa-btn aa-btn-xs primary" onClick={onNew}>+ 새 학기</button>
                        </div>

                        <div className="aa-table-wrap">
                            <table className="aa-table aa-table--lg">
                                <thead>
                                <tr>
                                    <th>코드</th>
                                    <th>이름</th>
                                    <th>유형</th>
                                    <th>기간</th>
                                    <th>사용</th>
                                    <th className="text-right">정렬</th>
                                </tr>
                                </thead>
                                <tbody>
                                {list.map(s => {
                                    const active = selId === s.id;
                                    return (
                                        <tr
                                            id={`sem-row-${s.id}`}
                                            key={s.id}
                                            className={active ? 'on' : ''}      // ★ 선택 시 on 클래스
                                            aria-selected={active}               // ★ 선택 상태(보조 표기)
                                            onClick={() => onSelect(s.id)}
                                            style={{ cursor: 'pointer' }}
                                            title={`${s.name} (${s.code})`}
                                        >
                                            <td className="aa-cell-mono">{s.code}</td>
                                            <td>{s.name}</td>
                                            <td>
                                                {s.semesterType === 'EXAM_PREP'
                                                    ? <span className="slot-badge">시험대비</span>
                                                    : <span className="slot-badge">정규</span>}
                                            </td>
                                            <td>{s.startDate} ~ {s.endDate}</td>
                                            <td>{s.useYn ? 'Y' : 'N'}</td>
                                            <td className="text-right">{s.sortOrder}</td>
                                        </tr>
                                    );
                                })}
                                {list.length === 0 && (
                                    <tr>
                                        <td colSpan={6} style={{ textAlign: 'center', color: '#94a3b8', padding: '16px' }}>
                                            데이터가 없습니다.
                                        </td>
                                    </tr>
                                )}
                                </tbody>
                            </table>
                        </div>
                    </section>

                    {/* 오른쪽: 등록/수정 폼 */}
                    <section className="aa-card">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="aa-title--sm">{selId ? '학기 수정' : '학기 등록'}</h2>
                            {selId && (
                                <div className="flex items-center" style={{ gap: 8 }}>
                                    <button className="aa-btn aa-btn-xs" onClick={onNew}>새로 작성</button>
                                    <button className="aa-btn aa-btn-xs" onClick={onDelete}>삭제(비활성)</button>
                                </div>
                            )}
                        </div>

                        <div className="aa-form-grid cols-2">
                            {/* 학부(Stage) — StageTabs와 동기화, 읽기 전용 */}
                            <div className="aa-field">
                                <label className="aa-label">학부(Stage)</label>
                                <input className="aa-input" value={form.schoolStage || stage} readOnly />
                            </div>

                            <div className="aa-field">
                                <label className="aa-label">코드</label>
                                <input
                                    className="aa-input"
                                    value={form.code}
                                    onChange={e => setField('code', e.target.value)}
                                    placeholder="예: 2025_S1"
                                />
                            </div>

                            <div className="aa-field">
                                <label className="aa-label">이름</label>
                                <input
                                    className="aa-input"
                                    value={form.name}
                                    onChange={e => setField('name', e.target.value)}
                                    placeholder="예: 2025년 1학기"
                                />
                            </div>

                            <div className="aa-field">
                                <label className="aa-label">
                                    학기 유형{(!isExamStage(form.schoolStage || stage)) ? ' (초등은 정규만)' : ''}
                                </label>
                                <select
                                    className="aa-select"
                                    value={!isExamStage(form.schoolStage || stage) ? 'REGULAR' : (form.semesterType || 'REGULAR')}
                                    onChange={e => setField('semesterType', e.target.value)}
                                    disabled={!isExamStage(form.schoolStage || stage)}
                                >
                                    {SemesterTypes.map(opt => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="aa-field">
                                <label className="aa-label">시작일</label>
                                <input
                                    type="date"
                                    className="aa-input"
                                    value={form.startDate}
                                    onChange={e => setField('startDate', e.target.value)}
                                />
                            </div>

                            <div className="aa-field">
                                <label className="aa-label">종료일</label>
                                <input
                                    type="date"
                                    className="aa-input"
                                    value={form.endDate}
                                    onChange={e => setField('endDate', e.target.value)}
                                />
                            </div>

                            <div className="aa-field">
                                <label className="aa-label">정렬</label>
                                <input
                                    type="number"
                                    className="aa-input text-right"
                                    value={form.sortOrder}
                                    onChange={e => setField('sortOrder', Number(e.target.value) || 0)}
                                />
                            </div>

                            <div className="aa-field">
                                <label className="aa-label">사용</label>
                                <label className="aa-inline-field" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                                    <input
                                        type="checkbox"
                                        checked={!!form.useYn}
                                        onChange={e => setField('useYn', e.target.checked)}
                                    />
                                    <span className="aa-inline-label">Use</span>
                                </label>
                            </div>
                        </div>

                        <div className="mt-12">
                            <button className="aa-btn aa-btn-primary" onClick={onSave}>
                                {selId ? '수정 저장' : '등록'}
                            </button>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
}