import { describe, expect, it, vi } from 'vitest'
import { inMiniApp, miniReady, payInvoice, requestLogin } from './miniapp.js'

const win = (QvaPay, pathname = '/') => ({ QvaPay, location: { pathname }, addEventListener: () => {}, removeEventListener: () => {} })

describe('miniapp', () => {
  it('sabe si está dentro de QvaPay por el SDK o por la ruta /miniapp', () => {
    expect(inMiniApp(win(undefined))).toBe(false)
    expect(inMiniApp(win({}))).toBe(true)
    expect(inMiniApp(win(undefined, '/miniapp'))).toBe(true)
  })

  it('ready no rompe fuera de la app', () => {
    expect(() => miniReady(win(undefined))).not.toThrow()
    const ready = vi.fn(); miniReady(win({ ready })); expect(ready).toHaveBeenCalled()
  })

  it('pide la identidad firmada y la devuelve tal cual', async () => {
    const q = { auth: { requestLogin: vi.fn(async () => ({ init_data: 'a=1&hash=x' })) } }
    expect(await requestLogin(win(q))).toBe('a=1&hash=x')
    expect(q.auth.requestLogin).toHaveBeenCalledWith({ scopes: ['profile'] })
  })

  it('pagar: true si pagó, false si cerró la hoja', async () => {
    expect(await payInvoice('u', win({ payments: { payInvoice: async () => ({ status: 'paid' }) } }))).toBe(true)
    expect(await payInvoice('u', win({ payments: { payInvoice: async () => { throw Object.assign(new Error('x'), { code: 'USER_CANCELLED' }) } } }))).toBe(false)
    await expect(payInvoice('u', win(undefined))).rejects.toThrow()
  })
})
