// src/services/storageService.js
// Maneja subida y descarga de fotos en Firebase Storage.
// • Las fotos se comprimen antes de subir (Canvas, configurable vía .env)
// • Los metadatos se guardan en Firestore colección 'fotos' para evitar
//   problemas de CORS que tiene el método listAll() de Firebase Storage.
// • Para descargar se usa getBlob() del SDK (sin CORS) en vez de fetch().

import { storage, db } from '../firebaseConfig';
import {
    ref,
    uploadBytes,
    getDownloadURL,
    getBlob,
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
/**
 * Redimensiona a máx MAX_PHOTO_WIDTH px y comprime a PHOTO_QUALITY JPEG.
 * Devuelve un Blob listo para subir.
 */
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
/**
 * Comprime, sube a Storage y guarda metadatos en Firestore colección 'fotos'.
 * Guardar en Firestore permite listar sin depender de listAll() (que tiene
 * problemas de CORS en algunos navegadores).
 *
 * @returns {Promise<string>} URL de descarga
 */
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

    // Guardar metadatos en Firestore para listado posterior sin CORS issues
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
        // No es bloqueante — la foto ya está en Storage
    }

    console.log(`✅ Foto subida: ${storagePath} (${Math.round(blob.size / 1024)} KB)`);
    return url;
};

// ─── Listar fotos por filtro (desde Firestore) ────────────────────────────────
/**
 * Consulta la colección 'fotos' en Firestore filtrando por:
 *   - tipo ('asistencia' | 'incidentes' | 'ambos')
 *   - rango de fechas (mes/año)
 *   - email completo o dominio (@empresa.com)
 *
 * @param {Object} opts
 * @param {string} opts.tipo        'asistencia' | 'incidentes' | 'ambos'
 * @param {Date}   opts.desde       Fecha inicio
 * @param {Date}   opts.hasta       Fecha fin
 * @param {string} opts.filtroUsuario  Email completo o @dominio
 * @returns {Promise<Array<{name, path, ref}>>}
 */
export const listPhotosByFilter = async ({ tipo, desde, hasta, filtroUsuario }) => {
    const carpetas = tipo === 'ambos'
        ? ['asistencia', 'incidentes']
        : [tipo === 'incidentes' ? 'incidentes' : 'asistencia'];

    // Construir combinaciones de año/mes en el rango
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

    const results = [];
    for (const { year, month } of periodos) {
        for (const carpeta of carpetas) {
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

                    // Filtro por dominio (@empresa.com)
                    if (esDominio && !emailLow.endsWith(filtroNorm)) return;
                    // Filtro por email exacto
                    if (!esDominio && filtroNorm && emailLow !== filtroNorm) return;

                    results.push({
                        name: data.path.split('/').pop(),
                        path: data.path,
                        ref: ref(storage, data.path),
                    });
                });
            } catch (err) {
                console.error(`Error consultando fotos (${carpeta}/${year}/${month}):`, err);
            }
        }
    }
    return results;
};

// ─── Descargar fotos como ZIP ─────────────────────────────────────────────────
/**
 * Descarga todos los archivos de la lista y los empaqueta en un ZIP.
 * Usa getBlob() del SDK de Firebase en vez de fetch(downloadURL)
 * para evitar problemas de CORS al descargar.
 *
 * @param {Array}    fileList   — resultado de listPhotosByFilter
 * @param {Function} onProgress — callback(current, total)
 * @returns {Blob} ZIP blob
 */
export const downloadPhotosAsZip = async (fileList, onProgress) => {
    const zip = new JSZip();
    let done = 0;

    for (const file of fileList) {
        try {
            // getBlob() descarga a través del SDK (no tiene CORS issues)
            const blob = await getBlob(file.ref);
            zip.file(file.path, blob);
        } catch (err) {
            console.warn(`⚠️ No se pudo descargar ${file.name}:`, err);
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
