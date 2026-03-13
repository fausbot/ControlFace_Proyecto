# Ideas de Mejora - Control de Entrada

## 1. Arquitectura y Código

### 1.1 Migración a TypeScript
- **Problema**: El proyecto está en JavaScript puro sin tipos, lo que dificulta el mantenimiento y refactorización.
- **Beneficio**: Mejor autocomplete, detección temprana de errores, mejor documentación del código.
- **Impacto**: Medio-Alto (requiere refactorización significativa)

### 1.2 Separación de Componentes en Dashboard.jsx
- **Problema**: El archivo `Dashboard.jsx` tiene ~988 líneas con toda la lógica mezclada.
- **Mejora**: Extraer componentes como:
  - `AttendanceButtons` - Botones de entrada/salida
  - `CameraCapture` - Lógica de cámara y captura
  - `LivenessDetector` - Detección de vida
  - `PreviewModal` - Vista previa
- **Beneficio**: Código más mantenible, reutilizable y testeable

### 1.3 Implementar Hooks Personalizados
- Crear hooks como `useAttendance`, `useCamera`, `useLiveness`, `useLicense`
- **Beneficio**: Reutilizar lógica entre componentes, código más limpio

### 1.4 Mejora en Gestión de Estado
- **Problema**: Mezcla de useState local con Firebase en tiempo real
- **Sugerencia**: Considerar usar Zustand o Context API más estructurado para estado global

---

## 2. Seguridad

### 2.1 Autenticación y Autorización
- Implementar roles de usuario más granulares (admin, supervisor, empleado)
- Agregar autenticación de dos factores (2FA)
- Revocar tokens de sesión automáticamente después de inactividad

### 2.2 Validación de Datos
- Agregar validación de lado del cliente más robusta (Zod o Yup)
- Sanitizar inputs antes de guardar en Firestore
- Validar formatos de fecha/hora en entrada manual

### 2.3 Protección de Rutas
- El sistema de `adminAccess` es temporal y confuso (AuthContext.jsx:18-26)
- Implementar sistema de roles propiamente dicho

---

## 3. Rendimiento

### 3.1 Optimización de Carga
- Los modelos de face-api (~10MB) se cargan desde CDN externo en cada sesión
- **Sugerencia**: Bundler los modelos o usar caching agresivo
- Implementar code splitting más granular

### 3.2 Consultas a Firestore
- `Dashboard.jsx:182-237`: Carga TODOS los registros de attendance para verificar estado
- **Problema**: Con muchos registros, esto será lento
- **Sugerencia**: Usar índices compuestos y consultas con `limit(1)` y `orderBy`

### 3.3 Imágenes
- Las imágenes se procesan en cliente y pueden ser pesadas
- Comprimir imágenes antes de guardar en Storage
- Usar formato WebP en lugar de JPEG

---

## 4. Funcionalidades Nuevas

### 4.1 Notificaciones Push
- Notificaciones cuando el empleado no ha marcado entrada a hora definida
- Recordatorios de turno

### 4.2 Dashboard Analítico
- Gráficos de asistencia (días trabajados, horas extras, ausencias)
- Comparación entre períodos
- Tendencias por empleado/departamento

### 4.3 Module de Turnos
- Definición de horarios de trabajo por empleado
- Alertas cuando se trabaja fuera del horario
- Turnos rotativos

### 4.4 Vacaciones y Permisos
- Registro de vacaciones
- Solicitud y aprobación de permisos
- Balance de días disponibles

### 4.5 Captura Offline
- Cuando no hay internet, guardar localmente y sincronizar después
- Usar IndexedDB + Service Worker

#### 4.5.1 Análisis de Conectividad

| Datos | Sin internet | Requiere internet |
|-------|--------------|-------------------|
| **GPS (coordenadas)** | ✅ Funciona - API `navigator.geolocation` usa chip GPS del dispositivo | No |
| **Hora del dispositivo** | ✅ Funciona - Usa reloj del teléfono | No |
| **Dirección (localidad)** | ❌ No funciona - Necesita reverse geocoding (Google Maps, Nominatim) | Sí |

**Solución:** Guardar sin dirección y completar cuando haya conexión.

#### 4.5.2 Estructura de Datos Offline

```javascript
// Registro guardado en IndexedDB
{
  id: "local_123",
  imageBlob: Blob,              // Foto como Blob (más eficiente que base64)
  metadata: {
    usuario: "email@company.com",
    tipo: "Entrada",
    fecha: "13/03/2026",
    hora: "08:30:00",
    coords: { lat: 4.711, lng: -74.072 },  // Coordenadas GPS
    localidad: null,              // Se completa después al sincronizar
  },
  status: "pending",             // "pending" o "synced"
  createdAt: "2026-03-13T08:30:00"
}
```

#### 4.5.3 Diagrama de Flujo

```
┌─────────────────────────────────────────────────────┐
│                    DISPOSITIVO                       │
├─────────────────────────────────────────────────────┤
│ 1. Usuario marca asistencia                         │
│ 2. GPS captura coords (funciona offline) ✅        │
│ 3. Foto convertida a Blob y guardada en IndexedDB   │
│ 4. Registro marcado como "pending"                 │
│ 5. App indica "pendiente de sincronizar" 🟡       │
└─────────────────────────────────────────────────────┘
                          │
                          ▼ (cuando hay conexión)
┌─────────────────────────────────────────────────────┐
│              SERVICE WORKER / APP                   │
├─────────────────────────────────────────────────────┤
│ 6. Detectar conexión (online event)                 │
│ 7. Recorrer registros "pending"                    │
│ 8. Para cada registro:                             │
│    a. fetchLocationName(coords) → obtener dirección│
│    b. Subir foto a Firebase Storage                │
│    c. Guardar registro completo en Firestore      │
│    d. Marcar como "synced"                        │
│    e. Eliminar de IndexedDB                        │
│ 9. Notificar al usuario ✅                          │
└─────────────────────────────────────────────────────┘
```

#### 4.5.4 Implementación Sugerida

**Dependencia necesaria:** `idb` (wrapper IndexedDB)
```bash
npm install idb
```

**Archivo: src/services/offlineStorage.js**
```javascript
import { openDB } from 'idb';

const DB_NAME = 'attendance-offline';
const STORE_NAME = 'pending-records';

// Convertir dataURL a Blob (más eficiente que base64)
const dataURLtoBlob = (dataurl) => {
  const arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) u8arr[n] = bstr.charCodeAt(n);
  return new Blob([u8arr], { type: mime });
};

export const initDB = async () => {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    },
  });
};

export const saveOfflineRecord = async (imageDataUrl, metadata, mode) => {
  const db = await initDB();
  await db.add(STORE_NAME, {
    imageBlob: dataURLtoBlob(imageDataUrl),
    metadata: { ...metadata, mode },
    status: 'pending',
    createdAt: new Date().toISOString()
  });
};

export const getPendingRecords = async () => {
  const db = await initDB();
  return db.getAll(STORE_NAME);
};

export const deletePendingRecord = async (id) => {
  const db = await initDB();
  await db.delete(STORE_NAME, id);
};

export const updateRecordStatus = async (id, status) => {
  const db = await initDB();
  const record = await db.get(STORE_NAME, id);
  if (record) {
    record.status = status;
    await db.put(STORE_NAME, record);
  }
};
```

**Modificar capture() en Dashboard.jsx:**
```javascript
const capture = async () => {
  try {
    // ... lógica actual de captura ...
    
    // Intentar guardar
    await saveRecord(); // Firestore
  } catch (error) {
    if (!navigator.onLine) {
      // Sin internet: guardar offline
      await saveOfflineRecord(
        watermarkedImage, 
        capturedData.metadata, 
        mode
      );
      
      alert('Sin conexión. Registro guardado localmente y se sincronizará cuando haya internet.');
      setStep('success');
      // No hacer logout inmediato, permitir más acciones
    } else {
      throw error; // Error real, relanzar
    }
  }
};
```

**Sincronización automática (Service Worker):**
```javascript
// sw.js
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-attendance') {
    event.waitUntil(syncPendingRecords());
  }
});

async function syncPendingRecords() {
  const records = await getPendingRecords();
  
  for (const record of records) {
    try {
      // 1. Obtener dirección desde coordenadas
      const address = await fetchLocationName(
        record.metadata.coords.lat, 
        record.metadata.coords.lng
      );
      
      // 2. Subir foto a Firebase Storage
      const photoUrl = await uploadPhoto(record.imageBlob, ...);
      
      // 3. Guardar en Firestore con dirección completa
      await addDoc(collection(db, 'attendance'), {
        ...record.metadata,
        localidad: address,
        fotoUrl: photoUrl,
        syncedAt: serverTimestamp()
      });
      
      // 4. Eliminar de IndexedDB
      await deletePendingRecord(record.id);
      
    } catch (e) {
      console.error('Sync failed for record:', record.id, e);
      // Mantener como pending para reintentar después
    }
  }
}
```

**Registrar sincronización en el frontend:**
```javascript
// Al iniciar la app o cuando hay conexión
if ('serviceWorker' in navigator && 'SyncManager' in window) {
  const registration = await navigator.serviceWorker.ready;
  await registration.sync.register('sync-attendance');
}

// O escuchar eventos online/offline
window.addEventListener('online', () => {
  syncPendingRecords(); // Sincronizar manualmente
});
```

#### 4.5.5 UX para el Usuario

- **Visual:** Icono 🟡 amarillo "pendiente" en el Dashboard cuando hay registros sin sincronizar
- **Notificación:** Alertar cuando se completa la sincronización
- **Error:** Si falla la sincronización, mostrar botón "Reintentar"
- **Transparencia:** Mostrar contador "X registros pendientes de sincronizar"

#### 4.5.6 Consideraciones Técnicas

| Aspecto | Detalle |
|---------|---------|
| **Tamaño de imagen** | Blob es más eficiente que base64 (~30% menos) |
| **Persistencia** | IndexedDB persiste al cerrar el navegador |
| **Límite** | Typically 50-80% del espacio disponible en disco |
| **Conflictos** | Si el usuario ya marcó asistencia en línea, manejar duplicado |
| **Hora offline** | Usar `new Date()` del dispositivo (el usuario podría manipularla) |

#### 4.5.7 Tareas para Implementar

1. Instalar dependencia `idb`
2. Crear `src/services/offlineStorage.js`
3. Modificar `Dashboard.jsx` capture() para detectar offline
4. Crear función de sincronización
5. Agregar UI indicator de estado pending
6. Configurar Service Worker sync event
7. Probar con modo offline de Chrome DevTools

### 4.6 Mejor UX/UI
- Modo oscuro
- Animaciones más fluidas
- Loading states más claros
- Feedback visual para todas las acciones

---

## 5. Mantenibilidad

### 5.1 Documentación
- El README.md es genérico de Vite, no documenta el proyecto
- Crear documentación técnica:
  - Arquitectura del sistema
  - Estructura de Firestore
  - Variables de entorno requeridas
  - Guías de despliegue

### 5.2 Testing
- No hay tests implementados
- Agregar Vitest + React Testing Library
- Prioritario: pruebas de lógica de cálculo de horas

### 5.3 CI/CD
- Configurar GitHub Actions para:
  - Linting (ESLint)
  - Build
  - Deploy automático a Firebase Hosting

### 5.4 Logs y Monitoring
- Agregar sistema de logs estructurados
- Integrar Firebase Crashlytics
- Monitorear rendimiento

---

## 6. multitenancy (Multi-empresa)

### 6.1 Mejoras Estructurales
- El proyecto ya soporta multi-tenant con `projects.json`
- **Sugerencia**: Mover configuración de tenant a Firestore
- Agregar panel de administración de empresas

### 6.2 Personalización por Empresa
- Colores y logo configurables
- Campos de empleado personalizados
- Reglas de negocio por empresa

---

## 7. Infraestructura

### 7.1 Reglas de Firestore
- Revisar y documentar reglas de seguridad
- Agregar validaciones más estrictas

### 7.2 Backup
- Implementar estrategia de backup automática
- Exportar datos periódicamente

---

## Prioridades Recomendadas

| Prioridad | Item | Esfuerzo |
|-----------|------|----------|
| Alta | Extraer componentes de Dashboard | Medio |
| Alta | Modo Offline (captura sin internet) | Medio |
| Alta | Optimizar consultas Firestore | Bajo |
| Alta | Agregar tests | Alto |
| Media | Migrar a TypeScript | Alto |
| Media | Documentación técnica | Medio |
| Media | Sistema de roles | Medio |
| Baja | Dashboard analítico | Alto |
| Baja | Modo oscuro | Bajo |

---

*Documento generado para el proyecto "Control de Entrada" - Versión actual: 1.6.30*
