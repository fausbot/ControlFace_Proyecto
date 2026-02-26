# Historial de Versiones: Control de Asistencia y Acceso 📋

Esta guía documenta la evolución del sistema, detallando las características principales de cada versión desde la 1.0.0 hasta la 1.6.7 actual.

---

## Versión 1.6.7 (Actual) ✅
**Fecha:** 26/02/2026
**Estado:** Estable - Producción

### Nuevas Características
- **Localización Completa al Español**: Toda el aplicativo (botones, mensajes, errores) ha sido traducido para facilitar su uso.
- **Indicadores de Versión Visible**: Se agregó la etiqueta de versión en los encabezados de las páginas administrativas (`Registro`, `Configuración`, `Informes`) para facilitar el soporte técnico.
- **Selector de Visibilidad de Contraseña**: Se integró un icono de "ojo" en los campos de contraseña del Administrador para evitar errores de escritura en dispositivos móviles.
- **Refinamiento Lógico de Almuerzo**: Ajuste en el algoritmo de cálculo; el descuento de almuerzo ahora solo aplica estrictamente para turnos superiores a 8 horas, optimizando la precisión de los reportes.

---

## Versión 1.4.11 🛠️
**Fecha:** 24/02/2026
**Enfoque:** Licenciamiento y Flexibilidad

### Nuevas Características
- **Sistema de Licencia Buffer-Flex**:
  - Implementación de un margen de cortesía (porcentaje extra) sobre el cupo contratado.
  - Bloqueo automatizado de creación de empleados solo al agotar el margen absoluto.
  - Alertas visuales dinámicas (Verde, Naranja, Rojo) según el consumo de cupos.
- **Campos Dinámicos de Registro**:
  - Posibilidad de activar/desactivar campos adicionales (identificación, contacto, formación) desde la pestaña Configuración.
  - Los datos opcionales se integran automáticamente en los reportes de exportación.
- **Seguridad en la Nube**:
  - Migración de la lógica de creación de empleados a **Cloud Functions** para validaciones de seguridad robustas antes de afectar la base de datos.

---

## Versión 1.1.0 ✅
**Fecha:** 15/02/2026
**Estado:** Estable - Producción

### Características Anteriores
- **Gestión de Usuarios**:
  - Se agregaron campos obligatorios de **Nombres** y **Apellidos** en el registro.
  - Se eliminó la restricción de dominio `@vertiaguas.com`.
- **Mejoras en Login**:
  - Ingreso de correo completo sin autocompletado forzado de dominio.
- **Reportes Avanzados**:
  - Exportación CSV mejorada con nombres completos y cruce inteligente de datos.

---

## Versión 1.0.7 🔒
**Fecha:** 15/02/2026
**Enfoque:** Seguridad y Administración

### Mejoras de Seguridad
- **Encriptación bcrypt**:
  - La contraseña de administrador ahora se almacena como un hash irreversible (bcrypt), eliminando el almacenamiento en texto plano.
  - Implementación de Cloud Functions para verificación segura en el servidor.
- **Nueva Interfaz de Administración**:
  - **Cambio de Contraseña**: Se agregó una página dedicada (`/cambiar-clave-admin`) accesible desde el panel de Admin para cambiar la contraseña de forma segura.
  - **Validaciones**: El sistema verifica la fortaleza y coincidencia de contraseñas.
- **Herramientas de Respaldo**:
  - Se creó un script (`functions/generar-hash.cjs`) para generar hashes manualmente en caso de emergencia.

### Mejoras Funcionales
- **Reconocimiento Facial**: Se ajustó el umbral de confianza a `0.68` para reducir falsos negativos sin comprometer la seguridad.
- **Correcciones en Admin**:
  - Se solucionó un problema de visualización de registros antiguos que no tenían timestamp.
  - Se optimizaron las reglas de seguridad de Firestore para permitir la lectura pública de registros de asistencia (necesario para la carga inicial del panel).

---

## Versión 1.0.6 🛠️
**Fecha:** 14/02/2026
**Enfoque:** Corrección de Errores y PWA

### Correcciones Críticas
- **Permisos de Firestore**: Se corrigieron errores de "Missing or insufficient permissions" que impedían cargar datos en el panel de Admin.
- **Acceso Administrativo**: Se permitió el acceso al panel de Admin directamente tras verificar la contraseña maestra, sin requerir login de empleado previo (aunque se recomienda).
- **Ordenamiento de Datos**: Se implementó un algoritmo de ordenamiento híbrido en el cliente para manejar transiciones entre formatos de fecha antiguos y nuevos (Timestamp).

---

## Versión 1.0.0 - 1.0.5 (Versiones Iniciales) 🚀
**Estado:** Desarrollo y Pruebas Tempranas

### Características Fundamentales
- **PWA (Progressive Web App)**: Capacidad de instalación en dispositivos móviles y funcionamiento offline básico.
- **Geolocalización**: Registro obligatorio de coordenadas GPS al marcar asistencia.
- **Reconocimiento Facial**: Implementación inicial usando `face-api.js` para verificar identidad antes de permitir el ingreso.
- **Registro de Asistencia**:
  - Marcaje de Entrada y Salida.
  - Registro de fecha y hora local.
- **Panel de Administración Básico**:
  - Visualización de registros en tabla.
  - Exportación básica a CSV.
  - Borrado de registros individuales y masivos.
- **Gestión de Empleados**:
  - Registro de usuarios con correo y contraseña.
  - Captura inicial de rostro (descriptor biométrico).
  - Login de empleados.

---

## Resumen Técnico Global

### Tecnologías
- **Frontend**: React (Vite) + Tailwind CSS
- **Backend**: Firebase (Auth, Firestore, Cloud Functions)
- **Biometría**: face-api.js (Modelos TinyFaceDetector)
- **Seguridad**: bcrypt (hashing), Firebase Rules

### Base de Datos (Firestore)
- **`attendance`**: Registros de marcas (quién, cuándo, dónde).
- **`employees`**: Perfiles de usuario (email, nombres, apellidos, descriptor facial).
- **`settings/config`**: Configuración global (contraseña de admin hasheada).
- **`deletionQueue`**: Cola temporal para borrado seguro de usuarios.

---

*Documento generado automáticamente el 15/02/2026.*
