# 🚀 Plan de Arranque y Reset: ControlFace

Este sistema tiene una protección de **"Auto-Arranque"** diseñada para que nunca pierdas el acceso. Si borras las contraseñas en Firebase, el sistema vuelve a su estado inicial.

### 1. Clave Maestra de Emergencia (Reset a Cero)
Si borras los campos de contraseña en Firestore (`adminPassword`, etc.) o el documento `settings/config`, el sistema activará automáticamente:
- **Clave Universal:** `CF1234`
- **Uso:** Sirve para entrar a cualquier módulo (Configuración, Registro, etc.) cuando no hay claves configuradas en la base de datos.
- **Seguridad:** Tan pronto como guardes una clave nueva desde el panel de Configuración de la App, `CF1234` dejará de funcionar.

### 2. Procedimiento para "Arrancar de Cero"
Si deseas resetear todas las claves a la de fábrica:
1. Ve a Firestore Database en la consola de Firebase.
2. Navega a la colección `settings` -> documento `config`.
3. Borra todos los campos que empiecen por `adminPassword_` y el campo `adminPassword`.
4. ¡Listo! Al no haber claves guardadas, el sistema ahora aceptará `CF1234` para permitirte entrar y configurar todo de nuevo.

### 3. Pasos para Proyectos Nuevos o Limpios
1. **Despliegue**: Asegúrate de tener las funciones y reglas al día:
   ```bash
   firebase deploy --only functions,firestore
   ```
2. **Primer Ingreso**: Abre la App y usa `CF1234` para entrar a **Configuración**.
3. **Activar Licencia**: Lo primero es pegar el token de licencia para habilitar el resto del sistema.
4. **Definir Claves Finales**: Cambia `CF1234` por tus contraseñas definitivas en la pestaña de Configuración.

---
> [!IMPORTANT]
> **CF1234** es tu salvavidas. Si alguna vez te bloqueas o quieres entregar el proyecto "limpio", simplemente borra las claves en la consola de Firebase y el sistema volverá a pedir esta clave maestra universal.
