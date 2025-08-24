// src/components/ui/Modal.jsx
import React, { useEffect } from 'react';

/** 공통 모달 (배경 클릭/ESC로 닫기) */
export default function Modal({ title, children, onClose, className = '' }) {
    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center">
            <div className="absolute inset-0 bg-black/60" onClick={onClose} />
            <div className={`relative w-full max-w-md mx-4 bg-slate-900 border border-slate-700 rounded-xl shadow-xl p-5 ${className}`}>
                <div className="flex items-center justify-between mb-3">
                    {title ? <div className="text-white font-semibold">{title}</div> : <div />}
                    <button className="aa-btn" onClick={onClose} title="닫기">닫기</button>
                </div>
                {children}
            </div>
        </div>
    );
}
