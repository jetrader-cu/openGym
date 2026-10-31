/* The day's exchange rates for converting USD prices: units of each currency per 1 USD.
 *
 * Source: the public P2P averages of the market TallaYa's payments already go through (median of
 * the last 24 h, wider window when there are few trades). The app never names the source; users
 * see "tasa del día". The admin can pin a manual rate per currency, or keep the market one, and
 * add a margin on top (catalog.quote applies the margin).
 */

export const AVERAGES_URL = 'https://api.qvapay.com/p2p/averages';
// Market ticks behind each rate key of catalog.RATE_KEYS.
export const TICKS = Object.freeze({ CUP: 'BANK_CUP', MLC: 'BANK_MLC', CLASICA: 'CLASICA', SALDO: 'ETECSA' });
const TTL_MS = 10 * 60000;

const positive = v => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);

/** Market rates out of an averages document: median first, average if there is no median. */
export function marketRates(doc) {
  const out = {};
  if (!doc || typeof doc !== 'object') return out;
  for (const [key, tick] of Object.entries(TICKS)) {
    const row = doc[tick];
    if (!row || typeof row !== 'object') continue;
    const r = positive(row.median) || positive(row.average);
    if (r) out[key] = Math.round(r * 10000) / 10000;
  }
  return out;
}

/**
 * The rates to price with: per key, the admin's manual one when that key is set to manual (or the
 * market has none), else the market's. Returns { rates, sources } where a source is
 * 'market' | 'manual' | null (no rate: the methods in that currency are not offered).
 */
export function effectiveRates(market, cfg = {}) {
  const rates = {}, sources = {};
  for (const key of Object.keys(TICKS)) {
    const c = cfg[key] || {};
    const manual = positive(typeof c.manual === 'string' ? Number(c.manual) : c.manual);
    const m = positive(market[key]);
    if (c.mode === 'manual' && manual) { rates[key] = manual; sources[key] = 'manual'; }
    else if (m) { rates[key] = m; sources[key] = 'market'; }
    else if (manual) { rates[key] = manual; sources[key] = 'manual'; }
    else sources[key] = null;
  }
  return { rates, sources };
}

/** A cached reader. `fetchImpl` is injectable for tests; failures keep the last good answer. */
export function createRateSource({ fetchImpl = globalThis.fetch, url = AVERAGES_URL, ttl = TTL_MS } = {}) {
  let cache = { at: 0, market: {}, ok: false };
  let inflight = null;
  async function refresh() {
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 8000);
      const r = await fetchImpl(url, { headers: { Accept: 'application/json' }, signal: ctl.signal });
      clearTimeout(timer);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const market = marketRates(await r.json());
      if (Object.keys(market).length) cache = { at: Date.now(), market, ok: true };
      else cache = { ...cache, at: Date.now() };
    } catch {
      // Keep the last good rates; try again on the next read after a short pause.
      cache = { ...cache, at: Date.now() - ttl + 60000 };
    }
  }
  return {
    async market() {
      if (Date.now() - cache.at > ttl) {
        inflight = inflight || refresh().finally(() => { inflight = null; });
        await inflight;
      }
      return { ...cache.market };
    },
    status: () => ({ updatedAt: cache.ok ? cache.at : null }),
    _set: market => { cache = { at: Date.now(), market, ok: true }; },
  };
}
