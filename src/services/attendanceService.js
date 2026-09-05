// src/services/attendanceService.js
// Toda la lógica de Firestore relacionada con registros de asistencia.
// Admin.jsx (y cualquier otro componente) debe importar desde aquí.

import { db } from '../firebaseConfig';
import {
    collection,
    getDocs,
    deleteDoc,
    doc,
    writeBatch,
    onSnapshot,
    query,
    orderBy
} from 'firebase/firestore';
import { getMillisFromDateTime } from '../utils/timezone';

const COLLECTION = 'attendance';

// Helper robusto para obtener milisegundos de cualquier tipo de dato de tiempo
const getMillis = (ts) => {
    if (!ts) return 0;
    if (typeof ts.toMillis === 'function') return ts.toMillis();
    if (ts instanceof Date) return ts.getTime();
    if (typeof ts === 'number') return ts;
    if (typeof ts === 'string') return new Date(ts).getTime();
    return Date.now();
};

// getMillisFromDateTime → importada desde '../utils/timezone' (fuente única de verdad)
// Re-exportada aquí para compatibilidad con Informes.jsx y otros consumidores existentes
export { getMillisFromDateTime } from '../utils/timezone';


// ─────────────────────────────────────────────
// Escucha cambios en TIEMPO REAL de la colección attendance
// ─────────────────────────────────────────────
export const subscribeToAttendanceLogs = (callback) => {
    // Quitamos el orderBy de Firestore para evitar errores de índices y permitir registros offline/viejos
    const q = query(collection(db, COLLECTION));

    return onSnapshot(q, (snapshot) => {
        const allData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

        // Ordenamos por fecha/hora DESC (más reciente primero)
        allData.sort((a, b) => {
            // 1. Usar fecha + hora como fuente principal de verdad
            let timeA = getMillisFromDateTime(a.fecha, a.hora);
            let timeB = getMillisFromDateTime(b.fecha, b.hora);

            // Fallback inmediato al timestamp nativo de Firestore si falla el parseo
            if (timeA === 0) timeA = getMillis(a.timestamp);
            if (timeB === 0) timeB = getMillis(b.timestamp);

            if (timeA !== timeB) return timeB - timeA;
            return 0;
        });

        callback(allData);
    }, (error) => {
        console.error("Error en suscripción de asistencia:", error);
    });
};

// ─────────────────────────────────────────────
// Convierte "6/2/2026" → objeto Date
// ─────────────────────────────────────────────
export const parseSpanishDate = (dateStr) => {
    if (!dateStr) return null;
    if (dateStr instanceof Date) return dateStr;
    if (typeof dateStr.toDate === 'function') return dateStr.toDate();
    
    const str = String(dateStr).trim();
    
    // Probar formato ISO YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
        const parts = str.split('T')[0].split('-');
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);
        const d = new Date(year, month, day);
        return isNaN(d.getTime()) ? null : d;
    }
    
    // Probar formato DD/MM/YYYY o DD-MM-YYYY
    const parts = str.split(/[\/-]/);
    if (parts.length === 3) {
        let day, month, year;
        if (parts[0].length === 4) {
            // YYYY/MM/DD
            year = parseInt(parts[0], 10);
            month = parseInt(parts[1], 10) - 1;
            day = parseInt(parts[2], 10);
        } else {
            // DD/MM/YYYY o DD-MM-YYYY
            day = parseInt(parts[0], 10);
            month = parseInt(parts[1], 10) - 1;
            year = parseInt(parts[2], 10);
        }
        
        const d = new Date(year, month, day);
        return isNaN(d.getTime()) ? null : d;
    }
    
    // Fallback final
    const parsed = new Date(str);
    return isNaN(parsed.getTime()) ? null : parsed;
};

// ─────────────────────────────────────────────
// Trae TODOS los registros de asistencia,
// los ordena en cliente (timestamp > fecha/hora string)
// y devuelve el array completo ya ordenado.
// ─────────────────────────────────────────────
export const getAllAttendanceLogs = async () => {
    const snapshot = await getDocs(collection(db, COLLECTION));

    const allData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

    // Ordenar por fecha/hora DESC (más reciente primero)
    allData.sort((a, b) => {
        // 1. Usar fecha + hora como fuente principal de verdad
        let timeA = getMillisFromDateTime(a.fecha, a.hora);
        let timeB = getMillisFromDateTime(b.fecha, b.hora);

        // Fallback inmediato al timestamp nativo de Firestore si falla el parseo
        if (timeA === 0) timeA = getMillis(a.timestamp);
        if (timeB === 0) timeB = getMillis(b.timestamp);

        if (timeA !== timeB) return timeB - timeA;
        return 0;
    });

    return allData;
};

// ─────────────────────────────────────────────
// Pagina un array ya ordenado en cliente.
// Devuelve { data, hasMore }
// ─────────────────────────────────────────────
export const paginateLogs = (allLogs, pageNumber, pageSize = 100) => {
    const startIndex = (pageNumber - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return {
        data: allLogs.slice(startIndex, endIndex),
        hasMore: endIndex < allLogs.length
    };
};

// ─────────────────────────────────────────────
// Elimina un único registro de asistencia
// ─────────────────────────────────────────────
export const deleteAttendanceLog = async (id) => {
    await deleteDoc(doc(db, COLLECTION, id));
};

// ─────────────────────────────────────────────
// Elimina en lote todos los registros dentro
// del rango [startDate, endDate] (strings YYYY-MM-DD)
// Devuelve la cantidad de registros borrados.
// ─────────────────────────────────────────────
export const bulkDeleteByDateRange = async (startDate, endDate) => {
    const snapshot = await getDocs(collection(db, COLLECTION));

    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const toDelete = snapshot.docs.filter(d => {
        const data = d.data();
        let logDate = null;

        if (data.timestamp) {
            logDate = data.timestamp.toDate();
        } else if (data.fecha) {
            logDate = parseSpanishDate(data.fecha);
        }

        if (!logDate) return false;
        return logDate >= start && logDate <= end;
    });

    if (toDelete.length === 0) return 0;

    const batch = writeBatch(db);
    toDelete.forEach(docSnap => batch.delete(docSnap.ref));
    await batch.commit();

    return toDelete.length;
};

// ─────────────────────────────────────────────
// Filtra un array de logs por rango de fechas
// (útil para el export CSV sin ir a Firestore otra vez)
// ─────────────────────────────────────────────
export const filterLogsByDateRange = (logs, startDate, endDate) => {
    const parseISOToLocal = (isoStr) => {
        if (!isoStr) return null;
        const [y, m, d] = isoStr.split('-').map(Number);
        return new Date(y, m - 1, d);
    };

    const start = startDate ? parseISOToLocal(startDate) : null;
    const end = endDate ? parseISOToLocal(endDate) : null;

    return logs.filter(log => {
        const logDate = parseSpanishDate(log.fecha);
        if (!logDate) return false;

        if (start && logDate < start) return false;
        if (end && logDate > end) return false;
        return true;
    });
};

// ─────────────────────────────────────────────
// Elimina en lote todos los registros de INCIDENTES dentro
// del rango [startDate, endDate] (strings YYYY-MM-DD)
// Devuelve la cantidad de registros borrados.
// ─────────────────────────────────────────────
export const bulkDeleteIncidentsByDateRange = async (startDate, endDate) => {
    const snapshot = await getDocs(collection(db, 'incidents'));

    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const toDelete = snapshot.docs.filter(d => {
        const data = d.data();
        let logDate = null;

        if (data.timestamp) {
            logDate = data.timestamp.toDate();
        } else if (data.fecha) {
            logDate = parseSpanishDate(data.fecha);
        }

        if (!logDate) return false;
        return logDate >= start && logDate <= end;
    });

    if (toDelete.length === 0) return 0;

    const batch = writeBatch(db);
    toDelete.forEach(docSnap => batch.delete(docSnap.ref));
    await batch.commit();

    return toDelete.length;
};

// ─────────────────────────────────────────────
// Trae TODOS los registros de VISITAS,
// ordenados por fecha/hora DESC.
// ─────────────────────────────────────────────
export const getAllVisitLogs = async () => {
    const snapshot = await getDocs(collection(db, 'visitas'));
    const allData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

    allData.sort((a, b) => {
        const timeA = getMillisFromDateTime(a.fecha, a.hora);
        const timeB = getMillisFromDateTime(b.fecha, b.hora);
        if (timeA !== timeB) return timeB - timeA;
        return 0;
    });

    return allData;
};

// ─────────────────────────────────────────────
// Elimina en lote todos los registros de VISITAS dentro
// del rango [startDate, endDate] (strings YYYY-MM-DD)
// Devuelve la cantidad de registros borrados.
// ─────────────────────────────────────────────
export const bulkDeleteVisitasByDateRange = async (startDate, endDate) => {
    const snapshot = await getDocs(collection(db, 'visitas'));

    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const toDelete = snapshot.docs.filter(d => {
        const data = d.data();
        let logDate = null;

        if (data.timestamp) {
            logDate = data.timestamp.toDate();
        } else if (data.fecha) {
            logDate = parseSpanishDate(data.fecha);
        }

        if (!logDate) return false;
        return logDate >= start && logDate <= end;
    });

    if (toDelete.length === 0) return 0;

    const batch = writeBatch(db);
    toDelete.forEach(docSnap => batch.delete(docSnap.ref));
    await batch.commit();

    return toDelete.length;
};
