import React, { useState, useRef, useCallback, useEffect } from 'react';
import Webcam from 'react-webcam';
import { useAuth } from '../contexts/AuthContext';
import { addWatermarkToImage, fetchServerTime, fetchLocationName } from '../utils/watermark';
import { db } from '../firebaseConfig';
import { collection, addDoc, query, where, getDocs, serverTimestamp, orderBy, limit } from 'firebase/firestore';
import { Camera, MapPin, Search, CheckCircle, AlertCircle, LogOut, LogIn, Share2, Settings, UserCheck, ShieldAlert } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import AdminPasswordModal from '../components/AdminPasswordModal';
import * as faceapi from '@vladmandic/face-api';

export default function Dashboard() {
    const { currentUser, logout } = useAuth();
    const navigate = useNavigate();
    // Refs for Native Camera
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const streamRef = useRef(null);

    const [mode, setMode] = useState(null); // 'entry', 'exit', 'incident'
    const [allowedActions, setAllowedActions] = useState({ entry: true, exit: true });
    const [loadingState, setLoadingState] = useState(true);
    const [incidentDescription, setIncidentDescription] = useState(''); // Descripción del incidente
    const [step, setStep] = useState('idle'); // idle, camera, processing, success
    const [statusMessage, setStatusMessage] = useState('');
    const [isCapturing, setIsCapturing] = useState(false);
    const [showAdminModal, setShowAdminModal] = useState(false);
    const [adminTarget, setAdminTarget] = useState(''); // '/registro' or '/admin'
    const [modelsLoaded, setModelsLoaded] = useState(false);
    const [savedDescriptor, setSavedDescriptor] = useState(null);
    const [faceVerified, setFaceVerified] = useState(false);
    const [verifyingFace, setVerifyingFace] = useState(false);
    const [faceError, setFaceError] = useState('');
    const [cameraReady, setCameraReady] = useState(false);
    const [deferredPrompt, setDeferredPrompt] = useState(null);
    const [showInstallBtn, setShowInstallBtn] = useState(false);
    const [isIOS, setIsIOS] = useState(false);
    const [isStandalone, setIsStandalone] = useState(false);

    useEffect(() => {
        // Detectar si ya está instalada
        if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true) {
            setIsStandalone(true);
        }

        // Detectar iOS
        const userAgent = window.navigator.userAgent.toLowerCase();
        if (userAgent.includes('iphone') || userAgent.includes('ipad') || userAgent.includes('ipod')) {
            setIsIOS(true);
        }

        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            setDeferredPrompt(e);
            setShowInstallBtn(true);
        });
    }, []);

    const handleInstallClick = async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            setShowInstallBtn(false);
        }
        setDeferredPrompt(null);
    };

    const clearAppCache = async () => {
        if (window.confirm("¿Deseas limpiar la memoria de la aplicación? Esto forzará la carga de la versión más reciente.")) {
            if ('serviceWorker' in navigator) {
                const registrations = await navigator.serviceWorker.getRegistrations();
                for (let registration of registrations) {
                    await registration.unregister();
                }
            }
            const names = await caches.keys();
            for (let name of names) {
                await caches.delete(name);
            }
            localStorage.clear();
            window.location.reload(true);
        }
    };

    // Cleanup and Security: Logout on reload (F5)
    // Verificación de acceso y Migración perezosa
    // Cargar modelos y descriptor del empleado
    useEffect(() => {
        const loadModelsAndData = async () => {
            try {
                const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';
                await Promise.all([
                    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
                    faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
                    faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
                ]);
                setModelsLoaded(true);

                if (currentUser) {
                    const q = query(collection(db, "employees"), where("email", "==", currentUser.email));
                    const snap = await getDocs(q);
                    if (!snap.empty) {
                        const data = snap.docs[0].data();
                        if (data.faceDescriptor) {
                            setSavedDescriptor(new Float32Array(data.faceDescriptor));
                        }
                    }
                }
            } catch (err) {
                console.error("Error cargando modelos/datos faciales:", err);
            }
        };
        loadModelsAndData();

        const checkAccess = async () => {
            if (!currentUser) return;

            try {
                const q = query(collection(db, "employees"), where("email", "==", currentUser.email));
                const querySnapshot = await getDocs(q);

                if (querySnapshot.empty) {
                    console.warn("Acceso denegado: Usuario no encontrado en lista activa.");
                    logout();
                    navigate('/login');
                }
            } catch (err) {
                console.error("Error verificando acceso:", err);
            }
        };

        checkAccess();

        // Verificar ESTADO DEL USUARIO (Entrada/Salida)
        const checkLastStatus = async () => {
            if (!currentUser) return;
            try {
                const q = query(
                    collection(db, "attendance"),
                    where("usuario", "==", currentUser.email),
                    orderBy("timestamp", "desc"),
                    limit(1)
                );
                const snap = await getDocs(q);

                if (snap.empty) {
                    // Nunca ha marcado -> Solo Entrada permitida
                    setAllowedActions({ entry: true, exit: false });
                } else {
                    const lastRecord = snap.docs[0].data();
                    const lastType = lastRecord.tipo; // 'Entrada' o 'Salida'

                    if (lastType === 'Salida') {
                        // Ya salió -> Toca Entrar
                        setAllowedActions({ entry: true, exit: false });
                    } else {
                        // Última fue Entrada -> Analizar tiempo
                        const lastTime = lastRecord.timestamp ? lastRecord.timestamp.toDate() : new Date();
                        const now = new Date();
                        const diffHours = (now - lastTime) / (1000 * 60 * 60);

                        if (diffHours > 20) {
                            // Pasaron más de 20 horas -> Se le olvidó salir. Reiniciar ciclo.
                            console.log("Ciclo reiniciado por tiempo (>20h sin salida)");
                            setAllowedActions({ entry: true, exit: false });
                        } else {
                            // Ciclo normal -> Toca Salir
                            setAllowedActions({ entry: false, exit: true });
                        }
                    }
                }
                setLoadingState(false);
            } catch (err) {
                console.error("Error verificando estado:", err);
                // Fallback: permitir todo si falla la red para no bloquear
                setAllowedActions({ entry: true, exit: true });
                setLoadingState(false);
            }
        };
        checkLastStatus();

        const handleUnload = () => {
            logout();
        };
        window.addEventListener('beforeunload', handleUnload);

        return () => {
            window.removeEventListener('beforeunload', handleUnload);
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }
        };
    }, [logout, currentUser]);

    const startCamera = async (facingMode = 'user') => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode },
                audio: false
            });
            streamRef.current = stream;
            setCameraReady(true);
        } catch (err) {
            console.error("Error accessing camera:", err);
            alert("No se pudo acceder a la cámara. Verifique los permisos.");
            setStatusMessage('');
            setStep('idle');
            setMode(null);
        }
    };

    // Efecto para asignar el flujo de video cuando el elemento esté montado
    useEffect(() => {
        if (step === 'camera' && cameraReady && videoRef.current && streamRef.current) {
            console.log("Dashboard: Asignando stream al video...");
            videoRef.current.srcObject = streamRef.current;
            videoRef.current.play().catch(e => console.error("Error auto-reproduciendo video:", e));
        }
    }, [step, cameraReady]);

    const stopCamera = () => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        setCameraReady(false);
    };

    const handleStopCamera = () => {
        stopCamera();
        setStep('idle');
        setMode(null);
        setStatusMessage('');
    };

    const handleStart = async (selectedMode) => {
        setMode(selectedMode);
        setStep('camera');
        setStatusMessage('');
        setIncidentDescription('');

        // Cámara trasera para incidentes, frontal para asistencia
        const facingMode = selectedMode === 'incident' ? 'environment' : 'user';
        await startCamera(facingMode);

        if (!navigator.geolocation) {
            alert("Geolocalización no soportada en este navegador.");
            setStep('idle');
        }
    };

    const [capturedData, setCapturedData] = useState(null);

    const capture = useCallback(async () => {
        if (isCapturing) return;
        setIsCapturing(true);

        try {
            // 0. Manual Capture using Canvas
            if (!videoRef.current || !canvasRef.current) throw new Error("Cámara no lista");

            const video = videoRef.current;
            const canvas = canvasRef.current;

            // Set canvas dimensions to match video
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;

            // Draw
            const context = canvas.getContext('2d');
            context.drawImage(video, 0, 0, canvas.width, canvas.height);

            const imageSrc = canvas.toDataURL('image/jpeg', 0.8); // Higher quality for sharing
            if (!imageSrc) throw new Error("Error generando imagen");

            // --- NUEVO FLUJO: VERIFICACIÓN FACIAL INMEDIATA ---
            if (savedDescriptor) {
                setStep('processing');
                setStatusMessage('Verificando identidad facial...');
                setVerifyingFace(true);

                try {
                    // Detectar directamente desde el video (más rápido y preciso)
                    const detection = await faceapi.detectSingleFace(
                        video,
                        new faceapi.TinyFaceDetectorOptions()
                    ).withFaceLandmarks().withFaceDescriptor();

                    if (!detection) {
                        setFaceError('No se pudo detectar tu rostro. Asegúrate de tener buena luz y estar frente a la cámara.');
                        setFaceVerified(false);
                    } else {
                        const distance = faceapi.euclideanDistance(detection.descriptor, savedDescriptor);
                        console.log("Distancia facial:", distance);
                        // Umbral más permisivo: 0.68 (era 0.62)
                        // Esto reduce falsos negativos por iluminación/ángulo
                        if (distance < 0.68) {
                            setFaceVerified(true);
                            setFaceError('');
                        } else {
                            setFaceError('La identidad facial no coincide con el registro.');
                            setFaceVerified(false);
                        }
                    }
                } catch (faceErr) {
                    console.error("Error en detección facial:", faceErr);
                    setFaceError('Error en el sensor de reconocimiento. Reintenta.');
                    setFaceVerified(false);
                } finally {
                    setVerifyingFace(false);
                }
            } else {
                setFaceVerified(true); // Permitir si no hay registro previo
            }

            // AHORA DETENEMOS LA CÁMARA
            stopCamera();

            // CONTINUAMOS CON LOS DATOS LENTOS (GPS, HORA)
            setStatusMessage('Obteniendo ubicación y hora...');

            // 1. Get Location
            const position = await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                    enableHighAccuracy: true,
                    timeout: 8000, // Aumentado timeout para móviles lentos
                    maximumAge: 0
                });
            });

            const { latitude, longitude, accuracy } = position.coords;

            // 2. Get Time
            const serverTime = await fetchServerTime();

            setStatusMessage('Obteniendo dirección...');

            // 3. Get Address
            const address = await fetchLocationName(latitude, longitude);

            setStatusMessage('Procesando marca de agua...');

            // 4. Watermark
            const watermarkedImage = await addWatermarkToImage(imageSrc, {
                employeeId: currentUser.email,
                timestamp: serverTime,
                coords: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
                locationName: address,
                mode: mode
            });

            // STORE DATA FOR PREVIEW, DONT SAVE YET
            const now = new Date();
            const dateStr = now.toLocaleDateString('es-ES');
            const timeStr = now.toLocaleTimeString('es-ES');

            let tipoLabel = 'Entrada';
            if (mode === 'exit') tipoLabel = 'Salida';
            else if (mode === 'incident') tipoLabel = 'Incidente';

            setCapturedData({
                image: watermarkedImage,
                metadata: {
                    usuario: currentUser.email,
                    tipo: tipoLabel,
                    fecha: dateStr,
                    hora: timeStr,
                    localidad: address,
                    timestamp: serverTimestamp()
                }
            });

            setStep('preview');
            setIsCapturing(false);

        } catch (error) {
            console.error(error);
            alert(`Error: ${error.message}`);
            stopCamera();
            setStep('idle');
            setIsCapturing(false);
        }
    }, [mode, currentUser, isCapturing]);

    const shareImage = async () => {
        if (!capturedData || !capturedData.image) return;

        try {
            // Convert DataURL to Blob
            const response = await fetch(capturedData.image);
            const blob = await response.blob();
            const file = new File([blob], "asistencia_evidencia.jpg", { type: "image/jpeg" });

            const shareData = {
                title: 'Registro de Asistencia',
                text: `Usuario: ${capturedData.metadata.usuario}\nFecha: ${capturedData.metadata.fecha} ${capturedData.metadata.hora}\nAcción: ${capturedData.metadata.tipo}`,
                files: [file]
            };

            // Intentar compartir directamente
            if (navigator.share) {
                await navigator.share(shareData);
            } else {
                // Fallback: descargar imagen
                const link = document.createElement('a');
                link.href = capturedData.image;
                link.download = `asistencia_${capturedData.metadata.fecha.replace(/\//g, '-')}_${capturedData.metadata.hora.replace(/:/g, '-')}.jpg`;
                link.click();
            }
        } catch (error) {
            console.error("Error sharing:", error);
            // Si el usuario cancela o hay error, no hacer nada
            // Los datos ya están guardados
        }
    };

    const saveRecord = async () => {
        if (!capturedData) return false;
        setStep('processing');
        setStatusMessage('Guardando registro...');

        try {
            if (mode === 'incident') {
                // Guardar en colección separada con descripción
                await addDoc(collection(db, "incidents"), {
                    ...capturedData.metadata,
                    descripcion: incidentDescription.trim() || '(Sin descripción)',
                });
            } else {
                await addDoc(collection(db, "attendance"), capturedData.metadata);
            }
            return true;
        } catch (error) {
            console.error(error);
            alert(`Error guardando datos: ${error.message}`);
            setStep('preview');
            return false;
        }
    };

    return (
        <div className="min-h-screen bg-gray-100 flex flex-col">
            <AdminPasswordModal
                isOpen={showAdminModal}
                onClose={() => setShowAdminModal(false)}
                onSuccess={() => {
                    setShowAdminModal(false);
                    navigate(adminTarget);
                }}
            />
            {/* Header */}
            <div className="bg-white shadow p-4 flex justify-between items-center gap-2 overflow-x-auto">
                <div className="flex gap-2 shrink-0">
                    <button
                        onClick={() => { setAdminTarget('/registro'); setShowAdminModal(true); }}
                        className="flex flex-col items-center gap-0.5 text-green-600 font-bold border-2 border-green-200 px-3 py-1.5 rounded-xl hover:bg-green-50 transition"
                    >
                        <Settings size={18} />
                        <span className="text-[10px] uppercase">Registro</span>
                    </button>
                    <button
                        onClick={() => { setAdminTarget('/admin'); setShowAdminModal(true); }}
                        className="flex flex-col items-center gap-0.5 text-blue-600 font-bold border-2 border-blue-200 px-3 py-1.5 rounded-xl hover:bg-blue-50 transition"
                    >
                        <Settings size={18} />
                        <span className="text-[10px] uppercase">Datos</span>
                    </button>
                </div>
                <h1 className="text-lg font-bold text-gray-800 flex-1 text-center truncate">Control Asistencia</h1>
                <button onClick={() => logout()} className="text-red-500 text-xs font-semibold hover:text-red-700 shrink-0">Salir</button>
            </div>

            {(showInstallBtn && !isStandalone) && (
                <div className="bg-green-500 p-2 flex justify-center animate-pulse">
                    <button
                        onClick={handleInstallClick}
                        className="text-white text-xs font-bold uppercase tracking-wider flex items-center gap-2"
                    >
                        + Descargar Aplicación en Celular
                    </button>
                </div>
            )}

            {(isIOS && !isStandalone && !showInstallBtn) && (
                <div className="bg-blue-600 p-2 flex justify-center items-center gap-2 text-[10px] text-white overflow-x-auto whitespace-nowrap">
                    <span>📱 iPhone: Toca "Compartir" y "Añadir a pantalla de inicio"</span>
                </div>
            )}

            <div className="flex-1 p-4 flex flex-col items-center justify-center max-w-md mx-auto w-full">

                {step === 'idle' && (
                    <div className="grid grid-cols-1 gap-6 w-full">
                        <div className="bg-white p-6 rounded-xl shadow-lg text-center">
                            <h2 className="text-lg font-medium text-gray-600 mb-2">Bienvenido, {currentUser.email}</h2>
                            {loadingState ? (
                                <p className="text-sm text-blue-500 animate-pulse">Verificando estado de asistencia...</p>
                            ) : (
                                <p className="text-sm text-gray-400">
                                    {allowedActions.entry ? 'Es momento de registrar tu ENTRADA.' : 'Tienes una entrada pendiente. Registra tu SALIDA.'}
                                </p>
                            )}
                        </div>

                        {!loadingState && allowedActions.entry && (
                            <button
                                onClick={() => handleStart('entry')}
                                className="group relative flex flex-col items-center justify-center p-8 bg-gradient-to-tr from-green-400 to-green-600 rounded-2xl shadow-lg hover:shadow-xl transition transform hover:scale-105 active:scale-95 animate-fade-in"
                            >
                                <LogIn className="w-12 h-12 text-white mb-2" />
                                <span className="text-2xl font-bold text-white">Registrar Entrada</span>
                            </button>
                        )}

                        {!loadingState && allowedActions.exit && (
                            <button
                                onClick={() => handleStart('exit')}
                                className="group relative flex flex-col items-center justify-center p-8 bg-gradient-to-tr from-red-400 to-red-600 rounded-2xl shadow-lg hover:shadow-xl transition transform hover:scale-105 active:scale-95 animate-fade-in"
                            >
                                <LogOut className="w-12 h-12 text-white mb-2" />
                                <span className="text-2xl font-bold text-white">Registrar Salida</span>
                            </button>
                        )}

                        {/* Mensaje visual de bloqueo si uno está deshabilitado */}
                        {!loadingState && !allowedActions.entry && (
                            <div className="opacity-40 grayscale flex flex-col items-center justify-center p-4 border-2 border-dashed border-gray-300 rounded-xl">
                                <span className="text-gray-400 font-bold block mb-1">Entrada Bloqueada</span>
                                <span className="text-[10px] text-gray-400 text-center">Debes marcar salida primero o esperar 20h</span>
                            </div>
                        )}
                        {!loadingState && !allowedActions.exit && (
                            <div className="opacity-40 grayscale flex flex-col items-center justify-center p-4 border-2 border-dashed border-gray-300 rounded-xl">
                                <span className="text-gray-400 font-bold block mb-1">Salida Bloqueada</span>
                                <span className="text-[10px] text-gray-400 text-center">Debes marcar entrada primero</span>
                            </div>
                        )}
                        {/* Botón INCIDENTE — siempre visible, sin restricción de ciclo */}
                        {!loadingState && (
                            <button
                                onClick={() => handleStart('incident')}
                                className="group relative flex flex-col items-center justify-center p-5 bg-gradient-to-tr from-orange-400 to-orange-600 rounded-2xl shadow-lg hover:shadow-xl transition transform hover:scale-105 active:scale-95 animate-fade-in"
                            >
                                <TriangleAlert className="w-8 h-8 text-white mb-1" />
                                <span className="text-xl font-bold text-white">Reportar Incidente</span>
                                <span className="text-xs text-orange-100 mt-1">Daño o accidente en el trabajo</span>
                            </button>
                        )}
                    </div>
                )}

                {step === 'camera' && (
                    <div className="w-full flex flex-col items-center animate-fade-in">
                        <h2 className="text-xl font-bold mb-4 capitalize text-gray-800">
                            {mode === 'incident' ? '⚠️ Registrando Incidente' : `Registrando ${mode === 'entry' ? 'Entrada' : 'Salida'}`}
                        </h2>

                        {/* Native Video Element */}
                        <div className="relative rounded-2xl overflow-hidden shadow-2xl border-4 border-white bg-black w-full aspect-[3/4] max-w-[280px]">
                            {/* Overflow: mirror solo para cámara frontal */}
                            <video
                                ref={videoRef}
                                autoPlay
                                playsInline
                                muted
                                className={`w-full h-full object-cover ${mode !== 'incident' ? 'transform scale-x-[-1]' : ''}`}
                            />

                            {/* Hidden canvas for capture */}
                            <canvas ref={canvasRef} className="hidden" />

                            <div className="absolute inset-0 border-2 border-white/30 rounded-2xl pointer-events-none"></div>

                            {/* Overlay info */}
                            <div className="absolute bottom-4 left-4 right-4 bg-black/50 backdrop-blur text-white p-2 rounded text-xs">
                                <div className="flex items-center gap-1"><MapPin size={12} /> Buscando GPS...</div>
                                {mode === 'incident'
                                    ? <div className="flex items-center gap-1"><TriangleAlert size={12} /> Fotografía el área afectada</div>
                                    : <div className="flex items-center gap-1"><Camera size={12} /> Rostro visible requerido</div>
                                }
                            </div>
                        </div>

                        <div className="mt-6 flex gap-4">
                            <button
                                onClick={handleStopCamera}
                                className="px-6 py-3 rounded-full bg-gray-200 text-gray-700 font-bold hover:bg-gray-300"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={capture}
                                disabled={step === 'processing'}
                                className={`px-8 py-3 rounded-full text-white font-bold shadow-lg transition transform active:translate-y-1 ${step === 'processing' ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
                            >
                                {step === 'processing' ? 'Procesando...' : 'Capturar'}
                            </button>
                        </div>
                    </div>
                )}

                {step === 'processing' && (
                    <div className="text-center p-10">
                        <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-blue-500 mx-auto mb-4"></div>
                        <p className="text-gray-600 font-medium">{statusMessage}</p>
                    </div>
                )}

                {step === 'preview' && capturedData && (
                    <div className="w-full flex flex-col items-center animate-fade-in">
                        <h2 className="text-xl font-bold mb-2 text-gray-800">
                            {mode === 'incident' ? '⚠️ Vista Previa del Incidente' : 'Vista Previa'}
                        </h2>
                        <p className="text-sm text-gray-500 mb-4 text-center">
                            {mode === 'incident'
                                ? 'Describe el incidente antes de guardar.'
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
                                    onClick={handleStopCamera}
                                    className="absolute top-4 left-4 flex items-center gap-2 px-4 py-2 bg-red-600 text-white font-bold rounded-lg shadow-lg hover:bg-red-700 transition transform hover:scale-105"
                                >
                                    <Camera size={20} />
                                    REPETIR FOTO
                                </button>
                            )}

                            {(faceVerified || mode === 'incident') && (
                                <div className={`absolute top-4 right-4 p-1 rounded-full shadow-lg ${mode === 'incident' ? 'bg-orange-500' : 'bg-green-500'} text-white`}>
                                    {mode === 'incident' ? <TriangleAlert size={24} /> : <UserCheck size={24} />}
                                </div>
                            )}
                        </div>

                        {/* Campo de descripción SOLO para incidentes */}
                        {mode === 'incident' && (
                            <div className="w-full max-w-sm mb-4">
                                <label className="block text-sm font-bold text-orange-700 mb-1">📝 Descripción del incidente *</label>
                                <textarea
                                    value={incidentDescription}
                                    onChange={(e) => setIncidentDescription(e.target.value)}
                                    placeholder="Describe detalladamente lo que ocurrió, el área afectada y el tipo de daño..."
                                    rows={4}
                                    className="w-full border-2 border-orange-300 rounded-xl p-3 text-sm focus:outline-none focus:border-orange-500 resize-none"
                                />
                            </div>
                        )}

                        <div className="flex flex-col gap-3 w-full max-w-xs">
                            <button
                                onClick={async () => {
                                    if (mode !== 'incident' && !faceVerified) {
                                        alert("Verificación facial fallida. No se puede guardar el registro.");
                                        return;
                                    }
                                    if (mode === 'incident' && !incidentDescription.trim()) {
                                        alert("Por favor describe el incidente antes de guardar.");
                                        return;
                                    }

                                    const saved = await saveRecord();
                                    if (!saved) return;

                                    await shareImage();

                                    setStep('success');
                                    setStatusMessage('¡Registro Exitoso!');
                                    setTimeout(() => {
                                        logout();
                                    }, 3000);
                                }}
                                className={`w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-white font-bold shadow-lg transition ${mode === 'incident'
                                    ? 'bg-orange-500 hover:bg-orange-600'
                                    : 'bg-green-600 hover:bg-green-700'
                                    }`}
                            >
                                <CheckCircle size={20} />
                                {mode === 'incident' ? 'Guardar Incidente y Compartir' : 'Guardar y Compartir'}
                            </button>
                            <button
                                onClick={() => { stopCamera(); setStep('idle'); setMode(null); }}
                                className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gray-100 text-gray-600 font-bold hover:bg-gray-200 transition"
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                )}

                {step === 'success' && (
                    <div className="text-center p-10 bg-white rounded-2xl shadow-xl animate-fade-in">
                        <CheckCircle className="w-20 h-20 text-green-500 mx-auto mb-4" />
                        <h2 className="text-2xl font-bold text-gray-800 mb-2">¡Registrado!</h2>
                        <p className="text-gray-600">Registro guardado exitosamente.</p>
                        <p className="text-xs text-gray-400 mt-2">(La imagen no se guardó en el servidor para ahorrar costos)</p>
                    </div>
                )}
            </div>
            {/* Version Indicator */}
            <div className="p-2 text-center flex flex-col items-center gap-1 opacity-50">
                <span className="text-[10px] text-black font-mono px-2 py-0.5 rounded">v1.1.0</span>
                <button
                    onClick={clearAppCache}
                    className="text-[9px] text-blue-600 underline decoration-blue-300 hover:text-blue-800 transition pointer-events-auto"
                >
                    Limpiar App si no se actualiza
                </button>
            </div>
        </div>
    );
}
