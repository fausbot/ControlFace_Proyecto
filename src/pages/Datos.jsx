// src/pages/Datos.jsx
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2, ChevronLeft, ChevronRight, Loader2, FileText, CheckCircle, Search, X } from 'lucide-react';
import { db } from '../firebaseConfig';
import { collection, query, where, getDocs, doc, setDoc, getDoc, deleteDoc } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';

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
    const [mSaving, setMSaving] = useState(false);

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

        // Cargar flag ruta_active
        const fetchSettings = async () => {
            try {
                const docSnap = await getDoc(doc(db, 'settings', 'employeeFields'));
                if (docSnap.exists() && docSnap.data().ruta_active === true) {
                    setRutaActive(true);
                }
            } catch (err) { console.warn("No se pudo cargar config ruta:", err) }
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
            
            // Para Entrada/Salida normales, la regla es 1 por día general.
            // Para Visitas (En Cliente / En Tránsito), pueden haber MUCHAS por día.
            if (mType === 'Entrada' || mType === 'Salida') {
                const q = query(
                    collection(db, "attendance"),
                    where("usuario", "==", mUser.toLowerCase().trim()),
                    where("fecha", "==", dateStr),
                    where("tipo", "==", mType)
                );
                const snap = await getDocs(q);

                if (!snap.empty) {
                    if (!window.confirm(`Ya existe una ${mType} en esta fecha. ¿Desea sobreescribirla?`)) {
                        setMSaving(false);
                        return;
                    }
                    for (const docSnap of snap.docs) {
                        await deleteAttendanceLog(docSnap.id);
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
            const docData = {
                usuario: mUser.toLowerCase().trim(),
                tipo: mType,
                fecha: dateStr,
                hora: timeStr,
                localidad: "ENTRADA MANUAL DE DATOS",
                timestamp: new Date(`${mDate}T${mHour}:${mMinute}:00`)
            };
            await setDoc(doc(db, "attendance", deterministicDocId), docData);

            // Si es modo visita, crear el registro espejo en 'visitas'
            if (mType === 'En Cliente' || mType === 'En Tránsito') {
                const visitaDocData = {
                    ...docData,
                    tipo: mType === 'En Cliente' ? 'Llegada Cliente' : 'Salida Cliente',
                    mode: 'visita',
                    observacion: "Añadido manualmente",
                };
                await setDoc(doc(db, "visitas", deterministicDocId), visitaDocData);
            }

            alert('✅ Registro adicionado correctamente.');
            setMUser(''); setMDate('');
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

    const handleDelete = async (id) => {
        if (!window.confirm('¿Eliminar este registro permanentemente?')) return;
        try {
            await deleteAttendanceLog(id);
            setLogs(logs.filter(log => log.id !== id));
            setAllLogs(allLogs.filter(log => log.id !== id));
        } catch (error) {
            console.error(error);
            alert('No se pudo borrar el registro.');
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
                        <button onClick={() => navigate('/dashboard')} className="px-6 py-2.5 bg-white text-gray-800 font-bold flex items-center gap-2 rounded-xl border border-gray-100 shadow-lg hover:bg-gray-50 transition whitespace-nowrap">
                            Volver
                        </button>
                    </div>
                </div>


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
                                    <th className="p-4 text-center">Borrar</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {loading ? (
                                    <tr><td colSpan="7" className="p-8 text-center text-gray-400">Cargando registros...</td></tr>
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
                                            <td className="p-4 text-center">
                                                <button onClick={() => handleDelete(log.id)} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition">
                                                    <Trash2 size={16} />
                                                </button>
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
                                onChange={e => setMUser(e.target.value)}
                                className="w-full h-[42px] px-3 border rounded-lg text-sm"
                                required
                            />
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
