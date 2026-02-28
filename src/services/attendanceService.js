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

const COLLECTION = 'attendance';

// ─────────────────────────────────────────────
// Escucha cambios en TIEMPO REAL de la colección attendance
// ─────────────────────────────────────────────
export const subscribeToAttendanceLogs = (callback) => {
    const q = query(collection(db, COLLECTION), orderBy('timestamp', 'desc'));

    return onSnapshot(q, (snapshot) => {
        const allData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

        // Nota: Seguimos ordenando en cliente para aquellos registros 
        // que no tienen timestamp (ej: algunos manuales antiguos)
        allData.sort((a, b) => {
            if (a.timestamp && b.timestamp) {
                return b.timestamp.toMillis() - a.timestamp.toMillis();
            }
            if (a.timestamp) return -1;
            if (b.timestamp) return 1;

            const dateTimeA = (a.fecha || '') + ' ' + (a.hora || '');
            const dateTimeB = (b.fecha || '') + ' ' + (b.hora || '');
            return dateTimeB.localeCompare(dateTimeA);
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
    const parts = dateStr.split('/');
    if (parts.length !== 3) return null;
    const day = parseInt(parts[0]);
    const month = parseInt(parts[1]) - 1; // JS: meses 0-indexed
    const year = parseInt(parts[2]);
    return new Date(year, month, day);
};

// ─────────────────────────────────────────────
// Trae TODOS los registros de asistencia,
// los ordena en cliente (timestamp > fecha/hora string)
// y devuelve el array completo ya ordenado.
// ─────────────────────────────────────────────
export const getAllAttendanceLogs = async () => {
    const snapshot = await getDocs(collection(db, COLLECTION));

    const allData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

    allData.sort((a, b) => {
        if (a.timestamp && b.timestamp) {
            return b.timestamp.toMillis() - a.timestamp.toMillis();
        }
        if (a.timestamp) return -1;
        if (b.timestamp) return 1;

        const dateTimeA = (a.fecha || '') + ' ' + (a.hora || '');
        const dateTimeB = (b.fecha || '') + ' ' + (b.hora || '');
        return dateTimeB.localeCompare(dateTimeA);
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
    return logs.filter(log => {
        const logDate = parseSpanishDate(log.fecha);
        if (!logDate) return false;

        const start = startDate ? new Date(startDate) : null;
        const end = endDate ? new Date(endDate) : null;

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
