import { describe, expect, it } from 'vitest'
import { WELCOME_KEY, WELCOME_STEPS, markWelcomeSeen, nextStep, welcomeSeen } from './welcome.js'

const memory = () => {
  const m = new Map()
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }
}

describe('welcome', () => {
  it('se muestra en un dispositivo nuevo y no después de verla', () => {
    const s = memory()
    expect(welcomeSeen(s)).toBe(false)
    markWelcomeSeen(s)
    expect(welcomeSeen(s)).toBe(true)
    expect(s.getItem(WELCOME_KEY)).toBe('1')
  })

  it('nunca bloquea la app si el almacenamiento falla', () => {
    const broken = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') } }
    expect(welcomeSeen(broken)).toBe(true)
    expect(() => markWelcomeSeen(broken)).not.toThrow()
    expect(welcomeSeen(null)).toBe(true)
  })

  it('tiene cinco pasos y el último termina', () => {
    expect(WELCOME_STEPS.map(s => s.id)).toEqual(['hello', 'plan', 'offline', 'progress', 'pay'])
    expect(nextStep(0)).toBe(1)
    expect(nextStep(WELCOME_STEPS.length - 1)).toBeNull()
  })

  it('no usa rayas largas en los textos (regla de CONTRIBUTING)', () => {
    for (const s of WELCOME_STEPS) for (const k of ['kicker', 'title', 'body']) expect(s[k]).not.toMatch(/—/)
  })
})
