"""
ui/app.py — Main application window for Deploy Manager.
"""
import customtkinter as ctk
import tkinter as tk
from tkinter import messagebox
import threading

import db
import deploy_engine
from ui import theme as T
from ui.project_form import ProjectFormDialog
from ui.license_dialog import LicenseDialog
from ui.console import ConsolePanel


ctk.set_appearance_mode("dark")
ctk.set_default_color_theme("blue")

APP_VERSION_KEY = "app_version"


# ── Helpers ──────────────────────────────────────────────────────────────────

STATUS_ICON  = {"OK": "✅", "ERROR": "❌", "PENDING": "⏳"}
STATUS_COLOR = {"OK": T.SUCCESS, "ERROR": T.ERROR, "PENDING": T.WARNING}


def _status_icon(status: str) -> str:
    return STATUS_ICON.get(status or "PENDING", "⏳")


def _status_color(status: str) -> str:
    return STATUS_COLOR.get(status or "PENDING", T.WARNING)


# ── Project Card (in sidebar) ─────────────────────────────────────────────────

class ProjectCard(ctk.CTkFrame):
    def __init__(self, parent, project: dict, on_select, selected=False):
        super().__init__(parent,
                         fg_color=T.ACCENT if selected else T.BG_CARD,
                         corner_radius=10,
                         cursor="hand2")
        self._project = project
        self._on_select = on_select
        self._selected = selected

        self.bind("<Button-1>", self._click)

        # Checkbox variable
        self.var_check = tk.BooleanVar(value=False)

        inner = ctk.CTkFrame(self, fg_color="transparent")
        inner.pack(fill="x", padx=12, pady=10)

        # Row 1: checkbox + name
        row1 = ctk.CTkFrame(inner, fg_color="transparent")
        row1.pack(fill="x")

        self.chk = ctk.CTkCheckBox(
            row1, text="", variable=self.var_check,
            width=24, height=24,
            fg_color=T.ACCENT, hover_color=T.ACCENT_HOV,
            border_color=T.BORDER,
        )
        self.chk.pack(side="left", padx=(0, 8))

        self.lbl_name = ctk.CTkLabel(
            row1, text=project["name"],
            font=T.FONT_H2, text_color=T.TEXT_PRI, anchor="w"
        )
        self.lbl_name.pack(side="left", fill="x", expand=True)

        status = project.get("last_status") or "PENDING"
        ctk.CTkLabel(
            row1, text=_status_icon(status),
            font=(T.FONT_FAMILY, 16), text_color=_status_color(status)
        ).pack(side="right")

        # Row 2: firebase id
        ctk.CTkLabel(
            inner, text=project["firebase_id"],
            font=T.FONT_SMALL, text_color=T.TEXT_SEC, anchor="w"
        ).pack(fill="x", pady=(2, 0))

        # Last deploy timestamp
        last = project.get("last_deploy") or "—"
        ctk.CTkLabel(
            inner, text=f"Último deploy: {last}",
            font=T.FONT_SMALL, text_color=T.MUTED, anchor="w"
        ).pack(fill="x")

        # Click bindings on children
        for w in [inner, self.lbl_name]:
            w.bind("<Button-1>", self._click)

    def _click(self, _event=None):
        self._on_select(self._project["id"])

    def set_selected(self, val: bool):
        self._selected = val
        self.configure(fg_color=T.ACCENT if val else T.BG_CARD)


# ── Detail Panel ──────────────────────────────────────────────────────────────

class DetailPanel(ctk.CTkFrame):
    """Right-hand panel showing project details and actions."""

    def __init__(self, parent, on_edit, on_delete, **kw):
        super().__init__(parent, fg_color=T.BG_SURFACE, corner_radius=0, **kw)
        self._on_edit = on_edit
        self._on_delete = on_delete
        self._project = None
        self._build()

    def _build(self):
        # ── Header ──────────────────────────────────────────────────────────────────
        self.header = ctk.CTkFrame(self, fg_color=T.BG_CARD, corner_radius=0, height=90)
        self.header.pack(fill="x")
        self.header.pack_propagate(False)

        # Left column: project title + deploying indicator
        left_col = ctk.CTkFrame(self.header, fg_color="transparent")
        left_col.pack(side="left", fill="y", padx=T.PAD, pady=8)

        self.lbl_title = ctk.CTkLabel(
            left_col, text="Selecciona un proyecto →",
            font=T.FONT_TITLE, text_color=T.TEXT_PRI, anchor="w"
        )
        self.lbl_title.pack(anchor="w")

        # Deploy indicator label (hidden when not deploying)
        self.lbl_deploying = ctk.CTkLabel(
            left_col, text="",
            font=(T.FONT_FAMILY, 14, "bold"),
            text_color="#F59E0B",
            anchor="w",
        )
        # NOT packed initially — shown by set_deploying_indicator()

        # action buttons (hidden until project selected)
        self.btn_frame = ctk.CTkFrame(self.header, fg_color="transparent")
        self.btn_frame.pack(side="right", padx=T.PAD, pady=12)

        self.btn_edit = ctk.CTkButton(
            self.btn_frame, text="✏  Editar", width=100, height=36,
            fg_color=T.BG_INPUT, hover_color=T.ACCENT, text_color=T.TEXT_PRI,
            corner_radius=8, command=self._edit
        )
        self.btn_edit.pack(side="left", padx=(0, 8))

        self.btn_del = ctk.CTkButton(
            self.btn_frame, text="🗑  Eliminar", width=110, height=36,
            fg_color=T.BG_INPUT, hover_color=T.ERROR, text_color=T.TEXT_PRI,
            corner_radius=8, command=self._delete
        )
        self.btn_del.pack(side="left")

        self.btn_frame.pack_forget()  # hidden initially

        # ── Info Cards (scrollable) ─────────────────────────────────────────────────
        self.info_frame = ctk.CTkScrollableFrame(
            self,
            fg_color=T.BG_SURFACE,
            corner_radius=0,
            scrollbar_button_color=T.BG_INPUT,
            scrollbar_button_hover_color=T.ACCENT,
        )
        self.info_frame.pack(fill="both", expand=True, padx=T.PAD, pady=(T.PAD, T.PAD))

        self.placeholder = ctk.CTkLabel(
            self, text="🚀  Deploy Manager\n\nAgrega proyectos y despliégalos con un clic.",
            font=(T.FONT_FAMILY, 14), text_color=T.MUTED, justify="center"
        )
        self.placeholder.place(relx=0.5, rely=0.4, anchor="center")

    def show_project(self, project: dict):
        self._project = project
        self.placeholder.place_forget()
        self.btn_frame.pack(side="right", padx=T.PAD, pady=12)

        # Clear old info cards
        for w in self.info_frame.winfo_children():
            w.destroy()

        self.lbl_title.configure(text=project["name"])

        fields = [
            ("Firebase Project ID", project["firebase_id"]),
            ("Raíz del proyecto",   project["project_root"]),
            ("Archivo .env",        project["env_path"]),
            ("Hosting",  "✅ Sí" if project["deploy_hosting"]   else "❌ No"),
            ("Functions","✅ Sí" if project["deploy_functions"]  else "❌ No"),
            ("Último deploy",       project.get("last_deploy") or "—"),
            ("Estado",              project.get("last_status") or "PENDING"),
        ]
        notes = project.get("notes", "").strip()
        if notes:
            fields.append(("Notas", notes))

        for label, value in fields:
            row = ctk.CTkFrame(self.info_frame, fg_color=T.BG_CARD, corner_radius=8)
            row.pack(fill="x", pady=4)

            ctk.CTkLabel(row, text=label, font=T.FONT_SMALL,
                         text_color=T.TEXT_SEC, width=160, anchor="w"
                         ).pack(side="left", padx=12, pady=10)

            color = T.TEXT_PRI
            if label == "Estado":
                color = _status_color(value)
                value = f"{_status_icon(value)}  {value}"

            ctk.CTkLabel(row, text=value, font=T.FONT_BODY,
                         text_color=color, anchor="w", wraplength=420
                         ).pack(side="left", padx=8, pady=10, fill="x", expand=True)

    def set_deploying_indicator(self, project_name: str):
        """Show the 'Desplegando: [name]' badge under the project title."""
        self.lbl_deploying.configure(
            text=f"▶️  Desplegando: {project_name}"
        )
        self.lbl_deploying.pack(anchor="w")  # make it visible

    def clear_deploying_indicator(self):
        """Hide the deploy indicator."""
        self.lbl_deploying.pack_forget()
        self.lbl_deploying.configure(text="")

    def clear(self):
        self._project = None
        self.lbl_title.configure(text="Selecciona un proyecto →")
        self.btn_frame.pack_forget()
        for w in self.info_frame.winfo_children():
            w.destroy()
        self.placeholder.place(relx=0.5, rely=0.4, anchor="center")

    def _edit(self):
        if self._project:
            self._on_edit(self._project["id"])

    def _delete(self):
        if self._project:
            self._on_delete(self._project["id"])


# ── Main Window ──────────────────────────────────────────────────────────────

class DeployManagerApp(ctk.CTk):
    def __init__(self):
        super().__init__()
        db.init_db()

        self.title("Deploy Manager")
        self.geometry(f"{T.WIN_W}x{T.WIN_H}")
        self.minsize(900, 600)
        self.configure(fg_color=T.BG_DEEP)

        # Try to set icon
        try:
            import os
            icon_path = os.path.join(os.path.dirname(__file__), "..", "assets", "icon.ico")
            if os.path.exists(icon_path):
                self.iconbitmap(icon_path)
        except Exception:
            pass

        self._selected_id: int | None = None
        self._cards: dict[int, ProjectCard] = {}
        self._deploying = False
        self.var_stop_on_error = tk.BooleanVar(value=False)

        self._build_ui()
        self._refresh_projects()

    # ── Layout ───────────────────────────────────────────────────────────────

    def _build_ui(self):
        # ── Top toolbar ────────────────────────────────────────────────────
        toolbar = ctk.CTkFrame(self, fg_color=T.BG_CARD,
                               corner_radius=0, height=56)
        toolbar.pack(fill="x", side="top")
        toolbar.pack_propagate(False)

        # Logo / title
        ctk.CTkLabel(toolbar, text="🚀", font=(T.FONT_FAMILY, 24)).pack(
            side="left", padx=(14, 4), pady=10)
        ctk.CTkLabel(toolbar, text="Deploy Manager",
                     font=T.FONT_TITLE, text_color=T.TEXT_PRI).pack(
            side="left", padx=(0, 20), pady=10)

        # Status badge
        self.lbl_status = ctk.CTkLabel(toolbar, text="🟢 Listo",
                                       font=T.FONT_SMALL, text_color=T.SUCCESS)
        self.lbl_status.pack(side="left", padx=8)

        # Current project indicator (hidden until deploy starts)
        self.lbl_current_project = ctk.CTkLabel(
            toolbar, text="",
            font=(T.FONT_FAMILY, 13, "bold"), text_color=T.WARNING
        )
        # NOTE: NOT packed here — removed from toolbar, now in banner below

        # ── Version widget (right side of toolbar) ──────────────────────────
        ver_frame = ctk.CTkFrame(toolbar, fg_color=T.BG_INPUT, corner_radius=8)
        ver_frame.pack(side="left", padx=(24, 0), pady=8)

        ctk.CTkLabel(
            ver_frame, text="🏷 v",
            font=(T.FONT_FAMILY, 18, "bold"), text_color=T.TEXT_SEC
        ).pack(side="left", padx=(10, 2), pady=4)

        self.var_version = tk.StringVar(value=db.get_setting(db.APP_VERSION_KEY, "1.0.0"))
        self.entry_version = ctk.CTkEntry(
            ver_frame,
            textvariable=self.var_version,
            width=90, height=34,
            font=(T.FONT_FAMILY, 22, "bold"),
            text_color=T.ACCENT,
            fg_color="transparent",
            border_width=0,
        )
        self.entry_version.pack(side="left", padx=(0, 4))

        ctk.CTkButton(
            ver_frame, text="💾", width=36, height=34,
            fg_color="transparent", hover_color=T.ACCENT,
            text_color=T.TEXT_SEC, corner_radius=6,
            font=(T.FONT_FAMILY, 16),
            command=self._save_version,
        ).pack(side="left", padx=(0, 6))

        # Last global deploy timestamp
        last_global = db.get_setting(db.LAST_GLOBAL_DEPLOY_KEY, "—")
        self.lbl_last_global = ctk.CTkLabel(
            toolbar, text=f"Último deploy: {last_global}",
            font=T.FONT_SMALL, text_color=T.MUTED
        )
        self.lbl_last_global.pack(side="left", padx=(12, 0), pady=10)

        # Right buttons
        right = ctk.CTkFrame(toolbar, fg_color="transparent")
        right.pack(side="right", padx=T.PAD, pady=8)

        self.btn_deploy_all = ctk.CTkButton(
            right, text="▶  Deploy Seleccionados", width=190, height=38,
            fg_color=T.ACCENT, hover_color=T.ACCENT_HOV,
            text_color="white", corner_radius=8, font=T.FONT_H2,
            command=self._deploy_selected,
        )
        self.btn_deploy_all.pack(side="right", padx=(8, 0))

        ctk.CTkButton(
            right, text="＋  Nuevo Proyecto", width=160, height=38,
            fg_color=T.BG_INPUT, hover_color=T.ACCENT,
            text_color=T.TEXT_PRI, corner_radius=8, font=T.FONT_BODY,
            command=self._new_project,
        ).pack(side="right", padx=(0, 8))

        # Botón de Licencias
        ctk.CTkButton(
            right, text="🔑  Licencias", width=130, height=38,
            fg_color=T.BG_INPUT, hover_color=T.SUCCESS,
            text_color=T.TEXT_PRI, corner_radius=8, font=T.FONT_BODY,
            command=self._open_license_manager,
        ).pack(side="right", padx=(0, 8))

        # Stop-on-error toggle
        toggle_frame = ctk.CTkFrame(right, fg_color="transparent")
        toggle_frame.pack(side="right", padx=(0, 16))
        ctk.CTkSwitch(
            toggle_frame, text="Parar si hay error",
            variable=self.var_stop_on_error,
            font=T.FONT_SMALL, text_color=T.TEXT_SEC,
            fg_color=T.MUTED, progress_color=T.ERROR,
            button_color=T.TEXT_PRI, button_hover_color=T.ERROR,
            width=40, height=20,
        ).pack(side="left")

        # ── Deploy banner (overlay sobre el body durante deploy) ─────────
        # Creado aqui, enganado al root con place() para aparecer sobre el body
        self.deploy_banner = ctk.CTkFrame(
            self, fg_color="#92400E", corner_radius=0, height=56
        )
        self.deploy_banner.pack_propagate(False)
        self.lbl_banner_project = ctk.CTkLabel(
            self.deploy_banner,
            text="",
            font=(T.FONT_FAMILY, 22, "bold"),
            text_color="#FEF3C7",
        )
        self.lbl_banner_project.pack(expand=True)
        # Banner starts hidden; shown via place() during deploy

        # ── Body: sidebar + main ────────────────────────────────
        body = ctk.CTkFrame(self, fg_color=T.BG_DEEP, corner_radius=0)
        body.pack(fill="both", expand=True)

        # Sidebar
        sidebar = ctk.CTkFrame(body, fg_color=T.BG_SURFACE,
                               corner_radius=0, width=T.SIDEBAR_W)
        sidebar.pack(side="left", fill="y")
        sidebar.pack_propagate(False)

        ctk.CTkLabel(sidebar, text="PROYECTOS",
                     font=T.FONT_SMALL, text_color=T.MUTED).pack(
            anchor="w", padx=T.PAD, pady=(T.PAD, 6))

        # Select-all / none
        sel_bar = ctk.CTkFrame(sidebar, fg_color="transparent")
        sel_bar.pack(fill="x", padx=T.PAD, pady=(0, 6))
        ctk.CTkButton(sel_bar, text="Todos", width=60, height=24,
                      fg_color=T.BG_CARD, hover_color=T.ACCENT,
                      text_color=T.TEXT_SEC, font=T.FONT_SMALL, corner_radius=6,
                      command=self._select_all).pack(side="left", padx=(0, 4))
        ctk.CTkButton(sel_bar, text="Ninguno", width=70, height=24,
                      fg_color=T.BG_CARD, hover_color=T.BG_INPUT,
                      text_color=T.TEXT_SEC, font=T.FONT_SMALL, corner_radius=6,
                      command=self._select_none).pack(side="left")

        self.cards_frame = ctk.CTkScrollableFrame(
            sidebar, fg_color=T.BG_SURFACE, corner_radius=0
        )
        self.cards_frame.pack(fill="both", expand=True, padx=8, pady=4)

        # Main area (detail + console) — vertical PanedWindow for draggable split
        main = ctk.CTkFrame(body, fg_color=T.BG_SURFACE, corner_radius=0)
        main.pack(side="left", fill="both", expand=True)

        # PanedWindow acts as the sash/splitter between detail and console
        paned = tk.PanedWindow(
            main,
            orient=tk.VERTICAL,
            bg=T.BORDER,          # sash color
            sashwidth=6,
            sashpad=0,
            sashrelief="flat",
            relief="flat",
            bd=0,
            handlesize=0,
        )
        paned.pack(fill="both", expand=True)

        # Detail panel (top pane)
        self.detail = DetailPanel(
            paned,
            on_edit=self._edit_project,
            on_delete=self._delete_project,
        )
        paned.add(self.detail, stretch="always", minsize=120)

        # Console panel (bottom pane) — starts tall (300px)
        self.console = ConsolePanel(paned)
        paned.add(self.console, stretch="always", minsize=120)

        # Set initial sash position after window is drawn
        def _set_sash():
            h = paned.winfo_height()
            if h > 10:
                paned.sash_place(0, 0, int(h * 0.50))
        paned.after(100, _set_sash)

    # ── Project management ────────────────────────────────────────────────────

    def _refresh_projects(self):
        for w in self.cards_frame.winfo_children():
            w.destroy()
        self._cards.clear()

        projects = db.get_all_projects()
        for p in projects:
            card = ProjectCard(
                self.cards_frame, p,
                on_select=self._select_project,
                selected=(p["id"] == self._selected_id)
            )
            card.pack(fill="x", pady=4)
            self._cards[p["id"]] = card

        if self._selected_id and self._selected_id in self._cards:
            self._show_detail(self._selected_id)
        else:
            self._selected_id = None
            self.detail.clear()

        count = len(projects)
        self.lbl_status.configure(
            text=f"🟢 {count} proyecto{'s' if count != 1 else ''} registrado{'s' if count != 1 else ''}"
        )

    def _select_project(self, project_id: int):
        # Deselect old
        if self._selected_id and self._selected_id in self._cards:
            self._cards[self._selected_id].set_selected(False)

        self._selected_id = project_id
        if project_id in self._cards:
            self._cards[project_id].set_selected(True)

        self._show_detail(project_id)

    def _show_detail(self, project_id: int):
        p = db.get_project(project_id)
        if p:
            self.detail.show_project(p)

    def _new_project(self):
        dlg = ProjectFormDialog(self, title="Nuevo Proyecto")
        self.wait_window(dlg)
        if dlg.result:
            new_id = db.insert_project(dlg.result)
            self._selected_id = new_id
            self._refresh_projects()
            self.console.append(
                f"[+] Proyecto '{dlg.result['name']}' creado.\n", "success"
            )

    def _edit_project(self, project_id: int):
        p = db.get_project(project_id)
        if not p:
            return
        dlg = ProjectFormDialog(self, project=p, title="Editar Proyecto")
        self.wait_window(dlg)
        if dlg.result:
            db.update_project(project_id, dlg.result)
            self._refresh_projects()
            self.console.append(
                f"[✏] Proyecto '{dlg.result['name']}' actualizado.\n", "info"
            )

    def _delete_project(self, project_id: int):
        p = db.get_project(project_id)
        if not p:
            return
        if messagebox.askyesno(
            "Eliminar Proyecto",
            f"¿Eliminar '{p['name']}'?\nEsta acción no se puede deshacer.",
            icon="warning"
        ):
            db.delete_project(project_id)
            self._selected_id = None
            self._refresh_projects()
            self.console.append(
                f"[🗑] Proyecto '{p['name']}' eliminado.\n", "warning"
            )

    def _open_license_manager(self):
        # Pass the currently selected project (if any)
        p = db.get_project(self._selected_id) if self._selected_id else None
        dlg = LicenseDialog(self, project=p)
        self.wait_window(dlg)
        # We don't refresh projects here as license install doesn't change project config,
        # but we updated notes in LicenseDialog so let's refresh to show notes in details if needed.
        self._refresh_projects()

    # ── Deploy ────────────────────────────────────────────────────────────────

    def _get_checked_projects(self) -> list:
        checked = []
        for pid, card in self._cards.items():
            if card.var_check.get():
                p = db.get_project(pid)
                if p:
                    checked.append(p)
        return checked

    def _select_all(self):
        for card in self._cards.values():
            card.var_check.set(True)

    def _select_none(self):
        for card in self._cards.values():
            card.var_check.set(False)

    def _deploy_selected(self):
        if self._deploying:
            messagebox.showwarning("Deploy en curso",
                                   "Ya hay un deploy en progreso. Por favor espera.")
            return

        projects = self._get_checked_projects()
        if not projects:
            messagebox.showinfo("Sin selección",
                                "Marca al menos un proyecto con el checkbox antes de hacer deploy.")
            return

        names = ", ".join(p["name"] for p in projects)
        if not messagebox.askyesno(
            "Confirmar Deploy",
            f"Se desplegará{'n' if len(projects)>1 else ''}:\n\n{names}\n\n¿Continuar?",
        ):
            return

        self._deploying = True
        self.btn_deploy_all.configure(state="disabled", text="⏳ Desplegando...")
        self.lbl_status.configure(text="🟡 Deploy en curso...", text_color=T.WARNING)
        self.console.append(
            f"\n{'═'*50}\n🚀 Iniciando deploy de {len(projects)} proyecto(s): {names}\n{'═'*50}\n",
            "info"
        )

        def on_line(text, tag):
            self.console.append(text, tag)

        def on_project_done(project_id, success):
            # Refresh card status in UI
            self.after(0, self._refresh_card, project_id)

        def on_all_done(success):
            self._deploying = False
            self.after(0, self._deploy_finished, success)

        def on_project_start(name):
            self.after(0, self.detail.set_deploying_indicator, name)

        deploy_engine.run_deploy_queue(
            projects,
            on_line=on_line,
            on_done=on_all_done,
            on_project_done=on_project_done,
            stop_on_error=self.var_stop_on_error.get(),
            on_version_bumped=lambda v: self.after(0, self._update_version_widget, v),
            on_project_start=on_project_start,
        )

    def _refresh_card(self, project_id: int):
        """Refresh a single project card without full reload."""
        self._refresh_projects()

    def _deploy_finished(self, success: bool):
        self.btn_deploy_all.configure(state="normal", text="▶  Deploy Seleccionados")
        self.detail.clear_deploying_indicator()   # quitar indicador del panel
        if success:
            self.lbl_status.configure(text="🟢 Deploy completado", text_color=T.SUCCESS)
            # Update global deploy timestamp in header
            last_global = db.get_setting(db.LAST_GLOBAL_DEPLOY_KEY, "—")
            self.lbl_last_global.configure(text=f"Último deploy: {last_global}")
        else:
            self.lbl_status.configure(text="🔴 Deploy con errores", text_color=T.ERROR)
        self._refresh_projects()


    # ── Version helpers ──────────────────────────────────────────────────────────────────

    def _save_version(self):
        """Persists the manually entered version to the DB."""
        v = self.var_version.get().strip()
        if not v:
            messagebox.showwarning("Versión inválida", "Por favor ingresa un número de versión.")
            return
        db.set_setting(db.APP_VERSION_KEY, v)
        self.console.append(f"[v] Versión guardada manualmente: {v}\n", "info")

    def _update_version_widget(self, new_version: str):
        """Called from deploy thread via after(). Updates the UI version badge."""
        self.var_version.set(new_version)
