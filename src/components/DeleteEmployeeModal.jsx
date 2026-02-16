import React, { useState } from 'react';
import { functions } from '../firebaseConfig';
import { httpsCallable } from 'firebase/functions';
import { X, Trash2, Loader2, UserX, KeyRound, AlertTriangle } from 'lucide-react';

export default function DeleteEmployeeModal({ isOpen, onClose }) {
    const [uid, setUid] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState(null); // { type: 'success' | 'error', text: string }

    const handleDelete = async () => {
        if (!uid.trim()) {
            setMessage({ type: 'error', text: 'Por favor, ingresa un UID válido.' });
            return;
        }

        if (!window.confirm(`ADVERTENCIA FINAL: ¿Estás seguro de eliminar el usuario con UID: ${uid}?\n\nEsta acción es irreversible y borrará todos sus datos de Auth y Firestore.`)) {
            return;
        }

        setLoading(true);
        setMessage(null);

        try {
            const deleteUserFn = httpsCallable(functions, 'deleteUser');
            // Llamamos a la Cloud Function enviando el UID
            await deleteUserFn({ uid: uid.trim() });

            setMessage({ type: 'success', text: `Usuario con UID ${uid} eliminado correctamente.` });
            setUid(''); // Limpiar input
        } catch (error) {
            console.error("Error deleting user:", error);
            setMessage({ type: 'error', text: "Error al eliminar: " + error.message });
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-300">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col transition-all transform scale-100">
                {/* Header */}
                <div className="bg-gradient-to-r from-red-50 to-white px-6 py-5 flex justify-between items-center border-b border-gray-100">
                    <div className="flex items-center gap-3">
                        <div className="bg-red-100 p-2 rounded-xl">
                            <UserX className="text-red-600" size={24} />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-gray-800">Eliminar por UID</h3>
                            <p className="text-[10px] text-red-500 uppercase tracking-wider font-bold">Modo Avanzado</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-2 rounded-full hover:bg-gray-100 transition duration-200">
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-8">
                    <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-4 mb-6 flex gap-3 items-start">
                        <AlertTriangle className="text-yellow-600 shrink-0 mt-0.5" size={20} />
                        <p className="text-sm text-yellow-800">
                            Esta herramienta elimina usuarios directamente de Firebase Authentication usando su <strong>UID</strong> (identificador único).
                            <br /><br />
                            Puedes encontrar el UID en la columna "UID" del archivo CSV exportado.
                        </p>
                    </div>

                    <div className="space-y-4">
                        <label className="block text-sm font-bold text-gray-700">
                            UID del Usuario a Eliminar
                        </label>
                        <div className="relative">
                            <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                            <input
                                type="text"
                                value={uid}
                                onChange={(e) => setUid(e.target.value)}
                                placeholder="Ej: 5T7x8... (pegar del CSV)"
                                className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-gray-800 placeholder-gray-400 focus:ring-4 focus:ring-red-100 focus:border-red-400 outline-none transition-all font-mono"
                            />
                        </div>

                        {message && (
                            <div className={`p-4 rounded-xl text-sm font-medium animate-in slide-in-from-top-2 ${message.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                }`}>
                                {message.text}
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-6 py-2.5 bg-white text-gray-700 border border-gray-200 rounded-2xl font-bold hover:bg-gray-100 hover:border-gray-300 transition-all shadow-sm active:scale-95"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleDelete}
                        disabled={loading || !uid.trim()}
                        className="px-6 py-2.5 bg-red-600 text-white rounded-2xl font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-200 active:scale-95 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? (
                            <>
                                <Loader2 size={18} className="animate-spin" />
                                Eliminando...
                            </>
                        ) : (
                            <>
                                <Trash2 size={18} />
                                Eliminar Usuario
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
