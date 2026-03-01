# 🚀 Plan de Arranque: Nuevos Proyectos ControlFace

He diseñado un sistema de **"Auto-Bootstrap"** para que cuando crees un nuevo proyecto en Firebase (limpio y sin datos), puedas configurarlo sin errores de permisos ni bloqueos.

### 1. Clave Maestra de Primer Inicio
Si la base de datos está vacía, el sistema activará automáticamente el modo de emergencia:
- **Clave:** `CF1234`
- **Uso:** Sirve para entrar a **Configuración**, **Registro**, **Datos** e **Informes** por primera vez.
- **Auto-Desactivación:** En el momento en que definas una contraseña real en la pestaña de Configuración, esta clave dejará de funcionar automáticamente por seguridad.

### 2. Activación de Licencia sin Restricciones
Las reglas de seguridad (`firestore.rules`) están configuradas para que:
- La colección `settings/license` permita escritura pública inicial.
- Esto evita el error de "Missing or insufficient permissions" cuando intentas activar el programa por primera vez.

### 3. Pasos para cada Proyecto Nuevo
1. **Deploy Inicial del Backend**: La *primera vez* que despliegues, Firebase CLI te hará preguntas sobre inicializar Node.js y la zona de funciones. Usa este comando (te pedirá estar en plan Blaze):
   ```bash
   firebase deploy --only functions
   firebase deploy --only firestore,storage
   ```
   *(Hacerlo la primera vez sin --non-interactive para responder "Y" a los permisos de IAM que pide Google Cloud).*
2. **Entrar a Configuración**: Usa `CF1234` para acceder.
3. **Pegar Licencia**: Activa tu código de licencia.
4. **Cambiar Claves**: Define tus contraseñas reales (usando `CF1234` como clave actual para validar el cambio).

---
> [!IMPORTANT]
> Este plan asegura que nunca te quedes "afuera" de un sistema recién creado. La clave `CF1234` es tu llave maestra universal para el día 1.
