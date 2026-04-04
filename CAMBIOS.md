# Registro de Cambios - Control de Asistencia

## [1.7.68] - 2026-04-04

### Añadido
- **Módulos de Gestión de Licencias**: Inclusión de `deploy-manager` para la gestión remota de claves de activación.
- **Seguridad AES en Licencias**: Cifrado simétrico AES-256 para validación de cuotas de empleados en tiempo real.
- **Soporte Rest API**: Capacidad de interactuar con Firestore mediante curl/Python, evitando la necesidad de la CLI de Firebase en entornos limitados.

## [1.6.99] - 2026-03-17

### Añadido
- Servicio Offline Total con sincronización en segundo plano.
- Identificación de estado (Entrada/Salida) independiente para múltiples usuarios en un mismo dispositivo.
- Persistencia de estado ultra-rápida mediante localStorage.

## Versiones Anteriores

### 1. Corrección de Bugs en el Flujo Entrada/Salida

**Archivo:** `src/pages/Dashboard.jsx`

- **Corrección de typo:** Se corrigió `lastType === 'Salid'` a `lastType === 'Salida'`
- **Orden por defecto:** Cuando el tipo no es reconocido, ahora permite ambos botones en lugar de solo entrada
- **Actualización inmediata del estado:** Después de guardar un registro, el estado se actualiza inmediatamente sin esperar

### 2. Sistema Offline Transparente

**Archivo:** `src/components/dashboard/SyncManager.jsx`

- **Sincronización automática:** Cada 30 segundos si hay conexión
- **Sync al detectar conexión:** Cuando vuelve el internet, sincroniza inmediatamente
- **Sync al iniciar:** 2 segundos después de cargar si hay conexión
- **Sin indicador visible:** El usuario no se entera que está offline - todo es transparente

### 3. Persistencia del Estado con localStorage

**Archivo:** `src/pages/Dashboard.jsx`

- **Guarda el último tipo de registro:** `lastAttendanceType` y `lastAttendanceTime` en localStorage
- **Recupera el estado al iniciar:** Carga desde localStorage primero, antes de consultar Firestore
- **No sobrescribe al cargar:** Si ya hay un estado válido, no consulta Firestore
- **Funciona después de deploy:** El usuario mantiene su estado (entrada/salida) aunque haga refresh o deploy

### 4. Corrección del Orden de Datos

**Archivo:** `src/services/attendanceService.js`

- **Orden por fecha+hora:** Ahora usa `fecha` y `hora` como fuente principal para ordenar
- **Fallback a timestamp:** Si no hay fecha/hora, usa el timestamp de Firestore
- **Más reciente primero:** Los registros aparecen con el más reciente arriba

### 5. Evitar Duplicación de Registros

**Archivo:** `src/components/dashboard/SyncManager.jsx`

- **Busca registros existentes:** Antes de guardar, busca si ya existe un documento con el mismo usuario, fecha y hora
- **Actualiza si existe:** Si ya existe, actualiza la ubicación (corrige "Sin conexión a mapas")
- **Crea si no existe:** Solo crea un nuevo documento si no hay duplicado

### 6. Correcciones Varias

- **Importación de getPendingRecords:** Se agregó la importación faltante en Dashboard.jsx
- **Eliminación de código problemático:** Se quitó el checkLastStatus después de guardar que causaba conflictos
- **Timeout de seguridad:** Se eliminó porque causaba problemas con el estado

---

## Cómo Funciona Ahora

1. **Usuario hace un registro (online):** Se guarda directamente en Firestore
2. **Usuario hace un registro (offline):** Se guarda en IndexedDB y se muestra "Sin conexión a mapas"
3. **Vuelve la conexión:** 
   - Se sincroniza automáticamente
   - Se busca si ya existe el registro
   - Se actualiza con la ubicación correcta
   - Se elimina el registro duplicado si existe
4. **Usuario hace deploy/refresh:** 
   - Se carga el estado desde localStorage
   - Mantiene el botón correcto (entrada o salida)
5. **Datos en la pestaña Datos:** 
   - Siempre ordenados por fecha/hora (más reciente arriba)
   - Sin duplicados

---

## Notas Técnicas

- El sistema usa `fecha` y `hora` como fuente de verdad para el ordenamiento
- El localStorage es la fuente principal del estado después de un registro
- Firestore se consulta solo si no hay datos en localStorage
- La sincronización es completamente transparente para el usuario
