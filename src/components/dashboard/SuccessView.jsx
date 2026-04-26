import React, { useState } from 'react';
import { CheckCircle, Share2, ArrowRight, Loader2 } from 'lucide-react';

export default function SuccessView({ onShare, onClose }) {
    const [sharing, setSharing] = useState(false);

    const handleShare = async () => {
        if (!onShare) return;
        setSharing(true);
        try {
            await onShare();
        } finally {
            // Cuando el selector de apps se cierra (compartió o canceló),
            // finalizar automáticamente y regresar al inicio
            setSharing(false);
            onClose();
        }
    };

    return (
        <div className="text-center p-8 bg-white rounded-2xl shadow-2xl animate-fade-in w-full max-w-sm">
            <CheckCircle className="w-20 h-20 text-green-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-800 mb-2">¡Registrado!</h2>
            <p className="text-gray-600 mb-6">Registro guardado exitosamente.</p>
            
            <div className="flex flex-col gap-3">
                {onShare && (
                    <button 
                        onClick={handleShare}
                        disabled={sharing}
                        className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 transition shadow-lg disabled:opacity-70"
                    >
                        {sharing ? <Loader2 size={20} className="animate-spin" /> : <Share2 size={20} />}
                        {sharing ? 'Compartiendo...' : 'Compartir Evidencia'}
                    </button>
                )}
                <button 
                    onClick={onClose}
                    disabled={sharing}
                    className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gray-100 text-gray-700 font-bold hover:bg-gray-200 transition disabled:opacity-50"
                >
                    Finalizar <ArrowRight size={20} />
                </button>
            </div>
        </div>
    );
}
