/* TallaYa runs its AI Coach on OpenRouter. OpenRouter speaks the OpenAI API, so it is the
 * `compatible` provider pointed at https://openrouter.ai/api (the adapter adds /v1/...).
 *
 * With OPENROUTER_API_KEY in the environment, the first boot wires it up: provider, base URL,
 * the attribution headers OpenRouter asks for, the key (encrypted like any key pasted in the
 * dashboard), the model and the switch. Only once: after that the Admin → AI Coach card is the
 * place to change it, and a key or provider the admin chose is never overwritten.
 */
import * as cfg from './config.js';
import { validateHeaders } from './core/providers.js';

export const OPENROUTER_BASE = 'https://openrouter.ai/api';
export const DEFAULT_MODEL = 'openai/gpt-4.1-mini';

export function bootstrapOpenRouter(env = process.env) {
  const key = String(env.OPENROUTER_API_KEY || '').trim();
  if (!key) return { done: false, reason: 'no-key' };
  const c = cfg.load();
  if (c.openrouterBootstrapped) return { done: false, reason: 'already' };
  // An instance the admin already set up some other way is left as it is.
  if (c.enabled && c.provider !== 'compatible') {
    cfg.save({ openrouterBootstrapped: true });
    return { done: false, reason: 'admin-configured' };
  }
  cfg.saveOptions('compatible', {
    baseUrl: OPENROUTER_BASE,
    headers: validateHeaders({ 'HTTP-Referer': String(env.ORIGIN || 'https://tallaya.qvaarbi.com'), 'X-Title': 'TallaYa' }).value,
  });
  if (!cfg.authFor(cfg.load(), 'compatible')) {
    cfg.saveAuth('compatible', { type: 'apikey', account: 'OpenRouter', data: cfg.encrypt({ token: key }), connectedAt: new Date().toISOString() });
  }
  if (!cfg.modelFor(cfg.load(), 'compatible')) cfg.saveModel('compatible', String(env.OPENROUTER_MODEL || DEFAULT_MODEL).trim());
  cfg.save({ provider: 'compatible', enabled: true, authMode: 'instance', openrouterBootstrapped: true });
  return { done: true };
}
