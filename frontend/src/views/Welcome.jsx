// First launch only: what TallaYa is, in five screens (lib/welcome.js has the steps and the flag).
// Skippable at any point; the last button, or Skip, marks it seen and hands over to the app.
import { useEffect, useState } from 'react'
import { hideBoot } from '../lib/boot.js'
import { t } from '../lib/i18n.js'
import { WELCOME_STEPS, markWelcomeSeen, nextStep } from '../lib/welcome.js'
import Icon from '../components/Icon.jsx'
import { Button } from '../components/ui.jsx'
import symbol from '../assets/tallaya-symbol.svg'

export default function Welcome({ onDone }) {
  const [i, setI] = useState(0)
  // The boot screen in index.html waits for the app; the welcome is something to show.
  useEffect(() => { hideBoot() }, [])
  const step = WELCOME_STEPS[i]
  const last = nextStep(i) === null
  const done = () => { markWelcomeSeen(); onDone?.() }
  return (
    <div id="app" className="welcome" data-step={step.id}>
      <div className="welcome-top">
        <span className="welcome-brand">Talla<b>Ya</b></span>
        {!last && <button type="button" className="welcome-skip" onClick={done}>{t('Skip')}</button>}
      </div>
      <div className="welcome-art" key={step.id} aria-hidden="true">
        {step.art === 'brand'
          ? <img src={symbol} alt="" width="240" height="240" />
          : <span className="welcome-icon"><Icon name={step.art} /></span>}
      </div>
      <div className="welcome-copy">
        <div className="welcome-kicker">{String(i + 1).padStart(2, '0')} / {String(WELCOME_STEPS.length).padStart(2, '0')} · {t(step.kicker)}</div>
        <h1 className="welcome-title">{t(step.title)}</h1>
        <p className="welcome-body">{t(step.body)}</p>
      </div>
      <div className="welcome-foot">
        <div className="welcome-dots" role="tablist" aria-label={t('Steps')}>
          {WELCOME_STEPS.map((s, k) => (
            <button key={s.id} type="button" role="tab" aria-selected={k === i} aria-label={t(s.kicker)}
              className={'welcome-dot' + (k === i ? ' on' : '')} onClick={() => setI(k)} />
          ))}
        </div>
        <Button variant="primary" trailingIcon="chevronRight" onClick={() => (last ? done() : setI(nextStep(i)))}>
          {last ? t('Start free') : i === 0 ? t('Start') : t('Next')}
        </Button>
      </div>
    </div>
  )
}
