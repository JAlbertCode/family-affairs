import { useEffect, useRef, useState } from 'react'
import type { GameState, Intent, InstanceId, PlayerId, Slot } from '../engine/types'
import { getCharacterDef, getStuffDef, getAffairDef } from '../engine/cards/deck'
import {
  activeCharacters, auraSummary, canAct, canAttack, countAttached, currentPlayer,
  effectiveStat, explainStat, familySize, hasStatus, itemCap, limitTier, openSlots, totalItemCap,
} from '../engine/selectors'
import { needsTarget } from '../engine/effects'
import { HAND_LIMIT } from '../engine/state'
import { CardFace, cardLabel } from './CardFace'
import { BoardToken, EmptyToken } from './BoardToken'
import { CharacterPortrait } from './CharacterCard'
import { Minigame } from './Minigame'

/** What the player is currently being asked to point at. */
type Targeting =
  | { kind: 'playStuff'; iid: InstanceId }
  | { kind: 'placeChar'; iid: InstanceId }
  | { kind: 'attack'; char: InstanceId }
  | { kind: 'ability'; char: InstanceId; which: 'ability' | 'powerMove'; scope: 'enemy' | 'ally' | 'any' }
  | { kind: 'useItem'; char: InstanceId; iid: InstanceId; scope: 'enemy' | 'ally' | 'any' }
  | { kind: 'interfere'; iid: InstanceId }
  | null

export function Table({
  state, you, error, send, hotseat,
}: {
  state: GameState
  you: PlayerId
  error: string | null
  send: (i: Intent) => void
  hotseat?: boolean
}) {
  const me = state.playerState[you]
  const isMyTurn = currentPlayer(state) === you
  const battle = state.battle
  const minigame = state.minigame && !state.minigame.done ? state.minigame : null

  const [targeting, setTargeting] = useState<Targeting>(null)
  const [selected, setSelected] = useState<InstanceId | null>(null)   // my character, inline actions
  const [inspect, setInspect] = useState<InstanceId | null>(null)     // any character, read-only sheet
  const [handCard, setHandCard] = useState<InstanceId | null>(null)   // full-size card sheet
  const [showLog, setShowLog] = useState(false)
  const [affairOpen, setAffairOpen] = useState(false)
  const [turnFlash, setTurnFlash] = useState(false)
  const [autoPass, setAutoPass] = useState(false)
  const prevTurn = useRef<PlayerId | null>(null)
  const prevAffair = useRef<string | null>(null)

  // Explicit turn hand-off. Ambient cues get missed.
  useEffect(() => {
    const cur = currentPlayer(state)
    if (prevTurn.current !== null && prevTurn.current !== cur && cur === you) {
      setTurnFlash(true)
      const t = setTimeout(() => setTurnFlash(false), 1400)
      return () => clearTimeout(t)
    }
    prevTurn.current = cur
  }, [state.turnIndex, state.round, you])

  // A new Family Affair announces itself instead of quietly changing a strip.
  useEffect(() => {
    if (state.currentAffair && prevAffair.current !== null && state.currentAffair !== prevAffair.current) {
      setAffairOpen(true)   // stays until dismissed — it never times out
    }
    prevAffair.current = state.currentAffair
  }, [state.currentAffair])

  useEffect(() => { if (battle || minigame) { setTargeting(null); setSelected(null) } }, [!!battle, !!minigame])

  // Any sheet left open belongs to the player who opened it. When the device
  // changes hands — or the turn moves on — clear the lot, or the next player
  // inherits somebody else's open card.
  useEffect(() => {
    setInspect(null)
    setSelected(null)
    setHandCard(null)
    setTargeting(null)
    setShowLog(false)
  }, [you, state.turnIndex, state.round])

  const affair = state.currentAffair ? getAffairDef(state.currentAffair) : null
  const opponents = state.players.filter((p) => p !== you)

  // ---------------------------------------------------------------- helpers
  function legalTargets(iid: InstanceId): InstanceId[] {
    const inst = state.stuff[iid]
    if (!inst) return []
    const def = getStuffDef(inst.defId)
    if (def.subtype === 'Consumable') return []
    const pool = ['Gear', 'Ride', 'Pet'].includes(def.subtype)
      ? activeCharacters(state, you)
      : state.players.flatMap((p) => activeCharacters(state, p))
    return pool
      .filter((ch) => ch.zone === 'active'
        && countAttached(state, ch, def.subtype) < itemCap(ch, def.subtype)
        && ch.attached.length < totalItemCap(ch))
      .map((c) => c.iid)
  }

  function playabilityOf(iid: InstanceId): { ok: boolean; why?: string } {
    if (battle) {
      const s = state.stuff[iid]
      if (!s || !getStuffDef(s.defId).interfere) return { ok: false, why: 'Not an Interfere card' }
      if (me.interferedThisBattle >= 1) return { ok: false, why: 'Already interfered this battle' }
      return { ok: true }
    }
    if (!isMyTurn) return { ok: false, why: "Not your turn" }
    if (state.phase === 'draw') return { ok: false, why: 'Draw first' }
    if (me.cardsPlayedThisTurn >= 2) return { ok: false, why: 'No card plays left' }
    if (state.characters[iid]) {
      return familySize(state, you) < 5 ? { ok: true } : { ok: false, why: 'Family is full' }
    }
    const def = state.stuff[iid] ? getStuffDef(state.stuff[iid].defId) : null
    if (!def) return { ok: false }
    if (def.subtype === 'Consumable') return { ok: true }
    return legalTargets(iid).length > 0
      ? { ok: true }
      : { ok: false, why: `Nobody can take another ${def.subtype}` }
  }

  function playCard(iid: InstanceId) {
    setHandCard(null)
    if (battle) { setTargeting({ kind: 'interfere', iid }); return }
    if (state.characters[iid]) {
      const free = openSlots(state, you)
      if (free.length === 0) { send({ k: 'playCard', iid }); return }
      if (free.length === 1) { send({ k: 'playCard', iid, slot: free[0] }); return }
      setTargeting({ kind: 'placeChar', iid })
      return
    }
    const def = getStuffDef(state.stuff[iid].defId)
    if (def.subtype === 'Consumable') { send({ k: 'playCard', iid }); return }
    const t = legalTargets(iid)
    if (t.length === 1) { send({ k: 'playCard', iid, targetChar: t[0] }); return }
    setTargeting({ kind: 'playStuff', iid })
  }

  function tapToken(iid: InstanceId, mine: boolean) {
    if (targeting) {
      switch (targeting.kind) {
        case 'playStuff':
          if (!legalTargets(targeting.iid).includes(iid)) return
          send({ k: 'playCard', iid: targeting.iid, targetChar: iid }); break
        case 'interfere':
          send({ k: 'interfere', iid: targeting.iid, targetChar: iid }); break
        case 'attack':
          if (mine) return
          send({ k: 'attack', attacker: targeting.char, defender: iid }); break
        case 'ability':
          if (targeting.scope === 'enemy' && mine) return
          if (targeting.scope === 'ally' && (!mine || iid === targeting.char)) return
          send({ k: 'useAbility', char: targeting.char, which: targeting.which, targetChar: iid }); break
        case 'useItem':
          if (targeting.scope === 'enemy' && mine) return
          if (targeting.scope === 'ally' && !mine) return
          send({ k: 'useItem', char: targeting.char, iid: targeting.iid, targetChar: iid }); break
        default: return
      }
      setTargeting(null)
      return
    }
    if (mine && isMyTurn && !battle) setSelected(selected === iid ? null : iid)
    else setInspect(iid)
  }

  function tokenMode(iid: InstanceId, mine: boolean): 'target' | 'selected' | null {
    if (!targeting) return selected === iid ? 'selected' : null
    if (targeting.kind === 'playStuff') return legalTargets(targeting.iid).includes(iid) ? 'target' : null
    if (targeting.kind === 'interfere') return 'target'
    if (targeting.kind === 'attack') return mine ? (targeting.char === iid ? 'selected' : null) : 'target'
    if (targeting.kind === 'ability' || targeting.kind === 'useItem') {
      if (targeting.char === iid) return 'selected'
      if (targeting.scope === 'enemy') return mine ? null : 'target'
      if (targeting.scope === 'ally') return mine ? 'target' : null
      return 'target'
    }
    return null
  }

  const targetPrompt = !targeting ? null
    : targeting.kind === 'placeChar' ? 'Tap a slot to place them'
    : targeting.kind === 'playStuff'
      ? `Tap who gets ${cardLabel(state, targeting.iid)} — anyone at the table`
    : targeting.kind === 'attack' ? 'Tap an enemy to attack'
    : targeting.kind === 'interfere' ? 'Tap who it hits'
    : targeting.kind === 'useItem' ? (targeting.scope === 'enemy' ? 'Tap an enemy' : 'Tap a target')
    : targeting.scope === 'enemy' ? 'Tap an enemy'
    : targeting.scope === 'ally' ? 'Tap an ally'
    : 'Tap a target'

  // Is there anything left this Turn? If not, say so plainly rather than
  // leaving the player hunting for a move that does not exist.
  const anyPlayable = me.hand.some((i) => playabilityOf(i).ok)
  const anyActor = me.actionsLeft > 0 && activeCharacters(state, you).some((c) => {
    if (c.actedThisTurn || hasStatus(c, 'Asleep') || hasStatus(c, 'Away')) return false
    return true
  })
  const nothingToDo = isMyTurn && state.phase === 'main' && !battle && !minigame
    && !anyPlayable && !anyActor

  // If the Turn is genuinely dead — nothing playable, nobody able to act —
  // there is no decision left to make, so the game makes it. Sitting on a
  // board with no legal move and hunting for the End Turn button is not a
  // choice, it is a chore, and it happens every single Round.
  useEffect(() => {
    if (!nothingToDo) { setAutoPass(false); return }
    setAutoPass(true)
    const t = setTimeout(() => {
      if (me.hand.length > HAND_LIMIT) {
        send({ k: 'discardDown', iids: me.hand.slice(0, me.hand.length - HAND_LIMIT) })
      }
      send({ k: 'endTurn' })
    }, 1400)
    return () => clearTimeout(t)
  }, [nothingToDo, state.turnIndex, state.round])

  // ------------------------------------------------------------- game over
  if (state.phase === 'gameover') {
    const w = state.winner ? state.playerState[state.winner] : null
    return (
      <div className="app">
        <div className="winner">
          <div className="brand"><span className="b1">GAME OVER</span></div>
          <p className="w">{w?.name} wins</p>
          <p className="lobby-tag">{w?.clout} Clout after {state.round} rounds</p>
          <div className="card-panel" style={{ marginTop: 18, textAlign: 'left' }}>
            {[...state.players]
              .sort((a, b) => state.playerState[b].clout - state.playerState[a].clout)
              .map((p) => {
                const src = state.cloutSources[p]
                return (
                  <div className="player-row" key={p}>
                    <span>{state.playerState[p].name}</span>
                    <span className="clout">{state.playerState[p].clout}</span>
                    <span className="pill">{src?.combat ?? 0} KO · {src?.achievement ?? 0} ach</span>
                  </div>
                )
              })}
          </div>
        </div>
      </div>
    )
  }

  const selCh = selected ? state.characters[selected] : null

  return (
    <div className="app">
      <header className="topbar">
        <span className="round">R{state.round}</span>
        {state.finalRound && <span className="pill final">FINAL</span>}
        <span className={`turn ${isMyTurn ? 'you' : ''}`}>
          {isMyTurn ? 'YOUR TURN' : `${state.playerState[currentPlayer(state)].name}'s turn`}
        </span>
        <span className="clout-me">{me.clout}<s>/{state.cloutToWin}</s></span>
        <button className="icon-btn" onClick={() => setShowLog(true)} aria-label="Game log">☰</button>
      </header>

      {hotseat && (
        <div className="handoff">Pass to <strong>{state.playerState[you].name}</strong></div>
      )}

      {affair && (
        <button className="affair" onClick={() => setAffairOpen(true)}>
          <span className="a-badge">FAMILY<br />AFFAIR</span>
          <span className="a-body">
            <span className="n">{affair.name}</span>
            <span className="d">{affair.text}</span>
          </span>
          <span className="a-live">ACTIVE<br />NOW</span>
        </button>
      )}

      {/* ------------------------------------------ OPPONENTS (top) ------ */}
      <div className="board">
        <div className="oppzone">
          {opponents.map((pid) => {
            const ps = state.playerState[pid]
            return (
              <section className={`opp ${currentPlayer(state) === pid ? 'active-turn' : ''}`} key={pid}>
                <div className="opp-head">
                  <i className={`dot ${ps.connected ? '' : 'off'}`} />
                  <span className="opp-name">{ps.name}</span>
                  <span className="pill">{ps.hand.length} card{ps.hand.length === 1 ? '' : 's'}</span>
                  <span className="clout">{ps.clout}<s>/{state.cloutToWin}</s></span>
                </div>
                <div className="slots">
                  {ps.field.map((iid, i) => {
                    const ch = iid ? state.characters[iid] : null
                    return ch
                      ? <BoardToken key={iid} state={state} ch={ch} size="sm"
                          mode={tokenMode(iid!, false)} onClick={() => tapToken(iid!, false)} />
                      : <EmptyToken key={i} label="" size="sm" />
                  })}
                </div>
              </section>
            )
          })}
        </div>

        {/* ------------------------------------- YOUR SIDE (bottom) ------ */}
        <div className="myzone">
          <div className="fam-head">
            <span className="fam-label">Your family</span>
            <span className="fam-budget">
              <i className={me.cardsPlayedThisTurn < 2 && isMyTurn ? 'on' : ''}>{2 - me.cardsPlayedThisTurn} plays</i>
              <i className={me.actionsLeft > 0 && isMyTurn ? 'on' : ''}>{me.actionsLeft} actions</i>
            </span>
          </div>

          <div className="slots myslots">
            {me.field.map((iid, i) => {
              if (!iid) {
                const placing = targeting?.kind === 'placeChar'
                return (
                  <EmptyToken
                    key={i} label={['LEFT', 'CENTER', 'RIGHT'][i]}
                    mode={placing ? 'target' : null}
                    onClick={placing
                      ? () => { send({ k: 'playCard', iid: (targeting as any).iid, slot: i as Slot }); setTargeting(null) }
                      : undefined}
                  />
                )
              }
              const ch = state.characters[iid]
              if (!ch) return <EmptyToken key={i} label={['LEFT', 'CENTER', 'RIGHT'][i]} />
              return (
                <BoardToken
                  key={iid} state={state} ch={ch}
                  mode={tokenMode(iid, true)}
                  onClick={() => tapToken(iid, true)}
                  showAura
                />
              )
            })}
          </div>

          {me.bench.length > 0 && (
            <div className="benchrow">
              <span className="fam-sub">Bench</span>
              {me.bench.map((iid) => {
                const ch = state.characters[iid]
                return ch ? (
                  <BoardToken key={iid} state={state} ch={ch} size="sm"
                    mode={tokenMode(iid, true)} onClick={() => tapToken(iid, true)} />
                ) : null
              })}
            </div>
          )}

          {/* inline actions for the selected character — no modal needed */}
          {selCh && !targeting && (
            <CharacterActions
              state={state} you={you} ch={selCh}
              send={send}
              onTarget={(t) => { setTargeting(t); setSelected(null) }}
              onInspect={() => setInspect(selCh.iid)}
              onClose={() => setSelected(null)}
            />
          )}
        </div>
      </div>

      {targetPrompt && (
        <div className="targetbar">
          <span>{targetPrompt}</span>
          <button onClick={() => setTargeting(null)}>Cancel</button>
        </div>
      )}

      {/* ---------------------------------------------- HAND (bottom) ---- */}
      {!targeting && <div className={`handstrip ${state.phase === 'draw' ? 'predraw' : ''}`}>
        <div className="hs-head">
          <span>{state.phase === 'draw' ? 'Drawing…' : 'Your hand'}</span>
          <b>{me.hand.length}/{HAND_LIMIT}</b>
        </div>
        <div className="hs-rail">
          {me.hand.length === 0 && <span className="hs-empty">No cards</span>}
          {me.hand.map((iid) => {
            const chDef = state.characters[iid] ? getCharacterDef(state.characters[iid].defId) : null
            const stDef = state.stuff[iid] ? getStuffDef(state.stuff[iid].defId) : null
            const p = playabilityOf(iid)
            return (
              <button
                key={iid}
                className={`hs-card ${p.ok ? 'playable' : ''}`}
                style={{ '--accent': chDef?.color ?? stDef?.color ?? '#43284a' } as React.CSSProperties}
                onClick={() => setHandCard(iid)}
              >
                {chDef
                  ? <span className="hs-art"><CharacterPortrait defId={chDef.id} /></span>
                  : <span className="hs-glyph">{stDef?.icon ?? '❔'}</span>}
                <span className="hs-name">{chDef?.name ?? stDef?.name}</span>
                {chDef && <span className="hs-mini">⚔{chDef.stats.attack} 🛡{chDef.stats.defense}</span>}
                {p.ok && <span className="hs-ok" />}
              </button>
            )
          })}
        </div>
      </div>}

      {/* ------------------------------------------------- ACTION BAR ---- */}
      <div className="actionbar">
        {minigame ? (
          <div className="waiting">Tic tac toe in progress…</div>
        ) : battle ? (
          <BattleBar state={state} you={you} send={send}
            onInterfere={(iid) => setTargeting({ kind: 'interfere', iid })} />
        ) : isMyTurn && state.phase === 'draw' ? (
          <>
            <button className="btn gold" onClick={() => send({ k: 'drawCard' })}>Draw a card</button>
            {state.useKitchenTable && state.kitchenTable.some(Boolean) && (
              <div className="kt">
                {state.kitchenTable.map((c, i) => c && (
                  <button key={i} className="ktcard" onClick={() => send({ k: 'drawCard', fromKitchenTable: i })}>
                    take <b>{cardLabel(state, c)}</b>
                  </button>
                ))}
              </div>
            )}
          </>
        ) : targeting ? (
          <button className="btn ghost" onClick={() => setTargeting(null)}>Cancel</button>
        ) : isMyTurn ? (
          <button className={`btn ${autoPass ? 'gold passing' : ''}`} data-testid="end-turn" onClick={() => {
            if (me.hand.length > HAND_LIMIT) {
              send({ k: 'discardDown', iids: me.hand.slice(0, me.hand.length - HAND_LIMIT) })
            }
            send({ k: 'endTurn' })
          }}>{autoPass ? 'Nothing you can do — passing…' : 'End turn'}</button>
        ) : (
          <div className="waiting">Waiting for {state.playerState[currentPlayer(state)].name}…</div>
        )}
      </div>

      {turnFlash && <div className="turnflash"><span>YOUR TURN</span></div>}

      {minigame && <Minigame state={state} you={you} send={send} />}

      {affairOpen && affair && (
        <div className="sheet-bg" onClick={() => setAffairOpen(false)}>
          <div className="affair-card" onClick={(e) => e.stopPropagation()}>
            <span className="ac-kicker">Family Affair</span>
            <h2>{affair.name}</h2>
            <p>{affair.text}</p>
            <span className="ac-foot">This is live for the whole Round and it hits everybody at the table.</span>
            <button className="btn" onClick={() => setAffairOpen(false)}>Got it</button>
          </div>
        </div>
      )}

      {handCard && (
        <div className="sheet-bg" onClick={() => setHandCard(null)}>
          <div className="cardsheet" onClick={(e) => e.stopPropagation()}>
            <div className="cardsheet-face"><CardFace state={state} iid={handCard} focused /></div>
            {(() => {
              const p = playabilityOf(handCard)
              return (
                <div className="cardsheet-actions">
                  <button className="btn" disabled={!p.ok} onClick={() => playCard(handCard)}>
                    {p.ok ? `Play ${cardLabel(state, handCard)}` : (p.why ?? 'Cannot play')}
                  </button>
                  <button className="btn ghost narrow" onClick={() => setHandCard(null)}>Close</button>
                </div>
              )
            })()}
          </div>
        </div>
      )}

      {inspect && (
        <InspectSheet state={state} iid={inspect} onClose={() => setInspect(null)} />
      )}

      {showLog && (
        <div className="sheet-bg" onClick={() => setShowLog(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h3>What happened</h3>
            <div className="log">
              {state.log.slice(-70).reverse().map((l) => (
                <div key={l.t} className={`ln ${l.kind}`}>{l.text}</div>
              ))}
            </div>
            <button className="btn ghost" onClick={() => setShowLog(false)}>Close</button>
          </div>
        </div>
      )}

      {error && <div className="toast">{error}</div>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Inline actions — attacking should not require opening a menu first.
// ---------------------------------------------------------------------------

function CharacterActions({
  state, you, ch, send, onTarget, onInspect, onClose,
}: {
  state: GameState; you: PlayerId; ch: any
  send: (i: Intent) => void
  onTarget: (t: Targeting) => void
  onInspect: () => void
  onClose: () => void
}) {
  const me = state.playerState[you]
  const def = getCharacterDef(ch.defId)
  const act = canAct(state, ch)
  const atk = canAttack(state, ch)
  const free = ((ch.scratch.freeAttacks as number) ?? 0) > 0
  const canSwing = (atk.ok || free) && (free || me.actionsLeft >= 1)

  const consumables = ch.attached.filter((i: string) => {
    const s = state.stuff[i]
    return s && ['Food', 'Drink', 'Smoke'].includes(getStuffDef(s.defId).subtype)
  })
  const usableItems = ch.attached.filter((i: string) => {
    const s = state.stuff[i]
    return s && !!getStuffDef(s.defId).activated
  })

  function abilityChip(which: 'ability' | 'powerMove') {
    const ab = which === 'ability' ? def.ability : def.powerMove
    if (!ab) return null
    const onCd = ab.oncePerGame ? ch.cooldowns[ab.name] === -1
      : (ab.cooldown ? (ch.cooldowns[ab.name] ?? -99) > state.round : false)
    const limitOk = !ab.requiresLimit
      || Object.entries(ab.requiresLimit).every(([t, m]) => ch.limits[t as 'food'] >= (m as number))
    const disabled = !act.ok || me.actionsLeft < ab.actionCost || onCd || !limitOk
    const need = needsTarget(ab.effects)
    return (
      <button className={`chip ${which === 'powerMove' ? 'power' : ''}`} disabled={disabled}
        onClick={() => {
          if (need) onTarget({ kind: 'ability', char: ch.iid, which, scope: need })
          else { send({ k: 'useAbility', char: ch.iid, which }); onClose() }
        }}>
        <b>{which === 'powerMove' ? '★' : '✦'} {ab.name}</b>
        <i>{onCd ? 'On cooldown' : !limitOk ? 'Needs more' : ab.text.slice(0, 46) + (ab.text.length > 46 ? '…' : '')}</i>
      </button>
    )
  }

  return (
    <div className="actions-inline">
      <div className="ai-head">
        <CharacterPortrait defId={def.id} size={34} />
        <b style={{ color: def.color }}>{def.name}</b>
        {!act.ok && <em>{act.why}</em>}
        <button className="ai-close" onClick={onClose} aria-label="Deselect">✕</button>
      </div>

      {auraSummary(state, ch).length > 0 && (
        <div className="ai-aura">◈ {auraSummary(state, ch).join(' · ')}</div>
      )}

      <div className="chips">
        <button className="chip attack" disabled={!canSwing}
          onClick={() => onTarget({ kind: 'attack', char: ch.iid })}>
          <b>⚔ Attack{free ? ' (free)' : ''}</b>
          <i>{canSwing
            ? `Swing at ${effectiveStat(state, ch, 'attack')} Attack${free ? '' : ' · 1 action'}`
            : (atk.why ?? 'No actions left')}</i>
        </button>
        {abilityChip('ability')}
        {abilityChip('powerMove')}

        {usableItems.map((i: string) => {
          const sd = getStuffDef(state.stuff[i].defId)
          const ab = sd.activated!
          const cdKey = `item:${sd.id}`
          const onCd = ab.oncePerGame ? ch.cooldowns[cdKey] === -1
            : (ab.cooldown ? (ch.cooldowns[cdKey] ?? -99) > state.round : false)
          const need = needsTarget(ab.effects)
          const disabled = !act.ok || me.actionsLeft < ab.actionCost || onCd
          return (
            <button key={i} className="chip item" disabled={disabled}
              onClick={() => {
                if (need) onTarget({ kind: 'useItem', char: ch.iid, iid: i, scope: need })
                else { send({ k: 'useItem', char: ch.iid, iid: i }); onClose() }
              }}>
              <b>{sd.icon} {ab.name}</b>
              <i>{onCd ? 'On cooldown' : ab.text.slice(0, 44) + (ab.text.length > 44 ? '…' : '')}</i>
            </button>
          )
        })}

        {consumables.map((i: string) => {
          const sd = getStuffDef(state.stuff[i].defId)
          const blocked = !!ch.scratch.consumedThisTurn
            || (sd.subtype === 'Food' && limitTier(ch, 'food') === 3)
          return (
            <button key={i} className="chip eat" disabled={blocked}
              onClick={() => { send({ k: 'consume', char: ch.iid, iid: i }); onClose() }}>
              <b>{sd.icon} Eat {sd.name}</b>
              <i>Free, once per turn</i>
            </button>
          )
        })}

        {me.bench.map((b) => {
          const bc = state.characters[b]
          if (!bc || ch.zone !== 'active') return null
          return (
            <button key={b} className="chip" disabled={me.actionsLeft < 1}
              onClick={() => { send({ k: 'swap', activeChar: ch.iid, benchChar: b }); onClose() }}>
              <b>⇄ Swap in {getCharacterDef(bc.defId).name}</b>
              <i>1 action</i>
            </button>
          )
        })}

        {(['Confused', 'Busy', 'Charmed'] as const).filter((s) => hasStatus(ch, s)).map((s) => (
          <button key={s} className="chip" disabled={me.actionsLeft < 1}
            onClick={() => { send({ k: 'recoverStatus', char: ch.iid, status: s }); onClose() }}>
            <b>✧ Shake off {s}</b><i>1 action</i>
          </button>
        ))}

        <button className="chip ghost" onClick={onInspect}>
          <b>ⓘ Details</b><i>Stats, rules, neighbours</i>
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function StatBreakdown({ state, ch, stat }: { state: GameState; ch: any; stat: 'attack' | 'defense' }) {
  const parts = explainStat(state, ch, stat)
  const total = parts.reduce((n, p) => n + p.amount, 0)
  return (
    <div className="breakdown">
      <div className="bd-head">
        <span>{stat === 'attack' ? '⚔ Attack' : '🛡 Defense'}</span>
        <b>{Math.max(0, total)}</b>
      </div>
      {parts.map((p, i) => (
        <div key={i} className={`bd-row ${p.kind}`}>
          <span>{p.label}</span>
          <b className={p.amount < 0 ? 'neg' : ''}>{p.amount > 0 && p.kind !== 'base' ? '+' : ''}{p.amount}</b>
        </div>
      ))}
    </div>
  )
}

function InspectSheet({ state, iid, onClose }: { state: GameState; iid: InstanceId; onClose: () => void }) {
  const ch = state.characters[iid]
  if (!ch) return null
  const def = getCharacterDef(ch.defId)
  const auras = auraSummary(state, ch)

  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <CharacterPortrait defId={def.id} />
          <div>
            <h3 style={{ color: def.color }}>{def.name}</h3>
            <div className="sub">{def.title}<br />{def.tags.join(' · ')}</div>
          </div>
        </div>

        <div className="bd-pair">
          <StatBreakdown state={state} ch={ch} stat="attack" />
          <StatBreakdown state={state} ch={ch} stat="defense" />
        </div>

        {auras.length > 0 && (
          <div className="aurabox">
            <span className="field-label">Where they sit matters</span>
            {auras.map((a, i) => <p key={i}>◈ {a}</p>)}
          </div>
        )}

        <div className="inspect">
          {def.passive && <p className="face-rule"><strong>{def.passive.name}</strong> {def.passive.text}</p>}
          {def.ability && <p className="face-rule"><strong>{def.ability.name}</strong> {def.ability.text}</p>}
          {def.powerMove && <p className="face-rule power"><strong>★ {def.powerMove.name}</strong> {def.powerMove.text}</p>}
          {def.flaw && <p className="face-rule flaw"><strong>{def.flaw.name}</strong> {def.flaw.text}</p>}
        </div>

        <button className="btn ghost" style={{ marginTop: 12 }} onClick={onClose}>Close</button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function BattleBar({
  state, you, send, onInterfere,
}: {
  state: GameState; you: PlayerId
  send: (i: Intent) => void
  onInterfere: (iid: InstanceId) => void
}) {
  const b = state.battle!
  const me = state.playerState[you]
  const passed = b.passed.includes(you)
  const atkCh = state.characters[b.attackerChar]
  const dfnCh = state.characters[b.defenderChar]
  const atkDef = atkCh ? getCharacterDef(atkCh.defId) : null
  const dfnDef = dfnCh ? getCharacterDef(dfnCh.defId) : null
  const myInterferes = me.hand.filter((i) => {
    const s = state.stuff[i]
    return s && getStuffDef(s.defId).interfere
  })
  const canInterfere = me.interferedThisBattle < 1 && myInterferes.length > 0 && !passed

  return (
    <div className="battlebar">
      <div className="bb-vs">
        {atkDef && <CharacterPortrait defId={atkDef.id} />}
        <span className="bb-mid">
          <b>{atkDef?.name}</b><em>attacks</em><b>{dfnDef?.name}</b>
        </span>
        {dfnDef && <CharacterPortrait defId={dfnDef.id} />}
      </div>
      {canInterfere && (
        <div className="bb-cards">
          {myInterferes.map((i) => {
            const sd = getStuffDef(state.stuff[i].defId)
            return (
              <button key={i} className="bb-card" onClick={() => onInterfere(i)}>
                <span className="g">{sd.icon}</span><span className="n">{sd.name}</span>
              </button>
            )
          })}
        </div>
      )}
      <button className="btn" disabled={passed} onClick={() => send({ k: 'passInterference' })}>
        {passed
          ? `Waiting for ${state.players.length - b.passed.length} more…`
          : canInterfere ? 'Pass — let it happen' : 'Continue'}
      </button>
    </div>
  )
}
