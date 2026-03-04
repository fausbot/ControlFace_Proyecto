# 🚀 Checklist: Instalación para Cliente Nuevo

Sigue estos pasos **en orden** cada vez que instales el sistema para un cliente.

---

## PASO 1 — El Cliente Crea su Proyecto Firebase

1. El cliente va a [firebase.google.com](https://firebase.google.com) con su cuenta Gmail.
2. Crea un proyecto nuevo (activa el plan **Blaze** si va a usar Cloud Functions).
3. Activa: **Authentication**, **Firestore**, **Storage**, **Functions**, **Hosting**.

---

## PASO 2 — El Cliente te Da Permisos (Solo 1 Vez)

El cliente debe hacer esto desde su cuenta Gmail:

### En Firebase Console
- ⚙️ Configuración del Proyecto → **Usuarios y Permisos** → **Agregar miembro**
  - Email: `fausbotkindle@gmail.com` | Rol: **Editor**

### En Google Cloud Console
- Ve a: `console.cloud.google.com/iam-admin/iam` (seleccionar el proyecto del cliente)
- Busca `fausbotkindle@gmail.com` → ✏️ Editar → **Agregar otro rol** (×3):
  - ✅ **Consumidor de uso de servicio** *(Service Usage Consumer)*
  - ✅ **Administrador de IAM de proyecto** *(Project IAM Admin)*
  - ✅ **Administrador de Cloud Functions** *(Cloud Functions Admin)*
- Guardar

---

## PASO 3 — Preparar la Carpeta del Cliente

1. Copia una carpeta existente en `Clientes/` (ej: `Clientes/Bourbon`)
2. Renómbrala con el nombre del cliente (ej: `Clientes/NuevoRestaurante`)
3. Edita los archivos:
   - **`.env`** → Cambia las keys de Firebase, nombre del cliente, logo URL, versión
   - **`.firebaserc`** → Cambia el `project ID` al del cliente nuevo
   - **`DEPLOY_*.bat`** → Cambia el nombre del cliente y el `--project <id>` al del cliente nuevo
4. Pega el logo del cliente (como `logo.jpg`)

---

## PASO 4 — Primer Deploy

Haz doble clic en el `DEPLOY_*.bat` del cliente. Esto:
1. Copia el `.env` correcto
2. Copia el logo del cliente
3. Construye la app
4. Sube el hosting
5. Despliega las Cloud Functions

---

## PASO 5 — Activar Invocador Público (Solo el Primer Deploy)

> [!IMPORTANT]
> Google Cloud NO activa esto automáticamente. Debes hacerlo manualmente **1 sola vez** por cliente.

1. Ve a: `console.cloud.google.com/functions/list?project=<ID_PROYECTO_CLIENTE>`
2. Para cada función de la lista (`verifyAdminPassword`, `changeAdminPassword`, `deleteUser`, `getUsersList`, `createEmployeeSecure`, `verifyLicenseToken`):
   - Clic en la función → Pestaña **Permisos**
   - **Agregar principal** → `allUsers` → Rol: **Invocador de Cloud Functions**
   - Guardar → Confirmar acceso público

---

## PASO 6 — Primer Acceso del Cliente (Bootstrap)

1. El cliente abre la URL de su app.
2. Hace clic en **CONFIG**.
3. Ingresa la clave maestra: **`CF1234`**
4. ✅ Ya puede configurar su sistema y cambiar las contraseñas definitivas.

---

## PASO 7 — Activar Licencia

Desde dentro de **Configuración**, el cliente pega el token de licencia que le generas con el `generador_licencias.html`.

---

> [!TIP]
> Para **actualizaciones futuras**, solo ejecuta el `DEPLOY_*.bat` del cliente. Los pasos 2 y 5 ya no son necesarios.
