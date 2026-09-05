import { getDocs, collection } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { processDetailedDailyReport, parseStringDate } from './timeCalculator';
import { exportToExcelHTML } from './exportUtils';
import { isSundayOrHoliday } from './colombiaHolidays';

export const handleExportDetailedDaily = async (shifts, employeesMap, csvUserFilter, timeConfig, exportFormatAttendance, rangeStart, rangeEnd) => {
    try {
        // Iniciando exportación
    const snapVisitas = await getDocs(collection(db, 'visitas'));
    const allVisitas = snapVisitas.docs.map(d => ({ id: d.id, ...d.data() }));

    const filteredShifts = csvUserFilter 
        ? shifts.filter(s => {
            if (!s.email) return false;
            const email = s.email.toLowerCase();
            const emp = employeesMap[email] || {};
            const fullName = `${emp.nombre || emp.firstName || ''} ${emp.apellido || emp.lastName || ''}`.toLowerCase();
            const searchStr = csvUserFilter.trim().toLowerCase();
            return email.includes(searchStr) || fullName.includes(searchStr);
        })
        : shifts;

    let filteredVisitas = allVisitas;
    if (csvUserFilter && csvUserFilter.trim()) {
        const term = csvUserFilter.trim().toLowerCase();
        filteredVisitas = allVisitas.filter(v => {
            const email = (v.usuario || '').toLowerCase();
            const emp = employeesMap[email] || {};
            const fullName = `${emp.nombre || emp.firstName || ''} ${emp.apellido || emp.lastName || ''}`.toLowerCase();
            return email.includes(term) || fullName.includes(term);
        });
    }

    // Agrupar visitas en pares (Llegada Cliente / Salida Cliente)
    filteredVisitas.sort((a, b) => {
        const dateA = parseStringDate(a.fecha, a.hora) || (a.timestamp && typeof a.timestamp.toDate === 'function' ? a.timestamp.toDate() : new Date(0));
        const dateB = parseStringDate(b.fecha, b.hora) || (b.timestamp && typeof b.timestamp.toDate === 'function' ? b.timestamp.toDate() : new Date(0));
        return dateA - dateB;
    });

    const byUserV = {};
    filteredVisitas.forEach(log => {
        const key = (log.usuario || '').toLowerCase().trim();
        if (!byUserV[key]) byUserV[key] = [];
        byUserV[key].push(log);
    });

    const visitasEmparejadas = [];
    Object.keys(byUserV).forEach(email => {
        let pendingEntry = null;
        byUserV[email].forEach(rec => {
            if (rec.tipo === 'Llegada Cliente') {
                if (pendingEntry) visitasEmparejadas.push({ email, fecha: pendingEntry.fecha, horaLlegada: pendingEntry.hora, fechaSalida: null, horaSalida: null, usuario: email });
                pendingEntry = rec;
            } else if (rec.tipo === 'Salida Cliente') {
                if (pendingEntry) { 
                    visitasEmparejadas.push({ email, fecha: pendingEntry.fecha, horaLlegada: pendingEntry.hora, fechaSalida: rec.fecha, horaSalida: rec.hora, usuario: email }); 
                    pendingEntry = null; 
                }
                else visitasEmparejadas.push({ email, fecha: rec.fecha, horaLlegada: null, fechaSalida: rec.fecha, horaSalida: rec.hora, usuario: email });
            }
        });
        if (pendingEntry) visitasEmparejadas.push({ email, fecha: pendingEntry.fecha, horaLlegada: pendingEntry.hora, fechaSalida: null, horaSalida: null, usuario: email });
    });

    const allDailyData = processDetailedDailyReport(filteredShifts, visitasEmparejadas, timeConfig).filter(day =>
        day.segmentos && day.segmentos.length > 0 && day.buckets
    );

    // Filtrar filas por rango solicitado (importante para turnos nocturnos
    // que generan segmentos en dos días calendario distintos)
    const rangeStartDay = rangeStart ? new Date(rangeStart.getFullYear(), rangeStart.getMonth(), rangeStart.getDate()) : null;
    const rangeEndDay   = rangeEnd   ? new Date(rangeEnd.getFullYear(),   rangeEnd.getMonth(),   rangeEnd.getDate())   : null;
    const dailyData = allDailyData.filter(day => {
        if (rangeStartDay && day.dateObj < rangeStartDay) return false;
        if (rangeEndDay   && day.dateObj > rangeEndDay)   return false;
        return true;
    });

    if (!dailyData || dailyData.length === 0) {
        alert("No se encontraron turnos en el rango seleccionado.");
        return;
    }

    // ── CÁLCULO DE LA COLUMNA "BASE MES" SEGÚN EL RANGO SELECCIONADO ──
    let totalBaseHours = 0;
    let actualStart = rangeStart;
    let actualEnd = rangeEnd;
    
    // Si no enviaron rango explícito, tomamos el rango de los turnos filtrados
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

    if (actualStart && actualEnd) {
        let currentIter = new Date(actualStart.getFullYear(), actualStart.getMonth(), actualStart.getDate());
        const lastIter = new Date(actualEnd.getFullYear(), actualEnd.getMonth(), actualEnd.getDate());
        
        while (currentIter <= lastIter) {
            if (!isSundayOrHoliday(currentIter)) {
                const dayOfWeek = currentIter.getDay() === 0 ? '7' : String(currentIter.getDay());
                const dailyConfig = timeConfig.calc_dailyWorkdayConfig?.[dayOfWeek];
                
                const workdayHours = dailyConfig ? Number(dailyConfig.hours || 0) : (timeConfig.calc_workdayHours !== undefined ? Number(timeConfig.calc_workdayHours) : 8);
                const workdayMins = dailyConfig ? Number(dailyConfig.mins || 0) : (timeConfig.calc_workdayMins !== undefined ? Number(timeConfig.calc_workdayMins) : 0);
                
                totalBaseHours += workdayHours + (workdayMins / 60);
            }
            currentIter.setDate(currentIter.getDate() + 1);
        }
    }
    // Redondear a 2 decimales para estética
    totalBaseHours = parseFloat(totalBaseHours.toFixed(2));

    // 1. Agrupar por empleado y día calendario
    const groupedMap = new Map();
    dailyData.forEach(day => {
        const key = `${day.email}_${day.dateObj.getTime()}`;
        if (!groupedMap.has(key)) {
            groupedMap.set(key, {
                email: day.email,
                nombre: day.nombre,
                dateObj: day.dateObj,
                segmentosDato: [],
                visitasExcel: [],
                totalServicioHHMM: 0,
                totalTrasladoHHMM: 0,
                bucketsTotalHHMM: 0,
                rawBuckets: { diurnas: 0, nocturnas: 0, domDiurnas: 0, domNocturnas: 0 },
                appliedLunch: false,
                lunchMinsTotal: 0,
                totalSinDescontarMinsTotal: 0,
                comments: []
            });
        }
        const group = groupedMap.get(key);
        // Guardamos el segmento
        const seg = day.segmentos[0];
        if (seg?.originalShift?.entry?.comentarioAdmin) group.comments.push(seg.originalShift.entry.comentarioAdmin);
        if (seg?.originalShift?.exit?.comentarioAdmin) group.comments.push(seg.originalShift.exit.comentarioAdmin);
        group.segmentosDato.push({
            start: seg.segmentStart,
            end: seg.segmentEnd,
            hasRealExit: !!seg.originalShift.exit,
            laborado: day.buckets.totalHHMM
        });
        
        // Unificamos las visitas
        if (day.visitasExcel && day.visitasExcel.length > 0) {
            group.visitasExcel.push(...day.visitasExcel);
        }
        
        // Sumamos los totales
        group.totalServicioHHMM += day.totalServicioHHMM;
        group.totalTrasladoHHMM += day.totalTrasladoHHMM;
        group.bucketsTotalHHMM += day.buckets.totalHHMM;
        
        group.rawBuckets.diurnas += (day.rawBuckets?.diurnas || 0);
        group.rawBuckets.nocturnas += (day.rawBuckets?.nocturnas || 0);
        group.rawBuckets.domDiurnas += (day.rawBuckets?.domDiurnas || 0);
        group.rawBuckets.domNocturnas += (day.rawBuckets?.domNocturnas || 0);
        
        group.lunchMinsTotal += (day.rawBuckets?.lunchMins || 0);
        group.totalSinDescontarMinsTotal += (day.rawBuckets?.totalSinDescontarMins || 0);
        
        if (day.appliedLunch) group.appliedLunch = true;
    });

    const groupedDailyData = Array.from(groupedMap.values());

    // Ordenar los segmentos de cada día cronológicamente
    groupedDailyData.forEach(group => {
        group.segmentosDato.sort((a, b) => a.start - b.start);
        // También ordenar visitas del día cronológicamente
        group.visitasExcel.sort((a, b) => {
            const timeA = a.horaLlegada ? a.horaLlegada.replace(':','') : '9999';
            const timeB = b.horaLlegada ? b.horaLlegada.replace(':','') : '9999';
            return parseInt(timeA) - parseInt(timeB);
        });
    });

    // 2. Calcular el máximo de visitas y segmentos para dimensionar las columnas
    let maxVisits = 0;
    let maxSegments = 0;
    groupedDailyData.forEach(group => {
        if (group.visitasExcel.length > maxVisits) maxVisits = group.visitasExcel.length;
        if (group.segmentosDato.length > maxSegments) maxSegments = group.segmentosDato.length;
    });

    // 3. Construir Headers
    const headers = [
        'NOMBRE DEL TÉCNICO', 'DÍA', 'FECHA'
    ];
    for (let i = 1; i <= maxSegments; i++) {
        headers.push(`ENTRADA ${i}`, `SALIDA ${i}`, `TIEMPO LABORADO ${i}`);
    }

    for (let i = 1; i <= maxVisits; i++) {
        headers.push(`ENTRADA CLIENTE ${i}`, `SALIDA CLIENTE ${i}`);
    }
    headers.push(
        'TIEMPO TOTAL EN VISITA A CLIENTES', 
        'TIEMPO TOTAL EN TRASLADO',
        'ALMUERZO',
        'TIEMPO TOTAL LABORADO (SIN DESCONTAR ALMUERZO)', 
        'TIEMPO TOTAL LABORADO (DESCONTANDO ALMUERZO)', 
        'BASE MES',
        'HORA DIURNA', 'HORA NOCTURNA', 'HORA DOMINICAL DIURNA', 'HORA DOMINICAL NOCTURNA',
        'Comentario Admin 1', 'Comentario Admin 2'
    );

    // 4. Construir Filas
    const rows = groupedDailyData.map(group => {
        const emp = employeesMap[group.email] || {};
        const nombreCompleto = `${emp.nombre || emp.firstName || ''} ${emp.apellido || emp.lastName || ''}`.trim() || group.nombre || group.email;
        
        const dayNames = ['DOMINGO', 'LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO'];
        const diaNombre = dayNames[group.dateObj.getDay()];

        const formatDate       = (d) => `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
        const formatTime       = (d) => `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
        const formatStringTime = (t) => { if (!t) return '00:00'; const p = t.split(':'); return p.length >= 2 ? `${p[0].padStart(2,'0')}:${p[1].padStart(2,'0')}` : t; };

        const displayDate = formatDate(group.dateObj);

        // Celdas dinámicas de segmentos
        const segmentCells = [];
        for (let i = 0; i < maxSegments; i++) {
            const seg = group.segmentosDato[i];
            if (seg) {
                segmentCells.push(formatTime(seg.start));
                segmentCells.push(seg.hasRealExit ? formatTime(seg.end) : '');
                segmentCells.push(Number(seg.laborado));
            } else {
                segmentCells.push('');
                segmentCells.push('');
                segmentCells.push('');
            }
        }

        const almuerzoCell = group.appliedLunch ? `${String(Math.floor(timeConfig.calc_lunchMins / 60)).padStart(2, '0')}:${String(timeConfig.calc_lunchMins % 60).padStart(2, '0')}` : '00:00';

        const visitasCells = [];
        for (let i = 0; i < maxVisits; i++) {
            const v = group.visitasExcel[i];
            visitasCells.push(v && v.horaLlegada ? formatStringTime(v.horaLlegada) : '00:00');
            visitasCells.push(v && v.horaSalida  ? formatStringTime(v.horaSalida)  : '00:00');
        }

        const formatNumber = (num) => {
            const n = Number(num);
            return isNaN(n) ? 0 : parseFloat(n.toFixed(2));
        };

        const totalServicio = formatNumber(group.totalServicioHHMM);
        const totalTraslado = formatNumber(group.totalTrasladoHHMM);

        return [
            nombreCompleto,
            diaNombre,
            displayDate,
            ...segmentCells,
            ...visitasCells,
            totalServicio,
            totalTraslado,
            formatNumber(group.lunchMinsTotal / 60),
            formatNumber(group.totalSinDescontarMinsTotal / 60),
            formatNumber(group.bucketsTotalHHMM),
            formatNumber(totalBaseHours), 
            formatNumber((group.rawBuckets?.diurnas || 0) / 60),
            formatNumber((group.rawBuckets?.nocturnas || 0) / 60),
            formatNumber((group.rawBuckets?.domDiurnas || 0) / 60),
            formatNumber((group.rawBuckets?.domNocturnas || 0) / 60),
            ([...new Set(group.comments)].filter(Boolean)[0] || '-'),
            ([...new Set(group.comments)].filter(Boolean).slice(1).join(' | ') || '-')
        ];
    });

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

    const ts = new Date().toISOString().slice(0, 10);
    if (exportFormatAttendance === 'xlsx') {
        exportToExcelHTML(`control_jornada_${ts}.xlsx`, headers, rows);
    } else {
        const csvContent = '\ufeff' + [headers.join(';'), ...rows.map(r => r.map(cell => {
            if (typeof cell === 'number') return cell.toFixed(2).replace('.', ',');
            return cell;
        }).join(';'))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `control_jornada_${ts}.csv`;
        link.click();
    }
    } catch (err) {
        console.error("Crash en handleExportDetailedDaily:", err);
        alert("CRASH: " + err.message + "\n" + err.stack);
        throw err;
    }
};
