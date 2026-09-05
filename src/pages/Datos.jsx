// src/pages/Datos.jsx
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2, ChevronLeft, ChevronRight, Loader2, FileText, CheckCircle, Search, X, ArrowLeft, Camera, Check } from 'lucide-react';
import { db } from '../firebaseConfig';
import { collection, query, where, getDocs, doc, setDoc, getDoc, deleteDoc, deleteField } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import AdminPasswordModal from '../components/AdminPasswordModal';

// ✅ Importamos desde los servicios
import {
    paginateLogs,
    deleteAttendanceLog,
    subscribeToAttendanceLogs
} from '../services/attendanceService';

import { getEmployeesMap } from '../services/employeeService';

const PAGE_SIZE = 100;

export default function Datos() {
    const [logs, setLogs] = useState([]);
    const [allLogs, setAllLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [pageNumber, setPageNumber] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [employeesMap, setEmployeesMap] = useState({});
    const [searchTerm, setSearchTerm] = useState('');
    const [rutaActive, setRutaActive] = useState(false); // Flag para mostrar modo visita
    const [systemConfig, setSystemConfig] = useState(null); // Configuración de almuerzo y sistema

    // Estado para Entrada Manual
    const [mUser, setMUser] = useState('');
    const [mType, setMType] = useState('Entrada');
    const [mDate, setMDate] = useState('');
    const [mHour, setMHour] = useState(() => {
        const h = new Date().getHours();
        const h12 = h % 12 || 12;
        return String(h12).padStart(2, '0');
    });
    const [mMinute, setMMinute] = useState(() => String(new Date().getMinutes()).padStart(2, '0'));
    const [mAmPm, setMAmPm] = useState(() => new Date().getHours() < 12 ? 'AM' : 'PM');
    const [mReason, setMReason] = useState('');
    const [mSaving, setMSaving] = useState(false);
    const [mUserError, setMUserError] = useState('');

    // Estado para borrado y edición protegida de almuerzo
    const [deletingId, setDeletingId] = useState(null);
    const [lunchToggleId, setLunchToggleId] = useState(null);
    const [lunchToggleValue, setLunchToggleValue] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);

    // Estado para la ventana flotante de comentarios y su protección
    const [openCommentModal, setOpenCommentModal] = useState(false);
    const [commentModalLog, setCommentModalLog] = useState(null);
    const [commentModalText, setCommentModalText] = useState('');
    const [pendingCommentSave, setPendingCommentSave] = useState(null);

    const navigate = useNavigate();
    const { adminAccess } = useAuth();

    useEffect(() => {
        // Validación de seguridad específica para esta página
        if (!adminAccess['/datos']) {
            navigate('/login');
            return;
        }

        // Cargar mapa de empleados una vez
        const loadInitialData = async () => {
            const map = await getEmployeesMap();
            setEmployeesMap(map);
        };
        loadInitialData();

        // Cargar flag ruta_active y configuración del sistema
        const fetchSettings = async () => {
            try {
                const docSnap = await getDoc(doc(db, 'settings', 'employeeFields'));
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    setSystemConfig(data);
                    if (data.ruta_active === true) {
                        setRutaActive(true);
                    }
                }
            } catch (err) { console.warn("No se pudo cargar la configuración del sistema:", err) }
        };
        fetchSettings();

        // Suscripción en tiempo real
        setLoading(true);
        const unsubscribe = subscribeToAttendanceLogs((updatedLogs) => {
            setAllLogs(updatedLogs);
            setLoading(false);
        });

        // Timeout de seguridad para evitar "Cargando" infinito offline
        const timer = setTimeout(() => {
            setLoading(false);
        }, 5000);

        // Limpieza al desmontar
        return () => {
            unsubscribe();
            clearTimeout(timer);
        };
    }, [adminAccess, navigate]);

    // Recalcular página cuando cambia pageNumber o el término de búsqueda
    useEffect(() => {
        if (allLogs.length === 0) {
            setLogs([]);
            return;
        }

        let filteredLogs = allLogs;
        if (searchTerm.trim() !== '') {
            const lowerSearch = searchTerm.toLowerCase();
            filteredLogs = allLogs.filter(log => {
                const emp = employeesMap[log.usuario] || { firstName: '', lastName: '' };
                const fullName = `${emp.firstName} ${emp.lastName}`.toLowerCase();
                const email = (log.usuario || '').toLowerCase();
                return fullName.includes(lowerSearch) || email.includes(lowerSearch);
            });
        }

        const { data, hasMore: more } = paginateLogs(filteredLogs, pageNumber, PAGE_SIZE);
        setLogs(data);
        setHasMore(more);
    }, [pageNumber, allLogs, searchTerm, employeesMap]);

    const handleManualEntry = async (e) => {
        e.preventDefault();
        if (!mUser || !mType || !mDate) {
            alert('Por favor completa todos los campos.');
            return;
        }

        const emailNormalized = mUser.toLowerCase().trim();
        if (!employeesMap[emailNormalized]) {
            setMUserError('Usuario inexistente');
            alert(`⚠️ El usuario "${mUser}" no existe en el sistema. Asegúrese de escribir el correo correctamente o verifique que esté creado en la sección de Empleados.`);
            return;
        } else {
            setMUserError('');
        }

        const [y, m, d] = mDate.split('-');
        const dateStr = `${parseInt(d)}/${parseInt(m)}/${y}`;
        // Convertir de 12h a 24h para guardar
        let h24 = parseInt(mHour, 10);
        if (mAmPm === 'AM' && h24 === 12) h24 = 0;
        if (mAmPm === 'PM' && h24 !== 12) h24 += 12;
        const timeStr = `${String(h24).padStart(2, '0')}:${mMinute}:00`;

        const safeEmail = mUser.toLowerCase().trim().replace(/[@.]/g, '-');
        const safeFecha = dateStr.replace(/\//g, '-');
        const safeHora = timeStr.replace(/:/g, '-').replace(/\s/g, '');
        const deterministicDocId = `${safeEmail}_${safeFecha}_${safeHora}`;

        try {
            setMSaving(true);
            
            // Para Entrada/Salida normales, validamos de forma inteligente para permitir múltiples turnos por día
            if (mType === 'Entrada' || mType === 'Salida') {
                const q = query(
                    collection(db, "attendance"),
                    where("usuario", "==", mUser.toLowerCase().trim()),
                    where("fecha", "==", dateStr)
                );
                const snap = await getDocs(q);

                if (!snap.empty) {
                    const existingLogs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                    
                    // 1. Verificar coincidencia exacta de tipo e ID/Hora
                    const exactMatch = existingLogs.find(log => log.tipo === mType && log.hora === timeStr);
                    if (exactMatch) {
                        if (!window.confirm(`Ya existe una ${mType} registrada exactamente a las ${mHour}:${mMinute} ${mAmPm} para este día. ¿Desea sobreescribirla con los nuevos datos?`)) {
                            setMSaving(false);
                            return;
                        }
                    } else {
                        // 2. Verificar solapamiento con turnos existentes del mismo día
                        const timeToMinutes = (tStr) => {
                            if (!tStr) return 0;
                            const [h, m] = tStr.split(':').map(Number);
                            return h * 60 + m;
                        };
                        const newTimeMins = timeToMinutes(timeStr);

                        // Ordenamos cronológicamente
                        existingLogs.sort((a, b) => timeToMinutes(a.hora) - timeToMinutes(b.hora));

                        // Reconstruimos los turnos emparejados del día
                        const existingShifts = [];
                        let currentEntry = null;
                        existingLogs.forEach(log => {
                            if (log.tipo === 'Entrada') {
                                if (currentEntry) {
                                    existingShifts.push({ entry: currentEntry, exit: null });
                                }
                                currentEntry = log;
                            } else if (log.tipo === 'Salida') {
                                if (currentEntry) {
                                    existingShifts.push({ entry: currentEntry, exit: log });
                                    currentEntry = null;
                                } else {
                                    existingShifts.push({ entry: null, exit: log });
                                }
                            }
                        });
                        if (currentEntry) {
                            existingShifts.push({ entry: currentEntry, exit: null });
                        }

                        // Buscar solapamientos
                        let overlapShift = null;
                        for (const shift of existingShifts) {
                            if (shift.entry && shift.exit) {
                                const entryMins = timeToMinutes(shift.entry.hora);
                                const exitMins = timeToMinutes(shift.exit.hora);
                                if (newTimeMins > entryMins && newTimeMins < exitMins) {
                                    overlapShift = shift;
                                    break;
                                }
                            }
                        }

                        if (overlapShift) {
                            const entryLabel = overlapShift.entry.hora;
                            const exitLabel = overlapShift.exit.hora;
                            if (!window.confirm(`⚠️ Advertencia de Solapamiento:\nLa hora seleccionada (${mHour}:${mMinute} ${mAmPm}) se encuentra dentro de un turno de trabajo ya registrado para este empleado en esta fecha (${entryLabel} a ${exitLabel}).\n\n¿Desea registrar esta ${mType} de todas formas?`)) {
                                setMSaving(false);
                                return;
                            }
                        }

                        // Verificar si se está registrando una Entrada/Salida adicional a otra hora en la misma fecha
                        const sameTypeLogs = existingLogs.filter(log => log.tipo === mType);
                        if (sameTypeLogs.length > 0) {
                            if (!window.confirm(`ℹ️ Registro de Turno Adicional:\nYa existe una ${mType} registrada en esta fecha a otra hora. Al adicionar esta nueva ${mType}, el sistema creará un turno de trabajo adicional para el empleado en este día.\n\n¿Desea continuar?`)) {
                                setMSaving(false);
                                return;
                            }
                        }
                    }
                }
            } else {
                // Para visitas, solo verificamos si ya existe EXACTAMENTE a la misma hora para no duplicar por error
                const docRef = doc(db, "attendance", deterministicDocId);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    if (!window.confirm('Ya existe un registro de visita EXACTAMENTE a esta misma hora. ¿Desea sobreescribirlo?')) {
                        setMSaving(false);
                        return;
                    }
                }
            }

            // Usando setDoc con ID determinístico para consistencia con app principal
            // NOTA: Se corrige el timestamp utilizando h24 en lugar de mHour para evitar desfase de 12 horas.
            const [y, m, d] = mDate.split('-');
            const timestampDate = new Date(parseInt(y), parseInt(m) - 1, parseInt(d), h24, parseInt(mMinute), 0);

            // Resolver nombre del empleado desde el mapa para que los motores de reporte lo incluyan
            const empData = employeesMap[mUser.toLowerCase().trim()] || {};
            const nombreCompleto = `${empData.nombre || empData.firstName || ''} ${empData.apellido || empData.lastName || ''}`.trim();

            const docData = {
                usuario: mUser.toLowerCase().trim(),
                nombre: nombreCompleto || mUser.toLowerCase().trim(),
                tipo: mType,
                fecha: dateStr,
                hora: timeStr,
                localidad: "ENTRADA MANUAL DE DATOS",
                observacion: mReason || "Añadido manualmente",
                timestamp: timestampDate
            };
            await setDoc(doc(db, "attendance", deterministicDocId), docData);

            // Si es modo visita, crear el registro espejo en 'visitas'
            if (mType === 'En Cliente' || mType === 'En Tránsito') {
                const visitaDocData = {
                    ...docData,
                    tipo: mType === 'En Cliente' ? 'Llegada Cliente' : 'Salida Cliente',
                    mode: 'visita',
                    observacion: mReason || "Añadido manualmente",
                };
                await setDoc(doc(db, "visitas", deterministicDocId), visitaDocData);
            }

            alert('✅ Registro adicionado correctamente.');
            setMUser(''); setMUserError(''); setMDate(''); setMReason('');
            const h = new Date().getHours();
            setMHour(String(h % 12 || 12).padStart(2, '0'));
            setMMinute(String(new Date().getMinutes()).padStart(2, '0'));
            setMAmPm(h < 12 ? 'AM' : 'PM');
        } catch (error) {
            console.error(error);
            alert('Error al guardar el registro manual.');
        } finally {
            setMSaving(false);
        }
    };

    const confirmDelete = async (id) => {
        if (!window.confirm('¿Eliminar este registro permanentemente?')) return;
        setDeletingId(id);
        setShowDeleteModal(true);
    };

    const executeDelete = async (id) => {
        try {
            await deleteAttendanceLog(id);
            setLogs(logs.filter(log => log.id !== id));
            setAllLogs(allLogs.filter(log => log.id !== id));
        } catch (error) {
            console.error(error);
            alert('No se pudo borrar el registro.');
        } finally {
            setDeletingId(null);
        }
    };

    const confirmToggleLunch = (id, currentVal) => {
        setLunchToggleId(id);
        setLunchToggleValue(currentVal);
        setShowDeleteModal(true);
    };

    const executeToggleLunch = async (id, currentVal) => {
        try {
            const docRef = doc(db, "attendance", id);
            const newVal = !currentVal;

            // Guardar el valor booleano explícito (true o false).
            // Cuando el administrador interactúa con el botón en En Vivo, su decisión manual
            // prevalece de forma definitiva sobre cualquier cálculo automático o modo de sistema:
            //   - true  → Descuenta almuerzo sí o sí en Informes y Motores de Tiempo.
            //   - false → NO descuenta almuerzo sí o sí en Informes y Motores de Tiempo.
            await setDoc(docRef, { applyLunch: newVal }, { merge: true });

            // Actualizar estado local inmediatamente para que la UI refleje el cambio al instante
            setAllLogs(prev => prev.map(log => log.id === id ? { ...log, applyLunch: newVal } : log));
            console.log(`🍽️ [Almuerzo] Registro ${id} actualizado a applyLunch = ${newVal}`);
        } catch (error) {
            console.error("Error al actualizar el descuento de almuerzo:", error);
            alert("No se pudo actualizar el descuento de almuerzo.");
        } finally {
            setLunchToggleId(null);
        }
    };

    const startEditComment = (log) => {
        setCommentModalLog(log);
        setCommentModalText(log.comentarioAdmin || '');
        setOpenCommentModal(true);
    };

    const executeSaveComment = async (id, text) => {
        try {
            const docRef = doc(db, "attendance", id);
            const trimmedText = text.trim();
            if (trimmedText) {
                await setDoc(docRef, { comentarioAdmin: trimmedText }, { merge: true });
            } else {
                await setDoc(docRef, { comentarioAdmin: deleteField() }, { merge: true });
            }
            // Actualizar estado local inmediatamente — no esperar al ciclo del onSnapshot
            setAllLogs(prev => prev.map(log => {
                if (log.id !== id) return log;
                const updated = { ...log };
                if (trimmedText) {
                    updated.comentarioAdmin = trimmedText;
                } else {
                    delete updated.comentarioAdmin;
                }
                return updated;
            }));
            // Cerrar modal automáticamente
            setOpenCommentModal(false);
            setCommentModalLog(null);
            setCommentModalText('');
            alert('✅ Observación guardada correctamente.');
        } catch (error) {
            console.error("Error al guardar comentario:", error);
            alert("No se pudo guardar la observación.");
        } finally {
            setPendingCommentSave(null);
        }
    };


    return (
        <div className="min-h-screen bg-gradient-to-b from-[#3C7DA6] to-[#6FAF6B] p-6 pb-72">
            <div className="max-w-6xl mx-auto">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
                    <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-2">
                        <FileText size={30} className="text-blue-600" />
                        Visor de Asistencia
                        <div className="flex items-center gap-1.5 px-2 py-0.5 bg-red-50 text-red-600 rounded-full border border-red-100 animate-pulse ml-2">
                            <span className="relative flex h-1.5 w-1.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-600"></span>
                            </span>
                            <span className="text-[10px] font-bold uppercase tracking-wider">EN VIVO</span>
                        </div>
                        <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-mono ml-1 border border-gray-200">v{import.meta.env.VITE_APP_VERSION}</span>
                    </h1>
                    
                    <div className="flex items-center gap-3 w-full md:w-auto">
                        <div className="relative flex-1 md:w-[320px]">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <Search size={18} className="text-gray-500" />
                            </div>
                            <input
                                type="text"
                                placeholder="Buscar por empleado o correo..."
                                value={searchTerm}
                                onChange={(e) => {
                                    setSearchTerm(e.target.value);
                                    setPageNumber(1);
                                }}
                                className="w-full pl-10 pr-10 py-2.5 bg-white border-0 text-gray-800 placeholder-gray-500 rounded-xl shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-400 transition"
                            />
                            {searchTerm && (
                                <button 
                                    onClick={() => { setSearchTerm(''); setPageNumber(1); }} 
                                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-700 transition"
                                >
                                    <X size={18} />
                                </button>
                            )}
                        </div>
                        <button onClick={() => navigate('/login')} className="px-6 py-2.5 bg-white text-gray-800 font-bold flex items-center gap-2 rounded-xl border border-gray-100 shadow-lg hover:bg-gray-50 transition whitespace-nowrap">
                            <ArrowLeft size={20} /> Volver
                        </button>
                    </div>
                </div>

                {/* Modal de Protección para Borrado, Almuerzo y Observaciones */}
                <AdminPasswordModal
                    isOpen={showDeleteModal}
                    target="/configuracion"
                    onClose={() => {
                        setShowDeleteModal(false);
                        setDeletingId(null);
                        setLunchToggleId(null);
                        setPendingCommentSave(null);
                    }}
                    onSuccess={() => {
                        setShowDeleteModal(false);
                        if (deletingId) {
                            executeDelete(deletingId);
                        } else if (lunchToggleId) {
                            executeToggleLunch(lunchToggleId, lunchToggleValue);
                        } else if (pendingCommentSave) {
                            executeSaveComment(pendingCommentSave.id, pendingCommentSave.text);
                        }
                    }}
                />

                {/* Modal Flotante de Edición de Comentarios */}
                {openCommentModal && commentModalLog && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all scale-100 border border-gray-100">
                            {/* Header */}
                            <div className="bg-gray-50 px-6 py-4 flex justify-between items-center border-b border-gray-100">
                                <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                                    <FileText className="text-blue-600" size={20} />
                                    Comentario Administrativo
                                </h3>
                                <button
                                    onClick={() => {
                                        setOpenCommentModal(false);
                                        setCommentModalLog(null);
                                        setCommentModalText('');
                                    }}
                                    className="text-gray-400 hover:text-gray-600 transition p-1 hover:bg-gray-100 rounded-full"
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            {/* Body */}
                            <div className="p-6 space-y-4">
                                <p className="text-sm text-gray-500">
                                    Escriba el comentario para el registro de {commentModalLog.tipo} de{' '}
                                    <span className="font-bold text-gray-700">
                                        {employeesMap[commentModalLog.usuario]
                                            ? `${employeesMap[commentModalLog.usuario].firstName} ${employeesMap[commentModalLog.usuario].lastName}`
                                            : commentModalLog.usuario}
                                    </span> del día {commentModalLog.fecha} a las {commentModalLog.hora}.
                                </p>

                                <div className="space-y-2">
                                    <textarea
                                        value={commentModalText}
                                        onChange={(e) => setCommentModalText(e.target.value)}
                                        className="w-full h-32 px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-gray-800 resize-none font-normal"
                                        placeholder="Escriba el comentario de la empresa con respecto a este turno..."
                                        autoFocus
                                    />
                                </div>

                                <div className="flex justify-end gap-3 pt-2">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setOpenCommentModal(false);
                                            setCommentModalLog(null);
                                            setCommentModalText('');
                                        }}
                                        className="px-4 py-2.5 text-gray-600 hover:bg-gray-100 rounded-xl font-medium transition"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setPendingCommentSave({
                                                id: commentModalLog.id,
                                                text: commentModalText
                                            });
                                            setOpenCommentModal(false);
                                            setShowDeleteModal(true);
                                        }}
                                        className="px-6 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 active:bg-blue-800 transition shadow-lg shadow-blue-200 flex items-center gap-2"
                                    >
                                        Guardar
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Tabla */}
                <div className="bg-white rounded-xl shadow-2xl overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-gray-100 border-b">
                                <tr>
                                    <th className="p-4 font-semibold text-gray-600">Empleado</th>
                                    <th className="p-4 font-semibold text-gray-600">Usuario</th>
                                    <th className="p-4 font-semibold text-gray-600">Tipo</th>
                                    <th className="p-4 font-semibold text-gray-600">Fecha</th>
                                    <th className="p-4 font-semibold text-gray-600">Hora</th>
                                    <th className="p-4 font-semibold text-gray-600">Localidad</th>
                                    <th className="py-4 px-1 text-center font-semibold text-gray-600 w-14">Foto</th>
                                    <th className="py-4 px-1 text-center font-semibold text-gray-600 w-14">Borrar</th>
                                    <th className="py-4 px-1 text-center font-semibold text-gray-600 w-20">Almuerzo</th>
                                    <th className="py-4 px-1 text-center font-semibold text-gray-600 w-24">Comentario</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {loading ? (
                                    <tr><td colSpan="10" className="p-8 text-center text-gray-400">Cargando registros...</td></tr>
                                ) : logs.map((log) => {
                                    const emp = employeesMap[log.usuario] || { firstName: '-', lastName: '' };
                                    return (
                                        <tr key={log.id} className="hover:bg-gray-50 transition text-sm">
                                            <td className="p-4 font-bold">{emp.firstName} {emp.lastName}</td>
                                            <td className="p-4 text-gray-500">{log.usuario}</td>
                                            <td className="p-4">
                                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                                    log.tipo === 'Entrada' ? 'bg-green-100 text-green-700' : 
                                                    (log.tipo === 'En Cliente' || log.tipo === 'En Tránsito') ? 'bg-blue-100 text-blue-700 border border-blue-200' :
                                                    'bg-red-100 text-red-700'
                                                }`}>
                                                    {log.tipo === 'En Cliente' ? 'ENTRADA A CLIENTE' : log.tipo === 'En Tránsito' ? 'SALIDA DE CLIENTE' : log.tipo}
                                                </span>
                                            </td>
                                            <td className="p-4">{log.fecha}</td>
                                            <td className="p-4">{log.hora}</td>
                                            <td className="p-4 text-xs text-gray-400 max-w-[200px] truncate" title={log.localidad || log.ubicacion}>{log.localidad || log.ubicacion}</td>
                                            {/* Columna Foto */}
                                            <td className="py-4 px-1 text-center w-14">
                                                {log.fotoURL ? (
                                                    <button 
                                                        onClick={() => window.open(log.fotoURL, '_blank')} 
                                                        className="p-1.5 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition"
                                                        title="Ver foto"
                                                    >
                                                        <Camera size={20} />
                                                    </button>
                                                ) : (
                                                    <span className="text-gray-300 text-xs">-</span>
                                                )}
                                            </td>
                                            
                                            {/* Columna Borrar */}
                                            <td className="py-4 px-1 text-center w-14">
                                                <button 
                                                    onClick={() => confirmDelete(log.id)} 
                                                    className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                                                    title="Borrar registro"
                                                >
                                                    <Trash2 size={20} />
                                                </button>
                                            </td>
                                            
                                            {/* Columna Almuerzo */}
                                            <td className="py-4 px-1 text-center w-20">
                                                {log.tipo === 'Salida' ? (
                                                    (() => {
                                                        // ─── Helpers ──────────────────────────────────────────────────────
                                                        const parseLocalDateTime = (fStr, hStr) => {
                                                             if (!fStr || !hStr) return null;
                                                             try {
                                                                 const separator = fStr.includes('/') ? '/' : '-';
                                                                 const parts = fStr.split(separator);
                                                                 if (parts.length !== 3) return null;

                                                                 let d, m, y;
                                                                 if (parts[0].length === 4) {
                                                                     // Formato YYYY-MM-DD
                                                                     [y, m, d] = parts;
                                                                 } else {
                                                                     // Formato DD/MM/YYYY o DD-MM-YYYY
                                                                     [d, m, y] = parts;
                                                                 }

                                                                 const cleanHora = hStr.replace(/[^0-9:]/g, '');
                                                                 const timeParts = cleanHora.split(':');
                                                                 if (timeParts.length < 2) return null;

                                                                 const h = timeParts[0];
                                                                 const min = timeParts[1];
                                                                 const s = timeParts[2] || '00';

                                                                 const dObj = new Date(parseInt(y), parseInt(m) - 1, parseInt(d), parseInt(h), parseInt(min), parseInt(s));
                                                                 return isNaN(dObj.getTime()) ? null : dObj;
                                                             } catch { return null; }
                                                         };
 
                                                        if (!systemConfig?.calc_lunch) {
                                                            // Almuerzo desactivado globalmente → no mostrar nada
                                                            return <span className="text-gray-300 text-xs">-</span>;
                                                        }
 
                                                        const lunchMode = systemConfig?.calc_lunchMode || 'general';
 
                                                        if (lunchMode === 'empresa') {
                                                            // Modo Control Empresa: solo el admin puede marcar con contraseña desde En Vivo.
                                                            const isLunchApplied = log.applyLunch === true;
                                                            return (
                                                                <button
                                                                    onClick={() => confirmToggleLunch(log.id, isLunchApplied)}
                                                                    title={isLunchApplied
                                                                        ? "Admin marcó descuento: SÍ (clic con contraseña para cambiar)"
                                                                        : "Admin no marcó descuento (clic con contraseña para marcar)"}
                                                                    className={`w-5 h-5 mx-auto rounded-md border flex items-center justify-center transition-all ${
                                                                        isLunchApplied
                                                                            ? 'bg-green-500 border-green-600 text-white shadow-[0_0_8px_rgba(34,197,94,0.35)] hover:scale-105'
                                                                            : 'bg-slate-50 border-slate-300 hover:border-slate-400 text-transparent hover:scale-105'
                                                                    }`}
                                                                >
                                                                    <Check size={12} strokeWidth={2.5} />
                                                                </button>
                                                            );
                                                        }
 
                                                        if (lunchMode === 'individual') {
                                                            // Solo muestra verde si el empleado explícitamente marcó el descuento
                                                            const isLunchApplied = log.applyLunch === true;
                                                            return (
                                                                <button
                                                                    onClick={() => confirmToggleLunch(log.id, isLunchApplied)}
                                                                    title={isLunchApplied
                                                                        ? "Empleado marcó descuento de almuerzo: SÍ (clic para cambiar)"
                                                                        : "Empleado NO marcó descuento de almuerzo (clic para forzar)"}
                                                                    className={`w-5 h-5 mx-auto rounded-md border flex items-center justify-center transition-all ${
                                                                        isLunchApplied
                                                                            ? 'bg-green-500 border-green-600 text-white shadow-[0_0_8px_rgba(34,197,94,0.35)] hover:scale-105'
                                                                            : 'bg-slate-50 border-slate-300 hover:border-slate-400 text-transparent hover:scale-105'
                                                                    }`}
                                                                >
                                                                    <Check size={12} strokeWidth={2.5} />
                                                                </button>
                                                            );
                                                        }
 
                                                        // ─── Modo GENERAL (automático por umbral) ────────────────────────
                                                        const autoApplied = (() => {
                                                            const endObj = parseLocalDateTime(log.fecha, log.hora);
                                                            if (!endObj) return false;
                                                            const salidaTime = endObj.getTime();
 
                                                            // Buscar la entrada más cercana anterior a esta salida, mismo usuario y fecha
                                                            let matchingEntry = null;
                                                            let minDiff = Infinity;
                                                            for (const ent of allLogs) {
                                                                if (ent.usuario === log.usuario && ent.tipo === 'Entrada' && ent.fecha === log.fecha) {
                                                                    const entryObj = parseLocalDateTime(ent.fecha, ent.hora);
                                                                    if (entryObj) {
                                                                        const diff = salidaTime - entryObj.getTime();
                                                                        if (diff > 0 && diff < minDiff) {
                                                                            minDiff = diff;
                                                                            matchingEntry = ent;
                                                                        }
                                                                    }
                                                                }
                                                            }
                                                            if (!matchingEntry) return false;
 
                                                            const startObj = parseLocalDateTime(matchingEntry.fecha, matchingEntry.hora);
                                                            if (!startObj) return false;
 
                                                            const totalMinutes = Math.floor((endObj.getTime() - startObj.getTime()) / 1000 / 60);
 
                                                            // Umbral = horas del turno del día + minutos de almuerzo configurados
                                                            const dayNum = endObj.getDay() === 0 ? '7' : String(endObj.getDay());
                                                            let dayConf = systemConfig.calc_dailyWorkdayConfig?.[dayNum] || { hours: 8, mins: 0 };
 
                                                            // Fallback: si es domingo (7) con 0 horas, usar la config del sábado (6)
                                                            if (dayNum === '7' && (dayConf.hours || 0) === 0) {
                                                                const satConf = systemConfig.calc_dailyWorkdayConfig?.['6'];
                                                                if (satConf && (satConf.hours || 0) > 0) dayConf = satConf;
                                                            }
 
                                                            const requiredThresholdMins = (dayConf.hours * 60) + (dayConf.mins || 0);
                                                            const lunchMinsToDeduct = parseInt(systemConfig.calc_lunchMins, 10) || 60;
 
                                                            // Solo aplicar si el día tiene jornada laboral configurada (> 0 horas).
                                                            const LUNCH_TOLERANCE_MINS = parseInt(import.meta.env.VITE_LUNCH_TOLERANCE_MINS, 10) || 0;
                                                            return requiredThresholdMins > 0 &&
                                                                totalMinutes >= (requiredThresholdMins + lunchMinsToDeduct - LUNCH_TOLERANCE_MINS);
                                                        })();
 
                                                        // Override manual del admin tiene prioridad sobre el automático
                                                        const isLunchApplied = log.applyLunch === true
                                                            ? true
                                                            : log.applyLunch === false
                                                                ? false
                                                                : autoApplied;
 
                                                        return (
                                                            <button
                                                                onClick={() => confirmToggleLunch(log.id, isLunchApplied)}
                                                                title={isLunchApplied
                                                                    ? "Descuento de almuerzo aplicado: SÍ (clic para cambiar)"
                                                                    : "Descuento de almuerzo: NO (clic para forzar)"}
                                                                className={`w-5 h-5 mx-auto rounded-md border flex items-center justify-center transition-all ${
                                                                    isLunchApplied
                                                                        ? 'bg-green-500 border-green-600 text-white shadow-[0_0_8px_rgba(34,197,94,0.35)] hover:scale-105'
                                                                        : 'bg-slate-50 border-slate-300 hover:border-slate-400 text-transparent hover:scale-105'
                                                                }`}
                                                            >
                                                                <Check size={12} strokeWidth={2.5} />
                                                            </button>
                                                        );
                                                    })()
                                                ) : (
                                                    <span className="text-gray-300 text-xs">-</span>
                                                )}
                                            </td>
                                            
                                            {/* Columna Comentario Admin */}
                                            <td className="py-4 px-1 text-center w-24">
                                                {(log.tipo === 'Entrada' || log.tipo === 'Salida') ? (
                                                    <button
                                                        onClick={() => startEditComment(log)}
                                                        title={log.comentarioAdmin 
                                                            ? `Comentario: "${log.comentarioAdmin}" (clic para editar)`
                                                            : "Agregar comentario"
                                                        }
                                                        className={`w-5 h-5 mx-auto rounded-md border flex items-center justify-center transition-all ${
                                                            log.comentarioAdmin
                                                                ? 'bg-green-500 border-green-600 text-white shadow-[0_0_8px_rgba(34,197,94,0.35)] hover:scale-105'
                                                                : 'bg-slate-50 border-slate-300 hover:border-slate-400 text-transparent hover:scale-105'
                                                        }`}
                                                    >
                                                        <Check size={12} strokeWidth={2.5} />
                                                    </button>
                                                ) : (
                                                    <span className="text-gray-300 text-xs">-</span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    <div className="p-4 bg-gray-50 flex justify-between items-center border-t">
                        <p className="text-xs text-gray-500">Página {pageNumber}</p>
                        <div className="flex gap-2">
                            <button onClick={() => setPageNumber(1)} disabled={pageNumber === 1} className="px-3 py-1 bg-white border rounded text-xs">Inicio</button>
                            <button onClick={() => setPageNumber(p => Math.max(1, p - 1))} disabled={pageNumber === 1} className="flex items-center gap-1 px-3 py-1 bg-white border rounded text-xs"><ChevronLeft size={14} /> Ant.</button>
                            <button onClick={() => setPageNumber(p => p + 1)} disabled={!hasMore} className="flex items-center gap-1 px-3 py-1 bg-blue-600 text-white rounded text-xs font-bold">Sig. <ChevronRight size={14} /></button>
                        </div>
                    </div>
                </div>

                {/* Entrada Manual al Final */}
                <div className="bg-white rounded-xl shadow-2xl p-6 mt-8 border-l-4 border-blue-500">
                    <h3 className="text-blue-700 font-bold flex items-center gap-2 mb-4">
                        <FileText size={20} />
                        Entrada Manual de Datos
                    </h3>
                    <form onSubmit={handleManualEntry} className="flex flex-wrap gap-4 items-end">
                        {/* Email */}
                        <div className="flex-1 min-w-[180px]">
                            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Usuario (Email)</label>
                            <input
                                type="text"
                                placeholder="ej: faus@bot.com"
                                value={mUser}
                                onChange={e => {
                                    setMUser(e.target.value);
                                    if (mUserError) setMUserError('');
                                }}
                                onBlur={() => {
                                    const emailNormalized = mUser.toLowerCase().trim();
                                    if (emailNormalized && !employeesMap[emailNormalized]) {
                                        setMUserError('Usuario inexistente');
                                    } else {
                                        setMUserError('');
                                    }
                                }}
                                className={`w-full h-[42px] px-3 border rounded-lg text-sm transition-colors ${
                                    mUserError ? 'border-red-500 focus:ring-red-400 bg-red-50 text-red-950 font-semibold' : 'border-gray-300 focus:ring-blue-400'
                                }`}
                                required
                            />
                            {mUserError && (
                                <p className="text-red-600 text-[11px] mt-1.5 font-bold flex items-center gap-1 animate-pulse">
                                    ⚠️ {mUserError}
                                </p>
                            )}
                        </div>
                        {/* Evento */}
                        <div className="w-[120px]">
                            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Evento</label>
                            <select
                                value={mType}
                                onChange={e => setMType(e.target.value)}
                                className="w-full h-[42px] px-3 border rounded-lg text-sm bg-white"
                            >
                                <option value="Entrada">Entrada</option>
                                <option value="Salida">Salida</option>
                                {rutaActive && (
                                    <>
                                        <option value="En Cliente">Llegada Cliente (Visita)</option>
                                        <option value="En Tránsito">Salida Cliente (Visita)</option>
                                    </>
                                )}
                            </select>
                        </div>
                        {/* Fecha */}
                        <div className="w-[160px]">
                            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Fecha</label>
                            <input
                                type="date"
                                value={mDate}
                                onChange={e => setMDate(e.target.value)}
                                className="w-full h-[42px] px-3 border rounded-lg text-sm"
                                required
                            />
                        </div>
                        {/* Hora 12h con AM/PM */}
                        <div>
                            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Hora</label>
                            <div className="flex items-center gap-1 h-[42px]">
                                <select
                                    value={mHour}
                                    onChange={e => setMHour(e.target.value)}
                                    className="w-[58px] h-full px-1 border rounded-lg text-sm bg-white text-center"
                                >
                                    {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')).map(h => (
                                        <option key={h} value={h}>{h}</option>
                                    ))}
                                </select>
                                <span className="font-bold text-gray-400 text-base select-none">:</span>
                                <select
                                    value={mMinute}
                                    onChange={e => setMMinute(e.target.value)}
                                    className="w-[58px] h-full px-1 border rounded-lg text-sm bg-white text-center"
                                >
                                    {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0')).map(m => (
                                        <option key={m} value={m}>{m}</option>
                                    ))}
                                </select>
                                <select
                                    value={mAmPm}
                                    onChange={e => setMAmPm(e.target.value)}
                                    className="w-[60px] h-full px-1 border rounded-lg text-sm bg-white font-bold text-blue-600 text-center"
                                >
                                    <option value="AM">AM</option>
                                    <option value="PM">PM</option>
                                </select>
                            </div>
                        </div>
                        {/* Razón */}
                        <div className="flex-1 min-w-[200px]">
                            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Observación</label>
                            <input
                                type="text"
                                placeholder="ej: Olvió registrar al llegar"
                                value={mReason}
                                onChange={e => setMReason(e.target.value)}
                                className="w-full h-[42px] px-3 border rounded-lg text-sm"
                            />
                        </div>
                        {/* Botón */}
                        <button
                            type="submit"
                            disabled={mSaving}
                            className="h-[42px] px-6 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 flex items-center gap-2 whitespace-nowrap"
                        >
                            {mSaving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />} Adicionar
                        </button>
                    </form>
                </div>

            </div>
        </div >
    );
}
