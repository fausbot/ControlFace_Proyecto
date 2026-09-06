// src/components/informes/GraficasGerenciales.jsx
import React, { useState, useMemo } from 'react';
import {
    BarChart3, PieChart, TrendingUp, TrendingDown, Clock,
    Truck, Award, Users, Info, ChevronDown, ChevronUp,
    Compass, CheckCircle2, AlertCircle, Sparkles, Filter,
    Sun, Moon, Calendar, Zap, MapPin
} from 'lucide-react';

/**
 * Módulo de Gráficas Gerenciales Interactivas Livianas
 * Diseñado con SVG Nativo + TailwindCSS sin dependencias pesadas.
 */
export default function GraficasGerenciales({
    employeesList = [],
    kpis = null,
    basePeriodHours = 0,
    monthLabel = '',
    startDate = '',
    endDate = '',
    onOcultar = null
}) {
    // ── Sub-pestaña o filtro de vista activa ──────────────────────────────────────
    const [tabGrafica, setTabGrafica] = useState('ranking'); // 'ranking' | 'dona' | 'composicion' | 'rutas'

    // ── Controles para el Gráfico de Ranking ────────────────────────────────────
    const [ordenRanking, setOrdenRanking] = useState('desc'); // 'desc' (más horas) | 'asc' (menos horas)
    const [filtroCantidad, setFiltroCantidad] = useState('top10'); // 'top5' | 'top10' | 'todos'
    const [hoveredEmp, setHoveredEmp] = useState(null);

    // ── Controles para la Dona de Recargos ──────────────────────────────────────
    const [hoveredSlice, setHoveredSlice] = useState(null);

    // ── Controles para el Gráfico de Rutas (Barras Dobles) ──────────────────────
    const [ordenRutas, setOrdenRutas] = useState('visitas'); // 'visitas' | 'traslados' | 'eficiencia'

    // ── 1. Procesar Lista para el Ranking ───────────────────────────────────────
    const rankingData = useMemo(() => {
        if (!employeesList.length) return { list: [], maxHoras: 100 };

        let sorted = [...employeesList].sort((a, b) => {
            return ordenRanking === 'desc'
                ? b.horasNetas - a.horasNetas
                : a.horasNetas - b.horasNetas;
        });

        if (filtroCantidad === 'top5') sorted = sorted.slice(0, 5);
        else if (filtroCantidad === 'top10') sorted = sorted.slice(0, 10);

        const maxVal = Math.max(
            basePeriodHours * 1.15,
            ...employeesList.map(e => e.horasNetas || 0),
            10
        );

        return { list: sorted, maxHoras: maxVal };
    }, [employeesList, ordenRanking, filtroCantidad, basePeriodHours]);

    // ── 2. Procesar Datos para la Dona de Recargos ──────────────────────────────
    const recargosData = useMemo(() => {
        const diurnas = kpis?.totalDiurnas || 0;
        const nocturnas = kpis?.totalNocturnas || 0;
        const domDiurnas = kpis?.totalDomDiurnas || 0;
        const domNocturnas = kpis?.totalDomNocturnas || 0;
        const total = diurnas + nocturnas + domDiurnas + domNocturnas;

        if (total === 0) return { items: [], total: 0, activeCount: 0 };

        const items = [
            {
                id: 'diurna',
                label: 'Diurna Ordinaria',
                sublabel: 'Jornada diurna legal',
                recargoText: 'Tarifa base (100%)',
                horas: diurnas,
                color: '#2563EB', // Azul Rey Vibrante (blue-600)
                icon: Sun,
                porcentaje: parseFloat(((diurnas / total) * 100).toFixed(1))
            },
            {
                id: 'nocturna',
                label: 'Nocturna (35%)',
                sublabel: 'Recargo noche ordinario',
                recargoText: '+35% sobre hora ordinaria',
                horas: nocturnas,
                color: '#C026D3', // Fucsia / Magenta Neón Eléctrico (fuchsia-600)
                icon: Moon,
                porcentaje: parseFloat(((nocturnas / total) * 100).toFixed(1))
            },
            {
                id: 'domDiurna',
                label: 'Dominical/Fest. Diurna (75%)',
                sublabel: 'Domingo o festivo diurno',
                recargoText: '+75% recargo legal',
                horas: domDiurnas,
                color: '#EA580C', // Naranja Fuego Solar (orange-600)
                icon: Calendar,
                porcentaje: parseFloat(((domDiurnas / total) * 100).toFixed(1))
            },
            {
                id: 'domNocturna',
                label: 'Dominical/Fest. Nocturna (110%)',
                sublabel: 'Domingo o festivo nocturno',
                recargoText: '+110% recargo nocturno festivo',
                horas: domNocturnas,
                color: '#DC2626', // Rojo Carmesí Intenso (red-600)
                icon: Zap,
                porcentaje: parseFloat(((domNocturnas / total) * 100).toFixed(1))
            }
        ];

        const activeCount = items.filter(i => i.horas > 0).length;

        return { items, total: parseFloat(total.toFixed(2)), activeCount };
    }, [kpis]);

    // ── 3. Procesar Datos para Gráfica de Rutas (Barras Dobles) ───────────────
    const rutasData = useMemo(() => {
        // Filtrar colaboradores con actividad en campo
        const enRuta = employeesList.filter(e => (e.horasTraslado > 0 || e.totalVisitas > 0));

        const mapped = enRuta.map(e => {
            const visitas = e.totalVisitas || 0;
            const traslados = e.horasTraslado || 0;
            const servicio = e.horasServicio || 0;

            // Tiempo promedio de viaje por cliente visitado (en horas o minutos según corresponda)
            let textoViajePromedio = '0 h de viaje por cliente visitado';
            let horasViajePorVisita = 0;
            if (visitas > 0) {
                horasViajePorVisita = traslados / visitas;
                if (horasViajePorVisita >= 1) {
                    textoViajePromedio = `${horasViajePorVisita.toFixed(1)} h de viaje por cliente visitado`;
                } else {
                    const mins = Math.round(horasViajePorVisita * 60);
                    textoViajePromedio = `${mins} min de viaje por cliente visitado`;
                }
            } else if (traslados > 0) {
                textoViajePromedio = `${traslados} h de viaje (sin visitas)`;
            }

            // Tiempo promedio de atención en cliente por visita
            const minsPromedioVisita = visitas > 0 
                ? Math.round((servicio * 60) / visitas)
                : 0;

            const textoAtencionPromedio = `${minsPromedioVisita} min en cliente por visita (${servicio} h servicio)`;

            return {
                ...e,
                visitas,
                traslados,
                servicio,
                horasViajePorVisita,
                minsPromedioVisita,
                textoViajePromedio,
                textoAtencionPromedio
            };
        });

        // Ordenamiento dinámico según pestaña/control activo
        const sorted = [...mapped].sort((a, b) => {
            if (ordenRutas === 'visitas') return b.visitas - a.visitas;
            if (ordenRutas === 'traslados') return b.traslados - a.traslados;
            // Para 'eficiencia': quienes invierten menor tiempo de viaje por cliente atendido
            if (a.visitas === 0) return 1;
            if (b.visitas === 0) return -1;
            return a.horasViajePorVisita - b.horasViajePorVisita;
        });

        // Escalas máximas relativas para que las barras aprovechen todo el ancho
        const maxVisitas = Math.max(...mapped.map(e => e.visitas), 10);
        const maxTraslados = Math.max(...mapped.map(e => e.traslados), 5);

        // Identificar líderes para las tarjetas resumen inferiores
        const liderVisitas = [...mapped].sort((a, b) => b.visitas - a.visitas)[0] || null;
        const liderTraslados = [...mapped].sort((a, b) => b.traslados - a.traslados)[0] || null;
        const liderEficiencia = [...mapped].filter(e => e.visitas > 0).sort((a, b) => a.horasViajePorVisita - b.horasViajePorVisita)[0] || null;

        return {
            list: sorted,
            totalEnRuta: mapped.length,
            maxVisitas,
            maxTraslados,
            liderVisitas,
            liderTraslados,
            liderEficiencia
        };
    }, [employeesList, ordenRutas]);

    const rutasEficienciaData = rutasData.list;

    // Si no hay colaboradores cargados
    if (!employeesList.length) {
        return (
            <div className="bg-white rounded-2xl p-8 shadow-md border border-gray-100 text-center">
                <BarChart3 className="mx-auto text-gray-300 mb-3" size={40} />
                <p className="text-gray-500 text-sm font-medium">
                    No hay datos suficientes en el periodo seleccionado para generar las gráficas.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* ── BARRA SUPERIOR: NAVEGADOR DE GRÁFICAS ─────────────────────────── */}
            <div className="bg-white rounded-2xl p-4 shadow-md border border-gray-100 flex flex-wrap items-center justify-between gap-3">
                {/* Selector de pestañas gráficas */}
                <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                        type="button"
                        onClick={() => setTabGrafica('ranking')}
                        className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition duration-200 ${
                            tabGrafica === 'ranking'
                                ? 'bg-blue-600 text-white shadow-md shadow-blue-200'
                                : 'bg-gray-50 text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                        }`}
                    >
                        <BarChart3 size={16} />
                        Ranking de Horas vs Base
                    </button>

                    <button
                        type="button"
                        onClick={() => setTabGrafica('composicion')}
                        className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition duration-200 ${
                            tabGrafica === 'composicion'
                                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
                                : 'bg-gray-50 text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                        }`}
                    >
                        <Clock size={16} />
                        Composición de Jornada
                    </button>

                    <button
                        type="button"
                        onClick={() => setTabGrafica('dona')}
                        className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition duration-200 ${
                            tabGrafica === 'dona'
                                ? 'bg-purple-600 text-white shadow-md shadow-purple-200'
                                : 'bg-gray-50 text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                        }`}
                    >
                        <PieChart size={16} />
                        Dona de Recargos
                    </button>

                    <button
                        type="button"
                        onClick={() => setTabGrafica('rutas')}
                        className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition duration-200 ${
                            tabGrafica === 'rutas'
                                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-200'
                                : 'bg-gray-50 text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                        }`}
                    >
                        <Truck size={16} />
                        Eficiencia de Rutas
                        {rutasEficienciaData.length > 0 && (
                            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                                tabGrafica === 'rutas' ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-700'
                            }`}>
                                {rutasEficienciaData.length}
                            </span>
                        )}
                    </button>
                </div>

                {/* Acciones y navegación rápida */}
                <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-xl text-xs text-gray-600 font-medium">
                        <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
                        Periodo: <b className="text-gray-800">{monthLabel || 'Activo'}</b>
                    </span>
                    <span className="flex items-center gap-1 bg-purple-50 text-purple-700 border border-purple-200 px-3 py-1.5 rounded-xl text-xs font-bold">
                        Línea Base: {basePeriodHours} h
                    </span>

                    <button
                        type="button"
                        onClick={() => document.getElementById('tablero-controles-top')?.scrollIntoView({ behavior: 'smooth' })}
                        className="text-xs text-blue-600 hover:text-blue-800 font-bold px-3 py-1.5 rounded-xl border border-blue-200 bg-blue-50/70 hover:bg-blue-100 transition flex items-center gap-1 ml-1"
                        title="Volver a la parte superior de la tabla"
                    >
                        ↑ Ir a la Tabla
                    </button>

                    {onOcultar && (
                        <button
                            type="button"
                            onClick={onOcultar}
                            className="text-xs text-gray-400 hover:text-gray-700 font-bold px-2.5 py-1.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 transition"
                            title="Ocultar sección de gráficas"
                        >
                            Ocultar
                        </button>
                    )}
                </div>
            </div>

            {/* ══════════════════════════════════════════════════════════════════════ */}
            {/* 1. GRÁFICA: RANKING DE HORAS VS LÍNEA BASE DEL PERIODO                 */}
            {/* ══════════════════════════════════════════════════════════════════════ */}
            {tabGrafica === 'ranking' && (
                <div className="bg-white rounded-2xl p-5 shadow-lg border border-gray-100 space-y-5 animate-in fade-in duration-200">
                    {/* Encabezado y Controles */}
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-4">
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="text-lg font-black text-gray-800">
                                    Ranking de Horas Laboradas por Colaborador
                                </h3>
                                <span className="bg-blue-100 text-blue-800 text-[11px] font-extrabold px-2.5 py-0.5 rounded-full">
                                    {rankingData.list.length} en pantalla
                                </span>
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5">
                                Compara las horas reales ejecutadas frente a la meta legal del periodo establecida en <b className="text-purple-700">{basePeriodHours} h</b>.
                            </p>
                        </div>

                        {/* Controles de orden y cantidad */}
                        <div className="flex items-center gap-2 flex-wrap text-xs">
                            {/* Orden */}
                            <div className="flex items-center bg-gray-100 p-1 rounded-xl font-bold">
                                <button
                                    type="button"
                                    onClick={() => setOrdenRanking('desc')}
                                    className={`px-3 py-1 rounded-lg transition flex items-center gap-1 ${
                                        ordenRanking === 'desc'
                                            ? 'bg-blue-600 text-white shadow-sm'
                                            : 'text-gray-600 hover:text-gray-900'
                                    }`}
                                >
                                    <TrendingUp size={13} />
                                    Más horas (Top)
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setOrdenRanking('asc')}
                                    className={`px-3 py-1 rounded-lg transition flex items-center gap-1 ${
                                        ordenRanking === 'asc'
                                            ? 'bg-blue-600 text-white shadow-sm'
                                            : 'text-gray-600 hover:text-gray-900'
                                    }`}
                                >
                                    <TrendingDown size={13} />
                                    Menos horas (Déficit)
                                </button>
                            </div>

                            {/* Filtro Cantidad */}
                            <div className="flex items-center bg-gray-100 p-1 rounded-xl font-bold">
                                <button
                                    type="button"
                                    onClick={() => setFiltroCantidad('top5')}
                                    className={`px-2.5 py-1 rounded-lg transition ${
                                        filtroCantidad === 'top5' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                                    }`}
                                >
                                    Top 5
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setFiltroCantidad('top10')}
                                    className={`px-2.5 py-1 rounded-lg transition ${
                                        filtroCantidad === 'top10' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                                    }`}
                                >
                                    Top 10
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setFiltroCantidad('todos')}
                                    className={`px-2.5 py-1 rounded-lg transition ${
                                        filtroCantidad === 'todos' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                                    }`}
                                >
                                    Todos ({employeesList.length})
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Leyenda de la gráfica */}
                    <div className="flex flex-wrap items-center justify-between gap-3 text-xs bg-gray-50 p-3 rounded-xl border border-gray-200/70">
                        <div className="flex items-center gap-4 flex-wrap">
                            <span className="flex items-center gap-1.5 font-medium text-gray-700">
                                <span className="w-3 h-3 rounded-md bg-emerald-500"></span>
                                Superó Meta (+Horas Extras)
                            </span>
                            <span className="flex items-center gap-1.5 font-medium text-gray-700">
                                <span className="w-3 h-3 rounded-md bg-rose-500"></span>
                                Por debajo (-Déficit de Horas)
                            </span>
                            <span className="flex items-center gap-1.5 font-medium text-gray-700">
                                <span className="w-3 h-3 rounded-md bg-purple-700 flex items-center justify-center">
                                    <span className="w-0.5 h-2 bg-white"></span>
                                </span>
                                Marca de Meta del Periodo ({basePeriodHours}h)
                            </span>
                        </div>
                        <span className="text-gray-400 italic text-[11px]">
                            Pasa el cursor sobre una barra para ver detalles
                        </span>
                    </div>

                    {/* Contenedor Gráfico con Eje Superior y Marcador Integrado */}
                    <div className="relative pt-2 pb-2 space-y-2">
                        {/* ── Regleta / Eje de Escala Superior ──────────────────────────────── */}
                        {(() => {
                            const basePercent = Math.min(100, Math.max(5, (basePeriodHours / rankingData.maxHoras) * 100));
                            return (
                                <div className="flex items-center gap-3 px-1.5 pt-2 pb-1 text-[10px] font-bold text-gray-400 border-b border-gray-100">
                                    {/* Columna Izquierda: Encabezado */}
                                    <div className="w-[180px] shrink-0 text-gray-500 uppercase tracking-wider text-[9px]">
                                        Colaborador
                                    </div>

                                    {/* Columna Central: Regleta de Escala */}
                                    <div className="flex-1 relative h-6 flex items-end">
                                        {/* Origen 0h */}
                                        <span className="absolute left-0 bottom-0 text-gray-400 font-bold">0h</span>

                                        {/* Indicador de Meta Superior */}
                                        <div
                                            className="absolute top-0 flex flex-col items-center pointer-events-none transform -translate-x-1/2"
                                            style={{ left: `${basePercent}%` }}
                                        >
                                            <span className="bg-purple-700 text-white text-[9px] font-black px-2 py-0.5 rounded-md shadow-xs flex items-center gap-0.5 whitespace-nowrap">
                                                Meta: {basePeriodHours}h
                                            </span>
                                            <span className="w-1.5 h-1.5 bg-purple-700 rotate-45 -mt-0.5"></span>
                                        </div>

                                        {/* Máximo del Periodo */}
                                        <span className="absolute right-0 bottom-0 text-gray-400 font-bold">
                                            Max: {Math.round(rankingData.maxHoras)}h
                                        </span>
                                    </div>

                                    {/* Columna Derecha: Encabezado */}
                                    <div className="w-[90px] shrink-0 text-right text-gray-500 uppercase tracking-wider text-[9px]">
                                        Balance
                                    </div>
                                </div>
                            );
                        })()}

                        {/* ── Lista de Barras por Empleado ─────────────────────────────────── */}
                        <div className="space-y-2.5">
                            {rankingData.list.map((emp, index) => {
                                const netas = emp.horasNetas || 0;
                                const isSupero = netas >= basePeriodHours;
                                const balance = emp.balance || 0;
                                const barPercent = Math.min(100, Math.max(3, (netas / rankingData.maxHoras) * 100));
                                const basePercent = Math.min(100, Math.max(5, (basePeriodHours / rankingData.maxHoras) * 100));

                                return (
                                    <div
                                        key={emp.email}
                                        onMouseEnter={() => setHoveredEmp(emp)}
                                        onMouseLeave={() => setHoveredEmp(null)}
                                        className="group relative flex items-center gap-3 p-1.5 rounded-xl hover:bg-gray-50/80 transition duration-150"
                                    >
                                        {/* Columna Izquierda: Información del Empleado */}
                                        <div className="w-[180px] shrink-0 flex items-center gap-2 overflow-hidden">
                                            <span className="w-5 text-center text-[11px] font-black text-gray-400 group-hover:text-blue-600">
                                                #{index + 1}
                                            </span>
                                            <div className="truncate">
                                                <p className="text-xs font-bold text-gray-800 truncate group-hover:text-blue-700" title={emp.nombre}>
                                                    {emp.nombre}
                                                </p>
                                                <p className="text-[10px] text-gray-400 truncate">
                                                    {emp.cargo || emp.departamento || 'Operativo'}
                                                </p>
                                            </div>
                                        </div>

                                        {/* Columna Centro: Barra de Horas con Marcador de Meta integrado */}
                                        <div className="flex-1 relative h-7 bg-gray-100/90 rounded-lg overflow-hidden flex items-center">
                                            {/* Barra Rellena */}
                                            <div
                                                className={`h-full rounded-lg transition-all duration-500 flex items-center justify-end pr-2.5 text-[10px] font-black text-white shadow-xs ${
                                                    isSupero
                                                        ? 'bg-gradient-to-r from-emerald-500 to-teal-500'
                                                        : 'bg-gradient-to-r from-rose-500 to-amber-500'
                                                }`}
                                                style={{ width: `${barPercent}%` }}
                                            >
                                                {barPercent > 18 && `${netas}h`}
                                            </div>

                                            {/* Si la barra es muy corta, texto afuera */}
                                            {barPercent <= 18 && (
                                                <span className="ml-2 text-[11px] font-black text-gray-700">
                                                    {netas}h
                                                </span>
                                            )}

                                            {/* MARCADOR DE META INTEGRADO DENTRO DEL PROPIO TRACK */}
                                            <div
                                                className="absolute top-0 bottom-0 w-0.5 bg-purple-700 z-10 pointer-events-none shadow-sm flex flex-col justify-between items-center"
                                                style={{ left: `${basePercent}%` }}
                                                title={`Meta: ${basePeriodHours}h`}
                                            >
                                                <div className="w-1.5 h-1 bg-purple-700 rounded-full"></div>
                                                <div className="w-1.5 h-1 bg-purple-700 rounded-full"></div>
                                            </div>
                                        </div>

                                        {/* Columna Derecha: Balance y Badge (+/-) */}
                                        <div className="w-[90px] shrink-0 text-right">
                                            <span
                                                className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-[11px] font-black ${
                                                    balance >= 0
                                                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                                        : 'bg-rose-50 text-rose-700 border border-rose-200'
                                                }`}
                                            >
                                                {balance >= 0 ? `+${balance}h` : `${balance}h`}
                                            </span>
                                        </div>

                                        {/* Tooltip Flotante en Hover */}
                                        {hoveredEmp?.email === emp.email && (
                                            <div className="absolute left-[190px] -top-10 z-30 bg-gray-900 text-white text-xs rounded-xl py-2 px-3 shadow-2xl pointer-events-none flex items-center gap-4 animate-in fade-in duration-150">
                                                <div>
                                                    <span className="text-gray-400 block text-[10px]">Horas Netas:</span>
                                                    <b className="text-white text-sm">{netas} h</b>
                                                </div>
                                                <div className="border-l border-gray-700 pl-3">
                                                    <span className="text-gray-400 block text-[10px]">Días Trab.:</span>
                                                    <b>{emp.diasTrabajados} días</b>
                                                </div>
                                                <div className="border-l border-gray-700 pl-3">
                                                    <span className="text-gray-400 block text-[10px]">Brutas:</span>
                                                    <b>{emp.horasBrutas} h</b>
                                                </div>
                                                {emp.horasTraslado > 0 && (
                                                    <div className="border-l border-gray-700 pl-3">
                                                        <span className="text-gray-400 block text-[10px]">En Ruta:</span>
                                                        <b className="text-indigo-400">{emp.horasTraslado} h</b>
                                                    </div>
                                                )}
                                                <div className="border-l border-gray-700 pl-3">
                                                    <span className="text-gray-400 block text-[10px]">Balance:</span>
                                                    <b className={balance >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                                                        {balance >= 0 ? `+${balance} h (Extras)` : `${balance} h (Déficit)`}
                                                    </b>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Resumen inferior del Ranking */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 border-t border-gray-100 text-xs">
                        <div className="p-3 bg-emerald-50/70 border border-emerald-200/70 rounded-xl flex items-center justify-between">
                            <div>
                                <p className="text-emerald-800 font-bold">Con Horas Extras</p>
                                <p className="text-emerald-600 text-[11px]">Superaron la base ({basePeriodHours}h)</p>
                            </div>
                            <span className="text-lg font-black text-emerald-700">
                                {employeesList.filter(e => e.balance > 0).length}
                            </span>
                        </div>

                        <div className="p-3 bg-rose-50/70 border border-rose-200/70 rounded-xl flex items-center justify-between">
                            <div>
                                <p className="text-rose-800 font-bold">Con Déficit de Horas</p>
                                <p className="text-rose-600 text-[11px]">Faltaron horas para la base</p>
                            </div>
                            <span className="text-lg font-black text-rose-700">
                                {employeesList.filter(e => e.balance < 0).length}
                            </span>
                        </div>

                        <div className="p-3 bg-blue-50/70 border border-blue-200/70 rounded-xl flex items-center justify-between">
                            <div>
                                <p className="text-blue-800 font-bold">Cumplieron Exacto</p>
                                <p className="text-blue-600 text-[11px]">Balance neutro (0.0h)</p>
                            </div>
                            <span className="text-lg font-black text-blue-700">
                                {employeesList.filter(e => e.balance === 0).length}
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════════════════ */}
            {/* 2. GRÁFICA: COMPOSICIÓN DE LA JORNADA (BARRAS APILADAS 100%)           */}
            {/* ══════════════════════════════════════════════════════════════════════ */}
            {tabGrafica === 'composicion' && (
                <div className="bg-white rounded-2xl p-5 shadow-lg border border-gray-100 space-y-5 animate-in fade-in duration-200">
                    <div>
                        <h3 className="text-lg font-black text-gray-800">
                            Composición de la Jornada Laboral por Colaborador
                        </h3>
                        <p className="text-xs text-gray-500 mt-0.5">
                            Permite ver en qué invierte el tiempo cada persona: <b>Atención en Clientes</b>, <b>Desplazamientos en Ruta</b> y <b>Pausas de Almuerzo</b>.
                        </p>
                    </div>

                    {/* Leyenda Superior */}
                    <div className="flex flex-wrap items-center gap-4 text-xs bg-gray-50 p-3 rounded-xl border border-gray-200">
                        <span className="flex items-center gap-1.5 font-bold text-gray-700">
                            <span className="w-3 h-3 rounded-md bg-emerald-500"></span>
                            Atención en Clientes (Servicio)
                        </span>
                        <span className="flex items-center gap-1.5 font-bold text-gray-700">
                            <span className="w-3 h-3 rounded-md bg-indigo-500"></span>
                            Traslados en Ruta (Carretera)
                        </span>
                        <span className="flex items-center gap-1.5 font-bold text-gray-700">
                            <span className="w-3 h-3 rounded-md bg-amber-500"></span>
                            Almuerzo / Descanso
                        </span>
                    </div>

                    {/* Barras Apiladas por Colaborador */}
                    <div className="space-y-3">
                        {employeesList.slice(0, 15).map(emp => {
                            const servicio = emp.horasServicio || 0;
                            const traslado = emp.horasTraslado || 0;
                            const almuerzo = emp.horasAlmuerzo || 0;
                            const total = servicio + traslado + almuerzo;

                            if (total === 0) return null;

                            const pServicio = Math.round((servicio / total) * 100);
                            const pTraslado = Math.round((traslado / total) * 100);
                            const pAlmuerzo = Math.max(0, 100 - pServicio - pTraslado);

                            return (
                                <div key={emp.email} className="space-y-1">
                                    <div className="flex justify-between text-xs font-bold text-gray-700">
                                        <span className="truncate max-w-[240px]" title={emp.nombre}>{emp.nombre}</span>
                                        <div className="flex items-center gap-3 text-[11px] font-medium text-gray-500">
                                            <span className="text-emerald-600 font-bold">{servicio}h ({pServicio}%)</span>
                                            <span className="text-indigo-600 font-bold">{traslado}h ({pTraslado}%)</span>
                                            <span className="text-amber-600 font-bold">{almuerzo}h ({pAlmuerzo}%)</span>
                                        </div>
                                    </div>

                                    {/* Barra apilada segmentada */}
                                    <div className="h-4 bg-gray-100 rounded-full overflow-hidden flex shadow-inner">
                                        {pServicio > 0 && (
                                            <div
                                                className="bg-emerald-500 h-full transition-all duration-300 hover:opacity-90"
                                                style={{ width: `${pServicio}%` }}
                                                title={`Servicio: ${servicio}h (${pServicio}%)`}
                                            ></div>
                                        )}
                                        {pTraslado > 0 && (
                                            <div
                                                className="bg-indigo-500 h-full transition-all duration-300 hover:opacity-90"
                                                style={{ width: `${pTraslado}%` }}
                                                title={`Traslado: ${traslado}h (${pTraslado}%)`}
                                            ></div>
                                        )}
                                        {pAlmuerzo > 0 && (
                                            <div
                                                className="bg-amber-400 h-full transition-all duration-300 hover:opacity-90"
                                                style={{ width: `${pAlmuerzo}%` }}
                                                title={`Almuerzo: ${almuerzo}h (${pAlmuerzo}%)`}
                                            ></div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════════════════ */}
            {/* 3. GRÁFICA: DONA DE RECARGOS DE NÓMINA (SVG INTERACTIVO NATIVO)        */}
            {/* ══════════════════════════════════════════════════════════════════════ */}
            {tabGrafica === 'dona' && (
                <div className="bg-white rounded-2xl p-5 shadow-lg border border-gray-100 space-y-6 animate-in fade-in duration-200">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-4">
                        <div>
                            <h3 className="text-lg font-black text-gray-800">
                                Distribución de Recargos de Nómina
                            </h3>
                            <p className="text-xs text-gray-500 mt-0.5">
                                Proporción del total de horas laboradas según la legislación laboral colombiana.
                            </p>
                        </div>
                        <div className="text-right">
                            <span className="text-xs text-gray-400 font-medium block">Total Horas Consolidadas:</span>
                            <span className="text-xl font-black text-gray-800">{recargosData.total} h</span>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                        {/* Dona SVG Interactiva */}
                        <div className="relative flex justify-center items-center py-4">
                            {(() => {
                                const size = 200;
                                const strokeWidth = 28;
                                const radius = (size - strokeWidth) / 2;
                                const circumference = 2 * Math.PI * radius;

                                let accumulatedPercent = 0;

                                return (
                                    <div className="relative w-[200px] h-[200px]">
                                        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="transform -rotate-90">
                                            {/* Fondo de la dona */}
                                            <circle
                                                cx={size / 2}
                                                cy={size / 2}
                                                r={radius}
                                                stroke="#F3F4F6"
                                                strokeWidth={strokeWidth}
                                                fill="transparent"
                                            />
                                            {/* Segmentos de recargos con separación nítida */}
                                            {recargosData.items.map(item => {
                                                if (item.horas === 0) return null;
                                                const gap = recargosData.activeCount > 1 ? 3.5 : 0;
                                                const arcLength = Math.max(2, ((item.porcentaje / 100) * circumference) - gap);
                                                const strokeDasharray = `${arcLength} ${circumference}`;
                                                const strokeDashoffset = -((accumulatedPercent / 100) * circumference + (gap / 2));
                                                accumulatedPercent += item.porcentaje;

                                                const isHovered = hoveredSlice?.id === item.id;

                                                return (
                                                    <circle
                                                        key={item.id}
                                                        cx={size / 2}
                                                        cy={size / 2}
                                                        r={radius}
                                                        stroke={item.color}
                                                        strokeWidth={isHovered ? strokeWidth + 6 : strokeWidth}
                                                        strokeDasharray={strokeDasharray}
                                                        strokeDashoffset={strokeDashoffset}
                                                        fill="transparent"
                                                        className="transition-all duration-200 cursor-pointer"
                                                        onMouseEnter={() => setHoveredSlice(item)}
                                                        onMouseLeave={() => setHoveredSlice(null)}
                                                    />
                                                );
                                            })}
                                        </svg>

                                        {/* Centro de la Dona */}
                                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center p-2">
                                            {hoveredSlice ? (
                                                <>
                                                    <span
                                                        className="text-[10px] font-black uppercase tracking-wider"
                                                        style={{ color: hoveredSlice.color }}
                                                    >
                                                        {hoveredSlice.label}
                                                    </span>
                                                    <span className="text-2xl font-black text-gray-800">
                                                        {hoveredSlice.horas} h
                                                    </span>
                                                    <span
                                                        className="text-xs font-black px-2 py-0.5 rounded-full border mt-0.5"
                                                        style={{
                                                            color: hoveredSlice.color,
                                                            borderColor: `${hoveredSlice.color}40`,
                                                            backgroundColor: `${hoveredSlice.color}15`
                                                        }}
                                                    >
                                                        {hoveredSlice.porcentaje}% del total
                                                    </span>
                                                </>
                                            ) : (
                                                <>
                                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                                                        Total Nómina
                                                    </span>
                                                    <span className="text-2xl font-black text-gray-800">
                                                        {recargosData.total} h
                                                    </span>
                                                    <span className="text-[10px] text-gray-400 font-medium">
                                                        100% horas
                                                    </span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>

                        {/* Tarjetas de Detalle de Recargos con Alto Contraste */}
                        <div className="space-y-3">
                            {recargosData.items.map(item => {
                                const isHovered = hoveredSlice?.id === item.id;
                                const IconComponent = item.icon;

                                return (
                                    <div
                                        key={item.id}
                                        onMouseEnter={() => setHoveredSlice(item)}
                                        onMouseLeave={() => setHoveredSlice(null)}
                                        className={`p-3.5 rounded-2xl border transition duration-200 cursor-pointer flex items-center justify-between border-l-[6px] shadow-sm ${
                                            isHovered
                                                ? 'bg-gray-50/90 shadow-md scale-[1.01]'
                                                : 'bg-white border-gray-100 hover:bg-gray-50/50'
                                        }`}
                                        style={{ borderLeftColor: item.color }}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div
                                                className="w-9 h-9 rounded-xl flex items-center justify-center shadow-sm text-white shrink-0"
                                                style={{ backgroundColor: item.color }}
                                            >
                                                <IconComponent size={18} />
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <p className="text-xs font-black text-gray-800">{item.label}</p>
                                                    <span
                                                        className="text-[10px] font-black px-2 py-0.5 rounded-full border"
                                                        style={{
                                                            color: item.color,
                                                            borderColor: `${item.color}40`,
                                                            backgroundColor: `${item.color}15`
                                                        }}
                                                    >
                                                        {item.porcentaje}%
                                                    </span>
                                                </div>
                                                <p className="text-[11px] text-gray-400 mt-0.5">{item.recargoText}</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-sm font-black text-gray-800 block">{item.horas} h</span>
                                            <span className="text-[10px] text-gray-400 font-medium">acumuladas</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════════════════ */}
            {/* 4. GRÁFICA: RENDIMIENTO EN RUTA (BARRAS DOBLES: VISITAS VS VIAJE)       */}
            {/* ══════════════════════════════════════════════════════════════════════ */}
            {tabGrafica === 'rutas' && (
                <div className="bg-white rounded-2xl p-5 shadow-lg border border-gray-100 space-y-5 animate-in fade-in duration-200">
                    {/* Encabezado y Controles de Ordenamiento */}
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-4">
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="text-lg font-black text-gray-800">
                                    Rendimiento en Ruta: Visitas vs. Horas de Viaje
                                </h3>
                                <span className="bg-emerald-100 text-emerald-800 text-[11px] font-extrabold px-2.5 py-0.5 rounded-full">
                                    {rutasData.totalEnRuta} colaboradores con visitas
                                </span>
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5">
                                Compara el volumen de <b>visitas atendidas</b> frente a las <b>horas en carretera</b> para identificar rutas ágiles o con exceso de desplazamiento.
                            </p>
                        </div>

                        {/* Botones de Ordenamiento */}
                        <div className="flex items-center bg-gray-100 p-1 rounded-xl text-xs font-bold gap-1 flex-wrap">
                            <button
                                type="button"
                                onClick={() => setOrdenRutas('visitas')}
                                className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 ${
                                    ordenRutas === 'visitas'
                                        ? 'bg-emerald-600 text-white shadow-sm'
                                        : 'text-gray-600 hover:text-gray-900'
                                }`}
                            >
                                <Award size={13} />
                                Más Visitas
                            </button>
                            <button
                                type="button"
                                onClick={() => setOrdenRutas('traslados')}
                                className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 ${
                                    ordenRutas === 'traslados'
                                        ? 'bg-amber-600 text-white shadow-sm'
                                        : 'text-gray-600 hover:text-gray-900'
                                }`}
                            >
                                <Truck size={13} />
                                Más Horas de Viaje
                            </button>
                            <button
                                type="button"
                                onClick={() => setOrdenRutas('eficiencia')}
                                className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 ${
                                    ordenRutas === 'eficiencia'
                                        ? 'bg-indigo-600 text-white shadow-sm'
                                        : 'text-gray-600 hover:text-gray-900'
                                }`}
                            >
                                <Zap size={13} />
                                Viaje Más Corto (Ágiles)
                            </button>
                        </div>
                    </div>

                    {/* Leyenda Visual de Barras Dobles y Explicación */}
                    <div className="bg-gray-50 border border-gray-200/80 p-3.5 rounded-xl space-y-2 text-xs">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-5 flex-wrap">
                                <span className="flex items-center gap-2 font-bold text-gray-800">
                                    <span className="w-3.5 h-3.5 rounded-md bg-gradient-to-r from-emerald-500 to-teal-500 shadow-xs"></span>
                                    Barra Verde: Visitas Realizadas (Clientes Atendidos)
                                </span>
                                <span className="flex items-center gap-2 font-bold text-gray-800">
                                    <span className="w-3.5 h-3.5 rounded-md bg-gradient-to-r from-amber-500 to-orange-500 shadow-xs"></span>
                                    Barra Naranja: Horas de Viaje (Desplazamientos)
                                </span>
                            </div>
                            <span className="text-gray-400 italic text-[11px]">
                                Escala proporcional al líder del periodo
                            </span>
                        </div>
                        <p className="text-[11px] text-gray-500 border-t border-gray-200/60 pt-2 leading-relaxed">
                            💡 <b>Interpretación:</b> Compara de forma directa el tiempo en carretera que requirió cada colaborador para atender a sus clientes y el tiempo dedicado en sitio.
                        </p>
                    </div>

                    {/* Contenedor de Barras Dobles por Colaborador */}
                    {rutasData.list.length === 0 ? (
                        <p className="text-gray-400 text-xs text-center py-8">
                            No hay colaboradores con registros de visitas o traslados en este periodo.
                        </p>
                    ) : (
                        <div className="space-y-3">
                            {rutasData.list.map((emp, idx) => {
                                const pVisitas = Math.min(100, Math.max(6, (emp.visitas / rutasData.maxVisitas) * 100));
                                const pTraslados = Math.min(100, Math.max(6, (emp.traslados / rutasData.maxTraslados) * 100));

                                return (
                                    <div
                                        key={emp.email}
                                        className="p-3.5 bg-white hover:bg-gray-50/70 border border-gray-200/80 rounded-2xl transition duration-150 shadow-sm flex flex-col md:flex-row md:items-center gap-4"
                                    >
                                        {/* Columna 1: Información del Colaborador (Limpia en 2 filas) */}
                                        <div className="w-full md:w-52 shrink-0 space-y-0.5">
                                            <div className="flex items-center gap-2">
                                                <span className="w-6 h-6 rounded-lg bg-gray-100 text-gray-700 text-xs font-black flex items-center justify-center shrink-0">
                                                    #{idx + 1}
                                                </span>
                                                <p className="text-xs font-bold text-gray-800 truncate" title={emp.nombre}>
                                                    {emp.nombre}
                                                </p>
                                            </div>
                                            <p className="text-[10px] text-gray-400 pl-8 truncate">
                                                {emp.cargo || emp.departamento || 'Operativo de Campo'}
                                            </p>
                                        </div>

                                        {/* Columna 2: Las Dos Barras Paralelas (Visitas vs Viaje) */}
                                        <div className="flex-1 space-y-2">
                                            {/* Barra 1: Visitas Realizadas */}
                                            <div className="flex items-center gap-2">
                                                <div className="w-16 shrink-0 flex items-center gap-1 text-[11px] font-bold text-emerald-700">
                                                    <MapPin size={12} className="shrink-0" />
                                                    <span>Visitas:</span>
                                                </div>
                                                <div className="flex-1 h-6 bg-emerald-50/70 border border-emerald-100 rounded-lg overflow-hidden flex items-center px-1">
                                                    <div
                                                        className="h-4 rounded-md bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-500 flex items-center justify-end pr-2 text-[10px] font-black text-white shadow-xs"
                                                        style={{ width: `${pVisitas}%` }}
                                                    >
                                                        {pVisitas > 22 && `${emp.visitas} vis`}
                                                    </div>
                                                    {pVisitas <= 22 && (
                                                        <span className="ml-2 text-[10px] font-black text-emerald-800">
                                                            {emp.visitas} vis
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Barra 2: Horas en Carretera (Traslados) */}
                                            <div className="flex items-center gap-2">
                                                <div className="w-16 shrink-0 flex items-center gap-1 text-[11px] font-bold text-amber-700">
                                                    <Truck size={12} className="shrink-0" />
                                                    <span>Viaje:</span>
                                                </div>
                                                <div className="flex-1 h-6 bg-amber-50/70 border border-amber-100 rounded-lg overflow-hidden flex items-center px-1">
                                                    <div
                                                        className="h-4 rounded-md bg-gradient-to-r from-amber-500 to-orange-500 transition-all duration-500 flex items-center justify-end pr-2 text-[10px] font-black text-white shadow-xs"
                                                        style={{ width: `${pTraslados}%` }}
                                                    >
                                                        {pTraslados > 22 && `${emp.traslados} h`}
                                                    </div>
                                                    {pTraslados <= 22 && (
                                                        <span className="ml-2 text-[10px] font-black text-amber-800">
                                                            {emp.traslados} h
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Columna 3: Tiempos promedio por visita y servicio solicitados */}
                                        <div className="w-full md:w-auto shrink-0 flex flex-col items-start md:items-end justify-center gap-1 border-t md:border-t-0 md:border-l border-gray-100 pt-2 md:pt-0 md:pl-5 text-left md:text-right">
                                            <div className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                                                <span className="text-gray-400 font-medium text-[11px]">prom.:</span>
                                                <span className="text-indigo-700 font-extrabold">{emp.textoViajePromedio}</span>
                                            </div>
                                            <div className="text-[11px] text-gray-500">
                                                {emp.textoAtencionPromedio}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Resumen Inferior: 3 Tarjetas KPI de Líderes de Ruta */}
                    {rutasData.list.length > 0 && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-4 border-t border-gray-100 text-xs">
                            {/* 1. Líder en Visitas */}
                            <div className="p-3.5 bg-emerald-50/80 border border-emerald-200 rounded-xl space-y-1">
                                <div className="flex items-center justify-between">
                                    <span className="font-bold text-emerald-800 flex items-center gap-1">
                                        <Award size={14} className="text-emerald-600" />
                                        Mayor Cobertura
                                    </span>
                                    <span className="text-base font-black text-emerald-700">
                                        {rutasData.liderVisitas?.visitas || 0} visitas
                                    </span>
                                </div>
                                <p className="text-xs font-bold text-gray-800 truncate">
                                    {rutasData.liderVisitas?.nombre || 'N/A'}
                                </p>
                                <p className="text-[11px] text-emerald-700">
                                    {rutasData.liderVisitas?.servicio || 0} h de atención directa en clientes.
                                </p>
                            </div>

                            {/* 2. Mayor Recorrido / Desplazamiento */}
                            <div className="p-3.5 bg-amber-50/80 border border-amber-200 rounded-xl space-y-1">
                                <div className="flex items-center justify-between">
                                    <span className="font-bold text-amber-800 flex items-center gap-1">
                                        <Truck size={14} className="text-amber-600" />
                                        Mayor Desplazamiento
                                    </span>
                                    <span className="text-base font-black text-amber-700">
                                        {rutasData.liderTraslados?.traslados || 0} h
                                    </span>
                                </div>
                                <p className="text-xs font-bold text-gray-800 truncate">
                                    {rutasData.liderTraslados?.nombre || 'N/A'}
                                </p>
                                <p className="text-[11px] text-amber-700">
                                    Completó {rutasData.liderTraslados?.visitas || 0} visitas en sus trayectos.
                                </p>
                            </div>

                            {/* 3. Ruta Más Ágil */}
                            <div className="p-3.5 bg-indigo-50/80 border border-indigo-200 rounded-xl space-y-1">
                                <div className="flex items-center justify-between">
                                    <span className="font-bold text-indigo-800 flex items-center gap-1">
                                        <Zap size={14} className="text-indigo-600" />
                                        Ruta Más Ágil
                                    </span>
                                    <span className="text-sm font-black text-indigo-700">
                                        {rutasData.liderEficiencia?.textoViajePromedio.replace(' de viaje por cliente visitado', '') || '0 h'} / cliente
                                    </span>
                                </div>
                                <p className="text-xs font-bold text-gray-800 truncate">
                                    {rutasData.liderEficiencia?.nombre || 'N/A'}
                                </p>
                                <p className="text-[11px] text-indigo-700">
                                    {rutasData.liderEficiencia?.minsPromedioVisita || 0} min prom. en cliente por visita.
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
