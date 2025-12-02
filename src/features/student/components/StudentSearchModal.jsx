// src/features/student/components/StudentSearchModal.jsx
// ============================================================================
// 학생 검색 모달
// - listStudents API를 사용하여 키워드, 학부, 지점으로 검색
// - [선택] 버튼으로 선택한 학생 객체를 부모에게 전달
// - ✅ [수정] 공통코드 Map을 받아 학부/소속관/상태 '이름' 표시
// ============================================================================

import React, { useEffect, useState, useMemo } from 'react';
import Modal from '@/common/components/ui/Modal.jsx';
// ✅ [수정] listStudents (Summary DTO 반환)
import { listStudents } from '@/features/student/api/studentApi.js';

export default function StudentSearchModal({
                                               open,
                                               onClose,
                                               onSelect,
                                               title = '학생 검색',
                                               excludeId = null, // (선택) 자기 자신은 제외
                                               // ✅ [신규] 이름 변환을 위한 공통코드 Map
                                               stageCodes = [],
                                               locCodes = [],
                                               statusCodes = [],
                                           }) {
    const [keyword, setKeyword] = useState('');
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);

    // ✅ [신규] 코드 -> 이름 변환 맵
    const stgMap = useMemo(() => new Map(stageCodes.map(c => [c.code, c.name])), [stageCodes]);
    const locMap = useMemo(() => new Map(locCodes.map(c => [c.code, c.name])), [locCodes]);
    const statusMap = useMemo(() => new Map(statusCodes.map(c => [c.code, c.name])), [statusCodes]);

    const stgName = (c) => stgMap.get(c) || c;
    const locName = (c) => locMap.get(c) || c;
    const statusName = (c) => statusMap.get(c) || c;


    //
    const search = async () => {
        setLoading(true);
        try {
            // ✅ [수정] listStudents는 이제 StudentSummary[]를 반환
            const res = await listStudents({ keyword: keyword || undefined, size: 20, page: 0 });
            const rows = Array.isArray(res?.content) ? res.content : (Array.isArray(res) ? res : []);

            //
            const filtered = excludeId
                ? rows.filter(s => s.id !== excludeId)
                : rows;

            setResults(filtered);
        } catch {
            setResults([]);
        } finally {
            setLoading(false);
        }
    };

    //
    useEffect(() => {
        if (open) {
            setKeyword('');
            setResults([]);
            setLoading(false);
        }
    }, [open]);

    return (
        <Modal title={title} onClose={onClose} size="2xl">
            <div className="space-y-3">
                <div className="flex gap-2">
                    <input
                        className="aa-input flex-1"
                        placeholder="학생명/연락처/이메일/로그인ID"
                        value={keyword}
                        onChange={e => setKeyword(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') search(); }}
                    />
                    <button
                        className="aa-btn"
                        disabled={loading}
                        onClick={search}
                    >
                        {loading ? '검색 중…' : '검색'}
                    </button>
                </div>

                <div className="aa-table-wrap max-h-[60vh] overflow-auto">
                    <table className="aa-table">
                        <thead>
                        <tr>
                            <th>이름</th>
                            <th>학부</th>
                            <th>소속관</th>
                            <th>상태</th>
                            <th style={{width:80}}></th>
                        </tr>
                        </thead>
                        <tbody>
                        {results.length === 0 && (
                            <tr><td colSpan={5}>검색 결과가 없습니다.</td></tr>
                        )}
                        {results.map(s => (
                            <tr key={s.id}>
                                <td>{s.name}</td>
                                {/* ✅ [수정] 코드가 아닌 이름 표시 */}
                                <td>{stgName(s.schoolStage)}</td>
                                <td>{locName(s.workLocationCode)}</td>
                                <td>{statusName(s.status)}</td>
                                <td>
                                    <button
                                        className="aa-btn aa-btn-primary aa-btn-sm"
                                        onClick={() => {
                                            onSelect?.(s);
                                            onClose();
                                        }}
                                    >
                                        선택
                                    </button>
                                </td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </Modal>
    );
}