/* The outside services billing talks to: QvaPay (invoices, top-ups, the mini-app identity) and
 * TronDealer (stablecoin wallets). Network calls take an injectable fetch; the signature checks
 * are pure and constant-time. Docs: QvaArbi's docs/qvapay-actualizado (Merchants, MiniApps) and
 * its spec-architecture-crypto-payments-trondealer.md.
 */
import crypto from 'node:crypto';

export const QVAPAY_BASE = 'https://api.qvapay.com';
export const TRONDEALER_BASE = 'https://www.trondealer.com/api/v2';

/* ---------- signatures ---------- */
const hexEq = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length || !/^[0-9a-f]*$/i.test(a)) return false;
  try { return crypto.timingSafeEqual(Buffer.from(a.toLowerCase(), 'hex'), Buffer.from(b.toLowerCase(), 'hex')); } catch { return false; }
};
const hmacHex = (key, data) => crypto.createHmac('sha256', key).update(data).digest('hex');
const stripPrefix = s => String(s || '').trim().replace(/^sha256=/i, '');

/** QvaPay webhook: HMAC-SHA256 of the raw body with an app-secret (any of `secrets`), fresh timestamp. */
export function verifyQvapayWebhook(raw, signature, timestamp, secrets, now = Date.now()) {
  const sig = stripPrefix(signature);
  if (!sig) return { ok: false, reason: 'no-signature' };
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return { ok: false, reason: 'no-timestamp' };
  if (Math.abs(now / 1000 - ts) > 300) return { ok: false, reason: 'stale' };
  for (const s of secrets.filter(Boolean)) if (hexEq(sig, hmacHex(s, raw))) return { ok: true };
  return { ok: false, reason: 'bad-signature' };
}

/** TronDealer webhook: `X-Signature-256: sha256=<hex>` over the raw body. */
export function verifyTrondealerWebhook(raw, signature, secret) {
  if (!secret) return false;
  const sig = stripPrefix(signature);
  return !!sig && hexEq(sig, hmacHex(secret, raw));
}

/**
 * QvaPay mini-app identity (MiniApps/Identidad.md): `init_data` is a query string signed with
 * HMAC(key = HMAC("QvaPayMiniApp", app-secret), data = sorted "k=v" lines). Checks the app and the
 * age too. Returns { user, scopes, nonce, authDate } or throws an Error with a `code`.
 */
export function verifyInitData(initData, appSecret, appUuid, { maxAgeSec = 600, now = Date.now() } = {}) {
  const fail = code => Object.assign(new Error('mini-app sign-in refused: ' + code), { code });
  if (typeof initData !== 'string' || initData.length > 8192) throw fail('malformed');
  if (!appSecret) throw fail('not-configured');
  const params = new URLSearchParams(initData);
  const hash = params.get('hash') || '';
  params.delete('hash');
  const dataCheck = [...params.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secretKey = crypto.createHmac('sha256', 'QvaPayMiniApp').update(appSecret).digest();
  if (!hexEq(hash, hmacHex(secretKey, dataCheck))) throw fail('bad-signature');
  const authDate = Number(params.get('auth_date'));
  if (!Number.isFinite(authDate) || now / 1000 - authDate > maxAgeSec || authDate - now / 1000 > 60) throw fail('expired');
  if (appUuid && params.get('app_uuid') !== appUuid) throw fail('other-app');
  let user;
  try { user = JSON.parse(params.get('user') || ''); } catch { throw fail('malformed'); }
  if (!user || typeof user.uuid !== 'string' || !/^[0-9a-f-]{8,64}$/i.test(user.uuid)) throw fail('malformed');
  return { user, scopes: (params.get('scopes') || '').split(',').filter(Boolean), nonce: params.get('nonce') || '', authDate };
}

/* ---------- QvaPay merchant calls (app credentials) ---------- */
async function post(fetchImpl, url, headers, body) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 20000);
  try {
    const r = await fetchImpl(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers }, body: JSON.stringify(body), signal: ctl.signal });
    let data = null;
    try { data = await r.json(); } catch { /* not json */ }
    if (!r.ok) {
      const msg = (data && (data.error || data.message)) || ('HTTP ' + r.status);
      throw Object.assign(new Error(String(msg).slice(0, 200)), { status: r.status, gateway: true });
    }
    return data || {};
  } finally { clearTimeout(timer); }
}

const appHeaders = creds => ({ 'app-id': creds.appId, 'app-secret': creds.appSecret });

/** An invoice paid from a QvaPay balance (also what a mini-app pays with payInvoice). */
export async function createInvoice(creds, { amount, description, remoteId, webhook, expireAt }, fetchImpl = globalThis.fetch) {
  const body = { amount: Math.round(amount * 100) / 100, description: String(description).slice(0, 255), remote_id: String(remoteId) };
  if (webhook) body.webhook = webhook;
  if (expireAt) body.expire_at = new Date(expireAt).toISOString();
  const d = await post(fetchImpl, QVAPAY_BASE + '/v2/create_invoice', appHeaders(creds), body);
  if (!d.transaction_uuid) throw Object.assign(new Error('the gateway returned no invoice'), { gateway: true });
  return { uuid: d.transaction_uuid, url: d.url || null };
}

/** A top-up with a pay_method coin: PayPal or a card. The signed webhook confirms it. */
export async function createTopup(creds, { amount, coin, webhook, feeMode }, fetchImpl = globalThis.fetch) {
  const body = { amount: Math.round(amount * 100) / 100, pay_method: coin, webhook_url: webhook };
  if (feeMode) body.fee_mode = feeMode;
  const d = await post(fetchImpl, QVAPAY_BASE + '/api/topup', appHeaders(creds), body);
  const data = d.data || d;
  if (!data.transaction_uuid) throw Object.assign(new Error('the gateway returned no top-up'), { gateway: true });
  return { uuid: data.transaction_uuid, url: data.redirect_url || data.transaction_url || null };
}

/** The app behind a pair of credentials (Merchants/Info.md): the admin's "test connection". */
export async function qvapayInfo(creds, fetchImpl = globalThis.fetch) {
  return post(fetchImpl, QVAPAY_BASE + '/v2/info', appHeaders(creds), {});
}

/* ---------- TronDealer ---------- */
// The allowlist of networks and tokens (QvaArbi's crypto_networks.py): stablecoins only.
export const NETWORKS = Object.freeze({
  tron: { family: 'tron', label: 'TRON (TRC20)', tokens: ['USDT'] },
  bsc: { family: 'evm', label: 'BSC (BEP20)', tokens: ['USDT', 'USDC'] },
  pol: { family: 'evm', label: 'Polygon', tokens: ['USDT', 'USDC'] },
  arb: { family: 'evm', label: 'Arbitrum', tokens: ['USDT', 'USDC'] },
  base: { family: 'evm', label: 'Base', tokens: ['USDT', 'USDC'] },
  eth: { family: 'evm', label: 'Ethereum', tokens: ['USDT', 'USDC'] },
  opt: { family: 'evm', label: 'Optimism', tokens: ['USDT', 'USDC'] },
  avax: { family: 'evm', label: 'Avalanche', tokens: ['USDT', 'USDC'] },
  sol: { family: 'sol', label: 'Solana', tokens: ['USDT', 'USDC'] },
});
const ASSIGN_PATH = { evm: '/wallets/assign', tron: '/tron/wallets/assign', sol: '/sol/wallets/assign' };

export const validCombo = (network, asset) => !!NETWORKS[network]?.tokens.includes(asset);

/** A deposit wallet for one payment request; TronDealer reuses it for the same label. */
export async function assignWallet(apiKey, label, network, fetchImpl = globalThis.fetch) {
  const fam = NETWORKS[network]?.family;
  if (!fam) throw new Error('unknown network');
  const d = await post(fetchImpl, TRONDEALER_BASE + ASSIGN_PATH[fam], { 'x-api-key': apiKey }, { label });
  const w = d.wallet || d.data || d;
  if (!w.address) throw Object.assign(new Error('the gateway returned no wallet'), { gateway: true });
  return { address: String(w.address) };
}

/** confirmed/notified/swept, or the event type saying so. Never on `detected`. */
export function tronConfirmed(event) {
  const data = event && typeof event.data === 'object' && event.data ? event.data : {};
  const status = String(event?.status || data.status || '').toLowerCase();
  if (['confirmed', 'notified', 'swept'].includes(status)) return true;
  return ['transaction.confirmed', 'transaction.swept'].includes(String(event?.event || '').toLowerCase());
}
