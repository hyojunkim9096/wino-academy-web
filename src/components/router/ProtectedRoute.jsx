// src/components/router/ProtectedRoute.jsx
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';

export default function ProtectedRoute({ children }) {
    const location = useLocation();
    const token = localStorage.getItem('accessToken');
    if (!token) return <Navigate to="/admin/login" replace state={{ from: location }} />;
    return children;
}
