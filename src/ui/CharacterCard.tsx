import type { GameState, CharacterInstance, InstanceId } from '../engine/types'
import { getCharacterDef, getStuffDef } from '../engine/cards/deck'
import { effectiveStats, limitTier } from '../engine/selectors'

const BASE = import.meta.env.BASE_URL

function Track({ ch, track, label }: { ch: CharacterInstance; track: 'alcohol' | 'weed' | 'food'; label: string }) {
  const def = getCharacterDef(ch.defId)
  const max = def.tolerance[track]
  const lvl = ch.limits[track]
  if (lvl === 0) return null
  return (
    <span className="track" title={`${track}: ${lvl}/${max}`}>
      <em>{label}</em>
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

  const delta = (cur: number, b: number) => (cur !== b ? <sup>{cur > b ? '+' : ''}{cur - b}</sup> : null)

  return (
    <button
      className={`ch ${big ? 'big' : ''} ${mode ?? ''} ${ch.actedThisTurn ? 'acted' : ''}`}
      style={{ borderColor: mode ? undefined : def.color + '77' }}
      onClick={onClick}
      disabled={disabled || !onClick}
    >
      {def.art && <img className="ch-art" src={`${BASE}art/${def.art}`} alt="" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />}
      <span className="ch-body">
        <span className="ch-name" style={{ color: def.color }}>{def.name}</span>

        <span className="hpbar"><i style={{ width: `${pct}%` }} /></span>
        <span className="hp-text">{ch.hp}/{ch.maxHp} HP</span>

        <span className="limits">
          <Track ch={ch} track="alcohol" label="A" />
          <Track ch={ch} track="weed" label="W" />
          <Track ch={ch} track="food" label="F" />
        </span>

        {(ch.statuses.length > 0 || ch.attached.length > 0) && (
          <span className="badges">
            {ch.statuses.map((s) => (
              <span key={s.name} className={`badge ${['Fired Up'].includes(s.name) ? 'good' : 'bad'}`}>{s.name}</span>
            ))}
            {limitTier(ch, 'alcohol') >= 2 && <span className="badge bad">{limitTier(ch, 'alcohol') === 3 ? 'Wasted' : 'Drunk'}</span>}
            {limitTier(ch, 'weed') >= 2 && <span className="badge bad">{limitTier(ch, 'weed') === 3 ? 'Zooted' : 'Stoned'}</span>}
            {limitTier(ch, 'food') >= 2 && <span className="badge">{limitTier(ch, 'food') === 3 ? 'Stuffed' : 'Full'}</span>}
            {ch.attached.map((i) => {
              const s = state.stuff[i]
              if (!s) return null
              return <span key={i} className="badge item">{getStuffDef(s.defId).name}</span>
            })}
          </span>
        )}

        <span className="stats">
          <span className="stat a">⚔{st.attack}{delta(st.attack, base.attack)}</span>
          <span className="stat d">🛡{st.defense}{delta(st.defense, base.defense)}</span>
          <span className="stat s">⚡{st.speed}{delta(st.speed, base.speed)}</span>
        </span>
      </span>
    </button>
  )
}

export function EmptySlot({ label, onClick, mode }: { label: string; onClick?: () => void; mode?: string | null }) {
  return (
    <button className={`ch empty ${mode ?? ''}`} onClick={onClick} disabled={!onClick}>
      {label}
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
