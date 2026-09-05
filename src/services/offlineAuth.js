/**
 * offlineAuth.js — Motor de autenticación offline segura con PBKDF2
 *
 * Permite verificar credenciales localmente cuando no hay red,
 * usando hashing irreversible via Web Crypto API.
 *
 * Reglas de seguridad:
 * - La contraseña NUNCA se guarda en texto plano.
 * - El email se hashea con SHA-256 antes de usarse como clave.
 * - Se usan 200.000 iteraciones de PBKDF2-SHA-256 + salt aleatorio de 16 bytes.
 * - La clave de almacenamiento es opaca (_x_cf_s).
 */

const STORAGE_KEY = '_x_cf_s';
const ITERATIONS = 200_000;

// ── Utilidades internas ────────────────────────────────────────────────────────

/** Convierte un ArrayBuffer a string Base64 */
function bufferToBase64(buffer) {
    return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

/** Convierte un string Base64 a Uint8Array */
function base64ToBuffer(b64) {
    return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

/** Hashea un string con SHA-256 y retorna Base64 (usado para la clave del email) */
async function sha256Base64(str) {
    const encoded = new TextEncoder().encode(str);
    const hashBuf = await crypto.subtle.digest('SHA-256', encoded);
    return bufferToBase64(hashBuf);
}

/**
 * Genera un hash PBKDF2 de la contraseña usando el salt dado.
 * @param {string} password
 * @param {Uint8Array} salt
 * @returns {Promise<string>} Hash en Base64
 */
async function pbkdf2Hash(password, salt) {
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(password),
        { name: 'PBKDF2' },
        false,
        ['deriveBits']
    );
    const derived = await crypto.subtle.deriveBits(
        {
            name: 'PBKDF2',
            salt,
            iterations: ITERATIONS,
            hash: 'SHA-256',
        },
        keyMaterial,
        256 // 32 bytes
    );
    return bufferToBase64(derived);
}

/** Lee el store completo del localStorage */
function readStore() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}

/** Escribe el store completo en localStorage */
function writeStore(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

// ── API pública ────────────────────────────────────────────────────────────────

/**
 * Guarda las credenciales de forma segura tras un login online exitoso.
 * @param {string} email
 * @param {string} password
 * @param {string} displayName
 */
export async function saveOfflineCredentials(email, password, displayName) {
    try {
        const normalizedEmail = email.trim().toLowerCase();
        const emailKey = await sha256Base64(normalizedEmail);
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const hash = await pbkdf2Hash(password, salt);

        const store = readStore();
        store[emailKey] = {
            salt: bufferToBase64(salt),
            hash,
            displayName: displayName || '',
            email: normalizedEmail,
        };
        writeStore(store);
        console.log('🔐 [OfflineAuth] Credenciales guardadas de forma segura.');
    } catch (err) {
        console.error('[OfflineAuth] Error guardando credenciales:', err);
    }
}

/**
 * Verifica las credenciales contra el hash local.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<null | { ok: false } | { ok: true, email: string, displayName: string }>}
 *   - null  → No hay historial para este email en este dispositivo
 *   - { ok: false } → Hash encontrado pero contraseña incorrecta
 *   - { ok: true, ... } → Verificación exitosa
 */
export async function verifyOfflineCredentials(email, password) {
    try {
        const normalizedEmail = email.trim().toLowerCase();
        const emailKey = await sha256Base64(normalizedEmail);
        const store = readStore();
        const entry = store[emailKey];

        if (!entry) return null; // Sin historial en este dispositivo

        const salt = base64ToBuffer(entry.salt);
        const computedHash = await pbkdf2Hash(password, salt);

        if (computedHash !== entry.hash) {
            return { ok: false }; // Contraseña incorrecta
        }

        return { ok: true, email: entry.email, displayName: entry.displayName };
    } catch (err) {
        console.error('[OfflineAuth] Error verificando credenciales:', err);
        return null;
    }
}

/**
 * Elimina las credenciales locales de un email (usar al dar de baja un empleado).
 * @param {string} email
 */
export async function clearOfflineCredentials(email) {
    try {
        const normalizedEmail = email.trim().toLowerCase();
        const emailKey = await sha256Base64(normalizedEmail);
        const store = readStore();
        delete store[emailKey];
        writeStore(store);
        console.log('🗑️ [OfflineAuth] Credenciales eliminadas para:', normalizedEmail);
    } catch (err) {
        console.error('[OfflineAuth] Error eliminando credenciales:', err);
    }
}
