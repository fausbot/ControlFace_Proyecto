// src/utils/gerencialCalculator.js
import { processDetailedDailyReport, parseStringDate } from './timeCalculator';
import { isSundayOrHoliday } from './colombiaHolidays';

/**
 * Parsea fecha string a Date local (YYYY-MM-DD o DD/MM/YYYY)
 */
export const parseSpanishOrISODate = (dateStr) => {
    if (!dateStr) return null;
    if (typeof dateStr !== 'string') return null;
    
    // Si viene en formato ISO YYYY-MM-DD
    if (dateStr.includes('-') && dateStr.split('-')[0].length === 4) {
        const [y, m, d] = dateStr.split('-').map(Number);
        return new Date(y, m - 1, d);
    }
    
    // Si viene en formato DD/MM/YYYY
    if (dateStr.includes('/')) {
        const [d, m, y] = dateStr.split('/').map(Number);
        return new Date(y, m - 1, d);
    }

    return null;
};

/**
 * Empareja registros planos de asistencia en turnos { entry, exit, email }
 */
export const pairAttendanceLogs = (attendanceLogs) => {
    if (!attendanceLogs || !Array.isArray(attendanceLogs)) return [];

    const sorted = [...attendanceLogs].sort((a, b) => {
        const dateA = parseStringDate(a.fecha, a.hora) || (a.timestamp ? a.timestamp.toDate() : new Date(0));
        const dateB = parseStringDate(b.fecha, b.hora) || (b.timestamp ? b.timestamp.toDate() : new Date(0));
        return dateA - dateB;
    });

    const byUser = {};
    sorted.forEach(log => {
        const key = (log.usuario || '').toLowerCase().trim();
        if (!key) return;
        if (!byUser[key]) byUser[key] = [];
        byUser[key].push(log);
    });

    const pairedShifts = [];
    Object.keys(byUser).sort().forEach(email => {
        const chronoRecords = byUser[email];
        let pendingEntry = null;

        chronoRecords.forEach(rec => {
            if (rec.tipo === 'Entrada') {
                if (pendingEntry) {
                    pairedShifts.push({ entry: pendingEntry, exit: null, email });
                }
                pendingEntry = rec;
            } else if (rec.tipo === 'Salida') {
                if (pendingEntry) {
                    pairedShifts.push({ entry: pendingEntry, exit: rec, email });
                    pendingEntry = null;
                } else {
                    pairedShifts.push({ entry: null, exit: rec, email });
                }
            }
        });

        if (pendingEntry) {
            pairedShifts.push({ entry: pendingEntry, exit: null, email });
        }
    });

    return pairedShifts;
};

/**
 * Empareja visitas a clientes en pares { email, fecha, horaLlegada, fechaSalida, horaSalida, usuario }
 */
export const pairVisitLogs = (visitLogs) => {
    if (!visitLogs || !Array.isArray(visitLogs)) return [];

    const sorted = [...visitLogs].sort((a, b) => {
        const dateA = parseStringDate(a.fecha, a.hora) || (a.timestamp && typeof a.timestamp.toDate === 'function' ? a.timestamp.toDate() : new Date(0));
        const dateB = parseStringDate(b.fecha, b.hora) || (b.timestamp && typeof b.timestamp.toDate === 'function' ? b.timestamp.toDate() : new Date(0));
        return dateA - dateB;
    });

    const byUserV = {};
    sorted.forEach(log => {
        const key = (log.usuario || '').toLowerCase().trim();
        if (!key) return;
        if (!byUserV[key]) byUserV[key] = [];
        byUserV[key].push(log);
    });

    const visitasEmparejadas = [];
    Object.keys(byUserV).forEach(email => {
        let pendingEntry = null;
        byUserV[email].forEach(rec => {
            if (rec.tipo === 'Llegada Cliente') {
                if (pendingEntry) {
                    visitasEmparejadas.push({
                        email,
                        fecha: pendingEntry.fecha,
                        horaLlegada: pendingEntry.hora,
                        fechaSalida: null,
                        horaSalida: null,
                        usuario: email,
                        cliente: pendingEntry.cliente || pendingEntry.localidad || 'Cliente',
                        rawEntry: pendingEntry
                    });
                }
                pendingEntry = rec;
            } else if (rec.tipo === 'Salida Cliente') {
                if (pendingEntry) {
                    visitasEmparejadas.push({
                        email,
                        fecha: pendingEntry.fecha,
                        horaLlegada: pendingEntry.hora,
                        fechaSalida: rec.fecha,
                        horaSalida: rec.hora,
                        usuario: email,
                        cliente: pendingEntry.cliente || pendingEntry.localidad || rec.cliente || rec.localidad || 'Cliente',
                        rawEntry: pendingEntry,
                        rawExit: rec
                    });
                    pendingEntry = null;
                } else {
                    visitasEmparejadas.push({
                        email,
                        fecha: rec.fecha,
                        horaLlegada: null,
                        fechaSalida: rec.fecha,
                        horaSalida: rec.hora,
                        usuario: email,
                        cliente: rec.cliente || rec.localidad || 'Cliente',
                        rawExit: rec
                    });
                }
            }
        });

        if (pendingEntry) {
            visitasEmparejadas.push({
                email,
                fecha: pendingEntry.fecha,
                horaLlegada: pendingEntry.hora,
                fechaSalida: null,
                horaSalida: null,
                usuario: email,
                cliente: pendingEntry.cliente || pendingEntry.localidad || 'Cliente',
                rawEntry: pendingEntry
            });
        }
    });

    return visitasEmparejadas;
};

/**
 * Calcula la base de horas del periodo según días laborales y festivos de Colombia
 */
export const calculateBasePeriodHours = (startDate, endDate, timeConfig = {}) => {
    if (!startDate || !endDate) return 0;
    
    let totalBase = 0;
    let current = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    const last = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());

    while (current <= last) {
        if (!isSundayOrHoliday(current)) {
            const dayOfWeek = current.getDay() === 0 ? '7' : String(current.getDay());
            const dailyConfig = timeConfig.calc_dailyWorkdayConfig?.[dayOfWeek];
            const workdayHours = dailyConfig ? Number(dailyConfig.hours || 0) : (timeConfig.calc_workdayHours !== undefined ? Number(timeConfig.calc_workdayHours) : 8);
            const workdayMins = dailyConfig ? Number(dailyConfig.mins || 0) : (timeConfig.calc_workdayMins !== undefined ? Number(timeConfig.calc_workdayMins) : 0);
            totalBase += workdayHours + (workdayMins / 60);
        }
        current.setDate(current.getDate() + 1);
    }

    return parseFloat(totalBase.toFixed(2));
};

/**
 * Motor principal para consolidar los datos del Tablero Gerencial
 */
export const computeGerencialDashboardData = ({
    shifts = [],
    visitas = [],
    employeesMap = {},
    timeConfig = {},
    rangeStart = null,
    rangeEnd = null,
    applyLunchOverride = true
}) => {
    // 1. Configuración efectiva (respetando switch de almuerzo)
    const effectiveTimeConfig = {
        ...timeConfig,
        calc_lunch: applyLunchOverride ? (timeConfig.calc_lunch !== false) : false
    };

    // 2. Emparejar visitas si vienen crudas
    const visitasEmparejadas = Array.isArray(visitas) && visitas.length > 0 && visitas[0].tipo
        ? pairVisitLogs(visitas)
        : visitas;

    // 3. Procesar días con el motor central
    const allDailyData = processDetailedDailyReport(shifts, visitasEmparejadas, effectiveTimeConfig).filter(day =>
        day.segmentos && day.segmentos.length > 0 && day.buckets
    );

    // 4. Filtrar por rango
    const rangeStartDay = rangeStart ? new Date(rangeStart.getFullYear(), rangeStart.getMonth(), rangeStart.getDate()) : null;
    const rangeEndDay = rangeEnd ? new Date(rangeEnd.getFullYear(), rangeEnd.getMonth(), rangeEnd.getDate(), 23, 59, 59) : null;

    const dailyData = allDailyData.filter(day => {
        if (rangeStartDay && day.dateObj < rangeStartDay) return false;
        if (rangeEndDay && day.dateObj > rangeEndDay) return false;
        return true;
    });

    // 5. Determinar rango efectivo si no se pasó explícitamente
    let actualStart = rangeStartDay;
    let actualEnd = rangeEndDay;
    if (!actualStart || !actualEnd) {
        let minTime = Infinity;
        let maxTime = -Infinity;
        dailyData.forEach(day => {
            const ms = day.dateObj.getTime();
            if (ms < minTime) minTime = ms;
            if (ms > maxTime) maxTime = ms;
        });
        if (!actualStart && minTime !== Infinity) actualStart = new Date(minTime);
        if (!actualEnd && maxTime !== -Infinity) actualEnd = new Date(maxTime);
    }

    // 6. Base mes general
    const basePeriodHours = (actualStart && actualEnd) 
        ? calculateBasePeriodHours(actualStart, actualEnd, timeConfig) 
        : 0;

    // 7. Agrupar por empleado
    const byEmployee = {};
    const diasSet = {};

    dailyData.forEach(day => {
        const email = (day.email || '').toLowerCase().trim();
        if (!email) return;

        if (!byEmployee[email]) {
            const emp = employeesMap[email] || {};
            const fullName = `${emp.nombre || emp.firstName || ''} ${emp.apellido || emp.lastName || ''}`.trim() || day.nombre || email;
            
            byEmployee[email] = {
                email,
                nombre: fullName,
                documento: emp.documentoIdentidad || emp.cedula || '-',
                cargo: emp.cargo || 'Operativo',
                departamento: emp.departamento || 'Operaciones',
                totalServicioMins: 0,
                totalTrasladoMins: 0,
                totalLaboradoMins: 0,
                totalLunchMins: 0,
                totalSinDescontarMins: 0,
                diurnasMins: 0,
                nocturnasMins: 0,
                domDiurnasMins: 0,
                domNocturnasMins: 0,
                totalVisitas: 0,
                comments: [],
                hasAlerts: false,
                diasDetalleMap: {}
            };
            diasSet[email] = new Set();
        }

        const acc = byEmployee[email];
        diasSet[email].add(day.fecha);

        // Minutos
        const servMins = Math.max(0, day.rawBuckets?.servicioMins || 0);
        const trasMins = Math.max(0, day.rawBuckets?.trasladoMins || 0);
        const labMins = day.rawBuckets?.totalMins || 0;
        const lunchMins = day.rawBuckets?.lunchMins || 0;
        const sinDescMins = day.rawBuckets?.totalSinDescontarMins || 0;

        acc.totalServicioMins += servMins;
        acc.totalTrasladoMins += trasMins;
        acc.totalLaboradoMins += labMins;
        acc.totalLunchMins += lunchMins;
        acc.totalSinDescontarMins += sinDescMins;
        acc.diurnasMins += (day.rawBuckets?.diurnas || 0);
        acc.nocturnasMins += (day.rawBuckets?.nocturnas || 0);
        acc.domDiurnasMins += (day.rawBuckets?.domDiurnas || 0);
        acc.domNocturnasMins += (day.rawBuckets?.domNocturnas || 0);

        const visitasDiaCount = day.visitasExcel?.length || 0;
        acc.totalVisitas += visitasDiaCount;

        // Comentarios y alertas
        if (day.segmentos) {
            day.segmentos.forEach(seg => {
                if (seg.originalShift?.entry?.comentarioAdmin) acc.comments.push(seg.originalShift.entry.comentarioAdmin);
                if (seg.originalShift?.exit?.comentarioAdmin) acc.comments.push(seg.originalShift.exit.comentarioAdmin);
                if (!seg.originalShift?.exit) acc.hasAlerts = true; // Turno huérfano
            });
        }

        // Detalle por día calendario
        const fechaKey = day.fecha;
        if (!acc.diasDetalleMap[fechaKey]) {
            const firstSeg = day.segmentos?.[0]?.originalShift;
            acc.diasDetalleMap[fechaKey] = {
                fecha: day.fecha,
                dateObj: day.dateObj,
                diaNombre: new Intl.DateTimeFormat('es-CO', { weekday: 'short' }).format(day.dateObj),
                horaEntrada: firstSeg?.entry?.hora || '-',
                horaSalida: firstSeg?.exit?.hora || 'Sin Salida',
                localidadEntrada: firstSeg?.entry?.localidad || '-',
                localidadSalida: firstSeg?.exit?.localidad || '-',
                horasNetas: 0,
                horasBrutas: 0,
                horasTraslado: 0,
                horasServicio: 0,
                visitasCount: 0,
                visitasLista: [],
                comentarios: []
            };
        }

        const dDet = acc.diasDetalleMap[fechaKey];
        dDet.horasNetas += labMins / 60;
        dDet.horasBrutas += sinDescMins / 60;
        dDet.horasTraslado += trasMins / 60;
        dDet.horasServicio += servMins / 60;
        dDet.visitasCount += visitasDiaCount;

        if (day.visitasExcel && day.visitasExcel.length > 0) {
            day.visitasExcel.forEach(v => {
                if (v.nombreCliente && !dDet.visitasLista.includes(v.nombreCliente)) {
                    dDet.visitasLista.push(v.nombreCliente);
                }
            });
        }
    });

    const minsToDecimal = (mins) => parseFloat(Math.max(0, mins / 60).toFixed(2));

    // 8. Transformar a array ordenado por nombre
    const employeesList = Object.values(byEmployee)
        .map(emp => {
            const diasTrab = diasSet[emp.email]?.size || 0;
            const horasNetas = minsToDecimal(emp.totalLaboradoMins);
            const horasBrutas = minsToDecimal(emp.totalSinDescontarMins);
            const horasTraslado = minsToDecimal(emp.totalTrasladoMins);
            const horasServicio = minsToDecimal(emp.totalServicioMins);
            const horasAlmuerzo = minsToDecimal(emp.totalLunchMins);
            const diurnas = minsToDecimal(emp.diurnasMins);
            const nocturnas = minsToDecimal(emp.nocturnasMins);
            const domDiurnas = minsToDecimal(emp.domDiurnasMins);
            const domNocturnas = minsToDecimal(emp.domNocturnasMins);

            const balance = parseFloat((horasNetas - basePeriodHours).toFixed(2));
            const uniqueComments = [...new Set(emp.comments)].filter(Boolean);

            // Detalle de días ordenado cronológicamente
            const diasDetalle = Object.values(emp.diasDetalleMap)
                .sort((a, b) => a.dateObj - b.dateObj)
                .map(d => ({
                    ...d,
                    horasNetas: parseFloat(d.horasNetas.toFixed(2)),
                    horasBrutas: parseFloat(d.horasBrutas.toFixed(2)),
                    horasTraslado: parseFloat(d.horasTraslado.toFixed(2)),
                    horasServicio: parseFloat(d.horasServicio.toFixed(2))
                }));

            return {
                email: emp.email,
                nombre: emp.nombre,
                documento: emp.documento,
                cargo: emp.cargo,
                departamento: emp.departamento,
                diasTrabajados: diasTrab,
                totalVisitas: emp.totalVisitas,
                horasNetas,
                horasBrutas,
                horasTraslado,
                horasServicio,
                horasAlmuerzo,
                diurnas,
                nocturnas,
                domDiurnas,
                domNocturnas,
                baseMes: basePeriodHours,
                balance,
                hasExtras: balance > 0,
                hasDeficit: balance < 0,
                hasTraslados: horasTraslado > 0,
                hasAlerts: emp.hasAlerts,
                comments: uniqueComments,
                diasDetalle
            };
        })
        .sort((a, b) => a.nombre.localeCompare(b.nombre));

    // 9. Calcular KPIs globales
    let totalLaboradas = 0;
    let totalBrutas = 0;
    let totalTraslado = 0;
    let totalServicio = 0;
    let totalVisitas = 0;
    let totalDiurnas = 0;
    let totalNocturnas = 0;
    let totalDomDiurnas = 0;
    let totalDomNocturnas = 0;

    employeesList.forEach(e => {
        totalLaboradas += e.horasNetas;
        totalBrutas += e.horasBrutas;
        totalTraslado += e.horasTraslado;
        totalServicio += e.horasServicio;
        totalVisitas += e.totalVisitas;
        totalDiurnas += e.diurnas;
        totalNocturnas += e.nocturnas;
        totalDomDiurnas += e.domDiurnas;
        totalDomNocturnas += e.domNocturnas;
    });

    totalLaboradas = parseFloat(totalLaboradas.toFixed(2));
    totalTraslado = parseFloat(totalTraslado.toFixed(2));
    totalServicio = parseFloat(totalServicio.toFixed(2));

    const totalProductivo = totalServicio + totalTraslado;
    const porcentajeEnClientes = totalProductivo > 0 ? Math.round((totalServicio / totalProductivo) * 100) : 0;
    const porcentajeEnTraslado = totalProductivo > 0 ? Math.round((totalTraslado / totalProductivo) * 100) : 0;

    const kpis = {
        totalEmpleados: employeesList.length,
        totalLaboradas,
        totalBrutas: parseFloat(totalBrutas.toFixed(2)),
        totalTraslado,
        totalServicio,
        totalVisitas,
        totalDiurnas: parseFloat(totalDiurnas.toFixed(2)),
        totalNocturnas: parseFloat(totalNocturnas.toFixed(2)),
        totalDomDiurnas: parseFloat(totalDomDiurnas.toFixed(2)),
        totalDomNocturnas: parseFloat(totalDomNocturnas.toFixed(2)),
        basePeriodHours,
        porcentajeEnClientes,
        porcentajeEnTraslado,
        empleadosConExtras: employeesList.filter(e => e.hasExtras).length,
        empleadosConDeficit: employeesList.filter(e => e.hasDeficit).length,
        empleadosEnRuta: employeesList.filter(e => e.hasTraslados).length
    };

    return {
        kpis,
        employeesList,
        basePeriodHours,
        actualStart,
        actualEnd
    };
};
