import { useEffect, useRef, useState } from 'react'
import type { GameState, InstanceId, PlayerId, Effect, StuffDef } from '../engine/types'
import { getCharacterDef, getStuffDef } from '../engine/cards/deck'

const BASE = import.meta.env.BASE_URL

/**
 * The full-size, fully readable card. This is what a player looks at while
 * deciding - so nothing here is abbreviated and nothing is below ~12px.
 * Board pieces get a completely different, compact treatment (BoardToken):
 * card-game UI convention is that a card in hand and the same card in play
 * should not look alike, because they answer different questions.
 */

/**
 * The rules text scrolls inside the card when it does not fit - which on a
 * short phone it often does not. A fade alone reads as "the card ends here",
 * so say it plainly instead: a card whose flaw is cut off mid-sentence is a
 * card the player has not read.
 */
function ScrollableBody({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [more, setMore] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const check = () => setMore(el.scrollHeight - el.scrollTop - el.clientHeight > 6)
    check()
    el.addEventListener('scroll', check, { passive: true })
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => { el.removeEventListener('scroll', check); ro.disconnect() }
  }, [])

  return (
    <div className="face-bodywrap">
      <div className="face-body" ref={ref}>{children}</div>
      {more && (
        <button className="face-more" onClick={() => ref.current?.scrollBy({ top: 160, behavior: 'smooth' })}>
          more ▾
        </button>
      )}
    </div>
  )
}

export function CardFace({
  state, iid, focused,
}: {
  state: GameState
  iid: InstanceId
  focused?: boolean
}) {
  const chInst = state.characters[iid]
  const stInst = state.stuff[iid]

  if (chInst) {
    const def = getCharacterDef(chInst.defId)
    return (
      <article className={`face face-char ${focused ? 'focused' : ''}`} style={{ '--accent': def.color } as React.CSSProperties}>
        <div className="face-art">
          {def.art && <img src={`${BASE}art/${def.art}`} alt="" loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0' }} />}
          <div className="face-art-fade" />
          <div className="face-hp" title="Health">{def.stats.hp}<span>HP</span></div>
        </div>

        <header className="face-head">
          <h2>{def.name}</h2>
          <p className="face-title">{def.title}</p>
        </header>

        <div className="face-statrow">
          <span className="fstat a"><em>⚔</em><b>{def.stats.attack}</b><i>ATTACK</i></span>
          <span className="fstat d"><em>🛡</em><b>{def.stats.defense}</b><i>DEFENSE</i></span>
        </div>

        <ScrollableBody>
          <div className="face-tags">{def.tags.map((t) => <span key={t} className="ftag">{t}</span>)}</div>
          {def.passive && (
            <p className="face-rule"><strong>{def.passive.name}</strong> {def.passive.text}</p>
          )}
          {def.ability && (
            <p className="face-rule"><strong>{def.ability.name}</strong> {def.ability.text}</p>
          )}
          {def.powerMove && (
            <p className="face-rule power"><strong>★ {def.powerMove.name}</strong> {def.powerMove.text}</p>
          )}
          {def.flaw && (
            <p className="face-rule flaw"><strong>{def.flaw.name}</strong> {def.flaw.text}</p>
          )}
        </ScrollableBody>
      </article>
    )
  }

  if (stInst) {
    const def = getStuffDef(stInst.defId)
    return (
      <article className={`face face-stuff sub-${def.subtype.toLowerCase()} ${focused ? 'focused' : ''}`} style={{ '--accent': def.color } as React.CSSProperties}>
        {def.art ? (
          <div className="face-art stuff">
            <img src={`${BASE}art/${def.art}`} alt="" loading="lazy"
              onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0' }} />
            <div className="face-art-fade" />
            <span className="face-glyph-mini">{def.icon ?? '❔'}</span>
          </div>
        ) : (
          <div className="face-glyph"><span>{def.icon ?? '❔'}</span></div>
        )}
        <header className="face-head">
          <p className="face-type">{def.subtype}</p>
          <h2>{def.name}</h2>
        </header>
        <ScrollableBody>
          <EffectChips chips={stuffChips(def)} className="big" />
          <p className="face-rule big">{def.text}</p>
          {['Food', 'Drink', 'Smoke'].includes(def.subtype) && (
            <p className="face-hint">
              Can be given to <strong>anyone</strong>, including your rivals - pushing somebody past
              Drunk, Stoned or Stuffed is a perfectly good use of a snack.
            </p>
          )}
          {def.activated && (
            <p className="face-hint gold">
              <strong>{def.activated.name}</strong> - {def.activated.text}
            </p>
          )}
          {def.interfere && (
            <p className="face-interfere">⚡ INTERFERE - can be played during someone else's battle</p>
          )}
        </ScrollableBody>
      </article>
    )
  }

  return <article className="face face-unknown">Unknown card</article>
}


// ---------------------------------------------------------------------------
// What does this card actually DO? Read it off the card data rather than the
// prose, so a third-party card gets the same summary for free and cannot lie
// about its own numbers.
// ---------------------------------------------------------------------------

export interface EffectChip { label: string; tone: 'good' | 'bad' | 'note' }

const STAT_GLYPH: Record<string, string> = { attack: '⚔', defense: '🛡' }
const TRACK_GLYPH: Record<string, string> = { alcohol: '🍺', weed: '🌿', food: '🍔' }
const sign = (n: number) => (n > 0 ? `+${n}` : `${n}`)

function walk(effects: Effect[], out: EffectChip[], selfOnly: boolean) {
  for (const e of effects) {
    const t = (e as any).target?.scope as string | undefined
    // Anything aimed away from the holder is written as "them" so a buff and a
    // debuff are never confused for each other at a glance.
    const them = t && t !== 'self' && t !== 'eventTarget'
    switch (e.k) {
      case 'statMod':
        out.push({
          label: `${them ? 'them ' : ''}${STAT_GLYPH[e.stat] ?? e.stat}${sign(e.amount)}`,
          tone: (e.amount > 0) !== !!them ? 'good' : 'bad',
        })
        break
      case 'heal':
        out.push({ label: `${them ? 'them ' : ''}♥+${e.amount}`, tone: 'good' })
        break
      case 'damage':
        out.push({ label: `${e.amount} dmg`, tone: them ? 'good' : 'bad' })
        break
      case 'limit':
        out.push({
          label: `${them ? 'them ' : ''}${TRACK_GLYPH[e.track] ?? e.track}${sign(e.amount)}`,
          tone: 'note',
        })
        break
      case 'status':
        out.push({ label: `${them ? '' : 'you: '}${e.status}`, tone: them ? 'good' : 'bad' })
        break
      case 'removeStatus':
        out.push({ label: `clears ${e.status}`, tone: 'good' })
        break
      case 'draw': out.push({ label: `draw ${e.n}`, tone: 'good' }); break
      case 'discard': out.push({ label: `discard ${e.n}`, tone: 'bad' }); break
      case 'swapStats': out.push({ label: '⚔ ⇄ 🛡', tone: 'note' }); break
      case 'extraAttack': out.push({ label: 'extra attack', tone: 'good' }); break
      case 'grantAction': out.push({ label: `+${e.n} action`, tone: 'good' }); break
      case 'stealStuff': out.push({ label: 'steal an item', tone: 'good' }); break
      case 'destroyStuff': out.push({ label: 'destroy an item', tone: 'good' }); break
      case 'startMinigame': out.push({ label: 'play them for it', tone: 'note' }); break
      case 'roll': {
        out.push({ label: 'roll d6', tone: 'note' })
        for (const b of e.branches) walk(b.effects, out, selfOnly)
        break
      }
      case 'ifTag':
      case 'ifCharacterActive':
        walk(e.then, out, selfOnly)
        if (e.else) walk(e.else, out, selfOnly)
        break
      default: break
    }
  }
}

/** The headline numbers for a Stuff card, deduped and capped. */
export function stuffChips(def: StuffDef): EffectChip[] {
  const out: EffectChip[] = []
  for (const m of def.equipMods ?? []) {
    out.push({ label: `${STAT_GLYPH[m.stat] ?? m.stat}${sign(m.amount)}`, tone: m.amount > 0 ? 'good' : 'bad' })
  }
  // Mirror the engine's rule that eating always moves the Food track, so the
  // chip cannot promise something different from what happens.
  const gains: Record<string, number> = { ...(def.limitGain ?? {}) }
  if (def.subtype === 'Food' && !gains.food) gains.food = 1
  for (const [track, amt] of Object.entries(gains)) {
    if (!amt) continue
    out.push({ label: `${TRACK_GLYPH[track] ?? track}${sign(amt)}`, tone: 'note' })
  }
  walk(def.effects ?? [], out, false)
  if (def.activated) walk(def.activated.effects, out, false)

  const seen = new Set<string>()
  return out.filter((c) => (seen.has(c.label) ? false : (seen.add(c.label), true))).slice(0, 8)
}

export function EffectChips({ chips, className }: { chips: EffectChip[]; className?: string }) {
  if (chips.length === 0) return null
  return (
    <div className={`fx ${className ?? ''}`}>
      {chips.map((c, i) => <span key={i} className={`fx-chip ${c.tone}`}>{c.label}</span>)}
    </div>
  )
}

/** Short label for a card, used in confirmations and log lines. */
export function cardLabel(state: GameState, iid: InstanceId): string {
  if (state.characters[iid]) return getCharacterDef(state.characters[iid].defId).name
  if (state.stuff[iid]) return getStuffDef(state.stuff[iid].defId).name
  return 'card'
}

export function isCharacterCard(state: GameState, iid: InstanceId): boolean {
  return !!state.characters[iid]
}

export function handSummary(state: GameState, you: PlayerId) {
  return state.playerState[you].hand.length
}
