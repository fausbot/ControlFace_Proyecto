// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, enableMultiTabIndexedDbPersistence } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);

// ── Firebase App Check (Protección invisible en segundo plano) ─────────────
const recaptchaSiteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;

if (typeof window !== 'undefined' && recaptchaSiteKey) {
    if (import.meta.env.DEV) {
        // En entorno local (localhost / dev), permite depurar sin generar falsos bloqueos
        self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
    }
    try {
        initializeAppCheck(app, {
            provider: new ReCaptchaEnterpriseProvider(recaptchaSiteKey),
            isTokenAutoRefreshEnabled: true // Renueva automáticamente el token de seguridad
        });
        console.log("🛡️ [AppCheck] Firebase App Check Enterprise activado en segundo plano.");
    } catch (err) {
        console.warn("🛡️ [AppCheck] Error al inicializar App Check:", err);
    }
}

// Habilitar persistencia offline de Firestore
enableMultiTabIndexedDbPersistence(db).catch((err) => {
    if (err.code === 'failed-precondition') {
        console.warn("Persistencia falló: Múltiples pestañas abiertas.");
    } else if (err.code === 'unimplemented') {
        console.warn("Persistencia no soportada por el navegador.");
    }
});
