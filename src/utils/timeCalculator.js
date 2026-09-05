import { isSundayOrHoliday } from './colombiaHolidays.js';

/**
 * Convierte las cadenas de fecha (DD/MM/YYYY) y hora (HH:MM:SS) a un objeto Date real.
 * Esto asegura que los cálculos matemáticos cuadren exactamente con lo visualizado, 
 * sin verse afectados por las demoras de latencia de red en serverTimestamp().
 */
export const parseStringDate = (fechaStr, horaStr) => {
    if (!fechaStr || !horaStr) return null;
    try {
        const separator = fechaStr.includes('/') ? '/' : '-';
        const parts = fechaStr.split(separator);
        if (parts.length !== 3) return null;

        let d, m, y;
        if (parts[0].length === 4) {
            // Formato YYYY-MM-DD
            [y, m, d] = parts;
        } else {
            // Formato DD/MM/YYYY o DD-MM-YYYY
            [d, m, y] = parts;
        }

        const cleanHora = horaStr.replace(/[^0-9:]/g, '');
        const timeParts = cleanHora.split(':');
        if (timeParts.length < 2) return null;

        const h = timeParts[0];
        const min = timeParts[1];
        const s = timeParts[2] || '00';

        const dateObj = new Date(parseInt(y), parseInt(m) - 1, parseInt(d), parseInt(h), parseInt(min), parseInt(s));
        if (isNaN(dateObj.getTime())) return null;
        return dateObj;
    } catch {
        return null; // fallback will be used
    }
};

/**
 * Redondea un objeto Date al intervalo de minutos más cercano.
 * Ejemplo (15 min): 07:52 -> 07:45, 07:58 -> 08:00
 * @param {Date} dateObj - Fecha original
 * @param {number} intervalMinutes - Intervalo (ej. 15)
 * @returns {Date} Nueva fecha redondeada
 */
export const roundDateToNearest = (dateObj, intervalMinutes) => {
    if (!intervalMinutes || intervalMinutes < 1) return new Date(dateObj.getTime());

    // Convertir intervalo a milisegundos
    const msInterval = intervalMinutes * 60 * 1000;
    // Redondear tiempo
    const roundedTime = Math.round(dateObj.getTime() / msInterval) * msInterval;
    return new Date(roundedTime);
};

/**
 * Convierte minutos a horas decimales (número real, 2 decimales).
 * Ejemplo: 90 min → 1.5
 * Devuelve un number (no string) para que Excel pueda sumarlo directamente.
 */
const formatMinutesToHHMM = (totalMins) => {
    return parseFloat((totalMins / 60).toFixed(2));
};

/**
 * Calcula las 4 categorías de horas según legislación colombiana.
 * - Diurnas: 06:00 a 19:00
 * - Nocturnas: 19:00 a 06:00
 * - Dominicales Diurnas: Festivos / Domingos 06:00 a 19:00
 * - Dominicales Nocturnas: Festivos / Domingos 19:00 a 06:00
 *
 * @param {Date} entry - FechaHora de entrada
 * @param {Date} exit - FechaHora de salida
 * @param {Object} config - Configuración (rounding, roundingMins, lunch, lunchMins)
 * @returns {Object} { diurnas, nocturnas, domDiurnas, domNocturnas, format: { diurnas, nocturnas, ... }, error: string }
 */
export const calculateLaborHours = (entry, exit, config = {}) => {
    if (!entry || !exit) {
        return { error: 'Faltan fechas de entrada o salida' };
    }

    let start = new Date(entry.getTime());
    let end = new Date(exit.getTime());

    // 1. Aplicar Redondeo
    if (config.calc_rounding && config.calc_roundingMins) {
        start = roundDateToNearest(start, config.calc_roundingMins);
        end = roundDateToNearest(end, config.calc_roundingMins);
    }

    // Calcular duración total real redondeada
    let totalDurationMs = end.getTime() - start.getTime();
    if (totalDurationMs <= 0) {
        return { error: 'Duración cero o negativa' };
    }

    // Baldes de minutos (Acumuladores)
    let buckets = {
        diurnas: 0,
        nocturnas: 0,
        domDiurnas: 0,
        domNocturnas: 0
    };

    // 2. Iterar minuto a minuto para ser precisos con cambios de día y horas límite
    // Usamos milisegundos
    let currentMs = start.getTime();
    const endMs = end.getTime();

    while (currentMs < endMs) {
        let nextMs = currentMs + 60000;
        let stepMs = 60000;
        
        // Si el siguiente paso excede el final, ajustamos el paso al residuo
        if (nextMs > endMs) {
            stepMs = endMs - currentMs;
            nextMs = endMs;
        }

        const d = new Date(currentMs);
        const isDomFest = isSundayOrHoliday(d);
        const hour = d.getHours();

        // Diurno en Colombia: 6 AM (inclusive) a 7 PM (exclusivo -> hasta las 18:59:59)
        const isDiurnal = hour >= 6 && hour < 19;

        // Calculamos la fracción de minuto que representa este paso
        const fractionOfMinute = stepMs / 60000;

        if (isDomFest) {
            if (isDiurnal) buckets.domDiurnas += fractionOfMinute;
            else buckets.domNocturnas += fractionOfMinute;
        } else {
            if (isDiurnal) buckets.diurnas += fractionOfMinute;
            else buckets.nocturnas += fractionOfMinute;
        }

        // Avanzar al siguiente punto
        currentMs = nextMs;
    }

    // Total en minutos para validar el almuerzo
    const totalMinutes = buckets.diurnas + buckets.nocturnas + buckets.domDiurnas + buckets.domNocturnas;

    // Calcular duración de la jornada en minutos para el día específico
    const dayOfWeek = start.getDay() === 0 ? '7' : String(start.getDay());
    let dailyConfig = config.calc_dailyWorkdayConfig?.[dayOfWeek];

    // Fallback: si es domingo (7) con 0 horas, usar la config del sábado (6)
    if (dayOfWeek === '7' && dailyConfig && (dailyConfig.hours || 0) === 0) {
        const saturdayConfig = config.calc_dailyWorkdayConfig?.['6'];
        if (saturdayConfig && (saturdayConfig.hours || 0) > 0) {
            dailyConfig = saturdayConfig;
        }
    }

    const workdayHours = dailyConfig ? dailyConfig.hours : (config.calc_workdayHours !== undefined ? parseInt(config.calc_workdayHours, 10) : 8);
    const workdayMins = dailyConfig ? dailyConfig.mins : (config.calc_workdayMins !== undefined ? parseInt(config.calc_workdayMins, 10) : 0);
    const requiredThresholdMins = (workdayHours * 60) + workdayMins;
    const lunchMinsToDeduct = parseInt(config.calc_lunchMins, 10) || 60;

    // 3. Descuento de Almuerzo
    let appliedLunchDeduction = false;

    // Lógica de decisión:
    // 1. 'individual': depende de config.applyLunchOverride marcado por el empleado.
    // 2. 'empresa'   : depende de config.applyLunchOverride marcado por el admin (En Vivo).
    // 3. 'general'   : umbral automático por horas del turno.
    let shouldDeduct = false;

    if (config.calc_lunch) {
        if (config.calc_lunchMode === 'individual') {
            // En modo individual, solo descontamos si el empleado lo marcó explícitamente
            shouldDeduct = !!config.applyLunchOverride;
        } else if (config.calc_lunchMode === 'empresa') {
            // En modo empresa, solo el admin puede marcar el descuento desde En Vivo.
            // Sin marca explícita (applyLunchOverride === true) → nunca descuenta automáticamente.
            shouldDeduct = config.applyLunchOverride === true;
        } else {
            // Modo general (automático por umbral)
            // Solo aplicar si el día tiene jornada laboral configurada (> 0 horas).
            // Evita que días con 0 horas (ej. domingo no laboral) disparen el descuento
            // automático con cualquier tiempo trabajado (ej. 3 horas > 60 min almuerzo).
            if (config.applyLunchOverride === true) {
                shouldDeduct = true;
            } else if (config.applyLunchOverride === false) {
                shouldDeduct = false;
            } else {
                // Gabela configurable por empresa (VITE_LUNCH_TOLERANCE_MINS en .env).
                // Evita que diferencias mínimas de reloj impidan el descuento automático.
                const LUNCH_TOLERANCE_MINS = parseInt(import.meta.env.VITE_LUNCH_TOLERANCE_MINS, 10) || 0;
                shouldDeduct = requiredThresholdMins > 0 &&
                    totalMinutes >= (requiredThresholdMins + lunchMinsToDeduct - LUNCH_TOLERANCE_MINS);
            }
        }
    }

    if (shouldDeduct) {
        appliedLunchDeduction = true;
        let lunchToDeduct = lunchMinsToDeduct;

        // Prioridad de descuento: Diurnas ordinarias > Nocturnas ordinarias > Dom/Fest Diurnas > Dom/Fest Nocturnas
        const categories = ['diurnas', 'nocturnas', 'domDiurnas', 'domNocturnas'];

        for (const cat of categories) {
            if (lunchToDeduct <= 0) break;

            if (buckets[cat] > 0) {
                if (buckets[cat] >= lunchToDeduct) {
                    buckets[cat] -= lunchToDeduct;
                    lunchToDeduct = 0;
                } else {
                    lunchToDeduct -= buckets[cat];
                    buckets[cat] = 0;
                }
            }
        }
    }

    // 4. Formatear y retornar
    return {
        raw: {
            diurnas: buckets.diurnas,
            nocturnas: buckets.nocturnas,
            domDiurnas: buckets.domDiurnas,
            domNocturnas: buckets.domNocturnas,
            totalMins: buckets.diurnas + buckets.nocturnas + buckets.domDiurnas + buckets.domNocturnas
        },
        format: {
            diurnas: formatMinutesToHHMM(buckets.diurnas),
            nocturnas: formatMinutesToHHMM(buckets.nocturnas),
            domDiurnas: formatMinutesToHHMM(buckets.domDiurnas),
            domNocturnas: formatMinutesToHHMM(buckets.domNocturnas),
            totalHHMM: formatMinutesToHHMM(buckets.diurnas + buckets.nocturnas + buckets.domDiurnas + buckets.domNocturnas)
        },
        appliedLunchDeduction,
        error: null
    };
};

/**
 * Divide un turno que cruza la medianoche en dos segmentos.
 * Si no cruza la medianoche, devuelve un array con un solo segmento.
 */
export const splitShiftByMidnight = (entryDate, exitDate) => {
    if (!entryDate || !exitDate) return [];
    
    const segments = [];
    let currentStart = new Date(entryDate.getTime());
    const finalEnd = new Date(exitDate.getTime());

    while (currentStart < finalEnd) {
        // Encontrar el final del día actual (23:59:59.999)
        const currentEndOfDay = new Date(currentStart.getFullYear(), currentStart.getMonth(), currentStart.getDate(), 23, 59, 59, 999);
        
        if (finalEnd <= currentEndOfDay) {
            // El turno termina el mismo día
            segments.push({ start: new Date(currentStart), end: new Date(finalEnd) });
            break;
        } else {
            // El turno cruza a otro día: guardar segmento hasta medianoche
            segments.push({ start: new Date(currentStart), end: new Date(currentEndOfDay.getTime() + 1) }); // +1ms para que sea 00:00:00 del sig dia
            currentStart = new Date(currentEndOfDay.getTime() + 1);
        }
    }
    return segments;
};

/**
 * Procesa turnos emparejados y visitas para generar el reporte detallado por días.
 * 
 * PRINCIPIO: Una fila = un segmento de turno (ya dividido por medianoche).
 * Si un turno cruza la medianoche, genera dos filas (una por día).
 * Si un empleado tiene dos turnos en el mismo día, genera dos filas para ese día.
 * Las visitas se asocian por solapamiento temporal con el segmento (no por fecha).
 * Las visitas que cruzan medianoche se cortan igual que los turnos.
 */
export const processDetailedDailyReport = (shifts, visitas, config) => {
    const expandedRegistros = [];
    
    shifts.forEach(s => {
        if (!s.entry) return;
        
        const entry = parseStringDate(s.entry.fecha, s.entry.hora);
        const exit  = s.exit ? parseStringDate(s.exit.fecha, s.exit.hora) : entry;
        if (!entry || !exit) return;

        const segments = splitShiftByMidnight(entry, exit);
        
        // El almuerzo se aplica solo al segmento más largo del turno
        let longestIdx = 0;
        let maxDur = 0;
        segments.forEach((seg, idx) => {
            const dur = seg.end - seg.start;
            if (dur > maxDur) { maxDur = dur; longestIdx = idx; }
        });

        segments.forEach((seg, idx) => {
            expandedRegistros.push({
                email: s.email,
                nombre: s.nombre || '',
                segmentStart: seg.start,
                segmentEnd:   seg.end,
                isLongestSegment: idx === longestIdx,
                applyLunchInThisSegment: idx === longestIdx && (s.exit?.applyLunch || s.entry?.applyLunch || false),
                originalShift: s
            });
        });
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────────────────────
    const midnightOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);

    /**
     * Corta una visita en medianoche (igual que splitShiftByMidnight).
     * Devuelve array de pares { fecha, horaLlegada, fechaSalida, horaSalida, ...resto }
     * donde ningún par cruza la medianoche.
     */
    const splitVisitByMidnight = (v) => {
        const entryDt = parseStringDate(v.fecha, v.horaLlegada);
        const exitDt  = parseStringDate(v.fechaSalida || v.fecha, v.horaSalida);
        if (!entryDt || !exitDt || exitDt <= entryDt) return [{ ...v }];

        const segments = splitShiftByMidnight(entryDt, exitDt);
        const fmt     = (d) => `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
        const fmtTime = (d) => `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
        return segments.map(seg => ({
            ...v,
            fecha:       fmt(seg.start),
            horaLlegada: fmtTime(seg.start),
            fechaSalida: fmt(seg.end),
            horaSalida:  fmtTime(seg.end)
        }));
    };

    // Pre-expandir visitas cortadas en medianoche
    const visitasExpandidas = [];
    visitas.forEach(v => splitVisitByMidnight(v).forEach(vs => visitasExpandidas.push(vs)));

    // ─────────────────────────────────────────────────────────────────────────────
    // UNA FILA POR SEGMENTO
    // ─────────────────────────────────────────────────────────────────────────────
    return expandedRegistros.map(seg => {
        const segStart = seg.segmentStart;
        const segEnd   = seg.segmentEnd;
        const segDate  = midnightOf(segStart);
        const userEmail = seg.email.toLowerCase().trim();

        // Visitas de este segmento: mismo usuario y horaLlegada dentro de la ventana
        const segVisitas = visitasExpandidas.filter(v => {
            const vUser = (v.usuario || v.email || '').toLowerCase().trim();
            if (vUser !== userEmail) return false;
            const vEntry = parseStringDate(v.fecha, v.horaLlegada);
            if (!vEntry) return false;
            return vEntry >= segStart && vEntry < segEnd;
        });

        // Ordenar cronológicamente
        segVisitas.sort((a, b) => {
            const toMins = (t) => { const p = (t||'0:0').split(':'); return parseInt(p[0],10)*60+parseInt(p[1]||0,10); };
            return toMins(a.horaLlegada) - toMins(b.horaLlegada);
        });

        // ── Intervalos tipificados (servicio / traslado) ──────────────────────────
        const timeIntervals = [];
        const validVisits = segVisitas
            .map(v => ({
                entry: parseStringDate(v.fecha, v.horaLlegada),
                exit:  parseStringDate(v.fechaSalida || v.fecha, v.horaSalida)
            }))
            .filter(v => v.entry && v.exit && v.exit > v.entry);

        if (validVisits.length === 0) {
            timeIntervals.push({ start: segStart, end: segEnd, type: 'servicio' });
        } else {
            let cursor = new Date(segStart);
            validVisits.forEach(v => {
                if (v.entry > cursor) timeIntervals.push({ start: new Date(cursor), end: v.entry, type: 'traslado' });
                timeIntervals.push({ start: v.entry, end: v.exit, type: 'servicio' });
                cursor = new Date(v.exit);
            });
            if (new Date(segEnd) > cursor) timeIntervals.push({ start: cursor, end: new Date(segEnd), type: 'traslado' });
        }

        // ── Motor de cálculo ──────────────────────────────────────────────────────
        let servicioMinsRaw = 0;
        let trasladoMinsRaw = 0;
        let segBuckets = { diurnas: 0, nocturnas: 0, domDiurnas: 0, domNocturnas: 0 };

        const noLunchConfig = { ...config, calc_rounding: false, calc_lunch: false };
        timeIntervals.forEach(interval => {
            const res = calculateLaborHours(interval.start, interval.end, noLunchConfig);
            if (res.error) return;
            const mins = res.raw.diurnas + res.raw.nocturnas + res.raw.domDiurnas + res.raw.domNocturnas;
            if (interval.type === 'servicio') servicioMinsRaw += mins;
            else trasladoMinsRaw += mins;
            segBuckets.diurnas      += res.raw.diurnas;
            segBuckets.nocturnas    += res.raw.nocturnas;
            segBuckets.domDiurnas   += res.raw.domDiurnas;
            segBuckets.domNocturnas += res.raw.domNocturnas;
        });

        // ── Almuerzo ──────────────────────────────────────────────────────────────
        const totalSinDescontarMins = servicioMinsRaw + trasladoMinsRaw;
        let appliedLunch = false;
        if (config.calc_lunch) {
            const totalRaw  = servicioMinsRaw + trasladoMinsRaw;
            const lunchMins = parseInt(config.calc_lunchMins, 10) || 60;
            let shouldDeduct = false;
            const isTargetSegment = seg.isLongestSegment ?? true;

            if (config.calc_lunchMode === 'individual') {
                shouldDeduct = seg.applyLunchInThisSegment;
            } else if (config.calc_lunchMode === 'empresa') {
                // Modo empresa: solo el admin puede marcar desde En Vivo. Sin marca → no descuenta.
                shouldDeduct = isTargetSegment && (seg.originalShift?.exit?.applyLunch === true || seg.originalShift?.entry?.applyLunch === true);
            } else {
                const dayNum2  = segDate.getDay() === 0 ? '7' : String(segDate.getDay());
                const dayConf2 = config.calc_dailyWorkdayConfig?.[dayNum2] || { hours: 8, mins: 0 };
                const thresholdMins2 = (dayConf2.hours * 60) + (dayConf2.mins || 0);
                if (seg.originalShift?.exit?.applyLunch === true || seg.originalShift?.entry?.applyLunch === true) {
                    shouldDeduct = isTargetSegment;
                } else if (seg.originalShift?.exit?.applyLunch === false || seg.originalShift?.entry?.applyLunch === false) {
                    shouldDeduct = false;
                } else {
                    // Solo aplicar si el día tiene jornada laboral configurada (> 0 horas).
                    // Gabela configurable por empresa (VITE_LUNCH_TOLERANCE_MINS en .env).
                    const LUNCH_TOLERANCE_MINS = parseInt(import.meta.env.VITE_LUNCH_TOLERANCE_MINS, 10) || 0;
                    shouldDeduct = isTargetSegment && thresholdMins2 > 0 &&
                        totalRaw >= (thresholdMins2 + lunchMins - LUNCH_TOLERANCE_MINS);
                }
            }
            if (shouldDeduct) {
                appliedLunch = true;
                let rem = lunchMins;
                const fromServicio = Math.min(servicioMinsRaw, rem);
                servicioMinsRaw -= fromServicio; rem -= fromServicio;
                if (rem > 0) trasladoMinsRaw = Math.max(0, trasladoMinsRaw - rem);
                let remB = lunchMins;
                for (const cat of ['diurnas', 'nocturnas', 'domDiurnas', 'domNocturnas']) {
                    if (remB <= 0) break;
                    const take = Math.min(segBuckets[cat], remB);
                    segBuckets[cat] -= take; remB -= take;
                }
            }
        }

        const totalEjecutadaMins = segBuckets.diurnas + segBuckets.nocturnas + segBuckets.domDiurnas + segBuckets.domNocturnas;
        const dayNum = segDate.getDay() === 0 ? '7' : String(segDate.getDay());
        const dayConfig = config.calc_dailyWorkdayConfig?.[dayNum] || { hours: 8, mins: 0 };
        const workdayThresholdMins = (dayConfig.hours * 60) + dayConfig.mins;

        return {
            email:   seg.email,
            nombre:  seg.nombre,
            fecha:   segStart.toLocaleDateString('es-CO'),
            dateObj: segDate,
            // Array de un elemento por compatibilidad con detailedReportExporter
            segmentos: [seg],
            visitas:   segVisitas,
            totalServicioHHMM: formatMinutesToHHMM(servicioMinsRaw),
            totalTrasladoHHMM: formatMinutesToHHMM(trasladoMinsRaw),
            buckets: {
                diurnas:      formatMinutesToHHMM(segBuckets.diurnas),
                nocturnas:    formatMinutesToHHMM(segBuckets.nocturnas),
                domDiurnas:   formatMinutesToHHMM(segBuckets.domDiurnas),
                domNocturnas: formatMinutesToHHMM(segBuckets.domNocturnas),
                totalHHMM:    formatMinutesToHHMM(totalEjecutadaMins)
            },
            rawBuckets: {
                diurnas:      segBuckets.diurnas,
                nocturnas:    segBuckets.nocturnas,
                domDiurnas:   segBuckets.domDiurnas,
                domNocturnas: segBuckets.domNocturnas,
                totalMins:    totalEjecutadaMins,
                servicioMins: servicioMinsRaw,
                trasladoMins: trasladoMinsRaw,
                lunchMins:    appliedLunch ? (parseInt(config.calc_lunchMins, 10) || 60) : 0,
                totalSinDescontarMins: totalSinDescontarMins
            },
            workdayThresholdHHMM: formatMinutesToHHMM(workdayThresholdMins),
            appliedLunch,
            visitasExcel: segVisitas
        };
    }).sort((a, b) => a.dateObj - b.dateObj || (a.nombre || '').localeCompare(b.nombre || ''));
};
