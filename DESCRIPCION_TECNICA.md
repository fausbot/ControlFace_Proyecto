# ControlFace - PWA (Sistema de Control de Asistencia y Acceso)

## Descripción General 🌐
Esta aplicación es una **Progressive Web App (PWA)** de última generación diseñada para el control de asistencia y acceso de empleados en tiempo real. La interfaz está **totalmente localizada al español** y optimizada para una experiencia de usuario premium. Combina inteligencia artificial avanzada para reconocimiento facial, auditoría multifactor de geolocalización y sincronización robusta en la nube para garantizar registros inmutables desde cualquier dispositivo con navegador web moderno.

---

## Características Principales ⭐

### 1. Control de Identidad y Biometría IA
*   **Reconocimiento Facial Dinámico**: Implementa `@vladmandic/face-api` sobre modelos de IA optimizados para navegadores. Compara descriptores faciales matemáticos con un umbral ajustable (default 0.63) para máxima seguridad.
*   **Prueba de Vida Activa (Liveness)**: Reto de rotación de cabeza (Frontal -> Izquierda -> Frontal) para validar la presencia física y evitar el uso de fotografías estáticas.
*   **Análisis de Vida Pasiva**: Algoritmo que detecta anomalías visuales en milisegundos:
    *   **Patrones Moiré**: Escaneo de frecuencias para detectar fotos tomadas de otras pantallas.
    *   **Reflejos Sintéticos**: Análisis de saturación lumínica artificial.
    *   **Detección de Marcos (Bezels)**: Identifica si el rostro está dentro del marco de otro dispositivo móvil o monitor.

### 2. Gestión de Asistencia y Novedades
*   **Marcaje Adaptativo**: Botones de acción con etiquetas personalizables (Ej: "¡Hola! Ya llegué") configurables desde el panel administrativo.
*   **Evidencias con Marca de Agua Inmutable**: Cada registro genera una imagen JPG comprimida localmente que incrusta: Email, Fecha/Hora (Servidor y Colombia), Coordenadas GPS y Dirección aproximada.
*   **Modo Incidente / Novedad**: Permite reportar fallas técnicas o retrasos usando la cámara trasera del dispositivo para capturar evidencias del entorno.
*   **Compartir Comprobante Inmediato**: Integración nativa con la API de compartir del sistema (WhatsApp, Email, etc.) para entrega inmediata de pruebas al supervisor.

### 3. Modo Visitas a Clientes (Ruta) 📍
*   Funcionalidad especializada para personal en campo. Permite registrar múltiples "Marcajes en Cliente" durante el turno, protegidos por validación de geolocalización y biometría, sin cerrar el turno principal.

### 4. Tecnología PWA y Resiliencia
*   **Offline First**: Capacidad de guardar registros localmente en **IndexedDB** si la red falla, con sincronización automática posterior.
*   **Instalación Nativa**: Guía integrada para instalación en Android e iOS sin pasar por tiendas tradicionales.
*   **Limpieza de Caché de Usuario**: Herramienta frontal para forzar actualizaciones y purgar inconsistencias locales.

---

## Administración y Configuración ⚙️

### 1. Panel de Control (Admin)
*   **Gestión de Usuarios**: Registro con captura única de biometría y soporte para perfiles con hasta 20 campos dinámicos (EPS, ARL, tallas, etc.).
*   **Reportes Inteligentes**:
    *   Filtros avanzados y buscador de texto.
    *   **Exportación Premium**: Generación de archivos Excel (`xlsx-js-style`) con estilos aplicados, cálculos automáticos de horas ordinarias, nocturnas y recargos dominicales basados en la normativa colombiana.
*   **Sincronización de Integridad**: Herramienta para depurar "registros fantasma" en la base de datos si las evidencias físicas fueron eliminadas manualmente de Storage.

### 2. Parámetros de Seguridad
| Parámetro | Rango / Opción | Descripción |
| :--- | :--- | :--- |
| **Sensibilidad Facial** | 0.40 - 0.80 | Nivel de estrictez en la comparación biométrica. |
| **Prueba de Vida** | On / Off | Requerir giro de cabeza para el marcaje. |
| **Detección de Pantalla**| Automático | Bloqueo por detección de marcos o patrones moiré (ERR-07). |
| **Auditoría GPS** | Multifactor | Detecta altitudes sospechosas (ERR-01), precisión falsa (ERR-02) y discrepancia topográfica (ERR-04). |

---

## Almacenamiento de Información 💾

El sistema utiliza **Google Firebase** (v12.7.0) con una arquitectura optimizada para velocidad y costo:

### 1. Base de Datos (Cloud Firestore)
*   **`employees`**: Perfiles, descriptores faciales y configuración de campos dinámicos.
*   **`attendance`**: Registros de marcaje con metadatos de seguridad (isSuspiciousGPS, gpsAnomalies).
*   **`incidents`**: Reportes de novedades con descripción detallada.
*   **`settings`**: Documento `employeeFields` que centraliza toda la lógica operativa del cliente.

### 2. Evidencias (Firebase Storage)
*   Almacenamiento de fotos JPG.
*   **Políticas de Retención**: Configuración independiente por modo (Asistencia, Incidentes, Visitas) que permite automatizar la eliminación tras *N* días (ej. 90 días para asistencia, 540 para incidentes).

---

## Arquitectura Técnica 🏗️

| Componente | Tecnología | Detalle |
| :--- | :--- | :--- |
| **Frontend** | React 19 + Vite | Webapp asíncrona de alto rendimiento. |
| **Estilos** | Tailwind CSS 4 | Interfaz moderna con animaciones y micro-interacciones. |
| **IA Biométrica** | @vladmandic/face-api | Inferencia local en el navegador (Web Worker ready). |
| **Base de Datos** | Cloud Firestore | NoSQL con reglas de seguridad granulares. |
| **Geolocalización**| Open-Meteo API | Validación topográfica de altitud para prevenir Fake GPS. |
| **Licenciamiento** | Buffer-Flex | Control criptográfico de cuotas con margen de cortesía personalizable. |

---
**Versión Actual:** 1.7 
**Última Actualización:** 15/04/2026  
**Desarrollado para:** ControlFace Multitenant Architecture
