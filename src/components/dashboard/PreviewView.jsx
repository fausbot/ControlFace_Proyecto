import React from 'react';
import { Camera, CheckCircle, ShieldAlert, TriangleAlert, UserCheck } from 'lucide-react';

export default function PreviewView({
    mode,
    capturedData,
    faceVerified,
    faceError,
    incidentDescription,
    setIncidentDescription,
    handleSave,
    handleCancel,
    // Nuevas props para almuerzo individual
    calc_lunch,
    calc_lunchMode,
    calc_lunchMins,
    applyLunch,
    setApplyLunch
}) {
    if (!capturedData) return null;

    return (
        <div className="w-full flex flex-col items-center animate-fade-in">
            <h2 className="text-xl font-bold mb-2 text-white text-center">
                {mode === 'incident' ? '⚠️ Vista Previa de la Novedad' : 'Vista Previa'}
            </h2>
            <p className="text-sm text-white/90 mb-4 text-center font-medium max-w-xs px-2">
                {mode === 'incident'
                    ? 'Describe la novedad antes de guardar.'
                    : faceVerified
                        ? 'Identidad verificada correctamente. Comparte esta imagen como evidencia.'
                        : 'No se pudo verificar tu identidad facial.'}
            </p>

            {!faceVerified && faceError && mode !== 'incident' && (
                <div className="bg-red-100 text-red-700 p-3 rounded-lg flex items-center gap-2 mb-4 w-full max-w-sm">
                    <ShieldAlert size={20} />
                    <span className="text-xs font-bold">{faceError}</span>
                </div>
            )}

            <div className="relative rounded-2xl overflow-hidden shadow-2xl border-4 bg-gray-900 w-full max-w-sm mb-4"
                style={{ borderColor: mode === 'incident' ? '#ea580c' : faceVerified ? '#22c55e' : '#ef4444' }}>
                <img src={capturedData.image} alt="Capture" className="w-full h-auto" />

                {!faceVerified && mode !== 'incident' && (
                    <button
                        onClick={handleCancel}
                        className="absolute top-4 left-4 flex items-center gap-2 px-4 py-2 bg-red-600 text-white font-bold rounded-lg shadow-2xl hover:bg-red-700 transition transform hover:scale-105"
                    >
                        <Camera size={20} />
                        REPETIR FOTO
                    </button>
                )}

                {(faceVerified || mode === 'incident') && (
                    <div className={`absolute top-4 right-4 p-1 rounded-full shadow-2xl ${mode === 'incident' ? 'bg-orange-500' : 'bg-green-500'} text-white`}>
                        {mode === 'incident' ? <TriangleAlert size={24} /> : <UserCheck size={24} />}
                    </div>
                )}
            </div>

            {/* Campo de descripción SOLO para novedades */}
            {mode === 'incident' && (
                <div className="w-full max-w-sm mb-4">
                    <label className="block text-sm font-bold text-orange-700 mb-1">📝 Descripción de la novedad *</label>
                    <textarea
                        value={incidentDescription}
                        onChange={(e) => setIncidentDescription(e.target.value)}
                        placeholder="Describe detalladamente lo que ocurrió, el área afectada y el tipo de daño..."
                        rows={4}
                        className="w-full border-2 border-orange-300 rounded-xl p-3 text-sm focus:outline-none focus:border-orange-500 resize-none"
                    />
                </div>
            )}

            {/* Control de Almuerzo Individual: solo si calc_lunch está activo Y el modo es 'individual' */}
            {mode === 'exit' && calc_lunch === true && calc_lunchMode === 'individual' && (
                <div className="w-full max-w-xs mb-6 bg-white/10 backdrop-blur-sm p-4 rounded-2xl border border-white/20">
                    <div 
                        onClick={() => setApplyLunch(!applyLunch)}
                        className="flex items-center gap-3 cursor-pointer select-none group"
                    >
                        <div className={`w-7 h-7 rounded-lg border-2 flex items-center justify-center transition-all ${
                            applyLunch ? 'bg-green-500 border-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]' : 'bg-white/10 border-white/30'
                        }`}>
                            {applyLunch && <CheckCircle size={20} className="text-white" />}
                        </div>
                        <div className="flex flex-col">
                            <span className="text-white font-bold text-sm">¿Descontar almuerzo hoy?</span>
                            <span className="text-white/60 text-[10px] leading-tight">
                                Marca la casilla si tomaste tu descanso ({calc_lunchMins || 60} minutos)
                            </span>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex flex-col gap-3 w-full max-w-xs">
                <button
                    onClick={handleSave}
                    className={`w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-white font-bold shadow-2xl transition ${mode === 'incident'
                        ? 'bg-orange-500 hover:bg-orange-600'
                        : 'bg-green-600 hover:bg-green-700'
                        }`}
                >
                    <CheckCircle size={20} />
                    {mode === 'incident' ? 'Guardar Novedad y Compartir' : 'Guardar y Compartir'}
                </button>
                <button
                    onClick={handleCancel}
                    className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gray-100 text-gray-600 font-bold hover:bg-gray-200 transition"
                >
                    Cancelar
                </button>
            </div>
        </div>
    );
}
