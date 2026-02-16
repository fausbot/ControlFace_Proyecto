import React, { useEffect, useState } from 'react';
import { db } from '../firebaseConfig';
import { collection, query, orderBy, getDocs, limit, startAfter, deleteDoc, doc, writeBatch, where, serverTimestamp } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { Download, Calendar, Trash2, ChevronLeft, ChevronRight, AlertTriangle, Lock } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function Admin() {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [exporting, setExporting] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [lastDoc, setLastDoc] = useState(null);
    const [firstDoc, setFirstDoc] = useState(null);
    const [pageNumber, setPageNumber] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const navigate = useNavigate();
    const { isAdminAuthenticated, currentUser } = useAuth();
    const PAGE_SIZE = 100;

    const fetchLogs = async (direction = 'initial') => {
        setLoading(true);
        try {
            // SOLUCIÓN: Traer todos los registros sin ordenamiento en servidor
            // y ordenar en cliente para manejar registros con y sin timestamp
            const snapshot = await getDocs(collection(db, "attendance"));

            let allData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // Ordenar en cliente: priorizar timestamp, fallback a fecha/hora
            allData.sort((a, b) => {
                // Si ambos tienen timestamp, usar eso
                if (a.timestamp && b.timestamp) {
                    return b.timestamp.toMillis() - a.timestamp.toMillis();
                }
                // Si solo uno tiene timestamp, ese va primero
                if (a.timestamp) return -1;
                if (b.timestamp) return 1;

                // Fallback: comparar por fecha y hora como strings
                const dateTimeA = (a.fecha || '') + ' ' + (a.hora || '');
                const dateTimeB = (b.fecha || '') + ' ' + (b.hora || '');
                return dateTimeB.localeCompare(dateTimeA);
            });

            // Implementar paginación manual en cliente
            const startIndex = (pageNumber - 1) * PAGE_SIZE;
            const endIndex = startIndex + PAGE_SIZE;
            const paginatedData = allData.slice(startIndex, endIndex);

            setLogs(paginatedData);
            setHasMore(endIndex < allData.length);

        } catch (error) {
            console.error("Error fetching logs:", error);
            alert("Error al cargar registros. Revisa la consola.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!isAdminAuthenticated) {
            navigate('/login');
            return;
        }

        if (!currentUser) {
            alert('Debes iniciar sesión primero como empleado antes de acceder al panel de administración.');
            navigate('/login');
            return;
        }

        fetchLogs();
        checkAndRestoreEmployees();
    }, [isAdminAuthenticated, currentUser]);

    const checkAndRestoreEmployees = async () => {
        try {
            const empSnap = await getDocs(collection(db, "employees"));
            if (empSnap.empty) {
                console.log("Detectada lista de empleados vacía. Iniciando auto-restauración...");

                // 1. Obtener correos en la cola de borrado para NO restaurarlos
                const queueSnap = await getDocs(collection(db, "deletionQueue"));
                const deletedEmails = new Set();
                queueSnap.forEach(doc => {
                    if (doc.data().email) deletedEmails.add(doc.data().email.toLowerCase().trim());
                });

                // 2. Obtener correos del historial de asistencia
                const attSnap = await getDocs(collection(db, "attendance"));
                const uniqueEmails = new Set();
                attSnap.forEach(doc => {
                    const email = doc.data().usuario?.toLowerCase().trim();
                    if (email && !deletedEmails.has(email)) {
                        uniqueEmails.add(email);
                    }
                });

                if (uniqueEmails.size > 0) {
                    const batch = writeBatch(db);
                    uniqueEmails.forEach(email => {
                        const newDocRef = doc(collection(db, "employees"));
                        batch.set(newDocRef, {
                            email: email,
                            fechaCreacion: serverTimestamp(),
                            estado: 'activo'
                        });
                    });
                    await batch.commit();
                    console.log(`Se han restaurado ${uniqueEmails.size} empleados desde la historia de asistencia (excluyendo borrados).`);
                }
            }
        } catch (err) {
            console.error("Error en auto-restauración:", err);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('¿Está seguro de que desea eliminar este registro permanentemente?')) return;

        try {
            await deleteDoc(doc(db, "attendance", id));
            setLogs(logs.filter(log => log.id !== id));
        } catch (error) {
            console.error("Error al borrar:", error);
            alert("No se pudo borrar el registro.");
        }
    };

    const handleBulkDelete = async () => {
        if (!startDate || !endDate) {
            alert('Por favor selecciona un rango de fechas para limpiar datos.');
            return;
        }

        if (!window.confirm(`⚠️ ¡ATENCION! Se borraran TODOS los registros entre el ${startDate} y el ${endDate}. Esta accion no se puede deshacer. ¿Desea continuar?`)) {
            return;
        }

        setDeleting(true);
        try {
            // Traer todos los registros sin ordenamiento específico
            const snapshot = await getDocs(collection(db, "attendance"));

            const toDelete = snapshot.docs.filter(doc => {
                const data = doc.data();
                let logDate = null;
                if (data.timestamp) {
                    logDate = data.timestamp.toDate();
                } else if (data.fecha) {
                    logDate = parseSpanishDate(data.fecha);
                }

                if (!logDate) return false;
                const start = new Date(startDate);
                const end = new Date(endDate);
                // Ajustar end al final del día
                end.setHours(23, 59, 59, 999);

                return logDate >= start && logDate <= end;
            });


            if (toDelete.length === 0) {
                alert("No se encontraron registros en ese rango.");
                return;
            }

            const batch = writeBatch(db);
            toDelete.forEach(docSnap => {
                batch.delete(docSnap.ref);
            });

            await batch.commit();
            alert(`Se han borrado ${toDelete.length} registros con éxito.`);
            fetchLogs(); // Recargar

        } catch (error) {
            console.error("Error en borrado masivo:", error);
            alert("Error al realizar la limpieza.");
        } finally {
            setDeleting(false);
        }
    };

    const parseSpanishDate = (dateStr) => {
        // Convierte "6/2/2026" a objeto Date
        const parts = dateStr.split('/');
        if (parts.length !== 3) return null;
        const day = parseInt(parts[0]);
        const month = parseInt(parts[1]) - 1; // Meses en JS son 0-indexed
        const year = parseInt(parts[2]);
        return new Date(year, month, day);
    };

    const exportToCSV = () => {
        setExporting(true);

        try {
            // Filtrar por rango de fechas
            let filteredLogs = logs;

            if (startDate || endDate) {
                filteredLogs = logs.filter(log => {
                    const logDate = parseSpanishDate(log.fecha);
                    if (!logDate) return false;

                    const start = startDate ? new Date(startDate) : null;
                    const end = endDate ? new Date(endDate) : null;

                    if (start && logDate < start) return false;
                    if (end && logDate > end) return false;

                    return true;
                });
            }

            if (filteredLogs.length === 0) {
                alert('No hay registros en el rango de fechas seleccionado.');
                setExporting(false);
                return;
            }

            // Crear CSV
            const headers = ['Usuario', 'Tipo', 'Dia', 'Fecha', 'Hora', 'Localidad'];
            const csvRows = [headers.join(',')];

            const dayFormatter = new Intl.DateTimeFormat('es-ES', { weekday: 'long' });

            filteredLogs.forEach(log => {
                let diaNombre = 'N/A';
                if (log.fecha) {
                    const d = parseSpanishDate(log.fecha);
                    if (d) {
                        diaNombre = dayFormatter.format(d);
                        // Capitalizar primera letra
                        diaNombre = diaNombre.charAt(0).toUpperCase() + diaNombre.slice(1);
                    }
                }

                const row = [
                    log.usuario || '',
                    log.tipo || '',
                    diaNombre,
                    log.fecha || '',
                    log.hora || '',
                    `"${(log.localidad || '').replace(/"/g, '""')}"` // Escapar comillas
                ];
                csvRows.push(row.join(','));
            });

            // Añadir BOM para compatibilidad con Excel (tildes/UTF-8)
            const csvContent = "\ufeff" + csvRows.join('\n');

            // Descargar archivo
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);

            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            const timestamp = `${year}${month}${day}${hours}${minutes}`;

            const fileName = startDate && endDate
                ? `asistencia_${startDate.replace(/-/g, '')}_${endDate.replace(/-/g, '')}_${timestamp}.csv`
                : `asistencia_${timestamp}.csv`;

            link.setAttribute('href', url);
            link.setAttribute('download', fileName);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

        } catch (error) {
            console.error('Error exportando CSV:', error);
            alert('Error al exportar. Por favor, intenta de nuevo.');
        } finally {
            setExporting(false);
        }
    };

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

                {/* Sección de Exportación */}
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
                                Borra permanentemente los registros del rango de fechas seleccionado arriba ({startDate || '...'} - {endDate || '...'}).
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


                {/* Tabla de Registros */}
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

                    {/* Pagination Controls */}
                    <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-between items-center">
                        <p className="text-sm text-gray-500">
                            Mostrando {logs.length} registros (Página {pageNumber})
                        </p>
                        <div className="flex gap-2">
                            <button
                                onClick={() => {
                                    setPageNumber(1);
                                    fetchLogs('initial');
                                }}
                                disabled={loading || pageNumber === 1}
                                className="px-4 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition"
                            >
                                Primera Página
                            </button>
                            <button
                                onClick={() => {
                                    setPageNumber(prev => Math.max(1, prev - 1));
                                }}
                                disabled={loading || pageNumber === 1}
                                className="flex items-center gap-1 px-4 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition"
                            >
                                <ChevronLeft size={16} />
                                Anterior
                            </button>
                            <button
                                onClick={() => {
                                    setPageNumber(prev => prev + 1);
                                }}
                                disabled={loading || !hasMore}
                                className="flex items-center gap-1 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition font-bold"
                            >
                                Siguiente
                                <ChevronRight size={16} />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
