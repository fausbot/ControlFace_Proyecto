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

    // Hardcoded for demo if Firebase fails or is not setup, 
    // but logic handles real firebase auth.

    const [adminAccess, setAdminAccess] = useState({
        '/registro': false,
        '/datos': false,
        '/configuracion': false
    });

    // Mantenemos esto temporalmente por retrocompatibilidad mientras migramos otras páginas
    const isAdminAuthenticated = Object.values(adminAccess).some(val => val === true);

    function grantAccess(route) {
        setAdminAccess(prev => ({ ...prev, [route]: true }));
    }

    function revokeAllAccess() {
        setAdminAccess({ '/registro': false, '/datos': false, '/configuracion': false });
    }

    function login(email, password) {
        return signInWithEmailAndPassword(auth, email, password);
    }

    function logout() {
        revokeAllAccess();
        return signOut(auth);
    }

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            setCurrentUser(user);
            setLoading(false);
        });

        return unsubscribe;
    }, []);

    const value = {
        currentUser,
        login,
        logout,
        adminAccess,
        grantAccess,
        revokeAllAccess,
        isAdminAuthenticated // deprecated soon
    };

    return (
        <AuthContext.Provider value={value}>
            {!loading && children}
        </AuthContext.Provider>
    );
}
