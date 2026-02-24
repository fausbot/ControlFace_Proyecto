# ControlFace - PWA (Sistema de Control de Asistencia y Acceso)

## Descripción General 🌐
Esta aplicación es una **Progressive Web App (PWA)** diseñada para el control de asistencia y acceso de empleados en tiempo real. Combina tecnologías de reconocimiento facial, geolocalización y sincronización en la nube para garantizar registros precisos y seguros desde cualquier dispositivo con navegador web (móviles, tablets o computadoras).

---

## Características Principales ⭐

### 1. Control de Identidad
*   **Reconocimiento Facial**: Utiliza inteligencia artificial (`face-api.js`) para verificar que la persona que marca la asistencia es realmente el empleado registrado. Se requiere registrar el rostro una única vez al crear la cuenta.
*   **Geolocalización**: Registra automáticamente las coordenadas GPS y la localidad aproximada al momento del marcaje (entrada, salida o incidente).
*   **Evidencias en Novedades**: Permite adjuntar y guardar automáticamente una fotografía en la nube para los reportes de novedad/incidente y turno normal.

### 2. Gestión de Asistencia
*   **Marcaje Sencillo**: Botones grandes y claros para registrar "Entrada", "Salida", e "Incidente/Novedad".
*   **Validación Horaria**: Registra la fecha y hora local del dispositivo, incrustándola en una foto con marca de agua, proveyendo inmutabilidad visual.
*   **Compartir Comprobante**: Cada marcación genera una imagen con marca de agua (hora, lugar, usuario) que puede compartirse inmediatamente vía WhatsApp.

### 3. Administración Centralizada
*   **Panel de Control (INFORMES y CONFIG)**: Vista exclusiva para administradores, protegida por contraseña local.
*   **Gestión de Usuarios**:
    *   Registro de nuevos empleados con captura de nombre, apellido y datos biométricos.
    *   Eliminación de usuarios (purgando base de datos y Auth).
*   **Reportes**:
    *   Listado completo de todos los registros de asistencia y fotografías tomadas.
    *   Filtros por rango de fechas y buscador de texto.
    *   **Exportación a Excel / CSV**: Descarga nativa de reportes estructurados con detalle de horas diurnas, nocturnas, dominicales (con soporte a festivos colombianos), descuentos automáticos de almuerzo, y reglas de redondeo paramétricas.

### 4. Tecnología PWA
*   **Instalable**: Se puede "instalar" como una aplicación nativa en Android e iOS (botón superior) sin cruzar tiendas de aplicaciones de terceros.
*   **Licenciamiento Seguro**: Sistema de control criptográfico modular e independiente de internet.

---

## Almacenamiento de Información 💾

Toda la información del sistema se almacena de forma segura en la nube utilizando **Google Firebase**.

### 1. Autenticación de Usuarios (Firebase Auth)
Aquí se guardan las credenciales de acceso.
*   **Datos**: `UID` (Identificador único), `Email`, `Contraseña Hash`.

### 2. Base de Datos (Cloud Firestore)

#### Estructura de Colecciones Principales:

*   **`employees` (Empleados)**
    *   Almacena los perfiles de usuario.
    *   **Campos**: `firstName`, `lastName`, `email`, `faceDescriptor` (Datos matemáticos del rostro - NO se guarda la foto facial del registro), `fechaCreacion`.

*   **`attendance` (Asistencia)**
    *   Almacena cada evento de marcaje de entrada/salida.
    *   **Campos**: `usuario` (Email), `tipo` (Entrada/Salida), `fecha` (Texto), `hora` (Texto), `timestamp` (Fecha de impacto en la red), `localidad` (Dirección aproximada), `coords` (Latitud/Longitud).

*   **`incidents` (Novedades)**
    *   Registros de problemas o reportes de estado.
    *   **Campos**: Añade descripción de la eventualidad frente a fallas técnicas, de planta física o retrasos estructurales.

*   **`fotos`**
    *   Metadatos de cada fotografía capturada para su gestión de retención automática tras *N* meses (descarga directa vía URL persistente).

*   **`settings` (Configuración)**
    *   **Documento**: `config` -> `adminPassword`
    *   **Documento**: `employeeFields` -> `calc_lunch`, `calc_rounding`, `storage_retentionAsistencia`, etc (Configuraciones dinámicas operativas parametrizables en la pestaña).

### 3. Almacenamiento Multimedia (Firebase Storage)
*   Carpeta `fotos/`: Guarda la evidencia JPG de las asistencias e incidentes. Un proceso automatizado en la pestaña Informes depura silenciosamente material obsoleto.

---

## Arquitectura Técnica 🏗️

| Componente | Tecnología | Descripción |
| :--- | :--- | :--- |
| **Frontend** | React + Vite | Webapp asíncrona renderizada. |
| **Estilos** | Tailwind CSS | Interfaz modular. |
| **Base de Datos** | Firestore | Persistencia paralela en la nube. |
| **Archivos** | Firebase Storage | Custodia de Evidencias (Imágenes JPG comprimidas localmente). |
| **Autenticación** | Firebase Auth | Autenticador oficial Google. |
| **Biometría IA** | face-api.js | Comparativa de puntos biométricos (Desv. Euclideana 0.68). |
| **Exportación**| SheetJS (xlsx) | Compilación binaria para archivos Excel puramente locales. |

---

## Parámetros Lógicos ⚙️

1. **Calculadora Colombiana**: El aplicativo evalúa la ley de corte colombiana (6:00 AM - 9:00 PM Diurno / 9:00 PM - 6:00 AM Nocturno), así como domingos y festivos definidos mediante el algoritmo _Computus_ de pascua y leyes Emiliani.
2. **Descuento de Almuerzo Automático**: Se activa en CONFIG, de lo contrario reporta ("No") frente a jornadas menores a 8h. 
3. **Cálculos Aislados**: Para garantizar máxima precisión en auditorías frente al usuario, la liquidación matemática de tiempos toma el formato visual **texto (`hora`, `fecha`)** anclado físicamente en la foto en lugar del _Timestamp de red_, descartando latencia u off-grid del dispositivo remoto.
4. **Licenciamiento (Buffer-Flex)**: Soporta licencias JSON cifradas que permiten un margen del (%x) de sobrepaso a la cuota global comprada antes de bloquear la creación del empleado N+1.

---
*Documento actualizado el 24/02/2026 para la versión 1.4.11 de ControlFace*
