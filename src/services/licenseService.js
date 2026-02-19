// src/services/licenseService.js
import CryptoJS from 'crypto-js';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';

// CLAVE DE LECTURA (Debe coincidir con la del generador)
// Ofuscamos un poco separando el string
const P1 = "S3cr3t_K3y_";
const P2 = "M4st3r_P4r4_";
const P3 = "L1c3nc14s_V1";
const READ_KEY = P1 + P2 + P3;

const CACHE_KEY = 'app_lic_status';
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 horas

export const checkLicenseStatus = async () => {
    // 1. Verificar Caché Local
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
        try {
            const data = JSON.parse(cached);
            const now = new Date().getTime();
            // Si el caché es válido y reciente
            if (data.status === 'valid' && (now - data.timestamp) < CACHE_DURATION_MS) {
                console.log("✅ Licencia válida (desde caché).");
                return { valid: true };
            } else {
                console.log("⚠️ Caché expirado o inválido. Revalidando...");
                localStorage.removeItem(CACHE_KEY);
            }
        } catch (e) {
            console.error("❌ Error leyendo caché:", e);
            localStorage.removeItem(CACHE_KEY);
        }
    }

    // 2. Si no hay caché válido, consultar Firebase
    console.log("🔍 Verificando licencia en servidor Firebase...");
    try {
        const docRef = doc(db, 'settings', 'license');
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
            console.error("❌ Documento de licencia NO encontrado en Firestore.");
            return { valid: false, message: "Licencia no instalada en el sistema." };
        }

        const token = docSnap.data().token;
        if (!token) {
            console.error("❌ Campo 'token' vacío en la licencia.");
            return { valid: false, message: "Token de licencia vacío." };
        }

        // 3. Desencriptar
        let decryptedData;
        try {
            const bytes = CryptoJS.AES.decrypt(token, READ_KEY);
            const text = bytes.toString(CryptoJS.enc.Utf8);
            if (!text) throw new Error("Token inválido o clave incorrecta");
            decryptedData = JSON.parse(text);
        } catch (cryptoError) {
            console.error("❌ Error desencriptando token:", cryptoError);
            return { valid: false, message: "Licencia corrupta o manipulada." };
        }

        const expirationDate = new Date(decryptedData.e); // 'e' es expires
        const today = new Date();

        // Resetear horas para comparar solo fechas
        today.setHours(0, 0, 0, 0);

        if (expirationDate < today) {
            console.error(`❌ Licencia expirada. Venció: ${decryptedData.e}`);
            return { valid: false, message: "Su licencia ha expirado el " + decryptedData.e };
        }

        // 4. Guardar en Caché si es válido
        console.log("✅ Licencia válida verificada con servidor.");
        localStorage.setItem(CACHE_KEY, JSON.stringify({
            status: 'valid',
            timestamp: new Date().getTime()
        }));

        return { valid: true };

    } catch (error) {
        console.error("❌ Error general verificando licencia:", error);
        return { valid: false, message: "Error al conectar con el servidor de licencias." };
    }
};
