// src/features/member/components/GuardianDetailPanel.jsx
// ============================================================================
// GuardianDetailPanel
// - 보호자 상세 보기 / 편집 / 삭제
// - 연결된 학생 목록 표시(listGuardianStudents → StudentLinkSummary DTO)
// - 형제/가족 동기화 버튼 (syncGuardianFamily 호출)
// ----------------------------------------------------------------------------
// Props
//   - guardianId   : 선택된 보호자 ID (null 이면 안내 문구만 표시)
//   - onListReload : 상위 목록 재조회 콜백 (저장/삭제/동기화 후 호출)
// ============================================================================

import React, {
    useEffect,
    useState,
    useCallback
} from 'react';

import {
    getGuardian,
    updateGuardian,
    deleteGuardian,
    listGuardianStudents,
    syncGuardianFamily
} from '@/features/member/api/guardianApi.js';

import {
    alertInfo,
    alertError,
    alertSuccess,
    askConfirm
} from '@/common/ui/alert.js';

import '@/features/system/styles/admin-system.css';
import '@/features/admin/styles/admin-shared.css';
import '@/features/member/styles/admin-guardian.css';

// -----------------------------------------------------------------------------
// SweetAlert 래퍼를 한 번 더 감싸서,
// 모달이 실패하더라도 화면 전체가 죽지 않도록 예외 방지
// -----------------------------------------------------------------------------
const safeInfo    = (t, m) => Promise.resolve(alertInfo(t, m)).catch(() => {});
const safeSuccess = (t, m) => Promise.resolve(alertSuccess(t, m)).catch(() => {});
const safeError   = (t, m) => Promise.resolve(alertError(t, m)).catch(() => {});

export default function GuardianDetailPanel({ guardianId, onListReload }) {
    // ===========================
    // 상태 정의
    // ===========================
    const [loading, setLoading] = useState(false);     // 상세 조회 로딩
    const [saving, setSaving] = useState(false);       // 저장/삭제/동기화 등 처리 중
    const [editMode, setEditMode] = useState(false);   // 편집 모드 여부

    // 서버에서 내려온 원본 guardian 데이터
    const [model, setModel] = useState(null);

    /**
     * 연결된 학생 목록
     * - StudentLinkSummary DTO 리스트
     *   (StudentGuardianLinkRepository.findStudentSummariesByGuardian)
     *
     *   필드 예:
     *   - id                : 링크 PK
     *   - studentId         : 학생 PK
     *   - studentName       : 학생 이름
     *   - schoolStage       : 학부 코드
     *   - schoolStageName   : 학부 이름(공통코드)
     *   - workLocationCode  : 지점 코드
     *   - workLocationName  : 지점 이름(공통코드)
     *   - status            : 학생 상태 코드
     *   - statusName        : 학생 상태 이름(공통코드)
     *   - relationCode      : 관계 코드
     *   - relationName      : 관계 이름(공통코드)
     *   - primary, legalGuardian, receiveNotice, receiveBilling
     */
    const [students, setStudents] = useState([]);

    // 편집용 폼 상태 (model 에서 복사)
    const [form, setForm] = useState({
        name: '',
        phone: '',
        email: '',
        loginId: '',
        memo: ''
    });

    // ===========================
    // 상세 + 학생 목록 조회
    // ===========================
    const loadDetail = useCallback(async () => {
        // 선택된 보호자가 없으면 상태 초기화
        if (!guardianId) {
            setModel(null);
            setStudents([]);
            setForm({
                name: '',
                phone: '',
                email: '',
                loginId: '',
                memo: ''
            });
            setEditMode(false);
            return;
        }

        setLoading(true);
        try {
            // guardian 상세 + 연결된 학생 목록 병렬 조회
            const [guardianRes, studentsRes] = await Promise.all([
                getGuardian(guardianId),
                listGuardianStudents(guardianId) // → StudentLinkSummary[]
            ]);

            const guardian = guardianRes || {};
            const stuList = Array.isArray(studentsRes) ? studentsRes : [];

            setModel(guardian);
            setStudents(stuList);

            // 상세 정보를 폼에 반영
            const {
                name = '',
                phone = '',
                email = '',
                loginId = '',
                memo = ''
            } = guardian;

            setForm({
                name,
                phone,
                email,
                loginId,
                memo
            });

            setEditMode(false);
        } catch (e) {
            console.error(e);
            safeError('오류', e?.response?.data?.message || '보호자 상세 조회 실패');
            setModel(null);
            setStudents([]);
        } finally {
            setLoading(false);
        }
    }, [guardianId]);

    // guardianId 변경 시마다 상세 재조회
    useEffect(() => {
        loadDetail();
    }, [loadDetail]);

    // ===========================
    // 폼 필드 변경 핸들러
    // ===========================
    const handleChange = (field) => (e) => {
        const value = e.target.value;
        setForm((prev) => ({
            ...prev,
            [field]: value
        }));
    };

    // 편집 시작
    const handleBeginEdit = () => {
        if (!model) return;
        setForm({
            name: model.name || '',
            phone: model.phone || '',
            email: model.email || '',
            loginId: model.loginId || '',
            memo: model.memo || ''
        });
        setEditMode(true);
    };

    // 편집 취소 (model 기준으로 롤백)
    const handleCancelEdit = () => {
        if (!model) {
            setEditMode(false);
            return;
        }
        setForm({
            name: model.name || '',
            phone: model.phone || '',
            email: model.email || '',
            loginId: model.loginId || '',
            memo: model.memo || ''
        });
        setEditMode(false);
    };

    // ===========================
    // 보호자 정보 저장(수정)
    // ===========================
    const handleSave = useCallback(async () => {
        if (!guardianId || !model) return;

        // 간단한 필수 검증
        if (!form.name.trim()) {
            safeError('검증 오류', '이름은 필수입니다.');
            return;
        }

        setSaving(true);
        try {
            // 서버에 전달할 payload 구성
            const payload = {
                name: form.name.trim(),
                phone: form.phone?.trim() || null,
                email: form.email?.trim() || null,
                memo: form.memo || null
                // ※ loginId 계정 생성/연결은 별도 API로 처리 (/link-account)
            };

            await updateGuardian(guardianId, payload);

            // 다시 상세 재조회해서 model 갱신
            await loadDetail();

            // 상위 목록 재조회 요청
            if (onListReload) {
                await Promise.resolve(onListReload());
            }

            safeSuccess('완료', '보호자 정보가 저장되었습니다.');
        } catch (e) {
            console.error(e);
            safeError('오류', e?.response?.data?.message || '보호자 정보 저장 실패');
        } finally {
            setSaving(false);
        }
    }, [guardianId, model, form, onListReload, loadDetail]);

    // ===========================
    // 보호자 삭제
    // ===========================
    const handleDelete = useCallback(async () => {
        if (!guardianId) return;

        const ok = await askConfirm(
            '삭제 확인',
            '이 보호자를 삭제하시겠습니까?\n연결된 학생/가족 정보가 있다면 백엔드 정책에 따라 제약이 있을 수 있습니다.'
        );
        if (!ok) return;

        setSaving(true);
        try {
            await deleteGuardian(guardianId);

            safeInfo('삭제 완료', '보호자가 삭제되었습니다.');

            // 상위 목록 재조회 → AdminGuardianPage에서 selectedId 재조정
            if (onListReload) {
                await Promise.resolve(onListReload());
            }

            // 현재 패널은 빈 상태로 초기화
            setModel(null);
            setStudents([]);
            setForm({
                name: '',
                phone: '',
                email: '',
                loginId: '',
                memo: ''
            });
            setEditMode(false);
        } catch (e) {
            console.error(e);
            safeError('오류', e?.response?.data?.message || '보호자 삭제 실패');
        } finally {
            setSaving(false);
        }
    }, [guardianId, onListReload]);

    // ===========================
    // 형제/가족 동기화
    // ===========================
    const handleSyncFamily = useCallback(async () => {
        if (!guardianId) return;

        if (!students || students.length === 0) {
            safeError('동기화 불가', '연결된 학생이 없습니다.\n먼저 학생과 보호자를 연결한 뒤 다시 시도해 주세요.');
            return;
        }

        const names = students.map((s) => s.studentName).join(', ');

        const ok = await askConfirm(
            '형제/가족 동기화',
            [
                '현재 이 보호자와 연결된 학생들을 기준으로 형제/가족 관계를 동기화합니다.',
                '',
                `대상 학생: ${names}`,
                '',
                '진행하시겠습니까?'
            ].join('\n')
        );
        if (!ok) return;

        setSaving(true);
        try {
            // 백엔드에 동기화 요청
            await syncGuardianFamily(guardianId);

            // 동기화 이후, 학생 목록 재조회
            await loadDetail();

            // 필요하다면 목록도 다시 불러올 수 있음
            if (onListReload) {
                await Promise.resolve(onListReload());
            }

            safeSuccess('동기화 완료', '형제/가족 정보가 동기화되었습니다.');
        } catch (e) {
            console.error(e);
            safeError('오류', e?.response?.data?.message || '형제/가족 동기화에 실패했습니다.');
        } finally {
            setSaving(false);
        }
    }, [guardianId, students, onListReload, loadDetail]);

    // ===========================
    // 렌더링 분기
    // ===========================
    if (!guardianId) {
        return <div className="p-4 text-slate-400">좌측에서 보호자를 선택하세요.</div>;
    }

    if (loading && !model) {
        return <div className="p-4 text-slate-400">보호자 정보를 불러오는 중입니다…</div>;
    }

    if (!model) {
        return <div className="p-4 text-slate-400">보호자 정보를 찾을 수 없습니다.</div>;
    }

    const studentRows = Array.isArray(students) ? students : [];

    // ===========================
    // 실제 UI
    // ===========================
    return (
        <div className="guardian-detail-panel">
            {/* ---------------------------
                헤더: 기본 타이틀 + 액션 버튼
               --------------------------- */}
            <div className="aa-panel-header flex items-center justify-between mb-4">
                <div>
                    <h2 className="aa-subtitle">{model.name || '(이름 없음)'}</h2>
                    <div className="text-xs text-slate-400 mt-1">
                        {model.phone || '-'}
                        {model.email ? ` · ${model.email}` : ''}
                        {model.loginId ? ` · 로그인ID: ${model.loginId}` : ''}
                    </div>
                </div>
                <div className="flex gap-2">
                    {editMode ? (
                        <>
                            <button
                                type="button"
                                className="aa-btn aa-btn-primary"
                                onClick={handleSave}
                                disabled={saving}
                            >
                                {saving ? '저장 중…' : '저장'}
                            </button>
                            <button
                                type="button"
                                className="aa-btn"
                                onClick={handleCancelEdit}
                                disabled={saving}
                            >
                                취소
                            </button>
                        </>
                    ) : (
                        <button
                            type="button"
                            className="aa-btn aa-btn-primary"
                            onClick={handleBeginEdit}
                            disabled={saving}
                        >
                            편집
                        </button>
                    )}
                    <button
                        type="button"
                        className="aa-btn aa-btn-danger"
                        onClick={handleDelete}
                        disabled={saving}
                    >
                        삭제
                    </button>
                </div>
            </div>

            {/* ---------------------------
                본문: 기본 정보 / 메모 / 학생 목록
               --------------------------- */}
            <div className="aa-panel-body space-y-6">
                {/* 기본 정보 섹션 */}
                <section>
                    <h3 className="aa-section-title mb-3">기본 정보</h3>
                    <div className="aa-form-grid aa-form-grid-2">
                        {/* 이름 */}
                        <div className="aa-form-field">
                            <label className="aa-field-label">이름</label>
                            {editMode ? (
                                <input
                                    className="aa-input"
                                    value={form.name}
                                    onChange={handleChange('name')}
                                />
                            ) : (
                                <div className="aa-field-readonly">
                                    {model.name || <span className="text-slate-500">-</span>}
                                </div>
                            )}
                        </div>

                        {/* 연락처 */}
                        <div className="aa-form-field">
                            <label className="aa-field-label">연락처</label>
                            {editMode ? (
                                <input
                                    className="aa-input"
                                    value={form.phone}
                                    onChange={handleChange('phone')}
                                    placeholder="'-' 없이 숫자만 또는 자유 형식"
                                />
                            ) : (
                                <div className="aa-field-readonly">
                                    {model.phone || <span className="text-slate-500">-</span>}
                                </div>
                            )}
                        </div>

                        {/* 이메일 */}
                        <div className="aa-form-field">
                            <label className="aa-field-label">이메일</label>
                            {editMode ? (
                                <input
                                    className="aa-input"
                                    value={form.email}
                                    onChange={handleChange('email')}
                                />
                            ) : (
                                <div className="aa-field-readonly">
                                    {model.email || <span className="text-slate-500">-</span>}
                                </div>
                            )}
                        </div>

                        {/* 로그인 ID (표시만) */}
                        <div className="aa-form-field">
                            <label className="aa-field-label">로그인 ID</label>
                            <div className="aa-field-readonly">
                                {model.loginId || <span className="text-slate-500">(미연결)</span>}
                            </div>
                        </div>
                    </div>
                </section>

                {/* 메모 섹션 */}
                <section>
                    <h3 className="aa-section-title mb-3">메모</h3>
                    {editMode ? (
                        <textarea
                            className="aa-input min-h-[80px]"
                            value={form.memo}
                            onChange={handleChange('memo')}
                            placeholder="특이사항, 연락 시 주의점 등을 기록하세요."
                        />
                    ) : (
                        <div className="aa-field-readonly min-h-[40px] whitespace-pre-wrap">
                            {model.memo || <span className="text-slate-500">-</span>}
                        </div>
                    )}
                </section>

                {/* 연결된 학생 + 형제/가족 동기화 */}
                <section>
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="aa-section-title">연결된 학생</h3>
                        <button
                            type="button"
                            className="aa-btn aa-btn-outline"
                            onClick={handleSyncFamily}
                            disabled={saving || studentRows.length === 0}
                        >
                            {saving ? '동기화 중…' : '형제/가족 동기화'}
                        </button>
                    </div>
                    <div className="guardian-student-list border border-slate-700 rounded-md overflow-hidden">
                        {studentRows.length === 0 ? (
                            <div className="p-3 text-slate-400">
                                연결된 학생이 없습니다. 학생 상세 화면에서 보호자를 연결해 주세요.
                            </div>
                        ) : (
                            <table className="aa-table w-full text-sm">
                                <thead>
                                <tr className="bg-slate-900/60">
                                    <th className="px-3 py-2 text-left w-32">학생명</th>
                                    <th className="px-3 py-2 text-left w-24">관계</th>
                                    <th className="px-3 py-2 text-left w-32">학부</th>
                                    <th className="px-3 py-2 text-left w-40">지점</th>
                                    <th className="px-3 py-2 text-left w-32">상태</th>
                                    <th className="px-3 py-2 text-left w-32">수신</th>
                                </tr>
                                </thead>
                                <tbody>
                                {studentRows.map((stu) => (
                                    <tr key={stu.id} className="border-t border-slate-800">
                                        <td className="px-3 py-2 truncate">
                                            {stu.studentName || '-'} (ID: {stu.studentId})
                                        </td>
                                        <td className="px-3 py-2 truncate">
                                            {stu.relationName || stu.relationCode || '-'}
                                        </td>
                                        <td className="px-3 py-2 truncate">
                                            {stu.schoolStageName || stu.schoolStage || '-'}
                                        </td>
                                        <td className="px-3 py-2 truncate">
                                            {stu.workLocationName || stu.workLocationCode || '-'}
                                        </td>
                                        <td className="px-3 py-2 truncate">
                                            {stu.statusName || stu.status || '-'}
                                        </td>
                                        <td className="px-3 py-2 truncate text-xs">
                                            {stu.receiveNotice && (
                                                <span className="aa-badge aa-badge--ok mr-1">알림</span>
                                            )}
                                            {stu.receiveBilling && (
                                                <span className="aa-badge aa-badge--ok">청구</span>
                                            )}
                                            {!stu.receiveNotice && !stu.receiveBilling && (
                                                <span className="aa-badge aa-badge--muted">-</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                        ※ 형제/가족 동기화 버튼을 누르면 이 보호자와 연결된 학생들을 기준으로 형제/가족 관계를
                        자동으로 묶습니다. (정확한 동작은 백엔드 정책에 따릅니다)
                    </p>
                </section>
            </div>
        </div>
    );
}
