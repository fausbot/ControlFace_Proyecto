"""
db.py — SQLite database layer for Deploy Manager
"""
import sqlite3
import os
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(__file__), "deploy_manager.db")

# Setting Keys
APP_VERSION_KEY = "app_version"
LAST_GLOBAL_DEPLOY_KEY = "last_global_deploy"


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Create tables if they don't exist."""
    with get_connection() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS projects (
                id               INTEGER PRIMARY KEY AUTOINCREMENT,
                name             TEXT    NOT NULL,
                firebase_id      TEXT    NOT NULL,
                env_path         TEXT    NOT NULL,
                project_root     TEXT    NOT NULL,
                deploy_hosting   INTEGER NOT NULL DEFAULT 1,
                deploy_functions INTEGER NOT NULL DEFAULT 1,
                storage_bucket   TEXT    DEFAULT '',
                apply_cors       INTEGER NOT NULL DEFAULT 1,
                last_deploy      TEXT,
                last_status      TEXT    DEFAULT 'PENDING',
                notes            TEXT    DEFAULT ''
            )
        """)
        # Migrate: add new columns if upgrading from older DB
        for col, definition in [
            ("storage_bucket", "TEXT DEFAULT ''"),
            ("apply_cors",     "INTEGER NOT NULL DEFAULT 1"),
        ]:
            try:
                conn.execute(f"ALTER TABLE projects ADD COLUMN {col} {definition}")
            except Exception:
                pass  # column already exists
        conn.execute("""
            CREATE TABLE IF NOT EXISTS settings (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
        """)
        # Seed: version inicial si no existe
        conn.execute("""
            INSERT OR IGNORE INTO settings (key, value) VALUES ('app_version', '1.6.20')
        """)
        conn.commit()


# ── Settings ──────────────────────────────────────────────────────────────────

def get_setting(key: str, default: str = "") -> str:
    """Returns the value for the given settings key."""
    with get_connection() as conn:
        row = conn.execute("SELECT value FROM settings WHERE key=?", (key,)).fetchone()
    return row["value"] if row else default


def set_setting(key: str, value: str):
    """Upserts a setting value."""
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (key, value)
        )
        conn.commit()


# ── CRUD ─────────────────────────────────────────────────────────────────────

def get_all_projects():
    with get_connection() as conn:
        rows = conn.execute("SELECT * FROM projects ORDER BY name COLLATE NOCASE").fetchall()
    return [dict(r) for r in rows]


def get_project(project_id: int):
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM projects WHERE id=?", (project_id,)).fetchone()
    return dict(row) if row else None


def insert_project(data: dict) -> int:
    sql = """
        INSERT INTO projects
            (name, firebase_id, env_path, project_root,
             deploy_hosting, deploy_functions, storage_bucket, apply_cors, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """
    with get_connection() as conn:
        cur = conn.execute(sql, (
            data["name"],
            data["firebase_id"],
            data["env_path"],
            data["project_root"],
            int(data.get("deploy_hosting", True)),
            int(data.get("deploy_functions", True)),
            data.get("storage_bucket", ""),
            int(data.get("apply_cors", True)),
            data.get("notes", ""),
        ))
        conn.commit()
        return cur.lastrowid


def update_project(project_id: int, data: dict):
    sql = """
        UPDATE projects
        SET name=?, firebase_id=?, env_path=?, project_root=?,
            deploy_hosting=?, deploy_functions=?, storage_bucket=?, apply_cors=?, notes=?
        WHERE id=?
    """
    with get_connection() as conn:
        conn.execute(sql, (
            data["name"],
            data["firebase_id"],
            data["env_path"],
            data["project_root"],
            int(data.get("deploy_hosting", True)),
            int(data.get("deploy_functions", True)),
            data.get("storage_bucket", ""),
            int(data.get("apply_cors", True)),
            data.get("notes", ""),
            project_id,
        ))
        conn.commit()


def delete_project(project_id: int):
    with get_connection() as conn:
        conn.execute("DELETE FROM projects WHERE id=?", (project_id,))
        conn.commit()


def update_deploy_status(project_id: int, status: str):
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with get_connection() as conn:
        conn.execute(
            "UPDATE projects SET last_deploy=?, last_status=? WHERE id=?",
            (now, status, project_id)
        )
        conn.commit()
