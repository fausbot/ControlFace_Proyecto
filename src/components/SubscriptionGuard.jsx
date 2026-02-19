// src/components/SubscriptionGuard.jsx
import React, { useEffect, useState } from 'react';
import { checkLicenseStatus } from '../services/licenseService';

export default function SubscriptionGuard({ children }) {
    const [status, setStatus] = useState('checking'); // 'checking', 'valid', 'invalid'
    const [message, setMessage] = useState('');

    useEffect(() => {
        const verify = async () => {
            const result = await checkLicenseStatus();
            if (result.valid) {
                setStatus('valid');
            } else {
                setStatus('invalid');
                setMessage(result.message || "Contacte al administrador.");
            }
        };
        verify();
    }, []);

    if (status === 'checking') {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-100">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <p className="text-gray-600">Verificando sistema...</p>
                </div>
            </div>
        );
    }

    if (status === 'invalid') {
        return (
            <div className="min-h-screen flex items-center justify-center bg-red-50 p-4">
                <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center border-l-4 border-red-500">
                    <div className="text-red-500 mb-4">
                        <svg className="w-16 h-16 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                    </div>
                    <h1 className="text-2xl font-bold text-gray-800 mb-2">Acceso Bloqueado</h1>
                    <p className="text-gray-600 mb-6">{message}</p>
                    <div className="bg-gray-100 p-4 rounded text-sm text-gray-500">
                        <p>ID de Soporte: ERR-LIC-001</p>
                        <p>Por favor contacte a su proveedor de software para renovar su suscripción.</p>
                    </div>
                </div>
            </div>
        );
    }

    return children;
}
