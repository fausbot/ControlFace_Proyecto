// src/components/SubscriptionGuard.jsx
import React, { useEffect, useState } from 'react';
import { fetchLicenseStatus } from '../services/licenseService';

export default function SubscriptionGuard({ children }) {
    const [status, setStatus] = useState('checking'); // 'checking', 'valid', 'invalid'
    const [message, setMessage] = useState('');

    useEffect(() => {
        const verify = async () => {
            try {
                const result = await fetchLicenseStatus();
                // Validamos si hay token decodificado, si es válido y no expirado.
                if (result && result.decoded && result.decoded.isValid && !result.decoded.isExpired) {
                    setStatus('valid');
                } else if (result.decoded && result.decoded.isExpired) {
                    setStatus('invalid');
                    setMessage(`Su licencia expiró el ${result.decoded.expirationDate}. Contacte a ${result.decoded.providerName}.`);
                } else {
                    setStatus('invalid');
                    setMessage("Sistema sin licencia o código corrupto. Active una licencia en Configuración.");
                }
            } catch (error) {
                setStatus('invalid');
                setMessage("Servicio de validación inalcanzable.");
            }
        };
        verify();
    }, []);

    return (
        <React.Fragment>
            {status === 'invalid' && (
                <div className="bg-red-600 text-white text-center py-3 px-4 font-bold shadow-md z-50 relative w-full text-sm flex items-center justify-center gap-4">
                    <span>⚠️ AVISO DE LICENCIA: {message}</span>
                    <a href="/configuracion" className="px-3 py-1 bg-white text-red-600 rounded-full hover:bg-gray-100 transition shadow hover:shadow-md text-xs">
                        Activar Licencia
                    </a>
                </div>
            )}
            {children}
        </React.Fragment>
    );
}
