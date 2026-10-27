#!/usr/bin/env python3
"""Genera todos los SVG de marca de TallaYa desde una sola definicion.

El wordmark se traza como paths (fonttools) para que ningun SVG dependa de
tener la tipografia instalada: se ve igual en un navegador, en un PDF o en el
generador de iconos de Android.

Uso: python3 brand/scripts/build_svg.py
Requisitos: pip install fonttools brotli
"""

from __future__ import annotations

from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

RAIZ = Path(__file__).resolve().parents[1]
SVG = RAIZ / "svg"
FUENTE_DISPLAY = RAIZ / "fonts" / "big-shoulders-display-latin-900-normal.woff2"

# Paleta (fuente de verdad: brand/tokens.json; si cambias uno, cambia el otro).
NOCHE = "#0D1B2E"      # azul noche habanera: fondo principal
TINTA = "#08111F"      # azul tinta: texto sobre claro, fondos profundos
MALECON = "#16324F"    # azul Malecon: superficies
MAMEY = "#FF6B3D"      # rojo mamey: acento principal y CTA
SOL = "#FFC531"        # amarillo sol: degradado del sol, destacados
PALMA = "#22C27A"      # verde palma real: progreso, PR, exito
TURQUESA = "#2EC4D6"   # turquesa Varadero: datos y graficas
CAL = "#FFF6EA"        # blanco cal colonial: texto sobre oscuro, fondo claro


# --------------------------------------------------------------------------- #
# Simbolo: la «T» de Talla es una barra olimpica que cruza un sol poniente.
# --------------------------------------------------------------------------- #

def defs(uid: str) -> str:
    return f"""<defs>
  <linearGradient id="{uid}-tile" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#17325A"/>
    <stop offset="1" stop-color="{TINTA}"/>
  </linearGradient>
  <linearGradient id="{uid}-sun" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="{SOL}"/>
    <stop offset="0.62" stop-color="{MAMEY}"/>
    <stop offset="1" stop-color="#E8432A"/>
  </linearGradient>
  <clipPath id="{uid}-clip"><rect width="512" height="512" rx="112"/></clipPath>
</defs>"""


def rays(color: str, opacity: float) -> str:
    """Rayos de cartel deportivo cubano que salen del sol."""
    out = []
    cx, cy = 256, 246
    for i in range(12):
        a0 = i * 30 + 4
        a1 = a0 + 13
        import math

        p0 = (cx + 520 * math.cos(math.radians(a0)), cy + 520 * math.sin(math.radians(a0)))
        p1 = (cx + 520 * math.cos(math.radians(a1)), cy + 520 * math.sin(math.radians(a1)))
        out.append(f"M{cx} {cy} L{p0[0]:.1f} {p0[1]:.1f} L{p1[0]:.1f} {p1[1]:.1f} Z")
    return f'<path d="{" ".join(out)}" fill="{color}" opacity="{opacity}"/>'


def barbell_t(fill: str, plate: str | None = None) -> str:
    """La T-barra. `plate` colorea los discos (por defecto, igual que la barra)."""
    plate = plate or fill
    return f"""<g>
  <rect x="58" y="150" width="396" height="30" rx="15" fill="{fill}"/>
  <rect x="96" y="104" width="40" height="122" rx="14" fill="{plate}"/>
  <rect x="376" y="104" width="40" height="122" rx="14" fill="{plate}"/>
  <rect x="68" y="124" width="24" height="82" rx="10" fill="{plate}"/>
  <rect x="420" y="124" width="24" height="82" rx="10" fill="{plate}"/>
  <path d="M220 172 H292 L284 398 Q284 414 268 414 H244 Q228 414 228 398 Z" fill="{fill}"/>
</g>"""


def sun(uid: str) -> str:
    return f'<circle cx="256" cy="246" r="112" fill="url(#{uid}-sun)"/>'


def waves(color: str, opacity: float) -> str:
    """Dos olas del Malecon al pie del simbolo."""
    return (
        f'<path d="M96 446 q40 -22 80 0 t80 0 t80 0 t80 0" fill="none" stroke="{color}" '
        f'stroke-width="14" stroke-linecap="round" opacity="{opacity}"/>'
    )


def tile(uid: str, rx: int = 112, full_bleed: bool = False) -> str:
    if full_bleed:
        return f'<rect width="512" height="512" fill="url(#{uid}-tile)"/>'
    return f'<rect width="512" height="512" rx="{rx}" fill="url(#{uid}-tile)"/>'


def clipped_rays(uid: str) -> str:
    """Rayos recortados a la baldosa redondeada (no se salen en los lockups)."""
    return f'<g clip-path="url(#{uid}-clip)">{rays("#FFFFFF", 0.045)}</g>'


def mark_body(uid: str, scale: float = 1.0, with_waves: bool = True) -> str:
    """Contenido del simbolo sobre su baldosa (sin baldosa ni rayos)."""
    inner = (
        sun(uid)
        + barbell_t(CAL)
        + (waves(TURQUESA, 0.9) if with_waves else "")
    )
    if scale == 1.0:
        return inner
    t = 256 * (1 - scale)
    return f'<g transform="translate({t:.2f} {t:.2f}) scale({scale})">{inner}</g>'


def svg(w: int, h: int, body: str, vb: str | None = None) -> str:
    vb = vb or f"0 0 {w} {h}"
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="{vb}">\n'
        f"{body}\n</svg>\n"
    )


# --------------------------------------------------------------------------- #
# Wordmark trazado
# --------------------------------------------------------------------------- #

def trace(text: str, font: TTFont, size: float, x0: float, baseline: float, tracking: float = 0.0):
    gs = font.getGlyphSet()
    cmap = font.getBestCmap()
    upm = font["head"].unitsPerEm
    k = size / upm
    x = x0
    paths = []
    for ch in text:
        name = cmap[ord(ch)]
        pen = SVGPathPen(gs)
        tpen = TransformPen(pen, (k, 0, 0, -k, x, baseline))
        gs[name].draw(tpen)
        paths.append(pen.getCommands())
        x += gs[name].width * k + tracking
    return " ".join(p for p in paths if p), x - tracking


def wordmark_parts(font: TTFont, size: float, x0: float, baseline: float):
    talla, x1 = trace("Talla", font, size, x0, baseline, tracking=size * 0.01)
    ya, x2 = trace("Ya", font, size, x1 + size * 0.02, baseline, tracking=size * 0.01)
    return talla, ya, x2


# --------------------------------------------------------------------------- #

def main() -> None:
    SVG.mkdir(parents=True, exist_ok=True)
    font = TTFont(str(FUENTE_DISPLAY))
    files: dict[str, str] = {}

    # Simbolo principal (baldosa redondeada): avatar, PWA, splash, web.
    files["tallaya-mark.svg"] = svg(512, 512, defs("m") + tile("m") + clipped_rays("m") + mark_body("m"))

    # Favicon: sin rayos ni olas, la T y el sol bien gordos para 16 px.
    files["tallaya-favicon.svg"] = svg(
        512, 512,
        defs("f") + tile("f", rx=120)
        + '<g transform="translate(-30 -18) scale(1.12)">' + sun("f") + barbell_t(CAL) + "</g>",
    )

    # Icono de app a sangre (App Store / Play exigen opaco y cuadrado).
    files["tallaya-app-icon.svg"] = svg(512, 512, defs("a") + tile("a", full_bleed=True) + rays("#FFFFFF", 0.045) + mark_body("a", 0.86))

    # Android adaptativo: fondo y primer plano por separado, zona segura 66 %.
    files["tallaya-adaptive-background.svg"] = svg(
        512, 512, defs("b") + tile("b", full_bleed=True) + rays("#FFFFFF", 0.045)
    )
    files["tallaya-adaptive-foreground.svg"] = svg(
        512, 512, defs("g") + f'<g transform="translate(76.8 76.8) scale(0.7)">{sun("g")}{barbell_t(CAL)}{waves(TURQUESA, 0.9)}</g>'
    )
    files["tallaya-adaptive-monochrome.svg"] = svg(
        512, 512, f'<g transform="translate(76.8 76.8) scale(0.7)"><circle cx="256" cy="246" r="112" fill="#000" opacity="0.35"/>{barbell_t("#000")}</g>'
    )

    # Monocromos: una sola tinta para sellos, grabados, camisetas.
    files["tallaya-mark-mono-dark.svg"] = svg(
        512, 512,
        f'<circle cx="256" cy="246" r="112" fill="none" stroke="{TINTA}" stroke-width="18"/>' + barbell_t(TINTA) + waves(TINTA, 1),
    )
    files["tallaya-mark-mono-light.svg"] = svg(
        512, 512,
        f'<circle cx="256" cy="246" r="112" fill="none" stroke="{CAL}" stroke-width="18"/>' + barbell_t(CAL) + waves(CAL, 1),
    )

    # Simbolo sin baldosa (sobre fondo propio de la pieza).
    files["tallaya-symbol.svg"] = svg(512, 512, defs("s") + sun("s") + barbell_t(TINTA) + waves(TURQUESA, 1))
    files["tallaya-symbol-dark.svg"] = svg(512, 512, defs("d") + sun("d") + barbell_t(CAL) + waves(TURQUESA, 1))

    # Iconos alternativos de la app (el usuario elige en Ajustes).
    alt = {
        "malecon": ("#0E5E6F", "#063540", CAL, TURQUESA),
        "palma": ("#0F5A3A", "#062B1C", CAL, SOL),
        "sol": (SOL, MAMEY, TINTA, TINTA),
        "cal": (CAL, "#F1E2CB", TINTA, MAMEY),
    }
    for name, (c0, c1, fg, wave) in alt.items():
        uid = f"x{name}"
        d = f"""<defs><linearGradient id="{uid}-tile" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{c0}"/><stop offset="1" stop-color="{c1}"/></linearGradient>
<linearGradient id="{uid}-sun" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{SOL if name != 'sol' else CAL}"/><stop offset="1" stop-color="{MAMEY if name != 'sol' else '#FFE7A8'}"/></linearGradient></defs>"""
        body = d + tile(uid, full_bleed=True) + f'<g transform="translate(35.84 35.84) scale(0.86)">{rays("#FFFFFF", 0.06)}{sun(uid)}{barbell_t(fg)}{waves(wave, 0.95)}</g>'
        files[f"tallaya-app-icon-{name}.svg"] = svg(512, 512, body)

    # Wordmark y lockups.
    size = 200
    talla, ya, wend = wordmark_parts(font, size, 0, 160)
    ww = int(wend + 4)
    for variant, txt in (("light", TINTA), ("dark", CAL)):
        files[f"tallaya-wordmark-{variant}.svg"] = svg(
            ww, 200, f'<path d="{talla}" fill="{txt}"/><path d="{ya}" fill="{MAMEY}"/>'
        )

    # Horizontal: simbolo 200 px + 40 px aire + wordmark.
    talla_h, ya_h, wend_h = wordmark_parts(font, 168, 236, 154)
    hw = int(wend_h + 12)
    for variant, txt in (("light", TINTA), ("dark", CAL)):
        uid = f"h{variant}"
        body = (
            defs(uid)
            + f'<g transform="scale(0.390625)">{tile(uid)}{clipped_rays(uid)}{mark_body(uid)}</g>'
            + f'<path d="{talla_h}" fill="{txt}"/><path d="{ya_h}" fill="{MAMEY}"/>'
        )
        files[f"tallaya-horizontal-{variant}.svg"] = svg(hw, 200, body)

    # Vertical: simbolo arriba, wordmark centrado debajo, lema.
    talla_v, ya_v, wend_v = wordmark_parts(font, 150, 0, 0)
    off = (512 - wend_v) / 2
    for variant, txt in (("light", TINTA), ("dark", CAL)):
        uid = f"v{variant}"
        body = (
            defs(uid)
            + f'<g transform="translate(136 0) scale(0.46875)">{tile(uid)}{clipped_rays(uid)}{mark_body(uid)}</g>'
            + f'<g transform="translate({off:.1f} 380)"><path d="{talla_v}" fill="{txt}"/><path d="{ya_v}" fill="{MAMEY}"/></g>'
        )
        files[f"tallaya-vertical-{variant}.svg"] = svg(512, 410, body)

    for name, content in files.items():
        (SVG / name).write_text(content, encoding="utf-8")
    print(f"{len(files)} SVG en {SVG}")


if __name__ == "__main__":
    main()
