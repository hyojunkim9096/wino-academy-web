// src/features/student/components/dnd/SortableItem.jsx
// DnD 정렬 항목 공용 래퍼
// - @dnd-kit/sortable 사용
// - 좌상단 작은 '::' 버튼이 드래그 핸들 역할
// - 스타일은 admin-academy.css 의 .dnd-item / .dnd-handle 클래스 사용

import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

export default function SortableItem({ id, children }) {
    const { attributes, listeners, setNodeRef, transform, transition } =
        useSortable({ id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    return (
        <li
            ref={setNodeRef}
            style={style}
            className="dnd-item"
            aria-roledescription="Draggable item"
        >
            <button
                type="button"
                className="dnd-handle"
                aria-label="Drag handle"
                {...attributes}
                {...listeners}
            >
                ::
            </button>
            {children}
        </li>
    );
}
