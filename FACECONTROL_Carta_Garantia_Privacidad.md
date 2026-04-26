# DECLARACIÓN DE GARANTÍA TÉCNICA Y TRANSPARENCIA DE DATOS
## FaceControl — Software de Control de Asistencia Biométrico

**Versión:** 1.0 | **Fecha:** 14 de abril de 2026
**Desarrolladores:** Jorge Botero Calderón (CC 79.732.648) y Faustino Botero Arbeláez (CC 79.591.167)

---

## A QUIÉN VA DIRIGIDA ESTA CARTA

Esta declaración está dirigida a:
- Las **empresas clientes** que han adquirido una licencia de uso del sistema FaceControl
- Los **empleados** de dichas empresas que utilizan la aplicación para registrar su asistencia

---

## 1. ¿QUÉ ES FACECONTROL?

**FaceControl** es un producto de software de control de asistencia biométrico desarrollado y mantenido por **Jorge Botero Calderón** y **Faustino Botero Arbeláez**, personas naturales con domicilio en Bogotá D.C., Colombia.

FaceControl **no es** una empresa de manejo de datos ni de recursos humanos. Es un **proveedor de tecnología** que licencia su software a empresas para que gestionen, bajo su propia responsabilidad, el control de asistencia de sus empleados.

---

## 2. ARQUITECTURA DE DATOS — PUNTO CLAVE

> **Cada empresa cliente tiene su PROPIA base de datos, completamente separada e independiente.**

Así funciona el sistema:

```
┌─────────────────────────────────────────────┐
│              FaceControl (Software)          │
│    Jorge Botero C. + Faustino Botero A.     │
└─────────────────────┬───────────────────────┘
                      │ Licencia de uso
          ┌───────────┼───────────┐
          ▼           ▼           ▼
   [Empresa A]   [Empresa B]  [Empresa C]
   Su Firebase   Su Firebase  Su Firebase
   Sus datos     Sus datos    Sus datos
   (Solo ella    (Solo ella   (Solo ella
   los ve)       los ve)      los ve)
```

Cada empresa cliente cuenta con su **propio proyecto de Firebase** (base de datos en la nube de Google), creado con sus propias credenciales, en su propia cuenta de Google. Los datos de los empleados de la Empresa A **nunca pueden ser vistos** por la Empresa B, ni por FaceControl.

---

## 3. ¿QUÉ ACCESO TIENE FACECONTROL A LOS DATOS DEL CLIENTE?

**Respuesta directa: ninguno en la práctica.**

FaceControl puede tener un rol técnico de "Editor" en el proyecto Firebase de cada cliente, **exclusivamente para brindar soporte técnico cuando el cliente lo requiera**. Esto significa:

| Tipo de acceso | FaceControl |
|----------------|-------------|
| Leer datos de empleados | ❌ No (salvo soporte técnico expresamente solicitado) |
| Modificar datos de empleados | ❌ No |
| Eliminar datos de empleados | ❌ No |
| Ser propietario del Firebase | ❌ No (el propietario siempre es la empresa cliente) |
| Acceder a fotos de asistencia | ❌ No (salvo soporte técnico expresamente solicitado) |
| Compartir datos con terceros | ❌ Técnicamente imposible — no es propietario |

El **propietario** del proyecto Firebase siempre es la empresa cliente. FaceControl, como máximo, tiene el rol de "Editor" que puede ser revocado por el cliente en cualquier momento desde su consola de Google/Firebase.

---

## 4. ¿QUÉ HACE LA APLICACIÓN EN EL TELÉFONO DEL EMPLEADO?

FaceControl es una **Aplicación Web Progresiva (PWA)** que corre dentro del navegador del dispositivo. El navegador actúa como guardián de seguridad: la app **no puede acceder** a nada que el navegador no le autorice explícitamente.

### Permisos que solicita:

| Permiso | Activación | Dato recopilado | Almacenado en |
|---------|-----------|-----------------|---------------|
| 📷 Cámara | Solo al registrar | Foto con marca de agua | Firebase del **cliente** |
| 📍 GPS | Solo al registrar | Coordenadas del momento | Firebase del **cliente** |

### Lo que NUNCA hace:

- ❌ Acceder a contactos, SMS, WhatsApp, datos bancarios
- ❌ Rastrear la ubicación en segundo plano
- ❌ Grabar video o audio
- ❌ Acceder a archivos o galería del teléfono
- ❌ Enviar datos a servidores de FaceControl

**Todos los datos van directamente al Firebase de la empresa empleadora. FaceControl no los ve, no los toca, no los almacena.**

---

## 5. RESPONSABILIDADES CLARAMENTE DEFINIDAS

| Responsabilidad | FaceControl | Empresa Cliente |
|-----------------|-------------|-----------------|
| Desarrollar y mantener el software | ✅ | — |
| Garantizar que la app no accede a datos indebidos | ✅ | — |
| Custodiar los datos de sus empleados | — | ✅ |
| Publicar su Política de Tratamiento de Datos (Ley 1581) | — | ✅ |
| Solicitar consentimiento a sus empleados | — | ✅ |
| Controlar quién accede a su Firebase | — | ✅ (es el propietario) |

---

## 6. GARANTÍA FORMAL DE FACECONTROL

Los desarrolladores de FaceControl declaramos formalmente que:

1. El software **no contiene** ningún mecanismo para extraer, copiar o transmitir datos a servidores propios de FaceControl.
2. Todos los datos capturados en la aplicación se almacenan **exclusivamente en el Firebase configurado por cada empresa cliente**.
3. FaceControl **no comercializa, no cede, no vende** ningún tipo de dato de los empleados de sus clientes.
4. El código de la aplicación puede ser **auditado por un experto externo** a solicitud de cualquier cliente.
5. Cualquier acceso por soporte técnico al Firebase de un cliente requiere **autorización expresa y escrita** del cliente.

---

## 7. IMPLICACIONES PARA EL EMPLEADO

Si usted es un empleado de una empresa que usa FaceControl:

- Sus datos de asistencia están en la base de datos de **su empresa**, no de FaceControl.
- **Su empresa** es quien controla esos datos: es la responsable del tratamiento.
- Para conocer, rectificar o eliminar sus datos, debe dirigirse al área de **Recursos Humanos o Administración de su empresa**.
- FaceControl no tiene forma de responder solicitudes individuales de empleados, porque no tiene acceso a esos datos.

---

## 8. AUDITABILIDAD

Cualquier empresa cliente o autoridad competente puede solicitar una **auditoría técnica** del código fuente de FaceControl para verificar las garantías aquí declaradas. Esta solicitud debe realizarse por escrito y se coordinará con los desarrolladores.

---

Atentamente,

&nbsp;

&nbsp;

**_________________________________**
**Jorge Botero Calderón**
Cédula de Ciudadanía N.° 79.732.648
Co-desarrollador y Co-fundador — **FaceControl**
Bogotá D.C., Colombia

&nbsp;

**_________________________________**
**Faustino Botero Arbeláez**
Cédula de Ciudadanía N.° 79.591.167
Co-desarrollador y Co-fundador — **FaceControl**
Bogotá D.C., Colombia

---

> **Nota:** Este documento es genérico y aplica a todos los clientes de FaceControl.
> Puede entregarse impreso y firmado a cualquier empresa cliente o a sus empleados
> cuando soliciten garantías sobre el manejo de datos.
