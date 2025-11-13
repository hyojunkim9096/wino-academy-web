// src/features/admin/components/student/StudentSiblingTab.jsx
// ============================================================================
// StudentSiblingTab — 형제/자매 탭 (내부 로딩)
// - 목록 조회 (listStudentSiblings)
// - 연결 (linkSibling) → StudentSearchModal 사용
// - 연결 해제 (unlinkSibling)
// - ✅ [수정] 공통코드 Map 받아서 이름 표시
// - ✅ [수정] 중복 클릭 방지(saving)
// ============================================================================

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { listStudentSiblings, linkSibling, unlinkSibling } from '@/api/studentSiblingApi';
// (StudentSearchModal은 부모인 AdminStudentPage에서 렌더링)
import { alertError, alertInfo, alertSuccess, confirmDialog } from '@/ui/alert';

const safeOk    = (t,m)=>Promise.resolve(alertSuccess(t,m)).catch(()=>{});
const safeError = (t,m)=>Promise.resolve(alertError(t,m)).catch(()=>{});

export default function StudentSiblingTab({
                                              studentId,
                                              onChanged,
                                              // ✅ [신규] 이름 변환용 공통코드
                                              stageCodes = [],
                                              locCodes = [],
                                              statusCodes = [],
                                              // ✅ [신규] 모달 열기 콜백
                                              onOpenSiblingPicker
                                          }){
    const [siblings, setSiblings] = useState([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false); // ✅ [신규] 중복 클릭 방지

    // ✅ [신규] 코드 -> 이름 변환 맵
    const stgMap = useMemo(() => new Map(stageCodes.map(c => [c.code, c.name])), [stageCodes]);
    const locMap = useMemo(() => new Map(locCodes.map(c => [c.code, c.name])), [locCodes]);
    const statusMap = useMemo(() => new Map(statusCodes.map(c => [c.code, c.name])), [statusCodes]);

    const stgName = (c) => stgMap.get(c) || c;
    const locName = (c) => locMap.get(c) || c;
    const statusName = (c) => statusMap.get(c) || c;


    const load = useCallback(async ()=>{
        if(!studentId){ setSiblings([]); return; }
        setLoading(true);
        try{
            const list = await listStudentSiblings(studentId);
            setSiblings(Array.isArray(list) ? list : []);
        }catch{
            setSiblings([]);
        }finally{
            setLoading(false);
        }
    }, [studentId]);

    useEffect(()=>{ load(); },[load]);

    //
    const onUnlinkSibling = async (link) => {
        if (!link?.id || saving) return; // ✅ 중복 방지
        const ok = await confirmDialog(
            '연결 해제',
            `'${link.studentName}' 학생과의 형제 연결을 해제할까요?`,
            { confirmText: '해제', cancelText: '취소' }
        );
        if(!ok) return;

        setSaving(true); // ✅
        try{
            await unlinkSibling(link.id);
            await safeOk('성공','연결이 해제되었습니다.');
            await load();
            onChanged?.();
        }catch(e){
            safeError('오류', e?.response?.data?.message || '연결 해제 실패');
        } finally {
            setSaving(false); // ✅
        }
    };

    return (
        <div className="space-y-2">
            <div className="flex gap-2">
                <button className="aa-btn aa-btn-primary" onClick={onOpenSiblingPicker}>
                    형제/자매 연결
                </button>
            </div>
            <div className="aa-table-wrap">
                <table className="aa-table">
                    <thead>
                    <tr>
                        <th>이름</th>
                        <th>학부</th>
                        <th>소속관</th>
                        <th>상태</th>
                        <th>관계 메모</th>
                        <th style={{width:100}}></th>
                    </tr>
                    </thead>
                    <tbody>
                    {loading && <tr><td colSpan={6}>불러오는 중…</td></tr>}
                    {!loading && siblings.length===0 && (
                        <tr><td colSpan={6}>연결된 형제/자매가 없습니다.</td></tr>
                    )}
                    {siblings.map(s=>(
                        <tr key={s.id}>
                            <td>{s.studentName || '-'} (ID: {s.studentId})</td>
                            {/* ✅ [수정] 코드가 아닌 이름 표시 */}
                            <td>{stgName(s.schoolStage)}</td>
                            <td>{locName(s.workLocationCode)}</td>
                            <td>{statusName(s.status)}</td>
                            <td>{s.relationNote || '-'}</td>
                            <td>
                                <div className="aa-actions">
                                    <button
                                        className="aa-btn aa-btn-danger aa-btn-sm"
                                        onClick={()=>onUnlinkSibling(s)}
                                        disabled={saving}
                                    >
                                        해제
                                    </button>
                                </div>
                            </td>
                        </tr>
                    ))}
                    </tbody>
                </table>
            </div>

            {/* */}
        </div>
    );
}