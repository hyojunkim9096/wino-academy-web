// src/main.jsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import router from '@/router.jsx';
import '@/index.css';

// ✅ 1. 
import { AuthProvider } from '@/contexts/AuthContext';
import { CommonCodeProvider } from '@/contexts/CommonCodeContext';

createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        {/* ✅ 2. 
             */}
        <CommonCodeProvider>
            {/* ✅ 3. AuthProvider 
                 */}
            <AuthProvider>
                <RouterProvider router={router} />
            </AuthProvider>
        </CommonCodeProvider>
    </React.StrictMode>
);