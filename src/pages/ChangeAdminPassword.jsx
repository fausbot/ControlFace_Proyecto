import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { functions } from '../firebaseConfig';
import { httpsCallable } from 'firebase/functions';
import { Lock, Eye, EyeOff, ArrowLeft, CheckCircle } from 'lucide-react';

export default function ChangeAdminPassword() {
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showCurrent, setShowCurrent] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [target, setTarget] = useState('todas');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const [isReadOnlyCurrent, setIsReadOnlyCurrent] = useState(true);
    const [isReadOnlyNew, setIsReadOnlyNew] = useState(true);
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess(false);

        // Validaciones
        if (newPassword.length < 6) {
            setError('La nueva contraseña debe tener al menos 6 caracteres.');
            return;
        }

        if (newPassword !== confirmPassword) {
            setError('Las contraseñas nuevas no coinciden.');
            return;
        }

        if (currentPassword === newPassword) {
            setError('La nueva contraseña debe ser diferente a la actual.');
            return;
        }

        setLoading(true);

        try {
            const changePassword = httpsCallable(functions, 'changeAdminPassword');
            const result = await changePassword({
                currentPassword,
                newPassword,
                target
            });

            if (result.data.success) {
                setSuccess(true);
                setCurrentPassword('');
                setNewPassword('');
                setConfirmPassword('');

                // Redirigir después de 2 segundos
                setTimeout(() => {
                    navigate('/datos');
                }, 2000);
            } else {
                setError(result.data.error || 'Error al cambiar la contraseña.');
            }
        } catch (err) {
            console.error('Error:', err);
            setError('Error al cambiar la contraseña. Intenta de nuevo.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">
                <button
                    onClick={() => navigate('/datos')}
                    className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-6 transition"
                >
                    <ArrowLeft size={20} />
                    Volver
                </button>

                <div className="flex items-center gap-3 mb-6">
                    <div className="p-3 bg-blue-100 rounded-full">
                        <Lock size={24} className="text-blue-600" />
                    </div>
                    <h1 className="text-2xl font-bold text-gray-800">Cambiar Contraseña de Admin</h1>
                </div>

                {success && (
                    <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3">
                        <CheckCircle size={24} className="text-green-600" />
                        <div>
                            <p className="text-green-800 font-semibold">¡Contraseña cambiada exitosamente!</p>
                            <p className="text-green-600 text-sm">Redirigiendo...</p>
                        </div>
                    </div>
                )}

                {error && (
                    <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                        <p className="text-red-800">{error}</p>
                    </div>
                )}

                <div className="space-y-5">
                    {/* Sección/Target */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Sección a Actualizar
                        </label>
                        <select
                            value={target}
                            onChange={(e) => setTarget(e.target.value)}
                            disabled={loading || success}
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                        >
                            <option value="todas">Cambiar para Todas las Secciones</option>
                            <option value="/registro">Contraseña de Registro</option>
                            <option value="/datos">Contraseña de Datos</option>
                            <option value="/configuracion">Contraseña de Configuración</option>
                        </select>
                    </div>
                    {/* Contraseña Actual */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Contraseña Actual
                        </label>
                        <div className="relative">
                            <input
                                type="text"
                                style={{ WebkitTextSecurity: showCurrent ? 'none' : 'disc' }}
                                name={`curr_${Math.random().toString(36).substring(7)}`}
                                id={`curr_${Math.random().toString(36).substring(7)}`}
                                autoComplete="off"
                                spellCheck="false"
                                autoCorrect="off"
                                data-lpignore="true"
                                readOnly={isReadOnlyCurrent}
                                onFocus={() => setIsReadOnlyCurrent(false)}
                                onBlur={() => setIsReadOnlyCurrent(true)}
                                value={currentPassword}
                                onChange={(e) => setCurrentPassword(e.target.value)}
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-12"
                                placeholder="Ingresa tu contraseña actual"
                                disabled={loading || success}
                            />
                            <button
                                type="button"
                                onClick={() => setShowCurrent(!showCurrent)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                            >
                                {showCurrent ? <EyeOff size={20} /> : <Eye size={20} />}
                            </button>
                        </div>
                    </div>

                    {/* Nueva Contraseña */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Nueva Contraseña
                        </label>
                        <div className="relative">
                            <input
                                type="text"
                                style={{ WebkitTextSecurity: showNew ? 'none' : 'disc' }}
                                name={`new_${Math.random().toString(36).substring(7)}`}
                                id={`new_${Math.random().toString(36).substring(7)}`}
                                autoComplete="off"
                                spellCheck="false"
                                autoCorrect="off"
                                data-lpignore="true"
                                readOnly={isReadOnlyNew}
                                onFocus={() => setIsReadOnlyNew(false)}
                                onBlur={() => setIsReadOnlyNew(true)}
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-12"
                                placeholder="Mínimo 6 caracteres"
                                disabled={loading || success}
                            />
                            <button
                                type="button"
                                onClick={() => setShowNew(!showNew)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                            >
                                {showNew ? <EyeOff size={20} /> : <Eye size={20} />}
                            </button>
                        </div>
                        {newPassword && newPassword.length < 6 && (
                            <p className="text-xs text-red-600 mt-1">Mínimo 6 caracteres</p>
                        )}
                    </div>

                    {/* Confirmar Nueva Contraseña */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Confirmar Nueva Contraseña
                        </label>
                        <div className="relative">
                            <input
                                type="text"
                                style={{ WebkitTextSecurity: showConfirm ? 'none' : 'disc' }}
                                autoComplete="new-password"
                                spellCheck="false"
                                autoCorrect="off"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        handleSubmit(e);
                                    }
                                }}
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-12"
                                placeholder="Repite la nueva contraseña"
                                disabled={loading || success}
                            />
                            <button
                                type="button"
                                onClick={() => setShowConfirm(!showConfirm)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                            >
                                {showConfirm ? <EyeOff size={20} /> : <Eye size={20} />}
                            </button>
                        </div>
                        {confirmPassword && newPassword !== confirmPassword && (
                            <p className="text-xs text-red-600 mt-1">Las contraseñas no coinciden</p>
                        )}
                    </div>

                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={loading || success || !currentPassword || !newPassword || !confirmPassword}
                        className="w-full py-3 px-4 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
                    >
                        {loading ? (
                            <>
                                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                Cambiando...
                            </>
                        ) : success ? (
                            <>
                                <CheckCircle size={20} />
                                ¡Cambiada!
                            </>
                        ) : (
                            <>
                                <Lock size={20} />
                                Cambiar Contraseña
                            </>
                        )}
                    </button>
                </div>

                <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                    <p className="text-sm text-blue-800">
                        <strong>Nota:</strong> Si cambias la contraseña de una sección específica, dicho cambio no afectará a las demás.
                        Usar "Cambiar para Todas" sobrescribirá todas las divisiones con la nueva clave.
                    </p>
                </div>
            </div>
        </div>
    );
}
