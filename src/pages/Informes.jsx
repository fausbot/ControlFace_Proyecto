// src/pages/Informes.jsx
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Calendar, Trash2, AlertTriangle, TriangleAlert, Image, Loader2, UserMinus, FileText, Printer, Image as ImageIcon, Navigation, ArrowLeft, TrendingUp } from 'lucide-react';
import DeleteEmployeeModal from '../components/DeleteEmployeeModal';
import TableroGerencial from '../components/informes/TableroGerencial';
import { listPhotosByFilter, downloadPhotosAsZip, cleanOldPhotos } from '../services/storageService';
import { httpsCallable } from 'firebase/functions';
import { functions, db } from '../firebaseConfig';
import { exportToExcelHTML } from '../utils/exportUtils';
import { calculateLaborHours, parseStringDate, processDetailedDailyReport } from '../utils/timeCalculator';
import { handleExportDetailedDaily } from '../utils/detailedReportExporter';
import { handleExportConsolidated } from '../utils/consolidatedReportExporter';
import { useAuth } from '../contexts/AuthContext';

import { collection, getDocs, query, orderBy, getDoc, doc, where } from 'firebase/firestore';

// ✅ Importamos desde los servicios
import {
    bulkDeleteByDateRange,
    bulkDeleteIncidentsByDateRange,
    bulkDeleteVisitasByDateRange,
    filterLogsByDateRange,
    parseSpanishDate,
    getAllAttendanceLogs,
    getAllVisitLogs,
    getMillisFromDateTime
} from '../services/attendanceService';

import { getEmployeesMap } from '../services/employeeService';
import { GPS_ERROR_DICTIONARY } from '../utils/gpsDictionary';

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
    { key: 'eps', label: 'EPS', type: 'text', group: 'Identificación' },
    { key: 'arl', label: 'ARL', type: 'text', group: 'Identificación' },
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
    // 🔐 BLOQUEADOR DE ACCESO TEMPORAL (Solo para pruebas en Firebase)
    const [modoGerencialActivo, setModoGerencialActivo] = useState(() => {
        try {
            const params = new URLSearchParams(window.location.search);
            if (params.get('beta') === 'activar') {
                localStorage.setItem('CF_MODO_GERENCIAL', 'true');
                window.history.replaceState({}, document.title, window.location.pathname);
                return true;
            }
            if (params.get('beta') === 'apagar') {
                localStorage.removeItem('CF_MODO_GERENCIAL');
                window.history.replaceState({}, document.title, window.location.pathname);
                return false;
            }
            return localStorage.getItem('CF_MODO_GERENCIAL') === 'true';
        } catch {
            return false;
        }
    });

    const [pestanaActiva, setPestanaActiva] = useState(() => {
        try {
            return localStorage.getItem('CF_PESTANA_INFORMES') || 'descargas';
        } catch {
            return 'descargas';
        }
    });

    const cambiarPestana = (p) => {
        setPestanaActiva(p);
        try {
            localStorage.setItem('CF_PESTANA_INFORMES', p);
        } catch (_) {}
    };

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

    // Visitas export
    const [visitStartDate, setVisitStartDate] = useState('');
    const [visitEndDate, setVisitEndDate] = useState('');
    const [visitCsvUserFilter, setVisitCsvUserFilter] = useState('');
    const [exportingVisits, setExportingVisits] = useState(false);
    const [deletingVisits, setDeletingVisits] = useState(false);
    const [exportFormatVisits, setExportFormatVisits] = useState('csv');

    // Inconsistencias (Seguridad GPS) export
    const [incStartDate, setIncStartDate] = useState('');
    const [incEndDate, setIncEndDate] = useState('');
    const [incCsvUserFilter, setIncCsvUserFilter] = useState('');
    const [exportingInc, setExportingInc] = useState(false);
    const [exportFormatInc, setExportFormatInc] = useState('csv');

    const navigate = useNavigate();
    const { adminAccess } = useAuth();

    useEffect(() => {
        if (!adminAccess['/informes']) {
            // Reemplazado navigate por return al home en auth no autorizado.
            window.location.href = '/login';
            return;
        }
        loadInitialData();
    }, [adminAccess]);

    const loadInitialData = async () => {
        setLoading(true);
        
        // Timeout de seguridad para no bloquearse offline
        const timer = setTimeout(() => {
            setLoading(false);
        }, 5000);

        try {
            // Cargar logs para exportación
            const logs = await getAllAttendanceLogs();
            setAllLogs(logs);

            // Cargar config
            const snap = await getDoc(doc(db, 'settings', 'employeeFields'));
            if (snap.exists()) {
                const d = snap.data();
                setStorageConfig({
                    retentionAsistencia: d.storage_retentionAsistencia ?? 90,
                    retentionIncidentes: d.storage_retentionIncidentes ?? 540,
                    retentionRuta: d.storage_retentionRuta ?? 30,
                    saveAsistencia: d.storage_saveAsistencia !== false,
                    saveIncidentes: d.storage_saveIncidentes !== false,
                    saveRuta: d.storage_saveRuta !== false,
                    ruta_active: d.ruta_active === true
                });
                setTimeConfig(d);
            }
        } catch (err) {
            console.error(err);
        } finally {
            clearTimeout(timer);
            setLoading(false);
        }
    };

    const handleManualCleanup = async () => {
        if (!storageConfig) return;
        if (!window.confirm(`¿Ejecutar limpieza manual de fotos más antiguas de:\n- ${storageConfig.retentionAsistencia} días (Asistencia)\n- ${storageConfig.retentionIncidentes} días (Incidentes)${storageConfig.ruta_active ? `\n- ${storageConfig.retentionRuta} días (Visitas)` : ''}?`)) return;

        setCleaningStorage(true);
        try {
            const deleted = await cleanOldPhotos({
                asistencia: storageConfig.retentionAsistencia,
                incidentes: storageConfig.retentionIncidentes,
                visitas: storageConfig.retentionRuta
            });
            alert(`✅ Limpieza completada.Se liberó espacio de ${deleted} fotos.`);
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
        if (!window.confirm(`⚠️ Se borrarán TODOS los registros entre ${startDate} y ${endDate}. ¿Continuar ? `)) return;

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
        const confirm1 = window.confirm(`⚠️ PELIGRO: Vas a borrar PERMANENTEMENTE las NOVEDADES desde ${incidentStartDate} hasta ${incidentEndDate}.\n\nEsta acción NO se puede deshacer.\n¿Deseas continuar ? `);
        if (!confirm1) return;

        setDeletingIncidents(true);
        try {
            const deletedCount = await bulkDeleteIncidentsByDateRange(incidentStartDate, incidentEndDate);
            alert(`✅ Se borraron ${deletedCount} registros de novedades exitosamente.`);
        } finally {
            setDeletingIncidents(false);
        }
    };

    const handleBulkDeleteVisitas = async () => {
        if (!visitStartDate || !visitEndDate) {
            alert('Debes seleccionar rango de fechas para borrar visitas.');
            return;
        }
        if (!window.confirm(`⚠️ Se borrarán TODAS las VISITAS entre ${visitStartDate} y ${visitEndDate}. ¿Continuar?`)) return;

        setDeletingVisits(true);
        try {
            const count = await bulkDeleteVisitasByDateRange(visitStartDate, visitEndDate);
            alert(`✅ Se borraron ${count} registros de visitas.`);
            loadInitialData();
        } catch (error) {
            console.error(error);
            alert('Error al borrar visitas.');
        } finally {
            setDeletingVisits(false);
        }
    };

    const handleExportVisitas = async () => {
        setExportingVisits(true);
        try {
            const rawVisits = await getAllVisitLogs();
            const employeesMap = await getEmployeesMap();

            let filteredUser = rawVisits;
            if (visitStartDate || visitEndDate) {
                const start = visitStartDate ? new Date(visitStartDate) : null;
                const end = visitEndDate ? new Date(visitEndDate) : null;
                if (end) end.setHours(23, 59, 59, 999);

                filteredUser = rawVisits.filter(v => {
                    const d = parseSpanishDate(v.fecha);
                    if (!d) return false;
                    if (start && d < start) return false; // CORRECCIÓN: permitir el día de inicio
                    if (end && d > end) return false;
                    return true;
                });
            }

            if (visitCsvUserFilter && visitCsvUserFilter.trim()) {
                const term = visitCsvUserFilter.trim().toLowerCase();
                filteredUser = filteredUser.filter(v => {
                    const email = (v.usuario || '').toLowerCase();
                    const emp = employeesMap[email] || {};
                    const fullName = `${emp.nombre || emp.firstName || ''} ${emp.apellido || emp.lastName || ''}`.toLowerCase();
                    return email.includes(term) || fullName.includes(term);
                });
                //
                    //
                    //
                //
            }

            if (filteredUser.length === 0) {
                alert('No se encontraron registros de visitas con los filtros seleccionados.');
                setExportingVisits(false);
                return;
            }

            // Emparejar registros
            const sortedAsc = [...filteredUser].sort((a,b) => {
                const tA = getMillisFromDateTime(a.fecha, a.hora);
                const tB = getMillisFromDateTime(b.fecha, b.hora);
                return tA - tB;
            });
            
            const paired = [];
            const userState = {};

            sortedAsc.forEach(v => {
                const email = v.usuario;
                const emp = employeesMap[email] || {};
                const visitMode = v.tipo || v.mode; // Fallback por si acaso
                
                if (visitMode === 'Llegada Cliente') {
                    userState[email] = v;
                } else if (visitMode === 'Salida Cliente') {
                    const llegada = userState[email];
                    paired.push({
                        usuario: email,
                        nombre: emp.nombre || emp.firstName || '',
                        apellido: emp.apellido || emp.lastName || '',
                        fecha: llegada ? llegada.fecha : v.fecha,
                        llegada: llegada ? llegada.hora : '---',
                        salida: v.hora,
                        ubicacion: v.localidad || (v.latitud ? `${v.latitud}, ${v.longitud}` : '---'),
                        obsEntrada: llegada?.observacion || '',
                        obsSalida: v.observacion || ''
                    });
                    delete userState[email];
                }
            });

            Object.values(userState).forEach(v => {
                const emp = employeesMap[v.usuario] || {};
                paired.push({
                    usuario: v.usuario,
                    nombre: emp.nombre || emp.firstName || '',
                    apellido: emp.apellido || emp.lastName || '',
                    fecha: v.fecha,
                    llegada: v.hora,
                    salida: 'Pendiente',
                    ubicacion: v.localidad || '---',
                    obsEntrada: v.observacion || '',
                    obsSalida: ''
                });
            });

            // 3. AHORA filtrar el array 'paired' por el rango de fechas seleccionado
            let finalPaired = paired;
            if (visitStartDate || visitEndDate) {
                const parseISOToLocal = (isoStr) => {
                    if (!isoStr) return null;
                    const [y, m, d] = isoStr.split('-').map(Number);
                    return new Date(y, m - 1, d);
                };
                const start = visitStartDate ? parseISOToLocal(visitStartDate) : null;
                const end = visitEndDate ? parseISOToLocal(visitEndDate) : null;

                finalPaired = paired.filter(p => {
                    const d = parseSpanishDate(p.fecha);
                    if (!d) return false;
                    if (start && d < start) return false;
                    if (end && d > end) return false;
                    return true;
                });
            }

            if (finalPaired.length === 0) {
                alert('No se encontraron registros de visitas con los filtros seleccionados.');
                setExportingVisits(false);
                return;
            }

            if (exportFormatVisits === 'csv') {
                const headers = ['Usuario', 'Nombre', 'Apellido', 'Fecha', 'Hora Entrada', 'Hora Salida', 'Ubicación', 'Observaciones Entrada', 'Observaciones Salida'];
                const rows = finalPaired.map(p => [
                    p.usuario, p.nombre, p.apellido, p.fecha, p.llegada, p.salida, p.ubicacion, p.obsEntrada, p.obsSalida
                ]);
                const csvContent = '\ufeff' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n'); // Agregado BOM
                const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `reporte_visitas_${new Date().toISOString().split('T')[0]}.csv`;
                link.click();
            } else {
                const headers = ['Usuario', 'Nombre', 'Apellido', 'Fecha', 'Hora Entrada', 'Hora Salida', 'Ubicación', 'Observaciones Entrada', 'Observaciones Salida'];
                const rows = finalPaired.map(p => [
                    p.usuario, p.nombre, p.apellido, p.fecha, p.llegada, p.salida, p.ubicacion, p.obsEntrada, p.obsSalida
                ]);
                exportToExcelHTML(`reporte_visitas_${new Date().toISOString().split('T')[0]}.xlsx`, headers, rows);
            }
        } catch (err) {
            console.error(err);
            alert('Error exportando visitas.');
        } finally {
            setExportingVisits(false);
        }
    };

    const handleExportInconsistencias = async () => {
        setExportingInc(true);
        try {
            // Recolectar asistencias y novedades
            const freshLogs = await getAllAttendanceLogs();
            setAllLogs(freshLogs);
            let combinedLogs = [...freshLogs];
            
            // Si el bloque de visitas está activo, traer visitas
            if (storageConfig?.ruta_active) {
                const rawVisits = await getAllVisitLogs();
                combinedLogs = [...combinedLogs, ...rawVisits];
            }

            // Filtrar solo los que tienen anomalías
            let suspiciousLogs = combinedLogs.filter(log => log.isSuspiciousGPS === true || (log.metadata && log.metadata.isSuspiciousGPS === true));

            // Filtros de fecha
            if (incStartDate || incEndDate) {
                const start = incStartDate ? new Date(incStartDate) : null;
                const end = incEndDate ? new Date(incEndDate) : null;
                if (end) end.setHours(23, 59, 59, 999);

                suspiciousLogs = suspiciousLogs.filter(log => {
                    let d = parseSpanishDate(log.fecha);
                    if (!d && log.timestamp) {
                        try { d = log.timestamp.toDate(); } catch(e){}
                    }
                    if (!d) return false;
                    if (start && d < start) return false;
                    if (end && d > end) return false;
                    return true;
                });
            }

            // Filtro por usuario
            if (incCsvUserFilter) {
                const term = incCsvUserFilter.toLowerCase();
                const employeesMap = await getEmployeesMap();
                suspiciousLogs = suspiciousLogs.filter(log => {
                    const email = (log.usuario || '').toLowerCase();
                    const emp = employeesMap[email] || {};
                    const fullName = `${emp.nombre || emp.firstName || ''} ${emp.apellido || emp.lastName || ''}`.toLowerCase();
                    return email.includes(term) || fullName.includes(term);
                });
            }

            if (suspiciousLogs.length === 0) {
                alert('No se encontraron reportes con inconsistencias de seguridad bajo estos filtros.');
                setExportingInc(false);
                return;
            }

            // EXTRAER fotos asincrónicas emparejando por email_fecha_hora
            try {
                const photosQueryAsistencia = query(collection(db, 'fotos'), where('tipo', '==', 'asistencia'));
                const photosSnapAsistencia = await getDocs(photosQueryAsistencia);
                
                const photosQueryIncidente = query(collection(db, 'fotos'), where('tipo', '==', 'incidente'));
                const photosSnapIncidente = await getDocs(photosQueryIncidente);
                
                const photoMap = new Map();
                [...photosSnapAsistencia.docs, ...photosSnapIncidente.docs].forEach(d => {
                    const data = d.data();
                    if (data.email && data.fecha && data.hora && data.url) {
                        const key = `${data.email.trim().toLowerCase()}_${data.fecha.trim()}_${data.hora.trim()}`;
                        photoMap.set(key, data.url);
                    }
                });

                suspiciousLogs.forEach(log => {
                    if (!log.fotoURL && !log.imageUrl && !log.foto_url && !log.image_url) {
                        const logEmail = (log.usuario || log.email || '').trim().toLowerCase();
                        const key = `${logEmail}_${(log.fecha||'').trim()}_${(log.hora||'').trim()}`;
                        if (photoMap.has(key)) {
                            log.fotoURL = photoMap.get(key);
                        }
                    }
                });
            } catch (photoErr) {
                console.error("Error recuperando las fotos para inconsistencias:", photoErr);
            }

            const employeesMap = await getEmployeesMap();
            
            // Mapear filas
            // Mapear filas
            const headers = ['Usuario', 'Nombre', 'Apellido', 'Fecha', 'Hora', 'Tipo de Evento', 'Anomalías Detectadas', 'Ubicación (Dirección)', 'Coordenadas (Lat, Lon)', 'Evidencia (Enlace)'];
            const rows = suspiciousLogs.map(log => {
                const email = log.usuario || '';
                const emp = employeesMap[email] || {};
                const anomaliesArray = log.gpsAnomalies || (log.metadata ? log.metadata.gpsAnomalies : []) || [];
                const anomaliesStr = anomaliesArray.map(code => code.replace('ERR-0', 'ERROR ')).join(' | ');

                return [
                    email,
                    emp.nombre || emp.firstName || '',
                    emp.apellido || emp.lastName || '',
                    log.fecha || '-',
                    log.hora || '-',
                    log.tipo || '-',
                    anomaliesStr,
                    log.localidad || (log.metadata ? log.metadata.localidad : '') || '-',
                    `${log.latitud || ''}, ${log.longitud || ''}`,
                    log.fotoURL || log.imageUrl || log.foto_url || log.image_url || (log.metadata && (log.metadata.imageUrl || log.metadata.fotoURL || log.metadata.foto_url)) || 'Sin Evidencia'
                ];
            });

            const timestampStr = new Date().toISOString().split('T')[0];

            if (exportFormatInc === 'csv') {
                const csvContent = '\ufeff' + [headers.join(','), ...rows.map(r => `"${r.join('","')}"`)].join('\n');
                const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `inconsistencias_${timestampStr}.csv`;
                link.click();
            } else {
                exportToExcelHTML(`inconsistencias_${timestampStr}.xlsx`, headers, rows);
            }

        } catch (err) {
            console.error(err);
            alert('Error exportando inconsistencias.');
        } finally {
            setExportingInc(false);
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



            const headers = [
                'Email/ID', 'Nombres', 'Apellidos', 'Fecha de Creacion', 'Ultimo Acceso', 'UID',
                'Aceptó Política Habeas Data', 'Fecha de Aceptación',
                ...activeOptionalKeys.map(f => f.label)
            ];
            const rows = authUsers.map(emp => {
                const fs = fsMap[(emp.email || '').toLowerCase()] || {};
                const acepta = (fs.aceptaPoliticaDatos || fs.extraFields?.aceptaPoliticaDatos) ? 'SÍ' : 'NO';
                const fecha = fs.fechaAceptacionPolitica || fs.extraFields?.fechaAceptacionPolitica;
                const fechaStr = fecha ? new Date(fecha).toLocaleString('es-ES') : 'N/A';
                return [
                    emp.email || '', fs.firstName || '', fs.lastName || '',
                    emp.creationTime ? new Date(emp.creationTime).toLocaleString('es-ES') : 'N/A',
                    emp.lastSignInTime ? new Date(emp.lastSignInTime).toLocaleString('es-ES') : 'N/A',
                    emp.uid || '',
                    acepta,
                    fechaStr,
                    ...activeOptionalKeys.map(({ key }) => fs[key] || fs.extraFields?.[key] || '')
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

            // Recargar datos para que siempre esté actualizado antes de generar el informe
            const freshLogs = await getAllAttendanceLogs();
            setAllLogs(freshLogs);
            const employeesMap = await getEmployeesMap();

            let logsToProcess = freshLogs;
            if (csvUserFilter.trim()) {
                const searchStr = csvUserFilter.trim().toLowerCase();
                logsToProcess = logsToProcess.filter(log => {
                    const email = (log.usuario || '').toLowerCase();
                    const emp = employeesMap[email] || {};
                    const fullName = `${emp.nombre || emp.firstName || ''} ${emp.apellido || emp.lastName || ''}`.toLowerCase();
                    return email.includes(searchStr) || fullName.includes(searchStr);
                });
            }



            const dayFormatter = new Intl.DateTimeFormat('es-ES', { weekday: 'long' });

            const sorted = [...logsToProcess].sort((a, b) => {
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

            let allShifts = [];
            // Ordenamos las llaves de byUser (emails) alfabéticamente
            const sortedEmails = Object.keys(byUser).sort();

            sortedEmails.forEach(email => {
                const chronoRecords = byUser[email];
                // Usamos los registros en orden ASC (ya vienen así del sort de línea 262)
                // para emparejar Entrada seguida de su Salida cronológica.

                
                let pendingEntry = null;
                const userShifts = [];
                chronoRecords.forEach(rec => {
                    if (rec.tipo === 'Entrada') {
                        if (pendingEntry) userShifts.push({ entry: pendingEntry, exit: null, email });
                        pendingEntry = rec;
                    } else if (rec.tipo === 'Salida') {
                        if (pendingEntry) { userShifts.push({ entry: pendingEntry, exit: rec, email }); pendingEntry = null; }
                        else userShifts.push({ entry: null, exit: rec, email });
                    }
                });
                if (pendingEntry) userShifts.push({ entry: pendingEntry, exit: null, email });
                
                // Invertimos los turnos del usuario para que el más reciente esté arriba
                allShifts.push(...userShifts);
            });

            // 5. AHORA aplicar el filtro de fecha sobre los turnos ya emparejados
            let shifts = allShifts;
            
            const parseISOToLocal = (isoStr) => {
                if (!isoStr) return null;
                const [y, m, d] = isoStr.split('-').map(Number);
                return new Date(y, m - 1, d);
            };
            
            const start = startDate ? parseISOToLocal(startDate) : null;
            const end = endDate ? parseISOToLocal(endDate) : null;

            if (startDate || endDate) {
                shifts = allShifts.filter(s => {
                    // Incluir el turno si su ENTRADA o su SALIDA caen en el rango.
                    // Esto garantiza que turnos nocturnos (ej: entrada 11/05 23:13,
                    // salida 12/05 06:37) aparezcan al consultar el día 12/05.
                    const entryDateStr = s.entry?.fecha;
                    const exitDateStr = s.exit?.fecha;

                    const entryDate = parseSpanishDate(entryDateStr);
                    const exitDate = parseSpanishDate(exitDateStr);

                    // Al menos una fecha de referencia debe existir
                    if (!entryDate && !exitDate) return false;

                    // La entrada cae en el rango
                    const entryInRange = entryDate &&
                        (!start || entryDate >= start) &&
                        (!end || entryDate <= end);

                    // La salida cae en el rango
                    const exitInRange = exitDate &&
                        (!start || exitDate >= start) &&
                        (!end || exitDate <= end);

                    // El turno cruza el rango completo (entrada antes del start, salida después del end)
                    const shiftSpansRange = entryDate && exitDate && start && end &&
                        entryDate <= start && exitDate >= end;

                    return entryInRange || exitInRange || shiftSpansRange;
                });
            }

            // Invertimos para mostrar los más recientes arriba
            shifts.sort((a, b) => {
                const dateA = parseStringDate(a.entry?.fecha || a.exit?.fecha, a.entry?.hora || a.exit?.hora);
                const dateB = parseStringDate(b.entry?.fecha || b.exit?.fecha, b.entry?.hora || b.exit?.hora);
                return dateB - dateA;
            });

                        if (attendanceReportType === 'control_detallado_jornada') {
                await handleExportDetailedDaily(shifts, employeesMap, csvUserFilter, timeConfig, exportFormatAttendance, start, end);
                setExporting(false);
                return;
            }

            if (attendanceReportType === 'control_consolidado_jornada') {
                await handleExportConsolidated(shifts, employeesMap, csvUserFilter, timeConfig, exportFormatAttendance, start, end);
                setExporting(false);
                return;
            }

            if (shifts.length === 0) { alert('No hay registros en este rango.'); setExporting(false); return; }


            let headers = [];
            let rows = [];

            const calcMsDiffHrs = (startStrDate, startStrTime, endStrDate, endStrTime) => {
                const start = parseStringDate(startStrDate, startStrTime);
                const end = parseStringDate(endStrDate, endStrTime);
                if (start && end) {
                    const diffMs = end.getTime() - start.getTime();
                    return diffMs > 0 ? diffMs / 3600000 : 0;
                }
                return 0;
            };

            if (attendanceReportType === 'tiempo_efectivo_cliente') {
                const snap = await getDocs(collection(db, 'visitas'));
                let visitasLogs = snap.docs.map(d => ({ id: d.id, ...d.data() }));


                if (csvUserFilter.trim()) visitasLogs = visitasLogs.filter(log => (log.usuario || '').toLowerCase().includes(csvUserFilter.trim().toLowerCase()));
                if (visitasLogs.length === 0) { alert('No hay registros de visitas en este rango.'); setExporting(false); return; }

                visitasLogs.sort((a, b) => {
                    const dateA = parseStringDate(a.fecha, a.hora) || (a.timestamp ? a.timestamp.toDate() : new Date(0));
                    const dateB = parseStringDate(b.fecha, b.hora) || (b.timestamp ? b.timestamp.toDate() : new Date(0));
                    return dateA - dateB;
                });

                const byUserV = {};
                visitasLogs.forEach(log => {
                    const key = (log.usuario || '').toLowerCase().trim();
                    if (!byUserV[key]) byUserV[key] = [];
                    byUserV[key].push(log);
                });

                const visitasShifts = [];
                Object.keys(byUserV).sort().forEach(email => {
                    const records = byUserV[email];
                    let pendingEntry = null;
                    const userShifts = [];
                    records.forEach(rec => {
                        if (rec.tipo === 'Llegada Cliente') {
                            if (pendingEntry) userShifts.push({ entry: pendingEntry, exit: null, email });
                            pendingEntry = rec;
                        } else if (rec.tipo === 'Salida Cliente') {
                            if (pendingEntry) { userShifts.push({ entry: pendingEntry, exit: rec, email }); pendingEntry = null; }
                            else userShifts.push({ entry: null, exit: rec, email });
                        }
                    });
                    if (pendingEntry) userShifts.push({ entry: pendingEntry, exit: null, email });
                    visitasShifts.push(...userShifts);
                });

                // Filtrar visitasShifts por fecha si es necesario
                let filteredVisitasShifts = visitasShifts;
                if (startDate || endDate) {
                    const parseISOToLocal = (isoStr) => {
                        if (!isoStr) return null;
                        const [y, m, d] = isoStr.split('-').map(Number);
                        return new Date(y, m - 1, d);
                    };
                    const start = startDate ? parseISOToLocal(startDate) : null;
                    const end = endDate ? parseISOToLocal(endDate) : null;
                    
                    filteredVisitasShifts = visitasShifts.filter(vs => {
                        const refDate = vs.entry ? vs.entry.fecha : vs.exit?.fecha;
                        const d = parseSpanishDate(refDate);
                        if (!d) return false;
                        if (start && d < start) return false;
                        if (end && d > end) return false;
                        return true;
                    });
                }



                // Agrupar por bloques de Turno
                const userShiftBlocks = {};
                shifts.forEach(shift => {
                    const { entry, exit, email } = shift;
                    if (!email || !entry) return;
                    if (!userShiftBlocks[email]) userShiftBlocks[email] = [];
                    userShiftBlocks[email].push({ entry, exit, email, visits: [] });
                });

                filteredVisitasShifts.forEach(visitShift => {
                    const { entry, exit, email } = visitShift;
                    if (!email || !entry) return;
                    if (!userShiftBlocks[email]) userShiftBlocks[email] = [];
                    
                    const visitStartMs = parseStringDate(entry.fecha, entry.hora)?.getTime() || 0;
                    
                    let foundBlock = userShiftBlocks[email].find(b => {
                        const bStartMs = parseStringDate(b.entry?.fecha, b.entry?.hora)?.getTime() || 0;
                        const bEndMs = b.exit ? (parseStringDate(b.exit.fecha, b.exit.hora)?.getTime() || Infinity) : Infinity;
                        return visitStartMs >= (bStartMs - 120000) && visitStartMs <= bEndMs;
                    });
                    
                    if (foundBlock) {
                        foundBlock.visits.push(visitShift);
                    } else {
                        userShiftBlocks[email].push({
                            entry: { fecha: entry.fecha, hora: entry.hora, localidad: 'Turno Huérfano' },
                            exit: { fecha: exit?.fecha || entry.fecha, hora: exit?.hora || entry.hora, localidad: 'Turno Huérfano' },
                            email,
                            visits: [visitShift]
                        });
                    }
                });

                let maxVisits = 0;
                Object.values(userShiftBlocks).forEach(blocks => {
                    blocks.forEach(b => {
                        if (b.visits.length > maxVisits) maxVisits = b.visits.length;
                    });
                });
                if (maxVisits === 0) maxVisits = 1;

                const visitHeaders = [];
                for (let i = 1; i <= maxVisits; i++) {
                    visitHeaders.push(
                        `Hora Ingreso (Cliente ${i})`, 
                        `Localidad (Ingreso ${i})`, 
                        `Hora Salida (Cliente ${i})`, 
                        `Localidad (Salida ${i})`,
                        `Tiempo Trabajado Cliente ${i} (Horas)`
                    );
                }

                headers = [
                    'Usuario', 'Nombres', 'Apellidos', 'Día',
                    'Fecha Entrada (Turno)', 'Hora Entrada', 'Localidad Entrada',
                    'Fecha Salida (Turno)', 'Hora Salida', 'Localidad Salida',
                    ...visitHeaders,
                    'Total Horas Efectivas (Suma Clientes)', 'Tiempo en Transporte (Horas)', 'Total Horas Trabajadas (Bruto)', 'Descuento Almuerzo', 'Total Horas Trabajadas (Neto)', 'Comentario Admin 1', 'Comentario Admin 2'
                ];

                Object.keys(userShiftBlocks).forEach(email => {
                    const emp = employeesMap[email] || { firstName: '', lastName: '' };
                    const blocks = userShiftBlocks[email];
                    
                    blocks.forEach(block => {
                        if (block.visits.length === 0) return; // Solo turnos con visitas en detalles
                        
                        let diaStr = '-';
                        if (block.entry?.fecha) {
                            const d = parseSpanishDate(block.entry.fecha);
                            diaStr = (d && !isNaN(d.getTime())) ? dayFormatter.format(d) : block.entry.fecha;
                        }

                        let totalHorasTrabajadas = 0;
                        if (block.entry && block.exit) {
                            totalHorasTrabajadas = calcMsDiffHrs(block.entry.fecha, block.entry.hora, block.exit.fecha, block.exit.hora);
                        }

                        let sumOfVisitsHrs = 0;
                        const visitRowsData = block.visits.map(v => {
                            let visitTimeHrs = 0;
                            if (v.entry && v.exit) {
                                visitTimeHrs = calcMsDiffHrs(v.entry.fecha, v.entry.hora, v.exit.fecha, v.exit.hora);
                                sumOfVisitsHrs += visitTimeHrs;
                            }
                            return { ...v, visitTimeHrs: parseFloat(visitTimeHrs.toFixed(2)) };
                        });

                        let horasTransporte = totalHorasTrabajadas - sumOfVisitsHrs;
                        if (horasTransporte < 0) horasTransporte = 0;

                        const rowData = [
                            email, emp.firstName, emp.lastName, diaStr,
                            block.entry?.fecha || '-', block.entry?.hora || '-', (block.entry?.localidad || block.entry?.ubicacion) || '-',
                            block.exit?.fecha || '-', block.exit?.hora || '-', (block.exit?.localidad || block.exit?.ubicacion) || '-'
                        ];

                        for (let i = 0; i < maxVisits; i++) {
                            const v = visitRowsData[i];
                            if (v) {
                                rowData.push(
                                    v.entry?.hora || '-', 
                                    (v.entry?.localidad || v.entry?.ubicacion) || '-',
                                    v.exit?.hora || '-', 
                                    (v.exit?.localidad || v.exit?.ubicacion) || '-',
                                    v.visitTimeHrs
                                );
                            } else {
                                rowData.push('-', '-', '-', '-', '-');
                            }
                        }

                        let totalHorasNeto = totalHorasTrabajadas;
                        let lunchDeducted = 'No';
                        if (block.entry && block.exit) {
                            const lunchModeExplicit = timeConfig.calc_lunchMode === 'individual' || timeConfig.calc_lunchMode === 'empresa';
                            const shouldDeduct = lunchModeExplicit
                                ? block.exit?.applyLunch === true
                                : (block.exit?.applyLunch === true 
                                    ? true 
                                    : (block.exit?.applyLunch === false 
                                        ? false 
                                        : (timeConfig.calc_lunch && (totalHorasTrabajadas * 60) >= 480)));
                            
                            if (shouldDeduct) {
                                const deductionHrs = (parseInt(timeConfig.calc_lunchMins, 10) || 60) / 60;
                                totalHorasNeto -= deductionHrs;
                                lunchDeducted = `Sí (${timeConfig.calc_lunchMins || 60} min)`;
                            }
                        }

                        rowData.push(
                            parseFloat(sumOfVisitsHrs.toFixed(2)),
                            parseFloat(horasTransporte.toFixed(2)),
                            parseFloat(totalHorasTrabajadas.toFixed(2)),
                            lunchDeducted,
                            parseFloat(totalHorasNeto.toFixed(2)),
                            (block.entry?.comentarioAdmin && block.exit?.comentarioAdmin) ? block.entry.comentarioAdmin : (block.entry?.comentarioAdmin || block.exit?.comentarioAdmin || '-'),
                            (block.entry?.comentarioAdmin && block.exit?.comentarioAdmin) ? block.exit.comentarioAdmin : '-'
                        );
                        rows.push(rowData);
                    });
                });

            } else if (attendanceReportType === 'tiempo_efectivo_cliente_resumen') {
                const snap = await getDocs(collection(db, 'visitas'));
                let visitasLogs = snap.docs.map(d => ({ id: d.id, ...d.data() }));


                if (csvUserFilter.trim()) visitasLogs = visitasLogs.filter(log => (log.usuario || '').toLowerCase().includes(csvUserFilter.trim().toLowerCase()));
                if (visitasLogs.length === 0) { alert('No hay registros de visitas en este rango para armar el resumen.'); setExporting(false); return; }

                visitasLogs.sort((a, b) => {
                    const dateA = parseStringDate(a.fecha, a.hora) || (a.timestamp ? a.timestamp.toDate() : new Date(0));
                    const dateB = parseStringDate(b.fecha, b.hora) || (b.timestamp ? b.timestamp.toDate() : new Date(0));
                    return dateA - dateB;
                });

                const byUserV = {};
                visitasLogs.forEach(log => {
                    const key = (log.usuario || '').toLowerCase().trim();
                    if (!byUserV[key]) byUserV[key] = [];
                    byUserV[key].push(log);
                });

                const summaryObj = {};
                Object.keys(byUserV).forEach(email => {
                    let pendingEntry = null;
                    const userShifts = [];
                    byUserV[email].forEach(rec => {
                        if (rec.tipo === 'Llegada Cliente') {
                            if (pendingEntry) userShifts.push({ entry: pendingEntry, exit: null });
                            pendingEntry = rec;
                        } else if (rec.tipo === 'Salida Cliente') {
                            if (pendingEntry) { userShifts.push({ entry: pendingEntry, exit: rec }); pendingEntry = null; }
                            else userShifts.push({ entry: null, exit: rec });
                        }
                    });
                    if (pendingEntry) userShifts.push({ entry: pendingEntry, exit: null });

                    let totalVisitasHrs = 0;
                    userShifts.forEach(({ entry, exit }) => {
                        if (entry && exit) {
                            if (startDate || endDate) {
                                const parseISOToLocal = (isoStr) => {
                                    if (!isoStr) return null;
                                    const [y, m, d] = isoStr.split('-').map(Number);
                                    return new Date(y, m - 1, d);
                                };
                                const start = startDate ? parseISOToLocal(startDate) : null;
                                const end = endDate ? parseISOToLocal(endDate) : null;
                                const d = parseSpanishDate(entry.fecha);
                                if (d) {
                                    if (start && d < start) return;
                                    if (end && d > end) return;
                                }
                            }
                            totalVisitasHrs += calcMsDiffHrs(entry.fecha, entry.hora, exit.fecha, exit.hora);
                        }
                    });

                    summaryObj[email] = {
                        clientesVisitados: userShifts.length,
                        tiempoClientesHrs: totalVisitasHrs,
                        horasTotalesHrs: 0,
                        horasAlmuerzoHrs: 0,
                        tiempoRealHrs: 0,
                        comments: []
                    };
                });

                shifts.forEach(({ entry, exit, email }) => {
                    if (entry && exit) {
                        const brutoHrs = calcMsDiffHrs(entry.fecha, entry.hora, exit.fecha, exit.hora);
                        let netoHrs = brutoHrs;
                        let lunchHrs = 0;
                        const lunchModeExplicit2 = timeConfig.calc_lunchMode === 'individual' || timeConfig.calc_lunchMode === 'empresa';
                        const shouldDeduct = lunchModeExplicit2
                            ? exit?.applyLunch === true
                            : (exit?.applyLunch === true 
                                ? true 
                                : (exit?.applyLunch === false 
                                    ? false 
                                    : (timeConfig.calc_lunch && (brutoHrs * 60) >= 480)));
                        if (shouldDeduct) {
                            lunchHrs = ((parseInt(timeConfig.calc_lunchMins, 10) || 60) / 60);
                            netoHrs -= lunchHrs;
                        }
                        if (summaryObj[email]) {
                            summaryObj[email].horasTotalesHrs += brutoHrs;
                            summaryObj[email].horasAlmuerzoHrs += lunchHrs;
                            summaryObj[email].tiempoRealHrs += netoHrs;
                            if (entry?.comentarioAdmin) summaryObj[email].comments.push(entry.comentarioAdmin);
                            if (exit?.comentarioAdmin) summaryObj[email].comments.push(exit.comentarioAdmin);
                        }
                    }
                });

                headers = ['Usuario', 'Nombres', 'Apellidos', 'Clientes Visitados', 'Total Horas Efectivas (Suma Clientes)', 'Horas Totales Trabajadas (Bruto)', 'Tiempo en Transporte (Horas)', 'Total Horas Almuerzo', 'Total Horas Trabajadas (Neto)', 'Comentario Admin 1', 'Comentario Admin 2'];
                rows = Object.keys(summaryObj).map(email => {
                    const emp = employeesMap[email] || { firstName: '', lastName: '' };
                    const s = summaryObj[email];
                    
                    let horasTransporte = s.horasTotalesHrs - s.tiempoClientesHrs;
                    if (horasTransporte < 0) horasTransporte = 0;

                    return [
                        email, emp.firstName, emp.lastName,
                        s.clientesVisitados,
                        parseFloat(s.tiempoClientesHrs.toFixed(2)),
                        parseFloat(s.horasTotalesHrs.toFixed(2)),
                        parseFloat(horasTransporte.toFixed(2)),
                        parseFloat(s.horasAlmuerzoHrs.toFixed(2)),
                        parseFloat(s.tiempoRealHrs.toFixed(2)),
                        ([...new Set(s.comments)].filter(Boolean)[0] || '-'),
                        ([...new Set(s.comments)].filter(Boolean).slice(1).join(' | ') || '-')
                    ];
                });

            } else if (attendanceReportType === 'tiempo_efectivo_cliente_dias') {
                const snap = await getDocs(collection(db, 'visitas'));
                let visitasLogs = snap.docs.map(d => ({ id: d.id, ...d.data() }));


                if (csvUserFilter.trim()) visitasLogs = visitasLogs.filter(log => (log.usuario || '').toLowerCase().includes(csvUserFilter.trim().toLowerCase()));
                if (visitasLogs.length === 0) { alert('No hay registros de visitas en este rango para armar el reporte.'); setExporting(false); return; }

                visitasLogs.sort((a, b) => {
                    const dateA = parseStringDate(a.fecha, a.hora) || (a.timestamp ? a.timestamp.toDate() : new Date(0));
                    const dateB = parseStringDate(b.fecha, b.hora) || (b.timestamp ? b.timestamp.toDate() : new Date(0));
                    return dateA - dateB;
                });

                const byUserV = {};
                visitasLogs.forEach(log => {
                    const key = (log.usuario || '').toLowerCase().trim();
                    if (!byUserV[key]) byUserV[key] = [];
                    byUserV[key].push(log);
                });

                const visitasShifts = [];
                Object.keys(byUserV).sort().forEach(email => {
                    const records = byUserV[email];
                    let pendingEntry = null;
                    const userShifts = [];
                    records.forEach(rec => {
                        if (rec.tipo === 'Llegada Cliente') {
                            if (pendingEntry) userShifts.push({ entry: pendingEntry, exit: null, email });
                            pendingEntry = rec;
                        } else if (rec.tipo === 'Salida Cliente') {
                            if (pendingEntry) { userShifts.push({ entry: pendingEntry, exit: rec, email }); pendingEntry = null; }
                            else userShifts.push({ entry: null, exit: rec, email });
                        }
                    });
                    if (pendingEntry) userShifts.push({ entry: pendingEntry, exit: null, email });
                    visitasShifts.push(...userShifts);
                });

                // Agrupar por bloques de Turno
                // Filtrar visitasShifts por fecha si es necesario
                let filteredVisitasShifts = visitasShifts;
                if (startDate || endDate) {
                    const parseISOToLocal = (isoStr) => {
                        if (!isoStr) return null;
                        const [y, m, d] = isoStr.split('-').map(Number);
                        return new Date(y, m - 1, d);
                    };
                    const start = startDate ? parseISOToLocal(startDate) : null;
                    const end = endDate ? parseISOToLocal(endDate) : null;
                    
                    filteredVisitasShifts = visitasShifts.filter(vs => {
                        const refDate = vs.entry ? vs.entry.fecha : vs.exit?.fecha;
                        const d = parseSpanishDate(refDate);
                        if (!d) return false;
                        if (start && d < start) return false;
                        if (end && d > end) return false;
                        return true;
                    });
                }

                const userShiftBlocks = {};
                shifts.forEach(shift => {
                    const { entry, exit, email } = shift;
                    if (!email || !entry) return;
                    if (!userShiftBlocks[email]) userShiftBlocks[email] = [];
                    userShiftBlocks[email].push({ entry, exit, email, visits: [] });
                });

                filteredVisitasShifts.forEach(visitShift => {
                    const { entry, exit, email } = visitShift;
                    if (!email || !entry) return;
                    if (!userShiftBlocks[email]) userShiftBlocks[email] = [];
                    
                    const visitStartMs = parseStringDate(entry.fecha, entry.hora)?.getTime() || 0;
                    
                    let foundBlock = userShiftBlocks[email].find(b => {
                        const bStartMs = parseStringDate(b.entry?.fecha, b.entry?.hora)?.getTime() || 0;
                        const bEndMs = b.exit ? (parseStringDate(b.exit.fecha, b.exit.hora)?.getTime() || Infinity) : Infinity;
                        return visitStartMs >= (bStartMs - 120000) && visitStartMs <= bEndMs;
                    });
                    
                    if (foundBlock) {
                        foundBlock.visits.push(visitShift);
                    } else {
                        userShiftBlocks[email].push({
                            entry: { fecha: entry.fecha, hora: entry.hora, localidad: 'Turno Huérfano' },
                            exit: { fecha: exit?.fecha || entry.fecha, hora: exit?.hora || entry.hora, localidad: 'Turno Huérfano' },
                            email,
                            visits: [visitShift]
                        });
                    }
                });

                headers = ['Usuario', 'Nombres', 'Apellidos', 'Día', 'Fecha Entrada (Turno)', 'Clientes Visitados', 'Total Horas Efectivas (Suma Clientes)', 'Horas Totales Trabajadas (Bruto)', 'Tiempo en Transporte (Horas)', 'Descuento Almuerzo', 'Horas Totales Trabajadas (Neto)', 'Comentario Admin 1', 'Comentario Admin 2'];

                Object.keys(userShiftBlocks).forEach(email => {
                    const emp = employeesMap[email] || { firstName: '', lastName: '' };
                    const blocks = userShiftBlocks[email];
                    
                    blocks.forEach(block => {
                        // Resumen general de ese turno particular
                        
                        let diaStr = '-';
                        if (block.entry?.fecha) {
                            const d = parseSpanishDate(block.entry.fecha);
                            diaStr = (d && !isNaN(d.getTime())) ? dayFormatter.format(d) : block.entry.fecha;
                        }

                        let totalVisitasHrs = 0;
                        block.visits.forEach(({ entry, exit }) => {
                            if (entry && exit) {
                                totalVisitasHrs += calcMsDiffHrs(entry.fecha, entry.hora, exit.fecha, exit.hora);
                            }
                        });

                        let horasTotalesBruto = 0;
                        let horasNeto = 0;
                        if (block.entry && block.exit) {
                            horasTotalesBruto = calcMsDiffHrs(block.entry.fecha, block.entry.hora, block.exit.fecha, block.exit.hora);
                            horasNeto = horasTotalesBruto;
                            const lunchModeExplicit3 = timeConfig.calc_lunchMode === 'individual' || timeConfig.calc_lunchMode === 'empresa';
                            const shouldDeduct = lunchModeExplicit3
                                ? block.exit?.applyLunch === true
                                : (block.exit?.applyLunch === true 
                                    ? true 
                                    : (block.exit?.applyLunch === false 
                                        ? false 
                                        : (timeConfig.calc_lunch && (horasTotalesBruto * 60) >= 480)));
                            if (shouldDeduct) {
                                horasNeto -= ((parseInt(timeConfig.calc_lunchMins, 10) || 60) / 60);
                            }
                        }

                        let horasTransporte = horasTotalesBruto - totalVisitasHrs;
                        if (horasTransporte < 0) horasTransporte = 0;

                        // Si el turno no tiene nada ni de hrs totales ni visitas, se omite
                        if (horasTotalesBruto === 0 && totalVisitasHrs === 0) return;

                        rows.push([
                            email, emp.firstName, emp.lastName, diaStr, block.entry?.fecha || '-',
                            block.visits.length,
                            parseFloat(totalVisitasHrs.toFixed(2)),
                            parseFloat(horasTotalesBruto.toFixed(2)),
                            parseFloat(horasTransporte.toFixed(2)),
                            horasNeto !== horasTotalesBruto ? `Sí (${timeConfig.calc_lunchMins || 60} min)` : 'No',
                            parseFloat(horasNeto.toFixed(2)),
                            (block.entry?.comentarioAdmin && block.exit?.comentarioAdmin) ? block.entry.comentarioAdmin : (block.entry?.comentarioAdmin || block.exit?.comentarioAdmin || '-'),
                            (block.entry?.comentarioAdmin && block.exit?.comentarioAdmin) ? block.exit.comentarioAdmin : '-'
                        ]);
                    });
                });

            } else if (attendanceReportType === 'estandar') {
                headers = ['Usuario', 'Nombres', 'Apellidos', 'Dia Entrada', 'Fecha Entrada', 'Hora Entrada', 'Localidad Entrada', 'Fecha Salida', 'Hora Salida', 'Localidad Salida', 'Almuerzo', 'Horas (sin descontar almuerzo)', 'Horas (descontando almuerzo)', 'Observación', 'Comentario Admin 1', 'Comentario Admin 2'];
                rows = shifts.map(({ entry, exit, email }) => {
                    const emp = employeesMap[email] || { firstName: '', lastName: '' };
                    let dia = '-';
                    if (entry?.fecha) {
                        const d = parseSpanishDate(entry.fecha);
                        dia = (d && !isNaN(d.getTime())) ? dayFormatter.format(d) : '-';
                    }
                    let horasSinDescontar = 0;
                    let horasDescontando = 0;
                    let lunch = 'No';
                    if (entry && exit) {
                        const start = parseStringDate(entry.fecha, entry.hora);
                        const end = parseStringDate(exit.fecha, exit.hora);
                        const calc = calculateLaborHours(start, end, { ...timeConfig, applyLunchOverride: exit?.applyLunch });
                        if (!calc.error) {
                            const lunchMins = parseInt(timeConfig.calc_lunchMins, 10) || 60;
                            const minsSinDescontar = calc.raw.totalMins + (calc.appliedLunchDeduction ? lunchMins : 0);
                            horasSinDescontar = parseFloat((minsSinDescontar / 60).toFixed(2));
                            horasDescontando = parseFloat((calc.raw.totalMins / 60).toFixed(2));
                            if (calc.appliedLunchDeduction) {
                                lunch = `Sí (${lunchMins} min)`;
                            }
                        }
                    }
                    const obsEnv = [entry?.observacion, exit?.observacion].filter(Boolean).join(' | ') || '-';
                    return [
                        email, emp.firstName, emp.lastName, dia,
                        entry?.fecha || '-', entry?.hora || '-', (entry?.localidad || entry?.ubicacion) || '-',
                        exit?.fecha || '-', exit?.hora || '-', (exit?.localidad || exit?.ubicacion) || '-',
                        lunch, horasSinDescontar, horasDescontando, obsEnv,
                        (entry?.comentarioAdmin && exit?.comentarioAdmin) ? entry.comentarioAdmin : (entry?.comentarioAdmin || exit?.comentarioAdmin || '-'),
                        (entry?.comentarioAdmin && exit?.comentarioAdmin) ? exit.comentarioAdmin : '-'
                    ];
                });
            } else if (attendanceReportType === 'detallado_horas') {
                headers = ['Usuario', 'Nombres', 'Apellidos', 'Dia', 'F. Ingreso', 'H. Ingreso', 'F. Salida', 'H. Salida', 'Almuerzo Aplicado', 'Diurnas', 'Nocturnas', 'Dom Diu', 'Dom Noc', 'Total (sin descontar almuerzo)', 'Total (descontando almuerzo)', 'Observación', 'Comentario Admin 1', 'Comentario Admin 2'];
                rows = shifts.map(({ entry, exit, email }) => {
                    const emp = employeesMap[email] || { firstName: '', lastName: '' };
                    let dia = '-';
                    if (entry?.fecha) {
                        const d = parseSpanishDate(entry.fecha);
                        dia = (d && !isNaN(d.getTime())) ? dayFormatter.format(d) : '-';
                    }
                    let h = { diurnas: '-', nocturnas: '-', domDiurnas: '-', domNocturnas: '-', totalHHMM: '-' };
                    let lunchApplied = 'No';
                    let totalSinDescontar = '-';
                    let totalDescontando = '-';
                    if (entry && exit) {
                        const calc = calculateLaborHours(parseStringDate(entry.fecha, entry.hora), parseStringDate(exit.fecha, exit.hora), { ...timeConfig, applyLunchOverride: exit?.applyLunch });
                        if (!calc.error) {
                            h = calc.format;
                            const lunchMins = parseInt(timeConfig.calc_lunchMins, 10) || 60;
                            if (calc.appliedLunchDeduction) {
                                lunchApplied = `Sí (${lunchMins} min)`;
                            }
                            const minsSinDescontar = calc.raw.totalMins + (calc.appliedLunchDeduction ? lunchMins : 0);
                            totalSinDescontar = parseFloat((minsSinDescontar / 60).toFixed(2));
                            totalDescontando = parseFloat((calc.raw.totalMins / 60).toFixed(2));
                        }
                    }
                    const obsEnv = [entry?.observacion, exit?.observacion].filter(Boolean).join(' | ') || '-';
                    return [
                        email, emp.firstName, emp.lastName, dia,
                        entry?.fecha || '-', entry?.hora || '-', exit?.fecha || '-', exit?.hora || '-',
                        lunchApplied, h.diurnas, h.nocturnas, h.domDiurnas, h.domNocturnas, totalSinDescontar, totalDescontando, obsEnv,
                        (entry?.comentarioAdmin && exit?.comentarioAdmin) ? entry.comentarioAdmin : (entry?.comentarioAdmin || exit?.comentarioAdmin || '-'),
                        (entry?.comentarioAdmin && exit?.comentarioAdmin) ? exit.comentarioAdmin : '-'
                    ];
                });
            } else {
                // Resumen
                headers = ['Usuario', 'Nombres', 'Apellidos', 'Diu', 'Noc', 'Dom Diu', 'Dom Noc', 'Total Horas Almuerzo', 'Total (sin descontar almuerzo)', 'Total (descontando almuerzo)', 'Comentario Admin 1', 'Comentario Admin 2'];
                const summary = {};
                shifts.forEach(({ entry, exit, email }) => {
                    if (!summary[email]) summary[email] = { u: email, fn: employeesMap[email]?.firstName || '', ln: employeesMap[email]?.lastName || '', d: 0, n: 0, dd: 0, dn: 0, lunchMinsTotal: 0, totalSinDescontarMins: 0, comments: [] };
                    if (entry && exit) {
                        const calc = calculateLaborHours(parseStringDate(entry.fecha, entry.hora), parseStringDate(exit.fecha, exit.hora), { ...timeConfig, applyLunchOverride: exit?.applyLunch });
                        if (!calc.error) {
                            summary[email].d += calc.raw.diurnas;
                            summary[email].n += calc.raw.nocturnas;
                            summary[email].dd += calc.raw.domDiurnas;
                            summary[email].dn += calc.raw.domNocturnas;
                            const lunchMins = parseInt(timeConfig.calc_lunchMins, 10) || 60;
                            const minsDescontados = calc.appliedLunchDeduction ? lunchMins : 0;
                            summary[email].lunchMinsTotal += minsDescontados;
                            summary[email].totalSinDescontarMins += (calc.raw.totalMins + minsDescontados);
                            if (entry?.comentarioAdmin) summary[email].comments.push(entry.comentarioAdmin);
                            if (exit?.comentarioAdmin) summary[email].comments.push(exit.comentarioAdmin);
                        }
                    }
                });
                rows = Object.values(summary).map(s => [
                    s.u, s.fn, s.ln,
                    parseFloat((s.d / 60).toFixed(2)),
                    parseFloat((s.n / 60).toFixed(2)),
                    parseFloat((s.dd / 60).toFixed(2)),
                    parseFloat((s.dn / 60).toFixed(2)),
                    parseFloat((s.lunchMinsTotal / 60).toFixed(2)),
                    parseFloat((s.totalSinDescontarMins / 60).toFixed(2)),
                    parseFloat(((s.d + s.n + s.dd + s.dn) / 60).toFixed(2)),
                    ([...new Set(s.comments)].filter(Boolean)[0] || '-'),
                    ([...new Set(s.comments)].filter(Boolean).slice(1).join(' | ') || '-')
                ]);
            }

            // Post-procesar comentarios: Cambiar títulos a "Comentario 1" y "Comentario 2"
            // y remover columna 2 si en ningún día se registró un segundo comentario.
            if (headers && headers.length >= 2) {
                const h1 = headers[headers.length - 2];
                const h2 = headers[headers.length - 1];
                if (h1 === 'Comentario Admin 1' && h2 === 'Comentario Admin 2') {
                    const hasComment2 = rows.some(row => {
                        const val = row[row.length - 1];
                        return val && val !== '-';
                    });

                    if (hasComment2) {
                        headers[headers.length - 2] = 'Comentario 1';
                        headers[headers.length - 1] = 'Comentario 2';
                    } else {
                        headers.pop();
                        headers[headers.length - 1] = 'Comentario 1';
                        rows.forEach(row => {
                            row.pop();
                        });
                    }
                }
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
            const snap = await getDocs(collection(db, 'incidents')); // Sin orderBy para evitar error de índice
            let incidents = snap.docs.map(d => ({ id: d.id, ...d.data() }));

            // NEW: Fetch photo URLs from the 'fotos' collection to match legacy online records
            // Since the app saves the incident first and uploads the photo asynchronously, 
            // the 'incidents' doc often lacks the 'fotoURL'. The 'fotos' collection holds the truth.
            try {
                const photosQuery = query(collection(db, 'fotos'), where('tipo', '==', 'incidente'));
                const photosSnap = await getDocs(photosQuery);
                const photoMap = new Map();
                console.log(`[DEBUG] Se extrajeron ${photosSnap.docs.length} fotos con tipo 'incidente' de Firebase.`);
                photosSnap.docs.forEach(d => {
                    const data = d.data();
                    if (data.email && data.fecha && data.hora && data.url) {
                        const key = `${data.email.trim().toLowerCase()}_${data.fecha.trim()}_${data.hora.trim()}`;
                        photoMap.set(key, data.url);
                    }
                });
                
                console.log(`[DEBUG] Mapa de fotos creado con ${photoMap.size} elementos únicas.`);
                // Assign to incidents
                let emparejados = 0;
                incidents.forEach(inc => {
                    if (!inc.fotoURL) {
                        const key = `${(inc.usuario||'').trim().toLowerCase()}_${(inc.fecha||'').trim()}_${(inc.hora||'').trim()}`;
                        if (photoMap.has(key)) {
                            inc.fotoURL = photoMap.get(key);
                            emparejados++;
                        }
                    }
                });
                console.log(`[DEBUG] Total Novedades: ${incidents.length}. Emparejadas con éxito: ${emparejados}`);
            } catch (photoErr) {
                console.error("Error recuperando las fotos vinculadas a las novedades:", photoErr);
            }


            // Ordenamiento por Usuario(A-Z) y luego Fecha(Desc)
            incidents.sort((a, b) => {
                const userA = (a.usuario || '').toLowerCase();
                const userB = (b.usuario || '').toLowerCase();
                if (userA !== userB) return userA.localeCompare(userB);

                const timeA = a.timestamp ? (a.timestamp.toMillis ? a.timestamp.toMillis() : new Date(a.timestamp).getTime()) : 0;
                const timeB = b.timestamp ? (b.timestamp.toMillis ? b.timestamp.toMillis() : new Date(b.timestamp).getTime()) : 0;
                return timeB - timeA;
            });

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
                const employeesMap = await getEmployeesMap();
                incidents = incidents.filter(inc => {
                    const email = (inc.usuario || '').toLowerCase();
                    const emp = employeesMap[email] || {};
                    const fullName = `${emp.nombre || emp.firstName || ''} ${emp.apellido || emp.lastName || ''}`.toLowerCase();
                    return email.includes(needle) || fullName.includes(needle);
                });
            }
            if (incidents.length === 0) { alert('No hay novedades.'); return; }

            const headers = ['Usuario', 'Fecha', 'Hora', 'Localidad', 'Descripcion', 'Foto'];
            const rows = incidents.map(inc => [inc.usuario || '', inc.fecha || '', inc.hora || '', inc.localidad || inc.ubicacion || '', inc.descripcion || '', inc.fotoURL || 'Sin foto']);
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
            <div className={modoGerencialActivo && pestanaActiva === 'gerencial' ? "max-w-7xl mx-auto transition-all" : "max-w-6xl mx-auto transition-all"}>
                <div className="flex flex-wrap justify-between items-center mb-8 gap-4">
                    <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-2">
                        <FileText size={30} className="text-blue-600" />
                        Centro de Informes y Reportes
                        <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-mono ml-2 border border-gray-200">v{import.meta.env.VITE_APP_VERSION}</span>
                    </h1>

                    {/* 🔐 PESTAÑAS CONDICIONALES: Solo visibles si modoGerencialActivo está encendido */}
                    {modoGerencialActivo && (
                        <div className="flex items-center bg-white/90 backdrop-blur p-1 rounded-2xl shadow-lg border border-white/60 gap-1 animate-in fade-in duration-300">
                            <button
                                onClick={() => cambiarPestana('descargas')}
                                className={`px-4 py-2 rounded-xl font-bold text-xs sm:text-sm flex items-center gap-2 transition ${
                                    pestanaActiva === 'descargas'
                                        ? 'bg-blue-600 text-white shadow-md'
                                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100/70'
                                }`}
                            >
                                <FileText size={16} /> Descargas y Archivos
                            </button>
                            <button
                                onClick={() => cambiarPestana('gerencial')}
                                className={`px-4 py-2 rounded-xl font-bold text-xs sm:text-sm flex items-center gap-2 transition ${
                                    pestanaActiva === 'gerencial'
                                        ? 'bg-blue-600 text-white shadow-md'
                                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100/70'
                                }`}
                            >
                                <TrendingUp size={16} /> Tablero Gerencial
                            </button>
                        </div>
                    )}

                    <button onClick={() => navigate('/login')} className="px-6 py-2.5 bg-white text-gray-800 font-bold flex items-center gap-2 rounded-xl border border-gray-100 shadow-lg hover:bg-gray-50 transition whitespace-nowrap">
                        <ArrowLeft size={20} /> Volver
                    </button>
                </div>

                {/* CONTENIDO: Alterna entre el nuevo Tablero Gerencial o el centro actual de descargas */}
                {modoGerencialActivo && pestanaActiva === 'gerencial' ? (
                    <TableroGerencial />
                ) : (
                    <>
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
                                        } catch (e) { setPhotoMsg('❌ Error: ' + e.message); console.error('Error en descarga de fotos:', e); } finally { setPhotoSearching(false); }
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
                                    {storageConfig?.ruta_active && (
                                        <option value="visitas">Solo Visitas en Clientes (Ruta)</option>
                                    )}
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
                                    {storageConfig?.ruta_active && (
                                        <>
                                            <option value="tiempo_efectivo_cliente">Tiempo Efectivo en Cliente (Modo Ruta) - Detallado</option>
                                            <option value="tiempo_efectivo_cliente_resumen">Tiempo Efectivo en Cliente (Modo Ruta) - Resumido</option>
                                            <option value="tiempo_efectivo_cliente_dias">Tiempo Efectivo en Cliente (Modo Ruta) - Por Días</option>
                                            <option value="control_detallado_jornada">Control Detallado de Jornada y Ruta (Por Días)</option>
                                            <option value="control_consolidado_jornada">Control Consolidado por Jornada y Ruta (Por Empleado)</option>
                                        </>
                                    )}
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
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                                <div><label className="text-sm">Desde</label><input type="date" value={incidentStartDate} onChange={e => setIncidentStartDate(e.target.value)} className="w-full px-4 py-2 border rounded-lg" /></div>
                                <div><label className="text-sm">Hasta</label><input type="date" value={incidentEndDate} onChange={e => setIncidentEndDate(e.target.value)} className="w-full px-4 py-2 border rounded-lg" /></div>
                                <div><label className="text-sm">Usuario</label><input type="text" value={incidentCsvUserFilter} onChange={e => setIncidentCsvUserFilter(e.target.value)} className="w-full px-4 py-2 border rounded-lg" /></div>
                            </div>
                            <div className="flex gap-4 flex-wrap justify-end">
                                <select value={exportFormatIncidents} onChange={e => setExportFormatIncidents(e.target.value)} className="px-4 py-2 border rounded-lg">
                                    <option value="csv">CSV</option>
                                    <option value="xlsx">XLSX</option>
                                </select>
                                <button onClick={exportIncidentsToCSV} disabled={exportingIncidents} className="px-8 py-2 bg-orange-600 text-white font-bold rounded-lg hover:bg-orange-700 flex items-center gap-2 shadow-md">
                                    {exportingIncidents ? <Loader2 size={20} className="animate-spin" /> : <Download size={20} />} Exportar
                                </button>
                            </div>
                            <div className="mt-4 pt-4 border-t border-red-50 flex items-center justify-between">
                                <p className="text-xs text-gray-500">Borrar novedades permanentemente en el rango de fechas.</p>
                                <button onClick={handleBulkDeleteIncidents} disabled={deletingIncidents || !incidentStartDate || !incidentEndDate} className="px-4 py-2 bg-red-100 text-red-700 rounded-lg font-bold hover:bg-red-200 transition">Borrar Rango</button>
                            </div>
                        </div>
                        
                        {/* 3.1. EXPORTAR VISITAS (MODO RUTA) */}
                        {storageConfig?.ruta_active && (
                            <div className="bg-white rounded-xl shadow-2xl p-6 mb-6 border-l-4 border-blue-400">
                                <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2"><Navigation size={24} className="text-blue-500" /> Reporte de Visitas a Clientes</h2>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                                    <div><label className="text-sm">Desde</label><input type="date" value={visitStartDate} onChange={e => setVisitStartDate(e.target.value)} className="w-full px-4 py-2 border rounded-lg" /></div>
                                    <div><label className="text-sm">Hasta</label><input type="date" value={visitEndDate} onChange={e => setVisitEndDate(e.target.value)} className="w-full px-4 py-2 border rounded-lg" /></div>
                                    <div><label className="text-sm">Usuario</label><input type="text" value={visitCsvUserFilter} onChange={e => setVisitCsvUserFilter(e.target.value)} className="w-full px-4 py-2 border rounded-lg" /></div>
                                </div>
                                <div className="flex gap-4 flex-wrap justify-end">
                                    <select value={exportFormatVisits} onChange={e => setExportFormatVisits(e.target.value)} className="px-4 py-2 border rounded-lg">
                                        <option value="csv">CSV</option>
                                        <option value="xlsx">XLSX</option>
                                    </select>
                                    <button onClick={handleExportVisitas} disabled={exportingVisits} className="px-8 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 flex items-center gap-2 shadow-md">
                                        {exportingVisits ? <Loader2 size={20} className="animate-spin" /> : <Download size={20} />} Exportar
                                    </button>
                                </div>
                                <div className="mt-4 pt-4 border-t border-red-50 flex items-center justify-between">
                                    <p className="text-xs text-gray-500">Borrar visitas permanentemente en el rango de fechas.</p>
                                    <button onClick={handleBulkDeleteVisitas} disabled={deletingVisits || !visitStartDate || !visitEndDate} className="px-4 py-2 bg-red-100 text-red-700 rounded-lg font-bold hover:bg-red-200 transition">
                                        {deletingVisits ? 'Borrando...' : 'Borrar Rango'}
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* 3.2 REPORTE DE INCONSISTENCIAS (SEGURIDAD GPS) */}
                        <div className="bg-white rounded-xl shadow-2xl p-6 mb-6 border-l-4 border-red-600">
                            <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2"><AlertTriangle size={24} className="text-red-600" /> Reporte de Inconsistencias (Seguridad)</h2>
                            <p className="text-xs text-gray-500 mb-4">Muestra únicamente los registros donde el sistema detectó alertas de seguridad como probabilidad de interceptación satelital o engaños en la fotografía.</p>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                                <div><label className="text-sm">Desde</label><input type="date" value={incStartDate} onChange={e => setIncStartDate(e.target.value)} className="w-full px-4 py-2 border border-red-300 rounded-lg focus:ring-red-500" /></div>
                                <div><label className="text-sm">Hasta</label><input type="date" value={incEndDate} onChange={e => setIncEndDate(e.target.value)} className="w-full px-4 py-2 border border-red-300 rounded-lg focus:ring-red-500" /></div>
                                <div><label className="text-sm">Usuario</label><input type="text" value={incCsvUserFilter} onChange={e => setIncCsvUserFilter(e.target.value)} className="w-full px-4 py-2 border border-red-300 rounded-lg focus:ring-red-500" placeholder="Opcional..." /></div>
                            </div>
                            <div className="flex gap-4 flex-wrap justify-end">
                                <select value={exportFormatInc} onChange={e => setExportFormatInc(e.target.value)} className="px-4 py-2 border border-red-300 rounded-lg">
                                    <option value="csv">CSV</option>
                                    <option value="xlsx">Excel</option>
                                </select>
                                <button onClick={handleExportInconsistencias} disabled={exportingInc} className="px-8 py-2 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 flex items-center gap-2 shadow-md">
                                    {exportingInc ? <Loader2 size={20} className="animate-spin" /> : <Download size={20} />} Exportar
                                </button>
                            </div>
                            {/* Botón Descargar Diccionario */}
                            <div className="mt-4 pt-4 border-t border-red-100 flex flex-col md:flex-row items-center justify-between gap-4">
                                <p className="text-sm text-gray-600 font-medium whitespace-pre-wrap">Diccionario de errores de seguridad.</p>
                                <button onClick={() => {
                                    let content = "GLOSARIO DE ALERTAS DE INTEGRIDAD GPS\n========================================\n\n";
                                    Object.keys(GPS_ERROR_DICTIONARY).forEach(errCode => {
                                        const dict = GPS_ERROR_DICTIONARY[errCode];
                                        content += `[${errCode}] - ${dict.title}\n`;
                                        content += `${dict.description}\n\n`;
                                        content += "----------------------------------------\n\n";
                                    });
                                    const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
                                    const url = URL.createObjectURL(blob);
                                    const link = document.createElement('a');
                                    link.href = url;
                                    link.download = `Diccionario_Inconsistencias.txt`;
                                    link.click();
                                }} className="px-6 py-2 bg-red-50 text-red-700 border border-red-200 rounded-lg font-bold hover:bg-red-100 transition whitespace-nowrap flex items-center gap-2">
                                    <FileText size={18} /> Descargar Diccionario
                                </button>
                            </div>
                        </div>

                        {/* 4. GESTIÓN DE EMPLEADOS */}
                        <div className="bg-white rounded-xl shadow-2xl p-6 mb-12 border-l-4 border-emerald-500">
                            <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2"><UserMinus size={24} className="text-emerald-600" /> Personal y Empleados</h2>
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end mb-4">
                                <div className="md:col-span-2">
                                    <label className="text-sm">Usuario</label>
                                    <input type="text" placeholder="Filtrar por email..." value={filterEmail} onChange={e => setFilterEmail(e.target.value)} className="w-full px-4 py-2 border rounded-lg" />
                                </div>
                                <div className="md:col-span-2 flex gap-2">
                                    <select value={exportFormatEmployees} onChange={e => setExportFormatEmployees(e.target.value)} className="border rounded-lg px-2">
                                        <option value="csv">CSV</option>
                                        <option value="xlsx">XLSX</option>
                                    </select>
                                    <button onClick={exportEmployeesToCSV} disabled={exportingEmployees} className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-bold hover:bg-blue-700 flex justify-center gap-2">
                                        {exportingEmployees ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />} Exportar
                                    </button>
                                </div>
                            </div>
                            <div className="mt-4 pt-4 border-t border-red-50 flex items-center justify-between">
                                <p className="text-xs text-gray-500">Eliminar permanentemente a un empleado del sistema.</p>
                                <button onClick={() => setShowDeleteModal(true)} className="px-4 py-2 bg-red-100 text-red-700 rounded-lg font-bold hover:bg-red-200 transition flex items-center gap-2">
                                    <Trash2 size={16} /> Borrar Empleado
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>

            <DeleteEmployeeModal isOpen={showDeleteModal} onClose={() => setShowDeleteModal(false)} />
        </div>
    );
}
