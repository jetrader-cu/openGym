// The first-launch welcome (views/Welcome.jsx): five short screens that say what TallaYa is
// before the sign-in or the phone's first choice. Seen once per device, so the flag lives in
// localStorage and is never synced: a new phone shows it again, a second tab does not.

export const WELCOME_KEY = 'tallaya_welcome_v1'

// The steps, in order. Strings are English keys for t(); `art` is either the brand symbol or an
// Icon name. The last step's button starts the app.
export const WELCOME_STEPS = [
  { id: 'hello', art: 'brand', kicker: 'Welcome', title: 'Get in shape. Now.',
    body: 'Your pocket coach, made for Cuba. Plan, train and track your progress from your phone.' },
  { id: 'plan', art: 'calendar', kicker: 'Your plan', title: 'Your week, ready.',
    body: 'Pick a routine or build your own from more than 5,600 exercises with animated demos.' },
  { id: 'offline', art: 'cloudSlash', kicker: 'No connection', title: 'No data? No problem.',
    body: 'Train offline without spending mobile data. Everything stays on your phone and syncs when you get WiFi.' },
  { id: 'progress', art: 'chartLine', kicker: 'Your progress', title: 'Track every kilo.',
    body: 'Records, body weight and a muscle map. TallaYa raises the weight for you when you are ready.' },
  { id: 'pay', art: 'crown', kicker: 'Plans and payments', title: 'Pay your way.',
    body: 'Everything you see is free. Paid plans will take CUP, MLC or USD through Transfermóvil, EnZona, QvaPay, PayPal, card, crypto or mobile balance.' },
]

/** True once this device has been through the welcome (or storage is unusable: never block). */
export function welcomeSeen(storage = globalThis.localStorage) {
  try { return !storage || storage.getItem(WELCOME_KEY) === '1' } catch { return true }
}

export function markWelcomeSeen(storage = globalThis.localStorage) {
  try { storage?.setItem(WELCOME_KEY, '1') } catch { /* private mode: it shows again, harmless */ }
}

/** The step after `i`, or null past the last one. */
export function nextStep(i) {
  return i + 1 < WELCOME_STEPS.length ? i + 1 : null
}
