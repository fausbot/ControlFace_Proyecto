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
 * Retorna la fecha y hora actuales en Colombia, independiente
 * de la zona horaria del dispositivo o servidor.
 *
 * ✅ Usar esta función para capturar fecha/hora al guardar registros.
 *
 * @returns {{ fecha: string, hora: string, display: string }}
 *   - fecha:   "14/4/2026"      (formato DD/M/YYYY que usa Firestore)
 *   - hora:    "10:23:14"       (HH:MM:SS)
 *   - display: "14/4/2026, 10:23:14 a. m." (para la marca de agua)
 */
export const getColombiaDateTime = () => {
    const now = new Date();

    const fecha = now.toLocaleDateString(COLOMBIA_LOCALE, {
        timeZone: COLOMBIA_TZ,
        day:   'numeric',
        month: 'numeric',
        year:  'numeric'
    });

    const hora = now.toLocaleTimeString(COLOMBIA_LOCALE, {
        timeZone: COLOMBIA_TZ,
        hour:   '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });

    const display = now.toLocaleString(COLOMBIA_LOCALE, {
        timeZone: COLOMBIA_TZ
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
