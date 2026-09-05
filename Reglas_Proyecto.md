# Reglas del Proyecto

1. **Idioma Principal:** Español.
   - Todo el código nuevo (comentarios, variables descriptivas si es posible), interfaces de usuario (UI), y documentación deben estar en español.
   - Las respuestas del asistente y los planes también deben ser en español.
   - **TODOS LOS COMMITS DE GIT DEBEN SER REDACTADOS EN ESPAÑOL SIEMPRE.**

2. **Convenciones de Código:**
   - Mantener la estructura de React + Vite + Firebase.
   - Usar Tailwind CSS para estilos.

3. **Objetivo Actual:**
   - Sistema de Control de Entrada.
   - Permitir la creación de usuarios adicionales.

4. **Despliegues (Deploy):**
   - El usuario realiza siempre los despliegues (deploy) manualmente. No ejecutar comandos de despliegue a menos que se indique explícitamente.

5. **Versionamiento y Ramas de Git:**
   - **Rama Estable de Trabajo:** Se trabaja sobre la rama menor estable (actualmente **`1.8`**).
   - **Contador de Versión:** El usuario incrementa libremente la sub-versión por cada despliegue (ej. `1.8.74`, `1.8.75`...) mediante su Deploy Manager para refrescar la caché del Service Worker.
   - El asistente no crea ramas por cada parche; todos los commits se suben a la rama estable activa (`1.8`).
   - El salto a una nueva rama (ej. **`1.9`**) solo se realizará cuando haya un cambio mayor que lo justifique y bajo decisión explícita del usuario.


