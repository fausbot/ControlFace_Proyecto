"""
deploy_engine.py — Generates and executes deploy BAT scripts for each project.
"""
import os
import json
import subprocess
import tempfile
import threading
from typing import Callable
import db


# ── Version helpers ───────────────────────────────────────────────────────────

def bump_version(version: str) -> str:
    """Increments the patch segment of a semver string. '1.6.20' → '1.6.21'."""
    parts = version.strip().split(".")
    if len(parts) == 3 and parts[2].isdigit():
        parts[2] = str(int(parts[2]) + 1)
    elif len(parts) == 2 and parts[1].isdigit():
        parts[1] = str(int(parts[1]) + 1)
    else:
        # fallback: append .1
        return version.strip() + ".1"
    return ".".join(parts)


# CORS configuration that will be applied to every bucket
# CORS configuration that will be applied to every bucket
CORS_RULES = [
    {
        "origin": ["*"],
        "method": ["GET", "PUT", "POST", "HEAD", "DELETE"],
        "responseHeader": [
            "Content-Type",
            "Content-Disposition",
            "Content-Length",
            "Authorization",
            "x-goog-resumable",
            "x-goog-meta-*"
        ],
        "maxAgeSeconds": 3600
    }
]


def _write_cors_temp_file() -> str:
    """Writes CORS rules to a temp JSON file and returns its path.
    Python writes the JSON directly, avoiding BAT/PowerShell quoting issues."""
    fd, path = tempfile.mkstemp(suffix='.json', prefix='cors_dm_')
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        json.dump(CORS_RULES, f)
    return path


def _generate_bat(project: dict, new_version: str = "") -> str:
    """
    Produces a BAT script based on the project's config,
    replicating the original DEPLOY_VERTIAGUAS.bat logic.
    If new_version is provided, injects VITE_APP_VERSION into the root .env.
    """
    name           = project["name"]
    firebase_id    = project["firebase_id"]
    env_path       = project["env_path"]
    project_root   = project["project_root"]
    storage_bucket = (project.get("storage_bucket") or "").strip()
    apply_cors     = bool(project.get("apply_cors", True))

    host_line  = f'call firebase deploy --only hosting --project {firebase_id} --non-interactive' if project["deploy_hosting"] else "REM (hosting deploy skipped)"
    funcs_line = f'call firebase deploy --only functions --project {firebase_id} --non-interactive --force' if project["deploy_functions"] else "REM (functions deploy skipped)"

    # PowerShell snippet that replaces or appends VITE_APP_VERSION in .env
    if new_version:
        env_root = project_root.replace("\\", "\\\\")
        src_env = env_path.replace("\\", "\\\\")
        version_step = f"""
REM 3b. Inyectar version en .env raiz y en el .env del cliente
echo [v] Inyectando VITE_APP_VERSION={new_version} en .env raiz y origen...
powershell -NoProfile -Command "\
  $files = @('{env_root}\\\\.env', '{src_env}'); \
  foreach ($f in $files) {{ \
    $lines = if (Test-Path $f) {{ Get-Content $f }} else {{ @() }}; \
    $found = $false; \
    $lines = $lines | ForEach-Object {{ \
      if ($_ -match '^VITE_APP_VERSION=') {{ \
        $found = $true; 'VITE_APP_VERSION={new_version}' \
      }} else {{ $_ }} \
    }}; \
    if (-not $found) {{ $lines += 'VITE_APP_VERSION={new_version}' }}; \
    $lines | Set-Content $f \
  }}"
"""
    else:
        version_step = ""

    # CORS step — only if bucket is defined and apply_cors is enabled
    if apply_cors and storage_bucket:
        # Normalize: add gs:// prefix if missing
        bucket_uri = storage_bucket if storage_bucket.startswith('gs://') else f'gs://{storage_bucket}'
        # Write JSON from Python (avoids BAT/cmd quoting issues with double quotes)
        cors_file = _write_cors_temp_file()
        cors_step = f"""
REM 5b. Aplicar reglas CORS al bucket de Storage
echo [CORS] Aplicando reglas CORS a {bucket_uri}...
gsutil cors set "{cors_file}" {bucket_uri}
if errorlevel 1 (
    echo [AVISO] No se pudo aplicar CORS. Verifica que Google Cloud SDK este instalado y autenticado.
    echo [AVISO] Ejecuta: gcloud auth login
) else (
    echo [CORS] OK — Reglas CORS aplicadas a {bucket_uri}
    del /f /q "{cors_file}"
)
"""
    else:
        cors_step = "REM (CORS step skipped — no bucket configured or apply_cors disabled)"

    bat = f"""@echo off
echo =========================================
echo  DEPLOY MANAGER — {name}
echo  Proyecto Firebase: {firebase_id}
echo =========================================
echo.

REM 1. Verificar .env
if not exist "{env_path}" (
    echo [ERROR] No se encuentra el archivo .env:
    echo {env_path}
    echo El proceso se detiene para evitar un deploy erroneo.
    exit /b 1
)

REM 2. Ir a la raiz del proyecto
cd /d "{project_root}"

REM 3. Copiar .env a la raiz
echo [1/4] Configurando variables de entorno (.env)...
copy /Y "{env_path}" "{project_root}\\.env"
{version_step}
REM 4. Build
echo [2/4] Construyendo la aplicacion (npm run build)...
call npm run build
if errorlevel 1 (
    echo [ERROR] El build fallo.
    exit /b 1
)

REM 5. Deploy Hosting
echo [3/5] Desplegando Hosting...
{host_line}

REM 6. Deploy Functions
echo [4/5] Desplegando Cloud Functions...
{funcs_line}

REM 7. Aplicar CORS a Storage
echo [5/5] Configurando Storage CORS...
{cors_step}

REM 8. Desplegar Reglas de Firestore
echo [6/6] Desplegando Reglas de Firestore...
call firebase deploy --only firestore --project {firebase_id} --non-interactive
if errorlevel 1 (
    echo [ERROR] Fallo el deploy de Firestore rules.
    exit /b 1
)

REM 9. Desplegar Reglas de Storage
echo [7/7] Desplegando Reglas de Storage...
call firebase deploy --only storage --project {firebase_id} --non-interactive
if errorlevel 1 (
    echo [ERROR] Fallo el deploy de Storage rules.
    exit /b 1
)

echo.
echo =========================================
echo  Deploy de {name} COMPLETADO
echo =========================================
"""
    return bat


def run_deploy(
    project: dict,
    on_line: Callable[[str, str], None],   # (text, tag)  tag = info|success|error
    on_done: Callable[[bool], None],        # success bool
    new_version: str = "",
):
    """
    Runs the deploy in a background thread.
    Calls on_line for each stdout/stderr line.
    Calls on_done when the process finishes.
    If new_version is provided, it is injected into the project's root .env.
    """
    # Patterns that indicate a critical failure even when exit code is 0
    _CRITICAL_ERROR_PATTERNS = [
        "has been suspended",
        "permission denied",
        "http error: 403",
        "403",
        "failed to list functions",
        "accessdeniedexception",
        "error: request to",
        "error: failed to",
    ]

    def _worker():
        bat_content = _generate_bat(project, new_version=new_version)

        # Write temp BAT
        fd, bat_path = tempfile.mkstemp(suffix=".bat", prefix="deploy_")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                f.write(bat_content)

            on_line(f"▶  Iniciando deploy de [{project['name']}]...\n", "info")
            on_line(f"   Script temporal: {bat_path}\n", "muted")

            proc = subprocess.Popen(
                ["cmd.exe", "/C", bat_path],
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                errors="replace",
                creationflags=subprocess.CREATE_NO_WINDOW,
            )

            critical_error_found = False
            critical_error_lines = []

            for line in proc.stdout:
                tag = "info"
                line_lower = line.lower()
                # Detect critical error keywords in output
                if any(pat in line_lower for pat in _CRITICAL_ERROR_PATTERNS):
                    tag = "error"
                    critical_error_found = True
                    critical_error_lines.append(line.strip())
                elif "[error]" in line or "error" in line_lower:
                    tag = "error"
                elif "COMPLETADO" in line or "complete" in line_lower or "success" in line_lower:
                    tag = "success"
                on_line(line, tag)

            proc.wait()

            # A deploy is only successful if exit code is 0 AND no critical errors were detected
            success = proc.returncode == 0 and not critical_error_found
            status = "OK" if success else "ERROR"
            db.update_deploy_status(project["id"], status)

            if success:
                on_line(f"\n✅  Deploy de [{project['name']}] finalizado correctamente.\n", "success")
            else:
                if critical_error_found:
                    on_line(f"\n❌  Deploy de [{project['name']}] terminó con errores críticos detectados en la salida:\n", "error")
                    for err_line in critical_error_lines[:5]:  # Show up to 5 error lines
                        on_line(f"   ⚠ {err_line}\n", "error")
                else:
                    on_line(f"\n❌  Deploy de [{project['name']}] terminó con errores (code {proc.returncode}).\n", "error")

            on_done(success)

        except Exception as exc:
            on_line(f"\n[EXCEPCIÓN] {exc}\n", "error")
            db.update_deploy_status(project["id"], "ERROR")
            on_done(False)
        finally:
            try:
                os.remove(bat_path)
            except Exception:
                pass

    threading.Thread(target=_worker, daemon=True).start()


def run_deploy_queue(
    projects: list,
    on_line: Callable[[str, str], None],
    on_done: Callable[[bool], None],
    on_project_done: Callable[[int, bool], None],   # (project_id, success)
    stop_on_error: bool = False,
    on_version_bumped: Callable[[str], None] = None,  # notifica la nueva versión
    on_project_start: Callable[[str], None] = None,   # (project_name) al iniciar cada uno
):
    """Runs a list of projects sequentially in a background thread.

    Before starting, increments the global app_version in DB by one patch
    and injects it into every project's root .env during build.

    Args:
        stop_on_error: If True, aborts the queue when a project fails.
        on_version_bumped: Called once with the new version string after bump.
    """
    def _queue_worker():
        # ── Bump version once for all projects ───────────────────────────────
        current_version = db.get_setting("app_version", "1.0.0")
        new_version = bump_version(current_version)
        db.set_setting("app_version", new_version)
        on_line(
            f"\n📦 Versión: {current_version} → {new_version}\n",
            "info"
        )
        if on_version_bumped:
            on_version_bumped(new_version)

        all_ok = True
        for i, p in enumerate(projects):
            event = threading.Event()
            result_holder = [True]

            def project_on_done(ok, _p=p, _ev=event, _rh=result_holder):
                _rh[0] = ok
                on_project_done(_p["id"], ok)
                _ev.set()

            if on_project_start:
                on_project_start(p["name"])
            run_deploy(p, on_line, project_on_done, new_version=new_version)
            event.wait()  # wait for this project to finish before starting next

            if not result_holder[0]:
                all_ok = False
                if stop_on_error:
                    remaining = len(projects) - i - 1
                    on_line(
                        f"\n⛔  Deploy detenido tras error en [{p['name']}].\n"
                        f"   ({remaining} proyecto(s) omitidos)\n",
                        "error"
                    )
                    break
                else:
                    on_line(
                        f"\n⚠️  [{p['name']}] falló — continuando con el siguiente...\n",
                        "warning"
                    )

        on_line("\n" + "═" * 50 + "\n", "muted")
        msg = "✅  Todos los deploys completados." if all_ok else "⚠️  Algunos deploys tuvieron errores."
        tag = "success" if all_ok else "error"
        
        if all_ok:
            import datetime
            now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            db.set_setting(db.LAST_GLOBAL_DEPLOY_KEY, now_str)
            
        on_line(msg + "\n", tag)
        on_done(all_ok)

    threading.Thread(target=_queue_worker, daemon=True).start()


def save_log(text: str, log_dir: str = None) -> str:
    """Saves the console text to a timestamped .log file.
    Returns the path of the saved file.
    """
    import datetime
    if log_dir is None:
        log_dir = os.path.join(os.path.dirname(__file__), "logs")
    os.makedirs(log_dir, exist_ok=True)
    ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    path = os.path.join(log_dir, f"deploy_{ts}.log")
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)
    return path
