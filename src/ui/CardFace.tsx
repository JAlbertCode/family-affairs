import type { GameState, InstanceId, PlayerId } from '../engine/types'
import { getCharacterDef, getStuffDef } from '../engine/cards/deck'

const BASE = import.meta.env.BASE_URL

/**
 * The full-size, fully readable card. This is what a player looks at while
 * deciding — so nothing here is abbreviated and nothing is below ~12px.
 * Board pieces get a completely different, compact treatment (BoardToken):
 * card-game UI convention is that a card in hand and the same card in play
 * should not look alike, because they answer different questions.
 */
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
          <span className="fstat s"><em>⚡</em><b>{def.stats.speed}</b><i>SPEED</i></span>
        </div>

        <div className="face-body">
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
        </div>
      </article>
    )
  }

  if (stInst) {
    const def = getStuffDef(stInst.defId)
    return (
      <article className={`face face-stuff sub-${def.subtype.toLowerCase()} ${focused ? 'focused' : ''}`} style={{ '--accent': def.color } as React.CSSProperties}>
        <div className="face-glyph"><span>{def.icon ?? '❔'}</span></div>
        <header className="face-head">
          <p className="face-type">{def.subtype}</p>
          <h2>{def.name}</h2>
        </header>
        <div className="face-body">
          <p className="face-rule big">{def.text}</p>
          {def.equipMods && def.equipMods.length > 0 && (
            <div className="face-statrow small">
              {def.equipMods.map((m, i) => (
                <span key={i} className={`fstat ${m.stat[0]}`}>
                  <b>{m.amount > 0 ? '+' : ''}{m.amount}</b><i>{m.stat.toUpperCase()}</i>
                </span>
              ))}
            </div>
          )}
          {def.interfere && (
            <p className="face-interfere">⚡ INTERFERE — can be played during someone else's battle</p>
          )}
        </div>
      </article>
    )
  }

  return <article className="face face-unknown">Unknown card</article>
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
