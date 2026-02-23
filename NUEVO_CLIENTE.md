# Guía de Instalación para Nuevos Clientes (Multitenant)

Este documento te guiará sobre cómo tomar este mismo código fuente y publicarlo para un cliente completamente nuevo, garantizando que su base de datos, correos y reportes vivan 100% aislados en su propia cuenta gratuita de Firebase.

## Paso 1: Configurar Proyecto en Firebase

1. Entra a [Firebase Console](https://console.firebase.google.com/) con tu cuenta de Google (o la que vayas a usar para gestionar a los clientes).
2. Haz clic en **"Agregar Proyecto"**. Asígnale un nombre descriptivo (ej: "Asistencia-ClienteUno") y dale a Continuar.
3. Deshabilita Google Analytics (no hace falta para esto).
4. Dentro del panel de tu nuevo proyecto, haz clic en el ícono de "Web" `</>` (debajo del texto "Agrega Firebase a tu app para comenzar").
5. Registra la App (ponle un apodo). Puedes marcar la casilla que dice "Configurar también Firebase Hosting".
6. En el paso de "Agregar SDK de Firebase", copia el objeto `firebaseConfig` que aparece en pantalla (todo lo que viene dentro de `apiKey`, `authDomain`, etc).

## Paso 2: Copiar Variables de Entorno

1. En la carpeta raíz de este código, busca el archivo llamado `TEMPLATE.env`.
2. Sácale una copia y nómbrala exactamente como `.env` (sin extensión al final, sólo `.env`).
3. Abre el `.env` vacío que acabas de crear y pega los datos que copiaste de Firebase.
4. Completa la parte de abajo donde dice `VITE_CLIENT_NAME=` con el Nombre de tu cliente.
5. Pega el logo de tu cliente en la carpeta `public/` y asegúrate de actualizar el nombre del archivo en `VITE_CLIENT_LOGO_URL=`.

## Paso 3: Activar Servicios Vitales en Firebase

Dentro de la consola web de tu nuevo proyecto en Firebase (menú a la izquierda), es **OBLIGATORIO** encender estos paneles, en este orden:

1.  **Authentication (Autenticación):** 
    - Dale a "Comenzar" y activa únicamente la opción de "Correo electrónico/Contraseña".
2.  **Firestore Database:** 
    - Crea la base de datos.
    - **CRÍTICO:** Asegúrate de que las reglas de Firestore (`firestore.rules`) queden actualizadas al hacer el despliegue final (Paso 4) para permitir el "auto-saneamiento" de registros huérfanos sin errores de permisos.
3.  **Storage (Para las fotos):**
    - Créalo también con las reglas por defecto.
    - **IMPORTANTE:** Para que la cámara funcione, [deberás configurar el "CORS"](https://firebase.google.com/docs/storage/web/download-files?hl=es-419#cors_configuration) en tu Storage (necesitas ejecutar un par de comandos desde la terminal para instalar y usar `gsutil`).
4. **Functions:**
    - Se necesitan obligatoriamente para la Masterkey. Para prender las Functions tu proyecto **debe estar en el plan Blaze** (Pago por consumo). No te asustes, hay una capa gratuita gigante, solo piden meter la tarjeta por si acaso.

## Paso 4: Vincular el Código con Firebase (Localmente)

Abre la terminal de tu computador en la raíz de la carpeta y ejecuta estos comandos:

```bash
# Elige tu nuevo proyecto en la lista
firebase use --add

# Construye la versión web moderna
npm run build

# Despliega reglas, funciones e interfaz gráfica todo junto
firebase deploy
```

> **Nota:** Si `firebase use --add` no encuentra tu proyecto nuevo, asegúrate de estar logueado corriendo el comando `firebase login`.

## Paso 5: El Primer Inicio de Sesión (Importante: La Masterkey)

1. Abre tu nuevo enlace web recién publicado (por ejemplo `clienteuno.web.app`).
2. Haz clic arriba a la derecha en el botón rojo/azul de configuración (el dibujo de la tuerca).
3. Te pedirá la "Clave Maestra". 
4. Por defecto, en la primera instalación, la clave es **`perro456`**.
5. ¡Entra! Ve a la pestaña **Configuración** y cambia la clave `perro456` inmediatamente por una nueva segura. Esto guardará tú nueva clave de forma secreta en Firestore.

---

### ¡Listo!
Ahora ya puedes empezar a registrar Empleados. Todo el sistema usará los textos, colores y fotos limitados e independientes para tu nuevo cliente.

---

## 🛠️ Nuevas Funcionalidades y Mejoras (Actualizado)

Al instalar esta nueva versión para un cliente, ten en cuenta las siguientes características de seguridad y gestión que ya están integradas:

1. **Licenciamiento Estricto y Búfer de Gracia:**
   - La nueva versión incluye un **búfer de gracia del 15%** al cupo máximo de empleados. La app avisará cuando se alcance el límite original, pero solo bloqueará la creación cuando se tope el límite absoluto (+15%).
   - Si la licencia **vence por fecha límite**, la aplicación activa un **bloqueo estricto**. Desaparecen las opciones de Entrada, Salida y Novedad para el usuario final, y se bloquea el formulario de Login hasta que se inserte la nueva clave maestra con la licencia renovada en el panel de `Configuración`.

2. **Terminología Actualizada:**
   - Para evitar confusiones, el antiguo botón de "Incidente" en la cámara se ha renombrado en todas las pantallas a **"Reportar Novedad"**. (Internamente las carpetas de almacenamiento siguen llamándose `incidentes` para mantener compatibilidad).

3. **Auto-Saneamiento al Exportar Fotos (Self-Healing):**
   - Si necesitas borrar fotos manualmente ahorrando costos directamente desde la pestaña Storage en Firebase Console, ya no necesitas preocuparte por descuadrar la contabilidad.
   - El sistema tiene una función de **auto-saneamiento**. Cuando el cliente presiona "Exportar Fotos" (ZIP) y el sistema detecta que la foto física ya no existe, borrará silenciosamente el registro fantasma ("recibo") de la base de datos y entregará el número real y exacto de fotos validadas.
