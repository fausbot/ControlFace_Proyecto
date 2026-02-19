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
                console.log("Licencia válida (desde caché).");
                return { valid: true };
            }
        } catch (e) {
            localStorage.removeItem(CACHE_KEY); // Corrupto, borrar
        }
    }

    // 2. Si no hay caché válido, consultar Firebase
    console.log("Verificando licencia en servidor...");
    try {
        const docRef = doc(db, 'settings', 'license');
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
            return { valid: false, message: "Licencia no encontrada." };
        }

        const token = docSnap.data().token;
        if (!token) {
            return { valid: false, message: "Token de licencia vacío." };
        }

        // 3. Desencriptar
        const bytes = CryptoJS.AES.decrypt(token, READ_KEY);
        const decryptedData = JSON.parse(bytes.toString(CryptoJS.enc.Utf8));

        const expirationDate = new Date(decryptedData.e); // 'e' es expires
        const today = new Date();

        // Resetear horas para comparar solo fechas
        today.setHours(0, 0, 0, 0);

        if (expirationDate < today) {
            return { valid: false, message: "Su licencia ha expirado el " + decryptedData.e };
        }

        // 4. Guardar en Caché si es válido
        localStorage.setItem(CACHE_KEY, JSON.stringify({
            status: 'valid',
            timestamp: new Date().getTime()
        }));

        return { valid: true };

    } catch (error) {
        console.error("Error verificando licencia:", error);
        return { valid: false, message: "Error de validación o licencia corrupta." };
    }
};
