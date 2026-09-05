// Módulo de Liquidación de Horas y Recargos según Legislación Colombiana
// Ley 2101 / Ley 1846: Jornada Diurna (06:00 a 19:00), Jornada Nocturna (19:00 a 06:00)
import { isSundayOrHoliday } from './holidays.js';

export function calculateGuardPayroll(guard, shiftsMap, year, month) {
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    let totalWorkedHours = 0;
    let totalRestDays = 0;
    let ordinarias = 0;
    let hed = 0; // Hora Extra Diurna
    let hen = 0; // Hora Extra Nocturna
    let rn = 0;  // Recargo Nocturno (19:00 - 06:00 en días ordinarios)
    let rdfd = 0; // Recargo Dominical/Festivo Diurno (06:00 - 19:00)
    let rdfn = 0; // Recargo Dominical/Festivo Nocturno (19:00 - 06:00)
    let noveltiesCount = 0;

    let currentWeekHours = 0;

    for (let day = 1; day <= daysInMonth; day++) {
        const dateObj = new Date(year, month, day);
        const dayStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const dayOfWeek = dateObj.getDay(); // 0 es Domingo
        const isSunOrHol = isSundayOrHoliday(dateObj, dayStr);

        // Objeto para el día siguiente (para evaluar el tramo 00:00 a 06:00 del turno noche al cruzar medianoche)
        const nextDateObj = new Date(year, month, day + 1);
        const nextDayStr = `${nextDateObj.getFullYear()}-${String(nextDateObj.getMonth() + 1).padStart(2, '0')}-${String(nextDateObj.getDate()).padStart(2, '0')}`;
        const isNextSunOrHol = isSundayOrHoliday(nextDateObj, nextDayStr);

        const shiftCode = shiftsMap[dayStr] || 'X';

        if (shiftCode === 'X') {
            totalRestDays++;
        } else if (['D', 'N', 'D-REL', 'N-REL'].includes(shiftCode)) {
            const isNight = shiftCode.includes('N');
            const shiftHours = 12;
            totalWorkedHours += shiftHours;
            currentWeekHours += shiftHours;

            if (isNight) {
                // Turno Noche 18:00 a 06:00 (12 Horas):
                // 1) 18:00 a 19:00 (1h Diurna en el día de inicio)
                if (isSunOrHol) {
                    rdfd += 1;
                }

                // 2) 19:00 a 24:00 (5h Nocturnas en el día de inicio)
                if (isSunOrHol) {
                    rdfn += 5;
                } else {
                    rn += 5;
                }

                // 3) 00:00 a 06:00 (6h Nocturnas en el día siguiente al cruzar medianoche)
                if (isNextSunOrHol) {
                    rdfn += 6;
                } else {
                    rn += 6;
                }

                // Horas extras según límite semanal legal (42h)
                if (currentWeekHours > 42) {
                    const extraInShift = Math.min(shiftHours, currentWeekHours - 42);
                    hen += extraInShift;
                } else {
                    ordinarias += shiftHours;
                }
            } else {
                // Turno Día 06:00 a 18:00 (12 Horas 100% Diurnas):
                if (isSunOrHol) {
                    rdfd += shiftHours;
                }

                if (currentWeekHours > 42) {
                    const extraInShift = Math.min(shiftHours, currentWeekHours - 42);
                    hed += extraInShift;
                } else {
                    ordinarias += shiftHours;
                }
            }
        } else {
            // Novedad (INC, VAC, PRM, etc.)
            noveltiesCount++;
        }

        // Reinicio del acumulador semanal los domingos al finalizar la jornada
        if (dayOfWeek === 0) {
            currentWeekHours = 0;
        }
    }

    return {
        totalWorkedHours,
        totalRestDays,
        ordinarias,
        hed,
        hen,
        rn,
        rdfd,
        rdfn,
        noveltiesCount
    };
}
