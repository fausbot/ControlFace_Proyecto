import customtkinter as ctk
import tkinter as tk
from tkinter import messagebox
import datetime
try:
    from tkcalendar import DateEntry
except ImportError:
    # fallback to entry if not installed
    DateEntry = None

from ui import theme as T
import license_utils
import db

class LicenseDialog(ctk.CTkToplevel):
    """
    Modal window to generate and install licenses for clients.
    """

    def __init__(self, parent, project=None):
        super().__init__(parent)
        self.project = project
        self.all_projects = db.get_all_projects()
        
        self.title("🔑 Gestión de Licencias")
        self.geometry("600x750")
        self.resizable(False, False)
        self.configure(fg_color=T.BG_SURFACE)
        self.grab_set()
        self.focus_force()

        # Center on parent
        self.update_idletasks()
        px = parent.winfo_rootx() + (parent.winfo_width() - 600) // 2
        py = parent.winfo_rooty() + (parent.winfo_height() - 750) // 2
        self.geometry(f"+{px}+{py}")

        self._build_ui()
        self._populate_projects()

    def _build_ui(self):
        # Header
        header = ctk.CTkFrame(self, fg_color=T.BG_CARD, corner_radius=0, height=80)
        header.pack(fill="x")
        header.pack_propagate(False)

        ctk.CTkLabel(
            header, text="🔑 Generador de Licencias",
            font=T.FONT_TITLE, text_color=T.TEXT_PRI
        ).pack(side="left", padx=T.PAD, pady=T.PAD)

        # Scrollable area
        scroll = ctk.CTkScrollableFrame(self, fg_color=T.BG_SURFACE, corner_radius=0)
        scroll.pack(fill="both", expand=True, padx=T.PAD, pady=T.PAD)

        def _lbl(parent, text):
            ctk.CTkLabel(parent, text=text, font=T.FONT_SMALL,
                         text_color=T.TEXT_SEC).pack(anchor="w", pady=(10, 2))

        def _entry(parent, placeholder="", value=""):
            e = ctk.CTkEntry(
                parent, placeholder_text=placeholder, font=T.FONT_BODY,
                fg_color=T.BG_INPUT, border_color=T.BORDER, text_color=T.TEXT_PRI,
                corner_radius=8, height=38
            )
            e.pack(fill="x", pady=(0, 2))
            if value:
                e.insert(0, value)
            return e

        # Project Selection Dropdown
        _lbl(scroll, "SELECCIONAR CLIENTE PARA INSTALACIÓN")
        self.cb_projects = ctk.CTkComboBox(
            scroll, values=[], width=500, height=40,
            font=T.FONT_BODY, fg_color=T.BG_INPUT, border_color=T.BORDER,
            button_color=T.ACCENT, button_hover_color=T.ACCENT_HOV,
            corner_radius=8, command=self._on_project_change
        )
        self.cb_projects.pack(fill="x", pady=(0, 20))

        # Fields
        _lbl(scroll, "LÍMITE DE EMPLEADOS PERMITIDOS")
        self.e_max_emp = _entry(scroll, "Ej: 50", "50")

        _lbl(scroll, "MARGEN DE CORTESÍA (% EXTRA)")
        self.e_buffer = _entry(scroll, "Ej: 10", "10")

        _lbl(scroll, "FECHA DE VENCIMIENTO")
        # Default next year
        next_yr_dt = datetime.datetime.now() + datetime.timedelta(days=365)
        
        if DateEntry:
            # Container for DateEntry to control size/padding
            de_frame = ctk.CTkFrame(scroll, fg_color="transparent")
            de_frame.pack(fill="x", pady=(0, 2))
            
            self.e_expiry = DateEntry(
                de_frame, width=15, background=T.ACCENT, 
                foreground='white', borderwidth=2, 
                year=next_yr_dt.year, month=next_yr_dt.month, day=next_yr_dt.day,
                date_pattern='yyyy-mm-dd',
                font=T.FONT_BODY
            )
            self.e_expiry.pack(side="left", padx=2, pady=5)
        else:
            self.e_expiry = _entry(scroll, "Ej: 2026-12-31", next_yr_dt.strftime("%Y-%m-%d"))

        _lbl(scroll, "NOMBRE DEL PROVEEDOR (MENSAJE DE BLOQUEO)")
        self.e_provider = _entry(scroll, "Ej: ControlFace Software", "ControlFace Software")

        _lbl(scroll, "TELÉFONO DE SOPORTE")
        self.e_phone = _entry(scroll, "Ej: +57 315...", "+57 315 805 9309")

        # Key (Master Key)
        _lbl(scroll, "LLAVE MAESTRA (Debe coincidir con .env)")
        self.e_master_key = ctk.CTkEntry(
            scroll, font=T.FONT_SMALL, fg_color=T.BG_INPUT, border_color=T.BORDER,
            text_color=T.MUTED, corner_radius=8, height=38, show="*"
        )
        self.e_master_key.pack(fill="x", pady=(0, 2))
        self.e_master_key.insert(0, license_utils.DEFAULT_MASTER_KEY)

        # Result box
        _lbl(scroll, "TOKEN GENERADO")
        self.t_result = ctk.CTkTextbox(
            scroll, height=100, font=("Courier New", 12),
            fg_color=T.BG_INPUT, border_color=T.SUCCESS, text_color=T.SUCCESS,
            corner_radius=8
        )
        self.t_result.pack(fill="x", pady=(0, 10))

        # Buttons Frame
        btn_frame = ctk.CTkFrame(scroll, fg_color="transparent")
        btn_frame.pack(fill="x", pady=20)

        self.btn_gen = ctk.CTkButton(
            btn_frame, text="✨ Generar Token", font=T.FONT_H2,
            fg_color=T.ACCENT, hover_color=T.ACCENT_HOV, height=45,
            command=self._generate
        )
        self.btn_gen.pack(fill="x", pady=5)

        self.btn_install = ctk.CTkButton(
            btn_frame, text="🚀 Instalar Directo en Cliente", font=T.FONT_H2,
            fg_color="#10B981", hover_color="#059669", height=45,
            command=self._install
        )
        self.btn_install.pack(fill="x", pady=5)

        # Footer
        footer = ctk.CTkFrame(self, fg_color=T.BG_CARD, corner_radius=0, height=60)
        footer.pack(fill="x", side="bottom")
        ctk.CTkButton(
            footer, text="Cerrar", width=100, height=34,
            fg_color=T.BG_INPUT, text_color=T.TEXT_SEC,
            command=self.destroy
        ).pack(side="right", padx=T.PAD, pady=13)

    def _populate_projects(self):
        project_names = [f"{p['name']} ({p['firebase_id']})" for p in self.all_projects]
        if not project_names:
            self.cb_projects.configure(state="disabled", values=["No hay proyectos registrados"])
            return
            
        self.cb_projects.configure(values=project_names)
        
        # Pre-select if project was passed
        if self.project:
            match_str = f"{self.project['name']} ({self.project['firebase_id']})"
            if match_str in project_names:
                self.cb_projects.set(match_str)
        else:
            self.cb_projects.set("Seleccionar cliente...")

    def _on_project_change(self, choice):
        # find project by choice string
        for p in self.all_projects:
            if f"{p['name']} ({p['firebase_id']})" == choice:
                self.project = p
                break

    def _get_payload(self):
        try:
            return {
                "maxEmployees": int(self.e_max_emp.get()),
                "bufferPercentage": int(self.e_buffer.get()),
                "expirationDate": self.e_expiry.get_date().strftime("%Y-%m-%d") if hasattr(self.e_expiry, "get_date") else self.e_expiry.get().strip(),
                "providerName": self.e_provider.get().strip(),
                "providerPhone": self.e_phone.get().strip(),
                "issueDate": datetime.datetime.now().isoformat()
            }
        except ValueError:
            messagebox.showerror("Error", "Los campos numéricos deben ser números válidos.")
            return None

    def _generate(self):
        payload = self._get_payload()
        if not payload: return
        
        master_key = self.e_master_key.get().strip()
        token = license_utils.encrypt_license(payload, master_key)
        
        self.t_result.delete("1.0", "end")
        self.t_result.insert("1.0", token)
        # Auto-copy to clipboard
        self.clipboard_clear()
        self.clipboard_append(token)
        messagebox.showinfo("Copiado", "Token generado y copiado al portapapeles.")

    def _install(self):
        if not self.project:
            messagebox.showerror("Error", "Por favor, selecciona un cliente del menú antes de instalar.")
            return

        payload = self._get_payload()
        if not payload: return

        master_key = self.e_master_key.get().strip()
        token = license_utils.encrypt_license(payload, master_key)
        
        if not messagebox.askyesno("Confirmar", f"¿Instalar esta licencia en el proyecto '{self.project['name']}' ({self.project['firebase_id']})?\n\nEsto sobrescribirá la licencia actual."):
            return

        self.btn_install.configure(state="disabled", text="⌛ Instalando...")
        
        def run():
            success, output = license_utils.install_license_to_firebase(self.project['firebase_id'], token)
            def done():
                self.btn_install.configure(state="normal", text="🚀 Instalar Directo en Cliente")
                if success:
                    messagebox.showinfo("Éxito", f"Licencia instalada correctamente.\n\nSalida: {output}")
                    # Update local note just for tracking
                    notes = self.project.get("notes", "") + f"\n[LICENCIA] Actualizada el {datetime.datetime.now().strftime('%Y-%m-%d')}"
                    db.update_project(self.project['id'], {"notes": notes})
                else:
                    messagebox.showerror("Error", f"No se pudo instalar la licencia.\n\nDetalle: {output}")
            self.after(0, done)

        import threading
        threading.Thread(target=run, daemon=True).start()
