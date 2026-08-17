import { useEffect, useRef, useState } from 'react'
import type { GameState, PlayerId } from '../engine/types'
import { currentPlayer, activeCharacters } from '../engine/selectors'
import { getAffairDef, getCharacterDef } from '../engine/cards/deck'
import { BoardToken } from './BoardToken'
import { EffectChips, affairChips } from './CardFace'
import { FxLayer } from './Fx'

/**
 * The living-room screen.
 *
 * A different problem from the phone, not a bigger version of it. The phone is
 * held at arm's length by somebody deciding what to do; the TV is across the
 * room and nobody is holding it, so it answers three questions and nothing
 * else: whose turn is it, what just happened, and who is winning.
 *
 * It never renders a hand, a button or a card sheet. That is not a styling
 * decision - the host sends it a state redacted for a viewer who holds no
 * seat, so there is no hand in the data to render even by accident.
 */
export function Tv({ state, code, waiting }: {
  state: GameState | null
  code: string
  waiting: string
}) {
  if (!state) return <TvLobby code={code} waiting={waiting} />

  const cur = currentPlayer(state)
  const affair = state.currentAffair ? getAffairDef(state.currentAffair) : null
  const leader = [...state.players].sort((a, b) => state.playerState[b].clout - state.playerState[a].clout)[0]
  const b = state.battle
  const atk = b ? state.characters[b.attackerChar] : null
  const dfn = b ? state.characters[b.defenderChar] : null

  return (
    <div className={`tv ${b ? 'fighting' : ''}`}>
      <header className="tv-top">
        <span className="tv-round">Round {state.round}{state.finalRound ? ' · FINAL' : ''}</span>
        <span className="tv-turn"><b>{state.playerState[cur]?.name}</b> is up</span>
        <span className="tv-code">Room <b>{code}</b></span>
      </header>

      {/* The race, in one line. Six numbers scattered across six panels is not
          a scoreboard; this is the only thing on the screen that answers "who
          is winning" without reading. */}
      <div className="tv-race">
        {[...state.players]
          .sort((x, y) => state.playerState[y].clout - state.playerState[x].clout)
          .map((pid) => {
            const ps = state.playerState[pid]
            return (
              <span key={pid} className={`tv-runner ${pid === leader ? 'lead' : ''} ${pid === cur ? 'up' : ''}`}>
                <b>{ps.name}</b>
                <em>{ps.clout}</em>
                <i><s style={{ width: `${Math.min(100, (ps.clout / state.cloutToWin) * 100)}%` }} /></i>
              </span>
            )
          })}
      </div>

      {/* A fight is the only moment everybody at the table is looking up, so it
          takes the screen rather than becoming another grey line in the log. */}
      {b && atk && dfn && (
        <div className="tv-fight">
          <span className="tv-fighter atk">{getCharacterDef(atk.defId).name}</span>
          <span className="tv-vs">{b.attackRoll != null ? `${b.attackScore} v ${b.defenseScore}` : 'swings at'}</span>
          <span className="tv-fighter dfn">{getCharacterDef(dfn.defId).name}</span>
        </div>
      )}

      {affair && !b && (
        <div className="tv-affair">
          <span className="tv-affair-badge">Family Affair</span>
          <b>{affair.name}</b>
          <EffectChips chips={affairChips(affair)} />
        </div>
      )}

      <div className={`tv-tables n${state.players.length}`}>
        {state.players.map((pid) => {
          const ps = state.playerState[pid]
          const mine = activeCharacters(state, pid)
          return (
            <section key={pid} className={`tv-fam ${cur === pid ? 'up' : ''} ${leader === pid ? 'lead' : ''}`}>
              <div className="tv-famhead">
                <i className={`dot ${ps.connected ? '' : 'off'}`} />
                <b>{ps.name}</b>
                <span className="tv-clout">{ps.clout}<s>/{state.cloutToWin}</s></span>
              </div>
              <div className="tv-slots">
                {ps.field.map((iid, i) => (
                  iid && state.characters[iid]
                    ? <BoardToken key={iid} state={state} ch={state.characters[iid]} size="sm" showAura />
                    : <span key={i} className="tv-empty" />
                ))}
              </div>
              <span className="tv-hand">{ps.hand.length} cards · {mine.length} up</span>
            </section>
          )
        })}
      </div>

      <FxLayer state={state} />
      <TvLog state={state} />
    </div>
  )
}

function TvLobby({ code, waiting }: { code: string; waiting: string }) {
  return (
    <div className="tv tv-waiting">
      <div className="brand"><span className="b1">FAMILY<br />AFFAIRS</span></div>
      <p className="tv-join">Join on your phone at</p>
      <p className="tv-url">{location.host}{location.pathname}</p>
      <p className="tv-join">with the code</p>
      <div className="tv-bigcode">{code || '····'}</div>
      <p className="tv-waitline">{waiting}</p>
    </div>
  )
}

/**
 * The last few things that happened, biggest last.
 *
 * Across a room you cannot read a scrolling log, so this keeps four lines and
 * fades the older ones out. What it is for is the moment somebody looks up
 * from their phone and says "wait, what happened".
 */
function TvLog({ state }: { state: GameState }) {
  const [lines, setLines] = useState<{ t: number; text: string }[]>([])
  const seen = useRef(-1)

  useEffect(() => {
    const fresh = state.log.filter((l) => l.t > seen.current && l.kind !== 'system' && l.kind !== 'affair')
    if (!fresh.length) return
    seen.current = state.log[state.log.length - 1]?.t ?? seen.current
    setLines((prev) => [...prev, ...fresh.map((l) => ({ t: l.t, text: l.text }))].slice(-4))
  }, [state.tick])

  if (!lines.length) return null
  return (
    <div className="tv-log">
      {lines.map((l, i) => (
        <span key={l.t} className={i === lines.length - 1 ? 'now' : ''}>{l.text}</span>
      ))}
    </div>
  )
}
