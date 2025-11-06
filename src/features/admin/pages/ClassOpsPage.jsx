// src/features/admin/pages/ClassOpsPage.jsx
// ============================================================================
// 반 운영 작업(학기 스냅샷 & 마감 / 히스토리에서 되돌리기) 화면
// - 상단에서 학부(Stage) / 지점(WorkLocation) / 학기(Semester)를 선택
// - [미리보기] API를 통해 영향받는 대상(반/과목/시간표) 건수를 표시
// - [학기 마감] : 히스토리 스냅샷 저장 후 초기화(학기/담임/과목담당 NULL, 시간표 삭제)
// - [되돌리기] : 선택한 학기의 '마지막 스냅샷' 기준으로 (반/담임, 과목, 시간표) 복원
// ----------------------------------------------------------------------------
// 수정 핵심: listSemestersApi(stage, 'ACTIVE') 또는 listSemestersApi(stage)
// - 기존에는 두 번째 인자로 { activeOnly: true } 객체를 넘겨서
//   /admin/semesters?use=[object Object] 형태로 잘못 호출되어 목록이 비어버렸음.
// - 아래 코드는 문자열 인자('ACTIVE')를 사용(또는 기본값)해 정상 동작.
// ============================================================================

import React, { useEffect, useMemo, useState } from 'react';

// 상단 공통 UI
import StageTabs from '@/features/admin/components/StageTabs';
import LocationChips from '@/features/admin/components/LocationChips';

// 알럿
import { alertSuccess, alertError, alertInfo, confirmDialog } from '@/ui/alert';

// API
import { listSemesters as listSemestersApi } from '@/api/academySemesterApi';
import {
    previewClassOps,
    snapshotAndCloseClasses,
    restoreClassesFromSemester,
} from '@/api/academyClassApi';

// 스타일
import '@/styles/admin.css';
import '@/styles/admin-academy.css';
import '@/styles/admin-class.css';
import '@/styles/admin-system.css';

const fmt = (n) => (Number.isFinite(Number(n)) ? Number(n).toLocaleString() : '-');
const defaultTargets = { class: true, subject: true, timeslot: true };

export default function ClassOpsPage() {
    const [stage, setStage] = useState('');
    const [work, setWork] = useState('');
    const [semesters, setSemesters] = useState([]);
    const [semesterId, setSemesterId] = useState('');

    const [preview, setPreview] = useState(null);
    const [loadingPreview, setLoadingPreview] = useState(false);
    const [note, setNote] = useState('');
    const [runningClose, setRunningClose] = useState(false);
    const [runningRestore, setRunningRestore] = useState(false);
    const [targets, setTargets] = useState(defaultTargets);

    // stage/work/semesterId 가 모두 선택되어야 실행 가능
    const ready = useMemo(() => Boolean(stage && work && semesterId), [stage, work, semesterId]);

    // 학부 변경 시 학기 목록 재조회
    useEffect(() => {
        (async () => {
            setSemesters([]);
            setSemesterId('');
            setPreview(null);
            if (!stage) return;
            try {
                // ✅ 활성(Y) 학기만 — 두 번째 인자는 문자열('ACTIVE' | 'INACTIVE' | 'ALL')
                //    * 기본값이 이미 'ACTIVE' 이므로 사실상 listSemestersApi(stage)만 호출해도 OK.
                //    * 더 명시적으로 하고 싶으면 아래 라인을 유지하세요.
                // const list = await listSemestersApi(stage, 'ACTIVE');
                const list = await listSemestersApi(stage); // 기본값 'ACTIVE'

                // 초등(E)에서는 시험대비(EXAM_PREP) 제외(서버/DDL 정책과 일관)
                const filtered =
                    String(stage).toUpperCase() === 'E'
                        ? (list || []).filter((s) => s.semesterType !== 'EXAM_PREP')
                        : list || [];
                setSemesters(filtered);
            } catch (e) {
                console.error('[ClassOpsPage] listSemesters fail:', e);
                alertError('로드 실패', '학기 목록을 불러오지 못했습니다.');
            }
        })();
    }, [stage]);

    // 지점/학기 변경 시 미리보기 초기화
    useEffect(() => {
        setPreview(null);
    }, [work]);
    useEffect(() => {
        setPreview(null);
    }, [semesterId]);

    // 미리보기
    const doPreview = async () => {
        if (!ready) return alertInfo('확인', '학부/지점/학기를 먼저 선택하세요.');
        try {
            setLoadingPreview(true);
            // ✅ GET & params 로 호출 (academyClassApi.js에서 경로/메서드 일치)
            const data = await previewClassOps(work, stage, Number(semesterId));
            setPreview(data || {});
        } catch (e) {
            console.error('[ClassOpsPage] preview fail:', e);
            const msg = e?.response?.data?.message || e?.message || '미리보기 중 오류가 발생했습니다.';
            await alertError('오류', msg);
        } finally {
            setLoadingPreview(false);
        }
    };

    // 학기 마감(스냅샷 + 초기화)
    const onCloseSemester = async () => {
        if (!ready) return alertInfo('확인', '학부/지점/학기를 먼저 선택하세요.');
        const ok = await confirmDialog(
            '학기 마감',
            [
                '선택한 학기에 대해 스냅샷을 저장하고 반/과목/시간표를 초기화합니다.',
                '',
                '변경 내용:',
                '• 반: semester_id, homeroom_teacher_id → NULL',
                '• 과목: teacher_id → NULL',
                '• 시간표: 슬롯 전량 삭제',
                '',
                '진행할까요?',
            ].join('\n'),
            { confirmText: '마감 실행', confirmColor: '#ef4444' }
        );
        if (!ok) return;

        try {
            setRunningClose(true);
            await snapshotAndCloseClasses({
                workLocationCode: work,
                schoolStage: stage,
                semesterId: Number(semesterId),
                note: (note || '').trim() || '학기 마감(운영화면)',
            });
            await alertSuccess('완료', '스냅샷 저장 및 초기화가 완료되었습니다.');
            await doPreview();
        } catch (e) {
            console.error('[ClassOpsPage] snapshotAndClose fail:', e);
            const msg = e?.response?.data?.message || e?.message || '마감 처리 중 오류가 발생했습니다.';
            await alertError('오류', msg);
        } finally {
            setRunningClose(false);
        }
    };

    // 되돌리기
    const onRestore = async () => {
        if (!ready) return alertInfo('확인', '학부/지점/학기를 먼저 선택하세요.');
        if (!targets.class && !targets.subject && !targets.timeslot) {
            return alertInfo('확인', '되돌릴 항목을 하나 이상 선택하세요.');
        }

        const ok = await confirmDialog(
            '되돌리기',
            [
                '선택한 학기의 "마지막 스냅샷" 기준으로 데이터를 복원합니다.',
                '',
                `반/담임: ${targets.class ? '복원' : '변경 없음'}`,
                `과목 담당: ${targets.subject ? '복원' : '변경 없음'}`,
                `시간표: ${targets.timeslot ? '복원' : '변경 없음'}`,
                '',
                '진행할까요?',
            ].join('\n'),
            { confirmText: '되돌리기 실행', confirmColor: '#4f46e5' }
        );
        if (!ok) return;

        try {
            setRunningRestore(true);
            // academyClassApi.js: 프런트 targets {class,subject,timeslot} → 서버 {clazz,subject,timeslot} 변환 처리
            await restoreClassesFromSemester({
                workLocationCode: work,
                schoolStage: stage,
                semesterId: Number(semesterId),
                targets: { ...targets },
                note: (note || '').trim() || '스냅샷 복원(운영화면)',
            });
            await alertSuccess('완료', '선택된 항목이 스냅샷에서 복원되었습니다.');
            await doPreview();
        } catch (e) {
            console.error('[ClassOpsPage] restore fail:', e);
            const msg = e?.response?.data?.message || e?.message || '되돌리기 처리 중 오류가 발생했습니다.';
            await alertError('오류', msg);
        } finally {
            setRunningRestore(false);
        }
    };

    return (
        <div className="aa-page academy-page">
            <div className="aa-container">
                <div className="aa-toolbar aa-topbar">
                    <h1 className="aa-title">반 운영 작업</h1>
                    <StageTabs value={stage} onChange={setStage} />
                    <LocationChips value={work} onChange={setWork} />
                    <div className="aa-row" style={{ marginLeft: 'auto', gap: '.5rem' }}>
                        <input
                            className="aa-input"
                            style={{ width: 260 }}
                            placeholder="작업 메모(스냅샷 event_note)"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            title="스냅샷 event_note로 저장됩니다."
                        />
                    </div>
                </div>

                <div className="aa-split">
                    {/* 좌측: 대상 선택 */}
                    <section className="aa-card aa-sticky-lg" aria-label="대상 선택">
                        <h2 className="aa-title--sm">대상 선택</h2>

                        <div className="aa-field">
                            <label className="aa-label aa-label-lg">학기</label>
                            <select
                                className="aa-select aa-select-lg"
                                value={semesterId}
                                onChange={(e) => setSemesterId(e.target.value)}
                            >
                                <option value="">(선택)</option>
                                {semesters.map((s) => (
                                    <option key={s.id} value={s.id}>
                                        {s.name} {s.semesterType === 'EXAM_PREP' ? '(시험대비)' : '(정규)'}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="aa-row" style={{ marginTop: 8 }}>
                            <button
                                className="aa-btn aa-btn-outline"
                                onClick={doPreview}
                                disabled={!ready || loadingPreview}
                            >
                                {loadingPreview ? '미리보기…' : '미리보기'}
                            </button>
                        </div>

                        <div style={{ marginTop: 12 }}>
                            <h3 className="aa-title--xs">영향 범위</h3>
                            {preview ? (
                                <div className="aa-table-wrap">
                                    <table className="aa-table">
                                        <thead>
                                        <tr>
                                            <th>항목</th>
                                            <th className="text-right">건수</th>
                                        </tr>
                                        </thead>
                                        <tbody>
                                        <tr>
                                            <td>반 (class_master)</td>
                                            <td className="text-right">{fmt(preview.classCount)}</td>
                                        </tr>
                                        <tr>
                                            <td>과목 (class_subject)</td>
                                            <td className="text-right">{fmt(preview.subjectCount)}</td>
                                        </tr>
                                        <tr>
                                            <td>시간표 슬롯 (class_timeslot)</td>
                                            <td className="text-right">{fmt(preview.slotCount)}</td>
                                        </tr>
                                        </tbody>
                                        {preview?.lastSnapshotAt && (
                                            <tfoot>
                                            <tr>
                                                <td colSpan={2} className="aa-subtle">
                                                    마지막 스냅샷: {preview.lastSnapshotAt}
                                                </td>
                                            </tr>
                                            </tfoot>
                                        )}
                                    </table>
                                </div>
                            ) : (
                                <div className="aa-subtle">
                                    학부/지점/학기를 선택한 뒤 <b>미리보기</b>를 눌러 범위를 확인하세요.
                                </div>
                            )}
                        </div>
                    </section>

                    {/* 우측: 실행 */}
                    <section className="aa-card" aria-label="실행">
                        <h2 className="aa-title--sm">작업 실행</h2>

                        <div className="aa-banner aa-banner--warn" style={{ marginBottom: 10 }}>
                            <b>학기 마감</b>은 스냅샷 저장 후, 반/과목/시간표를 초기화합니다.
                            초기화 후에도 히스토리에 남아있어 되돌릴 수 있습니다.
                        </div>

                        <div className="aa-row" style={{ gap: '.5rem', flexWrap: 'wrap' }}>
                            <button
                                className="aa-btn aa-btn-danger"
                                onClick={onCloseSemester}
                                disabled={!ready || runningClose}
                            >
                                {runningClose ? '학기 마감 중…' : '학기 마감(스냅샷+초기화)'}
                            </button>
                        </div>

                        <hr className="aa-divider" style={{ margin: '16px 0' }} />

                        <h3 className="aa-title--xs">되돌리기(선택 항목)</h3>
                        <div className="aa-subtle" style={{ marginBottom: 6 }}>
                            선택한 학기의 <b>마지막 스냅샷</b> 기준으로 되돌립니다.
                        </div>

                        <div className="aa-grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
                            <label className="aa-check">
                                <input
                                    type="checkbox"
                                    checked={targets.class}
                                    onChange={(e) => setTargets((v) => ({ ...v, class: e.target.checked }))}
                                />
                                <span>반/담임</span>
                            </label>

                            <label className="aa-check">
                                <input
                                    type="checkbox"
                                    checked={targets.subject}
                                    onChange={(e) => setTargets((v) => ({ ...v, subject: e.target.checked }))}
                                />
                                <span>과목 담당</span>
                            </label>

                            <label className="aa-check">
                                <input
                                    type="checkbox"
                                    checked={targets.timeslot}
                                    onChange={(e) => setTargets((v) => ({ ...v, timeslot: e.target.checked }))}
                                />
                                <span>시간표 슬롯</span>
                            </label>
                        </div>

                        <div className="aa-row" style={{ marginTop: 10 }}>
                            <button
                                className="aa-btn aa-btn-primary"
                                onClick={onRestore}
                                disabled={!ready || runningRestore}
                            >
                                {runningRestore ? '되돌리는 중…' : '되돌리기 실행'}
                            </button>
                            <button
                                className="aa-btn aa-btn-ghost"
                                style={{ marginLeft: 6 }}
                                onClick={() => setTargets(defaultTargets)}
                            >
                                기본 선택(모두 복원)
                            </button>
                        </div>

                        <div className="aa-subtle" style={{ marginTop: 12 }}>
                            ※ 되돌리기는 선택한 학기의 스냅샷을 기준으로 합니다. 작업 메모는 히스토리의 <code>event_note</code>로
                            기록됩니다.
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
}