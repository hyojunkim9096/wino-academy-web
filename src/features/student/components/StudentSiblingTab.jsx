// src/features/student/components/StudentSiblingTab.jsx
// ============================================================================
// StudentSiblingTab — 형제/자매 탭
// ----------------------------------------------------------------------------
// 하는 일
//  - 형제 목록 조회
//  - 형제 연결/해제
//  - 가족 동기화(Family Sync) 버튼: 형제 그룹 전체에 보호자 공유 + 형제 완전 연결
//
// ✅ UI/UX 개선(이번 변경)
//  - StudentSearchModal(형제 연결 팝업)에 공통코드(stage/loc/status) 전달
//    → 팝업에서 코드가 아니라 '이름'으로 보여주기 위해서.
//  - (동명이인 구분) 팝업에서 생년월일 표시 가능하도록 StudentSummary.birthdate 활용
// ============================================================================

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { listStudentSiblings, linkSibling, unlinkSibling } from '@/features/student/api/studentSiblingApi.js';
import { syncStudentFamily } from '@/features/student/api/studentFamilyApi.js';
import { alertError, alertSuccess, confirmDialog } from '@/common/ui/alert.js';
import StudentSearchModal from '@/features/student/components/StudentSearchModal.jsx';

// 알림 헬퍼(알림 자체 실패로 화면이 죽지 않게 방어)
const safeOk    = (t, m) => Promise.resolve(alertSuccess(t, m)).catch(() => {});
const safeError = (t, m) => Promise.resolve(alertError(t, m)).catch(() => {});

export default function StudentSiblingTab({
                                              studentId,
                                              onChanged,

                                              // ✅ 공통코드는 부모로부터 전달받음(코드→라벨 변환용)
                                              stageCodes = [],
                                              locCodes = [],
                                              statusCodes = [],
                                          }) {
    const [siblings, setSiblings] = useState([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    // ✅ 자체 검색 모달 상태
    const [searchOpen, setSearchOpen] = useState(false);

    // ----------------------------------------------------------------------------
    // 공통코드 매핑(Code -> Name) (현재 탭의 표에서도 사용)
    // ----------------------------------------------------------------------------
    const stgMap = useMemo(() => new Map(stageCodes.map(c => [c.code, c.name])), [stageCodes]);
    const locMap = useMemo(() => new Map(locCodes.map(c => [c.code, c.name])), [locCodes]);
    const statusMap = useMemo(() => new Map(statusCodes.map(c => [c.code, c.name])), [statusCodes]);

    const stgName = (c) => stgMap.get(c) || c;
    const locName = (c) => locMap.get(c) || c;
    const statusName = (c) => statusMap.get(c) || c;

    // ----------------------------------------------------------------------------
    // 목록 로드
    // ----------------------------------------------------------------------------
    const load = useCallback(async () => {
        if (!studentId) {
            setSiblings([]);
            return;
        }
        setLoading(true);
        try {
            const list = await listStudentSiblings(studentId);
            setSiblings(Array.isArray(list) ? list : []);
        } catch {
            setSiblings([]);
        } finally {
            setLoading(false);
        }
    }, [studentId]);

    useEffect(() => { load(); }, [load]);

    // ----------------------------------------------------------------------------
    // ✅ 형제 연결(추가)
    // - StudentSearchModal에서 학생 선택 시 호출
    // ----------------------------------------------------------------------------
    const handleAdd = async (targetStudent) => {
        if (!targetStudent || !targetStudent.id) return;
        if (!studentId) return;

        setSaving(true);
        try {
            // ✅ linkSibling(studentId1, studentId2, relationNote)
            await linkSibling(studentId, targetStudent.id, '형제/자매');

            await safeOk('연결 성공', `${targetStudent.name} 학생과 연결되었습니다.`);
            setSearchOpen(false);
            await load();         // ✅ 목록 즉시 갱신
            onChanged?.();        // 상위 재조회 트리거
        } catch (e) {
            safeError('실패', e?.response?.data?.message || '연결에 실패했습니다.');
        } finally {
            setSaving(false);
        }
    };

    // ----------------------------------------------------------------------------
    // 형제 연결 해제
    // ----------------------------------------------------------------------------
    const onUnlinkSibling = async (link) => {
        if (!link?.id || saving) return;

        const ok = await confirmDialog(
            '연결 해제',
            `'${link.studentName}' 학생과의 형제 연결을 해제할까요?`,
            { confirmText: '해제', cancelText: '취소', confirmColor: '#ef4444' }
        );
        if (!ok) return;

        setSaving(true);
        try {
            await unlinkSibling(link.id);
            await safeOk('성공', '연결이 해제되었습니다.');
            await load();
            onChanged?.();
        } catch (e) {
            safeError('오류', e?.response?.data?.message || '연결 해제 실패');
        } finally {
            setSaving(false);
        }
    };

    // ----------------------------------------------------------------------------
    // ✅ 가족 동기화(Family Sync)
    // ----------------------------------------------------------------------------
    const handleSync = async () => {
        if (siblings.length === 0) return alertError('불가', '연결된 형제가 없습니다.');

        const ok = await confirmDialog(
            '가족 정보 동기화',
            '형제끼리 보호자 정보를 서로 공유하여 똑같이 맞춥니다.\n(누락된 보호자가 있으면 자동으로 추가됩니다)\n진행하시겠습니까?',
            { confirmText: '동기화 진행' }
        );
        if (!ok) return;

        setSaving(true);
        try {
            await syncStudentFamily(studentId);

            await safeOk('동기화 완료', '모든 형제의 보호자 정보가 통합되었습니다.');

            // ✅ 동기화 과정에서 형제 링크도 보강될 수 있어 즉시 재조회
            await load();
            onChanged?.();
        } catch (e) {
            safeError('동기화 실패', e?.response?.data?.message || e?.message || '동기화 실패');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-3">
            {/* 상단 액션 바 */}
            <div className="flex justify-between items-center bg-slate-800/50 p-3 rounded border border-slate-700">
                <div className="text-sm text-slate-300">
                    현재 연결된 형제: <b className="text-white">{siblings.length}명</b>
                </div>

                <div className="flex gap-2">
                    <button
                        className="aa-btn aa-btn-sm aa-btn-outline"
                        onClick={handleSync}
                        disabled={saving || siblings.length === 0}
                        title="형제들의 보호자 정보를 합쳐서 모두에게 적용합니다."
                    >
                        🔄 가족 동기화
                    </button>

                    <button
                        className="aa-btn aa-btn-sm aa-btn-primary"
                        onClick={() => setSearchOpen(true)}
                        disabled={saving}
                    >
                        + 형제 연결
                    </button>
                </div>
            </div>

            {/* 형제 목록 테이블 */}
            <div className="aa-table-wrap border border-slate-700 rounded-lg overflow-hidden">
                <table className="aa-table w-full text-left">
                    <thead className="bg-slate-800 text-xs uppercase text-slate-400">
                    <tr>
                        <th className="px-4 py-3">이름</th>
                        <th className="px-4 py-3">학부</th>
                        <th className="px-4 py-3">소속관</th>
                        <th className="px-4 py-3">상태</th>
                        <th className="px-4 py-3">관계 메모</th>
                        <th className="px-4 py-3 text-right" style={{ width: 100 }}>관리</th>
                    </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-700">
                    {loading && (
                        <tr>
                            <td colSpan={6} className="text-center py-8 text-slate-400">
                                불러오는 중…
                            </td>
                        </tr>
                    )}

                    {!loading && siblings.length === 0 && (
                        <tr>
                            <td colSpan={6} className="text-center py-8 text-slate-500">
                                연결된 형제/자매가 없습니다.
                            </td>
                        </tr>
                    )}

                    {siblings.map(s => (
                        <tr key={s.id} className="hover:bg-slate-800/50 transition-colors">
                            <td className="px-4 py-3 text-slate-200">
                                <span className="font-bold">{s.studentName || '-'}</span>
                                <span className="text-xs text-slate-500 font-normal ml-1">(ID: {s.studentId})</span>
                            </td>

                            <td className="px-4 py-3 text-slate-300">{stgName(s.schoolStage)}</td>
                            <td className="px-4 py-3 text-slate-300">{locName(s.workLocationCode)}</td>

                            <td className="px-4 py-3">
                  <span
                      className={`px-2 py-0.5 rounded text-xs ${
                          s.status === 'ACTIVE'
                              ? 'bg-green-900/50 text-green-400'
                              : 'bg-slate-700 text-slate-300'
                      }`}
                  >
                    {statusName(s.status)}
                  </span>
                            </td>

                            <td className="px-4 py-3 text-slate-400">{s.relationNote || '-'}</td>

                            <td className="px-4 py-3 text-right">
                                <button
                                    className="aa-btn aa-btn-danger aa-btn-xs"
                                    onClick={() => onUnlinkSibling(s)}
                                    disabled={saving}
                                >
                                    해제
                                </button>
                            </td>
                        </tr>
                    ))}
                    </tbody>
                </table>
            </div>

            {/* ✅ 학생 검색 모달 */}
            {searchOpen && (
                <StudentSearchModal
                    onClose={() => setSearchOpen(false)}
                    onSelect={handleAdd}
                    excludeId={studentId}

                    // ✅ [중요] 팝업에서 코드가 아니라 이름으로 표시하도록 공통코드 전달
                    stageCodes={stageCodes}
                    locCodes={locCodes}
                    statusCodes={statusCodes}
                />
            )}
        </div>
    );
}
