import type { CharacterDef, StuffDef, AffairDef } from '../../engine/types'
import { EffectChips, stuffChips, affairChips } from '../CardFace'
import { artSrc } from './art'
import type { CardType } from './model'

/**
 * The card as the table will see it.
 *
 * Deliberately built on the same chip derivation the game uses rather than a
 * mock-up of it: `stuffChips` and `affairChips` read the card's own effects, so
 * if the preview says "⚔+3" the engine will do +3. A builder whose preview is
 * hand-drawn lets you ship a card whose text and behaviour disagree, which is
 * the one thing the whole validator exists to prevent.
 */
export function PreviewCard({ type, card }: { type: CardType; card: any }) {
  if (type === 'character') return <CharacterPreview c={card as CharacterDef} />
  if (type === 'stuff') return <StuffPreview s={card as StuffDef} />
  return <AffairPreview a={card as AffairDef} />
}

function CharacterPreview({ c }: { c: CharacterDef }) {
  const src = artSrc(c.art)
  return (
    <div className="pv pv-char" style={{ borderColor: c.color }}>
      <div className="pv-art" style={{ background: `linear-gradient(160deg, ${c.color}55, #1b0e1e)` }}>
        {src ? <img src={src} alt="" /> : <span className="pv-noart">no art yet</span>}
      </div>
      <div className="pv-body">
        <b className="pv-name">{c.name || 'Untitled'}</b>
        <i className="pv-title">{c.title || 'no title'}</i>
        <div className="pv-stats">
          <span>♥ {c.stats.hp}</span>
          <span>⚔ {c.stats.attack}</span>
          <span>🛡 {c.stats.defense}</span>
        </div>
        <div className="pv-tags">
          {c.tags.length ? c.tags.map((t) => <i key={t}>{t}</i>) : <i className="muted">no tags</i>}
        </div>
        <div className="pv-tol">
          🍺 {c.tolerance.alcohol} · 🌿 {c.tolerance.weed} · 🍔 {c.tolerance.food}
        </div>
        {c.passive?.name && <p className="pv-line"><b>{c.passive.name}.</b> {c.passive.text}</p>}
        {c.ability?.name && <p className="pv-line"><b>{c.ability.name}.</b> {c.ability.text}</p>}
        {c.powerMove?.name && <p className="pv-line"><b>{c.powerMove.name}.</b> {c.powerMove.text}</p>}
        {c.flaw?.name && <p className="pv-line flaw"><b>{c.flaw.name}.</b> {c.flaw.text}</p>}
      </div>
    </div>
  )
}

function StuffPreview({ s }: { s: StuffDef }) {
  const src = artSrc(s.art)
  return (
    <div className="pv pv-stuff" style={{ borderColor: s.color }}>
      <div className="pv-art small" style={{ background: `linear-gradient(160deg, ${s.color}55, #1b0e1e)` }}>
        {src ? <img src={src} alt="" /> : <span className="pv-icon">{s.icon || '🎁'}</span>}
      </div>
      <div className="pv-body">
        <i className="pv-kind">{s.subtype}</i>
        <b className="pv-name">{s.name || 'Untitled'}</b>
        <EffectChips chips={safeChips(() => stuffChips(s))} />
        <p className="pv-line">{s.text || 'No card text yet.'}</p>
        {s.activated?.name && <p className="pv-line"><b>{s.activated.name}.</b> {s.activated.text}</p>}
      </div>
    </div>
  )
}

function AffairPreview({ a }: { a: AffairDef }) {
  return (
    <div className="pv pv-affair" style={{ borderColor: a.color }}>
      <span className="pv-kind">Family Affair</span>
      <b className="pv-name">{a.name || 'Untitled'}</b>
      <EffectChips chips={safeChips(() => affairChips(a))} />
      <p className="pv-line">{a.text || 'No card text yet.'}</p>
      <span className="pv-foot">Live for the whole Round, and it hits everybody at the table.</span>
    </div>
  )
}

/** A half-built card is normal here, so a chip builder that trips on a missing
 *  field must not take the preview down with it. */
function safeChips(fn: () => any[]) {
  try { return fn() } catch { return [] }
}
