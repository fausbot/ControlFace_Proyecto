import { isSundayOrHoliday } from './colombiaHolidays';

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
 * Formatea un número de minutos a String HH:MM
 */
const formatMinutesToHHMM = (totalMins) => {
    const hh = Math.floor(totalMins / 60).toString().padStart(2, '0');
    const mm = Math.floor(totalMins % 60).toString().padStart(2, '0');
    return `${hh}h ${mm}m`;
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
        const d = new Date(currentMs);
        const isDomFest = isSundayOrHoliday(d);
        const hour = d.getHours();

        // Diurno en Colombia: 6 AM (inclusive) a 7 PM (exclusivo -> hasta las 18:59:59)
        const isDiurnal = hour >= 6 && hour < 19;

        if (isDomFest) {
            if (isDiurnal) buckets.domDiurnas += 1;
            else buckets.domNocturnas += 1;
        } else {
            if (isDiurnal) buckets.diurnas += 1;
            else buckets.nocturnas += 1;
        }

        // Avanzar 1 minuto
        currentMs += 60000;
    }

    // Total en minutos para validar el almuerzo
    const totalMinutes = buckets.diurnas + buckets.nocturnas + buckets.domDiurnas + buckets.domNocturnas;

    // 3. Descuento de Almuerzo (Sólo para turnos mayores a 8 horas -> >480 min)
    if (config.calc_lunch && config.calc_lunchMins && totalMinutes > 480) {
        let lunchToDeduct = parseInt(config.calc_lunchMins, 10) || 60;

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
        error: null
    };
};
