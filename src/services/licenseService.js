import CryptoJS from 'crypto-js';
import { db } from '../firebaseConfig';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const SECRET_KEY = import.meta.env.VITE_LICENSE_SECRET;

/**
 * Desencripta de forma segura el token guardado en Firebase.
 * Retorna null si la clave es inválida, si falta o no cuadra el secreto.
 */
export const decodeLicenseToken = (token) => {
    if (!token) return null;
    try {
        const bytes = CryptoJS.AES.decrypt(token, SECRET_KEY);
        const decryptedStr = bytes.toString(CryptoJS.enc.Utf8);
        if (!decryptedStr) return null;

        const payload = JSON.parse(decryptedStr);
        const maxEmp = parseInt(payload.maxEmployees, 10);
        const bufferPct = parseInt(payload.bufferPercentage || 0, 10);
        const absoluteMax = maxEmp + Math.ceil(maxEmp * (bufferPct / 100));

        return {
            maxEmployees: maxEmp,
            bufferPercentage: bufferPct,
            absoluteMaxEmployees: absoluteMax,
            expirationDate: payload.expirationDate, // Formato YYYY-MM-DD
            providerName: payload.providerName,
            providerPhone: payload.providerPhone,
            issueDate: payload.issueDate,
            isValid: true,
            isExpired: new Date(payload.expirationDate) < new Date(),
        };
    } catch (error) {
        console.error("Error desencriptando la licencia:", error);
        return null;
    }
};

/**
 * Lee el documento settings/license directo desde Firestore (Cache-first recomenado si es lectura constante)
 */
export const fetchLicenseStatus = async () => {
    try {
        const docRef = doc(db, 'settings', 'license');
        const snap = await getDoc(docRef);

        if (snap.exists() && snap.data().token) {
            const token = snap.data().token;
            return {
                rawToken: token,
                decoded: decodeLicenseToken(token)
            };
        }
        return { rawToken: null, decoded: null };
    } catch (error) {
        console.error("Error cargando licencia de la BD:", error);
        return { rawToken: null, decoded: null, error };
    }
};

/**
 * Instala un nuevo token de licencia provisto por el proveedor en la BD
 */
export const applyNewLicenseToken = async (newToken) => {
    try {
        // Validación previa
        const decoded = decodeLicenseToken(newToken);
        if (!decoded) throw new Error("Token inválido o corrupto. Verifique copiado.");

        const docRef = doc(db, 'settings', 'license');
        await setDoc(docRef, { token: newToken.trim() }, { merge: true });

        return decoded;
    } catch (error) {
        throw error;
    }
};
