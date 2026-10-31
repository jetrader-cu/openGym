// Plans and payments, the pure part (views/Plans.jsx draws it). Amounts arrive from the server as
// strings already rounded the way they are paid; here they are only grouped and formatted.

export const CURRENCY_ORDER = ['USD', 'CUP', 'MLC', 'SALDO']

// English keys for t(): the label of each currency group and of each request status.
export const CURRENCY_TITLE = {
  USD: 'Pay in USD',
  CUP: 'Pay in CUP',
  MLC: 'Pay in MLC',
  SALDO: 'Pay with mobile balance',
}
export const STATUS_TITLE = {
  pending: 'Waiting for your payment',
  review: 'Receipt under review',
  paid: 'Paid',
  rejected: 'Rejected',
  expired: 'Expired',
  cancelled: 'Cancelled',
}
export const CYCLE_TITLE = { month: '1 month', quarter: '3 months', year: '1 year' }

/** The open methods grouped by the currency they charge in, groups in a fixed order. */
export function groupMethods(methods) {
  const by = {}
  for (const m of methods || []) (by[m.currency] = by[m.currency] || []).push(m)
  return CURRENCY_ORDER.filter(c => by[c]?.length).map(currency => ({ currency, methods: by[currency] }))
}

/** "1 040 CUP", "4.99 USD", "1 200 CUP saldo": what the user transfers, as they read it. */
export function money(amount, currency) {
  const n = Number(amount)
  if (!Number.isFinite(n)) return '–'
  const whole = currency === 'CUP' || currency === 'SALDO'
  const [int, dec] = (whole ? String(Math.round(n)) : n.toFixed(2)).split('.')
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  const unit = currency === 'SALDO' ? 'CUP saldo' : currency
  return (dec ? grouped + '.' + dec : grouped) + ' ' + unit
}

/** How much cheaper a period is than paying month by month, in whole percent (0 when not). */
export function savingPct(prices, cycle) {
  const month = Number(prices?.month?.usd)
  const p = prices?.[cycle]
  if (!month || !p || cycle === 'month') return 0
  const months = Math.round(p.days / 30)
  const full = month * months
  return full > 0 ? Math.max(0, Math.round((1 - Number(p.usd) / full) * 100)) : 0
}

/** The price of one plan and period in the currency of one method, or null. */
export function priceIn(plan, cycle, methodId) {
  return plan?.prices?.[cycle]?.methods?.[methodId] || null
}

/** The lowest amount a currency group asks for a plan and period: what the card shows. */
export function fromPrice(plan, cycle, group) {
  let best = null
  for (const m of group?.methods || []) {
    const p = priceIn(plan, cycle, m.id)
    if (p && !p.tooSmall && (!best || Number(p.amount) < Number(best.amount))) best = p
  }
  return best
}

/** Days left on a plan that ends at `end` (ms), never below zero. */
export function daysLeft(end, now = Date.now()) {
  return Math.max(0, Math.ceil((end - now) / 86400000))
}

export const OPEN_STATUSES = new Set(['pending', 'review', 'rejected'])
