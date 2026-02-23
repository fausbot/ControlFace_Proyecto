import React, { useState } from 'react';
import { X, Lock, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { functions } from '../firebaseConfig';
import { httpsCallable } from 'firebase/functions';

export default function AdminPasswordModal({ isOpen, onClose, onSuccess, target }) {
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [isReadOnly, setIsReadOnly] = useState(true);
    const { grantAccess } = useAuth();

    if (!isOpen) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const verifyPasswordFn = httpsCallable(functions, 'verifyAdminPassword');
            const result = await verifyPasswordFn({ password: password, target: target });

            if (result.data.success) {
                // Otorgar acceso administrativo SOLO a la ruta destino solicitada
                grantAccess(target);
                onSuccess();
                setPassword('');
                onClose();
            } else {
                setError('Clave incorrecta');
            }
        } catch (err) {
            console.error("Error verifying password:", err);
            setError('Error verificando clave (revise conexión)');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden transform transition-all scale-100">
                {/* Header */}
                <div className="bg-gray-50 px-6 py-4 flex justify-between items-center border-b border-gray-100">
                    <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                        <Lock className="text-blue-600" size={20} />
                        Acceso Administrador
                    </h3>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 transition p-1 hover:bg-gray-100 rounded-full"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 space-y-4">
                    <p className="text-sm text-gray-500">
                        Ingrese la clave maestra para gestionar usuarios.
                    </p>

                    <div className="space-y-2">
                        <input
                            type="text"
                            style={{ WebkitTextSecurity: 'disc' }}
                            name={`key_${Math.random().toString(36).substring(7)}`}
                            id={`key_${Math.random().toString(36).substring(7)}`}
                            autoComplete="off"
                            spellCheck="false"
                            autoCorrect="off"
                            data-lpignore="true"
                            data-form-type="other"
                            readOnly={isReadOnly}
                            onFocus={() => setIsReadOnly(false)}
                            onBlur={() => setIsReadOnly(true)}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && password) {
                                    handleSubmit(e);
                                }
                            }}
                            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-lg tracking-widest"
                            placeholder="••••••"
                            autoFocus
                        />
                        {error && (
                            <p className="text-red-500 text-sm font-medium animate-pulse">
                                {error}
                            </p>
                        )}
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition"
                        >
                            Cancelar
                        </button>
                        <button
                            type="button"
                            onClick={handleSubmit}
                            disabled={loading || !password}
                            className="px-6 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 active:bg-blue-800 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            {loading && <Loader2 size={16} className="animate-spin" />}
                            Acceder
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
