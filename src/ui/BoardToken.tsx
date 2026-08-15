import type { GameState, CharacterInstance } from '../engine/types'
import { getCharacterDef, getStuffDef } from '../engine/cards/deck'
import { effectiveStats, limitTier, auraSummary } from '../engine/selectors'

const BASE = import.meta.env.BASE_URL

/**
 * A character in play. Deliberately NOT a small copy of the hand card — on the
 * board you only need to answer "how hurt, how dangerous, what's wrong with
 * them", so that is all this shows. Full detail lives one tap away.
 */
export function BoardToken({
  state, ch, onClick, mode, size = 'md', showAura,
}: {
  state: GameState
  ch: CharacterInstance
  onClick?: () => void
  mode?: 'target' | 'selected' | null
  size?: 'sm' | 'md'
  showAura?: boolean
}) {
  const def = getCharacterDef(ch.defId)
  const st = effectiveStats(state, ch)
  const pct = Math.max(0, Math.round((ch.hp / ch.maxHp) * 100))
  const hurt = pct <= 33
  const items = ch.attached.map((i) => state.stuff[i]).filter(Boolean)
  const auras = auraSummary(state, ch)

  const buffed = (cur: number, base: number) => (cur > base ? 'up' : cur < base ? 'down' : '')

  return (
    <button
      className={`tok tok-${size} ${mode ?? ''} ${ch.actedThisTurn ? 'acted' : ''}`}
      style={{ '--accent': def.color } as React.CSSProperties}
      onClick={onClick}
      disabled={!onClick}
      aria-label={`${def.name}, ${ch.hp} of ${ch.maxHp} health`}
    >
      <span className="tok-art">
        {def.art && <img src={`${BASE}art/${def.art}`} alt="" loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0' }} />}
        {ch.statuses.length > 0 && (
          <span className="tok-status">
            {ch.statuses.slice(0, 3).map((s) => (
              <i key={s.name} className={`sdot ${s.name === 'Fired Up' ? 'good' : 'bad'}`} title={s.name} />
            ))}
          </span>
        )}
        {items.length > 0 && (
          <span className="tok-items" title={items.map((i) => getStuffDef(i.defId).name).join(', ')}>
            {items.slice(0, 3).map((i, n) => <i key={n}>{getStuffDef(i.defId).icon ?? '•'}</i>)}
          </span>
        )}
        {ch.actedThisTurn && <span className="tok-done">✓</span>}
        {showAura && auras.length > 0 && (
          <span className="tok-aura" title={auras.join(' · ')}>◈</span>
        )}
      </span>

      <span className="tok-name">{def.name}</span>

      <span className={`tok-hp ${hurt ? 'hurt' : ''}`}>
        <i style={{ width: `${pct}%` }} />
        <b>{ch.hp}</b>
      </span>

      <span className="tok-stats">
        <s className={buffed(st.attack, def.stats.attack)}>⚔{st.attack}</s>
        <s className={buffed(st.defense, def.stats.defense)}>🛡{st.defense}</s>
      </span>

      {(limitTier(ch, 'alcohol') > 0 || limitTier(ch, 'weed') > 0 || limitTier(ch, 'food') > 0) && (
        <span className="tok-limits">
          {limitTier(ch, 'alcohol') > 0 && <i className={`lim a t${limitTier(ch, 'alcohol')}`}>🍺</i>}
          {limitTier(ch, 'weed') > 0 && <i className={`lim w t${limitTier(ch, 'weed')}`}>🌿</i>}
          {limitTier(ch, 'food') > 0 && <i className={`lim f t${limitTier(ch, 'food')}`}>🍔</i>}
        </span>
      )}
    </button>
  )
}

export function EmptyToken({
  label, onClick, mode, size = 'md',
}: { label: string; onClick?: () => void; mode?: string | null; size?: 'sm' | 'md' }) {
  return (
    <button className={`tok tok-${size} tok-empty ${mode ?? ''}`} onClick={onClick} disabled={!onClick}>
      <span className="tok-plus">+</span>
      <span className="tok-elabel">{label}</span>
    </button>
  )
}
