// src/components/informes/TableroGerencial.jsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    Users, Clock, Truck, Building2, TrendingUp, TrendingDown,
    AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Download,
    Search, RefreshCw, SlidersHorizontal, CheckSquare, Square,
    Calendar, Eye, EyeOff, FileSpreadsheet, ChevronLeft, ChevronRight,
    MapPin, MessageSquare, ShieldAlert, Utensils, RotateCcw, Filter
} from 'lucide-react';
import { getDocs, collection, doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import { getAllAttendanceLogs } from '../../services/attendanceService';
import { getEmployeesMap } from '../../services/employeeService';
import { exportToExcelHTML } from '../../utils/exportUtils';
import {
    pairAttendanceLogs,
    pairVisitLogs,
    computeGerencialDashboardData,
    parseSpanishOrISODate
} from '../../utils/gerencialCalculator';

export default function TableroGerencial() {
    // ── Estados de Datos ────────────────────────────────────────────────────────
    const [loading, setLoading] = useState(true);
    const [rawAttendanceLogs, setRawAttendanceLogs] = useState([]);
    const [rawVisitas, setRawVisitas] = useState([]);
    const [employeesMap, setEmployeesMap] = useState({});
    const [timeConfig, setTimeConfig] = useState({});

    // ── Periodo y Fechas ────────────────────────────────────────────────────────
    const [currentYearMonth, setCurrentYearMonth] = useState(() => {
        const now = new Date();
        return { year: now.getFullYear(), month: now.getMonth() };
    });
    const [presetPeriodo, setPresetPeriodo] = useState(() => {
        const now = new Date();
        return now.getDate() <= 15 ? 'q1' : 'q2';
    });
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    // ── Filtros y Checks de Decisión ───────────────────────────────────────────
    const [filtroTexto, setFiltroTexto] = useState('');
    const [descontarAlmuerzo, setDescontarAlmuerzo] = useState(true);

    // Checks de filtro rápido (Alertas / Casos clave)
    const [checkSoloExtras, setCheckSoloExtras] = useState(false);
    const [checkSoloDeficit, setCheckSoloDeficit] = useState(false);
    const [checkSoloEnRuta, setCheckSoloEnRuta] = useState(false);
    const [checkSoloAlertas, setCheckSoloAlertas] = useState(false);
    const [checkSoloComentarios, setCheckSoloComentarios] = useState(false);

    const hayFiltrosActivos = checkSoloExtras || checkSoloDeficit || checkSoloEnRuta || checkSoloAlertas || checkSoloComentarios;
    const limpiarFiltros = () => {
        setCheckSoloExtras(false);
        setCheckSoloDeficit(false);
        setCheckSoloEnRuta(false);
        setCheckSoloAlertas(false);
        setCheckSoloComentarios(false);
    };

    // Checks de columnas visibles
    const [colTraslados, setColTraslados] = useState(true);
    const [colVisitas, setColVisitas] = useState(true);
    const [colRecargos, setColRecargos] = useState(true);
    const [colAlmuerzoBruto, setColAlmuerzoBruto] = useState(false);
    const [colBaseBalance, setColBaseBalance] = useState(true);

    // Selección de empleados (Checks de fila para subtotales y exportación)
    const [selectedEmails, setSelectedEmails] = useState(new Set());

    // Acordeón de empleado expandido
    const [expandedEmail, setExpandedEmail] = useState(null);

    // Exportación
    const [exporting, setExporting] = useState(false);

    // ── 1. Inicializar Fechas según Preset y Mes ───────────────────────────────
    useEffect(() => {
        const { year, month } = currentYearMonth;
        const lastDayOfMonth = new Date(year, month + 1, 0).getDate();

        const pad = (n) => String(n).padStart(2, '0');
        const mStr = pad(month + 1);

        if (presetPeriodo === 'q1') {
            setStartDate(`${year}-${mStr}-01`);
            setEndDate(`${year}-${mStr}-15`);
        } else if (presetPeriodo === 'q2') {
            setStartDate(`${year}-${mStr}-16`);
            setEndDate(`${year}-${mStr}-${pad(lastDayOfMonth)}`);
        } else if (presetPeriodo === 'mes') {
            setStartDate(`${year}-${mStr}-01`);
            setEndDate(`${year}-${mStr}-${pad(lastDayOfMonth)}`);
        }
    }, [currentYearMonth, presetPeriodo]);

    // ── 2. Cargar Datos desde Firebase ─────────────────────────────────────────
    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [logs, snapVisitas, empMap, snapSettings] = await Promise.all([
                getAllAttendanceLogs(),
                getDocs(collection(db, 'visitas')),
                getEmployeesMap(),
                getDoc(doc(db, 'settings', 'employeeFields'))
            ]);

            setRawAttendanceLogs(logs || []);
            setRawVisitas(snapVisitas.docs.map(d => ({ id: d.id, ...d.data() })));
            setEmployeesMap(empMap || {});
            if (snapSettings.exists()) {
                setTimeConfig(snapSettings.data());
            }
        } catch (err) {
            console.error('Error cargando datos para Tablero Gerencial:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // ── 3. Procesar y Consolidar Datos en Tiempo Real ──────────────────────────
    const processedData = useMemo(() => {
        if (!rawAttendanceLogs.length) {
            return { kpis: null, employeesList: [], basePeriodHours: 0 };
        }

        const pairedShifts = pairAttendanceLogs(rawAttendanceLogs);
        const parsedStart = parseSpanishOrISODate(startDate);
        const parsedEnd = parseSpanishOrISODate(endDate);

        return computeGerencialDashboardData({
            shifts: pairedShifts,
            visitas: rawVisitas,
            employeesMap,
            timeConfig,
            rangeStart: parsedStart,
            rangeEnd: parsedEnd,
            applyLunchOverride: descontarAlmuerzo
        });
    }, [rawAttendanceLogs, rawVisitas, employeesMap, timeConfig, startDate, endDate, descontarAlmuerzo]);

    // ── 4. Filtrar Empleados por Texto y Checks de Decisión ────────────────────
    const filteredEmployees = useMemo(() => {
        if (!processedData?.employeesList) return [];

        let list = processedData.employeesList;

        // Búsqueda por texto (nombre, correo o documento)
        if (filtroTexto.trim()) {
            const term = filtroTexto.trim().toLowerCase();
            list = list.filter(e =>
                e.nombre.toLowerCase().includes(term) ||
                e.email.toLowerCase().includes(term) ||
                e.documento.toLowerCase().includes(term)
            );
        }

        // Checks de decisión
        if (checkSoloExtras) {
            list = list.filter(e => e.hasExtras);
        }
        if (checkSoloDeficit) {
            list = list.filter(e => e.hasDeficit);
        }
        if (checkSoloEnRuta) {
            list = list.filter(e => e.hasTraslados);
        }
        if (checkSoloAlertas) {
            list = list.filter(e => e.hasAlerts);
        }
        if (checkSoloComentarios) {
            list = list.filter(e => e.comments && e.comments.length > 0);
        }

        return list;
    }, [processedData, filtroTexto, checkSoloExtras, checkSoloDeficit, checkSoloEnRuta, checkSoloAlertas, checkSoloComentarios]);

    // ── 5. Subtotales de Empleados Seleccionados con Checks ─────────────────────
    const selectedSubtotals = useMemo(() => {
        if (selectedEmails.size === 0) return null;

        const selectedList = (processedData?.employeesList || []).filter(e => selectedEmails.has(e.email));
        if (selectedList.length === 0) return null;

        let totalHoras = 0;
        let totalTraslado = 0;
        let totalVisitas = 0;
        let totalBalance = 0;

        selectedList.forEach(e => {
            totalHoras += e.horasNetas;
            totalTraslado += e.horasTraslado;
            totalVisitas += e.totalVisitas;
            totalBalance += e.balance;
        });

        return {
            count: selectedList.length,
            totalHoras: parseFloat(totalHoras.toFixed(2)),
            totalTraslado: parseFloat(totalTraslado.toFixed(2)),
            totalVisitas,
            totalBalance: parseFloat(totalBalance.toFixed(2))
        };
    }, [selectedEmails, processedData]);

    // ── 6. Manejo de Selección de Checks ───────────────────────────────────────
    const handleToggleSelectAll = () => {
        if (selectedEmails.size === filteredEmployees.length && filteredEmployees.length > 0) {
            setSelectedEmails(new Set());
        } else {
            const allEmails = new Set(filteredEmployees.map(e => e.email));
            setSelectedEmails(allEmails);
        }
    };

    const handleToggleSelectEmployee = (email) => {
        setSelectedEmails(prev => {
            const next = new Set(prev);
            if (next.has(email)) {
                next.delete(email);
            } else {
                next.add(email);
            }
            return next;
        });
    };

    // ── 7. Navegación de Meses ─────────────────────────────────────────────────
    const handlePrevMonth = () => {
        setCurrentYearMonth(prev => {
            if (prev.month === 0) return { year: prev.year - 1, month: 11 };
            return { year: prev.year, month: prev.month - 1 };
        });
    };

    const handleNextMonth = () => {
        setCurrentYearMonth(prev => {
            if (prev.month === 11) return { year: prev.year + 1, month: 0 };
            return { year: prev.year, month: prev.month + 1 };
        });
    };

    const monthLabel = useMemo(() => {
        const d = new Date(currentYearMonth.year, currentYearMonth.month, 1);
        const name = new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric' }).format(d);
        return name.charAt(0).toUpperCase() + name.slice(1);
    }, [currentYearMonth]);

    // ── 8. Exportar a Excel con formato gerencial ──────────────────────────────
    const handleExportExcel = () => {
        setExporting(true);
        try {
            const listToExport = selectedEmails.size > 0
                ? filteredEmployees.filter(e => selectedEmails.has(e.email))
                : filteredEmployees;

            if (listToExport.length === 0) {
                alert('No hay empleados para exportar.');
                return;
            }

            const headers = [
                'COLABORADOR', 'DOCUMENTO', 'CORREO', 'CARGO', 'DEPARTAMENTO',
                'DÍAS TRABAJADOS', 'HORAS NETAS', 'HORAS BRUTAS', 'HORAS ALMUERZO',
                'TIEMPO TRASLADO (HRS)', 'TIEMPO EN CLIENTES (HRS)', 'TOTAL VISITAS',
                'HORA DIURNA', 'HORA NOCTURNA', 'DOMINICAL DIURNA', 'DOMINICAL NOCTURNA',
                'BASE HORAS PERIODO', 'BALANCE (+/-)', 'ESTADO', 'OBSERVACIONES'
            ];

            const rows = listToExport.map(e => [
                e.nombre,
                e.documento,
                e.email,
                e.cargo,
                e.departamento,
                e.diasTrabajados,
                e.horasNetas,
                e.horasBrutas,
                e.horasAlmuerzo,
                e.horasTraslado,
                e.horasServicio,
                e.totalVisitas,
                e.diurnas,
                e.nocturnas,
                e.domDiurnas,
                e.domNocturnas,
                e.baseMes,
                e.balance,
                e.balance > 0 ? 'CON HORAS EXTRAS' : (e.balance < 0 ? 'DÉFICIT HORAS' : 'CUMPLIÓ BASE'),
                e.comments.join(' | ') || '-'
            ]);

            const ts = new Date().toISOString().slice(0, 10);
            exportToExcelHTML(`informe_gerencial_${startDate}_a_${endDate}_${ts}.xlsx`, headers, rows);
        } catch (err) {
            console.error('Error exportando informe gerencial:', err);
            alert('Error al generar el archivo Excel.');
        } finally {
            setExporting(false);
        }
    };

    const kpis = processedData?.kpis;

    return (
        <div className="space-y-6">
            {/* ── BARRA SUPERIOR: Selector de Periodos y Navegación ────────── */}
            <div className="bg-white rounded-2xl p-5 shadow-lg border border-gray-100 flex flex-wrap items-center justify-between gap-4">
                {/* Selector de Mes */}
                <div className="flex items-center gap-3">
                    <div className="flex items-center bg-gray-50 border border-gray-200 rounded-xl p-1">
                        <button
                            onClick={handlePrevMonth}
                            title="Mes anterior"
                            className="p-1.5 hover:bg-white rounded-lg text-gray-600 transition"
                        >
                            <ChevronLeft size={18} />
                        </button>
                        <span className="px-3 font-bold text-gray-800 text-sm whitespace-nowrap min-w-[140px] text-center">
                            {monthLabel}
                        </span>
                        <button
                            onClick={handleNextMonth}
                            title="Mes siguiente"
                            className="p-1.5 hover:bg-white rounded-lg text-gray-600 transition"
                        >
                            <ChevronRight size={18} />
                        </button>
                    </div>

                    {/* Presets Quincenas / Mes */}
                    <div className="flex items-center bg-gray-100 p-1 rounded-xl text-xs font-bold gap-1">
                        <button
                            onClick={() => setPresetPeriodo('q1')}
                            className={`px-3 py-1.5 rounded-lg transition ${
                                presetPeriodo === 'q1' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
                            }`}
                        >
                            1ra Quincena (1-15)
                        </button>
                        <button
                            onClick={() => setPresetPeriodo('q2')}
                            className={`px-3 py-1.5 rounded-lg transition ${
                                presetPeriodo === 'q2' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
                            }`}
                        >
                            2da Quincena (16-Fin)
                        </button>
                        <button
                            onClick={() => setPresetPeriodo('mes')}
                            className={`px-3 py-1.5 rounded-lg transition ${
                                presetPeriodo === 'mes' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
                            }`}
                        >
                            Mes Completo
                        </button>
                    </div>
                </div>

                {/* Rango Manual de Fechas y Botón Recargar */}
                <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-xl px-2.5 py-1 text-xs">
                        <span className="text-gray-500 font-medium">Del:</span>
                        <input
                            type="date"
                            value={startDate}
                            onChange={e => { setStartDate(e.target.value); setPresetPeriodo('custom'); }}
                            className="bg-transparent font-bold text-gray-700 outline-none"
                        />
                        <span className="text-gray-500 font-medium ml-1">al:</span>
                        <input
                            type="date"
                            value={endDate}
                            onChange={e => { setEndDate(e.target.value); setPresetPeriodo('custom'); }}
                            className="bg-transparent font-bold text-gray-700 outline-none"
                        />
                    </div>

                    <button
                        onClick={loadData}
                        disabled={loading}
                        title="Refrescar datos de Firebase"
                        className="p-2 bg-gray-50 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-100 hover:text-blue-600 transition"
                    >
                        <RefreshCw size={16} className={loading ? 'animate-spin text-blue-600' : ''} />
                    </button>
                </div>
            </div>

            {/* ── BARRA DE CONTROLES: FILTROS Y PERSONALIZACIÓN (PRIMERO) ──── */}
            <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-md border border-gray-100/80 space-y-3.5">
                {/* Fila 1: Filtros de decisión (Chips interactivos de selección) */}
                <div className="flex flex-wrap items-center justify-between gap-2.5">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5 mr-1">
                            <SlidersHorizontal size={14} className="text-blue-600" /> Checks de Filtro:
                        </span>

                        {/* Check: Solo con Extras */}
                        <button
                            type="button"
                            onClick={() => setCheckSoloExtras(!checkSoloExtras)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition duration-150 ${
                                checkSoloExtras
                                    ? 'bg-emerald-50 border-emerald-300 text-emerald-700 shadow-sm'
                                    : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                            }`}
                        >
                            {checkSoloExtras ? <CheckSquare size={14} /> : <Square size={14} />}
                            Solo con Horas Extras
                        </button>

                        {/* Check: Solo con Déficit */}
                        <button
                            type="button"
                            onClick={() => setCheckSoloDeficit(!checkSoloDeficit)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition duration-150 ${
                                checkSoloDeficit
                                    ? 'bg-rose-50 border-rose-300 text-rose-700 shadow-sm'
                                    : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                            }`}
                        >
                            {checkSoloDeficit ? <CheckSquare size={14} /> : <Square size={14} />}
                            Solo con Déficit
                        </button>

                        {/* Check: Solo en Ruta */}
                        <button
                            type="button"
                            onClick={() => setCheckSoloEnRuta(!checkSoloEnRuta)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition duration-150 ${
                                checkSoloEnRuta
                                    ? 'bg-indigo-50 border-indigo-300 text-indigo-700 shadow-sm'
                                    : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                            }`}
                        >
                            {checkSoloEnRuta ? <CheckSquare size={14} /> : <Square size={14} />}
                            Solo en Ruta (con Traslados)
                        </button>

                        {/* Check: Solo con Alertas / Inconsistencias */}
                        <button
                            type="button"
                            onClick={() => setCheckSoloAlertas(!checkSoloAlertas)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition duration-150 ${
                                checkSoloAlertas
                                    ? 'bg-amber-50 border-amber-300 text-amber-700 shadow-sm'
                                    : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                            }`}
                        >
                            {checkSoloAlertas ? <CheckSquare size={14} /> : <Square size={14} />}
                            Solo con Alertas / Turnos Huérfanos
                        </button>

                        {/* Check: Solo con Comentarios */}
                        <button
                            type="button"
                            onClick={() => setCheckSoloComentarios(!checkSoloComentarios)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition duration-150 ${
                                checkSoloComentarios
                                    ? 'bg-purple-50 border-purple-300 text-purple-700 shadow-sm'
                                    : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                            }`}
                        >
                            {checkSoloComentarios ? <CheckSquare size={14} /> : <Square size={14} />}
                            Solo con Observaciones
                        </button>
                    </div>

                    {/* Botón de limpiar filtros activos */}
                    {hayFiltrosActivos && (
                        <button
                            type="button"
                            onClick={limpiarFiltros}
                            className="text-xs font-bold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-2.5 py-1 rounded-lg flex items-center gap-1 transition"
                            title="Restablecer todos los filtros"
                        >
                            <RotateCcw size={12} />
                            Limpiar filtros
                        </button>
                    )}
                </div>

                {/* Fila 2: Columnas visibles (izquierda) y Simulación de Almuerzo estilizada (derecha) */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-gray-100">
                    <div className="flex items-center gap-2 flex-wrap text-xs text-gray-600">
                        <span className="font-bold text-gray-400 mr-1">Mostrar Columnas:</span>

                        <button
                            type="button"
                            onClick={() => setColTraslados(!colTraslados)}
                            className={`px-2.5 py-1 rounded-lg border font-medium transition ${
                                colTraslados ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-gray-50 border-gray-200 text-gray-400 hover:text-gray-600'
                            }`}
                        >
                            {colTraslados ? '✓' : '+'} Traslados
                        </button>

                        <button
                            type="button"
                            onClick={() => setColVisitas(!colVisitas)}
                            className={`px-2.5 py-1 rounded-lg border font-medium transition ${
                                colVisitas ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-gray-50 border-gray-200 text-gray-400 hover:text-gray-600'
                            }`}
                        >
                            {colVisitas ? '✓' : '+'} Visitas a Clientes
                        </button>

                        <button
                            type="button"
                            onClick={() => setColRecargos(!colRecargos)}
                            className={`px-2.5 py-1 rounded-lg border font-medium transition ${
                                colRecargos ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-gray-50 border-gray-200 text-gray-400 hover:text-gray-600'
                            }`}
                        >
                            {colRecargos ? '✓' : '+'} Recargos Diu/Noc/Dom
                        </button>

                        <button
                            type="button"
                            onClick={() => setColBaseBalance(!colBaseBalance)}
                            className={`px-2.5 py-1 rounded-lg border font-medium transition ${
                                colBaseBalance ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-gray-50 border-gray-200 text-gray-400 hover:text-gray-600'
                            }`}
                        >
                            {colBaseBalance ? '✓' : '+'} Base y Balance
                        </button>

                        <button
                            type="button"
                            onClick={() => setColAlmuerzoBruto(!colAlmuerzoBruto)}
                            className={`px-2.5 py-1 rounded-lg border font-medium transition ${
                                colAlmuerzoBruto ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-gray-50 border-gray-200 text-gray-400 hover:text-gray-600'
                            }`}
                        >
                            {colAlmuerzoBruto ? '✓' : '+'} Bruto y Almuerzo
                        </button>
                    </div>

                    {/* Simulación: Descontar Almuerzo (Diseño Widget Premium con Toggle) */}
                    <button
                        type="button"
                        onClick={() => setDescontarAlmuerzo(!descontarAlmuerzo)}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold transition duration-200 shadow-sm ${
                            descontarAlmuerzo
                                ? 'bg-gradient-to-r from-amber-50 to-orange-50 border-amber-300 text-amber-900 shadow-amber-100/50 hover:border-amber-400'
                                : 'bg-gray-50 border-gray-200 text-gray-400 hover:bg-gray-100 hover:text-gray-600'
                        }`}
                        title="Alternar descuento de tiempo de almuerzo en el cálculo de horas netas"
                    >
                        <Utensils size={14} className={descontarAlmuerzo ? 'text-amber-600' : 'text-gray-400'} />
                        <span>Descontar Almuerzo ({timeConfig.calc_lunchMins || 60}m)</span>
                        <div
                            className={`w-7 h-4 rounded-full transition-colors duration-200 flex items-center p-0.5 ${
                                descontarAlmuerzo ? 'bg-amber-500 justify-end' : 'bg-gray-300 justify-start'
                            }`}
                        >
                            <div className="w-3 h-3 bg-white rounded-full shadow"></div>
                        </div>
                    </button>
                </div>
            </div>

            {/* ── TARJETAS KPI GLOBALES (INFORMACIÓN) ───────────────────────── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* KPI 1: Horas Totales */}
                <div className="bg-white rounded-2xl p-5 shadow-lg border-l-4 border-blue-600 flex flex-col justify-between">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Total Horas Laboradas</p>
                            <h3 className="text-2xl font-black text-gray-800 mt-1">
                                {kpis ? `${kpis.totalLaboradas} h` : '--'}
                            </h3>
                        </div>
                        <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
                            <Clock size={22} />
                        </div>
                    </div>
                    <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
                        <span>Brutas: <b>{kpis?.totalBrutas || 0} h</b></span>
                        <span className="text-blue-600 font-medium">{kpis?.totalEmpleados || 0} colaboradores</span>
                    </div>
                </div>

                {/* KPI 2: Traslados y Ruta */}
                <div className="bg-white rounded-2xl p-5 shadow-lg border-l-4 border-indigo-500 flex flex-col justify-between">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Tiempo en Traslado (Ruta)</p>
                            <h3 className="text-2xl font-black text-indigo-700 mt-1">
                                {kpis ? `${kpis.totalTraslado} h` : '--'}
                            </h3>
                        </div>
                        <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
                            <Truck size={22} />
                        </div>
                    </div>
                    <div className="mt-3 pt-3 border-t border-gray-100">
                        <div className="flex justify-between text-xs text-gray-600 mb-1">
                            <span>Clientes: <b>{kpis?.porcentajeEnClientes || 0}%</b></span>
                            <span>Traslados: <b>{kpis?.porcentajeEnTraslado || 0}%</b></span>
                        </div>
                        <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden flex">
                            <div className="bg-emerald-500 h-full" style={{ width: `${kpis?.porcentajeEnClientes || 0}%` }}></div>
                            <div className="bg-indigo-500 h-full" style={{ width: `${kpis?.porcentajeEnTraslado || 0}%` }}></div>
                        </div>
                    </div>
                </div>

                {/* KPI 3: Total Visitas */}
                <div className="bg-white rounded-2xl p-5 shadow-lg border-l-4 border-emerald-500 flex flex-col justify-between">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Visitas a Clientes</p>
                            <h3 className="text-2xl font-black text-emerald-700 mt-1">
                                {kpis ? `${kpis.totalVisitas} visitas` : '--'}
                            </h3>
                        </div>
                        <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
                            <Building2 size={22} />
                        </div>
                    </div>
                    <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
                        <span>En clientes: <b>{kpis?.totalServicio || 0} h</b></span>
                        <span className="text-emerald-600 font-medium">{kpis?.empleadosEnRuta || 0} en campo</span>
                    </div>
                </div>

                {/* KPI 4: Balance / Extras vs Base */}
                <div className="bg-white rounded-2xl p-5 shadow-lg border-l-4 border-purple-500 flex flex-col justify-between">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Base Horas Periodo</p>
                            <h3 className="text-2xl font-black text-gray-800 mt-1">
                                {kpis ? `${kpis.basePeriodHours} h` : '--'}
                            </h3>
                        </div>
                        <div className="p-2.5 bg-purple-50 text-purple-600 rounded-xl">
                            <TrendingUp size={22} />
                        </div>
                    </div>
                    <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-xs">
                        <span className="text-emerald-600 font-bold">
                            +{kpis?.empleadosConExtras || 0} con extras
                        </span>
                        <span className="text-rose-600 font-bold">
                            -{kpis?.empleadosConDeficit || 0} con déficit
                        </span>
                    </div>
                </div>
            </div>

            {/* ── BARRA DE BÚSQUEDA, SELECCIÓN Y EXPORTACIÓN ───────────────── */}
            <div className="flex flex-wrap items-center justify-between gap-4">
                {/* Buscador */}
                <div className="relative flex-1 min-w-[280px]">
                    <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Buscar por nombre, correo o documento..."
                        value={filtroTexto}
                        onChange={e => setFiltroTexto(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-800 shadow-sm focus:outline-none focus:border-blue-500"
                    />
                    {filtroTexto && (
                        <button
                            onClick={() => setFiltroTexto('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400 hover:text-gray-600"
                        >
                            Limpiar
                        </button>
                    )}
                </div>

                {/* Contador y Botón Exportar */}
                <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-500 font-medium">
                        Mostrando <b>{filteredEmployees.length}</b> colaboradores
                        {selectedEmails.size > 0 && ` (${selectedEmails.size} seleccionados)`}
                    </span>

                    <button
                        onClick={handleExportExcel}
                        disabled={exporting || filteredEmployees.length === 0}
                        className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl shadow-md flex items-center gap-2 transition"
                    >
                        <FileSpreadsheet size={18} />
                        {selectedEmails.size > 0 ? `Exportar Selección (${selectedEmails.size})` : 'Exportar Todo a Excel'}
                    </button>
                </div>
            </div>

            {/* ── BANNER FLOTANTE DE SUBTOTALES DE CHECKS ──────────────────── */}
            {selectedSubtotals && (
                <div className="bg-gradient-to-r from-blue-700 to-indigo-700 text-white p-4 rounded-2xl shadow-xl flex flex-wrap items-center justify-between gap-4 animate-in fade-in duration-200">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-white/10 rounded-xl">
                            <CheckSquare size={22} className="text-white" />
                        </div>
                        <div>
                            <p className="text-xs font-medium text-blue-100 uppercase tracking-wider">Subtotal de Selección Activa</p>
                            <h4 className="text-lg font-bold">
                                {selectedSubtotals.count} Colaboradores Marcados
                            </h4>
                        </div>
                    </div>

                    <div className="flex items-center gap-6 text-sm">
                        <div>
                            <span className="text-blue-200 text-xs block">Horas Netas:</span>
                            <b className="text-base">{selectedSubtotals.totalHoras} h</b>
                        </div>
                        <div>
                            <span className="text-blue-200 text-xs block">Traslados:</span>
                            <b className="text-base">{selectedSubtotals.totalTraslado} h</b>
                        </div>
                        <div>
                            <span className="text-blue-200 text-xs block">Visitas:</span>
                            <b className="text-base">{selectedSubtotals.totalVisitas}</b>
                        </div>
                        <div>
                            <span className="text-blue-200 text-xs block">Balance:</span>
                            <b className={`text-base ${selectedSubtotals.totalBalance >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                                {selectedSubtotals.totalBalance >= 0 ? `+${selectedSubtotals.totalBalance}` : selectedSubtotals.totalBalance} h
                            </b>
                        </div>
                        <button
                            onClick={() => setSelectedEmails(new Set())}
                            className="px-3 py-1 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-bold transition ml-2"
                        >
                            Deseleccionar
                        </button>
                    </div>
                </div>
            )}

            {/* ── TABLA PRINCIPAL CON CHECKS Y ACORDEÓN ─────────────────────── */}
            <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-sm">
                        <thead>
                            <tr className="bg-gray-50/80 border-b border-gray-200 text-gray-600 text-xs uppercase tracking-wider">
                                {/* Check Maestro */}
                                <th className="p-4 w-12 text-center">
                                    <input
                                        type="checkbox"
                                        checked={filteredEmployees.length > 0 && selectedEmails.size === filteredEmployees.length}
                                        onChange={handleToggleSelectAll}
                                        className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                                    />
                                </th>
                                <th className="p-4 font-bold">Colaborador</th>
                                <th className="p-4 font-bold text-center">Días</th>
                                <th className="p-4 font-bold text-right text-blue-700">Horas Netas</th>

                                {colTraslados && (
                                    <th className="p-4 font-bold text-right text-indigo-700">Traslado (Ruta)</th>
                                )}

                                {colVisitas && (
                                    <th className="p-4 font-bold text-right text-emerald-700">En Clientes</th>
                                )}

                                {colRecargos && (
                                    <>
                                        <th className="p-4 font-bold text-right text-gray-500">Diu</th>
                                        <th className="p-4 font-bold text-right text-gray-500">Noc</th>
                                        <th className="p-4 font-bold text-right text-gray-500">Dom Diu</th>
                                        <th className="p-4 font-bold text-right text-gray-500">Dom Noc</th>
                                    </>
                                )}

                                {colAlmuerzoBruto && (
                                    <>
                                        <th className="p-4 font-bold text-right text-gray-500">Bruto</th>
                                        <th className="p-4 font-bold text-right text-gray-500">Almuerzo</th>
                                    </>
                                )}

                                {colBaseBalance && (
                                    <>
                                        <th className="p-4 font-bold text-right text-gray-500">Base Mes</th>
                                        <th className="p-4 font-bold text-right">Balance</th>
                                    </>
                                )}

                                <th className="p-4 font-bold text-center w-24">Detalle</th>
                            </tr>
                        </thead>

                        <tbody className="divide-y divide-gray-100">
                            {loading ? (
                                <tr>
                                    <td colSpan={15} className="p-12 text-center text-gray-400">
                                        <div className="flex flex-col items-center justify-center gap-2">
                                            <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                                            <p className="font-medium text-sm">Calculando informe gerencial...</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : filteredEmployees.length === 0 ? (
                                <tr>
                                    <td colSpan={15} className="p-12 text-center text-gray-400">
                                        <Users size={32} className="mx-auto mb-2 text-gray-300" />
                                        <p className="font-bold text-gray-700">No se encontraron turnos en este periodo</p>
                                        <p className="text-xs text-gray-400 mt-1">Prueba seleccionando otro rango de fechas o ajustando los filtros.</p>
                                    </td>
                                </tr>
                            ) : (
                                filteredEmployees.map((emp) => {
                                    const isSelected = selectedEmails.has(emp.email);
                                    const isExpanded = expandedEmail === emp.email;

                                    return (
                                        <React.Fragment key={emp.email}>
                                            <tr className={`hover:bg-blue-50/40 transition group ${isSelected ? 'bg-blue-50/60' : ''}`}>
                                                {/* Checkbox de fila */}
                                                <td className="p-4 text-center">
                                                    <input
                                                        type="checkbox"
                                                        checked={isSelected}
                                                        onChange={() => handleToggleSelectEmployee(emp.email)}
                                                        className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                                                    />
                                                </td>

                                                {/* Colaborador */}
                                                <td className="p-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-black text-xs flex items-center justify-center shadow-sm">
                                                            {emp.nombre.slice(0, 2).toUpperCase()}
                                                        </div>
                                                        <div>
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="font-bold text-gray-800">{emp.nombre}</span>
                                                                {emp.hasAlerts && (
                                                                    <span title="Inconsistencia o turno sin salida" className="text-amber-500">
                                                                        <AlertTriangle size={14} />
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <p className="text-xs text-gray-400">{emp.email} • Doc: {emp.documento}</p>
                                                        </div>
                                                    </div>
                                                </td>

                                                {/* Días trabajados */}
                                                <td className="p-4 text-center font-semibold text-gray-700">
                                                    {emp.diasTrabajados}
                                                </td>

                                                {/* Horas Netas */}
                                                <td className="p-4 text-right font-black text-gray-900 text-base whitespace-nowrap">
                                                    {emp.horasNetas} h
                                                </td>

                                                {/* Traslado */}
                                                {colTraslados && (
                                                    <td className="p-4 text-right whitespace-nowrap">
                                                        {emp.horasTraslado > 0 ? (
                                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-indigo-50 text-indigo-700 font-bold text-xs whitespace-nowrap">
                                                                <Truck size={12} /> {emp.horasTraslado} h
                                                            </span>
                                                        ) : (
                                                            <span className="text-gray-300">-</span>
                                                        )}
                                                    </td>
                                                )}

                                                {/* Visitas a Clientes */}
                                                {colVisitas && (
                                                    <td className="p-4 text-right whitespace-nowrap">
                                                        {emp.totalVisitas > 0 ? (
                                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-700 font-bold text-xs whitespace-nowrap">
                                                                <Building2 size={12} /> {emp.totalVisitas} ({emp.horasServicio}h)
                                                            </span>
                                                        ) : (
                                                            <span className="text-gray-300">-</span>
                                                        )}
                                                    </td>
                                                )}

                                                {/* Recargos */}
                                                {colRecargos && (
                                                    <>
                                                        <td className="p-4 text-right font-mono text-xs text-gray-600 whitespace-nowrap">{emp.diurnas}</td>
                                                        <td className="p-4 text-right font-mono text-xs text-gray-600 whitespace-nowrap">{emp.nocturnas}</td>
                                                        <td className="p-4 text-right font-mono text-xs text-gray-600 whitespace-nowrap">{emp.domDiurnas}</td>
                                                        <td className="p-4 text-right font-mono text-xs text-gray-600 whitespace-nowrap">{emp.domNocturnas}</td>
                                                    </>
                                                )}

                                                {/* Bruto y Almuerzo */}
                                                {colAlmuerzoBruto && (
                                                    <>
                                                        <td className="p-4 text-right font-mono text-xs text-gray-500 whitespace-nowrap">{emp.horasBrutas}</td>
                                                        <td className="p-4 text-right font-mono text-xs text-amber-600 whitespace-nowrap">{emp.horasAlmuerzo}</td>
                                                    </>
                                                )}

                                                {/* Base y Balance */}
                                                {colBaseBalance && (
                                                    <>
                                                        <td className="p-4 text-right font-mono text-xs text-gray-500 whitespace-nowrap">{emp.baseMes} h</td>
                                                        <td className="p-4 text-right whitespace-nowrap">
                                                            <span className={`inline-flex items-center justify-center px-2.5 py-1 rounded-lg font-bold text-xs whitespace-nowrap ${
                                                                emp.balance > 0
                                                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                                                    : (emp.balance < 0
                                                                        ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                                                        : 'bg-gray-50 text-gray-600')
                                                            }`}>
                                                                {emp.balance > 0 ? `+${emp.balance}` : emp.balance}&nbsp;h
                                                            </span>
                                                        </td>
                                                    </>
                                                )}

                                                {/* Botón Acordeón */}
                                                <td className="p-4 text-center">
                                                    <button
                                                        onClick={() => setExpandedEmail(isExpanded ? null : emp.email)}
                                                        className={`p-1.5 rounded-lg border transition ${
                                                            isExpanded ? 'bg-blue-600 text-white border-blue-600' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
                                                        }`}
                                                        title="Ver detalle de días y traslados"
                                                    >
                                                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                                    </button>
                                                </td>
                                            </tr>

                                            {/* FILA EXPANDIBLE: Acordeón con Detalle Diario */}
                                            {isExpanded && (
                                                <tr className="bg-slate-50 border-b border-gray-200">
                                                    <td colSpan={15} className="p-6">
                                                        <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm space-y-4">
                                                            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                                                                <h4 className="font-bold text-gray-800 text-sm flex items-center gap-2">
                                                                    <Calendar size={16} className="text-blue-600" />
                                                                    Detalle de Jornada y Rutas: <span className="text-blue-600">{emp.nombre}</span>
                                                                </h4>
                                                                <span className="text-xs text-gray-500">
                                                                    {emp.diasDetalle.length} días registrados en el periodo
                                                                </span>
                                                            </div>

                                                            {/* Tabla interna de días */}
                                                            <div className="overflow-x-auto">
                                                                <table className="w-full text-xs text-left">
                                                                    <thead>
                                                                        <tr className="bg-gray-50 text-gray-500 border-b border-gray-100">
                                                                            <th className="p-2.5 font-semibold">Fecha</th>
                                                                            <th className="p-2.5 font-semibold">Entrada</th>
                                                                            <th className="p-2.5 font-semibold">Salida</th>
                                                                            <th className="p-2.5 font-semibold text-right">Horas Netas</th>
                                                                            <th className="p-2.5 font-semibold text-right">Traslado</th>
                                                                            <th className="p-2.5 font-semibold text-right">En Clientes</th>
                                                                            <th className="p-2.5 font-semibold">Visitas Realizadas</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody className="divide-y divide-gray-100">
                                                                        {emp.diasDetalle.map(dia => (
                                                                            <tr key={dia.fecha} className="hover:bg-gray-50/60">
                                                                                <td className="p-2.5 font-bold text-gray-700">
                                                                                    {dia.fecha} <span className="text-gray-400 font-normal">({dia.diaNombre})</span>
                                                                                </td>
                                                                                <td className="p-2.5 text-gray-600">
                                                                                    {dia.horaEntrada}
                                                                                </td>
                                                                                <td className="p-2.5">
                                                                                    <span className={dia.horaSalida === 'Sin Salida' ? 'text-rose-600 font-bold' : 'text-gray-600'}>
                                                                                        {dia.horaSalida}
                                                                                    </span>
                                                                                </td>
                                                                                <td className="p-2.5 text-right font-bold text-gray-800">
                                                                                    {dia.horasNetas} h
                                                                                </td>
                                                                                <td className="p-2.5 text-right text-indigo-600 font-medium">
                                                                                    {dia.horasTraslado > 0 ? `${dia.horasTraslado} h` : '-'}
                                                                                </td>
                                                                                <td className="p-2.5 text-right text-emerald-600 font-medium">
                                                                                    {dia.horasServicio > 0 ? `${dia.horasServicio} h` : '-'}
                                                                                </td>
                                                                                <td className="p-2.5">
                                                                                    {dia.visitasLista && dia.visitasLista.length > 0 ? (
                                                                                        <div className="flex flex-wrap gap-1">
                                                                                            {dia.visitasLista.map((cli, idx) => (
                                                                                                <span key={idx} className="px-2 py-0.5 bg-emerald-50 text-emerald-800 rounded-md text-[11px] font-medium">
                                                                                                    {cli}
                                                                                                </span>
                                                                                            ))}
                                                                                        </div>
                                                                                    ) : (
                                                                                        <span className="text-gray-400">Sin visitas en cliente</span>
                                                                                    )}
                                                                                </td>
                                                                            </tr>
                                                                        ))}
                                                                    </tbody>
                                                                </table>
                                                            </div>

                                                            {/* Observaciones / Comentarios si existen */}
                                                            {emp.comments && emp.comments.length > 0 && (
                                                                <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-3 text-xs text-amber-900">
                                                                    <b className="flex items-center gap-1 mb-1">
                                                                        <MessageSquare size={13} /> Observaciones de Supervisión:
                                                                    </b>
                                                                    <ul className="list-disc list-inside space-y-0.5 text-amber-800">
                                                                        {emp.comments.map((c, i) => (
                                                                            <li key={i}>{c}</li>
                                                                        ))}
                                                                    </ul>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
