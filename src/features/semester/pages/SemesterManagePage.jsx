// src/features/semester/pages/SemesterManagePage.jsx
// ============================================================================
// 학기 관리 (UI 개선판)
// ----------------------------------------------------------------------------
// - 레이아웃: 입력 폼을 논리적 그룹으로 묶어 깔끔하게 배치
// - 상태 버튼: 현재 상태에 따라 [활성화] <-> [비활성화] 버튼 토글
// - 안전 장치: 비활성화 시 강력한 경고 메시지 출력 (학기 마감 여부 확인 유도)
// ============================================================================

import React, { useEffect, useMemo, useState } from 'react';

// API
import {
    listSemesters,
    getSemester,
    upsertSemester,
    // deleteSemester 대신 update(upsert)로 상태 변경 처리
} from '@/features/semester/api/academySemesterApi.js';

// 공통 모듈
import { alertInfo, alertSuccess, alertError, confirmDialog } from '@/common/ui/alert.js';
import { useCommonCodes } from '@/common/components/contexts/CommonCodeContext';
import StageTabs from '@/features/school/components/StageTabs.jsx';

// 스타일
import '@/features/system/styles/admin-system.css';
import '@/features/admin/styles/admin-academy.css';
import '@/features/semester/styles/admin-semester.css';

// ------------------------------ 상수 ------------------------------

const UseFilters = ['ACTIVE', 'INACTIVE', 'ALL'];
const UseFilterLabels = { ACTIVE: '사용중', INACTIVE: '미사용', ALL: '전체' };

const ALL_SEMESTER_TYPES = [
    { value: 'REGULAR',   label: '정규학기' },
    { value: 'EXAM_PREP', label: '시험대비' },
    { value: 'SEASONAL',  label: '계절학기' },
];

const getAllowedTypes = (stageCode) => {
    const code = String(stageCode || '').toUpperCase();
    if (code === 'E') { // 초등: 시험대비 제외
        return ALL_SEMESTER_TYPES.filter(t => t.value !== 'EXAM_PREP');
    }
    return ALL_SEMESTER_TYPES;
};

// ------------------------------ 컴포넌트 ------------------------------

export default function SemesterManagePage() {
    const { codes: stageCodes, loading: codeLoading } = useCommonCodes('SCHOOL_STAGE');

    // 상태
    const [stage, setStage] = useState('');
    const [useFilter, setUseFilter] = useState('ACTIVE');
    const [list, setList] = useState([]);
    const [selId, setSelId] = useState(null);

    // 폼 데이터
    const [form, setForm] = useState({
        schoolStage: '', code: '', name: '',
        semesterType: 'REGULAR',
        startDate: '', endDate: '',
        sortOrder: 0, useYn: true,
    });

    // 초기 로드
    useEffect(() => {
        if (!codeLoading && stageCodes.length > 0 && !stage) {
            setStage(stageCodes[0].code);
        }
    }, [codeLoading, stageCodes, stage]);

    // 목록 조회
    const reload = async () => {
        if (!stage) { setList([]); return; }
        try {
            const rows = await listSemesters(stage, useFilter);
            setList(Array.isArray(rows) ? rows : []);
        } catch (e) {
            console.error(e);
            setList([]);
        }
    };

    useEffect(() => {
        setSelId(null);
        resetForm(stage);
        if (stage) reload();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stage, useFilter]);

    const resetForm = (targetStage) => {
        setForm({
            schoolStage: targetStage || '',
            code: '', name: '',
            semesterType: 'REGULAR',
            startDate: '', endDate: '',
            sortOrder: 0, useYn: true,
        });
    };

    // 상세 선택
    const onSelect = async (id) => {
        try {
            const d = await getSemester(id);
            setSelId(id);
            setForm({
                schoolStage: d.schoolStage,
                code: d.code,
                name: d.name,
                semesterType: d.semesterType || 'REGULAR',
                startDate: d.startDate,
                endDate: d.endDate,
                sortOrder: d.sortOrder ?? 0,
                useYn: !!d.useYn,
            });
        } catch (e) {
            await alertError('조회 실패', e.message);
        }
    };

    // 저장 (신규/수정)
    const onSave = async () => {
        if (!form.schoolStage) return alertInfo('확인', '학부를 선택하세요.');
        if (!form.code?.trim() || !form.name?.trim()) return alertInfo('확인', '코드와 이름을 입력하세요.');
        if (!form.startDate || !form.endDate) return alertInfo('확인', '기간을 입력하세요.');

        try {
            const saved = await upsertSemester(form, selId);
            await alertSuccess('성공', '저장되었습니다.');
            setSelId(saved.id);
            reload();
        } catch (e) {
            await alertError('저장 실패', e.response?.data?.message || e.message);
        }
    };

    // 상태 토글 (활성 <-> 비활성)
    const onToggleStatus = async () => {
        if (!selId) return;

        const willBeActive = !form.useYn;
        const actionName = willBeActive ? "활성화" : "비활성화";

        // ⚠️ 비활성화 시 강력한 경고 (User Requirement)
        if (!willBeActive) {
            const ok = await confirmDialog(
                '비활성화 확인',
                `정말 이 학기를 비활성화 하시겠습니까?\n\n⚠️ 주의: 현재 진행 중인 반이 있거나 학기 마감이 되지 않은 상태라면\n시스템 오류나 데이터 조회 문제가 발생할 수 있습니다.\n\n확실한 경우에만 진행해 주세요.`,
                { confirmText: '비활성화', confirmColor: '#ef4444' }
            );
            if (!ok) return;
        }

        try {
            // useYn 상태만 반전시켜서 업데이트
            const payload = { ...form, useYn: willBeActive };
            await upsertSemester(payload, selId);

            // UI 반영
            setForm(payload);
            await alertSuccess('완료', `학기가 ${actionName} 되었습니다.`);
            reload();
        } catch (e) {
            await alertError('실패', e.message);
        }
    };

    const currentAllowedTypes = useMemo(() => {
        return getAllowedTypes(form.schoolStage || stage);
    }, [form.schoolStage, stage]);

    // 헬퍼: 입력값 변경
    const setField = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

    const activeChipStyle = { background: '#4f46e5', borderColor: '#4f46e5', color: '#fff' };

    return (
        <div className="aa-page academy-page semester-page">
            <div className="aa-container">
                {/* 상단 툴바 */}
                <div className="aa-toolbar aa-topbar" style={{ marginBottom: 12 }}>
                    <h1 className="aa-title">학기 관리</h1>
                    <StageTabs value={stage} onChange={setStage} />

                    <div className="aa-seg" style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                        {UseFilters.map(f => (
                            <button
                                key={f}
                                type="button"
                                className="aa-chip"
                                aria-pressed={useFilter === f}
                                onClick={() => setUseFilter(f)}
                                style={useFilter === f ? activeChipStyle : undefined}
                            >
                                {UseFilterLabels[f]}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="aa-split">
                    {/* [좌측] 학기 목록 */}
                    <section className="aa-card">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="aa-title--sm">학기 목록</h2>
                            <button
                                className="aa-btn aa-btn-xs primary"
                                onClick={() => { setSelId(null); resetForm(stage); }}
                            >
                                + 새 학기
                            </button>
                        </div>
                        <div className="aa-table-wrap" style={{ maxHeight: 'calc(100vh - 200px)', overflow: 'auto' }}>
                            <table className="aa-table aa-table--lg">
                                <thead>
                                <tr>
                                    <th>코드</th>
                                    <th>이름</th>
                                    <th>유형</th>
                                    <th>기간</th>
                                    <th className="text-right">상태</th>
                                </tr>
                                </thead>
                                <tbody>
                                {list.map(s => (
                                    <tr
                                        key={s.id}
                                        className={selId === s.id ? 'on' : ''}
                                        onClick={() => onSelect(s.id)}
                                        style={{ cursor: 'pointer' }}
                                    >
                                        <td className="aa-cell-mono font-bold">{s.code}</td>
                                        <td>{s.name}</td>
                                        <td>
                                            {s.semesterType === 'REGULAR' && <span className="aa-badge aa-badge--ok">정규</span>}
                                            {s.semesterType === 'EXAM_PREP' && <span className="aa-badge aa-badge--warn">시험</span>}
                                            {s.semesterType === 'SEASONAL' && <span className="aa-badge" style={{background:'#0ea5e9', borderColor:'#0284c7', color:'white'}}>계절</span>}
                                        </td>
                                        <td className="text-sm text-slate-400">
                                            {s.startDate} ~ {s.endDate}
                                        </td>
                                        <td className="text-right">
                                            {s.useYn
                                                ? <span className="text-green-400 font-semibold">사용중</span>
                                                : <span className="text-slate-500">미사용</span>
                                            }
                                        </td>
                                    </tr>
                                ))}
                                {list.length === 0 && <tr><td colSpan={5} className="text-center py-8 text-slate-500">데이터가 없습니다.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </section>

                    {/* [우측] 등록/수정 폼 */}
                    <section className="aa-card">
                        <div className="flex items-center justify-between mb-6 pb-2 border-b border-slate-700">
                            <h2 className="aa-title--sm">
                                {selId ? '학기 상세 정보' : '신규 학기 등록'}
                            </h2>
                            {selId && (
                                // 상태에 따라 버튼 텍스트와 색상 변경
                                <button
                                    className={`aa-btn aa-btn-xs ${form.useYn ? 'aa-btn-danger' : 'aa-btn-primary'}`}
                                    onClick={onToggleStatus}
                                >
                                    {form.useYn ? '⛔ 비활성화 (사용중지)' : '✅ 활성화 (사용개시)'}
                                </button>
                            )}
                        </div>

                        {/* 입력 폼 영역 (깔끔하게 그룹핑) */}
                        <div className="space-y-5">

                            {/* 1. 기본 정보 그룹 */}
                            <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700/50">
                                <div className="text-xs font-bold text-slate-400 mb-3 uppercase tracking-wider">Basic Info</div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="aa-field">
                                        <label className="aa-label">학부</label>
                                        <input
                                            className="aa-input bg-slate-900 text-slate-400 cursor-not-allowed"
                                            value={stageCodes.find(c => c.code === (form.schoolStage || stage))?.name || (form.schoolStage || stage)}
                                            readOnly
                                        />
                                    </div>
                                    <div className="aa-field">
                                        <label className="aa-label">학기 유형</label>
                                        <select
                                            className="aa-select"
                                            value={form.semesterType}
                                            onChange={e => setField('semesterType', e.target.value)}
                                        >
                                            {currentAllowedTypes.map(t => (
                                                <option key={t.value} value={t.value}>{t.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="aa-field">
                                        <label className="aa-label">학기 코드 <span className="text-red-400">*</span></label>
                                        <input
                                            className="aa-input font-mono"
                                            value={form.code}
                                            onChange={e => setField('code', e.target.value)}
                                            placeholder="예: 2024_S1"
                                        />
                                    </div>
                                    <div className="aa-field">
                                        <label className="aa-label">학기 명칭 <span className="text-red-400">*</span></label>
                                        <input
                                            className="aa-input"
                                            value={form.name}
                                            onChange={e => setField('name', e.target.value)}
                                            placeholder="예: 2024년 1학기"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* 2. 기간 및 설정 그룹 */}
                            <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700/50">
                                <div className="text-xs font-bold text-slate-400 mb-3 uppercase tracking-wider">Schedule & Settings</div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="aa-field">
                                        <label className="aa-label">시작일 <span className="text-red-400">*</span></label>
                                        <input type="date" className="aa-input" value={form.startDate} onChange={e => setField('startDate', e.target.value)} />
                                    </div>
                                    <div className="aa-field">
                                        <label className="aa-label">종료일 <span className="text-red-400">*</span></label>
                                        <input type="date" className="aa-input" value={form.endDate} onChange={e => setField('endDate', e.target.value)} />
                                    </div>
                                    <div className="aa-field">
                                        <label className="aa-label">정렬 순서</label>
                                        <input
                                            type="number"
                                            className="aa-input text-right"
                                            value={form.sortOrder}
                                            onChange={e => setField('sortOrder', Number(e.target.value))}
                                        />
                                    </div>
                                    <div className="aa-field">
                                        <label className="aa-label">사용 여부</label>
                                        <select
                                            className={`aa-select font-bold ${form.useYn ? 'text-green-400' : 'text-slate-400'}`}
                                            value={form.useYn ? 'Y' : 'N'}
                                            onChange={e => setField('useYn', e.target.value === 'Y')}
                                        >
                                            <option value="Y">사용 (Active)</option>
                                            <option value="N">미사용 (Inactive)</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="mt-8 flex justify-end gap-3">
                            <button className="aa-btn aa-btn-lg aa-btn-primary w-full md:w-auto" onClick={onSave}>
                                {selId ? '변경사항 저장' : '신규 등록'}
                            </button>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
}