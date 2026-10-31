// @vitest-environment happy-dom
// Plans and payments: the plan in force, the prices in the currency picked, and the checkout
// opening the payment sheet with the account to pay to. Every amount comes from the server.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => ({ answers: {}, posts: [], sheets: [], toasts: [] }))
vi.mock('../lib/api.js', () => ({
  remoteAuth: () => null,
  api: (path, opts) => {
    if (opts?.method === 'POST') { mocks.posts.push({ path, body: JSON.parse(opts.body) }); return Promise.resolve(mocks.answers['POST ' + path]) }
    const key = path.split('?')[0]
    return key in mocks.answers ? Promise.resolve(mocks.answers[key]) : Promise.reject(new Error('not found'))
  },
}))
vi.mock('../lib/mobile.js', () => ({ MOBILE: false }))
vi.mock('../store/useStore.js', () => {
  const snap = () => ({ user: { id: 'u1', name: 'Ana' } })
  const useStore = selector => selector ? selector(snap()) : snap()
  useStore.getState = snap
  return { useStore }
})
vi.mock('../store/useUI.js', () => {
  const snap = () => ({ toast: m => mocks.toasts.push(m), openSheet: render => mocks.sheets.push(render) })
  const useUI = selector => selector ? selector(snap()) : snap()
  useUI.getState = snap
  return { useUI }
})
vi.mock('react-router-dom', () => ({ useNavigate: () => () => {} }))
vi.mock('../sheets.jsx', () => ({ confirmSheet: vi.fn() }))
vi.mock('./MobileOnboarding.jsx', () => ({ ConnectSheet: () => null }))

import Plans from './Plans.jsx'

const CATALOG = {
  enabled: true, cycles: ['month', 'quarter', 'year'], crypto: [],
  methods: [
    { id: 'transfermovil_cup', label: 'Transfermóvil (CUP)', currency: 'CUP', kind: 'manual', minUsd: 0, available: true },
    { id: 'paypal', label: 'PayPal', currency: 'USD', kind: 'topup', minUsd: 2, available: true },
  ],
  plans: [
    { id: 'free', name: 'Arranque', perks: ['Rutinas'], features: {}, prices: {}, rank: 0 },
    { id: 'talla', name: 'En Talla', perks: ['Coach IA'], features: { coach: true }, rank: 0.06, prices: {
      month: { usd: '1.99', days: 30, methods: { transfermovil_cup: { currency: 'CUP', amount: '1040' }, paypal: { currency: 'USD', amount: '1.99', tooSmall: true } } },
      quarter: { usd: '4.99', days: 90, methods: { transfermovil_cup: { currency: 'CUP', amount: '2600' }, paypal: { currency: 'USD', amount: '4.99' } } },
    } },
  ],
}
const ME = { enabled: true, plan: { id: 'free', name: 'Arranque' }, current: null, queue: [], requests: [], qvapay: null }

const mounted = []
function render(el) {
  const host = document.createElement('div'); document.body.appendChild(host)
  const root = createRoot(host); mounted.push(root)
  act(() => root.render(el))
  return host
}
const settle = () => act(() => new Promise(r => setTimeout(r, 0)))
const text = h => h.textContent.replace(/ /g, ' ')

beforeEach(() => {
  document.body.innerHTML = ''
  mocks.posts.length = 0; mocks.sheets.length = 0; mocks.toasts.length = 0
  mocks.answers = { '/api/billing/plans': CATALOG, '/api/billing/me': ME }
})
afterEach(() => { while (mounted.length) act(() => mounted.pop().unmount()) })

describe('Plans', () => {
  it('muestra el plan actual y el precio en USD de la primera moneda', async () => {
    const h = render(<Plans />); await settle()
    expect(text(h)).toContain('Arranque')
    expect(text(h)).toContain('En Talla')
    expect(text(h)).toContain('4.99 USD')
  })

  it('al elegir CUP enseña el importe en CUP y la referencia en USD', async () => {
    const h = render(<Plans />); await settle()
    const cup = [...h.querySelectorAll('.plans-cur .chip')].find(b => b.textContent === 'CUP')
    act(() => cup.click())
    expect(text(h)).toContain('2 600 CUP')
    expect(text(h)).toContain('Reference price 4.99 USD')
  })

  it('el checkout abre la hoja de pago con la cuenta a la que transferir', async () => {
    mocks.answers['POST /api/billing/checkout'] = { request: { id: 'r1', ref: 'TY-AAAAAA', planName: 'En Talla', cycle: 'quarter', method: 'transfermovil_cup', methodLabel: 'Transfermóvil (CUP)', kind: 'manual', currency: 'CUP', amount: '2600', status: 'pending', account: { card: '9205 0000 1111 2222', phone: '55555555' } } }
    const h = render(<Plans />); await settle()
    act(() => [...h.querySelectorAll('button')].find(b => b.textContent === 'Choose En Talla').click())
    expect(mocks.sheets).toHaveLength(1)
    const sheetHost = render(mocks.sheets[0](() => {}))
    act(() => [...sheetHost.querySelectorAll('.lrow')].find(r => r.textContent.includes('Transfermóvil')).click())
    await settle()
    expect(mocks.posts[0]).toEqual({ path: '/api/billing/checkout', body: { plan: 'talla', cycle: 'quarter', method: 'transfermovil_cup', miniapp: false } })
    const pay = render(mocks.sheets[1](() => {}))
    expect(text(pay)).toContain('2 600 CUP')
    expect(text(pay)).toContain('9205 0000 1111 2222')
    expect(text(pay)).toContain('Send receipt')
  })

  it('sin cobros abiertos lo dice en vez de mostrar precios', async () => {
    mocks.answers['/api/billing/plans'] = { ...CATALOG, enabled: false }
    const h = render(<Plans />); await settle()
    expect(text(h)).toContain('Paid plans open soon')
    expect(h.querySelector('.plan-card')).toBeNull()
  })
})
