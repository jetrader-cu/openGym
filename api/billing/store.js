/* billing.json under DATA_DIR: settings, plans, payment requests and subscriptions.
 *
 * One file, written temp-then-rename like db.json. Secrets (QvaPay app-secret, TronDealer key and
 * webhook secret, Telegram token) are stored AES-256-GCM encrypted with a key derived from the
 * instance secret, so a copy of billing.json alone gives nothing away. Every secret can also come
 * from the environment (.env.example); a value set in the admin dashboard wins over the env one.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { atomicWrite } from '../durable.js';
import { DEFAULT_PLANS, METHOD_IDS, RATE_KEYS } from './catalog.js';

export const SECRET_FIELDS = Object.freeze([
  'qvapay.appSecret', 'miniapp.appSecret', 'trondealer.apiKey', 'trondealer.webhookSecret', 'notify.telegramToken',
]);

const env = (k, d = '') => (process.env[k] ?? d).toString().trim();
const flag = (k, d) => (process.env[k] === undefined || process.env[k] === '' ? d : /^(1|true|yes|on)$/i.test(process.env[k]));

/** What a fresh instance starts with, seeded from the environment. */
export function defaults() {
  const methods = {};
  for (const id of METHOD_IDS) methods[id] = { enabled: false };
  const accounts = {
    transfermovil_cup: { card: env('TRANSFERMOVIL_CUP_CARD'), phone: env('TRANSFERMOVIL_CONFIRM_PHONE') },
    transfermovil_mlc: { card: env('TRANSFERMOVIL_MLC_CARD'), phone: env('TRANSFERMOVIL_CONFIRM_PHONE') },
    transfermovil_usd: { card: env('TRANSFERMOVIL_USD_CARD'), phone: env('TRANSFERMOVIL_CONFIRM_PHONE') },
    enzona_cup: { account: env('ENZONA_CUP_ACCOUNT') },
    enzona_mlc: { account: env('ENZONA_MLC_ACCOUNT') },
    enzona_usd: { account: env('ENZONA_USD_ACCOUNT') },
    saldo_movil: { phone: env('SALDO_MOVIL_PHONE') },
  };
  const rates = {};
  for (const k of RATE_KEYS) rates[k] = { mode: 'auto', manual: null, markupPct: 0 };
  return {
    settings: {
      enabled: flag('BILLING_ENABLED', false),
      trialDays: Number(env('BILLING_TRIAL_DAYS', '0')) || 0,
      pendingHours: 48,
      methods, accounts, rates,
      qvapay: {
        appId: env('QVAPAY_APP_ID'), appSecret: null,
        paypalCoin: env('QVAPAY_PAYPAL_COIN', 'PYPAL'), cardCoin: env('QVAPAY_CARD_COIN', 'CARD'),
        cardFeeMode: 'on_top',
      },
      miniapp: { enabled: flag('QVAPAY_MINIAPP_ENABLED', false), appUuid: env('QVAPAY_MINIAPP_APP_UUID'), appId: env('QVAPAY_MINIAPP_APP_ID'), appSecret: null, allowSignup: true },
      trondealer: {
        enabled: false, apiKey: null, webhookSecret: null,
        networks: (env('TRONDEALER_NETWORKS', 'tron,bsc,pol,sol')).split(',').map(s => s.trim()).filter(Boolean),
        assets: (env('TRONDEALER_ASSETS', 'USDT,USDC')).split(',').map(s => s.trim().toUpperCase()).filter(Boolean),
      },
      notify: { telegramToken: null, telegramChatId: env('TELEGRAM_ADMIN_CHAT_ID') },
    },
    plans: DEFAULT_PLANS.map(p => JSON.parse(JSON.stringify(p))),
    requests: [],
    subs: {},
    seenEvents: [],       // webhook idempotency keys, newest last (capped)
  };
}

// The env var behind each secret, used while the admin has not stored one.
const SECRET_ENV = {
  'qvapay.appSecret': 'QVAPAY_APP_SECRET',
  'miniapp.appSecret': 'QVAPAY_MINIAPP_APP_SECRET',
  'trondealer.apiKey': 'TRONDEALER_API_KEY',
  'trondealer.webhookSecret': 'TRONDEALER_WEBHOOK_SECRET',
  'notify.telegramToken': 'TELEGRAM_BOT_TOKEN',
};

const getPath = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
function setPath(o, p, v) {
  const ks = p.split('.');
  let a = o;
  for (const k of ks.slice(0, -1)) a = a[k] = a[k] && typeof a[k] === 'object' ? a[k] : {};
  a[ks[ks.length - 1]] = v;
}

export function createStore({ dataDir, secret }) {
  const file = path.join(dataDir, 'billing.json');
  const proofDir = path.join(dataDir, 'billing-proofs');
  const key = crypto.createHmac('sha256', String(secret)).update('tallaya-billing-secrets').digest();
  let doc = null;

  const encrypt = text => {
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv('aes-256-gcm', key, iv);
    const body = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
    return { v: 1, iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), data: body.toString('base64') };
  };
  const decrypt = blob => {
    if (!blob || typeof blob !== 'object') return '';
    try {
      const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(blob.iv, 'base64'));
      d.setAuthTag(Buffer.from(blob.tag, 'base64'));
      return Buffer.concat([d.update(Buffer.from(blob.data, 'base64')), d.final()]).toString('utf8');
    } catch { return ''; }
  };

  function merge(base, stored) {
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return base;
    const out = { ...base };
    for (const [k, v] of Object.entries(stored)) {
      out[k] = base[k] && typeof base[k] === 'object' && !Array.isArray(base[k]) && v && typeof v === 'object' && !Array.isArray(v)
        ? merge(base[k], v) : v;
    }
    return out;
  }

  function load() {
    if (doc) return doc;
    let stored = null;
    try { stored = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) {
      if (e.code !== 'ENOENT') {
        // Kept aside, never overwritten silently: payment history is money.
        try { fs.copyFileSync(file, file + '.damaged-' + Date.now()); } catch { /* nothing to keep */ }
      }
    }
    const base = defaults();
    doc = stored ? { ...base, ...stored, settings: merge(base.settings, stored.settings) } : base;
    if (!Array.isArray(doc.requests)) doc.requests = [];
    if (!doc.subs || typeof doc.subs !== 'object') doc.subs = {};
    if (!Array.isArray(doc.plans) || !doc.plans.length) doc.plans = base.plans;
    if (!Array.isArray(doc.seenEvents)) doc.seenEvents = [];
    return doc;
  }
  function save() {
    atomicWrite(file, JSON.stringify(load(), null, 1), 0o600);
  }

  /** The secret in force for a dotted field: the admin's, else the env's. */
  function secretOf(field) {
    const stored = decrypt(getPath(load().settings, field));
    return stored || env(SECRET_ENV[field] || '');
  }
  /** Set (string), keep (undefined) or clear (null or '') a secret. */
  function setSecret(field, value) {
    if (value === undefined) return;
    setPath(load().settings, field, value ? encrypt(value) : null);
  }
  /** Settings for the dashboard: every secret replaced by whether one is in force and where from. */
  function maskedSettings() {
    const s = JSON.parse(JSON.stringify(load().settings));
    for (const f of SECRET_FIELDS) {
      const stored = !!decrypt(getPath(load().settings, f));
      const fromEnv = !stored && !!env(SECRET_ENV[f] || '');
      setPath(s, f, { set: stored || fromEnv, source: stored ? 'admin' : fromEnv ? 'env' : null });
    }
    return s;
  }

  function rememberEvent(k) {
    const d = load();
    if (d.seenEvents.includes(k)) return false;
    d.seenEvents.push(k);
    if (d.seenEvents.length > 2000) d.seenEvents.splice(0, d.seenEvents.length - 2000);
    return true;
  }

  return {
    load, save, secretOf, setSecret, maskedSettings, rememberEvent, proofDir,
    reset: () => { doc = null; },
  };
}
