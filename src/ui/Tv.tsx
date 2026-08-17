import { useEffect, useRef, useState } from 'react'
import type { GameState, PlayerId } from '../engine/types'
import { currentPlayer, activeCharacters } from '../engine/selectors'
import { getAffairDef } from '../engine/cards/deck'
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

  return (
    <div className="tv">
      <header className="tv-top">
        <span className="tv-round">Round {state.round}{state.finalRound ? ' · FINAL' : ''}</span>
        <span className="tv-turn"><b>{state.playerState[cur]?.name}</b> is up</span>
        <span className="tv-code">Room <b>{code}</b></span>
      </header>

      {affair && (
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
