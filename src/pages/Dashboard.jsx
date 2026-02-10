import React, { useState, useRef, useCallback, useEffect } from 'react';
import Webcam from 'react-webcam';
import { useAuth } from '../contexts/AuthContext';
import { addWatermarkToImage, fetchServerTime, fetchLocationName } from '../utils/watermark';
import { db } from '../firebaseConfig';
import { collection, addDoc, query, where, getDocs, serverTimestamp } from 'firebase/firestore';
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

    const [mode, setMode] = useState(null); // 'entry' or 'exit'
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

    const startCamera = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user' },
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

        // Iniciamos la cámara; el useEffect se encargará de conectarla al videoRef
        await startCamera();

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
                        if (distance < 0.6) {
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
            // Preparar fechas separadas para Excel
            const now = new Date();
            const dateStr = now.toLocaleDateString('es-ES'); // DD/MM/YYYY
            const timeStr = now.toLocaleTimeString('es-ES'); // HH:MM:SS

            setCapturedData({
                image: watermarkedImage,
                metadata: {
                    // --- SOLO 5 ELEMENTOS (LIMPIO) ---
                    usuario: currentUser.email, // 1. Quién
                    tipo: mode === 'entry' ? 'Entrada' : 'Salida', // 2. Qué
                    fecha: dateStr, // 3. Cuándo (Día)
                    hora: timeStr, // 4. Cuándo (Hora)
                    localidad: address // 5. Dónde
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
        if (!capturedData) return;
        setStep('processing');
        setStatusMessage('Guardando registro...');

        try {
            // 5. Save to Firestore (LIMPIO - Solo los metadatos)
            await addDoc(collection(db, "attendance"), capturedData.metadata);

            // NO mostrar éxito aquí, solo confirmar que se guardó
            return true;
        } catch (error) {
            console.error(error);
            alert(`Error guardando datos: ${error.message}`);
            setStep('preview'); // Go back to preview if error
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
                        <span className="text-[10px] uppercase">Admin</span>
                    </button>
                </div>
                <h1 className="text-lg font-bold text-gray-800 flex-1 text-center truncate">Control Asistencia</h1>
                <button onClick={() => logout()} className="text-red-500 text-xs font-semibold hover:text-red-700 shrink-0">Salir</button>
            </div>

            <div className="flex-1 p-4 flex flex-col items-center justify-center max-w-md mx-auto w-full">

                {step === 'idle' && (
                    <div className="grid grid-cols-1 gap-6 w-full">
                        <div className="bg-white p-6 rounded-xl shadow-lg text-center">
                            <h2 className="text-lg font-medium text-gray-600 mb-2">Bienvenido, {currentUser.email}</h2>
                            <p className="text-sm text-gray-400">Seleccione una acción para registrar.</p>
                        </div>

                        <button
                            onClick={() => handleStart('entry')}
                            className="group relative flex flex-col items-center justify-center p-8 bg-gradient-to-tr from-green-400 to-green-600 rounded-2xl shadow-lg hover:shadow-xl transition transform hover:scale-105 active:scale-95"
                        >
                            <LogIn className="w-12 h-12 text-white mb-2" />
                            <span className="text-2xl font-bold text-white">Registrar Entrada</span>
                        </button>

                        <button
                            onClick={() => handleStart('exit')}
                            className="group relative flex flex-col items-center justify-center p-8 bg-gradient-to-tr from-red-400 to-red-600 rounded-2xl shadow-lg hover:shadow-xl transition transform hover:scale-105 active:scale-95"
                        >
                            <LogOut className="w-12 h-12 text-white mb-2" />
                            <span className="text-2xl font-bold text-white">Registrar Salida</span>
                        </button>
                    </div>
                )}

                {step === 'camera' && (
                    <div className="w-full flex flex-col items-center animate-fade-in">
                        <h2 className="text-xl font-bold mb-4 capitalize text-gray-800">
                            Registrando {mode === 'entry' ? 'Entrada' : 'Salida'}
                        </h2>

                        {/* Native Video Element */}
                        <div className="relative rounded-2xl overflow-hidden shadow-2xl border-4 border-white bg-black w-full aspect-[3/4] max-w-[280px]">
                            <video
                                ref={videoRef}
                                autoPlay
                                playsInline
                                muted
                                className="w-full h-full object-cover transform scale-x-[-1]" // Mirror effect
                            />

                            {/* Hidden canvas for capture */}
                            <canvas ref={canvasRef} className="hidden" />

                            <div className="absolute inset-0 border-2 border-white/30 rounded-2xl pointer-events-none"></div>

                            {/* Overlay info */}
                            <div className="absolute bottom-4 left-4 right-4 bg-black/50 backdrop-blur text-white p-2 rounded text-xs">
                                <div className="flex items-center gap-1"><MapPin size={12} /> Buscando GPS...</div>
                                <div className="flex items-center gap-1"><Camera size={12} /> Rostro visible requerido</div>
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
                        <h2 className="text-xl font-bold mb-2 text-gray-800">Vista Previa</h2>
                        <p className="text-sm text-gray-500 mb-4 text-center">
                            {faceVerified
                                ? 'Identidad verificada correctamente. Comparte esta imagen como evidencia.'
                                : 'No se pudo verificar tu identidad facial.'}
                        </p>

                        {!faceVerified && faceError && (
                            <div className="bg-red-100 text-red-700 p-3 rounded-lg flex items-center gap-2 mb-4 w-full max-w-sm">
                                <ShieldAlert size={20} />
                                <span className="text-xs font-bold">{faceError}</span>
                            </div>
                        )}

                        <div className="relative rounded-2xl overflow-hidden shadow-2xl border-4 bg-gray-900 w-full max-w-sm mb-6"
                            style={{ borderColor: faceVerified ? '#22c55e' : '#ef4444' }}>
                            <img src={capturedData.image} alt="Capture" className="w-full h-auto" />
                            {faceVerified && (
                                <div className="absolute top-4 right-4 bg-green-500 text-white p-1 rounded-full shadow-lg">
                                    <UserCheck size={24} />
                                </div>
                            )}
                        </div>

                        <div className="flex flex-col gap-3 w-full max-w-xs">
                            <button
                                onClick={async () => {
                                    if (!faceVerified) {
                                        alert("Verificación facial fallida. No se puede guardar el registro.");
                                        return;
                                    }

                                    // 1. GUARDAR EN BASE DE DATOS (Obligatorio)
                                    const saved = await saveRecord();
                                    if (!saved) return; // Si falla, no continuar

                                    // 2. COMPARTIR IMAGEN (Esperar a que termine)
                                    await shareImage();

                                    // 3. MOSTRAR ÉXITO DESPUÉS DE COMPARTIR
                                    setStep('success');
                                    setStatusMessage('¡Registro Exitoso!');
                                    setTimeout(() => {
                                        // Seguridad: Logout automático tras finalizar
                                        logout();
                                    }, 3000);
                                }}
                                className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-green-600 text-white font-bold shadow-lg hover:bg-green-700 transition"
                            >
                                <CheckCircle size={20} />
                                Guardar y Compartir
                            </button>

                            <button
                                onClick={handleStopCamera}
                                className="w-full text-gray-500 text-sm mt-2 underline"
                            >
                                Cancelar / Tomar otra
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
            <div className="p-2 text-center text-[8px] text-black pointer-events-none lowercase">
                (v1.0.2)
            </div>
        </div>
    );
}
