import React, { useEffect, useState } from 'react';
import { fetchLicenseStatus } from '../services/licenseService';
import { useNavigate } from 'react-router-dom';
import AdminPasswordModal from './AdminPasswordModal';

export default function SubscriptionGuard({ children }) {
    const [status, setStatus] = useState('checking'); // 'checking', 'valid', 'invalid'
    const [message, setMessage] = useState('');
    const [showAdminModal, setShowAdminModal] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        const verify = async () => {
            try {
                const result = await fetchLicenseStatus();
                // Validamos si hay token decodificado, si es válido y no expirado.
                if (result && result.decoded && result.decoded.isValid && !result.decoded.isExpired) {
                    setStatus('valid');
                } else if (result.decoded && result.decoded.isExpired) {
                    setStatus('invalid');
                    const phoneInfo = result.decoded.providerPhone ? ` Tel: ${result.decoded.providerPhone}` : '';
                    setMessage(`Su licencia expiró el ${result.decoded.expirationDate}. Contacte a ${result.decoded.providerName}.${phoneInfo}`);
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
            <AdminPasswordModal
                isOpen={showAdminModal}
                target="/configuracion"
                onClose={() => setShowAdminModal(false)}
                onSuccess={() => {
                    setShowAdminModal(false);
                    navigate('/configuracion');
                }}
            />
            {status === 'invalid' && (
                <div className="bg-red-600 text-white text-center py-3 px-4 font-bold shadow-md z-50 relative w-full text-sm flex md:hidden flex-col sm:flex-row items-center justify-center gap-3">
                    <span>⚠️ AVISO DE LICENCIA: {message}</span>
                    <button
                        onClick={() => setShowAdminModal(true)}
                        className="px-4 py-1.5 bg-white text-red-600 rounded-full hover:bg-gray-100 transition shadow hover:shadow-md text-xs sm:text-sm font-bold whitespace-nowrap"
                    >
                        Activar Licencia
                    </button>
                </div>
            )}
            {children}
        </React.Fragment>
    );
}
