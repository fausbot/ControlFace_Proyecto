"""
ui/console.py — Scrollable terminal-like console panel.
"""
import customtkinter as ctk
import tkinter as tk
from tkinter import messagebox
import deploy_engine
from ui import theme as T


class ConsolePanel(ctk.CTkFrame):
    """
    A dark console widget that displays colored log lines with scroll.
    Tags:
        info    → TEXT_PRI (white-ish)
        success → SUCCESS (green)
        error   → ERROR (red)
        muted   → MUTED (gray)
    """

    def __init__(self, parent, **kwargs):
        super().__init__(parent, fg_color=T.BG_DEEP,
                         corner_radius=T.RADIUS, **kwargs)
        self._build()

    def _build(self):
        # Header bar
        bar = ctk.CTkFrame(self, fg_color=T.BG_CARD,
                           corner_radius=0, height=36)
        bar.pack(fill="x")
        bar.pack_propagate(False)

        ctk.CTkLabel(bar, text="⬛  CONSOLA DE DEPLOY",
                     font=T.FONT_SMALL, text_color=T.MUTED).pack(
            side="left", padx=12, pady=8)

        self.btn_clear = ctk.CTkButton(
            bar, text="Limpiar", width=70, height=24,
            fg_color="transparent", hover_color=T.BG_INPUT,
            text_color=T.MUTED, font=T.FONT_SMALL, corner_radius=6,
            command=self.clear,
        )
        self.btn_clear.pack(side="right", padx=8, pady=6)

        self.btn_save = ctk.CTkButton(
            bar, text="💾 Guardar Log", width=110, height=24,
            fg_color="transparent", hover_color=T.BG_INPUT,
            text_color=T.MUTED, font=T.FONT_SMALL, corner_radius=6,
            command=self._save_log,
        )
        self.btn_save.pack(side="right", padx=(0, 0), pady=6)

        # Text widget (not CTk — plain tk.Text for full color tag support)
        import tkinter as tk
        self.text = tk.Text(
            self,
            bg=T.BG_DEEP,
            fg=T.TEXT_PRI,
            font=T.FONT_MONO,
            wrap="word",
            bd=0,
            relief="flat",
            padx=12,
            pady=8,
            state="disabled",
            cursor="arrow",
        )
        scrollbar = ctk.CTkScrollbar(self, command=self.text.yview)
        self.text.configure(yscrollcommand=scrollbar.set)

        scrollbar.pack(side="right", fill="y", pady=(0, 0))
        self.text.pack(fill="both", expand=True)

        # Define color tags
        self.text.tag_configure("info",    foreground=T.TEXT_PRI)
        self.text.tag_configure("success", foreground=T.SUCCESS)
        self.text.tag_configure("error",   foreground=T.ERROR)
        self.text.tag_configure("muted",   foreground=T.MUTED)
        self.text.tag_configure("warning", foreground=T.WARNING)

    def append(self, text: str, tag: str = "info"):
        """Thread-safe line append."""
        self.after(0, self._append_safe, text, tag)

    def _append_safe(self, text: str, tag: str):
        self.text.configure(state="normal")
        self.text.insert("end", text, tag)
        self.text.see("end")
        self.text.configure(state="disabled")

    def clear(self):
        self.text.configure(state="normal")
        self.text.delete("1.0", "end")
        self.text.configure(state="disabled")

    def get_text(self) -> str:
        """Returns all current console text."""
        return self.text.get("1.0", "end")

    def _save_log(self):
        content = self.get_text().strip()
        if not content:
            messagebox.showinfo("Log vacío", "No hay contenido en la consola para guardar.")
            return
        try:
            path = deploy_engine.save_log(content)
            messagebox.showinfo("Log guardado", f"Archivo guardado en:\n{path}")
        except Exception as e:
            messagebox.showerror("Error", f"No se pudo guardar el log:\n{e}")
