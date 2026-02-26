// src/pages/Informes.jsx
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Calendar, Trash2, AlertTriangle, TriangleAlert, Image, Loader2, UserMinus, FileText } from 'lucide-react';
import DeleteEmployeeModal from '../components/DeleteEmployeeModal';
import { listPhotosByFilter, downloadPhotosAsZip, cleanOldPhotos } from '../services/storageService';
import { httpsCallable } from 'firebase/functions';
import { functions, db } from '../firebaseConfig';
import { exportToExcelHTML } from '../utils/exportUtils';
import { calculateLaborHours, parseStringDate } from '../utils/timeCalculator';
import { useAuth } from '../contexts/AuthContext';
import { collection, getDocs, query, orderBy, getDoc, doc } from 'firebase/firestore';

// ✅ Importamos desde los servicios
import {
    bulkDeleteByDateRange,
    bulkDeleteIncidentsByDateRange,
    filterLogsByDateRange,
    parseSpanishDate,
    getAllAttendanceLogs
} from '../services/attendanceService';

import { getEmployeesMap } from '../services/employeeService';

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

export default function Informes() {
    const [allLogs, setAllLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [exporting, setExporting] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    // Incidentes export
    const [exportingIncidents, setExportingIncidents] = useState(false);
    const [incidentStartDate, setIncidentStartDate] = useState('');
    const [incidentEndDate, setIncidentEndDate] = useState('');
    const [incidentCsvUserFilter, setIncidentCsvUserFilter] = useState('');
    const [deletingIncidents, setDeletingIncidents] = useState(false);

    // CSV Asistencia export
    const [csvUserFilter, setCsvUserFilter] = useState('');
    const [exportFormatAttendance, setExportFormatAttendance] = useState('csv');
    const [attendanceReportType, setAttendanceReportType] = useState('estandar');
    const [timeConfig, setTimeConfig] = useState({});

    // Módulo Gestión Empleados
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
    const [cleaningStorage, setCleaningStorage] = useState(false);
    const [storageConfig, setStorageConfig] = useState(null);

    const navigate = useNavigate();
    const { adminAccess, currentUser } = useAuth();

    useEffect(() => {
        if (!adminAccess['/informes']) {
            navigate('/login');
            return;
        }
        loadInitialData();
    }, [adminAccess]);

    const loadInitialData = async () => {
        setLoading(true);
        try {
            // Cargar logs para exportación
            const logs = await getAllAttendanceLogs();
            setAllLogs(logs);

            // Cargar config
            const snap = await getDoc(doc(db, 'settings', 'employeeFields'));
            if (snap.exists()) {
                const d = snap.data();
                setStorageConfig({
                    retentionAsistencia: d.storage_retentionAsistencia ?? 3,
                    retentionIncidentes: d.storage_retentionIncidentes ?? 18,
                    saveAsistencia: d.storage_saveAsistencia !== false,
                    saveIncidentes: d.storage_saveIncidentes !== false
                });
                setTimeConfig(d);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleManualCleanup = async () => {
        if (!storageConfig) return;
        if (!window.confirm(`¿Ejecutar limpieza manual de fotos más antiguas de ${storageConfig.retentionAsistencia} meses (asistencia) y ${storageConfig.retentionIncidentes} meses (incidentes)?`)) return;

        setCleaningStorage(true);
        try {
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

    const handleBulkDelete = async () => {
        if (!startDate || !endDate) {
            alert('Selecciona un rango de fechas para limpiar datos.');
            return;
        }
        if (!window.confirm(`⚠️ Se borrarán TODOS los registros entre ${startDate} y ${endDate}. ¿Continuar?`)) return;

        setDeleting(true);
        try {
            const count = await bulkDeleteByDateRange(startDate, endDate);
            alert(`Se han borrado ${count} registros con éxito.`);
            loadInitialData();
        } catch (error) {
            console.error(error);
            alert('Error al realizar la limpieza.');
        } finally {
            setDeleting(false);
        }
    };

    const handleBulkDeleteIncidents = async () => {
        if (!incidentStartDate || !incidentEndDate) {
            alert('Debes seleccionar fecha de inicio y fin para borrar en lote.');
            return;
        }
        const confirm1 = window.confirm(`⚠️ PELIGRO: Vas a borrar PERMANENTEMENTE las NOVEDADES desde ${incidentStartDate} hasta ${incidentEndDate}.\n\nEsta acción NO se puede deshacer.\n¿Deseas continuar?`);
        if (!confirm1) return;

        setDeletingIncidents(true);
        try {
            const deletedCount = await bulkDeleteIncidentsByDateRange(incidentStartDate, incidentEndDate);
            alert(`✅ Se borraron ${deletedCount} registros de novedades exitosamente.`);
        } catch (error) {
            console.error(error);
            alert('Hubo un error al borrar los registros.');
        } finally {
            setDeletingIncidents(false);
        }
    };

    const exportEmployeesToCSV = async () => {
        setExportingEmployees(true);
        try {
            const getUsersListFn = httpsCallable(functions, 'getUsersList');
            const result = await getUsersListFn();
            let authUsers = result.data.users;
            if (!authUsers || authUsers.length === 0) { alert('No hay empleados para exportar.'); return; }

            if (filterEmail.trim()) {
                const needle = filterEmail.trim().toLowerCase();
                authUsers = authUsers.filter(emp => (emp.email || '').toLowerCase().includes(needle));
                if (authUsers.length === 0) { alert(`No se encontró ningún empleado con el correo "${filterEmail.trim()}".`); return; }
            }

            const fsSnap = await getDocs(collection(db, 'employees'));
            const fsMap = {};
            fsSnap.forEach(d => {
                const data = d.data();
                if (data.email) fsMap[data.email.toLowerCase()] = data;
            });

            const activeOptionalKeys = FIELD_DEFS
                .filter(({ key }) => authUsers.some(u => {
                    const fs = fsMap[(u.email || '').toLowerCase()];
                    return fs && fs[key] !== undefined && fs[key] !== '';
                }))
                .map(({ key, label }) => ({ key, label }));

            const headers = ['Email/ID', 'Nombres', 'Apellidos', 'Fecha de Creacion', 'Ultimo Acceso', 'UID', ...activeOptionalKeys.map(f => f.label)];
            const rows = authUsers.map(emp => {
                const fs = fsMap[(emp.email || '').toLowerCase()] || {};
                return [
                    emp.email || '', fs.firstName || '', fs.lastName || '',
                    emp.creationTime ? new Date(emp.creationTime).toLocaleString('es-ES') : 'N/A',
                    emp.lastSignInTime ? new Date(emp.lastSignInTime).toLocaleString('es-ES') : 'N/A',
                    emp.uid || '',
                    ...activeOptionalKeys.map(({ key }) => fs[key] || '')
                ];
            });

            const ts = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
            if (exportFormatEmployees === 'xlsx') {
                exportToExcelHTML(`empleados_${ts}.xlsx`, headers, rows);
            } else {
                const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
                const csvContent = '\ufeff' + [headers.join(','), ...rows.map(r => r.map(escape).join(','))].join('\n');
                const link = document.createElement('a');
                link.href = URL.createObjectURL(new Blob([csvContent], { type: 'text/csv;charset=utf-8;' }));
                link.download = `empleados_${ts}.csv`;
                link.click();
            }
        } catch (err) {
            console.error(err);
            alert('Error al exportar empleados.');
        } finally {
            setExportingEmployees(false);
        }
    };

    const exportToCSV = async () => {
        setExporting(true);
        try {
            let filtered = (startDate || endDate) ? filterLogsByDateRange(allLogs, startDate, endDate) : allLogs;
            if (csvUserFilter.trim()) {
                const searchStr = csvUserFilter.trim().toLowerCase();
                filtered = filtered.filter(log => (log.usuario || '').toLowerCase().includes(searchStr));
            }
            if (filtered.length === 0) { alert('No hay registros.'); return; }

            const employeesMap = await getEmployeesMap();
            const dayFormatter = new Intl.DateTimeFormat('es-ES', { weekday: 'long' });

            const sorted = [...filtered].sort((a, b) => {
                const dateA = parseStringDate(a.fecha, a.hora) || (a.timestamp ? a.timestamp.toDate() : new Date(0));
                const dateB = parseStringDate(b.fecha, b.hora) || (b.timestamp ? b.timestamp.toDate() : new Date(0));
                return dateA - dateB;
            });

            const byUser = {};
            sorted.forEach(log => {
                const key = (log.usuario || '').toLowerCase().trim();
                if (!byUser[key]) byUser[key] = [];
                byUser[key].push(log);
            });

            const shifts = [];
            Object.entries(byUser).forEach(([email, records]) => {
                let pendingEntry = null;
                records.forEach(rec => {
                    if (rec.tipo === 'Entrada') {
                        if (pendingEntry) shifts.push({ entry: pendingEntry, exit: null, email });
                        pendingEntry = rec;
                    } else if (rec.tipo === 'Salida') {
                        if (pendingEntry) { shifts.push({ entry: pendingEntry, exit: rec, email }); pendingEntry = null; }
                        else shifts.push({ entry: null, exit: rec, email });
                    }
                });
                if (pendingEntry) shifts.push({ entry: pendingEntry, exit: null, email });
            });

            let headers = [];
            let rows = [];

            if (attendanceReportType === 'estandar') {
                headers = ['Usuario', 'Nombres', 'Apellidos', 'Dia Entrada', 'Fecha Entrada', 'Hora Entrada', 'Localidad Entrada', 'Fecha Salida', 'Hora Salida', 'Localidad Salida', 'Almuerzo', 'Horas'];
                rows = shifts.map(({ entry, exit, email }) => {
                    const emp = employeesMap[email] || { firstName: '', lastName: '' };
                    let dia = '-';
                    if (entry?.fecha) {
                        const d = parseSpanishDate(entry.fecha);
                        dia = d ? dayFormatter.format(d) : '-';
                    }
                    let horasStr = '0';
                    let lunch = 'No';
                    if (entry && exit) {
                        const start = parseStringDate(entry.fecha, entry.hora);
                        const end = parseStringDate(exit.fecha, exit.hora);
                        const calc = calculateLaborHours(start, end, timeConfig);
                        if (!calc.error) {
                            horasStr = (calc.raw.totalMins / 60).toFixed(2);
                            if (calc.appliedLunchDeduction) lunch = `${(timeConfig.calc_lunchMins || 60) / 60}h`;
                        }
                    }
                    return [
                        email, emp.firstName, emp.lastName, dia,
                        entry?.fecha || '-', entry?.hora || '-', entry?.localidad || '-',
                        exit?.fecha || '-', exit?.hora || '-', exit?.localidad || '-',
                        lunch, horasStr
                    ];
                });
            } else if (attendanceReportType === 'detallado_horas') {
                headers = ['Usuario', 'Nombres', 'Apellidos', 'Dia', 'F. Ingreso', 'H. Ingreso', 'F. Salida', 'H. Salida', 'Diurnas', 'Nocturnas', 'Dom Diu', 'Dom Noc', 'Total'];
                rows = shifts.map(({ entry, exit, email }) => {
                    const emp = employeesMap[email] || { firstName: '', lastName: '' };
                    let dia = '-';
                    if (entry?.fecha) {
                        const d = parseSpanishDate(entry.fecha);
                        dia = d ? dayFormatter.format(d) : '-';
                    }
                    let h = { diurnas: '-', nocturnas: '-', domDiurnas: '-', domNocturnas: '-', totalHHMM: '-' };
                    if (entry && exit) {
                        const calc = calculateLaborHours(parseStringDate(entry.fecha, entry.hora), parseStringDate(exit.fecha, exit.hora), timeConfig);
                        if (!calc.error) h = calc.format;
                    }
                    return [
                        email, emp.firstName, emp.lastName, dia,
                        entry?.fecha || '-', entry?.hora || '-', exit?.fecha || '-', exit?.hora || '-',
                        h.diurnas, h.nocturnas, h.domDiurnas, h.domNocturnas, h.totalHHMM
                    ];
                });
            } else {
                // Resumen
                headers = ['Usuario', 'Nombres', 'Apellidos', 'Diu', 'Noc', 'Dom Diu', 'Dom Noc', 'Total'];
                const summary = {};
                shifts.forEach(({ entry, exit, email }) => {
                    if (!summary[email]) summary[email] = { u: email, fn: employeesMap[email]?.firstName || '', ln: employeesMap[email]?.lastName || '', d: 0, n: 0, dd: 0, dn: 0 };
                    if (entry && exit) {
                        const calc = calculateLaborHours(parseStringDate(entry.fecha, entry.hora), parseStringDate(exit.fecha, exit.hora), timeConfig);
                        if (!calc.error) {
                            summary[email].d += calc.raw.diurnas;
                            summary[email].n += calc.raw.nocturnas;
                            summary[email].dd += calc.raw.domDiurnas;
                            summary[email].dn += calc.raw.domNocturnas;
                        }
                    }
                });
                rows = Object.values(summary).map(s => [
                    s.u, s.fn, s.ln, (s.d / 60).toFixed(2), (s.n / 60).toFixed(2), (s.dd / 60).toFixed(2), (s.dn / 60).toFixed(2), ((s.d + s.n + s.dd + s.dn) / 60).toFixed(2)
                ]);
            }

            const ts = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
            if (exportFormatAttendance === 'xlsx') {
                exportToExcelHTML(`turnos_${ts}.xlsx`, headers, rows);
            } else {
                const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
                const csvContent = '\ufeff' + [headers.join(','), ...rows.map(r => r.map(escape).join(','))].join('\n');
                const link = document.createElement('a');
                link.href = URL.createObjectURL(new Blob([csvContent], { type: 'text/csv;charset=utf-8;' }));
                link.download = `turnos_${ts}.csv`;
                link.click();
            }
        } catch (error) {
            console.error(error);
            alert('Error al exportar.');
        } finally {
            setExporting(false);
        }
    };

    const exportIncidentsToCSV = async () => {
        setExportingIncidents(true);
        try {
            const snap = await getDocs(query(collection(db, 'incidents'), orderBy('timestamp', 'asc')));
            let incidents = snap.docs.map(d => ({ id: d.id, ...d.data() }));

            if (incidentStartDate || incidentEndDate) {
                incidents = incidents.filter(inc => {
                    const d = parseSpanishDate(inc.fecha);
                    if (!d) return false;
                    const t = d.getTime();
                    const start = incidentStartDate ? new Date(incidentStartDate + 'T00:00:00').getTime() : 0;
                    const end = incidentEndDate ? new Date(incidentEndDate + 'T23:59:59').getTime() : Infinity;
                    return t >= start && t <= end;
                });
            }
            if (incidentCsvUserFilter.trim()) {
                const needle = incidentCsvUserFilter.trim().toLowerCase();
                incidents = incidents.filter(inc => (inc.usuario || '').toLowerCase().includes(needle));
            }
            if (incidents.length === 0) { alert('No hay novedades.'); return; }

            const headers = ['Usuario', 'Fecha', 'Hora', 'Localidad', 'Descripcion'];
            const rows = incidents.map(inc => [inc.usuario || '', inc.fecha || '', inc.hora || '', inc.localidad || '', inc.descripcion || '']);
            const ts = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
            if (exportFormatIncidents === 'xlsx') {
                exportToExcelHTML(`novedades_${ts}.xlsx`, headers, rows);
            } else {
                const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
                const csvContent = '\ufeff' + [headers.join(','), ...rows.map(r => r.map(escape).join(','))].join('\n');
                const link = document.createElement('a');
                link.href = URL.createObjectURL(new Blob([csvContent], { type: 'text/csv;charset=utf-8;' }));
                link.download = `novedades_${ts}.csv`;
                link.click();
            }
        } catch (error) {
            console.error(error);
            alert('Error al exportar novedades.');
        } finally {
            setExportingIncidents(false);
        }
    };

    if (loading && !storageConfig) {
        return <div className="min-h-screen flex items-center justify-center"><Loader2 size={40} className="animate-spin text-blue-600" /></div>;
    }

    return (
        <div className="min-h-screen bg-gradient-to-b from-[#3C7DA6] to-[#6FAF6B] p-6">
            <div className="max-w-6xl mx-auto">
                <div className="flex justify-between items-center mb-8">
                    <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-2">
                        <FileText size={30} className="text-blue-600" />
                        Centro de Informes y Reportes
                        <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-mono ml-2 border border-gray-200">v{import.meta.env.VITE_APP_VERSION}</span>
                    </h1>
                    <button onClick={() => navigate('/dashboard')} className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 transition">Volver</button>
                </div>

                {/* 1. EXPORTAR FOTOS / EVIDENCIAS */}
                <div className="bg-white rounded-xl shadow-2xl p-6 mb-6 border-l-4 border-blue-500">
                    <div className="flex justify-between items-start mb-4">
                        <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                            <Image size={24} className="text-blue-600" /> Evidencias Fotográficas
                        </h2>
                        {storageConfig && (storageConfig.saveAsistencia || storageConfig.saveIncidentes) && (
                            <button onClick={handleManualCleanup} disabled={cleaningStorage} className="text-xs bg-red-50 text-red-600 px-3 py-1.5 rounded-lg border border-red-200 hover:bg-red-100 font-bold flex items-center gap-1">
                                {cleaningStorage ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Limpiar Fotos Antiguas
                            </button>
                        )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4 items-end">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Fecha Inicio</label>
                            <input type="date" value={photoDesde} onChange={e => setPhotoDesde(e.target.value)} className="w-full px-4 py-2 border rounded-lg" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Fecha Fin</label>
                            <input type="date" value={photoHasta} onChange={e => setPhotoHasta(e.target.value)} className="w-full px-4 py-2 border rounded-lg" />
                        </div>
                        <button
                            disabled={photoSearching || !photoDesde || !photoHasta}
                            onClick={async () => {
                                setPhotoSearching(true); setPhotoMsg('Buscando...'); setPhotoProgress({ current: 0, total: 0 });
                                try {
                                    const lista = await listPhotosByFilter({ tipo: photoTipo, desde: new Date(photoDesde + 'T00:00:00'), hasta: new Date(photoHasta + 'T23:59:59'), filtroUsuario: photoFiltroUser });
                                    if (lista.length === 0) { setPhotoMsg('No se encontraron fotos.'); return; }
                                    setPhotoMsg(`Descargando ${lista.length} fotos...`);
                                    const { zipBlob, addedCount } = await downloadPhotosAsZip(lista, (c, t) => setPhotoProgress({ current: c, total: t }));
                                    const link = document.createElement('a'); link.href = URL.createObjectURL(zipBlob); link.download = `fotos_${photoDesde}_${photoHasta}.zip`; link.click();
                                    setPhotoMsg(`✅ Descargadas ${addedCount} fotos.`);
                                } catch (e) { setPhotoMsg('❌ Error: ' + e.message); } finally { setPhotoSearching(false); }
                            }}
                            className="w-full py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2"
                        >
                            {photoSearching ? <Loader2 size={20} className="animate-spin" /> : <Download size={20} />} Descargar Fotos
                        </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <select value={photoTipo} onChange={e => setPhotoTipo(e.target.value)} className="w-full px-4 py-2 border rounded-lg">
                            <option value="ambos">Todo (Asistencia + Novedades)</option>
                            <option value="asistencia">Solo Asistencia</option>
                            <option value="incidentes">Solo Novedades</option>
                        </select>
                        <input type="text" placeholder="Correo o dominio (opcional)" value={photoFiltroUser} onChange={e => setPhotoFiltroUser(e.target.value)} className="w-full px-4 py-2 border rounded-lg" />
                    </div>
                    {photoSearching && photoProgress.total > 0 && (
                        <div className="mt-4"><div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden"><div className="bg-blue-600 h-full transition-all" style={{ width: `${(photoProgress.current / photoProgress.total) * 100}%` }}></div></div><p className="text-xs text-gray-500 mt-1">Progreso: {photoProgress.current} / {photoProgress.total}</p></div>
                    )}
                    <p className="text-sm text-gray-500 mt-2">{photoMsg}</p>
                </div>

                {/* 2. EXPORTAR ASISTENCIA */}
                <div className="bg-white rounded-xl shadow-2xl p-6 mb-6 border-l-4 border-green-500">
                    <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2"><Download size={24} className="text-green-600" /> Reportes de Asistencia</h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                        <div><label className="text-sm">Desde</label><input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full px-4 py-2 border rounded-lg" /></div>
                        <div><label className="text-sm">Hasta</label><input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full px-4 py-2 border rounded-lg" /></div>
                        <div><label className="text-sm">Filtro Usuario</label><input type="text" value={csvUserFilter} onChange={e => setCsvUserFilter(e.target.value)} className="w-full px-4 py-2 border rounded-lg" /></div>
                    </div>
                    <div className="flex gap-4 flex-wrap">
                        <select value={attendanceReportType} onChange={e => setAttendanceReportType(e.target.value)} className="flex-1 px-4 py-2 border rounded-lg min-w-[200px]">
                            <option value="estandar">Detallado Estándar</option>
                            <option value="detallado_horas">Discriminado por tipos de horas (Colombia)</option>
                            <option value="resumen">Resumen General por Empleado</option>
                        </select>
                        <select value={exportFormatAttendance} onChange={e => setExportFormatAttendance(e.target.value)} className="px-4 py-2 border rounded-lg">
                            <option value="csv">CSV</option>
                            <option value="xlsx">Excel</option>
                        </select>
                        <button onClick={exportToCSV} disabled={exporting} className="px-8 py-2 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 flex items-center gap-2 shadow-md">
                            {exporting ? <Loader2 size={20} className="animate-spin" /> : <FileText size={20} />} Generar Reporte
                        </button>
                    </div>

                    <div className="mt-8 pt-6 border-t border-red-50 flex items-center justify-between">
                        <div><h3 className="text-red-700 font-bold text-sm">Limpieza de Historial</h3><p className="text-xs text-gray-500">Borra definitivamente los registros en el rango de fechas seleccionado.</p></div>
                        <button onClick={handleBulkDelete} disabled={deleting || !startDate || !endDate} className="px-4 py-2 bg-red-100 text-red-700 rounded-lg font-bold hover:bg-red-200 transition">
                            {deleting ? 'Borrando...' : 'Borrar Rango'}
                        </button>
                    </div>
                </div>

                {/* 3. EXPORTAR NOVEDADES */}
                <div className="bg-white rounded-xl shadow-2xl p-6 mb-6 border-l-4 border-orange-400">
                    <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2"><TriangleAlert size={24} className="text-orange-500" /> Reporte de Novedades</h2>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end mb-4">
                        <div className="md:col-span-1"><label className="text-sm">Desde</label><input type="date" value={incidentStartDate} onChange={e => setIncidentStartDate(e.target.value)} className="w-full px-4 py-2 border rounded-lg" /></div>
                        <div className="md:col-span-1"><label className="text-sm">Hasta</label><input type="date" value={incidentEndDate} onChange={e => setIncidentEndDate(e.target.value)} className="w-full px-4 py-2 border rounded-lg" /></div>
                        <div className="md:col-span-1"><label className="text-sm">Usuario</label><input type="text" value={incidentCsvUserFilter} onChange={e => setIncidentCsvUserFilter(e.target.value)} className="w-full px-4 py-2 border rounded-lg" /></div>
                        <div className="flex gap-2">
                            <select value={exportFormatIncidents} onChange={e => setExportFormatIncidents(e.target.value)} className="border rounded-lg px-2"><option value="csv">CSV</option><option value="xlsx">XLSX</option></select>
                            <button onClick={exportIncidentsToCSV} disabled={exportingIncidents} className="flex-1 bg-orange-600 text-white py-2 rounded-lg font-bold hover:bg-orange-700 flex justify-center gap-2">
                                {exportingIncidents ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />} Exportar
                            </button>
                        </div>
                    </div>
                    <div className="mt-4 pt-4 border-t border-red-50 flex items-center justify-between">
                        <p className="text-xs text-gray-500">Borrar novedades permanentemente en el rango de fechas.</p>
                        <button onClick={handleBulkDeleteIncidents} disabled={deletingIncidents || !incidentStartDate || !incidentEndDate} className="px-4 py-2 bg-red-100 text-red-700 rounded-lg font-bold hover:bg-red-200 transition">Borrar Rango</button>
                    </div>
                </div>

                {/* 4. GESTIÓN DE EMPLEADOS */}
                <div className="bg-white rounded-xl shadow-2xl p-6 mb-12 border-l-4 border-emerald-500">
                    <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2"><UserMinus size={24} className="text-emerald-600" /> Personal y Empleados</h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                        <div className="md:col-span-1"><input type="text" placeholder="Filtrar por email..." value={filterEmail} onChange={e => setFilterEmail(e.target.value)} className="w-full px-4 py-2 border rounded-lg" /></div>
                        <button onClick={exportEmployeesToCSV} disabled={exportingEmployees} className="bg-blue-600 text-white py-2 rounded-lg font-bold hover:bg-blue-700 flex justify-center gap-2 shadow-sm">
                            {exportingEmployees ? <Loader2 size={18} className="animate-spin" /> : <FileText size={18} />} Exportar Personal
                        </button>
                        <button onClick={() => setShowDeleteModal(true)} className="bg-red-600 text-white py-2 rounded-lg font-bold hover:bg-red-700 flex justify-center gap-2 shadow-sm">
                            <Trash2 size={18} /> Borrar Empleado
                        </button>
                    </div>
                </div>
            </div>

            <DeleteEmployeeModal isOpen={showDeleteModal} onClose={() => setShowDeleteModal(false)} />
        </div>
    );
}
