// @vitest-environment happy-dom
// The first-launch welcome: five steps, Next walks them, Skip and the last button mark it seen.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { WELCOME_KEY } from '../lib/welcome.js'
import Welcome from './Welcome.jsx'

let root, host
const button = label => [...host.querySelectorAll('button')].find(b => b.textContent.trim() === label)
const title = () => host.querySelector('.welcome-title').textContent

beforeEach(() => {
  localStorage.removeItem(WELCOME_KEY)
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove() })

describe('Welcome', () => {
  it('recorre los cinco pasos y el último entra a la app', () => {
    const onDone = vi.fn()
    act(() => root.render(<Welcome onDone={onDone} />))
    expect(title()).toBe('Get in shape. Now.')
    act(() => button('Start').click())
    expect(title()).toBe('Your week, ready.')
    for (let k = 0; k < 3; k++) act(() => button('Next').click())
    expect(title()).toBe('Pay your way.')
    expect(button('Skip')).toBeUndefined()
    act(() => button('Start free').click())
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem(WELCOME_KEY)).toBe('1')
  })

  it('Saltar la marca como vista sin recorrerla', () => {
    const onDone = vi.fn()
    act(() => root.render(<Welcome onDone={onDone} />))
    act(() => button('Skip').click())
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem(WELCOME_KEY)).toBe('1')
  })

  it('los puntos llevan directo a un paso', () => {
    act(() => root.render(<Welcome />))
    const dots = host.querySelectorAll('.welcome-dot')
    expect(dots).toHaveLength(5)
    act(() => dots[2].click())
    expect(title()).toBe('No data? No problem.')
    expect(dots[2].getAttribute('aria-selected')).toBe('true')
  })
})
