import React from 'react';
export default function Card({ children, className = '' }) {
    return <div className={`glass-card p-6 md:p-8 ${className}`}>{children}</div>;
}
