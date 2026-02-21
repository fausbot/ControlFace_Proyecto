// src/pages/Datos.jsx
// Este componente ahora solo se encarga de mostrar la UI y manejar estado.
// Toda la lógica de Firestore vive en /services.

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Calendar, Trash2, ChevronLeft, ChevronRight, AlertTriangle, TriangleAlert, Image, Loader2 } from 'lucide-react';
import { listPhotosByFilter, downloadPhotosAsZip } from '../services/storageService';
import { useAuth } from '../contexts/AuthContext';

// ✅ Importamos desde los servicios, no desde firebase directamente
import {
    getAllAttendanceLogs,
    paginateLogs,
    deleteAttendanceLog,
    bulkDeleteByDateRange,
    filterLogsByDateRange,
    parseSpanishDate
} from '../services/attendanceService';

import {
    getEmployeesMap,
    checkAndRestoreEmployees
} from '../services/employeeService';

import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db } from '../firebaseConfig';

const PAGE_SIZE = 100;

export default function Datos() {
    const [logs, setLogs] = useState([]);
    const [allLogs, setAllLogs] = useState([]); // cache completo para paginación en cliente
    const [loading, setLoading] = useState(true);
    const [exporting, setExporting] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [pageNumber, setPageNumber] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    // Incidentes export
    const [exportingIncidents, setExportingIncidents] = useState(false);
    const [incidentStartDate, setIncidentStartDate] = useState('');
    const [incidentEndDate, setIncidentEndDate] = useState('');

    // Descargador de fotos
    const [photoTipo, setPhotoTipo] = useState('ambos');
    const [photoDesde, setPhotoDesde] = useState('');
    const [photoHasta, setPhotoHasta] = useState('');
    const [photoFiltroUser, setPhotoFiltroUser] = useState('');
    const [photoSearching, setPhotoSearching] = useState(false);
    const [photoProgress, setPhotoProgress] = useState({ current: 0, total: 0 });
    const [photoMsg, setPhotoMsg] = useState('');
    const [foundPhotos, setFoundPhotos] = useState([]); // Nueva lista de resultados

    const navigate = useNavigate();
    const { isAdminAuthenticated, currentUser } = useAuth();

    // ─── Carga inicial ───────────────────────────────────────────────────────
    useEffect(() => {
        if (!isAdminAuthenticated) {
            navigate('/login');
            return;
        }
        loadLogs();
        checkAndRestoreEmployees().catch(console.error);
    }, [isAdminAuthenticated, currentUser]);

    // ─── Recalcular página cuando cambia pageNumber ──────────────────────────
    useEffect(() => {
        if (allLogs.length === 0) return;
        const { data, hasMore: more } = paginateLogs(allLogs, pageNumber, PAGE_SIZE);
        setLogs(data);
        setHasMore(more);
    }, [pageNumber, allLogs]);

    const loadLogs = async () => {
        setLoading(true);
        try {
            const all = await getAllAttendanceLogs(); // ← servicio, no Firestore directo
            setAllLogs(all);
            const { data, hasMore: more } = paginateLogs(all, 1, PAGE_SIZE);
            setLogs(data);
            setHasMore(more);
            setPageNumber(1);
        } catch (error) {
            console.error('Error fetching logs:', error);
            alert('Error al cargar registros. Revisa la consola.');
        } finally {
            setLoading(false);
        }
    };

    // ─── Eliminar un registro ────────────────────────────────────────────────
    const handleDelete = async (id) => {
        if (!window.confirm('¿Eliminar este registro permanentemente?')) return;
        try {
            await deleteAttendanceLog(id); // ← servicio
            setLogs(logs.filter(log => log.id !== id));
            setAllLogs(allLogs.filter(log => log.id !== id));
        } catch (error) {
            console.error('Error al borrar:', error);
            alert('No se pudo borrar el registro.');
        }
    };

    // ─── Borrado masivo por rango de fechas ──────────────────────────────────
    const handleBulkDelete = async () => {
        if (!startDate || !endDate) {
            alert('Selecciona un rango de fechas para limpiar datos.');
            return;
        }
        if (!window.confirm(`⚠️ Se borrarán TODOS los registros entre ${startDate} y ${endDate}. ¿Continuar?`)) return;

        setDeleting(true);
        try {
            const count = await bulkDeleteByDateRange(startDate, endDate); // ← servicio
            if (count === 0) {
                alert('No se encontraron registros en ese rango.');
                return;
            }
            alert(`Se han borrado ${count} registros con éxito.`);
            await loadLogs();
        } catch (error) {
            console.error('Error en borrado masivo:', error);
            alert('Error al realizar la limpieza.');
        } finally {
            setDeleting(false);
        }
    };

    // ─── Exportar CSV (por turno: entrada+salida en una fila) ─────────────────
    const exportToCSV = async () => {
        setExporting(true);
        try {
            // 1. Obtener registros en el rango seleccionado
            const filtered = (startDate || endDate)
                ? filterLogsByDateRange(allLogs, startDate, endDate)
                : allLogs;

            if (filtered.length === 0) {
                alert('No hay registros en el rango seleccionado.');
                return;
            }

            const employeesMap = await getEmployeesMap();
            const dayFormatter = new Intl.DateTimeFormat('es-ES', { weekday: 'long' });

            // 2. Ordenar todos los registros de más antiguo a más reciente
            const sorted = [...filtered].sort((a, b) => {
                const tA = (a.timestamp && a.timestamp.toMillis) ? a.timestamp.toMillis() : 0;
                const tB = (b.timestamp && b.timestamp.toMillis) ? b.timestamp.toMillis() : 0;
                return tA - tB;
            });

            // 3. Agrupar registros por usuario
            const byUser = {};
            sorted.forEach(log => {
                const key = (log.usuario || '').toLowerCase().trim();
                if (!byUser[key]) byUser[key] = [];
                byUser[key].push(log);
            });

            // 4. Emparejar entradas con salidas por usuario
            const shifts = [];
            Object.entries(byUser).forEach(([email, records]) => {
                let pendingEntry = null;
                records.forEach(rec => {
                    if (rec.tipo === 'Entrada') {
                        if (pendingEntry) {
                            // Entrada sin salida previa → turno incompleto
                            shifts.push({ entry: pendingEntry, exit: null, email });
                        }
                        pendingEntry = rec;
                    } else if (rec.tipo === 'Salida') {
                        if (pendingEntry) {
                            shifts.push({ entry: pendingEntry, exit: rec, email });
                            pendingEntry = null;
                        } else {
                            // Salida huérfana (sin entrada previa)
                            shifts.push({ entry: null, exit: rec, email });
                        }
                    }
                });
                if (pendingEntry) {
                    // Entrada al final sin salida registrada
                    shifts.push({ entry: pendingEntry, exit: null, email });
                }
            });

            // 5. Ordenar turnos por timestamp de referencia (entrada o salida)
            shifts.sort((a, b) => {
                const recA = a.entry || a.exit;
                const recB = b.entry || b.exit;
                const tA = (recA?.timestamp?.toMillis) ? recA.timestamp.toMillis() : 0;
                const tB = (recB?.timestamp?.toMillis) ? recB.timestamp.toMillis() : 0;
                return tA - tB;
            });

            // 6. Construir filas del CSV
            const headers = [
                'Usuario', 'Nombres', 'Apellidos',
                'Dia Entrada', 'Fecha Entrada', 'Hora Entrada', 'Localidad Entrada',
                'Fecha Salida', 'Hora Salida', 'Localidad Salida',
                'Horas Trabajadas'
            ];
            const csvRows = [headers.join(',')];

            shifts.forEach(({ entry, exit, email }) => {
                const emailKey = email || '';
                const emp = employeesMap[emailKey] || { firstName: '', lastName: '' };

                // Día de la semana basado en la entrada (o salida si no hay entrada)
                let diaNombre = 'N/A';
                const refRec = entry || exit;
                if (refRec?.fecha) {
                    const d = parseSpanishDate(refRec.fecha);
                    if (d) {
                        diaNombre = dayFormatter.format(d);
                        diaNombre = diaNombre.charAt(0).toUpperCase() + diaNombre.slice(1);
                    }
                }

                // Calcular horas trabajadas usando Timestamps reales (maneja cruces de medianoche)
                let horasTrabajadas = 'Pendiente';
                if (entry && exit && entry.timestamp?.toMillis && exit.timestamp?.toMillis) {
                    const diffMs = exit.timestamp.toMillis() - entry.timestamp.toMillis();
                    if (diffMs >= 0) {
                        const totalSec = Math.floor(diffMs / 1000);
                        const hh = Math.floor(totalSec / 3600).toString().padStart(2, '0');
                        const mm = Math.floor((totalSec % 3600) / 60).toString().padStart(2, '0');
                        const ss = (totalSec % 60).toString().padStart(2, '0');
                        horasTrabajadas = `${hh}:${mm}:${ss}`;
                    } else {
                        horasTrabajadas = 'Error';
                    }
                } else if (!entry) {
                    horasTrabajadas = 'Sin Entrada';
                }

                const row = [
                    refRec?.usuario || '',
                    `"${emp.firstName}"`,
                    `"${emp.lastName}"`,
                    diaNombre,
                    entry?.fecha || '-',
                    entry?.hora || '-',
                    `"${(entry?.localidad || '-').replace(/"/g, '""')}"`,
                    exit?.fecha || '-',
                    exit?.hora || '-',
                    `"${(exit?.localidad || '-').replace(/"/g, '""')}"`,
                    horasTrabajadas
                ];
                csvRows.push(row.join(','));
            });

            // BOM para compatibilidad con Excel
            const csvContent = '\ufeff' + csvRows.join('\n');
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');

            const now = new Date();
            const ts = now.toISOString().slice(0, 16).replace(/[-:T]/g, '');
            const fileName = startDate && endDate
                ? `turnos_${startDate.replace(/-/g, '')}_${endDate.replace(/-/g, '')}_${ts}.csv`
                : `turnos_${ts}.csv`;

            link.setAttribute('href', url);
            link.setAttribute('download', fileName);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

        } catch (error) {
            console.error('Error exportando CSV:', error);
            alert('Error al exportar. Intenta de nuevo.');
        } finally {
            setExporting(false);
        }
    };


    // ─── Exportar Incidentes CSV ─────────────────────────────────────────────
    const exportIncidentsToCSV = async () => {
        setExportingIncidents(true);
        try {
            const snap = await getDocs(query(collection(db, 'incidents'), orderBy('timestamp', 'asc')));
            let incidents = snap.docs.map(d => ({ id: d.id, ...d.data() }));

            // Filtrar por rango si se especificaron fechas
            if (incidentStartDate || incidentEndDate) {
                incidents = incidents.filter(inc => {
                    if (!inc.fecha) return true;
                    const d = parseSpanishDate(inc.fecha);
                    if (!d) return true;
                    const t = d.getTime();
                    const start = incidentStartDate ? new Date(incidentStartDate + 'T00:00:00').getTime() : 0;
                    const end = incidentEndDate ? new Date(incidentEndDate + 'T23:59:59').getTime() : Infinity;
                    return t >= start && t <= end;
                });
            }

            if (incidents.length === 0) {
                alert('No hay incidentes en el rango seleccionado.');
                return;
            }

            const headers = ['Usuario', 'Fecha', 'Hora', 'Localidad', 'Descripcion'];
            const csvRows = [headers.join(',')];

            incidents.forEach(inc => {
                const row = [
                    inc.usuario || '',
                    inc.fecha || '',
                    inc.hora || '',
                    `"${(inc.localidad || '').replace(/"/g, '""')}"`,
                    `"${(inc.descripcion || '').replace(/"/g, '""')}"`,
                ];
                csvRows.push(row.join(','));
            });

            const csvContent = '\ufeff' + csvRows.join('\n');
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            const now = new Date();
            const ts = now.toISOString().slice(0, 16).replace(/[-:T]/g, '');
            const fileName = incidentStartDate && incidentEndDate
                ? `incidentes_${incidentStartDate.replace(/-/g, '')}_${incidentEndDate.replace(/-/g, '')}_${ts}.csv`
                : `incidentes_${ts}.csv`;
            link.setAttribute('href', url);
            link.setAttribute('download', fileName);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (error) {
            console.error('Error exportando incidentes:', error);
            alert('Error al exportar incidentes. Intenta de nuevo.');
        } finally {
            setExportingIncidents(false);
        }
    };

    // ─── Render ──────────────────────────────────────────────────────────────
    return (
        <div className="min-h-screen bg-gray-50 p-6">
            <div className="max-w-6xl mx-auto">
                <div className="flex justify-between items-center mb-8">
                    <h1 className="text-3xl font-bold text-gray-800">Centro de Datos</h1>
                    <div className="flex gap-3">
                        <button
                            onClick={() => navigate('/dashboard')}
                            className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
                        >
                            Volver
                        </button>
                    </div>
                </div>

                {/* Tabla */}
                <div className="bg-white rounded-xl shadow-lg overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-gray-100 border-b border-gray-200">
                                <tr>
                                    <th className="p-4 font-semibold text-gray-600">Usuario</th>
                                    <th className="p-4 font-semibold text-gray-600">Tipo</th>
                                    <th className="p-4 font-semibold text-gray-600">Fecha</th>
                                    <th className="p-4 font-semibold text-gray-600">Hora</th>
                                    <th className="p-4 font-semibold text-gray-600">Localidad</th>
                                    <th className="p-4 font-semibold text-gray-600 text-center">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {loading ? (
                                    <tr><td colSpan="6" className="p-8 text-center">Cargando registros...</td></tr>
                                ) : logs.map((log) => (
                                    <tr key={log.id} className="hover:bg-gray-50 transition">
                                        <td className="p-4 font-medium text-gray-900">{log.usuario}</td>
                                        <td className="p-4">
                                            <span className={`px-2 py-1 rounded text-xs font-bold ${log.tipo === 'Entrada' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                {log.tipo}
                                            </span>
                                        </td>
                                        <td className="p-4 text-gray-600">{log.fecha}</td>
                                        <td className="p-4 text-gray-600">{log.hora}</td>
                                        <td className="p-4 text-gray-500 text-sm">{log.localidad}</td>
                                        <td className="p-4 text-center">
                                            <button
                                                onClick={() => handleDelete(log.id)}
                                                className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition"
                                                title="Eliminar Registro"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {logs.length === 0 && !loading && (
                                    <tr><td colSpan="6" className="p-8 text-center text-gray-500">No hay registros aún.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Paginación */}
                    <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-between items-center">
                        <p className="text-sm text-gray-500">
                            Mostrando {logs.length} registros (Página {pageNumber})
                        </p>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setPageNumber(1)}
                                disabled={loading || pageNumber === 1}
                                className="px-4 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition"
                            >
                                Primera Página
                            </button>
                            <button
                                onClick={() => setPageNumber(p => Math.max(1, p - 1))}
                                disabled={loading || pageNumber === 1}
                                className="flex items-center gap-1 px-4 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition"
                            >
                                <ChevronLeft size={16} /> Anterior
                            </button>
                            <button
                                onClick={() => setPageNumber(p => p + 1)}
                                disabled={loading || !hasMore}
                                className="flex items-center gap-1 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition font-bold"
                            >
                                Siguiente <ChevronRight size={16} />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Exportar Fotos */}
                <div className="bg-white rounded-xl shadow-lg p-6 mb-6 border-l-4 border-blue-500">
                    <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                        <Image size={24} />
                        Exportar Fotos de Asistencia e Incidentes
                    </h2>

                    {/* Fila 1: Fecha Inicio, Fecha Fin, Botón */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end mb-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                <Calendar size={16} className="inline mr-1" />
                                Fecha Inicio
                            </label>
                            <input
                                type="date"
                                value={photoDesde}
                                onChange={e => setPhotoDesde(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                <Calendar size={16} className="inline mr-1" />
                                Fecha Fin
                            </label>
                            <input
                                type="date"
                                value={photoHasta}
                                onChange={e => setPhotoHasta(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>
                        <button
                            id="btn-exportar-fotos"
                            disabled={photoSearching || !photoDesde || !photoHasta}
                            onClick={async () => {
                                if (!photoDesde || !photoHasta) {
                                    setPhotoMsg('⚠️ Selecciona el rango de fechas.');
                                    return;
                                }
                                setPhotoSearching(true);
                                setPhotoMsg('Buscando fotos...');
                                setPhotoProgress({ current: 0, total: 0 });
                                try {
                                    const desde = new Date(photoDesde + 'T00:00:00');
                                    const hasta = new Date(photoHasta + 'T23:59:59');
                                    const lista = await listPhotosByFilter({
                                        tipo: photoTipo,
                                        desde,
                                        hasta,
                                        filtroUsuario: photoFiltroUser,
                                    });
                                    if (lista.length === 0) {
                                        setPhotoMsg('No se encontraron fotos con esos filtros.');
                                        return;
                                    }
                                    setPhotoMsg(`Encontradas ${lista.length} fotos.`);
                                    setFoundPhotos(lista); // Guardar para descarga directa
                                    setPhotoProgress({ current: 0, total: lista.length });

                                    // OPCIONAL: Iniciar ZIP automáticamente o dejarlo manual
                                    // Por ahora, dejamos que el usuario decida si bajar todo o uno por uno
                                    const nombre = `fotos_${photoTipo}_${photoDesde}_al_${photoHasta}${photoFiltroUser ? '_' + photoFiltroUser.replace('@', '').replace(/\./g, '-') : ''}.zip`;
                                    const url = URL.createObjectURL(zipBlob);
                                    const link = document.createElement('a');
                                    link.href = url;
                                    link.download = nombre;
                                    link.click();
                                    URL.revokeObjectURL(url);
                                    setPhotoMsg(`✅ ZIP descargado: ${lista.length} fotos`);
                                } catch (err) {
                                    console.error(err);
                                    setPhotoMsg('❌ Error: ' + err.message);
                                } finally {
                                    setPhotoSearching(false);
                                }
                            }}
                            className="px-6 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition"
                        >
                            {photoSearching
                                ? <><Loader2 size={20} className="animate-spin" /> Exportando...</>
                                : <><Download size={20} /> Exportar Fotos</>
                            }
                        </button>
                    </div>

                    {/* Fila 2: Tipo + Usuario/Dominio */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de foto</label>
                            <select
                                value={photoTipo}
                                onChange={e => setPhotoTipo(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            >
                                <option value="ambos">Asistencia + Incidentes</option>
                                <option value="asistencia">Solo Asistencia</option>
                                <option value="incidentes">Solo Incidentes</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Usuario o Dominio</label>
                            <input
                                type="text"
                                placeholder="juan@empresa.com  ó  @empresa.com"
                                value={photoFiltroUser}
                                onChange={e => setPhotoFiltroUser(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>
                    </div>

                    {/* Barra de progreso */}
                    {photoSearching && photoProgress.total > 0 && (
                        <div className="mt-2 mb-1">
                            <div className="w-full bg-gray-100 rounded-full h-2">
                                <div
                                    className="bg-blue-500 h-2 rounded-full transition-all"
                                    style={{ width: `${Math.round((photoProgress.current / photoProgress.total) * 100)}%` }}
                                />
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                                Descargando {photoProgress.current} / {photoProgress.total} fotos...
                            </p>
                        </div>
                    )}

                    {/* Mensaje */}
                    <p className="text-sm text-gray-600 mt-2 font-medium">
                        {photoMsg || (photoDesde || photoHasta
                            ? `Buscará fotos ${photoDesde ? `desde ${photoDesde}` : ''} ${photoHasta ? `hasta ${photoHasta}` : ''}`
                            : 'Selecciona un rango para buscar fotos')}
                    </p>

                    {/* Resultados de búsqueda (Descarga Directa) */}
                    {foundPhotos.length > 0 && (
                        <div className="mt-6 border-t border-gray-100 pt-4">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="font-bold text-gray-700 flex items-center gap-2">
                                    <Image size={18} className="text-blue-500" />
                                    Fotos encontradas ({foundPhotos.length})
                                </h3>
                                <button
                                    onClick={async () => {
                                        setPhotoSearching(true);
                                        setPhotoMsg('Generando ZIP...');
                                        try {
                                            const zipBlob = await downloadPhotosAsZip(foundPhotos, (cur, tot) => {
                                                setPhotoProgress({ current: cur, total: tot });
                                            });
                                            const nombre = `fotos_backup_${photoDesde}_al_${photoHasta}.zip`;
                                            const url = URL.createObjectURL(zipBlob);
                                            const link = document.createElement('a');
                                            link.href = url;
                                            link.download = nombre;
                                            link.click();
                                            URL.revokeObjectURL(url);
                                            setPhotoMsg(`✅ ZIP descargado con éxito`);
                                        } catch (e) {
                                            setPhotoMsg('❌ Error ZIP: ' + e.message);
                                        } finally {
                                            setPhotoSearching(false);
                                        }
                                    }}
                                    disabled={photoSearching}
                                    className="text-xs bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg border border-blue-200 hover:bg-blue-100 font-bold flex items-center gap-1 transition"
                                >
                                    <Download size={14} /> Descargar todo (ZIP)
                                </button>
                            </div>

                            <div className="max-h-60 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                                {foundPhotos.map((photo, idx) => (
                                    <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100 hover:border-blue-200 transition">
                                        <div className="flex flex-col">
                                            <span className="text-xs font-bold text-gray-700 truncate max-w-[200px] md:max-w-md">
                                                {photo.name}
                                            </span>
                                            <span className="text-[10px] text-gray-500">
                                                {photo.source === 'firestore' ? '✅ Registro OK' : '☁️ Solo Storage'} • {photo.path.split('/')[0]}
                                            </span>
                                        </div>
                                        <a
                                            href={photo.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            download={photo.name}
                                            className="p-2 bg-white text-blue-600 rounded-lg border border-blue-100 hover:bg-blue-50 transition shadow-sm"
                                            title="Descargar Foto Directa"
                                        >
                                            <Download size={16} />
                                        </a>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Exportación */}
                <div className="bg-white rounded-xl shadow-lg p-6 mb-6 border-l-4 border-green-500">
                    <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                        <Download size={24} />
                        Exportar Registros de Entrada y Salida a CSV
                    </h2>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                <Calendar size={16} className="inline mr-1" />
                                Fecha Inicio
                            </label>
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                <Calendar size={16} className="inline mr-1" />
                                Fecha Fin
                            </label>
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>
                        <button
                            onClick={exportToCSV}
                            disabled={exporting}
                            className="px-6 py-2 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition"
                        >
                            <Download size={20} />
                            {exporting ? 'Exportando...' : 'Exportar CSV'}
                        </button>
                    </div>

                    <p className="text-sm text-gray-500 mt-3">
                        {startDate || endDate
                            ? `Exportará registros ${startDate ? `desde ${startDate}` : ''} ${endDate ? `hasta ${endDate}` : ''}`
                            : 'Exportará todos los registros disponibles'}
                    </p>

                    <div className="mt-8 pt-6 border-t border-red-100">
                        <h3 className="text-red-600 font-bold flex items-center gap-2 mb-4">
                            <AlertTriangle size={20} />
                            Zona de Peligro: Limpieza de Base de Datos
                        </h3>
                        <div className="flex items-center gap-4">
                            <p className="text-sm text-gray-600 flex-1">
                                Borra permanentemente los registros del rango seleccionado ({startDate || '...'} - {endDate || '...'}).
                            </p>
                            <button
                                onClick={handleBulkDelete}
                                disabled={deleting || !startDate || !endDate}
                                className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 font-bold transition flex items-center gap-2 disabled:opacity-50"
                            >
                                <Trash2 size={18} />
                                {deleting ? 'Borrando...' : 'Borrar Rango'}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Exportación de Incidentes */}
                <div className="bg-white rounded-xl shadow-lg p-6 mb-6 border-l-4 border-orange-400">
                    <h2 className="text-xl font-bold text-orange-700 mb-4 flex items-center gap-2">
                        <TriangleAlert size={24} />
                        Exportar Registro de Incidentes a CSV
                    </h2>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                <Calendar size={16} className="inline mr-1" />
                                Fecha Inicio
                            </label>
                            <input
                                type="date"
                                value={incidentStartDate}
                                onChange={(e) => setIncidentStartDate(e.target.value)}
                                className="w-full px-4 py-2 border border-orange-300 rounded-lg focus:ring-2 focus:ring-orange-400 focus:border-transparent"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                <Calendar size={16} className="inline mr-1" />
                                Fecha Fin
                            </label>
                            <input
                                type="date"
                                value={incidentEndDate}
                                onChange={(e) => setIncidentEndDate(e.target.value)}
                                className="w-full px-4 py-2 border border-orange-300 rounded-lg focus:ring-2 focus:ring-orange-400 focus:border-transparent"
                            />
                        </div>
                        <button
                            onClick={exportIncidentsToCSV}
                            disabled={exportingIncidents}
                            className="px-6 py-2 bg-orange-500 text-white font-bold rounded-lg hover:bg-orange-600 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition"
                        >
                            <Download size={20} />
                            {exportingIncidents ? 'Exportando...' : 'Exportar CSV'}
                        </button>
                    </div>

                    <p className="text-sm text-gray-500 mt-3">
                        {incidentStartDate || incidentEndDate
                            ? `Exportará incidentes ${incidentStartDate ? `desde ${incidentStartDate}` : ''} ${incidentEndDate ? `hasta ${incidentEndDate}` : ''}`
                            : 'Exportará todos los incidentes disponibles'}
                    </p>
                </div>

            </div >
        </div >
    );
}

