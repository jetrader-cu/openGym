/* HTTP surface of TallaYa billing and of the QvaPay mini-app sign-in.
 *
 * A factory over server.js's own helpers, like coach/routes.js, so this module holds no closure
 * over the user database or the session secret. Route keys are plain 'METHOD /path' (ids travel
 * in the query string or the body), which keeps server.js's lookup table and the openapi test as
 * they are.
 *
 * Money rules (the same as QvaArbi):
 *  - a plan is priced in USD; the amount in CUP, MLC, Clásica or mobile balance is frozen on the
 *    request when it is created, at the day's rate plus the admin's margin;
 *  - automatic methods (QvaPay balance, PayPal, card, crypto) are confirmed ONLY by a signed
 *    webhook, never by what the app says;
 *  - manual methods (Transfermóvil, EnZona, mobile balance) need a receipt and an admin's yes.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  METHODS, METHOD_IDS, ACCOUNT_FIELDS, CYCLES, CYCLE_IDS, RATE_KEYS, OPEN,
  sanitizePlans, planRank, quote, fmtAmount, resolveSub, activePlanId, applyPurchase, canMove, payRef,
} from './catalog.js';
import { effectiveRates, createRateSource } from './rates.js';
import {
  verifyQvapayWebhook, verifyTrondealerWebhook, verifyInitData, createInvoice, createTopup, qvapayInfo,
  assignWallet, tronConfirmed, validCombo, NETWORKS,
} from './gateways.js';
import { createStore } from './store.js';

const CYCLE_LABEL = { month: '1 mes', quarter: '3 meses', year: '1 año' };
const MAX_OPEN_PER_USER = 6;
const MAX_PROOF_BYTES = 3 * 1024 * 1024;
const WEBHOOK_MAX = 64 * 1024;

const text = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : typeof v === 'number' ? String(v).slice(0, max) : '');
const newId = () => crypto.randomBytes(9).toString('base64url');

/** The raw body of a webhook: signatures are over these exact bytes. */
function readRaw(req, max = WEBHOOK_MAX) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', d => { size += d.length; if (size > max) { reject(Object.assign(new Error('body too large'), { status: 413 })); req.destroy(); } else chunks.push(d); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/** A receipt photo from a data URL: jpeg, png or webp by its magic bytes, or null. */
export function decodeProofImage(dataUrl) {
  const m = /^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) return null;
  const buf = Buffer.from(m[2], 'base64');
  if (!buf.length || buf.length > MAX_PROOF_BYTES) return null;
  const isJpeg = buf[0] === 0xff && buf[1] === 0xd8;
  const isPng = buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isWebp = buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP';
  const ext = isJpeg ? 'jpg' : isPng ? 'png' : isWebp ? 'webp' : null;
  return ext ? { buf, ext } : null;
}

export function billingModule(deps) {
  const {
    json, readBody, readSession, requireAdmin, audit = () => {}, origin, dataDir, secret,
    fetchImpl = globalThis.fetch, users, isAdmin = () => false, inviteOnly = false, now: clock = () => Date.now(),
  } = deps;
  const store = createStore({ dataDir, secret });
  const rateSource = deps.rateSource || createRateSource({ fetchImpl });
  const webhookUrl = name => origin.replace(/\/+$/, '') + '/api/billing/webhook/' + name;
  const nonces = new Map();   // mini-app nonces seen, until their init_data could not be valid any more

  /* ---------- reading the configuration ---------- */
  const S = () => store.load().settings;
  const planById = id => store.load().plans.find(p => p.id === id) || null;
  const rankOf = id => planRank(planById(id));
  const qvapayCreds = () => ({ appId: S().qvapay.appId, appSecret: store.secretOf('qvapay.appSecret') });
  const miniCreds = () => {
    const m = S().miniapp;
    const own = { appId: m.appId, appSecret: store.secretOf('miniapp.appSecret') };
    // A mini-app may share the main App; then its credentials are the main ones.
    return own.appId && own.appSecret ? own : qvapayCreds();
  };

  /** Whether a method can take money right now (switched on and its gateway or account filled in). */
  function methodReady(id) {
    const s = S();
    if (!s.methods[id]?.enabled) return false;
    const m = METHODS[id];
    if (m.kind === 'invoice') { const c = qvapayCreds(); return !!(c.appId && c.appSecret); }
    if (m.kind === 'topup') { const c = qvapayCreds(); return !!(c.appId && c.appSecret && s.qvapay[m.coin]); }
    if (m.kind === 'crypto') return !!(s.trondealer.enabled && store.secretOf('trondealer.apiKey') && store.secretOf('trondealer.webhookSecret') && s.trondealer.networks.length);
    const a = s.accounts[id] || {};
    if (id === 'saldo_movil') return !!a.phone;
    if (id.startsWith('transfermovil')) return !!a.card;
    return !!(a.card || a.account);
  }
  const minUsdOf = id => {
    const v = Number(S().methods[id]?.minUsd);
    return Number.isFinite(v) && v > 0 ? v : METHODS[id].minUsd;
  };

  async function currentRates() {
    const market = await rateSource.market();
    const eff = effectiveRates(market, S().rates);
    const markups = {};
    for (const k of RATE_KEYS) markups[k] = Number(S().rates[k]?.markupPct) || 0;
    return { market, ...eff, markups };
  }

  /* ---------- subscriptions ---------- */
  function planOf(uid) {
    const id = activePlanId(store.load().subs[uid], clock());
    return planById(id) || planById('free') || { id: 'free', name: 'Free', prices: {}, features: { coach: false } };
  }
  /** What the Coach asks: may this person use it? Billing off = everyone (the instance decides). */
  function canUseCoach(user) {
    if (!S().enabled) return true;
    if (!user) return false;
    if (isAdmin(user)) return true;
    return !!planOf(user.id).features?.coach;
  }
  function grant(uid, planId, days) {
    const d = store.load();
    d.subs[uid] = applyPurchase(d.subs[uid], planId, days, clock(), rankOf);
  }

  /* ---------- requests ---------- */
  function sweep() {
    const t = clock(), ttl = (Number(S().pendingHours) || 48) * 3600000;
    let changed = false;
    for (const r of store.load().requests) {
      if (r.status === 'pending' && t - r.createdAt > ttl) { r.status = 'expired'; r.updatedAt = t; changed = true; }
    }
    if (changed) store.save();
  }
  const findReq = id => store.load().requests.find(r => r.id === id) || null;

  /** What the user (and the app) sees of a request. Never the proof image itself. */
  function publicRequest(r) {
    const plan = planById(r.plan);
    const out = {
      id: r.id, ref: payRef(r.id), plan: r.plan, planName: plan?.name || r.plan, cycle: r.cycle, method: r.method,
      methodLabel: METHODS[r.method]?.label || r.method, kind: METHODS[r.method]?.kind || null,
      currency: r.currency, amount: r.amount, usd: r.usd, status: r.status,
      createdAt: r.createdAt, updatedAt: r.updatedAt || r.createdAt, paidAt: r.paidAt || null,
      reason: r.reason || null, proof: r.proof ? { ref: r.proof.ref, phone: r.proof.phone || '', note: r.proof.note || '', image: !!r.proof.image, at: r.proof.at } : null,
    };
    if (r.gateway) out.gateway = { url: r.gateway.url || null, uuid: r.gateway.miniapp ? r.gateway.uuid : undefined, address: r.gateway.address || null, network: r.gateway.network || null, asset: r.gateway.asset || null, miniapp: !!r.gateway.miniapp };
    if (METHODS[r.method]?.kind === 'manual') out.account = publicAccount(r.method);
    return out;
  }
  function publicAccount(method) {
    const a = S().accounts[method] || {};
    const out = {};
    for (const f of ACCOUNT_FIELDS[method] || []) if (a[f]) out[f] = String(a[f]);
    return out;
  }

  /** Paid: mark it, extend the plan, tell the admin. Idempotent. Returns whether it changed. */
  function markPaid(r, by, ref) {
    if (r.status === 'paid') return false;
    if (!canMove(r.status, 'paid', by === 'gateway' ? 'gateway' : 'admin')) return false;
    r.status = 'paid'; r.paidAt = clock(); r.updatedAt = r.paidAt; r.paidBy = by; if (ref) r.paidRef = String(ref).slice(0, 120);
    grant(r.uid, r.plan, CYCLES[r.cycle] || 30);
    store.save();
    notify(`✅ Pago confirmado ${payRef(r.id)}: ${planById(r.plan)?.name || r.plan} · ${fmtAmount(Number(r.amount), r.currency)} ${r.currency} (${METHODS[r.method]?.label || r.method}) por ${by === 'gateway' ? 'la pasarela' : 'el admin'}.`);
    return true;
  }

  function notify(message) {
    const token = store.secretOf('notify.telegramToken');
    const chat = S().notify?.telegramChatId;
    if (!token || !chat || !fetchImpl) return;
    fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text: message, disable_web_page_preview: true }),
    }).catch(() => { /* a missed notice never blocks a payment */ });
  }

  function catalogView(rates) {
    const s = S();
    const methods = METHOD_IDS.filter(methodReady).map(id => ({
      id, label: METHODS[id].label, currency: METHODS[id].currency, kind: METHODS[id].kind, minUsd: minUsdOf(id),
      available: !METHODS[id].rate || !!rates.rates[METHODS[id].rate],
    }));
    const plans = store.load().plans.filter(p => p.public).map(p => {
      const prices = {};
      for (const c of CYCLE_IDS) {
        if (!p.prices[c]) continue;
        const byMethod = {};
        for (const m of methods) {
          const q = quote(m.id, p.prices[c], rates.rates, rates.markups);
          if (!q.error) byMethod[m.id] = { currency: q.currency, amount: fmtAmount(q.amount, q.currency), tooSmall: p.prices[c] < m.minUsd };
        }
        prices[c] = { usd: p.prices[c].toFixed(2), days: CYCLES[c], methods: byMethod };
      }
      return { id: p.id, name: p.name, perks: p.perks || [], features: p.features, prices, rank: planRank(p) };
    });
    const crypto = methods.some(m => m.id === 'crypto')
      ? s.trondealer.networks.filter(n => NETWORKS[n]).map(n => ({ id: n, label: NETWORKS[n].label, assets: NETWORKS[n].tokens.filter(a => s.trondealer.assets.includes(a)) })).filter(n => n.assets.length)
      : [];
    return { enabled: !!s.enabled, plans, methods, crypto, cycles: CYCLE_IDS, ratesUpdatedAt: rateSource.status().updatedAt };
  }

  /* ---------- admin: settings patch ---------- */
  function applySettings(body) {
    const s = S();
    const bool = v => v === true || v === 'true' || v === 1;
    const nonneg = (v, max) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : null; };
    if ('enabled' in body) s.enabled = bool(body.enabled);
    if ('trialDays' in body) s.trialDays = Math.floor(nonneg(body.trialDays, 60) || 0);
    if ('pendingHours' in body) s.pendingHours = Math.max(1, Math.floor(nonneg(body.pendingHours, 720) || 48));
    if (body.methods && typeof body.methods === 'object') {
      for (const id of METHOD_IDS) {
        const m = body.methods[id]; if (!m || typeof m !== 'object') continue;
        if ('enabled' in m) s.methods[id].enabled = bool(m.enabled);
        if ('minUsd' in m) s.methods[id].minUsd = nonneg(m.minUsd, 1000);
      }
    }
    if (body.accounts && typeof body.accounts === 'object') {
      for (const id of Object.keys(ACCOUNT_FIELDS)) {
        const a = body.accounts[id]; if (!a || typeof a !== 'object') continue;
        s.accounts[id] = s.accounts[id] || {};
        for (const f of ACCOUNT_FIELDS[id]) if (f in a) s.accounts[id][f] = text(a[f], f === 'note' ? 300 : 80);
      }
    }
    if (body.rates && typeof body.rates === 'object') {
      for (const k of RATE_KEYS) {
        const r = body.rates[k]; if (!r || typeof r !== 'object') continue;
        if ('mode' in r) s.rates[k].mode = r.mode === 'manual' ? 'manual' : 'auto';
        if ('manual' in r) s.rates[k].manual = r.manual === null || r.manual === '' ? null : nonneg(r.manual, 1e6);
        if ('markupPct' in r) s.rates[k].markupPct = nonneg(r.markupPct, 100) || 0;
      }
    }
    const q = body.qvapay;
    if (q && typeof q === 'object') {
      if ('appId' in q) s.qvapay.appId = text(q.appId, 80);
      if ('paypalCoin' in q) s.qvapay.paypalCoin = text(q.paypalCoin, 20).toUpperCase();
      if ('cardCoin' in q) s.qvapay.cardCoin = text(q.cardCoin, 20).toUpperCase();
      if ('cardFeeMode' in q) s.qvapay.cardFeeMode = q.cardFeeMode === 'included' ? 'included' : 'on_top';
      store.setSecret('qvapay.appSecret', q.appSecret === undefined ? undefined : text(q.appSecret, 200));
    }
    const mi = body.miniapp;
    if (mi && typeof mi === 'object') {
      if ('enabled' in mi) s.miniapp.enabled = bool(mi.enabled);
      if ('allowSignup' in mi) s.miniapp.allowSignup = bool(mi.allowSignup);
      if ('appUuid' in mi) s.miniapp.appUuid = text(mi.appUuid, 80);
      if ('appId' in mi) s.miniapp.appId = text(mi.appId, 80);
      store.setSecret('miniapp.appSecret', mi.appSecret === undefined ? undefined : text(mi.appSecret, 200));
    }
    const td = body.trondealer;
    if (td && typeof td === 'object') {
      if ('enabled' in td) s.trondealer.enabled = bool(td.enabled);
      if (Array.isArray(td.networks)) s.trondealer.networks = td.networks.filter(n => NETWORKS[n]);
      if (Array.isArray(td.assets)) s.trondealer.assets = td.assets.map(a => String(a).toUpperCase()).filter(a => a === 'USDT' || a === 'USDC');
      store.setSecret('trondealer.apiKey', td.apiKey === undefined ? undefined : text(td.apiKey, 200));
      store.setSecret('trondealer.webhookSecret', td.webhookSecret === undefined ? undefined : text(td.webhookSecret, 200));
    }
    const n = body.notify;
    if (n && typeof n === 'object') {
      if ('telegramChatId' in n) s.notify.telegramChatId = text(n.telegramChatId, 40);
      store.setSecret('notify.telegramToken', n.telegramToken === undefined ? undefined : text(n.telegramToken, 200));
    }
  }

  const adminView = async () => {
    sweep();
    const d = store.load();
    const rates = await currentRates();
    const t = clock();
    const monthAgo = t - 30 * 86400000;
    const paid = d.requests.filter(r => r.status === 'paid' && r.paidAt >= monthAgo);
    const income = {};
    for (const r of paid) income[r.currency] = (income[r.currency] || 0) + Number(r.amount);
    const active = Object.entries(d.subs).map(([uid, s]) => [uid, resolveSub(s, t)]).filter(([, s]) => s?.current);
    return {
      settings: store.maskedSettings(), plans: d.plans,
      rates: { market: rates.market, effective: rates.rates, sources: rates.sources, updatedAt: rateSource.status().updatedAt },
      webhooks: { qvapay: webhookUrl('qvapay'), trondealer: webhookUrl('trondealer') },
      miniappUrl: origin.replace(/\/+$/, '') + '/miniapp',
      catalog: { methods: METHODS, accountFields: ACCOUNT_FIELDS, networks: NETWORKS, cycles: CYCLES, rateKeys: RATE_KEYS },
      ready: Object.fromEntries(METHOD_IDS.map(id => [id, methodReady(id)])),
      stats: {
        review: d.requests.filter(r => r.status === 'review').length,
        pending: d.requests.filter(r => r.status === 'pending').length,
        paid30: paid.length, income30: income, activeSubs: active.length,
      },
    };
  };

  /* ---------- the mini-app account ---------- */
  function verifyMini(initData) {
    const m = S().miniapp;
    if (!m.enabled) throw Object.assign(new Error('mini-app sign-in is off'), { code: 'off' });
    const creds = miniCreds();
    const v = verifyInitData(initData, creds.appSecret, m.appUuid || null, { now: clock() });
    // A nonce is good once: init_data is a bearer credential for its ten minutes.
    const t = clock();
    for (const [k, exp] of nonces) if (exp < t) nonces.delete(k);
    if (v.nonce) {
      if (nonces.has(v.nonce)) throw Object.assign(new Error('mini-app sign-in refused: replay'), { code: 'replay' });
      nonces.set(v.nonce, t + 11 * 60000);
    }
    return v;
  }
  const miniName = u => {
    const base = text(u.username || [u.name, u.lastname].filter(Boolean).join(' ') || 'Atleta', 30).replace(/[^\p{L}\p{N} ._-]/gu, '').trim() || 'Atleta';
    if (!users.nameTaken(base)) return base;
    for (let i = 2; i < 999; i++) if (!users.nameTaken(`${base} ${i}`)) return `${base} ${i}`;
    return base + ' ' + crypto.randomBytes(3).toString('hex');
  };
  const qvapayPublic = u => (u.qvapay ? { uuid: u.qvapay.uuid, username: u.qvapay.username || null, linkedAt: u.qvapay.linkedAt } : null);

  const routes = {
    /* ------------------------------ public ------------------------------ */

    'GET /api/billing/plans': async (req, res) => {
      json(res, 200, catalogView(await currentRates()));
    },

    'GET /api/miniapp/config': async (req, res) => {
      const m = S().miniapp;
      json(res, 200, { enabled: !!m.enabled, signup: !!m.allowSignup && !inviteOnly });
    },

    /* ------------------------------ user ------------------------------ */

    'GET /api/billing/me': async (req, res) => {
      const user = readSession(req);
      if (!user) return json(res, 401, { error: 'not signed in' });
      sweep();
      const d = store.load();
      const sub = resolveSub(d.subs[user.id], clock());
      const plan = planOf(user.id);
      json(res, 200, {
        enabled: !!S().enabled,
        plan: { id: plan.id, name: plan.name, features: plan.features },
        current: sub?.current || null,
        queue: (sub?.queue || []).map(q => ({ plan: q.plan, planName: planById(q.plan)?.name || q.plan, days: Math.round(q.ms / 86400000) })),
        requests: d.requests.filter(r => r.uid === user.id).sort((a, b) => b.createdAt - a.createdAt).slice(0, 30).map(publicRequest),
        qvapay: qvapayPublic(user),
      });
    },

    'GET /api/billing/request': async (req, res) => {
      const user = readSession(req);
      if (!user) return json(res, 401, { error: 'not signed in' });
      const r = findReq(new URL(req.url, 'http://x').searchParams.get('id') || '');
      if (!r || r.uid !== user.id) return json(res, 404, { error: 'not found' });
      json(res, 200, { request: publicRequest(r) });
    },

    'POST /api/billing/checkout': async (req, res) => {
      const user = readSession(req);
      if (!user) return json(res, 401, { error: 'not signed in' });
      const body = await readBody(req);
      if (!S().enabled) return json(res, 503, { error: 'payments are not open yet', code: 'off' });
      const plan = planById(text(body.plan, 24));
      const cycle = text(body.cycle, 10);
      const method = text(body.method, 30);
      const usd = plan?.prices?.[cycle];
      if (!plan || !usd) return json(res, 400, { error: 'that plan has no price for that period', code: 'plan' });
      if (!METHODS[method] || !methodReady(method)) return json(res, 400, { error: 'that payment method is not available', code: 'method' });
      if (usd < minUsdOf(method)) return json(res, 400, { error: `this method takes at least ${minUsdOf(method)} USD: pick a longer period`, code: 'min' });
      sweep();
      const d = store.load();
      const open = d.requests.filter(r => r.uid === user.id && OPEN.has(r.status));
      // The same order still open: hand it back instead of a second invoice or wallet.
      const same = open.find(r => r.plan === plan.id && r.cycle === cycle && r.method === method && r.status === 'pending' && (!body.miniapp === !r.gateway?.miniapp) && (method !== 'crypto' || (r.gateway?.network === body.network && r.gateway?.asset === body.asset)));
      if (same) return json(res, 200, { request: publicRequest(same), reused: true });
      if (open.length >= MAX_OPEN_PER_USER) return json(res, 429, { error: 'too many payments in progress: finish or cancel one first', code: 'open' });

      const rates = await currentRates();
      const q = quote(method, usd, rates.rates, rates.markups);
      if (q.error) return json(res, 503, { error: 'the exchange rate for this currency is not available right now', code: 'rate' });
      const t = clock();
      const r = {
        id: newId(), uid: user.id, plan: plan.id, cycle, method, currency: q.currency, amount: fmtAmount(q.amount, q.currency),
        usd: usd.toFixed(2), rate: q.rate, status: 'pending', createdAt: t, updatedAt: t, gateway: null,
      };
      const m = METHODS[method];
      const description = `TallaYa ${plan.name} (${CYCLE_LABEL[cycle] || cycle})`;
      try {
        if (m.kind === 'invoice') {
          const mini = !!body.miniapp && S().miniapp.enabled;
          const inv = await createInvoice(mini ? miniCreds() : qvapayCreds(), {
            amount: usd, description, remoteId: r.id, webhook: webhookUrl('qvapay'),
            expireAt: t + (Number(S().pendingHours) || 48) * 3600000,
          }, fetchImpl);
          r.gateway = { uuid: inv.uuid, url: inv.url, miniapp: mini };
        } else if (m.kind === 'topup') {
          const s = S().qvapay;
          const top = await createTopup(qvapayCreds(), { amount: usd, coin: s[m.coin], webhook: webhookUrl('qvapay'), feeMode: method === 'card' ? s.cardFeeMode : undefined }, fetchImpl);
          r.gateway = { uuid: top.uuid, url: top.url };
        } else if (m.kind === 'crypto') {
          const network = text(body.network, 10), asset = text(body.asset, 6).toUpperCase();
          const td = S().trondealer;
          if (!validCombo(network, asset) || !td.networks.includes(network) || !td.assets.includes(asset)) {
            return json(res, 400, { error: 'that network and coin are not available', code: 'network' });
          }
          const w = await assignWallet(store.secretOf('trondealer.apiKey'), 'TY-' + r.id, network, fetchImpl);
          r.gateway = { address: w.address, network, asset };
        }
      } catch (e) {
        console.warn('billing checkout', method, e.status || '', e.message);
        return json(res, 502, { error: 'the payment service did not answer, try again in a moment', code: 'gateway' });
      }
      d.requests.push(r);
      store.save();
      audit(req, 'billing.checkout', { user, msg: `${plan.id}/${cycle} ${method} ${r.amount} ${r.currency}` });
      json(res, 200, { request: publicRequest(r) });
    },

    'POST /api/billing/proof': async (req, res) => {
      const user = readSession(req);
      if (!user) return json(res, 401, { error: 'not signed in' });
      const body = await readBody(req);
      const r = findReq(text(body.id, 30));
      if (!r || r.uid !== user.id) return json(res, 404, { error: 'not found' });
      if (METHODS[r.method]?.kind !== 'manual') return json(res, 400, { error: 'this payment is confirmed automatically' });
      if (!canMove(r.status, 'review', 'user')) return json(res, 409, { error: 'this payment can no longer take a receipt', code: 'status' });
      const ref = text(body.ref, 80);
      if (ref.length < 4) return json(res, 400, { error: 'write the transaction number of your transfer', code: 'ref' });
      let image = false;
      if (body.image) {
        const img = decodeProofImage(body.image);
        if (!img) return json(res, 400, { error: 'the photo must be a JPG, PNG or WebP under 3 MB', code: 'image' });
        fs.mkdirSync(store.proofDir, { recursive: true });
        for (const ext of ['jpg', 'png', 'webp']) { try { fs.unlinkSync(path.join(store.proofDir, `${r.id}.${ext}`)); } catch { /* none */ } }
        fs.writeFileSync(path.join(store.proofDir, `${r.id}.${img.ext}`), img.buf, { mode: 0o600 });
        image = img.ext;
      }
      r.proof = { ref, phone: text(body.phone, 30), note: text(body.note, 300), image: image || r.proof?.image || false, at: clock() };
      r.status = 'review'; r.updatedAt = clock(); r.reason = null;
      store.save();
      audit(req, 'billing.proof', { user, msg: payRef(r.id) });
      notify(`🧾 Comprobante ${payRef(r.id)} de ${user.name}: ${planById(r.plan)?.name || r.plan} · ${r.amount} ${r.currency} por ${METHODS[r.method].label}. Ref: ${ref}. Revísalo en Admin → Cobros.`);
      json(res, 200, { request: publicRequest(r) });
    },

    'POST /api/billing/cancel': async (req, res) => {
      const user = readSession(req);
      if (!user) return json(res, 401, { error: 'not signed in' });
      const body = await readBody(req);
      const r = findReq(text(body.id, 30));
      if (!r || r.uid !== user.id) return json(res, 404, { error: 'not found' });
      if (!canMove(r.status, 'cancelled', 'user')) return json(res, 409, { error: 'this payment cannot be cancelled', code: 'status' });
      r.status = 'cancelled'; r.updatedAt = clock();
      store.save();
      json(res, 200, { request: publicRequest(r) });
    },

    /* ------------------------------ webhooks ------------------------------ */

    'POST /api/billing/webhook/qvapay': async (req, res) => {
      let raw;
      try { raw = await readRaw(req); } catch { return json(res, 413, { error: 'too large' }); }
      const secrets = [store.secretOf('qvapay.appSecret'), store.secretOf('miniapp.appSecret')];
      const v = verifyQvapayWebhook(raw, req.headers['x-qvapay-signature'], req.headers['x-qvapay-timestamp'], secrets, clock());
      if (!v.ok) { console.warn('billing webhook qvapay refused:', v.reason); return json(res, 401, { error: 'unauthorized' }); }
      let body;
      try { body = JSON.parse(raw.toString('utf8') || '{}'); } catch { return json(res, 200, { ok: false, error: 'invalid json' }); }
      const uuid = text(body.transaction_uuid || body.uuid, 80);
      const status = String(body.status || '').toLowerCase();
      const r = store.load().requests.find(x => (uuid && x.gateway?.uuid === uuid) || (body.remote_id && x.id === String(body.remote_id) && x.gateway?.uuid));
      if (!r) return json(res, 200, { ok: false, error: 'unknown payment' });   // 2xx: nothing to retry
      if (r.status === 'paid') return json(res, 200, { ok: true, idempotent: true });
      if (!['paid', 'completed', 'confirmed', 'success'].includes(status)) return json(res, 200, { ok: true, ignored: status });
      const got = Number(body.amount);
      if (body.is_partial === true || (Number.isFinite(got) && got + 0.01 < Number(r.usd))) {
        // Less than the price: an admin decides (accept, or refund outside the app).
        r.status = 'review'; r.updatedAt = clock(); r.reason = `pago parcial: llegaron ${Number.isFinite(got) ? got.toFixed(2) : '?'} USD de ${r.usd}`;
        r.proof = { ref: uuid, note: 'confirmación automática parcial', image: false, at: clock() };
        store.save();
        notify(`⚠️ Pago parcial ${payRef(r.id)}: ${r.reason}. Revísalo en Admin → Cobros.`);
        return json(res, 200, { ok: true, review: true });
      }
      markPaid(r, 'gateway', uuid);
      json(res, 200, { ok: true });
    },

    'POST /api/billing/webhook/trondealer': async (req, res) => {
      let raw;
      try { raw = await readRaw(req); } catch { return json(res, 413, { error: 'too large' }); }
      if (!S().trondealer.enabled) return json(res, 401, { error: 'unauthorized' });
      if (!verifyTrondealerWebhook(raw, req.headers['x-signature-256'], store.secretOf('trondealer.webhookSecret'))) {
        console.warn('billing webhook trondealer refused: bad signature');
        return json(res, 401, { error: 'unauthorized' });
      }
      let event;
      try { event = JSON.parse(raw.toString('utf8') || '{}'); } catch { return json(res, 200, { ok: false, error: 'invalid json' }); }
      const data = event.data && typeof event.data === 'object' ? event.data : event;
      const address = String(data.to_address || data.address || event.to_address || '').toLowerCase();
      const r = address && store.load().requests.find(x => x.gateway?.address && x.gateway.address.toLowerCase() === address);
      if (!r) return json(res, 200, { ok: false, error: 'unknown wallet' });
      if (!tronConfirmed(event)) {
        if (!r.gateway.detectedAt) { r.gateway.detectedAt = clock(); store.save(); }
        return json(res, 200, { ok: true, ignored: 'not confirmed' });
      }
      const tx = text(data.tx_hash || event.tx_hash || '', 120);
      if (tx && !store.rememberEvent('td:' + tx + ':' + (data.log_index ?? ''))) return json(res, 200, { ok: true, idempotent: true });
      if (r.status === 'paid') { store.save(); return json(res, 200, { ok: true, idempotent: true }); }
      const got = Number(data.amount ?? event.amount);
      if (Number.isFinite(got) && got + 0.01 < Number(r.usd)) {
        r.status = 'review'; r.updatedAt = clock(); r.reason = `pago parcial: llegaron ${got.toFixed(2)} ${r.gateway.asset} de ${r.usd}`;
        r.proof = { ref: tx, note: 'confirmación automática parcial', image: false, at: clock() };
        store.save();
        notify(`⚠️ Cripto parcial ${payRef(r.id)}: ${r.reason}.`);
        return json(res, 200, { ok: true, review: true });
      }
      if (!markPaid(r, 'gateway', tx)) store.save();
      json(res, 200, { ok: true });
    },

    /* ------------------------------ mini-app ------------------------------ */

    'POST /api/miniapp/login': async (req, res) => {
      const body = await readBody(req);
      let v;
      try { v = verifyMini(text(body.init_data, 8192)); }
      catch (e) { audit(req, 'auth.miniapp.fail', { ok: false, msg: e.code || 'error' }); return json(res, e.code === 'off' ? 503 : 401, { error: 'QvaPay sign-in was refused', code: e.code || 'refused' }); }
      let user = users.byQvapay(v.user.uuid);
      let created = false;
      if (!user) {
        const s = S().miniapp;
        if (!s.allowSignup || inviteOnly) return json(res, 404, { error: 'no TallaYa account is linked to this QvaPay account', code: 'not-linked' });
        user = users.create({ name: miniName(v.user) });
        created = true;
      }
      if (user.disabled) return json(res, 403, { error: 'this account is disabled', code: 'disabled' });
      user.qvapay = { uuid: v.user.uuid, username: text(v.user.username, 40) || null, kyc: v.user.kyc === true, linkedAt: user.qvapay?.linkedAt || new Date(clock()).toISOString() };
      users.save();
      audit(req, created ? 'auth.register.ok' : 'auth.login.ok', { user, msg: 'qvapay mini-app' });
      json(res, 200, { user: users.publicUser(user), created }, { 'Set-Cookie': users.sessionCookie(user) });
    },

    'POST /api/miniapp/link': async (req, res) => {
      const user = readSession(req);
      if (!user) return json(res, 401, { error: 'not signed in' });
      const body = await readBody(req);
      let v;
      try { v = verifyMini(text(body.init_data, 8192)); }
      catch (e) { return json(res, e.code === 'off' ? 503 : 401, { error: 'QvaPay sign-in was refused', code: e.code || 'refused' }); }
      const other = users.byQvapay(v.user.uuid);
      if (other && other.id !== user.id) return json(res, 409, { error: 'this QvaPay account is linked to another TallaYa profile', code: 'taken' });
      user.qvapay = { uuid: v.user.uuid, username: text(v.user.username, 40) || null, kyc: v.user.kyc === true, linkedAt: new Date(clock()).toISOString() };
      users.save();
      audit(req, 'account.qvapay.link', { user });
      json(res, 200, { qvapay: qvapayPublic(user) });
    },

    'POST /api/miniapp/unlink': async (req, res) => {
      const user = readSession(req);
      if (!user) return json(res, 401, { error: 'not signed in' });
      await readBody(req);
      if (!user.qvapay) return json(res, 200, { qvapay: null });
      // The last way in must not go: a profile made in the mini-app has no passkey or password.
      if (!users.hasOtherSignIn(user)) return json(res, 409, { error: 'add a passkey or a password first, or you could not sign in again', code: 'last' });
      delete user.qvapay;
      users.save();
      audit(req, 'account.qvapay.unlink', { user });
      json(res, 200, { qvapay: null });
    },

    /* ------------------------------ admin ------------------------------ */

    'GET /api/admin/billing': async (req, res) => {
      if (!requireAdmin(req, res)) return;
      json(res, 200, await adminView());
    },

    'POST /api/admin/billing/settings': async (req, res) => {
      const admin = requireAdmin(req, res); if (!admin) return;
      const body = await readBody(req);
      applySettings(body);
      store.save();
      audit(req, 'admin.billing.settings', { user: admin, msg: Object.keys(body).join(',') });
      json(res, 200, await adminView());
    },

    'POST /api/admin/billing/plans': async (req, res) => {
      const admin = requireAdmin(req, res); if (!admin) return;
      const body = await readBody(req);
      const r = sanitizePlans(body.plans);
      if (r.error) return json(res, 400, { error: r.error });
      store.load().plans = r.plans;
      store.save();
      audit(req, 'admin.billing.plans', { user: admin, msg: r.plans.map(p => p.id).join(',') });
      json(res, 200, await adminView());
    },

    'GET /api/admin/billing/requests': async (req, res) => {
      if (!requireAdmin(req, res)) return;
      sweep();
      const q = new URL(req.url, 'http://x').searchParams;
      const status = q.get('status') || '';
      const limit = Math.max(1, Math.min(500, Number(q.get('limit')) || 100));
      const rows = store.load().requests
        .filter(r => !status || r.status === status)
        .sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt))
        .slice(0, limit)
        .map(r => ({ ...publicRequest(r), uid: r.uid, userName: users.find(r.uid)?.name || '(borrado)', paidBy: r.paidBy || null, paidRef: r.paidRef || null, decidedBy: r.decidedBy || null }));
      json(res, 200, { requests: rows });
    },

    'GET /api/admin/billing/proof': async (req, res) => {
      if (!requireAdmin(req, res)) return;
      const r = findReq(new URL(req.url, 'http://x').searchParams.get('id') || '');
      if (!r?.proof?.image) return json(res, 404, { error: 'no photo' });
      const ext = r.proof.image;
      try {
        const buf = fs.readFileSync(path.join(store.proofDir, `${r.id}.${ext}`));
        json(res, 200, { dataUrl: `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,` + buf.toString('base64') });
      } catch { json(res, 404, { error: 'no photo' }); }
    },

    'POST /api/admin/billing/decide': async (req, res) => {
      const admin = requireAdmin(req, res); if (!admin) return;
      const body = await readBody(req);
      const r = findReq(text(body.id, 30));
      if (!r) return json(res, 404, { error: 'not found' });
      if (body.action === 'approve') {
        if (!markPaid(r, 'admin', text(body.ref, 80) || r.proof?.ref)) return json(res, 409, { error: 'this payment cannot be approved now', code: 'status' });
        r.decidedBy = admin.id; store.save();
      } else if (body.action === 'reject') {
        if (!canMove(r.status, 'rejected', 'admin')) return json(res, 409, { error: 'this payment cannot be rejected now', code: 'status' });
        r.status = 'rejected'; r.reason = text(body.reason, 300) || 'No se pudo verificar el pago.'; r.decidedBy = admin.id; r.updatedAt = clock();
        store.save();
      } else return json(res, 400, { error: 'action must be approve or reject' });
      audit(req, 'admin.billing.' + body.action, { user: admin, msg: payRef(r.id) });
      json(res, 200, { request: publicRequest(r) });
    },

    'GET /api/admin/billing/subs': async (req, res) => {
      if (!requireAdmin(req, res)) return;
      const t = clock();
      const rows = Object.entries(store.load().subs).map(([uid, s]) => {
        const r = resolveSub(s, t);
        return { uid, userName: users.find(uid)?.name || '(borrado)', current: r?.current || null, queue: r?.queue || [] };
      }).filter(x => x.current || x.queue.length).sort((a, b) => (b.current?.end || 0) - (a.current?.end || 0));
      json(res, 200, { subs: rows });
    },

    'POST /api/admin/billing/grant': async (req, res) => {
      const admin = requireAdmin(req, res); if (!admin) return;
      const body = await readBody(req);
      const uid = text(body.uid, 64);
      if (!users.find(uid)) return json(res, 404, { error: 'no such user' });
      if (body.plan === 'free' || body.revoke === true) {
        delete store.load().subs[uid];
      } else {
        const plan = planById(text(body.plan, 24));
        const days = Math.floor(Number(body.days));
        if (!plan || !Object.keys(plan.prices).length) return json(res, 400, { error: 'pick a paid plan' });
        if (!(days > 0 && days <= 3650)) return json(res, 400, { error: 'days between 1 and 3650' });
        grant(uid, plan.id, days);
      }
      store.save();
      audit(req, 'admin.billing.grant', { user: admin, msg: `${uid} ${body.plan || 'free'} ${body.days || ''}` });
      const r = resolveSub(store.load().subs[uid], clock());
      json(res, 200, { uid, current: r?.current || null, queue: r?.queue || [] });
    },

    'POST /api/admin/billing/test': async (req, res) => {
      if (!requireAdmin(req, res)) return;
      const body = await readBody(req);
      const creds = body.gateway === 'miniapp' ? miniCreds() : qvapayCreds();
      if (!creds.appId || !creds.appSecret) return json(res, 400, { error: 'fill in the App ID and the App secret first' });
      try {
        const info = await qvapayInfo(creds, fetchImpl);
        json(res, 200, { ok: true, name: info.name || info.app?.name || null, url: info.url || info.app?.url || null });
      } catch (e) {
        json(res, 200, { ok: false, error: e.message });
      }
    },
  };

  return { routes, canUseCoach, planOf, store, rateSource, sweep };
}
