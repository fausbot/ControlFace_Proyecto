import React, { useState, useEffect } from 'react';
import { Sparkles, RefreshCw, X } from 'lucide-react';
import { onPwaUpdateAvailable, applyPwaUpdate } from '../../utils/pwaUpdate';

export default function UpdateBadge({ className = '' }) {
    const [hasUpdate, setHasUpdate] = useState(false);
    const [dismissed, setDismissed] = useState(false);
    const [isUpdating, setIsUpdating] = useState(false);

    useEffect(() => {
        const unsubscribe = onPwaUpdateAvailable((available) => {
            setHasUpdate(available);
        });
        return unsubscribe;
    }, []);

    if (!hasUpdate || dismissed) return null;

    const handleUpdate = async () => {
        setIsUpdating(true);
        await applyPwaUpdate();
    };

    return (
        <div className={`w-full max-w-md mx-auto px-3 py-1.5 transition-all duration-300 animate-fade-in ${className}`}>
            <div className="bg-gradient-to-r from-blue-600/90 via-indigo-600/90 to-blue-700/90 text-white px-3.5 py-2 rounded-xl shadow-lg border border-white/20 backdrop-blur-md flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                    <span className="p-1 bg-white/20 rounded-lg shrink-0">
                        <Sparkles size={14} className="text-yellow-300 animate-pulse" />
                    </span>
                    <div className="flex flex-col min-w-0">
                        <span className="text-[11px] font-bold tracking-wide truncate">
                            Mejora disponible
                        </span>
                        <span className="text-[9px] text-blue-100/90 truncate">
                            Puedes actualizar ahora o al terminar
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                    <button
                        onClick={handleUpdate}
                        disabled={isUpdating}
                        className="px-2.5 py-1 bg-white text-blue-800 text-[11px] font-bold rounded-lg shadow-sm hover:bg-blue-50 active:scale-95 transition flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                        <RefreshCw size={11} className={isUpdating ? 'animate-spin' : ''} />
                        <span>{isUpdating ? 'Cargando...' : 'Actualizar'}</span>
                    </button>
                    <button
                        onClick={() => setDismissed(true)}
                        title="Ignorar por ahora"
                        className="p-1 text-white/70 hover:text-white rounded-md hover:bg-white/10 transition cursor-pointer"
                    >
                        <X size={13} />
                    </button>
                </div>
            </div>
        </div>
    );
}
