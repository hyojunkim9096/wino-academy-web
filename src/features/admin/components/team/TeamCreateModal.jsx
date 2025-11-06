// src/features/admin/components/team/TeamCreateModal.jsx
// ----------------------------------------------------------------------------
// TeamCreateModal
// - 새 팀 생성 전용 모달(팀명/관 선택 + 직원 검색으로 1명 선택 → 팀장 지정 가능)
// - props
//    open: boolean               // 모달 열림 여부
//    onClose: ()=>void           // 닫기 콜백
//    locCodes: Array<{code,name,sortOrder?}>
//    defaultWorkLoc: string      // 부모 필터의 현재 관 코드(초기값으로 사용)
//    onCreated: (newTeamId)=>void// 생성 성공 시 신규 팀 ID 콜백
// - 의존: admin-team.css 의 .ta-* 클래스, SweetAlert2 래퍼(alertSuccess/alertError)
// ----------------------------------------------------------------------------
import React, { useEffect, useRef, useState } from 'react';
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

export default function TeamCreateModal({
                                            open,
                                            onClose,
                                            locCodes = [],
                                            defaultWorkLoc = '',
                                            onCreated,
                                        }) {
    // ── 폼 상태 ────────────────────────────────────────────────────────────────
    const [teamName, setTeamName] = useState('');
    const [workLoc, setWorkLoc] = useState(defaultWorkLoc || '');
    const [kw, setKw] = useState('');
    const [rows, setRows] = useState([]);
    const [selectedLeaderId, setSelectedLeaderId] = useState(null);
    const [saving, setSaving] = useState(false);

    // 디바운스 타이머 ref
    const debRef = useRef(null);

    // 열렸을 때 초기화
    useEffect(() => {
        if (!open) return;
        setTeamName('');
        setWorkLoc(defaultWorkLoc || '');
        setKw('');
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
        return () => clearTimeout(debRef.current);
    }, [kw, workLoc, open]);

    // 제출
    const onSubmit = async () => {
        const name = teamName.trim();
        if (!name) {
            alertError('입력 필요', '팀명을 입력하세요.');
            return;
        }
        setSaving(true);
        try {
            const payload = {
                teamName: name,
                workLocation: workLoc || null, // 비우면 공용
                description: null,
                status: 'ACTIVE',
                leaderAdminId: selectedLeaderId || null, // 팀장 미지정 허용
            };
            const res = await createTeam(payload);
            const newId = res?.id ?? res; // {id} 또는 숫자 응답 대응
            await alertSuccess('성공', '팀이 생성되었습니다.');
            onClose?.();
            onCreated?.(newId);
        } catch (e) {
            alertError('오류', e?.response?.data?.message || '팀 생성 실패');
        } finally {
            setSaving(false);
        }
    };

    if (!open) return null;

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
                    </div>

                    {/* ── 팀장 선택(선택 사항) ─────────────────────────────────────── */}
                    <div className="ta-section" style={{ marginTop: 14 }}>
                        <div className="ta-section-head">
                            <div className="ta-section-title">팀장 지정(선택)</div>
                            {selectedLeaderId && <span className="ta-badge">선택됨</span>}
                        </div>

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
                                            <div className="ta-modal-item-sub">
                                                {u.workLocation || '-'} · {u.email || u.phoneNumber || '-'}
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