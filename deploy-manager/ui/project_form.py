"""
ui/project_form.py — Modal dialog to add or edit a project.
"""
import customtkinter as ctk
import tkinter as tk
from tkinter import filedialog
from ui import theme as T


class ProjectFormDialog(ctk.CTkToplevel):
    """
    Modal window for creating or editing a project.
    Returns the form data via self.result (dict or None).
    """

    def __init__(self, parent, project: dict = None, title: str = "Nuevo Proyecto"):
        super().__init__(parent)
        self.result = None
        self._project = project

        # ── Window setup ─────────────────────────────────────────────────────
        self.title(title)
        self.geometry("580x620")
        self.resizable(False, False)
        self.configure(fg_color=T.BG_SURFACE)
        self.grab_set()
        self.focus_force()

        # Center on parent
        self.update_idletasks()
        px = parent.winfo_rootx() + (parent.winfo_width() - 580) // 2
        py = parent.winfo_rooty() + (parent.winfo_height() - 620) // 2
        self.geometry(f"+{px}+{py}")

        self._build_ui()
        if project:
            self._populate(project)

    # ── UI Construction ───────────────────────────────────────────────────────

    def _build_ui(self):
        # Header
        header = ctk.CTkFrame(self, fg_color=T.BG_CARD, corner_radius=0, height=64)
        header.pack(fill="x")
        header.pack_propagate(False)

        ctk.CTkLabel(
            header, text="🚀  Configuración de Proyecto",
            font=T.FONT_H2, text_color=T.TEXT_PRI
        ).pack(side="left", padx=T.PAD, pady=T.PAD)

        # scroll area
        scroll = ctk.CTkScrollableFrame(self, fg_color=T.BG_SURFACE, corner_radius=0)
        scroll.pack(fill="both", expand=True, padx=0, pady=0)

        def _lbl(parent, text):
            ctk.CTkLabel(parent, text=text, font=T.FONT_SMALL,
                         text_color=T.TEXT_SEC).pack(anchor="w", padx=T.PAD, pady=(10, 2))

        def _entry(parent, placeholder="", width=None):
            e = ctk.CTkEntry(
                parent,
                placeholder_text=placeholder,
                font=T.FONT_BODY,
                fg_color=T.BG_INPUT,
                border_color=T.BORDER,
                text_color=T.TEXT_PRI,
                placeholder_text_color=T.MUTED,
                corner_radius=8,
                height=38,
            )
            e.pack(fill="x", padx=T.PAD, pady=(0, 2))
            return e

        # ── Fields ───────────────────────────────────────────────────────────
        _lbl(scroll, "NOMBRE DEL CLIENTE / PROYECTO *")
        self.e_name = _entry(scroll, "Ej: Vertiaguas")

        _lbl(scroll, "ID DEL PROYECTO FIREBASE *")
        self.e_firebase = _entry(scroll, "Ej: control-de-entrada-3d85b")

        _lbl(scroll, "RAÍZ DEL PROYECTO (donde está package.json) *")
        row1 = ctk.CTkFrame(scroll, fg_color="transparent")
        row1.pack(fill="x", padx=T.PAD, pady=(0, 2))
        self.e_root = ctk.CTkEntry(
            row1, placeholder_text="C:\\ruta\\al\\proyecto",
            font=T.FONT_BODY, fg_color=T.BG_INPUT, border_color=T.BORDER,
            text_color=T.TEXT_PRI, placeholder_text_color=T.MUTED,
            corner_radius=8, height=38,
        )
        self.e_root.pack(side="left", fill="x", expand=True, padx=(0, 8))
        ctk.CTkButton(row1, text="📁", width=40, height=38,
                      fg_color=T.BG_CARD, hover_color=T.ACCENT,
                      command=self._browse_root).pack(side="left")

        _lbl(scroll, "RUTA AL ARCHIVO .env DEL CLIENTE *")
        row2 = ctk.CTkFrame(scroll, fg_color="transparent")
        row2.pack(fill="x", padx=T.PAD, pady=(0, 2))
        self.e_env = ctk.CTkEntry(
            row2, placeholder_text="C:\\ruta\\al\\cliente\\.env",
            font=T.FONT_BODY, fg_color=T.BG_INPUT, border_color=T.BORDER,
            text_color=T.TEXT_PRI, placeholder_text_color=T.MUTED,
            corner_radius=8, height=38,
        )
        self.e_env.pack(side="left", fill="x", expand=True, padx=(0, 8))
        ctk.CTkButton(row2, text="📄", width=40, height=38,
                      fg_color=T.BG_CARD, hover_color=T.ACCENT,
                      command=self._browse_env).pack(side="left")

        # Checkboxes
        _lbl(scroll, "COMPONENTES A DESPLEGAR")
        chk_frame = ctk.CTkFrame(scroll, fg_color="transparent")
        chk_frame.pack(fill="x", padx=T.PAD, pady=(0, 4))

        self.var_hosting = tk.BooleanVar(value=True)
        self.var_functions = tk.BooleanVar(value=True)

        ctk.CTkCheckBox(chk_frame, text="Hosting", variable=self.var_hosting,
                        font=T.FONT_BODY, text_color=T.TEXT_PRI,
                        fg_color=T.ACCENT, hover_color=T.ACCENT_HOV,
                        border_color=T.BORDER).pack(side="left", padx=(0, 24))
        ctk.CTkCheckBox(chk_frame, text="Cloud Functions", variable=self.var_functions,
                        font=T.FONT_BODY, text_color=T.TEXT_PRI,
                        fg_color=T.ACCENT, hover_color=T.ACCENT_HOV,
                        border_color=T.BORDER).pack(side="left")

        # ── Storage / CORS section ─────────────────────────────────────────────
        sep = ctk.CTkFrame(scroll, fg_color=T.BORDER, height=1)
        sep.pack(fill="x", padx=T.PAD, pady=(12, 4))

        _lbl(scroll, "BUCKET DE FIREBASE STORAGE (para CORS automático)")
        self.e_bucket = _entry(scroll, "Ej: mi-proyecto-abc12.firebasestorage.app")

        cors_frame = ctk.CTkFrame(scroll, fg_color="transparent")
        cors_frame.pack(fill="x", padx=T.PAD, pady=(4, 4))
        self.var_cors = tk.BooleanVar(value=True)
        ctk.CTkCheckBox(
            cors_frame,
            text="Aplicar reglas CORS en cada deploy  (requiere Google Cloud SDK instalado)",
            variable=self.var_cors,
            font=T.FONT_BODY, text_color=T.TEXT_PRI,
            fg_color=T.ACCENT, hover_color=T.ACCENT_HOV,
            border_color=T.BORDER,
        ).pack(side="left")

        # Notes
        _lbl(scroll, "NOTAS (opcional)")
        self.e_notes = ctk.CTkTextbox(
            scroll, height=60, font=T.FONT_BODY,
            fg_color=T.BG_INPUT, border_color=T.BORDER, text_color=T.TEXT_PRI,
            corner_radius=8,
        )
        self.e_notes.pack(fill="x", padx=T.PAD, pady=(0, T.PAD))

        # Error label
        self.lbl_error = ctk.CTkLabel(scroll, text="", font=T.FONT_SMALL,
                                      text_color=T.ERROR)
        self.lbl_error.pack(anchor="w", padx=T.PAD)

        # ── Footer buttons ────────────────────────────────────────────────────
        footer = ctk.CTkFrame(self, fg_color=T.BG_CARD, corner_radius=0, height=64)
        footer.pack(fill="x", side="bottom")
        footer.pack_propagate(False)

        ctk.CTkButton(footer, text="Cancelar", width=120, height=38,
                      fg_color=T.BG_INPUT, hover_color=T.BORDER,
                      text_color=T.TEXT_SEC, corner_radius=8,
                      command=self.destroy).pack(side="right", padx=(8, T.PAD), pady=13)

        ctk.CTkButton(footer, text="💾  Guardar", width=140, height=38,
                      fg_color=T.ACCENT, hover_color=T.ACCENT_HOV,
                      text_color="white", corner_radius=8,
                      command=self._save).pack(side="right", padx=8, pady=13)

    # ── Helpers ──────────────────────────────────────────────────────────────

    def _browse_root(self):
        path = filedialog.askdirectory(title="Selecciona la raíz del proyecto")
        if path:
            self.e_root.delete(0, "end")
            self.e_root.insert(0, path.replace("/", "\\"))

    def _browse_env(self):
        path = filedialog.askopenfilename(
            title="Selecciona el archivo .env",
            filetypes=[(".env files", ".env"), ("All files", "*.*")]
        )
        if path:
            self.e_env.delete(0, "end")
            self.e_env.insert(0, path.replace("/", "\\"))

    def _populate(self, p: dict):
        self.e_name.insert(0, p.get("name", ""))
        self.e_firebase.insert(0, p.get("firebase_id", ""))
        self.e_root.insert(0, p.get("project_root", ""))
        self.e_env.insert(0, p.get("env_path", ""))
        self.e_bucket.insert(0, p.get("storage_bucket", ""))
        self.var_hosting.set(bool(p.get("deploy_hosting", True)))
        self.var_functions.set(bool(p.get("deploy_functions", True)))
        self.var_cors.set(bool(p.get("apply_cors", True)))
        notes = p.get("notes", "")
        if notes:
            self.e_notes.insert("1.0", notes)

    def _save(self):
        name    = self.e_name.get().strip()
        fb_id   = self.e_firebase.get().strip()
        root    = self.e_root.get().strip()
        env     = self.e_env.get().strip()

        if not all([name, fb_id, root, env]):
            self.lbl_error.configure(text="⚠  Completa todos los campos obligatorios (*)")
            return

        self.result = {
            "name": name,
            "firebase_id": fb_id,
            "project_root": root,
            "env_path": env,
            "deploy_hosting": self.var_hosting.get(),
            "deploy_functions": self.var_functions.get(),
            "storage_bucket": self.e_bucket.get().strip(),
            "apply_cors": self.var_cors.get(),
            "notes": self.e_notes.get("1.0", "end").strip(),
        }
        self.destroy()
