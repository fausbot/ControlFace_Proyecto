import subprocess
import os

def run_git():
    try:
        print("--- Iniciando Commit Forzado ---")
        os.chdir(r"C:\Users\fausb\Downloads\Control de entrada")
        
        # 1. Add
        subprocess.run("git add .", shell=True, check=True)
        print("✅ Archivos preparados (git add)")
        
        # 2. Commit
        msg = "Implementación del Sistema de Gestión de Licencias v1.7.68 - Final"
        subprocess.run(f'git commit -m "{msg}"', shell=True, check=True)
        print(f"✅ Commit realizado: {msg}")
        
    except Exception as e:
        print(f"❌ Error al realizar el commit: {e}")

if __name__ == "__main__":
    run_git()
