// src/pages/Admin.jsx  (refactorizado)
// Este componente ahora solo se encarga de mostrar la UI y manejar estado.
// Toda la lógica de Firestore vive en /services.

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Calendar, Trash2, ChevronLeft, ChevronRight, AlertTriangle, Lock } from 'lucide-react';
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

const PAGE_SIZE = 100;

export default function Admin() {
    const [logs, setLogs] = useState([]);
    const [allLogs, setAllLogs] = useState([]); // cache completo para paginación en cliente
    const [loading, setLoading] = useState(true);
    const [exporting, setExporting] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [pageNumber, setPageNumber] = useState(1);
    const [hasMore, setHasMore] = useState(true);

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

    // ─── Exportar CSV ────────────────────────────────────────────────────────
    const exportToCSV = async () => {
        setExporting(true);
        try {
            // Filtrar logs según rango (sin ir a Firestore de nuevo)
            const filtered = (startDate || endDate)
                ? filterLogsByDateRange(allLogs, startDate, endDate) // ← servicio
                : allLogs;

            if (filtered.length === 0) {
                alert('No hay registros en el rango seleccionado.');
                return;
            }

            const employeesMap = await getEmployeesMap(); // ← servicio
            const dayFormatter = new Intl.DateTimeFormat('es-ES', { weekday: 'long' });

            const headers = ['Usuario', 'Nombres', 'Apellidos', 'Dia', 'Fecha', 'Hora', 'Localidad'];
            const csvRows = [headers.join(',')];

            filtered.forEach(log => {
                let diaNombre = 'N/A';
                const d = parseSpanishDate(log.fecha);
                if (d) {
                    diaNombre = dayFormatter.format(d);
                    diaNombre = diaNombre.charAt(0).toUpperCase() + diaNombre.slice(1);
                }

                const emailKey = (log.usuario || '').toLowerCase().trim();
                const emp = employeesMap[emailKey] || { firstName: '', lastName: '' };

                const row = [
                    log.usuario || '',
                    `"${emp.firstName}"`,
                    `"${emp.lastName}"`,
                    diaNombre,
                    log.fecha || '',
                    log.hora || '',
                    `"${(log.localidad || '').replace(/"/g, '""')}"`
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
                ? `asistencia_${startDate.replace(/-/g, '')}_${endDate.replace(/-/g, '')}_${ts}.csv`
                : `asistencia_${ts}.csv`;

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

    // ─── Render ──────────────────────────────────────────────────────────────
    return (
        <div className="min-h-screen bg-gray-50 p-6">
            <div className="max-w-6xl mx-auto">
                <div className="flex justify-between items-center mb-8">
                    <h1 className="text-3xl font-bold text-gray-800">Centro de Datos</h1>
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
                            className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
                        >
                            Volver
                        </button>
                    </div>
                </div>

                {/* Exportación */}
                <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
                    <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                        <Download size={24} />
                        Exportar Registros a CSV
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

            </div>
        </div>
    );
}
