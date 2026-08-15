import type { GameState, CharacterInstance } from '../engine/types'
import { getCharacterDef, getStuffDef } from '../engine/cards/deck'
import { effectiveStats, limitTier, auraSummary, incomingAuras } from '../engine/selectors'

const BASE = import.meta.env.BASE_URL

/**
 * A character in play. Deliberately NOT a small copy of the hand card — on the
 * board you only need to answer "how hurt, how dangerous, what's wrong with
 * them", so that is all this shows. Full detail lives one tap away.
 */
export function BoardToken({
  state, ch, onClick, mode, size = 'md', showAura, ready,
}: {
  state: GameState
  ch: CharacterInstance
  onClick?: () => void
  mode?: 'target' | 'selected' | null
  size?: 'sm' | 'md'
  showAura?: boolean
  /** This Character can still do something this Turn — say so visually,
   *  or combat stays a secret the player has to be told about. */
  ready?: boolean
}) {
  const def = getCharacterDef(ch.defId)
  const st = effectiveStats(state, ch)
  const pct = Math.max(0, Math.round((ch.hp / ch.maxHp) * 100))
  const hurt = pct <= 33
  const items = ch.attached.map((i) => state.stuff[i]).filter(Boolean)
  const auras = auraSummary(state, ch)
  const incoming = incomingAuras(state, ch)

  const buffed = (cur: number, base: number) => (cur > base ? 'up' : cur < base ? 'down' : '')

  return (
    <button
      className={`tok tok-${size} ${mode ?? ''} ${ch.actedThisTurn ? 'acted' : ''} ${ready && !ch.actedThisTurn && !mode ? 'ready' : ''}`}
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
        {incoming.length > 0 && (
          <span className="tok-incoming" title={incoming.join(' · ')}>↓{incoming.length}</span>
        )}
      </span>

      <span className="tok-name">{def.name}</span>

      <span className={`tok-hp ${hurt ? 'hurt' : ''}`}>
        <i style={{ width: `${pct}%` }} />
        <b>{ch.hp}</b>
      </span>

      {(() => {
        // Roll every temporary modifier into one readable chip per stat, so a
        // buff that expires this Round is visible without opening anything.
        const byStat: Record<string, number> = {}
        for (const m of ch.mods) byStat[m.stat] = (byStat[m.stat] ?? 0) + m.amount
        const chips = Object.entries(byStat).filter(([, v]) => v !== 0)
        if (chips.length === 0) return null
        const soonest = ch.mods.some((m) => m.duration === 'turn') ? 'turn' : 'round'
        return (
          <span className="tok-temp" title={`Temporary — ends this ${soonest}`}>
            {chips.map(([st, v]) => (
              <i key={st} className={v > 0 ? 'up' : 'down'}>
                {st === 'attack' ? '⚔' : '🛡'}{v > 0 ? '+' : ''}{v}
              </i>
            ))}
            <em>{soonest === 'turn' ? 'turn' : 'rnd'}</em>
          </span>
        )
      })()}

      {size === 'md' && (auras.length > 0 || incoming.length > 0) && (
        <span className="tok-effects">
          {auras.map((a, i) => <i key={`o${i}`} className="give">{a}</i>)}
          {incoming.map((a, i) => <i key={`i${i}`} className="get">{a}</i>)}
        </span>
      )}

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
