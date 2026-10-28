// Pantallas de onboarding de TallaYa (1080x2340). Direccion visual: cartel
// deportivo cubano de los 80-90 (rayos de sol, tipografia condensada enorme,
// grano de imprenta) sobre la noche habanera. Textos en espanol de Cuba.

const grain = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 .55 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`

// Iconos de trazo propios (sin logotipos de terceros).
const ico = {
  check: '<path d="M5 12.5l4.2 4.2L19 7" />',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6" />',
  wifiOff: '<path d="M2 8.5a16 16 0 0 1 6-3.4M22 8.5A16 16 0 0 0 12 4.6M5 12a11 11 0 0 1 4-2.3M19 12a11 11 0 0 0-2.2-1.5M8.5 15.5a6 6 0 0 1 5-1M12 19.5h.01M3 3l18 18" />',
  sync: '<path d="M20 11a8 8 0 0 0-14.3-4.8L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.8L20 16M20 20v-4h-4" />',
  phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.5" /><path d="M11 18.5h2" />',
  card: '<rect x="2.5" y="5.5" width="19" height="13" rx="2.5" /><path d="M2.5 10h19M6 15h4" />',
  wallet: '<path d="M4 7.5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6.5a2 2 0 0 1 2-2h11" /><circle cx="16" cy="13.5" r="1.2" />',
  coin: '<circle cx="12" cy="12" r="9" /><path d="M9 9.5h4.5a2 2 0 0 1 0 4H9.5a2 2 0 0 0 0 4H15M12 7v2.5M12 17.5V20" />',
  signal: '<path d="M4 20v-3M9 20v-7M14 20v-11M19 20V4" />',
  bank: '<path d="M3 9.5L12 4l9 5.5M5 10v7M9.5 10v7M14.5 10v7M19 10v7M3 20h18" />',
  flame: '<path d="M12 21c4 0 7-2.7 7-6.6 0-3.6-2.6-5.6-4-8.9-.6 2.4-2 3.6-3.4 4.2.2-2.6-.8-5.3-3-7.2C8.4 6.8 5 9.3 5 14.4 5 18.3 8 21 12 21z" />',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0V4zM8 6H4.5a3 3 0 0 0 3.5 4M16 6h3.5a3 3 0 0 1-3.5 4M12 13v4M8.5 20.5h7M10 17h4" />',
  bolt: '<path d="M13 2.5L4.5 13.5H12l-1 8L19.5 10.5H12l1-8z" />',
}
const icon = (name, size = 44, color = 'currentColor', sw = 2.2) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${ico[name]}</svg>`

function frame({ C, svgUrl, fontFaces }, { step, total, kicker, title, body, art, cta, foot = '' }) {
  // Con nota al pie el bloque inferior crece: el texto sube para no pisar los puntos.
  const copyTop = foot ? 1350 : 1400
  const dots = Array.from({ length: total }, (_, i) =>
    `<span class="dot${i === step ? ' on' : ''}"></span>`).join('')
  return `<!doctype html><html lang="es-CU"><head><meta charset="utf-8"><title>TallaYa · onboarding ${step + 1}</title><style>
${fontFaces()}
:root{--noche:${C.noche};--tinta:${C.tinta};--malecon:${C.malecon};--borde:${C['malecon-borde']};--mamey:${C.mamey};
--sol:${C.sol};--palma:${C.palma};--turquesa:${C.turquesa};--cal:${C.cal};--suave:${C['texto-suave']}}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1080px;height:2340px;overflow:hidden;background:var(--noche)}
body{font-family:Manrope,sans-serif;color:var(--cal);position:relative}
.sky{position:absolute;inset:0;background:
  radial-gradient(70% 34% at 50% 26%, rgba(255,107,61,.22), transparent 70%),
  radial-gradient(120% 60% at 50% 0%, #17325A 0%, transparent 70%),
  linear-gradient(180deg, var(--noche) 0%, var(--tinta) 100%)}
.rays{position:absolute;left:50%;top:640px;width:3000px;height:3000px;margin:-1500px 0 0 -1500px;
  background:repeating-conic-gradient(from 2deg, rgba(255,255,255,.035) 0 9deg, transparent 9deg 22.5deg);
  -webkit-mask:radial-gradient(circle, #000 0 30%, transparent 62%)}
.grain{position:absolute;inset:0;background:${grain};opacity:.07;mix-blend-mode:overlay}
.status{position:absolute;top:0;left:0;right:0;height:84px;display:flex;justify-content:space-between;align-items:center;
  padding:0 56px;font:700 32px Manrope;color:var(--cal)}
.status i{display:inline-block;width:52px;height:24px;border:3px solid var(--cal);border-radius:7px;position:relative;opacity:.9}
.status i:after{content:'';position:absolute;inset:3px;right:12px;background:var(--cal);border-radius:3px}
.top{position:absolute;top:130px;left:72px;right:72px;display:flex;justify-content:space-between;align-items:center}
.top img{height:84px}
.skip{font:700 34px Manrope;color:var(--suave);letter-spacing:.01em}
.art{position:absolute;top:290px;left:0;right:0;height:1080px;display:flex;align-items:center;justify-content:center}
.copy{position:absolute;left:72px;right:72px;top:1400px}
.kicker{font:600 30px 'JetBrains Mono';color:var(--mamey);letter-spacing:.08em;text-transform:uppercase;display:flex;gap:18px;align-items:center}
.kicker:before{content:'';width:56px;height:6px;background:var(--mamey);border-radius:3px}
h1{font:900 168px/.86 'Big Shoulders Display';text-transform:uppercase;letter-spacing:-.005em;margin-top:30px}
h1 em{font-style:normal;color:var(--mamey)}
p.body{font:500 42px/1.42 Manrope;color:var(--suave);margin-top:40px;max-width:900px}
p.body b{color:var(--cal);font-weight:700}
.bottom{position:absolute;left:72px;right:72px;bottom:110px}
.dots{display:flex;gap:14px;margin-bottom:56px}
.dot{width:18px;height:18px;border-radius:9px;background:var(--borde)}
.dot.on{width:72px;background:var(--mamey)}
.cta{height:150px;border-radius:999px;background:var(--mamey);color:var(--tinta);display:flex;align-items:center;justify-content:center;
  gap:22px;font:800 48px Manrope;box-shadow:0 26px 60px -18px rgba(255,107,61,.6), inset 0 -6px 0 rgba(0,0,0,.12)}
.foot{text-align:center;font:600 32px Manrope;color:var(--suave);margin-top:34px}
.card{background:linear-gradient(180deg, rgba(36,74,112,.55), rgba(22,50,79,.85));border:2px solid rgba(46,196,214,.14);
  border-radius:44px;box-shadow:0 40px 90px -30px rgba(0,0,0,.7)}
.chip{display:inline-flex;align-items:center;gap:14px;border-radius:999px;padding:16px 28px;font:700 32px Manrope;
  background:rgba(255,246,234,.06);border:2px solid var(--borde)}
.num{font-family:'Big Shoulders Display';font-weight:900;font-variant-numeric:tabular-nums}
</style></head><body>
<div class="sky"></div><div class="rays"></div>
<div class="status"><span>9:41</span><span style="display:flex;gap:16px;align-items:center">${icon('signal', 34, C.cal, 2.6)}<i></i></span></div>
<div class="top"><img src="${svgUrl('tallaya-horizontal-dark.svg')}" alt="TallaYa"><span class="skip">${step < total - 1 ? 'Saltar' : ''}</span></div>
<div class="art">${art}</div>
<div class="copy" style="top:${copyTop}px"><div class="kicker">${String(step + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')} · ${kicker}</div>
<h1>${title}</h1><p class="body">${body}</p></div>
<div class="bottom"><div class="dots">${dots}</div><div class="cta">${cta} ${icon('arrow', 52, C.tinta, 2.8)}</div>${foot ? `<div class="foot">${foot}</div>` : ''}</div>
<div class="grain"></div>
</body></html>`
}

export function screens(ctx) {
  const { C, svgUrl } = ctx
  const total = 5
  const list = []

  // 1 · Bienvenida
  list.push({
    slug: 'bienvenida',
    html: frame(ctx, {
      step: 0, total, kicker: 'Bienvenido',
      title: 'Ponte en<br>talla, <em>ya.</em>',
      body: 'Tu entrenador de bolsillo, <b>hecho para Cuba</b>. Planifica, entrena y mide tu avance desde el teléfono.',
      cta: 'Empezar',
      art: `<div style="position:relative;width:860px;height:860px">
        <svg viewBox="0 0 860 860" width="860" height="860" style="position:absolute;inset:0">
          <defs><path id="c" d="M430 430 m-380 0 a380 380 0 1 1 760 0 a380 380 0 1 1 -760 0"/></defs>
          <circle cx="430" cy="430" r="412" fill="none" stroke="${C['malecon-borde']}" stroke-width="2" stroke-dasharray="4 14"/>
          <text font-family="JetBrains Mono" font-weight="600" font-size="30" letter-spacing="9" fill="${C['texto-suave']}">
            <textPath href="#c">HECHO PARA CUBA · FUNCIONA SIN DATOS · CUP · MLC · USD · HECHO PARA CUBA · FUNCIONA SIN DATOS ·</textPath></text>
        </svg>
        <img src="${svgUrl('tallaya-symbol-dark.svg')}" style="position:absolute;left:110px;top:100px;width:640px;filter:drop-shadow(0 40px 60px rgba(255,107,61,.35))">
      </div>`,
    }),
  })

  // 2 · Plan de la semana
  const days = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
  const ex = [
    ['Sentadilla', '4 × 8', '80 kg', true],
    ['Peso muerto rumano', '3 × 10', '70 kg', true],
    ['Zancadas', '3 × 12', '2 × 16 kg', false],
  ]
  list.push({
    slug: 'plan',
    html: frame(ctx, {
      step: 1, total, kicker: 'Tu plan',
      title: 'Tu semana,<br><em>lista.</em>',
      body: 'Elige una rutina o arma la tuya con <b>más de 5&nbsp;600 ejercicios</b> con demostración animada.',
      cta: 'Siguiente',
      art: `<div style="position:relative;width:936px;height:960px">
        <div class="card" style="position:absolute;left:60px;right:-10px;top:40px;height:300px;transform:rotate(-4deg);opacity:.55;padding:44px 52px">
          <div style="font:700 30px 'JetBrains Mono';color:${C.turquesa};letter-spacing:.08em">MAÑANA · EMPUJE</div></div>
        <div class="card" style="position:absolute;left:0;right:0;top:110px;padding:52px">
          <div style="display:flex;justify-content:space-between">${days.map((d, i) => `<div style="width:96px;height:120px;border-radius:28px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;
            ${i === 2 ? `background:${C.mamey};color:${C.tinta}` : `background:rgba(8,17,31,.45);color:${C['texto-suave']}`}">
            <span style="font:800 34px Manrope">${d}</span><span style="width:12px;height:12px;border-radius:6px;background:${i === 2 ? C.tinta : [0, 1, 3, 4].includes(i) ? C.palma : 'transparent'}"></span></div>`).join('')}</div>
          <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:56px">
            <div><div style="font:700 28px 'JetBrains Mono';color:${C.mamey};letter-spacing:.08em">HOY · MIÉRCOLES</div>
            <div style="font:900 96px/1 'Big Shoulders Display';text-transform:uppercase;margin-top:12px">Piernas</div></div>
            <div style="font:600 30px Manrope;color:${C['texto-suave']};text-align:right">4 ejercicios<br>≈ 55 min</div></div>
          <div style="margin-top:32px;display:flex;flex-direction:column;gap:16px">${ex.map(([n, s, w, done]) => `
            <div style="display:flex;align-items:center;gap:28px;padding:22px 30px;border-radius:28px;background:rgba(8,17,31,.5)">
              <span style="width:58px;height:58px;border-radius:18px;display:flex;align-items:center;justify-content:center;${done ? `background:${C.palma}` : `border:3px solid ${C['malecon-borde']}`}">${done ? icon('check', 36, C.tinta, 3.2) : ''}</span>
              <span style="flex:1;font:700 36px Manrope;${done ? `color:${C['texto-suave']}` : ''}">${n}</span>
              <span class="num" style="font-size:44px;color:${C.cal}">${s}</span>
              <span style="font:600 30px Manrope;color:${C.turquesa};width:170px;text-align:right">${w}</span></div>`).join('')}</div>
        </div></div>`,
    }),
  })

  // 3 · Sin conexion
  list.push({
    slug: 'sin-datos',
    html: frame(ctx, {
      step: 2, total, kicker: 'Sin conexión',
      title: 'Sin datos,<br><em>no hay lío.</em>',
      body: 'Entrena <b>sin conexión y sin gastar megas</b>. Todo se guarda en tu teléfono y se sincroniza cuando cojas WiFi.',
      cta: 'Siguiente',
      art: `<div style="position:relative;width:936px;height:960px">
        <div style="position:absolute;left:0;top:30px" class="chip">${icon('wifiOff', 40, C.mamey)}<span>Sin conexión</span></div>
        <div style="position:absolute;left:0;right:0;top:150px;text-align:center">
          <div class="num" style="font-size:420px;line-height:.82;background:linear-gradient(180deg, ${C.sol}, ${C.mamey});-webkit-background-clip:text;color:transparent">0 MB</div>
          <div style="font:700 40px Manrope;color:${C['texto-suave']};margin-top:12px">gastados en el entreno de hoy</div></div>
        <div class="card" style="position:absolute;left:0;right:0;bottom:20px;padding:44px 52px;display:flex;flex-direction:column;gap:30px">
          <div style="display:flex;align-items:center;gap:26px"><span style="width:72px;height:72px;border-radius:22px;background:${C.palma};display:flex;align-items:center;justify-content:center">${icon('check', 44, C.tinta, 3)}</span>
            <div><div style="font:800 38px Manrope">Entreno guardado</div><div style="font:500 30px Manrope;color:${C['texto-suave']}">En este teléfono · 18 series · 4 200 kg movidos</div></div></div>
          <div style="height:2px;background:${C['malecon-borde']}"></div>
          <div style="display:flex;align-items:center;gap:26px"><span style="width:72px;height:72px;border-radius:22px;border:3px solid ${C.turquesa};display:flex;align-items:center;justify-content:center">${icon('sync', 40, C.turquesa)}</span>
            <div><div style="font:800 38px Manrope">3 cambios esperando WiFi</div><div style="font:500 30px Manrope;color:${C['texto-suave']}">Se suben solos al volver la conexión</div></div></div>
        </div></div>`,
    }),
  })

  // 4 · Progreso
  const pts = [62, 64, 63, 70, 72, 71, 78, 84, 83, 90, 96, 100]
  const W = 832, H = 340
  const xs = i => 20 + (i * (W - 40)) / (pts.length - 1)
  const ys = v => H - 20 - ((v - 55) / 50) * (H - 40)
  const line = pts.map((v, i) => `${i ? 'L' : 'M'}${xs(i).toFixed(1)} ${ys(v).toFixed(1)}`).join(' ')
  list.push({
    slug: 'progreso',
    html: frame(ctx, {
      step: 3, total, kicker: 'Tu avance',
      title: 'Mide cada<br><em>kilo.</em>',
      body: 'Récords, peso corporal y mapa muscular. TallaYa <b>sube la carga por ti</b> cuando ya estás listo.',
      cta: 'Siguiente',
      art: `<div style="position:relative;width:936px;height:980px">
        <div class="card" style="position:absolute;left:0;right:0;top:30px;padding:48px 52px">
          <div style="font:700 28px 'JetBrains Mono';color:${C['texto-suave']};letter-spacing:.06em">SENTADILLA · 1RM ESTIMADO</div>
          <div style="display:flex;align-items:baseline;gap:22px;margin-top:14px"><span class="num" style="font-size:150px;line-height:1">112,5</span><span style="font:800 48px Manrope;color:${C['texto-suave']}">kg</span>
            <span class="chip" style="margin-left:auto;background:rgba(34,194,122,.14);border-color:rgba(34,194,122,.5);color:${C.palma}">+12,5 kg · 8 sem</span></div>
          <svg width="${W}" height="${H}" style="margin-top:20px;display:block">
            <defs><linearGradient id="ar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.turquesa}" stop-opacity=".35"/><stop offset="1" stop-color="${C.turquesa}" stop-opacity="0"/></linearGradient></defs>
            ${[0, 1, 2, 3].map(i => `<line x1="0" x2="${W}" y1="${20 + i * 100}" y2="${20 + i * 100}" stroke="${C['malecon-borde']}" stroke-width="2" stroke-dasharray="3 10"/>`).join('')}
            <path d="${line} L${xs(pts.length - 1)} ${H} L${xs(0)} ${H} Z" fill="url(#ar)"/>
            <path d="${line}" fill="none" stroke="${C.turquesa}" stroke-width="7" stroke-linejoin="round" stroke-linecap="round"/>
            <circle cx="${xs(pts.length - 1)}" cy="${ys(100)}" r="18" fill="${C.sol}" stroke="${C.noche}" stroke-width="6"/>
          </svg></div>
        <div style="position:absolute;left:0;right:0;bottom:10px;display:flex;gap:28px">
          <div class="card" style="flex:1;padding:40px 44px"><div style="display:flex;align-items:center;gap:16px;color:${C.sol}">${icon('trophy', 46, C.sol)}<span style="font:700 28px 'JetBrains Mono';letter-spacing:.06em">NUEVO RÉCORD</span></div>
            <div style="font:800 36px Manrope;margin-top:20px">Press de banca</div><div class="num" style="font-size:84px;margin-top:6px">72,5 kg</div></div>
          <div class="card" style="flex:1;padding:40px 44px"><div style="display:flex;align-items:center;gap:16px;color:${C.mamey}">${icon('flame', 46, C.mamey)}<span style="font:700 28px 'JetBrains Mono';letter-spacing:.06em">RACHA</span></div>
            <div style="font:800 36px Manrope;margin-top:20px">Semanas seguidas</div><div class="num" style="font-size:84px;margin-top:6px">9</div></div>
        </div></div>`,
    }),
  })

  // 5 · Pagos
  const methods = [
    ['phone', 'Transfermóvil', 'CUP · MLC'],
    ['bank', 'EnZona', 'CUP · MLC'],
    ['wallet', 'QvaPay', 'USD'],
    ['coin', 'PayPal', 'USD'],
    ['card', 'Tarjeta', 'Visa · Mastercard'],
    ['bolt', 'Cripto', 'USDT · USDC'],
    ['signal', 'Saldo móvil', 'ETECSA'],
  ]
  list.push({
    slug: 'pagos',
    html: frame(ctx, {
      step: 4, total, kicker: 'Planes y pagos',
      title: 'Paga como<br>te <em>cuadre.</em>',
      body: 'Empieza <b>gratis</b>. Si quieres más, paga en <b>CUP, MLC o USD</b> con el método que ya usas.',
      cta: 'Empezar gratis',
      foot: 'Sin tarjeta para empezar · Cancela cuando quieras',
      art: `<div style="position:relative;width:936px;height:1000px">
        <div style="display:flex;gap:20px;justify-content:center">${['CUP', 'MLC', 'USD'].map((m, i) => `<span class="chip" style="font-size:40px;padding:18px 44px;${i === 0 ? `background:${C.cal};color:${C.tinta};border-color:${C.cal}` : ''}">${m}</span>`).join('')}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:34px">${methods.map(([ic, n, sub], i) => `
          <div class="card" style="border-radius:34px;padding:22px 30px;display:flex;align-items:center;gap:24px;${i === methods.length - 1 ? 'grid-column:span 2' : ''}">
            <span style="width:76px;height:76px;border-radius:24px;background:rgba(8,17,31,.55);display:flex;align-items:center;justify-content:center;flex:none">${icon(ic, 42, [C.mamey, C.turquesa, C.sol, C.palma][i % 4])}</span>
            <div><div style="font:800 36px Manrope">${n}</div><div style="font:600 27px Manrope;color:${C['texto-suave']}">${sub}</div></div></div>`).join('')}</div>
        <div style="margin-top:30px;border-radius:40px;padding:30px 44px;background:linear-gradient(100deg, ${C.sol}, ${C.mamey});color:${C.tinta};display:flex;align-items:center;justify-content:space-between">
          <div><div style="font:800 30px 'JetBrains Mono';letter-spacing:.06em">EN TALLA · PRECIO FUNDADOR</div><div style="font:700 32px Manrope;margin-top:6px">o su equivalente en CUP a la tasa del día</div></div>
          <div style="text-align:right"><span class="num" style="font-size:96px;line-height:1">0,99</span><div style="font:800 28px Manrope">USD / mes</div></div></div>
      </div>`,
    }),
  })
  return list
}
