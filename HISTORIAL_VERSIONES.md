# Historial de Versiones: Control de Asistencia y Acceso 📋

Esta guía documenta la evolución del sistema, detallando las características principales de cada versión desde la 1.0.0 hasta la 1.7.20 actual.

## Versión 1.7.20 (Actual) ✅
**Fecha:** 23/03/2026
**Estado:** Estable - Producción

### Correcciones y Mejoras de Cámara
- **Cámara Negra**: Se eliminó la técnica del stream temporal que causaba una condición de carrera y dejaba la vista de cámara en negro en dispositivos lentos.
- **Asignación Robusta del Stream**: Se añadió un ciclo de reintentos para asignar el stream de video al elemento en pantalla, incluso si el elemento no se ha montado al instante.
- **Feedback de Captura**: Al presionar el botón de tomar foto, ahora aparece un destello blanco con el texto '¡Foto capturada!' para confirmar visualmente que la imagen fue registrada.
- **Botón de Cámara**: El botón ahora tiene etiqueta '📸 Tomar Foto Ahora' con un efecto de presá visible (escala activa).

## Versión 1.7.19
**Fecha:** 23/03/2026
**Estado:** Estable - Producción

### Mejoras de Reportes
- **Reporte de Visitas**: Se dividió la columna de "Observaciones" en dos: "Observaciones Entrada" y "Observaciones Salida" para mayor claridad en el seguimiento de visitas a clientes.

## Versión 1.7.18
**Fecha:** 23/03/2026
**Estado:** Estable - Producción

### Corrección de Errores
- **Reporte de Visitas**: Se corrigió el nombre del campo interno (`tipo` vs `mode`) en el motor de emparejamiento. Esto resuelve el problema de los reportes descargados en blanco.
- **Reporte de Visitas**: Se mejoró el mapeo de nombres y apellidos para empleados importados desde el sistema central.

## Versión 1.7.17
**Fecha:** 23/03/2026
**Estado:** Estable - Producción

### Corrección de Errores
- **Reporte de Visitas**: Se corrigió el error `TypeError: m is not iterable` al exportar a Excel (XLSX).
- **Reporte de Visitas**: Se corrigió la lógica de filtrado por fechas que causaba reportes en blanco si se seleccionaba el mismo día de inicio y fin.
- **Exportación CSV**: Se añadió el marcador BOM (Byte Order Mark) para asegurar que Excel reconozca correctamente los caracteres especiales y tildes en el archivo CSV.

## Versión 1.7.16
**Fecha:** 23/03/2026
**Estado:** Estable - Producción

### Corrección de Errores
- **Reporte de Visitas**: Se corrigió el error `ReferenceError: getMillisFromDateTime is not defined` que impedía la exportación de reportes de visitas en clientes.

## Versión 1.7.15
**Fecha:** 23/03/2026
**Estado:** Estable - Producción

### Nuevas Funcionalidades y Refinamientos
- **Informes de Visitas**: Nueva funcionalidad en reportes para exportar visitas a clientes (Llegada/Salida emparejadas) con filtros por usuario y fecha. Exportación a CSV y Excel (XLSX).
- **Borrado en Lote**: Opción para limpiar registros de visitas por rango de fechas desde el panel de administración.
- **Marca de Agua Dinámica**: Refinamiento específico de "SALIDA DEL CLIENTE". Se redujo la tipografía y se ajustó la posición para evitar solapamientos con logos y mejorar la estética.
- **Visibilidad Inteligente**: La sección de reportes de visitas solo aparece cuando el "Modo Ruta / Visitas" está habilitado en los ajustes globales.

## Versión 1.7.14
**Fecha:** 23/03/2026
**Estado:** Estable - Producción

### Mejoras de Interfaz y Sincronización
- **Refinamiento de Marcas de Agua**: Etiquetas en español ("ENTRADA", "LLEGADA A CLIENTE", "SALIDA DEL CLIENTE"), tipografía reducida y colores unificados (Azul para eventos de ruta).
- **Eliminación de Duplicados**: Implementación de IDs determinísticos en Firestore. Los registros offline ahora reemplazan correctamente a los marcadores de posición al sincronizarse.
- **Imagen en Mensajes de Ruta**: Ahora se adjunta la imagen directamente al compartir por WhatsApp (soporte nativo de Web Share API), eliminando el enlace de texto.

---

## Versión 1.7.13 ✅
**Fecha:** 23/03/2026
**Estado:** Estable - Histórico

## Versión 1.7.12 ✅
**Fecha:** 23/03/2026
**Estado:** Estable - Histórico

### Correcciones y Mejoras
- **Unificación de Redondeo en Informes**: Ajuste en el algoritmo de cálculo de horas para procesar fracciones de minuto. Esto garantiza que el informe "Detallado Estándar" coincida exactamente con los reportes de "Tiempo Efectivo", eliminando discrepancias por redondeo excesivo hacia arriba.
- **Precisión en Cálculos**: El sistema ahora contabiliza segundos remanentes de forma proporcional, asegurando coherencia entre el desglose de horas (Diurnas/Nocturnas) y el tiempo total laborado.

---

## Versión 1.7.11 ✅
**Fecha:** 23/03/2026
**Estado:** Estable - Histórico

---


### Servicio Offline y Multi-Empleado
- **Servicio Offline Transparente**: Mejora en la sincronización automática y gestión de registros sin conexión mediante IndexedDB y localStorage.
- **Soporte Multi-Empleado**: Identificación inteligente de última entrada o salida para múltiples empleados en un solo dispositivo, utilizando el correo electrónico como identificador único para la persistencia del estado.
- **Sincronización Inteligente**: Reintento automático de subida de datos y fotos al detectar recuperación de conexión a internet.
- **Optimización de Estado**: El sistema recuerda si el último registro fue entrada o salida por cada usuario, evitando estados inconsistentes tras recargas de página o actualizaciones.

---

## Versión 1.6.19 ✅
**Fecha:** 04/03/2026
**Estado:** Estable - Histórico

---

## Versión 1.6.18 ✅
**Fecha:** 01/03/2026
**Estado:** Estable - Producción

### Mejoras de UX
- **Ajuste de Velocidad en Actualización**: Se redujo el tiempo de visualización del mensaje de actualización a solo 400ms para una transición casi instantánea.
- **Prevención de Bucles**: Corrección en la lógica de almacenamiento local para asegurar que la aplicación no se recargue infinitamente en ciertos navegadores.

---

## Versión 1.6.17 ✅
**Fecha:** 01/03/2026
**Estado:** Estable - Histórico

### Nuevas Características
- **Sistema de Auto-Actualización Inteligente**: Implementación de detección automática de versiones en la pantalla de login.
- **Limpieza Profunda para iOS**: Lógica especializada para forzar la actualización en dispositivos iPhone/iPad eliminando el "Sticky Cache".
- **Overlay de Actualización**: Nueva interfaz visual que informa al usuario mientras se aplica la actualización de forma silenciosa.

---

## Versión 1.6.8 ✅
**Fecha:** 01/03/2026
**Estado:** Estable - Histórico

### Correcciones
- **Fijada Pantalla en Blanco en Novedades**: Se corrigió un error que impedía cargar la cámara en el modo de reporte de novedades.
- **Refuerzo de Seguridad Facial**: Se incrementó la exigencia del algoritmo de reconocimiento (umbral a 0.63) para evitar suplantaciones de identidad.
- **Optimización de Cámara**: Se confirmó el uso de la cámara trasera para reportes de novedades, asegurando una captura clara de la evidencia.

---

## Versión 1.6.7 ✅
**Fecha:** 26/02/2026
**Estado:** Estable - Histórico

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
