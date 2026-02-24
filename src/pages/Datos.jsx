// src/pages/Datos.jsx
// Este componente ahora solo se encarga de mostrar la UI y manejar estado.
// Toda la lógica de Firestore vive en /services.

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Calendar, Trash2, ChevronLeft, ChevronRight, AlertTriangle, TriangleAlert, Image, Loader2, UserMinus, FileText } from 'lucide-react';
import DeleteEmployeeModal from '../components/DeleteEmployeeModal';
import { listPhotosByFilter, downloadPhotosAsZip } from '../services/storageService';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebaseConfig';

// ─── Definición de campos opcionales ─────────
const FIELD_DEFS = [
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
    { key: 'direccion', label: 'Dirección de residencia', type: 'text', group: 'Contacto' },
    { key: 'telefono', label: 'Teléfono personal', type: 'tel', group: 'Contacto' },
    { key: 'correoPersonal', label: 'Correo electrónico personal', type: 'email', group: 'Contacto' },
    { key: 'contactoEmergenciaNombre', label: 'Contacto emergencia (Nombre)', type: 'text', group: 'Contacto' },
    { key: 'contactoEmergenciaTelefono', label: 'Contacto emergencia (Tel.)', type: 'text', group: 'Contacto' },
    { key: 'cargo', label: 'Cargo o posición', type: 'text', group: 'Laboral' },
    { key: 'departamento', label: 'Departamento / Área', type: 'text', group: 'Laboral' },
    { key: 'tipoContrato', label: 'Tipo de contrato', type: 'text', group: 'Laboral' },
    { key: 'salario', label: 'Salario / Remuneración', type: 'text', group: 'Laboral' },
    { key: 'horario', label: 'Horario de trabajo', type: 'text', group: 'Laboral' },
    { key: 'nivelEstudios', label: 'Nivel educativo', type: 'text', group: 'Otros' },
    { key: 'certificaciones', label: 'Certificaciones relevantes', type: 'text', group: 'Otros' },
    { key: 'tallaCamisa', label: 'Talla de camisa/polo', type: 'text', group: 'Otros' },
    { key: 'tallaPantalon', label: 'Talla de pantalón', type: 'text', group: 'Otros' }
];
import { useAuth } from '../contexts/AuthContext';

// ✅ Importamos desde los servicios, no desde firebase directamente
import {
    getAllAttendanceLogs,
    paginateLogs,
    deleteAttendanceLog,
    bulkDeleteByDateRange,
    bulkDeleteIncidentsByDateRange,
    filterLogsByDateRange,
    parseSpanishDate
} from '../services/attendanceService';

import {
    getEmployeesMap,
    checkAndRestoreEmployees
} from '../services/employeeService';

import { collection, getDocs, query, where, orderBy, getDoc, doc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { exportToExcelHTML } from '../utils/exportUtils';

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
    const [incidentCsvUserFilter, setIncidentCsvUserFilter] = useState('');
    const [deletingIncidents, setDeletingIncidents] = useState(false);

    // CSV Asistencia export
    const [csvUserFilter, setCsvUserFilter] = useState('');
    const [exportFormatAttendance, setExportFormatAttendance] = useState('csv');

    // Módulo Gestión Empleados (Borrar, Exportar)
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [filterEmail, setFilterEmail] = useState('');
    const [exportingEmployees, setExportingEmployees] = useState(false);
    const [exportFormatEmployees, setExportFormatEmployees] = useState('csv');

    const [exportFormatIncidents, setExportFormatIncidents] = useState('csv');

    // Descargador de fotos
    const [photoTipo, setPhotoTipo] = useState('ambos');
    const [photoDesde, setPhotoDesde] = useState('');
    const [photoHasta, setPhotoHasta] = useState('');
    const [photoFiltroUser, setPhotoFiltroUser] = useState('');
    const [photoSearching, setPhotoSearching] = useState(false);
    const [photoProgress, setPhotoProgress] = useState({ current: 0, total: 0 });
    const [photoMsg, setPhotoMsg] = useState('');
    const [foundPhotos, setFoundPhotos] = useState([]); // Nueva lista de resultados
    const [cleaningStorage, setCleaningStorage] = useState(false);
    const [storageConfig, setStorageConfig] = useState(null);
    const [employeesMap, setEmployeesMap] = useState({});



    const navigate = useNavigate();
    const { isAdminAuthenticated, currentUser } = useAuth();

    // ─── Carga inicial ───────────────────────────────────────────────────────
    useEffect(() => {
        if (!isAdminAuthenticated) {
            navigate('/login');
            return;
        }
        loadLogs();
        loadStorageConfigAndClean();
        checkAndRestoreEmployees().catch(console.error);
    }, [isAdminAuthenticated, currentUser]);

    // ─── Cargar Settings de Storage y Limpiar Automáticamente ─────────────────
    const loadStorageConfigAndClean = async () => {
        try {
            const snap = await getDoc(doc(db, 'settings', 'employeeFields'));
            let settings = { retentionAsistencia: 3, retentionIncidentes: 18, saveAsistencia: true, saveIncidentes: true };
            if (snap.exists()) {
                const d = snap.data();
                settings = {
                    retentionAsistencia: d.storage_retentionAsistencia ?? 3,
                    retentionIncidentes: d.storage_retentionIncidentes ?? 18,
                    saveAsistencia: d.storage_saveAsistencia !== false,
                    saveIncidentes: d.storage_saveIncidentes !== false
                };
            }
            setStorageConfig(settings);

            // Ejecutar limpieza silenciosa si está encendido al menos uno
            if (settings.saveAsistencia || settings.saveIncidentes) {
                // Importación dinámica para evitar ciclos si storageService no está listo
                const { cleanOldPhotos } = await import('../services/storageService');
                cleanOldPhotos({
                    asistencia: settings.retentionAsistencia,
                    incidentes: settings.retentionIncidentes
                }).then(deleted => {
                    if (deleted > 0) console.log(`🧹 Autolimpieza borró ${deleted} fotos antiguas.`);
                }).catch(err => console.error("Error Autolimpieza:", err));
            }
        } catch (err) {
            console.error("Error cargando Storage Config en Datos:", err);
        }
    };

    const handleManualCleanup = async () => {
        if (!storageConfig) return;
        if (!window.confirm(`¿Ejecutar limpieza manual de fotos más antiguas de ${storageConfig.retentionAsistencia} meses (asistencia) y ${storageConfig.retentionIncidentes} meses (incidentes)?`)) return;

        setCleaningStorage(true);
        try {
            const { cleanOldPhotos } = await import('../services/storageService');
            const deleted = await cleanOldPhotos({
                asistencia: storageConfig.retentionAsistencia,
                incidentes: storageConfig.retentionIncidentes
            });
            alert(`✅ Limpieza completada. Se liberó espacio de ${deleted} fotos.`);
        } catch (err) {
            alert('❌ Error en la limpieza: ' + err.message);
        } finally {
            setCleaningStorage(false);
        }
    };

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
            const map = await getEmployeesMap();
            setEmployeesMap(map);

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

    // ─── Exportar empleados ───────────────────────────────────────────────────
    const exportEmployeesToCSV = async () => {
        setExportingEmployees(true);
        try {
            // 1. Obtener usuarios de Firebase Auth
            const getUsersListFn = httpsCallable(functions, 'getUsersList');
            const result = await getUsersListFn();
            let authUsers = result.data.users;
            if (!authUsers || authUsers.length === 0) { alert('No hay empleados para exportar.'); return; }

            // 2. Filtrar por email si se especificó uno
            if (filterEmail.trim()) {
                const needle = filterEmail.trim().toLowerCase();
                authUsers = authUsers.filter(emp =>
                    (emp.email || '').toLowerCase().includes(needle)
                );
                if (authUsers.length === 0) {
                    alert(`No se encontró ningún empleado con el correo "${filterEmail.trim()}".`);
                    return;
                }
            }

            // 3. Obtener datos adicionales de Firestore (nombre, apellido y campos opcionales)
            const fsSnap = await getDocs(collection(db, 'employees'));
            const fsMap = {};
            fsSnap.forEach(d => {
                const data = d.data();
                if (data.email) fsMap[data.email.toLowerCase()] = data;
            });

            // 4. Determinar qué campos opcionales tienen datos en al menos un empleado
            const activeOptionalKeys = FIELD_DEFS
                .filter(({ key }) => authUsers.some(u => {
                    const fs = fsMap[(u.email || '').toLowerCase()];
                    return fs && fs[key] !== undefined && fs[key] !== '';
                }))
                .map(({ key, label }) => ({ key, label }));

            // 5. Construir cabecera dinámica
            const headers = [
                'Email/ID', 'Nombres', 'Apellidos',
                'Fecha de Creacion', 'Ultimo Acceso', 'UID',
                ...activeOptionalKeys.map(f => f.label),
            ];

            // 6. Construir filas
            const rows = [];
            authUsers.forEach(emp => {
                const fs = fsMap[(emp.email || '').toLowerCase()] || {};
                const created = emp.creationTime ? new Date(emp.creationTime).toLocaleString('es-ES') : 'N/A';
                const lastLogin = emp.lastSignInTime ? new Date(emp.lastSignInTime).toLocaleString('es-ES') : 'N/A';

                const row = [
                    emp.email || '',
                    fs.firstName || '',
                    fs.lastName || '',
                    created,
                    lastLogin,
                    emp.uid || '',
                    ...activeOptionalKeys.map(({ key }) => fs[key] || ''),
                ];
                rows.push(row);
            });

            const now = new Date();
            const ts = now.toISOString().slice(0, 16).replace(/[-:T]/g, '');

            if (exportFormatEmployees === 'xls') {
                exportToExcelHTML(`empleados_auth_${ts}.xls`, headers, rows);
            } else {
                const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
                const csvRows = [headers.join(',')];
                rows.forEach(r => csvRows.push(r.map(escape).join(',')));
                const blob = new Blob(['\ufeff' + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
                const link = document.createElement('a');
                link.setAttribute('href', URL.createObjectURL(blob));
                link.setAttribute('download', `empleados_auth_${ts}.csv`);
                link.style.visibility = 'hidden';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }
        } catch (err) {
            console.error('Error exportando empleados:', err);
            alert('Error al exportar empleados: ' + err.message);
        } finally {
            setExportingEmployees(false);
        }
    };

    // ─── Exportar CSV (por turno: entrada+salida en una fila) ─────────────────
    const exportToCSV = async () => {
        setExporting(true);
        try {
            // 1. Obtener registros en el rango seleccionado
            let filtered = (startDate || endDate)
                ? filterLogsByDateRange(allLogs, startDate, endDate)
                : allLogs;

            // 1.5 Aplicar filtro de usuario/dominio si existe
            if (csvUserFilter.trim() !== '') {
                const searchStr = csvUserFilter.trim().toLowerCase();
                filtered = filtered.filter(log => (log.usuario || '').toLowerCase().includes(searchStr));
            }

            if (filtered.length === 0) {
                alert('No hay registros con esos filtros.');
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
            const rows = [];

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
                    emp.firstName || '',
                    emp.lastName || '',
                    diaNombre,
                    entry?.fecha || '-',
                    entry?.hora || '-',
                    entry?.localidad || '-',
                    exit?.fecha || '-',
                    exit?.hora || '-',
                    exit?.localidad || '-',
                    horasTrabajadas
                ];
                rows.push(row);
            });

            const filterPart = csvUserFilter ? `_${csvUserFilter.replace(/[@.]/g, '')}` : '';
            const ts = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');

            if (exportFormatAttendance === 'xls') {
                const fileName = startDate && endDate
                    ? `turnos_${startDate.replace(/-/g, '')}_${endDate.replace(/-/g, '')}${filterPart}_${ts}.xls`
                    : `turnos${filterPart}_${ts}.xls`;
                exportToExcelHTML(fileName, headers, rows);
            } else {
                const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
                const csvRows = [headers.join(',')];
                rows.forEach(r => csvRows.push(r.map(escape).join(',')));

                const csvContent = '\ufeff' + csvRows.join('\n');
                const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');

                const fileName = startDate && endDate
                    ? `turnos_${startDate.replace(/-/g, '')}_${endDate.replace(/-/g, '')}${filterPart}_${ts}.csv`
                    : `turnos${filterPart}_${ts}.csv`;

                link.setAttribute('href', url);
                link.setAttribute('download', fileName);
                link.style.visibility = 'hidden';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }

        } catch (error) {
            console.error('Error exportando CSV:', error);
            alert('Error al exportar. Intenta de nuevo.');
        } finally {
            setExporting(false);
        }
    };


    // ─── Exportar Novedades CSV ─────────────────────────────────────────────
    const exportIncidentsToCSV = async () => {
        setExportingIncidents(true);
        try {
            const snap = await getDocs(query(collection(db, 'incidents'), orderBy('timestamp', 'asc')));
            let incidents = snap.docs.map(d => ({ id: d.id, ...d.data() }));

            // Filtrar por rango si se especificaron fechas
            if (incidentStartDate || incidentEndDate) {
                incidents = incidents.filter(inc => {
                    if (!inc.fecha) return false; // si no hay fecha y pidieron filtro, lo ideal es ignorarlo o incluirlo? el user dijo "exportar todos si no hay fechas", si HAY fechas y el log no tiene, se ignora.
                    const d = parseSpanishDate(inc.fecha);
                    if (!d) return false;
                    const t = d.getTime();
                    const start = incidentStartDate ? new Date(incidentStartDate + 'T00:00:00').getTime() : 0;
                    const end = incidentEndDate ? new Date(incidentEndDate + 'T23:59:59').getTime() : Infinity;
                    return t >= start && t <= end;
                });
            }

            // Filtrar por usuario/dominio
            if (incidentCsvUserFilter.trim() !== '') {
                const searchStr = incidentCsvUserFilter.trim().toLowerCase();
                incidents = incidents.filter(inc => (inc.usuario || '').toLowerCase().includes(searchStr));
            }

            if (incidents.length === 0) {
                alert('No hay novedades con esos filtros.');
                return;
            }

            const headers = ['Usuario', 'Fecha', 'Hora', 'Localidad', 'Descripcion'];
            const rows = [];

            incidents.forEach(inc => {
                const row = [
                    inc.usuario || '',
                    inc.fecha || '',
                    inc.hora || '',
                    inc.localidad || '',
                    inc.descripcion || '',
                ];
                rows.push(row);
            });

            const ts = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
            const filterPart = incidentCsvUserFilter ? `_${incidentCsvUserFilter.replace(/[@.]/g, '')}` : '';

            if (exportFormatIncidents === 'xls') {
                const fileName = incidentStartDate && incidentEndDate
                    ? `incidentes_${incidentStartDate.replace(/-/g, '')}_${incidentEndDate.replace(/-/g, '')}${filterPart}_${ts}.xls`
                    : `incidentes${filterPart}_${ts}.xls`;
                exportToExcelHTML(fileName, headers, rows);
            } else {
                const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
                const csvRows = [headers.join(',')];
                rows.forEach(r => csvRows.push(r.map(escape).join(',')));

                const csvContent = '\ufeff' + csvRows.join('\n');
                const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');

                const fileName = incidentStartDate && incidentEndDate
                    ? `incidentes_${incidentStartDate.replace(/-/g, '')}_${incidentEndDate.replace(/-/g, '')}${filterPart}_${ts}.csv`
                    : `incidentes${filterPart}_${ts}.csv`;

                link.setAttribute('href', url);
                link.setAttribute('download', fileName);
                link.style.visibility = 'hidden';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }
        } catch (error) {
            console.error('Error exportando novedades:', error);
            alert('Error al exportar novedades. Intenta de nuevo.');
        } finally {
            setExportingIncidents(false);
        }
    };

    // ─── Borrar Novedades por Rango ─────────────────────────────────────────
    const handleBulkDeleteIncidents = async () => {
        if (!incidentStartDate || !incidentEndDate) {
            alert('Debes seleccionar fecha de inicio y fin para borrar en lote.');
            return;
        }

        const confirm1 = window.confirm(`⚠️ PELIGRO: Vas a borrar PERMANENTEMENTE las NOVEDADES desde ${incidentStartDate} hasta ${incidentEndDate}.\n\nEsta acción NO se puede deshacer.\n¿Deseas continuar?`);
        if (!confirm1) return;

        const confirm2 = window.confirm('¿Estás ABSOLUTAMENTE SEGURO? Todas las novedades seleccionadas desaparecerán para siempre.');
        if (!confirm2) return;

        setDeletingIncidents(true);
        try {
            const deletedCount = await bulkDeleteIncidentsByDateRange(incidentStartDate, incidentEndDate);

            if (deletedCount > 0) {
                // Notificar éxito sin forzar recarga de los "entradas y salidas" (no afecta la vista principal)
                alert(`✅ Se borraron ${deletedCount} registros de novedades exitosamente.`);
            } else {
                alert('No se encontraron novedades en ese rango de fechas para borrar.');
            }
        } catch (error) {
            console.error('Error en borrado masivo de novedades:', error);
            alert('Hubo un error al borrar los registros. Revisa la consola para más detalles.');
        } finally {
            setDeletingIncidents(false);
        }
    };

    // ─── Render ──────────────────────────────────────────────────────────────
    return (
        <div className="min-h-screen bg-gray-50 p-6">
            <div className="max-w-6xl mx-auto">
                <div className="flex justify-between items-center mb-8">
                    <h1 className="text-3xl font-bold text-gray-800 flex items-baseline gap-2">
                        Centro de Datos
                        <span className="text-sm font-normal text-gray-500 bg-gray-200 px-2 py-0.5 rounded-full">v{import.meta.env.VITE_APP_VERSION || '1.3.1'}</span>
                    </h1>
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
                                    <th className="p-4 font-semibold text-gray-600">Nombre y Apellido</th>
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
                                    <tr><td colSpan="7" className="p-8 text-center">Cargando registros...</td></tr>
                                ) : logs.map((log) => {
                                    const emp = employeesMap[log.usuario] || { firstName: '-', lastName: '' };
                                    return (
                                        <tr key={log.id} className="hover:bg-gray-50 transition">
                                            <td className="p-4 font-bold text-gray-900">{emp.firstName} {emp.lastName}</td>
                                            <td className="p-4 font-medium text-gray-600">{log.usuario}</td>
                                            <td className="p-4">
                                                <span className={`px-2 py-1 rounded text-xs font-bold ${log.tipo === 'Entrada' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                    {log.tipo}
                                                </span>
                                            </td>
                                            <td className="p-4 text-gray-600">{log.fecha}</td>
                                            <td className="p-4 text-gray-600">{log.hora}</td>
                                            <td className="p-4 text-gray-500 text-sm">
                                                <div
                                                    className="overflow-hidden whitespace-nowrap overflow-ellipsis resize-x min-w-[120px] max-w-[300px] border-b border-dashed border-gray-300 pb-1"
                                                    title={log.localidad}
                                                >
                                                    {log.localidad}
                                                </div>
                                            </td>
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
                                    )
                                })}
                                {logs.length === 0 && !loading && (
                                    <tr><td colSpan="7" className="p-8 text-center text-gray-500">No hay registros aún.</td></tr>
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
                <div className="bg-white rounded-xl shadow-lg p-6 mb-6 border-l-4 border-blue-500 relative">
                    <div className="flex justify-between items-start mb-4">
                        <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                            <Image size={24} />
                            Exportar Fotos de Asistencia e Incidentes
                        </h2>
                        {storageConfig && (storageConfig.saveAsistencia || storageConfig.saveIncidentes) && (
                            <button
                                onClick={handleManualCleanup}
                                disabled={cleaningStorage}
                                className="text-xs bg-red-50 text-red-600 px-3 py-1.5 rounded-lg border border-red-200 hover:bg-red-100 font-bold flex items-center gap-1 transition shadow-sm"
                            >
                                {cleaningStorage ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                                Limpiar fotos antiguas
                            </button>
                        )}
                    </div>

                    {!storageConfig ? (
                        <div className="flex justify-center p-4"><Loader2 size={24} className="animate-spin text-blue-500" /></div>
                    ) : (
                        <>
                            {(!storageConfig.saveAsistencia && !storageConfig.saveIncidentes) ? (
                                <div className="p-4 bg-gray-50 border-2 border-dashed border-gray-300 rounded-xl text-center">
                                    <p className="text-gray-500 font-bold mb-1">El almacenamiento de fotos está desactivado.</p>
                                    <p className="text-xs text-gray-400">Actívalo en la pestaña de Configuración para poder guardar y descargar fotos.</p>
                                </div>
                            ) : (
                                <>
                                    {/* Mostrar qué está desactivado si solo es uno */}
                                    {(!storageConfig.saveAsistencia || !storageConfig.saveIncidentes) && (
                                        <div className="mb-4 bg-yellow-50 text-yellow-800 p-3 rounded-lg border border-yellow-200 text-sm flex gap-2 items-center">
                                            <AlertTriangle size={18} className="shrink-0" />
                                            <span>
                                                El guardado de fotos de <strong>{!storageConfig.saveAsistencia ? 'Asistencia' : 'Incidentes'}</strong> está desactivado.
                                                Solo podrás descargar las de <strong>{storageConfig.saveAsistencia ? 'Asistencia' : 'Incidentes'}</strong>.
                                            </span>
                                        </div>
                                    )}

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
                                            disabled={photoSearching || !photoDesde || !photoHasta || (photoTipo === 'asistencia' && !storageConfig.saveAsistencia) || (photoTipo === 'incidentes' && !storageConfig.saveIncidentes)}
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
                                                    setPhotoMsg(`Descargando ZIP con ${lista.length} fotos...`);

                                                    const { zipBlob, addedCount } = await downloadPhotosAsZip(lista, (cur, tot) => {
                                                        setPhotoProgress({ current: cur, total: tot });
                                                    });

                                                    const nombre = `fotos_${photoTipo}_${photoDesde}_al_${photoHasta}${photoFiltroUser ? '_' + photoFiltroUser.replace('@', '').replace(/\./g, '-') : ''}.zip`;
                                                    const url = URL.createObjectURL(zipBlob);
                                                    const link = document.createElement('a');
                                                    link.href = url;
                                                    link.download = nombre;
                                                    link.click();
                                                    URL.revokeObjectURL(url);
                                                    setPhotoMsg(`✅ ZIP descargado: ${addedCount} fotos válidas`);
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
                                                onChange={e => {
                                                    // Evitar seleccionar un tipo desactivado si es posible
                                                    const val = e.target.value;
                                                    if (val === 'asistencia' && !storageConfig.saveAsistencia) return;
                                                    if (val === 'incidentes' && !storageConfig.saveIncidentes) return;
                                                    setPhotoTipo(val);
                                                }}
                                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            >
                                                {(storageConfig.saveAsistencia && storageConfig.saveIncidentes) && <option value="ambos">Asistencia + Novedades</option>}
                                                {storageConfig.saveAsistencia && <option value="asistencia">Solo Asistencia</option>}
                                                {storageConfig.saveIncidentes && <option value="incidentes">Solo Novedades</option>}
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
                                </>
                            )}
                        </>
                    )}
                </div>

                {/* --- NUEVO BLOQUE: GESTIÓN DE EMPLEADOS --- */}
                <div className="bg-white rounded-xl shadow-lg p-6 mb-6 border-l-4 border-emerald-500 relative">
                    <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2 mb-4">
                        <UserMinus size={24} className="text-emerald-600" />
                        Gestión de Empleados
                    </h2>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-2">Filtrar exportación por correo (opcional)</label>
                            <input
                                type="text"
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                                placeholder="Ej: juan.perez — vacío exporta todos"
                                value={filterEmail}
                                onChange={(e) => setFilterEmail(e.target.value)}
                            />
                        </div>
                        <div className="md:col-span-1">
                            <button type="button" onClick={() => setShowDeleteModal(true)}
                                className="flex items-center justify-center gap-2 w-full py-2.5 px-4 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 font-bold transition shadow-sm h-full">
                                <Trash2 size={18} /> Borrar Empleado
                            </button>
                        </div>
                        <div className="md:col-span-1 flex gap-2 w-full h-full">
                            <select
                                value={exportFormatEmployees}
                                onChange={(e) => setExportFormatEmployees(e.target.value)}
                                className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                                title="Formato de archivo"
                            >
                                <option value="csv">CSV</option>
                                <option value="xls">Excel (XLS)</option>
                            </select>
                            <button type="button" onClick={exportEmployeesToCSV} disabled={exportingEmployees}
                                className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 font-bold transition shadow-sm disabled:opacity-50">
                                {exportingEmployees ? <Loader2 size={18} className="animate-spin" /> : <FileText size={18} />}
                                Exportar
                            </button>
                        </div>
                    </div>
                </div>

                {/* Exportación */}
                <div className="bg-white rounded-xl shadow-lg p-6 mb-6 border-l-4 border-green-500">
                    <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                        <Download size={24} />
                        Exportar Registros de Entrada y Salida a CSV
                    </h2>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end mb-2">
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
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Usuario o Dominio</label>
                            <input
                                type="text"
                                placeholder="Filtro opcional"
                                value={csvUserFilter}
                                onChange={e => setCsvUserFilter(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>
                        <div className="flex gap-2 w-full">
                            <select
                                value={exportFormatAttendance}
                                onChange={(e) => setExportFormatAttendance(e.target.value)}
                                className="px-3 py-2 h-[42px] border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-green-500"
                                title="Formato de archivo"
                            >
                                <option value="csv">CSV</option>
                                <option value="xls">Excel (XLS)</option>
                            </select>
                            <button
                                onClick={exportToCSV}
                                disabled={exporting}
                                className="flex-1 px-4 py-2 h-[42px] bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition"
                            >
                                <Download size={20} />
                                {exporting ? 'Exportando...' : 'Exportar'}
                            </button>
                        </div>
                    </div>

                    <p className="text-sm text-gray-500 mt-3">
                        {startDate || endDate || csvUserFilter
                            ? `Exportará registros ${startDate ? `desde ${startDate}` : ''} ${endDate ? `hasta ${endDate}` : ''} ${csvUserFilter ? `(Contiene: ${csvUserFilter})` : ''}`
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

                {/* Exportación de Novedades */}
                <div className="bg-white rounded-xl shadow-lg p-6 mb-6 border-l-4 border-orange-400">
                    <h2 className="text-xl font-bold text-orange-700 mb-4 flex items-center gap-2">
                        <TriangleAlert size={24} />
                        Exportar Registro de Novedades a CSV
                    </h2>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                <Calendar size={16} className="inline mr-1" />
                                Fecha Inicio
                            </label>
                            <input
                                type="date"
                                value={incidentStartDate}
                                onChange={(e) => setIncidentStartDate(e.target.value)}
                                className="w-full px-4 py-2 border border-orange-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
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
                                className="w-full px-4 py-2 border border-orange-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Usuario o Dominio</label>
                            <input
                                type="text"
                                placeholder="Filtro opcional"
                                value={incidentCsvUserFilter}
                                onChange={e => setIncidentCsvUserFilter(e.target.value)}
                                className="w-full px-4 py-2 border border-orange-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                            />
                        </div>
                        <div className="flex gap-2 w-full">
                            <select
                                value={exportFormatIncidents}
                                onChange={(e) => setExportFormatIncidents(e.target.value)}
                                className="px-3 py-2 h-[42px] border border-orange-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-orange-500"
                                title="Formato de archivo"
                            >
                                <option value="csv">CSV</option>
                                <option value="xls">Excel (XLS)</option>
                            </select>
                            <button
                                onClick={exportIncidentsToCSV}
                                disabled={exportingIncidents}
                                className="flex-1 px-4 py-2 h-[42px] bg-orange-600 text-white font-bold rounded-lg hover:bg-orange-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition"
                            >
                                <Download size={20} />
                                {exportingIncidents ? 'Exportando...' : 'Exportar'}
                            </button>
                        </div>
                    </div>

                    <p className="text-sm text-gray-500 mt-3">
                        {incidentStartDate || incidentEndDate || incidentCsvUserFilter
                            ? `Exportará novedades ${incidentStartDate ? `desde ${incidentStartDate}` : ''} ${incidentEndDate ? `hasta ${incidentEndDate}` : ''} ${incidentCsvUserFilter ? `(Contiene: ${incidentCsvUserFilter})` : ''}`
                            : 'Exportará todas las novedades disponibles'}
                    </p>

                    <div className="mt-8 pt-6 border-t border-red-100">
                        <h3 className="text-red-600 font-bold flex items-center gap-2 mb-4">
                            <AlertTriangle size={20} />
                            Zona de Peligro: Limpieza de Base de Datos de Novedades
                        </h3>
                        <div className="flex items-center gap-4">
                            <p className="text-sm text-gray-600 flex-1">
                                Borra permanentemente las novedades del rango seleccionado ({incidentStartDate || '...'} - {incidentEndDate || '...'}).
                            </p>
                            <button
                                onClick={handleBulkDeleteIncidents}
                                disabled={deletingIncidents || !incidentStartDate || !incidentEndDate}
                                className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 font-bold transition flex items-center gap-2 disabled:opacity-50"
                            >
                                <Trash2 size={18} />
                                {deletingIncidents ? 'Borrando...' : 'Borrar Rango'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <DeleteEmployeeModal isOpen={showDeleteModal} onClose={() => setShowDeleteModal(false)} />
        </div>
    );
}
