const functions = require("firebase-functions");
const admin = require("firebase-admin");
const bcrypt = require("bcrypt");

admin.initializeApp();

/**
 * Función para obtener la lista de todos los usuarios de Authentication.
 * Útil para exportar CSV con la lista real de usuarios.
 */
exports.getUsersList = functions.https.onCall(async (data, context) => {
    // Opcional: Verificar que el usuario esté autenticado
    if (!context.auth) {
        throw new functions.https.HttpsError(
            "unauthenticated",
            "Debes estar autenticado para realizar esta acción."
        );
    }

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
    if (!context.auth) {
        throw new functions.https.HttpsError(
            "unauthenticated",
            "Debes estar autenticado para realizar esta acción."
        );
    }

    const { uid } = data;
    if (!uid) {
        throw new functions.https.HttpsError(
            "invalid-argument",
            "Se requiere el UID del usuario."
        );
    }

    try {
        // 1. Eliminar de Authentication
        await admin.auth().deleteUser(uid);

        // 2. Obtener el email del usuario para agregarlo a la cola de borrado
        const db = admin.firestore();
        const userRecord = await admin.auth().getUser(uid).catch(() => null);
        const userEmail = userRecord ? userRecord.email : null;

        if (userEmail) {
            // 3. Agregar a la cola de borrado en Firestore
            const queueRef = db.collection('deletionQueue').doc();
            await queueRef.set({
                email: userEmail.toLowerCase().trim(),
                deletedAt: admin.firestore.FieldValue.serverTimestamp(),
                uid: uid
            });

            // 4. Eliminar de la colección employees si existe
            const employeesQuery = db.collection('employees').where('email', '==', userEmail);
            const employeesSnapshot = await employeesQuery.get();
            const batch = db.batch();
            employeesSnapshot.forEach(doc => {
                batch.delete(doc.ref);
            });
            await batch.commit();
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
    const { password } = data;
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

        let storedPassword = '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy'; // Hash de "perro456"

        if (docSnap.exists) {
            storedPassword = docSnap.data().adminPassword || storedPassword;
        } else {
            // Si no existe, lo creamos con el hash por defecto
            await configRef.set({ adminPassword: storedPassword });
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
    const { currentPassword, newPassword } = data;

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

        const storedPassword = docSnap.data().adminPassword;

        // Verificar contraseña actual
        const isBcryptHash = storedPassword.startsWith('$2b$') || storedPassword.startsWith('$2a$');
        let isCurrentValid = false;

        if (isBcryptHash) {
            isCurrentValid = await bcrypt.compare(currentPassword.trim(), storedPassword);
        } else {
            isCurrentValid = currentPassword.trim() === storedPassword.trim();
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

        // Guardar el nuevo hash
        await configRef.update({ adminPassword: newHash });

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
 * Función para cambiar la contraseña de administrador.
 * Requiere la contraseña actual para autorizar el cambio.
 */
exports.changeAdminPassword = functions.https.onCall(async (data, context) => {
    const { currentPassword, newPassword } = data;

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

        const storedPassword = docSnap.data().adminPassword;

        // Verificar contraseña actual
        const isBcryptHash = storedPassword.startsWith('$2b$') || storedPassword.startsWith('$2a$');
        let isCurrentValid = false;

        if (isBcryptHash) {
            isCurrentValid = await bcrypt.compare(currentPassword.trim(), storedPassword);
        } else {
            isCurrentValid = currentPassword.trim() === storedPassword.trim();
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

        // Guardar el nuevo hash
        await configRef.update({ adminPassword: newHash });

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
