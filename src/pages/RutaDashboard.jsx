import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebaseConfig';
import { collection, addDoc, serverTimestamp, doc, getDoc, setDoc, query, where, getDocs } from 'firebase/firestore';
import { Camera, MapPin, ArrowLeft, Send, CheckCircle, Navigation } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { uploadPhoto } from '../services/storageService';
import { addWatermarkToImage, fetchServerTime, fetchServerDate, fetchLocationName } from '../utils/watermark';
import { getColombiaDateTime, getMillisFromDateTime, getTimeZoneFromCoords } from '../utils/timezone';
import { saveOfflineRecord, updateOfflineRecordGPS, getPendingRecords } from '../services/offlineStorage';
import { acquireVariableCamera, releaseCamera, getCameraErrorInfo } from '../utils/cameraManager';
import UpdateBadge from '../components/common/UpdateBadge';

export default function RutaDashboard() {
    const { currentUser } = useAuth();
    const navigate = useNavigate();
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const streamRef = useRef(null);
    const rutaCameraFacingRef = useRef('environment'); // ref para que startCamera siempre lea el valor actualizado
    const latestGpsRef = useRef({ latitude: 0, longitude: 0, timestamp: 0 });
    const watchPositionIdRef = useRef(null);

    const [allowedActions, setAllowedActions] = useState({ entry: true, exit: false });
    const [hasActiveShift, setHasActiveShift] = useState(false); // DEFAULT FALSE para evitar turnos huerfanos (loophole)
    const [isLoadingShift, setIsLoadingShift] = useState(true);
    const [step, setStep] = useState('idle'); // idle, camera, preview, processing, success
    const [mode, setMode] = useState(null); // 'Llegada Cliente', 'Salida Cliente'
    const [observacion, setObservacion] = useState('');
    const [capturedData, setCapturedData] = useState(null);
    const [statusMessage, setStatusMessage] = useState('');
    const [rutaCameraFacing, setRutaCameraFacing] = useState('environment'); // solo para UI, la lógica usa la ref
    const [sharing, setSharing] = useState(false);
    const [cameraLoading, setCameraLoading] = useState(false);
    const [cameraLoadingMsg, setCameraLoadingMsg] = useState('Activando cámara...');
    const [cameraError, setCameraError] = useState(null); // { type, title, message, canRetry }
    const [pendingMode, setPendingMode] = useState(null); // modo a usar cuando se reintenta

    useEffect(() => {
        // 📍 GPS Warm-Up en segundo plano para eliminar demoras en la primera captura en Ruta
        if (navigator.geolocation) {
            try {
                const watchId = navigator.geolocation.watchPosition(
                    (pos) => {
                        if (pos && pos.coords) {
                            latestGpsRef.current = {
                                latitude: pos.coords.latitude,
                                longitude: pos.coords.longitude,
                                timestamp: Date.now()
                            };
                            console.log("📍 [GPS Warm-Up Ruta] Coordenadas precargadas:", pos.coords.latitude, pos.coords.longitude);
                        }
                    },
                    (err) => console.warn("📍 [GPS Warm-Up Ruta] Esperando fijación...", err.message),
                    { enableHighAccuracy: false, maximumAge: 60000, timeout: 10000 }
                );
                watchPositionIdRef.current = watchId;
            } catch (e) {
                console.warn("📍 [GPS Warm-Up Ruta] Error iniciando rastreador:", e);
            }
        }

        const checkVisitStatus = async () => {
            if (!currentUser) return;
            setIsLoadingShift(true);
            
            try {
                // 0. Consultar la configuración de cámara primero, antes de cualquier return
                const snapCam = await getDoc(doc(db, 'settings', 'employeeFields'));
                if (snapCam.exists()) {
                    const facing = snapCam.data().ruta_camera_facing || 'environment';
                    setRutaCameraFacing(facing);
                    rutaCameraFacingRef.current = facing; // sincronizar ref
                    console.log('📷 Cámara modo visitas cargada desde Firestore:', facing);
                }
            } catch (err) {
                console.warn("Error obteniendo configuracion cámara:", err);
            }

            const rawEmail = currentUser.email || '';
            const userEmail = rawEmail.trim().toLowerCase();

            // 1. Cargar estado inicial desde localStorage para evitar parpadeos
            const lastTypeLS = localStorage.getItem(`lastRutaType_${userEmail}`) || localStorage.getItem(`lastRutaType_${rawEmail}`);
            if (lastTypeLS === 'Llegada Cliente') {
                setAllowedActions({ entry: false, exit: true });
            } else {
                setAllowedActions({ entry: true, exit: false });
            }

            // 2. Revisar si hay salida de turno registrada en este dispositivo (vía Dashboard)
            const attType = localStorage.getItem(`lastAttendanceType_${userEmail}`) || localStorage.getItem(`lastAttendanceType_${rawEmail}`);
            if (attType === 'Salida') {
                setAllowedActions({ entry: true, exit: false });
                setHasActiveShift(false); // Salida general → no hay turno activo
                localStorage.removeItem(`lastRutaType_${userEmail}`);
                if (rawEmail && rawEmail !== userEmail) localStorage.removeItem(`lastRutaType_${rawEmail}`);
                setIsLoadingShift(false);
                return; // Cortamos aquí porque la salida de turno manda (inicio nuevo)
            }

            // Helper de timeout para no bloquear la UI si hay internet lento/offline
            const fetchWithTimeout = (promise, ms = 2000) => {
                return Promise.race([
                    promise,
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Firebase Timeout')), ms))
                ]);
            };

            const getMillisAtt = (r) => {
                if (!r) return 0;
                const ts = r.timestamp;
                if (ts) {
                    if (typeof ts.toMillis === 'function') return ts.toMillis();
                    if (ts instanceof Date) return ts.getTime();
                    if (typeof ts === 'number') return ts;
                    if (typeof ts === 'string') {
                        const parsed = new Date(ts).getTime();
                        if (!isNaN(parsed)) return parsed;
                    }
                }
                return getMillisFromDateTime(r.fecha, r.hora);
            };

            // Intentar verificar el turno activo desde Firestore e IndexedDB
            let currentShiftStartTime = 0;
            try {
                let candidateAtt = [];

                // IndexedDB offline queue
                try {
                    const pendingOff = await getPendingRecords();
                    if (Array.isArray(pendingOff)) {
                        const userOff = pendingOff.filter(r => {
                            const u = (r.metadata?.usuario || '').trim().toLowerCase();
                            return u === userEmail;
                        }).map(r => ({
                            tipo: r.metadata?.tipo || (r.mode === 'entry' ? 'Entrada' : 'Salida'),
                            fecha: r.metadata?.fecha,
                            hora: r.metadata?.hora,
                            timestamp: r.capturedAt || r.metadata?.timestamp
                        }));
                        candidateAtt.push(...userOff);
                    }
                } catch (e) {}

                // Firestore attendance
                const qAttLower = query(
                    collection(db, "attendance"),
                    where("usuario", "==", userEmail)
                );
                const snapAttLower = await fetchWithTimeout(getDocs(qAttLower));
                if (!snapAttLower.empty) {
                    candidateAtt.push(...snapAttLower.docs.map(d => d.data()));
                }

                if (rawEmail && rawEmail !== userEmail) {
                    const qAttRaw = query(
                        collection(db, "attendance"),
                        where("usuario", "==", rawEmail)
                    );
                    const snapAttRaw = await fetchWithTimeout(getDocs(qAttRaw));
                    if (!snapAttRaw.empty) {
                        candidateAtt.push(...snapAttRaw.docs.map(d => d.data()));
                    }
                }

                if (candidateAtt.length > 0) {
                    // Filtrar SOLO registros de asistencia general ('Entrada' y 'Salida')
                    const generalRecords = candidateAtt.filter(r => {
                        const t = (r.tipo || '').toLowerCase().trim();
                        return t === 'entrada' || t === 'salida';
                    });

                    // Revisar evidencia local previa como salvaguarda
                    const lastAttTypeLS = localStorage.getItem(`lastAttendanceType_${userEmail}`) || localStorage.getItem(`lastAttendanceType_${rawEmail}`);
                    const lastAttTimeLS = parseInt(localStorage.getItem(`lastAttendanceTime_${userEmail}`) || localStorage.getItem(`lastAttendanceTime_${rawEmail}`) || '0', 10);
                    const diffHoursLS = lastAttTimeLS > 0 ? (Date.now() - lastAttTimeLS) / (1000 * 60 * 60) : 999;
                    const isLSActive = lastAttTypeLS === 'Entrada' && diffHoursLS <= 20;

                    if (generalRecords.length > 0) {
                        generalRecords.sort((a, b) => getMillisAtt(b) - getMillisAtt(a));
                        const lastGeneral = generalRecords[0];
                        const lastGeneralMs = getMillisAtt(lastGeneral);
                        const diffHoursGeneral = lastGeneralMs > 0 ? (Date.now() - lastGeneralMs) / (1000 * 60 * 60) : 999;

                        const lastTipoGeneral = (lastGeneral.tipo || '').toLowerCase().trim();
                        const isActive = (lastTipoGeneral === 'entrada' && diffHoursGeneral <= 20) || isLSActive;
                        setHasActiveShift(isActive);

                        if (!isActive) {
                            setAllowedActions({ entry: true, exit: false });
                            localStorage.removeItem(`lastRutaType_${userEmail}`);
                            if (rawEmail && rawEmail !== userEmail) localStorage.removeItem(`lastRutaType_${rawEmail}`);
                            setIsLoadingShift(false);
                            return;
                        } else {
                            currentShiftStartTime = lastGeneralMs || lastAttTimeLS;
                        }
                    } else if (isLSActive) {
                        setHasActiveShift(true);
                        currentShiftStartTime = lastAttTimeLS;
                    } else {
                        setHasActiveShift(false);
                        setAllowedActions({ entry: true, exit: false });
                        localStorage.removeItem(`lastRutaType_${userEmail}`);
                        if (rawEmail && rawEmail !== userEmail) localStorage.removeItem(`lastRutaType_${rawEmail}`);
                        setIsLoadingShift(false);
                        return;
                    }
                } else {
                    const lastAttTypeLS = localStorage.getItem(`lastAttendanceType_${userEmail}`) || localStorage.getItem(`lastAttendanceType_${rawEmail}`);
                    const lastAttTimeLS = parseInt(localStorage.getItem(`lastAttendanceTime_${userEmail}`) || localStorage.getItem(`lastAttendanceTime_${rawEmail}`) || '0', 10);
                    const diffHoursLS = lastAttTimeLS > 0 ? (Date.now() - lastAttTimeLS) / (1000 * 60 * 60) : 999;
                    const isLSActive = lastAttTypeLS === 'Entrada' && diffHoursLS <= 20;

                    if (isLSActive) {
                        setHasActiveShift(true);
                        currentShiftStartTime = lastAttTimeLS;
                    } else {
                        setHasActiveShift(false);
                        setAllowedActions({ entry: true, exit: false });
                        localStorage.removeItem(`lastRutaType_${userEmail}`);
                        if (rawEmail && rawEmail !== userEmail) localStorage.removeItem(`lastRutaType_${rawEmail}`);
                        setIsLoadingShift(false);
                        return;
                    }
                }
            } catch (attErr) {
                console.warn("⚠️ Sin conexión a Firestore para verificar turno activo:", attErr);
                const lastAttTypeLS = localStorage.getItem(`lastAttendanceType_${userEmail}`) || localStorage.getItem(`lastAttendanceType_${rawEmail}`);
                const lastAttTimeLS = parseInt(localStorage.getItem(`lastAttendanceTime_${userEmail}`) || localStorage.getItem(`lastAttendanceTime_${rawEmail}`) || '0', 10);
                const diffHoursLS = lastAttTimeLS > 0 ? (Date.now() - lastAttTimeLS) / (1000 * 60 * 60) : 999;
                
                const isStrictlyActive = (lastAttTypeLS === 'Entrada' && diffHoursLS <= 20) || lastTypeLS === 'Llegada Cliente';
                setHasActiveShift(isStrictlyActive);
                if (!isStrictlyActive) {
                    setAllowedActions({ entry: true, exit: false });
                    localStorage.removeItem(`lastRutaType_${userEmail}`);
                    if (rawEmail && rawEmail !== userEmail) localStorage.removeItem(`lastRutaType_${rawEmail}`);
                    setIsLoadingShift(false);
                }
            }

            // 3. Consultar la base de datos para recuperar la última visita real de la nube
            try {
                let candidateVisitas = [];

                const qLower = query(
                    collection(db, "visitas"),
                    where("usuario", "==", userEmail)
                );
                const snapLower = await fetchWithTimeout(getDocs(qLower));
                if (!snapLower.empty) {
                    candidateVisitas.push(...snapLower.docs.map(d => d.data()));
                }

                if (rawEmail && rawEmail !== userEmail) {
                    const qRaw = query(
                        collection(db, "visitas"),
                        where("usuario", "==", rawEmail)
                    );
                    const snapRaw = await fetchWithTimeout(getDocs(qRaw));
                    if (!snapRaw.empty) {
                        candidateVisitas.push(...snapRaw.docs.map(d => d.data()));
                    }
                }

                if (candidateVisitas.length > 0) {
                    candidateVisitas.sort((a, b) => getMillisAtt(b) - getMillisAtt(a));
                    
                    const lastDoc = candidateVisitas[0];
                    const lastTipo = lastDoc.tipo;
                    const lastTime = getMillisAtt(lastDoc);
                    const diffHours = (Date.now() - lastTime) / (1000 * 60 * 60);

                    const CLOCK_SKEW_TOLERANCE_MS = 5 * 60 * 1000;
                    const isVisitOpenInBoth = lastTipo === 'Llegada Cliente' && lastTypeLS === 'Llegada Cliente';
                    const isDefinitelyBeforeShift = lastTime > 0
                        && currentShiftStartTime > 0
                        && lastTime < (currentShiftStartTime - CLOCK_SKEW_TOLERANCE_MS);

                    if (!isVisitOpenInBoth && isDefinitelyBeforeShift) {
                        console.log("⚠️ Se ignoran visitas pasadas porque se acaba de iniciar un nuevo turno.");
                        setAllowedActions({ entry: true, exit: false });
                        localStorage.removeItem(`lastRutaType_${userEmail}`);
                        if (rawEmail && rawEmail !== userEmail) localStorage.removeItem(`lastRutaType_${rawEmail}`);
                    }
                    else if (diffHours > 20) {
                        setAllowedActions({ entry: true, exit: false });
                        localStorage.removeItem(`lastRutaType_${userEmail}`);
                        if (rawEmail && rawEmail !== userEmail) localStorage.removeItem(`lastRutaType_${rawEmail}`);
                    }
                    else if (lastTipo === 'Llegada Cliente') {
                        setAllowedActions({ entry: false, exit: true });
                        localStorage.setItem(`lastRutaType_${userEmail}`, 'Llegada Cliente');
                        if (rawEmail && rawEmail !== userEmail) localStorage.setItem(`lastRutaType_${rawEmail}`, 'Llegada Cliente');
                    }
                    else if (lastTipo === 'Salida Cliente') {
                        setAllowedActions({ entry: true, exit: false });
                        localStorage.setItem(`lastRutaType_${userEmail}`, 'Salida Cliente');
                        if (rawEmail && rawEmail !== userEmail) localStorage.setItem(`lastRutaType_${rawEmail}`, 'Salida Cliente');
                    }
                }
            } catch (err) {
                console.warn("⚠️ Sin conexión a Firestore para visitas:", err);
            } finally {
                setIsLoadingShift(false);
            }
        };
        
        checkVisitStatus();

        return () => {
            if (watchPositionIdRef.current !== null && navigator.geolocation) {
                try { navigator.geolocation.clearWatch(watchPositionIdRef.current); } catch (e) {}
                watchPositionIdRef.current = null;
            }
        };
    }, [currentUser]);

    const startCamera = async (selectedMode) => {
        setCameraError(null);
        setCameraLoading(true);
        setCameraLoadingMsg('Activando cámara...');

        const preferredFacing = rutaCameraFacingRef.current || rutaCameraFacing || 'environment';
        console.log('📷 Iniciando cámara variable con facing:', preferredFacing);

        const onStatus = (msg) => {
            if (msg) setCameraLoadingMsg(msg);
        };

        try {
            // Módulo 3: Cámara variable según configuración
            const stream = await acquireVariableCamera(videoRef, streamRef, preferredFacing, onStatus);

            setCameraLoading(false);

            if (!stream) {
                throw new Error("No se pudo iniciar el flujo de la cámara");
            }

            streamRef.current = stream;
            setStep('camera');
        } catch (error) {
            setCameraLoading(false);
            const errInfo = getCameraErrorInfo(error, 'variable');
            setCameraError(errInfo);
            setPendingMode(selectedMode);
        }
    };


    useEffect(() => {
        if (step === 'camera' && videoRef.current && streamRef.current) {
            videoRef.current.srcObject = streamRef.current;
        }

        if (step === 'camera') {
            // Iniciar GPS warmup
            if ('geolocation' in navigator) {
                try {
                    console.log("📍 [GPS Ruta] Iniciando calentamiento temprano (warm-up)");
                    watchPositionIdRef.current = navigator.geolocation.watchPosition(
                        (position) => {
                            const { latitude, longitude } = position.coords;
                            latestGpsRef.current = { latitude, longitude, timestamp: position.timestamp };
                        },
                        (error) => {
                            console.warn("📍 [GPS Ruta] Error en warm-up:", error);
                        },
                        { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
                    );
                } catch (gpsErr) {
                    console.error("📍 [GPS Ruta] Error síncrono iniciando warm-up:", gpsErr);
                }
            }
        } else {
            if (watchPositionIdRef.current !== null) {
                navigator.geolocation.clearWatch(watchPositionIdRef.current);
                watchPositionIdRef.current = null;
                console.log("📍 [GPS Ruta] Warm-up detenido");
            }
        }
        return () => {
            if (watchPositionIdRef.current !== null) {
                navigator.geolocation.clearWatch(watchPositionIdRef.current);
                watchPositionIdRef.current = null;
            }
        };
    }, [step]);

    const stopCamera = useCallback(() => {
        if (videoRef.current) videoRef.current.srcObject = null;
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => { try { t.stop(); } catch(e){} });
            streamRef.current = null;
        }
        // Delegar liberación al cameraManager y retornar la Promesa de Android (800ms)
        return releaseCamera(videoRef, streamRef);
    }, []);

    // Liberar cámara al mandar la app a segundo plano (soluciona cámara ocupada)
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.hidden && step === 'camera') {
                console.log("App en segundo plano, liberando dispositivo de cámara...");
                stopCamera();
                setStep('idle');
                setMode(null);
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [step, stopCamera]);

    const handleStartAction = async (selectedMode) => {
        if (!hasActiveShift) {
            alert('Acción denegada: No se ha detectado un turno de entrada activo.');
            return;
        }
        // Esperar a que la cámara anterior se cierre por completo
        await stopCamera();

        setMode(selectedMode);
        setPendingMode(selectedMode);
        setObservacion('');
        await startCamera(selectedMode);
    };

    // Auto-resume action after a hard reload (e.g. from "Reintentar" on camera error)
    useEffect(() => {
        const pendingAction = sessionStorage.getItem('pendingRutaMode');
        if (pendingAction && hasActiveShift) {
            sessionStorage.removeItem('pendingRutaMode');
            setTimeout(() => handleStartAction(pendingAction), 500);
        }
    }, [hasActiveShift]);

    const capture = async () => {
        try {
            const video = videoRef.current;
            const canvas = canvasRef.current;
            const targetRatio = 3 / 4;
            const videoRatio = video.videoWidth / video.videoHeight;
            
            let drawWidth = video.videoWidth;
            let drawHeight = video.videoHeight;
            let offsetX = 0;
            let offsetY = 0;

            if (videoRatio > targetRatio) {
                // Video is wider than 3:4. Crop sides to keep center.
                drawWidth = video.videoHeight * targetRatio;
                offsetX = (video.videoWidth - drawWidth) / 2;
            } else if (videoRatio < targetRatio) {
                // Video is taller than 3:4. Crop top/bottom.
                drawHeight = video.videoWidth / targetRatio;
                offsetY = (video.videoHeight - drawHeight) / 2;
            }

            canvas.width = drawWidth;
            canvas.height = drawHeight;
            const context = canvas.getContext('2d');
            context.drawImage(video, offsetX, offsetY, drawWidth, drawHeight, 0, 0, drawWidth, drawHeight);
            const imageSrc = canvas.toDataURL('image/jpeg', 0.8);

            setStatusMessage('Obteniendo ubicación...');
            setStep('processing');

            const locationPromise = (async () => {
                try {
                    // Si el warm-up ya consiguió coordenadas válidas recientes (menos de 5 min), usarlas de inmediato
                    const now = Date.now();
                    const warmGps = latestGpsRef.current;
                    if (warmGps && warmGps.latitude !== 0 && (now - warmGps.timestamp < 300000)) {
                        console.log("📍 [GPS Ruta] Usando coordenadas del warm-up instantáneamente.");
                        // ⚠️ IMPORTANTE: fromCache:true indica que este timestamp GPS es intencionalmente
                        // antiguo (hasta 5 min), NO debe usarse para validar si el reloj fue alterado.
                        return { coords: { latitude: warmGps.latitude, longitude: warmGps.longitude, altitude: null, accuracy: null, speed: null, heading: null }, timestamp: warmGps.timestamp, fromCache: true };
                    }

                    // Intento 1: Alta precisión (8s)
                    try {
                        return await new Promise((resolve, reject) => {
                            try {
                                navigator.geolocation.getCurrentPosition(resolve, reject, {
                                    enableHighAccuracy: true,
                                    timeout: 8000,
                                    maximumAge: 0
                                });
                            } catch (e) {
                                reject(e);
                            }
                        });
                    } catch {}
                    // Intento 2: Baja precisión, acepta cache de hasta 5 minutos
                    try {
                        return await new Promise((resolve, reject) => {
                            try {
                                navigator.geolocation.getCurrentPosition(resolve, reject, {
                                    enableHighAccuracy: false,
                                    timeout: 5000,
                                    maximumAge: 300000
                                });
                            } catch (e) {
                                reject(e);
                            }
                        });
                    } catch (gpsErr) {
                        console.warn("GPS en modo rápido también falló. Continuando sin GPS.", gpsErr);
                    }
                } catch (err) {
                    console.error("📍 [GPS Ruta] Error global en locationPromise de geolocalización:", err);
                }
                // Fallback: Sin GPS — el registro procede sin coordenadas
                return { coords: { latitude: 0, longitude: 0, altitude: null, accuracy: null, speed: null, heading: null } };
            })();

            const [position, serverDate] = await Promise.all([
                locationPromise,
                fetchServerDate()
            ]);

            const { latitude, longitude, altitude, accuracy, speed, heading } = position.coords;
            
            // Si el GPS falló (coords 0,0), no consultar Nominatim
            const gpsDisponible = latitude !== 0 || longitude !== 0;
            const address = gpsDisponible
                ? await fetchLocationName(latitude, longitude).catch(() => "Ubicación desconocida")
                : "GPS no disponible";

            // --- INICIO MÓDULO ALERTA FAKE GPS ---
            let isSuspiciousGPS = false;
            let gpsAnomalies = [];
            
            // ═══════════════════════════════════════════════════════════════
            // CONTROL DE HORA CENTRALIZADO (VISITAS A CLIENTE)
            // ═══════════════════════════════════════════════════════════════
            // 1. FUENTE PRINCIPAL: localDate (hora exacta de la captura en ruta).
            // 2. PROTECCIÓN ANTI-SOBREESCRITURA: No reemplazar con timestamp de GPS
            //    para evitar que fijaciones de ubicación en caché alteren la hora real del registro.
            // 3. AUDITORÍA NTP: Compara con serverDate para marcar ERR-08 si hay alteración de reloj.
            // ═══════════════════════════════════════════════════════════════
            const targetTz = getTimeZoneFromCoords(latitude, longitude);
            const localDate = new Date();
            let finalServerTimeObj = localDate; // Fuente primaria: teléfono
            let finalServerTime = localDate.toLocaleString('es-CO', { timeZone: targetTz });
            let isTimeAltered = false;

            // Auditoría de hora contra servidor NTP (si está disponible)
            if (serverDate && serverDate instanceof Date && !isNaN(serverDate.getTime())) {
                const ntpDiffMinutes = Math.abs(localDate.getTime() - serverDate.getTime()) / 60000;
                if (ntpDiffMinutes > 10) {
                    console.warn(`🚨 [NTP Ruta] Desfase de ${ntpDiffMinutes.toFixed(1)} min entre teléfono y servidor NTP. Marcando ERR-08.`);
                    isTimeAltered = true;
                } else {
                    console.log(`✅ [NTP Ruta] Hora de la ruta verificada contra servidor de red (${ntpDiffMinutes.toFixed(1)} min de dif).`);
                }
            } else if (!position.fromCache && position.timestamp && position.timestamp > 1600000000000 && gpsDisponible) {
                const gpsDate = new Date(position.timestamp);
                const diffMinutes = Math.abs(localDate.getTime() - gpsDate.getTime()) / 60000;
                if (diffMinutes <= 10) {
                    console.log(`✅ [Hora Ruta] Teléfono y GPS concuerdan (${diffMinutes.toFixed(1)} min de diferencia).`);
                } else {
                    console.log(`📍 [GPS Ruta] Posición GPS en caché del dispositivo (${diffMinutes.toFixed(1)} min antigua) — hora del teléfono preservada.`);
                }
            }

            if (isTimeAltered) {
                gpsAnomalies.push("ERR-08"); // Manipulación de hora
                isSuspiciousGPS = true;
            }
            // --- FIN VERIFICACIÓN EXTERNA DE HORA ---
            
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
            
            if (hasAltitude) {
                try {
                    const elevationResp = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${latitude}&longitude=${longitude}`);
                    if (elevationResp.ok) {
                        const eleData = await elevationResp.json();
                        if (eleData.elevation && eleData.elevation.length > 0) {
                            const mapElevation = eleData.elevation[0];
                            if (Math.abs(mapElevation - altitude) > 100) {
                                gpsAnomalies.push("ERR-04");
                            }
                        }
                    }
                } catch (e) {
                    console.log("No se pudo auditar ERR-04 en Ruta.");
                }
            }
            if (gpsAnomalies.length > 0) {
                isSuspiciousGPS = true;
            }
            // --- FIN MÓDULO ALERTA FAKE GPS ---

            setStatusMessage('Aplicando marca de agua...');
            const gpsCoords = gpsDisponible
                ? `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`
                : "GPS no disponible";
            const watermarkedImage = await addWatermarkToImage(imageSrc, {
                employeeId: currentUser.email,
                timestamp: finalServerTime,
                coords: gpsCoords,
                locationName: address,
                mode: mode
            });

            // ✅ TIMEZONE DINÁMICO: Detecta zona por GPS (ej: Europe/Madrid en España, America/Bogota en Colombia)
            const { fecha, hora } = getColombiaDateTime(finalServerTimeObj, targetTz);
            setCapturedData({
                image: watermarkedImage,
                rawImage: imageSrc,
                metadata: {
                    usuario: currentUser.email,
                    tipo: mode,
                    fecha,
                    hora,
                    localidad: address,
                    latitud: latitude,
                    longitud: longitude,
                    // Campos Ocultos de Seguridad
                    isSuspiciousGPS: isSuspiciousGPS,
                    gpsAnomalies: gpsAnomalies
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

    const startBackgroundGPSRecovery = (recordId) => {
        if (!('geolocation' in navigator)) return;
        console.log(`📍 [GPS Ruta Latencia] Iniciando recuperación en segundo plano para registro ${recordId}...`);
        
        const startTime = Date.now();
        const MAX_TIME = 3 * 60 * 1000; // 3 minutos
        
        const watchId = navigator.geolocation.watchPosition(
            async (position) => {
                // Validación estricta: Si el navegador fue suspendido y despertó media hora después, NO actualizar
                if (Date.now() - startTime > MAX_TIME) {
                    console.log("📍 [GPS Ruta Latencia] Tiempo agotado (detectado tras suspensión). Se descarta señal tardía.");
                    navigator.geolocation.clearWatch(watchId);
                    return;
                }

                const { latitude, longitude, accuracy } = position.coords;
                // Si la precisión es decente (ej. < 150m) o si ya pasaron 2 mins y agarramos lo que sea
                if (accuracy < 150 || (Date.now() - startTime > 120000)) {
                    console.log(`📍 [GPS Ruta Latencia] ¡Señal recuperada! Actualizando registro ${recordId}`);
                    await updateOfflineRecordGPS(recordId, latitude, longitude);
                    navigator.geolocation.clearWatch(watchId);
                }
            },
            (error) => {
                console.warn("📍 [GPS Ruta Latencia] Buscando señal...", error.message);
                if (Date.now() - startTime > MAX_TIME) {
                    console.log("📍 [GPS Ruta Latencia] Tiempo agotado. Se detiene la búsqueda.");
                    navigator.geolocation.clearWatch(watchId);
                }
            },
            { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
        );

        // Seguridad: forzar detención a los 3 minutos exactos
        setTimeout(() => {
            navigator.geolocation.clearWatch(watchId);
            console.log(`📍 [GPS Ruta Latencia] Proceso detenido por timeout para registro ${recordId}`);
        }, MAX_TIME);
    };

    const handleSaveAndShare = async () => {
        if (!capturedData) return;
        setStep('processing');
        setStatusMessage('Guardando y Subiendo foto...');
        let timeoutTriggered = false;

        const saveRecordOnline = async () => {
            // Subir foto a Firebase Storage primero
            const url = await uploadPhoto(
                capturedData.image,
                'Visita',
                capturedData.metadata.usuario,
                capturedData.metadata.fecha,
                capturedData.metadata.hora
            );

            // Evitar sobrescritura si la promesa tardó demasiado y el flujo offline ya tomó el control
            if (timeoutTriggered) {
                console.log("Upload finalizó post-timeout. Abortando escritura en BD para no chocar con SyncManager.");
                return url;
            }

            setStatusMessage('Guardando registro...');
            
            // Crear fecha local basada en la captura real (Firestore lo convertirá a Timestamp automáticamente)
            let localTimestamp = serverTimestamp();
            try {
                const fStr = capturedData.metadata.fecha || '';
                const separator = fStr.includes('/') ? '/' : '-';
                const parts = fStr.split(separator);
                const [hours, minutes, seconds] = (capturedData.metadata.hora || '').split(':');
                if (parts.length === 3 && hours && minutes) {
                    let d, m, y;
                    if (parts[0].length === 4) {
                        [y, m, d] = parts;
                    } else {
                        [d, m, y] = parts;
                    }
                    localTimestamp = new Date(parseInt(y), parseInt(m) - 1, parseInt(d), parseInt(hours), parseInt(minutes), parseInt(seconds || 0));
                }
            } catch (e) {
                console.error("Error creando fecha local:", e);
            }

            const docData = {
                ...capturedData.metadata,
                observacion: observacion.trim(),
                fotoURL: url,
                timestamp: localTimestamp
            };

            // Generar ID determinístico para evitar duplicados
            const safeEmail = capturedData.metadata.usuario.replace(/[@.]/g, '-');
            const safeFecha = (capturedData.metadata.fecha || '').replace(/\//g, '-');
            const safeHora = (capturedData.metadata.hora || '').replace(/:/g, '-').replace(/\s/g, '');
            const deterministicDocId = `${safeEmail}_${safeFecha}_${safeHora}`;

            // 1. Guardar en 'visitas' (formato original para informes de ruta)
            await setDoc(doc(db, "visitas", deterministicDocId), docData);
            
            // 2. Guardar en 'attendance' (formato para el visor de datos)
            const attendanceData = { ...docData };
            if (attendanceData.tipo === 'Llegada Cliente') attendanceData.tipo = 'En Cliente';
            if (attendanceData.tipo === 'Salida Cliente') attendanceData.tipo = 'En Tránsito';

            await setDoc(doc(db, "attendance", deterministicDocId), attendanceData);
            
            return url;
        };

        try {
            // Timeout de 5s para Firestore/Storage: Si no responde, forzar offline
            const saveTimeout = new Promise((_, reject) => setTimeout(() => {
                timeoutTriggered = true;
                reject(new Error("Firebase Timeout"));
            }, 5000));
            
            let url = null;
            try {
                url = await Promise.race([saveRecordOnline(), saveTimeout]);
            } catch (err) {
                console.warn('⚠️ Sin conexión (Ruta). Guardando localmente:', err.message);
                // Guardar imagen SIN marca — SyncManager la marcará con la dirección real al sincronizar
                const recordId = await saveOfflineRecord({
                    image: capturedData.rawImage || capturedData.image,
                    metadata: {
                        ...capturedData.metadata,
                        observacion: observacion.trim()
                    },
                    mode: 'visita',
                    savePhoto: true,
                    latitude: capturedData.metadata.latitud,
                    longitude: capturedData.metadata.longitud
                });
                setStatusMessage('Guardado localmente (Offline)');
                
                if (capturedData.metadata.latitud === 0 && capturedData.metadata.longitud === 0) {
                    startBackgroundGPSRecovery(recordId);
                }
            }

            setStep('success');

            // Actualizar estado persistente (siempre con email normalizado + original si difiere)
            const _rawRuta = currentUser.email || '';
            const _normRuta = _rawRuta.trim().toLowerCase();
            if (mode === 'Llegada Cliente') {
                setAllowedActions({ entry: false, exit: true });
                localStorage.setItem(`lastRutaType_${_normRuta}`, 'Llegada Cliente');
                if (_rawRuta !== _normRuta) localStorage.setItem(`lastRutaType_${_rawRuta}`, 'Llegada Cliente');
                localStorage.setItem(`lastRutaLocation_${_normRuta}`, capturedData.metadata.localidad || 'Cliente');
                if (_rawRuta !== _normRuta) localStorage.setItem(`lastRutaLocation_${_rawRuta}`, capturedData.metadata.localidad || 'Cliente');
            } else {
                setAllowedActions({ entry: true, exit: false });
                localStorage.setItem(`lastRutaType_${_normRuta}`, 'Salida Cliente');
                if (_rawRuta !== _normRuta) localStorage.setItem(`lastRutaType_${_rawRuta}`, 'Salida Cliente');
                localStorage.removeItem(`lastRutaLocation_${_normRuta}`);
                if (_rawRuta !== _normRuta) localStorage.removeItem(`lastRutaLocation_${_rawRuta}`);
            }

        } catch (error) {
            console.error(error);
            alert(`Error crítico guardando: ${error.message}`);
            setStep('preview');
        }
    };

    const handleManualShare = async () => {
        setSharing(true);
        let filesToShare = null;
        if (navigator.canShare && capturedData?.image) {
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

        // Una vez que el selector de apps cierra (compartido o cancelado), regresar al inicio
        setSharing(false);
        setStep('idle');
        setCapturedData(null);
        setObservacion('');
    };

    return (
        <div className="min-h-screen bg-gradient-to-b from-[#3C7DA6] to-[#6FAF6B] flex flex-col">
            <div className="bg-white/10 backdrop-blur-md p-4 flex items-center gap-3 border-b border-white/20">
                <button onClick={() => navigate('/dashboard')} className="px-6 py-2.5 bg-white text-gray-800 font-bold flex items-center gap-2 rounded-xl border border-gray-100 shadow-lg hover:bg-gray-50 transition whitespace-nowrap">
                    <ArrowLeft size={20} /> Volver
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
                    <div className="w-full flex flex-col gap-4">
                        {/* Aviso discreto de nueva versión */}
                        <UpdateBadge />

                        {/* Aviso: Sin turno activo */}
                        {!hasActiveShift && !isLoadingShift && (
                            <div className="w-full bg-amber-50 border border-amber-300 rounded-2xl p-5 shadow-lg flex flex-col gap-2">
                                <div className="flex items-center gap-2">
                                    <span className="text-2xl">⚠️</span>
                                    <h3 className="text-amber-800 font-bold text-base">Sin turno activo</h3>
                                </div>
                                <p className="text-amber-700 text-sm leading-snug">
                                    Debes registrar tu <strong>Entrada general</strong> desde la pantalla principal antes de poder marcar llegadas a clientes.
                                </p>
                                <button
                                    onClick={() => navigate('/dashboard')}
                                    className="mt-1 w-full py-3 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl transition active:scale-95 text-sm"
                                >
                                    Ir a registrar Entrada →
                                </button>
                            </div>
                        )}

                        {/* Título */}
                        <div className="bg-white rounded-2xl p-6 text-center shadow-lg border border-white/60">
                            <h2 className="text-gray-800 font-bold text-lg mb-2">Registro de Clientes</h2>
                            <p className="text-gray-500 text-sm">
                                {isLoadingShift
                                    ? 'Verificando estado del turno...'
                                    : !hasActiveShift
                                        ? 'Para usar este módulo primero debes registrar tu entrada general.'
                                        : allowedActions.entry
                                            ? 'Usa esta opción al llegar a las instalaciones del cliente.'
                                            : 'Registra tu salida al concluir la visita.'}
                            </p>
                        </div>

                        {/* Spinner de carga de cámara */}
                        {cameraLoading && (
                            <div className="w-full bg-white/20 backdrop-blur-md rounded-2xl p-6 flex flex-col items-center gap-3 border border-white/30">
                                <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 border-white"></div>
                                <p className="text-white font-semibold text-sm">{cameraLoadingMsg}</p>
                                <p className="text-white/70 text-xs">Por favor espera, esto puede tomar unos segundos en Android...</p>
                            </div>
                        )}

                        {/* Panel de error con botón Reintentar */}
                        {cameraError && (
                            <div className="w-full bg-red-50 border border-red-200 rounded-2xl p-5 shadow-lg flex flex-col gap-3">
                                <h3 className="text-red-700 font-bold text-base">{cameraError.title}</h3>
                                <p className="text-red-600 text-sm whitespace-pre-line">{cameraError.message}</p>
                                <div className="flex gap-3 mt-1">
                                    {cameraError.canRetry && (
                                        <button
                                            onClick={() => {
                                                if (cameraError?.type === 'busy') {
                                                    if (pendingMode) sessionStorage.setItem('pendingRutaMode', pendingMode);
                                                    if ('serviceWorker' in navigator) {
                                                        navigator.serviceWorker.getRegistrations().then(registrations => {
                                                            for (let registration of registrations) registration.unregister();
                                                        });
                                                    }
                                                    window.location.reload(true);
                                                } else {
                                                    setCameraError(null);
                                                    if (pendingMode) handleStartAction(pendingMode);
                                                }
                                            }}
                                            className="flex-1 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition active:scale-95"
                                        >
                                            🔄 Reintentar
                                        </button>
                                    )}
                                    <button
                                        onClick={() => setCameraError(null)}
                                        className="flex-1 py-3 bg-white text-gray-600 font-bold rounded-xl border border-gray-200 hover:bg-gray-50 transition"
                                    >
                                        Cancelar
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Botones de acción — deshabilitados mientras carga o sin turno activo */}
                        {isLoadingShift ? (
                            <div className="w-full bg-white/20 backdrop-blur-md rounded-2xl p-6 flex flex-col items-center gap-3 border border-white/30">
                                <div className="animate-spin rounded-full h-8 w-8 border-t-4 border-b-4 border-white"></div>
                                <p className="text-white font-semibold text-sm">Verificando turno...</p>
                            </div>
                        ) : (
                            <div className={`grid grid-cols-2 gap-4 ${cameraLoading ? 'opacity-40 pointer-events-none' : ''}`}>
                                <button
                                    disabled={!allowedActions.entry || cameraLoading || !hasActiveShift}
                                    onClick={() => handleStartAction('Llegada Cliente')}
                                    className={`flex flex-col items-center justify-center gap-3 p-6 rounded-2xl shadow-xl transition-all ${
                                        allowedActions.entry && !cameraLoading && hasActiveShift
                                            ? 'bg-gradient-to-br from-blue-500 to-indigo-600 hover:scale-105 hover:shadow-2xl border border-blue-400 cursor-pointer'
                                            : 'bg-white/5 border border-white/10 opacity-50 cursor-not-allowed'
                                    }`}
                                >
                                    <MapPin size={32} className={allowedActions.entry && hasActiveShift ? "text-white" : "text-gray-400"} />
                                    <span className={`font-bold ${allowedActions.entry && hasActiveShift ? "text-white" : "text-gray-400"}`}>Llegada<br/>Cliente</span>
                                </button>

                                <button
                                    disabled={!allowedActions.exit || cameraLoading || !hasActiveShift}
                                    onClick={() => handleStartAction('Salida Cliente')}
                                    className={`flex flex-col items-center justify-center gap-3 p-6 rounded-2xl shadow-xl transition-all ${
                                        allowedActions.exit && !cameraLoading && hasActiveShift
                                            ? 'bg-gradient-to-br from-orange-500 to-red-600 hover:scale-105 hover:shadow-2xl border border-orange-400 cursor-pointer'
                                            : 'bg-white/5 border border-white/10 opacity-50 cursor-not-allowed'
                                    }`}
                                >
                                    <MapPin size={32} className={allowedActions.exit && hasActiveShift ? "text-white" : "text-gray-400"} />
                                    <span className={`font-bold ${allowedActions.exit && hasActiveShift ? "text-white" : "text-gray-400"}`}>Salida<br/>Cliente</span>
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {step === 'camera' && (
                    <div className="w-full flex flex-col items-center animate-fade-in">
                        <h2 className="text-white text-xl font-bold mb-4">{mode}</h2>
                        <div className="flex flex-col items-center animate-fade-in w-full">
                            <div className="relative rounded-lg overflow-hidden border-2 border-green-400 bg-black aspect-[3/4] w-full max-w-[280px]">
                                <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                                <canvas ref={canvasRef} className="hidden" />
                                <div className="absolute inset-0 border-2 border-white/30 rounded-2xl pointer-events-none"></div>
                                <div className="absolute bottom-4 left-0 right-0 text-center">
                                    <span className="bg-black/60 text-white text-xs px-3 py-1 rounded-full backdrop-blur-md inline-flex items-center gap-2">
                                        <MapPin size={12}/> Buscando ubicación...
                                    </span>
                                </div>
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
                    <div className="bg-white p-8 rounded-3xl shadow-2xl max-w-sm text-center animate-bounce-in border-4 border-indigo-100 flex flex-col gap-3">
                        <CheckCircle className="w-20 h-20 text-indigo-500 mx-auto mb-2" />
                        <h2 className="text-2xl font-bold text-gray-800 mb-1">¡Evidencia Guardada!</h2>
                        <p className="text-gray-500 font-medium mb-4">El registro ha sido almacenado correctamente.</p>
                        
                        <button 
                            onClick={handleManualShare}
                            disabled={sharing}
                            className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 transition shadow-lg mt-2 disabled:opacity-70"
                        >
                            {sharing ? 'Compartiendo...' : 'Compartir Evidencia'}
                        </button>
                        <button 
                            onClick={() => { setStep('idle'); setCapturedData(null); setObservacion(''); }}
                            disabled={sharing}
                            className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gray-100 text-gray-700 font-bold hover:bg-gray-200 transition disabled:opacity-50"
                        >
                            Finalizar
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
