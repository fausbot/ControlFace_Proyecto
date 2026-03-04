@echo off
echo =========================================
echo  DEPLOY: ControlFace Cliente
echo  Proyecto: proyecto-controlface-cliente
echo =========================================
echo.

REM Ir a la carpeta raiz del proyecto
cd /d "C:\Users\fausb\Downloads\Control de entrada"

REM Copiar el .env del cliente
echo [1/5] Copiando configuracion del cliente...
copy /Y "Clientes\ControlFace\.env" ".env"

REM Copiar logo del cliente a la carpeta public
echo [2/5] Copiando logo del cliente...
copy /Y "Clientes\ControlFace\LogoCoontrolFace.jpeg" "public\logo.jpg"

REM Build del frontend
echo [3/5] Construyendo la aplicacion...
call npm run build

REM Deploy del frontend (hosting)
echo [4/5] Desplegando Hosting a Firebase (proyecto-controlface-cliente)...
call firebase deploy --only hosting --project proyecto-controlface-cliente

REM Deploy del backend (Cloud Functions - contiene la logica de CF1234)
echo [5/5] Desplegando Cloud Functions (proyecto-controlface-cliente)...
call firebase deploy --only functions --project proyecto-controlface-cliente

echo.
echo =========================================
echo  Deploy de ControlFace COMPLETADO
echo =========================================
echo NOTA: Asegurate de que ap4181237@gmail.com te tiene como Editor en este proyecto.
pause
