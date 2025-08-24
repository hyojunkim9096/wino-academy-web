import React from 'react';

export default function Input({ id, label, className = '', ...props }) {
    return (
        <div>
            {label && <label htmlFor={id} className="input-label">{label}</label>}
            <input id={id} className={`input-base ${className}`} {...props} />
        </div>
    );
}
