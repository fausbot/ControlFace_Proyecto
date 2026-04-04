"""
ui/theme.py — Central design tokens for Deploy Manager
"""

# ── Palette ───────────────────────────────────────────────────────────────────
BG_DEEP    = "#0a0d14"   # deepest background
BG_SURFACE = "#111827"   # card / sidebar bg
BG_CARD    = "#1a2035"   # elevated card
BG_INPUT   = "#1e2640"   # input field bg
ACCENT     = "#6366f1"   # indigo accent
ACCENT_HOV = "#4f46e5"   # accent hover
SUCCESS    = "#22c55e"
WARNING    = "#f59e0b"
ERROR      = "#ef4444"
MUTED      = "#4b5563"
TEXT_PRI   = "#f1f5f9"
TEXT_SEC   = "#94a3b8"
BORDER     = "#2d3748"

# ── Fonts ─────────────────────────────────────────────────────────────────────
FONT_FAMILY = "Segoe UI"
FONT_TITLE  = (FONT_FAMILY, 22, "bold")
FONT_H2     = (FONT_FAMILY, 14, "bold")
FONT_BODY   = (FONT_FAMILY, 12)
FONT_SMALL  = (FONT_FAMILY, 10)
FONT_MONO   = ("Consolas", 11)

# ── Geometry ─────────────────────────────────────────────────────────────────
WIN_W = 1100
WIN_H = 720
SIDEBAR_W = 300
RADIUS = 10
PAD = 16
