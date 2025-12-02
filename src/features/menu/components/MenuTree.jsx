// src/features/menu/components/MenuTree.jsx
// ============================================================================
// 메뉴 트리(좌측) — 접기/펼치기 & 키보드 접근성 & 자동 스크롤
// - caret(▶/▼)로 FOLDER 노드 접기/펼치기
// - 선택된 노드가 접힌 영역에 있으면 그 경로의 부모를 자동으로 펼침
// - 선택된 노드로 "가까운 영역" 스크롤
// - 순환 import 제거(타입 상수 로컬 사용)
// - role="tree" / "group" / "treeitem" 등 접근성 속성 추가
// ============================================================================

import React, { useEffect, useMemo, useRef, useState } from 'react';

/** 타입 상수(순환 import 방지) */
const TYPES = { FOLDER: 'FOLDER', SCREEN: 'SCREEN' };

/** 선택 id까지의 경로(id 집합) → 자동 확장에 사용 */
function collectPathToSelected(nodes = [], selectedId) {
    const path = new Set();
    const dfs = (list, parents = []) => {
        for (const n of list || []) {
            const chain = [...parents, n];
            if (n.id === selectedId) chain.forEach((p) => path.add(p.id));
            if (n.children?.length) dfs(n.children, chain);
        }
    };
    dfs(nodes);
    return path;
}

/** 안전한 depth 표시 */
const depthLabel = (d) => (d ?? '-');

export default function MenuTree({
                                     tree = [],
                                     selectedId = null,
                                     onSelect = () => {},
                                     /** 렌더 시 기본 확장할 최대 뎁스(1=루트만, 2=루트+자식 …) */
                                     defaultExpandedDepth = 2,
                                 }) {
    const [expanded, setExpanded] = useState(() => new Map());
    const pathToSelected = useMemo(
        () => collectPathToSelected(tree, selectedId),
        [tree, selectedId]
    );

    // 최초/갱신 시 기본 확장 보정
    useEffect(() => {
        if (!tree?.length) return;
        setExpanded((prev) => {
            const next = new Map(prev);
            const applyDepth = (nodes, depth = 1) => {
                for (const n of nodes) {
                    if (depth <= defaultExpandedDepth) next.set(n.id, true);
                    if (n.children?.length) applyDepth(n.children, depth + 1);
                }
            };
            applyDepth(tree, 1);
            return next;
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tree]);

    // 선택 경로 강제 확장
    useEffect(() => {
        if (!pathToSelected.size) return;
        setExpanded((prev) => {
            const next = new Map(prev);
            pathToSelected.forEach((id) => next.set(id, true));
            return next;
        });
    }, [pathToSelected]);

    // 선택된 노드로 자동 스크롤
    const selectedRef = useRef(null);
    useEffect(() => {
        if (selectedRef.current) {
            selectedRef.current.scrollIntoView({ block: 'nearest' });
        }
    }, [selectedId]);

    // caret 토글
    const toggle = (id) => {
        setExpanded((prev) => {
            const next = new Map(prev);
            next.set(id, !next.get(id));
            return next;
        });
    };

    return (
        <div className="menu-tree" role="tree" aria-label="메뉴 트리">
            {tree.map((node) => (
                <TreeNode
                    key={node.id}
                    node={node}
                    expanded={expanded}
                    onToggle={toggle}
                    selectedId={selectedId}
                    onSelect={onSelect}
                    selectedRef={selectedRef}
                />
            ))}
        </div>
    );
}

function TreeNode({
                      node,
                      expanded,
                      onToggle,
                      selectedId,
                      onSelect,
                      selectedRef,
                  }) {
    const hasChildren = Array.isArray(node.children) && node.children.length > 0;
    const isFolder = node.type === TYPES.FOLDER;
    const isExpanded = !!expanded.get(node.id);
    const isSelected = selectedId === node.id;

    // caret 키보드 토글
    const onCaretKey = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (isFolder) onToggle(node.id);
        }
    };

    // 더블클릭으로도 토글
    const onRowDoubleClick = () => { if (isFolder) onToggle(node.id); };

    return (
        <div className="menu-node" data-id={node.id} role="group">
            {/* 한 줄(row): caret + 선택 버튼 */}
            <div className="menu-row" onDoubleClick={onRowDoubleClick}>
                {/* caret: 폴더만 활성화 */}
                <div
                    className={`menu-caret ${isFolder ? (isExpanded ? 'expanded' : '') : 'disabled'}`}
                    role={isFolder ? 'button' : 'presentation'}
                    tabIndex={isFolder ? 0 : -1}
                    aria-label={isFolder ? (isExpanded ? '접기' : '펼치기') : undefined}
                    aria-expanded={isFolder ? isExpanded : undefined}
                    onClick={isFolder ? () => onToggle(node.id) : undefined}
                    onKeyDown={onCaretKey}
                >
                    <span className="caret" />
                </div>

                {/* 노드 선택 버튼 */}
                <button
                    className={`menu-node-btn ${isSelected ? 'on' : ''}`}
                    onClick={() => onSelect(node)}
                    ref={isSelected ? selectedRef : null}
                    title={node.name}
                    role="treeitem"
                    aria-current={isSelected ? 'true' : 'false'}
                    aria-selected={isSelected}
                >
                    <span className="menu-node-depth">{depthLabel(node.depth)}D</span>
                    <span className="menu-node-name">{node.name}</span>
                    <span className={`menu-node-type ${isFolder ? 'folder' : 'screen'}`}>
                        {node.type}
                    </span>
                </button>
            </div>

            {/* 자식 (펼침 상태일 때만) */}
            {hasChildren && isExpanded && (
                <div className="menu-node-children" role="group" aria-label={`${node.name} 하위`}>
                    {node.children.map((child) => (
                        <TreeNode
                            key={child.id}
                            node={child}
                            expanded={expanded}
                            onToggle={onToggle}
                            selectedId={selectedId}
                            onSelect={onSelect}
                            selectedRef={selectedRef}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}