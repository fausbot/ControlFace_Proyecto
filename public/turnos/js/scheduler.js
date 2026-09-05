// Módulo Motor de Programación de Turnos y Generación de Rotaciones
import { SHIFT_TYPES } from './data.js';

export function generateRotationSchedule(guard, year, month) {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const schedule = {};

    // Si el vigilante es COMODÍN / RELIEVISTA, su rotación base es 100% Descanso (X).
    // Únicamente realiza turnos D-REL / N-REL asignados automáticamente por novedades o reemplazos.
    if (guard.type === 'RELIEVISTA' || guard.rotationPattern === 'COMODIN' || guard.contractId === 'RELIEVISTA') {
        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            schedule[dateStr] = 'X';
        }
        return schedule;
    }

    const pattern = guard.rotationPattern || '2D-2N-2X';
    const offset = guard.rotationOffset || 0;

    let sequence = [];
    if (pattern === 'FIJO_DIA_6X1' || pattern === 'SOLO_DIA_12H') {
        // Rotación Legal 5D-2X (Lunes a Viernes: 12h = 60h máx legal | Sábado y Domingo: Descanso X)
        for (let day = 1; day <= daysInMonth; day++) {
            const dateObj = new Date(year, month, day);
            const dayOfWeek = dateObj.getDay(); // 0 = Domingo, 6 = Sábado
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            schedule[dateStr] = (dayOfWeek === 0 || dayOfWeek === 6) ? 'X' : 'D';
        }
        return schedule;
    } else if (pattern === 'FIJO_NOCHE_6X1' || pattern === 'SOLO_NOCHE_12H') {
        // Rotación Legal 5N-2X (Lunes a Viernes: 12h = 60h máx legal | Sábado y Domingo: Descanso X)
        for (let day = 1; day <= daysInMonth; day++) {
            const dateObj = new Date(year, month, day);
            const dayOfWeek = dateObj.getDay();
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            schedule[dateStr] = (dayOfWeek === 0 || dayOfWeek === 6) ? 'X' : 'N';
        }
        return schedule;
    } else if (pattern === '4D-4N-2X') {
        // 4 Días Día, 4 Días Noche, 2 Descansos (Total 10 días por ciclo)
        sequence = ['D', 'D', 'D', 'D', 'N', 'N', 'N', 'N', 'X', 'X'];
    } else if (pattern === '2D-2N-2X') {
        // 2 Días Día, 2 Días Noche, 2 Descansos (Total 6 días por ciclo)
        sequence = ['D', 'D', 'N', 'N', 'X', 'X'];
    } else {
        // Comodines no se autogeneran fijos, quedan libres (X) hasta asignación manual o automática por novedad
        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            schedule[dateStr] = 'X';
        }
        return schedule;
    }

    const seqLen = sequence.length;

    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const dayIndex = (day - 1 + offset) % seqLen;
        schedule[dateStr] = sequence[dayIndex];
    }

    return schedule;
}

/**
 * Motor de Sugerencia Automática de Vigilantes Relievistas (Comodines)
 */
export function findBestReliefCandidates(targetDate, targetShiftType, allGuards, masterSchedule) {
    const isTargetNight = targetShiftType.includes('N');
    const reliefGuards = allGuards.filter(g => g.type === 'RELIEVISTA');

    const [y, m, d] = targetDate.split('-').map(Number);
    const prevDateObj = new Date(y, m - 1, d - 1);
    const prevDateStr = `${prevDateObj.getFullYear()}-${String(prevDateObj.getMonth() + 1).padStart(2, '0')}-${String(prevDateObj.getDate()).padStart(2, '0')}`;

    const candidates = [];

    for (const guard of reliefGuards) {
        const guardSchedule = masterSchedule[guard.id] || {};
        const currentShiftOnDate = guardSchedule[targetDate] || 'X';

        if (currentShiftOnDate !== 'X') {
            continue; // Ya está ocupado
        }

        const prevShift = guardSchedule[prevDateStr] || 'X';
        if (prevShift.includes('N') && !isTargetNight) {
            continue; // Violaría la regla de 48h de descanso post-noche
        }

        let weeklyHours = 0;
        const dateObj = new Date(y, m - 1, d);
        const dayOfWeek = dateObj.getDay() === 0 ? 7 : dateObj.getDay();
        
        for (let i = 1; i <= 7; i++) {
            const tempDate = new Date(y, m - 1, d - dayOfWeek + i);
            const tempStr = `${tempDate.getFullYear()}-${String(tempDate.getMonth() + 1).padStart(2, '0')}-${String(tempDate.getDate()).padStart(2, '0')}`;
            const s = guardSchedule[tempStr] || 'X';
            if (['D', 'N', 'D-REL', 'N-REL'].includes(s)) {
                weeklyHours += 12;
            }
        }

        candidates.push({
            guard,
            weeklyHours,
            status: weeklyHours >= 60 ? 'ALERTA_HORAS' : 'ÓPTIMO',
            reason: weeklyHours >= 60 ? 'Cerca del límite legal semanal (60h)' : 'Disponible y descansado'
        });
    }

    candidates.sort((a, b) => a.weeklyHours - b.weeklyHours);
    return candidates;
}
