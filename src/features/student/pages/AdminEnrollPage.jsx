// src/features/student/pages/AdminEnrollPage.jsx
// ============================================================================
// 반 배정 관리(간이 콘솔) — 2025-10 스키마 대응 + 타임슬롯 선택 모달 연동 (수정본)
// ----------------------------------------------------------------------------
// ✅ 변경/보강
//  - classStatusName 있으면 그걸 표시(없으면 코드→라벨 폴백)
//  - ✅ CROSS로 생성 시 타임슬롯 픽커 모달에서 슬롯 선택 → 치환 저장
//  - ✅ 목록의 '타임슬롯' 버튼은 CROSS일 때만 노출
//  - 요일은 타임슬롯 매핑으로 관리 → 표시는 attendDaysLabel 우선, 없으면 마스크→라벨 변환
//  - days 집계는 DB 트리거로 자동 반영, 저장 후 reload
// ============================================================================

import React, { useCallback, useEffect, useState } from 'react';
import Swal from 'sweetalert2';
import {
    listStudentEnrollments,
    addEnrollmentToStudent,
    updateStudentEnrollment,
    removeStudentEnrollment,
    replaceEnrollmentTimeslots,               // ⬅️ 저장용
} from '@/features/student/api/studentEnrollmentApi.js';
import TimeslotPickerModal from '@/features/student/components/enrollment/TimeslotPickerModal.jsx';
import { alertError, alertInfo, alertSuccess } from '@/common/ui/alert.js';

import '@/features/system/styles/admin-system.css';
import '@/features/admin/styles/admin-shared.css';
import '@/features/student/styles/admin-enroll.css';

// ---- Alert 안전 래퍼 --------------------------------------------------------
const safeInfo = (t, m) => Promise.resolve(alertInfo(t, m)).catch(() => {});
const safeOk = (t, m) => Promise.resolve(alertSuccess(t, m)).catch(() => {});
const safeError = (t, m) => Promise.resolve(alertError(t, m)).catch(() => {});

// ---- 유틸 ------------------------------------------------------------------
// 1) HTML escape (SweetAlert html 옵션에 변수 삽입 시 안전)
function esc(v) {
    const s = String(v ?? '');
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// 2) 로컬 타임존 기준 YYYY-MM-DD
function toLocalDateStr(d = new Date()) {
    const dt = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return dt.toISOString().slice(0, 10);
}

// 3) 빈 문자열 → undefined
function pruneEmpty(obj = {}) {
    const out = { ...obj };
    Object.keys(out).forEach((k) => {
        if (out[k] === '') out[k] = undefined;
    });
    return out;
}

// ✅ 라벨 폴백
const CLASS_STATUS_LABELS = { MAIN: '메인', CROSS: '교차' };

// ✅ 마스크 → '월,수,금' 폴백 라벨
function maskToDayLabel(mask) {
    if (!Number.isInteger(mask) || mask === 0) return '';
    const names = ['월','화','수','목','금','토','일'];
    const out = [];
    for (let i = 0; i < 7; i++) {
        if ((mask & (1 << i)) !== 0) out.push(names[i]);
    }
    return out.join(',');
}

const themeColor = '#4f46e5';

export default function AdminEnrollPage() {
    const [studentId, setStudentId] = useState('');
    const [loading, setLoading] = useState(false);
    const [rows, setRows] = useState([]);

    // 모달 상태(타임슬롯 선택)
    const [tsModal, setTsModal] = useState(null);
    // tsModal 예: { enrollId, classId, locCode, stage, gradeCode }

    // 목록 로드
    const load = useCallback(async () => {
        if (!Number(studentId)) {
            return safeInfo('안내', '학생 ID를 입력하세요.');
        }
        setLoading(true);
        try {
            const res = await listStudentEnrollments(Number(studentId), { size: 100, page: 0 });
            const list = Array.isArray(res?.content) ? res.content : Array.isArray(res) ? res : [];
            list.sort((a, b) => String(b.enrolledAt || '').localeCompare(String(a.enrolledAt || '')));
            setRows(list);
        } catch (e) {
            setRows([]);
            safeError('오류', e?.response?.data?.message || '조회 실패');
        } finally {
            setLoading(false);
        }
    }, [studentId]);

    // studentId 변경 시 자동 조회(있을 때만)
    useEffect(() => {
        if (studentId) load();
    }, [studentId, load]);

    // 배정 추가
    const onAdd = async () => {
        const r = await Swal.fire({
            title: '배정 추가',
            html: `
        <div class="space-y-3 text-left">
          <label class="block">
            <div class="text-sm mb-1">반 ID</div>
            <input id="sw-classId" class="swal2-input" type="number" placeholder="예: 101" style="width:100%" />
          </label>
          <label class="block">
            <div class="text-sm mb-1">시작일</div>
            <input id="sw-enrolledAt" class="swal2-input" type="date" style="width:100%" value="${esc(
                toLocalDateStr(),
            )}" />
          </label>
          <label class="block">
            <div class="text-sm mb-1">CLASS STATUS</div>
            <!-- 코드 대신 라벨을 보여 주되, 값은 코드로 전송 -->
            <select id="sw-classStatus" class="swal2-select" style="width:100%">
              <option value="MAIN">메인 (MAIN)</option>
              <option value="CROSS">교차 (CROSS)</option>
            </select>
            <p class="text-xs mt-1" style="opacity:.8">
              ※ CROSS는 <b>타임슬롯을 선택</b>해야 요일 집계가 됩니다.
            </p>
          </label>
          <label class="block">
            <div class="text-sm mb-1">메모</div>
            <textarea id="sw-memo" class="swal2-textarea" rows="3" style="width:100%"></textarea>
          </label>
        </div>
      `,
            showCancelButton: true,
            confirmButtonText: '등록',
            cancelButtonText: '취소',
            reverseButtons: true,
            confirmButtonColor: themeColor,
            focusCancel: true,
            preConfirm: () => {
                const classId = Number(document.getElementById('sw-classId')?.value || 0);
                const enrolledAt = document.getElementById('sw-enrolledAt')?.value || '';
                const classStatusCode = document.getElementById('sw-classStatus')?.value || 'MAIN';
                const memo = document.getElementById('sw-memo')?.value || '';
                return { classId, enrolledAt, classStatusCode, memo };
            },
        });
        if (!r.isConfirmed) return;

        if (!Number(studentId)) return safeInfo('안내', '학생 ID를 먼저 입력하세요.');

        const { classId, enrolledAt, classStatusCode, memo } = r.value;
        if (!classId) return safeInfo('안내', '반 ID를 입력하세요.');
        if (!enrolledAt) return safeInfo('안내', '시작일을 입력하세요.');

        try {
            // 1) 배정 생성
            const enrollId = await addEnrollmentToStudent(
                Number(studentId),
                pruneEmpty({ classId, enrolledAt, classStatusCode, memo })
            );

            // 2) ✅ CROSS면 타임슬롯 선택 모달을 띄워서 저장
            if (String(classStatusCode).toUpperCase() === 'CROSS') {
                setTsModal({
                    enrollId,
                    classId,
                    // loc/stage/grade는 필요시 상위에서 내려받아 세팅(간이 콘솔에선 생략 가능)
                    locCode: undefined,
                    stage: undefined,
                    gradeCode: undefined,
                });
            } else {
                await safeOk('성공', '배정 추가');
                await load();
            }
        } catch (e) {
            safeError('오류', e?.response?.data?.message || '추가 실패');
        }
    };

    // 배정 수정
    const onEdit = async (row) => {
        const html = `
        <div class="space-y-3 text-left">
          <label class="block">
            <div class="text-sm mb-1">상태</div>
            <input id="sw-status" class="swal2-input" style="width:100%" value="${esc(row.status || 'ACTIVE')}" />
          </label>
          <label class="block">
            <div class="text-sm mb-1">CLASS STATUS</div>
            <!-- 코드 대신 라벨을 보여 주되, 값은 코드 -->
            <select id="sw-classStatus" class="swal2-select" style="width:100%">
              <option value="MAIN" ${row.classStatusCode === 'MAIN' ? 'selected' : ''}>메인 (MAIN)</option>
              <option value="CROSS" ${row.classStatusCode === 'CROSS' ? 'selected' : ''}>교차 (CROSS)</option>
            </select>
            <p class="text-xs mt-1" style="opacity:.8">
              ※ CROSS는 타임슬롯을 연결해야 요일 집계가 됩니다.
            </p>
          </label>
          <label class="block">
            <div class="text-sm mb-1">종료일</div>
            <input id="sw-leftAt" class="swal2-input" type="date" style="width:100%" value="${esc(row.leftAt || '')}" />
          </label>
          <label class="block">
            <div class="text-sm mb-1">메모</div>
            <textarea id="sw-memo" class="swal2-textarea" rows="3" style="width:100%">${esc(row.memo || '')}</textarea>
          </label>
        </div>
      `;

        const r = await Swal.fire({
            title: `배정 수정 #${row.id}`,
            html,
            showCancelButton: true,
            confirmButtonText: '저장',
            cancelButtonText: '취소',
            reverseButtons: true,
            confirmButtonColor: themeColor,
            focusCancel: true,
            preConfirm: () => {
                const status = document.getElementById('sw-status')?.value || row.status;
                const classStatusCode =
                    document.getElementById('sw-classStatus')?.value || row.classStatusCode || 'MAIN';
                const leftAt = document.getElementById('sw-leftAt')?.value || '';
                const memo = document.getElementById('sw-memo')?.value || '';
                return { status, classStatusCode, leftAt, memo };
            },
        });
        if (!r.isConfirmed) return;

        // 날짜 유효성(선택): 시작일 ≤ 종료일
        const leftAt = r.value.leftAt || undefined;
        if (leftAt && row.enrolledAt) {
            const ok = String(leftAt) >= String(row.enrolledAt);
            if (!ok) return safeInfo('안내', '종료일은 시작일보다 빠를 수 없습니다.');
        }

        try {
            await updateStudentEnrollment(Number(studentId), row.id, pruneEmpty({
                status: r.value.status || undefined,
                classStatusCode: r.value.classStatusCode || undefined,
                leftAt,
                memo: r.value.memo || undefined,
            }));
            await safeOk('성공', '수정 완료');
            await load();
        } catch (e) {
            safeError('오류', e?.response?.data?.message || '수정 실패');
        }
    };

    // 타임슬롯 버튼(행 단위): 기존 배정의 슬롯 치환 → CROSS일 때만 노출(렌더에서 조건 처리)
    const onEditTimeslots = (row) => {
        setTsModal({
            enrollId: row.id,
            classId: row.classId,
            locCode: undefined,
            stage: undefined,
            gradeCode: undefined,
        });
    };

    // 배정 삭제
    const onDel = async (row) => {
        const ok = await Swal.fire({
            title: '확인',
            text: '정말 삭제할까요?',
            showCancelButton: true,
            confirmButtonText: '삭제',
            cancelButtonText: '취소',
            reverseButtons: true,
            confirmButtonColor: '#ef4444',
        }).then((r) => r.isConfirmed);
        if (!ok) return;
        try {
            await removeStudentEnrollment(Number(studentId), row.id);
            await safeOk('성공', '삭제 완료');
            await load();
        } catch (e) {
            safeError('오류', e?.response?.data?.message || '삭제 실패');
        }
    };

    return (
        <section className="aa-page academy-page enroll-page">
            <div className="aa-container">
                <div className="aa-toolbar">
                    <h1 className="aa-title">반 배정 관리</h1>
                    <div className="aa-toolbar-right">
                        <input
                            className="aa-input"
                            style={{ width: 140 }}
                            placeholder="학생 ID"
                            value={studentId}
                            onChange={(e) => setStudentId(e.target.value.replace(/[^0-9]/g, ''))}
                            onKeyDown={(e) => { if (e.key === 'Enter') load(); }}
                        />
                        <button className="aa-btn" onClick={load}>
                            조회
                        </button>
                        <button
                            className="aa-btn aa-btn-primary"
                            onClick={onAdd}
                            disabled={!Number(studentId)}
                            title={!Number(studentId) ? '학생 ID를 먼저 입력하세요.' : undefined}
                        >
                            배정 추가
                        </button>
                    </div>
                </div>

                <div className="aa-card">
                    {loading ? (
                        <div>불러오는 중…</div>
                    ) : (
                        <div className="aa-table-wrap">
                            <table className="aa-table aa-table--lg">
                                <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>학생</th>
                                    <th>반</th>
                                    <th>시작</th>
                                    <th>종료</th>
                                    <th>상태</th>
                                    {/* ✅ classStatusName 우선 표시 */}
                                    <th>CLASS</th>
                                    <th>요일(집계)</th>
                                    <th>메모</th>
                                    <th className="aa-actions-cell">액션</th>
                                </tr>
                                </thead>
                                <tbody>
                                {rows.length === 0 && (
                                    <tr>
                                        <td colSpan={10}>데이터 없음</td>
                                    </tr>
                                )}
                                {rows.map((r) => {
                                    const classLabel =
                                        r.classStatusName
                                        || CLASS_STATUS_LABELS[r.classStatusCode]
                                        || r.classStatusCode
                                        || 'MAIN';

                                    const daysLabel =
                                        r.attendDaysLabel
                                        || maskToDayLabel(r.attendDaysMask)
                                        || '-';

                                    const isCross = String(r.classStatusCode).toUpperCase() === 'CROSS';

                                    return (
                                        <tr key={r.id}>
                                            <td className="aa-cell-mono">{r.id}</td>
                                            <td>{r.studentName || r.studentId}</td>
                                            <td>{r.className || r.classId}</td>
                                            <td>{r.enrolledAt}</td>
                                            <td>{r.leftAt || '-'}</td>
                                            <td>{r.status}</td>
                                            <td>{classLabel}</td>
                                            {/* 서버 요일 집계 라벨 표시(없으면 마스크 폴백) */}
                                            <td>{daysLabel}</td>
                                            <td className="aa-ellipsis">{r.memo || '-'}</td>
                                            <td className="aa-actions">
                                                <button className="aa-btn aa-btn-sm" onClick={() => onEdit(r)}>
                                                    수정
                                                </button>

                                                {/* ✅ CROSS일 때만 노출 */}
                                                {isCross && (
                                                    <button className="aa-btn aa-btn-sm" onClick={() => onEditTimeslots(r)}>
                                                        타임슬롯
                                                    </button>
                                                )}

                                                <button className="aa-btn aa-btn-danger aa-btn-sm" onClick={() => onDel(r)}>
                                                    삭제
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {/* ⬇️ 타임슬롯 선택 모달 */}
            {tsModal && (
                <TimeslotPickerModal
                    title="타임슬롯 선택"
                    studentId={Number(studentId)}
                    classId={tsModal.classId}
                    locCode={tsModal.locCode}
                    stage={tsModal.stage}
                    gradeCode={tsModal.gradeCode}
                    enrollmentId={tsModal.enrollId}
                    onClose={()=> setTsModal(null)}
                    onSubmit={async (ids)=>{
                        try{
                            await replaceEnrollmentTimeslots(tsModal.enrollId, ids);
                            await safeOk('성공','타임슬롯이 저장되었습니다.');
                            setTsModal(null);
                            await load();  // ✅ 요일 집계가 갱신되어 보임
                        }catch(e){
                            await safeError('오류', e?.response?.data?.message || '타임슬롯 저장 실패');
                        }
                    }}
                />
            )}
        </section>
    );
}