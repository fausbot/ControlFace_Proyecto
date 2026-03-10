// src/pages/Datos.jsx
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2, ChevronLeft, ChevronRight, Loader2, FileText, CheckCircle } from 'lucide-react';
import { db } from '../firebaseConfig';
import { collection, query, where, addDoc, getDocs } from 'firebase/firestore';
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

        // Suscripción en tiempo real
        setLoading(true);
        const unsubscribe = subscribeToAttendanceLogs((updatedLogs) => {
            setAllLogs(updatedLogs);
            setLoading(false);
        });

        // Limpieza al desmontar
        return () => unsubscribe();
    }, [adminAccess, navigate]);

    // (eliminado loadlogs y variables que no se usan)

    // Recalcular página cuando cambia pageNumber
    useEffect(() => {
        if (allLogs.length === 0) return;
        const { data, hasMore: more } = paginateLogs(allLogs, pageNumber, PAGE_SIZE);
        setLogs(data);
        setHasMore(more);
    }, [pageNumber, allLogs]);

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

        try {
            setMSaving(true);
            const q = query(
                collection(db, "attendance"),
                where("usuario", "==", mUser.toLowerCase().trim()),
                where("fecha", "==", dateStr),
                where("tipo", "==", mType)
            );
            const snap = await getDocs(q);

            if (!snap.empty) {
                if (!window.confirm('Ya existe un registro con estos datos. ¿Desea sobreescribirlo?')) {
                    setMSaving(false);
                    return;
                }
                for (const docSnap of snap.docs) {
                    await deleteAttendanceLog(docSnap.id);
                }
            }

            await addDoc(collection(db, "attendance"), {
                usuario: mUser.toLowerCase().trim(),
                tipo: mType,
                fecha: dateStr,
                hora: timeStr,
                localidad: "ENTRADA MANUAL DE DATOS",
                timestamp: new Date(`${mDate}T${mHour}:${mMinute}:00`)
            });

            alert('✅ Registro adicionado correctamente.');
            setMUser(''); setMDate('');
            const h = new Date().getHours();
            setMHour(String(h % 12 || 12).padStart(2, '0'));
            setMMinute(String(new Date().getMinutes()).padStart(2, '0'));
            setMAmPm(h < 12 ? 'AM' : 'PM');
            // No hace falta llamar a loadLogs() porque onSnapshot detectará el nuevo doc
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
                <div className="flex justify-between items-center mb-8">
                    <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-2">
                        <FileText size={30} className="text-blue-600" />
                        Visor de Asistencia
                        <div className="flex items-center gap-1.5 px-2 py-0.5 bg-red-50 text-red-600 rounded-full border border-red-100 animate-pulse ml-2">
                            <span className="w-1.5 h-1.5 bg-red-600 rounded-full"></span>
                            <span className="text-[10px] font-bold uppercase tracking-wider">Live</span>
                        </div>
                        <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-mono ml-1 border border-gray-200">v{import.meta.env.VITE_APP_VERSION}</span>
                    </h1>
                    <button onClick={() => navigate('/dashboard')} className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 transition">Volver</button>
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
                                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${log.tipo === 'Entrada' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                    {log.tipo}
                                                </span>
                                            </td>
                                            <td className="p-4">{log.fecha}</td>
                                            <td className="p-4">{log.hora}</td>
                                            <td className="p-4 text-xs text-gray-400 max-w-[200px] truncate" title={log.localidad}>{log.localidad}</td>
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
