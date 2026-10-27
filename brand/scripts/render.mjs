#!/usr/bin/env node
// Rasteriza la marca de TallaYa: iconos (Android, iOS, web), lockups, splash,
// imagen social y las pantallas de onboarding. Usa Chromium headless para que
// el SVG, las fuentes y los degradados salgan igual que en la app.
//
// Uso:  python3 brand/scripts/build_svg.py && node brand/scripts/render.mjs
// Requisitos: playwright (con Chromium) e ImageMagick (`convert`, para el .ico).

import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { screens } from './onboarding.mjs'
import { brandBoard } from './board.mjs'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SVG = path.join(ROOT, 'svg')
const OUT = ROOT
const tokens = JSON.parse(fs.readFileSync(path.join(ROOT, 'tokens.json'), 'utf8'))
const C = Object.fromEntries(Object.entries(tokens.color).map(([k, v]) => [k, v.hex]))

// `base` permite escribir HTML portable (rutas relativas) para las paginas que se guardan.
export const fontFaces = (base = `file://${path.join(ROOT, 'fonts')}`) => {
  const f = (family, file, weight) =>
    `@font-face{font-family:'${family}';src:url('${base}/${file}') format('woff2');font-weight:${weight};font-display:block}`
  return [
    ...[700, 800, 900].map(w => f('Big Shoulders Display', `big-shoulders-display-latin-${w}-normal.woff2`, w)),
    ...[400, 500, 600, 700, 800].map(w => f('Manrope', `manrope-latin-${w}-normal.woff2`, w)),
    f('JetBrains Mono', 'jetbrains-mono-latin-600-normal.woff2', 600),
  ].join('\n')
}

const svgUrl = name => `file://${path.join(SVG, name)}`
const svgSize = name => {
  const head = fs.readFileSync(path.join(SVG, name), 'utf8').slice(0, 200)
  const [, w, h] = head.match(/width="(\d+)" height="(\d+)"/)
  return [Number(w), Number(h)]
}

const page = (w, h, body, bg = 'transparent') =>
  `<!doctype html><html><head><meta charset="utf-8"><style>${fontFaces()}
  html,body{margin:0;width:${w}px;height:${h}px;background:${bg};overflow:hidden}
  img.full{display:block;width:${w}px;height:${h}px}</style></head><body>${body}</body></html>`

let browser
async function shot(file, w, h, html, { opaque = false, url = null } = {}) {
  const p = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })
  // Una pagina en about:blank no puede leer file://: se escribe a un temporal y se abre.
  if (!url) {
    const tmp = path.join(os.tmpdir(), `tallaya-render-${process.pid}.html`)
    fs.writeFileSync(tmp, html)
    url = `file://${tmp}`
  }
  await p.goto(url, { waitUntil: 'load' })
  const broken = await p.evaluate(() => [...document.images].filter(i => !i.naturalWidth).map(i => i.src))
  if (broken.length) throw new Error(`Imagen sin cargar en ${file}: ${broken.join(', ')}`)
  await p.evaluate(() => document.fonts.ready)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  await p.screenshot({ path: file, omitBackground: !opaque, clip: { x: 0, y: 0, width: w, height: h } })
  await p.close()
  if (opaque) execFileSync('convert', [file, '-alpha', 'off', file])
  console.log('·', path.relative(ROOT, file), `${w}x${h}`)
}

const svgPng = (name, file, w, h = w, opts = {}) =>
  shot(file, w, h, page(w, h, `<img class="full" src="${svgUrl(name)}">`, opts.bg), opts)

// Encaja un SVG ajustando la altura a su proporcion.
const svgPngW = (name, file, w) => {
  const [sw, sh] = svgSize(name)
  return svgPng(name, file, w, Math.round((w * sh) / sw))
}

async function main() {
  browser = await chromium.launch()
  const png = (...p) => path.join(OUT, 'png', ...p)

  // 1. Simbolo, lockups y monocromos.
  for (const s of [1024, 512, 256, 128, 64]) await svgPng('tallaya-mark.svg', png(`tallaya-mark-${s}.png`), s)
  for (const v of ['symbol', 'symbol-dark', 'mark-mono-dark', 'mark-mono-light'])
    await svgPng(`tallaya-${v}.svg`, png(`tallaya-${v}-512.png`), 512)
  for (const v of ['light', 'dark']) {
    for (const w of [520, 1040]) await svgPngW(`tallaya-horizontal-${v}.svg`, png(`tallaya-horizontal-${v}-${w}.png`), w)
    for (const w of [360, 720]) await svgPngW(`tallaya-vertical-${v}.svg`, png(`tallaya-vertical-${v}-${w}.png`), w)
    for (const w of [480, 960]) await svgPngW(`tallaya-wordmark-${v}.svg`, png(`tallaya-wordmark-${v}-${w}.png`), w)
  }

  // 2. Icono de app: opaco y a sangre (App Store y Play rechazan transparencia).
  await svgPng('tallaya-app-icon.svg', png('tallaya-app-icon-1024.png'), 1024, 1024, { opaque: true })
  await svgPng('tallaya-app-icon.svg', png('tallaya-play-store-512.png'), 512, 512, { opaque: true })
  for (const alt of ['malecon', 'palma', 'sol', 'cal'])
    await svgPng(`tallaya-app-icon-${alt}.svg`, png('alternativos', `tallaya-app-icon-${alt}-1024.png`), 1024, 1024, { opaque: true })

  // 3. iOS: un solo 1024 opaco (Xcode 14+ genera el resto).
  await svgPng('tallaya-app-icon.svg', path.join(OUT, 'ios', 'AppIcon.appiconset', 'AppIcon-1024.png'), 1024, 1024, { opaque: true })
  fs.writeFileSync(path.join(OUT, 'ios', 'AppIcon.appiconset', 'Contents.json'), JSON.stringify({
    images: [{ filename: 'AppIcon-1024.png', idiom: 'universal', platform: 'ios', size: '1024x1024' }],
    info: { author: 'xcode', version: 1 },
  }, null, 2) + '\n')

  // 4. Android: launcher clasico + capas adaptativas (108 dp) + monocromo (Android 13).
  const dens = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 }
  for (const [d, k] of Object.entries(dens)) {
    const dir = path.join(OUT, 'android', 'res', `mipmap-${d}`)
    await svgPng('tallaya-mark.svg', path.join(dir, 'ic_launcher.png'), 48 * k)
    await shot(path.join(dir, 'ic_launcher_round.png'), 48 * k, 48 * k,
      page(48 * k, 48 * k, `<img class="full" style="border-radius:50%" src="${svgUrl('tallaya-app-icon.svg')}">`))
    for (const layer of ['foreground', 'background', 'monochrome'])
      await svgPng(`tallaya-adaptive-${layer}.svg`, path.join(dir, `ic_launcher_${layer}.png`), 108 * k)
  }
  const adaptive = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
    <monochrome android:drawable="@mipmap/ic_launcher_monochrome" />
</adaptive-icon>
`
  const any = path.join(OUT, 'android', 'res', 'mipmap-anydpi-v26')
  fs.mkdirSync(any, { recursive: true })
  fs.writeFileSync(path.join(any, 'ic_launcher.xml'), adaptive)
  fs.writeFileSync(path.join(any, 'ic_launcher_round.xml'), adaptive)
  for (const s of [432, 1024]) {
    await svgPng('tallaya-adaptive-foreground.svg', png(`tallaya-adaptive-foreground-${s}.png`), s)
    await svgPng('tallaya-adaptive-background.svg', png(`tallaya-adaptive-background-${s}.png`), s)
  }

  // 5. Web y PWA.
  const web = (...p) => path.join(OUT, 'web', ...p)
  for (const s of [16, 32, 48]) await svgPng('tallaya-favicon.svg', web(`favicon-${s}.png`), s)
  execFileSync('convert', [web('favicon-16.png'), web('favicon-32.png'), web('favicon-48.png'), web('favicon.ico')])
  fs.copyFileSync(path.join(SVG, 'tallaya-favicon.svg'), web('favicon.svg'))
  await svgPng('tallaya-app-icon.svg', web('apple-touch-icon.png'), 180, 180, { opaque: true })
  await svgPng('tallaya-mark.svg', web('icon-192.png'), 192)
  await svgPng('tallaya-mark.svg', web('icon-512.png'), 512)
  await svgPng('tallaya-app-icon.svg', web('icon-maskable-512.png'), 512, 512, { opaque: true })
  fs.writeFileSync(web('manifest.webmanifest'), JSON.stringify({
    name: 'TallaYa', short_name: 'TallaYa', lang: 'es-CU',
    description: 'Tu entrenador de bolsillo, hecho para Cuba. Funciona sin datos.',
    start_url: './', display: 'standalone', background_color: C.noche, theme_color: C.noche,
    icons: [
      { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }, null, 2) + '\n')

  // 6. Splash, imagen social y avatar de redes.
  const atmos = `background:radial-gradient(120% 70% at 50% 38%, #17325A 0%, ${C.noche} 55%, ${C.tinta} 100%)`
  const splash = (w, h) => page(w, h, `<div style="width:${w}px;height:${h}px;${atmos};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${h * 0.03}px">
    <img src="${svgUrl('tallaya-vertical-dark.svg')}" style="width:${w * 0.5}px">
    <div style="font:600 ${w * 0.034}px Manrope;color:${C['texto-suave']};letter-spacing:.02em">${tokens.tagline}</div></div>`)
  await shot(png('tallaya-splash-1284x2778.png'), 1284, 2778, splash(1284, 2778), { opaque: true })
  await shot(path.join(OUT, 'android', 'splash-2732.png'), 2732, 2732,
    page(2732, 2732, `<div style="width:2732px;height:2732px;background:${C.noche};display:flex;align-items:center;justify-content:center"><img src="${svgUrl('tallaya-mark.svg')}" style="width:640px"></div>`), { opaque: true })

  await shot(png('tallaya-og-1200x630.png'), 1200, 630, page(1200, 630, `
    <div style="width:1200px;height:630px;${atmos};position:relative;overflow:hidden;font-family:Manrope;color:${C.cal}">
      <img src="${svgUrl('tallaya-symbol-dark.svg')}" style="position:absolute;right:-40px;top:40px;width:560px;opacity:.95">
      <div style="position:absolute;left:72px;top:96px;width:640px">
        <img src="${svgUrl('tallaya-wordmark-dark.svg')}" style="height:96px">
        <div style="font:900 104px/0.92 'Big Shoulders Display';text-transform:uppercase;margin-top:36px">Ponte en talla,<br><span style="color:${C.mamey}">ya.</span></div>
        <div style="font:500 26px/1.4 Manrope;color:${C['texto-suave']};margin-top:28px">Rutinas, registro y progreso. Funciona sin datos.<br>Hecho para Cuba.</div>
      </div></div>`), { opaque: true })

  await shot(png('social', 'tallaya-avatar-1080.png'), 1080, 1080, page(1080, 1080,
    `<img class="full" src="${svgUrl('tallaya-app-icon.svg')}">`), { opaque: true })
  await shot(png('social', 'tallaya-portada-1500x500.png'), 1500, 500, page(1500, 500, `
    <div style="width:1500px;height:500px;${atmos};display:flex;align-items:center;gap:56px;padding-left:120px;box-sizing:border-box;color:${C.cal}">
      <img src="${svgUrl('tallaya-mark.svg')}" style="width:220px">
      <div><div style="font:900 120px/0.9 'Big Shoulders Display';text-transform:uppercase">Ponte en talla, <span style="color:${C.mamey}">ya.</span></div>
      <div style="font:600 28px Manrope;color:${C['texto-suave']};margin-top:18px">Entrena, mide y progresa. Sin gastar megas.</div></div></div>`), { opaque: true })

  // 7. Onboarding (1080x2340, proporcion de un Android tipico) y tablero de marca.
  // Estas paginas se guardan junto al PNG con rutas relativas: se pueden abrir y retocar.
  const ctx = { C, tokens, svgUrl: name => `../svg/${name}`, fontFaces: () => fontFaces('../fonts') }
  const saveAndShot = async (file, w, h, html) => {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const htmlFile = file.replace(/\.png$/, '.html')
    fs.writeFileSync(htmlFile, html)
    await shot(file, w, h, null, { opaque: true, url: `file://${htmlFile}` })
  }
  for (const [i, s] of screens(ctx).entries())
    await saveAndShot(path.join(OUT, 'onboarding', `tallaya-onboarding-${i + 1}-${s.slug}.png`), 1080, 2340, s.html)
  const board = brandBoard(ctx)
  await saveAndShot(path.join(OUT, 'board', 'tallaya-brand-board.png'), board.w, board.h, board.html)

  await browser.close()
}

main().catch(e => { console.error(e); process.exit(1) })
