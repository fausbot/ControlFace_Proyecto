@echo off
echo =========================================
echo  DEPLOY: Restaurante Pepito
echo  Proyecto: attendance-pwa-dev
echo =========================================
echo.

REM Ir a la carpeta raiz del proyecto
cd /d "C:\Users\fausb\Downloads\Control de entrada"

REM Copiar el .env del cliente
echo [1/4] Copiando configuracion del cliente...
copy /Y "Clientes\restaurante pepito\.env" ".env"

REM Copiar logo del cliente a la carpeta public
echo [2/4] Copiando logo del cliente...
copy /Y "Clientes\restaurante pepito\logo.jpg" "public\logo.jpg"

REM Build
echo [3/4] Construyendo la aplicacion...
call npm run build

REM Deploy al proyecto del cliente
echo [4/4] Desplegando a Firebase (attendance-pwa-dev)...
call firebase deploy --only hosting --project attendance-pwa-dev

echo.
echo =========================================
echo  Deploy de Restaurante Pepito COMPLETADO
echo =========================================
pause
