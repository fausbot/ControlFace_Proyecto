@echo off
echo =========================================
echo  DEPLOY: El Bourbon Cafe
echo  Proyecto: bourboncafe-3983a
echo =========================================
echo.

REM Ir a la carpeta raiz del proyecto
cd /d "C:\Users\fausb\Downloads\Control de entrada"

REM Copiar el .env del cliente
echo [1/5] Copiando configuracion del cliente...
copy /Y "Clientes\Bourbon\.env" ".env"

REM Copiar logo del cliente a la carpeta public
echo [2/5] Copiando logo del cliente...
copy /Y "Clientes\Bourbon\logobourbon.jpg" "public\logo.jpg"

REM Build del frontend
echo [3/5] Construyendo la aplicacion...
call npm run build

REM Deploy del frontend (hosting)
echo [4/5] Desplegando Hosting a Firebase (bourboncafe-3983a)...
call firebase deploy --only hosting --project bourboncafe-3983a

REM Deploy del backend (Cloud Functions - contiene la logica de CF1234)
echo [5/5] Desplegando Cloud Functions (bourboncafe-3983a)...
call firebase deploy --only functions --project bourboncafe-3983a

echo.
echo =========================================
echo  Deploy de Bourbon Cafe COMPLETADO
echo =========================================
echo NOTA: Asegurate de que elbourboncafe911@gmail.com te tiene como Editor.
pause
