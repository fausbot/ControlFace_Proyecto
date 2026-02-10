---
description: Build and deploy the application to Firebase Hosting
---

Este workflow automatiza la construcción y el despliegue del proyecto.

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
