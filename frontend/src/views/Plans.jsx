// Plans and payments: the plan in force, the plans on offer priced in the currency the user picks,
// and the payment flow for each method. The server decides every amount (api/billing); this screen
// only shows it. Automatic methods are confirmed by the server's webhook, never here: after paying,
// the screen just reloads to see whether the confirmation has arrived.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { api, remoteAuth } from '../lib/api.js'
import { MOBILE } from '../lib/mobile.js'
import { t } from '../lib/i18n.js'
import {
  CYCLE_TITLE, CURRENCY_TITLE, STATUS_TITLE, OPEN_STATUSES, daysLeft, fromPrice, groupMethods, money, priceIn, savingPct,
} from '../lib/billing.js'
import { inMiniApp, openExternal, payInvoice, requestLogin } from '../lib/miniapp.js'
import { confirmSheet } from '../sheets.jsx'
import Icon from '../components/Icon.jsx'
import { Button, Section, Row, Segmented } from '../components/ui.jsx'
import { ConnectSheet } from './MobileOnboarding.jsx'

const toast = m => useUI.getState().toast(m)
const fmtDay = ms => new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })

const copy = value => {
  navigator.clipboard?.writeText(String(value)).then(() => toast(t('Copied')), () => toast(String(value)))
}

// A receipt photo, made small enough to send over mobile data: longest side 1600 px, JPEG.
async function photoData(file) {
  const raw = await new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
  try {
    const img = await new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = raw })
    const k = Math.min(1, 1600 / Math.max(img.width, img.height))
    const c = document.createElement('canvas')
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k)
    const ctx = c.getContext('2d')
    if (!ctx) return raw
    ctx.drawImage(img, 0, 0, c.width, c.height)
    return c.toDataURL('image/jpeg', 0.8)
  } catch { return raw }
}

const FIELD_TITLE = { holder: 'Holder', card: 'Card number', phone: 'Phone', account: 'EnZona account', note: 'Note' }

function AccountBox({ request }) {
  const a = request.account || {}
  return <div className="pay-box">
    {['card', 'phone', 'account', 'holder'].filter(f => a[f]).map(f => (
      <button key={f} type="button" className="pay-field" onClick={() => copy(a[f])}>
        <span className="pay-k">{t(FIELD_TITLE[f])}</span>
        <span className="pay-v mono">{a[f]}</span>
        <Icon name="copy" />
      </button>
    ))}
    {a.note && <div className="small dim" style={{ marginTop: 6 }}>{a.note}</div>}
  </div>
}

function ProofForm({ request, onDone }) {
  const [ref, setRef] = useState(request.proof?.ref || '')
  const [phone, setPhone] = useState(request.proof?.phone || '')
  const [note, setNote] = useState('')
  const [image, setImage] = useState(null)
  const [busy, setBusy] = useState(false)
  const pick = async e => {
    const f = e.target.files?.[0]
    if (!f) return
    try { setImage(await photoData(f)) } catch { toast(t('Could not read that photo')) }
  }
  const send = async () => {
    if (ref.trim().length < 4) { toast(t('Write the transaction number of your transfer')); return }
    setBusy(true)
    try {
      const r = await api('/api/billing/proof', { method: 'POST', body: JSON.stringify({ id: request.id, ref, phone, note, image }) })
      toast(t('Receipt sent. We will confirm it soon.'))
      onDone(r.request)
    } catch (e) { toast(e.message) } finally { setBusy(false) }
  }
  return <div className="pay-proof">
    <label className="pay-lbl"><span>{t('Transaction number')}</span>
      <input className="field" value={ref} onChange={e => setRef(e.target.value)} placeholder="TMS123456789" autoComplete="off" /></label>
    <label className="pay-lbl"><span>{t('Phone you paid from (optional)')}</span>
      <input className="field" value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" /></label>
    <label className="pay-lbl"><span>{t('Note (optional)')}</span>
      <input className="field" value={note} onChange={e => setNote(e.target.value)} /></label>
    <input id={'proof-' + request.id} type="file" accept="image/*" className="sr-only" onChange={pick} />
    <Button icon="camera" onClick={() => document.getElementById('proof-' + request.id)?.click()}>
      {image ? t('Photo ready, change it') : t('Add a screenshot (optional)')}</Button>
    <div style={{ height: 10 }} />
    <Button variant="primary" onClick={send} disabled={busy}>{busy ? t('Sending…') : t('Send receipt')}</Button>
  </div>
}

export function PaymentSheet({ request: first, close, onChange }) {
  const [r, setR] = useState(first)
  const update = next => { setR(next); onChange?.() }
  const reload = () => api('/api/billing/request?id=' + encodeURIComponent(r.id)).then(d => update(d.request)).catch(e => toast(e.message))
  const cancel = () => confirmSheet({
    title: t('Cancel this payment?'), message: t('Only if you have not paid yet.'), confirmText: t('Cancel payment'), danger: true,
    onConfirm: () => api('/api/billing/cancel', { method: 'POST', body: JSON.stringify({ id: r.id }) }).then(d => update(d.request)).catch(e => toast(e.message)),
  })
  const payHere = async () => {
    try {
      const paid = await payInvoice(r.gateway.uuid)
      if (paid) { toast(t('Paid. Your plan turns on in a moment.')); setTimeout(reload, 2500) }
    } catch (e) { toast(e.message) }
  }
  const head = <>
    <h3>{r.planName} · {t(CYCLE_TITLE[r.cycle] || r.cycle)}</h3>
    <div className="pay-amount">{money(r.amount, r.currency)}</div>
    <div className="small dim">{r.methodLabel} · {t('Reference')} <b className="mono">{r.ref}</b> · {t(STATUS_TITLE[r.status] || r.status)}</div>
  </>
  let body = null
  if (r.status === 'paid') body = <div className="pay-ok"><Icon name="checkCircle" /> {t('Payment confirmed. Your plan is on.')}</div>
  else if (r.status === 'expired' || r.status === 'cancelled') body = <div className="small dim">{t('This payment is closed. Start a new one from the plans.')}</div>
  else if (r.kind === 'manual') {
    body = <>
      {r.status === 'rejected' && <div className="pay-bad">{t('Rejected')}: {r.reason}</div>}
      {r.status === 'review'
        ? <div className="small">{t('We have your receipt and are checking it. You will see the plan on as soon as it is confirmed.')}</div>
        : <>
          <p className="small">{r.currency === 'SALDO'
            ? t('Transfer exactly {0} of mobile balance to this number, then send the receipt below.', money(r.amount, r.currency))
            : t('Transfer exactly {0} to this account. Write the reference {1} in the note if your bank lets you, then send the receipt below.', money(r.amount, r.currency), r.ref)}</p>
          <AccountBox request={r} />
        </>}
      {(r.status === 'pending' || r.status === 'rejected') && <ProofForm request={r} onDone={update} />}
    </>
  } else if (r.kind === 'crypto') {
    body = <>
      <p className="small">{t('Send exactly {0} {1} on the {2} network to this address. It is confirmed by itself after a few confirmations.', r.amount, r.gateway?.asset, r.gateway?.network?.toUpperCase())}</p>
      <button type="button" className="pay-field" onClick={() => copy(r.gateway?.address)}>
        <span className="pay-v mono" style={{ wordBreak: 'break-all' }}>{r.gateway?.address}</span><Icon name="copy" /></button>
      <div className="small dim" style={{ marginTop: 8 }}>{t('Another network or coin is lost money: check both before sending.')}</div>
    </>
  } else {
    body = <>
      <p className="small">{t('Pay on the secure page. When it is done, your plan turns on by itself.')}</p>
      {r.gateway?.miniapp
        ? <Button variant="primary" icon="checkCircle" onClick={payHere}>{t('Pay now')}</Button>
        : r.gateway?.url && <Button variant="primary" trailingIcon="chevronRight" onClick={() => openExternal(r.gateway.url)}>{t('Open the payment page')}</Button>}
    </>
  }
  return <>
    {head}
    <div style={{ height: 12 }} />
    {body}
    <div style={{ height: 14 }} />
    <div className="row" style={{ gap: 8 }}>
      {OPEN_STATUSES.has(r.status) && <Button size="sm" icon="reset" onClick={reload}>{t('Check again')}</Button>}
      {r.status === 'pending' && <Button size="sm" variant="ghost" className="danger" onClick={cancel}>{t('Cancel payment')}</Button>}
      <div className="grow" />
      <Button size="sm" onClick={close}>{t('Done')}</Button>
    </div>
  </>
}

function MethodSheet({ plan, cycle, catalog, close, onCreated }) {
  const [busy, setBusy] = useState(null)
  const [crypto, setCrypto] = useState(null)       // { network, asset } while choosing
  const mini = inMiniApp()
  const groups = groupMethods(catalog.methods.filter(m => m.available))
  const start = async (method, extra = {}) => {
    setBusy(method)
    try {
      const r = await api('/api/billing/checkout', { method: 'POST', body: JSON.stringify({ plan: plan.id, cycle, method, miniapp: method === 'qvapay' && mini, ...extra }) })
      close()
      onCreated(r.request)
    } catch (e) { toast(e.message) } finally { setBusy(null) }
  }
  if (crypto) {
    const net = catalog.crypto.find(n => n.id === crypto.network) || catalog.crypto[0]
    return <>
      <h3>{t('Pay with crypto')}</h3>
      <div className="small dim" style={{ marginBottom: 10 }}>{money(plan.prices[cycle].usd, 'USD')} · {t('Stablecoins only, 1 coin = 1 USD.')}</div>
      <div className="chips" role="radiogroup" aria-label={t('Network')}>
        {catalog.crypto.map(n => <button key={n.id} type="button" className={'chip' + (n.id === net.id ? ' on' : '')} onClick={() => setCrypto({ network: n.id, asset: n.assets.includes(crypto.asset) ? crypto.asset : n.assets[0] })}>{n.label}</button>)}
      </div>
      <div className="chips" role="radiogroup" aria-label={t('Coin')} style={{ marginTop: 8 }}>
        {net.assets.map(a => <button key={a} type="button" className={'chip' + (a === crypto.asset ? ' on' : '')} onClick={() => setCrypto({ network: net.id, asset: a })}>{a}</button>)}
      </div>
      <div style={{ height: 14 }} />
      <Button variant="primary" disabled={!!busy} onClick={() => start('crypto', { network: net.id, asset: crypto.asset || net.assets[0] })}>{busy ? t('One moment…') : t('Get the address')}</Button>
    </>
  }
  return <>
    <h3>{plan.name} · {t(CYCLE_TITLE[cycle])}</h3>
    <div className="small dim" style={{ marginBottom: 6 }}>{t('Choose how you pay. The amount is at today’s rate and stays fixed for this payment.')}</div>
    {groups.map(g => <Section key={g.currency} title={t(CURRENCY_TITLE[g.currency])}>
      {g.methods.map(m => {
        const p = priceIn(plan, cycle, m.id)
        const small = p?.tooSmall
        return <Row key={m.id} title={m.label} subtitle={small ? t('From {0} USD: pick a longer period', m.minUsd) : null}
          value={p ? money(p.amount, p.currency) : '–'} accessory={small ? 'none' : 'chevron'}
          className={small ? 'disabled' : ''}
          onClick={small || busy ? undefined : () => (m.id === 'crypto' ? setCrypto({ network: catalog.crypto[0]?.id, asset: catalog.crypto[0]?.assets[0] }) : start(m.id))} />
      })}
    </Section>)}
    {!groups.length && <div className="small dim">{t('No payment method is open right now.')}</div>}
  </>
}

export default function Plans() {
  const nav = useNavigate()
  const user = useStore(s => s.user)
  const openSheet = useUI(s => s.openSheet)
  const [catalog, setCatalog] = useState(null)
  const [me, setMe] = useState(null)
  const [err, setErr] = useState(null)
  const [cycle, setCycle] = useState('quarter')
  const [currency, setCurrency] = useState(null)
  const offline = MOBILE && !remoteAuth()

  const load = () => {
    if (offline || !user) return
    Promise.all([api('/api/billing/plans'), api('/api/billing/me')])
      .then(([c, m]) => { setCatalog(c); setMe(m); setErr(null) })
      .catch(e => setErr(e.message))
  }
  useEffect(load, [user?.id, offline])

  const linkQvaPay = async () => {
    try {
      const init_data = await requestLogin()
      await api('/api/miniapp/link', { method: 'POST', body: JSON.stringify({ init_data }) })
      toast(t('QvaPay account linked'))
      load()
    } catch (e) { if (e?.code !== 'USER_CANCELLED') toast(e.message) }
  }
  const openPayment = r => openSheet(close => <PaymentSheet request={r} close={close} onChange={load} />)
  const choose = plan => openSheet(close => <MethodSheet plan={plan} cycle={cycle} catalog={catalog} close={close}
    onCreated={r => { load(); openPayment(r) }} />)

  const header = <div className="hdr">
    <button className="iconbtn" data-back="/settings" onClick={() => nav('/settings')} aria-label={t('Back')}><Icon name="chevronLeft" /></button>
    <div style={{ flex: 1, marginInlineStart: 12 }}><h1 style={{ margin: 0 }}>{t('Plans')}</h1></div>
  </div>

  if (offline || !user) return <div className="narrow">{header}
    <div className="card">
      <h2 style={{ marginTop: 0 }}>{t('Plans need your TallaYa account')}</h2>
      <p className="small dim">{t('Your training stays on this phone either way. To get a plan, connect the phone to your TallaYa account.')}</p>
      {offline && <Button variant="primary" icon="cloud" onClick={() => openSheet(close => <ConnectSheet close={close} />)}>{t('Connect my account')}</Button>}
    </div>
  </div>

  if (err && !catalog) return <div className="narrow">{header}<div className="card" role="alert">{err} <Button size="sm" onClick={load}>{t('Try again')}</Button></div></div>
  if (!catalog || !me) return <div className="narrow">{header}<div className="muted small" style={{ padding: 20 }}>{t('Loading…')}</div></div>

  const groups = groupMethods(catalog.methods.filter(m => m.available))
  const cur = groups.find(g => g.currency === currency) || groups[0] || null
  const paid = catalog.plans.filter(p => Object.keys(p.prices).length)
  const cycles = catalog.cycles.filter(c => paid.some(p => p.prices[c]))
  const open = me.requests.filter(r => OPEN_STATUSES.has(r.status))
  const past = me.requests.filter(r => !OPEN_STATUSES.has(r.status)).slice(0, 10)

  return <div className="narrow plans">
    {header}

    <div className="card plan-now">
      <div className="small dim">{t('Your plan')}</div>
      <div className="plan-now-name">{me.plan.name}</div>
      {me.current
        ? <div className="small">{t('Until {0} · {1} days left', fmtDay(me.current.end), daysLeft(me.current.end))}</div>
        : <div className="small dim">{t('Free forever. Upgrade when you want more.')}</div>}
      {me.queue.map((q, i) => <div key={i} className="small dim">{t('Then {0}: {1} days', q.planName, q.days)}</div>)}
      {me.qvapay
        ? <div className="small dim" style={{ marginTop: 6 }}>{t('Linked to QvaPay')}{me.qvapay.username ? ' · @' + me.qvapay.username : ''}</div>
        : inMiniApp() && <div style={{ marginTop: 10 }}><Button size="sm" icon="link" onClick={linkQvaPay}>{t('Link my QvaPay account')}</Button></div>}
    </div>

    {open.length > 0 && <Section title={t('Payments in progress')}>
      {open.map(r => <Row key={r.id} icon={r.status === 'rejected' ? 'warning' : 'clock'} iconTint={r.status === 'rejected' ? 'var(--red)' : 'var(--orange)'}
        title={`${r.planName} · ${money(r.amount, r.currency)}`} subtitle={`${r.methodLabel} · ${t(STATUS_TITLE[r.status])}`} accessory="chevron" onClick={() => openPayment(r)} />)}
    </Section>}

    {!catalog.enabled ? <div className="card"><h2 style={{ marginTop: 0 }}>{t('Paid plans open soon')}</h2>
      <p className="small dim">{t('Everything you see is free for now. When the plans open, you will pay in CUP, MLC or USD with the method you already use.')}</p></div> : <>
      <Segmented className="plans-cycles" value={cycle} onChange={setCycle} options={cycles.map(c => {
        const save = Math.max(0, ...paid.map(p => savingPct(p.prices, c)))
        return { value: c, label: t(CYCLE_TITLE[c]) + (save > 0 ? ` −${save}%` : '') }
      })} />
      {groups.length > 1 && <div className="chips plans-cur" role="radiogroup" aria-label={t('Currency')}>
        {groups.map(g => <button key={g.currency} type="button" className={'chip' + (g === cur ? ' on' : '')} onClick={() => setCurrency(g.currency)}>{g.currency === 'SALDO' ? t('Mobile balance') : g.currency}</button>)}
      </div>}

      {catalog.plans.map(p => {
        const has = !!p.prices[cycle]
        const from = cur && has ? fromPrice(p, cycle, cur) : null
        const isNow = p.id === me.plan.id
        return <div key={p.id} className={'card plan-card' + (isNow ? ' now' : '')}>
          <div className="row between">
            <h2 style={{ margin: 0 }}>{p.name}</h2>
            {isNow && <span className="plan-pill">{t('Current')}</span>}
          </div>
          <div className="plan-price">
            {!Object.keys(p.prices).length ? t('Free')
              : from ? money(from.amount, from.currency)
              : has ? money(p.prices[cycle].usd, 'USD') : '–'}
            {has && <span className="small dim"> / {t(CYCLE_TITLE[cycle])}</span>}
          </div>
          {has && cur && cur.currency !== 'USD' && <div className="small dim">{t('Reference price {0}', money(p.prices[cycle].usd, 'USD'))}</div>}
          <ul className="plan-perks">{p.perks.map((x, i) => <li key={i}><Icon name="check" /> {x}</li>)}</ul>
          {has && <Button variant={p.rank > 0 ? 'primary' : 'plain'} onClick={() => choose(p)}>{isNow ? t('Add more time') : t('Choose {0}', p.name)}</Button>}
        </div>
      })}
      <div className="small dim" style={{ padding: '0 6px 12px' }}>{t('Prices in CUP, MLC and mobile balance follow today’s rate. Each payment keeps the amount it was created with.')}</div>
    </>}

    {past.length > 0 && <Section title={t('Payment history')}>
      {past.map(r => <Row key={r.id} title={`${r.planName} · ${money(r.amount, r.currency)}`} subtitle={`${new Date(r.updatedAt).toLocaleDateString()} · ${r.methodLabel}`}
        value={t(STATUS_TITLE[r.status])} accessory="chevron" onClick={() => openPayment(r)} />)}
    </Section>}
  </div>
}
