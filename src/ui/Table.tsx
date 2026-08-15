import { useEffect, useRef, useState } from 'react'
import type { GameState, Intent, InstanceId, PlayerId, Slot } from '../engine/types'
import { getCharacterDef, getStuffDef, getAffairDef } from '../engine/cards/deck'
import {
  activeCharacters, canAct, canAttack, countAttached, currentPlayer,
  familySize, hasStatus, itemCap, limitTier, openSlots, totalItemCap,
} from '../engine/selectors'
import { needsTarget } from '../engine/effects'
import { HAND_LIMIT } from '../engine/state'
import { CardFace, cardLabel } from './CardFace'
import { BoardToken, EmptyToken } from './BoardToken'
import { CharacterPortrait } from './CharacterCard'

type View = 'field' | 'hand'

/** What the player is currently being asked to point at. */
type Targeting =
  | { kind: 'playStuff'; iid: InstanceId }
  | { kind: 'placeChar'; iid: InstanceId }
  | { kind: 'attack'; char: InstanceId }
  | { kind: 'ability'; char: InstanceId; which: 'ability' | 'powerMove'; scope: 'enemy' | 'ally' | 'any' }
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

  const [view, setView] = useState<View>('hand')
  const [targeting, setTargeting] = useState<Targeting>(null)
  const [sheet, setSheet] = useState<InstanceId | null>(null)
  const [showLog, setShowLog] = useState(false)
  const [handIndex, setHandIndex] = useState(0)
  const [turnFlash, setTurnFlash] = useState(false)
  const handRef = useRef<HTMLDivElement>(null)
  const prevTurn = useRef<PlayerId | null>(null)

  // Targeting always happens on the board, so jump there automatically.
  useEffect(() => { if (targeting && targeting.kind !== 'placeChar') setView('field') }, [targeting])
  useEffect(() => { if (targeting?.kind === 'placeChar') setView('field') }, [targeting])

  // An explicit "it's your turn" moment. Ambient cues get missed.
  useEffect(() => {
    const cur = currentPlayer(state)
    if (prevTurn.current !== null && prevTurn.current !== cur && cur === you) {
      setTurnFlash(true)
      const t = setTimeout(() => setTurnFlash(false), 1500)
      return () => clearTimeout(t)
    }
    prevTurn.current = cur
  }, [state.turnIndex, state.round, you])

  useEffect(() => { if (battle) setTargeting(null) }, [!!battle])
  useEffect(() => { if (handIndex > me.hand.length - 1) setHandIndex(Math.max(0, me.hand.length - 1)) }, [me.hand.length])

  const affair = state.currentAffair ? getAffairDef(state.currentAffair) : null
  const opponents = state.players.filter((p) => p !== you)
  const canPlayCards = isMyTurn && state.phase === 'main' && me.cardsPlayedThisTurn < 2 && !battle
  const focusedCard: InstanceId | undefined = me.hand[handIndex]

  // ---------------------------------------------------------------- helpers
  function legalTargets(iid: InstanceId): InstanceId[] {
    const inst = state.stuff[iid]
    if (!inst) return []
    const def = getStuffDef(inst.defId)
    if (def.subtype === 'Consumable') return []
    const pool = def.subtype === 'Gear' || def.subtype === 'Ride'
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
      if (me.interferedThisBattle >= 1) return { ok: false, why: 'You already interfered in this battle' }
      return { ok: true }
    }
    if (!isMyTurn) return { ok: false, why: "It's not your turn" }
    if (state.phase === 'draw') return { ok: false, why: 'Draw a card first' }
    if (me.cardsPlayedThisTurn >= 2) return { ok: false, why: 'You have played 2 cards this Turn' }
    if (state.characters[iid]) {
      return familySize(state, you) < 5
        ? { ok: true }
        : { ok: false, why: 'Your Family is full (3 active + 2 bench)' }
    }
    const def = state.stuff[iid] ? getStuffDef(state.stuff[iid].defId) : null
    if (!def) return { ok: false }
    if (def.subtype === 'Consumable') return { ok: true }
    return legalTargets(iid).length > 0
      ? { ok: true }
      : { ok: false, why: 'Nobody can take another ' + def.subtype }
  }

  function playFocused() {
    const iid = focusedCard
    if (!iid) return
    const p = playabilityOf(iid)
    if (!p.ok) return

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
    if (!targeting) {
      if (mine && isMyTurn && !battle) setSheet(iid)
      else setSheet(iid)
      return
    }
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
      default: return
    }
    setTargeting(null)
  }

  function tokenMode(iid: InstanceId, mine: boolean): 'target' | 'selected' | null {
    if (!targeting) return null
    if (targeting.kind === 'playStuff') return legalTargets(targeting.iid).includes(iid) ? 'target' : null
    if (targeting.kind === 'interfere') return 'target'
    if (targeting.kind === 'attack') return mine ? (targeting.char === iid ? 'selected' : null) : 'target'
    if (targeting.kind === 'ability') {
      if (targeting.char === iid) return 'selected'
      if (targeting.scope === 'enemy') return mine ? null : 'target'
      if (targeting.scope === 'ally') return mine ? 'target' : null
      return 'target'
    }
    return null
  }

  const targetPrompt = !targeting ? null
    : targeting.kind === 'placeChar' ? 'Choose a slot'
    : targeting.kind === 'playStuff' ? `Give ${cardLabel(state, targeting.iid)} to…`
    : targeting.kind === 'attack' ? 'Choose who to attack'
    : targeting.kind === 'interfere' ? 'Choose who it hits'
    : targeting.scope === 'enemy' ? 'Choose an enemy'
    : targeting.scope === 'ally' ? 'Choose an ally'
    : 'Choose a target'

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

  // ------------------------------------------------------------------ view
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
        <div className="handoff">Pass the device to <strong>{state.playerState[you].name}</strong></div>
      )}

      {affair && (
        <button className="affair" onClick={() => setShowLog(true)} title={affair.text}>
          <span className="t">Affair</span>
          <span className="n">{affair.name}</span>
          <span className="d">{affair.text}</span>
        </button>
      )}

      <nav className="viewswitch" role="tablist">
        <button role="tab" aria-selected={view === 'field'} onClick={() => setView('field')}>
          Field
        </button>
        <button role="tab" aria-selected={view === 'hand'} onClick={() => { setView('hand'); setTargeting(null) }}>
          Your hand <b>{me.hand.length}</b>
        </button>
      </nav>

      {targetPrompt && (
        <div className="targetbar">
          <span>{targetPrompt}</span>
          <button onClick={() => setTargeting(null)}>Cancel</button>
        </div>
      )}

      {/* ------------------------------------------------------- FIELD ---- */}
      {view === 'field' && (
        <div className="scroll">
          <div className="myfamily">
            <div className="fam-head">
              <span className="fam-label">Your family</span>
              <span className="fam-budget">
                <i className={me.cardsPlayedThisTurn < 2 && isMyTurn ? 'on' : ''}>{2 - me.cardsPlayedThisTurn} cards</i>
                <i className={me.actionsLeft > 0 && isMyTurn ? 'on' : ''}>{me.actionsLeft} actions</i>
              </span>
            </div>
            <div className="slots">
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
                  />
                )
              })}
            </div>

            {me.bench.length > 0 && (
              <>
                <div className="fam-sub">Bench</div>
                <div className="benchrow">
                  {me.bench.map((iid) => {
                    const ch = state.characters[iid]
                    return ch ? (
                      <BoardToken key={iid} state={state} ch={ch} size="sm"
                        mode={tokenMode(iid, true)} onClick={() => tapToken(iid, true)} />
                    ) : null
                  })}
                </div>
              </>
            )}
          </div>

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
      )}

      {/* -------------------------------------------------------- HAND ---- */}
      {view === 'hand' && (
        <div className="handview">
          {me.hand.length === 0 ? (
            <div className="hand-empty">Your hand is empty.</div>
          ) : (
            <>
              <div
                className="cardrail" ref={handRef}
                onScroll={(e) => {
                  const el = e.currentTarget
                  const i = Math.round(el.scrollLeft / (el.scrollWidth / me.hand.length))
                  if (i !== handIndex) setHandIndex(Math.min(i, me.hand.length - 1))
                }}
              >
                {me.hand.map((iid, i) => (
                  <div className="railitem" key={iid}>
                    <CardFace state={state} iid={iid} focused={i === handIndex} />
                  </div>
                ))}
              </div>
              <div className="raildots">
                {me.hand.map((iid, i) => (
                  <button
                    key={iid}
                    className={`${i === handIndex ? 'on' : ''} ${playabilityOf(iid).ok ? 'playable' : ''}`}
                    aria-label={`Card ${i + 1}${playabilityOf(iid).ok ? ', playable' : ''}`}
                    onClick={() => {
                      setHandIndex(i)
                      const el = handRef.current
                      if (el) el.scrollTo({ left: (el.scrollWidth / me.hand.length) * i, behavior: 'smooth' })
                    }}
                  />
                ))}
              </div>
              {(() => {
                const n = me.hand.filter((i) => playabilityOf(i).ok).length
                if (!isMyTurn || state.phase === 'draw') return null
                return (
                  <div className="railhint">
                    {n === 0 ? 'Nothing in hand can be played right now'
                      : `${n} of ${me.hand.length} playable — swipe to browse`}
                  </div>
                )
              })()}
            </>
          )}
        </div>
      )}

      {/* ------------------------------------------------- ACTION BAR ---- */}
      <div className="actionbar">
        {battle ? (
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
        ) : isMyTurn ? (
          view === 'hand' && focusedCard ? (
            (() => {
              const p = playabilityOf(focusedCard)
              return (
                <div className="bar2">
                  <button className="btn" disabled={!p.ok} onClick={playFocused}>
                    {p.ok ? `Play ${cardLabel(state, focusedCard)}` : (p.why ?? 'Cannot play')}
                  </button>
                  <button className="btn ghost narrow" onClick={() => endTurn(state, you, me, send)}>End turn</button>
                </div>
              )
            })()
          ) : (
            <div className="bar2">
              <button className="btn ghost" onClick={() => setView('hand')}>Your hand ({me.hand.length})</button>
              <button className="btn narrow" onClick={() => endTurn(state, you, me, send)}>End turn</button>
            </div>
          )
        ) : (
          <div className="waiting">Waiting for {state.playerState[currentPlayer(state)].name}…</div>
        )}
      </div>

      {turnFlash && <div className="turnflash"><span>YOUR TURN</span></div>}

      {sheet && (
        <ActionSheet
          state={state} you={you} iid={sheet}
          onClose={() => setSheet(null)}
          send={send}
          startTargeting={(t) => { setSheet(null); setTargeting(t) }}
        />
      )}

      {showLog && (
        <div className="sheet-bg" onClick={() => setShowLog(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h3>What happened</h3>
            {affair && <p className="sub"><strong>{affair.name}</strong> — {affair.text}</p>}
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

function endTurn(state: GameState, you: PlayerId, me: any, send: (i: Intent) => void) {
  if (me.hand.length > HAND_LIMIT) {
    send({ k: 'discardDown', iids: me.hand.slice(0, me.hand.length - HAND_LIMIT) })
  }
  send({ k: 'endTurn' })
}

// ---------------------------------------------------------------------------

function ActionSheet({
  state, you, iid, onClose, send, startTargeting,
}: {
  state: GameState; you: PlayerId; iid: InstanceId
  onClose: () => void
  send: (i: Intent) => void
  startTargeting: (t: Targeting) => void
}) {
  const ch = state.characters[iid]
  const me = state.playerState[you]
  if (!ch) return null
  const def = getCharacterDef(ch.defId)
  const mine = ch.owner === you
  const isMyTurn = currentPlayer(state) === you
  const act = canAct(state, ch)
  const atk = canAttack(state, ch)
  const free = ((ch.scratch.freeAttacks as number) ?? 0) > 0
  const consumables = ch.attached.filter((i) => {
    const s = state.stuff[i]
    return s && ['Food', 'Drink', 'Smoke'].includes(getStuffDef(s.defId).subtype)
  })

  function abilityRow(which: 'ability' | 'powerMove') {
    const ab = which === 'ability' ? def.ability : def.powerMove
    if (!ab) return null
    const onCd = ab.oncePerGame ? ch.cooldowns[ab.name] === -1
      : (ab.cooldown ? (ch.cooldowns[ab.name] ?? -99) > state.round : false)
    const limitOk = !ab.requiresLimit
      || Object.entries(ab.requiresLimit).every(([t, m]) => ch.limits[t as 'food'] >= (m as number))
    const need = needsTarget(ab.effects)
    const disabled = !mine || !isMyTurn || !act.ok || me.actionsLeft < ab.actionCost || onCd || !limitOk
    return (
      <button className="opt" disabled={disabled}
        onClick={() => {
          if (need) startTargeting({ kind: 'ability', char: iid, which, scope: need })
          else { send({ k: 'useAbility', char: iid, which }); onClose() }
        }}>
        <div className="on">{which === 'powerMove' ? '★ ' : ''}{ab.name}</div>
        <div className="od">
          {ab.text}
          {onCd && <><br /><em>On cooldown.</em></>}
          {!limitOk && <><br /><em>Limit requirement not met.</em></>}
        </div>
      </button>
    )
  }

  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <CharacterPortrait defId={def.id} />
          <div>
            <h3 style={{ color: def.color }}>{def.name}</h3>
            <div className="sub">
              {def.title}<br />{def.tags.join(' · ')}
              {!act.ok && <><br /><strong style={{ color: 'var(--red)' }}>{act.why}</strong></>}
            </div>
          </div>
        </div>

        {mine ? (
          <>
            <button className="opt" disabled={!isMyTurn || !(atk.ok || free) || (!free && me.actionsLeft < 1)}
              onClick={() => startTargeting({ kind: 'attack', char: iid })}>
              <div className="on">Attack{free ? ' (free)' : ''}</div>
              <div className="od">{atk.ok || free ? 'Spend an Action to swing at an enemy.' : atk.why}</div>
            </button>

            {abilityRow('ability')}
            {abilityRow('powerMove')}

            {consumables.length > 0 && (
              <>
                <div className="field-label" style={{ marginTop: 14 }}>Consume — free, once per turn</div>
                {consumables.map((i) => {
                  const sd = getStuffDef(state.stuff[i].defId)
                  const blocked = !isMyTurn || !!ch.scratch.consumedThisTurn
                    || (sd.subtype === 'Food' && limitTier(ch, 'food') === 3)
                  return (
                    <button key={i} className="opt" disabled={blocked}
                      onClick={() => { send({ k: 'consume', char: iid, iid: i }); onClose() }}>
                      <div className="on">{sd.icon} {sd.name}</div>
                      <div className="od">{sd.text}</div>
                    </button>
                  )
                })}
              </>
            )}

            {ch.zone === 'active' && me.bench.length > 0 && (
              <>
                <div className="field-label" style={{ marginTop: 14 }}>Swap with bench — 1 Action</div>
                {me.bench.map((b) => {
                  const bc = state.characters[b]
                  return (
                    <button key={b} className="opt" disabled={!isMyTurn || me.actionsLeft < 1}
                      onClick={() => { send({ k: 'swap', activeChar: iid, benchChar: b }); onClose() }}>
                      <div className="on">{bc ? getCharacterDef(bc.defId).name : '—'}</div>
                    </button>
                  )
                })}
              </>
            )}

            {(['Confused', 'Busy', 'Charmed'] as const).filter((s) => hasStatus(ch, s)).map((s) => (
              <button key={s} className="opt" disabled={!isMyTurn || me.actionsLeft < 1}
                onClick={() => { send({ k: 'recoverStatus', char: iid, status: s }); onClose() }}>
                <div className="on">Shake off {s}</div>
                <div className="od">Spend 1 Family Action to clear it.</div>
              </button>
            ))}
          </>
        ) : (
          <div className="inspect">
            {def.passive && <p className="face-rule"><strong>{def.passive.name}</strong> {def.passive.text}</p>}
            {def.ability && <p className="face-rule"><strong>{def.ability.name}</strong> {def.ability.text}</p>}
            {def.powerMove && <p className="face-rule power"><strong>★ {def.powerMove.name}</strong> {def.powerMove.text}</p>}
            {def.flaw && <p className="face-rule flaw"><strong>{def.flaw.name}</strong> {def.flaw.text}</p>}
          </div>
        )}

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
          <b>{atkDef?.name}</b>
          <em>attacks</em>
          <b>{dfnDef?.name}</b>
        </span>
        {dfnDef && <CharacterPortrait defId={dfnDef.id} />}
      </div>

      {canInterfere && (
        <div className="bb-cards">
          {myInterferes.map((i) => {
            const sd = getStuffDef(state.stuff[i].defId)
            return (
              <button key={i} className="bb-card" onClick={() => onInterfere(i)}>
                <span className="g">{sd.icon}</span>
                <span className="n">{sd.name}</span>
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
