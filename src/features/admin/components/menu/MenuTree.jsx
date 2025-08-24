// src/features/admin/components/menu/MenuTree.jsx
import React from 'react';
import { TYPES } from '@/features/admin/pages/MenuManagePage';

function TreeNode({ node, selectedId, onSelect }) {
    const isSelected = selectedId === node.id;
    return (
        <div className="menu-node">
            <button
                className={`menu-node-btn ${isSelected ? 'on' : ''}`}
                onClick={() => onSelect(node)}
                title={node.name}
            >
                <span className="menu-node-depth">{node.depth}D</span>
                <span className="menu-node-name">{node.name}</span>
                <span className={`menu-node-type ${node.type === TYPES.FOLDER ? 'folder' : 'screen'}`}>
          {node.type}
        </span>
            </button>
            {node.children?.length > 0 && (
                <div className="menu-node-children">
                    {node.children.map(c => (
                        <TreeNode key={c.id} node={c} selectedId={selectedId} onSelect={onSelect} />
                    ))}
                </div>
            )}
        </div>
    );
}

export default function MenuTree({ tree, selectedId, onSelect }) {
    return (
        <div className="menu-tree">
            {tree.map(n => (
                <TreeNode key={n.id} node={n} selectedId={selectedId} onSelect={onSelect} />
            ))}
        </div>
    );
}
