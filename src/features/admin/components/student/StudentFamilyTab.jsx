// src/features/admin/components/student/StudentFamilyTab.jsx
// ============================================================================
// StudentFamilyTab — 가족(보호자) 탭 전용(내부 로딩)
//  - 연결 목록 조회/해제
//  - 보호자 마스터 검색/연결 (guardianAdminApi)
//  - 관계코드 셀렉트는 부모가 내려준 familyRelCodes 사용
//  - ✅ 계정 연결 상태(loginId) 표시
//  - ✅ 가족 링크 추가/해제 시 보호자 기준 가족/형제 동기화(syncGuardianFamily 호출)
// ============================================================================

import React, { useEffect, useMemo, useState } from 'react';
// ✅ confirmDialog 포함
import { alertError, alertInfo, alertSuccess, confirmDialog } from '@/ui/alert';

import {
    listStudentFamilies,
    addStudentFamily,
    removeStudentFamily,
} from '@/api/studentFamilyApi';

import { listFamiliesMaster } from '@/api/guardianAdminApi'; // 보호자 마스터 검색
// ✅ 보호자 기준 가족/형제 동기화 API
import { syncGuardianFamily } from '@/api/guardianApi';

import Modal from '@/components/ui/Modal';

// SweetAlert 안전 래퍼
const safeInfo  = (t,m)=>Promise.resolve(alertInfo(t,m)).catch(()=>{});
const safeOk    = (t,m)=>Promise.resolve(alertSuccess(t,m)).catch(()=>{});
const safeError = (t,m)=>Promise.resolve(alertError(t,m)).catch(()=>{});

// 관계코드 정렬 유틸
const sorted = (arr=[]) =>
    arr.slice().sort(
        (a,b)=>(a.sortOrder??0)-(b.sortOrder??0)
            || String(a.name).localeCompare(String(b.name),'ko')
    );

export default function StudentFamilyTab({
                                             studentId,
                                             familyRelCodes = [],
                                             onChanged
                                         }){
    const [familyLinks, setFamilyLinks] = useState([]);
    const [loading, setLoading] = useState(false);

    // 보호자 검색 모달 상태
    const [pickOpen, setPickOpen] = useState(false);
    const [pickKey, setPickKey]   = useState('');
    const [pickList, setPickList] = useState([]);
    const [pickLoading, setPickLoading] = useState(false);
    const [relSel, setRelSel] = useState(''); // 선택한 관계코드

    // 관계코드 옵션
    const relOptions = useMemo(
        () => sorted(familyRelCodes),
        [familyRelCodes]
    );

    // -----------------------------
    // 가족(보호자) 링크 목록 조회
    // -----------------------------
    const load = async ()=>{
        if(!studentId){
            setFamilyLinks([]);
            return;
        }
        setLoading(true);
        try{
            // ✅ API 응답에 userId, loginId가 포함됨 (GuardianLinkSummary DTO)
            const fl = await listStudentFamilies(studentId);
            setFamilyLinks(
                Array.isArray(fl) ? fl : (fl?.content || [])
            );
        }catch{
            setFamilyLinks([]);
        }finally{
            setLoading(false);
        }
    };

    useEffect(()=>{ load(); },[studentId]);

    // -----------------------------
    // 보호자 마스터 검색
    // -----------------------------
    const searchFamilies = async ()=>{
        setPickLoading(true);
        try{
            const res = await listFamiliesMaster({
                keyword: pickKey || undefined,
                size: 20
            });
            // ✅ API 응답에 userId, loginId가 포함됨 (GuardianSummary DTO)
            const rows = Array.isArray(res?.content)
                ? res.content
                : (Array.isArray(res) ? res : []);
            rows.sort(
                (a,b)=>(a.name||'').localeCompare(b.name||'','ko',{sensitivity:'base'})
            );
            setPickList(rows);
        }catch{
            setPickList([]);
        }finally{
            setPickLoading(false);
        }
    };

    // -----------------------------
    // 가족(보호자) 연결
    //  - student_guardian_link 생성
    //  - ✅ guardianId 기준 가족/형제 동기화 호출
    // -----------------------------
    const onLinkFamily = async (family)=>{
        if (!studentId || !family?.id) return;
        if (!relSel) return safeInfo('안내','가족 관계 코드를 선택하세요.');

        try{
            await addStudentFamily(studentId, {
                guardianId: family.id,
                relationCode: relSel,
                primary: true,
                legalGuardian: ['FATHER','MOTHER','LEGAL_GUARDIAN'].includes(relSel),
                receiveNotice: true,
                receiveBilling: true
            });

            // ✅ 가족/형제 동기화
            //  - 이 보호자와 연결된 모든 학생을 기준으로 형제/가족 관계 재계산
            try {
                await syncGuardianFamily(family.id); // family.id = guardianId
            } catch (e) {
                // 동기화가 실패해도 가족 링크 자체는 만들어진 상태이므로,
                // 치명 오류는 아니고 콘솔에만 경고 남김
                console.warn('syncGuardianFamily 실패(무시 가능):', e);
            }

            await safeOk('성공','가족 연결됨');
            // 모달 상태 초기화
            setPickOpen(false);
            setPickList([]);
            setPickKey('');
            setRelSel('');

            // 가족 링크 목록 재조회
            await load();
            // 상위(학생 상세)에도 변경 알리기 → 형제탭 등 리프레시용
            onChanged?.();
        }catch(e){
            safeError('오류', e?.response?.data?.message || '가족 연결 실패');
        }
    };

    // -----------------------------
    // 가족(보호자) 연결 해제
    //  - student_guardian_link 삭제
    //  - ✅ guardianId 기준 가족/형제 동기화 호출
    // -----------------------------
    const onUnlinkFamily = async (link)=>{
        if (!studentId || !link?.id) return;

        const ok = await confirmDialog(
            '확인',
            '해당 가족 연결을 해제할까요?',
            { confirmText: '확인', cancelText: '취소' }
        );
        if(!ok) return;

        try{
            await removeStudentFamily(studentId, link.id);

            // ✅ 가족/형제 동기화
            //  - 이 보호자와 남은 학생들만 기준으로 형제/가족 관계 재계산
            if (link.guardianId) {
                try {
                    await syncGuardianFamily(link.guardianId);
                } catch (e) {
                    console.warn('syncGuardianFamily 실패(무시 가능):', e);
                }
            }

            await safeOk('성공','연결이 해제되었습니다.');
            await load();
            onChanged?.();
        }catch(e){
            safeError('오류', e?.response?.data?.message || '연결 해제 실패');
        }
    };

    // -----------------------------
    // 렌더링
    // -----------------------------
    return (
        <div className="space-y-2">
            {/* 상단 액션 */}
            <div className="flex gap-2">
                <button
                    className="aa-btn aa-btn-primary"
                    onClick={()=>{
                        setPickOpen(true);
                        setPickKey('');
                        setPickList([]);
                    }}
                >
                    가족 연결
                </button>
            </div>

            {/* 가족(보호자) 목록 */}
            <div className="aa-table-wrap">
                <table className="aa-table">
                    <thead>
                    <tr>
                        <th style={{width:110}}>관계</th>
                        <th>이름</th>
                        {/* ✅ 계정 연결 컬럼 */}
                        <th>계정(ID)</th>
                        <th>연락처</th>
                        <th>이메일</th>
                        <th style={{width:110}}>수신</th>
                        <th style={{width:100}}></th>
                    </tr>
                    </thead>
                    <tbody>
                    {loading && (
                        <tr><td colSpan={7}>불러오는 중…</td></tr>
                    )}
                    {!loading && familyLinks.length===0 && (
                        <tr><td colSpan={7}>연결된 가족이 없습니다.</td></tr>
                    )}
                    {familyLinks.map(g=>(
                        <tr key={g.id}>
                            <td>{g.relationCode}</td>
                            <td>{g.guardianName || '-'}</td>
                            {/* ✅ 계정 ID 표시 */}
                            <td>
                                {g.loginId ? (
                                    <span className="aa-badge aa-badge--ok">{g.loginId}</span>
                                ) : (
                                    <span className="aa-badge aa-badge--muted">미연결</span>
                                )}
                            </td>
                            <td>{g.guardianPhone || '-'}</td>
                            <td>{g.guardianEmail || '-'}</td>
                            <td className="text-sm">
                                {g.receiveNotice ? (
                                    <span className="aa-badge aa-badge--ok">알림</span>
                                ) : (
                                    <span className="aa-badge aa-badge--muted">-</span>
                                )}
                            </td>
                            <td>
                                <div className="aa-actions">
                                    <button
                                        className="aa-btn aa-btn-danger aa-btn-sm"
                                        onClick={()=>onUnlinkFamily(g)}
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

            {/* 가족 검색/연결 모달 */}
            {pickOpen && (
                <Modal title="가족 검색/연결" onClose={()=>setPickOpen(false)}>
                    <div className="space-y-3">
                        {/* 관계 선택 */}
                        <div className="aa-field">
                            <label>관계(필수)</label>
                            <select
                                className="aa-select"
                                value={relSel}
                                onChange={e=>setRelSel(e.target.value)}
                            >
                                <option value="">선택</option>
                                {relOptions.map(r=>(
                                    <option key={r.code} value={r.code}>
                                        {r.name} ({r.code})
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* 검색어 */}
                        <div className="aa-field">
                            <label>검색어</label>
                            <div className="flex gap-2">
                                <input
                                    className="aa-input"
                                    placeholder="이름/연락처/이메일"
                                    value={pickKey}
                                    onChange={e=>setPickKey(e.target.value)}
                                />
                                <button
                                    className="aa-btn"
                                    onClick={searchFamilies}
                                    disabled={pickLoading}
                                >
                                    {pickLoading?'검색…':'검색'}
                                </button>
                            </div>
                        </div>

                        {/* 검색 결과 목록 */}
                        <div className="aa-table-wrap">
                            <table className="aa-table">
                                <thead>
                                <tr>
                                    <th>이름</th>
                                    {/* ✅ 계정 연결 컬럼 */}
                                    <th>계정(ID)</th>
                                    <th>연락처</th>
                                    <th style={{width:80}}></th>
                                </tr>
                                </thead>
                                <tbody>
                                {pickList.length===0 && (
                                    <tr><td colSpan={4}>검색 결과가 없습니다.</td></tr>
                                )}
                                {pickList.map(f=>(
                                    <tr key={f.id}>
                                        <td>{f.name}</td>
                                        {/* ✅ 계정 ID 표시 */}
                                        <td>
                                            {f.loginId ? (
                                                <span className="aa-badge aa-badge--ok">{f.loginId}</span>
                                            ) : (
                                                <span className="aa-badge aa-badge--muted">미연결</span>
                                            )}
                                        </td>
                                        <td>{f.phone || '-'}</td>
                                        <td>
                                            <button
                                                className="aa-btn aa-btn-primary aa-btn-sm"
                                                onClick={()=>onLinkFamily(f)}
                                            >
                                                연결
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}
