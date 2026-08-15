import { useEffect, useMemo, useRef, useState } from 'react'
import type { GameState, Intent, InstanceId, PlayerId, Slot } from '../engine/types'
import { getCharacterDef, getStuffDef, getAffairDef } from '../engine/cards/deck'
import {
  activeCharacters, canAttack, canAct, countAttached, currentPlayer, gearSlots,
  hasStatus, itemCap, limitTier, openSlots, rideSlots, totalItemCap, familySize,
} from '../engine/selectors'
import { needsTarget } from '../engine/effects'
import { HAND_LIMIT } from '../engine/state'
import { CharacterCard, EmptySlot, slotName, charName, CharacterPortrait } from './CharacterCard'

type Pending =
  | { kind: 'playStuff'; iid: InstanceId; scope: 'mine' | 'any' }
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
  const [pending, setPending] = useState<Pending>(null)
  const [sheet, setSheet] = useState<InstanceId | null>(null)
  const [showLog, setShowLog] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)

  const me = state.playerState[you]
  const isMyTurn = currentPlayer(state) === you
  const battle = state.battle
  const opponents = state.players.filter((p) => p !== you)

  useEffect(() => { setPending(null); setSheet(null) }, [state.tick && battle ? 'b' : 'n'])
  useEffect(() => { if (showLog) logRef.current?.scrollTo(0, logRef.current.scrollHeight) }, [state.tick, showLog])

  const affair = state.currentAffair ? getAffairDef(state.currentAffair) : null

  // ---------------------------------------------------------------- helpers
  const myActive = activeCharacters(state, you)
  const canPlayCards = isMyTurn && state.phase === 'main' && me.cardsPlayedThisTurn < 2 && !battle

  function tapHandCard(iid: InstanceId) {
    if (battle) {
      const s = state.stuff[iid]
      if (s && getStuffDef(s.defId).interfere && me.interferedThisBattle < 1) {
        setPending({ kind: 'interfere', iid })
      }
      return
    }
    if (!canPlayCards) return

    if (state.characters[iid]) {
      if (familySize(state, you) >= 5) return
      const free = openSlots(state, you)
      if (free.length === 0) { send({ k: 'playCard', iid }); return }
      setPending({ kind: 'placeChar', iid })
      return
    }
    const inst = state.stuff[iid]
    if (!inst) return
    const def = getStuffDef(inst.defId)
    if (def.subtype === 'Consumable') { send({ k: 'playCard', iid }); return }
    const targets = legalTargets(state, you, iid)
    if (targets.length === 0) return
    if (targets.length === 1) { send({ k: 'playCard', iid, targetChar: targets[0] }); return }
    setPending({ kind: 'playStuff', iid, scope: def.subtype === 'Gear' || def.subtype === 'Ride' ? 'mine' : 'any' })
  }

  function tapCharacter(iid: InstanceId, mine: boolean) {
    const ch = state.characters[iid]
    if (!ch) return

    if (pending?.kind === 'playStuff') {
      if (pending.scope === 'mine' && !mine) return
      send({ k: 'playCard', iid: pending.iid, targetChar: iid })
      setPending(null); return
    }
    if (pending?.kind === 'interfere') {
      send({ k: 'interfere', iid: pending.iid, targetChar: iid })
      setPending(null); return
    }
    if (pending?.kind === 'attack') {
      if (mine) return
      send({ k: 'attack', attacker: pending.char, defender: iid })
      setPending(null); return
    }
    if (pending?.kind === 'ability') {
      if (pending.scope === 'enemy' && mine) return
      if (pending.scope === 'ally' && (!mine || iid === pending.char)) return
      send({ k: 'useAbility', char: pending.char, which: pending.which, targetChar: iid })
      setPending(null); return
    }
    if (mine && isMyTurn && !battle) setSheet(iid)
  }

  // target highlighting
  function modeFor(iid: InstanceId, mine: boolean): 'target' | 'selected' | null {
    if (!pending) return null
    if (pending.kind === 'placeChar') return null
    if (pending.kind === 'attack') return mine ? (pending.char === iid ? 'selected' : null) : 'target'
    if (pending.kind === 'playStuff') {
      return legalTargets(state, you, pending.iid).includes(iid) ? 'target' : null
    }
    if (pending.kind === 'interfere') return 'target'
    if (pending.kind === 'ability') {
      if (pending.char === iid) return 'selected'
      if (pending.scope === 'enemy') return mine ? null : 'target'
      if (pending.scope === 'ally') return mine ? 'target' : null
      return 'target'
    }
    return null
  }

  // ------------------------------------------------------------------ render
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

  return (
    <div className="app">
      <div className="topbar">
        <span className="round">ROUND {state.round}</span>
        {hotseat && (
          <span className="pill" style={{ background: 'var(--gold)', color: '#3a2600', fontWeight: 800 }}>
            PASS TO {state.playerState[you].name.toUpperCase()}
          </span>
        )}
        {state.finalRound && <span className="pill" style={{ background: '#7a2450', color: '#fff' }}>FINAL ROUND</span>}
        <button className="pill" onClick={() => setShowLog((s) => !s)}>Log</button>
        <span className={`turn ${isMyTurn ? 'you' : ''}`}>
          {isMyTurn ? 'YOUR TURN' : `${state.playerState[currentPlayer(state)].name}'s turn`}
        </span>
      </div>

      {affair && (
        <div className="affair">
          <div className="t">Family Affair</div>
          <div className="n">{affair.name}</div>
          <div className="d">{affair.text}</div>
        </div>
      )}

      <div className="scroll">
        {showLog && (
          <div className="card-panel log" ref={logRef} style={{ maxHeight: 220, overflowY: 'auto', marginBottom: 10 }}>
            {state.log.slice(-60).map((l) => (
              <div key={l.t} className={`ln ${l.kind}`}>{l.text}</div>
            ))}
          </div>
        )}

        {opponents.map((pid) => {
          const ps = state.playerState[pid]
          return (
            <div className={`opp ${currentPlayer(state) === pid ? 'active-turn' : ''}`} key={pid}>
              <div className="opp-head">
                <i className={`dot ${ps.connected ? '' : 'off'}`} />
                <span className="opp-name">{ps.name}</span>
                <span className="pill">{ps.hand.length} cards</span>
                <span className="clout">{ps.clout} / {state.cloutToWin}</span>
              </div>
              <div className="slots">
                {ps.field.map((iid, i) => {
                  if (!iid) return <EmptySlot key={i} label={slotName(i)} />
                  const ch = state.characters[iid]
                  if (!ch) return <EmptySlot key={i} label={slotName(i)} />
                  return (
                    <CharacterCard
                      key={iid} state={state} ch={ch}
                      mode={modeFor(iid, false)}
                      onClick={() => tapCharacter(iid, false)}
                    />
                  )
                })}
              </div>
            </div>
          )
        })}

        <div className="section-title">
          Your family — {me.clout} / {state.cloutToWin} Clout
        </div>
        <div className="slots">
          {me.field.map((iid, i) => {
            if (!iid) {
              const placing = pending?.kind === 'placeChar'
              return (
                <EmptySlot
                  key={i} label={slotName(i)}
                  mode={placing ? 'target' : null}
                  onClick={placing ? () => { send({ k: 'playCard', iid: (pending as any).iid, slot: i as Slot }); setPending(null) } : undefined}
                />
              )
            }
            const ch = state.characters[iid]
            if (!ch) return <EmptySlot key={i} label={slotName(i)} />
            return (
              <CharacterCard
                key={iid} state={state} ch={ch} big
                mode={modeFor(iid, true)}
                onClick={() => tapCharacter(iid, true)}
              />
            )
          })}
        </div>

        {me.bench.length > 0 && (
          <>
            <div className="section-title">Bench</div>
            <div className="slots">
              {me.bench.map((iid) => {
                const ch = state.characters[iid]
                if (!ch) return null
                return <CharacterCard key={iid} state={state} ch={ch} mode={modeFor(iid, true)} onClick={() => tapCharacter(iid, true)} />
              })}
            </div>
          </>
        )}

        {Object.values(state.characters).some((c) => c.owner === you && c.zone === 'recovering') && (
          <>
            <div className="section-title">Recovering</div>
            <div className="slots">
              {Object.values(state.characters)
                .filter((c) => c.owner === you && c.zone === 'recovering')
                .map((ch) => <CharacterCard key={ch.iid} state={state} ch={ch} />)}
            </div>
          </>
        )}
      </div>

      {/* ------------------------------------------------------------ tray -- */}
      <div className="tray">
        {isMyTurn && state.phase === 'draw' && !battle && (
          <div className="actions">
            <button className="btn gold sm" onClick={() => send({ k: 'drawCard' })}>Draw a card</button>
            {state.useKitchenTable && state.kitchenTable.map((c, i) => c && (
              <button key={i} className="btn ghost sm" onClick={() => send({ k: 'drawCard', fromKitchenTable: i })}>
                Take: {labelOf(state, c)}
              </button>
            ))}
          </div>
        )}

        {isMyTurn && state.phase === 'main' && !battle && (
          <div className="actions">
            <button
              className="btn sm"
              onClick={() => {
                if (me.hand.length > HAND_LIMIT) {
                  send({ k: 'discardDown', iids: me.hand.slice(0, me.hand.length - HAND_LIMIT) })
                }
                send({ k: 'endTurn' })
              }}
            >
              End turn
            </button>
            {pending && <button className="btn ghost sm" onClick={() => setPending(null)}>Cancel</button>}
          </div>
        )}

        <div className="tray-head">
          <span className="lbl">Your hand</span>
          <span className="budget">
            <span className={`chipn ${me.cardsPlayedThisTurn < 2 && isMyTurn ? 'hot' : ''}`}>{2 - me.cardsPlayedThisTurn} cards</span>
            <span className={`chipn ${me.actionsLeft > 0 && isMyTurn ? 'hot' : ''}`}>{me.actionsLeft} actions</span>
            <span className="chipn">{me.hand.length}/{HAND_LIMIT}</span>
          </span>
        </div>

        <div className="hand">
          {me.hand.map((iid) => {
            const chDef = state.characters[iid] ? getCharacterDef(state.characters[iid].defId) : null
            const stDef = state.stuff[iid] ? getStuffDef(state.stuff[iid].defId) : null
            const selected = pending && 'iid' in pending && pending.iid === iid
            const playable = battle
              ? !!stDef?.interfere && me.interferedThisBattle < 1
              : canPlayCards && isPlayable(state, you, iid)
            const accent = chDef?.color ?? stDef?.color ?? '#43284a'

            return (
              <button
                key={iid}
                className={`hcard ${selected ? 'sel' : ''} ${chDef ? 'is-char' : `is-${stDef?.subtype.toLowerCase()}`}`}
                style={{ '--accent': accent } as React.CSSProperties}
                onClick={() => tapHandCard(iid)}
                disabled={!playable}
              >
                {chDef ? (
                  <span className="hcard-art">
                    <CharacterPortrait defId={chDef.id} />
                    <span className="hcard-stats">
                      <b>{chDef.stats.hp}</b>
                      <i>⚔{chDef.stats.attack}</i><i>🛡{chDef.stats.defense}</i><i>⚡{chDef.stats.speed}</i>
                    </span>
                  </span>
                ) : (
                  <span className="hcard-icon">{stDef?.icon ?? '❔'}</span>
                )}
                <span className="hcard-foot">
                  <span className="htype">{chDef ? chDef.title : stDef?.subtype}</span>
                  <span className="hn">{chDef?.name ?? stDef?.name}</span>
                  {!chDef && <span className="ht">{stDef?.text}</span>}
                </span>
                {stDef?.interfere && <span className="interfere">⚡ INTERFERE</span>}
              </button>
            )
          })}
          {me.hand.length === 0 && <span className="lobby-tag" style={{ padding: 8 }}>No cards.</span>}
        </div>
      </div>

      {/* --------------------------------------------------------- sheets -- */}
      {sheet && <ActionSheet state={state} you={you} iid={sheet} onClose={() => setSheet(null)} send={send} setPending={setPending} />}
      {battle && <BattleSheet state={state} you={you} send={send} onInterfere={(iid) => setPending({ kind: 'interfere', iid })} />}

      {pending && (
        <div className="toast" style={{ background: '#3a2a10', borderColor: '#6b4d15', color: '#ffd88a' }}>
          {pending.kind === 'placeChar' && 'Pick a slot'}
          {pending.kind === 'playStuff' && 'Pick a character'}
          {pending.kind === 'attack' && 'Pick a target to attack'}
          {pending.kind === 'ability' && `Pick a${pending.scope === 'enemy' ? 'n enemy' : pending.scope === 'ally' ? 'n ally' : ' target'}`}
          {pending.kind === 'interfere' && 'Pick who it hits'}
        </div>
      )}
      {error && <div className="toast">{error}</div>}
    </div>
  )
}

/** Characters in `scope` that this Stuff card could legally attach to. */
export function legalTargets(state: GameState, you: PlayerId, iid: InstanceId): InstanceId[] {
  const inst = state.stuff[iid]
  if (!inst) return []
  const def = getStuffDef(inst.defId)
  if (def.subtype === 'Consumable') return []

  const pool = def.subtype === 'Gear' || def.subtype === 'Ride'
    ? activeCharacters(state, you)
    : state.players.flatMap((p) => activeCharacters(state, p))

  return pool
    .filter((ch) => {
      if (ch.zone !== 'active') return false
      if (countAttached(state, ch, def.subtype) >= itemCap(ch, def.subtype)) return false
      if (ch.attached.length >= totalItemCap(ch)) return false
      return true
    })
    .map((c) => c.iid)
}

/** Can this hand card be played at all right now? */
export function isPlayable(state: GameState, you: PlayerId, iid: InstanceId): boolean {
  if (state.characters[iid]) return familySize(state, you) < 5
  const inst = state.stuff[iid]
  if (!inst) return false
  const def = getStuffDef(inst.defId)
  if (def.subtype === 'Consumable') return true
  return legalTargets(state, you, iid).length > 0
}

function labelOf(state: GameState, iid: InstanceId) {
  if (state.characters[iid]) return getCharacterDef(state.characters[iid].defId).name
  if (state.stuff[iid]) return getStuffDef(state.stuff[iid].defId).name
  return '?'
}

// ---------------------------------------------------------------------------

function ActionSheet({
  state, you, iid, onClose, send, setPending,
}: {
  state: GameState; you: PlayerId; iid: InstanceId
  onClose: () => void
  send: (i: Intent) => void
  setPending: (p: Pending) => void
}) {
  const ch = state.characters[iid]
  const me = state.playerState[you]
  if (!ch) return null
  const def = getCharacterDef(ch.defId)
  const act = canAct(state, ch)
  const atk = canAttack(state, ch)
  const free = ((ch.scratch.freeAttacks as number) ?? 0) > 0
  const consumables = ch.attached.filter((i) => {
    const s = state.stuff[i]
    return s && ['Food', 'Drink', 'Smoke'].includes(getStuffDef(s.defId).subtype)
  })

  const go = (p: Pending) => { setPending(p); onClose() }

  function abilityRow(which: 'ability' | 'powerMove') {
    const ab = which === 'ability' ? def.ability : def.powerMove
    if (!ab) return null
    const onCd = ab.oncePerGame ? ch.cooldowns[ab.name] === -1 : (ab.cooldown ? (ch.cooldowns[ab.name] ?? -99) > state.round : false)
    const limitOk = !ab.requiresLimit || Object.entries(ab.requiresLimit).every(([t, m]) => ch.limits[t as 'food'] >= (m as number))
    const need = needsTarget(ab.effects)
    const disabled = !act.ok || me.actionsLeft < ab.actionCost || onCd || !limitOk
    return (
      <button
        className="opt" disabled={disabled}
        onClick={() => {
          if (need) go({ kind: 'ability', char: iid, which, scope: need })
          else { send({ k: 'useAbility', char: iid, which }); onClose() }
        }}
      >
        <div className="on">{which === 'powerMove' ? '★ ' : ''}{ab.name}</div>
        <div className="od">
          {ab.text}
          {onCd && ' — on cooldown'}
          {!limitOk && ' — limit requirement not met'}
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

        <button
          className="opt"
          disabled={!(atk.ok || free) || (!free && me.actionsLeft < 1)}
          onClick={() => go({ kind: 'attack', char: iid })}
        >
          <div className="on">Attack{free ? ' (free)' : ''}</div>
          <div className="od">{atk.ok || free ? 'Spend an Action to swing at an enemy Character.' : atk.why}</div>
        </button>

        {abilityRow('ability')}
        {abilityRow('powerMove')}

        {consumables.length > 0 && (
          <>
            <div className="field-label" style={{ marginTop: 12 }}>Consume (free, once per turn)</div>
            {consumables.map((i) => {
              const sd = getStuffDef(state.stuff[i].defId)
              const blocked = !!ch.scratch.consumedThisTurn
                || (sd.subtype === 'Food' && limitTier(ch, 'food') === 3)
              return (
                <button key={i} className="opt" disabled={blocked}
                  onClick={() => { send({ k: 'consume', char: iid, iid: i }); onClose() }}>
                  <div className="on">{sd.name}</div>
                  <div className="od">{sd.text}</div>
                </button>
              )
            })}
          </>
        )}

        {ch.zone === 'active' && me.bench.length > 0 && (
          <>
            <div className="field-label" style={{ marginTop: 12 }}>Swap with bench (1 Action)</div>
            {me.bench.map((b) => (
              <button key={b} className="opt" disabled={me.actionsLeft < 1}
                onClick={() => { send({ k: 'swap', activeChar: iid, benchChar: b }); onClose() }}>
                <div className="on">{charName(state, b)}</div>
              </button>
            ))}
          </>
        )}

        {(['Confused', 'Busy', 'Charmed'] as const).filter((s) => hasStatus(ch, s)).map((s) => (
          <button key={s} className="opt" disabled={me.actionsLeft < 1}
            onClick={() => { send({ k: 'recoverStatus', char: iid, status: s }); onClose() }}>
            <div className="on">Shake off {s}</div>
            <div className="od">Spend 1 Family Action to clear it.</div>
          </button>
        ))}

        <button className="btn ghost" style={{ marginTop: 10 }} onClick={onClose}>Close</button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function BattleSheet({
  state, you, send, onInterfere,
}: {
  state: GameState; you: PlayerId
  send: (i: Intent) => void
  onInterfere: (iid: InstanceId) => void
}) {
  const b = state.battle!
  const me = state.playerState[you]
  const atkCh = state.characters[b.attackerChar]
  const dfnCh = state.characters[b.defenderChar]
  const atkDef = atkCh ? getCharacterDef(atkCh.defId) : null
  const dfnDef = dfnCh ? getCharacterDef(dfnCh.defId) : null
  const passed = b.passed.includes(you)
  const myInterferes = me.hand.filter((i) => {
    const s = state.stuff[i]
    return s && getStuffDef(s.defId).interfere
  })
  const canInterfere = me.interferedThisBattle < 1 && myInterferes.length > 0 && !passed
  const involved = b.attackerPlayer === you || b.defenderPlayer === you

  return (
    <div className="sheet-bg">
      <div className="sheet battle">
        <h3>{involved ? (b.attackerPlayer === you ? 'You are attacking' : 'You are being attacked') : 'Battle!'}</h3>
        <div className="rolls">
          <div className="side">
            {atkDef && <CharacterPortrait defId={atkDef.id} />}
            <div className="who" style={{ color: atkDef?.color }}>{charName(state, b.attackerChar)}</div>
          </div>
          <span className="vs">VS</span>
          <div className="side">
            {dfnDef && <CharacterPortrait defId={dfnDef.id} />}
            <div className="who" style={{ color: dfnDef?.color }}>{charName(state, b.defenderChar)}</div>
          </div>
        </div>
        <div className="sub">
          {state.playerState[b.attackerPlayer].name} attacks {state.playerState[b.defenderPlayer].name}.
          Anyone can interfere once, then the dice roll.
        </div>

        {canInterfere && myInterferes.map((i) => {
          const sd = getStuffDef(state.stuff[i].defId)
          return (
            <button key={i} className="opt" onClick={() => onInterfere(i)}>
              <div className="on">⚡ {sd.name}</div>
              <div className="od">{sd.text}</div>
            </button>
          )
        })}

        <button className="btn" disabled={passed} onClick={() => send({ k: 'passInterference' })}>
          {passed ? `Waiting for ${state.players.length - b.passed.length} more…` : 'Pass'}
        </button>
      </div>
    </div>
  )
}
