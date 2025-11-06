// src/features/admin/components/team/TeamCreateModal.jsx

// ✅ useMemo 임포트 확인
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createTeam } from '@/api/teamApi';
import { listStaffs } from '@/api/staffApi';
import { alertError, alertSuccess } from '@/ui/alert';

// 내부 유틸: 관 코드 정렬(이름+정렬순)
const sortLocs = (arr = []) =>
    arr.slice().sort(
        (a, b) =>
            (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
            String(a.name).localeCompare(String(b.name), 'ko'),
    );

// ✅ toMap 유틸 (useMemo가 사용)
const toMap = (arr = []) =>
    Object.fromEntries(arr.map((x) => [String(x.code).toUpperCase(), x]));


export default function TeamCreateModal({
                                            open,
                                            onClose,
                                            locCodes = [],
                                            defaultWorkLoc = '',
                                            onCreated,
                                            EmpTypeFilter, // ✅ [요청] 부모로부터 필터 컴포넌트 받기
                                        }) {
    // ── 1. 폼 상태 (Hooks) ───────────────────────────────────────────────────
    const [teamName, setTeamName] = useState('');
    const [teamCode, setTeamCode] = useState('');
    const [workLoc, setWorkLoc] = useState(defaultWorkLoc || '');
    const [kw, setKw] = useState('');
    const [empType, setEmpType] = useState(''); // ✅ [요청] 팀장 검색용 직원 유형 필터 상태
    const [rows, setRows] = useState([]);
    const [selectedLeaderId, setSelectedLeaderId] = useState(null);
    const [saving, setSaving] = useState(false);

    // 디바운스 타이머 ref (Hook)
    const debRef = useRef(null);

    // ── 2. 이펙트 훅 (Hooks) ──────────────────────────────────────────────────
    // 열렸을 때 초기화
    useEffect(() => {
        if (!open) return;
        setTeamName('');
        setTeamCode('');
        setWorkLoc(defaultWorkLoc || '');
        setKw('');
        setEmpType(''); // ✅ [요청] 필터 초기화
        setRows([]);
        setSelectedLeaderId(null);
    }, [open, defaultWorkLoc]);

    // ESC 로 닫기
    useEffect(() => {
        if (!open) return;
        const onKey = (e) => {
            if (e.key === 'Escape') onClose?.();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    // 직원/강사 검색(디바운스)
    useEffect(() => {
        if (!open) return;
        if (debRef.current) clearTimeout(debRef.current);
        debRef.current = setTimeout(async () => {
            try {
                const res = await listStaffs({
                    workLocation: workLoc || undefined,
                    employeeType: empType || undefined, // ✅ [요청] 직원 유형 파라미터 추가
                    keyword: kw || undefined,
                    page: 0,
                    size: 20,
                });
                const data = Array.isArray(res?.content)
                    ? res.content
                    : Array.isArray(res)
                        ? res
                        : [];
                setRows(data);
            } catch {
                setRows([]);
            }
        }, 250);
        // ✅ [요청] empType 변경 시에도 재검색
        return () => clearTimeout(debRef.current);
    }, [kw, workLoc, empType, open]);

    // ── 3. 헬퍼 훅 (Hooks) ───────────────────────────────────────────────────
    const locMap = useMemo(() => toMap(locCodes), [locCodes]);
    const locName = (code) =>
        locMap[String(code || '').toUpperCase()]?.name || code || '전체';

    // ── 4. 핸들러 함수 ───────────────────────────────────────────────────────
    // 제출
    const onSubmit = async () => {
        const name = teamName.trim();
        if (!name) {
            alertError('입력 필요', '팀명을 입력하세요.');
            return;
        }

        const code = teamCode.trim() || null;

        setSaving(true);
        try {
            const payload = {
                teamName: name,
                teamCode: code,
                workLocation: workLoc || null,
                description: null,
                status: 'ACTIVE',
                leaderAdminId: selectedLeaderId || null,
            };
            const res = await createTeam(payload);
            const newId = res?.id ?? res;
            await alertSuccess('성공', '팀이 생성되었습니다.');
            onClose?.();
            onCreated?.(newId);
        } catch (e) {
            alertError('오류', e?.response?.data?.message || '팀 생성 실패');
        } finally {
            setSaving(false);
        }
    };

    // ── 5. 조기 반환 (모든 Hooks가 호출된 이후) ─────────────────────────────
    if (!open) return null;

    //
    const locs = sortLocs(locCodes);


    return (
        <div className="ta-modal-backdrop" onClick={onClose}>
            <div
                className="ta-modal"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="team-create-title"
            >
                <div className="ta-modal-head">
                    <div id="team-create-title" className="ta-modal-title">
                        새 팀 생성
                    </div>
                    <button className="ta-modal-close" onClick={onClose} aria-label="닫기">
                        ×
                    </button>
                </div>

                <div className="ta-modal-body">
                    {/* ── 기본 정보 폼 ─────────────────────────────────────────────── */}
                    <div className="ta-form-grid">
                        <div>
                            <div className="ta-field-label">팀명</div>
                            <input
                                className="ta-input"
                                placeholder="예: 초등 영어 1팀"
                                value={teamName}
                                onChange={(e) => setTeamName(e.target.value)}
                                maxLength={120}
                                autoFocus
                            />
                            <div className="ta-help">지점별 중복을 피하는 이름을 권장합니다.</div>
                        </div>

                        <div>
                            <div className="ta-field-label">팀 코드 (선택)</div>
                            <input
                                className="ta-input"
                                placeholder="예: ENG-E-1 (고유해야 함)"
                                value={teamCode}
                                onChange={(e) => setTeamCode(e.target.value)}
                                maxLength={64}
                            />
                            <div className="ta-help">비워두거나 식별 가능한 코드를 입력하세요.</div>
                        </div>
                    </div>

                    <div style={{ marginTop: '10px' }}>
                        <div className="ta-field-label">소속 관(Work Location)</div>
                        <select
                            className="ta-select"
                            value={workLoc}
                            onChange={(e) => setWorkLoc(e.target.value)}
                        >
                            <option value="">전체/공용</option>
                            {(locs || []).map((l) => (
                                <option key={l.code} value={l.code}>
                                    {l.name} ({l.code})
                                </option>
                            ))}
                        </select>
                        <div className="ta-help">비우면 공용 팀으로 생성됩니다.</div>
                    </div>


                    {/* ── 팀장 선택(선택 사항) ─────────────────────────────────────── */}
                    <div className="ta-section" style={{ marginTop: 14 }}>
                        <div className="ta-section-head">
                            <div className="ta-section-title">팀장 지정(선택)</div>
                            {selectedLeaderId && <span className="ta-badge">선택됨</span>}
                        </div>

                        {/* ✅ [요청] 직원 유형 필터 UI 추가 */}
                        {EmpTypeFilter && <EmpTypeFilter value={empType} onChange={setEmpType} />}

                        {/* 검색어 */}
                        <div className="ta-modal-field">
                            <input
                                className="ta-input"
                                placeholder="직원/강사 검색(이름/아이디/이메일)"
                                value={kw}
                                onChange={(e) => setKw(e.target.value)}
                            />
                        </div>

                        {/* 선택 해제 옵션 */}
                        <label className="ta-modal-item" style={{ borderTop: '1px solid #1f2937' }}>
                            <div>
                                <div className="ta-modal-item-name">팀장 미지정</div>
                                <div className="ta-modal-item-sub">생성 후 구성원에서 지정할 수 있어요.</div>
                            </div>
                            <input
                                type="radio"
                                name="leader"
                                checked={!selectedLeaderId}
                                onChange={() => setSelectedLeaderId(null)}
                                aria-label="팀장 미지정"
                            />
                        </label>

                        {/* 검색 결과 목록 */}
                        <div className="ta-modal-list">
                            {(rows || []).map((u) => {
                                const checked = selectedLeaderId === u.id;
                                return (
                                    <label className="ta-modal-item" key={u.id}>
                                        <div>
                                            <div className="ta-modal-item-name">
                                                {u.userName}{' '}
                                                <span className="ta-mono">({u.userId})</span>
                                            </div>
                                            {/* ✅ [수정] 팀장 검색 결과의 관 코드 -> 이름으로 변경 */}
                                            <div className="ta-modal-item-sub">
                                                {locName(u.workLocation)} · {u.email || u.phoneNumber || '-'}
                                            </div>
                                        </div>
                                        <input
                                            type="radio"
                                            name="leader"
                                            checked={!!checked}
                                            onChange={() => setSelectedLeaderId(u.id)}
                                            aria-label={`${u.userName} 팀장 선택`}
                                        />
                                    </label>
                                );
                            })}
                            {(!rows || rows.length === 0) && (
                                <div className="ta-empty">검색 결과가 없습니다.</div>
                            )}
                        </div>
                    </div>

                    {/* ── 액션 버튼 ──────────────────────────────────────────────── */}
                    <div className="ta-right" style={{ marginTop: 12 }}>
                        <button className="ta-btn" onClick={onClose}>
                            취소
                        </button>
                        <button className="ta-btn ta-primary" disabled={saving} onClick={onSubmit}>
                            {saving ? '생성 중…' : '생성'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}