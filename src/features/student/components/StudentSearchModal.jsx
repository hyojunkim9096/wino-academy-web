// src/features/student/components/StudentSearchModal.jsx
// ============================================================================
// 학생 검색 모달 (형제 연결에서 사용)
// ----------------------------------------------------------------------------
// 하는 일
//  - listStudents API로 학생 검색 (키워드)
//  - [선택]으로 선택한 학생 객체를 부모(StudentSiblingTab)로 전달
//
// ✅ UI/UX 개선(이번 변경)
//  1) 학부/소속관/상태를 공통코드 "이름"으로 표시
//  2) 동명이인 구분을 위해 생년월일(birthdate) 표기
//  3) [선택] 버튼을 "왼쪽 첫 컬럼"으로 배치해 멀리 가지 않게 개선
//  4) .aa-table 기본 min-width(760px) 때문에 모달에서 가로 스크롤이 생길 수 있어
//     inline style로 minWidth 제거 + tableLayout fixed 적용
// ============================================================================

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import Modal from '@/common/components/ui/Modal.jsx';
import { listStudents } from '@/features/student/api/studentApi.js';

// 날짜 표시 유틸: "YYYY-MM-DD" 형태면 그대로 보여주고, 없으면 '-'
function formatBirthdate(v) {
    if (!v) return '-';
    // 백엔드가 LocalDate → "2020-01-02" 형태로 내려주는 케이스가 일반적
    if (typeof v === 'string' && v.length >= 10) return v.slice(0, 10);
    return String(v);
}

export default function StudentSearchModal({
                                               onClose,
                                               onSelect,
                                               title = '학생 검색',
                                               excludeId = null, // 자기 자신 제외

                                               // 공통코드 목록(부모 탭에서 전달)
                                               stageCodes = [],
                                               locCodes = [],
                                               statusCodes = [],
                                           }) {
    const [keyword, setKeyword] = useState('');
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);

    // “처음 열렸을 때” 안내 문구를 다르게 보여주기 위한 플래그
    const [hasSearched, setHasSearched] = useState(false);

    // ----------------------------------------------------------------------------
    // 코드 -> 이름 변환 맵
    // ----------------------------------------------------------------------------
    const stgMap = useMemo(() => new Map(stageCodes.map(c => [c.code, c.name])), [stageCodes]);
    const locMap = useMemo(() => new Map(locCodes.map(c => [c.code, c.name])), [locCodes]);
    const statusMap = useMemo(() => new Map(statusCodes.map(c => [c.code, c.name])), [statusCodes]);

    const stgName = (c) => stgMap.get(c) || c || '-';
    const locName = (c) => locMap.get(c) || c || '-';
    const statusName = (c) => statusMap.get(c) || c || '-';

    // ----------------------------------------------------------------------------
    // 검색 실행
    // ----------------------------------------------------------------------------
    const search = useCallback(async () => {
        setLoading(true);
        setHasSearched(true);
        try {
            const res = await listStudents({ keyword: keyword || undefined, size: 30, page: 0 });

            // API가 Page 형태(content) 또는 배열 형태 둘 다 커버
            const rows = Array.isArray(res?.content) ? res.content : (Array.isArray(res) ? res : []);

            const filtered = excludeId ? rows.filter(s => s?.id !== excludeId) : rows;
            setResults(filtered);
        } catch {
            setResults([]);
        } finally {
            setLoading(false);
        }
    }, [keyword, excludeId]);

    // ----------------------------------------------------------------------------
    // 모달 열릴 때 초기화(이 컴포넌트는 조건부 렌더로 mount/unmount 되므로 mount 시 초기화)
    // ----------------------------------------------------------------------------
    useEffect(() => {
        setKeyword('');
        setResults([]);
        setLoading(false);
        setHasSearched(false);
    }, []);

    return (
        <Modal
            title={title}
            onClose={onClose}
            size="2xl"
            // ✅ 모달 자체 스크롤은 유지하되, 가로 스크롤이 과하게 생기지 않도록 내부에서 제어
            contentClassName="overflow-hidden"
        >
            <div className="space-y-3">
                {/* 검색바 */}
                <div className="flex gap-2">
                    <input
                        className="aa-input flex-1"
                        placeholder="학생명 / 연락처 / 이메일 / 로그인ID"
                        value={keyword}
                        onChange={e => setKeyword(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') search(); }}
                    />
                    <button
                        className="aa-btn aa-btn-primary"
                        disabled={loading}
                        onClick={search}
                        title="Enter로도 검색됩니다"
                    >
                        {loading ? '검색 중…' : '검색'}
                    </button>
                </div>

                {/* 결과 영역 */}
                <div className="border border-slate-700 rounded-lg overflow-hidden">
                    <div className="aa-table-wrap max-h-[60vh] overflow-auto">
                        <table
                            className="aa-table w-full"
                            // ✅ .aa-table 기본 min-width(760px) 때문에 모달에서 가로 스크롤이 생길 수 있음
                            //    => inline style로 minWidth 제거 + 고정 레이아웃 사용
                            style={{ minWidth: 0, tableLayout: 'fixed' }}
                        >
                            <colgroup>
                                {/* [선택]을 왼쪽에 두고 폭을 작게 고정 */}
                                <col style={{ width: 96 }} />
                                {/* 이름(생년월일 포함) */}
                                <col />
                                {/* 학부 */}
                                <col style={{ width: 140 }} />
                                {/* 소속관 */}
                                <col style={{ width: 140 }} />
                                {/* 상태 */}
                                <col style={{ width: 120 }} />
                            </colgroup>

                            <thead>
                            <tr>
                                <th className="text-center">선택</th>
                                <th>이름 / 생년월일</th>
                                <th>학부</th>
                                <th>소속관</th>
                                <th>상태</th>
                            </tr>
                            </thead>

                            <tbody>
                            {/* 초기 안내 */}
                            {!hasSearched && (
                                <tr>
                                    <td colSpan={5} className="text-slate-400 px-4 py-6">
                                        검색어를 입력하고 <b className="text-white">검색</b>을 눌러 학생을 찾으세요.
                                        <div className="text-xs text-slate-500 mt-1">
                                            동명이인 구분을 위해 생년월일이 함께 표시됩니다.
                                        </div>
                                    </td>
                                </tr>
                            )}

                            {/* 검색 후 결과 없음 */}
                            {hasSearched && !loading && results.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="text-slate-500 px-4 py-6">
                                        검색 결과가 없습니다.
                                    </td>
                                </tr>
                            )}

                            {/* 결과 */}
                            {results.map((s) => {
                                const birth = formatBirthdate(s?.birthdate);
                                return (
                                    <tr
                                        key={s.id}
                                        className="hover:bg-slate-800/50"
                                        // UX: 행 클릭으로도 선택 가능(버튼이 멀리 있지 않게 했지만, 추가 편의)
                                        onDoubleClick={() => { onSelect?.(s); onClose?.(); }}
                                        title="더블클릭하면 바로 선택됩니다"
                                    >
                                        <td className="text-center">
                                            <button
                                                className="aa-btn aa-btn-primary aa-btn-sm"
                                                onClick={() => {
                                                    onSelect?.(s);
                                                    onClose?.();
                                                }}
                                            >
                                                선택
                                            </button>
                                        </td>

                                        <td className="px-2">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <div className="font-bold text-slate-200 truncate">
                                                    {s.name || '-'}
                                                </div>
                                                <span className="aa-badge aa-badge--muted">
                            {birth}
                          </span>
                                            </div>
                                            <div className="text-xs text-slate-500 mt-0.5">
                                                ID: {s.id}
                                            </div>
                                        </td>

                                        <td className="px-2">
                                            <span className="aa-badge">{stgName(s.schoolStage)}</span>
                                        </td>

                                        <td className="px-2">
                                            <span className="aa-badge">{locName(s.workLocationCode)}</span>
                                        </td>

                                        <td className="px-2">
                        <span className={`aa-badge ${s.status === 'ACTIVE' ? 'aa-badge--ok' : 'aa-badge--muted'}`}>
                          {statusName(s.status)}
                        </span>
                                        </td>
                                    </tr>
                                );
                            })}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* 하단 안내/닫기 */}
                <div className="flex justify-between items-center pt-1">
                    <div className="text-xs text-slate-500">
                        팁: <b className="text-slate-300">더블클릭</b>하면 바로 선택됩니다.
                    </div>
                    <button className="aa-btn" onClick={onClose}>닫기</button>
                </div>
            </div>
        </Modal>
    );
}
