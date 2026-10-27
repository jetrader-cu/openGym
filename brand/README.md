# Marca TallaYa

Fuente única de la identidad de TallaYa, la app de fitness para Cuba basada en openGym.
Ninguna pantalla, plantilla ni pieza de redes dibuja el logo por su cuenta: se usa lo de aquí.

- Por qué el nombre: [`docs/marca/nombre-tallaya.md`](../docs/marca/nombre-tallaya.md)
- Planes y precios: [`founder/pricing-strategy.md`](../founder/pricing-strategy.md)
- Tablero visual completo: [`board/tallaya-brand-board.png`](board/tallaya-brand-board.png)
- Tokens para código: [`tokens.json`](tokens.json) · Brand pack del enjambre IA: [`tallaya.json`](tallaya.json)

## Idea

**Cartel deportivo cubano en la noche habanera.** Los carteles del INDER y de los Panamericanos
del 91: letra condensada enorme, rayos de sol, grano de imprenta. Encima, el trópico de noche:
azul Malecón, sol poniente color mamey y olas turquesa.

Lema: **«Ponte en talla, ya.»**

## El logo

La **T** de Talla es una **barra olímpica con discos** que cruza un **sol poniente**; debajo, una
**ola del Malecón**. Se lee como letra, como gimnasio y como Cuba a la vez, y aguanta 16 px.

No usa la bandera, la estrella ni el escudo: son símbolos nacionales con uso regulado.

| Archivo (`svg/`) | Cuándo usarlo |
|---|---|
| `tallaya-mark` | Símbolo en su baldosa. PWA, avatar, splash, web. |
| `tallaya-app-icon` | Icono de app a sangre, opaco. App Store y Play. |
| `tallaya-app-icon-{malecon,palma,sol,cal}` | Iconos alternativos que el usuario elige en Ajustes. |
| `tallaya-adaptive-{background,foreground,monochrome}` | Capas del icono adaptativo de Android (13+ con monocromo). |
| `tallaya-favicon` | Navegador. Sin olas ni rayos, para que se lea a 16 px. |
| `tallaya-horizontal-{light,dark}` | Lockup principal: cabeceras, correos, PDF, banners. |
| `tallaya-vertical-{light,dark}` | Espacios altos: splash, historias, tarjetas cuadradas. |
| `tallaya-wordmark-{light,dark}` | Solo el nombre, cuando el símbolo ya está cerca. |
| `tallaya-symbol`, `-symbol-dark` | Símbolo sin baldosa, sobre el fondo de la pieza. |
| `tallaya-mark-mono-{dark,light}` | Una sola tinta: sellos, camisetas, grabado. |

`light` = para fondo claro (texto tinta). `dark` = para fondo oscuro (texto cal).
El wordmark está **trazado como paths**: no depende de tener la tipografía instalada.

## Paleta: Cuba de noche

| Token | Hex | Nombre | Uso |
|---|---|---|---|
| `noche` | `#0D1B2E` | azul noche habanera | Fondo principal. La app es oscura por defecto (gimnasios con poca luz, ahorro de batería). |
| `tinta` | `#08111F` | azul tinta | Texto sobre claro y sobre botones mamey. |
| `malecon` | `#16324F` | azul Malecón | Tarjetas y superficies. |
| `malecon-borde` | `#244A70` | azul Malecón claro | Bordes, divisores, puntos inactivos. |
| `mamey` | `#FF6B3D` | rojo mamey | Acento: botones, cifras clave, el sol. |
| `mamey-oscuro` | `#C8401C` | mamey tostado | Texto de acento sobre fondo claro. |
| `sol` | `#FFC531` | amarillo sol | Degradado del sol, rachas, récords. |
| `palma` | `#22C27A` | verde palma real | Progreso, series hechas, éxito. |
| `turquesa` | `#2EC4D6` | turquesa Varadero | Datos y gráficas. |
| `cal` | `#FFF6EA` | blanco cal colonial | Texto sobre oscuro y fondo del modo claro. |
| `cal-hundida` | `#F3E6D2` | cal con sombra | Inputs y celdas en modo claro. |
| `texto-suave` | `#9FB0C6` | gris azulado | Texto secundario sobre noche. |

Contraste (WCAG): cal/noche 16.2:1 · tinta/mamey 6.7:1 · mamey/noche 6.1:1 ·
mamey-oscuro/cal 4.7:1 · texto-suave/noche 7.8:1. Todo pasa AA.

Regla: el botón principal es **mamey con texto tinta**, nunca mamey con texto blanco (no pasa AA).

## Tipografía

| Rol | Familia | Por qué |
|---|---|---|
| Display | **Big Shoulders Display** 700-900 | Condensada de cartel de estadio: titulares enormes y cifras (kg, series) que caben en el móvil. |
| Texto | **Manrope** 400-800 | Legible a tamaño pequeño, con carácter, acentos y ñ completos. |
| Códigos | **JetBrains Mono** 600 | Referencias de pago e importes en recibos (misma que el resto de apps de la casa). |

Titulares en MAYÚSCULAS con la última palabra en mamey: «SIN DATOS, **NO HAY LÍO.**»
Cifras con `font-variant-numeric: tabular-nums`. Las fuentes están en `fonts/` (OFL 1.1).

## Voz

Español de Cuba, cercano y con energía, como un entrenador de barrio que sabe lo que hace.

- Sí: «Sin datos, no hay lío.» «Paga como te cuadre.» «Cuando cojas WiFi.»
- No: promesas de resultados («baja 10 kg en un mes»), culpa («no fallaste hoy, ¿verdad?»),
  anglicismos innecesarios («workout», «tracking»).
- Importes siempre con moneda: «1,99 USD», «950 CUP».

## Archivos generados

| Carpeta | Contenido |
|---|---|
| `png/` | Símbolo (64-1024), lockups, wordmarks, icono 1024, Play 512, capas adaptativas, splash 1284×2778, imagen social 1200×630. |
| `png/alternativos/` | Iconos alternativos 1024. |
| `png/social/` | Avatar 1080 y portada 1500×500 para redes. |
| `android/res/` | `mipmap-*` listos para copiar: `ic_launcher`, `ic_launcher_round`, capas `foreground/background/monochrome` y el XML adaptativo. `android/splash-2732.png` para Capacitor. |
| `ios/AppIcon.appiconset/` | Icono 1024 opaco con su `Contents.json`. |
| `web/` | `favicon.ico` (16/32/48), `favicon.svg`, `apple-touch-icon.png`, iconos PWA 192/512, maskable y `manifest.webmanifest`. |
| `onboarding/` | Las 5 pantallas de bienvenida (1080×2340) en PNG y su HTML editable. |
| `board/` | Tablero de marca para compartir. |

## Regenerar

```bash
pip install fonttools brotli          # traza el wordmark
python3 brand/scripts/build_svg.py    # SVG desde una sola definición
node brand/scripts/render.mjs         # PNG con Chromium (playwright) + ImageMagick para el .ico
```

Si cambias un color, cámbialo en `tokens.json` **y** en `scripts/build_svg.py`.

## Siguiente paso: llevarlo a la app

Esta carpeta aún no reemplaza los iconos de openGym dentro de `frontend/`. Para aplicarla:

1. Copiar `android/res/*` a `frontend/android/app/src/main/res/` (el XML nuevo ya no usa `inset`).
2. Copiar `ios/AppIcon.appiconset/` a `frontend/ios/App/App/Assets.xcassets/`.
3. Copiar `web/*` a `frontend/public/` y apuntar `index.html` y `manifest.json` a los nuevos.
4. Cambiar `appId`/`appName` en `frontend/capacitor.config.json` y el `backgroundColor` a `#0D1B2E`.
5. Llevar los tokens a las variables CSS del tema y añadir las pantallas de onboarding.
6. Sustituir `app-icon-variants.js` por los alternativos de TallaYa.

Antes de publicar nada: revisar licencias (AGPL y animaciones de Gym visual) en
[`docs/marca/nombre-tallaya.md`](../docs/marca/nombre-tallaya.md#riesgos-que-hay-que-resolver-antes-del-lanzamiento).
