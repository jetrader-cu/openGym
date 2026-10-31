import { describe, expect, it } from 'vitest'
import { daysLeft, fromPrice, groupMethods, money, savingPct } from './billing.js'

const plan = {
  id: 'talla',
  prices: {
    month: { usd: '1.99', days: 30, methods: { transfermovil_cup: { currency: 'CUP', amount: '1040' }, enzona_cup: { currency: 'CUP', amount: '1030' }, paypal: { currency: 'USD', amount: '1.99', tooSmall: true } } },
    year: { usd: '14.99', days: 365, methods: { paypal: { currency: 'USD', amount: '14.99' } } },
  },
}

describe('billing', () => {
  it('agrupa los métodos por moneda en orden fijo', () => {
    const g = groupMethods([{ id: 'transfermovil_cup', currency: 'CUP' }, { id: 'paypal', currency: 'USD' }, { id: 'saldo_movil', currency: 'SALDO' }])
    expect(g.map(x => x.currency)).toEqual(['USD', 'CUP', 'SALDO'])
  })

  it('formatea los importes como se transfieren', () => {
    expect(money('1040', 'CUP')).toBe('1 040 CUP')
    expect(money('4.99', 'USD')).toBe('4.99 USD')
    expect(money('1200', 'SALDO')).toBe('1 200 CUP saldo')
    expect(money('x', 'USD')).toBe('–')
  })

  it('calcula el ahorro del periodo largo', () => {
    expect(savingPct(plan.prices, 'year')).toBe(37)
    expect(savingPct(plan.prices, 'month')).toBe(0)
  })

  it('el precio desde es el más bajo del grupo y salta el que no llega al mínimo', () => {
    const cup = { methods: [{ id: 'transfermovil_cup' }, { id: 'enzona_cup' }] }
    expect(fromPrice(plan, 'month', cup).amount).toBe('1030')
    expect(fromPrice(plan, 'month', { methods: [{ id: 'paypal' }] })).toBeNull()
  })

  it('cuenta los días que quedan sin bajar de cero', () => {
    expect(daysLeft(10 * 86400000 + 5, 0)).toBe(11)
    expect(daysLeft(0, 5)).toBe(0)
  })
})
