import { getDocs, collection } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { processDetailedDailyReport, parseStringDate } from './timeCalculator';
import { exportToExcelHTML } from './exportUtils';
import { isSundayOrHoliday } from './colombiaHolidays';

/**
 * Informe #8 — Control Consolidado por Jornada y Ruta (Por Empleado)
 * Comprime todos los días del periodo en UNA sola fila por empleado.
 * Ideal para liquidar nómina.
 */
export const handleExportConsolidated = async (shifts, employeesMap, csvUserFilter, timeConfig, exportFormatAttendance, rangeStart, rangeEnd) => {
    try {
        // ── 1. Cargar visitas ──────────────────────────────────────────────────────
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

        // ── 2. Ordenar y emparejar visitas ─────────────────────────────────────────
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
                    } else {
                        visitasEmparejadas.push({ email, fecha: rec.fecha, horaLlegada: null, fechaSalida: rec.fecha, horaSalida: rec.hora, usuario: email });
                    }
                }
            });
            if (pendingEntry) visitasEmparejadas.push({ email, fecha: pendingEntry.fecha, horaLlegada: pendingEntry.hora, fechaSalida: null, horaSalida: null, usuario: email });
        });

        // ── 3. Procesar por días (mismo motor que el informe detallado) ────────────
        const allDailyData = processDetailedDailyReport(filteredShifts, visitasEmparejadas, timeConfig).filter(day =>
            day.segmentos && day.segmentos.length > 0 && day.buckets
        );

        // Filtrar filas por rango solicitado (turnos nocturnos generan segmentos
        // en dos días; aquí solo conservamos los que caen en el periodo pedido)
        const rangeStartDay = rangeStart ? new Date(rangeStart.getFullYear(), rangeStart.getMonth(), rangeStart.getDate()) : null;
        const rangeEndDay   = rangeEnd   ? new Date(rangeEnd.getFullYear(),   rangeEnd.getMonth(),   rangeEnd.getDate())   : null;
        const dailyData = allDailyData.filter(day => {
            if (rangeStartDay && day.dateObj < rangeStartDay) return false;
            if (rangeEndDay   && day.dateObj > rangeEndDay)   return false;
            return true;
        });

        if (!dailyData || dailyData.length === 0) {
            alert('No se encontraron turnos en el rango seleccionado.');
            return;
        }


        // ── 4. Calcular BASE MES (igual que el informe detallado) ──────────────────
        let totalBaseHours = 0;
        let actualStart = rangeStart;
        let actualEnd = rangeEnd;

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
        totalBaseHours = parseFloat(totalBaseHours.toFixed(2));

        // ── 5. CONSOLIDAR por empleado ─────────────────────────────────────────────
        const byEmployee = {};
        // Set por empleado para contar días calendario únicos (no segmentos)
        const diasSet = {};

        dailyData.forEach(day => {
            const email = day.email;
            if (!byEmployee[email]) {
                const emp = employeesMap[email] || {};
                byEmployee[email] = {
                    email,
                    nombre: `${emp.nombre || emp.firstName || ''} ${emp.apellido || emp.lastName || ''}`.trim() || day.nombre || email,
                    diasTrabajados: 0,
                    totalServicioMins: 0,
                    totalTrasladoMins: 0,
                    totalLunchMins: 0,
                    totalSinDescontarMins: 0,
                    totalLaboradoMins: 0,
                    diurnasMins: 0,
                    nocturnasMins: 0,
                    domDiurnasMins: 0,
                    domNocturnasMins: 0,
                    totalVisitas: 0,
                    comments: []
                };
                diasSet[email] = new Set();
            }

            const acc = byEmployee[email];
            // Contar día calendario único (un turno nocturno da 2 segmentos pero 2 días distintos)
            diasSet[email].add(day.fecha);


            // totalServicioHHMM y totalTrasladoHHMM vienen como HORAS DECIMALES (ej: 5.25 = 5h 15min)
            // hay que multiplicar × 60 para convertir a minutos antes de acumular.
            const horasToMins = (horas) => {
                if (!horas) return 0;
                if (typeof horas === 'number') return horas * 60; // ← decimal hours → minutes
                // Si por algún motivo llegara como "HH:MM"
                const parts = String(horas).split(':');
                if (parts.length >= 2) {
                    return (parseInt(parts[0], 10) || 0) * 60 + (parseInt(parts[1], 10) || 0);
                }
                return parseFloat(horas) * 60 || 0;
            };

            // Servicio y Traslado vienen directamente del motor (mismos minutos que Laborado)
            acc.totalServicioMins += Math.max(0, day.rawBuckets?.servicioMins || 0);
            acc.totalTrasladoMins += Math.max(0, day.rawBuckets?.trasladoMins || 0);
            acc.totalLaboradoMins += (day.rawBuckets?.totalMins || 0);
            acc.totalLunchMins += (day.rawBuckets?.lunchMins || 0);
            acc.totalSinDescontarMins += (day.rawBuckets?.totalSinDescontarMins || 0);
            acc.diurnasMins += (day.rawBuckets?.diurnas || 0);
            acc.nocturnasMins += (day.rawBuckets?.nocturnas || 0);
            acc.domDiurnasMins += (day.rawBuckets?.domDiurnas || 0);
            acc.domNocturnasMins += (day.rawBuckets?.domNocturnas || 0);
            acc.totalVisitas += (day.visitasExcel?.length || 0);
            if (day.segmentos) {
                day.segmentos.forEach(seg => {
                    if (seg.originalShift?.entry?.comentarioAdmin) acc.comments.push(seg.originalShift.entry.comentarioAdmin);
                    if (seg.originalShift?.exit?.comentarioAdmin) acc.comments.push(seg.originalShift.exit.comentarioAdmin);
                });
            }
        });

        // ── 6. Convertir minutos a horas decimales para mostrar en Excel ──────────
        const minsToDecimal = (mins) => parseFloat(Math.max(0, mins / 60).toFixed(2));

        const fmtNum = (num) => {
            const n = Number(num);
            return isNaN(n) ? 0 : parseFloat(n.toFixed(2));
        };

        // ── 7. Construir Headers ───────────────────────────────────────────────────
        const headers = [
            'NOMBRE DEL TÉCNICO',
            'CORREO',
            'DÍAS TRABAJADOS',
            'TOTAL VISITAS',
            'TIEMPO TOTAL EN VISITA A CLIENTES',
            'TIEMPO TOTAL EN TRASLADO',
            'HORAS TOTALES DE ALMUERZO',
            'TIEMPO TOTAL LABORADO (SIN DESCONTAR ALMUERZO)',
            'TIEMPO TOTAL LABORADO (DESCONTANDO ALMUERZO)',
            'BASE MES',
            'HORA DIURNA',
            'HORA NOCTURNA',
            'HORA DOMINICAL DIURNA',
            'HORA DOMINICAL NOCTURNA',
            'Comentario Admin 1',
            'Comentario Admin 2',
        ];

        // ── 8. Construir filas (una por empleado) ──────────────────────────────────
        const rows = Object.values(byEmployee)
            .sort((a, b) => a.nombre.localeCompare(b.nombre))
            .map(acc => [
                acc.nombre,
                acc.email,
                diasSet[acc.email]?.size || 0,   // días calendario únicos
                acc.totalVisitas,
                minsToDecimal(acc.totalServicioMins),
                minsToDecimal(acc.totalTrasladoMins),
                minsToDecimal(acc.totalLunchMins),
                minsToDecimal(acc.totalSinDescontarMins),
                minsToDecimal(acc.totalLaboradoMins),
                fmtNum(totalBaseHours),
                minsToDecimal(acc.diurnasMins),
                minsToDecimal(acc.nocturnasMins),
                minsToDecimal(acc.domDiurnasMins),
                minsToDecimal(acc.domNocturnasMins),
                ([...new Set(acc.comments)].filter(Boolean)[0] || '-'),
                ([...new Set(acc.comments)].filter(Boolean).slice(1).join(' | ') || '-')
            ]);

        if (rows.length === 0) {
            alert('No se encontraron empleados con registros en el periodo seleccionado.');
            return;
        }

        // ── 9. Exportar ────────────────────────────────────────────────────────────
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
            exportToExcelHTML(`control_consolidado_${ts}.xlsx`, headers, rows);
        } else {
            const csvContent = '\ufeff' + [headers.join(';'), ...rows.map(r => r.map(cell => {
                if (typeof cell === 'number') return cell.toFixed(2).replace('.', ',');
                return cell;
            }).join(';'))].join('\n');
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `control_consolidado_${ts}.csv`;
            link.click();
        }

    } catch (err) {
        console.error('Crash en handleExportConsolidated:', err);
        alert('CRASH: ' + err.message + '\n' + err.stack);
        throw err;
    }
};
