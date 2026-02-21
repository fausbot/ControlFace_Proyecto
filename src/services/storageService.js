// src/services/storageService.js
// Maneja subida y descarga de fotos en Firebase Storage.
// Las fotos se comprimen antes de subir para ahorrar espacio.

import { storage } from '../firebaseConfig';
import {
    ref,
    uploadBytes,
    getDownloadURL,
    listAll,
} from 'firebase/storage';
import JSZip from 'jszip';

// ─── Configuración (ajustable desde .env) ────────────────────────────────────
const MAX_PHOTO_WIDTH = parseInt(import.meta.env.VITE_PHOTO_MAX_WIDTH || '800');
const PHOTO_QUALITY = parseFloat(import.meta.env.VITE_PHOTO_QUALITY || '0.75');

// ─── Helpers de ruta ─────────────────────────────────────────────────────────
const sanitizeEmail = (email) =>
    (email || 'sin-email').replace('@', '_').replace(/\./g, '-');

const buildPath = (tipo, year, month, email, fecha, hora) => {
    const carpeta = tipo === 'incidente' ? 'incidentes' : 'asistencia';
    const safeEmail = sanitizeEmail(email);
    const safeDate = (fecha || '').replace(/\//g, '-');
    const safeTime = (hora || '').replace(/:/g, '-').substring(0, 5);
    const fileName = `${tipo}_${safeEmail}_${safeDate}_${safeTime}.jpg`;
    return `${carpeta}/${year}/${month}/${fileName}`;
};

// ─── Compresión Canvas (opciones 1 + 2) ──────────────────────────────────────
/**
 * Redimensiona a máx MAX_PHOTO_WIDTH px (manteniendo proporción)
 * y comprime a PHOTO_QUALITY JPEG.
 * Devuelve un Blob listo para subir.
 */
export const compressImage = (imageDataUrl) =>
    new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            // Calcular nuevo tamaño
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
                (blob) => {
                    if (blob) resolve(blob);
                    else reject(new Error('No se pudo comprimir la imagen'));
                },
                'image/jpeg',
                PHOTO_QUALITY,
            );
        };
        img.onerror = reject;
        img.src = imageDataUrl;
    });

// ─── Subir foto ───────────────────────────────────────────────────────────────
/**
 * Comprime y sube la foto a Firebase Storage.
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
    console.log(`✅ Foto subida a Storage: ${storagePath} (${Math.round(blob.size / 1024)} KB)`);
    return url;
};

// ─── Listar fotos por filtro ──────────────────────────────────────────────────
/**
 * Lista archivos en Storage filtrando por tipo, rango de fechas (año-mes)
 * y email/dominio.
 *
 * @param {Object} opts
 * @param {string}  opts.tipo      'asistencia' | 'incidentes' | 'ambos'
 * @param {Date}    opts.desde     Fecha inicio
 * @param {Date}    opts.hasta     Fecha fin
 * @param {string}  opts.filtroUsuario  Email completo o @dominio (ej. '@empresa.com')
 * @returns {Promise<Array<{name, path, url, ref}>>}
 */
export const listPhotosByFilter = async ({ tipo, desde, hasta, filtroUsuario }) => {
    const carpetas = tipo === 'ambos'
        ? ['asistencia', 'incidentes']
        : [tipo === 'incidentes' ? 'incidentes' : 'asistencia'];

    // Construir lista de prefijos (año/mes) en el rango
    const prefijos = [];
    const cursor = new Date(desde.getFullYear(), desde.getMonth(), 1);
    const fin = new Date(hasta.getFullYear(), hasta.getMonth(), 1);
    while (cursor <= fin) {
        const year = String(cursor.getFullYear());
        const month = String(cursor.getMonth() + 1).padStart(2, '0');
        for (const c of carpetas) prefijos.push(`${c}/${year}/${month}`);
        cursor.setMonth(cursor.getMonth() + 1);
    }

    // Normalizar filtro para buscar en nombre de archivo
    const filtroNorm = filtroUsuario ? filtroUsuario.trim().toLowerCase() : '';
    const esDominio = filtroNorm.startsWith('@');
    // dominio '_empresa-com' (sanitizado igual que en buildPath)
    const dominioSanitized = esDominio
        ? filtroNorm.replace('@', '_').replace(/\./g, '-')
        : null;
    const emailSanitized = !esDominio && filtroNorm
        ? sanitizeEmail(filtroNorm)
        : null;

    const results = [];
    for (const prefijo of prefijos) {
        const folderRef = ref(storage, prefijo);
        let listaResult;
        try { listaResult = await listAll(folderRef); }
        catch { continue; } // carpeta no existe, skip

        for (const item of listaResult.items) {
            const name = item.name.toLowerCase();
            if (esDominio && !name.includes(dominioSanitized)) continue;
            if (emailSanitized && !name.includes(emailSanitized)) continue;
            results.push({ name: item.name, path: item.fullPath, ref: item });
        }
    }
    return results;
};

// ─── Descargar fotos como ZIP ─────────────────────────────────────────────────
/**
 * Descarga todos los archivos de la lista y los empaqueta en un ZIP.
 * @param {Array} fileList — resultado de listPhotosByFilter
 * @param {Function} onProgress — callback(current, total)
 * @returns {Blob} ZIP blob
 */
export const downloadPhotosAsZip = async (fileList, onProgress) => {
    const zip = new JSZip();
    let done = 0;

    for (const file of fileList) {
        const url = await getDownloadURL(file.ref);
        const resp = await fetch(url);
        const buf = await resp.arrayBuffer();
        // Preservar carpeta dentro del ZIP: asistencia/2026/02/archivo.jpg
        zip.file(file.path, buf);
        done++;
        if (onProgress) onProgress(done, fileList.length);
    }

    return await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
};
