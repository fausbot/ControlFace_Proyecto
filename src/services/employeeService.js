// src/services/employeeService.js
// Toda la lógica de Firestore relacionada con empleados.

import { db } from '../firebaseConfig';
import {
    collection,
    getDocs,
    doc,
    writeBatch,
    serverTimestamp
} from 'firebase/firestore';

const COLLECTION = 'employees';

// ─────────────────────────────────────────────
// Trae todos los empleados y los devuelve
// como un Map email → { firstName, lastName }
// (útil para cruzar con logs de asistencia)
// ─────────────────────────────────────────────
export const getEmployeesMap = async () => {
    const snapshot = await getDocs(collection(db, COLLECTION));
    const map = {};
    snapshot.forEach(d => {
        const data = d.data();
        if (data.email) {
            map[data.email.toLowerCase().trim()] = {
                firstName: data.firstName || '',
                lastName: data.lastName || ''
            };
        }
    });
    return map;
};

// ─────────────────────────────────────────────
// Verifica si la colección de empleados está vacía
// y, si es así, intenta restaurarlos desde el
// historial de asistencia (excluyendo los borrados).
// Devuelve la cantidad de empleados restaurados.
// ─────────────────────────────────────────────
export const checkAndRestoreEmployees = async () => {
    const empSnap = await getDocs(collection(db, COLLECTION));
    if (!empSnap.empty) return 0; // Nada que restaurar

    console.log('Empleados vacíos. Iniciando auto-restauración...');

    // 1. Emails que fueron borrados intencionalmente
    const queueSnap = await getDocs(collection(db, 'deletionQueue'));
    const deletedEmails = new Set();
    queueSnap.forEach(d => {
        const email = d.data().email;
        if (email) deletedEmails.add(email.toLowerCase().trim());
    });

    // 2. Emails únicos del historial de asistencia
    const attSnap = await getDocs(collection(db, 'attendance'));
    const uniqueEmails = new Set();
    attSnap.forEach(d => {
        const email = d.data().usuario?.toLowerCase().trim();
        if (email && !deletedEmails.has(email)) {
            uniqueEmails.add(email);
        }
    });

    if (uniqueEmails.size === 0) return 0;

    // 3. Restaurar en batch
    const batch = writeBatch(db);
    uniqueEmails.forEach(email => {
        const newDocRef = doc(collection(db, COLLECTION));
        batch.set(newDocRef, {
            email,
            fechaCreacion: serverTimestamp(),
            estado: 'activo'
        });
    });
    await batch.commit();

    console.log(`Restaurados ${uniqueEmails.size} empleados.`);
    return uniqueEmails.size;
};
