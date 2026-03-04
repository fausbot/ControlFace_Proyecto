@echo off
echo =========================================
echo  DEPLOY: Restaurante Pepito
echo  Proyecto: attendance-pwa-dev
echo =========================================
echo.

REM Ir a la carpeta raiz del proyecto
cd /d "C:\Users\fausb\Downloads\Control de entrada"

REM Copiar el .env del cliente
echo [1/5] Copiando configuracion del cliente...
copy /Y "Clientes\restaurante pepito\.env" ".env"

REM Copiar logo del cliente a la carpeta public
echo [2/5] Copiando logo del cliente...
copy /Y "Clientes\restaurante pepito\logo.jpg" "public\logo.jpg"

REM Build del frontend
echo [3/5] Construyendo la aplicacion...
call npm run build

REM Deploy del frontend (hosting)
echo [4/5] Desplegando Hosting a Firebase (attendance-pwa-dev)...
call firebase deploy --only hosting --project attendance-pwa-dev

REM Deploy del backend (Cloud Functions - contiene la logica de CF1234)
echo [5/5] Desplegando Cloud Functions (attendance-pwa-dev)...
call firebase deploy --only functions --project attendance-pwa-dev

echo.
echo =========================================
echo  Deploy de Restaurante Pepito COMPLETADO
echo =========================================
pause
