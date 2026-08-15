import type { GameState, CharacterInstance, InstanceId } from '../engine/types'
import { getCharacterDef, getStuffDef } from '../engine/cards/deck'
import { effectiveStats, limitTier } from '../engine/selectors'

const BASE = import.meta.env.BASE_URL

const TRACK_ICON = { alcohol: '🍺', weed: '🌿', food: '🍔' } as const

function Track({ ch, track }: { ch: CharacterInstance; track: 'alcohol' | 'weed' | 'food' }) {
  const def = getCharacterDef(ch.defId)
  const max = def.tolerance[track]
  const lvl = ch.limits[track]
  if (lvl === 0) return null
  const tier = limitTier(ch, track)
  return (
    <span className={`track t-${track} ${tier === 3 ? 'maxed' : ''}`} title={`${track} ${lvl}/${max}`}>
      <em>{TRACK_ICON[track]}</em>
      {Array.from({ length: max }, (_, i) => (
        <i key={i} className={`pip ${i < lvl ? 'on' : ''} ${track}`} />
      ))}
    </span>
  )
}

export function CharacterCard({
  state, ch, big, onClick, mode, disabled,
}: {
  state: GameState
  ch: CharacterInstance
  big?: boolean
  onClick?: () => void
  mode?: 'selectable' | 'target' | 'selected' | null
  disabled?: boolean
}) {
  const def = getCharacterDef(ch.defId)
  const st = effectiveStats(state, ch)
  const base = def.stats
  const pct = Math.max(0, Math.round((ch.hp / ch.maxHp) * 100))
  const hurt = pct <= 33

  const delta = (cur: number, b: number) =>
    cur !== b ? <sup className={cur > b ? 'up' : 'down'}>{cur > b ? '+' : ''}{cur - b}</sup> : null

  return (
    <button
      className={`ch ${big ? 'big' : ''} ${mode ?? ''} ${ch.actedThisTurn ? 'acted' : ''} ${ch.hp <= 0 ? 'down' : ''}`}
      style={{ '--accent': def.color } as React.CSSProperties}
      onClick={onClick}
      disabled={disabled || !onClick}
    >
      <span className="ch-art-wrap">
        {def.art && (
          <img
            className="ch-art" src={`${BASE}art/${def.art}`} alt={def.name} loading="lazy"
            onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0' }}
          />
        )}
        <span className="ch-fade" />
      </span>

      <span className="ch-top">
        <span className="ch-name">{def.name}</span>
        {big && <span className="ch-title">{def.title}</span>}
      </span>

      <span className="ch-bottom">
        {(ch.statuses.length > 0 || ch.attached.length > 0) && (() => {
          // A card is small. Show the statuses (they change how it plays) and
          // collapse carried items to icons, so nothing ever clips mid-word.
          const shown = ch.statuses.slice(0, 2)
          const hiddenStatuses = ch.statuses.length - shown.length
          const items = ch.attached.map((i) => state.stuff[i]).filter(Boolean)
          return (
            <span className="badges">
              {shown.map((st2) => (
                <span key={st2.name} className={`badge ${st2.name === 'Fired Up' ? 'good' : 'bad'}`}>{st2.name}</span>
              ))}
              {hiddenStatuses > 0 && <span className="badge bad">+{hiddenStatuses}</span>}
              {items.length > 0 && (
                <span className="badge item" title={items.map((i) => getStuffDef(i.defId).name).join(', ')}>
                  {items.slice(0, 3).map((i) => getStuffDef(i.defId).icon ?? '•').join('')}
                  {items.length > 3 ? `+${items.length - 3}` : ''}
                </span>
              )}
            </span>
          )
        })()}

        <span className="limits">
          <Track ch={ch} track="alcohol" />
          <Track ch={ch} track="weed" />
          <Track ch={ch} track="food" />
        </span>

        <span className={`hpbar ${hurt ? 'hurt' : ''}`}>
          <i style={{ width: `${pct}%` }} />
          <b>{ch.hp}<s>/{ch.maxHp}</s></b>
        </span>

        <span className="stats">
          <span className="stat a">⚔<u>{st.attack}</u>{delta(st.attack, base.attack)}</span>
          <span className="stat d">🛡<u>{st.defense}</u>{delta(st.defense, base.defense)}</span>
          <span className="stat s">⚡<u>{st.speed}</u>{delta(st.speed, base.speed)}</span>
        </span>
      </span>

      {ch.actedThisTurn && <span className="acted-stamp">DONE</span>}
    </button>
  )
}

export function EmptySlot({ label, onClick, mode }: { label: string; onClick?: () => void; mode?: string | null }) {
  return (
    <button className={`ch empty ${mode ?? ''}`} onClick={onClick} disabled={!onClick}>
      <span className="empty-plus">+</span>
      <span className="empty-label">{label}</span>
    </button>
  )
}

export function slotName(i: number) {
  return ['LEFT', 'CENTER', 'RIGHT'][i] ?? ''
}

export function charName(state: GameState, iid: InstanceId | null | undefined) {
  if (!iid) return '—'
  const ch = state.characters[iid]
  return ch ? getCharacterDef(ch.defId).name : '—'
}

/** Portrait used on hand cards and in the battle overlay. */
export function CharacterPortrait({ defId, size }: { defId: string; size?: number }) {
  const def = getCharacterDef(defId)
  return (
    <span className="portrait" style={{ '--accent': def.color, width: size, height: size } as React.CSSProperties}>
      {def.art
        ? <img src={`${BASE}art/${def.art}`} alt={def.name} loading="lazy"
            onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0' }} />
        : <span className="portrait-fallback">{def.name.slice(0, 1)}</span>}
    </span>
  )
}
