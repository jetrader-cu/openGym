#!/usr/bin/env node
// Lleva la marca TallaYa a la app: icono principal de Android e iOS, pantallas de arranque
// (splash) de las dos plataformas y los iconos de la web/PWA. Los iconos alternativos del selector
// no salen de aqui: los dibuja frontend/scripts/app-icons.mjs desde frontend/resources/icons/.
//
// Uso (despues de build_svg.py y render.mjs):  node brand/scripts/apply_to_app.mjs

import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')

const BRAND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const APP = path.resolve(BRAND, '..', 'frontend')
const NOCHE = '#0D1B2E'
const svg = name => `file://${path.join(BRAND, 'svg', name)}`

let browser
async function shot(file, w, h, body) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden;background:${NOCHE}}</style></head><body>${body}</body></html>`
  const tmp = path.join(os.tmpdir(), `tallaya-apply-${process.pid}.html`)
  fs.writeFileSync(tmp, html)
  const p = await browser.newPage({ viewport: { width: w, height: h } })
  await p.goto(`file://${tmp}`, { waitUntil: 'load' })
  await p.screenshot({ path: file, clip: { x: 0, y: 0, width: w, height: h } })
  await p.close()
  execFileSync('convert', [file, '-alpha', 'off', file])
}

// Splash: el lockup vertical centrado sobre la noche, a un tercio del lado corto.
const splash = (w, h) => `<div style="width:${w}px;height:${h}px;display:flex;align-items:center;justify-content:center">
  <img src="${svg('tallaya-vertical-dark.svg')}" style="width:${Math.round(Math.min(w, h) * 0.42)}px"></div>`

async function main() {
  browser = await chromium.launch()

  // Android: launcher y capas adaptativas tal cual las genero render.mjs.
  const res = path.join(APP, 'android/app/src/main/res')
  const srcRes = path.join(BRAND, 'android/res')
  for (const dir of fs.readdirSync(srcRes)) {
    for (const f of fs.readdirSync(path.join(srcRes, dir))) {
      fs.mkdirSync(path.join(res, dir), { recursive: true })
      fs.copyFileSync(path.join(srcRes, dir, f), path.join(res, dir, f))
    }
  }
  // ldpi no viene en el set de la marca: se reduce desde mdpi.
  for (const f of ['ic_launcher', 'ic_launcher_round', 'ic_launcher_foreground', 'ic_launcher_background', 'ic_launcher_monochrome']) {
    const from = path.join(res, 'mipmap-mdpi', `${f}.png`)
    if (fs.existsSync(path.join(res, 'mipmap-ldpi'))) execFileSync('convert', [from, '-resize', '75%', path.join(res, 'mipmap-ldpi', `${f}.png`)])
  }

  // Android splash: cada splash.png existente se redibuja a su mismo tamano.
  for (const dir of fs.readdirSync(res).filter(d => d.startsWith('drawable'))) {
    const file = path.join(res, dir, 'splash.png')
    if (!fs.existsSync(file)) continue
    const [w, h] = execFileSync('identify', ['-format', '%w %h', file], { encoding: 'utf8' }).split(' ').map(Number)
    await shot(file, w, h, splash(w, h))
  }

  // iOS: icono principal (1024 opaco) y splash del storyboard.
  fs.copyFileSync(path.join(BRAND, 'ios/AppIcon.appiconset/AppIcon-1024.png'),
    path.join(APP, 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png'))
  const iosSplash = path.join(APP, 'ios/App/App/Assets.xcassets/Splash.imageset')
  for (const f of fs.readdirSync(iosSplash).filter(f => f.endsWith('.png'))) {
    const file = path.join(iosSplash, f)
    const [w, h] = execFileSync('identify', ['-format', '%w %h', file], { encoding: 'utf8' }).split(' ').map(Number)
    await shot(file, w, h, splash(w, h))
  }

  // Web / PWA.
  const pub = path.join(APP, 'public')
  fs.copyFileSync(path.join(BRAND, 'web/apple-touch-icon.png'), path.join(pub, 'icon-180.png'))
  fs.copyFileSync(path.join(BRAND, 'web/icon-maskable-512.png'), path.join(pub, 'icon-512.png'))
  fs.copyFileSync(path.join(BRAND, 'web/favicon.ico'), path.join(pub, 'favicon.ico'))
  fs.copyFileSync(path.join(BRAND, 'web/favicon.svg'), path.join(pub, 'favicon.svg'))

  await browser.close()
  console.log('Marca aplicada en frontend/ (android, ios, public)')
}

main().catch(e => { console.error(e); process.exit(1) })
