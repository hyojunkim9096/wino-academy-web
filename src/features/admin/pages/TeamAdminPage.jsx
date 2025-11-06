// TeamAdminPage.jsx

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
    listTeams,
    getTeam,
    // createTeam,  // ✅ 모달 내부에서 처리 → 불필H하여 제거
    updateTeam,
    deleteTeam,
    addTeamMember,
    updateTeamMember,
    removeTeamMember,
    setTeamLeader,
} from '@/api/teamApi';
import { listStaffs } from '@/api/staffApi';
import { getCodes } from '@/api/commonCodeAdminApi';
import { alertError, alertSuccess, confirm } from '@/ui/alert';

import TeamCreateModal from '@/features/admin/components/team/TeamCreateModal'; // ✅ 새 팀 생성 모달

// 전역/페이지 공통 스타일
import '@/styles/admin-system.css'; // ✅ .aa-seg 스타일이 여기 있습니다.
import '@/styles/admin-team.css';

// ────────────────────────────────────────────────────────────────────────────
// (공용) 작은 모달 컴포넌트: 구성원 추가에 사용
// ────────────────────────────────────────────────────────────────────────────
function SimpleModal({ open, title, onClose, children }) {
    if (!open) return null;
    return (
        <div className="ta-modal-backdrop" onClick={onClose}>
            <div className="ta-modal" onClick={(e) => e.stopPropagation()}>
                <div className="ta-modal-head">
                    <div className="ta-modal-title">{title}</div>
                    <button className="ta-modal-close" onClick={onClose}>
                        ×
                    </button>
                </div>
                <div className="ta-modal-body">{children}</div>
            </div>
        </div>
    );
}

// ────────────────────────────────────────────────────────────────────────────
// ✅ [요청] 직원 유형(STAFF/TEACHER) 필터 옵션
// ────────────────────────────────────────────────────────────────────────────
const EMP_TYPES = [
    { code: '', name: '전체' },      //
    { code: 'STAFF', name: '직원' },
    { code: 'TEACHER', name: '강사' },
];

/**
 * ✅ [요청] 직원 유형 필터 UI 컴포넌트
 * admin-system.css의 .aa-seg 스타일을 사용합니다.
 */
function EmpTypeFilter({ value, onChange }) {
    return (
        <div className="aa-seg" style={{ marginBottom: '10px' }}>
            {EMP_TYPES.map((t) => (
                <button
                    key={t.code}
                    className={`aa-btn ${value === t.code ? 'is-active' : ''}`}
                    onClick={() => onChange(t.code)}
                >
                    {t.name}
                </button>
            ))}
        </div>
    );
}


// 상태 필터 옵션
const STATUS = [
    { code: 'ALL', name: '전체' },
    { code: 'ACTIVE', name: '활성' },
    { code: 'INACTIVE', name: '비활성' },
];

// 유틸
const toMap = (arr = []) =>
    Object.fromEntries(arr.map((x) => [String(x.code).toUpperCase(), x]));
const sortByName = (arr = []) =>
    arr
        .slice()
        .sort(
            (a, b) =>
                (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
                String(a.name).localeCompare(b.name, 'ko'),
        );

export default function TeamAdminPage() {
    // 좌측 필터 상태
    const [workLoc, setWorkLoc] = useState(''); // 관 코드(전체/공용은 빈 문자열)
    const [status, setStatus] = useState('ALL');
    const [keyword, setKeyword] = useState('');
    const [kwDeb, setKwDeb] = useState(''); // 검색어 디바운스 값

    // 공통코드: 관 목록
    const [locCodes, setLocCodes] = useState([]);

    // 목록/페이징/선택
    const [list, setList] = useState([]);
    const [page, setPage] = useState(0);
    const [size, setSize] = useState(20);
    const [meta, setMeta] = useState({ totalElements: 0, totalPages: 0 });
    const [selectedId, setSelectedId] = useState(null);
    const [loading, setLoading] = useState(false);

    // 상세/편집
    const [detail, setDetail] = useState(null);
    const [edit, setEdit] = useState(null);
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);

    // 구성원 추가 모달
    const [mOpen, setMOpen] = useState(false);
    const [mKw, setMKw] = useState('');
    const [mEmpType, setMEmpType] = useState(''); // ✅ [요청] 구성원 모달용 직원 유형 필터 상태
    const [mRes, setMRes] = useState([]);
    const mDebRef = useRef(null);

    // 새 팀 생성 모달
    const [createOpen, setCreateOpen] = useState(false);

    // ── 공통코드 로딩: WORK_LOCATION ───────────────────────────────────────
    useEffect(() => {
        (async () => {
            try {
                const workLocs = await getCodes('WORK_LOCATION');
                setLocCodes(sortByName(workLocs || []));
            } catch {
                // 코드 실패해도 화면은 동작
            }
        })();
    }, []);

    // ── 검색어 디바운스 ──────────────────────────────────────────────────
    useEffect(() => {
        const t = setTimeout(() => setKwDeb(keyword.trim()), 300);
        return () => clearTimeout(t);
    }, [keyword]);

    // ── 목록 로드 ────────────────────────────────────────────────────────
    const loadList = useCallback(
        async (keepSelection = false) => {
            setLoading(true);
            try {
                const res = await listTeams({
                    workLocation: workLoc || undefined,
                    status: status === 'ALL' ? undefined : status,
                    keyword: kwDeb || undefined,
                    page,
                    size,
                });
                const rows = res?.content || [];
                setList(rows);
                setMeta({
                    totalElements: res?.totalElements ?? 0,
                    totalPages: res?.totalPages ?? 1,
                });
                // keepSelection=false면 첫 항목 자동 선택
                if (!keepSelection) setSelectedId(rows[0]?.id ?? null);
            } catch (e) {
                setList([]);
                alertError('오류', e?.response?.data?.message || '팀 목록 조회 실패');
            } finally {
                setLoading(false);
            }
        },
        [workLoc, status, kwDeb, page, size],
    );

    useEffect(() => {
        loadList(false);
    }, [loadList]);

    // ── 상세 로드 ────────────────────────────────────────────────────────
    useEffect(() => {
        if (!selectedId) {
            setDetail(null);
            setEdit(null);
            setEditing(false);
            return;
        }
        (async () => {
            try {
                const d = await getTeam(selectedId, { activeOnly: false });
                setDetail(d);
                setEdit(toEditModel(d));
                setEditing(false);
            } catch {
                setDetail(null);
                setEdit(null);
                setEditing(false);
            }
        })();
    }, [selectedId]);

    // ── 새 팀 생성: 전용 모달 오픈 ────────────────────────────────────────
    const openCreateModal = () => {
        setCreateOpen(true);
    };

    // 새 팀 생성 완료 콜백(모달에서 호출)
    const handleCreated = async (newTeamId) => {
        // 1) 첫 페이지로 이동
        setPage(0);
        // 2) 목록 재조회
        await loadList(false);
        // 3) 방금 생성한 팀을 선택
        if (newTeamId) setSelectedId(newTeamId);
    };

    // ── 저장(상세 편집 저장) ────────────────────────────────────────────
    const onSave = async () => {
        if (!selectedId || !edit) return;

        const payload = {
            // teamCode는 수정 시 제외 (고유값)
            teamName: (edit.teamName || '').trim(),
            description: edit.description || null,
            workLocation: edit.workLocation || null, // 빈 값이면 공용
            status: edit.status || 'ACTIVE',
            leaderAdminId: edit.leaderAdminId || null,
        };

        setSaving(true);
        try {
            await updateTeam(selectedId, payload);

            const d = await getTeam(selectedId, { activeOnly: false });
            setDetail(d);
            setEdit(toEditModel(d));
            setEditing(false);
            await alertSuccess('성공', '저장되었습니다.');
            await loadList(true); // 목록 리프레시 (선택 유지)
        } catch (e) {
            alertError('오류', e?.response?.data?.message || '저장 실패');
        } finally {
            setSaving(false);
        }
    };

    // ── 삭제 ─────────────────────────────────────────────────────────────
    const onDelete = async () => {
        if (!selectedId) return;
        const ok = await confirm('삭제 확인', '이 팀을 삭제하시겠습니까? 구성원도 함께 제거됩니다.');
        if (!ok) return;
        try {
            await deleteTeam(selectedId);
            await alertSuccess('성공', '삭제되었습니다.');
            setSelectedId(null);
            await loadList(false);
        } catch (e) {
            alertError('오류', e?.response?.data?.message || '삭제 실패');
        }
    };

    // ── 구성원 추가 모달 오픈 ───────────────────────────────────────────
    const openMemberModal = () => {
        setMKw('');
        setMEmpType(''); // ✅ [요청] 모달 열 때 필터 초기화
        setMRes([]);
        setMOpen(true);
    };

    // ── 구성원 검색(직원/강사, 디바운스) ────────────────────────────────
    useEffect(() => {
        if (!mOpen) return;
        if (mDebRef.current) clearTimeout(mDebRef.current);
        mDebRef.current = setTimeout(async () => {
            try {
                const res = await listStaffs({
                    workLocation: edit?.workLocation || undefined, // 현재 팀의 관 기준으로 우선 검색
                    employeeType: mEmpType || undefined, // ✅ [요청] 직원 유형 파라미터 추가
                    keyword: mKw || undefined,
                    page: 0,
                    size: 20,
                });
                const rows = Array.isArray(res?.content)
                    ? res.content
                    : Array.isArray(res)
                        ? res
                        : [];
                setMRes(rows);
            } catch {
                setMRes([]);
            }
        }, 250);
        return () => clearTimeout(mDebRef.current);
        // ✅ [요청] mEmpType이 변경될 때도 검색 실행
    }, [mKw, mEmpType, mOpen, edit?.workLocation]);

    // ── 구성원 추가/수정/삭제/팀장지정 ─────────────────────────────────
    const addMemberAction = async (adminId, role = 'MEMBER') => {
        try {
            await addTeamMember(selectedId, { adminId, roleInTeam: role });
            await refreshDetail();
            await loadList(true); // ✅ 좌측 목록 새로고침
            setMOpen(false);
            await alertSuccess('성공', '구성원이 추가되었습니다.');
        } catch (e) {
            alertError('오류', e?.response?.data?.message || '구성원 추가 실패');
        }
    };

    const setLeaderAction = async (adminId) => {
        try {
            await setTeamLeader(selectedId, adminId);
            await refreshDetail();
            await loadList(true);
            await alertSuccess('성공', '팀장이 지정되었습니다.');
        } catch (e) {
            alertError('오류', e?.response?.data?.message || '팀장 지정 실패');
        }
    };

    const updateMemberAction = async (m, patch) => {
        try {
            await updateTeamMember(selectedId, m.id, patch);
            await refreshDetail();
            await loadList(true); // ✅ 좌측 목록 새로고침
        } catch (e) {
            alertError('오류', e?.response?.data?.message || '구성원 수정 실패');
        }
    };

    const removeMemberAction = async (m) => {
        const ok = await confirm('삭제 확인', `${m.userName} 구성원을 삭제할까요?`);
        if (!ok) return;
        try {
            await removeTeamMember(selectedId, m.id);
            await refreshDetail();
            await loadList(true); // ✅ 좌측 목록 새로고침
        } catch (e) {
            alertError('오류', e?.response?.data?.message || '구성원 삭제 실패');
        }
    };

    // (버그 수정) refreshDetail 함수 (수정 중 상태 덮어쓰기 방지)
    const refreshDetail = async () => {
        if (!selectedId) return;
        try {
            const d = await getTeam(selectedId, { activeOnly: false });
            setDetail(d);

            if (editing) {
                setEdit((prevEdit) => ({
                    ...prevEdit,
                    leaderAdminId: d.leaderAdminId,
                    leaderName: d.leaderName,
                }));
            } else {
                setEdit(toEditModel(d));
            }
        } catch (e) {
            alertError('오류', e?.response?.data?.message || '팀 상세 정보 갱신 실패');
            setDetail(null);
            setEdit(null);
            setEditing(false);
            setSelectedId(null);
            await loadList(false);
        }
    };

    // ── 헬퍼 함수 ───────────────────────────────────────────────────────

    // ✅ 관 코드 -> 이름 변환 맵
    const locMap = useMemo(() => toMap(locCodes), [locCodes]);
    const locName = (code) =>
        locMap[String(code || '').toUpperCase()]?.name || code || '전체';

    // ✅ 상태 코드 -> 이름 변환
    const statusName = (code) => {
        if (code === 'ACTIVE') return '활성';
        if (code === 'INACTIVE') return '비활성';
        return code;
    }

    return (
        <section className="team-admin">
            <div className="ta-wrap">
                <h1 className="ta-title">팀 관리</h1>

                <div className="ta-grid">
                    {/* ─────────────────────────────────────────────
              좌측: 목록/필터
          ───────────────────────────────────────────── */}
                    <aside className="ta-left">
                        <div className="ta-panel">
                            <div className="ta-row">
                                <div className="ta-label">소속관</div>
                                <select
                                    className="ta-select"
                                    value={workLoc}
                                    onChange={(e) => setWorkLoc(e.target.value)}
                                >
                                    <option value="">전체</option>
                                    {(locCodes || []).map((l) => (
                                        <option key={l.code} value={l.code}>
                                            {l.name} ({l.code})
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="ta-row">
                                <div className="ta-label">상태</div>
                                <select
                                    className="ta-select"
                                    value={status}
                                    onChange={(e) => setStatus(e.target.value)}
                                >
                                    {STATUS.map((s) => (
                                        <option key={s.code} value={s.code}>
                                            {s.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="ta-row">
                                <input
                                    className="ta-input"
                                    placeholder="팀명/코드 검색"
                                    value={keyword}
                                    onChange={(e) => setKeyword(e.target.value)}
                                />
                            </div>
                            <div className="ta-row ta-right">
                                <button className="ta-btn ta-primary" onClick={openCreateModal}>
                                    + 새 팀
                                </button>
                            </div>
                        </div>

                        <div className="ta-list ta-panel">
                            {loading && <div className="ta-empty">불러오는 중…</div>}
                            {!loading && (!list || list.length === 0) && (
                                <div className="ta-empty">결과가 없습니다.</div>
                            )}
                            {!loading &&
                                (list || []).map((item) => {
                                    const sel = selectedId === item.id;
                                    return (
                                        <button
                                            key={item.id}
                                            className={`ta-item ${sel ? 'is-active' : ''}`}
                                            onClick={() => setSelectedId(item.id)}
                                            title={item.teamName}
                                            aria-current={sel ? 'true' : 'false'}
                                        >
                                            <div className="ta-item-name">{item.teamName}</div>
                                            <div className="ta-item-sub">
                                                {/* ✅ 소속관 이름 표시 */}
                                                {locName(item.workLocation)} ·{' '}
                                                {item.leaderName
                                                    ? `팀장 ${item.leaderName}`
                                                    : '팀장 미지정'}{' '}
                                                · 활성 {item.activeMemberCount}명
                                            </div>
                                        </button>
                                    );
                                })}
                        </div>

                        <div className="ta-pager">
                            <button
                                className="ta-btn"
                                disabled={page <= 0}
                                onClick={() => setPage((p) => p - 1)}
                            >
                                이전
                            </button>
                            <div className="ta-pager-info">
                                {page + 1} / {meta.totalPages || 1}
                            </div>
                            <button
                                className="ta-btn"
                                disabled={page + 1 >= (meta.totalPages || 1)}
                                onClick={() => setPage((p) => p + 1)}
                            >
                                다음
                            </button>
                        </div>
                    </aside>

                    {/* ─────────────────────────────────────────────
              우측: 상세/편집 + 멤버
          ───────────────────────────────────────────── */}
                    <main className="ta-right">
                        {!detail && (
                            <div className="ta-panel ta-empty">좌측에서 대상을 선택하세요.</div>
                        )}

                        {detail && (
                            <div className="ta-panel">
                                <div className="ta-head">
                                    <div className="ta-head-title">
                                        <div className="ta-name">{detail.teamName}</div>
                                        <div className="ta-code">{detail.teamCode || '-'}</div>
                                    </div>
                                    <div className="ta-head-actions">
                                        {!editing ? (
                                            <>
                                                <button className="ta-btn" onClick={() => setEditing(true)}>
                                                    수정
                                                </button>
                                                <button className="ta-btn" onClick={onDelete}>
                                                    삭제
                                                </button>
                                            </>
                                        ) : (
                                            <>
                                                <button
                                                    className="ta-btn"
                                                    onClick={() => {
                                                        setEdit(toEditModel(detail));
                                                        setEditing(false);
                                                    }}
                                                >
                                                    취소
                                                </button>
                                                <button
                                                    className="ta-btn ta-primary"
                                                    disabled={saving}
                                                    onClick={onSave}
                                                >
                                                    {saving ? '저장 중…' : '저장'}
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>

                                {/* 기본 정보 편집 영역 */}
                                <div className="ta-grid2">
                                    <Field label="팀명">
                                        {!editing ? (
                                            <RO>{detail.teamName}</RO>
                                        ) : (
                                            <input
                                                className="ta-input"
                                                value={edit.teamName}
                                                onChange={(e) =>
                                                    setEdit((v) => ({ ...v, teamName: e.target.value }))
                                                }
                                            />
                                        )}
                                    </Field>

                                    {/* 팀 코드 수정 시 readOnly 처리 */}
                                    <Field label="팀 코드">
                                        {!editing ? (
                                            <RO>{detail.teamCode || '-'}</RO>
                                        ) : (
                                            <input
                                                className="ta-input"
                                                value={edit.teamCode || ''}
                                                readOnly
                                                disabled
                                                title="팀 코드는 생성 후 수정할 수 없습니다."
                                                style={{ background: '#1f2937', cursor: 'not-allowed' }}
                                            />
                                        )}
                                    </Field>

                                    <Field label="지점(workLocation)">
                                        {!editing ? (
                                            <RO>
                                                {detail.workLocation
                                                    ? `${locName(detail.workLocation)} (${detail.workLocation})`
                                                    : '전체'}
                                            </RO>
                                        ) : (
                                            <select
                                                className="ta-select"
                                                value={edit.workLocation || ''}
                                                onChange={(e) =>
                                                    setEdit((v) => ({
                                                        ...v,
                                                        workLocation: e.target.value || '',
                                                    }))
                                                }
                                            >
                                                <option value="">전체/공용</option>
                                                {(locCodes || []).map((l) => (
                                                    <option key={l.code} value={l.code}>
                                                        {l.name} ({l.code})
                                                    </option>
                                                ))}
                                            </select>
                                        )}
                                    </Field>

                                    {/* 상태 표시 형식 변경 */}
                                    <Field label="상태">
                                        {!editing ? (
                                            <RO>{statusName(detail.status)} ({detail.status})</RO>
                                        ) : (
                                            <select
                                                className="ta-select"
                                                value={edit.status}
                                                onChange={(e) =>
                                                    setEdit((v) => ({ ...v, status: e.target.value }))
                                                }
                                            >
                                                <option value="ACTIVE">활성 (ACTIVE)</option>
                                                <option value="INACTIVE">비활성 (INACTIVE)</option>
                                            </select>
                                        )}
                                    </Field>

                                    <Field label="팀장">
                                        {!editing ? (
                                            <RO>{detail.leaderName || '-'}</RO>
                                        ) : (
                                            <input
                                                className="ta-input"
                                                value={edit.leaderName || ''}
                                                readOnly
                                                placeholder="아래 구성원 목록에서 지정"
                                            />
                                        )}
                                    </Field>

                                    <Field label="설명">
                                        {!editing ? (
                                            <RO>{detail.description || '-'}</RO>
                                        ) : (
                                            <input
                                                className="ta-input"
                                                value={edit.description || ''}
                                                onChange={(e) =>
                                                    setEdit((v) => ({ ...v, description: e.target.value }))
                                                }
                                            />
                                        )}
                                    </Field>
                                </div>

                                {/* 구성원 섹션 */}
                                <div className="ta-section">
                                    <div className="ta-section-head">
                                        <div className="ta-section-title">구성원</div>
                                        <div className="ta-section-actions">
                                            <button className="ta-btn" onClick={openMemberModal}>
                                                + 추가
                                            </button>
                                        </div>
                                    </div>

                                    <div className="ta-members">
                                        {(detail.members || []).map((m) => (
                                            <div key={m.id} className="ta-member">
                                                <div className="ta-member-info">
                                                    <div className="ta-member-name">{m.userName}</div>
                                                    {/* ✅ [수정] 구성원 목록의 관 코드 -> 이름으로 변경 */}
                                                    <div className="ta-member-sub">
                                                        {locName(m.workLocation)} · 참여 {fmtDate(m.joinedAt)}
                                                        {m.leftAt ? ` ~ ${fmtDate(m.leftAt)}` : ''}
                                                    </div>
                                                </div>
                                                <div className="ta-member-ops">

                                                    {/* ✅ [요청 1] 역할(MEMBER/LEADER) <select> 제거 */}
                                                    {/* "팀장지정" 버튼으로 역할을 관리합니다. */}

                                                    <select
                                                        className="ta-select"
                                                        value={m.activeYn}
                                                        onChange={(e) =>
                                                            updateMemberAction(m, { activeYn: e.target.value })
                                                        }
                                                    >
                                                        <option value="Y">활성</option>
                                                        <option value="N">비활성</option>
                                                    </select>
                                                    <button
                                                        className="ta-btn"
                                                        onClick={() => setLeaderAction(m.adminId)}
                                                    >
                                                        팀장지정
                                                    </button>
                                                    <button
                                                        className="ta-btn"
                                                        onClick={() => removeMemberAction(m)}
                                                    >
                                                        삭제
                                                    </button>
                                                </div>
                                            </div>
                                        ))}

                                        {(!detail.members || detail.members.length === 0) && (
                                            <div className="ta-empty">구성원이 없습니다.</div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </main>
                </div>
            </div>

            {/* 구성원 추가 모달 */}
            <SimpleModal open={mOpen} title="구성원 추가" onClose={() => setMOpen(false)}>

                {/* ✅ [요청] 직원 유형 필터 UI 추가 */}
                <EmpTypeFilter value={mEmpType} onChange={setMEmpType} />

                <div className="ta-modal-field">
                    <input
                        className="ta-input"
                        placeholder="이름/아이디/이메일…"
                        value={mKw}
                        onChange={(e) => setMKw(e.target.value)}
                    />
                </div>
                <div className="ta-modal-list">
                    {(mRes || []).map((u) => (
                        <div className="ta-modal-item" key={u.id}>
                            <div className="ta-modal-item-info">
                                <div className="ta-modal-item-name">
                                    {u.userName} <span className="ta-mono">({u.userId})</span>
                                </div>
                                {/* ✅ [수정] 구성원 추가 모달의 관 코드 -> 이름으로 변경 */}
                                <div className="ta-modal-item-sub">
                                    {locName(u.workLocation)} · {u.email || u.phoneNumber || '-'}
                                </div>
                            </div>
                            <div className="ta-modal-item-ops">
                                <button className="ta-btn" onClick={() => addMemberAction(u.id, 'MEMBER')}>
                                    멤버
                                </button>
                                <button
                                    className="ta-btn ta-primary"
                                    onClick={() => addMemberAction(u.id, 'LEADER')}
                                >
                                    팀장
                                </button>
                            </div>
                        </div>
                    ))}
                    {(!mRes || mRes.length === 0) && (
                        <div className="ta-empty">검색 결과가 없습니다.</div>
                    )}
                </div>
                <div className="ta-right mt-2">
                    <button className="ta-btn" onClick={() => setMOpen(false)}>
                        닫기
                    </button>
                </div>
            </SimpleModal>

            {/* 새 팀 생성 모달 */}
            <TeamCreateModal
                open={createOpen}
                onClose={() => setCreateOpen(false)}
                locCodes={locCodes}
                defaultWorkLoc={workLoc}
                onCreated={handleCreated}
                // ✅ [요청] EmpTypeFilter 컴포넌트 전달
                EmpTypeFilter={EmpTypeFilter}
            />
        </section>
    );
}

// ────────────────────────────────────────────────────────────────────────────
// 소형 필드 컴포넌트
// ────────────────────────────────────────────────────────────────────────────
function Field({ label, children }) {
    return (
        <label className="ta-field">
            <div className="ta-field-label">{label}</div>
            <div className="ta-field-ctl">{children}</div>
        </label>
    );
}

// 읽기 전용 박스
function RO({ children }) {
    return <div className="ta-ro">{children ?? '-'}</div>;
}

// 상세 → 편집 모델 변환
function toEditModel(d) {
    if (!d) return null;
    return {
        teamCode: d.teamCode || '',
        teamName: d.teamName || '',
        description: d.description || '',
        workLocation: d.workLocation || '',
        status: d.status || 'ACTIVE',
        leaderAdminId: d.leaderAdminId || null,
        leaderName: d.leaderName || '',
    };
}

// 날짜 포맷(yyyy-MM-dd HH:mm:ss까지)
function fmtDate(s) {
    if (!s) return '-';
    try {
        return String(s).replace('T', ' ').substring(0, 19);
    } catch {
        return String(s);
    }
}