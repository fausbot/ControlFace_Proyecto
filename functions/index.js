const functionsV1 = require("firebase-functions/v1");
const admin = require("firebase-admin");

admin.initializeApp();

/**
 * Función para obtener la lista de todos los usuarios de Authentication.
 * Útil para exportar CSV con la lista real de usuarios.
 */
exports.getUsersList = functionsV1.https.onCall(async (data, context) => {
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
        throw new functionsV1.https.HttpsError(
            "internal",
            "Error al obtener la lista de usuarios."
        );
    }
});

/**
 * Función para eliminar un usuario de Authentication.
 * Útil para gestionar usuarios desde el panel de administración.
 */
exports.deleteUser = functionsV1.https.onCall(async (data, context) => {
    const { uid } = data;
    if (!uid) {
        throw new functionsV1.https.HttpsError(
            "invalid-argument",
            "Se requiere el UID del usuario."
        );
    }

    try {
        const db = admin.firestore();
        const userRecord = await admin.auth().getUser(uid).catch(() => null);
        const userEmail = userRecord ? userRecord.email : null;

        // Eliminar de Authentication
        await admin.auth().deleteUser(uid);

        if (userEmail) {
            // Agregar a la cola de borrado en Firestore
            const queueRef = db.collection('deletionQueue').doc();
            await queueRef.set({
                email: userEmail.toLowerCase().trim(),
                deletedAt: admin.firestore.FieldValue.serverTimestamp(),
                uid: uid
            });

            // Eliminar de la colección employees si existe
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
        throw new functionsV1.https.HttpsError(
            "internal",
            "Error al eliminar el usuario."
        );
    }
});

/**
 * Función para verificar la contraseña de administrador de manera segura.
 * Usa bcrypt para comparar contraseñas hasheadas.
 */
exports.verifyAdminPassword = functionsV1.https.onCall(async (data, context) => {
    const { password, target = '' } = data;
    if (!password) {
        throw new functionsV1.https.HttpsError(
            "invalid-argument",
            "Se requiere una contraseña."
        );
    }

    try {
        const bcrypt = require("bcrypt");
        const db = admin.firestore();
        const configRef = db.collection('settings').doc('config');
        const docSnap = await configRef.get();

        const BOOTSTRAP_PASSWORD = "CF1234";
        let storedPassword = null;
        let configData = {};

        if (docSnap.exists) {
            configData = docSnap.data();

            // Determinar qué campo de contraseña buscar según el target
            let specificField = null;
            if (target === '/registro') specificField = 'adminPassword_registro';
            if (target === '/datos') specificField = 'adminPassword_datos';
            if (target === '/informes') specificField = 'adminPassword_informes';
            if (target === '/configuracion') specificField = 'adminPassword_configuracion';

            if (specificField) {
                // Si el target tiene un campo específico, usarlo SOLO si existe.
                // Si fue borrado en Firebase Console, storedPassword queda en null
                // y se activa el modo bootstrap (CF1234), sin hacer fallback al campo general.
                storedPassword = configData[specificField] || null;
            } else if (configData.adminPassword) {
                // Sin target específico, usar la contraseña general
                storedPassword = configData.adminPassword;
            }
        }

        // --- LÓGICA DE BOOTSTRAP (PRIMER INICIO) ---
        if (!storedPassword) {
            if (password.trim() === BOOTSTRAP_PASSWORD) {
                return { success: true };
            }
            return { success: false, error: "No hay clave configurada. Use la clave maestra de primer inicio." };
        }

        // --- LÓGICA NORMAL (BCRYPT O PLANO) ---
        const isBcryptHash = storedPassword.startsWith('$2b$') || storedPassword.startsWith('$2a$');
        let isValid = false;

        if (isBcryptHash) {
            isValid = await bcrypt.compare(password.trim(), storedPassword);
        } else {
            isValid = password.trim() === storedPassword.trim();
        }

        return { success: isValid };

    } catch (error) {
        console.error("Error verificando contraseña:", error);
        throw new functionsV1.https.HttpsError(
            "internal",
            "Error interno al verificar credenciales."
        );
    }
});

/**
 * Función para cambiar la contraseña de administrador.
 * Requiere la contraseña actual para autorizar el cambio.
 */
exports.changeAdminPassword = functionsV1.https.onCall(async (data, context) => {
    const { currentPassword, newPassword, target = 'todas' } = data;

    if (!currentPassword || !newPassword) {
        throw new functionsV1.https.HttpsError(
            "invalid-argument",
            "Se requieren la contraseña actual y la nueva contraseña."
        );
    }

    if (newPassword.length < 6) {
        throw new functionsV1.https.HttpsError(
            "invalid-argument",
            "La nueva contraseña debe tener al menos 6 caracteres."
        );
    }

    try {
        const bcrypt = require("bcrypt");
        const db = admin.firestore();
        const configRef = db.collection('settings').doc('config');
        const docSnap = await configRef.get();

        const configData = docSnap.exists ? docSnap.data() : {};
        const BOOTSTRAP_PASSWORD = "CF1234";

        // Mapear el target actual al campo que debemos validar
        let specificFieldValidation = null;
        if (target === '/registro') specificFieldValidation = 'adminPassword_registro';
        if (target === '/datos') specificFieldValidation = 'adminPassword_datos';
        if (target === '/informes') specificFieldValidation = 'adminPassword_informes';
        if (target === '/configuracion' || target === 'admin_only') specificFieldValidation = 'adminPassword_configuracion';

        // Determinar qué contraseña se debe verificar como "Actual"
        let storedPasswordToVerify = null;
        if (specificFieldValidation) {
            // Si el target tiene un campo específico, usarlo SOLO si existe.
            // Si fue borrado en Firebase Console, storedPasswordToVerify queda en null
            // y se activa el modo bootstrap (CF1234), sin hacer fallback al campo general.
            storedPasswordToVerify = configData[specificFieldValidation] || null;
        } else if (configData.adminPassword) {
            storedPasswordToVerify = configData.adminPassword;
        }

        // Verificar contraseña actual
        let isCurrentValid = false;

        if (!storedPasswordToVerify) {
            isCurrentValid = currentPassword.trim() === BOOTSTRAP_PASSWORD;
        } else {
            const isBcryptHash = storedPasswordToVerify.startsWith('$2b$') || storedPasswordToVerify.startsWith('$2a$');
            if (isBcryptHash) {
                isCurrentValid = await bcrypt.compare(currentPassword.trim(), storedPasswordToVerify);
            } else {
                isCurrentValid = currentPassword.trim() === storedPasswordToVerify.trim();
            }
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
                adminPassword_informes: newHash,
                adminPassword_configuracion: newHash
            };
        } else if (target === 'admin_only') {
            updates = {
                adminPassword: newHash,
                adminPassword_datos: newHash,
                adminPassword_informes: newHash,
                adminPassword_configuracion: newHash
            };
        } else if (specificFieldValidation) {
            updates[specificFieldValidation] = newHash;
        }

        await configRef.set(updates, { merge: true });

        console.log("Contraseña de administrador cambiada exitosamente");
        return { success: true };

    } catch (error) {
        console.error("Error cambiando contraseña:", error);
        throw new functionsV1.https.HttpsError(
            "internal",
            "Error interno al cambiar la contraseña."
        );
    }
});


/**
 * Función protegida para crear empleados validando el Token de Licencia.
 * Evita que un cliente cree usuarios superando su límite contratado.
 */
exports.createEmployeeSecure = functionsV1.https.onCall(async (data, context) => {
    const { email, password, firstName, lastName, faceDescriptor, extraFields } = data;
    if (!email || !password || !faceDescriptor) {
        throw new functionsV1.https.HttpsError("invalid-argument", "Faltan datos obligatorios (Email, Contraseña o Rostro).");
    }

    try {
        const CryptoJS = require("crypto-js");
        const db = admin.firestore();

        // Leer la licencia actual
        const licenseSnap = await db.collection("settings").doc("license").get();
        if (!licenseSnap.exists || !licenseSnap.data().token) {
            throw new functionsV1.https.HttpsError("permission-denied", "No hay una licencia instalada en el sistema.");
        }

        const rawToken = licenseSnap.data().token;
        // En v2 era process.env, para V1 se usa functions.config(), pero si lo pasasté por environment vars sirve
        const SECRET_KEY = process.env.LICENSE_SECRET_KEY || "ZAPATO_ROJO_MASTER_KEY_2026";

        // Desencriptar Token
        let decoded = null;
        try {
            const bytes = CryptoJS.AES.decrypt(rawToken, SECRET_KEY);
            const decryptedString = bytes.toString(CryptoJS.enc.Utf8);
            decoded = JSON.parse(decryptedString);
        } catch (error) {
            throw new functionsV1.https.HttpsError("permission-denied", "El token de licencia está corrupto o es inválido.");
        }

        if (!decoded || !decoded.maxEmployees || !decoded.expirationDate) {
            throw new functionsV1.https.HttpsError("permission-denied", "El token no tiene un formato válido.");
        }

        // Validar Fecha de Expiración
        const today = new Date();
        const expiration = new Date(decoded.expirationDate);
        if (today > expiration) {
            throw new functionsV1.https.HttpsError("permission-denied", `Su licencia expiró el ${decoded.expirationDate}. Contacte a ${decoded.providerName}.`);
        }

        // Contar Empleados Actuales
        const listUsersResult = await admin.auth().listUsers(1000);
        const currentCount = listUsersResult.users.length;

        // Validar Límite con Gabela (Buffer)
        const maxEmp = parseInt(decoded.maxEmployees, 10);
        const bufferPct = parseInt(decoded.bufferPercentage || 0, 10);
        const absoluteMax = maxEmp + Math.ceil(maxEmp * (bufferPct / 100));

        if (currentCount >= absoluteMax) {
            throw new functionsV1.https.HttpsError("resource-exhausted", `Límite absoluto de ${absoluteMax} alcanzado (Contrato: ${maxEmp} + ${bufferPct}% de cortesía). Contacte a ${decoded.providerName}.`);
        }

        // FLUJO DE CREACIÓN - Límite Aprobado
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

        // C. LIMPIEZA: Si el usuario estaba en la cola de borrado, lo sacamos
        const qSnap = await db.collection('deletionQueue').where('email', '==', email.toLowerCase().trim()).get();
        if (!qSnap.empty) {
            const batchRemove = db.batch();
            qSnap.forEach(doc => batchRemove.delete(doc.ref));
            await batchRemove.commit();
        }

        return { success: true, uid: userRecord.uid, message: "Empleado creado exitosamente." };

    } catch (error) {
        console.error("Error en createEmployeeSecure:", error);

        if (error.code === 'auth/email-already-exists') {
            throw new functionsV1.https.HttpsError("already-exists", "El correo ya está registrado.");
        }

        throw new functionsV1.https.HttpsError("internal", "Logica de creación fallida: " + error.message);
    }
});

/**
 * Tarea Programada: Limpieza Automática de Archivos Fantasma
 * Se ejecuta el día 1 de cada mes a la medianoche.
 * Elimina documentos de Firestore en 'fotos' e 'incidents' que no tienen una foto real
 * asociada en Firebase Storage (orphaned data).
 */
exports.scheduledPhantomCleanup = functionsV1.pubsub.schedule('0 0 1 * *')
    .timeZone('America/Bogota')
    .onRun(async (context) => {
    const db = admin.firestore();
    const bucket = admin.storage().bucket();
    let deletedFotos = 0;
    let deletedIncidents = 0;

    console.log("Iniciando Limpieza Programada de Registros Fantasma (Cada 30 días)");

    try {
        // 1. Limpiar colección 'fotos'
        const fotosSnap = await db.collection('fotos').get();
        const batch = db.batch();
        let batchCount = 0;

        for (const docSnap of fotosSnap.docs) {
            const data = docSnap.data();
            if (data.path) {
                const file = bucket.file(data.path);
                const [exists] = await file.exists();
                if (!exists) {
                    batch.delete(docSnap.ref);
                    deletedFotos++;
                    batchCount++;
                }
            }
            if (batchCount > 400) {
                await batch.commit();
                batchCount = 0;
            }
        }
        if (batchCount > 0) {
            await batch.commit();
            console.log("Batch de fotos procesado");
        }

        // 2. Limpiar colección 'incidents' (novedades)
        const incSnap = await db.collection('incidents').get();
        const batchInc = db.batch();
        let batchIncCount = 0;

        for (const docSnap of incSnap.docs) {
            const data = docSnap.data();
            if (data.fotoURL) {
                try {
                    const urlPath = decodeURIComponent(data.fotoURL.split('/o/')[1]?.split('?')[0] || '');
                    if (urlPath) {
                        const file = bucket.file(urlPath);
                        const [exists] = await file.exists();
                        if (!exists) {
                            batchInc.delete(docSnap.ref);
                            deletedIncidents++;
                            batchIncCount++;
                        }
                    }
                } catch(e) { /* ignorar errores de parseo */ }
            }
            if (batchIncCount > 400) {
                await batchInc.commit();
                batchIncCount = 0;
            }
        }
        if (batchIncCount > 0) {
            await batchInc.commit();
        }

        console.log(`✅ Limpieza Fantasma finalizada. Fotos huérfanas borradas: ${deletedFotos}. Novedades huérfanas borradas: ${deletedIncidents}.`);
        return null;
    } catch (err) {
        console.error("Error en Limpieza Programada:", err);
        return null;
    }
});

/**
 * Función para buscar si un usuario existe por correo y devolver sus datos públicos (nombres).
 */
exports.checkEmployeeExists = functionsV1.https.onCall(async (data, context) => {
    const { email } = data;
    if (!email) throw new functionsV1.https.HttpsError("invalid-argument", "El email es requerido.");

    try {
        const db = admin.firestore();
        const emailLower = email.toLowerCase().trim();
        const querySnapshot = await db.collection("employees").where("email", "==", emailLower).limit(1).get();

        if (querySnapshot.empty) {
            return { exists: false };
        }

        const doc = querySnapshot.docs[0];
        const empData = doc.data();

        // Extraemos campos extra que existan (todo menos lo base)
        const { email: _, firstName, lastName, fechaCreacion, faceDescriptor, password, ...extraFields } = empData;

        return {
            exists: true,
            docId: doc.id,
            firstName: firstName || '',
            lastName: lastName || '',
            extraFields: extraFields || {}
        };
    } catch (error) {
        console.error("Error en checkEmployeeExists:", error);
        throw new functionsV1.https.HttpsError("internal", "Error al verificar el empleado.");
    }
});

/**
 * Función protegida para actualizar un empleado existente verificando la clave de configuración.
 */
exports.updateEmployeeSecure = functionsV1.https.onCall(async (data, context) => {
    const { docId, email, firstName, lastName, faceDescriptor, extraFields, configPassword, newPassword } = data;

    if (!docId || !email || !configPassword) {
        throw new functionsV1.https.HttpsError("invalid-argument", "Faltan datos obligatorios para actualizar.");
    }

    if (newPassword && (typeof newPassword !== 'string' || newPassword.trim().length < 6)) {
        throw new functionsV1.https.HttpsError("invalid-argument", "La nueva contraseña debe tener al menos 6 caracteres.");
    }

    try {
        const bcrypt = require("bcrypt");
        const db = admin.firestore();

        // 1. Verificar Master Password de Configuración
        const configSnap = await db.collection('settings').doc('config').get();
        const configData = configSnap.exists ? configSnap.data() : {};
        const storedPassword = configData.adminPassword_configuracion || configData.adminPassword;
        const BOOTSTRAP_PASSWORD = "CF1234";

        let isCurrentValid = false;
        if (!storedPassword) {
            isCurrentValid = configPassword.trim() === BOOTSTRAP_PASSWORD;
        } else {
            const isBcrypt = storedPassword.startsWith('$2b$') || storedPassword.startsWith('$2a$');
            if (isBcrypt) {
                isCurrentValid = await bcrypt.compare(configPassword.trim(), storedPassword);
            } else {
                isCurrentValid = configPassword.trim() === storedPassword.trim();
            }
        }

        if (!isCurrentValid) {
            throw new functionsV1.https.HttpsError("permission-denied", "Contraseña de Configuración incorrecta. Edición denegada.");
        }

        // 2. Actualizar Auth (Google)
        try {
            const normalizedEmail = email.toLowerCase().trim();
            const userRecord = await admin.auth().getUserByEmail(normalizedEmail);
            const authUpdates = {
                displayName: `${firstName} ${lastName}`.trim()
            };
            if (newPassword && typeof newPassword === 'string' && newPassword.trim().length >= 6) {
                authUpdates.password = newPassword.trim();
            }
            await admin.auth().updateUser(userRecord.uid, authUpdates);
            console.log(`✅ [updateEmployeeSecure] Usuario ${normalizedEmail} actualizado en Auth (clave actualizada: ${!!(newPassword && newPassword.trim().length >= 6)})`);
        } catch (authErr) {
            console.error("Error actualizando Auth:", authErr);
            if (newPassword && newPassword.trim().length >= 6) {
                throw new functionsV1.https.HttpsError("internal", "No se pudo cambiar la contraseña en Authentication: " + (authErr.message || "Usuario no encontrado en Auth."));
            }
        }

        // 3. Actualizar Firestore
        const updateData = {
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            ...(extraFields || {})
        };

        if (faceDescriptor && Array.isArray(faceDescriptor) && faceDescriptor.length > 0) {
            updateData.faceDescriptor = faceDescriptor;
        }

        await db.collection("employees").doc(docId).update(updateData);

        return { success: true, message: "Empleado actualizado correctamente." };

    } catch (error) {
        console.error("Error en updateEmployeeSecure:", error);
        if (error.code === 'functions/permission-denied') throw error;
        throw new functionsV1.https.HttpsError("internal", "Error al actualizar empleado: " + error.message);
    }
});
