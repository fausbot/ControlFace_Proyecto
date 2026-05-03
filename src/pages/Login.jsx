import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

import { Settings, Shield } from 'lucide-react';
import AdminPasswordModal from '../components/AdminPasswordModal';
import { fetchLicenseStatus } from '../services/licenseService';

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const { login, logout } = useAuth();
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
    const [isUpdating, setIsUpdating] = useState(false);
    const [updateMessage, setUpdateMessage] = useState('Buscando actualizaciones...');

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

        // LOGICA DE AUTO-ACTUALIZACION
        const checkVersion = async () => {
            const currentVersion = import.meta.env.VITE_APP_VERSION || '1.6.16';
            const savedVersion = localStorage.getItem('app_version');

            // NUEVO: Verificación directa contra el servidor para romper el caché silencioso
            try {
                const response = await fetch('/version.json?t=' + Date.now());
                if (response.ok) {
                    const data = await response.json();
                    if (data.version && data.version !== currentVersion) {
                        setIsUpdating(true);
                        const userAgent = window.navigator.userAgent.toLowerCase();
                        
                        if (userAgent.includes('windows') || userAgent.includes('macintosh') || userAgent.includes('mac os')) {
                            setUpdateMessage('ESTÁS USANDO UNA VERSIÓN ANTIGUA O EN CACHÉ.\n\nPor favor, presiona las teclas "Ctrl + F5" (en Windows) o "Cmd + Shift + R" (en Mac) para limpiar la memoria de esta página y actualizar.');
                        } else if (userAgent.includes('iphone') || userAgent.includes('ipad')) {
                            setUpdateMessage('ESTÁS USANDO UNA VERSIÓN ANTIGUA O EN CACHÉ.\n\nCierra esta aplicación por completo (deslizándola hacia arriba desde la multitarea) y vuelve a abrirla. Si el aviso persiste, toca el botón de "Limpiar App" abajo.');
                        } else {
                            setUpdateMessage('ESTÁS USANDO UNA VERSIÓN ANTIGUA O EN CACHÉ.\n\nToca el texto en la parte inferior de la pantalla que dice "Limpiar App si no se actualiza" para forzar la actualización en tu Android.');
                        }
                        return; // Detenemos aquí para que la pantalla quede bloqueada hasta que el usuario siga los pasos
                    }
                }
            } catch (err) {
                console.log("No se pudo verificar version.json (probablemente offline)", err);
            }

            if (savedVersion && savedVersion !== currentVersion) {
                setIsUpdating(true);
                const userAgent = window.navigator.userAgent.toLowerCase();
                const isiPhone = userAgent.includes('iphone');
                const isAndroid = userAgent.includes('android');

                if (isiPhone) {
                    setUpdateMessage('iOS: Optimizando memoria...');
                } else if (isAndroid) {
                    setUpdateMessage('Android: Aplicando actualización...');
                } else {
                    setUpdateMessage('PC: Actualizando sistema...');
                }

                // Esperar un momento muy corto (0.4s) antes de recargar
                setTimeout(() => {
                    // Importante: Guardar la versión antes de recargar para no entrar en loop
                    localStorage.setItem('app_version', currentVersion);
                    window.location.reload(true);
                }, 400);
            } else {
                localStorage.setItem('app_version', currentVersion);
            }
        };
        checkVersion();
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
            localStorage.clear();
            window.location.reload(true);
        }
    };

    useEffect(() => {
        const savedEmail = localStorage.getItem('saved_email');
        const savedPass = localStorage.getItem('saved_password');
        if (savedEmail) setEmail(savedEmail);
        if (savedPass) setPassword(atob(savedPass)); // Decodificar simple
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!isLicenseValid) {
            setError('Acceso bloqueado: La licencia del sistema se encuentra caducada.');
            return;
        }

        try {
            setError('');
            let emailToUse = email.trim().toLowerCase();

            const userCredential = await login(emailToUse, password);
            const user = userCredential.user;

            // Verificar lista blanca en Firestore (BLOQUEO DE COLA DE BORRADO)
            const { db } = await import('../firebaseConfig');
            const { collection, query, where, getDocs } = await import('firebase/firestore');

            const q = query(collection(db, "employees"), where("email", "==", user.email));
            const querySnapshot = await getDocs(q);

            if (querySnapshot.empty) {
                await logout();
                setError('Acceso denegado: Usuario no autorizado o dado de baja.');
                return;
            }

            // GUARDAR CREDENCIALES SI EL LOGIN ES EXITOSO
            localStorage.setItem('saved_email', emailToUse);
            localStorage.setItem('saved_password', btoa(password)); // Codificar simple para evitar texto plano obvio

            navigate('/dashboard');
        } catch (err) {
            setError('Error al ingresar: Verifique sus datos');
            console.error(err);
        }
    };

    return (
        <div className="min-h-[100dvh] flex flex-col items-center justify-between bg-gradient-to-b from-[#3C7DA6] to-[#6FAF6B] p-4 sm:p-6 overflow-y-auto">

            {/* Cabecera / Navegación */}
            <div className="w-full flex justify-center gap-1.5 sm:gap-4 flex-wrap mb-4 z-10 shrink-0">
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
                {/* Overlay de Actualización Confinado a la Tarjeta */}
                {isUpdating && (
                    <div className="absolute inset-0 z-[100] bg-blue-900/95 backdrop-blur-md flex flex-col items-center justify-center text-white p-6 text-center">
                        <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin mb-4"></div>
                        <h2 className="text-xl font-bold mb-2 text-yellow-300">¡Nueva versión encontrada!</h2>
                        <p className="text-blue-50 font-medium mb-6 whitespace-pre-line leading-relaxed text-sm">{updateMessage}</p>
                        
                        {updateMessage.includes('Ctrl') ? (
                            <button onClick={() => window.location.reload(true)} className="px-4 py-2 bg-white text-blue-900 rounded-full font-bold text-sm shadow-lg hover:bg-gray-200 transition">
                                Intentar Carga Forzada
                            </button>
                        ) : (
                            <p className="text-xs opacity-70 italic mt-4 bg-black/20 p-2 rounded-lg border border-white/10 text-center">Sigue las instrucciones inferiores fuera este recuadro para actualizar.</p>
                        )}
                    </div>
                )}
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
                        <input
                            type="password"
                            required
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
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

            {/* Pie de página */}
            <div className="w-full flex flex-col items-center gap-1 opacity-90 px-4 mt-6 z-10 shrink-0 text-center">
                <span className="text-[10px] sm:text-[11px] font-bold text-white tracking-widest uppercase mb-1 drop-shadow-md">
                    ControlFace - Tel: 3158059309 | 3138902908
                </span>
                <span className="text-[10px] text-white font-mono bg-red-600 px-2 py-0.5 rounded shadow-lg animate-pulse">Versión: {import.meta.env.VITE_APP_VERSION || '1.3.1'}</span>
                <button
                    onClick={clearAppCache}
                    className="text-[9px] text-white underline decoration-white/30 hover:text-white/80 transition"
                >
                    Limpiar App si no se actualiza
                </button>
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
