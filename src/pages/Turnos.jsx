import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ArrowLeft, Shield, RotateCw } from 'lucide-react';

export default function Turnos() {
    const navigate = useNavigate();
    const { adminAccess } = useAuth();
    const iframeRef = React.useRef(null);

    useEffect(() => {
        // Protección de ruta administrativa
        if (!adminAccess['/turnos']) {
            navigate('/login');
        }
    }, [adminAccess, navigate]);

    const handleRefresh = () => {
        if (iframeRef.current) {
            iframeRef.current.src = iframeRef.current.src;
        }
    };

    if (!adminAccess['/turnos']) {
        return null;
    }

    return (
        <div className="flex flex-col h-screen w-screen bg-slate-900 overflow-hidden">
            {/* Barra superior de navegación / integración */}
            <header className="h-14 bg-slate-800 border-b border-slate-700 px-4 flex items-center justify-between shrink-0 z-30">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => navigate('/login')}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition text-xs font-semibold shadow-sm"
                        title="Volver a Control de Entrada"
                    >
                        <ArrowLeft size={16} />
                        <span>Volver a Control de Entrada</span>
                    </button>
                    <div className="h-5 w-px bg-slate-700 hidden sm:block"></div>
                    <div className="flex items-center gap-2 text-white font-bold text-sm sm:text-base">
                        <span className="p-1 bg-red-600 rounded-md">
                            <Shield size={16} className="text-white" />
                        </span>
                        <span>Módulo de Turnos y Vigilancia</span>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={handleRefresh}
                        className="p-2 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition"
                        title="Recargar Módulo"
                    >
                        <RotateCw size={16} />
                    </button>
                </div>
            </header>

            {/* Contenedor del módulo Turnos (Iframe aislado) */}
            <main className="flex-1 w-full relative overflow-hidden bg-slate-950">
                <iframe
                    ref={iframeRef}
                    src="/turnos/index.html"
                    title="Módulo de Turnos"
                    className="w-full h-full border-0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                />
            </main>
        </div>
    );
}
