
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
