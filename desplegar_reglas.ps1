
$PROJECT = "multi-servicios-integrales"
$PROJECT_ROOT = "C:\Users\fausb\Downloads\Control de entrada"

Write-Host "==============================================" -ForegroundColor Cyan
Write-Host " Desplegando Reglas a Firebase " -ForegroundColor Cyan
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Yendo a la carpeta del proyecto..." -ForegroundColor Yellow
Set-Location $PROJECT_ROOT

Write-Host "Subiendo reglas de Firestore y Storage..." -ForegroundColor Yellow
firebase deploy --only "firestore,storage" --project $PROJECT

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "=================================================" -ForegroundColor Green
    Write-Host " ¡LISTO! Las reglas se subieron correctamente." -ForegroundColor Green
    Write-Host " Ve a la aplicacion y recarga la pagina." -ForegroundColor Green
    Write-Host "=================================================" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "=================================================" -ForegroundColor Red
    Write-Host " Ocurrio un error al subir las reglas." -ForegroundColor Red
    Write-Host " Revisa el mensaje arriba." -ForegroundColor Red
    Write-Host "=================================================" -ForegroundColor Red
}

Write-Host ""
pause
