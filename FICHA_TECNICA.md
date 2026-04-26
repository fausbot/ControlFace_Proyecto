# FICHA TÉCNICA DEL PRODUCTO 📄

**Nombre del Producto**: ControlFace - Sistema de Control de Asistencia y Acceso Biométrico (PWA)
**Versión Actual**: 1.7.68
**Fecha de Actualización**: 15 de Abril, 2026
**Tipo de Software**: Progressive Web App (PWA) - SaaS (Multitenant)

---

## 1. DESCRIPCIÓN DEL PRODUCTO
Plataforma digital de alta seguridad para la gestión y control de asistencia de personal en tiempo real. Diseñada como una Aplicación Web Progresiva (PWA), permite el registro de entrada, salida, novedades y visitas externas mediante verificación de identidad biométrica avanzada e inteligencia de geolocalización. Es accesible desde cualquier smartphone o computadora sin hardware dedicado.

## 2. ESPECIFICACIONES FUNCIONALES

### 🆔 Control de Identidad y Seguridad Anti-Fraude
*   **Biometría Facial con IA**: Motor `@vladmandic/face-api` que garantiza precisión del 99% mediante descriptores vectoriales.
*   **Prueba de Vida Multifactor**:
    *   **Activa**: Reto de giro de cabeza (Yaw) para asegurar presencia física.
    *   **Pasiva**: Protección contra ataques de presentación (fotos de pantallas, patrones moiré, reflejos y marcos de dispositivos).
*   **Auditoría GPS Multifactor**: Detección de Fake GPS mediante análisis de altitud (ERR-01), precisión sospechosa (ERR-02) y discrepancia topográfica en tiempo real (ERR-04).
*   **Integridad de Imagen (ERR-07)**: Bloqueo automático ante detección de capturas de pantallas o monitores.

### ⏰ Gestión de Asistencia y Campo
*   **Marcaje Adaptativo**: Registro de Entrada/Salida con etiquetas UI personalizables por el administrador.
*   **Modo Visitas (Ruta)**: Permite registrar desplazamientos externos sin cerrar el turno administrativo base.
*   **Generador de Evidencias**: Marca de agua inmutable sobre JPG con datos de servidor, GPS y dirección.
*   **Compartir en WhatsApp**: Exportación nativa inmediata para supervisión externa.
*   **Modo Offline Resiliente**: Almacenamiento local en IndexedDB con sincronización automática al recuperar red.

### 📊 Administración y Reportes Avanzados
*   **Gestión Multitenant**: Soporte para múltiples clientes con campos dinámicos configurables (EPS, ARL, tallas, etc.).
*   **Cálculo Laboral Colombiano**: Automatización de horas ordinarias, nocturnas, domingos y festivos (algoritmo Computus).
*   **Descuento de Almuerzo**: Parametrizable para turnos superiores a 8 horas.
*   **Retención Inteligente de Datos**: Políticas automáticas de borrado de fotos (3, 30, 90, 540 días) para optimizar costos de storage.
*   **Exportación de Reportes**: Generación de archivos Excel con estilos y cálculos liquidados listos para nómina.

## 3. REQUISITOS TÉCNICOS

### 📱 Cliente (Dispositivos)
*   **Hardware**: Cámara frontal funcional, GPS activo.
*   **Software**: Navegador moderno (Chrome 120+, Safari 17+).
*   **Plataformas**: Android 10+, iOS 15+, Windows 10/11, macOS.
*   **Instalación**: Soporte completo para "Add to Homescreen" (A2HS).

### ☁️ Infraestructura Backend
*   **Proveedores**: Google Firebase (Auth, Firestore, Storage, Hosting).
*   **APIs Externas**: Open-Meteo (Verificación topográfica).

## 4. SEGURIDAD Y PRIVACIDAD
*   **Privacidad por Diseño**: Los rostros solo se guardan como descriptores matemáticos (hashes de 128 valores). Las fotos de evidencia son opcionales y autodepurables.
*   **Tokens de Licencia**: Cifrado AES-256 para el control de acceso y límites de empleados ("Buffer-Flex").
*   **Timezone Inmutable**: Conversión forzada a America/Bogota para todos los cálculos, independiente de la configuración del usuario.

---
**Soporte**: support@controlface.app  
**Licencia**: Software as a Service (SaaS).
