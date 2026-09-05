import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Settings, Lock, Save, CheckSquare, Square, Loader2, LogIn, LogOut, TriangleAlert, KeyRound, Eye, EyeOff, ArrowLeft, FileText, Printer } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { doc, getDoc, setDoc, updateDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import CryptoJS from 'crypto-js';
import { fetchLicenseStatus, applyNewLicenseToken } from '../services/licenseService';

import { syncDatabaseWithStorage } from '../services/storageService';

// Helper: SHA-256 hash de la contraseña usando Web Crypto API
async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0')).join('');
}

// ─── Definición de todos los campos configurables ────────────────────────────
const FIELD_GROUPS = [
    {
        group: '1. Identificación Básica',
        fields: [
            { key: 'documentoIdentidad', label: 'Documento de identidad' },
            { key: 'fechaNacimiento', label: 'Fecha de nacimiento' },
            { key: 'fechaIngreso', label: 'Fecha de ingreso' },
            { key: 'infoBancaria', label: 'Información bancaria' },
            { key: 'licenciaConducir', label: 'Licencia de conducir' },
            { key: 'tallaUniforme', label: 'Talla de uniformes' },
            { key: 'tallaCalzado', label: 'Talla de calzado' },
            { key: 'alergias', label: 'Alergias / condiciones médicas' },
            { key: 'estadoCivil', label: 'Estado civil' },
            { key: 'hijos', label: 'Hijos y edades' },
            { key: 'grupoSanguineo', label: 'Grupo sanguíneo' },
            { key: 'eps', label: 'EPS' },
            { key: 'arl', label: 'ARL' },
        ],
    },
    {
        group: '2. Contacto y Ubicación',
        fields: [
            { key: 'direccion', label: 'Dirección de residencia' },
            { key: 'telefono', label: 'Teléfono personal' },
            { key: 'correoPersonal', label: 'Correo electrónico personal (≠ login)' },
            { key: 'contactoEmergencia', label: 'Contacto de emergencia' },
        ],
    },
    {
        group: '3. Formación y Perfil Profesional',
        fields: [
            { key: 'nivelEducativo', label: 'Nivel educativo' },
            { key: 'idiomas', label: 'Idiomas y nivel' },
        ],
    },
];

// Estado por defecto: todos desactivados para los campos de usuario, y defaults para storage
const DEFAULT_CONFIG = {
    ...Object.fromEntries(FIELD_GROUPS.flatMap(g => g.fields.map(f => [f.key, false]))),
    storage_saveAsistencia: true,
    storage_saveIncidentes: true,
    storage_saveRuta: true,
    storage_retentionAsistencia: 90,
    storage_retentionIncidentes: 540,
    storage_retentionRuta: 30,
    ruta_active: false,
    // defaults calculo tiempo
    calc_rounding: false,
    calc_roundingMins: 15,
    calc_lunch: false,
    calc_lunchMins: 60,
    calc_lunchMode: 'general',
    calc_dailyWorkdayConfig: {
        '1': { hours: 8, mins: 0 }, // Lunes
        '2': { hours: 8, mins: 0 }, // Martes
        '3': { hours: 8, mins: 0 }, // Miércoles
        '4': { hours: 8, mins: 0 }, // Jueves
        '5': { hours: 8, mins: 0 }, // Viernes
        '6': { hours: 0, mins: 0 }, // Sábado
        '7': { hours: 0, mins: 0 }, // Domingo
    },
    // defaults etiquetas botones
    ui_labelEntry: "Registrar Entrada",
    ui_labelExit: "Registrar Salida",
    ui_labelIncident: "Reportar Novedad",
    // defaults seguridad
    security_liveness: true,
    security_faceRecognition: true,
    security_faceThreshold: 0.63,
    // camara para modo visitas
    ruta_camera_facing: 'environment',
};

export default function Configuracion() {
    const [config, setConfig] = useState(DEFAULT_CONFIG);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [savedOk, setSavedOk] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [syncProgress, setSyncProgress] = useState(null);
    const [licenseStatus, setLicenseStatus] = useState(null);
    const [licenseInput, setLicenseInput] = useState('');
    const [savingLicense, setSavingLicense] = useState(false);
    const [licenseError, setLicenseError] = useState('');
    // Estado para protección de contraseña del Modo Visitas
    const [rutaPassword, setRutaPassword] = useState('');
    const [rutaPasswordError, setRutaPasswordError] = useState('');
    const [rutaToken, setRutaToken] = useState(null); // hash almacenado en Firestore
    const [rutaPasswordVisible, setRutaPasswordVisible] = useState(false);
    const [savingRuta, setSavingRuta] = useState(false);

    // Estados para la generación de Certificados de Habeas Data
    const [certificateEmail, setCertificateEmail] = useState('');
    const [generateAllEmployees, setGenerateAllEmployees] = useState(false);
    const [generatingPDF, setGeneratingPDF] = useState(false);
    const [pdfError, setPdfError] = useState('');
    const [printEmployees, setPrintEmployees] = useState([]);

    const navigate = useNavigate();
    const { adminAccess } = useAuth();

    useEffect(() => {
        if (!adminAccess['/configuracion']) {
            navigate('/login');
            return;
        }
        loadConfig();
    }, [adminAccess, navigate]);

    const loadConfig = async () => {
        try {
            const snap = await getDoc(doc(db, 'settings', 'employeeFields'));
            if (snap.exists()) {
                const data = snap.data();
                setConfig(prev => ({ ...prev, ...data }));
                setRutaToken(data.ruta_token || null); // cargar el token de contraseña
            } else {
                await setDoc(doc(db, 'settings', 'employeeFields'), DEFAULT_CONFIG);
            }

            // Cargar estado de la Licencia
            const licData = await fetchLicenseStatus();
            setLicenseStatus(licData);

        } catch (err) {
            console.error('Error cargando configuración:', err);
        } finally {
            setLoading(false);
        }
    };

    const toggle = (key) => {
        setConfig(prev => ({ ...prev, [key]: !prev[key] }));
        setSavedOk(false);
    };

    const handleTextChange = (key, value) => {
        setConfig(prev => ({ ...prev, [key]: value }));
        setSavedOk(false);
    };

    const handleNumberChange = (key, value, maxVal = 730, minVal = 1) => {
        const val = parseInt(value, 10);
        setConfig(prev => ({ ...prev, [key]: isNaN(val) ? minVal : val > maxVal ? maxVal : val < minVal ? minVal : val }));
        setSavedOk(false);
    };

    const handleFloatChange = (key, value, maxVal = 1.0, minVal = 0.0) => {
        const val = parseFloat(value);
        setConfig(prev => ({ ...prev, [key]: isNaN(val) ? minVal : val > maxVal ? maxVal : val < minVal ? minVal : val }));
        setSavedOk(false);
    };

    const handleDailyWorkdayChange = (day, field, value) => {
        const val = parseInt(value, 10);
        const maxVal = field === 'hours' ? 24 : 59;
        const finalVal = isNaN(val) ? 0 : val > maxVal ? maxVal : val < 0 ? 0 : val;
        
        setConfig(prev => ({
            ...prev,
            calc_dailyWorkdayConfig: {
                ...(prev.calc_dailyWorkdayConfig || DEFAULT_CONFIG.calc_dailyWorkdayConfig),
                [day]: {
                    ...(prev.calc_dailyWorkdayConfig?.[day] || { hours: 0, mins: 0 }),
                    [field]: finalVal
                }
            }
        }));
        setSavedOk(false);
    };

    const saveConfig = async () => {
        setSaving(true);
        try {
            // Excluir ruta_token del objeto de config normal (se guarda por separado)
            const { ruta_token, ...configToSave } = config;
            await setDoc(doc(db, 'settings', 'employeeFields'), { ...configToSave, ruta_token: rutaToken });
            setSavedOk(true);
            setTimeout(() => setSavedOk(false), 3000);
        } catch (err) {
            console.error('Error guardando configuración:', err);
            alert('Error al guardar. Inténtalo de nuevo.');
        } finally {
            setSaving(false);
        }
    };

    // Activar modo con contraseña maestra (solo primera vez o si el token fue borrado)
    const handleRutaActivation = async () => {
        setRutaPasswordError('');
        if (!rutaPassword.trim()) {
            setRutaPasswordError('Debes ingresar la contraseña de acceso.');
            return;
        }
        setSavingRuta(true);
        try {
            const hash = await hashPassword(rutaPassword.trim());
            const masterHash = import.meta.env.VITE_RUTA_ACCESS_HASH;

            if (hash === masterHash) {
                // Contraseña correcta: guardar token en Firestore y activar
                await updateDoc(doc(db, 'settings', 'employeeFields'), {
                    ruta_token: hash,
                    ruta_active: true
                });
                setRutaToken(hash);
                setConfig(prev => ({ ...prev, ruta_active: true }));
                setRutaPassword('');
            } else {
                setRutaPasswordError('❌ Contraseña incorrecta. Contacta al administrador.');
            }
        } catch (err) {
            console.error('Error activando Modo Ruta:', err);
            setRutaPasswordError('Error al verificar. Inténtalo de nuevo.');
        } finally {
            setSavingRuta(false);
        }
    };

    // Con token presente: activar sin contraseña
    const handleRutaToggle = async (activate) => {
        try {
            await updateDoc(doc(db, 'settings', 'employeeFields'), { ruta_active: activate });
            setConfig(prev => ({ ...prev, ruta_active: activate }));
            setRutaPassword('');
            setRutaPasswordError('');
        } catch (err) {
            console.error('Error cambiando estado Modo Ruta:', err);
        }
    };

    const handleUpdateLicense = async () => {
        if (!licenseInput.trim()) return;
        setSavingLicense(true);
        setLicenseError('');
        try {
            const result = await applyNewLicenseToken(licenseInput);
            setLicenseStatus({ rawToken: licenseInput, decoded: result });
            setLicenseInput('');
            alert("Licencia actualizada exitosamente.");
        } catch (error) {
            setLicenseError(error.message || "Token inválido.");
        } finally {
            setSavingLicense(false);
        }
    };

    const handleSyncDatabase = async () => {
        if (!window.confirm("Esta operación revisará todos los registros en la base de datos y borrará aquellos cuya foto haya sido eliminada de Storage (por ejemplo, borrado manual). Puede tardar unos minutos dependiendo de la cantidad de fotos.\n\n¿Deseas continuar?")) return;
        
        setSyncing(true);
        setSyncProgress({ checked: 0, total: 0, deleted: 0 });
        try {
            const result = await syncDatabaseWithStorage((checked, total, deleted) => {
                setSyncProgress({ checked, total, deleted });
            });
            alert(`Sincronización completada.\n\n- Registros revisados: ${result.total}\n- Registros eliminados (huérfanos): ${result.deleted}`);
        } catch (err) {
            alert("Error durante la sincronización: " + err.message);
        } finally {
            setSyncing(false);
            setSyncProgress(null);
        }
    };

    // Generar firma digital inalterable
    const generateVerificationHash = (email, dateStr) => {
        const secret = "ControlFaceSecureAcceptanceSalt";
        return CryptoJS.SHA256(`${email}-${dateStr || ''}-${secret}`).toString(CryptoJS.enc.Hex).toUpperCase();
    };

    const handleGenerateCertificatePDF = async () => {
        setPdfError('');
        setGeneratingPDF(true);
        setPrintEmployees([]);

        try {
            if (generateAllEmployees) {
                // Generar para todos los empleados registrados que hayan aceptado
                const snapshot = await getDocs(collection(db, 'employees'));

                const emps = [];
                snapshot.forEach(d => {
                    const data = d.data();
                    const acepta = data.aceptaPoliticaDatos || data.extraFields?.aceptaPoliticaDatos;
                    if (acepta === true) {
                        emps.push({ id: d.id, ...data });
                    }
                });

                if (emps.length === 0) {
                    throw new Error("No se encontraron empleados que hayan aceptado la política de tratamiento de datos.");
                }
                
                // Ordenar por nombres
                emps.sort((a, b) => {
                    const nameA = `${a.firstName || a.extraFields?.firstName || ''} ${a.lastName || a.extraFields?.lastName || ''}`.toLowerCase();
                    const nameB = `${b.firstName || b.extraFields?.firstName || ''} ${b.lastName || b.extraFields?.lastName || ''}`.toLowerCase();
                    return nameA.localeCompare(nameB);
                });

                setPrintEmployees(emps);
            } else {
                // Generar para un empleado específico
                if (!certificateEmail.trim()) {
                    throw new Error("Por favor, ingresa el correo o ID del empleado.");
                }

                let emailToUse = certificateEmail.trim();
                if (!emailToUse.includes('@')) {
                    emailToUse = `${emailToUse}@usuario.com`;
                }
                emailToUse = emailToUse.toLowerCase().trim();

                const q = query(
                    collection(db, 'employees'),
                    where('email', '==', emailToUse)
                );
                const snapshot = await getDocs(q);

                if (snapshot.empty) {
                    throw new Error(`No se encontró ningún empleado registrado con el correo "${emailToUse}".`);
                }

                const docData = snapshot.docs[0].data();
                const id = snapshot.docs[0].id;
                
                const acepta = docData.aceptaPoliticaDatos || docData.extraFields?.aceptaPoliticaDatos;
                if (!acepta) {
                    throw new Error(`El empleado "${emailToUse}" aún no ha aceptado la política de tratamiento de datos.`);
                }

                setPrintEmployees([{ id, ...docData }]);
            }
        } catch (err) {
            console.error("Error al generar soporte PDF:", err);
            setPdfError(err.message || "Error al buscar datos de empleados.");
            setGeneratingPDF(false);
        }
    };

    useEffect(() => {
        if (printEmployees.length > 0 && generatingPDF) {
            const timer = setTimeout(() => {
                window.print();
                setGeneratingPDF(false);
                setPrintEmployees([]);
            }, 800);
            return () => clearTimeout(timer);
        }
    }, [printEmployees, generatingPDF]);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-[#3C7DA6] to-[#6FAF6B]">
                <Loader2 size={40} className="text-purple-600 animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-b from-[#3C7DA6] to-[#6FAF6B] p-6">
            <div className="max-w-3xl mx-auto">
                {/* Header */}
                <div className="flex justify-between items-center mb-8">
                    <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-2">
                        <Settings size={30} className="text-purple-600" />
                        Configuración
                        <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-mono ml-2 border border-gray-200">v{import.meta.env.VITE_APP_VERSION}</span>
                    </h1>
                    <div className="flex gap-3">
                        <button
                            onClick={() => navigate('/cambiar-clave-admin')}
                            className="px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 font-bold transition flex items-center gap-2"
                        >
                            <Lock size={18} />
                            Cambiar Contraseña
                        </button>
                        <button
                            onClick={() => navigate('/login')}
                            className="px-6 py-2.5 bg-white text-gray-800 font-bold flex items-center gap-2 rounded-xl border border-gray-100 shadow-lg hover:bg-gray-50 transition whitespace-nowrap"
                        >
                            <ArrowLeft size={20} /> Volver
                        </button>
                    </div>
                </div>

                {/* ─── GESTIÓN DE LICENCIA ─── */}
                <div className="bg-white rounded-xl shadow-2xl p-6 mb-6 border-l-4 border-indigo-500">
                    <h2 className="text-xl font-bold text-indigo-800 mb-2">Estado de la Licencia</h2>
                    <p className="text-sm text-gray-600 mb-4">
                        Información de su plan contratado y método para actualizar la suscripción.
                    </p>

                    {licenseStatus && licenseStatus.decoded ? (
                        <div className={`p-4 rounded-xl border mb-4 text-sm ${licenseStatus.decoded.isExpired ? 'bg-red-50 border-red-200 text-red-800' : 'bg-emerald-50 border-emerald-200 text-emerald-800'}`}>
                            {licenseStatus.decoded.isExpired && <p className="font-bold text-red-600 mb-2 flex items-center gap-2">⚠️ SU LICENCIA HA EXPIRADO</p>}
                            <div className="grid grid-cols-2 gap-2">
                                <div><b className="opacity-70">Límite contratado:</b> {licenseStatus.decoded.maxEmployees} <span className="text-xs opacity-60">(+{licenseStatus.decoded.bufferPercentage}% de cortesía)</span></div>
                                <div><b className="opacity-70">Válida hasta:</b> {licenseStatus.decoded.expirationDate}</div>
                                <div className="col-span-2 mt-2 pt-2 border-t border-black border-opacity-10">
                                    <b className="opacity-70">Proveedor de Software:</b> {licenseStatus.decoded.providerName} <br />
                                    <b className="opacity-70">Contacto (Soporte/Renovación):</b> {licenseStatus.decoded.providerPhone}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="p-4 bg-yellow-50 text-yellow-800 rounded-xl border border-yellow-200 mb-4 text-sm">
                            ⚠️ No hay una licencia válida o el código está corrupto. Contacte a su proveedor.
                        </div>
                    )}

                    <div className="mt-4">
                        <label className="block text-xs font-bold text-indigo-800 opacity-80 mb-1">Cargar nuevo código de licencia</label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={licenseInput}
                                onChange={(e) => setLicenseInput(e.target.value)}
                                placeholder="Pegue el código cifrado aquí..."
                                className="flex-1 px-3 py-2 border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-500 font-mono text-xs"
                            />
                            <button
                                onClick={handleUpdateLicense}
                                disabled={savingLicense || !licenseInput}
                                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition text-sm font-bold flex items-center gap-2"
                            >
                                {savingLicense ? <Loader2 size={16} className="animate-spin" /> : 'Activar Código'}
                            </button>
                        </div>
                        {licenseError && <p className="text-red-500 text-xs mt-1">{licenseError}</p>}
                    </div>
                </div>

                {/* ─── GESTIÓN DE MODOS Y FUNCIONALIDADES ─── */}
                <div className="bg-white rounded-xl shadow-2xl p-6 mb-6 border-l-4 border-rose-500">
                    <h2 className="text-xl font-bold text-rose-800 mb-2">Modos Adicionales</h2>
                    <p className="text-sm text-gray-600 mb-4">
                        Activa o desactiva funcionalidades avanzadas para los empleados en la aplicación.
                    </p>
                    <div className="space-y-3 bg-rose-50 p-4 rounded-xl border border-rose-100">
                        {!rutaToken ? (
                            // SIN TOKEN: Modo bloqueado, pedir contraseña maestra
                            <div className="flex flex-col gap-3">
                                <div className="flex items-center gap-2 px-4 py-3 rounded-lg border-2 border-gray-300 bg-gray-100 opacity-60">
                                    <Square size={20} />
                                    <span className="font-medium text-gray-400 text-sm">Habilitar "Modo Visitas a Clientes"</span>
                                </div>
                                <div className="flex flex-col gap-1">
                                    <label className="text-xs font-bold text-rose-800 flex items-center gap-1">
                                        <KeyRound size={13} /> Contraseña de acceso requerida
                                    </label>
                                    <div className="flex gap-2">
                                        <div className="relative flex-1">
                                            <input
                                                type={rutaPasswordVisible ? 'text' : 'password'}
                                                value={rutaPassword}
                                                onChange={e => { setRutaPassword(e.target.value); setRutaPasswordError(''); }}
                                                onKeyDown={e => e.key === 'Enter' && handleRutaActivation()}
                                                placeholder="Ingresa la contraseña..."
                                                className="w-full px-3 py-2 border border-rose-200 rounded-lg focus:ring-2 focus:ring-rose-400 text-sm pr-10"
                                            />
                                            <button type="button"
                                                onClick={() => setRutaPasswordVisible(v => !v)}
                                                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                            >
                                                {rutaPasswordVisible ? <EyeOff size={16} /> : <Eye size={16} />}
                                            </button>
                                        </div>
                                        <button
                                            onClick={handleRutaActivation}
                                            disabled={savingRuta || !rutaPassword.trim()}
                                            className="px-4 py-2 bg-rose-600 text-white text-sm font-bold rounded-lg hover:bg-rose-700 disabled:opacity-50 transition flex items-center gap-1"
                                        >
                                            {savingRuta ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}
                                            Desbloquear
                                        </button>
                                    </div>
                                    {rutaPasswordError && <p className="text-red-600 text-xs font-medium">{rutaPasswordError}</p>}
                                    <p className="text-xs text-gray-500 mt-1">Este modo requiere autorización. Contacta al administrador para obtener acceso.</p>
                                </div>
                            </div>
                        ) : config.ruta_active ? (
                            // CON TOKEN + ACTIVO: mostrar desactivar
                            <div className="flex flex-col gap-2">
                                <div className="flex items-center gap-2 px-4 py-3 rounded-lg border-2 border-rose-500 bg-white">
                                    <CheckSquare size={20} className="text-rose-600" />
                                    <span className="font-medium text-rose-800 text-sm">Habilitar "Modo Visitas a Clientes"</span>
                                </div>
                                <button
                                    onClick={() => handleRutaToggle(false)}
                                    className="w-full py-2 text-sm font-bold text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 border border-gray-300 transition"
                                >
                                    Desactivar modo
                                </button>
                            </div>
                        ) : (
                            // CON TOKEN + INACTIVO: activar directamente sin contraseña
                            <div className="flex flex-col gap-2">
                                <div className="flex items-center gap-2 px-4 py-3 rounded-lg border-2 border-gray-300 bg-gray-100 opacity-60">
                                    <Square size={20} />
                                    <span className="font-medium text-gray-400 text-sm">Habilitar "Modo Visitas a Clientes"</span>
                                </div>
                                <button
                                    onClick={() => handleRutaToggle(true)}
                                    className="w-full py-2 text-sm font-bold text-white bg-rose-600 rounded-lg hover:bg-rose-700 transition"
                                >
                                    Activar modo
                                </button>
                            </div>
                        )}
                        <p className="text-xs text-rose-700 opacity-80 leading-tight mt-1">
                            Si está activo, los empleados que ya estén en turno verán un botón para registrar operaciones fuera de la base en clientes.
                        </p>
                    </div>
                </div>

                {/* ─── GESTIÓN DE ALMACENAMIENTO DE FOTOS ─── */}
                <div className="bg-white rounded-xl shadow-2xl p-6 mb-6 border-l-4 border-blue-500">
                    <h2 className="text-xl font-bold text-blue-800 mb-2">Almacenamiento de Evidencias (Fotos)</h2>
                    <p className="text-sm text-gray-600 mb-4">
                        Configura si el sistema guardará de forma permanente las fotos al momento de entrar o si solo verificará el rostro sin guardar archivos pesados. Además, define el tiempo (en días) antes de que se borren y eliminen permanentemente.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* ASISTENCIA */}
                        <div className="space-y-3 bg-blue-50 p-4 rounded-xl border border-blue-100">
                            <h3 className="font-bold text-blue-700">Modo Asistencia</h3>
                            <button
                                onClick={() => toggle('storage_saveAsistencia')}
                                className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border-2 text-left transition font-medium text-sm
                                    ${config.storage_saveAsistencia !== false
                                        ? 'border-blue-500 bg-white text-blue-800'
                                        : 'border-gray-300 bg-gray-100 text-gray-400 opacity-60'}`}
                            >
                                <span className="flex items-center gap-2">
                                    {config.storage_saveAsistencia !== false
                                        ? <CheckSquare size={20} className="text-blue-600" />
                                        : <Square size={20} />}
                                    Guardar fotos asistencia
                                </span>
                            </button>

                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-bold text-blue-800 opacity-80">Días de retención</label>
                                <input
                                    type="number"
                                    min="1" max="730"
                                    disabled={config.storage_saveAsistencia === false}
                                    value={config.storage_retentionAsistencia ?? 3}
                                    onChange={(e) => handleNumberChange('storage_retentionAsistencia', e.target.value)}
                                    className="px-3 py-2 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-200 disabled:opacity-50"
                                />
                            </div>
                        </div>

                        {/* INCIDENTES */}
                        <div className="space-y-3 bg-orange-50 p-4 rounded-xl border border-orange-100">
                            <h3 className="font-bold text-orange-700">Modo Incidentes</h3>
                            <button
                                onClick={() => toggle('storage_saveIncidentes')}
                                className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border-2 text-left transition font-medium text-sm
                                    ${config.storage_saveIncidentes !== false
                                        ? 'border-orange-500 bg-white text-orange-800'
                                        : 'border-gray-300 bg-gray-100 text-gray-400 opacity-60'}`}
                            >
                                <span className="flex items-center gap-2">
                                    {config.storage_saveIncidentes !== false
                                        ? <CheckSquare size={20} className="text-orange-600" />
                                        : <Square size={20} />}
                                    Guardar fotos incidentes
                                </span>
                            </button>

                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-bold text-orange-800 opacity-80">Días de retención</label>
                                <input
                                    type="number"
                                    min="1" max="730"
                                    disabled={config.storage_saveIncidentes === false}
                                    value={config.storage_retentionIncidentes ?? 18}
                                    onChange={(e) => handleNumberChange('storage_retentionIncidentes', e.target.value)}
                                    className="px-3 py-2 border border-orange-200 rounded-lg focus:ring-2 focus:ring-orange-500 disabled:bg-gray-200 disabled:opacity-50"
                                />
                            </div>
                        </div>

                        {/* VISITAS */}
                        <div className="space-y-3 bg-rose-50 p-4 rounded-xl border border-rose-100">
                            <h3 className="font-bold text-rose-700">Modo Visitas</h3>
                            <button
                                onClick={() => toggle('storage_saveRuta')}
                                className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border-2 text-left transition font-medium text-sm
                                    ${config.storage_saveRuta !== false
                                        ? 'border-rose-500 bg-white text-rose-800'
                                        : 'border-gray-300 bg-gray-100 text-gray-400 opacity-60'}`}
                            >
                                <span className="flex items-center gap-2">
                                    {config.storage_saveRuta !== false
                                        ? <CheckSquare size={20} className="text-rose-600" />
                                        : <Square size={20} />}
                                    Guardar fotos visitas
                                </span>
                            </button>

                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-bold text-rose-800 opacity-80">Días de retención</label>
                                <input
                                    type="number"
                                    min="1" max="730"
                                    disabled={config.storage_saveRuta === false}
                                    value={config.storage_retentionRuta ?? 30}
                                    onChange={(e) => handleNumberChange('storage_retentionRuta', e.target.value)}
                                    className="px-3 py-2 border border-rose-200 rounded-lg focus:ring-2 focus:ring-rose-500 disabled:bg-gray-200 disabled:opacity-50"
                                />
                            </div>
                        </div>
                    </div>

                    {/* SINCRONIZACIÓN MANUAL */}
                    <div className="mt-6 pt-6 border-t border-blue-100">
                        <h3 className="font-bold text-blue-700 mb-2">Limpieza Manual de Base de Datos</h3>
                        <p className="text-xs text-gray-600 mb-4">Si borraste fotos manualmente directamente desde la consola de Firebase Storage, usa esta herramienta para limpiar los registros "fantasma" que quedaron en la base de datos.</p>
                        
                        {syncing ? (
                            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg flex flex-col gap-2">
                                <div className="flex justify-between text-xs font-bold text-blue-800">
                                    <span>Revisando fotos para sincronizar...</span>
                                    <span>{syncProgress?.checked || 0} / {syncProgress?.total || 0}</span>
                                </div>
                                <div className="w-full bg-blue-200 rounded-full h-2.5 overflow-hidden">
                                    <div 
                                        className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" 
                                        style={{ width: `${syncProgress?.total ? Math.round((syncProgress.checked / syncProgress.total) * 100) : 0}%` }}
                                    ></div>
                                </div>
                                <div className="text-[11px] text-blue-700 flex justify-between font-medium">
                                    <span>No cierre esta ventana</span>
                                    {syncProgress?.deleted > 0 && <span className="text-red-600">Archivos fantasma encontrados y borrados: {syncProgress?.deleted}</span>}
                                </div>
                            </div>
                        ) : (
                            <button
                                onClick={handleSyncDatabase}
                                className="px-5 py-2.5 bg-white border-2 border-blue-500 text-blue-600 font-bold rounded-lg hover:bg-blue-50 transition text-sm flex items-center gap-2"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21v-5h5"/></svg>
                                Limpiar Registros Fantasma
                            </button>
                        )}
                    </div>
                </div>

                {/* ─── GESTIÓN DE CÁLCULO DE HORAS ─── */}
                <div className="bg-white rounded-xl shadow-2xl p-6 mb-6 border-l-4 border-teal-500">
                    <h2 className="text-xl font-bold text-teal-800 mb-2">Cálculo de Tiempo Laborado</h2>
                    <p className="text-sm text-gray-600 mb-4">
                        Configura la duración del turno, el redondeo de entradas/salidas y el descuento automático de tiempo de almuerzo aplicable únicamente a turnos completos.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* JORNADA LABORAL FLEXIBLE */}
                        <div className="col-span-1 md:col-span-3 space-y-3 bg-fuchsia-50 p-4 rounded-xl border border-fuchsia-100">
                            <h3 className="font-bold text-fuchsia-700 flex items-center gap-2">
                                <CheckSquare size={20} className="text-fuchsia-600" />
                                Jornada Laboral por Día de la Semana
                            </h3>
                            <p className="text-xs text-fuchsia-700 opacity-80 leading-tight mb-4">
                                Define cuántas horas y minutos debe trabajar el empleado cada día. Los turnos nocturnos se dividirán automáticamente a la medianoche y se compararán contra estos valores.
                            </p>
                            
                            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-4">
                                {[
                                    { id: '1', label: 'Lunes' },
                                    { id: '2', label: 'Martes' },
                                    { id: '3', label: 'Miércoles' },
                                    { id: '4', label: 'Jueves' },
                                    { id: '5', label: 'Viernes' },
                                    { id: '6', label: 'Sábado' },
                                    { id: '7', label: 'Domingo' }
                                ].map(day => (
                                    <div key={day.id} className="bg-white p-3 rounded-lg border border-fuchsia-200 shadow-sm">
                                        <label className="block text-[10px] font-black text-fuchsia-800 uppercase mb-2 text-center">{day.label}</label>
                                        <div className="flex flex-col gap-2">
                                            <div className="flex items-center gap-1">
                                                <input
                                                    type="number"
                                                    min="0" max="24"
                                                    value={config.calc_dailyWorkdayConfig?.[day.id]?.hours ?? 0}
                                                    onChange={(e) => handleDailyWorkdayChange(day.id, 'hours', e.target.value)}
                                                    className="w-full px-1 py-1 text-center border border-fuchsia-100 rounded bg-fuchsia-50/30 text-sm font-bold focus:ring-1 focus:ring-fuchsia-400"
                                                />
                                                <span className="text-[10px] text-fuchsia-400">h</span>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <input
                                                    type="number"
                                                    min="0" max="59"
                                                    value={config.calc_dailyWorkdayConfig?.[day.id]?.mins ?? 0}
                                                    onChange={(e) => handleDailyWorkdayChange(day.id, 'mins', e.target.value)}
                                                    className="w-full px-1 py-1 text-center border border-fuchsia-100 rounded bg-fuchsia-50/30 text-sm font-bold focus:ring-1 focus:ring-fuchsia-400"
                                                />
                                                <span className="text-[10px] text-fuchsia-400">m</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* REDONDEO */}
                        <div className="space-y-3 bg-teal-50 p-4 rounded-xl border border-teal-100">
                            <h3 className="font-bold text-teal-700">Redondeo de Horas</h3>
                            <button
                                onClick={() => toggle('calc_rounding')}
                                className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border-2 text-left transition font-medium text-sm
                                    ${config.calc_rounding !== false
                                        ? 'border-teal-500 bg-white text-teal-800'
                                        : 'border-gray-300 bg-gray-100 text-gray-400 opacity-60'}`}
                            >
                                <span className="flex items-center gap-2">
                                    {config.calc_rounding !== false ? <CheckSquare size={20} className="text-teal-600" /> : <Square size={20} />}
                                    Activar redondeo cercano
                                </span>
                            </button>
                            <p className="text-xs text-teal-700 opacity-80 leading-tight">Ejemplo: si es 15min, ingresar a las 07:58 se redondeará automáticamente a las 08:00 para el reporte detallado.</p>
                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-bold text-teal-800 opacity-80">Fracción en Minutos</label>
                                <input
                                    type="number"
                                    min="1" max="60"
                                    disabled={config.calc_rounding === false}
                                    value={config.calc_roundingMins ?? 15}
                                    onChange={(e) => handleNumberChange('calc_roundingMins', e.target.value)}
                                    className="px-3 py-2 border border-teal-200 rounded-lg focus:ring-2 focus:ring-teal-500 disabled:bg-gray-200 disabled:opacity-50"
                                />
                            </div>
                        </div>

                        {/* ALMUERZO */}
                        <div className="space-y-3 bg-indigo-50 p-4 rounded-xl border border-indigo-100">
                            <h3 className="font-bold text-indigo-700">Descuento de Almuerzo</h3>
                            
                            <div className="grid grid-cols-1 gap-2">
                                <button
                                    onClick={() => {
                                        setConfig(prev => ({
                                            ...prev,
                                            calc_lunch: true,
                                            calc_lunchMode: 'general'
                                        }));
                                    }}
                                    className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border-2 text-left transition font-medium text-sm
                                        ${config.calc_lunch && config.calc_lunchMode !== 'individual' && config.calc_lunchMode !== 'empresa'
                                            ? 'border-indigo-500 bg-white text-indigo-800'
                                            : 'border-gray-300 bg-gray-100 text-gray-400 opacity-60'}`}
                                >
                                    <span className="flex items-center gap-2">
                                        {config.calc_lunch && config.calc_lunchMode !== 'individual' && config.calc_lunchMode !== 'empresa' ? <CheckSquare size={20} className="text-indigo-600" /> : <Square size={20} />}
                                        Descuento Generalizado (Automático)
                                    </span>
                                </button>

                                <button
                                    onClick={() => {
                                        setConfig(prev => ({
                                            ...prev,
                                            calc_lunch: true,
                                            calc_lunchMode: 'individual'
                                        }));
                                    }}
                                    className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border-2 text-left transition font-medium text-sm
                                        ${config.calc_lunch && config.calc_lunchMode === 'individual'
                                            ? 'border-indigo-500 bg-white text-indigo-800'
                                            : 'border-gray-300 bg-gray-100 text-gray-400 opacity-60'}`}
                                >
                                    <span className="flex items-center gap-2">
                                        {config.calc_lunch && config.calc_lunchMode === 'individual' ? <CheckSquare size={20} className="text-indigo-600" /> : <Square size={20} />}
                                        Descuento Individual (El empleado elige)
                                    </span>
                                </button>

                                <button
                                    onClick={() => {
                                        setConfig(prev => ({
                                            ...prev,
                                            calc_lunch: true,
                                            calc_lunchMode: 'empresa'
                                        }));
                                    }}
                                    className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border-2 text-left transition font-medium text-sm
                                        ${config.calc_lunch && config.calc_lunchMode === 'empresa'
                                            ? 'border-indigo-500 bg-white text-indigo-800'
                                            : 'border-gray-300 bg-gray-100 text-gray-400 opacity-60'}`}
                                >
                                    <span className="flex items-center gap-2">
                                        {config.calc_lunch && config.calc_lunchMode === 'empresa' ? <CheckSquare size={20} className="text-indigo-600" /> : <Square size={20} />}
                                        Control Empresa (Solo el admin marca)
                                    </span>
                                </button>

                                <button
                                    onClick={() => {
                                        setConfig(prev => ({
                                            ...prev,
                                            calc_lunch: false
                                        }));
                                    }}
                                    className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border-2 text-left transition font-medium text-sm
                                        ${!config.calc_lunch
                                            ? 'border-red-400 bg-white text-red-800'
                                            : 'border-gray-300 bg-gray-100 text-gray-400 opacity-60'}`}
                                >
                                    <span className="flex items-center gap-2">
                                        {!config.calc_lunch ? <CheckSquare size={20} className="text-red-600" /> : <Square size={20} />}
                                        Desactivar Descuento
                                    </span>
                                </button>
                            </div>

                            <p className="text-xs text-indigo-700 opacity-80 leading-tight">
                                {config.calc_lunchMode === 'individual'
                                    ? 'El empleado verá una opción al salir para decidir si se descuenta el tiempo.'
                                    : config.calc_lunchMode === 'empresa'
                                        ? 'El admin marca el descuento desde la vista En Vivo con contraseña. El empleado no ve ninguna opción.'
                                        : 'Solo aplicará si el empleado registra un tiempo laborado que iguale o supere la Jornada Laboral configurada.'}
                            </p>
                            
                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-bold text-indigo-800 opacity-80">Tiempo a descontar (Minutos)</label>
                                <input
                                    type="number"
                                    min="1" max="180"
                                    disabled={!config.calc_lunch}
                                    value={config.calc_lunchMins ?? 60}
                                    onChange={(e) => handleNumberChange('calc_lunchMins', e.target.value, 180)}
                                    className="px-3 py-2 border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-200 disabled:opacity-50"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* ─── GESTIÓN DE SEGURIDAD ─── */}
                <div className="bg-white rounded-xl shadow-2xl p-6 mb-6 border-l-4 border-emerald-500">
                    <h2 className="text-xl font-bold text-emerald-800 mb-2">Seguridad y Validaciones</h2>
                    <p className="text-sm text-gray-600 mb-4">
                        Configura las opciones de seguridad al momento de registrar asistencia.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* FACE RECOGNITION THRESHOLD */}
                        <div className="col-span-1 md:col-span-2 space-y-3 bg-blue-50 p-4 rounded-xl border border-blue-100">
                            <h3 className="font-bold text-blue-700">Sensibilidad del Reconocimiento Facial</h3>
                            <p className="text-sm text-blue-800 opacity-90 mb-2">
                                Ajusta qué tan rigurosa es la comparación del rostro actual contra la foto registrada. <br />
                                <span className="font-bold">Valor actual: {config.security_faceThreshold ?? 0.63}</span>
                            </p>

                            <input
                                type="range"
                                min="0.40"
                                max="0.80"
                                step="0.01"
                                value={config.security_faceThreshold ?? 0.63}
                                onChange={(e) => handleFloatChange('security_faceThreshold', e.target.value, 0.80, 0.40)}
                                className="w-full h-2 bg-blue-200 rounded-lg appearance-none cursor-pointer"
                            />

                            <div className="flex justify-between text-xs text-blue-600 font-bold mt-1">
                                <span>0.40 (Más estricto)</span>
                                <span>0.60</span>
                                <span>0.80 (Menos estricto)</span>
                            </div>

                            <div className="mt-2 p-3 rounded-xl text-sm transition-colors duration-300 border" style={{
                                backgroundColor: (config.security_faceThreshold ?? 0.63) < 0.56 ? '#fef2f2' : (config.security_faceThreshold ?? 0.63) <= 0.68 ? '#fdf8e6' : '#fef2f2',
                                color: (config.security_faceThreshold ?? 0.63) < 0.56 ? '#991b1b' : (config.security_faceThreshold ?? 0.63) <= 0.68 ? '#854d0e' : '#991b1b',
                                borderColor: (config.security_faceThreshold ?? 0.63) < 0.56 ? '#fecaca' : (config.security_faceThreshold ?? 0.63) <= 0.68 ? '#fef08a' : '#fecaca'
                            }}>
                                {(config.security_faceThreshold ?? 0.63) < 0.56 && <b>🔴 MUY ESTRICTO:</b>}
                                {(config.security_faceThreshold ?? 0.63) >= 0.56 && (config.security_faceThreshold ?? 0.63) <= 0.68 && <b>🟡 EQUILIBRADO (Recomendado):</b>}
                                {(config.security_faceThreshold ?? 0.63) > 0.68 && <b>🔴 PERMISIVO:</b>}

                                {(config.security_faceThreshold ?? 0.63) < 0.56 && " Solo aceptará coincidencias casi perfectas (buena luz, mismo ángulo). Puede generar rechazos falsos constantemente."}
                                {(config.security_faceThreshold ?? 0.63) >= 0.56 && (config.security_faceThreshold ?? 0.63) <= 0.68 && " El sistema acepta variaciones normales de luz o pequeños cambios angulares manteniendo alta seguridad contra suplantaciones."}
                                {(config.security_faceThreshold ?? 0.63) > 0.68 && " Mayor probabilidad de aceptar a personas con rasgos similares. Reduce la seguridad del sistema."}
                            </div>
                        </div>

                        {/* LIVENESS DETECTION */}
                        <div className="space-y-3 bg-emerald-50 p-4 rounded-xl border border-emerald-100">
                            <h3 className="font-bold text-emerald-700">Prueba de Vida (Movimiento de Cabeza)</h3>
                            <button
                                onClick={() => toggle('security_liveness')}
                                className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border-2 text-left transition font-medium text-sm
                                    ${config.security_liveness !== false
                                        ? 'border-emerald-500 bg-white text-emerald-800'
                                        : 'border-gray-300 bg-gray-100 text-gray-400 opacity-60'}`}
                            >
                                <span className="flex items-center gap-2">
                                    {config.security_liveness !== false
                                        ? <CheckSquare size={20} className="text-emerald-600" />
                                        : <Square size={20} />}
                                    Requerir girar la cabeza
                                </span>
                            </button>
                            <p className="text-xs text-emerald-700 opacity-80 leading-tight">
                                {config.security_liveness !== false
                                    ? "Activo: Se pide girar la cabeza para evitar el uso de fotos falsas."
                                    : "⚠️ Inactive: Los empleados pueden registrar sin comprobar movimiento."}
                            </p>
                        </div>

                        {/* FACE RECOGNITION */}
                        <div className="space-y-3 bg-purple-50 p-4 rounded-xl border border-purple-100">
                            <h3 className="font-bold text-purple-700">Reconocimiento Facial</h3>
                            <button
                                onClick={() => toggle('security_faceRecognition')}
                                className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border-2 text-left transition font-medium text-sm
                                    ${config.security_faceRecognition !== false
                                        ? 'border-purple-500 bg-white text-purple-800'
                                        : 'border-gray-300 bg-gray-100 text-gray-400 opacity-60'}`}
                            >
                                <span className="flex items-center gap-2">
                                    {config.security_faceRecognition !== false
                                        ? <CheckSquare size={20} className="text-purple-600" />
                                        : <Square size={20} />}
                                    Verificar identidad del rostro
                                </span>
                            </button>
                            <p className="text-xs text-purple-700 opacity-80 leading-tight">
                                {config.security_faceRecognition !== false
                                    ? "Activo: Compara el rostro con la foto registrada para evitar suplantación."
                                    : "⚠️ Inactive: Solo verifica que haya un rostro presente."}
                            </p>
                        </div>

                        {/* CÁMARA MODO VISITAS */}
                        <div className="col-span-1 md:col-span-2 space-y-3 bg-teal-50 p-4 rounded-xl border border-teal-100">
                            <h3 className="font-bold text-teal-700">📷 Cámara para Modo Visitas a Clientes</h3>
                            <p className="text-sm text-teal-800 opacity-90">
                                Elige qué cámara se activa al registrar llegadas y salidas en ruta. No aplica reconocimiento facial.
                            </p>
                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    onClick={() => handleTextChange('ruta_camera_facing', 'environment')}
                                    className={`flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 text-sm font-bold transition ${
                                        (config.ruta_camera_facing || 'environment') === 'environment'
                                            ? 'border-teal-500 bg-white text-teal-800 shadow-md'
                                            : 'border-gray-200 bg-gray-50 text-gray-500 hover:border-teal-300'
                                    }`}
                                >
                                    <span className="text-2xl">🔭</span>
                                    <span>Cámara Trasera</span>
                                    <span className="text-[10px] opacity-70 font-normal">Para fotografiar el lugar / cliente</span>
                                </button>
                                <button
                                    onClick={() => handleTextChange('ruta_camera_facing', 'user')}
                                    className={`flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 text-sm font-bold transition ${
                                        config.ruta_camera_facing === 'user'
                                            ? 'border-teal-500 bg-white text-teal-800 shadow-md'
                                            : 'border-gray-200 bg-gray-50 text-gray-500 hover:border-teal-300'
                                    }`}
                                >
                                    <span className="text-2xl">🤳</span>
                                    <span>Cámara Frontal</span>
                                    <span className="text-[10px] opacity-70 font-normal">Para selfie del empleado en campo</span>
                                </button>
                            </div>
                            <p className="text-xs text-teal-700 opacity-80">
                                Seleccionado: <b>{config.ruta_camera_facing === 'user' ? 'Cámara Frontal (Selfie)' : 'Cámara Trasera (Evidencia)'}</b>
                            </p>
                        </div>
                    </div>
                </div>

                {/* ─── CERTIFICADOS DE HABEAS DATA ─── */}
                <div className="bg-white rounded-xl shadow-2xl p-6 mb-6 border-l-4 border-teal-600 overflow-hidden relative">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-teal-50 rounded-full -mr-16 -mt-16 opacity-50"></div>
                    <h2 className="text-xl font-bold text-teal-800 mb-2 relative flex items-center gap-2">
                        <FileText size={22} className="text-teal-600" />
                        Certificados de Consentimiento (Habeas Data)
                    </h2>
                    <p className="text-sm text-gray-600 mb-4 relative">
                        Genera y descarga el soporte legal del consentimiento de tratamiento de datos personales y biométricos de los empleados.
                    </p>

                    <div className="space-y-4 relative bg-teal-50/50 p-4 rounded-xl border border-teal-100/80">
                        <div className="flex flex-col sm:flex-row items-end gap-4">
                            {/* Campo Usuario */}
                            <div className="flex-1 space-y-1">
                                <label className="text-xs font-bold text-teal-700">
                                    Usuario / Email del Empleado
                                </label>
                                <input
                                    type="text"
                                    disabled={generateAllEmployees}
                                    placeholder="ejemplo@usuario.com"
                                    value={certificateEmail}
                                    onChange={(e) => {
                                        setCertificateEmail(e.target.value);
                                        setPdfError('');
                                    }}
                                    className="w-full px-3 py-2 border border-teal-200 rounded-lg focus:ring-2 focus:ring-teal-500 shadow-sm text-sm disabled:bg-gray-100 disabled:text-gray-400"
                                />
                            </div>

                            {/* Checkbox Todos al Tiempo */}
                            <div className="flex items-center h-10 mb-1">
                                <label className="flex items-center gap-2 cursor-pointer group">
                                    <input
                                        type="checkbox"
                                        checked={generateAllEmployees}
                                        onChange={(e) => {
                                            setGenerateAllEmployees(e.target.checked);
                                            setPdfError('');
                                            if (e.target.checked) setCertificateEmail('');
                                        }}
                                        className="w-4 h-4 text-teal-600 rounded border-teal-300 focus:ring-teal-500"
                                    />
                                    <span className="text-xs font-bold text-teal-850 group-hover:text-teal-900 transition-colors">
                                        Todos los empleados
                                    </span>
                                </label>
                            </div>

                            {/* Botón de Generar */}
                            <button
                                onClick={handleGenerateCertificatePDF}
                                disabled={generatingPDF || (!generateAllEmployees && !certificateEmail.trim())}
                                className="px-6 py-2 bg-teal-600 text-white font-bold rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:bg-gray-400 transition flex items-center justify-center gap-2 text-sm shadow-md h-10 whitespace-nowrap min-w-[140px]"
                            >
                                {generatingPDF ? (
                                    <Loader2 size={16} className="animate-spin" />
                                ) : (
                                    <Printer size={16} />
                                )}
                                {generatingPDF ? 'Generando...' : 'Generar PDF'}
                            </button>
                        </div>
                        
                        {/* Mensaje de estado/error */}
                        {pdfError && <p className="text-red-650 text-xs font-bold">{pdfError}</p>}
                    </div>
                </div>

                {/* ─── GESTIÓN DE ETIQUETAS DE BOTONES ─── */}
                <div className="bg-white rounded-xl shadow-2xl p-6 mb-6 border-l-4 border-purple-600 overflow-hidden relative">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-purple-50 rounded-full -mr-16 -mt-16 opacity-50"></div>
                    <h2 className="text-xl font-bold text-purple-800 mb-2 relative">Personalización de Botones</h2>
                    <p className="text-sm text-gray-600 mb-6 relative">
                        Cambia los textos de la pantalla principal para que sean más amigables con el empleado.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 relative">
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-purple-700 flex items-center gap-1">
                                <LogIn size={14} /> Etiqueta Entrada
                            </label>
                            <input
                                type="text"
                                placeholder="Ej: ¡Hola! Ya llegué"
                                value={config.ui_labelEntry || ""}
                                onChange={(e) => handleTextChange('ui_labelEntry', e.target.value)}
                                className="w-full px-3 py-2 border border-purple-200 rounded-lg focus:ring-2 focus:ring-purple-500 shadow-sm text-sm"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-red-700 flex items-center gap-1">
                                <LogOut size={14} /> Etiqueta Salida
                            </label>
                            <input
                                type="text"
                                placeholder="Ej: ¡Hasta mañana!"
                                value={config.ui_labelExit || ""}
                                onChange={(e) => handleTextChange('ui_labelExit', e.target.value)}
                                className="w-full px-3 py-2 border border-red-200 rounded-lg focus:ring-2 focus:ring-red-500 shadow-sm text-sm"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-orange-700 flex items-center gap-1">
                                <TriangleAlert size={14} /> Etiqueta Novedad
                            </label>
                            <input
                                type="text"
                                placeholder="Ej: Algo ocurrió..."
                                value={config.ui_labelIncident || ""}
                                onChange={(e) => handleTextChange('ui_labelIncident', e.target.value)}
                                className="w-full px-3 py-2 border border-orange-200 rounded-lg focus:ring-2 focus:ring-orange-500 shadow-sm text-sm"
                            />
                        </div>
                    </div>
                </div>

                {/* Campos siempre activos */}
                <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 mb-6 mt-8">
                    <p className="text-sm text-purple-700 font-medium">
                        🔒 <strong>Campos obligatorios (siempre activos):</strong> Nombre, Apellido y Correo de sistema — necesarios para crear el usuario de login.
                    </p>
                </div>

                {/* Secciones de campos configurables (Perfiles Empleado) */}
                {FIELD_GROUPS.map(({ group, fields }) => (
                    <div key={group} className="bg-white rounded-xl shadow-2xl p-6 mb-6 border-l-4 border-purple-500">
                        <h2 className="text-xl font-bold text-purple-700 mb-4">{group}</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {fields.map(({ key, label }) => (
                                <button
                                    key={key}
                                    onClick={() => toggle(key)}
                                    className={`flex items-center gap-3 px-4 py-3 rounded-lg border-2 text-left transition font-medium text-sm
                                        ${config[key]
                                            ? 'border-purple-500 bg-purple-50 text-purple-800'
                                            : 'border-gray-200 bg-gray-50 text-gray-500 hover:border-purple-300'}`}
                                >
                                    {config[key]
                                        ? <CheckSquare size={20} className="text-purple-600 shrink-0" />
                                        : <Square size={20} className="text-gray-400 shrink-0" />}
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>
                ))}

                {/* Botón Guardar */}
                <div className="flex justify-end gap-4 mt-2 mb-12">
                    {savedOk && (
                        <span className="text-green-600 font-medium flex items-center gap-1">
                            ✅ Configuración guardada exitosamente
                        </span>
                    )}
                    <button
                        onClick={saveConfig}
                        disabled={saving}
                        className="px-6 py-3 bg-purple-600 text-white font-bold rounded-lg hover:bg-purple-700 disabled:bg-gray-400 transition flex items-center gap-2 shadow-2xl"
                    >
                        {saving ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
                        {saving ? 'Guardando...' : 'Guardar Configuración'}
                    </button>
                </div>
            </div>

            {/* Contenedor de Impresión (Solo visible durante la impresión) */}
            {printEmployees.length > 0 && createPortal(
                <div id="print-certificates-area">
                    <style>{`
                      @media print {
                        html, body {
                          background-color: white !important;
                          color: #000000 !important;
                          margin: 0;
                          padding: 0;
                        }
                        #root {
                          display: none !important;
                        }
                        #print-certificates-area {
                          display: block !important;
                          position: absolute;
                          left: 0;
                          top: 0;
                          width: 100%;
                          background: white;
                          color: #1e293b;
                          font-family: 'Inter', sans-serif;
                          margin: 0;
                          padding: 0;
                        }
                        .certificate-page {
                          width: 100%;
                          padding: 12mm 15mm;
                          box-sizing: border-box;
                          background: white;
                          position: relative;
                          page-break-after: always;
                          page-break-inside: avoid;
                          display: flex;
                          flex-direction: column;
                          gap: 15px;
                          border: 1px solid #cbd5e1;
                        }
                        .certificate-header {
                          border-bottom: 3px solid #3c7da6;
                          padding-bottom: 8px;
                          margin-bottom: 12px;
                        }
                        .certificate-title {
                          font-size: 14pt;
                          font-weight: bold;
                          color: #1e3a8a;
                          text-align: center;
                          margin-top: 10px;
                          line-height: 1.3;
                        }
                        .certificate-subtitle {
                          font-size: 10pt;
                          color: #64748b;
                          text-align: center;
                          margin-top: 4px;
                          font-weight: bold;
                        }
                        .certificate-body {
                          font-size: 10pt;
                          line-height: 1.45;
                          color: #334155;
                          text-align: justify;
                        }
                        .info-table {
                          width: 100%;
                          border-collapse: collapse;
                          margin: 12px 0;
                          background-color: #f8fafc;
                          border: 1px solid #e2e8f0;
                        }
                        .info-table td {
                          padding: 6px 12px;
                          border-bottom: 1px solid #e2e8f0;
                          font-size: 9pt;
                        }
                        .info-table tr:last-child td {
                          border-bottom: none;
                        }
                        .info-table td.label {
                          font-weight: bold;
                          color: #475569;
                          width: 35%;
                        }
                        .info-table td.value {
                          color: #0f172a;
                        }
                        .clause-box {
                          border-left: 3px solid #6faf6b;
                          padding-left: 10px;
                          margin: 8px 0;
                          background-color: #f0fdf4;
                          padding-top: 5px;
                          padding-bottom: 5px;
                        }
                        .clause-title {
                          font-weight: bold;
                          color: #166534;
                          font-size: 9.5pt;
                          margin-bottom: 4px;
                        }
                        .clause-text {
                          font-size: 8.5pt;
                          color: #3f6212;
                          line-height: 1.4;
                        }
                        .verification-box {
                          border: 1.5px dashed #cbd5e1;
                          border-radius: 8px;
                          padding: 10px 14px;
                          margin-top: 15px;
                          background-color: #fafafa;
                        }
                        .verification-title {
                          font-size: 9.5pt;
                          font-weight: bold;
                          color: #475569;
                          text-transform: uppercase;
                          margin-bottom: 6px;
                          letter-spacing: 0.5px;
                        }
                        .verification-row {
                          display: flex;
                          justify-content: space-between;
                          font-size: 9pt;
                          margin-bottom: 4px;
                        }
                        .verification-hash {
                          font-family: monospace;
                          background-color: #f1f5f9;
                          padding: 6px 10px;
                          border-radius: 4px;
                          font-size: 9pt;
                          word-break: break-all;
                          border: 1px solid #cbd5e1;
                          color: #1e293b;
                        }
                        .certificate-footer {
                          border-top: 1px solid #e2e8f0;
                          padding-top: 10px;
                          margin-top: 15px;
                          text-align: center;
                          font-size: 8pt;
                          color: #94a3b8;
                        }
                      }
                      @media screen {
                        #print-certificates-area {
                          display: none !important;
                        }
                      }
                    `}</style>
                    {printEmployees.map((emp) => {
                        const extra = { ...emp, ...(emp.extraFields || {}) };
                        const fechaAcep = extra.fechaAceptacionPolitica 
                            ? new Date(extra.fechaAceptacionPolitica).toLocaleString('es-ES', {
                                day: '2-digit',
                                month: 'long',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit',
                                hour12: true
                              })
                            : 'No registrada';

                        const signatureHash = generateVerificationHash(emp.email, extra.fechaAceptacionPolitica);

                        return (
                            <div key={emp.id || emp.email} className="certificate-page">
                                <div>
                                    {/* Cabecera */}
                                    <div className="certificate-header">
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontSize: '13pt', fontWeight: '900', color: '#3c7da6', letterSpacing: '0.5px' }}>FACECONTROL</span>
                                            <span style={{ fontSize: '8pt', color: '#94a3b8', fontFamily: 'monospace' }}>DOC-REF: FC-{signatureHash.substring(0, 8)}</span>
                                        </div>
                                        <div className="certificate-title">
                                            CERTIFICADO DE CONSENTIMIENTO Y AUTORIZACIÓN PARA TRATAMIENTO DE DATOS PERSONALES Y BIOMÉTRICOS
                                        </div>
                                        <div className="certificate-subtitle">
                                            Registro Electrónico de Habeas Data
                                        </div>
                                    </div>

                                    {/* Cuerpo */}
                                    <div className="certificate-body">
                                        <p>
                                            Por medio de la presente y en cumplimiento de la regulación nacional sobre Protección de Datos Personales (Habeas Data) e Información Sensible, se expide el presente soporte que certifica que el empleado detallado a continuación ha manifestado de manera expresa, libre, voluntaria y con conocimiento de causa, su aceptación y consentimiento para el tratamiento de su información y datos biométricos.
                                        </p>

                                        <table className="info-table">
                                           <tbody>
                                             <tr>
                                                 <td className="label">Nombres completos:</td>
                                                 <td className="value">{extra.firstName || emp.firstName || 'N/A'}</td>
                                             </tr>
                                             <tr>
                                                 <td className="label">Apellidos completos:</td>
                                                 <td className="value">{extra.lastName || emp.lastName || 'N/A'}</td>
                                             </tr>
                                             <tr>
                                                 <td className="label">Usuario / Correo de Acceso:</td>
                                                 <td className="value">{emp.email || 'N/A'}</td>
                                             </tr>
                                             {extra.documentoIdentidad && (
                                                 <tr>
                                                     <td className="label">Documento de Identidad:</td>
                                                     <td className="value">{extra.documentoIdentidad}</td>
                                                 </tr>
                                             )}
                                             <tr>
                                                 <td className="label">Fecha y Hora de Aceptación:</td>
                                                 <td className="value">{fechaAcep}</td>
                                             </tr>
                                             <tr>
                                                 <td className="label">Canal de Aceptación:</td>
                                                 <td className="value">Portal Web de Autenticación FaceControl (Doble Marcación Electrónica)</td>
                                             </tr>
                                           </tbody>
                                        </table>

                                        <p style={{ marginTop: '6px', fontSize: '8.5pt', color: '#475569', textAlign: 'justify' }}>
                                            El empleado declaró bajo la gravedad del juramento haber leído en su totalidad y comprender los términos descritos en la política, autorizando de manera expresa a la Empresa para realizar la recolección, almacenamiento, procesamiento y cotejo de su vector facial (biometría) con el fin único y exclusivo de registrar el control de asistencia laboral y seguridad dentro de las instalaciones autorizadas.
                                        </p>

                                        {/* Caja de Cláusulas Aceptadas */}
                                        <div className="clause-box">
                                            <div className="clause-title">✓ Declaraciones de Aceptación del Empleado:</div>
                                            <div className="clause-text" style={{ marginBottom: '4px' }}>
                                                <strong>1.</strong> "Declaro haber leído la Política de Tratamiento de Datos e Información Sensible."
                                            </div>
                                            <div className="clause-text">
                                                <strong>2.</strong> "Acepto libre y expresamente la recolección y tratamiento de los datos personales y biometría para el cumplimiento de los fines establecidos por la Empresa."
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Sello Digital */}
                                <div>
                                    <div className="verification-box">
                                        <div className="verification-title">Firma Digital y Evidencia de Cumplimiento</div>
                                        <div className="verification-row">
                                            <span><strong>Emisor del Certificado:</strong> FaceControl Platform</span>
                                            <span><strong>Criptografía:</strong> SHA-256</span>
                                        </div>
                                        <div className="verification-row">
                                            <span><strong>ID Registro de Auditoría:</strong> {emp.id || 'N/A'}</span>
                                            <span><strong>Firma Electrónica Autorizada:</strong></span>
                                        </div>
                                        <div className="verification-hash" style={{ marginTop: '5px' }}>
                                            {signatureHash}
                                        </div>
                                        <p style={{ fontSize: '7pt', color: '#94a3b8', marginTop: '6px', lineHeight: '1.2' }}>
                                            Este certificado digital sirve como prueba electrónica de la autorización de Habeas Data para los efectos contemplados en las normativas legales de protección de datos personales. Su integridad técnica es validada por medio del hash criptográfico superior.
                                        </p>
                                    </div>

                                    <div className="certificate-footer">
                                        FaceControl &copy; {new Date().getFullYear()} - Documento Informativo Confidencial y de Uso Exclusivo de Recursos Humanos.
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>,
                document.body
            )}
        </div>
    );
}
