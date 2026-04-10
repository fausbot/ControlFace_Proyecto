import sqlite3
import os

# Ruta a la base de datos
DB_PATH = r"C:\Users\fausb\Downloads\Control de entrada\deploy-manager\deploy_manager.db"

def fix():
    if not os.path.exists(DB_PATH):
        print(f"Error: No se encontro la base de datos en {DB_PATH}")
        return

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    # Datos del proyecto Multi Servicios
    name = "Multi Servicios"
    new_firebase_id = "multi-servicios-6e45b"
    env_path = r"C:\Users\fausb\Downloads\Control de entrada\Clientes\Multi Servicios\.env"
    project_root = r"C:\Users\fausb\Downloads\Control de entrada"

    # Verificar si ya existe
    cur.execute("SELECT id FROM projects WHERE name = ?", (name,))
    row = cur.fetchone()

    if row:
        print(f"Actualizando proyecto '{name}' (ID: {row[0]})...")
        cur.execute("""
            UPDATE projects 
            SET firebase_id = ?, env_path = ?, project_root = ?, last_status = 'PENDING'
            WHERE id = ?
        """, (new_firebase_id, env_path, project_root, row[0]))
    else:
        print(f"Insertando nuevo proyecto '{name}'...")
        cur.execute("""
            INSERT INTO projects (name, firebase_id, env_path, project_root, deploy_hosting, deploy_functions)
            VALUES (?, ?, ?, ?, 1, 1)
        """, (name, new_firebase_id, env_path, project_root))

    conn.commit()
    conn.close()
    print("✅ Base de datos actualizada con éxito.")

if __name__ == "__main__":
    fix()
