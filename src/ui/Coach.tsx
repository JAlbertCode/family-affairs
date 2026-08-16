import { useEffect, useLayoutEffect, useState } from 'react'

/**
 * First-run coach.
 *
 * New players open this game and do not know what they are looking at: three
 * empty-looking rows, a hand of cards, two counters and a big pink button. The
 * rules exist in the card sheets, but nobody reads a rules screen before their
 * first Turn, and by the time they would want one they are already lost.
 *
 * So this points at the real interface rather than describing it. Each step
 * spotlights an element that is actually on screen, and a step whose element
 * is not there is skipped rather than shown against nothing - the board
 * changes shape depending on whose Turn it is, and a coach mark floating over
 * empty space is worse than no coach mark.
 *
 * It runs once. Anybody who wants it again can get it from the menu.
 */

const KEY = 'fa.coached'

export function coachDone(): boolean {
  try { return localStorage.getItem(KEY) === '1' } catch { return true }
}
export function markCoached() {
  try { localStorage.setItem(KEY, '1') } catch { /* private mode, it just runs again */ }
}
export function resetCoach() {
  try { localStorage.removeItem(KEY) } catch { /* nothing to do */ }
}

interface Step {
  sel: string
  title: string
  body: string
  /** where the card sits relative to the spotlight */
  prefer?: 'above' | 'below'
}

const STEPS: Step[] = [
  {
    sel: '.myslots',
    title: 'This is your family',
    body: 'Three slots. Everybody you recruit stands in one of them, and where they stand matters: most Characters give something to whoever is next to them, and take something from whoever is across the table.',
    prefer: 'below',
  },
  {
    sel: '.handstrip',
    title: 'This is your hand',
    body: 'A gold outline means you can play that card right now. Anything greyed out says why. Tap a card to read it; it only gets played when you press the button.',
    prefer: 'above',
  },
  {
    sel: '.fam-budget',
    title: 'Two allowances, not one',
    body: 'Play up to two cards from your hand, and take up to three actions with your Characters. They are separate: playing a card never costs you an action. Your card is drawn for you at the start of the Turn.',
    prefer: 'below',
  },
  {
    sel: '.attack-cta, [data-testid="end-turn"]',
    title: 'Attacking is one tap',
    body: 'Tap Attack, then tap who you are hitting. Attack rolls are your Attack against their Defense. Knocking somebody out is where most Clout comes from, and Clout is how you win.',
    prefer: 'above',
  },
  {
    sel: '.affair',
    title: 'Every Round has a Family Affair',
    body: 'It lands on every board at the table at once, including yours, and it is the one thing in a Round nobody chose. It is live until the next one replaces it.',
    prefer: 'below',
  },
]

interface Box { top: number; left: number; width: number; height: number }

function measure(sel: string): Box | null {
  const el = document.querySelector(sel)
  if (!el) return null
  const r = el.getBoundingClientRect()
  if (r.width < 4 || r.height < 4) return null
  return { top: r.top, left: r.left, width: r.width, height: r.height }
}

export function Coach({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0)
  const [box, setBox] = useState<Box | null>(null)

  // Skip past anything that is not on screen right now rather than pointing at
  // nothing. If everything from here on is missing, the coach is finished.
  useLayoutEffect(() => {
    let n = i
    let b = measure(STEPS[n]?.sel ?? '')
    while (!b && n < STEPS.length - 1) { n += 1; b = measure(STEPS[n].sel) }
    if (!b) { onDone(); return }
    if (n !== i) setI(n)
    setBox(b)
  }, [i, onDone])

  // The board moves - the hand collapses, the Affair banner appears - so the
  // hole has to follow it rather than being measured once.
  useEffect(() => {
    const tick = () => { const b = measure(STEPS[i]?.sel ?? ''); if (b) setBox(b) }
    const t = setInterval(tick, 300)
    window.addEventListener('resize', tick)
    return () => { clearInterval(t); window.removeEventListener('resize', tick) }
  }, [i])

  if (!box) return null
  const step = STEPS[i]
  const pad = 8
  const below = step.prefer === 'below'
  const vh = typeof window === 'undefined' ? 800 : window.innerHeight
  // Put the card on whichever side has room, preferring the side the step asks
  // for. A card that runs off the bottom of a phone is the whole coach lost.
  const roomBelow = vh - (box.top + box.height)
  const place = below && roomBelow > 210 ? 'below' : box.top > 230 ? 'above' : 'below'

  return (
    <div className="coach" role="dialog" aria-label={step.title}>
      <div
        className="coach-hole"
        style={{
          top: box.top - pad, left: box.left - pad,
          width: box.width + pad * 2, height: box.height + pad * 2,
        }}
      />
      <div
        className="coach-card"
        style={place === 'below'
          ? { top: box.top + box.height + 16 }
          : { bottom: vh - box.top + 16 }}
      >
        <span className="coach-count">{i + 1} of {STEPS.length}</span>
        <b>{step.title}</b>
        <p>{step.body}</p>
        <div className="coach-actions">
          <button className="btn ghost narrow" onClick={onDone}>Skip</button>
          <button
            className="btn gold"
            onClick={() => (i + 1 >= STEPS.length ? onDone() : setI(i + 1))}
          >
            {i + 1 >= STEPS.length ? 'Play' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  )
}
