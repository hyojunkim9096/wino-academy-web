// src/features/member/pages/AdminGuardianPage.jsx
// ============================================================================
// 보호자 관리 화면 (v2 - 마스터/디테일 레이아웃)
// - 3:7 레이아웃 셸
// - 좌: 필터 + 목록 + "신규" 버튼
// - 우: viewMode ('detail' | 'create')에 따라 패널 교체
// ============================================================================

import React, {
    useEffect,
    useRef,
    useState,
    useCallback
} from 'react';

import { listGuardians } from '@/features/member/api/guardianApi.js';
import { alertError } from '@/common/ui/alert.js';

// 우측 패널 컴포넌트
import GuardianDetailPanel from '@/features/member/components/GuardianDetailPanel.jsx';
import GuardianFormPanel from '@/features/member/components/GuardianFormPanel.jsx';

import '@/features/system/styles/admin-system.css';
import '@/features/admin/styles/admin-shared.css';
import '@/features/member/styles/admin-guardian.css'; // 3:7 레이아웃 CSS

// SweetAlert 실패해도 페이지가 죽지 않도록 하는 안전 래퍼
const safeError = (t, m) =>
    Promise.resolve(alertError(t, m)).catch(() => {});

export default function AdminGuardianPage() {
    // ===========================
    // 필터 상태
    // ===========================
    const [keyword, setKeyword] = useState('');      // 실시간 입력값
    const [kwDebounced, setKwDebounced] = useState(''); // 디바운스된 검색어

    // ===========================
    // 목록/선택 상태
    // ===========================
    const [list, setList] = useState([]);           // 보호자 목록
    const [loading, setLoading] = useState(false);  // 목록 로딩 여부
    const [selectedId, setSelectedId] = useState(null); // 선택된 보호자 ID

    // 선택 ID를 useRef로도 보관 (비동기/콜백 내부에서 최신 값 참조용)
    const selectedIdRef = useRef(null);
    useEffect(() => {
        selectedIdRef.current = selectedId;
    }, [selectedId]);

    // ===========================
    // 우측 패널 상태
    //   - 'detail' : 상세 보기/편집 (GuardianDetailPanel)
    //   - 'create' : 신규 등록 (GuardianFormPanel)
    // ===========================
    const [viewMode, setViewMode] = useState('detail');

    // ===========================
    // 검색어 디바운스
    // ===========================
    useEffect(() => {
        const t = setTimeout(() => setKwDebounced(keyword.trim()), 250);
        return () => clearTimeout(t);
    }, [keyword]);

    // ===========================
    // 목록 조회
    // ===========================
    const inflight = useRef(0); // 비동기 응답 순서 제어용 토큰

    /**
     * 목록 조회
     * @param {boolean} keep - true면 selectedId를 가능한 한 유지, false면 첫 번째 행 선택
     */
    const loadList = useCallback(async (keep = false) => {
        setLoading(true);
        const my = ++inflight.current;
        try {
            const res = await listGuardians({
                keyword: kwDebounced || undefined,
                page: 0,
                size: 30
            });

            // 뒤늦게 온 응답이면 무시
            if (my !== inflight.current) return;

            const rows = Array.isArray(res?.content)
                ? res.content
                : (Array.isArray(res) ? res : []);

            // 이름 기준 정렬(한글 포함)
            rows.sort((a, b) =>
                (a.name || '').localeCompare(b.name || '', 'ko', { sensitivity: 'base' })
            );

            setList(rows);

            const currentSelectedId = selectedIdRef.current;

            if (!keep) {
                // 새 검색이거나 초기 진입: 첫 번째 항목 선택
                const firstId = rows[0]?.id ?? null;
                setSelectedId(firstId);
                setViewMode(firstId ? 'detail' : 'create');
            } else {
                // keep 모드: 기존 선택 유지 시도
                if (currentSelectedId && rows.some(r => r.id === currentSelectedId)) {
                    setSelectedId(currentSelectedId);
                    setViewMode('detail');
                } else {
                    const firstId = rows[0]?.id ?? null;
                    setSelectedId(firstId);
                    setViewMode(firstId ? 'detail' : 'create');
                }
            }
        } catch (e) {
            console.error(e);
            setList([]);
            safeError('오류', e?.response?.data?.message || '보호자 목록 조회 실패');
        } finally {
            if (my === inflight.current) {
                setLoading(false);
            }
        }
    }, [kwDebounced]); // ✅ selectedId 제거 → 신규 버튼 눌러도 자동 재조회 안됨

    // 최초 로드 + kwDebounced 변경 시 목록 재조회
    useEffect(() => {
        loadList(false);
    }, [loadList]);

    // ===========================
    // 핸들러
    // ===========================

    /** 목록에서 보호자 선택 */
    const onSelectRow = (id) => {
        setSelectedId(id);
        setViewMode('detail'); // 우측은 상세 보기 모드
    };

    /** "신규" 버튼 클릭 → 신규 등록 모드로 전환 */
    const onBeginCreate = () => {
        setSelectedId(null);    // 선택 해제
        setViewMode('create');  // 우측 패널을 신규 폼으로 전환
    };

    /** 신규 등록 취소 → 다시 상세 모드로, 목록 첫 번째 항목 선택 */
    const onCancelCreate = () => {
        setViewMode('detail');
        if (list.length > 0) {
            setSelectedId(list[0].id);
        } else {
            setSelectedId(null);
        }
    };

    /**
     * 신규 저장/수정 성공 시 콜백
     * - GuardianFormPanel에서 호출
     * - 목록을 keep 모드로 재조회 후, 방금 저장된 ID 선택
     */
    const onSaveSuccess = async (savedGuardian) => {
        await loadList(true); // 목록 유지 모드로 재조회
        if (savedGuardian?.id) {
            setSelectedId(savedGuardian.id);
        }
        setViewMode('detail');
    };

    // ===========================
    // 렌더링
    // ===========================
    return (
        <section className="aa-page academy-page guardian-page">
            <div className="aa-container">
                {/* 상단 툴바 */}
                <div className="aa-toolbar">
                    <h1 className="aa-title">보호자 관리</h1>
                    <div className="aa-toolbar-right">
                        <button
                            type="button"
                            className="aa-btn"
                            onClick={() => loadList(true)}
                        >
                            새로고침
                        </button>
                    </div>
                </div>

                {/* 3:7 스플릿 레이아웃 */}
                <div className="aa-split">
                    {/* =====================
                        좌측 패널 (30%) : 필터 + 목록 + 신규 버튼
                       ===================== */}
                    <div className="aa-card">
                        {/* 필터 + 신규 버튼 */}
                        <div className="flex gap-2 mb-2">
                            <input
                                className="aa-input w-full"
                                placeholder="이름/연락처/이메일/로그인ID"
                                value={keyword}
                                onChange={(e) => setKeyword(e.target.value)}
                            />
                            <button
                                type="button"
                                className="aa-btn aa-btn-primary"
                                onClick={onBeginCreate}
                            >
                                신규
                            </button>
                        </div>

                        {/* 목록 영역 */}
                        {loading ? (
                            <div className="p-3 text-slate-400">불러오는 중…</div>
                        ) : (
                            <div className="aa-panel guardian-list-panel divide-y">
                                {list.length === 0 && (
                                    <div className="p-3 text-slate-400">결과 없음</div>
                                )}

                                {list.map((row) => {
                                    const sel =
                                        selectedId === row.id && viewMode === 'detail';
                                    return (
                                        <button
                                            key={row.id}
                                            type="button"
                                            className={
                                                'w-full text-left p-3 relative ' +
                                                (sel
                                                    ? 'bg-slate-800 font-semibold'
                                                    : 'hover:bg-slate-800/60')
                                            }
                                            onClick={() => onSelectRow(row.id)}
                                        >
                                            {/* 선택 표시용 좌측 컬러 바 */}
                                            {sel && (
                                                <span
                                                    aria-hidden
                                                    className="absolute left-0 top-0 h-full"
                                                    style={{
                                                        width: 3,
                                                        background: 'var(--aa-accent)'
                                                    }}
                                                />
                                            )}
                                            <div className="truncate">{row.name}</div>
                                            <div className="text-xs text-slate-400 truncate">
                                                {row.phone || '-'}
                                                {row.loginId
                                                    ? ` · ${row.loginId}`
                                                    : ' (미연결)'}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* =====================
                        우측 패널 (70%)
                        - viewMode 에 따라 상세 / 신규 폼 전환
                       ===================== */}
                    <div className="aa-card">
                        {viewMode === 'create' ? (
                            <GuardianFormPanel
                                mode="create"
                                onSaveSuccess={onSaveSuccess}
                                onCancel={onCancelCreate}
                            />
                        ) : selectedId ? (
                            <GuardianDetailPanel
                                key={selectedId}           // 다른 보호자 선택 시 내부 state 초기화
                                guardianId={selectedId}
                                onListReload={() => loadList(true)} // 삭제/저장 후 목록 재조회
                            />
                        ) : (
                            <div className="p-4 text-slate-400">
                                좌측에서 대상을 선택하세요.
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </section>
    );
}
