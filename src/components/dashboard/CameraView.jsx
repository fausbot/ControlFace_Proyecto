import React from 'react';
import { Camera, MapPin, TriangleAlert } from 'lucide-react';

export default function CameraView({
    mode,
    buttonLabels,
    videoRef,
    canvasRef,
    blinkCount,
    statusMessage,
    storageSettings,
    handleStopCamera,
    capture,
    step
}) {
    return (
        <div className="w-full flex flex-col items-center animate-fade-in">
            <h2 className="text-xl font-bold mb-4 capitalize text-gray-800">
                {mode === 'incident' ? `⚠️ ${buttonLabels.incident}` : `${buttonLabels[mode === 'entry' ? 'entry' : 'exit']}`}
            </h2>

            {/* Native Video Element */}
            <div className="relative rounded-2xl overflow-hidden shadow-2xl border-4 bg-black w-full aspect-[3/4] max-w-[280px]"
                style={{ borderColor: mode === 'incident' ? 'white' : blinkCount >= 1 ? '#22c55e' : '#3b82f6' }}>
                <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className={`w-full h-full object-cover ${mode !== 'incident' ? 'transform scale-x-[-1]' : ''}`}
                />
                <canvas ref={canvasRef} className="hidden" />
                <div className="absolute inset-0 border-2 border-white/30 rounded-2xl pointer-events-none"></div>

                {/* Overlay info */}
                <div className="absolute bottom-4 left-4 right-4 bg-black/50 backdrop-blur text-white p-2 rounded text-xs">
                    <div className="flex items-center gap-1"><MapPin size={12} /> Buscando GPS...</div>
                    {mode === 'incident'
                        ? <div className="flex items-center gap-1"><TriangleAlert size={12} /> Fotografía el área afectada</div>
                        : storageSettings.security_liveness === false
                            ? <div className="flex items-center gap-1"><Camera size={12} /> Posicione su rostro</div>
                            : <div className="flex items-center gap-1"><Camera size={12} /> Mueva la cabeza para registrar</div>
                    }
                </div>

                {/* Progreso movimiento — top right badge */}
                {mode !== 'incident' && storageSettings.security_liveness !== false && (
                    <div className={`absolute top-3 right-3 text-white text-xs font-bold px-2 py-1 rounded-full shadow-lg ${blinkCount >= 100 ? 'bg-green-500' : 'bg-blue-500'}`}>
                        {blinkCount}%
                    </div>
                )}
            </div>

            {/* Barra de movimiento — solo si liveness está activo */}
            {mode !== 'incident' && storageSettings.security_liveness !== false && (
                <div className="mt-3 w-full max-w-[280px]">
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                        <p className="text-xs font-bold text-blue-700 text-center mb-2">
                            {statusMessage || '🙂 Mueva la cabeza ligeramente'}
                        </p>
                        <div className="w-full bg-blue-100 rounded-full h-3">
                            <div
                                className="h-3 rounded-full transition-all duration-150"
                                style={{
                                    width: `${blinkCount}%`,
                                    background: blinkCount >= 100
                                        ? 'linear-gradient(90deg, #22c55e, #16a34a)'
                                        : 'linear-gradient(90deg, #3b82f6, #2563eb)'
                                }}
                            />
                        </div>
                        <p className="text-[10px] text-blue-400 text-center mt-1">
                            {blinkCount < 20 ? 'Mire al frente...' : blinkCount < 60 ? '¡Bien! Gire a la IZQUIERDA...' : blinkCount < 100 ? '¡Casi listo! Vuelva al CENTRO 🟢' : '✅ Identidad Confirmada'}
                        </p>
                    </div>
                </div>
            )}

            <div className="mt-4 flex gap-4">
                <button
                    onClick={handleStopCamera}
                    className="px-6 py-3 rounded-full bg-gray-200 text-gray-700 font-bold hover:bg-gray-300"
                >
                    Cancelar
                </button>
                {/* Mostrar "Capturar" para incidentes o si la seguridad de movimiento está desactivada */}
                {(mode === 'incident' || (mode !== 'incident' && storageSettings.security_liveness === false)) && (
                    <button
                        onClick={capture}
                        disabled={step === 'processing'}
                        className={`px-8 py-3 rounded-full text-white font-bold shadow-2xl transition transform active:translate-y-1 ${step === 'processing'
                            ? 'bg-gray-400 cursor-not-allowed'
                            : mode === 'incident'
                                ? 'bg-blue-600 hover:bg-blue-700'
                                : 'bg-[#2863eb] hover:bg-[#1d4ed8]'
                            } ${mode !== 'incident' ? 'flex items-center gap-2 w-full max-w-[280px] justify-center' : ''}`}
                    >
                        {mode !== 'incident' && <Camera size={20} />}
                        {step === 'processing' ? 'Procesando...' : mode === 'incident' ? 'Capturar' : 'Tomar Foto Ahora'}
                    </button>
                )}
            </div>
            {/* Mensaje inferior si liveness está desactivado */}
            {mode !== 'incident' && storageSettings.security_liveness === false && (
                <p className="text-xs text-gray-500 mt-3 max-w-[280px] text-center opacity-80">
                    Asegúrese de que su rostro sea visible antes de capturar.
                </p>
            )}
        </div>
    );
}
