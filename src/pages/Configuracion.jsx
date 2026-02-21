// src/pages/Configuracion.jsx
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings, Lock, Save, CheckSquare, Square, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';

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
    storage_retentionAsistencia: 3,
    storage_retentionIncidentes: 18,
};

export default function Configuracion() {
    const [config, setConfig] = useState(DEFAULT_CONFIG);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [savedOk, setSavedOk] = useState(false);
    const navigate = useNavigate();
    const { isAdminAuthenticated } = useAuth();

    useEffect(() => {
        if (!isAdminAuthenticated) {
            navigate('/login');
            return;
        }
        loadConfig();
    }, [isAdminAuthenticated]);

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

    const handleNumberChange = (key, value) => {
        const val = parseInt(value, 10);
        setConfig(prev => ({ ...prev, [key]: isNaN(val) ? 1 : val > 60 ? 60 : val < 1 ? 1 : val }));
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

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <Loader2 size={40} className="text-purple-600 animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 p-6">
            <div className="max-w-3xl mx-auto">
                {/* Header */}
                <div className="flex justify-between items-center mb-8">
                    <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-2">
                        <Settings size={30} className="text-purple-600" />
                        Configuración
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

                {/* ─── GESTIÓN DE ALMACENAMIENTO DE FOTOS ─── */}
                <div className="bg-white rounded-xl shadow-lg p-6 mb-6 border-l-4 border-blue-500">
                    <h2 className="text-xl font-bold text-blue-800 mb-2">Almacenamiento de Evidencias (Fotos)</h2>
                    <p className="text-sm text-gray-600 mb-4">
                        Configura si el sistema guardará de forma permanente las fotos al momento de entrar o si solo verificará el rostro sin guardar archivos pesados. Además, define el tiempo (en meses) antes de que se borren y eliminen permanentemente.
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
                                <label className="text-xs font-bold text-blue-800 opacity-80">Meses de retención</label>
                                <input
                                    type="number"
                                    min="1" max="60"
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
                                <label className="text-xs font-bold text-orange-800 opacity-80">Meses de retención</label>
                                <input
                                    type="number"
                                    min="1" max="60"
                                    disabled={config.storage_saveIncidentes === false}
                                    value={config.storage_retentionIncidentes ?? 18}
                                    onChange={(e) => handleNumberChange('storage_retentionIncidentes', e.target.value)}
                                    className="px-3 py-2 border border-orange-200 rounded-lg focus:ring-2 focus:ring-orange-500 disabled:bg-gray-200 disabled:opacity-50"
                                />
                            </div>
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
                    <div key={group} className="bg-white rounded-xl shadow-lg p-6 mb-6 border-l-4 border-purple-500">
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
                        className="px-6 py-3 bg-purple-600 text-white font-bold rounded-lg hover:bg-purple-700 disabled:bg-gray-400 transition flex items-center gap-2 shadow-lg"
                    >
                        {saving ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
                        {saving ? 'Guardando...' : 'Guardar Configuración'}
                    </button>
                </div>
            </div>
        </div>
    );
}
