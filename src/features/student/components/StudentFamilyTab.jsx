// src/features/student/components/StudentFamilyTab.jsx
// ============================================================================
// StudentFamilyTab — 가족(보호자) 탭
// ----------------------------------------------------------------------------
// 하는 일
//  - 학생(studentId)의 보호자 연결 목록 조회/추가/삭제
//  - 보호자 검색 → 관계 선택 → 연결 추가
//
// ✅ UI/UX 개선(이번 변경)
//  1) 보호자 검색 팝업에서 [선택] 버튼이 "너무 오른쪽"에 있어 스크롤이 생기는 문제 개선
//     - [선택]을 첫 컬럼으로 이동 + colgroup으로 폭 고정
//  2) .aa-table 기본 min-width(760px) 때문에 모달에서 가로 스크롤이 생길 수 있어
//     - inline style로 minWidth 제거 + tableLayout fixed 적용
//  3) 관계를 선택하지 않으면 선택 버튼 비활성(실수 방지) + 안내 문구 표시
// ============================================================================

import React, { useEffect, useMemo, useState } from 'react';
import Modal from '@/common/components/ui/Modal.jsx';
import { alertError, alertInfo, alertSuccess, confirmDialog } from '@/common/ui/alert.js';
import { listStudentFamilies, addStudentFamily, removeStudentFamily } from '@/features/student/api/studentFamilyApi.js';
import { listFamiliesMaster } from '@/features/student/api/guardianAdminApi.js';
import { useCommonCodes } from '@/common/components/contexts/CommonCodeContext';

const safeInfo  = (t, m) => Promise.resolve(alertInfo(t, m)).catch(() => {});
const safeOk    = (t, m) => Promise.resolve(alertSuccess(t, m)).catch(() => {});
const safeError = (t, m) => Promise.resolve(alertError(t, m)).catch(() => {});

// ✅ 기본 관계 코드 (공통코드 API 로드 실패 대비)
const DEFAULT_REL_CODES = [
    { code: 'FATHER', name: '부' },
    { code: 'MOTHER', name: '모' },
    { code: 'GRANDFATHER', name: '조부' },
    { code: 'GRANDMOTHER', name: '조모' },
    { code: 'OTHER', name: '기타' }
];

export default function StudentFamilyTab({ studentId, onChanged }) {
    const [familyLinks, setFamilyLinks] = useState([]);
    const [loading, setLoading] = useState(false);

    // 보호자 검색/선택 모달 상태
    const [pickOpen, setPickOpen] = useState(false);
    const [pickKey, setPickKey]   = useState('');
    const [pickList, setPickList] = useState([]);
    const [pickLoading, setPickLoading] = useState(false);
    const [pickHasSearched, setPickHasSearched] = useState(false);

    // 관계 선택
    const [relSel, setRelSel] = useState('');

    // 공통코드 로드 (없으면 기본값 사용)
    const { codes } = useCommonCodes('FAMILY_REL');
    const relCodes = (codes && codes.length > 0) ? codes : DEFAULT_REL_CODES;

    // 코드 → 라벨 매핑
    const relMap = useMemo(() => {
        const map = new Map();
        relCodes.forEach(c => map.set(c.code, c.name));
        return map;
    }, [relCodes]);
    const getRelName = (code) => relMap.get(code) || code;

    // ----------------------------------------------------------------------------
    // 목록 로드
    // ----------------------------------------------------------------------------
    const load = async () => {
        if (!studentId) { setFamilyLinks([]); return; }
        setLoading(true);
        try {
            const fl = await listStudentFamilies(studentId);
            setFamilyLinks(Array.isArray(fl) ? fl : (fl?.content || []));
        } catch {
            setFamilyLinks([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, [studentId]);

    // ----------------------------------------------------------------------------
    // 보호자 마스터 검색
    // ----------------------------------------------------------------------------
    const searchFamilies = async () => {
        if (!pickKey.trim()) return safeInfo('입력', '검색어를 입력하세요.');

        setPickLoading(true);
        setPickHasSearched(true);
        try {
            const res = await listFamiliesMaster({ keyword: pickKey, size: 30, page: 0 });
            setPickList(Array.isArray(res?.content) ? res.content : (Array.isArray(res) ? res : []));
        } catch {
            setPickList([]);
        } finally {
            setPickLoading(false);
        }
    };

    // ----------------------------------------------------------------------------
    // 보호자 연결 추가
    // ----------------------------------------------------------------------------
    const onLinkFamily = async (family) => {
        if (!relSel) return safeInfo('안내', '가족 관계를 선택해주세요.');
        if (!studentId) return safeError('오류', 'studentId가 없습니다.');
        if (!family?.id) return safeError('오류', 'guardianId가 없습니다.');

        try {
            await addStudentFamily(studentId, {
                guardianId: family.id,
                relationCode: relSel,
                primary: false,
                legalGuardian: true,
                receiveNotice: true,
                receiveBilling: true
            });

            await safeOk('성공', '보호자가 연결되었습니다.');

            // 모달 닫고 상태 초기화
            setPickOpen(false);
            setPickList([]);
            setPickKey('');
            setRelSel('');
            setPickHasSearched(false);

            await load();
            onChanged?.();
        } catch (e) {
            safeError('오류', e?.response?.data?.message || e?.message || '보호자 연결 실패');
        }
    };

    // ----------------------------------------------------------------------------
    // 보호자 연결 해제
    // ----------------------------------------------------------------------------
    const onUnlinkFamily = async (link) => {
        if (! (!link) || !link.linkId) return safeError('오류', '삭제 대상 ID 없음');

        const ok = await confirmDialog('해제', `'${link.guardianName}' 보호자와의 연결을 해제하시겠습니까?`);
        if (!ok) return;

        try {
            await removeStudentFamily(studentId, link.linkId);
            await safeOk('성공', '연결이 해제되었습니다.');
            await load();
            onChanged?.();
        } catch (e) {
            safeError('오류', e?.response?.data?.message || e?.message || '연결 해제 실패');
        }
    };

    return (
        <div className="space-y-3">
            {/* 상단 바 */}
            <div className="flex justify-between items-center bg-slate-800/50 p-3 rounded border border-slate-700">
                <div className="text-sm text-slate-300">
                    등록된 보호자: <b className="text-white">{familyLinks.length}명</b>
                </div>

                <button
                    className="aa-btn aa-btn-sm aa-btn-primary"
                    onClick={() => {
                        setPickOpen(true);
                        setPickKey('');
                        setPickList([]);
                        setRelSel('');
                        setPickLoading(false);
                        setPickHasSearched(false);
                    }}
                >
                    + 보호자 연결
                </button>
            </div>

            {/* 목록 */}
            <div className="aa-table-wrap border border-slate-700 rounded-lg overflow-hidden">
                <table className="aa-table w-full text-left">
                    <thead className="bg-slate-800 text-xs uppercase text-slate-400">
                    <tr>
                        <th className="px-4 py-3">관계</th>
                        <th className="px-4 py-3">이름</th>
                        <th className="px-4 py-3">연락처</th>
                        <th className="px-4 py-3 text-right">관리</th>
                    </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-700">
                    {loading && (
                        <tr>
                            <td colSpan={4} className="text-center py-8 text-slate-400">
                                불러오는 중…
                            </td>
                        </tr>
                    )}

                    {!loading && familyLinks.length === 0 && (
                        <tr>
                            <td colSpan={4} className="text-center py-8 text-slate-500">
                                연결된 보호자가 없습니다.
                            </td>
                        </tr>
                    )}

                    {familyLinks.map((g) => (
                        <tr key={g.linkId} className="hover:bg-slate-800/50">
                            <td className="px-4 py-3">
                                <span className="aa-badge">{getRelName(g.relationCode)}</span>
                            </td>
                            <td className="px-4 py-3 font-bold text-slate-200">{g.guardianName}</td>
                            <td className="px-4 py-3 text-slate-400">{g.guardianPhone}</td>
                            <td className="px-4 py-3 text-right">
                                <button className="aa-btn aa-btn-xs aa-btn-danger" onClick={() => onUnlinkFamily(g)}>
                                    해제
                                </button>
                            </td>
                        </tr>
                    ))}
                    </tbody>
                </table>
            </div>

            {/* 보호자 검색 모달 */}
            {pickOpen && (
                <Modal
                    title="보호자 검색"
                    onClose={() => setPickOpen(false)}
                    size="lg"
                    // ✅ 모달 패널 자체 스크롤은 최소화하고 내부 리스트만 스크롤되도록
                    contentClassName="overflow-hidden"
                >
                    <div className="space-y-4 min-h-[420px] flex flex-col">
                        {/* 검색/관계 선택 */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm text-slate-400 mb-1">관계</label>
                                <select
                                    className="aa-select w-full"
                                    value={relSel}
                                    onChange={e => setRelSel(e.target.value)}
                                >
                                    <option value="">선택</option>
                                    {relCodes.map(r => <option key={r.code} value={r.code}>{r.name}</option>)}
                                </select>

                                {/* 관계 미선택 안내(실수 방지) */}
                                {!relSel && (
                                    <div className="text-xs text-slate-500 mt-1">
                                        먼저 관계를 선택해야 <b className="text-slate-300">선택</b> 버튼이 활성화됩니다.
                                    </div>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm text-slate-400 mb-1">검색</label>
                                <div className="flex gap-2">
                                    <input
                                        className="aa-input w-full"
                                        placeholder="이름/전화번호로 검색"
                                        value={pickKey}
                                        onChange={e => setPickKey(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && searchFamilies()}
                                    />
                                    <button
                                        className="aa-btn aa-btn-primary"
                                        onClick={searchFamilies}
                                        disabled={pickLoading}
                                    >
                                        {pickLoading ? '검색 중…' : '검색'}
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* 결과 테이블 */}
                        <div className="flex-1 border border-slate-700 rounded bg-slate-900/30 overflow-hidden">
                            <div className="aa-table-wrap h-full overflow-auto">
                                <table
                                    className="aa-table w-full text-left"
                                    style={{ minWidth: 0, tableLayout: 'fixed' }} // ✅ 가로 스크롤 줄이기
                                >
                                    <colgroup>
                                        {/* 선택 버튼을 맨 앞에: 멀리 가지 않게! */}
                                        <col style={{ width: 96 }} />
                                        <col />
                                        <col style={{ width: 160 }} />
                                        <col style={{ width: 120 }} />
                                    </colgroup>

                                    <thead>
                                    <tr>
                                        <th className="text-center">선택</th>
                                        <th>이름</th>
                                        <th>연락처</th>
                                        <th>ID</th>
                                    </tr>
                                    </thead>

                                    <tbody>
                                    {!pickHasSearched && (
                                        <tr>
                                            <td colSpan={4} className="px-4 py-6 text-slate-400">
                                                검색어를 입력하고 <b className="text-white">검색</b>을 눌러 보호자를 찾으세요.
                                            </td>
                                        </tr>
                                    )}

                                    {pickHasSearched && !pickLoading && pickList.length === 0 && (
                                        <tr>
                                            <td colSpan={4} className="px-4 py-6 text-slate-500">
                                                검색 결과가 없습니다.
                                            </td>
                                        </tr>
                                    )}

                                    {pickList.map((f) => (
                                        <tr
                                            key={f.id}
                                            className={`hover:bg-slate-800/50 ${!relSel ? 'opacity-80' : ''}`}
                                            // UX: 더블클릭으로 빠른 선택 (관계 선택했을 때만)
                                            onDoubleClick={() => relSel && onLinkFamily(f)}
                                            title={relSel ? '더블클릭하면 선택됩니다' : '먼저 관계를 선택하세요'}
                                        >
                                            <td className="text-center">
                                                <button
                                                    className="aa-btn aa-btn-xs aa-btn-primary"
                                                    disabled={!relSel}
                                                    onClick={() => onLinkFamily(f)}
                                                >
                                                    선택
                                                </button>
                                            </td>

                                            <td className="px-2">
                                                <div className="font-bold text-slate-200 truncate">{f.name}</div>
                                            </td>

                                            <td className="px-2 text-slate-300">
                                                {f.phone || '-'}
                                            </td>

                                            <td className="px-2">
                                                <span className="aa-badge aa-badge--muted">{f.id}</span>
                                            </td>
                                        </tr>
                                    ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* 하단 */}
                        <div className="flex justify-end pt-2 border-t border-slate-700">
                            <button className="aa-btn" onClick={() => setPickOpen(false)}>닫기</button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}
