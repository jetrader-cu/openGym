#!/usr/bin/env python3
"""Iconos de app de TallaYa para el selector de iconos de la app (frontend).

frontend/scripts/app-icons.mjs dibuja los PNG con su propio rasterizador, que solo entiende rect,
circle, line, polyline, polygon y radialGradient. Este script escribe el mismo simbolo de la marca
(brand/scripts/build_svg.py) con ese subconjunto: discos y barra como lineas con punta redonda,
olas como polilineas muestreadas. Salida: frontend/resources/icons/<id>.svg

Uso: python3 brand/scripts/build_app_icon_art.py && (cd frontend && node scripts/app-icons.mjs)
"""
from __future__ import annotations

import math
from pathlib import Path

OUT = Path(__file__).resolve().parents[2] / "frontend" / "resources" / "icons"
K, T = 0.86, 35.84  # misma escala y margen que tallaya-app-icon.svg


def p(x: float, y: float) -> str:
    return f"{T + x * K:.1f},{T + y * K:.1f}"


def c(v: float) -> float:
    return round(T + v * K, 1)


def wave_points() -> str:
    # "M96 446 q40 -22 80 0 t80 0 t80 0 t80 0": cuatro arcos suaves, 12 muestras cada uno.
    pts = []
    for seg in range(4):
        x0 = 96 + 80 * seg
        sign = -1 if seg % 2 == 0 else 1
        for i in range(13 if seg == 0 else 12):
            t = i / 12 if seg == 0 else (i + 1) / 12
            x = x0 + 80 * t
            y = 446 + sign * 22 * 2 * t * (1 - t)
            pts.append(p(x, y))
    return " ".join(pts)


def rays(color: str) -> str:
    out = []
    cx, cy = 256, 246
    for i in range(12):
        a0, a1 = math.radians(i * 30 + 4), math.radians(i * 30 + 17)
        r = 520
        pts = [(cx, cy), (cx + r * math.cos(a0), cy + r * math.sin(a0)), (cx + r * math.cos(a1), cy + r * math.sin(a1))]
        out.append(f'<polygon points="{" ".join(f"{x:.1f},{y:.1f}" for x, y in pts)}" fill="{color}"/>')
    return "\n  ".join(out)


VARIANTS = {
    # id: (fondo centro, fondo borde, rayo, sol centro, sol borde, simbolo, ola, comentario)
    "tallaya": ("#17325a", "#08111f", "#14273f", "#ffc531", "#ff6b3d", "#fff6ea", "#2ec4d6", "noche habanera, el icono de siempre"),
    "malecon": ("#11707f", "#063540", "#0f5b68", "#ffc531", "#ff6b3d", "#fff6ea", "#ffc531", "azul Malecon"),
    "palma": ("#167a4e", "#062b1c", "#11613e", "#ffc531", "#ff6b3d", "#fff6ea", "#ffc531", "verde palma real"),
    "sol": ("#ffc531", "#ff6b3d", "#ffb22f", "#fff6ea", "#ffe7a8", "#08111f", "#08111f", "sol del poniente"),
    "cal": ("#fff6ea", "#f1e2cb", "#f6ead8", "#ffc531", "#ff6b3d", "#08111f", "#ff6b3d", "blanco cal, para fondos claros"),
    "mono": ("#0d1b2e", "#08111f", "#0d1b2e", "#3b4d63", "#2a3a4f", "#fff6ea", "#fff6ea", "una sola tinta"),
}


def svg(bg0, bg1, ray, s0, s1, fg, wave, note) -> str:
    plate = lambda x, y0, y1, w: f'<line x1="{c(x)}" y1="{c(y0)}" x2="{c(x)}" y2="{c(y1)}" stroke="{fg}" stroke-width="{w * K:.1f}"/>'
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 512 512">
  <!-- TallaYa app icon: {note}. Written by brand/scripts/build_app_icon_art.py with only the
       elements scripts/app-icons.mjs can draw; do not edit by hand. -->
  <defs>
    <radialGradient id="bg" gradientUnits="userSpaceOnUse" cx="140" cy="90" r="560">
      <stop offset="0" stop-color="{bg0}"/>
      <stop offset="1" stop-color="{bg1}"/>
    </radialGradient>
    <radialGradient id="sun" gradientUnits="userSpaceOnUse" cx="{c(256)}" cy="{c(150)}" r="{200 * K:.1f}">
      <stop offset="0" stop-color="{s0}"/>
      <stop offset="1" stop-color="{s1}"/>
    </radialGradient>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  {rays(ray)}
  <circle cx="{c(256)}" cy="{c(246)}" r="{112 * K:.1f}" fill="url(#sun)"/>
  <line x1="{c(73)}" y1="{c(165)}" x2="{c(439)}" y2="{c(165)}" stroke="{fg}" stroke-width="{30 * K:.1f}"/>
  {plate(116, 124, 206, 40)}
  {plate(396, 124, 206, 40)}
  {plate(80, 136, 194, 24)}
  {plate(432, 136, 194, 24)}
  <polygon points="{p(220, 172)} {p(292, 172)} {p(284, 404)} {p(276, 413)} {p(236, 413)} {p(228, 404)}" fill="{fg}"/>
  <polyline points="{wave_points()}" stroke="{wave}" stroke-width="{14 * K:.1f}"/>
</svg>
"""


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for vid, spec in VARIANTS.items():
        (OUT / f"{vid}.svg").write_text(svg(*spec), encoding="utf-8")
    print(f"{len(VARIANTS)} iconos en {OUT}")


if __name__ == "__main__":
    main()
