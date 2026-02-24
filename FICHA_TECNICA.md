# FICHA TÉCNICA DEL PRODUCTO 📄

**Nombre del Producto**: ControlFace - Sistema de Control de Asistencia y Acceso Biométrico (PWA)
**Versión Actual**: 1.4.11
**Fecha de Actualización**: 24 de Febrero, 2026
**Tipo de Software**: Progressive Web App (PWA) - SaaS

---

## 1. DESCRIPCIÓN DEL PRODUCTO
Plataforma digital integral para la gestión y control de asistencia de personal en tiempo real. Diseñada como una Aplicación Web Progresiva (PWA), permite el registro de entrada, salida y novedades mediante verificación de identidad biométrica (reconocimiento facial) y geolocalización, accesible desde cualquier dispositivo móvil o computadora sin necesidad de hardware especializado.

## 2. ESPECIFICACIONES FUNCIONALES

### 🆔 Control de Identidad y Seguridad
*   **Biometría Facial**: Verificación de identidad mediante IA (face-api.js) con un umbral de confianza métrica del 68%. Detecta rostros en tiempo real para evitar suplantaciones ("buddy punching").
*   **Geolocalización GPS**: Registro obligatorio de coordenadas (Latitud/Longitud) y localidad aproximada en cada marcaje o incidente.
*   **Evidencias Parametrizadas**: Captura obligatoria de foto inalterable en incidentes, comprimida localmente.
*   **Encriptación**: Contraseñas de administración protegidas con algoritmo **bcrypt** localmente, y llaves asimétricas para los tokens de licenciamiento.

### ⏰ Gestión de Asistencia
*   **Marcaje Directo**: Registro rápido de Entrada/Salida/Novedad.
*   **Generador de Comprobantes**: Construye una previsualización de imagen con marca de agua inalterable (datos hora-GPS) lista para ser compartida en redes como WhatsApp al momento exacto de picar.
*   **Modo Offline PWA**: Almacenamiento en caché estructural que permite levantar la aplicación sin datos celulares.

### 📊 Administración y Reportes
*   **Dashboard de Control (INFORMES y CONFIG)**: Panel web para supervisores separado lógicamente.
*   **Cálculo Laboral Colombiano**: Segmentación estricta de domingos, festivos (leyes Emiliani computadas internamente), jornadas diurnas (06:00 - 21:00) y nocturnas.
*   **Depuración Inteligente**: Retención parametrizada de X meses para fotografías en Firestore Storage Storage (asegurando estabilidad de cuota gratuita en plataformas de alojamiento cloud).
*   **Exportación de Datos**: Generación de reportes detallados en formatos **Excel (XLSX)** y **CSV**.
    *   *Datos incluidos*: ID Usuario, Nombres, Apellidos, Horas detalladas por turnos, y cálculo de almuerzos debitados.

## 3. REQUISITOS TÉCNICOS

### 📱 Cliente (Dispositivos de Empleados)
*   **Hardware**:
    *   Cámara frontal funcional (resolución mínima VGA).
    *   GPS / Geolocalización activa.
    *   Conexión a Internet (Datos móviles o WiFi) momentánea.
*   **Software**:
    *   Navegador Moderno: Google Chrome (recomendado), Safari, Firefox, Edge.
    *   Sistema Operativo: Android 8+, iOS 13+, Windows 10/11, macOS.
    *   Soporte completo a descarga nativa de Safari iOS "Add to Homescreen".

### ☁️ Infraestructura (Backend)
*   **Plataforma**: Google Firebase
*   **Base de Datos**: Firestore (NoSQL Tiempo Real)
*   **Archivo**: Firebase Storage (Buckets binarios).
*   **Autenticación**: Firebase Auth
*   **Hosting**: Firebase Hosting (CDN Global)

## 4. SEGURIDAD Y PRIVACIDAD

*   **Identidad Matemática**: Los rostros iniciales de los registros **NO** se guardan como imágenes. Se genera y almacena únicamente un "descriptor facial" (matriz matemática de 128 valores), blindando la privacidad biométrica basal.
*   **Acceso Dividido**: Roles diferenciados para Empleados (solo registro) y Administradores (acceso total a datos).
*   **Inmutabilidad Local (Militante)**: Validación física de la hora basándose en la pre-renderización JavaScript sobre fotografías exportadas, eliminando cualquier vector de desajuste provocado por el timestamp final de transmisión de base de datos.
*   **Licenciamiento Hard-Limit**: Los tokens administran cortes de servicio precisos ("Buffer-Flex"), paralizando sistemas no autorizados.

---
**Soporte Técnico**: Disponible bajo contrato de mantenimiento.
**Licencia**: Software como Servicio (SaaS).
