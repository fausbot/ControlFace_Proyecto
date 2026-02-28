// src/pages/Configuracion.jsx
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings, Lock, Save, CheckSquare, Square, Loader2, LogIn, LogOut, TriangleAlert } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { fetchLicenseStatus, applyNewLicenseToken } from '../services/licenseService';

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
    storage_retentionAsistencia: 90,
    storage_retentionIncidentes: 540,
    // defaults calculo tiempo
    calc_rounding: false,
    calc_roundingMins: 15,
    calc_lunch: false,
    calc_lunchMins: 60,
    // defaults etiquetas botones
    ui_labelEntry: "Registrar Entrada",
    ui_labelExit: "Registrar Salida",
    ui_labelIncident: "Reportar Novedad",
};

export default function Configuracion() {
    const [config, setConfig] = useState(DEFAULT_CONFIG);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [savedOk, setSavedOk] = useState(false);
    const [licenseStatus, setLicenseStatus] = useState(null);
    const [licenseInput, setLicenseInput] = useState('');
    const [savingLicense, setSavingLicense] = useState(false);
    const [licenseError, setLicenseError] = useState('');
    const navigate = useNavigate();
    const { adminAccess, currentUser } = useAuth();

    useEffect(() => {
        if (!adminAccess['/configuracion']) {
            navigate('/login');
            return;
        }
        loadConfig();
    }, [adminAccess]);

    const loadConfig = async () => {
        try {
            const snap = await getDoc(doc(db, 'settings', 'employeeFields'));
            if (snap.exists()) {
                // Mezclamos los datos base con los que vengan de la BD para que tome en cuenta los nuevos defaults (storage_*)
                setConfig(prev => ({ ...prev, ...snap.data() }));
            } else {
                // Primer uso: inicializamos la BD con los defaults
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

    const handleNumberChange = (key, value, maxVal = 730) => {
        const val = parseInt(value, 10);
        setConfig(prev => ({ ...prev, [key]: isNaN(val) ? 1 : val > maxVal ? maxVal : val < 1 ? 1 : val }));
        setSavedOk(false);
    };

    const saveConfig = async () => {
        setSaving(true);
        try {
            await setDoc(doc(db, 'settings', 'employeeFields'), config);
            setSavedOk(true);
            setTimeout(() => setSavedOk(false), 3000);
        } catch (err) {
            console.error('Error guardando configuración:', err);
            alert('Error al guardar. Inténtalo de nuevo.');
        } finally {
            setSaving(false);
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
                            onClick={() => navigate('/dashboard')}
                            className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 border border-gray-300"
                        >
                            Volver
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

                {/* ─── GESTIÓN DE ALMACENAMIENTO DE FOTOS ─── */}
                <div className="bg-white rounded-xl shadow-2xl p-6 mb-6 border-l-4 border-blue-500">
                    <h2 className="text-xl font-bold text-blue-800 mb-2">Almacenamiento de Evidencias (Fotos)</h2>
                    <p className="text-sm text-gray-600 mb-4">
                        Configura si el sistema guardará de forma permanente las fotos al momento de entrar o si solo verificará el rostro sin guardar archivos pesados. Además, define el tiempo (en días) antes de que se borren y eliminen permanentemente.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                    </div>
                </div>

                {/* ─── GESTIÓN DE CÁLCULO DE HORAS ─── */}
                <div className="bg-white rounded-xl shadow-2xl p-6 mb-6 border-l-4 border-teal-500">
                    <h2 className="text-xl font-bold text-teal-800 mb-2">Cálculo de Tiempo Laborado</h2>
                    <p className="text-sm text-gray-600 mb-4">
                        Configura el redondeo de entradas/salidas y el descuento automático de tiempo de almuerzo aplicable únicamente a turnos de más de 8 horas.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                            <button
                                onClick={() => toggle('calc_lunch')}
                                className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border-2 text-left transition font-medium text-sm
                                    ${config.calc_lunch !== false
                                        ? 'border-indigo-500 bg-white text-indigo-800'
                                        : 'border-gray-300 bg-gray-100 text-gray-400 opacity-60'}`}
                            >
                                <span className="flex items-center gap-2">
                                    {config.calc_lunch !== false ? <CheckSquare size={20} className="text-indigo-600" /> : <Square size={20} />}
                                    Descontar automáticamente
                                </span>
                            </button>
                            <p className="text-xs text-indigo-700 opacity-80 leading-tight">Solo aplicará si el empleado registra un tiempo laborado superior a 8 horas.</p>
                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-bold text-indigo-800 opacity-80">Tiempo a descontar (Minutos)</label>
                                <input
                                    type="number"
                                    min="1" max="180"
                                    disabled={config.calc_lunch === false}
                                    value={config.calc_lunchMins ?? 60}
                                    onChange={(e) => handleNumberChange('calc_lunchMins', e.target.value, 180)}
                                    className="px-3 py-2 border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-200 disabled:opacity-50"
                                />
                            </div>
                        </div>
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
        </div>
    );
}
