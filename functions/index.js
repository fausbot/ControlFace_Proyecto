const functions = require("firebase-functions");
const admin = require("firebase-admin");
const bcrypt = require("bcrypt");
const CryptoJS = require("crypto-js");

admin.initializeApp();

/**
 * Función para obtener la lista de todos los usuarios de Authentication.
 * Útil para exportar CSV con la lista real de usuarios.
 */
exports.getUsersList = functions.https.onCall(async (data, context) => {
    // Opcional: Verificar que el usuario esté autenticado (Se omite porque el admin usa React state)
    /* if (!context.auth) {
        throw new functions.https.HttpsError(
            "unauthenticated",
            "Debes estar autenticado para realizar esta acción."
        );
    } */

    try {
        const listUsersResult = await admin.auth().listUsers(1000);
        const users = listUsersResult.users.map(user => ({
            uid: user.uid,
            email: user.email,
            displayName: user.displayName || '',
            creationTime: user.metadata.creationTime,
            lastSignInTime: user.metadata.lastSignInTime
        }));

        return { users };
    } catch (error) {
        console.error("Error listando usuarios:", error);
        throw new functions.https.HttpsError(
            "internal",
            "Error al obtener la lista de usuarios."
        );
    }
});

/**
 * Función para eliminar un usuario de Authentication.
 * Útil para gestionar usuarios desde el panel de administración.
 */
exports.deleteUser = functions.https.onCall(async (data, context) => {
    /* if (!context.auth) {
        throw new functions.https.HttpsError(
            "unauthenticated",
            "Debes estar autenticado para realizar esta acción."
        );
    } */

    const { uid } = data;
    if (!uid) {
        throw new functions.https.HttpsError(
            "invalid-argument",
            "Se requiere el UID del usuario."
        );
    }

    try {
        // 1. Obtener el email del usuario ANTES de eliminarlo de Authentication
        const db = admin.firestore();
        const userRecord = await admin.auth().getUser(uid).catch(() => null);
        const userEmail = userRecord ? userRecord.email : null;

        // 2. Eliminar de Authentication
        await admin.auth().deleteUser(uid);

        if (userEmail) {
            // 3. Agregar a la cola de borrado en Firestore
            const queueRef = db.collection('deletionQueue').doc();
            await queueRef.set({
                email: userEmail.toLowerCase().trim(),
                deletedAt: admin.firestore.FieldValue.serverTimestamp(),
                uid: uid
            });

            // 4. Eliminar de la colección employees si existe
            const employeesQuery = db.collection('employees').where('email', '==', userEmail.toLowerCase().trim());
            const employeesSnapshot = await employeesQuery.get();

            if (!employeesSnapshot.empty) {
                const batch = db.batch();
                employeesSnapshot.forEach(doc => {
                    batch.delete(doc.ref);
                });
                await batch.commit();
            }
        }

        return { success: true };
    } catch (error) {
        console.error("Error eliminando usuario:", error);
        throw new functions.https.HttpsError(
            "internal",
            "Error al eliminar el usuario."
        );
    }
});

/**
 * Función para verificar la contraseña de administrador de manera segura.
 * Usa bcrypt para comparar contraseñas hasheadas.
 */
exports.verifyAdminPassword = functions.https.onCall(async (data, context) => {
    const { password, target = '' } = data;
    if (!password) {
        throw new functions.https.HttpsError(
            "invalid-argument",
            "Se requiere una contraseña."
        );
    }

    try {
        const db = admin.firestore();
        const configRef = db.collection('settings').doc('config');
        const docSnap = await configRef.get();

        let defaultStoredPassword = '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy'; // Hash de "perro456"
        let storedPassword = defaultStoredPassword;
        let isFallback = true;

        if (docSnap.exists) {
            const configData = docSnap.data();
            const defaultDBPassword = configData.adminPassword || defaultStoredPassword;

            // Mapear el target al nombre de la clave en DB
            let specificField = null;
            if (target === '/registro') specificField = 'adminPassword_registro';
            if (target === '/datos') specificField = 'adminPassword_datos';
            if (target === '/configuracion') specificField = 'adminPassword_configuracion';

            if (specificField && configData[specificField]) {
                storedPassword = configData[specificField];
                isFallback = false;
            } else {
                // Fallback a la clave de master general compartida
                storedPassword = defaultDBPassword;
            }

            // Guardar solo si el master no estaba en BD y estamos usándolo
            if (isFallback && !configData.adminPassword) {
                await configRef.set({ adminPassword: defaultStoredPassword }, { merge: true });
            }
        } else {
            // Si no existe el doc, lo creamos con el hash por defecto
            await configRef.set({ adminPassword: defaultStoredPassword });
        }

        // Verificar si es un hash de bcrypt (empieza con $2b$ o $2a$)
        const isBcryptHash = storedPassword.startsWith('$2b$') || storedPassword.startsWith('$2a$');

        let isValid = false;
        if (isBcryptHash) {
            // Usar bcrypt para comparar
            isValid = await bcrypt.compare(password.trim(), storedPassword);
        } else {
            // Compatibilidad temporal con texto plano
            isValid = password.trim() === storedPassword.trim();
        }

        if (isValid) {
            return { success: true };
        } else {
            return { success: false };
        }
    } catch (error) {
        console.error("Error verificando contraseña:", error);
        throw new functions.https.HttpsError(
            "internal",
            "Error interno al verificar credenciales."
        );
    }
});

/**
 * Función para cambiar la contraseña de administrador.
 * Requiere la contraseña actual para autorizar el cambio.
 */
exports.changeAdminPassword = functions.https.onCall(async (data, context) => {
    const { currentPassword, newPassword, target = 'todas' } = data;

    if (!currentPassword || !newPassword) {
        throw new functions.https.HttpsError(
            "invalid-argument",
            "Se requieren la contraseña actual y la nueva contraseña."
        );
    }

    if (newPassword.length < 6) {
        throw new functions.https.HttpsError(
            "invalid-argument",
            "La nueva contraseña debe tener al menos 6 caracteres."
        );
    }

    try {
        const db = admin.firestore();
        const configRef = db.collection('settings').doc('config');
        const docSnap = await configRef.get();

        if (!docSnap.exists) {
            throw new functions.https.HttpsError(
                "not-found",
                "Configuración no encontrada."
            );
        }

        const configData = docSnap.data();

        // Mapear el target actual al campo que debemos validar para autorizar el cambio
        let specificFieldValidation = null;
        if (target === '/registro') specificFieldValidation = 'adminPassword_registro';
        if (target === '/datos') specificFieldValidation = 'adminPassword_datos';
        if (target === '/configuracion') specificFieldValidation = 'adminPassword_configuracion';

        // Determinar qué contraseña se debe verificar como "Actual"
        let storedPasswordToVerify = configData.adminPassword; // Fallback
        if (specificFieldValidation && configData[specificFieldValidation]) {
            storedPasswordToVerify = configData[specificFieldValidation];
        }

        // Verificar contraseña actual
        const isBcryptHash = storedPasswordToVerify.startsWith('$2b$') || storedPasswordToVerify.startsWith('$2a$');
        let isCurrentValid = false;

        if (isBcryptHash) {
            isCurrentValid = await bcrypt.compare(currentPassword.trim(), storedPasswordToVerify);
        } else {
            isCurrentValid = currentPassword.trim() === storedPasswordToVerify.trim();
        }

        if (!isCurrentValid) {
            return {
                success: false,
                error: "La contraseña actual es incorrecta."
            };
        }

        // Generar hash de la nueva contraseña
        const saltRounds = 10;
        const newHash = await bcrypt.hash(newPassword.trim(), saltRounds);

        // Guardar el nuevo hash según el target
        let updates = {};
        if (target === 'todas') {
            updates = {
                adminPassword: newHash,
                adminPassword_registro: newHash,
                adminPassword_datos: newHash,
                adminPassword_configuracion: newHash
            };
        } else if (specificFieldValidation) {
            updates[specificFieldValidation] = newHash;
        }

        await configRef.update(updates);

        console.log("Contraseña de administrador cambiada exitosamente");
        return { success: true };

    } catch (error) {
        console.error("Error cambiando contraseña:", error);
        throw new functions.https.HttpsError(
            "internal",
            "Error interno al cambiar la contraseña."
        );
    }
});



/**
 * Función protegida para crear empleados validando el Token de Licencia.
 * Evita que un cliente cree usuarios superando su límite contratado.
 */
exports.createEmployeeSecure = functions.https.onCall(async (data, context) => {
    // 1. Autorización: Opcional, asegurar que sea admin (Se omite porque el admin usa React state)
    /* if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Debe iniciar sesión primero.");
    } */

    const { email, password, firstName, lastName, faceDescriptor, extraFields } = data;
    if (!email || !password || !faceDescriptor) {
        throw new functions.https.HttpsError("invalid-argument", "Faltan datos obligatorios (Email, Contraseña o Rostro).");
    }

    try {
        const db = admin.firestore();

        // 2. Leer la licencia actual
        const licenseSnap = await db.collection("settings").doc("license").get();
        if (!licenseSnap.exists || !licenseSnap.data().token) {
            throw new functions.https.HttpsError("permission-denied", "No hay una licencia instalada en el sistema.");
        }

        const rawToken = licenseSnap.data().token;
        const SECRET_KEY = functions.config().keys ? functions.config().keys.license_secret : "ZAPATO_ROJO_MASTER_KEY_2026";

        // 3. Desencriptar Token
        let decoded = null;
        try {
            const bytes = CryptoJS.AES.decrypt(rawToken, SECRET_KEY);
            const decryptedString = bytes.toString(CryptoJS.enc.Utf8);
            decoded = JSON.parse(decryptedString);
        } catch (err) {
            throw new functions.https.HttpsError("permission-denied", "El token de licencia está corrupto o es inválido.");
        }

        if (!decoded || !decoded.maxEmployees || !decoded.expirationDate) {
            throw new functions.https.HttpsError("permission-denied", "El token no tiene un formato válido.");
        }

        // 4. Validar Fecha de Expiración
        const today = new Date();
        const expiration = new Date(decoded.expirationDate);
        if (today > expiration) {
            throw new functions.https.HttpsError("permission-denied", `Su licencia expiró el ${decoded.expirationDate}. Contacte a ${decoded.providerName}.`);
        }

        // 5. Contar Empleados Actuales
        const listUsersResult = await admin.auth().listUsers(1000);
        const currentCount = listUsersResult.users.length;

        // 6. Validar Límite con Gabela (Buffer)
        const maxEmp = parseInt(decoded.maxEmployees, 10);
        const bufferPct = parseInt(decoded.bufferPercentage || 0, 10);
        const absoluteMax = maxEmp + Math.ceil(maxEmp * (bufferPct / 100));

        if (currentCount >= absoluteMax) {
            throw new functions.https.HttpsError("resource-exhausted", `Límite absoluto de ${absoluteMax} alcanzado (Contrato: ${maxEmp} + ${bufferPct}% de cortesía). Contacte a ${decoded.providerName}.`);
        }

        // 7. FLUJO DE CREACIÓN - Límite Aprobado
        // A. Crear usuario en Auth
        const userRecord = await admin.auth().createUser({
            email: email.toLowerCase().trim(),
            password: password,
            displayName: `${firstName} ${lastName}`.trim()
        });

        // B. Guardar en Firestore
        await db.collection("employees").add({
            email: userRecord.email,
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            fechaCreacion: admin.firestore.FieldValue.serverTimestamp(),
            faceDescriptor: faceDescriptor,
            ...(extraFields || {})
        });

        return { success: true, uid: userRecord.uid, message: "Empleado creado exitosamente." };

    } catch (error) {
        console.error("Error en createEmployeeSecure:", error);

        // Si el usuario ya existe en Auth, lanzamos el error amigable
        if (error.code === 'auth/email-already-exists') {
            throw new functions.https.HttpsError("already-exists", "El correo ya está registrado.");
        }

        // Re-lanzar los errores controlados de Firebase Functions
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }

        throw new functions.https.HttpsError("internal", "Logica de creación fallida: " + error.message);
    }
});
