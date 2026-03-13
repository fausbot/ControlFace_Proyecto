import React from 'react';
import { LogOut, LogIn, TriangleAlert } from 'lucide-react';

export default function ActionButtons({
    loadingState,
    allowedActions,
    buttonLabels,
    handleStart
}) {
    if (loadingState) return null;

    return (
        <React.Fragment>
            {allowedActions.entry && (
                <button
                    onClick={() => handleStart('entry')}
                    className="group relative flex flex-col items-center justify-center p-8 bg-gradient-to-tr from-green-400 to-green-600 rounded-2xl shadow-2xl hover:shadow-2xl transition transform hover:scale-105 active:scale-95 animate-fade-in"
                >
                    <LogIn className="w-12 h-12 text-white mb-2" />
                    <span className="text-2xl font-bold text-white">{buttonLabels.entry}</span>
                </button>
            )}

            {allowedActions.exit && (
                <button
                    onClick={() => handleStart('exit')}
                    className="group relative flex flex-col items-center justify-center p-8 bg-gradient-to-tr from-red-400 to-red-600 rounded-2xl shadow-2xl hover:shadow-2xl transition transform hover:scale-105 active:scale-95 animate-fade-in"
                >
                    <LogOut className="w-12 h-12 text-white mb-2" />
                    <span className="text-2xl font-bold text-white">{buttonLabels.exit}</span>
                </button>
            )}

            {/* Mensaje visual de bloqueo si uno está deshabilitado */}
            {!allowedActions.entry && (
                <div className="opacity-40 grayscale flex flex-col items-center justify-center p-4 border-2 border-dashed border-gray-300 rounded-xl">
                    <span className="text-gray-400 font-bold block mb-1">Entrada Bloqueada</span>
                    <span className="text-[10px] text-gray-400 text-center">Debes marcar salida primero o esperar 20h</span>
                </div>
            )}
            
            {!allowedActions.exit && (
                <div className="opacity-40 grayscale flex flex-col items-center justify-center p-4 border-2 border-dashed border-gray-300 rounded-xl">
                    <span className="text-gray-400 font-bold block mb-1">Salida Bloqueada</span>
                    <span className="text-[10px] text-gray-400 text-center">Debes marcar entrada primero</span>
                </div>
            )}

            {/* Botón INCIDENTE — siempre visible, sin restricción de ciclo */}
            <button
                onClick={() => handleStart('incident')}
                className="group relative flex flex-col items-center justify-center p-5 bg-gradient-to-tr from-orange-400 to-orange-600 rounded-2xl shadow-2xl hover:shadow-2xl transition transform hover:scale-105 active:scale-95 animate-fade-in"
            >
                <TriangleAlert className="w-8 h-8 text-white mb-1" />
                <span className="text-xl font-bold text-white">{buttonLabels.incident}</span>
                <span className="text-xs text-orange-100 mt-1">Registro de Novedades, Mantenimientos o Incidentes.</span>
            </button>
        </React.Fragment>
    );
}
