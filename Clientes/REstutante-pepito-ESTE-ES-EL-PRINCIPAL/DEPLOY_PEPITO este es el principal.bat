@echo off
echo =========================================
echo  DEPLOY: Restaurante Pepito (PRINCIPAL)
echo  Proyecto: attendance-pwa-dev
echo =========================================
echo.

REM 1. Verificar si el archivo .env existe en la carpeta de este script
if not exist "%~dp0.env" (
    echo [ERROR] No se encuentra el archivo .env junto a este script.
    echo Carpeta buscada: %~dp0
    echo El proceso se detendra para evitar un deploy erroneo.
    pause
    exit /b 1
)

REM 2. Ir a la carpeta raiz del proyecto
cd /d "C:\Users\fausb\Downloads\Control de entrada"

REM 3. Copiar el .env desde la carpeta del script (donde esta el .bat) a la raiz
echo [1/4] Configurando variables de entorno (.env)...
copy /Y "%~dp0.env" "C:\Users\fausb\Downloads\Control de entrada\.env"

REM 4. Realizar el build
echo [2/4] Construyendo la aplicacion (npm run build)...
call npm run build

REM 5. Realizar el Deploy de Hosting
echo [3/4] Desplegando Hosting a Firebase (attendance-pwa-dev)...
call firebase deploy --only hosting --project attendance-pwa-dev

REM 6. Desplegar Cloud Functions (contiene la logica de CF1234)
echo [4/4] Desplegando Cloud Functions (attendance-pwa-dev)...
call firebase deploy --only functions --project attendance-pwa-dev

echo.
echo =========================================
echo  Deploy de Restaurante Pepito COMPLETADO
echo =========================================
pause
