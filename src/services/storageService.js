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
    listAll,
} from 'firebase/storage';
import {
    collection,
    addDoc,
    getDocs,
    query,
    where,
    serverTimestamp,
} from 'firebase/firestore';
import JSZip from 'jszip';

// ─── Configuración (ajustable desde .env) ────────────────────────────────────
const MAX_PHOTO_WIDTH = parseInt(import.meta.env.VITE_PHOTO_MAX_WIDTH || '800');
const PHOTO_QUALITY = parseFloat(import.meta.env.VITE_PHOTO_QUALITY || '0.75');

// ─── Helpers ──────────────────────────────────────────────────────────────────
const sanitizeEmail = (email) =>
    (email || 'sin-email').replace('@', '_').replace(/\./g, '-');

const buildPath = (tipo, year, month, email, fecha, hora) => {
    const carpeta = tipo === 'incidente' ? 'incidentes' : 'asistencia';
    const safeEmail = sanitizeEmail(email);
    const safeDate = (fecha || '').replace(/\//g, '-');
    const safeTime = (hora || '').replace(/:/g, '-').substring(0, 5);
    return `${carpeta}/${year}/${month}/${tipo}_${safeEmail}_${safeDate}_${safeTime}.jpg`;
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

    // Guardar metadatos en Firestore para listado posterior rápido y sin CORS
    const carpeta = tipo === 'incidente' ? 'incidentes' : 'asistencia';
    try {
        await addDoc(collection(db, 'fotos'), {
            tipo, email, fecha, hora, year, month, carpeta,
            path: storagePath,
            url,
            timestamp: serverTimestamp(),
        });
    } catch (firestoreErr) {
        console.warn('⚠️ No se pudo guardar metadatos en Firestore:', firestoreErr);
    }

    console.log(`✅ Foto subida: ${storagePath} (${Math.round(blob.size / 1024)} KB)`);
    return url;
};

// ─── Listar fotos por filtro (Modo Híbrido: Firestore + Storage) ──────────────
/**
 * Busca fotos en el registro de Firestore y también intenta listAll() en Storage
 * para encontrar fotos antiguas que no tengan registro en la base de datos.
 */
export const listPhotosByFilter = async ({ tipo, desde, hasta, filtroUsuario }) => {
    const carpetas = tipo === 'ambos'
        ? ['asistencia', 'incidentes']
        : [tipo === 'incidentes' ? 'incidentes' : 'asistencia'];

    const periodos = [];
    const cursor = new Date(desde.getFullYear(), desde.getMonth(), 1);
    const fin = new Date(hasta.getFullYear(), hasta.getMonth(), 1);
    while (cursor <= fin) {
        periodos.push({
            year: String(cursor.getFullYear()),
            month: String(cursor.getMonth() + 1).padStart(2, '0'),
        });
        cursor.setMonth(cursor.getMonth() + 1);
    }

    const filtroNorm = (filtroUsuario || '').trim().toLowerCase();
    const esDominio = filtroNorm.startsWith('@');
    // Para el caso de listAll (antiguo), necesitamos el nombre sanitizado igual que en buildPath
    const dominioSanitized = esDominio
        ? filtroNorm.replace('@', '_').replace(/\./g, '-')
        : null;
    const emailSanitized = !esDominio && filtroNorm
        ? sanitizeEmail(filtroNorm)
        : null;

    const resultsMap = new Map(); // Usamos Map para evitar duplicados por path

    for (const { year, month } of periodos) {
        for (const carpeta of carpetas) {
            const prefijo = `${carpeta}/${year}/${month}`;

            // 1. INTENTAR FIRESTORE (Nuevo sistema)
            try {
                const q = query(
                    collection(db, 'fotos'),
                    where('year', '==', year),
                    where('month', '==', month),
                    where('carpeta', '==', carpeta),
                );
                const snap = await getDocs(q);
                snap.docs.forEach(docSnap => {
                    const data = docSnap.data();
                    const emailLow = (data.email || '').toLowerCase();
                    if (esDominio && !emailLow.endsWith(filtroNorm)) return;
                    if (!esDominio && filtroNorm && emailLow !== filtroNorm) return;

                    resultsMap.set(data.path, {
                        name: data.path.split('/').pop(),
                        path: data.path,
                        ref: ref(storage, data.path),
                        source: 'firestore'
                    });
                });
            } catch (err) {
                console.error(`Firestore search failed for ${prefijo}:`, err);
                if (err.message && err.message.includes('index')) {
                    alert(`⚠️ Firestore requiere un índice para buscar fotos. Por favor abre este link en tu navegador (logueado en Firebase Console):\n\n${err.message.split('at ')[1] || 'Revisa la consola'}`);
                }
            }

            // 2. INTENTAR STORAGE listAll (Sistema antiguo / Legacy)
            // Esto permite encontrar fotos subidas antes del registro en Firestore.
            try {
                const folderRef = ref(storage, prefijo);
                const listaResult = await listAll(folderRef);

                for (const item of listaResult.items) {
                    if (resultsMap.has(item.fullPath)) continue; // Ya lo tenemos de Firestore

                    const name = item.name.toLowerCase();
                    // El filtrado manual es necesario para listAll
                    if (esDominio && !name.includes(dominioSanitized)) continue;
                    if (emailSanitized && !name.includes(emailSanitized)) continue;

                    resultsMap.set(item.fullPath, {
                        name: item.name,
                        path: item.fullPath,
                        ref: item,
                        source: 'storage'
                    });
                }
            } catch (err) {
                console.warn(`Storage listAll fallback failed for ${prefijo} (Legacy mode ignored):`, err);
                if (err.code === 'storage/unauthorized' || err.code === 'storage/retry-limit-exceeded') {
                    console.log('Posible error de CORS o permisos en listAll');
                }
            }
        }
    }

    const finalResults = Array.from(resultsMap.values());
    console.log(`🔍 Búsqueda finalizada. Encontradas ${finalResults.length} fotos.`);
    return finalResults;
};

// ─── Descargar fotos como ZIP ─────────────────────────────────────────────────
export const downloadPhotosAsZip = async (fileList, onProgress) => {
    const zip = new JSZip();
    let done = 0;

    for (const file of fileList) {
        try {
            // getBlob() es directo del SDK, no suele tener problemas de CORS
            const blob = await getBlob(file.ref);
            zip.file(file.path, blob);
        } catch (err) {
            console.warn(`⚠️ Error descargando ${file.name}:`, err);
        }
        done++;
        if (onProgress) onProgress(done, fileList.length);
    }

    return await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
    });
};
