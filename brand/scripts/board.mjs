// Tablero de marca de TallaYa: una sola imagen con logo, paleta, tipografias,
// iconos y onboarding, para compartir con el equipo o un disenador.

export function brandBoard({ C, tokens, svgUrl, fontFaces }) {
  const w = 2400, h = 4400
  const sw = Object.entries(tokens.color).map(([k, v]) => {
    const dark = ['noche', 'tinta', 'malecon', 'malecon-borde', 'mamey-oscuro'].includes(k)
    return `<div class="sw" style="background:${v.hex};color:${dark ? C.cal : C.tinta}">
      <b>${v.describe}</b><span>${v.hex} · ${k}</span><small>${v.role}</small></div>`
  }).join('')
  const alt = ['', '-malecon', '-palma', '-sol', '-cal'].map(s =>
    `<img src="${svgUrl(`tallaya-app-icon${s}.svg`)}" style="width:200px;border-radius:46px">`).join('')
  const ob = [1, 2, 3, 4, 5].map((n, i) =>
    `<img src="../onboarding/tallaya-onboarding-${n}-${['bienvenida', 'plan', 'sin-datos', 'progreso', 'pagos'][i]}.png" style="width:400px;border-radius:40px;border:3px solid ${C['malecon-borde']}">`).join('')
  const html = `<!doctype html><html lang="es-CU"><head><meta charset="utf-8"><title>TallaYa · tablero de marca</title><style>
${fontFaces()}
*{box-sizing:border-box;margin:0}
body{width:${w}px;height:${h}px;background:${C.noche};color:${C.cal};font-family:Manrope;padding:120px;overflow:hidden;
  background-image:radial-gradient(60% 30% at 80% 0%, rgba(255,107,61,.18), transparent 70%)}
h2{font:700 30px 'JetBrains Mono';letter-spacing:.12em;color:${C.mamey};text-transform:uppercase;margin:0 0 36px}
.row{display:flex;gap:48px;align-items:center}
section{margin-top:110px}
.sw{height:250px;border-radius:32px;padding:32px;display:flex;flex-direction:column;justify-content:flex-end;gap:6px}
.sw b{font:800 34px Manrope}.sw span{font:600 24px 'JetBrains Mono';opacity:.85}.sw small{font:500 22px Manrope;opacity:.75}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:24px}
.panel{border-radius:40px;padding:56px;flex:1}
</style></head><body>
<div class="row" style="justify-content:space-between">
  <img src="${svgUrl('tallaya-horizontal-dark.svg')}" style="height:230px">
  <div style="text-align:right"><div style="font:900 120px/.9 'Big Shoulders Display';text-transform:uppercase">Ponte en talla, <span style="color:${C.mamey}">ya.</span></div>
  <div style="font:600 34px Manrope;color:${C['texto-suave']};margin-top:18px">App de fitness hecha para Cuba · Sistema de marca v1 · 2026</div></div>
</div>

<section><h2>Logotipo · versiones</h2><div class="row">
  <div class="panel" style="background:${C.cal};display:flex;align-items:center;justify-content:center;height:420px"><img src="${svgUrl('tallaya-vertical-light.svg')}" style="height:330px"></div>
  <div class="panel" style="background:${C.tinta};display:flex;align-items:center;justify-content:center;height:420px"><img src="${svgUrl('tallaya-vertical-dark.svg')}" style="height:330px"></div>
  <div class="panel" style="background:${C.mamey};display:flex;align-items:center;justify-content:center;height:420px"><img src="${svgUrl('tallaya-mark-mono-dark.svg')}" style="height:330px"></div>
  <div class="panel" style="background:${C.malecon};display:flex;align-items:center;justify-content:center;height:420px"><img src="${svgUrl('tallaya-mark-mono-light.svg')}" style="height:330px"></div>
</div></section>

<section><h2>Paleta · Cuba de noche</h2><div class="grid">${sw}</div></section>

<section><h2>Tipografía</h2><div class="row" style="align-items:flex-start">
  <div class="panel" style="background:${C.malecon}">
    <div style="font:700 26px 'JetBrains Mono';color:${C['texto-suave']}">DISPLAY · BIG SHOULDERS DISPLAY 900</div>
    <div style="font:900 190px/.9 'Big Shoulders Display';text-transform:uppercase;margin-top:20px">Sin datos,<br><span style="color:${C.mamey}">no hay lío.</span></div>
    <div style="font:900 120px 'Big Shoulders Display';color:${C.sol};margin-top:24px">0123456789 kg</div></div>
  <div class="panel" style="background:${C.malecon}">
    <div style="font:700 26px 'JetBrains Mono';color:${C['texto-suave']}">TEXTO · MANROPE 400 · 600 · 800</div>
    <div style="font:800 64px/1.15 Manrope;margin-top:24px">Tu entrenador de bolsillo, hecho para Cuba.</div>
    <div style="font:400 38px/1.5 Manrope;color:${C['texto-suave']};margin-top:24px">Entrena sin conexión y sin gastar megas. Todo se guarda en tu teléfono y se sincroniza cuando cojas WiFi. Áéíóú ñ ¿¡</div>
    <div style="font:700 26px 'JetBrains Mono';color:${C['texto-suave']};margin-top:44px">CÓDIGOS · JETBRAINS MONO 600</div>
    <div style="font:600 44px 'JetBrains Mono';color:${C.turquesa};margin-top:14px">TY-2026-0042 · 950,00 CUP</div></div>
</div></section>

<section><h2>Icono de app · alternativos · favicon</h2><div class="row">${alt}
  <div style="margin-left:auto;display:flex;gap:28px;align-items:flex-end;background:${C.cal};padding:36px;border-radius:32px">
    ${[16, 32, 48, 96].map(s => `<img src="${svgUrl('tallaya-favicon.svg')}" style="width:${s}px">`).join('')}</div>
</div></section>

<section><h2>Onboarding</h2><div class="row" style="gap:40px">${ob}</div></section>
</body></html>`
  return { w, h, html }
}
