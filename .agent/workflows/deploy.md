---
description: Build and deploy the application to Firebase Hosting (USO EXCLUSIVO DEL USUARIO)
---

> **IMPORTANTE**: Este workflow y los comandos de despliegue (`firebase deploy`) son ejecutados **únicamente por el usuario** de forma manual. El asistente no debe ejecutarlos de forma autónoma.

1. Construir la aplicación
// turbo
```bash
npm run build
```

2. Desplegar a Firebase Hosting
// turbo
```bash
firebase deploy --only hosting
```
