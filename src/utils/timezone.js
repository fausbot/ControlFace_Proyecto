// src/utils/timezone.js
// ─────────────────────────────────────────────────────────────────────────────
// MÓDULO CENTRALIZADO DE ZONA HORARIA — Colombia (America/Bogota, UTC-5)
//
// PROBLEMA RESUELTO:
//   El sistema consultaba APIs de tiempo en UTC y usaba toLocaleString() sin
//   especificar timezone. Si el dispositivo NO tiene zona horaria configurada
//   como Colombia, la hora se mostraba 5 horas adelantada (en UTC).
//
// SOLUCIÓN:
//   Toda conversión de fecha/hora en el sistema DEBE pasar por esta utilidad,
//   que siempre fuerza la zona horaria 'America/Bogota' explícitamente.
// ─────────────────────────────────────────────────────────────────────────────

export const COLOMBIA_TZ     = 'America/Bogota';
export const COLOMBIA_LOCALE = 'es-CO';

/**
 * Resuelve la zona horaria a partir de coordenadas GPS de forma 100% offline.
 * Prioriza Colombia por defecto si las coordenadas corresponden a territorio colombiano,
 * y mapea España/Europa u otras regiones conocidas.
 *
 * @param {number} lat
 * @param {number} lng
 * @returns {string} IANA TimeZone identifier (ej: 'America/Bogota', 'Europe/Madrid')
 */
export const getTimeZoneFromCoords = (lat, lng) => {
    if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) {
        return COLOMBIA_TZ;
    }
    if (lat === 0 && lng === 0) {
        return COLOMBIA_TZ;
    }

    // 🇨🇴 COLOMBIA: Lat -4.5 a 13.5, Lon -79.5 a -66.5
    if (lat >= -4.5 && lat <= 13.5 && lng >= -79.5 && lng <= -66.5) {
        return COLOMBIA_TZ;
    }

    // 🇪🇸 ESPAÑA (Canarias): Lat 27.0 a 29.5, Lon -18.5 a -13.0
    if (lat >= 27.0 && lat <= 29.5 && lng >= -18.5 && lng <= -13.0) {
        return 'Atlantic/Canary';
    }

    // 🇪🇸 ESPAÑA (Península, Baleares, Ceuta, Melilla): Lat 35.0 a 44.5, Lon -10.0 a 5.0
    if (lat >= 35.0 && lat <= 44.5 && lng >= -10.0 && lng <= 5.0) {
        return 'Europe/Madrid';
    }

    // 🇲🇽 MÉXICO: Lat 14.0 a 33.0, Lon -118.0 a -86.0
    if (lat >= 14.0 && lat <= 33.0 && lng >= -118.0 && lng <= -86.0) {
        return 'America/Mexico_City';
    }

    // 🇺🇸 EE.UU. (Este / Miami / NY): Lat 24.0 a 46.0, Lon -85.0 a -67.0
    if (lat >= 24.0 && lat <= 46.0 && lng >= -85.0 && lng <= -67.0) {
        return 'America/New_York';
    }

    // Si está fuera de Colombia y de las cajas anteriores, verificar si el dispositivo
    // tiene una zona horaria coherente de IANA
    try {
        const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (deviceTz && deviceTz !== 'UTC' && deviceTz !== COLOMBIA_TZ) {
            return deviceTz;
        }
    } catch {
        // Fallback seguro
    }

    return COLOMBIA_TZ;
};

/**
 * Retorna la fecha y hora actuales en la zona horaria indicada (por defecto Colombia),
 * independiente de la zona horaria del dispositivo o servidor.
 *
 * @param {Date|string|number} dateInput
 * @param {string} targetTz - Zona IANA (ej. 'America/Bogota', 'Europe/Madrid')
 * @param {string} targetLocale - Locale (ej. 'es-CO', 'es-ES')
 * @returns {{ fecha: string, hora: string, display: string }}
 *   - fecha:   "14/4/2026"      (formato DD/M/YYYY que usa Firestore)
 *   - hora:    "10:23:14"       (HH:MM:SS)
 *   - display: "14/4/2026, 10:23:14 a. m." (para la marca de agua)
 */
export const getColombiaDateTime = (dateInput = new Date(), targetTz = COLOMBIA_TZ, targetLocale = COLOMBIA_LOCALE) => {
    const now = dateInput instanceof Date ? dateInput : new Date(dateInput);
    const tz = targetTz || COLOMBIA_TZ;
    const locale = targetLocale || COLOMBIA_LOCALE;

    const fecha = now.toLocaleDateString(locale, {
        timeZone: tz,
        day:   'numeric',
        month: 'numeric',
        year:  'numeric'
    });

    const hora = now.toLocaleTimeString(locale, {
        timeZone: tz,
        hour:   '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });

    const display = now.toLocaleString(locale, {
        timeZone: tz
    });

    return { fecha, hora, display };
};

/**
 * Convierte cualquier fecha/string/timestamp a la representación
 * de Colombia para mostrársela al usuario.
 *
 * ✅ Usar esta función para display de timestamps guardados.
 *
 * @param {Date|string|number} dateInput
 * @returns {string}  Ej: "14/4/2026, 10:23:14 a. m."
 */
export const toColombiaDisplay = (dateInput) => {
    try {
        return new Date(dateInput).toLocaleString(COLOMBIA_LOCALE, {
            timeZone: COLOMBIA_TZ
        });
    } catch {
        return String(dateInput);
    }
};

/**
 * Convierte cualquier fecha y hora (12h o 24h) a milisegundos seguros.
 * Soporta 'a. m.', 'p. m.', 'AM', 'PM', formatos militares y separadores / o -.
 */
export const getMillisFromDateTime = (fecha, hora) => {
    if (!fecha) return 0;
    try {
        const fechaStr = String(fecha).trim();
        const separator = fechaStr.includes('/') ? '/' : '-';
        const parts = fechaStr.split(separator);
        if (parts.length !== 3) return 0;

        let d, m, y;
        if (parts[0].length === 4) {
            [y, m, d] = parts;
        } else {
            [d, m, y] = parts;
        }

        const yNum = parseInt(y, 10);
        const mNum = parseInt(m, 10) - 1;
        const dNum = parseInt(d, 10);

        if (isNaN(yNum) || isNaN(mNum) || isNaN(dNum)) return 0;

        if (!hora) {
            const dateObj = new Date(yNum, mNum, dNum, 0, 0, 0);
            return isNaN(dateObj.getTime()) ? 0 : dateObj.getTime();
        }

        const horaStr = String(hora).trim();
        const isPM = /p\.?\s*m\.?|pm/i.test(horaStr);
        const isAM = /a\.?\s*m\.?|am/i.test(horaStr);

        const cleanHora = horaStr.replace(/[^0-9:]/g, '');
        const timeParts = cleanHora.split(':');
        if (timeParts.length < 2) return 0;

        let h = parseInt(timeParts[0], 10);
        const min = parseInt(timeParts[1], 10);
        const s = parseInt(timeParts[2] || '0', 10);

        if (isNaN(h) || isNaN(min)) return 0;

        if (isPM && h < 12) {
            h += 12;
        } else if (isAM && h === 12) {
            h = 0;
        }

        const dateObj = new Date(yNum, mNum, dNum, h, min, isNaN(s) ? 0 : s);
        const millis = dateObj.getTime();

        return isNaN(millis) ? 0 : millis;
    } catch {
        return 0;
    }
};

