# Sistema de Control de Asistencia y Acceso BiomëtriCo (PWA)

## Descripción General 🌐
Esta aplicación es una **Progressive Web App (PWA)** diseñada para el control de asistencia y acceso de empleados en tiempo real. Combina tecnologías de reconocimiento facial, geolocalización y sincronización en la nube para garantizar registros precisos y seguros desde cualquier dispositivo con navegador web (móviles, tablets o computadoras).

---

## Características Principales ⭐

### 1. Control de Identidad
*   **Reconocimiento Facial**: Utiliza inteligencia artificial (`face-api.js`) para verificar que la persona que marca la asistencia es realmente el empleado registrado. Se requiere registrar el rostro una única vez al crear la cuenta.
*   **Geolocalización**: Registra automáticamente las coordenadas GPS y la localidad aproximada al momento del marcaje (entrada o salida).

### 2. Gestión de Asistencia
*   **Marcaje Sencillo**: Botones grandes y claros para registrar "Entrada" y "Salida".
*   **Validación Horaria**: Registra la fecha y hora exacta del servidor para evitar manipulaciones del reloj del dispositivo.
*   **Historial Personal**: Cada empleado puede ver sus propios registros recientes.

### 3. Administración Centralizada
*   **Panel de Control (Dashboard)**: Vista exclusiva para administradores protegida por contraseña encriptada.
*   **Gestión de Usuarios**:
    *   Registro de nuevos empleados con captura de nombre, apellido y datos biométricos.
    *   Eliminación de usuarios y gestión de bajas.
*   **Reportes**:
    *   Listado completo de todos los registros de asistencia.
    *   Filtros por rango de fechas.
    *   **Exportación a CSV**: Descarga de reportes compatibles con Excel que incluyen detalles completos (Nombres, Apellidos, Fecha, Hora, Ubicación).

### 4. Tecnología PWA
*   **Instalable**: Se puede "instalar" como una aplicación nativa en Android e iOS sin pasar por las tiendas de aplicaciones.
*   **Modo Offline**: Funciona parcialmente sin internet (la interfaz carga gracias al caché), aunque requiere conexión para sincronizar los registros.

---

## Almacenamiento de Información 💾

Toda la información del sistema se almacena de forma segura en la nube utilizando los servicios de **Google Firebase**.

### 1. Autenticación de Usuarios (Firebase Auth)
Aquí se guardan las credenciales de acceso (correo electrónico y contraseña encriptada).
*   **Datos**: `UID` (Identificador único), `Email`, `Contraseña Hash`.

### 2. Base de Datos (Cloud Firestore)
Es una base de datos NoSQL en tiempo real donde reside la información operativa.

#### Estructura de Colecciones:

*   **`employees` (Empleados)**
    *   Almacena los perfiles de usuario.
    *   **Campos**: `firstName` (Nombres), `lastName` (Apellidos), `email`, `faceDescriptor` (Datos matemáticos del rostro - NO se guarda la foto), `fechaCreacion`.

*   **`attendance` (Asistencia)**
    *   Almacena cada evento de marcaje de entrada/salida.
    *   **Campos**: `usuario` (Email), `tipo` (Entrada/Salida), `fecha` (Texto), `hora` (Texto), `timestamp` (Fecha exacta servidor), `localidad` (Dirección aproximada), `coords` (Latitud/Longitud).

*   **`settings` (Configuración)**
    *   Contiene la configuración global del sistema.
    *   **Documento**: `config` -> `adminPassword`: Contraseña del panel de administración encriptada con **bcrypt** (irreversible).

*   **`deletionQueue` (Cola de Borrado)**
    *   Almacena temporalmente los usuarios que han sido marcados para eliminación, asegurando que sus datos se purguen correctamente del sistema.

### 3. Almacenamiento Local (Dispositivo)
*   **Cache Storage**: Almacena los archivos de la aplicación (HTML, CSS, JS, imágenes) para permitir que la app cargue instantáneamente y funcione sin internet (modo offline).

---

## Arquitectura Técnica 🏗️

| Componente | Tecnología | Descripción |
| :--- | :--- | :--- |
| **Frontend** | React + Vite | Interfaz de usuario rápida y moderna. |
| **Estilos** | Tailwind CSS | Diseño responsivo (adaptable a móviles). |
| **Base de Datos** | Firestore | Persistencia de datos en la nube. |
| **Autenticación** | Firebase Auth | Sistema de login seguro. |
| **Backend** | Cloud Functions | Lógica de servidor para tareas críticas (como encriptar contraseñas). |
| **Seguridad Admin** | bcrypt | Algoritmo de hashing estándar de la industria. |
| **Biometría** | face-api.js | Librería de reconocimiento facial en el navegador. |

---

## Requisitos de Uso 📱

*   **Dispositivo**: Teléfono inteligente, Tablet o Computadora con cámara web.
*   **Navegador**: Google Chrome (Recomendado), Safari, Firefox o Edge.
*   **Permisos**: Se debe permitir el acceso a la **Cámara** y a la **Ubicación** para poder registrar asistencia.

---
*Documento generado el 15/02/2026 para la versión 1.1.0*
