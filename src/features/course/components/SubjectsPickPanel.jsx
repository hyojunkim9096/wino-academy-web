// src/features/course/components/SubjectPickPanel.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { listSubjectsByParent } from '@/features/subject/api/academySubjectApi.js';
// ✅ 변경: academyClassApi -> academyCourseApi, 함수명 변경
import { listCourseSubjects, addCourseSubject, removeCourseSubject } from '@/features/course/api/academyCourseApi.js';
import { alertError, confirmDialog } from '@/common/ui/alert.js';

async function buildSubjectIndex(stageCode) {
    const nameById = {};
    const parentById = {};
    const childrenByParent = {};

    const roots = await listSubjectsByParent(stageCode, null).catch(() => []);
    childrenByParent[null] = roots || [];
    (roots || []).forEach((n) => {
        nameById[n.id] = n.name;
    });

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
    const [nameById, setNameById] = useState({});
    const [parentById, setParentById] = useState({});
    const [childrenByParent, setChildrenByParent] = useState({});
    const [roots, setRoots] = useState([]);
    const [parentId, setParentId] = useState(null);
    const children = useMemo(() => childrenByParent[parentId] || [], [childrenByParent, parentId]);

    const [items, setItems] = useState([]);
    const [hoverChildId, setHoverChildId] = useState(null);
    const [busy, setBusy] = useState(false);

    const sName = (sid) => nameById[sid] || `#${sid}`;

    const loadAssigned = async () => {
        // ✅ 변경: listClassSubjects -> listCourseSubjects
        const rows = await listCourseSubjects(classId).catch(() => []);
        setItems(Array.isArray(rows) ? rows : []);
        return Array.isArray(rows) ? rows : [];
    };

    useEffect(() => {
        let alive = true;
        (async () => {
            if (!stageCode || !classId) {
                setNameById({}); setParentById({}); setChildrenByParent({}); setRoots([]); setItems([]); setParentId(null);
                return;
            }

            try {
                const idx = await buildSubjectIndex(stageCode);
                if (!alive) return;
                setNameById(idx.nameById || {});
                setParentById(idx.parentById || {});
                setChildrenByParent(idx.childrenByParent || {});
                setRoots(idx.roots || []);

                const assigned = await loadAssigned();
                if (!alive) return;

                let nextParent = null;
                if (assigned.length > 0) {
                    const first = assigned[0];
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
                setNameById({}); setParentById({}); setChildrenByParent({}); setRoots([]); setItems([]); setParentId(null);
            }
        })();
        return () => { alive = false; };
    }, [classId, stageCode]);

    const pickParent = (p) => {
        setParentId(p?.id ?? null);
        setHoverChildId(null);
    };

    const addOne = async (subjectId) => {
        if (busy) return;
        setBusy(true);
        try {
            // ✅ 변경: addClassSubject -> addCourseSubject
            await addCourseSubject(classId, subjectId, null);
            await loadAssigned();
        } catch (e) {
            const msg = e?.response?.data?.message || e.message || '과목 추가에 실패했습니다.';
            await alertError('실패', msg);
        } finally {
            setBusy(false);
        }
    };

    const removeOneBySubject = async (subjectId) => {
        if (busy) return;
        const target = (items || []).find((i) => i.subjectId === subjectId);
        if (!target) return;

        const ok = await confirmDialog('확인', '이 과목을 제거할까요?', { confirmText: '제거', cancelText: '취소' });
        if (!ok) return;

        setBusy(true);
        try {
            // ✅ 변경: removeClassSubject -> removeCourseSubject
            await removeCourseSubject(classId, target.id);
            await loadAssigned();
        } catch (e) {
            const msg = e?.response?.data?.message || e.message || '과목 제거에 실패했습니다.';
            await alertError('실패', msg);
        } finally {
            setBusy(false);
        }
    };

    const removeOneByRow = async (rowId) => {
        if (busy) return;
        const ok = await confirmDialog('확인', '이 과목을 제거할까요?', { confirmText: '제거', cancelText: '취소' });
        if (!ok) return;

        setBusy(true);
        try {
            // ✅ 변경: removeClassSubject -> removeCourseSubject
            await removeCourseSubject(classId, rowId);
            await loadAssigned();
        } catch (e) {
            const msg = e?.response?.data?.message || e.message || '과목 제거에 실패했습니다.';
            await alertError('실패', msg);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="subject-tray">
            <div className="tr-col">
                <div className="tr-col-title">과목 카테고리</div>
                {(roots || []).map((n) => (
                    <div
                        key={n.id}
                        className={`tr-node ${parentId === n.id ? 'on' : ''}`}
                        onClick={() => pickParent(n)}
                        tabIndex={0} role="button" title={n.name}
                    >
                        <span className="aa-ellipsis" title={n.name}>{n.name}</span>
                    </div>
                ))}
                {!roots?.length && <div className="aa-subtle">카테고리가 없습니다.</div>}
            </div>

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
                                <span className="aa-ellipsis" title={n.name}>{n.name}</span>
                            </div>
                            <div className="tr-row-actions">
                                {n.isLeaf ? (
                                    <>
                                        <button className="aa-btn aa-btn-primary aa-btn-xs" onClick={() => addOne(n.id)} disabled={assigned || busy} title={assigned ? '이미 추가됨' : '추가'}>추가</button>
                                        <button className="aa-btn aa-btn-danger aa-btn-xs" onClick={() => removeOneBySubject(n.id)} disabled={!assigned || busy} title={!assigned ? '아직 추가되지 않음' : '제거'}>제거</button>
                                    </>
                                ) : (
                                    <button className="aa-btn aa-btn-outline aa-btn-xs" onClick={() => pickParent(n)} disabled={busy}>하위보기</button>
                                )}
                            </div>
                        </div>
                    );
                })}
                {(!children || children.length === 0) && (
                    <div className="aa-subtle">이 카테고리에 세부 과목이 없습니다. 다른 카테고리를 선택해 보세요.</div>
                )}
            </div>

            <div className="tr-col">
                <div className="tr-col-title">저장된 과목</div>
                {!items?.length && <div className="aa-subtle">아직 선택된 과목이 없습니다.</div>}
                <ul className="saved-list">
                    {(items || []).map((i) => (
                        <li key={i.id} className="saved-row">
                            <div className="saved-name" title={sName(i.subjectId)}>{sName(i.subjectId)}</div>
                            <div className="saved-actions">
                                <button className="aa-btn aa-btn-danger aa-btn-xs" onClick={() => removeOneByRow(i.id)} disabled={busy}>제거</button>
                            </div>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}