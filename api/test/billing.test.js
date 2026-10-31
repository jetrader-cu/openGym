/* TallaYa billing: prices, rates, subscriptions, signatures and the full route flow with the
   gateways faked (no network: QvaPay and TronDealer are a fetch stand-in). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import {
  quote, roundUp, sanitizePlans, planRank, applyPurchase, resolveSub, activePlanId, canMove, payRef, DEFAULT_PLANS,
} from '../billing/catalog.js';
import { marketRates, effectiveRates, createRateSource } from '../billing/rates.js';
import { verifyQvapayWebhook, verifyTrondealerWebhook, verifyInitData, validCombo, tronConfirmed } from '../billing/gateways.js';
import { billingModule, decodeProofImage } from '../billing/routes.js';

const DAY = 86400000;

/* ------------------------------ catalog ------------------------------ */

test('el precio en CUP sale de la tasa y el margen, redondeado hacia arriba a 10', () => {
  assert.deepEqual(quote('transfermovil_cup', 1.99, { CUP: 500 }, { CUP: 5 }), { currency: 'CUP', amount: 1050, rate: 525 });
  assert.equal(quote('enzona_cup', 1.99, { CUP: 512.3 }).amount, 1020);
  assert.deepEqual(quote('saldo_movil', 4.99, { SALDO: 600 }), { currency: 'SALDO', amount: 3000, rate: 600 });
});

test('las pasarelas en USD cobran 1:1 y la Clasica usa su propia tasa', () => {
  assert.deepEqual(quote('paypal', 4.99), { currency: 'USD', amount: 4.99, rate: 1 });
  assert.deepEqual(quote('crypto', 14.99, {}), { currency: 'USD', amount: 14.99, rate: 1 });
  assert.equal(quote('transfermovil_usd', 10, { CLASICA: 1.12 }).amount, 11.2);
  assert.equal(quote('transfermovil_mlc', 1.99, { MLC: 1.1 }).amount, 2.19);
});

test('sin tasa no hay precio, y un metodo desconocido se rechaza', () => {
  assert.equal(quote('transfermovil_cup', 1.99, {}).error, 'rate unavailable');
  assert.equal(quote('nope', 1).error, 'unknown method');
  assert.equal(quote('paypal', 0).error, 'nothing to pay');
});

test('roundUp nunca cobra de menos ni un centavo de mas por coma flotante', () => {
  assert.equal(roundUp(1.1, 'USD'), 1.1);
  assert.equal(roundUp(2.191, 'MLC'), 2.2);
  assert.equal(roundUp(1001, 'CUP'), 1010);
  assert.equal(roundUp(1000, 'CUP'), 1000);
});

test('sanitizePlans exige un plan gratis, ids validos y precios positivos', () => {
  assert.ok(sanitizePlans(DEFAULT_PLANS).plans);
  assert.match(sanitizePlans([{ id: 'x', prices: { month: 1 } }]).error, /free/);
  assert.match(sanitizePlans([{ id: 'Bad Id', prices: {} }]).error, /bad/);
  const r = sanitizePlans([{ id: 'free', prices: {} }, { id: 'pro', name: 'Pro', prices: { month: '2.499', year: -3 }, features: { coach: 1, coachMonthly: '40' } }]);
  assert.deepEqual(r.plans[1].prices, { month: 2.5 });
  assert.deepEqual(r.plans[1].features, { coach: true, coachMonthly: 40 });
});

test('planRank ordena por precio mensual equivalente', () => {
  const [free, talla, entr] = DEFAULT_PLANS;
  assert.equal(planRank(free), 0);
  assert.ok(planRank(entr) > planRank(talla));
});

/* ------------------------------ subscriptions ------------------------------ */

const rank = id => ({ free: 0, talla: 1, entrenador: 2 })[id] ?? 0;

test('comprar el mismo plan alarga el final', () => {
  const t = 1_000 * DAY;
  let s = applyPurchase(null, 'talla', 30, t, rank);
  s = applyPurchase(s, 'talla', 30, t + 10 * DAY, rank);
  assert.equal(s.current.end, t + 60 * DAY);
  assert.equal(activePlanId(s, t + 59 * DAY), 'talla');
  assert.equal(activePlanId(s, t + 61 * DAY), 'free');
});

test('un plan mejor empieza ya y los dias del otro esperan en la cola', () => {
  const t = 1_000 * DAY;
  let s = applyPurchase(null, 'talla', 30, t, rank);
  s = applyPurchase(s, 'entrenador', 30, t + 10 * DAY, rank);
  assert.equal(s.current.plan, 'entrenador');
  assert.equal(s.queue[0].plan, 'talla');
  assert.equal(Math.round(s.queue[0].ms / DAY), 20);
  // Cuando acaba Entrenador vuelven los 20 dias de En Talla, sin perder ninguno.
  const later = resolveSub(s, t + 45 * DAY);
  assert.equal(later.current.plan, 'talla');
  assert.equal(later.current.end, t + 60 * DAY);
});

test('un plan peor espera detras del actual', () => {
  const t = 1_000 * DAY;
  let s = applyPurchase(null, 'entrenador', 30, t, rank);
  s = applyPurchase(s, 'talla', 90, t, rank);
  assert.equal(s.current.plan, 'entrenador');
  assert.deepEqual(s.queue.map(q => q.plan), ['talla']);
  assert.equal(activePlanId(s, t + 100 * DAY), 'talla');
});

test('las transiciones de estado son las permitidas', () => {
  assert.ok(canMove('pending', 'review', 'user'));
  assert.ok(canMove('review', 'paid', 'admin'));
  assert.ok(canMove('rejected', 'review', 'user'));
  assert.ok(canMove('expired', 'paid', 'gateway'));
  assert.ok(!canMove('expired', 'paid', 'admin'));
  assert.ok(!canMove('paid', 'rejected', 'admin'));
  assert.ok(!canMove('cancelled', 'paid', 'gateway'));
  assert.equal(payRef('abcDEF123xyz'), 'TY-123XYZ');
});

/* ------------------------------ rates ------------------------------ */

const AVERAGES = {
  BANK_CUP: { average: 498, median: 500 }, BANK_MLC: { average: 1.1, median: 0 },
  CLASICA: { average: 1.12 }, ETECSA: { average: 0, median: 0 }, OTHER: { average: 9 },
};

test('marketRates usa la mediana y si no hay, el promedio; ignora ceros', () => {
  assert.deepEqual(marketRates(AVERAGES), { CUP: 500, MLC: 1.1, CLASICA: 1.12 });
});

test('effectiveRates: manual manda si se fija, y rellena lo que el mercado no tiene', () => {
  const r = effectiveRates({ CUP: 500, MLC: 1.1 }, { CUP: { mode: 'manual', manual: 520 }, SALDO: { mode: 'auto', manual: 650 } });
  assert.deepEqual(r.rates, { CUP: 520, MLC: 1.1, SALDO: 650 });
  assert.deepEqual(r.sources, { CUP: 'manual', MLC: 'market', CLASICA: null, SALDO: 'manual' });
});

test('la fuente de tasas guarda la ultima buena si la red falla', async () => {
  let fail = false;
  const src = createRateSource({ ttl: 0, fetchImpl: async () => { if (fail) throw new Error('down'); return { ok: true, json: async () => AVERAGES }; } });
  assert.equal((await src.market()).CUP, 500);
  fail = true;
  assert.equal((await src.market()).CUP, 500);
});

/* ------------------------------ signatures ------------------------------ */

const hmac = (k, d) => crypto.createHmac('sha256', k).update(d).digest('hex');

test('webhook de QvaPay: firma con cualquiera de los secretos, timestamp fresco', () => {
  const raw = Buffer.from('{"uuid":"u1","status":"paid"}');
  const now = 1_700_000_000_000;
  const ts = String(now / 1000);
  assert.ok(verifyQvapayWebhook(raw, 'sha256=' + hmac('s2', raw), ts, ['s1', 's2'], now).ok);
  assert.ok(verifyQvapayWebhook(raw, hmac('s1', raw), ts, ['s1'], now).ok);
  assert.equal(verifyQvapayWebhook(raw, hmac('x', raw), ts, ['s1'], now).reason, 'bad-signature');
  assert.equal(verifyQvapayWebhook(raw, hmac('s1', raw), String(now / 1000 - 900), ['s1'], now).reason, 'stale');
  assert.equal(verifyQvapayWebhook(raw, '', ts, ['s1'], now).reason, 'no-signature');
});

test('webhook de TronDealer: sha256= sobre el cuerpo crudo', () => {
  const raw = Buffer.from('{"event":"transaction.confirmed"}');
  assert.ok(verifyTrondealerWebhook(raw, 'sha256=' + hmac('k', raw), 'k'));
  assert.ok(!verifyTrondealerWebhook(raw, 'sha256=' + hmac('k', raw), 'other'));
  assert.ok(!verifyTrondealerWebhook(raw, 'sha256=' + hmac('k', raw), ''));
  assert.ok(tronConfirmed({ event: 'transaction.confirmed' }));
  assert.ok(tronConfirmed({ data: { status: 'swept' } }));
  assert.ok(!tronConfirmed({ event: 'transaction.incoming', status: 'detected' }));
  assert.ok(validCombo('tron', 'USDT') && !validCombo('tron', 'USDC') && validCombo('sol', 'USDC'));
});

function signInit(fields, appSecret) {
  const p = new URLSearchParams(fields);
  const check = [...p.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join('\n');
  const key = crypto.createHmac('sha256', 'QvaPayMiniApp').update(appSecret).digest();
  p.set('hash', crypto.createHmac('sha256', key).update(check).digest('hex'));
  return p.toString();
}
const NOW = 1_800_000_000_000;
const initFor = (uuid, extra = {}) => signInit({
  auth_date: String(Math.floor(NOW / 1000) - 5), nonce: crypto.randomBytes(16).toString('hex'), app_uuid: 'app-1', mini_app: 'tallaya',
  scopes: 'profile', user: JSON.stringify({ uuid, username: 'yuniel', name: 'Yuniel' }), ...extra,
}, 'mini-secret');

test('init_data de la mini-app: firma, app y edad', () => {
  const ok = verifyInitData(initFor('0f0e0d0c-1111-2222-3333-444455556666'), 'mini-secret', 'app-1', { now: NOW });
  assert.equal(ok.user.username, 'yuniel');
  assert.throws(() => verifyInitData(initFor('0f0e0d0c-1111-2222-3333-444455556666'), 'otro', 'app-1', { now: NOW }), /bad-signature/);
  assert.throws(() => verifyInitData(initFor('0f0e0d0c-1111-2222-3333-444455556666'), 'mini-secret', 'app-2', { now: NOW }), /other-app/);
  assert.throws(() => verifyInitData(initFor('0f0e0d0c-1111-2222-3333-444455556666'), 'mini-secret', 'app-1', { now: NOW + 3600000 }), /expired/);
});

test('decodeProofImage acepta fotos reales y rechaza otra cosa', () => {
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(20)]);
  assert.equal(decodeProofImage('data:image/png;base64,' + png.toString('base64')).ext, 'png');
  assert.equal(decodeProofImage('data:image/png;base64,' + Buffer.from('hola').toString('base64')), null);
  assert.equal(decodeProofImage('data:text/html;base64,AAAA'), null);
});

/* ------------------------------ the route flow ------------------------------ */

function harness({ fetchImpl, settings } = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ty-billing-'));
  const db = [{ id: 'u1', name: 'Ana' }, { id: 'adm', name: 'Jefe', admin: true }];
  const state = { session: 'u1', clock: NOW, sent: [] };
  const fakeFetch = fetchImpl || (async (url, init) => {
    state.sent.push({ url, body: init?.body ? JSON.parse(init.body) : null, headers: init?.headers });
    if (url.includes('/v2/create_invoice')) return { ok: true, json: async () => ({ transaction_uuid: 'inv-1', url: 'https://pay/inv-1' }) };
    if (url.includes('/api/topup')) return { ok: true, json: async () => ({ data: { transaction_uuid: 'top-1', redirect_url: 'https://paypal/x' } }) };
    if (url.includes('/wallets/assign')) return { ok: true, json: async () => ({ wallet: { address: 'TAbc123' } }) };
    if (url.includes('p2p/averages')) return { ok: true, json: async () => AVERAGES };
    return { ok: true, json: async () => ({}) };
  });
  const mod = billingModule({
    json: (res, code, obj, h) => { res.code = code; res.body = obj; res.headers = h; },
    readBody: async req => req.body || {},
    readSession: () => db.find(u => u.id === state.session) || null,
    requireAdmin: (req, res) => { const u = db.find(x => x.id === state.session); if (!u?.admin) { res.code = 403; return null; } return u; },
    origin: 'https://tallaya.example', dataDir, secret: 'x'.repeat(64), fetchImpl: fakeFetch, isAdmin: u => !!u?.admin,
    now: () => state.clock,
    users: {
      find: id => db.find(u => u.id === id) || null,
      byQvapay: uuid => db.find(u => u.qvapay?.uuid === uuid) || null,
      nameTaken: n => db.some(u => u.name === n),
      create: ({ name }) => { const u = { id: 'n' + db.length, name }; db.push(u); return u; },
      hasOtherSignIn: () => false, save: () => {}, publicUser: u => ({ id: u.id, name: u.name }), sessionCookie: () => ['c=1'],
    },
  });
  const call = async (key, { body, raw, headers = {}, query = '' } = {}) => {
    const req = raw ? Object.assign(Readable.from([Buffer.from(raw)]), { headers, url: '/x' + query }) : { body, headers, url: '/x' + query };
    const res = {};
    await mod.routes[key](req, res);
    return res;
  };
  const asAdmin = async (key, opts) => { const prev = state.session; state.session = 'adm'; try { return await call(key, opts); } finally { state.session = prev; } };
  return { mod, call, asAdmin, state, db, dataDir };
}

test('flujo manual: checkout en CUP, comprobante, aprobación y plan activo', async () => {
  const h = harness();
  await h.asAdmin('POST /api/admin/billing/settings', { body: {
    enabled: true, methods: { transfermovil_cup: { enabled: true } },
    accounts: { transfermovil_cup: { card: '9205 1234 5678 9012', phone: '55555555', holder: 'TallaYa' } },
    rates: { CUP: { markupPct: 4 } },
  } });
  const plans = await h.call('GET /api/billing/plans');
  assert.equal(plans.body.enabled, true);
  assert.deepEqual(plans.body.methods.map(m => m.id), ['transfermovil_cup']);
  assert.equal(plans.body.plans.find(p => p.id === 'talla').prices.month.methods.transfermovil_cup.amount, '1040');

  const co = await h.call('POST /api/billing/checkout', { body: { plan: 'talla', cycle: 'month', method: 'transfermovil_cup' } });
  assert.equal(co.code, 200);
  const r = co.body.request;
  assert.equal(r.amount, '1040'); assert.equal(r.currency, 'CUP'); assert.equal(r.account.card, '9205 1234 5678 9012');
  // El mismo pedido abierto se devuelve en vez de duplicarse.
  assert.equal((await h.call('POST /api/billing/checkout', { body: { plan: 'talla', cycle: 'month', method: 'transfermovil_cup' } })).body.reused, true);

  assert.equal((await h.call('POST /api/billing/proof', { body: { id: r.id, ref: '12' } })).code, 400);
  const pr = await h.call('POST /api/billing/proof', { body: { id: r.id, ref: 'TMX9988776', phone: '53123456' } });
  assert.equal(pr.body.request.status, 'review');

  const list = await h.asAdmin('GET /api/admin/billing/requests', { query: '?status=review' });
  assert.equal(list.body.requests.length, 1);
  const ok = await h.asAdmin('POST /api/admin/billing/decide', { body: { id: r.id, action: 'approve' } });
  assert.equal(ok.body.request.status, 'paid');

  const me = await h.call('GET /api/billing/me');
  assert.equal(me.body.plan.id, 'talla');
  assert.ok(me.body.current.end > NOW + 29 * DAY);
  assert.equal(h.mod.canUseCoach(h.db[0]), true);
});

test('QvaPay: factura, webhook firmado confirma, repetido es idempotente y sin firma no entra', async () => {
  const h = harness();
  await h.asAdmin('POST /api/admin/billing/settings', { body: { enabled: true, methods: { qvapay: { enabled: true } }, qvapay: { appId: 'app', appSecret: 'secret-app' } } });
  const co = await h.call('POST /api/billing/checkout', { body: { plan: 'talla', cycle: 'quarter', method: 'qvapay' } });
  assert.equal(co.body.request.gateway.url, 'https://pay/inv-1');
  const sentInvoice = h.state.sent.find(s => s.url.includes('create_invoice'));
  assert.equal(sentInvoice.body.amount, 4.99);
  assert.equal(sentInvoice.headers['app-secret'], 'secret-app');
  assert.equal(sentInvoice.body.webhook, 'https://tallaya.example/api/billing/webhook/qvapay');

  const raw = JSON.stringify({ transaction_uuid: 'inv-1', remote_id: co.body.request.id, status: 'paid', amount: '4.99' });
  const ts = String(Math.floor(NOW / 1000));
  assert.equal((await h.call('POST /api/billing/webhook/qvapay', { raw, headers: { 'x-qvapay-signature': 'sha256=' + hmac('otro', raw), 'x-qvapay-timestamp': ts } })).code, 401);
  const good = { 'x-qvapay-signature': 'sha256=' + hmac('secret-app', raw), 'x-qvapay-timestamp': ts };
  assert.equal((await h.call('POST /api/billing/webhook/qvapay', { raw, headers: good })).body.ok, true);
  assert.equal((await h.call('POST /api/billing/webhook/qvapay', { raw, headers: good })).body.idempotent, true);
  assert.equal((await h.call('GET /api/billing/me')).body.plan.id, 'talla');
});

test('PayPal y tarjeta son topups con su coin; por debajo del minimo se rechaza', async () => {
  const h = harness();
  await h.asAdmin('POST /api/admin/billing/settings', { body: { enabled: true, methods: { paypal: { enabled: true }, card: { enabled: true } }, qvapay: { appId: 'app', appSecret: 's', paypalCoin: 'pypal', cardCoin: 'card' } } });
  assert.equal((await h.call('POST /api/billing/checkout', { body: { plan: 'talla', cycle: 'month', method: 'paypal' } })).body.code, 'min');
  const co = await h.call('POST /api/billing/checkout', { body: { plan: 'talla', cycle: 'year', method: 'card' } });
  assert.equal(co.body.request.gateway.url, 'https://paypal/x');
  const top = h.state.sent.find(s => s.url.includes('/api/topup'));
  assert.deepEqual([top.body.pay_method, top.body.fee_mode, top.body.amount], ['CARD', 'on_top', 14.99]);
});

test('cripto: wallet por pedido, detectado no activa, confirmado si; parcial va a revision', async () => {
  const h = harness();
  await h.asAdmin('POST /api/admin/billing/settings', { body: { enabled: true, methods: { crypto: { enabled: true } }, trondealer: { enabled: true, apiKey: 'td', webhookSecret: 'whs', networks: ['tron', 'bsc'], assets: ['USDT'] } } });
  assert.equal((await h.call('POST /api/billing/checkout', { body: { plan: 'talla', cycle: 'year', method: 'crypto', network: 'tron', asset: 'USDC' } })).body.code, 'network');
  const co = await h.call('POST /api/billing/checkout', { body: { plan: 'talla', cycle: 'year', method: 'crypto', network: 'tron', asset: 'USDT' } });
  assert.equal(co.body.request.gateway.address, 'TAbc123');
  const send = ev => { const raw = JSON.stringify(ev); return h.call('POST /api/billing/webhook/trondealer', { raw, headers: { 'x-signature-256': 'sha256=' + hmac('whs', raw) } }); };
  assert.equal((await send({ event: 'transaction.incoming', data: { to_address: 'TABC123', amount: '14.99' } })).body.ignored, 'not confirmed');
  assert.equal((await h.call('GET /api/billing/me')).body.plan.id, 'free');
  await send({ event: 'transaction.confirmed', data: { to_address: 'tabc123', amount: '14.99', tx_hash: '0xaa' } });
  assert.equal((await h.call('GET /api/billing/me')).body.plan.id, 'talla');

  const co2 = await h.call('POST /api/billing/checkout', { body: { plan: 'entrenador', cycle: 'month', method: 'crypto', network: 'bsc', asset: 'USDT' } });
  assert.equal(co2.code, 200);
  h.db.push({ id: 'z' });   // nothing else changes; the wallet fake hands back the same address
  const r2 = (await h.asAdmin('GET /api/admin/billing/requests')).body.requests.find(x => x.plan === 'entrenador');
  assert.equal(r2.status, 'pending');
});

test('el coach queda para los planes de pago cuando el cobro esta activo', async () => {
  const h = harness();
  assert.equal(h.mod.canUseCoach(h.db[0]), true);       // cobro apagado: todos
  await h.asAdmin('POST /api/admin/billing/settings', { body: { enabled: true } });
  assert.equal(h.mod.canUseCoach(h.db[0]), false);
  assert.equal(h.mod.canUseCoach(h.db[1]), true);        // el admin siempre
  await h.asAdmin('POST /api/admin/billing/grant', { body: { uid: 'u1', plan: 'talla', days: 7 } });
  assert.equal(h.mod.canUseCoach(h.db[0]), true);
});

test('los secretos se guardan cifrados y el admin solo ve si estan puestos', async () => {
  const h = harness();
  const v = await h.asAdmin('POST /api/admin/billing/settings', { body: { qvapay: { appId: 'a', appSecret: 'muy-secreto' }, trondealer: { apiKey: 'td-key' } } });
  assert.deepEqual(v.body.settings.qvapay.appSecret, { set: true, source: 'admin' });
  const file = fs.readFileSync(path.join(h.dataDir, 'billing.json'), 'utf8');
  assert.ok(!file.includes('muy-secreto') && !file.includes('td-key'));
  assert.equal(h.mod.store.secretOf('qvapay.appSecret'), 'muy-secreto');
  assert.equal((await h.call('GET /api/admin/billing')).code, 403);
});

test('mini-app: registro con QvaPay, luego entra a la misma cuenta; un nonce no vale dos veces', async () => {
  const h = harness();
  await h.asAdmin('POST /api/admin/billing/settings', { body: { miniapp: { enabled: true, appUuid: 'app-1', appId: 'mini', appSecret: 'mini-secret' } } });
  h.state.session = null;
  const uuid = '0f0e0d0c-1111-2222-3333-444455556666';
  const first = await h.call('POST /api/miniapp/login', { body: { init_data: initFor(uuid) } });
  assert.equal(first.code, 200); assert.equal(first.body.created, true); assert.equal(first.body.user.name, 'yuniel');
  const init = initFor(uuid);
  const again = await h.call('POST /api/miniapp/login', { body: { init_data: init } });
  assert.equal(again.body.created, false); assert.equal(again.body.user.id, first.body.user.id);
  assert.equal((await h.call('POST /api/miniapp/login', { body: { init_data: init } })).body.code, 'replay');

  // Una cuenta que ya existia se vincula estando dentro.
  h.state.session = 'u1';
  const other = '99999999-1111-2222-3333-444455556666';
  assert.equal((await h.call('POST /api/miniapp/link', { body: { init_data: initFor(other) } })).code, 200);
  assert.equal(h.db[0].qvapay.uuid, other);
  assert.equal((await h.call('POST /api/miniapp/link', { body: { init_data: initFor(uuid) } })).body.code, 'taken');
});

test('una factura de la mini-app sale con las credenciales de la mini-app', async () => {
  const h = harness();
  await h.asAdmin('POST /api/admin/billing/settings', { body: {
    enabled: true, methods: { qvapay: { enabled: true } }, qvapay: { appId: 'main', appSecret: 'main-s' },
    miniapp: { enabled: true, appUuid: 'app-1', appId: 'mini', appSecret: 'mini-secret' },
  } });
  const co = await h.call('POST /api/billing/checkout', { body: { plan: 'talla', cycle: 'quarter', method: 'qvapay', miniapp: true } });
  assert.equal(co.body.request.gateway.uuid, 'inv-1');
  assert.equal(h.state.sent.find(s => s.url.includes('create_invoice')).headers['app-id'], 'mini');
});

test('los pendientes caducan pasado su plazo', async () => {
  const h = harness();
  await h.asAdmin('POST /api/admin/billing/settings', { body: { enabled: true, pendingHours: 2, methods: { saldo_movil: { enabled: true } }, accounts: { saldo_movil: { phone: '55512345' } }, rates: { SALDO: { mode: 'manual', manual: 600 } } } });
  const co = await h.call('POST /api/billing/checkout', { body: { plan: 'talla', cycle: 'month', method: 'saldo_movil' } });
  assert.equal(co.body.request.amount, '1200');
  assert.equal(co.body.request.account.phone, '55512345');
  h.state.clock += 3 * 3600000;
  assert.equal((await h.call('GET /api/billing/me')).body.requests[0].status, 'expired');
});
