import { openDB } from 'idb';

const DB_NAME = 'ControlAsistencia_OfflineDB';
const STORE_NAME = 'pendingAttendance';
const DB_VERSION = 1;

/**
 * Inicializa la base de datos IndexedDB
 */
export const initDB = async () => {
    return openDB(DB_NAME, DB_VERSION, {
        upgrade(db) {
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
            }
        },
    });
};

/**
 * Guarda un registro de asistencia localmente
 * @param {Object} data Objeto con imagen, metadatos y configuración de guardado
 */
export const saveOfflineRecord = async (data) => {
    const db = await initDB();
    const id = await db.add(STORE_NAME, {
        ...data,
        capturedAt: new Date().toISOString(),
        status: 'pending'
    });
    console.log(`📦 Registro guardado offline con ID: ${id}`);
    return id;
};

/**
 * Obtiene todos los registros pendientes de sincronización
 */
export const getPendingRecords = async () => {
    const db = await initDB();
    return await db.getAll(STORE_NAME);
};

/**
 * Borra un registro de la base de datos local (después de sincronizar con éxito)
 * @param {number} id ID del registro en IndexedDB
 */
export const deleteOfflineRecord = async (id) => {
    const db = await initDB();
    await db.delete(STORE_NAME, id);
    console.log(`🗑️ Registro offline ${id} eliminado tras sincronización.`);
};

/**
 * Cuenta cuántos registros hay pendientes
 */
export const getPendingCount = async () => {
    const db = await initDB();
    const count = await db.count(STORE_NAME);
    return count;
};

/**
 * Actualiza las coordenadas GPS de un registro pendiente (modo latencia/bolsillo)
 * @param {number} id ID del registro en IndexedDB
 * @param {number} latitude Nueva latitud
 * @param {number} longitude Nueva longitud
 */
export const updateOfflineRecordGPS = async (id, latitude, longitude) => {
    try {
        const db = await initDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const record = await store.get(id);
        
        if (record) {
            record.latitude = latitude;
            record.longitude = longitude;
            if (record.metadata) {
                record.metadata.latitud = latitude;
                record.metadata.longitud = longitude;
            }
            await store.put(record);
            console.log(`📍 Registro offline ${id} actualizado con nuevas coordenadas: ${latitude}, ${longitude}`);
        }
        await tx.done;
    } catch (error) {
        console.error(`Error actualizando coordenadas para registro ${id}:`, error);
    }
};
