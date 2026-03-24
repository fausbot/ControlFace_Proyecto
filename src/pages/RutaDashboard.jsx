import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebaseConfig';
import { collection, addDoc, serverTimestamp, doc, setDoc } from 'firebase/firestore';
import { Camera, MapPin, ArrowLeft, Send, CheckCircle, Navigation } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { uploadPhoto } from '../services/storageService';
import { addWatermarkToImage, fetchServerTime, fetchLocationName } from '../utils/watermark';
import { saveOfflineRecord } from '../services/offlineStorage';

export default function RutaDashboard() {
    const { currentUser } = useAuth();
    const navigate = useNavigate();
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const streamRef = useRef(null);

    const [allowedActions, setAllowedActions] = useState({ entry: true, exit: false });
    const [step, setStep] = useState('idle'); // idle, camera, preview, processing, success
    const [mode, setMode] = useState(null); // 'Llegada Cliente', 'Salida Cliente'
    const [observacion, setObservacion] = useState('');
    const [capturedData, setCapturedData] = useState(null);
    const [statusMessage, setStatusMessage] = useState('');

    useEffect(() => {
        // Cargar estado desde localStorage para la ruta
        const lastType = localStorage.getItem(`lastRutaType_${currentUser.email}`);
        if (lastType === 'Llegada Cliente') {
            setAllowedActions({ entry: false, exit: true });
        } else {
            setAllowedActions({ entry: true, exit: false });
        }
    }, [currentUser.email]);

    const startCamera = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' },
                audio: false
            });
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => {
                    track.stop();
                    try { track.enabled = false; } catch (e) {}
                });
            }
            streamRef.current = stream;
            setStep('camera');
        } catch (err) {
            console.error(err);
            alert("No se pudo acceder a la cámara trasera.");
        }
    };

    useEffect(() => {
        if (step === 'camera' && videoRef.current && streamRef.current) {
            videoRef.current.srcObject = streamRef.current;
        }
    }, [step]);

    const stopCamera = () => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => {
                track.stop();
                try { track.enabled = false; } catch (e) {}
            });
            streamRef.current = null;
        }
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
    };

    const handleStartAction = (selectedMode) => {
        setMode(selectedMode);
        setObservacion('');
        startCamera();
    };

    const capture = async () => {
        try {
            const video = videoRef.current;
            const canvas = canvasRef.current;
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const context = canvas.getContext('2d');
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            const imageSrc = canvas.toDataURL('image/jpeg', 0.8);

            setStatusMessage('Obteniendo ubicación...');
            setStep('processing');

            const locationPromise = new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                    enableHighAccuracy: true,
                    timeout: 5000,
                    maximumAge: 0
                });
            }).catch(() => {
                return new Promise((resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(resolve, reject, {
                        enableHighAccuracy: false,
                        timeout: 3000,
                        maximumAge: 60000
                    });
                });
            });

            const [position, serverTime] = await Promise.all([
                locationPromise,
                fetchServerTime()
            ]);

            const { latitude, longitude } = position.coords;
            const address = await fetchLocationName(latitude, longitude).catch(() => "Ubicación desconocida");

            setStatusMessage('Aplicando marca de agua...');
            const watermarkedImage = await addWatermarkToImage(imageSrc, {
                employeeId: currentUser.email,
                timestamp: serverTime,
                coords: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
                locationName: address,
                mode: mode
            });

            const now = new Date();
            setCapturedData({
                image: watermarkedImage,
                metadata: {
                    usuario: currentUser.email,
                    tipo: mode,
                    fecha: now.toLocaleDateString('es-ES'),
                    hora: now.toLocaleTimeString('es-ES'),
                    localidad: address,
                    latitud: latitude,
                    longitud: longitude
                }
            });

            stopCamera();
            setStep('preview');
        } catch (error) {
            console.error(error);
            alert(`Error en captura: ${error.message}`);
            stopCamera();
            setStep('idle');
        }
    };

    const handleSaveAndShare = async () => {
        if (!capturedData) return;
        setStep('processing');
        setStatusMessage('Guardando y Subiendo foto...');

        const saveRecordOnline = async () => {
            // Subir foto a Firebase Storage primero
            const url = await uploadPhoto(
                capturedData.image,
                'Visita',
                capturedData.metadata.usuario,
                capturedData.metadata.fecha,
                capturedData.metadata.hora
            );

            setStatusMessage('Guardando registro...');
            const docData = {
                ...capturedData.metadata,
                observacion: observacion.trim(),
                fotoURL: url,
                timestamp: serverTimestamp()
            };

            // Generar ID determinístico para evitar duplicados
            const safeEmail = capturedData.metadata.usuario.replace(/[@.]/g, '-');
            const safeFecha = (capturedData.metadata.fecha || '').replace(/\//g, '-');
            const safeHora = (capturedData.metadata.hora || '').replace(/:/g, '-').replace(/\s/g, '');
            const deterministicDocId = `${safeEmail}_${safeFecha}_${safeHora}`;

            await setDoc(doc(db, "visitas", deterministicDocId), docData);
            return url;
        };

        try {
            // USAR TIMEOUT DE 3s PARA FIRESTORE: Si no responde, forzar offline
            const saveTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error("Firebase Timeout")), 3000));
            
            let url = null;
            try {
                url = await Promise.race([saveRecordOnline(), saveTimeout]);
            } catch (err) {
                console.warn('Forcing Offline Storage due to network/timeout:', err);
                // Guardar en IndexedDB de forma silenciosa
                await saveOfflineRecord({
                    image: capturedData.image,
                    metadata: {
                        ...capturedData.metadata,
                        observacion: observacion.trim()
                    },
                    mode: 'visita',
                    savePhoto: true, // Siempre queremos fotos de visitas
                    latitude: capturedData.metadata.latitud,
                    longitude: capturedData.metadata.longitud
                });
                setStatusMessage('Guardado localmente (Offline)');
            }

            setStep('success');

            // Actualizar estado persistente
            if (mode === 'Llegada Cliente') {
                setAllowedActions({ entry: false, exit: true });
                localStorage.setItem(`lastRutaType_${currentUser.email}`, 'Llegada Cliente');
            } else {
                setAllowedActions({ entry: true, exit: false });
                localStorage.setItem(`lastRutaType_${currentUser.email}`, 'Salida Cliente');
            }

            // Preparar archivo para compartir (si el navegador lo soporta)
            let filesToShare = null;
            if (navigator.canShare && capturedData.image) {
                try {
                    const response = await fetch(capturedData.image);
                    const blob = await response.blob();
                    const file = new File([blob], `ruta_${mode.replace(/\s+/g, '_')}.jpg`, { type: 'image/jpeg' });
                    if (navigator.canShare({ files: [file] })) {
                        filesToShare = [file];
                    }
                } catch (e) {
                    console.error("Error preparando archivo para compartir:", e);
                }
            }

            // Preparar y enviar mensaje por WhatsApp/Share API
            const shareText = `📍 *${mode} registrada*\nObservación: ${observacion.trim() || 'Ninguna'}`;
            
            if (navigator.share) {
                try {
                    const shareData = {
                        title: `Reporte de ${mode}`,
                        text: shareText
                    };
                    if (filesToShare) shareData.files = filesToShare;
                    await navigator.share(shareData);
                } catch (shareErr) {
                    console.log('Share cancelado o no soportado.', shareErr);
                }
            }

            setTimeout(() => {
                setStep('idle');
                setCapturedData(null);
            }, 2000);

        } catch (error) {
            console.error(error);
            alert(`Error crítico guardando: ${error.message}`);
            setStep('preview');
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-b from-[#3C7DA6] to-[#6FAF6B] flex flex-col">
            <div className="bg-white/10 backdrop-blur-md p-4 flex items-center gap-3 border-b border-white/20">
                <button onClick={() => navigate('/dashboard')} className="text-white hover:bg-white/20 p-2 rounded-full transition">
                    <ArrowLeft size={24} />
                </button>
                <div className="flex-1">
                    <h1 className="text-xl font-bold text-white flex items-center gap-2">
                        <Navigation size={20} className="text-white/70" />
                        Modo Visitas a Clientes
                    </h1>
                </div>
            </div>

            <div className="flex-1 p-4 flex flex-col items-center justify-center max-w-md mx-auto w-full">
                {step === 'idle' && (
                    <div className="w-full flex flex-col gap-6">
                        <div className="bg-white rounded-2xl p-6 text-center shadow-lg border border-white/60">
                            <h2 className="text-gray-800 font-bold text-lg mb-2">Registro de Clientes</h2>
                            <p className="text-gray-500 text-sm">
                                {allowedActions.entry ? 'Usa esta opción al llegar a las instalaciones del cliente.' : 'Registra tu salida al concluir la visita.'}
                            </p>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                            <button
                                disabled={!allowedActions.entry}
                                onClick={() => handleStartAction('Llegada Cliente')}
                                className={`flex flex-col items-center justify-center gap-3 p-6 rounded-2xl shadow-xl transition-all ${
                                    allowedActions.entry
                                        ? 'bg-gradient-to-br from-blue-500 to-indigo-600 hover:scale-105 hover:shadow-2xl border border-blue-400 cursor-pointer'
                                        : 'bg-white/5 border border-white/10 opacity-50 cursor-not-allowed'
                                }`}
                            >
                                <MapPin size={32} className={allowedActions.entry ? "text-white" : "text-gray-400"} />
                                <span className={`font-bold ${allowedActions.entry ? "text-white" : "text-gray-400"}`}>Llegada<br/>Cliente</span>
                            </button>

                            <button
                                disabled={!allowedActions.exit}
                                onClick={() => handleStartAction('Salida Cliente')}
                                className={`flex flex-col items-center justify-center gap-3 p-6 rounded-2xl shadow-xl transition-all ${
                                    allowedActions.exit
                                        ? 'bg-gradient-to-br from-orange-500 to-red-600 hover:scale-105 hover:shadow-2xl border border-orange-400 cursor-pointer'
                                        : 'bg-white/5 border border-white/10 opacity-50 cursor-not-allowed'
                                }`}
                            >
                                <MapPin size={32} className={allowedActions.exit ? "text-white" : "text-gray-400"} />
                                <span className={`font-bold ${allowedActions.exit ? "text-white" : "text-gray-400"}`}>Salida<br/>Cliente</span>
                            </button>
                        </div>
                    </div>
                )}

                {step === 'camera' && (
                    <div className="w-full flex flex-col items-center animate-fade-in">
                        <h2 className="text-white text-xl font-bold mb-4">{mode}</h2>
                        <div className="relative rounded-2xl overflow-hidden shadow-2xl border-4 border-indigo-500 bg-black w-full aspect-[3/4] max-w-[280px]">
                            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                            <canvas ref={canvasRef} className="hidden" />
                            <div className="absolute inset-0 border-2 border-white/30 rounded-2xl pointer-events-none"></div>
                            <div className="absolute bottom-4 left-0 right-0 text-center">
                                <span className="bg-black/60 text-white text-xs px-3 py-1 rounded-full backdrop-blur-md inline-flex items-center gap-2">
                                    <MapPin size={12}/> Buscando ubicación...
                                </span>
                            </div>
                        </div>
                        <div className="mt-6 flex gap-4">
                            <button onClick={() => { stopCamera(); setStep('idle'); }} className="px-6 py-3 rounded-full bg-white/20 text-white font-bold hover:bg-white/30 backdrop-blur">Cancelar</button>
                            <button onClick={capture} className="px-8 py-3 rounded-full bg-indigo-500 hover:bg-indigo-600 text-white font-bold shadow-xl flex items-center gap-2">
                                <Camera size={20} /> Capturar
                            </button>
                        </div>
                    </div>
                )}

                {step === 'processing' && (
                    <div className="text-center p-10 bg-white/10 backdrop-blur-md rounded-2xl border border-white/20">
                        <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-indigo-400 mx-auto mb-4"></div>
                        <p className="text-white font-medium">{statusMessage}</p>
                    </div>
                )}

                {step === 'preview' && capturedData && (
                    <div className="w-full max-w-sm flex flex-col items-center animate-fade-in gap-4">
                        {/* Título */}
                        <div className="text-center">
                            <h2 className="text-2xl font-bold text-white drop-shadow">Vista Previa</h2>
                            <p className="text-white/70 text-sm mt-1">{mode} — Revisa la imagen antes de guardar</p>
                        </div>

                        {/* Imagen con borde azul */}
                        <div className="w-full rounded-2xl overflow-hidden shadow-2xl border-4 border-blue-400 bg-black">
                            <img src={capturedData.image} alt="Evidencia" className="w-full object-contain" />
                        </div>

                        {/* Observaciones */}
                        <div className="w-full bg-white rounded-2xl p-4 shadow-lg">
                            <label className="block text-sm font-bold text-blue-800 mb-2">Observaciones (Opcional)</label>
                            <textarea
                                value={observacion}
                                onChange={(e) => setObservacion(e.target.value)}
                                placeholder="Ej: Todo en orden, Esperando confirmación..."
                                className="w-full p-3 border border-blue-100 rounded-xl focus:ring-2 focus:ring-blue-400 outline-none resize-none text-sm bg-blue-50/40"
                                rows="2"
                            />
                        </div>

                        {/* Botón principal — Guardar + Evidencia */}
                        <button
                            onClick={handleSaveAndShare}
                            className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl shadow-xl shadow-blue-600/40 transition active:scale-95 flex items-center justify-center gap-3 text-lg"
                        >
                            <Send size={22} />
                            Guardar y Compartir
                        </button>

                        {/* Botón secundario — Cancelar */}
                        <button
                            onClick={() => { setStep('idle'); setCapturedData(null); setObservacion(''); }}
                            className="w-full py-4 bg-white text-gray-700 font-bold rounded-2xl shadow border border-gray-200 hover:bg-gray-50 transition active:scale-95 text-lg"
                        >
                            Cancelar
                        </button>
                    </div>
                )}

                {step === 'success' && (
                    <div className="bg-white p-8 rounded-3xl shadow-2xl max-w-sm text-center animate-bounce-in border-4 border-indigo-100">
                        <CheckCircle className="w-20 h-20 text-indigo-500 mx-auto mb-4" />
                        <h2 className="text-2xl font-bold text-gray-800 mb-2">¡Evidencia Guardada!</h2>
                        <p className="text-gray-500 font-medium">El registro ha sido almacenado correctamente.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
