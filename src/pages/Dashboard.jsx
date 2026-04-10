import React, { useState, useRef, useCallback, useEffect } from 'react';
import Webcam from 'react-webcam';
import { useAuth } from '../contexts/AuthContext';
import { addWatermarkToImage, fetchServerTime, fetchLocationName } from '../utils/watermark';
import { db } from '../firebaseConfig';
import { collection, addDoc, query, where, getDocs, serverTimestamp, doc, getDoc, Timestamp, setDoc } from 'firebase/firestore';
import { Camera, MapPin, CheckCircle, LogOut, LogIn, UserCheck, ShieldAlert, TriangleAlert } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import * as faceapi from '@vladmandic/face-api';
import { uploadPhoto } from '../services/storageService';
import { fetchLicenseStatus } from '../services/licenseService';
import ActionButtons from '../components/dashboard/ActionButtons';
import CameraView from '../components/dashboard/CameraView';
import PreviewView from '../components/dashboard/PreviewView';
import SuccessView from '../components/dashboard/SuccessView';
import { saveOfflineRecord, getPendingRecords } from '../services/offlineStorage';

export default function Dashboard() {
    const { currentUser, logout } = useAuth();
    const navigate = useNavigate();
    // Refs for Native Camera
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const streamRef = useRef(null);
    const livenessIntervalRef = useRef(null);
    const modeRef = useRef(null);
    const isLivenessRunningRef = useRef(false);

    const [mode, setMode] = useState(null); // 'entry', 'exit', 'incident'
    const [allowedActions, setAllowedActions] = useState({ entry: true, exit: true });
    const [loadingState, setLoadingState] = useState(true);
    const [incidentDescription, setIncidentDescription] = useState(''); // Descripción de la novedad
    const [step, setStep] = useState('idle'); // idle, camera, processing, success
    const [statusMessage, setStatusMessage] = useState('');
    const [isCapturing, setIsCapturing] = useState(false);
    const [modelsLoaded, setModelsLoaded] = useState(false);
    const [savedDescriptor, setSavedDescriptor] = useState(null);
    const [faceVerified, setFaceVerified] = useState(false);
    const [faceError, setFaceError] = useState('');
    const [cameraReady, setCameraReady] = useState(false);
    // Liveness detection states
    const [blinkCount, setBlinkCount] = useState(0);
    const [autoCapturePending, setAutoCapturePending] = useState(false);
    const blinkCountRef = useRef(0);
    const eyeClosedRef = useRef(false);
    const [captureFlash, setCaptureFlash] = useState(false);
    const [deferredPrompt, setDeferredPrompt] = useState(null);
    const [showInstallBtn, setShowInstallBtn] = useState(false);
    const [isIOS, setIsIOS] = useState(false);
    const [isStandalone, setIsStandalone] = useState(false);
    const [storageSettings, setStorageSettings] = useState({
        storage_saveAsistencia: true,
        storage_saveIncidentes: true,
        security_liveness: true,
        security_faceRecognition: true,
        ruta_active: false
    });
    const [isLicenseValid, setIsLicenseValid] = useState(true);
    const [buttonLabels, setButtonLabels] = useState({
        entry: "Registrar Entrada",
        exit: "Registrar Salida",
        incident: "Reportar Novedad"
    });
    const [faceThreshold, setFaceThreshold] = useState(0.63);

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
    // Cargar modelos, descriptor del empleado y configuraciones generales
    useEffect(() => {
        const loadModelsAndData = async () => {
            try {
                // 1. Cargar Configuración de Storage
                const snapSettings = await getDoc(doc(db, 'settings', 'employeeFields'));
                if (snapSettings.exists()) {
                    const d = snapSettings.data();
                    setStorageSettings({
                        storage_saveAsistencia: d.storage_saveAsistencia !== false,
                        storage_saveIncidentes: d.storage_saveIncidentes !== false,
                        security_liveness: d.security_liveness !== false,
                        security_faceRecognition: d.security_faceRecognition !== false,
                        ruta_active: d.ruta_active === true
                    });
                    setButtonLabels({
                        entry: d.ui_labelEntry || "Registrar Entrada",
                        exit: d.ui_labelExit || "Registrar Salida",
                        incident: d.ui_labelIncident || "Reportar Novedad"
                    });
                    if (d.security_faceThreshold !== undefined) {
                        setFaceThreshold(d.security_faceThreshold);
                    }
                }

                // 1.5 Cargar Estado de la Licencia
                const licStatus = await fetchLicenseStatus();
                if (licStatus && licStatus.decoded && (!licStatus.decoded.isValid || licStatus.decoded.isExpired)) {
                    setIsLicenseValid(false);
                }

                // 2. Cargar Modelos Faciales (DESDE LOCAL PARA OFFLINE)
                const MODEL_URL = '/models/';
                await Promise.all([
                    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
                    faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
                    faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
                ]);
                setModelsLoaded(true);

                // 3. Cargar datos del empleado actual
                if (currentUser) {
                    // Intento cargar desde Cache Local primero (Offline Ready)
                    const cachedDescriptor = localStorage.getItem(`face_descriptor_${currentUser.email}`);
                    if (cachedDescriptor) {
                        setSavedDescriptor(new Float32Array(JSON.parse(cachedDescriptor)));
                        console.log("🧬 Descriptor facial cargado desde cache local.");
                    }

                    // Intentar actualizar desde Firestore si hay red
                    const q = query(collection(db, "employees"), where("email", "==", currentUser.email));
                    const snap = await getDocs(q);
                    if (!snap.empty) {
                        const data = snap.docs[0].data();
                        if (data.faceDescriptor) {
                            const desc = new Float32Array(data.faceDescriptor);
                            setSavedDescriptor(desc);
                            // Actualizar cache local
                            localStorage.setItem(`face_descriptor_${currentUser.email}`, JSON.stringify(Array.from(desc)));
                        }
                    }
                }
            } catch (err) {
                console.error("Error cargando modelos/datos:", err);
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
                // OFFLINE SAFETY: Si no hay internet, permitimos seguir
                console.warn("Error verificando acceso (probablemente offline):", err);
            }
        };

        checkAccess();

        // Verificar ESTADO DEL USUARIO (Entrada/Salida)
        // Sin orderBy para no requerir índice compuesto — ordenamos en el cliente
        const checkLastStatus = async () => {
            if (!currentUser) {
                setLoadingState(false);
                return;
            }

            // Helper para fecha + hora
            const getMillisFromDateTime = (fecha, hora) => {
                if (!fecha || !hora) return 0;
                try {
                    const [d, m, y] = fecha.split('/');
                    const [h, min, s] = hora.split(':');
                    return new Date(y, m - 1, d, h, min, s).getTime();
                } catch {
                    return 0;
                }
            };

            // Helper para obtener milisegundos de timestamp
            const getMillisLocal = (ts) => {
                if (!ts) return 0;
                if (typeof ts.toMillis === 'function') return ts.toMillis();
                if (ts instanceof Date) return ts.getTime();
                if (typeof ts === 'number') return ts;
                if (typeof ts === 'string') return new Date(ts).getTime();
                return Date.now();
            };

            // Función para determinar acciones basadas en tipo (sin sobrescribir localStorage)
            const setActionsFromType = (lastType, lastTime, updateLS = true) => {
                const normalizedType = (lastType || '').trim().toLowerCase();
                
                if (normalizedType === 'salida') {
                    setAllowedActions({ entry: true, exit: false });
                    if (updateLS) {
                        localStorage.setItem(`lastAttendanceType_${currentUser.email}`, 'Salida');
                        localStorage.setItem(`lastAttendanceTime_${currentUser.email}`, Date.now().toString());
                    }
                } else if (normalizedType === 'entrada' || normalizedType === 'en cliente' || normalizedType === 'en tránsito' || normalizedType === 'llegada cliente' || normalizedType === 'salida cliente') {
                    // Convertir lastTime a timestamp
                    let lastTimeNum = 0;
                    if (lastTime) {
                        lastTimeNum = typeof lastTime === 'number' ? lastTime : parseInt(lastTime, 10);
                    }
                    
                    const diffHours = lastTimeNum > 0 ? (Date.now() - lastTimeNum) / (1000 * 60 * 60) : 0;
                    
                    if (diffHours > 20) {
                        setAllowedActions({ entry: true, exit: false });
                        if (updateLS) {
                            localStorage.setItem(`lastAttendanceType_${currentUser.email}`, 'Entrada');
                            localStorage.setItem(`lastAttendanceTime_${currentUser.email}`, Date.now().toString());
                            localStorage.removeItem(`lastRutaType_${currentUser.email}`);
                        }
                    } else {
                        setAllowedActions({ entry: false, exit: true });
                        if (updateLS) {
                            localStorage.setItem(`lastAttendanceType_${currentUser.email}`, 'Entrada');
                            localStorage.setItem(`lastAttendanceTime_${currentUser.email}`, lastTimeNum || Date.now().toString());
                        }
                    }
                } else {
                    // Cualquier otro caso: Forzar a Entrada por defecto (nunca permitir ambos juntos)
                    setAllowedActions({ entry: true, exit: false });
                    if (updateLS) {
                        localStorage.setItem(`lastAttendanceType_${currentUser.email}`, 'Salida'); // Como si hubiera salido
                        localStorage.setItem(`lastAttendanceTime_${currentUser.email}`, Date.now().toString());
                        localStorage.removeItem(`lastRutaType_${currentUser.email}`);
                    }
                }
            };

            // Bandera para evitar sobrescribir estado ya establecido
            let stateAlreadySet = false;

            // 1. PRIMERO: Cargar desde localStorage INMEDIATAMENTE (para velocidad)
            const lastTypeLS = localStorage.getItem(`lastAttendanceType_${currentUser.email}`);
            const lastTimeLS = localStorage.getItem(`lastAttendanceTime_${currentUser.email}`);
            
            // 2. Consultar Firestore para obtener el último registro real
            try {
                // Un solo where por usuario — NO requiere índice compuesto.
                // Usamos limitToLast(10) ordenando por __name__ como trick, pero más fácil:
                // traemos todos del usuario y ordenamos en memoria; Firebase cachea bien esto.
                const q = query(
                    collection(db, "attendance"),
                    where("usuario", "==", currentUser.email)
                );
                const snap = await getDocs(q);
                
                if (!snap.empty) {
                    // Ordenar en memoria: el más reciente primero
                    const records = snap.docs.map(d => d.data());
                    records.sort((a, b) => {
                        // Utilizar los helper methods getMillisLocal y getMillisFromDateTime
                        const tA = getMillisLocal(a.timestamp) || getMillisFromDateTime(a.fecha, a.hora) || 0;
                        const tB = getMillisLocal(b.timestamp) || getMillisFromDateTime(b.fecha, b.hora) || 0;
                        return tB - tA; 
                    });
                    
                    const lastDoc = records[0];
                    const lastTipo = lastDoc.tipo;
                    
                    let firestoreTime = getMillisLocal(lastDoc.timestamp) || getMillisFromDateTime(lastDoc.fecha, lastDoc.hora) || 0;
                    
                    console.log("📡 Firestore manda. Último registro:", lastTipo);
                    // Firestore SIMPRE gana si hay conexión y encuentra datos recientes.
                    setActionsFromType(lastTipo, firestoreTime, true);
                    stateAlreadySet = true;
                }
            } catch (err) {
                console.warn("⚠️ Sin conexión a Firestore o error. Fallback a memoria local:", err);
            }

            // 3. Fallback: Si no hay internet o no hay registros recientes en Firebase, usar localStorage o Entrada por defecto
            if (!stateAlreadySet) {
                if (lastTypeLS) {
                    console.log("📱 Usando memoria local por falta de conexión/datos recientes");
                    setActionsFromType(lastTypeLS, lastTimeLS ? parseInt(lastTimeLS) : null, false);
                } else {
                    setAllowedActions({ entry: true, exit: false });
                }
            }
            
            setLoadingState(false);
        };
        checkLastStatus();

        return () => {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => {
                    track.stop();
                    try { track.enabled = false; } catch (e) { }
                });
            }
        };
    }, [logout, currentUser, navigate, isLicenseValid]);

    // --- LIVENESS: Reto de Rotación de Cabeza ---
    // Detecta el giro de la cabeza (Yaw) usando la posición de la nariz relativa a los ojos.
    // Requiere: 1. Mirar al frente -> 2. Girar a la izquierda -> 3. Volver al frente.
    const startLivenessCheck = () => {
        isLivenessRunningRef.current = true;
        setBlinkCount(0);
        blinkCountRef.current = 0;

        // Estados del reto: 0=Esperando frente, 1=Girando izquierda, 2=Volviendo al frente
        let challengeState = 0;
        let isDetecting = false;

        const loop = async () => {
            if (!isLivenessRunningRef.current) return;

            if (!isDetecting && videoRef.current && videoRef.current.readyState >= 2) {
                isDetecting = true;
                try {
                    const videoEl = videoRef.current;
                    // Asegurarnos de que el video tiene dimensiones válidas antes de detectar
                    if (videoEl.videoWidth === 0 || videoEl.videoHeight === 0) {
                        isDetecting = false;
                        if (isLivenessRunningRef.current) {
                            livenessIntervalRef.current = requestAnimationFrame(loop);
                        }
                        return;
                    }

                    const detection = await faceapi
                        .detectSingleFace(
                            videoEl,
                            new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.3 })
                        )
                        .withFaceLandmarks();

                    if (detection) {
                        const landmarks = detection.landmarks.positions;
                        const leftEye = landmarks[36];  // Extremo ojo izq
                        const rightEye = landmarks[45]; // Extremo ojo der
                        const nose = landmarks[30];     // Punta nariz

                        // Cálculo de Yaw simplificado (0.5 es centro, <0.3 es giro a izq, >0.7 es giro a der)
                        // Usamos escala de pantalla (ojo izq tiene X menor que ojo der usualmente)
                        const eyeDist = rightEye.x - leftEye.x;
                        const noseFromLeft = nose.x - leftEye.x;
                        const yawRatio = noseFromLeft / eyeDist;

                        if (challengeState === 0) {
                            // Paso 0: Mirar al frente
                            if (yawRatio > 0.4 && yawRatio < 0.6) {
                                challengeState = 1;
                                blinkCountRef.current = 20;
                                setBlinkCount(20);
                                setStatusMessage('¡Bien! Ahora gire la cabeza a la IZQUIERDA');
                            } else {
                                setStatusMessage('Póngase de frente a la cámara');
                            }
                        } else if (challengeState === 1) {
                            // Paso 1: Girar a la izquierda (yawRatio disminuye)
                            if (yawRatio < 0.35) {
                                challengeState = 2;
                                blinkCountRef.current = 60;
                                setBlinkCount(60);
                                setStatusMessage('Excelente. Ahora vuelva al CENTRO');
                            }
                            // Si se queda demasiado tiempo o gira al revés, no hacemos nada, solo esperamos
                        } else if (challengeState === 2) {
                            // Paso 2: Volver al frente
                            if (yawRatio > 0.45 && yawRatio < 0.65) {
                                challengeState = 3;
                                blinkCountRef.current = 100;
                                setBlinkCount(100);
                                setStatusMessage('¡Identidad confirmada!');
                                isLivenessRunningRef.current = false;
                                setAutoCapturePending(true);
                                return;
                            }
                        }
                    } else {
                        // Rostro perdido - Opcional: Reiniciar si tarda mucho
                        // setStatusMessage('Rostro no detectado');
                    }
                } catch (err) {
                    console.error("Liveness Error:", err);
                } finally {
                    // Fix #5: no permitir siguiente frame si el loop ya fue cancelado durante la detección
                    if (!isLivenessRunningRef.current) isDetecting = false;
                    else isDetecting = false;
                }
            }

            if (isLivenessRunningRef.current) {
                livenessIntervalRef.current = requestAnimationFrame(loop);
            }
        };

        livenessIntervalRef.current = requestAnimationFrame(loop);
    };


    const startCamera = async (facingMode = 'user') => {
        try {
            // Obtener el stream real directamente (sin stream temporal que cause race condition)
            const stream = await navigator.mediaDevices.getUserMedia({
                // Sin restricciones de resolución — el teléfono elige el zoom mínimo natural
                video: { facingMode },
                audio: false
            });

            // Detener cualquier stream anterior
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => {
                    track.stop();
                    try { track.enabled = false; } catch(e) {}
                });
            }

            streamRef.current = stream;
            setCameraReady(true);
        } catch (err) {
            console.error("Error accessing camera:", err);
            
            if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                alert("⚠️ Por favor permite el acceso a la cámara cuando se te pregunte");
            } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
                alert("❌ No se encontró ninguna cámara en este dispositivo.");
            } else {
                alert("Error al acceder a la cámara: " + err.message);
            }
            
            setStatusMessage('');
            setStep('idle');
            setMode(null);
        }
    };

    // Efecto para asignar el flujo de video cuando el elemento esté montado
    useEffect(() => {
        if (step === 'camera' && cameraReady && streamRef.current) {
            // Usar un retry loop por si el video element aún no está en el DOM
            let retries = 0;
            const maxRetries = 30; // 3 segundos máximo
            const assignStream = () => {
                if (!videoRef.current) {
                    if (retries++ < maxRetries) setTimeout(assignStream, 100);
                    else console.error('[Camera] Video element nunca se montó en el DOM.');
                    return;
                }
                console.log('[Dashboard] Asignando stream al video, mode:', modeRef.current);
                videoRef.current.srcObject = streamRef.current;
                videoRef.current.play().catch(e => console.error('Error reproduciendo video:', e));

                if (modeRef.current !== 'incident' && modelsLoaded) {
                    const waitForVideo = setInterval(() => {
                        if (videoRef.current && videoRef.current.readyState >= 2) {
                            clearInterval(waitForVideo);
                            if (storageSettings.security_liveness !== false) {
                                startLivenessCheck();
                            } else {
                                setStatusMessage('Posicione su rostro y presione Tomar Foto Ahora');
                            }
                        }
                    }, 100);
                }
            };
            assignStream();
        }
    }, [step, cameraReady, modelsLoaded, storageSettings.security_liveness]);

    const stopCamera = () => {
        // Detener el loop de liveness (requestAnimationFrame o intervalo)
        isLivenessRunningRef.current = false;
        if (livenessIntervalRef.current) {
            cancelAnimationFrame(livenessIntervalRef.current);
            livenessIntervalRef.current = null;
        }
        if (streamRef.current) {
            console.log("🛑 Deteniendo cámara...");
            const tracks = streamRef.current.getTracks();
            tracks.forEach(track => {
                track.stop();
                try { track.enabled = false; } catch (e) { }
            });
            streamRef.current = null;
        }
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
        setCameraReady(false);
    };

    const handleStopCamera = () => {
        stopCamera();
        setStep('idle');
        setMode(null);
        modeRef.current = null;
        setStatusMessage('');
        setBlinkCount(0);
        setAutoCapturePending(false);
        blinkCountRef.current = 0;
        eyeClosedRef.current = false;
    };

    const handleStart = async (selectedMode) => {
        // Fix #2: limpiar sesión anterior COMPLETAMENTE antes de abrir la nueva cámara
        // Esto evita tener dos loops de liveness corriendo en paralelo
        stopCamera();

        setMode(selectedMode);
        modeRef.current = selectedMode; // Ref para evitar stale closures
        setStep('camera');
        setStatusMessage('');
        setIncidentDescription('');
        setFaceVerified(false);
        setFaceError('');
        // Reset liveness para nueva sesión
        isLivenessRunningRef.current = false;
        setBlinkCount(0);
        setAutoCapturePending(false);
        blinkCountRef.current = 0;
        eyeClosedRef.current = false;

        // Cámara trasera para incidentes, frontal para asistencia
        const facingMode = selectedMode === 'incident' ? 'environment' : 'user';
        await startCamera(facingMode);

        if (!navigator.geolocation) {
            alert("Geolocalización no soportada en este navegador.");
            setStep('idle');
        }
    };

    const [capturedData, setCapturedData] = useState(null);

    /**
     * Analiza el canvas capturado en busca de anomalías de vida pasiva (spoofing).
     * Optimizado para usar un lienzo de muestreo pequeño para evitar bloqueos en móviles.
     */
    const analyzePassiveLiveness = (canvas) => {
        try {
            const width = canvas.width;
            const height = canvas.height;
            
            // Creamos un canvas de análisis pequeño (Downsampling) para rendimiento extremo
            const analysisCanvas = document.createElement('canvas');
            const size = 400;
            analysisCanvas.width = size;
            analysisCanvas.height = size;
            const actx = analysisCanvas.getContext('2d', { willReadFrequently: true });
            
            // Dibujamos la captura original escalada al tamaño de análisis
            actx.drawImage(canvas, 0, 0, size, size);
            const imageData = actx.getImageData(0, 0, size, size);
            const data = imageData.data;

            let reasons = [];

            // 1. Análisis de Textura y Saturación (Centro y General)
            let highFreqGrit = 0;
            let saturatedPixels = 0;
            let totalSamples = 0;
            const isDark = (r, g, b) => r < 35 && g < 35 && b < 35;

            for (let i = 0; i < data.length; i += 16) {
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];
                const brightness = (r + g + b) / 3;

                if (r > 242 && g > 242 && b > 242) saturatedPixels++;

                if (i + 4 < data.length) {
                    const diff = Math.abs(brightness - ((data[i + 4] + data[i + 5] + data[i + 6]) / 3));
                    if (diff > 15 && diff < 65) highFreqGrit++;
                }
                totalSamples++;
            }

            if ((highFreqGrit / totalSamples) > 0.65) reasons.push("Patrón Moiré");
            if ((saturatedPixels / totalSamples) > 0.30) reasons.push("Reflejos sintéticos");

            // 2. Análisis de Marcos (Bezels) - AMPLIADO
            // Revisamos no solo el borde absoluto (0), sino una franja periférica (5-15%) 
            // buscando el "marco" de un celular o monitor que podría estar dentro de la toma.
            let frameDetectedCount = 0;
            const checkRect = (inset) => {
                let darkPixels = 0;
                let samples = 0;
                const innerSize = size - (inset * 2);
                
                // Top & Bottom rows at 'inset'
                for (let x = inset; x < size - inset; x += 5) {
                    const idxT = (inset * size + x) * 4;
                    const idxB = ((size - 1 - inset) * size + x) * 4;
                    if (isDark(data[idxT], data[idxT+1], data[idxT+2])) darkPixels++;
                    if (isDark(data[idxB], data[idxB+1], data[idxB+2])) darkPixels++;
                    samples += 2;
                }
                // Left & Right columns at 'inset'
                for (let y = inset; y < size - inset; y += 5) {
                    const idxL = (y * size + inset) * 4;
                    const idxR = (y * size + (size - 1 - inset)) * 4;
                    if (isDark(data[idxL], data[idxL+1], data[idxL+2])) darkPixels++;
                    if (isDark(data[idxR], data[idxR+1], data[idxR+2])) darkPixels++;
                    samples += 2;
                }
                return samples > 0 ? (darkPixels / samples) : 0;
            };

            // Probamos en varios niveles de "inset" (profundidad en la imagen)
            // Esto detecta marcos si el atacante no pegó la pantalla a la cámara.
            const insets = [0, 10, 20, 30, 40]; // de 0% a 10% del ancho
            for (const inset of insets) {
                if (checkRect(inset) > 0.80) {
                    frameDetectedCount++;
                }
            }

            if (frameDetectedCount >= 1) {
                reasons.push("Marco detectado (periférico o interno)");
            }

            if (reasons.length > 0) {
                console.warn("🚨 [Seguridad] Anomalías detectadas:", reasons);
                return true;
            }
            return false;
        } catch (err) {
            console.error("Error en análisis de liveness pasivo:", err);
            return false; // Fallar a favor del usuario para no bloquear la captura
        }
    };




    const capture = useCallback(async () => {
        if (isCapturing) return;
        setIsCapturing(true);

        try {
            // 0. Manual Capture using Canvas
            if (!videoRef.current || !canvasRef.current) throw new Error("Cámara no lista");

            const video = videoRef.current;
            const canvas = canvasRef.current;

            // Verificar que el video tiene frames válidos
            if (video.videoWidth === 0 || video.videoHeight === 0) throw new Error("Video no tiene frames aún. Reintenta.");

            // ── CAPTURA CRUDA — CERO transformaciones ─────────────────────────────
            // Tomamos exactamente lo que entrega la cámara, sin rotar, sin recortar,
            // sin espejo. Lo que sale aquí ES el formato nativo del sensor.
            const rawW = video.videoWidth;
            const rawH = video.videoHeight;

            canvas.width  = rawW;
            canvas.height = rawH;

            const ctx2 = canvas.getContext('2d');
            ctx2.drawImage(video, 0, 0, rawW, rawH);

            console.log(`[CAM] rawW=${rawW} rawH=${rawH}`);



            const imageSrc = canvas.toDataURL('image/jpeg', 0.9);
            if (!imageSrc || imageSrc === 'data:,') throw new Error("Error generando imagen");


            // Fix #3: Flash visual DESPUÉS de confirmar que la imagen tiene píxeles válidos
            setCaptureFlash(f => !f);

            // Fix #4: Detener el liveness ANTES de lanzar detección facial
            // Evita que dos detectores compitan por los recursos del modelo al mismo tiempo
            isLivenessRunningRef.current = false;
            if (livenessIntervalRef.current) {
                cancelAnimationFrame(livenessIntervalRef.current);
                livenessIntervalRef.current = null;
            }

            // INICIO DE PROCESAMIENTO PARALELO
            setStatusMessage('Verificando identidad y ubicación...');

            // Definimos las promesas para ganar tiempo
            const facePromise = savedDescriptor 
                ? faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.3 })).withFaceLandmarks().withFaceDescriptor()
                : Promise.resolve(true);

            const locationPromise = (async () => {
                try {
                    return await new Promise((resolve, reject) => {
                        navigator.geolocation.getCurrentPosition(resolve, reject, {
                            enableHighAccuracy: true,
                            timeout: 5000, // Bajado a 5s para no desesperar
                            maximumAge: 0
                        });
                    });
                } catch (gpsError) {
                    console.warn("Alta precisión GPS falló, modo rápido...", gpsError);
                    return await new Promise((resolve, reject) => {
                        navigator.geolocation.getCurrentPosition(resolve, reject, {
                            enableHighAccuracy: false,
                            timeout: 3000, // Solo 3s para el modo rápido
                            maximumAge: 60000
                        });
                    });
                }
            })();

            const timePromise = fetchServerTime();

            // Ejecutamos todo al mismo tiempo
            const [detection, position, serverTime] = await Promise.all([
                facePromise,
                locationPromise,
                timePromise
            ]);

            // 1. Validar Rostro
            const faceRecognitionEnabled = storageSettings.security_faceRecognition !== false;
            if (savedDescriptor && faceRecognitionEnabled) {
                // Reconocimiento facial activo: verificar que el rostro coincida
                if (!detection) {
                    setFaceError('No se pudo detectar tu rostro. Reintenta.');
                    setFaceVerified(false);
                } else {
                    const distance = faceapi.euclideanDistance(detection.descriptor, savedDescriptor);
                    if (distance < faceThreshold) {
                        setFaceVerified(true);
                        setFaceError('');
                    } else {
                        setFaceError('La identidad facial no coincide.');
                        setFaceVerified(false);
                    }
                }
            } else {
                // Reconocimiento facial desactivado: solo verificar que hay un rostro
                if (!savedDescriptor) {
                    setFaceVerified(true); // Sin descriptor, permitir
                } else if (!faceRecognitionEnabled) {
                    setFaceVerified(true); // Desactivado por config
                    console.log('🔓 Reconocimiento facial desactivado por configuración');
                } else {
                    setFaceVerified(false); // Hay descriptor pero no hubo detección
                    setFaceError('No se pudo detectar tu rostro. Reintenta.');
                }
            }

            const { latitude, longitude, altitude, accuracy, speed, heading } = position.coords;
            
            // --- INICIO MÓDULO ALERTA FAKE GPS ---
            let isSuspiciousGPS = false;
            let gpsAnomalies = [];
            
            const isAndroid = /Android/i.test(navigator.userAgent);
            const hasAltitude = altitude !== null && altitude !== undefined;

            if (!isAndroid) {
                // MODO PERMISIVO (iOS, Windows, Mac, Computadores de Escritorio).
                // Carecen de hardware GPS puro (usan IP o red), es normal que manden "null" o enteros.
                if (altitude === 0) gpsAnomalies.push("ERR-01"); 
                // ERR-02 se vuelve informativo o de muy baja probabilidad
                if (accuracy > 0 && accuracy <= 1) gpsAnomalies.push("ERR-02"); 
            } else {
                // MODO ANDROID: RELAJADO para evitar falsos positivos
                // Solo castigamos la ausencia TOTAL de altitud si es muy sospechoso (0 exacto)
                if (altitude === 0) gpsAnomalies.push("ERR-01");
                
                // ERR-02: Ya no castigamos precisión entera por sí sola, 
                // solo si es absurdamente perfecta y baja (ej. exactamente 1.0 o 0.0)
                if (accuracy === 1 || accuracy === 2) gpsAnomalies.push("ERR-02");

                // ERR-05 y ERR-06: Eliminamos el marcado automático por estar quieto, 
                // ya que es normal en una selfie de asistencia.
            }
            
            // Verificación asíncrona de ERR-04 Topográfico si hay altitud numérica real superior a cero
            if (hasAltitude) {
                try {
                    const elevationResp = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${latitude}&longitude=${longitude}`);
                    if (elevationResp.ok) {
                        const eleData = await elevationResp.json();
                        if (eleData.elevation && eleData.elevation.length > 0) {
                            const mapElevation = eleData.elevation[0];
                            // Tolerancia de 100 metros
                            if (Math.abs(mapElevation - altitude) > 100) {
                                gpsAnomalies.push("ERR-04");
                            }
                        }
                    }
                } catch (e) {
                    console.log("No se pudo auditar ERR-04 topográficamente por error de red.");
                }
            }
            
            if (gpsAnomalies.length > 0) {
                isSuspiciousGPS = true;
            }

            // --- INICIO MÓDULO INTEGRIDAD DE IMAGEN (ERR-07) ---
            // Solo aplicamos si no es un incidente (donde se permiten fotos de objetos/papeles)
            if (modeRef.current !== 'incident') {
                const isPassiveSpoof = analyzePassiveLiveness(canvas);
                if (isPassiveSpoof) {
                    if (!gpsAnomalies.includes("ERR-07")) {
                        gpsAnomalies.push("ERR-07");
                        isSuspiciousGPS = true;
                    }
                }
            }
            // --- FIN MÓDULO INTEGRIDAD ---
            // --- FIN MÓDULO ALERTA FAKE GPS ---

            // 2. Obtener dirección con timeout corto para no bloquear
            setStatusMessage('Obteniendo dirección...');
            
            // Creamos un timeout para la dirección
            const addressPromise = fetchLocationName(latitude, longitude);
            const timeoutPromise = new Promise(resolve => setTimeout(() => resolve("Obteniendo dirección..."), 3000));
            const address = await Promise.race([addressPromise, timeoutPromise]);

            setStatusMessage('Procesando marca de agua...');

            // 3. Marca de Agua
            const watermarkedImage = await addWatermarkToImage(imageSrc, {
                employeeId: currentUser.email,
                timestamp: serverTime,
                coords: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
                locationName: address,
                mode: mode
            });

            // STORE DATA FOR PREVIEW
            const now = new Date();
            const dateStr = now.toLocaleDateString('es-ES');
            const timeStr = now.toLocaleTimeString('es-ES');

            let tipoLabel = 'Entrada';
            if (mode === 'exit') tipoLabel = 'Salida';
            else if (mode === 'incident') tipoLabel = 'Novedad';

            setCapturedData({
                image: watermarkedImage,
                metadata: {
                    usuario: currentUser.email,
                    tipo: tipoLabel,
                    fecha: dateStr,
                    hora: timeStr,
                    localidad: address,
                    timestamp: serverTimestamp(),
                    latitud: latitude,
                    longitud: longitude,
                    // Campos Ocultos de Seguridad
                    isSuspiciousGPS: isSuspiciousGPS,
                    gpsAnomalies: gpsAnomalies
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
    }, [mode, currentUser, isCapturing, savedDescriptor, faceThreshold]);

    // Auto-captura al completar la verificación de viveza
    useEffect(() => {
        // Fix #1: Solo capturar si step es 'camera' — evita captura fantasma al cambiar de modo
        if (autoCapturePending && !isCapturing && step === 'camera') {
            setAutoCapturePending(false);
            capture();
        } else if (autoCapturePending && step !== 'camera') {
            // Si autoCapturePending quedó activo pero ya no estamos en cámara, limpiar
            setAutoCapturePending(false);
        }
    }, [autoCapturePending, isCapturing, step, capture]);

    const shareImage = async () => {
        if (!capturedData || !capturedData.image) return false;

        try {
            // Conversión Síncrona a File (evita perder la activación del usuario 'Transient Activation' en Android/Infinix)
            const arr = capturedData.image.split(',');
            const mime = arr[0].match(/:(.*?);/)[1];
            const bstr = atob(arr[1]);
            let n = bstr.length;
            const u8arr = new Uint8Array(n);
            while (n--) { u8arr[n] = bstr.charCodeAt(n); }

            const fileName = mode === 'incident' ? 'incidente_evidencia.jpg' : 'asistencia_evidencia.jpg';
            const file = new File([u8arr], fileName, { type: "image/jpeg" });

            let shareText = mode === 'incident' 
                ? `⚠️ INCIDENTE\n📝 ${incidentDescription.trim()}`
                : `Usuario: ${capturedData.metadata.usuario}\nFecha: ${capturedData.metadata.fecha} ${capturedData.metadata.hora}\nAcción: ${capturedData.metadata.tipo}`;

            const shareData = {
                title: mode === 'incident' ? '⚠️ Reporte de Novedad' : 'Registro de Asistencia',
                text: shareText,
                files: [file]
            };

            // Intentar compartir directamente si el móvil lo soporta (incluyendo los archivos)
            if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share(shareData);
                return true;
            } else if (navigator.share) {
                // Si no soporta enviar la imagen, enviamos al menos el texto
                await navigator.share({ title: shareData.title, text: shareText });
                return true;
            } else {
                // Fallback: descargar imagen en PC
                const link = document.createElement('a');
                link.href = capturedData.image;
                link.download = `${fileName.split('.')[0]}_${capturedData.metadata.fecha.replace(/\//g, '-')}_${capturedData.metadata.hora.replace(/:/g, '-')}.jpg`;
                link.click();
                return false;
            }
        } catch (error) {
            console.warn("Compartir cancelado o bloqueado:", error.name);
            return false;
        }
    };

    const saveRecord = async () => {
        if (!capturedData) return false;
        setStep('processing');
        setStatusMessage('Guardando registro...');

        try {
            const md = capturedData.metadata;
            const safeEmail = md.usuario.replace(/[@.]/g, '-');
            const safeFecha = (md.fecha || '').replace(/\//g, '-');
            const safeHora = (md.hora || '').replace(/:/g, '-').replace(/\s/g, '');
            const deterministicDocId = `${safeEmail}_${safeFecha}_${safeHora}`;

            if (mode === 'incident') {
                // Guardar en colección separada con descripción
                await setDoc(doc(db, "incidents", deterministicDocId), {
                    ...md,
                    descripcion: incidentDescription.trim() || '(Sin descripción)',
                });
            } else {
                await setDoc(doc(db, "attendance", deterministicDocId), md);
            }
            return true;

        } catch (error) {
            console.error(error);
            alert(`Error guardando datos: ${error.message}`);
            setStep('preview');
            return false;
        }
    };

    const handlePreviewSave = async () => {
        if (mode !== 'incident' && !faceVerified) {
            alert("Verificación facial fallida. No se puede guardar el registro.");
            return;
        }
        if (mode === 'incident' && !incidentDescription.trim()) {
            alert("Por favor describe la novedad antes de guardar.");
            return;
        }

        const isIncidente = mode === 'incident';
        const savePhoto = isIncidente ? storageSettings.storage_saveIncidentes : storageSettings.storage_saveAsistencia;

        // Disparo de Compartir Inmediato para no perder "User Activation"
        shareImage();

        try {
            // USAR TIMEOUT DE 3s PARA FIRESTORE: Si no responde, forzar offline
            const saveTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error("Firebase Timeout")), 3000));
            const saved = await Promise.race([saveRecord(), saveTimeout]);
            
            if (!saved) throw new Error("Firestore save failed");

            if (savePhoto) {
                uploadPhoto(
                    capturedData.image,
                    isIncidente ? 'incidente' : capturedData.metadata.tipo,
                    capturedData.metadata.usuario,
                    capturedData.metadata.fecha,
                    capturedData.metadata.hora,
                ).then(async (url) => {
                    if (url) {
                        try {
                            const md = capturedData.metadata;
                            const safeEmail = md.usuario.replace(/[@.]/g, '-');
                            const safeFecha = (md.fecha || '').replace(/\//g, '-');
                            const safeHora = (md.hora || '').replace(/:/g, '-').replace(/\s/g, '');
                            const deterministicDocId = `${safeEmail}_${safeFecha}_${safeHora}`;
                            
                            const collectionName = mode === 'incident' ? "incidents" : "attendance";
                            await setDoc(doc(db, collectionName, deterministicDocId), {
                                fotoURL: url
                            }, { merge: true });
                            console.log(`✅ fotoURL adjuntado exitosamente en doc de ${collectionName}: ${deterministicDocId}`);
                        } catch(e) {
                            console.warn("No se pudo atar la URL al doc:", e);
                        }
                    }
                }).catch(err => {
                    console.warn('Storage upload failed, will be retried if possible:', err);
                });
            }
        } catch (err) {
            console.warn('Forcing Offline Storage due to network/timeout:', err);
            // Guardar en IndexedDB de forma silenciosa
            await saveOfflineRecord({
                image: capturedData.image,
                metadata: {
                    ...capturedData.metadata,
                    descripcion: mode === 'incident' ? incidentDescription.trim() : null
                },
                mode: mode,
                savePhoto: savePhoto,
                latitude: capturedData.metadata.latitud,
                longitude: capturedData.metadata.longitud
            });
        }

        setStep('success');
        setStatusMessage('¡Registro Exitoso!');

        const tipoActual = mode === 'exit' ? 'Salida' : mode === 'entry' ? 'Entrada' : null;
        if (tipoActual) {
            setAllowedActions(tipoActual === 'Entrada' 
                ? { entry: false, exit: true } 
                : { entry: true, exit: false });
            // Guardar en localStorage como backup específico por usuario
            localStorage.setItem(`lastAttendanceType_${currentUser.email}`, tipoActual);
            localStorage.setItem(`lastAttendanceTime_${currentUser.email}`, Date.now().toString());
            
            if (tipoActual === 'Salida') {
                localStorage.removeItem(`lastRutaType_${currentUser.email}`);
            }
        }
        
        // REGRESO RÁPIDO: Bajado a 2 segundos
        setTimeout(() => {
            setStep('idle');
            setMode(null);
            setCapturedData(null);
            setIncidentDescription('');
        }, 2000);
    };

    return (
        <div className="min-h-screen bg-gradient-to-b from-[#3C7DA6] to-[#6FAF6B] flex flex-col">
            {/* Header */}
            <div className="bg-white shadow p-4 flex justify-between items-center gap-2 overflow-x-auto">
                <h1 className="text-lg font-bold text-gray-800 flex-1 text-left truncate">Control Asistencia</h1>
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
                        <div className="bg-white p-6 rounded-xl shadow-2xl text-center">
                            <h2 className="text-lg font-medium text-gray-600 mb-2">Bienvenido, {currentUser.email}</h2>
                            {loadingState ? (
                                <p className="text-sm text-blue-500 animate-pulse">Verificando estado de asistencia...</p>
                            ) : (
                                <p className="text-sm text-gray-400">
                                    {allowedActions.entry ? 'Es momento de registrar tu ENTRADA.' : 'Tienes una entrada pendiente. Registra tu SALIDA.'}
                                </p>
                            )}
                        </div>

                        {isLicenseValid ? (
                            <div className="w-full flex flex-col gap-4">
                                <ActionButtons
                                    loadingState={loadingState}
                                    allowedActions={allowedActions}
                                    buttonLabels={buttonLabels}
                                    handleStart={handleStart}
                                />
                                
                                {/* BOTÓN DE MODO RUTA (Solo visible si está activo en Firebase y el usuario ya marcó entrada) */}
                                {!loadingState && !allowedActions.entry && storageSettings.ruta_active && (
                                    <div className="pt-2">
                                        <button
                                            onClick={() => navigate('/ruta')}
                                            className="w-full py-4 px-6 bg-gradient-to-r from-teal-500 to-emerald-600 text-white font-bold rounded-2xl shadow-xl shadow-teal-500/30 hover:shadow-2xl hover:scale-[1.02] active:scale-95 transition-all outline-none border-b-4 border-teal-700"
                                        >
                                            <div className="flex items-center justify-center gap-3">
                                                <MapPin size={26} className="animate-bounce" />
                                                <span className="text-xl tracking-wide">Modo Visitas a Clientes</span>
                                            </div>
                                        </button>
                                        <p className="text-center text-white/80 text-xs mt-2 font-medium">Usa este modo si saldrás de las instalaciones base.</p>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="col-span-2 bg-red-50 border-2 border-red-500 rounded-2xl p-6 text-center shadow-2xl animate-pulse">
                                <TriangleAlert className="w-12 h-12 text-red-500 mx-auto mb-3" />
                                <h3 className="text-xl font-bold text-red-700 mb-2">Servicio Suspendido</h3>
                                <p className="text-red-600 font-medium">
                                    La licencia del sistema ha expirado.<br />
                                    El registro de asistencia y novedades está temporalmente deshabilitado.
                                </p>
                                <p className="text-sm mt-4 text-red-500">
                                    Use el botón CONFIG para activar una nueva licencia.
                                </p>
                            </div>
                        )}
                    </div>
                )}

                {step === 'camera' && (
                    <CameraView
                        mode={mode}
                        buttonLabels={buttonLabels}
                        videoRef={videoRef}
                        canvasRef={canvasRef}
                        blinkCount={blinkCount}
                        statusMessage={statusMessage}
                        storageSettings={storageSettings}
                        handleStopCamera={handleStopCamera}
                        capture={capture}
                        step={step}
                        captureFlash={captureFlash}
                    />
                )}


                {step === 'processing' && (
                    <div className="text-center p-10">
                        <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-blue-500 mx-auto mb-4"></div>
                        <p className="text-gray-600 font-medium">{statusMessage}</p>
                    </div>
                )}

                {step === 'preview' && capturedData && (
                    <PreviewView
                        mode={mode}
                        capturedData={capturedData}
                        faceVerified={faceVerified}
                        faceError={faceError}
                        incidentDescription={incidentDescription}
                        setIncidentDescription={setIncidentDescription}
                        handleSave={handlePreviewSave}
                        handleCancel={handleStopCamera}
                    />
                )}

                {step === 'success' && <SuccessView />}
            </div>
            {/* Version Indicator */}
            <div className="p-2 text-center flex flex-col items-center gap-1 opacity-50">
                <span className="text-[10px] text-black font-mono px-2 py-0.5 rounded">v{import.meta.env.VITE_APP_VERSION || '1.3.1'}</span>
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
