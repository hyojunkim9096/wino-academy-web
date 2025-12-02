// src/common/components/Button.jsx
import React from 'react';

export default function Button({ children, className = '', ...props }) {
    return (
        <button className={`btn-primary w-full ${className}`} {...props}>
            {children}
        </button>
    );
}
