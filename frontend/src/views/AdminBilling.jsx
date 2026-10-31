import { useEffect, useState } from 'react'
import { useUI } from '../store/useUI.js'
import { api } from '../lib/api.js'
import { money, STATUS_TITLE } from '../lib/billing.js'
import Icon from '../components/Icon.jsx'
import { Button, Switch, TextField } from '../components/ui.jsx'
import { confirmSheet } from '../sheets.jsx'

/* Cobros de TallaYa: el lado del operador de api/billing. Como el resto del panel de admin, no
   se traduce: lo usa el dueño, en español.

   Todo lo que mueve dinero se decide en el servidor. Aquí se configuran pasarelas, cuentas,
   tasas y planes, se aprueban o rechazan comprobantes y se regalan o quitan días de plan. Los
   secretos nunca vuelven del servidor: solo se ve si están puestos y de dónde salen. */

const toast = m => useUI.getState().toast(m)
const STATUS_ES = { pending: 'Esperando pago', review: 'En revisión', paid: 'Pagado', rejected: 'Rechazado', expired: 'Caducado', cancelled: 'Cancelado' }
const RATE_TITLE = { CUP: 'CUP (Transfermóvil / EnZona)', MLC: 'MLC', CLASICA: 'USD en Clásica', SALDO: 'Saldo móvil (ETECSA)' }
const FIELD_ES = { holder: 'Titular', card: 'Número de tarjeta', phone: 'Teléfono', account: 'Cuenta EnZona / código', note: 'Nota para el cliente' }
const CYCLE_ES = { month: 'Mes', quarter: 'Trimestre', year: 'Año' }
const fmtWhen = ms => (ms ? new Date(ms).toLocaleString() : '–')
const copy = v => navigator.clipboard?.writeText(v).then(() => toast('Copiado'), () => toast(v))

function SecretField({ label, state, value, onChange }) {
  return <label className="adm-field"><span>{label} {state?.set
    ? <span className="adm-pill acc">{state.source === 'env' ? 'puesto (.env)' : 'puesto'}</span>
    : <span className="adm-pill bad">sin poner</span>}</span>
    <TextField type="password" autoComplete="off" value={value ?? ''} placeholder={state?.set ? 'déjalo vacío para no cambiarlo' : ''} onChange={e => onChange(e.target.value)} />
  </label>
}
const Field = ({ label, value, onChange, ...rest }) => <label className="adm-field"><span>{label}</span>
  <TextField value={value ?? ''} onChange={e => onChange(e.target.value)} {...rest} /></label>
const Toggle = ({ label, checked, onChange, sub }) => <div className="row between adm-toggle">
  <div><div className="small" style={{ fontWeight: 600 }}>{label}</div>{sub && <div className="dim" style={{ fontSize: '.75rem' }}>{sub}</div>}</div>
  <Switch checked={!!checked} onChange={onChange} aria-label={label} /></div>
const CopyLine = ({ label, value }) => <button type="button" className="adm-copy" onClick={() => copy(value)}>
  <span className="dim small">{label}</span><span className="mono small">{value}</span><Icon name="copy" /></button>

function RequestSheet({ row, close, onChanged }) {
  const [img, setImg] = useState(null)
  const [reason, setReason] = useState('')
  useEffect(() => { if (row.proof?.image) api('/api/admin/billing/proof?id=' + encodeURIComponent(row.id)).then(d => setImg(d.dataUrl)).catch(() => {}) }, [row.id])
  const decide = action => api('/api/admin/billing/decide', { method: 'POST', body: JSON.stringify({ id: row.id, action, reason }) })
    .then(() => { toast(action === 'approve' ? 'Pago aprobado: el plan está activo' : 'Pago rechazado'); onChanged(); close() })
    .catch(e => toast(e.message))
  const canDecide = row.status === 'review' || row.status === 'pending'
  return <>
    <h3>{row.ref} · {row.userName}</h3>
    <div className="pay-amount">{money(row.amount, row.currency)}</div>
    <div className="small">{row.planName} ({CYCLE_ES[row.cycle] || row.cycle}) · {row.methodLabel} · referencia {row.usd} USD</div>
    <div className="small dim">Creado {fmtWhen(row.createdAt)} · {STATUS_ES[row.status]}{row.paidBy ? ' por ' + (row.paidBy === 'gateway' ? 'la pasarela' : 'el admin') : ''}</div>
    {row.reason && <div className="pay-bad" style={{ marginTop: 8 }}>{row.reason}</div>}
    {row.proof && <div className="card" style={{ marginTop: 10 }}>
      <div className="small"><b>Nº de transacción:</b> <span className="mono">{row.proof.ref}</span></div>
      {row.proof.phone && <div className="small"><b>Teléfono:</b> {row.proof.phone}</div>}
      {row.proof.note && <div className="small"><b>Nota:</b> {row.proof.note}</div>}
      <div className="small dim">Enviado {fmtWhen(row.proof.at)}</div>
      {img && <img src={img} alt="comprobante" style={{ width: '100%', borderRadius: 12, marginTop: 8 }} />}
    </div>}
    {row.gateway?.address && <CopyLine label="Wallet" value={row.gateway.address} />}
    {row.paidRef && <div className="small dim">Referencia del pago: <span className="mono">{row.paidRef}</span></div>}
    {canDecide && <>
      <div style={{ height: 10 }} />
      <Field label="Motivo si lo rechazas (lo ve el cliente)" value={reason} onChange={setReason} />
      <div className="row" style={{ gap: 8 }}>
        <Button variant="primary" icon="checkCircle" onClick={() => confirmSheet({ title: 'Aprobar este pago', message: `Activa ${row.planName} a ${row.userName}. Hazlo solo si el dinero ya está en la cuenta.`, confirmText: 'Aprobar', onConfirm: () => decide('approve') })}>Aprobar</Button>
        <Button className="danger" icon="xmark" onClick={() => decide('reject')}>Rechazar</Button>
      </div>
    </>}
    <div style={{ height: 10 }} />
    <Button onClick={close}>Cerrar</Button>
  </>
}

function PlansEditor({ plans, onSaved }) {
  const [list, setList] = useState(() => plans.map(p => ({ ...p, perksText: (p.perks || []).join('\n') })))
  const upd = (i, patch) => setList(l => l.map((p, k) => (k === i ? { ...p, ...patch } : p)))
  const save = () => api('/api/admin/billing/plans', { method: 'POST', body: JSON.stringify({ plans: list.map(p => ({
    id: p.id, name: p.name, public: p.public !== false, prices: p.prices,
    features: { coach: !!p.features?.coach, coachMonthly: Number(p.features?.coachMonthly) || 0 },
    perks: String(p.perksText || '').split('\n').map(s => s.trim()).filter(Boolean),
  })) }) }).then(d => { toast('Planes guardados'); onSaved(d) }).catch(e => toast(e.message))
  return <>
    {list.map((p, i) => <div key={i} className="adm-plan">
      <div className="row" style={{ gap: 8 }}>
        <Field label="Id" value={p.id} onChange={v => upd(i, { id: v.toLowerCase() })} />
        <Field label="Nombre" value={p.name} onChange={v => upd(i, { name: v })} />
      </div>
      <div className="row" style={{ gap: 8 }}>
        {['month', 'quarter', 'year'].map(c => <Field key={c} label={CYCLE_ES[c] + ' (USD)'} inputMode="decimal" value={p.prices?.[c] ?? ''}
          onChange={v => upd(i, { prices: { ...p.prices, [c]: v === '' ? undefined : v } })} />)}
      </div>
      <Toggle label="Incluye coach IA" checked={p.features?.coach} onChange={v => upd(i, { features: { ...p.features, coach: v } })} />
      <Field label="Mensajes de coach al mes" inputMode="numeric" value={p.features?.coachMonthly ?? 0} onChange={v => upd(i, { features: { ...p.features, coachMonthly: v } })} />
      <Toggle label="Visible para los usuarios" checked={p.public !== false} onChange={v => upd(i, { public: v })} />
      <label className="adm-field"><span>Ventajas (una por línea)</span>
        <textarea className="field area" value={p.perksText} onChange={e => upd(i, { perksText: e.target.value })} /></label>
      <Button size="sm" className="danger" icon="trash" onClick={() => setList(l => l.filter((_, k) => k !== i))}>Quitar plan</Button>
    </div>)}
    <div className="row" style={{ gap: 8 }}>
      <Button size="sm" icon="plus" onClick={() => setList(l => [...l, { id: 'nuevo', name: 'Nuevo plan', prices: { month: 1 }, features: { coach: true, coachMonthly: 60 }, perksText: '', public: true }])}>Añadir plan</Button>
      <Button size="sm" variant="primary" onClick={save}>Guardar planes</Button>
    </div>
    <div className="dim small" style={{ marginTop: 6 }}>Debe quedar un plan sin precios (el gratis). Un precio vacío quita ese periodo.</div>
  </>
}

export default function AdminBilling({ users = [] }) {
  const [d, setD] = useState(null)
  const [patch, setPatch] = useState({})        // lo que el admin está cambiando, por sección
  const [rows, setRows] = useState([])
  const [filter, setFilter] = useState('review')
  const [subs, setSubs] = useState([])
  const [grant, setGrant] = useState({ uid: '', plan: '', days: 30 })
  const [tab, setTab] = useState('requests')
  const openSheet = useUI(s => s.openSheet)

  const load = () => api('/api/admin/billing').then(x => { if (x?.settings) { setD(x); setPatch({}) } }).catch(() => {})
  const loadRows = (f = filter) => api('/api/admin/billing/requests?limit=200' + (f ? '&status=' + f : '')).then(x => setRows(Array.isArray(x?.requests) ? x.requests : [])).catch(() => {})
  const loadSubs = () => api('/api/admin/billing/subs').then(x => setSubs(Array.isArray(x?.subs) ? x.subs : [])).catch(() => {})
  useEffect(() => { load(); loadRows(); loadSubs() }, [])
  // Un servidor sin cobros (o aún cargando) no muestra la tarjeta a medias.
  if (!d) return null

  const s = d.settings
  const get = (path, fallback) => path.split('.').reduce((a, k) => (a == null ? a : a[k]), patch) ?? path.split('.').reduce((a, k) => (a == null ? a : a[k]), s) ?? fallback
  const set = (path, value) => setPatch(p => {
    const next = JSON.parse(JSON.stringify(p))
    const ks = path.split('.'); let a = next
    for (const k of ks.slice(0, -1)) a = a[k] = a[k] || {}
    a[ks[ks.length - 1]] = value
    return next
  })
  const saveSettings = (body = patch) => api('/api/admin/billing/settings', { method: 'POST', body: JSON.stringify(body) })
    .then(x => { setD(x); setPatch({}); toast('Guardado') }).catch(e => toast(e.message))
  // Un secreto vacío no se envía (no cambiarlo); para borrarlo hay un botón aparte.
  const cleanSecrets = body => {
    const out = JSON.parse(JSON.stringify(body))
    for (const [sec, key] of [['qvapay', 'appSecret'], ['miniapp', 'appSecret'], ['trondealer', 'apiKey'], ['trondealer', 'webhookSecret'], ['notify', 'telegramToken']]) {
      if (out[sec] && out[sec][key] === '') delete out[sec][key]
    }
    return out
  }
  const test = gateway => api('/api/admin/billing/test', { method: 'POST', body: JSON.stringify({ gateway }) })
    .then(r => toast(r.ok ? `Conectado${r.name ? ': ' + r.name : ''}` : 'No conecta: ' + r.error)).catch(e => toast(e.message))
  const openRow = row => openSheet(close => <RequestSheet row={row} close={close} onChanged={() => { loadRows(); load(); loadSubs() }} />)
  const pick = f => { setFilter(f); loadRows(f) }
  const paidPlans = d.plans.filter(p => Object.keys(p.prices || {}).length)
  const methods = Object.entries(d.catalog.methods)
  const doGrant = (revoke = false) => api('/api/admin/billing/grant', { method: 'POST', body: JSON.stringify(revoke ? { uid: grant.uid, plan: 'free' } : grant) })
    .then(() => { toast(revoke ? 'Plan quitado' : 'Días añadidos'); loadSubs() }).catch(e => toast(e.message))

  return <div className="card adm-billing">
    <div className="row between"><h2 style={{ margin: 0 }}>Cobros</h2>
      <Switch checked={!!get('enabled')} onChange={v => saveSettings({ enabled: v })} aria-label="Cobros activos" /></div>
    <div className="adm-lead">
      {s.enabled ? 'Los planes de pago están abiertos.' : 'Los cobros están apagados: todo es gratis y el coach IA queda para todos.'} El precio de referencia es en USD y se convierte a CUP, MLC, Clásica y saldo a la tasa del día con tu margen.
    </div>
    <div className="tiles" style={{ marginBottom: 12 }}>
      <div className="tile"><div className="l">En revisión</div><div className="v" style={{ color: d.stats.review ? 'var(--acc)' : undefined }}>{d.stats.review}</div></div>
      <div className="tile"><div className="l">Pendientes</div><div className="v">{d.stats.pending}</div></div>
      <div className="tile"><div className="l">Pagos 30 días</div><div className="v">{d.stats.paid30}</div></div>
      <div className="tile"><div className="l">Planes activos</div><div className="v">{d.stats.activeSubs}</div></div>
    </div>
    {Object.keys(d.stats.income30).length > 0 && <div className="small dim" style={{ marginBottom: 10 }}>Ingresos 30 días: {Object.entries(d.stats.income30).map(([c, v]) => money(v, c)).join(' · ')}</div>}

    <div className="chips" style={{ marginBottom: 12 }}>
      {[['requests', 'Pagos'], ['plans', 'Planes'], ['methods', 'Métodos y cuentas'], ['rates', 'Tasas'], ['gateways', 'Pasarelas y mini-app'], ['subs', 'Suscripciones']].map(([k, l]) =>
        <button key={k} type="button" className={'chip' + (tab === k ? ' on' : '')} onClick={() => setTab(k)}>{l}</button>)}
    </div>

    {tab === 'requests' && <>
      <div className="chips" style={{ marginBottom: 8 }}>
        {[['review', 'En revisión'], ['pending', 'Pendientes'], ['paid', 'Pagados'], ['rejected', 'Rechazados'], ['', 'Todos']].map(([v, l]) =>
          <button key={v} type="button" className={'chip' + (filter === v ? ' on' : '')} onClick={() => pick(v)}>{l}</button>)}
      </div>
      {rows.map(r => <div key={r.id} className="row between adm-reqrow" onClick={() => openRow(r)}>
        <div className="grow"><div className="small" style={{ fontWeight: 600 }}>{r.userName} · {money(r.amount, r.currency)}</div>
          <div className="dim" style={{ fontSize: '.72rem' }}>{r.ref} · {r.planName} ({CYCLE_ES[r.cycle]}) · {r.methodLabel} · {fmtWhen(r.updatedAt)}</div></div>
        <span className={'adm-pill' + (r.status === 'review' ? ' acc' : r.status === 'rejected' ? ' bad' : '')}>{STATUS_ES[r.status] || STATUS_TITLE[r.status]}</span>
      </div>)}
      {!rows.length && <div className="adm-empty">Nada por aquí.</div>}
    </>}

    {tab === 'plans' && <PlansEditor key={JSON.stringify(d.plans)} plans={d.plans} onSaved={setD} />}

    {tab === 'methods' && <>
      <div className="adm-lead">Enciende cada método y rellena sus datos. Uno sin datos o sin pasarela configurada no se muestra a los clientes aunque esté encendido.</div>
      {methods.map(([id, m]) => <div key={id} className="adm-plan">
        <Toggle label={m.label} sub={`${m.currency} · ${m.kind === 'manual' ? 'con comprobante, lo apruebas tú' : 'se confirma solo por webhook'}${d.ready[id] ? ' · listo' : ''}`}
          checked={get(`methods.${id}.enabled`)} onChange={v => set(`methods.${id}.enabled`, v)} />
        <Field label="Mínimo en USD (vacío = el de fábrica)" inputMode="decimal" value={get(`methods.${id}.minUsd`, '')} onChange={v => set(`methods.${id}.minUsd`, v)} />
        {(d.catalog.accountFields[id] || []).map(f => <Field key={f} label={FIELD_ES[f]} value={get(`accounts.${id}.${f}`, '')} onChange={v => set(`accounts.${id}.${f}`, v)} />)}
      </div>)}
      <Button variant="primary" onClick={() => saveSettings({ methods: patch.methods, accounts: patch.accounts })}>Guardar métodos y cuentas</Button>
    </>}

    {tab === 'rates' && <>
      <div className="adm-lead">Tasa del día por moneda (unidades por 1 USD). En automático sigue al mercado; en manual usa la tuya. El margen se suma encima. {d.rates.updatedAt ? 'Mercado actualizado ' + fmtWhen(d.rates.updatedAt) + '.' : 'Sin datos del mercado ahora mismo.'}</div>
      {d.catalog.rateKeys.map(k => <div key={k} className="adm-plan">
        <div className="small" style={{ fontWeight: 700 }}>{RATE_TITLE[k]}</div>
        <div className="small dim">Mercado: {d.rates.market[k] ?? '–'} · En uso: {d.rates.effective[k] ?? '–'} {d.rates.sources[k] ? `(${d.rates.sources[k] === 'manual' ? 'manual' : 'mercado'})` : '(sin tasa: esos métodos no se ofrecen)'}</div>
        <Toggle label="Tasa manual" checked={get(`rates.${k}.mode`) === 'manual'} onChange={v => set(`rates.${k}.mode`, v ? 'manual' : 'auto')} />
        <div className="row" style={{ gap: 8 }}>
          <Field label="Tasa manual" inputMode="decimal" value={get(`rates.${k}.manual`, '')} onChange={v => set(`rates.${k}.manual`, v)} />
          <Field label="Margen %" inputMode="decimal" value={get(`rates.${k}.markupPct`, 0)} onChange={v => set(`rates.${k}.markupPct`, v)} />
        </div>
      </div>)}
      <Button variant="primary" onClick={() => saveSettings({ rates: patch.rates })}>Guardar tasas</Button>
    </>}

    {tab === 'gateways' && <>
      <h3 className="adm-h3">QvaPay (saldo, PayPal y tarjeta)</h3>
      <div className="adm-lead">Crea una App en qvapay.com → Apps y pega aquí su App ID y su App secret. El saldo QvaPay va por factura; PayPal y tarjeta van por topup con su coin. Pon esta URL como Callback de la App:</div>
      <CopyLine label="Webhook QvaPay" value={d.webhooks.qvapay} />
      <Field label="App ID" value={get('qvapay.appId', '')} onChange={v => set('qvapay.appId', v)} />
      <SecretField label="App secret" state={s.qvapay.appSecret} value={patch.qvapay?.appSecret} onChange={v => set('qvapay.appSecret', v)} />
      <div className="row" style={{ gap: 8 }}>
        <Field label="Coin de PayPal" value={get('qvapay.paypalCoin', 'PYPAL')} onChange={v => set('qvapay.paypalCoin', v)} />
        <Field label="Coin de tarjeta" value={get('qvapay.cardCoin', 'CARD')} onChange={v => set('qvapay.cardCoin', v)} />
      </div>
      <Toggle label="La comisión de tarjeta la paga el cliente" sub="Si lo apagas, la comisión se descuenta de lo que recibes" checked={get('qvapay.cardFeeMode') !== 'included'} onChange={v => set('qvapay.cardFeeMode', v ? 'on_top' : 'included')} />
      <div className="row" style={{ gap: 8 }}>
        <Button size="sm" variant="primary" onClick={() => saveSettings(cleanSecrets({ qvapay: patch.qvapay }))}>Guardar QvaPay</Button>
        <Button size="sm" onClick={() => test('qvapay')}>Probar conexión</Button>
        {s.qvapay.appSecret?.source === 'admin' && <Button size="sm" className="danger" onClick={() => saveSettings({ qvapay: { appSecret: null } })}>Borrar secret</Button>}
      </div>

      <h3 className="adm-h3">Mini-app de QvaPay</h3>
      <div className="adm-lead">Entrada y registro de usuarios desde la app de QvaPay, y pago con su saldo sin salir. En el panel de la mini-app pon esta URL de entrada, el origen permitido https://{new URL(d.miniappUrl).host} y el scope profile:</div>
      <CopyLine label="URL de la mini-app" value={d.miniappUrl} />
      <Toggle label="Mini-app activa" checked={get('miniapp.enabled')} onChange={v => set('miniapp.enabled', v)} />
      <Toggle label="Crear el perfil si el usuario de QvaPay no tiene uno" checked={get('miniapp.allowSignup')} onChange={v => set('miniapp.allowSignup', v)} />
      <Field label="UUID de la App (app_uuid)" value={get('miniapp.appUuid', '')} onChange={v => set('miniapp.appUuid', v)} />
      <Field label="App ID de la mini-app (vacío = la App principal)" value={get('miniapp.appId', '')} onChange={v => set('miniapp.appId', v)} />
      <SecretField label="App secret de la mini-app" state={s.miniapp.appSecret} value={patch.miniapp?.appSecret} onChange={v => set('miniapp.appSecret', v)} />
      <div className="row" style={{ gap: 8 }}>
        <Button size="sm" variant="primary" onClick={() => saveSettings(cleanSecrets({ miniapp: patch.miniapp }))}>Guardar mini-app</Button>
        <Button size="sm" onClick={() => test('miniapp')}>Probar conexión</Button>
      </div>

      <h3 className="adm-h3">Cripto (TronDealer)</h3>
      <div className="adm-lead">USDT y USDC. Cada pago recibe su propia wallet y se confirma por webhook firmado. En TronDealer pon este webhook y el mismo secreto que guardes aquí:</div>
      <CopyLine label="Webhook TronDealer" value={d.webhooks.trondealer} />
      <Toggle label="Cripto activo" checked={get('trondealer.enabled')} onChange={v => set('trondealer.enabled', v)} />
      <SecretField label="API key" state={s.trondealer.apiKey} value={patch.trondealer?.apiKey} onChange={v => set('trondealer.apiKey', v)} />
      <SecretField label="Secreto del webhook" state={s.trondealer.webhookSecret} value={patch.trondealer?.webhookSecret} onChange={v => set('trondealer.webhookSecret', v)} />
      <div className="small" style={{ fontWeight: 600, margin: '8px 0 4px' }}>Redes</div>
      <div className="chips">{Object.entries(d.catalog.networks).map(([n, info]) => {
        const on = get('trondealer.networks', []).includes(n)
        return <button key={n} type="button" className={'chip' + (on ? ' on' : '')} onClick={() => set('trondealer.networks', on ? get('trondealer.networks', []).filter(x => x !== n) : [...get('trondealer.networks', []), n])}>{info.label}</button>
      })}</div>
      <div className="chips" style={{ marginTop: 6 }}>{['USDT', 'USDC'].map(a => {
        const on = get('trondealer.assets', []).includes(a)
        return <button key={a} type="button" className={'chip' + (on ? ' on' : '')} onClick={() => set('trondealer.assets', on ? get('trondealer.assets', []).filter(x => x !== a) : [...get('trondealer.assets', []), a])}>{a}</button>
      })}</div>
      <div style={{ height: 8 }} />
      <Button size="sm" variant="primary" onClick={() => saveSettings(cleanSecrets({ trondealer: patch.trondealer }))}>Guardar cripto</Button>

      <h3 className="adm-h3">Avisos por Telegram</h3>
      <div className="adm-lead">Un mensaje por cada comprobante nuevo y cada pago confirmado.</div>
      <SecretField label="Token del bot" state={s.notify.telegramToken} value={patch.notify?.telegramToken} onChange={v => set('notify.telegramToken', v)} />
      <Field label="Chat ID" value={get('notify.telegramChatId', '')} onChange={v => set('notify.telegramChatId', v)} />
      <Button size="sm" variant="primary" onClick={() => saveSettings(cleanSecrets({ notify: patch.notify }))}>Guardar avisos</Button>

      <h3 className="adm-h3">Plazos</h3>
      <div className="row" style={{ gap: 8 }}>
        <Field label="Horas para pagar" inputMode="numeric" value={get('pendingHours', 48)} onChange={v => set('pendingHours', v)} />
        <Field label="Días de prueba" inputMode="numeric" value={get('trialDays', 0)} onChange={v => set('trialDays', v)} />
      </div>
      <Button size="sm" onClick={() => saveSettings({ pendingHours: patch.pendingHours, trialDays: patch.trialDays })}>Guardar plazos</Button>
    </>}

    {tab === 'subs' && <>
      <div className="adm-lead">Quién tiene plan ahora. Desde aquí regalas días o quitas un plan (por ejemplo, tras un reembolso).</div>
      {subs.map(x => <div key={x.uid} className="row between adm-reqrow">
        <div className="grow"><div className="small" style={{ fontWeight: 600 }}>{x.userName}</div>
          <div className="dim" style={{ fontSize: '.72rem' }}>{x.current ? `${d.plans.find(p => p.id === x.current.plan)?.name || x.current.plan} hasta ${new Date(x.current.end).toLocaleDateString()}` : 'en cola'}{x.queue.length ? ` · ${x.queue.length} en cola` : ''}</div></div>
      </div>)}
      {!subs.length && <div className="adm-empty">Nadie tiene plan de pago todavía.</div>}
      <h3 className="adm-h3">Dar o quitar días</h3>
      <label className="adm-field"><span>Usuario</span>
        <select className="field" value={grant.uid} onChange={e => setGrant(g => ({ ...g, uid: e.target.value }))}>
          <option value="">Elige…</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select></label>
      <label className="adm-field"><span>Plan</span>
        <select className="field" value={grant.plan} onChange={e => setGrant(g => ({ ...g, plan: e.target.value }))}>
          <option value="">Elige…</option>
          {paidPlans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select></label>
      <Field label="Días" inputMode="numeric" value={grant.days} onChange={v => setGrant(g => ({ ...g, days: v }))} />
      <div className="row" style={{ gap: 8 }}>
        <Button size="sm" variant="primary" disabled={!grant.uid || !grant.plan} onClick={() => doGrant(false)}>Dar días</Button>
        <Button size="sm" className="danger" disabled={!grant.uid} onClick={() => confirmSheet({ title: 'Quitar el plan', message: 'El usuario vuelve al plan gratis ahora mismo, sin los días que le quedaban.', confirmText: 'Quitar', danger: true, onConfirm: () => doGrant(true) })}>Quitar plan</Button>
      </div>
    </>}
  </div>
}
