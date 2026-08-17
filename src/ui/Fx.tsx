import { useEffect, useRef, useState } from 'react'
import type { FxEvent, GameState, InstanceId } from '../engine/types'

/**
 * Plays what just happened.
 *
 * The engine hands over structured events - who swung, who got hit, for how
 * much - and this finds those tokens on screen and animates between them. It
 * reads nothing from the log, so rewording a sentence never breaks an
 * animation, and it holds no game state of its own: if a token is not on
 * screen, its event is simply dropped.
 *
 * One fixed overlay rather than animations inside the tokens, because an
 * attacker in your own row and a defender in the opponents' row live in
 * different scrolling containers, and nothing inside either can draw a line
 * between them.
 */

interface Live {
  id: number
  kind: FxEvent['k']
  /** viewport coordinates, measured at the moment it fires */
  x: number
  y: number
  fromX?: number
  fromY?: number
  text?: string
  tone?: 'bad' | 'good' | 'note'
}

let seq = 0

function centreOf(iid: InstanceId): { x: number; y: number } | null {
  const el = document.querySelector(`[data-iid="${iid}"]`)
  if (!el) return null
  const r = el.getBoundingClientRect()
  if (r.width < 2) return null
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
}

export function FxLayer({ state }: { state: GameState }) {
  const [live, setLive] = useState<Live[]>([])
  const seen = useRef(-1)

  useEffect(() => {
    const fresh = (state.fx ?? []).filter((e) => e.t > seen.current)
    if (!fresh.length) return
    seen.current = state.fx[state.fx.length - 1].t

    // Measure after paint. The state that produced these events is the state
    // being rendered right now, so a token that just appeared or moved has to
    // be laid out before its position means anything.
    const raf = requestAnimationFrame(() => {
      const born: Live[] = []
      for (const e of fresh) {
        const at = e.target ? centreOf(e.target) : null
        if (!at) continue
        const from = e.source ? centreOf(e.source) : null

        if (e.k === 'attack' && from) {
          born.push({ id: ++seq, kind: 'attack', x: at.x, y: at.y, fromX: from.x, fromY: from.y })
          continue
        }
        if (e.k === 'damage') {
          born.push({ id: ++seq, kind: 'damage', x: at.x, y: at.y, text: `-${e.amount}`, tone: 'bad' })
          continue
        }
        if (e.k === 'heal') {
          born.push({ id: ++seq, kind: 'heal', x: at.x, y: at.y, text: `+${e.amount}`, tone: 'good' })
          continue
        }
        if (e.k === 'ko') {
          born.push({ id: ++seq, kind: 'ko', x: at.x, y: at.y, text: 'KO', tone: 'bad' })
          continue
        }
        if (e.k === 'buff' && e.label) {
          born.push({
            id: ++seq, kind: 'buff', x: at.x, y: at.y, text: e.label,
            tone: (e.amount ?? 0) >= 0 ? 'good' : 'bad',
          })
          continue
        }
        if (e.k === 'status' && e.label) {
          born.push({ id: ++seq, kind: 'status', x: at.x, y: at.y, text: e.label, tone: 'note' })
        }
      }
      if (!born.length) return
      setLive((prev) => [...prev, ...born].slice(-14))
      const ids = new Set(born.map((b) => b.id))
      setTimeout(() => setLive((prev) => prev.filter((l) => !ids.has(l.id))), 1400)
    })
    return () => cancelAnimationFrame(raf)
  }, [state.tick])

  if (!live.length) return null

  return (
    <div className="fxlayer" aria-hidden>
      {live.map((l) => {
        if (l.kind === 'attack') {
          // A strike drawn from attacker to defender: one element rotated to
          // point the right way and scaled to the gap between them, which
          // works across scroll containers where a transform on the token
          // itself cannot reach.
          const dx = l.x - (l.fromX ?? l.x)
          const dy = l.y - (l.fromY ?? l.y)
          const len = Math.hypot(dx, dy)
          const angle = (Math.atan2(dy, dx) * 180) / Math.PI
          return (
            <span key={l.id} className="fx-strike"
              style={{
                left: l.fromX, top: l.fromY,
                width: len, transform: `rotate(${angle}deg)`,
              }} />
          )
        }
        return (
          <span key={l.id} className={`fx-float ${l.kind} ${l.tone ?? ''}`}
            style={{ left: l.x, top: l.y }}>
            {l.text}
          </span>
        )
      })}
    </div>
  )
}
