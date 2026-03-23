import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebaseConfig';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { Camera, MapPin, ArrowLeft, Send, CheckCircle, Navigation } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { uploadPhoto } from '../services/storageService';
import { addWatermarkToImage, fetchServerTime, fetchLocationName } from '../utils/watermark';

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

        try {
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

            await addDoc(collection(db, "visitas"), docData);

            setStep('success');

            // Actualizar estado
            if (mode === 'Llegada Cliente') {
                setAllowedActions({ entry: false, exit: true });
                localStorage.setItem(`lastRutaType_${currentUser.email}`, 'Llegada Cliente');
            } else {
                setAllowedActions({ entry: true, exit: false });
                localStorage.setItem(`lastRutaType_${currentUser.email}`, 'Salida Cliente');
            }

            // Preparar y enviar mensaje por WhatsApp/Share API
            const shareText = `📍 *${mode} registrada*\nObservación: '${observacion.trim() || 'Ninguna'}'\n📷 Ver foto de evidencia: ${url}`;
            
            if (navigator.share) {
                try {
                    await navigator.share({
                        title: `Reporte de ${mode}`,
                        text: shareText
                    });
                } catch (shareErr) {
                    console.log('Share cancelado o no soportado.', shareErr);
                }
            }

            setTimeout(() => {
                setStep('idle');
                setCapturedData(null);
            }, 1000);

        } catch (error) {
            console.error(error);
            alert(`Error guardando: ${error.message}`);
            setStep('preview');
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-indigo-800 to-indigo-900 flex flex-col">
            <div className="bg-white/10 backdrop-blur-md p-4 flex items-center gap-3 border-b border-white/20">
                <button onClick={() => navigate('/dashboard')} className="text-white hover:bg-white/20 p-2 rounded-full transition">
                    <ArrowLeft size={24} />
                </button>
                <div className="flex-1">
                    <h1 className="text-xl font-bold text-white flex items-center gap-2">
                        <Navigation size={20} className="text-indigo-300" />
                        Modo Ruta / Visitas
                    </h1>
                </div>
            </div>

            <div className="flex-1 p-4 flex flex-col items-center justify-center max-w-md mx-auto w-full">
                {step === 'idle' && (
                    <div className="w-full flex flex-col gap-6">
                        <div className="bg-white/10 backdrop-blur rounded-2xl p-6 text-center border border-white/20">
                            <h2 className="text-white font-medium text-lg mb-2">Registro de Cliente</h2>
                            <p className="text-indigo-200 text-sm">
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
                    <div className="w-full max-w-sm bg-white rounded-3xl overflow-hidden shadow-2xl animate-fade-in">
                        <div className="bg-indigo-600 p-4 text-center">
                            <h3 className="text-white font-bold text-lg">{mode}</h3>
                        </div>
                        <div className="relative bg-black w-full aspect-square">
                            <img src={capturedData.image} alt="Evidencia" className="w-full h-full object-contain" />
                        </div>
                        <div className="p-5 flex flex-col gap-4">
                            <div>
                                <label className="block text-sm font-bold text-indigo-900 mb-1">Observaciones (Opcional)</label>
                                <textarea
                                    value={observacion}
                                    onChange={(e) => setObservacion(e.target.value)}
                                    placeholder="Ej: Todo en orden, Esperando confirmación..."
                                    className="w-full p-3 border border-indigo-100 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none resize-none text-sm bg-indigo-50/50"
                                    rows="2"
                                />
                            </div>
                            <div className="flex gap-3 mt-2">
                                <button
                                    onClick={() => { setStep('idle'); setCapturedData(null); }}
                                    className="flex-1 py-3 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition"
                                >
                                    Descartar
                                </button>
                                <button
                                    onClick={handleSaveAndShare}
                                    className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-600/30 transition flex items-center justify-center gap-2"
                                >
                                    <Send size={18} /> Guardar + Evidencia
                                </button>
                            </div>
                        </div>
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
