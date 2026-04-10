
# =============================================================
#  fix_and_deploy.ps1
#  Corrige los errores de IAM y Storage, luego redespliega.
# =============================================================

$PROJECT = "multi-servicios-integrales"
$SERVICE_ACCOUNT = "86665208649-compute@developer.gserviceaccount.com"
$BUCKET = "gs://multi-servicios-integrales.firebasestorage.app"
$PROJECT_ROOT = "C:\Users\fausb\Downloads\Control de entrada"

Write-Host ""
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "  FIX & DEPLOY — $PROJECT" -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host ""

# ── 1. Verificar autenticación gcloud ────────────────────────
Write-Host "[1/5] Verificando autenticacion con gcloud..." -ForegroundColor Yellow
$authCheck = gcloud auth list --filter="status:ACTIVE" --format="value(account)" 2>&1
if (-not $authCheck) {
    Write-Host "[!] No hay cuenta activa. Ejecutando gcloud auth login..." -ForegroundColor Red
    gcloud auth login
} else {
    Write-Host "[OK] Autenticado como: $authCheck" -ForegroundColor Green
}

# ── 2. Asignar rol Storage Object Admin a la cuenta de servicio ──────────────
Write-Host ""
Write-Host "[2/5] Asignando permisos IAM a la cuenta de servicio de Functions..." -ForegroundColor Yellow
gcloud projects add-iam-policy-binding $PROJECT `
    --member="serviceAccount:$SERVICE_ACCOUNT" `
    --role="roles/storage.objectAdmin" `
    --project=$PROJECT

if ($LASTEXITCODE -eq 0) {
    Write-Host "[OK] Permiso roles/storage.objectAdmin asignado." -ForegroundColor Green
} else {
    Write-Host "[ERROR] Fallo al asignar permisos IAM. Verifica que tienes rol Owner/Editor en el proyecto." -ForegroundColor Red
    exit 1
}

# ── 3. Crear bucket de Firebase Storage si no existe ─────────────────────────
Write-Host ""
Write-Host "[3/5] Verificando bucket de Storage..." -ForegroundColor Yellow
$bucketExists = gsutil ls $BUCKET 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "[!] Bucket no encontrado. Creandolo..." -ForegroundColor Yellow
    gsutil mb -p $PROJECT -l us-central1 $BUCKET
    if ($LASTEXITCODE -eq 0) {
        Write-Host "[OK] Bucket creado: $BUCKET" -ForegroundColor Green
    } else {
        Write-Host "[AVISO] No se pudo crear el bucket con gsutil." -ForegroundColor Yellow
        Write-Host "        Crealo manualmente en: https://console.firebase.google.com/project/$PROJECT/storage" -ForegroundColor Yellow
    }
} else {
    Write-Host "[OK] Bucket ya existe: $BUCKET" -ForegroundColor Green
}

# ── 4. Esperar propagación de APIs ───────────────────────────────────────────
Write-Host ""
Write-Host "[4/5] Esperando 30 segundos para propagacion de APIs y permisos..." -ForegroundColor Yellow
Start-Sleep -Seconds 30
Write-Host "[OK] Listo para redeploy." -ForegroundColor Green

# ── 5. Redesplegar Functions y Storage ───────────────────────────────────────
Write-Host ""
Write-Host "[5/5] Redesplegazndo Cloud Functions..." -ForegroundColor Yellow
Set-Location $PROJECT_ROOT

firebase deploy --only functions --project $PROJECT --non-interactive --force
if ($LASTEXITCODE -eq 0) {
    Write-Host "[OK] Cloud Functions desplegadas correctamente." -ForegroundColor Green
} else {
    Write-Host "[ERROR] Fallo el deploy de Functions." -ForegroundColor Red
}

Write-Host ""
Write-Host "Aplicando reglas CORS al bucket de Storage..." -ForegroundColor Yellow
$corsJson = '[{"origin":["*"],"method":["GET"],"responseHeader":["Content-Type","Content-Disposition","Content-Length"],"maxAgeSeconds":3600}]'
$corsFile = "$env:TEMP\cors_fix.json"
$corsJson | Out-File -FilePath $corsFile -Encoding utf8 -NoNewline
gsutil cors set $corsFile $BUCKET
if ($LASTEXITCODE -eq 0) {
    Write-Host "[OK] CORS aplicado." -ForegroundColor Green
} else {
    Write-Host "[AVISO] No se pudo aplicar CORS. El bucket puede no existir aun." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Desplegando reglas de Firestore y Storage..." -ForegroundColor Yellow
firebase deploy --only firestore,storage --project $PROJECT --non-interactive

Write-Host ""
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "  PROCESO COMPLETADO" -ForegroundColor Cyan
Write-Host "  Hosting URL: https://$PROJECT.web.app" -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host ""
