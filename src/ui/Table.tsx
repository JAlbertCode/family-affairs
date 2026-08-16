import { useEffect, useRef, useState } from 'react'
import type { GameState, Intent, InstanceId, PlayerId, Slot } from '../engine/types'
import { getCharacterDef, getStuffDef, getAffairDef } from '../engine/cards/deck'
import {
  activeCharacters, auraSummary, canAct, canAttack, countAttached, currentPlayer,
  effectiveStat, explainStat, familySize, hasStatus, itemCap, limitTier, limitTierName,
  openSlots, totalItemCap, STATUS_RULES,
} from '../engine/selectors'
import { needsTarget } from '../engine/effects'
import { HAND_LIMIT, ACTIONS_PER_TURN, CARDS_PER_TURN } from '../engine/state'
import { CardFace, cardLabel, EffectChips, stuffChips } from './CardFace'
import { BoardToken, EmptyToken, LimitMeters } from './BoardToken'
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
  state, you, error, send, hotseat, code, onLeave,
}: {
  state: GameState
  you: PlayerId
  error: string | null
  send: (i: Intent) => void
  hotseat?: boolean
  /** empty in pass-and-play */
  code?: string
  onLeave?: () => void
}) {
  const me = state.playerState[you]
  const isMyTurn = currentPlayer(state) === you
  const battle = state.battle
  const minigame = state.minigame && !state.minigame.done ? state.minigame : null

  const [targeting, setTargeting] = useState<Targeting>(null)
  const [selected, setSelected] = useState<InstanceId | null>(null)   // my character, inline actions
  const [inspect, setInspect] = useState<InstanceId | null>(null)     // any character, read-only sheet
  const [handCard, setHandCard] = useState<InstanceId | null>(null)   // full-size card sheet
  // An item already on the board opens the same way a card in hand does:
  // read it first, act second. Firing on the first tap meant looking at a
  // beer was indistinguishable from drinking it.
  const [itemCard, setItemCard] = useState<{ iid: InstanceId; char: InstanceId } | null>(null)
  const [showLog, setShowLog] = useState(false)
  const [affairOpen, setAffairOpen] = useState(false)
  const [turnFlash, setTurnFlash] = useState(false)
  const [autoPass, setAutoPass] = useState(false)
  // The hand is ~190px of a phone screen and sits on top of your own family,
  // which is where the Drunk/High/Stuffed meters live. If you cannot see those
  // without opening something, they may as well not be on the board.
  const [handOpen, setHandOpen] = useState(true)
  // A nudge, not a shot clock. Auto-passing somebody's turn in a party game
  // punishes the person telling a story, which is most of why anyone is here;
  // a visible clock gets the table to move without taking anything away.
  const [elapsed, setElapsed] = useState(0)
  const [roomShared, setRoomShared] = useState<'link' | 'code' | null>(null)

  function copyRoom(text: string, kind: 'link' | 'code') {
    try { navigator.clipboard?.writeText(text) } catch { /* insecure context */ }
    setRoomShared(kind)
    setTimeout(() => setRoomShared(null), 1800)
  }
  async function shareRoom(c: string) {
    const url = `${location.origin}${location.pathname}?room=${c}`
    try {
      if (navigator.share) { await navigator.share({ title: 'Family Affairs', text: `Join my game. Room ${c}.`, url }); return }
    } catch { /* dismissed */ }
    copyRoom(url, 'link')
  }
  // While choosing a target, a tap commits. That left no way to check what you
  // are aiming at, which is exactly when you most want to know.
  const [peek, setPeek] = useState(false)
  // Attacking lived two taps deep behind a Character token, and players kept
  // finishing whole games without finding it. It gets its own button.
  const [pickAttacker, setPickAttacker] = useState(false)
  // Applying a card to somebody resolved silently - the only record was a log
  // you had to open. This surfaces the result of your own action for a beat.
  const [flash, setFlash] = useState<string[] | null>(null)
  const lastTick = useRef<number>(-1)
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
      setAffairOpen(true)   // stays until dismissed - it never times out
    }
    prevAffair.current = state.currentAffair
  }, [state.currentAffair])

  useEffect(() => { if (battle || minigame) { setTargeting(null); setSelected(null); setPickAttacker(false) } }, [!!battle, !!minigame])
  useEffect(() => { if (!targeting) setPeek(false) }, [!!targeting])

  // Choosing a target is useless if the target is off-screen. The opponents
  // live in a scrolling column above your own family, so bring the first legal
  // one into view rather than making the player go looking for it.
  useEffect(() => {
    if (!targeting && !pickAttacker) return
    const t = setTimeout(() => {
      document.querySelector('.tok.target')?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }, 60)
    return () => clearTimeout(t)
  }, [targeting?.kind, (targeting as any)?.iid, (targeting as any)?.char, pickAttacker])

  // Any sheet left open belongs to the player who opened it. When the device
  // changes hands - or the turn moves on - clear the lot, or the next player
  // inherits somebody else's open card.
  useEffect(() => {
    setInspect(null)
    setSelected(null)
    setHandCard(null)
    setItemCard(null)
    setTargeting(null)
    setPickAttacker(false)
    setShowLog(false)
  }, [you, state.turnIndex, state.round])

  // Show whatever the engine just logged as a result of the last thing sent.
  useEffect(() => {
    const log = state.log
    if (log.length === 0) return
    const newest = log[log.length - 1].t
    if (lastTick.current < 0) { lastTick.current = newest; return }
    if (newest === lastTick.current) return
    const fresh = log.filter((l) => l.t > lastTick.current && l.kind !== 'system')
    lastTick.current = newest
    if (!fresh.length) return
    setFlash(fresh.slice(-3).map((l) => l.text))
    const t = setTimeout(() => setFlash(null), 2600)
    return () => clearTimeout(t)
  }, [state.tick])

  useEffect(() => {
    setElapsed(0)
    if (!isMyTurn) return
    const id = setInterval(() => setElapsed((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [state.turnIndex, state.round, isMyTurn])

  const affair = state.currentAffair ? getAffairDef(state.currentAffair) : null
  const opponents = state.players.filter((p) => p !== you)

  // ---------------------------------------------------------------- helpers
  function legalTargets(iid: InstanceId): InstanceId[] {
    const inst = state.stuff[iid]
    if (!inst) return []
    const def = getStuffDef(inst.defId)
    if (def.subtype === 'Consumable') {
      // A Consumable that names a target is only playable if one exists. It
      // used to be unconditionally playable, which walked the player into a
      // targeting step with an empty board and no way forward but Cancel.
      const need = needsTarget(def.effects)
      if (!need) return []
      const pool = need === 'ally'
        ? activeCharacters(state, you)
        : need === 'enemy'
          ? state.players.filter((p) => p !== you).flatMap((p) => activeCharacters(state, p))
          : state.players.flatMap((p) => activeCharacters(state, p))
      return pool.filter((ch) => ch.zone === 'active' && ch.hp > 0).map((c) => c.iid)
    }
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
    if (me.cardsPlayedThisTurn >= CARDS_PER_TURN) return { ok: false, why: 'No card plays left' }
    if (state.characters[iid]) {
      return familySize(state, you) < 5 ? { ok: true } : { ok: false, why: 'Family is full' }
    }
    const def = state.stuff[iid] ? getStuffDef(state.stuff[iid].defId) : null
    if (!def) return { ok: false }
    if (def.subtype === 'Consumable') {
      if (!needsTarget(def.effects)) return { ok: true }
      return legalTargets(iid).length > 0
        ? { ok: true }
        : { ok: false, why: 'Nobody to play it on yet' }
    }
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
    if (def.subtype === 'Consumable' && !needsTarget(def.effects)) { send({ k: 'playCard', iid }); return }
    // Even when only one Character can legally take it, make the player point
    // at them. Skipping the step reads as the card playing itself.
    setTargeting({ kind: 'playStuff', iid })
  }

  function tapToken(iid: InstanceId, mine: boolean) {
    if (pickAttacker) {
      if (!mine) return
      const ch = state.characters[iid]
      if (!ch || !canAttack(state, ch).ok) return
      setPickAttacker(false)
      setTargeting({ kind: 'attack', char: iid })
      return
    }
    if (targeting && peek) { setInspect(iid); return }
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
    if (pickAttacker) {
      if (!mine) return null
      const ch = state.characters[iid]
      return ch && canAttack(state, ch).ok ? 'target' : null
    }
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
      ? `Tap who gets ${cardLabel(state, targeting.iid)} - anyone at the table`
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

  // Attacking is a thing you do by tapping one of your own Characters. Nothing
  // on screen said so, so a first-time player could finish a whole game without
  // ever discovering combat. Say it out loud, every Turn, until they have.
  const readyCount = activeCharacters(state, you).filter((c) =>
    !c.actedThisTurn && !hasStatus(c, 'Asleep') && !hasStatus(c, 'Away')).length
  const attackers = activeCharacters(state, you).filter((c) => canAttack(state, c).ok)
  const enemyCount = state.players.filter((p) => p !== you)
    .flatMap((p) => activeCharacters(state, p)).filter((c) => c.hp > 0).length
  const canOpenAttack = isMyTurn && state.phase === 'main' && !battle && !minigame
    && me.actionsLeft > 0 && attackers.length > 0 && enemyCount > 0
  const overHand = me.hand.length > HAND_LIMIT
  const turnHint = overHand
    ? `${me.hand.length} cards - over the limit of ${HAND_LIMIT}. Ending your turn discards down to ${HAND_LIMIT}.`
    : readyCount === 0 && anyPlayable
      // Having actions and nobody to spend them on is a different problem from
      // having spent them, and telling the player the wrong one is worse than
      // saying nothing.
      ? 'Nobody in your family can act - play a Character from your hand.'
    : me.actionsLeft > 0 && readyCount > 0
      ? `${me.actionsLeft} action${me.actionsLeft === 1 ? '' : 's'} left - tap one of your Characters to attack or use an ability`
    : anyPlayable
      ? 'No actions left. You can still play a card from your hand.'
      : 'Nothing left to spend.'

  // If the Turn is genuinely dead - nothing playable, nobody able to act - // there is no decision left to make, so the game makes it. Sitting on a
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
        {isMyTurn && (
          <span className={`turnclock ${elapsed >= 90 ? 'late' : elapsed >= 45 ? 'slow' : ''}`}>
            {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}
          </span>
        )}
        <span className="clout-me">{me.clout}<s>/{state.cloutToWin}</s></span>
        {code && (
          <button className="roomchip" onClick={() => setShowLog(true)} title="Room code, share and leave">
            {code}
          </button>
        )}
        <button className="icon-btn" onClick={() => setShowLog(true)} aria-label="Menu, room code and game log">☰</button>
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
                      ? <BoardToken key={iid} state={state} ch={ch} size="sm" showAura
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
            <span className="fam-label">{isMyTurn ? `${me.name} - your family` : `${me.name}'s family`}</span>
            {/* Both halves of the budget, spent and left, without arithmetic:
                a filled pip is still yours, a hollow one is gone. */}
            <span className="fam-budget">
              <Budget label="cards" left={CARDS_PER_TURN - me.cardsPlayedThisTurn} total={CARDS_PER_TURN} live={isMyTurn} />
              <Budget label="actions" left={me.actionsLeft} total={ACTIONS_PER_TURN} live={isMyTurn} />
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
                  ready={isMyTurn && !targeting && me.actionsLeft > 0}
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

        </div>
      </div>

      {/* The selected Character's actions. This used to sit inside the board,
          which has a fixed height and clips - so on a phone the attack button
          was underneath the hand strip and simply could not be reached. */}
      {selCh && !targeting && (
        <div className="actionsheet-bg" onClick={() => setSelected(null)}>
          <div className="actionsheet" onClick={(e) => e.stopPropagation()}>
            <CharacterActions
              state={state} you={you} ch={selCh}
              send={send}
              onTarget={(t) => { setTargeting(t); setSelected(null) }}
              onInspect={() => { setSelected(null); setInspect(selCh.iid) }}
              onClose={() => setSelected(null)}
              onOpenItem={(iid, char) => setItemCard({ iid, char })}
            />
          </div>
        </div>
      )}

      {pickAttacker && (
        <div className="targetbar">
          <span>Tap which of your Characters is swinging</span>
          <button onClick={() => setPickAttacker(false)}>Cancel</button>
        </div>
      )}

      {targetPrompt && (
        <div className={`targetbar ${peek ? 'peeking' : ''}`}>
          <span>{peek ? 'Tap anyone to read them - targeting is paused' : targetPrompt}</span>
          <button className={peek ? 'on' : ''} onClick={() => setPeek((v) => !v)}>
            {peek ? 'Done' : 'ⓘ Look'}
          </button>
          <button onClick={() => { setPeek(false); setTargeting(null) }}>Cancel</button>
        </div>
      )}

      {/* ---------------------------------------------- HAND (bottom) ---- */}
      {!targeting && !pickAttacker && <div className={`handstrip ${state.phase === 'draw' ? 'predraw' : ''} ${handOpen ? '' : 'collapsed'}`}>
        <button className="hs-head" onClick={() => setHandOpen((v) => !v)}
          aria-expanded={handOpen} aria-label={handOpen ? 'Hide your hand' : 'Show your hand'}>
          <span>{state.phase === 'draw' ? 'Drawing…' : 'Your hand'}</span>
          <b className={me.hand.length > HAND_LIMIT ? 'over' : ''}>{me.hand.length}/{HAND_LIMIT}</b>
          <i className="hs-toggle">{handOpen ? 'hide ▾' : 'show ▴'}</i>
        </button>
        <div className="hs-rail">
          {me.hand.length === 0 && <span className="hs-empty">No cards</span>}
          {me.hand.map((iid) => {
            const chDef = state.characters[iid] ? getCharacterDef(state.characters[iid].defId) : null
            const stDef = state.stuff[iid] ? getStuffDef(state.stuff[iid].defId) : null
            const p = playabilityOf(iid)
            return (
              <button
                key={iid}
                className={`hs-card ${p.ok ? 'playable' : ''} ${chDef ? 'is-char' : 'is-stuff'}`}
                style={{ '--accent': chDef?.color ?? stDef?.color ?? '#43284a' } as React.CSSProperties}
                onClick={() => setHandCard(iid)}
              >
                <span className="hs-art">
                  {chDef
                    ? <CharacterPortrait defId={chDef.id} />
                    : stDef?.art
                      ? <img src={`${import.meta.env.BASE_URL}art/${stDef.art}`} alt=""
                          loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0' }} />
                      : <span className="hs-glyph">{stDef?.icon ?? '❔'}</span>}
                  {chDef && <span className="hs-hp">{chDef.stats.hp}</span>}
                  <span className="hs-kind">{chDef ? 'CHARACTER' : stDef?.subtype}</span>
                </span>
                <span className="hs-body">
                  <span className="hs-name">{chDef?.name ?? stDef?.name}</span>
                  {chDef
                    ? <span className="hs-mini">⚔{chDef.stats.attack} · 🛡{chDef.stats.defense}</span>
                    : stDef && <EffectChips chips={stuffChips(stDef).slice(0, 3)} className="mini" />}
                </span>
                {p.ok && <span className="hs-ok" />}
              </button>
            )
          })}
        </div>
      </div>}

      {/* ------------------------------------------------- ACTION BAR ---- */}
      <div className="actionbar">
        {/* In the bar rather than floating over it: anything absolutely placed
            above the buttons lands on the hand at some viewport size. */}
        {!error && flash && (
          <div className="flashbar">
            {flash.map((t, i) => <span key={i}>{t}</span>)}
          </div>
        )}
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
          <>
          {!autoPass && <div className="turnhint">{turnHint}</div>}
          {canOpenAttack && (
            <button className="btn attack-cta" data-testid="attack-cta"
              onClick={() => {
                setSelected(null)
                // One legal attacker means there is nothing to choose - go
                // straight to picking who they hit.
                if (attackers.length === 1) setTargeting({ kind: 'attack', char: attackers[0].iid })
                else setPickAttacker(true)
              }}>
              ⚔ Attack
            </button>
          )}
          <button className={`btn ${autoPass ? 'gold passing' : ''}`} data-testid="end-turn" onClick={() => {
            if (me.hand.length > HAND_LIMIT) {
              send({ k: 'discardDown', iids: me.hand.slice(0, me.hand.length - HAND_LIMIT) })
            }
            send({ k: 'endTurn' })
          }}>{autoPass ? 'Nothing you can do - passing…' : 'End turn'}</button>
          </>
        ) : (
          <div className="waiting">Waiting for {state.playerState[currentPlayer(state)].name}…</div>
        )}
      </div>

      {turnFlash && <div className="turnflash"><span>YOUR TURN</span></div>}

      {minigame && <Minigame state={state} you={you} send={send} />}

      {affairOpen && affair && (
        <div className="sheet-bg affair-bg" onClick={() => setAffairOpen(false)}>
          <div className="affair-card" onClick={(e) => e.stopPropagation()}>
            <span className="ac-kicker">Family Affair</span>
            <h2>{affair.name}</h2>
            <p>{affair.text}</p>
            <span className="ac-foot">This is live for the whole Round and it hits everybody at the table.</span>
            <button className="btn" onClick={() => setAffairOpen(false)}>Got it</button>
          </div>
        </div>
      )}

      {handCard && (() => {
        const p = playabilityOf(handCard)
        return (
          <CardSheet state={state} iid={handCard} onClose={() => setHandCard(null)} actions={<>
            <button className="btn" disabled={!p.ok} onClick={() => playCard(handCard)}>
              {p.ok ? `Play ${cardLabel(state, handCard)}` : (p.why ?? 'Cannot play')}
            </button>
            {isMyTurn && (
              <button className="btn ghost narrow" title="Bin it, free"
                onClick={() => { send({ k: 'discardCard', iid: handCard }); setHandCard(null) }}>
                Bin it
              </button>
            )}
            <button className="btn ghost narrow" onClick={() => setHandCard(null)}>Close</button>
          </>} />
        )
      })()}

      {itemCard && (() => {
        const inst = state.stuff[itemCard.iid]
        const holder = state.characters[itemCard.char]
        if (!inst || !holder) return null
        const sd = getStuffDef(inst.defId)
        const ab = sd.activated
        const eatable = ['Food', 'Drink', 'Smoke'].includes(sd.subtype) || !!sd.edible
        const cdKey = `item:${sd.id}`
        const onCd = ab ? (ab.oncePerGame
          ? holder.cooldowns[cdKey] === -1
          : (ab.cooldown ? (holder.cooldowns[cdKey] ?? -99) > state.round : false)) : false
        const blockedEat = !!holder.scratch.consumedThisTurn
          || (sd.subtype === 'Food' && limitTier(holder, 'food') === 3)
        const need = ab ? needsTarget(ab.effects) : null
        const close = () => setItemCard(null)
        return (
          <CardSheet state={state} iid={itemCard.iid} onClose={close} actions={<>
            {ab && (
              <button className="btn" disabled={onCd || me.actionsLeft < ab.actionCost}
                onClick={() => {
                  close(); setSelected(null)
                  if (need) setTargeting({ kind: 'useItem', char: itemCard.char, iid: itemCard.iid, scope: need })
                  else send({ k: 'useItem', char: itemCard.char, iid: itemCard.iid })
                }}>
                {onCd ? 'On cooldown' : `Use ${ab.name}${need ? ' -' : ''}`}
              </button>
            )}
            {eatable && (
              <button className="btn" disabled={blockedEat}
                onClick={() => { close(); setSelected(null); send({ k: 'consume', char: itemCard.char, iid: itemCard.iid }) }}>
                {blockedEat ? 'Not right now' : `${getCharacterDef(holder.defId).name} takes it`}
              </button>
            )}
            {['Gear', 'Ride', 'Pet'].includes(sd.subtype) && isMyTurn && holder.owner === you && (
              <button className="btn ghost narrow"
                onClick={() => { close(); send({ k: 'unequip', char: itemCard.char, iid: itemCard.iid }) }}>
                Take it off
              </button>
            )}
            <button className="btn ghost narrow" onClick={close}>Close</button>
          </>} />
        )
      })()}

      {inspect && state.characters[inspect] && (
        <CardSheet
          state={state} iid={inspect} onClose={() => setInspect(null)}
          detail={<CharacterNumbers state={state} ch={state.characters[inspect]} />}
          actions={<button className="btn ghost" onClick={() => setInspect(null)}>Close</button>}
        />
      )}

      {showLog && (
        <div className="sheet-bg" onClick={() => setShowLog(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            {code && (
              <div className="roompanel">
                <span className="field-label">Room code</span>
                <div className="roomcode">{code}</div>
                <p className="lobby-tag" style={{ fontSize: '.72rem', margin: '2px 0 9px', textAlign: 'center' }}>
                  Anyone who dropped out rejoins with this. It is in the address bar too.
                </p>
                <div className="sharerow">
                  <button className="btn" onClick={() => shareRoom(code)}>
                    {roomShared === 'link' ? 'Link copied' : 'Share link'}
                  </button>
                  <button className="btn ghost" onClick={() => copyRoom(code, 'code')}>
                    {roomShared === 'code' ? 'Copied' : 'Copy code'}
                  </button>
                </div>
                {onLeave && (
                  <button className="btn ghost narrow" style={{ marginTop: 8, width: '100%' }}
                    onClick={() => { if (confirm('Leave this game?')) onLeave() }}>
                    Leave game
                  </button>
                )}
              </div>
            )}
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


/**
 * Every full-card popup in the game: a card in hand, an item on the board, and
 * inspecting a Character. They were three separate implementations and two of
 * them could be open at once - the styled card sheet with the plain inspect
 * panel stacked on top, showing the same rules text twice in worse type.
 */
function CardSheet({
  state, iid, detail, actions, onClose,
}: {
  state: GameState
  iid: InstanceId
  detail?: React.ReactNode
  actions: React.ReactNode
  onClose: () => void
}) {
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="cardsheet" onClick={(e) => e.stopPropagation()}>
        <div className="cardsheet-face"><CardFace state={state} iid={iid} focused /></div>
        {detail && <div className="cardsheet-detail">{detail}</div>}
        <div className="cardsheet-actions">{actions}</div>
      </div>
    </div>
  )
}

/** The numbers behind a Character, shown under their card while inspecting. */
function CharacterNumbers({ state, ch }: { state: GameState; ch: any }) {
  const def = getCharacterDef(ch.defId)
  const auras = auraSummary(state, ch)
  return (
    <>
      {ch.statuses.length > 0 && (
        <div className="statusbox">
          <span className="field-label">What is wrong with them</span>
          {ch.statuses.map((st: any) => (
            <p key={st.name}>
              <strong>{st.name}</strong> {STATUS_RULES[st.name] ?? ''}
            </p>
          ))}
        </div>
      )}
      <div className="bd-pair">
        <StatBreakdown state={state} ch={ch} stat="attack" />
        <StatBreakdown state={state} ch={ch} stat="defense" />
      </div>
      <div className="limitbox">
        <span className="field-label">How they are holding up</span>
        <LimitMeters ch={ch} />
        <div className="limitnames">
          <i>{limitTierName(ch, 'alcohol')}</i>
          <i>{limitTierName(ch, 'weed')}</i>
          <i>{limitTierName(ch, 'food')}</i>
        </div>
        <p className="limitnote">
          Tolerance {def.tolerance.alcohol} 🍺 · {def.tolerance.weed} 🌿 · {def.tolerance.food} 🍔.
          The last pip is their line - crossing it turns a bonus into a problem.
        </p>
      </div>
      {auras.length > 0 && (
        <div className="aurabox">
          <span className="field-label">Where they sit matters</span>
          {auras.map((a, i) => <p key={i}>◈ {a}</p>)}
        </div>
      )}
    </>
  )
}

/** "2 actions" told you what was left but never what you had. */
function Budget({ label, left, total, live }: { label: string; left: number; total: number; live: boolean }) {
  const used = total - left
  return (
    <i className={`budget ${live && left > 0 ? 'on' : ''} ${left === 0 ? 'spent' : ''}`}
      title={`${used} of ${total} ${label} used`}>
      <b>
        {Array.from({ length: total }, (_, n) => (
          <s key={n} className={n < left ? 'left' : 'used'} />
        ))}
      </b>
      {left} of {total} {label}
    </i>
  )
}

// ---------------------------------------------------------------------------
// Inline actions - attacking should not require opening a menu first.
// ---------------------------------------------------------------------------

function CharacterActions({
  state, you, ch, send, onTarget, onInspect, onClose, onOpenItem,
}: {
  state: GameState; you: PlayerId; ch: any
  send: (i: Intent) => void
  onTarget: (t: Targeting) => void
  onInspect: () => void
  onClose: () => void
  onOpenItem: (iid: InstanceId, char: InstanceId) => void
}) {
  const me = state.playerState[you]
  const def = getCharacterDef(ch.defId)
  const act = canAct(state, ch)
  const atk = canAttack(state, ch)
  const free = ((ch.scratch.freeAttacks as number) ?? 0) > 0

  // An action with nobody to point it at is not an action. Offering the flow
  // and then dead-ending on an empty target list teaches the player nothing.
  const enemyTargets = state.players
    .filter((p) => p !== you)
    .flatMap((p) => activeCharacters(state, p))
    .filter((c) => c.hp > 0).length
  const allyTargets = activeCharacters(state, you).filter((c) => c.iid !== ch.iid && c.hp > 0).length
  const anyTargets = enemyTargets + allyTargets + 1
  const haveTargets = (scope: 'enemy' | 'ally' | 'any' | null) =>
    scope === 'enemy' ? enemyTargets > 0
    : scope === 'ally' ? allyTargets > 0
    : scope === 'any' ? anyTargets > 0
    : true

  const canSwing = (atk.ok || free) && (free || me.actionsLeft >= 1) && enemyTargets > 0

  const consumables = ch.attached.filter((i: string) => {
    const s = state.stuff[i]
    if (!s) return false
    const sd = getStuffDef(s.defId)
    return ['Food', 'Drink', 'Smoke'].includes(sd.subtype) || !!sd.edible
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
    const need = needsTarget(ab.effects)
    const noTarget = !haveTargets(need)
    const disabled = !act.ok || me.actionsLeft < ab.actionCost || onCd || !limitOk || noTarget
    return (
      <button className={`chip ${which === 'powerMove' ? 'power' : ''}`} disabled={disabled}
        onClick={() => {
          if (need) onTarget({ kind: 'ability', char: ch.iid, which, scope: need })
          else { send({ k: 'useAbility', char: ch.iid, which }); onClose() }
        }}>
        <b>{which === 'powerMove' ? '★' : '✦'} {ab.name}</b>
        <i>{onCd ? 'On cooldown'
          : noTarget ? (need === 'enemy' ? 'Nobody to aim at' : 'Nobody to use it on')
          : !limitOk ? 'Needs more'
          : ab.text.slice(0, 46) + (ab.text.length > 46 ? '…' : '')}</i>
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
            : enemyTargets === 0 ? 'Nobody on the other side of the table yet'
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
          const disabled = !act.ok || me.actionsLeft < ab.actionCost || onCd || !haveTargets(need)
          return (
            <button key={i} className="chip item" disabled={disabled}
              onClick={() => onOpenItem(i, ch.iid)}>
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
              onClick={() => onOpenItem(i, ch.iid)}>
              <b>{sd.icon} {sd.name}</b>
              <i>{blocked ? 'Not right now' : 'Tap to read it, then eat it'}</i>
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
      <p className="bb-explain">
        {passed
          ? 'Waiting on the rest of the table before the dice are rolled.'
          : canInterfere
            ? 'Before the dice: anyone at the table may throw in one Interfere card. Play one, or let it happen.'
            : 'Before the dice: anyone holding an Interfere card may throw it in. You have none, so this is just your nod.'}
      </p>
      <button className="btn" disabled={passed} onClick={() => send({ k: 'passInterference' })}>
        {passed
          ? `Waiting for ${state.players.length - b.passed.length} more…`
          : canInterfere ? 'Pass - let it happen' : 'Continue'}
      </button>
    </div>
  )
}
