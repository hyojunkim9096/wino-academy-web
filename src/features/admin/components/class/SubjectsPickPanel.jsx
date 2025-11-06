// src/features/admin/components/class/SubjectsPickPanel.jsx
// ============================================================================
// 목적: "과목 편성" 탭 (과목만 추가/제거)
//  - 화면 단순화: 과목/카테고리의 code 배지, "선택 카테고리" 박스, 경로(빵크럼) 제거
//    → 이름 + 버튼만 남김
//  - 초기 진입 UX:
//      • 등록된 과목(class_subject)이 있으면 → 그 과목의 "부모 카테고리"를 자동 선택
//        (중간 열이 바로 채워져서 ‘틀만 보이는’ 문제 방지)
//      • 없으면 루트의 첫 카테고리를 자동 선택
//  - 담당/시간 UI는 없음(담당 관리 탭에서 처리)
//  - ✅ 프로젝트 공용 알림(alertError/confirmDialog)로 일관된 UX
//  - ✅ 네트워크 에러 메시지 안전 처리
//  - ✅ 중복 클릭/중복 요청 방지용 busy 상태 추가(간단 글로벌 플래그)
// ============================================================================

import React, { useEffect, useMemo, useState } from 'react';
import { listSubjectsByParent } from '@/api/academySubjectApi';
import { listClassSubjects, addClassSubject, removeClassSubject } from '@/api/academyClassApi';
import { alertError, confirmDialog } from '@/ui/alert';

/**
 * 과목 트리 인덱스 구성 (간단 버전)
 *  - nameById:            { subjectId: name }
 *  - parentById:          { childId: parentId }
 *  - childrenByParent:    { parentId(null 가능): Node[] }
 *  - roots:               최상위 카테고리 배열
 *
 * 노드 스키마 가정: { id, name, isLeaf }
 * (code, 기타 필드는 사용하지 않으므로 수집하지 않음)
 *
 * ⚠️ 구현 메모
 *  - BFS로 전체 트리를 전개합니다(단순/명확). 대규모 트리라면 온디맨드 전개로 변경 가능.
 */
async function buildSubjectIndex(stageCode) {
    const nameById = {};
    const parentById = {};
    const childrenByParent = {};

    // 1) 최상위(루트) 카테고리
    const roots = await listSubjectsByParent(stageCode, null).catch(() => []);
    childrenByParent[null] = roots || [];
    (roots || []).forEach((n) => {
        nameById[n.id] = n.name;
    });

    // 2) BFS로 하위 전개(리프는 children 호출 불필요)
    const q = [...(roots || [])];
    while (q.length) {
        const cur = q.shift();
        if (!cur || cur.isLeaf) continue;
        const kids = await listSubjectsByParent(stageCode, cur.id).catch(() => []);
        childrenByParent[cur.id] = kids || [];
        (kids || []).forEach((ch) => {
            parentById[ch.id] = cur.id;
            nameById[ch.id] = ch.name;
            if (!ch.isLeaf) q.push(ch);
        });
    }

    return { nameById, parentById, childrenByParent, roots };
}

export default function SubjectsPickPanel({ classId, stageCode }) {
    // ─────────────────────────────────────────────────────────────
    // 인덱스/선택 상태
    // ─────────────────────────────────────────────────────────────
    const [nameById, setNameById] = useState({});
    const [parentById, setParentById] = useState({});
    const [childrenByParent, setChildrenByParent] = useState({});
    const [roots, setRoots] = useState([]);

    // 현재 선택된 부모 카테고리 id
    const [parentId, setParentId] = useState(null);

    // 중간 열(children): parentId 기준
    const children = useMemo(() => childrenByParent[parentId] || [], [childrenByParent, parentId]);

    // 저장된 과목(class_subject rows)
    const [items, setItems] = useState([]); // [{ id, subjectId, ... }]
    const [hoverChildId, setHoverChildId] = useState(null);

    // 전역 busy: 추가/제거 중에는 버튼 비활성
    const [busy, setBusy] = useState(false);

    // 이름 헬퍼
    const sName = (sid) => nameById[sid] || `#${sid}`;

    // ─────────────────────────────────────────────────────────────
    // 데이터 로드
    // ─────────────────────────────────────────────────────────────
    const loadAssigned = async () => {
        const rows = await listClassSubjects(classId).catch(() => []);
        setItems(Array.isArray(rows) ? rows : []);
        return Array.isArray(rows) ? rows : [];
    };

    // 초기 로드: 트리 인덱스 + 등록 과목 → parentId 초기값 결정
    useEffect(() => {
        let alive = true;
        (async () => {
            // 인풋 가드
            if (!stageCode || !classId) {
                setNameById({});
                setParentById({});
                setChildrenByParent({});
                setRoots([]);
                setItems([]);
                setParentId(null);
                return;
            }

            try {
                // 1) 트리 인덱스 생성
                const idx = await buildSubjectIndex(stageCode);
                if (!alive) return;
                setNameById(idx.nameById || {});
                setParentById(idx.parentById || {});
                setChildrenByParent(idx.childrenByParent || {});
                setRoots(idx.roots || []);

                // 2) 등록 과목 로드
                const assigned = await loadAssigned();
                if (!alive) return;

                // 3) 초기 parent 선택
                //    - 등록 과목이 있으면 첫 과목의 부모 카테고리
                //    - 없으면 루트의 첫 항목
                let nextParent = null;
                if (assigned.length > 0) {
                    const first = assigned[0]; // { subjectId, ... }
                    const p = idx.parentById[first.subjectId];
                    if (p != null) nextParent = p;
                }
                if (nextParent == null && (idx.roots || []).length) {
                    nextParent = idx.roots[0].id;
                }
                setParentId(nextParent);
            } catch (e) {
                const msg = e?.response?.data?.message || e.message || '과목 트리를 불러오지 못했습니다.';
                await alertError('오류', msg);
                if (!alive) return;
                // 오류 시 빈 상태로 폴백
                setNameById({});
                setParentById({});
                setChildrenByParent({});
                setRoots([]);
                setItems([]);
                setParentId(null);
            }
        })();
        return () => {
            alive = false;
        };
    }, [classId, stageCode]);

    // ─────────────────────────────────────────────────────────────
    // 이벤트 핸들러
    // ─────────────────────────────────────────────────────────────
    const pickParent = (p) => {
        setParentId(p?.id ?? null);
        setHoverChildId(null);
    };

    /** 과목 추가 */
    const addOne = async (subjectId) => {
        if (busy) return;
        setBusy(true);
        try {
            await addClassSubject(classId, subjectId, null);
            await loadAssigned();
        } catch (e) {
            const msg = e?.response?.data?.message || e.message || '과목 추가에 실패했습니다.';
            await alertError('실패', msg);
        } finally {
            setBusy(false);
        }
    };

    /** 과목 제거(중앙 열에서 subjectId 기준) */
    const removeOneBySubject = async (subjectId) => {
        if (busy) return;
        const target = (items || []).find((i) => i.subjectId === subjectId);
        if (!target) return;

        // 선택적 확인창 — 실수 클릭 방지
        const ok = await confirmDialog('확인', '이 과목을 제거할까요?', {
            confirmText: '제거',
            cancelText: '취소',
        });
        if (!ok) return;

        setBusy(true);
        try {
            await removeClassSubject(classId, target.id);
            await loadAssigned();
        } catch (e) {
            const msg = e?.response?.data?.message || e.message || '과목 제거에 실패했습니다.';
            await alertError('실패', msg);
        } finally {
            setBusy(false);
        }
    };

    /** 과목 제거(우측 "저장된 과목" 영역: row id 기준) */
    const removeOneByRow = async (rowId) => {
        if (busy) return;
        const ok = await confirmDialog('확인', '이 과목을 제거할까요?', {
            confirmText: '제거',
            cancelText: '취소',
        });
        if (!ok) return;

        setBusy(true);
        try {
            await removeClassSubject(classId, rowId);
            await loadAssigned();
        } catch (e) {
            const msg = e?.response?.data?.message || e.message || '과목 제거에 실패했습니다.';
            await alertError('실패', msg);
        } finally {
            setBusy(false);
        }
    };

    // ─────────────────────────────────────────────────────────────
    // 렌더
    // ─────────────────────────────────────────────────────────────
    return (
        <div className="subject-tray">
            {/* (A) 좌: 과목 카테고리 (이름만 표시) */}
            <div className="tr-col">
                <div className="tr-col-title">과목 카테고리</div>

                {(roots || []).map((n) => (
                    <div
                        key={n.id}
                        className={`tr-node ${parentId === n.id ? 'on' : ''}`}
                        onClick={() => pickParent(n)}
                        tabIndex={0}
                        role="button"
                        title={n.name}
                    >
                        <span className="aa-ellipsis" title={n.name}>
                            {n.name}
                        </span>
                        {/* code/배지/설명 제거 */}
                    </div>
                ))}

                {!roots?.length && <div className="aa-subtle">카테고리가 없습니다.</div>}
            </div>

            {/* (B) 중간: 세부 과목 (이름 + 버튼만) */}
            <div className="tr-col">
                <div className="tr-col-title">세부 과목</div>

                {(children || []).map((n) => {
                    const assigned = (items || []).some((i) => i.subjectId === n.id);
                    return (
                        <div
                            key={n.id}
                            className={`tr-row ${hoverChildId === n.id ? 'tr-row--active' : ''}`}
                            onMouseEnter={() => setHoverChildId(n.id)}
                            onMouseLeave={() => setHoverChildId(null)}
                            title={n.name}
                        >
                            <div className="tr-row-left">
                                <span className="aa-ellipsis" title={n.name}>
                                    {n.name}
                                </span>
                                {/* code/“과목·카테고리” 배지 제거 */}
                            </div>
                            <div className="tr-row-actions">
                                {n.isLeaf ? (
                                    <>
                                        <button
                                            className="aa-btn aa-btn-primary aa-btn-xs"
                                            onClick={() => addOne(n.id)}
                                            disabled={assigned || busy}
                                            title={assigned ? '이미 추가됨' : '추가'}
                                        >
                                            추가
                                        </button>
                                        <button
                                            className="aa-btn aa-btn-danger aa-btn-xs"
                                            onClick={() => removeOneBySubject(n.id)}
                                            disabled={!assigned || busy}
                                            title={!assigned ? '아직 추가되지 않음' : '제거'}
                                        >
                                            제거
                                        </button>
                                    </>
                                ) : (
                                    <button className="aa-btn aa-btn-outline aa-btn-xs" onClick={() => pickParent(n)} disabled={busy}>
                                        하위보기
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}

                {(!children || children.length === 0) && (
                    <div className="aa-subtle">이 카테고리에 세부 과목이 없습니다. 다른 카테고리를 선택해 보세요.</div>
                )}
            </div>

            {/* (C) 우: 저장된 과목 (이름 + 제거만) */}
            <div className="tr-col">
                <div className="tr-col-title">저장된 과목</div>

                {!items?.length && <div className="aa-subtle">아직 선택된 과목이 없습니다.</div>}

                <ul className="saved-list">
                    {(items || []).map((i) => (
                        <li key={i.id} className="saved-row">
                            {/* 과목명만 표시 (코드 배지 제거) */}
                            <div className="saved-name" title={sName(i.subjectId)}>
                                {sName(i.subjectId)}
                            </div>
                            <div className="saved-actions">
                                <button className="aa-btn aa-btn-danger aa-btn-xs" onClick={() => removeOneByRow(i.id)} disabled={busy}>
                                    제거
                                </button>
                            </div>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}