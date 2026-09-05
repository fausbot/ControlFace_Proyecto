import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth } from '../firebaseConfig';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';

const AuthContext = createContext();

export function useAuth() {
    return useContext(AuthContext);
}

export function AuthProvider({ children }) {
    const [currentUser, setCurrentUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isOfflineUser, setIsOfflineUser] = useState(false);

    const [adminAccess, setAdminAccess] = useState({
        '/registro': false,
        '/datos': false,
        '/informes': false,
        '/configuracion': false,
        '/turnos': false
    });

    // Mantenemos esto temporalmente por retrocompatibilidad mientras migramos otras páginas
    const isAdminAuthenticated = Object.values(adminAccess).some(val => val === true);

    function grantAccess(route) {
        setAdminAccess(prev => ({ ...prev, [route]: true }));
    }

    function revokeAllAccess() {
        setAdminAccess({
            '/registro': false,
            '/datos': false,
            '/informes': false,
            '/configuracion': false,
            '/turnos': false
        });
    }

    function login(email, password) {
        return signInWithEmailAndPassword(auth, email, password);
    }

    /**
     * Inyecta un usuario virtual offline compatible con currentUser de Firebase.
     * Llamar desde Login.jsx cuando verifyOfflineCredentials retorna { ok: true }.
     * @param {{ email: string, displayName: string }} userData
     */
    function setOfflineUser({ email, displayName }) {
        const virtualUser = {
            email,
            displayName: displayName || email,
            uid: `offline_${email.replace(/[^a-zA-Z0-9]/g, '_')}`,
            isOffline: true,
        };
        try {
            localStorage.setItem('offline_session_user', JSON.stringify(virtualUser));
        } catch (e) {
            console.warn('[Auth] No se pudo persistir sesión offline:', e);
        }
        setCurrentUser(virtualUser);
        setIsOfflineUser(true);
    }

    function logout() {
        revokeAllAccess();
        try {
            localStorage.removeItem('offline_session_user');
        } catch (e) {
            console.warn('[Auth] Error limpiando sesión offline:', e);
        }
        if (isOfflineUser) {
            // Sesión offline: solo limpiar el estado local, no llamar a Firebase
            setCurrentUser(null);
            setIsOfflineUser(false);
            return Promise.resolve();
        }
        return signOut(auth);
    }

    useEffect(() => {
        // Intentar restaurar sesión offline si existe en almacenamiento local
        try {
            const savedOffline = localStorage.getItem('offline_session_user');
            if (savedOffline) {
                const parsed = JSON.parse(savedOffline);
                if (parsed && parsed.email) {
                    setCurrentUser(parsed);
                    setIsOfflineUser(true);
                    setLoading(false);
                }
            }
        } catch (e) {
            console.warn('[Auth] Error leyendo sesión offline guardada:', e);
        }

        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (user) {
                // Usuario autenticado por Firebase en línea
                setCurrentUser(user);
                setIsOfflineUser(false);
                try {
                    localStorage.removeItem('offline_session_user');
                } catch (e) {}
            } else {
                // Si Firebase da null pero teníamos sesión offline en localStorage, mantenerla
                const savedOffline = localStorage.getItem('offline_session_user');
                if (savedOffline) {
                    try {
                        const parsed = JSON.parse(savedOffline);
                        if (parsed && parsed.email) {
                            setCurrentUser(parsed);
                            setIsOfflineUser(true);
                        } else {
                            setCurrentUser(null);
                        }
                    } catch {
                        setCurrentUser(null);
                    }
                } else if (!isOfflineUser) {
                    setCurrentUser(null);
                }
            }
            setLoading(false);
        });

        return unsubscribe;
    }, [isOfflineUser]);


    const value = {
        currentUser,
        login,
        logout,
        adminAccess,
        grantAccess,
        revokeAllAccess,
        isAdminAuthenticated, // deprecated soon
        isOfflineUser,
        setOfflineUser,
    };

    return (
        <AuthContext.Provider value={value}>
            {!loading && children}
        </AuthContext.Provider>
    );
}
