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
} from 'firebase/storage';
import {
    collection,
    addDoc,
    getDocs,
    query,
    where,
    serverTimestamp,
    Timestamp,
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

                if (!resultsMap.has(data.path)) {
                    const sRef = ref(storage, data.path);
                    let directUrl = data.url || null;
                    if (!directUrl) {
                        try { directUrl = await getDownloadURL(sRef); } catch (e) { /* ignore */ }
                    }

                    resultsMap.set(data.path, {
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
        const year = String(desde.getFullYear());
        const month = String(desde.getMonth() + 1).padStart(2, '0');
        const folders = [];
        if (tipo === 'asistencia' || tipo === 'ambos') {
            folders.push(`asistencia/${year}/${month}`);
            folders.push(`asistencias/${year}/${month}`);
        }
        if (tipo === 'incidente' || tipo === 'ambos') {
            folders.push(`incidentes/${year}/${month}`);
        }

        const emailFilter = (filtroUsuario || '').trim().toLowerCase().replace(/[@.]/g, '-');

        for (const prefijo of folders) {
            try {
                const folderRef = ref(storage, prefijo);
                const res = await listAll(folderRef);
                for (const item of res.items) {
                    if (resultsMap.has(item.fullPath)) continue;
                    if (emailFilter && !item.name.toLowerCase().includes(emailFilter)) continue;

                    let directUrl = null;
                    try { directUrl = await getDownloadURL(item); } catch (e) { /* skip */ }

                    resultsMap.set(item.fullPath, {
                        name: item.name,
                        path: item.fullPath,
                        ref: item,
                        url: directUrl,
                        date: desde,
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
            // Si el error es object-not-found, NO reintentamos. El archivo fue borrado.
            if (err.code === 'storage/object-not-found' || err.message.includes('not found')) {
                console.warn(`🛑 Archivo no existe físicamente: ${fullPath}. Saltando...`);
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

    console.log(`🤐 Finalizado. Fotos: ${addedCount}`);
    return await zip.generateAsync({
        type: 'blob',
        compression: 'STORE', // JPGs ya están comprimidos, STORE es más rápido
    });
};
