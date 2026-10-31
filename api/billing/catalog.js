/* TallaYa billing: the pure rules. No I/O here, so every decision about money has a unit test.
 *
 * The price of a plan lives in USD. Every other currency is that price at the day's market rate
 * (rates.js) plus the admin's margin, rounded up to an amount people actually transfer. The same
 * model as QvaArbi: what the user pays is frozen on the payment request, never re-read later.
 */

/* ---------- payment methods ---------- */
// `kind`: how the money is confirmed.
//   invoice  QvaPay invoice paid from the user's QvaPay balance; the signed webhook confirms it.
//   topup    QvaPay top-up with a pay_method coin (PayPal, card); the signed webhook confirms it.
//   crypto   TronDealer wallet (USDT/USDC); its signed webhook confirms it.
//   manual   Transfermóvil / EnZona / mobile balance: the user sends a receipt, an admin approves.
// `currency` is what the user pays in: USD, CUP, MLC or SALDO (ETECSA mobile balance, in CUP).
// `rate` names the market the price is converted with (USD methods paid with the Clásica card
// trade at their own rate; the gateways in USD are 1:1).
export const METHODS = Object.freeze({
  qvapay: { currency: 'USD', kind: 'invoice', rate: null, label: 'Saldo QvaPay', minUsd: 0.5 },
  paypal: { currency: 'USD', kind: 'topup', rate: null, label: 'PayPal', minUsd: 2, coin: 'paypalCoin' },
  card: { currency: 'USD', kind: 'topup', rate: null, label: 'Tarjeta de crédito o débito', minUsd: 2, coin: 'cardCoin' },
  crypto: { currency: 'USD', kind: 'crypto', rate: null, label: 'Cripto (USDT / USDC)', minUsd: 1 },
  transfermovil_usd: { currency: 'USD', kind: 'manual', rate: 'CLASICA', label: 'Transfermóvil (Clásica USD)', minUsd: 0 },
  enzona_usd: { currency: 'USD', kind: 'manual', rate: 'CLASICA', label: 'EnZona (Clásica USD)', minUsd: 0 },
  transfermovil_cup: { currency: 'CUP', kind: 'manual', rate: 'CUP', label: 'Transfermóvil (CUP)', minUsd: 0 },
  enzona_cup: { currency: 'CUP', kind: 'manual', rate: 'CUP', label: 'EnZona (CUP)', minUsd: 0 },
  transfermovil_mlc: { currency: 'MLC', kind: 'manual', rate: 'MLC', label: 'Transfermóvil (MLC)', minUsd: 0 },
  enzona_mlc: { currency: 'MLC', kind: 'manual', rate: 'MLC', label: 'EnZona (MLC)', minUsd: 0 },
  saldo_movil: { currency: 'SALDO', kind: 'manual', rate: 'SALDO', label: 'Saldo móvil (ETECSA)', minUsd: 0 },
});
export const METHOD_IDS = Object.freeze(Object.keys(METHODS));
export const CURRENCIES = Object.freeze(['USD', 'CUP', 'MLC', 'SALDO']);
export const RATE_KEYS = Object.freeze(['CUP', 'MLC', 'CLASICA', 'SALDO']);

// What each manual method's account card holds, as the admin fills it in and the user sees it.
// `card`: the card number to transfer to; `phone`: the number the bank confirms to (Transfermóvil)
// or that receives the balance (saldo móvil); `account`: an EnZona account or merchant code.
export const ACCOUNT_FIELDS = Object.freeze({
  transfermovil_usd: ['holder', 'card', 'phone', 'note'],
  enzona_usd: ['holder', 'card', 'account', 'note'],
  transfermovil_cup: ['holder', 'card', 'phone', 'note'],
  enzona_cup: ['holder', 'card', 'account', 'note'],
  transfermovil_mlc: ['holder', 'card', 'phone', 'note'],
  enzona_mlc: ['holder', 'card', 'account', 'note'],
  saldo_movil: ['holder', 'phone', 'note'],
});

/* ---------- plans ---------- */
export const CYCLES = Object.freeze({ month: 30, quarter: 90, year: 365 });
export const CYCLE_IDS = Object.freeze(Object.keys(CYCLES));

// founder/pricing-strategy.md. The admin edits these; this is only what a fresh instance starts with.
export const DEFAULT_PLANS = Object.freeze([
  { id: 'free', name: 'Arranque', prices: {}, public: true, features: { coach: false, coachMonthly: 0 },
    perks: ['Rutinas, registro y biblioteca', 'Funciona sin conexión', 'Récords y peso corporal'] },
  { id: 'talla', name: 'En Talla', prices: { month: 1.99, quarter: 4.99, year: 14.99 }, public: true,
    features: { coach: true, coachMonthly: 60 },
    perks: ['Coach IA (60 mensajes al mes)', 'Copia en la nube y varios dispositivos', 'Estadísticas de todo tu historial'] },
  { id: 'entrenador', name: 'Entrenador', prices: { month: 7.99, quarter: 19.99, year: 69.99 }, public: true,
    features: { coach: true, coachMonthly: 300 },
    perks: ['Todo En Talla', 'Coach IA (300 mensajes al mes)', 'Hasta 30 alumnos'] },
  { id: 'gimnasio', name: 'Gimnasio', prices: { month: 19.99, quarter: 49.99, year: 179.99 }, public: true,
    features: { coach: true, coachMonthly: 1000 },
    perks: ['Todo Entrenador', 'Coach IA (1000 mensajes al mes)', 'Hasta 200 socios y 5 entrenadores'] },
]);

const PLAN_ID = /^[a-z][a-z0-9-]{0,23}$/;
const num = v => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);
const cleanText = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** A plans list from the admin made safe, or an error string. Prices are USD with two decimals. */
export function sanitizePlans(list) {
  if (!Array.isArray(list) || !list.length || list.length > 12) return { error: 'between 1 and 12 plans' };
  const seen = new Set();
  const out = [];
  for (const p of list) {
    if (!p || typeof p !== 'object') return { error: 'a plan is not an object' };
    const id = cleanText(p.id, 24).toLowerCase();
    if (!PLAN_ID.test(id) || seen.has(id)) return { error: `bad or repeated plan id "${id}"` };
    seen.add(id);
    const prices = {};
    for (const c of CYCLE_IDS) {
      const v = num(p.prices?.[c]);
      if (Number.isFinite(v) && v > 0) {
        if (v > 10000) return { error: `price too high in ${id}` };
        prices[c] = Math.round(v * 100) / 100;
      }
    }
    const coachMonthly = Math.max(0, Math.min(100000, Math.floor(num(p.features?.coachMonthly) || 0)));
    out.push({
      id, name: cleanText(p.name, 40) || id, prices, public: p.public !== false,
      features: { coach: !!p.features?.coach, coachMonthly },
      perks: (Array.isArray(p.perks) ? p.perks : []).map(x => cleanText(x, 80)).filter(Boolean).slice(0, 8),
    });
  }
  if (!out.some(p => !Object.keys(p.prices).length)) return { error: 'keep one free plan (no prices)' };
  return { plans: out };
}

/** How plans compare: the free plan is 0, then by monthly-equivalent price. */
export function planRank(plan) {
  if (!plan) return -1;
  const per = CYCLE_IDS.filter(c => plan.prices?.[c]).map(c => plan.prices[c] / CYCLES[c]);
  return per.length ? Math.max(...per) : 0;
}

/* ---------- money ---------- */
const STEP = { USD: 0.01, CUP: 10, MLC: 0.01, SALDO: 10 };

/** Round an amount up to what is actually transferred in that currency (never down: it is a price). */
export function roundUp(amount, currency) {
  const step = STEP[currency] || 0.01;
  // The epsilon keeps 1.1 * 100 = 110.00000000000001 from being charged as 111.
  if (step >= 1) return Math.ceil(amount / step - 1e-9) * step;
  return Math.ceil(amount * 100 - 1e-6) / 100;
}

export function fmtAmount(amount, currency) {
  return (currency === 'CUP' || currency === 'SALDO') ? String(Math.round(amount)) : amount.toFixed(2);
}

/**
 * What a method charges for `usd`: { currency, amount, rate } or { error }.
 * `rates` is { CUP, MLC, CLASICA, SALDO } in units per 1 USD (missing = unavailable).
 * `markups` is { CUP: pct, ... }, the admin's margin over the market rate.
 */
export function quote(methodId, usd, rates = {}, markups = {}) {
  const m = METHODS[methodId];
  if (!m) return { error: 'unknown method' };
  if (!(usd > 0)) return { error: 'nothing to pay' };
  if (!m.rate) return { currency: 'USD', amount: roundUp(usd, 'USD'), rate: 1 };
  const r = num(rates[m.rate]);
  if (!(r > 0)) return { error: 'rate unavailable' };
  const pct = Math.max(0, Math.min(100, num(markups[m.rate]) || 0));
  const rate = r * (1 + pct / 100);
  return { currency: m.currency, amount: roundUp(usd * rate, m.currency), rate: Math.round(rate * 10000) / 10000 };
}

/* ---------- subscriptions ----------
 * One record per user: the plan running now (`current`, with its end) and what is queued behind
 * it (`queue`, plan + seconds). The rule is QvaArbi's: a better plan starts now and the days left
 * on the lesser one wait in the queue; the same plan stretches the end; a lesser plan waits behind.
 * Nobody loses a day they paid for. */
const DAY = 86400000;

/** The record as of `now`: an expired plan gives way to the next in the queue. */
export function resolveSub(sub, now = Date.now()) {
  if (!sub) return null;
  let current = sub.current ? { ...sub.current } : null;
  const queue = [...(sub.queue || [])];
  while ((!current || current.end <= now) && queue.length) {
    const next = queue.shift();
    // Queued days run straight after the plan before them, whether or not anyone looked then.
    const start = current ? current.end : now;
    current = { plan: next.plan, start, end: start + next.ms };
  }
  if (current && current.end <= now) current = null;
  return { current, queue };
}

/** The plan id that applies at `now` ('free' when nothing is running). */
export function activePlanId(sub, now = Date.now()) {
  return resolveSub(sub, now)?.current?.plan || 'free';
}

/** The record after a purchase of `days` of `planId`. `rankOf(id)` compares plans. */
export function applyPurchase(sub, planId, days, now, rankOf) {
  const ms = Math.round(days * DAY);
  const r = resolveSub(sub, now) || { current: null, queue: [] };
  const cur = r.current;
  if (!cur) return { current: { plan: planId, start: now, end: now + ms }, queue: r.queue };
  if (cur.plan === planId) return { current: { ...cur, end: cur.end + ms }, queue: r.queue };
  if (rankOf(planId) > rankOf(cur.plan)) {
    const left = Math.max(0, cur.end - now);
    const queue = left > 0 ? [{ plan: cur.plan, ms: left }, ...r.queue] : r.queue;
    return { current: { plan: planId, start: now, end: now + ms }, queue };
  }
  // A lesser plan, or one of the same rank: it waits behind. Merge with a queued entry of the same plan.
  const queue = [...r.queue];
  const same = queue.find(q => q.plan === planId);
  if (same) same.ms += ms; else queue.push({ plan: planId, ms });
  return { current: cur, queue };
}

/* ---------- payment requests ---------- */
export const STATUSES = Object.freeze(['pending', 'review', 'paid', 'rejected', 'expired', 'cancelled']);
export const OPEN = new Set(['pending', 'review']);
export const PENDING_TTL_MS = 48 * 3600000;

/** Which status moves are allowed, and by whom. */
export function canMove(from, to, by) {
  if (from === to) return false;
  if (from === 'pending') return (to === 'review' && by === 'user') || (to === 'cancelled' && by === 'user') || to === 'paid' || to === 'rejected' || to === 'expired';
  if (from === 'review') return to === 'paid' || to === 'rejected' || (to === 'pending' && by === 'user');
  // A rejected receipt can be corrected and sent again.
  if (from === 'rejected') return to === 'review' && by === 'user';
  // Paid, expired and cancelled are final; an automatic confirmation of an expired request still counts.
  if (from === 'expired') return to === 'paid' && by === 'gateway';
  return false;
}

/** A short reference the user writes in the transfer note, so the admin can match it. */
export function payRef(id) {
  return 'TY-' + String(id).replace(/[^A-Za-z0-9]/g, '').slice(-6).toUpperCase();
}

