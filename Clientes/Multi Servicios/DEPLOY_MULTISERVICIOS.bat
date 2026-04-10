@echo off
echo =========================================
echo  DEPLOY: Multi Servicios Integrales
echo  Proyecto: multi-servicios-6e45b
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
echo [1/5] Configurando variables de entorno (.env)...
copy /Y "%~dp0.env" "C:\Users\fausb\Downloads\Control de entrada\.env"

REM 4. Copiar el logo del cliente
echo [2/5] Copiando logo del cliente...
copy /Y "%~dp0Logomultiservicios.jpeg" "C:\Users\fausb\Downloads\Control de entrada\public\Logomultiservicios.jpeg"

REM 5. Realizar el build
echo [3/5] Construyendo la aplicacion (npm run build)...
call npm run build

REM 6. Realizar el Deploy de Hosting
echo [4/5] Desplegando Hosting a Firebase (multi-servicios-6e45b)...
call firebase deploy --only hosting --project multi-servicios-6e45b

REM 7. Desplegar Cloud Functions
echo [5/5] Desplegando Cloud Functions (multi-servicios-6e45b)...
call firebase deploy --only functions --project multi-servicios-6e45b

echo.
echo =========================================
echo  Deploy de Multi Servicios COMPLETADO
echo =========================================
echo NOTA: Asegurate de que fausbotkindle@gmail.com tiene rol Editor en el proyecto.
pause
