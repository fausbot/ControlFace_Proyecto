# FICHA TÉCNICA DEL PRODUCTO 📄

**Nombre del Producto**: Sistema de Control de Asistencia y Acceso Biométrico (PWA)
**Versión Actual**: 1.1.0
**Fecha de Actualización**: 15 de Febrero, 2026
**Tipo de Software**: Progressive Web App (PWA) - SaaS

---

## 1. DESCRIPCIÓN DEL PRODUCTO
Plataforma digital integral para la gestión y control de asistencia de personal en tiempo real. Diseñada como una Aplicación Web Progresiva (PWA), permite el registro de entrada y salida mediante verificación de identidad biométrica (reconocimiento facial) y geolocalización, accesible desde cualquier dispositivo móvil o computadora sin necesidad de hardware especializado.

## 2. ESPECIFICACIONES FUNCIONALES

### 🆔 Control de Identidad y Seguridad
*   **Biometría Facial**: Verificación de identidad mediante IA (face-api.js) con un umbral de confianza del 68%. Detecta rostros en tiempo real para evitar suplantaciones ("buddy punching").
*   **Geolocalización GPS**: Registro obligatorio de coordenadas (Latitud/Longitud) y localidad aproximada en cada marcaje.
*   **Encriptación**: Contraseñas de administración protegidas con algoritmo **bcrypt** (estándar bancario).

### ⏰ Gestión de Asistencia
*   **Marcaje One-Click**: Registro rápido de Entrada/Salida.
*   **Sincronización Cloud**: Los datos se suben a la nube instantáneamente.
*   **Modo Offline**: Funcionamiento parcial sin conexión a internet (los registros se sincronizan al recuperar conexión).

### 📊 Administración y Reportes
*   **Dashboard de Control**: Panel web para supervisores con acceso seguro con contraseña maestra.
*   **Gestión de Usuarios**: Alta, baja y modificación de perfiles de empleados (Nombres, Apellidos, Biometría).
*   **Exportación de Datos**: Generación de reportes detallados en formato **CSV Compatible con Excel**.
    *   *Datos incluidos*: ID Usuario, Nombres, Apellidos, Día, Fecha, Hora Exacta, Ubicación de marcaje.

## 3. REQUISITOS TÉCNICOS

### 📱 Cliente (Dispositivos de Empleados)
*   **Hardware**:
    *   Cámara frontal funcional (resolución mínima VGA).
    *   GPS / Geolocalización activa.
    *   Conexión a Internet (Datos móviles o WiFi).
*   **Software**:
    *   Navegador Moderno: Google Chrome (recomendado), Safari, Firefox, Edge.
    *   Sistema Operativo: Android 8+, iOS 13+, Windows 10/11, macOS.

### ☁️ Infraestructura (Backend)
*   **Plataforma**: Google Firebase
*   **Base de Datos**: Firestore (NoSQL Tiempo Real)
*   **Autenticación**: Firebase Auth
*   **Hosting**: Firebase Hosting (CDN Global)

## 4. SEGURIDAD Y PRIVACIDAD

*   **Protección de Datos**: Los rostros **NO** se guardan como imágenes. Se genera y almacena únicamente un "descriptor facial" (matriz matemática), garantizando la privacidad del empleado.
*   **Acceso**: Roles diferenciados para Empleados (solo registro) y Administradores (acceso total a datos).
*   **Integridad**: Validación de hora del servidor para impedir manipulación de horarios en el dispositivo.

---
**Soporte Técnico**: Disponible bajo contrato de mantenimiento.
**Licencia**: Software como Servicio (SaaS).
