/* TallaYa: OPENROUTER_API_KEY wires the Coach to OpenRouter on first boot, once, and never
 * over a setup the admin chose. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tempData } from './helpers.mjs';

const dir = tempData();
const cfg = await import('../coach/config.js');
const { bootstrapOpenRouter, OPENROUTER_BASE } = await import('../coach/openrouter.js');
const FILE = path.join(dir, 'coach.json');
const fresh = (obj = {}) => { fs.writeFileSync(FILE, JSON.stringify(obj)); cfg.reset(); };

test('sin clave no toca nada', () => {
  fresh();
  assert.deepEqual(bootstrapOpenRouter({}), { done: false, reason: 'no-key' });
  assert.equal(cfg.load().enabled, false);
});

test('con clave deja el coach encendido en OpenRouter, con la clave cifrada', () => {
  fresh();
  assert.equal(bootstrapOpenRouter({ OPENROUTER_API_KEY: 'sk-or-123', ORIGIN: 'https://tallaya.example' }).done, true);
  const c = cfg.load();
  assert.equal(c.provider, 'compatible');
  assert.equal(c.enabled, true);
  assert.equal(cfg.optionsFor(c).baseUrl, OPENROUTER_BASE);
  assert.equal(cfg.optionsFor(c).headers['x-title'], 'TallaYa');
  assert.equal(cfg.decrypt(cfg.authFor(c).data).token, 'sk-or-123');
  assert.equal(cfg.modelFor(c), 'openai/gpt-4.1-mini');
  assert.ok(!fs.readFileSync(FILE, 'utf8').includes('sk-or-123'));
  assert.ok(cfg.isConnected());
  // Una sola vez: lo que cambie el admin después se queda.
  cfg.saveModel('compatible', 'anthropic/claude-x');
  assert.equal(bootstrapOpenRouter({ OPENROUTER_API_KEY: 'otra' }).reason, 'already');
  assert.equal(cfg.modelFor(cfg.load()), 'anthropic/claude-x');
});

test('respeta otro proveedor que el admin ya encendió', () => {
  fresh({ enabled: true, provider: 'openai' });
  assert.equal(bootstrapOpenRouter({ OPENROUTER_API_KEY: 'sk-or' }).reason, 'admin-configured');
  assert.equal(cfg.load().provider, 'openai');
});
