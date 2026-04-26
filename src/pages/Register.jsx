import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebaseConfig';
import { fetchLicenseStatus } from '../services/licenseService';
import { UserPlus, LogOut, Loader2, Camera, UserCheck, Download, Calendar, Trash2, AlertTriangle, TriangleAlert, Image, UserMinus, FileText, Printer, Image as ImageIcon, ArrowLeft } from 'lucide-react';
import * as faceapi from '@vladmandic/face-api';
import Privacidad from './Privacidad';

// ─── Definición de campos opcionales (igual que en Configuracion.jsx) ─────────
const FIELD_DEFS = [
    // Identificación Básica
    { key: 'documentoIdentidad', label: 'Documento de identidad', type: 'text', group: 'Identificación' },
    { key: 'fechaNacimiento', label: 'Fecha de nacimiento', type: 'date', group: 'Identificación' },
    { key: 'fechaIngreso', label: 'Fecha de ingreso', type: 'date', group: 'Identificación' },
    { key: 'infoBancaria', label: 'Información bancaria', type: 'text', group: 'Identificación' },
    { key: 'licenciaConducir', label: 'Licencia de conducir', type: 'text', group: 'Identificación' },
    { key: 'tallaUniforme', label: 'Talla de uniformes', type: 'text', group: 'Identificación' },
    { key: 'tallaCalzado', label: 'Talla de calzado', type: 'text', group: 'Identificación' },
    { key: 'alergias', label: 'Alergias / cond. médicas', type: 'text', group: 'Identificación' },
    { key: 'estadoCivil', label: 'Estado civil', type: 'text', group: 'Identificación' },
    { key: 'hijos', label: 'Hijos y edades', type: 'text', group: 'Identificación' },
    { key: 'grupoSanguineo', label: 'Grupo sanguíneo', type: 'text', group: 'Identificación' },
    { key: 'eps', label: 'EPS', type: 'text', group: 'Identificación' },
    { key: 'arl', label: 'ARL', type: 'text', group: 'Identificación' },
    // Contacto
    { key: 'direccion', label: 'Dirección de residencia', type: 'text', group: 'Contacto' },
    { key: 'telefono', label: 'Teléfono personal', type: 'tel', group: 'Contacto' },
    { key: 'correoPersonal', label: 'Correo electrónico personal', type: 'email', group: 'Contacto' },
    { key: 'contactoEmergencia', label: 'Contacto de emergencia', type: 'text', group: 'Contacto' },
    // Formación
    { key: 'nivelEducativo', label: 'Nivel educativo', type: 'text', group: 'Formación' },
    { key: 'idiomas', label: 'Idiomas y nivel', type: 'text', group: 'Formación' },
];

const GROUP_COLORS = {
    'Identificación': 'border-blue-400',
    'Contacto': 'border-green-400',
    'Formación': 'border-purple-400',
};

export default function Register() {
    // ─── Estado campos fijos ──────────────────────────────────────────────────
    const [email, setEmail] = useState('');
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [faceDescriptor, setFaceDescriptor] = useState(null);
    const [faceVerified, setFaceVerified] = useState(false);      // true = pasó verificación
    const [verifyAttempts, setVerifyAttempts] = useState(0);      // intentos de verificación usados
    const [verifyPhase, setVerifyPhase] = useState(false);        // true = cámara abierta para verificar
    const [verifyResult, setVerifyResult] = useState(null);       // { ok, confidence } | null
    const [isCameraOpen, setIsCameraOpen] = useState(false);
    const [modelsLoaded, setModelsLoaded] = useState(false);
    const [capturingFace, setCapturingFace] = useState(false);
    const videoRef = React.useRef(null);
    const canvasRef = React.useRef(null);
    const streamRef = React.useRef(null);
    const [configLoading, setConfigLoading] = useState(true);

    // ─── Estado campos opcionales dinámicos ───────────────────────────────────
    const [fieldConfig, setFieldConfig] = useState({});        // qué campos están activos
    const [extraFields, setExtraFields] = useState({});        // valores de los campos activos
    // ─── Estado de la Licencia ────────────────────────────────────────────────
    const [licenseInfo, setLicenseInfo] = useState(null);
    const [employeeCount, setEmployeeCount] = useState(0);
    // ─── Estado de Aceptaciones ───────────────────────────────────────────────
    const [readPolicy, setReadPolicy] = useState(false);
    const [acceptPolicy, setAcceptPolicy] = useState(false);
    const [showPrivacyModal, setShowPrivacyModal] = useState(false);
    const [policyAlreadyAccepted, setPolicyAlreadyAccepted] = useState(false);

    // ─── Estado de Actualización de Empleado (Edición) ─────────────────────
    const [isUpdating, setIsUpdating] = useState(false);
    const [updateDocId, setUpdateDocId] = useState('');
    const [validateLoading, setValidateLoading] = useState(false);
    const [validateMessage, setValidateMessage] = useState('');
    const [showConfigPasswordModal, setShowConfigPasswordModal] = useState(false);
    const [configPassword, setConfigPassword] = useState('');
    const [configPasswordError, setConfigPasswordError] = useState('');

    const navigate = useNavigate();
    const { adminAccess } = useAuth();

    // ─── Cargar configuración de campos y estado de Licencia ─────────────────
    useEffect(() => {
        const loadInitialData = async () => {
            try {
                const snap = await getDoc(doc(db, 'settings', 'employeeFields'));
                if (snap.exists()) {
                    setFieldConfig(snap.data());
                }

                // Cargar Licencia y contar empleados actuales (Auth)
                const lic = await fetchLicenseStatus();
                setLicenseInfo(lic);

                const getUsersListFn = httpsCallable(functions, 'getUsersList');
                try {
                    const result = await getUsersListFn();
                    if (result.data && result.data.users) {
                        setEmployeeCount(result.data.users.length);
                    }
                } catch (fnErr) {
                    console.error("Error al obtener la lista de usuarios:", fnErr);
                }

            } catch (err) {
                console.warn('Error cargando iniciales:', err);
            } finally {
                setConfigLoading(false);
            }
        };
        loadInitialData();
    }, []);

    // ─── Cargar modelos de reconocimiento facial ──────────────────────────────
    useEffect(() => {
        const loadModels = async () => {
            try {
                if (faceapi.nets.tinyFaceDetector.isLoaded &&
                    faceapi.nets.faceLandmark68Net.isLoaded &&
                    faceapi.nets.faceRecognitionNet.isLoaded) {
                    setModelsLoaded(true);
                    return;
                }
                const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';
                await Promise.all([
                    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
                    faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
                    faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
                ]);
                setModelsLoaded(true);
            } catch (err) {
                console.error('Error al cargar modelos de cara:', err);
                setError('No se pudieron cargar los modelos de reconocimiento facial.');
            }
        };
        loadModels();
    }, []);

    useEffect(() => {
        if (!adminAccess['/registro']) navigate('/login');
    }, [adminAccess, navigate]);

    // ─── Cámara ───────────────────────────────────────────────────────────────
    const startCamera = async () => {
        setError('');
        // Liberar stream anterior si existe
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }

        // --- ESTRATEGIA DE 4 NIVELES para máxima compatibilidad Android/Samsung/ZTE ---
        const strategies = [
            // Nivel 1: frontal con modo exact
            { video: { facingMode: { exact: 'user' }, width: { ideal: 720 }, height: { ideal: 960 } }, audio: false },
            // Nivel 2: frontal simple con resolución
            { video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 960 } }, audio: false },
            // Nivel 3: frontal ideal sin restricción de resolución
            { video: { facingMode: { ideal: 'user' } }, audio: false },
            // Nivel 4: cualquier cámara disponible
            { video: true, audio: false },
        ];

        let stream = null;
        let lastErr = null;
        for (const constraints of strategies) {
            try {
                stream = await navigator.mediaDevices.getUserMedia(constraints);
                break;
            } catch (err) {
                lastErr = err;
                console.warn('Intento cámara fallido en registro:', err.name);
            }
        }

        if (!stream) {
            console.error('No se pudo abrir cámara en registro:', lastErr);
            if (lastErr?.name === 'NotAllowedError' || lastErr?.name === 'PermissionDeniedError') {
                setError('Por favor permite el acceso a la cámara. Si ya lo denegaste, restablécelo desde la configuración del navegador.');
            } else {
                setError(`No se pudo acceder a la cámara (${lastErr?.name}). Cierra otras apps que la estén usando y recarga.`);
            }
            return;
        }

        streamRef.current = stream;
        setIsCameraOpen(true);
    };


    useEffect(() => {
        if (isCameraOpen && videoRef.current && streamRef.current) {
            videoRef.current.srcObject = streamRef.current;
        }
    }, [isCameraOpen]);

    const stopCamera = () => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        setIsCameraOpen(false);
    };

    // ─── Chequeo de calidad del rostro detectado ─────────────────────────────
    const checkFaceQuality = (detection, videoEl) => {
        const videoArea = (videoEl?.videoWidth || 1) * (videoEl?.videoHeight || 1);
        const box = detection.detection.box;
        const faceArea = box.width * box.height;
        const faceRatio = faceArea / videoArea;

        if (detection.detection.score < 0.80) {
            return { ok: false, reason: 'Poca confianza en la detección. Busca mejor iluminación y mira de frente, sin contraluz.' };
        }
        if (faceRatio < 0.10) {
            return { ok: false, reason: 'Cara demasiado lejos. Acércate más a la cámara.' };
        }
        if (!detection.descriptor || detection.descriptor.length !== 128) {
            return { ok: false, reason: 'No se pudo procesar el rostro. Intenta con mejores condiciones de luz.' };
        }
        return { ok: true };
    };

    const delay = (ms) => new Promise(res => setTimeout(res, ms));

    const captureFace = async () => {
        if (!videoRef.current) return;
        setCapturingFace(true);
        setError('');

        const MAX_INTERNAL_ATTEMPTS = 5; // Internally insists 5 times before failing (smooth UX)
        let finalError = 'No se pudo procesar el rostro. Intenta con mejores condiciones de luz.';

        for (let attempt = 1; attempt <= MAX_INTERNAL_ATTEMPTS; attempt++) {
            try {
                const detections = await faceapi
                    .detectAllFaces(videoRef.current, new faceapi.TinyFaceDetectorOptions())
                    .withFaceLandmarks()
                    .withFaceDescriptors();

                if (!detections || detections.length === 0) {
                    finalError = 'No se detectó ningún rostro. Asegúrate de que tu cara esté bien iluminada y visible, sin contraluz.';
                    await delay(600); // give it time to refocus/detect
                    continue;
                }
                
                if (detections.length > 1) {
                    finalError = 'Se detectó más de un rostro. Asegúrate de estar solo en la imagen.';
                    await delay(600);
                    continue;
                }

                const detection = detections[0];
                const quality = checkFaceQuality(detection, videoRef.current);
                if (!quality.ok) {
                    finalError = quality.reason;
                    await delay(600);
                    continue;
                }

                // --------- ¡ÉXITO! ---------
                const descriptor = Array.from(detection.descriptor);
                setFaceDescriptor(descriptor);
                setFaceVerified(false);
                setVerifyResult(null);
                setVerifyAttempts(0);
                stopCamera();

                // Pausa breve y abrir cámara de verificación automáticamente
                setError('');
                setTimeout(() => {
                    setVerifyPhase(true);
                    startCamera();
                }, 600);
                
                // End execution immediately upon success (so finally block runs)
                setCapturingFace(false);
                return;

            } catch (err) {
                console.error('Error capturando rostro en intento', attempt, err);
                finalError = 'Error al analizar el rostro. Intenta de nuevo.';
                await delay(600);
            }
        }

        // Si llegó aquí es porque los 5 intentos fallaron:
        setError(finalError);
        setCapturingFace(false);
    };

    // ─── Verificación: segunda selfie comparada con el descriptor registrado ───
    const VERIFICATION_THRESHOLD = 0.50;
    const MAX_VERIFY_ATTEMPTS = 3;

    const verifyFace = async () => {
        if (!videoRef.current || !faceDescriptor) return;
        setCapturingFace(true);
        setError('');

        const lightingTip = `\n\nConsejos:\n• Busca un lugar con buena luz natural o artificial\n• Evita la contraluz (no estar de espaldas a una ventana)\n• Mira directamente a la cámara\n• Retira gorras, gafas oscuras o elementos que cubran el rostro\n\nPresiona "Repetir Foto" para volver a capturar el rostro.`;

        try {
            const detections = await faceapi
                .detectAllFaces(videoRef.current, new faceapi.TinyFaceDetectorOptions())
                .withFaceLandmarks()
                .withFaceDescriptors();

            const newAttempts = verifyAttempts + 1;

            if (!detections || detections.length === 0) {
                setVerifyAttempts(newAttempts);
                if (newAttempts >= MAX_VERIFY_ATTEMPTS) {
                    setError(`❌ ${MAX_VERIFY_ATTEMPTS} intentos fallidos. No se detectó ningún rostro.${lightingTip}`);
                    stopCamera(); setVerifyPhase(false); setFaceDescriptor(null);
                } else {
                    setError(`No se detectó ningún rostro. Intento ${newAttempts}/${MAX_VERIFY_ATTEMPTS}. Mira de frente a la cámara.`);
                }
                setCapturingFace(false);
                return;
            }
            if (detections.length > 1) {
                setError('Se detectó más de un rostro. Asegúrate de estar solo en la imagen.');
                setCapturingFace(false);
                return;
            }

            const detection = detections[0];
            const quality = checkFaceQuality(detection, videoRef.current);
            if (!quality.ok) {
                setVerifyAttempts(newAttempts);
                if (newAttempts >= MAX_VERIFY_ATTEMPTS) {
                    setError(`❌ ${MAX_VERIFY_ATTEMPTS} intentos fallidos.${lightingTip}`);
                    stopCamera(); setVerifyPhase(false); setFaceDescriptor(null);
                } else {
                    setError(`${quality.reason} Intento ${newAttempts}/${MAX_VERIFY_ATTEMPTS}.`);
                }
                setCapturingFace(false);
                return;
            }

            // Comparar descriptores
            const registeredDescriptor = new Float32Array(faceDescriptor);
            const distance = faceapi.euclideanDistance(registeredDescriptor, detection.descriptor);
            const confidence = Math.max(0, Math.round((1 - distance) * 100));

            if (distance <= VERIFICATION_THRESHOLD) {
                // ✅ Verificación exitosa
                setVerifyResult({ ok: true, confidence });
                setFaceVerified(true);
                stopCamera();
                setVerifyPhase(false);
                setError('');
            } else {
                setVerifyAttempts(newAttempts);
                if (newAttempts >= MAX_VERIFY_ATTEMPTS) {
                    setError(`❌ ${MAX_VERIFY_ATTEMPTS} intentos fallidos. Las fotos no coinciden (similitud: ${confidence}%).${lightingTip}`);
                    stopCamera(); setVerifyPhase(false); setFaceDescriptor(null);
                } else {
                    setError(`Las fotos no coinciden (similitud: ${confidence}%). Intento ${newAttempts}/${MAX_VERIFY_ATTEMPTS}. Mira de frente sin mover la cabeza.`);
                }
            }
        } catch (err) {
            console.error('Error en verificación facial:', err);
            setError('Error al verificar el rostro. Intenta de nuevo.');
        } finally {
            setCapturingFace(false);
        }
    };



    // ─── Validar y Actualizar Empleado ───────────────────────────────────────
    const handleValidate = async () => {
        if (!email.trim()) return setValidateMessage("⚠️ Ingresa un usuario/ID primero");
        setValidateLoading(true);
        setValidateMessage('');
        try {
            let emailToUse = email.includes('@') ? email : `${email}@usuario.com`;
            const checkFn = httpsCallable(functions, 'checkEmployeeExists');
            const res = await checkFn({ email: emailToUse });
            if (res.data && res.data.exists) {
                setIsUpdating(true);
                setUpdateDocId(res.data.docId);
                setFirstName(res.data.firstName);
                setLastName(res.data.lastName);
                setExtraFields(res.data.extraFields || {});
                
                // Recuperar estado de aceptación de políticas
                const accepted = !!(res.data.extraFields && res.data.extraFields.aceptaPoliticaDatos);
                setPolicyAlreadyAccepted(accepted);
                setReadPolicy(accepted);
                setAcceptPolicy(accepted);

                setValidateMessage('✅ Usuario encontrado. Modo Edición activado.');
                setError(''); setFaceDescriptor(null); setFaceVerified(false);
                setVerifyPhase(false); stopCamera();
            } else {
                setIsUpdating(false);
                setUpdateDocId('');
                setFirstName(''); setLastName(''); setExtraFields({});
                setPolicyAlreadyAccepted(false); setReadPolicy(false); setAcceptPolicy(false);
                setValidateMessage('ℹ️ Usuario no existe. Llena los datos para crearlo.');
            }
        } catch (err) {
            console.error(err);
            setValidateMessage('❌ Error al validar.');
        } finally {
            setValidateLoading(false);
        }
    };

    const handleUpdateSubmit = async () => {
        if (!configPassword.trim()) return setConfigPasswordError("Ingresa la contraseña de Configuración");
        if (!readPolicy || !acceptPolicy) return setConfigPasswordError('Debes aceptar la política de datos.');

        try {
            setConfigPasswordError('');
            setLoading(true);
            let emailToUse = email.includes('@') ? email : `${email}@usuario.com`;
            emailToUse = emailToUse.toLowerCase().trim();

            const optionalData = {};
            FIELD_DEFS.forEach(({ key }) => {
                if (fieldConfig[key] && extraFields[key] !== undefined) {
                    optionalData[key] = extraFields[key];
                }
            });
            optionalData.aceptaPoliticaDatos = true;
            optionalData.fechaAceptacionPolitica = new Date().toISOString();

            const updateFn = httpsCallable(functions, 'updateEmployeeSecure');
            const result = await updateFn({
                docId: updateDocId,
                email: emailToUse,
                firstName: firstName.trim(),
                lastName: lastName.trim(),
                faceDescriptor: faceDescriptor || null, // Opcional en update
                extraFields: optionalData,
                configPassword: configPassword.trim()
            });

            if (result.data && result.data.success) {
                alert('Usuario actualizado exitosamente.');
                // Reset states
                setIsUpdating(false); setUpdateDocId(''); setEmail(''); setFirstName(''); setLastName('');
                setFaceDescriptor(null); setFaceVerified(false); setVerifyResult(null); setVerifyAttempts(0);
                setExtraFields({}); setReadPolicy(false); setAcceptPolicy(false);
                setShowConfigPasswordModal(false); setConfigPassword(''); setValidateMessage('');
            }
        } catch (err) {
            console.error(err);
            setConfigPasswordError(err.message || "Error al actualizar.");
        } finally {
            setLoading(false);
        }
    };

    // ─── Submit (Creación Nueva) ────────────────────────────────────────────────
    const handleSubmit = async (e) => {
        e.preventDefault();

        // Si estamos actualizando, abrimos el modal de seguridad
        if (isUpdating) {
            setShowConfigPasswordModal(true);
            return;
        }

        // --- Validación local del Token Licencia ---
        if (!licenseInfo?.decoded?.isValid) return setError("Licencia no encontrada o corrupta. Revise Configuraciones.");
        if (licenseInfo.decoded.isExpired) return setError(`Licencia expirada. Contacte a ${licenseInfo.decoded.providerName}.`);
        if (employeeCount >= licenseInfo.decoded.absoluteMaxEmployees) return setError(`Límite bloqueado (${employeeCount}/${licenseInfo.decoded.absoluteMaxEmployees}). Comuníquese con el administrador para ampliar el plan.`);

        if (password !== confirmPassword) return setError('Las contraseñas no coinciden');
        if (!faceDescriptor) return setError('Debes capturar el rostro del empleado antes de crear la cuenta.');
        if (!faceVerified) return setError('La verificación facial es obligatoria. El rostro aún no ha sido confirmado.');
        if (!readPolicy || !acceptPolicy) return setError('Se debe leer y aceptar la política de datos antes de registrar al empleado.');

        try {
            setError('');
            setLoading(true);
            let emailToUse = email.includes('@') ? email : `${email}@usuario.com`;
            emailToUse = emailToUse.toLowerCase().trim();

            // Construir objeto con campos opcionales activos
            const optionalData = {};
            FIELD_DEFS.forEach(({ key }) => {
                if (fieldConfig[key] && extraFields[key] !== undefined) {
                    optionalData[key] = extraFields[key];
                }
            });

            // Registrar legalmente la fecha y aceptación de la política para trazabilidad
            optionalData.aceptaPoliticaDatos = true;
            optionalData.fechaAceptacionPolitica = new Date().toISOString();

            // Reemplazo: Delegamos la creación al "Policía" del Back-End (Cloud Function)
            // para que valide los cupos de la licencia antes de tocar Authentication
            const createEmployeeSecureFn = httpsCallable(functions, 'createEmployeeSecure');
            const result = await createEmployeeSecureFn({
                email: emailToUse,
                password: password,
                firstName: firstName.trim(),
                lastName: lastName.trim(),
                faceDescriptor: faceDescriptor,
                extraFields: optionalData
            });

            if (result.data && result.data.success) {
                alert('Usuario creado exitosamente.');
                setEmail(''); setFirstName(''); setLastName('');
                setPassword(''); setConfirmPassword('');
                setFaceDescriptor(null);
                setFaceVerified(false);
                setVerifyResult(null);
                setVerifyAttempts(0);
                setVerifyPhase(false);
                setExtraFields({});
                setReadPolicy(false);
                setAcceptPolicy(false);
                setEmployeeCount(prev => prev + 1); // Aumentar en UI
            } else {
                setError('Error desconocido al crear la cuenta.');
            }

        } catch (err) {
            console.error(err);
            // Capturar errores amigables lanzados por la Cloud Function
            if (err.code === 'functions/resource-exhausted') {
                setError(err.message || "Límite absoluto de empleados alcanzado. Licencia Agotada.");
            } else if (err.code === 'functions/permission-denied') {
                setError(err.message || "Licencia corrupta o caducada. Verifique Configuraciones.");
            } else if (err.code === 'functions/already-exists') {
                setError('Este correo ya pertenece a otro usuario registrado.');
            } else {
                // Posibles errores de Auth o validaciones
                setError('Error al crear cuenta: ' + (err.message || err));
            }
        }
        setLoading(false);
    };

    // ─── Campos opcionales activos agrupados ──────────────────────────────────
    const activeGroups = (() => {
        const groups = {};
        FIELD_DEFS.forEach(f => {
            if (fieldConfig[f.key]) {
                if (!groups[f.group]) groups[f.group] = [];
                groups[f.group].push(f);
            }
        });
        return groups;
    })();

    const hasOptionalFields = Object.keys(activeGroups).length > 0;

    // ─── Banderas de Bloqueo por Licencia ────────────────────────────────────
    const isLicenseExpired = licenseInfo?.decoded?.isExpired;
    const isWarningZone = licenseInfo?.decoded && (employeeCount >= licenseInfo.decoded.maxEmployees) && (employeeCount < licenseInfo.decoded.absoluteMaxEmployees);
    const isLicenseFull = licenseInfo?.decoded && (employeeCount >= licenseInfo.decoded.absoluteMaxEmployees);
    const blockCreation = isLicenseExpired || isLicenseFull || !licenseInfo?.decoded?.isValid;

    // ─── Render ───────────────────────────────────────────────────────────────
    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-[#3C7DA6] to-[#6FAF6B] p-4">
            <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-lg backdrop-blur-sm bg-opacity-90">
                <div className="flex justify-start mb-6">
                    <button onClick={() => navigate('/login')} className="px-6 py-2.5 bg-white text-gray-800 font-bold flex items-center gap-2 rounded-xl border border-gray-100 shadow-lg hover:bg-gray-50 transition whitespace-nowrap">
                        <ArrowLeft size={20} /> Volver
                    </button>
                </div>
                <div className="flex justify-center mb-4">
                    <div className="bg-green-100 p-3 rounded-full">
                        <UserPlus className="text-green-600" size={32} />
                    </div>
                </div>
                <h2 className="text-3xl font-bold text-center mb-6 text-gray-800 flex items-center justify-center gap-2">
                    {isUpdating ? 'Actualizar Empleado' : 'Registrar Nuevo Empleado'}
                    <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-mono border border-gray-200">v{import.meta.env.VITE_APP_VERSION}</span>
                </h2>

                {/* Panel Informativo Licencia */}
                {licenseInfo?.decoded && (
                    <div className={`mb-6 p-4 rounded-xl border text-sm text-center ${blockCreation ? 'bg-red-50 border-red-200 text-red-800' : isWarningZone ? 'bg-orange-50 border-orange-200 text-orange-800' : 'bg-emerald-50 border-emerald-200 text-emerald-800'}`}>
                        {isLicenseExpired ? (
                            <p className="font-bold">❌ Su licencia venció el {licenseInfo.decoded.expirationDate}</p>
                        ) : isLicenseFull ? (
                            <p className="font-bold">❌ Ha alcanzado el límite absoluto de su plan ({employeeCount} / {licenseInfo.decoded.absoluteMaxEmployees} empleados, incluyendo el margen de cortesía).</p>
                        ) : isWarningZone ? (
                            <p className="font-bold">⚠️ Ha superado su límite contratado ({employeeCount}/{licenseInfo.decoded.maxEmployees}). Se encuentra en su margen de cortesía. Quedan {licenseInfo.decoded.absoluteMaxEmployees - employeeCount} cupos antes del bloqueo total.</p>
                        ) : (
                            <p className="font-medium">Plan activo: Capacidad {employeeCount} / {licenseInfo.decoded.maxEmployees} empleados.</p>
                        )}
                        {(blockCreation || isWarningZone) && (
                            <p className="text-xs mt-2 opacity-80">Contacte a <b>{licenseInfo.decoded.providerName}</b> al {licenseInfo.decoded.providerPhone} para ampliar su suscripción.</p>
                        )}
                    </div>
                )}

                {!licenseInfo?.decoded?.isValid && !configLoading && (
                    <div className="mb-6 p-4 rounded-xl border bg-yellow-50 border-yellow-200 text-yellow-800 text-sm text-center">
                        <p className="font-bold">⚠️ Sistema sin Licencia</p>
                        <p className="text-xs mt-1">Por favor copie el token activador en la sección Configuración.</p>
                    </div>
                )}

                {error && <div className="bg-red-100 text-red-700 p-3 rounded mb-4">{error}</div>}

                <div className="space-y-4">
                    {/* ── Campos fijos ─────────────────────────────────────── */}
                    <div className="bg-gray-50 p-4 border border-gray-200 rounded-xl relative">
                        <label className="block text-sm font-bold text-gray-700 mb-2">Usuario / ID a Validar</label>
                        <div className="flex gap-2">
                            <input type="text" required={!isUpdating}
                                className="block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-green-500 focus:border-green-500 flex-1"
                                value={email} onChange={(e) => { setEmail(e.target.value); setIsUpdating(false); setValidateMessage(''); }} placeholder="Ej: empleado@usuario.com" disabled={isUpdating} />
                            
                            {!isUpdating ? (
                                <button type="button" onClick={handleValidate} disabled={validateLoading}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 flex items-center gap-2 transition whitespace-nowrap disabled:opacity-50">
                                    {validateLoading ? <Loader2 size={16} className="animate-spin" /> : 'Validar'}
                                </button>
                            ) : (
                                <button type="button" onClick={() => { setIsUpdating(false); setUpdateDocId(''); setEmail(''); setFirstName(''); setLastName(''); setExtraFields({}); setValidateMessage(''); setFaceDescriptor(null); setError(''); setPolicyAlreadyAccepted(false); setReadPolicy(false); setAcceptPolicy(false); }}
                                    className="px-4 py-2 bg-red-100 border border-red-200 text-red-700 rounded-lg text-sm font-bold hover:bg-red-200 flex items-center gap-2 transition whitespace-nowrap">
                                    Cancelar Edición
                                </button>
                            )}
                        </div>
                        {validateMessage && (
                            <p className={`mt-2 text-xs font-bold ${isUpdating ? 'text-green-600' : 'text-blue-600'}`}>{validateMessage}</p>
                        )}
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Nombres</label>
                        <input type="text" required
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-green-500 focus:border-green-500"
                            value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Ej: Juan" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Apellidos</label>
                        <input type="text" required
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-green-500 focus:border-green-500"
                            value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Ej: Pérez" />
                    </div>
                    {!isUpdating && (
                        <>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Contraseña</label>
                                <input type="text" style={{ WebkitTextSecurity: 'disc' }}
                                    name="new_sec_field_a" autoComplete="off" required={!isUpdating}
                                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-green-500 focus:border-green-500"
                                    value={password} onChange={(e) => setPassword(e.target.value)} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Confirmar Contraseña</label>
                                <input type="text" style={{ WebkitTextSecurity: 'disc' }}
                                    name="new_sec_field_b" autoComplete="off" required={!isUpdating}
                                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-green-500 focus:border-green-500"
                                    value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
                            </div>
                        </>
                    )}

                    {/* ── Campos opcionales dinámicos ──────────────────────── */}
                    {!configLoading && hasOptionalFields && (
                        <div className="pt-2">
                            <p className="text-xs text-gray-400 font-semibold uppercase tracking-widest mb-3">
                                Información Adicional del Empleado
                            </p>
                            {Object.entries(activeGroups).map(([group, fields]) => (
                                <div key={group} className={`bg-gray-50 rounded-xl border-l-4 ${GROUP_COLORS[group] || 'border-gray-300'} p-4 mb-4`}>
                                    <p className="text-xs font-bold text-gray-500 uppercase mb-3">{group}</p>
                                    <div className="space-y-3">
                                        {fields.map(({ key, label, type }) => (
                                            <div key={key}>
                                                <label className="block text-sm font-medium text-gray-700">{label}</label>
                                                <input
                                                    type={type}
                                                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-green-500 focus:border-green-500 text-sm"
                                                    value={extraFields[key] || ''}
                                                    onChange={(e) => setExtraFields(prev => ({ ...prev, [key]: e.target.value }))}
                                                    placeholder={`${label}...`}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* ── Reconocimiento Facial ────────────────────────────── */}
                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                        <label className="block text-sm font-bold text-gray-700 mb-3">Reconocimiento Facial</label>

                        {/* Estado: sin foto aún */}
                        {!isCameraOpen && !faceDescriptor && !verifyPhase && (
                            <div className="flex flex-col items-center">
                                <p className="text-xs text-gray-500 mb-3 text-center">
                                    {isUpdating 
                                        ? "La actualización del rostro es opcional. Si no abre la cámara, se mantendrá la foto actual de la base de datos."
                                        : "Es necesario registrar y verificar el rostro para que el empleado pueda marcar asistencia."}
                                    {!isUpdating && <><br/><span className="text-amber-600 font-semibold">Se tomará una foto de registro y luego una de verificación.</span></>}
                                </p>
                                <button type="button" onClick={startCamera} disabled={!modelsLoaded}
                                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold bg-blue-600 text-white hover:bg-blue-700 transition disabled:opacity-50">
                                    <Camera size={18} /> Activar Cámara
                                </button>
                                {!modelsLoaded && <p className="text-[10px] text-orange-500 mt-1">Cargando modelos inteligentes...</p>}
                            </div>
                        )}

                        {/* Estado: verificación exitosa ✅ */}
                        {faceVerified && verifyResult?.ok && !isCameraOpen && (
                            <div className="flex flex-col items-center gap-3">
                                <div className="w-full flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl p-3">
                                    <UserCheck size={24} className="text-green-600 flex-shrink-0" />
                                    <div>
                                        <p className="text-green-700 font-bold text-sm">✅ Identidad verificada</p>
                                        <p className="text-green-600 text-xs">Similitud: {verifyResult.confidence}% — El sistema podrá reconocer a este empleado correctamente.</p>
                                    </div>
                                </div>
                                <button type="button" onClick={() => {
                                    setFaceDescriptor(null); setFaceVerified(false);
                                    setVerifyResult(null); setVerifyAttempts(0); setError('');
                                    startCamera();
                                }} className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold bg-gray-100 text-gray-600 hover:bg-gray-200 transition">
                                    <Camera size={14} /> Repetir Foto
                                </button>
                            </div>
                        )}

                        {/* Estado: foto tomada, esperando lanzar verificación */}
                        {faceDescriptor && !faceVerified && !isCameraOpen && !verifyPhase && (
                            <div className="flex flex-col items-center gap-3 py-4">
                                <Loader2 size={32} className="animate-spin text-amber-500 drop-shadow-sm" />
                                <p className="text-sm text-amber-600 font-bold text-center">Procesando y abriendo verificación...</p>
                            </div>
                        )}

                        {/* Cámara abierta — Fase 1: Captura inicial */}
                        {isCameraOpen && !verifyPhase && (
                            <div className="flex flex-col items-center animate-fade-in w-full">
                                <div className="w-full bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 mb-3 text-center transition-all">
                                    <p className="text-xs text-blue-700 font-bold">📷 Paso 1 de 2 — Foto de Registro</p>
                                    <p className="text-[10px] text-gray-500 mt-0.5">Buena luz · De frente · Sin contraluz</p>
                                </div>
                                <div className="relative rounded-lg overflow-hidden border-4 border-blue-400 bg-black aspect-[3/4] w-full max-w-[200px] shadow-lg">
                                    <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover transform scale-x-[-1]" />
                                    <canvas ref={canvasRef} className="hidden" />
                                    {capturingFace && (
                                        <div className="absolute top-2 left-0 right-0 flex justify-center z-10 animate-pulse">
                                            <div className="bg-amber-500/90 text-white px-3 py-1.5 rounded-full backdrop-blur-md shadow-lg flex items-center gap-2">
                                                <Loader2 size={14} className="animate-spin" />
                                                <span className="text-[10px] font-bold">Mantén la mirada a la cámara...</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <div className="flex gap-3 mt-4">
                                    <button type="button" onClick={stopCamera} disabled={capturingFace}
                                        className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md text-xs font-bold hover:bg-gray-300 transition-colors disabled:opacity-50">
                                        Cancelar
                                    </button>
                                    <button type="button" onClick={captureFace} disabled={capturingFace}
                                        className="flex items-center justify-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-md text-xs font-bold shadow-md hover:bg-blue-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
                                        {capturingFace ? (
                                            <><Loader2 size={16} className="animate-spin" /> Procesando</>
                                        ) : (
                                            <><Camera size={16}/> Capturar Rostro</>
                                        )}
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Cámara abierta — Fase 2: Verificación */}
                        {isCameraOpen && verifyPhase && (
                            <div className="flex flex-col items-center animate-fade-in w-full">
                                <div className="w-full bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2 mb-3 text-center transition-all">
                                    <p className="text-xs text-indigo-700 font-bold">🔍 Paso 2 de 2 — Verificación de Identidad</p>
                                    <p className="text-[10px] text-gray-500 mt-0.5">Intento {verifyAttempts + 1} de {MAX_VERIFY_ATTEMPTS} · Mira a la cámara de frente</p>
                                </div>
                                <div className="relative rounded-lg overflow-hidden border-4 border-indigo-400 bg-black aspect-[3/4] w-full max-w-[200px] shadow-lg">
                                    <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover transform scale-x-[-1]" />
                                    <canvas ref={canvasRef} className="hidden" />
                                    {capturingFace && (
                                        <div className="absolute top-2 left-0 right-0 flex justify-center z-10 animate-pulse">
                                            <div className="bg-amber-500/90 text-white px-3 py-1.5 rounded-full backdrop-blur-md shadow-lg flex items-center gap-2">
                                                <Loader2 size={14} className="animate-spin" />
                                                <span className="text-[10px] font-bold">No te muevas, analizando...</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <div className="flex gap-3 mt-4">
                                    <button type="button" onClick={() => {
                                        stopCamera(); setVerifyPhase(false);
                                        setFaceDescriptor(null); setVerifyAttempts(0); setError('');
                                    }} disabled={capturingFace} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md text-xs font-bold hover:bg-gray-300 transition-colors disabled:opacity-50">
                                        Reiniciar Todo
                                    </button>
                                    <button type="button" onClick={verifyFace} disabled={capturingFace}
                                        className="flex items-center justify-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-md text-xs font-bold shadow-md hover:bg-indigo-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
                                        {capturingFace ? (
                                            <><Loader2 size={16} className="animate-spin" /> Verificando</>
                                        ) : (
                                            <><UserCheck size={16}/> Verificar Identidad</>
                                        )}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* ── Casillas de Aceptación de Políticas ── */}
                    <div className="flex flex-col gap-3 p-4 bg-gray-50 border border-gray-200 rounded-xl shadow-sm">
                        <label className={`flex items-start gap-3 ${policyAlreadyAccepted ? 'cursor-default opacity-80' : 'cursor-pointer group'}`}>
                            <input type="checkbox" checked={readPolicy} disabled={policyAlreadyAccepted} onChange={(e) => setReadPolicy(e.target.checked)} className={`mt-1 w-4 h-4 text-green-600 rounded border-gray-300 flex-shrink-0 transition-all ${policyAlreadyAccepted ? 'cursor-not-allowed opacity-70' : 'focus:ring-green-500 cursor-pointer'}`} />
                            <span className="text-[13px] font-medium text-gray-700 leading-snug">
                                Declaro haber leído la <button type="button" onClick={(e) => { e.preventDefault(); setShowPrivacyModal(true); }} className="text-blue-600 underline font-bold hover:bg-blue-50 px-1 py-0.5 rounded transition-colors break-words">Política de Tratamiento de Datos</button> e Información Sensible.
                            </span>
                        </label>
                        <label className={`flex items-start gap-3 ${policyAlreadyAccepted ? 'cursor-default opacity-80' : 'cursor-pointer group'}`}>
                            <input type="checkbox" checked={acceptPolicy} disabled={policyAlreadyAccepted} onChange={(e) => setAcceptPolicy(e.target.checked)} className={`mt-1 w-4 h-4 text-green-600 rounded border-gray-300 flex-shrink-0 transition-all ${policyAlreadyAccepted ? 'cursor-not-allowed opacity-70' : 'focus:ring-green-500 cursor-pointer'}`} />
                            <span className="text-[13px] font-medium text-gray-700 leading-snug">
                                Acepto libre y expresamente la recolección y tratamiento de los datos personales y biometría para el cumplimiento de los fines establecidos por la Empresa.
                            </span>
                        </label>
                    </div>

                    <button onClick={handleSubmit}
                        disabled={loading || blockCreation || (!isUpdating && !faceVerified) || !readPolicy || !acceptPolicy}
                        className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition duration-150 disabled:opacity-50 disabled:cursor-not-allowed">
                        {loading ? (isUpdating ? 'Actualizando...' : 'Creando...') : blockCreation ? 'Registro Bloqueado por Licencia' : (!isUpdating && !faceVerified) ? '🔍 Verificación Facial Requerida' : (!readPolicy || !acceptPolicy) ? 'Acepta las Políticas para Continuar' : (isUpdating ? 'Guardar Cambios' : 'Crear Cuenta')}
                    </button>

                </div>
            </div>

            {/* ── Overlay Modal de Privacidad para evitar salir de la PWA ── */}
            {showPrivacyModal && (
                <div className="fixed inset-0 z-[100] bg-[#0f172a] overflow-y-auto animate-fade-in">
                    <Privacidad isEmbedded={true} onClose={() => setShowPrivacyModal(false)} />
                </div>
            )}

            {/* ── Modal de Confirmación Maestra de Configuración (Para Edición) ── */}
            {showConfigPasswordModal && (
                <div className="fixed inset-0 z-[110] bg-black bg-opacity-60 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white p-6 rounded-2xl shadow-2xl max-w-sm w-full animate-fade-in">
                        <div className="flex items-center justify-center gap-3 text-amber-600 mb-4">
                            <AlertTriangle size={32} className="flex-shrink-0" />
                            <h3 className="text-lg font-bold flex-1 text-center pr-8">Autorización</h3>
                        </div>
                        <p className="text-sm text-gray-600 mb-4 text-center">Vas a actualizar a un empleado que ya existe en la base de datos. Por favor, ingresa la <b>Contraseña de Configuración</b> maestra para ejecutar la acción.</p>
                        
                        <input
                            type="password"
                            placeholder="Contraseña de Configuración..."
                            className="w-full px-3 py-3 border border-gray-300 rounded-lg mb-2 focus:ring-amber-500 focus:border-amber-500 font-bold tracking-widest text-center"
                            value={configPassword}
                            onChange={(e) => setConfigPassword(e.target.value)}
                        />
                        {configPasswordError && <p className="text-xs font-bold text-red-600 mb-4 text-center">{configPasswordError}</p>}
                        
                        <div className="mt-4 flex gap-3">
                            <button onClick={() => { setShowConfigPasswordModal(false); setConfigPasswordError(''); setConfigPassword(''); }} className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-bold hover:bg-gray-200 transition">Cancelar</button>
                            <button onClick={handleUpdateSubmit} disabled={loading} className="flex-1 py-2.5 bg-amber-500 text-white rounded-lg font-bold hover:bg-amber-600 transition flex justify-center items-center dropdown-shadow">
                                {loading ? <Loader2 size={18} className="animate-spin" /> : 'Confirmar Cambios'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
