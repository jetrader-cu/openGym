// The QvaPay mini-app bridge. Inside the QvaPay app, `window.QvaPay` is injected before the page
// loads (in the panel's simulator, sdk-sim.js defines it). In a plain browser or the TallaYa app
// it does not exist, and every helper here answers "not in the mini-app" without breaking.
//
// Security (QvaPay MiniApps docs): init_data goes to the server untouched and is verified there;
// payInvoice only drives the screen, the plan is activated by the signed webhook alone.

export const SDK_SIM_URL = 'https://www.qvapay.com/miniapps/sdk-sim.js'

export const sdk = (w = globalThis.window) => (w && w.QvaPay && typeof w.QvaPay === 'object' ? w.QvaPay : null)

/** Opened inside QvaPay: the SDK is there, or the page was opened at /miniapp. */
export function inMiniApp(w = globalThis.window) {
  if (sdk(w)) return true
  try { return /\/miniapp\/?$/.test(w?.location?.pathname || '') } catch { return false }
}

/** Waits for the SDK the simulator injects late; null after `ms` without it. */
export function whenSdk(ms = 3000, w = globalThis.window) {
  if (sdk(w)) return Promise.resolve(sdk(w))
  if (!w || typeof w.addEventListener !== 'function') return Promise.resolve(null)
  return new Promise(resolve => {
    const done = () => { clearTimeout(timer); resolve(sdk(w)) }
    const timer = setTimeout(() => { w.removeEventListener('qvapay:ready', done); resolve(sdk(w)) }, ms)
    w.addEventListener('qvapay:ready', done, { once: true })
  })
}

/** In the QvaPay panel's simulator (an iframe on /miniapp) the SDK comes from sdk-sim.js, which
 *  does nothing anywhere else. Loaded only there: the /miniapp page's own policy allows it. */
export function loadSimulator(w = globalThis.window) {
  try {
    if (sdk(w) || !/\/miniapp\/?$/.test(w.location.pathname) || w.top === w) return false
    const d = w.document
    if (d.querySelector(`script[src="${SDK_SIM_URL}"]`)) return false
    const el = d.createElement('script'); el.src = SDK_SIM_URL; el.async = true
    d.head.appendChild(el)
    return true
  } catch { return false }
}

/** Hides QvaPay's native loader. Safe to call any number of times, anywhere. */
export function miniReady(w = globalThis.window) {
  try { sdk(w)?.ready?.() } catch { /* outside the app */ }
}

/** The signed identity of the QvaPay user, to send to POST /api/miniapp/login as it is. */
export async function requestLogin(w = globalThis.window) {
  const q = sdk(w) || await whenSdk(3000, w)
  if (!q?.auth?.requestLogin) throw Object.assign(new Error('not in the QvaPay app'), { code: 'NO_SDK' })
  const r = await q.auth.requestLogin({ scopes: ['profile'] })
  if (!r || typeof r.init_data !== 'string') throw Object.assign(new Error('QvaPay gave no identity'), { code: 'FAILED' })
  return r.init_data
}

/** Pays an invoice from the user's QvaPay balance. Resolves true when paid, false when they closed it. */
export async function payInvoice(uuid, w = globalThis.window) {
  const q = sdk(w)
  if (!q?.payments?.payInvoice) throw Object.assign(new Error('not in the QvaPay app'), { code: 'NO_SDK' })
  try {
    const r = await q.payments.payInvoice(uuid)
    return r?.status === 'paid'
  } catch (e) {
    if (e && e.code === 'USER_CANCELLED') return false
    throw e
  }
}

/** A link outside the mini-app: QvaPay's openLink in the app, a new tab elsewhere. */
export function openExternal(url, w = globalThis.window) {
  const q = sdk(w)
  if (q?.openLink) { try { q.openLink(url); return } catch { /* fall through */ } }
  w?.open?.(url, '_blank', 'noopener')
}
