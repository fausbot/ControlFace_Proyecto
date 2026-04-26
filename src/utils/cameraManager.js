/**
 * cameraManager.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Gestor centralizado de cámara para ControlFace PWA.
 *
 * Tres módulos independientes:
 *   1. acquireSelfieCamera   → Entrada/Salida empleados (siempre frontal)
 *   2. acquireRearCamera     → Novedades/Incidentes    (siempre trasera)
 *   3. acquireVariableCamera → Visitas a Clientes      (frontal o trasera según config)
 *
 * Todos comparten:
 *   - releaseCamera()        → Liberación agresiva del hardware de Android
 *   - Spinner/estado de carga (callback onStatusChange)
 *   - Reintento automático progresivo para NotReadableError
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─── Tiempo mínimo de espera tras soltar la cámara antes de pedir otra ───────
const RELEASE_WAIT_MS = 800;

// ─── Configuración de reintentos para NotReadableError ───────────────────────
const RETRY_CONFIG = {
    maxRetries: 4,        // Intentos por modalidad de constraints
    initialDelayMs: 700,  // Primera espera de reintento
    delayIncrement: 400,  // Incremento adicional por cada fallo consecutivo
};

// ─────────────────────────────────────────────────────────────────────────────
// UTILIDADES INTERNAS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Libera agresivamente un MediaStream existente.
 * Desconecta el elemento <video> ANTES de parar los tracks para que
 * el navegador/Android libere el hardware lo antes posible.
 *
 * @param {React.RefObject} videoRef   - ref del elemento <video>
 * @param {React.RefObject} streamRef  - ref del MediaStream activo
 */
export async function releaseCamera(videoRef, streamRef) {
    // 1. Desconectar elmento video primero (libera la referencia del navegador)
    if (videoRef?.current) {
        videoRef.current.srcObject = null;
    }

    // 2. Parar todos los tracks del stream
    if (streamRef?.current) {
        const tracks = streamRef.current.getTracks();
        tracks.forEach(track => {
            try { track.stop(); } catch (e) { /* ignorar */ }
            try { track.enabled = false; } catch (e) { /* ignorar */ }
        });
        streamRef.current = null;
    }

    // 3. Esperar a que el hardware de Android termine de liberarse
    await new Promise(resolve => setTimeout(resolve, RELEASE_WAIT_MS));
}

/**
 * Intenta obtener un MediaStream con un constraints específico.
 * Reintenta automáticamente si recibe NotReadableError (hardware aún ocupado).
 *
 * @param {Object} constraints  - MediaStreamConstraints
 * @returns {Promise<MediaStream>}
 */
async function tryAcquireWithRetry(constraints) {
    let delayMs = RETRY_CONFIG.initialDelayMs;

    for (let attempt = 0; attempt < RETRY_CONFIG.maxRetries; attempt++) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            if (attempt > 0) {
                console.log(`📷 Cámara obtenida en intento ${attempt + 1}`);
            }
            return stream;
        } catch (err) {
            const isRetryable = err.name === 'NotReadableError' || err.name === 'AbortError';
            const isLastAttempt = attempt === RETRY_CONFIG.maxRetries - 1;

            if (isRetryable && !isLastAttempt) {
                console.warn(`⚠️ [Camera] ${err.name} — reintentando en ${delayMs}ms (intento ${attempt + 1}/${RETRY_CONFIG.maxRetries})...`);
                await new Promise(r => setTimeout(r, delayMs));
                delayMs += RETRY_CONFIG.delayIncrement;
            } else {
                throw err; // Error no recuperable o último intento → pasar al siguiente constraints
            }
        }
    }
}

/**
 * Enumera los dispositivos de video y los clasifica por tipo.
 * Retorna { frontDevices, backDevices, allVideoDevices }
 */
async function enumerateVideoDevices() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const allVideoDevices = devices.filter(d => d.kind === 'videoinput');

        // Clasificar cámaras por etiqueta de hardware
        const backDevices = allVideoDevices.filter(d => {
            const label = d.label.toLowerCase();
            return (
                label.includes('back') ||
                label.includes('trasera') ||
                label.includes('environment') ||
                label.includes('rear')
            );
        });

        const frontDevices = allVideoDevices.filter(d => {
            const label = d.label.toLowerCase();
            return (
                label.includes('front') ||
                label.includes('frontal') ||
                label.includes('user') ||
                label.includes('selfie')
            );
        });

        console.log(`📷 Dispositivos encontrados: ${allVideoDevices.length} total, ${backDevices.length} traseras, ${frontDevices.length} frontales`);
        return { frontDevices, backDevices, allVideoDevices };
    } catch (e) {
        console.warn('⚠️ No se pudieron enumerar dispositivos de cámara:', e);
        return { frontDevices: [], backDevices: [], allVideoDevices: [] };
    }
}

/**
 * Ejecuta una lista de estrategias de cámara en orden hasta que una funcione.
 * Cada estrategia puede reintentar por NotReadableError internamente.
 *
 * @param {Array<Object>} strategies  - Lista de MediaStreamConstraints
 * @param {string}        label       - Nombre del módulo (para logs)
 * @returns {{ stream: MediaStream|null, error: Error|null }}
 */
async function runCameraStrategies(strategies, label) {
    let lastErr = null;

    for (let i = 0; i < strategies.length; i++) {
        const constraints = strategies[i];
        try {
            console.log(`📷 [${label}] Probando estrategia ${i + 1}/${strategies.length}...`, JSON.stringify(constraints.video));
            const stream = await tryAcquireWithRetry(constraints);
            if (stream) {
                console.log(`✅ [${label}] Cámara activa con estrategia ${i + 1}`);
                return { stream, error: null };
            }
        } catch (err) {
            lastErr = err;
            console.warn(`❌ [${label}] Estrategia ${i + 1} falló:`, err.name, err.message);
        }
    }

    return { stream: null, error: lastErr };
}

// ─────────────────────────────────────────────────────────────────────────────
// MÓDULO 1: SELFIE CAMERA — Entrada / Salida de Empleados
// Siempre frontal. Fallback ciego al final (preferimos selfie equivocada
// a bloquear al empleado).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {React.RefObject} videoRef
 * @param {React.RefObject} streamRef
 * @param {function} onStatusChange  - callback(string) para mostrar mensajes al usuario
 * @returns {Promise<MediaStream|null>}
 */
export async function acquireSelfieCamera(videoRef, streamRef, onStatusChange = () => {}) {
    onStatusChange('Activando cámara...');

    // Liberar cámara anterior antes de pedir nueva
    await releaseCamera(videoRef, streamRef);

    // Obtener deviceIds con etiquetas conocidas
    const { frontDevices } = await enumerateVideoDevices();

    // Construir lista de estrategias: de más específica a más genérica
    const strategies = [];

    // Paso 1: deviceId exacto si encontramos una cámara frontal por etiqueta
    if (frontDevices.length > 0) {
        strategies.push({ video: { deviceId: { exact: frontDevices[0].deviceId } }, audio: false });
    }

    // Pasos 2-4: facingMode en orden de especificidad
    strategies.push(
        { video: { facingMode: { exact: 'user' } }, audio: false },
        { video: { facingMode: 'user' }, audio: false },
        { video: { facingMode: { ideal: 'user' } }, audio: false },
        // Paso 5: cualquier cámara (preferible a dejar bloqueado al empleado)
        { video: true, audio: false }
    );

    const { stream, error } = await runCameraStrategies(strategies, 'SELFIE');

    if (!stream) {
        onStatusChange('');
        handleCameraError(error, 'selfie');
        return null;
    }

    onStatusChange('');
    return stream;
}

// ─────────────────────────────────────────────────────────────────────────────
// MÓDULO 2: REAR CAMERA — Novedades / Incidentes
// Siempre trasera. Sin fallback ciego (una novedad con selfie es inútil).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {React.RefObject} videoRef
 * @param {React.RefObject} streamRef
 * @param {function} onStatusChange
 * @returns {Promise<MediaStream|null>}
 */
export async function acquireRearCamera(videoRef, streamRef, onStatusChange = () => {}) {
    onStatusChange('Activando cámara trasera...');

    await releaseCamera(videoRef, streamRef);

    const { backDevices, allVideoDevices } = await enumerateVideoDevices();

    const strategies = [];

    // Paso 1: deviceId exacto de la cámara trasera principal
    // Preferimos la PRIMERA trasera encontrada (camera 0 = principal en la mayoría de Androids)
    if (backDevices.length > 0) {
        strategies.push({ video: { deviceId: { exact: backDevices[0].deviceId } }, audio: false });
        // Si hay más de una trasera, intentar también la última (por si la principal está ocupada)
        if (backDevices.length > 1) {
            strategies.push({ video: { deviceId: { exact: backDevices[backDevices.length - 1].deviceId } }, audio: false });
        }
    }

    // Pasos siguientes: facingMode — usar 'ideal' primero, no 'exact', para ser más tolerante con Android
    strategies.push(
        { video: { facingMode: { ideal: 'environment' } }, audio: false },
        { video: { facingMode: 'environment' }, audio: false },
        { video: { facingMode: { exact: 'environment' } }, audio: false }
        // Sin fallback {video: true} — no queremos selfie para novedades
    );

    const { stream, error } = await runCameraStrategies(strategies, 'REAR');

    if (!stream) {
        onStatusChange('');
        handleCameraError(error, 'rear');
        return null;
    }

    onStatusChange('');
    return stream;
}

// ─────────────────────────────────────────────────────────────────────────────
// MÓDULO 3: VARIABLE CAMERA — Visitas a Clientes
// La cámara depende de la configuración (frontal o trasera).
// Liberación agresiva, reintentos más largos, sin fallback de modo contrario.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {React.RefObject} videoRef
 * @param {React.RefObject} streamRef
 * @param {'user'|'environment'} preferredFacing  - Viene de Firestore/config
 * @param {function} onStatusChange
 * @returns {Promise<MediaStream|null>}
 */
export async function acquireVariableCamera(videoRef, streamRef, preferredFacing = 'environment', onStatusChange = () => {}) {
    const isRear = preferredFacing === 'environment';
    onStatusChange(isRear ? 'Activando cámara trasera...' : 'Activando cámara frontal...');

    // Liberación extra agresiva para el módulo variable (es el que más cambia de modo)
    if (videoRef?.current) {
        videoRef.current.srcObject = null;
    }
    if (streamRef?.current) {
        const tracks = streamRef.current.getTracks();
        tracks.forEach(track => {
            try { track.stop(); } catch (e) {}
            try { track.enabled = false; } catch (e) {}
        });
        streamRef.current = null;
    }
    // Espera más larga que los otros módulos: este es el que cambia de cámara frecuentemente
    await new Promise(resolve => setTimeout(resolve, 1000));

    const { frontDevices, backDevices } = await enumerateVideoDevices();

    const strategies = [];

    if (isRear) {
        // ── MODO TRASERA ──────────────────────────────────────────────────────
        // Para trasera: preferir la cámara 0 (principal gran angular de Android)
        if (backDevices.length > 0) {
            // Principal
            strategies.push({ video: { deviceId: { exact: backDevices[0].deviceId } }, audio: false });
            // Alternativa si hay más de una
            if (backDevices.length > 1) {
                strategies.push({ video: { deviceId: { exact: backDevices[1].deviceId } }, audio: false });
            }
        }
        // facingMode con 'ideal' primero (más tolerante que 'exact' en Android)
        strategies.push(
            { video: { facingMode: { ideal: 'environment' } }, audio: false },
            { video: { facingMode: 'environment' }, audio: false },
            { video: { facingMode: { exact: 'environment' } }, audio: false }
        );
        // Sin fallback ciego — si no hay cámara trasera, reportar error limpio

    } else {
        // ── MODO FRONTAL ──────────────────────────────────────────────────────
        if (frontDevices.length > 0) {
            strategies.push({ video: { deviceId: { exact: frontDevices[0].deviceId } }, audio: false });
        }
        strategies.push(
            { video: { facingMode: { ideal: 'user' } }, audio: false },
            { video: { facingMode: 'user' }, audio: false },
            { video: { facingMode: { exact: 'user' } }, audio: false },
            // Para frontal sí permitimos fallback ciego como último recurso
            { video: true, audio: false }
        );
    }

    const { stream, error } = await runCameraStrategies(strategies, 'VARIABLE');

    if (!stream) {
        onStatusChange('');
        handleCameraError(error, 'variable');
        return null;
    }

    onStatusChange('');
    return stream;
}

// ─────────────────────────────────────────────────────────────────────────────
// MANEJADOR DE ERRORES CENTRALIZADO
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retorna un objeto con información del error para que la UI decida cómo mostrarlo.
 * No hace alert() directamente — la UI lo maneja para poder poner un botón "Reintentar".
 *
 * @param {Error}  error
 * @param {string} module - 'selfie' | 'rear' | 'variable'
 * @returns {{ type: string, title: string, message: string, canRetry: boolean }}
 */
export function getCameraErrorInfo(error, module = 'variable') {
    if (!error) return null;

    if (error.name === 'NotReadableError' || error.name === 'AbortError') {
        return {
            type: 'busy',
            title: '📷 Cámara ocupada',
            message: 'El hardware de la cámara aún no se ha liberado completamente.\n\nEspera 3-5 segundos y presiona "Reintentar". Si el problema persiste, cierra todas las apps y vuelve a intentarlo.',
            canRetry: true,
        };
    }

    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        return {
            type: 'permission',
            title: '🔒 Permiso denegado',
            message: 'Debes autorizar el acceso a la cámara.\n\nSi ya denegaste el permiso, ve a Configuración del navegador → Permisos del sitio → Cámara, y actívalo para esta app.',
            canRetry: false,
        };
    }

    if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        return {
            type: 'notfound',
            title: '❌ Cámara no encontrada',
            message: module === 'rear'
                ? 'No se encontró una cámara trasera en este dispositivo.'
                : 'No se encontró ninguna cámara en este dispositivo.',
            canRetry: false,
        };
    }

    return {
        type: 'unknown',
        title: '⚠️ Error de cámara',
        message: `No se pudo acceder a la cámara.\n\nError: ${error.name}: ${error.message}\n\nIntenta recargar la aplicación.`,
        canRetry: true,
    };
}

/**
 * Versión con alert() para mantener compatibilidad con el Dashboard (que aún usa alerts).
 */
function handleCameraError(error, module) {
    const info = getCameraErrorInfo(error, module);
    if (info) {
        console.error(`[CameraManager] Error en módulo ${module}:`, error);
        // No hacer alert aquí — dejamos que el componente maneje el error con su UI
    }
}
