import { registerSW } from 'virtual:pwa-register';

let updateSWFn = null;
let isUpdateAvailable = false;
const listeners = new Set();

/**
 * Notifica a todos los suscriptores registrados que hay una actualización lista.
 */
function notifyListeners() {
    listeners.forEach((cb) => {
        try {
            cb(isUpdateAvailable);
        } catch (e) {
            console.error('[PWA] Error notificando listener:', e);
        }
    });
}

/**
 * Registra el Service Worker de forma silenciosa.
 * NUNCA recarga la página automáticamente para no interrumpir la cámara ni el flujo de marcación.
 */
export function initPwaUpdate() {
    try {
        updateSWFn = registerSW({
            immediate: true,
            onNeedUpdate() {
                console.log('✨ [PWA] Nueva versión disponible en segundo plano.');
                isUpdateAvailable = true;
                notifyListeners();
            },
            onOfflineReady() {
                console.log('⚡ [PWA] Aplicación lista para operar sin conexión.');
            },
        });

        // Sincronizar la versión instalada en localStorage
        const currentVersion = import.meta.env.VITE_APP_VERSION || '1.0.0';
        const savedVersion = localStorage.getItem('app_version') || currentVersion;

        // Consultar version.json del servidor con timestamp anti-caché y no-store
        fetch('/version.json?t=' + Date.now(), { cache: 'no-store' })
            .then(res => res.ok ? res.json() : null)
            .then(data => {
                if (data && data.version && (data.version !== currentVersion || data.version !== savedVersion)) {
                    console.log(`✨ [PWA] Nueva versión en servidor detectada: ${data.version} (instalada: ${currentVersion})`);
                    isUpdateAvailable = true;
                    notifyListeners();
                } else if (data && data.version === currentVersion) {
                    localStorage.setItem('app_version', currentVersion);
                }
            })
            .catch(() => {
                // Silencioso si está offline
            });

    } catch (err) {
        console.warn('⚠️ [PWA] Error inicializando Service Worker:', err);
    }
}

/**
 * Suscribe un componente para saber si hay una actualización lista.
 * Retorna una función para desuscribirse.
 * @param {(hasUpdate: boolean) => void} callback
 * @returns {() => void}
 */
export function onPwaUpdateAvailable(callback) {
    listeners.add(callback);
    // Ejecutar inmediatamente con el estado actual
    callback(isUpdateAvailable);
    return () => listeners.delete(callback);
}

/**
 * Retorna true si hay una actualización pendiente detectada.
 */
export function getIsUpdateAvailable() {
    return isUpdateAvailable;
}

/**
 * Aplica la actualización de forma limpia:
 * 1. Envía SKIP_WAITING al Service Worker esperando si existe.
 * 2. Actualiza el número de versión en localStorage.
 * 3. Recarga la página manteniendo la sesión activa.
 */
export async function applyPwaUpdate() {
    const currentVersion = import.meta.env.VITE_APP_VERSION || '1.0.0';
    localStorage.setItem('app_version', currentVersion);

    if (updateSWFn) {
        try {
            await updateSWFn(true);
        } catch (e) {
            console.warn('[PWA] Error al llamar updateSWFn:', e);
        }
    }

    if ('serviceWorker' in navigator) {
        try {
            const registration = await navigator.serviceWorker.getRegistration();
            if (registration && registration.waiting) {
                registration.waiting.postMessage({ type: 'SKIP_WAITING' });
            }
        } catch (e) {
            console.warn('[PWA] Error enviando SKIP_WAITING:', e);
        }
    }

    // Recargar limpiamente
    window.location.reload();
}
