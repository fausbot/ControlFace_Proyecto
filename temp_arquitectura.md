__CONTROLFACE__

Arquitectura Multi\-Tenant, Despliegue y Licenciamiento

Documento Técnico Interno  —  Febrero 2026

# 1\. Conclusión Arquitectónica

El modelo elegido separa completamente el código de la aplicación \(bajo control del proveedor\) de los datos del cliente \(bajo control del cliente\)\. Esto permite actualizar, versionar y desplegar sin depènder de las credenciales del cliente en ningún momento\.

__✅ Principio fundamental__

CLIENTE controla  →  Firebase: datos, auth, storage, contraseñas

TÚ controlas       →  Código fuente, despliegue, licencias, Service Accounts

## Separación de responsabilidades

__Elemento__

__Controla el Cliente__

__Controla el Proveedor__

Datos de empleados y asistencia

✅ Total

❌ No accede

Contraseña admin de la app

✅ Total

❌ No la necesita

Código de la aplicación

❌ No toca

✅ Total

Licencia JWT/AES firmada

❌ No puede generarla

✅ Total

Despliegue de actualizaciones

❌ No interviene

✅ Automático via GitHub

Service Account de deploy

❌ Invisible en panel normal

✅ Total

# 2\. Roles en Firebase por Cliente

Cada proyecto Firebase de cliente tendrá la siguiente estructura de acceso:

__Rol__

__Cuenta__

__Para qué sirve__

__Sobrevive cambio de contraseña cliente__

Owner

Gmail del cliente

Control total de sus datos

—

Editor \(persona\)

Tu cuenta Google personal

Gestión manual, soporte técnico

✅ Sí

Editor \(Service Account\)

Cuenta robot generada en Firebase

Deploys automáticos via GitHub Actions

✅ Sí

__⚠️ Recomendación: usar ambos roles \(Editor persona \+ Service Account\)__

Si el cliente te elimina como persona → el robot sigue desplegando\.

Si hay problema con el robot → puedes entrar manualmente\.

Cubrir en contrato: eliminar accesos de soporte = incumplimiento del servicio\.

# 3\. Flujo de Despliegue Multi\-Cliente \(GitHub Actions\)

Un solo repositorio GitHub contiene el código único de ControlFace\. Un push a la rama main dispara el deploy automático a TODOS los proyectos Firebase registrados\.

## Diagrama de flujo

Tu PC  →  git push  →  GitHub \(rama: main\)

                         ↓

              GitHub Actions \(robot gratuito\)

               ├── npm install && npm run build

               ├── firebase deploy ——project cliente\-garcia\-cf

               ├── firebase deploy ——project cliente\-lopez\-cf

               └── firebase deploy ——project cliente\-abc\-cf

## Archivo \.github/workflows/deploy\.yml \(estructura\)

on: push \(rama main\)

jobs:

  \- npm install \+ build

  \- firebase deploy ——project \[cliente1\]  \# usa FIREBASE\_TOKEN tuyo

  \- firebase deploy ——project \[cliente2\]

  \- firebase deploy ——project \[clienteN\]

__🔑 FIREBASE\_TOKEN__

Es un token tuyo \(no del cliente\) generado con: firebase login:ci

Se guarda en GitHub Secrets → nunca queda expuesto en el código\.

El cliente cambia su Gmail → no afecta en absoluto este token\.

# 4\. Estructura de Proyectos Firebase

Cada cliente nuevo requiere la siguiente configuración en tu repositorio:

## Tabla de tenants \(en tu repositorio, privado\)

const tenants = \{

  "garcia\-cf": \{

    apiKey: "AIzaSy\.\.\.",          // Del Firebase del cliente

    projectId: "garcia\-cf",

    maxEmployees: 30,

    plan: "mensual"

  \},

  "lopez\-cf": \{ \.\.\. \}

\}

__📌 Nota: las apiKeys de Firebase son públicas por diseño__

No son secretos\. La seguridad en Firebase la dan las Firestore Security Rules,

no la ocultación de la apiKey\. Es correcto tenerlas en el código del frontend\.

# 5\. Sistema de Licenciamiento \(AES Actual\)

El sistema actual usa cifrado AES simétrico con CryptoJS\. La clave maestra está embebida en la app y en el generador HTML\. Es funcional para el volumen actual de clientes\.

## Payload del token \(lo que contiene\)

\{ maxEmployees, bufferPercentage, expirationDate,

  providerName, providerPhone, issueDate \}

## Mejora pendiente: agregar tenantId al payload

Sin tenantId, un token generado para un cliente podría usarse en otro\. Agregar este campo resuelve el problema:

\{ tenantId: "garcia\-cf",   // ← AGREGAR

  maxEmployees: 30, \.\.\. \}

## Dónde vive el token en Firebase

Firestore del cliente:

  settings/

    license/

      token: "U2Fsd\.\.\."   ← aquí escribe el backend automático

# 6\. Fases de Implementación

## FASE 1 — Infraestructura base \(Hacer ahora\)

1. Crear proyecto Firebase de prueba en Gmail de cliente demo
2. Configurar GitHub Actions con deploy a 2 proyectos \(tuyo \+ demo\)
3. Validar que un git push despliega a ambos simultáneamente
4. Agregar Service Account al proyecto del cliente demo
5. Agregar tenantId al payload del generador de licencias

## FASE 2 — Panel de gestión de clientes

1. App web privada tuya con tabla de clientes
2. Botón \[Renovar Clave\] por cliente
3. Al hacer clic: genera token AES y copia al portapapeles
4. \(Fase 2\.5\) Botón escribe directo en Firestore del cliente vía Service Account

## FASE 3 — Automatización con MercadoPago

1. Backend \(Cloud Function\) con endpoint webhook
2. MercadoPago envía pago aprobado → webhook recibe external\_reference = clienteId
3. Backend genera token AES con nueva fecha
4. Escribe token en settings/license/token del Firebase del cliente
5. App detecta cambio vía onSnapshot → se desbloquea automáticamente

# 7\. Flujo Completo de Pago Automático

Cliente paga en MercadoPago

        ↓

MercadoPago → POST a tu webhook \(external\_reference: "garcia\-cf"\)

        ↓

Tu Cloud Function verifica pago aprobado

        ↓

Genera token AES: \{ tenantId, maxEmployees, nuevaFecha, \.\.\. \}

        ↓

Escribe en garcia\-cf → settings/license/token

        ↓

App garcia onSnapshot detecta nuevo token

        ↓

✅ Licencia renovada automáticamente

# 8\. Pasos Inmediatos — Crear Cliente de Prueba

__🎯 Objetivo: tener 2 proyectos Firebase desplegando desde 1 solo git push__

Proyecto A: tu cuenta actual \(ya existe\)

Proyecto B: nueva cuenta Gmail de prueba \(crear ahora\)

## Lista de verificación al crear el cliente nuevo

- Crear proyecto Firebase en la cuenta Gmail del cliente
- Activar: Firestore, Authentication \(Email/Password\), Storage, Hosting
- Copiar las credenciales firebaseConfig \(apiKey, projectId, etc\.\)
- Agregarte como Editor con tu cuenta Google personal
- Crear Service Account → descargar JSON → guardar en GitHub Secrets
- Agregar el cliente a la tabla tenants en el repositorio
- Agregar entrada en deploy\.yml para ese projectId
- Hacer git push y verificar que ambos proyectos se actualizan
- Generar primera licencia manualmente con el generador HTML
- Pegar token en settings/license/token del Firestore del cliente

Faustino Software  —  Documento interno confidencial  —  v1\.6\.7

