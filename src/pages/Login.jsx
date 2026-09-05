import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

import { Settings, Shield, Eye, EyeOff, WifiOff, RefreshCw } from 'lucide-react';
import AdminPasswordModal from '../components/AdminPasswordModal';
import { fetchLicenseStatus } from '../services/licenseService';
import { saveOfflineCredentials, verifyOfflineCredentials } from '../services/offlineAuth';
import { onPwaUpdateAvailable, applyPwaUpdate } from '../utils/pwaUpdate';

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const { login, logout, setOfflineUser } = useAuth();
    const navigate = useNavigate();
    const [error, setError] = useState('');
    const [showAdminModal, setShowAdminModal] = useState(false);
    const [adminTarget, setAdminTarget] = useState(''); // '/registro' or '/admin'
    const [deferredPrompt, setDeferredPrompt] = useState(null);
    const [showInstallBtn, setShowInstallBtn] = useState(false);
    const [isIOS, setIsIOS] = useState(false);
    const [isAndroid, setIsAndroid] = useState(false);
    const [isStandalone, setIsStandalone] = useState(false);
    const [isLicenseValid, setIsLicenseValid] = useState(true);
    const [isOffline, setIsOffline] = useState(!navigator.onLine);
    const [hasUpdate, setHasUpdate] = useState(false);
    const [isUpdating, setIsUpdating] = useState(false);

    useEffect(() => {
        const unsubscribe = onPwaUpdateAvailable((available) => {
            setHasUpdate(available);
        });
        return unsubscribe;
    }, []);

    const handleUpdate = async () => {
        setIsUpdating(true);
        await applyPwaUpdate();
    };

    // Detectar cambios de conectividad
    useEffect(() => {
        const handleOnline = () => setIsOffline(false);
        const handleOffline = () => setIsOffline(true);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    useEffect(() => {
        // Detectar si ya está instalada
        if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true) {
            setIsStandalone(true);
        }

        // Detectar SO
        const userAgent = window.navigator.userAgent.toLowerCase();
        if (userAgent.includes('iphone') || userAgent.includes('ipad') || userAgent.includes('ipod')) {
            setIsIOS(true);
        } else if (userAgent.includes('android')) {
            setIsAndroid(true);
        }

        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            setDeferredPrompt(e);
            setShowInstallBtn(true);
        });

        // Verificar la licencia antes de permitir el ingreso
        const checkLicense = async () => {
            const status = await fetchLicenseStatus();
            if (status && status.decoded && (!status.decoded.isValid || status.decoded.isExpired)) {
                setIsLicenseValid(false);
            }
        };
        checkLicense();

        // Sincronización silenciosa de versión instalada
        const currentVersion = import.meta.env.VITE_APP_VERSION || '1.0.0';
        localStorage.setItem('app_version', currentVersion);
    }, []);

    const handleInstallClick = async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            console.log('App instalada');
            setShowInstallBtn(false);
        }
        setDeferredPrompt(null);
    };

    const clearAppCache = async () => {
        if (window.confirm("¿Deseas limpiar la memoria de la aplicación? Esto forzará la carga de la versión más reciente.")) {
            if ('serviceWorker' in navigator) {
                const registrations = await navigator.serviceWorker.getRegistrations();
                for (let registration of registrations) {
                    await registration.unregister();
                }
            }
            const names = await caches.keys();
            for (let name of names) {
                await caches.delete(name);
            }
            // 🔒 PRESERVAR CLAVES CRÍTICAS DE ASISTENCIA Y SESIÓN LOCAL
            // (igual que en Dashboard.jsx — nunca borrar estado de turno)
            const preserveKeys = {};
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k && (
                    k.startsWith('lastAttendance') ||
                    k.startsWith('lastRuta') ||
                    k.startsWith('offline_') ||
                    k.startsWith('face_') ||
                    k.startsWith('employee_')
                )) {
                    preserveKeys[k] = localStorage.getItem(k);
                }
            }
            localStorage.clear();
            // Restaurar estado de asistencia protegido
            Object.entries(preserveKeys).forEach(([k, v]) => {
                if (v !== null && v !== undefined) localStorage.setItem(k, v);
            });
            window.location.reload(true);
        }
    };


    useEffect(() => {
        const savedEmail = localStorage.getItem('saved_email');
        if (savedEmail) setEmail(savedEmail);
        // Nota: la contraseña ya NO se precarga (seguridad PBKDF2)
    }, []);

    /** Códigos de error de Firebase que indican fallo de RED (no de credenciales) */
    const NETWORK_ERROR_CODES = [
        'auth/network-request-failed',
        'auth/timeout',
        'auth/internal-error',
    ];

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!isLicenseValid) {
            setError('Acceso bloqueado: La licencia del sistema se encuentra caducada.');
            return;
        }

        setError('');
        const emailToUse = email.trim().toLowerCase();

        // ── CASO SIN RED: ir directo al fallback offline ───────────────────────
        if (!navigator.onLine) {
            await handleOfflineFallback(emailToUse);
            return;
        }

        // ── INTENTO ONLINE ─────────────────────────────────────────────────────
        try {
            const userCredential = await login(emailToUse, password);
            const user = userCredential.user;

            // Verificar lista blanca en Firestore (BLOQUEO DE COLA DE BORRADO)
            const { db } = await import('../firebaseConfig');
            const { collection, query, where, getDocs } = await import('firebase/firestore');

            const q = query(collection(db, 'employees'), where('email', '==', user.email));
            const querySnapshot = await getDocs(q);

            if (querySnapshot.empty) {
                await logout();
                setError('Acceso denegado: Usuario no autorizado o dado de baja.');
                return;
            }

            // LOGIN ONLINE EXITOSO: Guardar email y credenciales seguras para offline
            localStorage.setItem('saved_email', emailToUse);
            // Guardar credenciales PBKDF2 (reemplaza el antiguo btoa inseguro)
            await saveOfflineCredentials(
                emailToUse,
                password,
                user.displayName || querySnapshot.docs[0]?.data()?.nombre || ''
            );

            navigate('/dashboard');
        } catch (err) {
            console.error('[Login] Error:', err);

            // ¿Es un error de RED? → intentar fallback offline
            const isNetworkError = NETWORK_ERROR_CODES.includes(err.code) || !navigator.onLine;
            if (isNetworkError) {
                await handleOfflineFallback(emailToUse);
            } else {
                // Error de credenciales u otro: mostrar mensaje específico
                if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' ||
                    err.code === 'auth/invalid-credential' || err.code === 'auth/invalid-email') {
                    setError('Correo o contraseña incorrectos.');
                } else if (err.code === 'auth/user-disabled') {
                    setError('Esta cuenta ha sido deshabilitada.');
                } else if (err.code === 'auth/too-many-requests') {
                    setError('Demasiados intentos fallidos. Intente más tarde.');
                } else {
                    setError('Error al ingresar. Verifique sus datos.');
                }
            }
        }
    };

    /**
     * Fallback offline: verifica contraseña contra hash PBKDF2 local.
     * Solo se llama cuando Firebase falla por red (nunca por credenciales incorrectas).
     */
    const handleOfflineFallback = async (emailToUse) => {
        const result = await verifyOfflineCredentials(emailToUse, password);

        if (result === null) {
            // Sin historial en este dispositivo
            setError('Sin conexión: el primer ingreso requiere internet.');
            return;
        }

        if (!result.ok) {
            // Hash encontrado pero contraseña incorrecta
            setError('Contraseña incorrecta. Verifique sus datos.');
            return;
        }

        // Verificación offline exitosa → inyectar usuario virtual
        setOfflineUser({ email: result.email, displayName: result.displayName });
        navigate('/dashboard');
    };

    return (
        <div className="min-h-[100dvh] flex flex-col items-center justify-between bg-gradient-to-b from-[#3C7DA6] to-[#6FAF6B] p-4 sm:p-6 overflow-y-auto">

            {hasUpdate ? (
                /* Cuadro Bloqueante de Actualización (Ocupa el área de navegación y tarjeta) */
                <div className="w-full flex-1 flex flex-col items-center justify-center my-auto z-30 animate-fade-in max-w-md mx-auto px-2">
                    <div className="bg-white/95 backdrop-blur-md p-6 sm:p-8 rounded-3xl shadow-2xl border border-white/40 w-full flex flex-col items-center text-center relative overflow-hidden">
                        <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-4 shadow-inner border border-blue-100">
                            <RefreshCw size={32} className={isUpdating ? "animate-spin text-blue-600" : "text-blue-600"} />
                        </div>
                        
                        <h2 className="text-2xl font-bold text-gray-800 mb-2">
                            Nueva versión disponible
                        </h2>
                        
                        <p className="text-sm text-gray-600 mb-4 leading-relaxed">
                            Existe una actualización del sistema. Para continuar ingresando y asegurar la sincronización, por favor actualiza la aplicación.
                        </p>

                        <button
                            onClick={handleUpdate}
                            disabled={isUpdating}
                            className="w-full py-3.5 px-6 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center gap-2.5 text-base cursor-pointer disabled:opacity-60 mb-4"
                        >
                            <RefreshCw size={18} className={isUpdating ? "animate-spin" : ""} />
                            <span>{isUpdating ? "Actualizando..." : "Actualizar"}</span>
                        </button>

                        {/* Instrucciones de recarga con atajos de teclado */}
                        <div className="w-full p-3.5 bg-blue-50/80 border border-blue-200/80 rounded-xl text-blue-900 text-xs sm:text-[13px] leading-relaxed shadow-sm">
                            <p className="font-medium">
                                Por favor, presiona las teclas <span className="font-bold text-blue-950">"Ctrl + F5"</span> (en Windows) o <span className="font-bold text-blue-950">"Cmd + Shift + R"</span> (en Mac) para limpiar la memoria de esta página y actualizar.
                            </p>
                        </div>

                        <button
                            onClick={clearAppCache}
                            className="mt-4 text-xs text-gray-500 hover:text-red-600 underline font-medium transition cursor-pointer"
                        >
                            ¿Problemas al actualizar? Limpiar memoria
                        </button>
                    </div>
                </div>
            ) : (
                <>
                    {/* Cabecera / Navegación */}
                    <div className="w-full flex flex-col items-center gap-2 mb-2 z-10 shrink-0">
                        <div className="w-full flex justify-center gap-1.5 sm:gap-4 flex-wrap">
                        {isLicenseValid && (
                            <button
                                onClick={() => { setAdminTarget('/registro'); setShowAdminModal(true); }}
                                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg border border-white/30 backdrop-blur-sm transition text-[10px] sm:text-xs font-bold whitespace-nowrap"
                            >
                                <Settings size={14} />
                                REGISTRO
                            </button>
                        )}
                        <button
                            onClick={() => { setAdminTarget('/datos'); setShowAdminModal(true); }}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg border border-white/30 backdrop-blur-sm transition text-[10px] sm:text-xs font-bold whitespace-nowrap"
                        >
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                            </span>
                            EN VIVO
                        </button>
                        <button
                            onClick={() => { setAdminTarget('/informes'); setShowAdminModal(true); }}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg border border-white/30 backdrop-blur-sm transition text-[10px] sm:text-xs font-bold whitespace-nowrap"
                        >
                            <Settings size={14} />
                            INFORMES
                        </button>
                        <button
                            onClick={() => { setAdminTarget('/configuracion'); setShowAdminModal(true); }}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-purple-500/80 hover:bg-purple-600/80 text-white rounded-lg border border-purple-300/50 backdrop-blur-sm transition text-[10px] sm:text-xs font-bold whitespace-nowrap"
                        >
                            <Settings size={14} />
                            CONFIG
                        </button>
                        </div>
                    </div>

                    <AdminPasswordModal
                        isOpen={showAdminModal}
                        target={adminTarget}
                        onClose={() => setShowAdminModal(false)}
                        onSuccess={() => {
                            setShowAdminModal(false);
                            navigate(adminTarget);
                        }}
                    />

                    {/* Tarjeta Principal */}
                    <div className="w-full flex-1 flex items-center justify-center">
                        <div className="bg-white p-6 sm:p-8 pt-16 sm:pt-20 rounded-2xl shadow-xl w-full max-w-md backdrop-blur-sm bg-opacity-90 flex flex-col items-center relative overflow-hidden z-20 my-auto">
                        <img
                            src="/LogolFaceContro.jpg"
                            alt="ControlFace Logo"
                            className="absolute top-4 left-4 sm:top-5 sm:left-5 w-32 sm:w-36 object-contain opacity-80"
                        />
                        <img
                            src={import.meta.env.VITE_CLIENT_LOGO_URL || "/logo.jpg"}
                            alt="Logo"
                            className="w-auto max-w-[240px] max-h-32 mb-1 rounded-xl object-contain relative z-10"
                        />
                        <h2 className="text-3xl font-bold text-center mb-2 text-gray-800 w-full relative z-10 mt-1">
                            {import.meta.env.VITE_CLIENT_NAME || "Acceso Empleados"}
                        </h2>
                        <h3 className="text-sm text-gray-500 font-medium mb-6 uppercase tracking-wider">
                            Panel de Acceso
                        </h3>
                        {/* Banner sin conexión */}
                        {isOffline && (
                            <div className="flex items-center gap-2 bg-orange-50 border border-orange-300 text-orange-800 text-xs font-medium p-3 rounded-lg mb-3 w-full">
                                <WifiOff size={14} className="shrink-0 text-orange-500" />
                                <span>Sin conexión — si ya ingresaste antes, puedes continuar.</span>
                            </div>
                        )}
                        {error && <div className="bg-red-100 text-red-700 p-3 rounded mb-4 w-full">{error}</div>}
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Usuario / ID</label>
                                <input
                                    type="text"
                                    required
                                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="Ej: nuevo@usuario.com"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Contraseña</label>
                                <div className="relative mt-1">
                                    <input
                                        type={showPassword ? "text" : "password"}
                                        required
                                        className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 pr-10"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                    />
                                    <button
                                        type="button"
                                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                                        onClick={() => setShowPassword(!showPassword)}
                                    >
                                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                    </button>
                                </div>
                            </div>
                            {isLicenseValid ? (
                                <button
                                    type="submit"
                                    className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition duration-150"
                                >
                                    Ingresar
                                </button>
                            ) : (
                                <div className="w-full text-center py-3 px-4 border border-red-400 rounded-lg bg-red-50 text-red-700 text-sm font-bold">
                                    ⚠️ ACCESO DESHABILITADO POR LICENCIA VENCIDA
                                </div>
                            )}
                        </form>

                        {(showInstallBtn && !isStandalone) && (
                            <div className="mt-6 w-full flex flex-col gap-3">
                                <button
                                    onClick={handleInstallClick}
                                    className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-green-500 text-white rounded-xl font-bold hover:bg-green-600 transition shadow-lg border-b-4 border-green-700 animate-bounce active:translate-y-1 active:border-b-0"
                                >
                                    + DESCARGAR APP EN CELULAR
                                </button>
                                
                                {isAndroid && (
                                    <div className="bg-yellow-50 border border-yellow-200 p-3 rounded-lg text-[10px] text-yellow-800 leading-tight">
                                        <p className="font-bold mb-1">⚠️ IMPORTANTE PARA XIAOMI / REDMI:</p>
                                        <p>Si al tocar el botón no aparece nada en tu pantalla de inicio, debes ir a:</p>
                                        <p className="mt-1 font-mono bg-yellow-100 p-1 rounded">Ajustes &gt; Aplicaciones &gt; Gestionar apps &gt; Chrome &gt; Otros permisos &gt; <span className="font-bold underline">Accesos directos en pantalla de inicio</span> &gt; Marcar "Siempre permitir".</p>
                                    </div>
                                )}
                            </div>
                        )}

                        {(isIOS && !isStandalone && !showInstallBtn) && (
                            <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800 flex flex-col items-center gap-2 shadow-sm">
                                <p className="font-bold text-center">Para descargar en iPhone:</p>
                                <p className="text-center italic">Toca el botón <span className="font-bold">Compartir</span> (cuadrado con flecha) y luego <span className="font-bold">'Añadir a pantalla de inicio'</span>.</p>
                            </div>
                        )}
                        </div>
                    </div>
                </>
            )}

            {/* Pie de página */}
            <div className="w-full flex flex-col items-center gap-1 opacity-90 px-4 mt-6 z-10 shrink-0 text-center">
                <span className="text-[10px] sm:text-[11px] font-bold text-white tracking-widest uppercase mb-1 drop-shadow-md">
                    ControlFace - Tel: 3158059309 | 3138902908
                </span>
                <button onClick={clearAppCache} className="text-[10px] text-white font-bold bg-red-600 hover:bg-red-700 px-3 py-1 rounded-lg shadow-lg active:scale-95 transition-all duration-200 uppercase tracking-wider font-sans mb-1">Limpiar App si no se actualiza</button>
                <span
                    className="text-[9px] text-white/70 font-mono"
                >
                    Versión: {import.meta.env.VITE_APP_VERSION || '1.3.1'}
                </span>
                <button
                    onClick={() => navigate('/privacidad', { state: { from: 'login' } })}
                    className="mt-3 mb-2 px-3 py-1.5 flex items-center gap-1.5 text-xs text-white/90 font-medium bg-black/20 rounded-full hover:bg-black/40 hover:text-white border border-white/10 hover:border-white/30 backdrop-blur-sm transition-all duration-300 shadow-sm"
                >
                    <Shield size={14} />
                    Privacidad y Tratamiento de Datos
                </button>
            </div>
        </div>
    );
}
