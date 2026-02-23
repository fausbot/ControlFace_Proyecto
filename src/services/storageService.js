// src/services/storageService.js
// Maneja subida y descarga de fotos en Firebase Storage.
// • Las fotos se comprimen antes de subir (Canvas, configurable vía .env)
// • Los metadatos se guardan en Firestore colección 'fotos' (Modo Rápido / Sin CORS)
// • Búsqueda Híbrida: Busca en Firestore y hace fallback a listAll() para fotos antiguas.
// • Descarga vía getBlob() del SDK (sin CORS) para máxima compatibilidad.

import { storage, db } from '../firebaseConfig';
import {
    ref,
    uploadBytes,
    getDownloadURL,
    getBlob,
    getBytes,
    listAll,
    deleteObject,
} from 'firebase/storage';
import {
    collection,
    addDoc,
    getDocs,
    query,
    where,
    serverTimestamp,
    Timestamp,
    deleteDoc,
    doc
} from 'firebase/firestore';
import JSZip from 'jszip';

// ─── Configuración (ajustable desde .env) ────────────────────────────────────
const MAX_PHOTO_WIDTH = parseInt(import.meta.env.VITE_PHOTO_MAX_WIDTH || '800');
const PHOTO_QUALITY = parseFloat(import.meta.env.VITE_PHOTO_QUALITY || '0.75');

// ─── Helpers ──────────────────────────────────────────────────────────────────
const sanitizeEmail = (email) =>
    (email || 'sin-email').replace('@', '_').replace(/\./g, '-');

const buildPath = (tipo, year, month, email, fecha, hora) => {
    // Normalizar carpeta: Entrada/Salida/asistencia van a 'asistencia'
    const isAsistencia = tipo === 'asistencia' || tipo === 'Entrada' || tipo === 'Salida';
    const folder = isAsistencia ? 'asistencia' : 'incidentes';

    const safeEmail = sanitizeEmail(email);
    const safeDate = (fecha || '').replace(/\//g, '-');
    const safeTime = (hora || '').replace(/:/g, '-').substring(0, 5);
    return `${folder}/${year}/${month}/${tipo}_${safeEmail}_${safeDate}_${safeTime}.jpg`;
};

// ─── Compresión Canvas ────────────────────────────────────────────────────────
export const compressImage = (imageDataUrl) =>
    new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            let { width, height } = img;
            if (width > MAX_PHOTO_WIDTH) {
                height = Math.round((height * MAX_PHOTO_WIDTH) / width);
                width = MAX_PHOTO_WIDTH;
            }
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            canvas.getContext('2d').drawImage(img, 0, 0, width, height);
            canvas.toBlob(
                (blob) => blob ? resolve(blob) : reject(new Error('Compresión fallida')),
                'image/jpeg',
                PHOTO_QUALITY,
            );
        };
        img.onerror = reject;
        img.src = imageDataUrl;
    });

// ─── Subir foto + guardar metadatos en Firestore ──────────────────────────────
export const uploadPhoto = async (imageDataUrl, tipo, email, fecha, hora) => {
    try {
        const now = new Date();
        const year = String(now.getFullYear());
        const month = String(now.getMonth() + 1).padStart(2, '0');

        const blob = await compressImage(imageDataUrl);
        const storagePath = buildPath(tipo, year, month, email, fecha, hora);
        const storageRef = ref(storage, storagePath);

        const metadata = {
            contentType: 'image/jpeg',
            customMetadata: { tipo, email, fecha, hora, year, month },
        };

        await uploadBytes(storageRef, blob, metadata);
        const url = await getDownloadURL(storageRef);
        console.log("Storage upload OK");

        // Guardar metadatos en Firestore
        const isAsistencia = tipo === 'asistencia' || tipo === 'Entrada' || tipo === 'Salida';
        const carpeta = isAsistencia ? 'asistencia' : 'incidentes';

        try {
            const docRef = await addDoc(collection(db, 'fotos'), {
                tipo: isAsistencia ? 'asistencia' : 'incidente',
                tipoOriginal: tipo,
                email, fecha, hora, year, month, carpeta,
                path: storagePath,
                url,
                timestamp: serverTimestamp(),
            });
            console.log("Firestore metadata OK:", docRef.id);
        } catch (firestoreErr) {
            console.error("Error registrando en Firestore:", firestoreErr);
        }

        console.log(`✅ Foto subida: ${storagePath} (${Math.round(blob.size / 1024)} KB)`);
        return url;
    } catch (err) {
        alert("❌ Error subiendo foto a Storage: " + err.message);
        throw err;
    }
};

// ─── Listar fotos por filtro (Modo Híbrido: Firestore + Storage) ──────────────
/**
 * Busca fotos en el registro de Firestore y también intenta listAll() en Storage
 * para encontrar fotos antiguas que no tengan registro en la base de datos.
 */
export const listPhotosByFilter = async ({ tipo, desde, hasta, filtroUsuario }) => {
    try {
        console.log(`🔍 Buscando fotos: ${tipo} (${desde.toLocaleDateString()} al ${hasta.toLocaleDateString()})`);
        const resultsMap = new Map();
        let firestoreCount = 0;
        let storageCount = 0;

        // 1. Búsqueda en Firestore (Motor Principal)
        try {
            const q = query(
                collection(db, 'fotos'),
                where('timestamp', '>=', Timestamp.fromDate(desde)),
                where('timestamp', '<=', Timestamp.fromDate(hasta))
            );

            const snap = await getDocs(q);
            for (const docSnap of snap.docs) {
                const data = docSnap.data();
                const emailLow = (data.email || '').toLowerCase();
                const filtroNorm = (filtroUsuario || '').trim().toLowerCase();

                if (filtroNorm) {
                    if (filtroNorm.startsWith('@')) {
                        if (!emailLow.endsWith(filtroNorm)) continue;
                    } else if (emailLow !== filtroNorm) continue;
                }

                if (tipo !== 'ambos') {
                    // Si el usuario pide solo asistencia y la foto es un incidente (o viceversa), saltarla.
                    // NOTA: en uploadPhoto se guarda doc.tipo como 'asistencia' o 'incidente'.
                    if (data.tipo !== tipo && data.carpeta !== tipo) continue;
                }

                if (!resultsMap.has(data.path)) {
                    const sRef = ref(storage, data.path);
                    let directUrl = data.url || null;
                    if (!directUrl) {
                        try { directUrl = await getDownloadURL(sRef); } catch (e) { /* ignore */ }
                    }

                    resultsMap.set(data.path, {
                        id: docSnap.id,
                        name: data.fileName || data.path.split('/').pop(),
                        path: data.path,
                        ref: sRef,
                        url: directUrl,
                        date: data.timestamp?.toDate() || new Date(),
                        source: 'firestore'
                    });
                    firestoreCount++;
                }
            }
        } catch (err) {
            console.warn("⚠️ Firestore restricted, using storage fallback", err.message);
        }

        // 2. Búsqueda en Storage (Fallback para fotos antiguas)
        const foldersToSearch = [];
        const startMonth = new Date(desde.getFullYear(), desde.getMonth(), 1);
        const endMonth = new Date(hasta.getFullYear(), hasta.getMonth(), 1);
        let currentMonth = new Date(startMonth);

        while (currentMonth <= endMonth) {
            const year = String(currentMonth.getFullYear());
            const month = String(currentMonth.getMonth() + 1).padStart(2, '0');
            if (tipo === 'asistencia' || tipo === 'ambos') {
                foldersToSearch.push(`asistencia/${year}/${month}`);
                foldersToSearch.push(`asistencias/${year}/${month}`);
            }
            if (tipo === 'incidente' || tipo === 'ambos') {
                foldersToSearch.push(`incidentes/${year}/${month}`);
            }
            currentMonth.setMonth(currentMonth.getMonth() + 1);
        }

        const emailFilter = (filtroUsuario || '').trim().toLowerCase().replace(/[@.]/g, '-');

        for (const prefijo of foldersToSearch) {
            try {
                const folderRef = ref(storage, prefijo);
                const res = await listAll(folderRef);
                for (const item of res.items) {
                    if (resultsMap.has(item.fullPath)) continue;
                    if (emailFilter && !item.name.toLowerCase().includes(emailFilter)) continue;

                    let fileDate = desde;
                    try {
                        // Formato: Entrada_email_21-2-2026_16-02.jpg
                        const nameWithoutExt = item.name.split('.')[0];
                        const parts = nameWithoutExt.split('_');
                        if (parts.length >= 4) {
                            const timePart = parts[parts.length - 1]; // "16-02"
                            const datePart = parts[parts.length - 2]; // "21-2-2026"
                            const [day, m, yStr] = datePart.split('-');
                            const [hour, minute] = timePart.split('-');
                            fileDate = new Date(parseInt(yStr), parseInt(m) - 1, parseInt(day), parseInt(hour), parseInt(minute));
                        }
                    } catch (e) {
                        // Si falla el parseo, asumimos que está en rango por estar en la carpeta
                    }

                    if (fileDate < desde || fileDate > hasta) {
                        continue;
                    }

                    let directUrl = null;
                    try { directUrl = await getDownloadURL(item); } catch (e) { /* skip */ }

                    resultsMap.set(item.fullPath, {
                        name: item.name,
                        path: item.fullPath,
                        ref: item,
                        url: directUrl,
                        date: fileDate,
                        source: 'storage'
                    });
                    storageCount++;
                }
            } catch (err) { console.warn(`Error Storage ${prefijo}:`, err.message); }
        }

        const finalResults = Array.from(resultsMap.values());
        console.log(`📊 Total: ${finalResults.length} (Firestore: ${firestoreCount}, Storage: ${storageCount})`);
        return finalResults;
    } catch (err) {
        console.error("❌ Error listando fotos:", err);
        throw err;
    }
};

// ─── Descargar fotos como ZIP ─────────────────────────────────────────────────
export const downloadPhotosAsZip = async (fileList, onProgress) => {
    const zip = new JSZip();
    let done = 0;
    let addedCount = 0;
    let firstError = null;

    console.log(`📦 Preparando descarga de ${fileList.length} fotos...`);

    const downloadWithRetry = async (file, retries = 1) => {
        const fullPath = file.ref?.fullPath || file.path;
        try {
            // 1. Obtener la URL de descarga directa primero
            const url = file.url || await getDownloadURL(file.ref);

            // 2. Forzar la descarga mediante XMLHttpRequest (XHR) o Fetch
            // En navegadores, XHR suele ser más estable para blobs grandes que getBytes() del SDK
            const blob = await new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.responseType = 'blob';
                xhr.onload = (event) => {
                    const blob = xhr.response;
                    if (xhr.status === 200) {
                        resolve(blob);
                    } else {
                        reject(new Error(`HTTP Error ${xhr.status} fetching blob`));
                    }
                };
                xhr.onerror = () => reject(new Error('Network Error fetching blob'));
                xhr.open('GET', url);
                xhr.send();
            });

            if (blob && blob.size > 0) {
                const fileName = fullPath.split('/').pop();
                zip.file(fileName, blob);
                addedCount++;
                console.log(`✅ [${addedCount}] ${fileName} OK`);
            } else {
                throw new Error("Blob vacío");
            }

        } catch (err) {
            // Si el error es object-not-found, 404 o 403, NO reintentamos. El archivo fue borrado.
            const isNotFound = err.code === 'storage/object-not-found' ||
                err.message.includes('not found') ||
                err.message.includes('404') ||
                err.message.includes('403');

            if (isNotFound) {
                console.warn(`🛑 Archivo no existe físicamente: ${fullPath} (borrado manual). Saltando...`);
                if (file.id) {
                    try {
                        console.log(`🧹 Auto-limpiando registro huérfano en Firestore: ${file.id}`);
                        await deleteDoc(doc(db, 'fotos', file.id));
                    } catch (e) {
                        console.warn("No se pudo limpiar registro huérfano:", e.message);
                    }
                }
                return; // Salir silenciosamente para no detener el ZIP
            }

            if (retries > 0) {
                console.warn(`🔄 Reintentando ${fullPath} (${retries} restantes)...`);
                await new Promise(r => setTimeout(r, 1000));
                return downloadWithRetry(file, retries - 1);
            }

            console.error(`❌ Falló definitivamente ${fullPath}:`, err.message);
            if (!firstError) firstError = `${fullPath}: ${err.message}`;
        }
    };

    // Procesar en tandas de 5 para acelerar la red sin saturarla
    const chunks = [];
    for (let i = 0; i < fileList.length; i += 5) chunks.push(fileList.slice(i, i + 5));

    for (const chunk of chunks) {
        await Promise.all(chunk.map(async file => {
            await downloadWithRetry(file);
            done++;
            if (onProgress) onProgress(done, fileList.length);
        }));
    }

    if (addedCount === 0) {
        throw new Error(`¡Descarga fallida! 0/${fileList.length} obtenidas. Revisa permisos o si los archivos existen realmente.`);
    }

    console.log(`🤐 Finalizado. Fotos empaquetadas: ${addedCount}`);
    const generatedZipBlob = await zip.generateAsync({
        type: 'blob',
        compression: 'STORE', // JPGs ya están comprimidos, STORE es más rápido
    });

    return { zipBlob: generatedZipBlob, addedCount };
};

// ─── Limpieza Automática de Fotos Antiguas ────────────────────────────────────
export const cleanOldPhotos = async (retentionOpts) => {
    // retenOpts = { asistencia: meses, incidentes: meses }
    const { asistencia = 3, incidentes = 18 } = retentionOpts;

    console.log(`🧹 Iniciando limpieza de Storage. Retención: Asistencia ${asistencia}m, Incidentes ${incidentes}m`);
    let deletedCount = 0;

    const deleteOldInFolder = async (folder, meses) => {
        try {
            // Calculamos fecha límite
            const limitDate = new Date();
            limitDate.setMonth(limitDate.getMonth() - meses);
            // Firebase Storage no permite queries de fecha.
            // PERO guardamos los datos en Firestore en la colección 'fotos'.
            // Consultaremos Firestore para encontrar las fotos viejas, las borraremos de Storage y de Firestore.

            const q = query(
                collection(db, 'fotos'),
                where("carpeta", "==", folder),
                where("timestamp", "<", limitDate)
            );

            const snap = await getDocs(q);
            if (snap.empty) {
                console.log(`✨ Carpeta ${folder} está limpia.`);
                return;
            }

            console.log(`🗑️ Encontradas ${snap.size} fotos para borrar en ${folder}...`);

            // Borrar en lotes para no saturar
            for (const docSnap of snap.docs) {
                const data = docSnap.data();
                try {
                    // 1. Borrar en Storage
                    if (data.path) {
                        const fileRef = ref(storage, data.path);
                        await deleteObject(fileRef).catch(err => {
                            if (err.code !== 'storage/object-not-found') throw err;
                        });
                    }
                    // 2. Borrar en Firestore
                    await deleteDoc(doc(db, 'fotos', docSnap.id));
                    deletedCount++;
                } catch (err) {
                    console.error(`Error borrando doc ${docSnap.id}:`, err.message);
                }
            }
        } catch (err) {
            console.error(`Error en ciclo de limpieza de ${folder}:`, err.message);
        }
    };

    await deleteOldInFolder('asistencia', asistencia);
    await deleteOldInFolder('incidentes', incidentes);

    console.log(`🧹 Limpieza completada. Fotos eliminadas: ${deletedCount}`);
    return deletedCount;
};
