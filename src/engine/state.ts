import type {
  GameState, PlayerId, Intent, InstanceId, CharacterInstance, StuffInstance,
  Slot, LimitTrack, PlayerState, BattleState,
} from './types'
import {
  buildFamilyDeckDefIds, buildAffairsDeckDefIds, getCharacterDef, getStuffDef,
  getAffairDef, CHARACTERS_BY_ID, STUFF_BY_ID,
} from './cards/deck'
import { d6, shuffle } from './rng'
import {
  acrossFrom, activeCharacters, adjacentAllies, allActiveEveryone, canAct, canAttack, charmBlocks, currentPlayer,
  countAttached, effectiveStat, familySize, gearSlots, hasStatus, hasTag, limitTier, itemCap, totalItemCap,
  openSlots, rideSlots, isCurrentPlayer, ornaments, bestStat, ORNAMENT_MAX,
} from './selectors'
import {
  applyDamage, applyHeal, applyLimit, applyStatMod, applyStatus, awardClout, consumeCard,
  drawCards, discardRandom, fx, log, needsTarget, removeStatus, rollBadLuck, runEffects,
  type EffectCtx,
} from './effects'

export const HAND_LIMIT = 7          // §41
export const ACTIONS_PER_TURN = 3    // §8 Phase 3
export const CARDS_PER_TURN = 2      // §8 Phase 2
/**
 * Cards drawn at the top of a Turn.
 *
 * §8 Phase 1 says one, and one is what the game shipped with - but one drawn
 * against two playable is a hand that empties in five Turns and then never
 * refills. From there every Turn is draw a card, play that card: no hand, no
 * decision, and half the deck's interactions (hold an Interference, save a
 * counter, choose between two plays) simply never come up. Two is the number
 * that keeps a hand on the table.
 */
export const CARDS_DRAWN_PER_TURN = 2
export const STARTING_HAND = 5       // §6

/**
 * §2 offers 7 / 10 / 15 as Quick / Standard / Long. A flat number does not
 * hold up across player counts: more players means more turns per Round, so
 * the same threshold takes twice as long at a table of 6. Measured medians at
 * ~20s per turn: 2P/10 = 29min, 4P/8 = 29min, 6P/7 = 34min. This keeps every
 * table inside the 30-60 minute target. The host can still override it.
 */
/**
 * Tuned against the simulator, not chosen for feel. The card list roughly
 * doubled and more Gear on the board means fewer KOs, which means Clout
 * accumulates more slowly: the old 10/8/7 put a six-player game at a median 76
 * minutes against a promise of 30-40.
 *
 * Measured in TURNS rather than Rounds, because a Round at a table of six is
 * three times the wall-clock of a Round at a table of two. These land every
 * table size at roughly 80 turns, or 40-50 minutes:
 *
 *   2P @ 6 -> ~44 min      4P @ 6 -> 46 min      6P @ 5 -> 44 min
 *
 * Six needs a LOWER threshold than four, which looks backwards until you count
 * targets: more players on the board means more things to KO per Round, and
 * KOs are where most Clout comes from.
 */
export function defaultCloutToWin(playerCount: number): number {
  if (playerCount <= 5) return 6
  return 5
}

let idCounter = 0
function nid(prefix: string) { return `${prefix}${(idCounter++).toString(36)}` }

// ---------------------------------------------------------------------------
// Game creation (§6)
// ---------------------------------------------------------------------------

export function createGame(
  players: { id: PlayerId; name: string }[],
  opts: { seed?: number; cloutToWin?: number; useKitchenTable?: boolean; turnSeconds?: number } = {},
): GameState {
  idCounter = 0
  const seed0 = opts.seed ?? 12345

  const state: GameState = {
    version: 1,
    seed: seed0,
    cloutToWin: opts.cloutToWin ?? 10,
    players: players.map((p) => p.id),
    playerState: {},
    characters: {},
    stuff: {},
    familyDeck: [],
    familyDiscard: [],
    affairsDeck: [],
    affairsDiscard: [],
    kitchenTable: [null, null, null],
    useKitchenTable: opts.useKitchenTable ?? false,
    // A shot clock, in seconds, or 0 for none. It is a number on the state
    // rather than a wall clock: the host counts the time and submits an
    // ordinary endTurn when it runs out, so the game stays replayable from
    // (seed, intents) and nothing in the engine ever asks what time it is.
    turnSeconds: opts.turnSeconds ?? 0,
    currentAffair: null,
    round: 1,
    turnIndex: 0,
    phase: 'draw',
    battle: null,
    pending: null,
    minigame: null,
    finalRound: false,
    reachedThreshold: [],
    winner: null,
    achievementsScored: {},
    cloutSources: {},
    turnOrder: [],
    log: [],
    fx: [],
    tick: 0,
  }
  for (const p of players) {
    state.achievementsScored[p.id] = []
    state.cloutSources[p.id] = { combat: 0, achievement: 0, other: 0 }
  }

  for (const p of players) {
    state.playerState[p.id] = {
      id: p.id, name: p.name, clout: 0, hand: [],
      field: [null, null, null], bench: [],
      actionsLeft: ACTIONS_PER_TURN, cardsPlayedThisTurn: 0,
      interferedThisBattle: 0, connected: true,
    }
  }

  // Build the Family Deck as concrete instances
  const defIds = buildFamilyDeckDefIds(players.length)
  const instances: InstanceId[] = []
  for (const defId of defIds) {
    if (CHARACTERS_BY_ID[defId]) {
      const def = CHARACTERS_BY_ID[defId]
      const iid = nid('c')
      state.characters[iid] = {
        iid, defId, owner: '', hp: def.stats.hp, maxHp: def.stats.hp,
        limits: { alcohol: 0, weed: 0, food: 0 },
        statuses: [], mods: [], attached: [],
        actedThisTurn: false, koRecoveryTurns: 0,
        zone: 'bench', slot: null, cooldowns: {},
        achievementsScored: [], scratch: {},
      }
      instances.push(iid)
    } else {
      const iid = nid('s')
      state.stuff[iid] = { iid, defId, owner: '', attachedTo: null }
      instances.push(iid)
    }
  }

  const sh = shuffle(instances, state.seed)
  state.familyDeck = sh.arr
  state.seed = sh.seed

  const sa = shuffle(buildAffairsDeckDefIds(), state.seed)
  state.affairsDeck = sa.arr
  state.seed = sa.seed

  // Deal 5, guaranteeing at least one Character (§6)
  for (const p of players) dealOpeningHand(state, p.id)

  // Everybody starts with somebody on the board (§6 guarantees a Character in
  // hand; this puts one down). An empty board on Turn 1 is the worst first
  // impression the game makes: your whole hand is Food and Gear, every card is
  // greyed out with "Nobody to play it on yet", and the only legal move is to
  // end your Turn. It reads as a broken game rather than as a rule.
  //
  // Centre slot, because it is adjacent to both of the others and every
  // adjacency bonus in the game then has somewhere to point.
  for (const p of players) openingCharacter(state, p.id)

  const firstOrder = shuffle(state.players, state.seed)
  state.turnOrder = firstOrder.arr
  state.seed = firstOrder.seed

  if (state.useKitchenTable) refillKitchenTable(state)

  log(state, `Family Affairs - ${players.length} players, first to ${state.cloutToWin} Clout.`)
  // No Affair in Round 1. It used to reveal here, during setup, when every
  // board in the game is still empty: measured across 25 six-player games,
  // 100% of Round 1 Affairs resolved against zero Characters and did literally
  // nothing. The first one anybody sees is now the Round 2 one, which lands on
  // an average of 8 Characters.
  log(state, `Round 1 turn order: ${state.turnOrder.map((p) => state.playerState[p].name).join(' -> ')}`)
  autoDraw(state)
  return state
}

function dealOpeningHand(state: GameState, pid: PlayerId) {
  const ps = state.playerState[pid]
  for (let attempt = 0; attempt < 20; attempt++) {
    ps.hand = []
    drawCards(state, pid, STARTING_HAND)
    const hasChar = ps.hand.some((i) => !!state.characters[i])
    if (hasChar) break
    // reveal, reshuffle, redraw (§6)
    state.familyDeck.push(...ps.hand)
    const r = shuffle(state.familyDeck, state.seed)
    state.familyDeck = r.arr
    state.seed = r.seed
  }
  // ownership stamp
  for (const i of ps.hand) claim(state, i, pid)
}

/** Put one Character from the opening hand straight onto the board. */
function openingCharacter(state: GameState, pid: PlayerId) {
  const ps = state.playerState[pid]
  const iid = ps.hand.find((i) => !!state.characters[i])
  if (!iid) return
  const ch = state.characters[iid]
  const def = getCharacterDef(ch.defId)
  ch.owner = pid
  ch.hp = def.stats.hp
  ch.maxHp = def.stats.hp
  ps.field[1] = iid
  ch.zone = 'active'
  ch.slot = 1
  ps.hand = ps.hand.filter((x) => x !== iid)
  grantStartingStuff(state, ch)
  arrivesAlreadyGoing(state, ch)
  log(state, `${ps.name} arrives with ${def.name}.`, 'play')
}

/**
 * Somebody just handed Titi Evelyn something.
 *
 * She keeps a piece of them for it - the strongest Character that player has on
 * the table, because what an ornament remembers is the energy of whoever gave
 * it, not the thing.
 *
 * Never twice from the same Character. That one rule is what stops her filling
 * the tree off her own hand in a single Turn, and it is also what makes the
 * three-different-people payoff on Trim The Tree something you have to go and
 * arrange: her own Family can only ever supply two of the three. The first
 * version barred her own Family outright, and the result was a Character whose
 * entire kit depended on opponents volunteering gifts - dead on arrival, and
 * the simulator said so immediately.
 */
function keepOrnament(state: GameState, target: CharacterInstance, giver: PlayerId) {
  if (getCharacterDef(target.defId).id !== 'titievelyn') return
  const have = ornaments(target)
  if (have.length >= ORNAMENT_MAX) return
  const from = activeCharacters(state, giver)
    .filter((c) => c.hp > 0 && c.iid !== target.iid && !have.includes(c.defId))
    .sort((a, b) => bestStat(state, b).value - bestStat(state, a).value)[0]
  if (!from) return
  target.scratch['keep:ornaments'] = [...have, from.defId]
  log(state, `Titi Evelyn keeps a little of ${getCharacterDef(from.defId).name}. ${have.length + 1} of ${ORNAMENT_MAX} on the tree.`, 'status')
}

function claim(state: GameState, iid: InstanceId, pid: PlayerId) {
  if (state.characters[iid]) state.characters[iid].owner = pid
  else if (state.stuff[iid]) state.stuff[iid].owner = pid
}

function refillKitchenTable(state: GameState) {
  for (let i = 0; i < 3; i++) {
    if (!state.kitchenTable[i]) {
      const c = state.familyDeck.shift()
      state.kitchenTable[i] = c ?? null
    }
  }
}

// ---------------------------------------------------------------------------
// Family Affairs (§29)
// ---------------------------------------------------------------------------

function revealAffair(state: GameState) {
  if (state.affairsDeck.length === 0) {
    const r = shuffle(state.affairsDiscard, state.seed)
    state.affairsDeck = r.arr
    state.seed = r.seed
    state.affairsDiscard = []
  }
  const id = state.affairsDeck.shift()
  if (!id) return
  if (state.currentAffair) state.affairsDiscard.push(state.currentAffair)
  state.currentAffair = id

  const def = getAffairDef(id)
  const hit = allActiveEveryone(state).length
  log(state, `FAMILY AFFAIR: ${def.name}. ${def.text}`, 'affair')

  // Grandma "I Knew It" bookkeeping: she reacts to anything that hits her
  const before = new Map(allActiveEveryone(state).map((c) => [c.iid, c.hp]))

  runEffects(state, def.effects, { controller: currentPlayer(state) })

  // An Affair that changed nothing should say so rather than looking active.
  log(state, hit > 0
    ? `${def.name} lands on ${hit} Character${hit === 1 ? '' : 's'}.`
    : `${def.name} lands on nobody. There is not a single Character on the table yet.`, 'affair')

  for (const c of allActiveEveryone(state)) {
    if (getCharacterDef(c.defId).id !== 'grandma') continue
    const hurt = (before.get(c.iid) ?? c.hp) > c.hp || c.statuses.length > 0 || c.mods.some((m) => m.amount < 0)
    if (hurt && !c.scratch.iKnewIt) {
      c.scratch.iKnewIt = 1
      applyStatMod(state, c, 'attack', 1, 'round')
      log(state, 'Grandma knew it. +1 Attack for the Round.', 'status')
    }
  }
}

// ---------------------------------------------------------------------------
// Bad Luck proneness (§28)
// ---------------------------------------------------------------------------

function badLuckThreshold(state: GameState, ch: CharacterInstance): number {
  let t = 0
  const s = ch.statuses.find((x) => x.name === 'Bad Luck')
  if (s) t = Math.max(t, s.threshold ?? 1)
  // Chi Chi - Bad Influence (§28). He is worse for the people he is winding
  // up than for the people he loves: rivals across from him go sideways on a
  // natural 1-2, his own family only on a natural 1. It still catches them.
  for (const a of adjacentAllies(state, ch.iid)) {
    if (getCharacterDef(a.defId).id === 'chichi') t = Math.max(t, 1)
  }
  for (const e of acrossFrom(state, ch.iid)) {
    if (getCharacterDef(e.defId).id === 'chichi') t = Math.max(t, 2)
  }
  return t
}

// ---------------------------------------------------------------------------
// Confusion / Wasted action-failure check (§21, §27)
// ---------------------------------------------------------------------------

function actionFails(state: GameState, ch: CharacterInstance): boolean {
  const confused = hasStatus(ch, 'Confused')
  const wasted = limitTier(ch, 'alcohol') === 3
  if (!confused && !wasted) return false
  const r = d6(state.seed)
  state.seed = r.seed
  const failed = r.face <= 2
  log(
    state,
    `${getCharacterDef(ch.defId).name} is ${wasted ? 'Wasted' : 'Confused'} - rolled ${r.face}. ${failed ? 'The Action fails.' : 'It works.'}`,
    'status',
  )
  return failed
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export interface ApplyResult { state: GameState; error?: string }

export function applyIntent(prev: GameState, pid: PlayerId, intent: Intent): ApplyResult {
  const state: GameState = structuredClone(prev)
  try {
    const err = handle(state, pid, intent)
    if (err) return { state: prev, error: err }
    checkAchievements(state)
    return { state }
  } catch (e: any) {
    return { state: prev, error: e?.message ?? String(e) }
  }
}

function handle(state: GameState, pid: PlayerId, intent: Intent): string | undefined {
  if (state.phase === 'gameover') return 'The game is over.'
  const ps = state.playerState[pid]
  if (!ps) return 'Unknown player.'

  // A minigame blocks everything until it resolves.
  if (state.minigame && !state.minigame.done && intent.k !== 'minigameMove') {
    return 'Finish the tic tac toe first.'
  }

  // --- interference is the only thing legal while a battle is open ---
  if (state.battle && !['interfere', 'passInterference', 'confirmRolls'].includes(intent.k)) {
    return 'A battle is in progress - resolve it first.'
  }

  switch (intent.k) {
    // ------------------------------------------------------------- DRAW ----
    case 'drawCard': {
      if (!isCurrentPlayer(state, pid)) return 'Not your turn.'
      if (state.phase !== 'draw') return 'You have already drawn.'
      if (intent.fromKitchenTable != null && state.useKitchenTable) {
        const idx = intent.fromKitchenTable
        const card = state.kitchenTable[idx]
        if (!card) return 'That Kitchen Table slot is empty.'
        state.kitchenTable[idx] = null
        ps.hand.push(card)
        claim(state, card, pid)
        refillKitchenTable(state)
        log(state, `${ps.name} takes a card from the Kitchen Table.`, 'play')
        // A Kitchen Table pick is one of the two, not instead of them.
        drawInto(state, pid, CARDS_DRAWN_PER_TURN - 1)
      } else {
        drawInto(state, pid, CARDS_DRAWN_PER_TURN)
        log(state, `${ps.name} draws.`, 'play')
      }
      state.phase = 'main'
      return
    }

    // ------------------------------------------------------- PLAY A CARD ----
    case 'playCard': {
      if (!isCurrentPlayer(state, pid)) return 'Not your turn.'
      if (state.phase !== 'main') return 'You must draw first.'
      if (!ps.hand.includes(intent.iid)) return 'That card is not in your hand.'
      if (ps.cardsPlayedThisTurn >= CARDS_PER_TURN) return `You may only play ${CARDS_PER_TURN} cards per Turn.`
      return playCard(state, pid, intent.iid, intent.targetChar, intent.slot)
    }

    // ------------------------------------------------------------ ATTACK ----
    case 'attack': {
      if (!isCurrentPlayer(state, pid)) return 'Not your turn.'
      if (state.phase !== 'main') return 'You must draw first.'
      return declareAttack(state, pid, intent.attacker, intent.defender)
    }

    // ----------------------------------------------------------- ABILITY ----
    case 'useAbility': {
      if (!isCurrentPlayer(state, pid)) return 'Not your turn.'
      if (state.phase !== 'main') return 'You must draw first.'
      return useAbility(state, pid, intent.char, intent.which, intent.targetChar)
    }

    // ---------------------------------------------------------- USE ITEM ----
    // Gear, Rides and Pets can carry an ability the holder triggers. Same
    // budget and cooldown rules as a Character ability.
    case 'useItem': {
      if (!isCurrentPlayer(state, pid)) return 'Not your turn.'
      const ch = state.characters[intent.char]
      if (!ch || ch.owner !== pid) return 'Not your Character.'
      if (!ch.attached.includes(intent.iid)) return 'That item is not equipped to this Character.'
      const inst = state.stuff[intent.iid]
      if (!inst) return 'Unknown item.'
      const sd = getStuffDef(inst.defId)
      const ab = sd.activated
      if (!ab) return `${sd.name} has nothing to activate.`

      const act = canAct(state, ch)
      if (!act.ok) return act.why
      const ps2 = state.playerState[pid]
      if (ps2.actionsLeft < ab.actionCost) return 'No Family Actions left.'
      const cdKey = `item:${sd.id}`
      if (ab.oncePerGame && ch.cooldowns[cdKey] === -1) return `${ab.name} is once per game.`
      if (ab.cooldown && (ch.cooldowns[cdKey] ?? -99) > state.round) {
        return `${ab.name} is on cooldown until Round ${ch.cooldowns[cdKey]}.`
      }
      const need = needsTarget(ab.effects)
      if (need && !intent.targetChar) return `${ab.name} needs a target.`

      ps2.actionsLeft -= ab.actionCost
      ch.actedThisTurn = true
      log(state, `${getCharacterDef(ch.defId).name} uses ${sd.name} - ${ab.name}.`, 'play')
      if (actionFails(state, ch)) return

      if (ab.oncePerGame) ch.cooldowns[cdKey] = -1
      else if (ab.cooldown) ch.cooldowns[cdKey] = state.round + ab.cooldown

      runEffects(state, ab.effects, {
        controller: pid,
        sourceChar: ch.iid,
        eventTarget: intent.targetChar ?? ch.iid,
        chosen: intent.targetChar ? [intent.targetChar] : [],
      })
      return
    }

    // ----------------------------------------------------------- CONSUME ----
    // Free (no Family Action) but once per Character per Turn, so feeding stays
    // fast at the table while attached Stuff remains a real, raidable board state.
    case 'discardCard': {
      if (!isCurrentPlayer(state, pid)) return 'Not your turn.'
      if (!ps.hand.includes(intent.iid)) return 'That card is not in your hand.'
      ps.hand = ps.hand.filter((x) => x !== intent.iid)
      state.familyDiscard.push(intent.iid)
      const gone = state.characters[intent.iid]
        ? getCharacterDef(state.characters[intent.iid].defId).name
        : state.stuff[intent.iid] ? getStuffDef(state.stuff[intent.iid].defId).name : 'a card'
      log(state, `${ps.name} bins ${gone}.`, 'play')
      return
    }

    case 'unequip': {
      if (!isCurrentPlayer(state, pid)) return 'Not your turn.'
      const ch = state.characters[intent.char]
      if (!ch || ch.owner !== pid) return 'Not your Character.'
      if (!ch.attached.includes(intent.iid)) return 'That is not on this Character.'
      const inst = state.stuff[intent.iid]
      if (!inst) return 'Unknown item.'
      ch.attached = ch.attached.filter((x) => x !== intent.iid)
      inst.attachedTo = null
      state.familyDiscard.push(intent.iid)
      log(state, `${getCharacterDef(ch.defId).name} gets rid of ${getStuffDef(inst.defId).name}.`, 'play')
      return
    }

    case 'consume': {
      if (!isCurrentPlayer(state, pid)) return 'Not your turn.'
      const ch = state.characters[intent.char]
      if (!ch || ch.owner !== pid) return 'Not your Character.'
      if (ch.zone !== 'active') return 'That Character is not on the field.'
      if (hasStatus(ch, 'Asleep')) return 'Asleep.'
      if (ch.scratch.consumedThisTurn) return `${getCharacterDef(ch.defId).name} has already consumed this Turn.`
      if (!ch.attached.includes(intent.iid)) return 'That item is not attached to this Character.'
      const si = state.stuff[intent.iid]
      if (!si) return 'Unknown item.'
      const sd = getStuffDef(si.defId)
      if (!['Food', 'Drink', 'Smoke'].includes(sd.subtype) && !sd.edible) {
        return `${sd.name} is not consumable.`
      }
      // §23: a Stuffed Character cannot voluntarily eat more Food
      if (sd.subtype === 'Food' && limitTier(ch, 'food') === 3) {
        return `${getCharacterDef(ch.defId).name} is Stuffed and cannot voluntarily eat.`
      }
      ch.scratch.consumedThisTurn = 1
      consumeCard(state, ch, intent.iid, { controller: pid, sourceChar: ch.iid, eventTarget: ch.iid })
      return
    }

    // -------------------------------------------------------------- SWAP ----
    case 'swap': {
      if (!isCurrentPlayer(state, pid)) return 'Not your turn.'
      if (ps.actionsLeft < 1) return 'No Family Actions left.'
      const a = state.characters[intent.activeChar]
      const b = state.characters[intent.benchChar]
      if (!a || a.owner !== pid || a.zone !== 'active') return 'Invalid Active Character.'
      if (!b || b.owner !== pid || b.zone !== 'bench') return 'Invalid Benched Character.'
      const slot = a.slot!
      ps.field[slot] = b.iid
      ps.bench = ps.bench.filter((x) => x !== b.iid).concat(a.iid)
      b.zone = 'active'; b.slot = slot
      a.zone = 'bench'; a.slot = null
      ps.actionsLeft -= 1
      log(state, `${ps.name} swaps ${getCharacterDef(a.defId).name} for ${getCharacterDef(b.defId).name}.`, 'play')
      return
    }

    // -------------------------------------------------------------- MOVE ----
    case 'move': {
      if (!isCurrentPlayer(state, pid)) return 'Not your turn.'
      if (ps.actionsLeft < 1) return 'No Family Actions left.'
      const a = state.characters[intent.char]
      if (!a || a.owner !== pid || a.zone !== 'active') return 'That Character is not on your field.'
      const to = intent.slot
      if (to !== 0 && to !== 1 && to !== 2) return 'No such slot.'
      if (a.slot === to) return 'Already there.'
      const from = a.slot!
      const b = ps.field[to] ? state.characters[ps.field[to]!] : null

      ps.field[from] = b ? b.iid : null
      ps.field[to] = a.iid
      a.slot = to
      if (b) b.slot = from

      ps.actionsLeft -= 1
      const where = ['LEFT', 'CENTER', 'RIGHT']
      log(state, b
        ? `${ps.name} has ${getCharacterDef(a.defId).name} and ${getCharacterDef(b.defId).name} trade places.`
        : `${ps.name} moves ${getCharacterDef(a.defId).name} to the ${where[to]} slot.`, 'play')
      return
    }

    // ------------------------------------------------- RECOVER A STATUS ----
    case 'recoverStatus': {
      if (!isCurrentPlayer(state, pid)) return 'Not your turn.'
      if (ps.actionsLeft < 1) return 'No Family Actions left.'
      const ch = state.characters[intent.char]
      if (!ch || ch.owner !== pid) return 'Not your Character.'
      if (!hasStatus(ch, intent.status)) return 'That Character does not have that status.'
      if (!['Confused', 'Busy', 'Charmed'].includes(intent.status)) return 'That status cannot be shaken off.'
      removeStatus(state, ch, intent.status)
      ps.actionsLeft -= 1
      log(state, `${getCharacterDef(ch.defId).name} shakes off ${intent.status}.`, 'status')
      return
    }

    // --------------------------------------------------------- INTERFERE ----
    case 'interfere': {
      if (!state.battle) return 'There is no battle to interfere with.'
      if (ps.interferedThisBattle >= 1) return 'You have already interfered in this battle (§16).'
      if (!ps.hand.includes(intent.iid)) return 'That card is not in your hand.'
      const inst = state.stuff[intent.iid]
      if (!inst) return 'Characters cannot be played as Interfere.'
      const def = getStuffDef(inst.defId)
      if (!def.interfere) return `${def.name} is not an Interfere card.`

      ps.hand = ps.hand.filter((x) => x !== intent.iid)
      state.familyDiscard.push(intent.iid)
      ps.interferedThisBattle += 1

      const b = state.battle
      log(state, `${ps.name} interferes: ${def.name}.`, 'combat')
      const hitIid = intent.targetChar ?? b.defenderChar
      const ctx2: EffectCtx = {
        controller: pid,
        attacker: b.attackerChar,
        defender: b.defenderChar,
        eventTarget: hitIid,
        chosen: intent.targetChar ? [intent.targetChar] : [],
      }
      // Something shoved at somebody mid-fight is still something they had.
      // This path ran the card's effects and skipped its limitGain entirely,
      // so a shot pressed into a man's hand during a brawl moved his Attack
      // and not his Alcohol - which is the half of the card that matters.
      const hit = state.characters[hitIid]
      if (hit && (def.subtype === 'Food' || def.subtype === 'Drink' || def.subtype === 'Smoke')) {
        const gains: Partial<Record<LimitTrack, number>> = { ...(def.limitGain ?? {}) }
        if (def.subtype === 'Food' && !gains.food) gains.food = 1
        for (const [track, amt] of Object.entries(gains)) {
          applyLimit(state, hit, track as LimitTrack, amt as number, ctx2)
        }
      }
      runEffects(state, def.effects, ctx2)
      // playing an interfere re-opens the window for everyone else
      state.battle.passed = [pid]
      maybeResolveBattle(state)
      return
    }

    case 'passInterference': {
      if (!state.battle) return 'There is no battle.'
      if (!state.battle.passed.includes(pid)) state.battle.passed.push(pid)
      maybeResolveBattle(state)
      return
    }

    case 'confirmRolls': {
      if (!state.battle) return 'There is no battle.'
      resolveBattle(state)
      return
    }

    // --------------------------------------------------------- MINIGAME ----
    case 'minigameMove': {
      const mg = state.minigame
      if (!mg || mg.done) return 'No minigame in progress.'
      if (mg.players[mg.turn] !== pid) return 'Not your move.'

      if (mg.kind === 'rps') {
        if (intent.cell < 0 || intent.cell > 2) return 'Pick rock, paper or scissors.'
        mg.picks[mg.turn] = intent.cell
        if (mg.picks[0] === null || mg.picks[1] === null) { mg.turn = mg.turn === 0 ? 1 : 0; return }
        const [a, b] = mg.picks as [number, number]
        const NAMES = ['Rock', 'Paper', 'Scissors']
        log(state, `${NAMES[a]} vs ${NAMES[b]}.`, 'play')
        if (a === b) {
          mg.ties += 1
          mg.picks = [null, null]
          if (mg.ties >= 3) {
            mg.done = true; mg.winner = null
            log(state, 'Three draws. Everyone gives up.', 'play')
            state.minigame = null
          }
          return
        }
        const firstWins = (a === 0 && b === 2) || (a === 1 && b === 0) || (a === 2 && b === 1)
        mg.winner = mg.players[firstWins ? 0 : 1]
        mg.done = true
        log(state, `${state.playerState[mg.winner].name} wins the shoot-out.`, 'play')
        resolveMinigameStake(state)
        return
      }

      if (intent.cell < 0 || intent.cell > 8) return 'Invalid square.'
      if (mg.board[intent.cell] !== null) return 'That square is taken.'
      mg.board[intent.cell] = mg.turn
      const w = ticTacToeWinner(mg.board)
      if (w !== null) {
        mg.winner = mg.players[w]
        mg.done = true
        log(state, `${state.playerState[mg.winner].name} wins the tic tac toe.`, 'play')
        resolveMinigameStake(state)
      } else if (mg.board.every((c) => c !== null)) {
        mg.done = true
        mg.winner = null
        log(state, 'Tic tac toe ends in a draw. Nobody is satisfied.', 'play')
        state.minigame = null
      } else {
        mg.turn = mg.turn === 0 ? 1 : 0
      }
      return
    }

    // ------------------------------------------------------------ CHOICE ----
    case 'resolveChoice':
      return 'No pending choice.'

    // ---------------------------------------------------------- END TURN ----
    case 'endTurn': {
      if (!isCurrentPlayer(state, pid)) return 'Not your turn.'
      if (ps.hand.length > HAND_LIMIT) return `Discard down to ${HAND_LIMIT} cards first.`
      endTurn(state, pid, intent.recover)
      return
    }

    case 'discardDown': {
      if (!isCurrentPlayer(state, pid)) return 'Not your turn.'
      for (const iid of intent.iids) {
        if (!ps.hand.includes(iid)) continue
        ps.hand = ps.hand.filter((x) => x !== iid)
        state.familyDiscard.push(iid)
      }
      log(state, `${ps.name} discards down to ${ps.hand.length}.`, 'play')
      return
    }

    case 'startGame':
      return 'Game already started.'
  }
}

// ---------------------------------------------------------------------------
// Playing cards (§8 Phase 2)
// ---------------------------------------------------------------------------

/**
 * Some Characters arrive holding something. It is a real card from that point
 * on: it can be stolen, destroyed, eaten or handed over, and when it goes the
 * bonus goes with it.
 */
/**
 * Nobody arrives sober.
 *
 * Measured over sixty games, 46.6% of Characters were knocked out having never
 * touched a drink, a joint or a plate - they turned up, got hit, and left
 * before a single meter moved. That is not a tuning problem with the tracks,
 * it is that every Character starts at zero on all three and a life at this
 * table is short.
 *
 * So they turn up already going, on whatever they would obviously have been
 * doing before they walked in. One pip is not a curve on its own; what it does
 * is put everybody one item away from a tier that means something, and two
 * items from Cross-Faded.
 */
function arrivesAlreadyGoing(state: GameState, ch: CharacterInstance) {
  const def = getCharacterDef(ch.defId)
  const tags = def.tags as string[]
  const track: LimitTrack =
    tags.includes('Stoner') ? 'weed'
    : tags.includes('Foodie') || tags.includes('Cook') || tags.includes('Baker') ? 'food'
    : 'alcohol'
  // Kids get a plate. Obviously.
  const t: LimitTrack = tags.includes('Kid') || tags.includes('Grandkid') ? 'food' : track
  ch.limits[t] = Math.max(ch.limits[t], 1)
}

function grantStartingStuff(state: GameState, ch: CharacterInstance) {
  const def = getCharacterDef(ch.defId)
  if (!def.startsWith?.length || ch.scratch.startingStuffGranted) return
  ch.scratch.startingStuffGranted = 1
  for (const defId of def.startsWith) {
    const iid = nid('s')
    state.stuff[iid] = { iid, defId, owner: ch.owner, attachedTo: ch.iid }
    ch.attached.push(iid)
    log(state, `${def.name} shows up with ${getStuffDef(defId).name}.`, 'play')
  }
}

function playCard(
  state: GameState, pid: PlayerId, iid: InstanceId, targetChar?: InstanceId, slot?: Slot,
): string | undefined {
  const ps = state.playerState[pid]

  // ---- Character: recruit ----
  if (state.characters[iid]) {
    const ch = state.characters[iid]
    const def = getCharacterDef(ch.defId)
    if (familySize(state, pid) >= 5) return 'Maximum Family size is 5 (3 Active + 2 Bench).'
    ch.owner = pid
    ch.hp = def.stats.hp
    ch.maxHp = def.stats.hp

    const free = openSlots(state, pid)
    const want = slot != null && free.includes(slot) ? slot : free[0]
    if (want != null) {
      ps.field[want] = iid
      ch.zone = 'active'; ch.slot = want
      log(state, `${ps.name} recruits ${def.name} to the ${['LEFT', 'CENTER', 'RIGHT'][want]} slot.`, 'play')
    } else {
      if (ps.bench.length >= 2) return 'Bench is full (2 Characters).'
      ps.bench.push(iid)
      ch.zone = 'bench'; ch.slot = null
      log(state, `${ps.name} recruits ${def.name} to the Bench.`, 'play')
    }
    ps.hand = ps.hand.filter((x) => x !== iid)
    ps.cardsPlayedThisTurn += 1
    grantStartingStuff(state, ch)
    arrivesAlreadyGoing(state, ch)
    return
  }

  // ---- Stuff ----
  const inst = state.stuff[iid]
  if (!inst) return 'Unknown card.'
  const def = getStuffDef(inst.defId)

  if (def.interfere && !targetChar) {
    // interfere cards may also be played on your own turn as a normal card
  }

  const target = targetChar ? state.characters[targetChar] : undefined
  const ctx: EffectCtx = { controller: pid, sourceChar: targetChar, eventTarget: targetChar, chosen: targetChar ? [targetChar] : [] }

  switch (def.subtype) {
    case 'Gear':
    case 'Ride': {
      if (!target) return `${def.name} must be equipped to a Character.`
      if (target.owner !== pid) return 'You can only equip your own Characters.'
      if (def.onlyFor && !def.onlyFor.includes(target.defId)) {
        const who = def.onlyFor.map((id) => getCharacterDef(id).name).join(' or ')
        return `${def.name} belongs to ${who}.`
      }
      if (target.zone === 'recovering') return 'That Character is recovering.'
      const limit = def.subtype === 'Gear' ? gearSlots(target) : rideSlots(target)
      if (countAttached(state, target, def.subtype) >= limit) {
        return `${getCharacterDef(target.defId).name} can only carry ${limit} ${def.subtype}.`
      }
      target.attached.push(iid)
      inst.attachedTo = target.iid
      inst.owner = pid
      keepOrnament(state, target, pid)
      log(state, `${getCharacterDef(target.defId).name} equips ${def.name}.`, 'play')
      break
    }

    case 'Food':
    case 'Drink':
    case 'Smoke': {
      // Consumables ATTACH to the Character and sit there until eaten. That is
      // what makes them stealable, force-feedable, and worth fighting over - // and it is what Amanda's "up to 4 Items attached / max 2 Food" implies.
      if (!target) return `${def.name} must be given to a Character.`
      if (target.zone === 'recovering') return 'That Character is recovering.'
      if (countAttached(state, target, def.subtype) >= itemCap(target, def.subtype)) {
        return `${getCharacterDef(target.defId).name} cannot hold another ${def.subtype}.`
      }
      if (target.attached.length >= totalItemCap(target)) {
        return `${getCharacterDef(target.defId).name} is carrying too much already.`
      }
      inst.owner = pid
      target.attached.push(iid)
      inst.attachedTo = target.iid
      keepOrnament(state, target, pid)
      log(state, `${ps.name} gives ${def.name} to ${getCharacterDef(target.defId).name}.`, 'play')
      break
    }

    case 'Consumable': {
      log(state, `${ps.name} plays ${def.name}.`, 'play')
      runEffects(state, def.effects, ctx)
      state.familyDiscard.push(iid)
      break
    }
  }

  ps.hand = ps.hand.filter((x) => x !== iid)
  ps.cardsPlayedThisTurn += 1
  return
}

// ---------------------------------------------------------------------------
// Abilities (§8 Phase 3)
// ---------------------------------------------------------------------------

function useAbility(
  state: GameState, pid: PlayerId, charIid: InstanceId, which: 'ability' | 'powerMove', targetChar?: InstanceId,
): string | undefined {
  const ps = state.playerState[pid]
  const ch = state.characters[charIid]
  if (!ch || ch.owner !== pid) return 'Not your Character.'

  const def = getCharacterDef(ch.defId)
  const ability = which === 'ability' ? def.ability : def.powerMove
  if (!ability) return 'That Character has no such ability.'

  const act = canAct(state, ch)
  if (!act.ok) return act.why

  if (ability.actionCost > 0 && ps.actionsLeft < ability.actionCost) return 'No Family Actions left.'

  if (ability.oncePerGame && ch.cooldowns[ability.name] === -1) return `${ability.name} is once per game.`
  if (ability.cooldown && (ch.cooldowns[ability.name] ?? -99) > state.round) {
    return `${ability.name} is on cooldown until Round ${ch.cooldowns[ability.name]}.`
  }
  if (ability.requiresLimit) {
    for (const [track, min] of Object.entries(ability.requiresLimit)) {
      if (ch.limits[track as LimitTrack] < (min as number)) {
        return `${def.name} needs ${track} ${min}+ to use ${ability.name}.`
      }
    }
  }
  if (ability.requiresStatus && !hasStatus(ch, ability.requiresStatus)) {
    return `${def.name} has to be ${ability.requiresStatus} first.`
  }
  // Nothing on the tree, nothing to break.
  if (def.id === 'titievelyn' && (ability.name === 'Borrowed Spark' || ability.name === 'Trim The Tree')
      && ornaments(ch).length === 0) {
    return 'There is nothing on the tree yet. Somebody has to give her something first.'
  }
  if (ability.maxUses && uses(ch, ability.name) >= ability.maxUses) {
    return `${ability.name} is ${ability.maxUses} times a game, and that was the last one.`
  }

  const need = needsTarget(ability.effects)
  if (need && !targetChar) return `${ability.name} needs a target.`
  if (targetChar) {
    const t = state.characters[targetChar]
    if (!t) return 'Invalid target.'
    if (need === 'enemy' && t.owner === pid) return 'That ability targets an enemy.'
    if (need === 'ally' && t.owner !== pid) return 'That ability targets an ally.'
  }

  // pay first
  ps.actionsLeft -= ability.actionCost
  ch.actedThisTurn = true

  log(state, `${def.name} uses ${ability.name}.`, 'play')

  if (actionFails(state, ch)) return

  if (ability.oncePerGame) ch.cooldowns[ability.name] = -1
  else if (ability.cooldown) ch.cooldowns[ability.name] = state.round + ability.cooldown
  if (ability.maxUses) ch.cooldowns[USES + ability.name] = uses(ch, ability.name) + 1

  runEffects(state, ability.effects, {
    controller: pid,
    sourceChar: charIid,
    eventTarget: targetChar ?? charIid,
    chosen: targetChar ? [targetChar] : [],
  })

  // BORROWED SPARK and TRIM THE TREE. Both read the ornament collection, which
  // is stored state about other Characters and so cannot be expressed in an
  // effect list - the DSL describes what happens to a target, not what the card
  // remembers about people.
  if (def.id === 'titievelyn' && (ability.name === 'Borrowed Spark' || ability.name === 'Trim The Tree')) {
    const have = ornaments(ch)
    if (ability.name === 'Borrowed Spark') {
      // Break the newest one. Whose it was decides what she takes: their best
      // number, for the Round. "You gave it to me. Of course I kept it."
      const fromId = have[have.length - 1]
      ch.scratch['keep:ornaments'] = have.slice(0, -1)
      const source = Object.values(state.characters).find((c) => c.defId === fromId && c.zone === 'active')
      const donor = getCharacterDef(fromId)
      const best = source ? bestStat(state, source) : { stat: 'attack' as const, value: donor.stats.attack }
      applyStatMod(state, ch, best.stat, 2, 'round', `Borrowed from ${donor.name}`)
      log(state, `Titi Evelyn breaks ${donor.name}'s ornament and borrows the spark.`, 'status')
    } else {
      // Everybody on the tree gets it back, and she gets it too. Three
      // different people up there and the whole family is better for it.
      const distinct = new Set(have)
      for (const id of distinct) {
        const c = Object.values(state.characters).find((x) => x.defId === id && x.zone === 'active')
        if (!c) continue
        applyStatMod(state, c, bestStat(state, c).stat, 1, 'round', 'On the tree')
      }
      applyStatMod(state, ch, bestStat(state, ch).stat, distinct.size, 'round', 'On the tree')
      if (distinct.size >= 3) {
        for (const a of activeCharacters(state, pid)) {
          applyHeal(state, a, 3, { controller: pid })
          for (const s of [...a.statuses]) {
            if (s.name === 'Fired Up' || s.name === 'Powered Up') continue
            removeStatus(state, a, s.name); break
          }
        }
        log(state, 'Three of them on the tree. The whole family is better for what they gave each other.', 'status')
      }
      log(state, `Titi Evelyn trims the tree with ${distinct.size} ornament${distinct.size === 1 ? '' : 's'}.`, 'status')
    }
  }

  // The third Level is the one that matters. Everything before it is just
  // Attack; this is what unlocks the phone call.
  if (def.id === 'dorian' && ability.name === 'Level Up' && uses(ch, ability.name) >= 3 && !hasStatus(ch, 'Powered Up')) {
    applyStatus(state, ch, 'Powered Up', -1, { controller: pid })
    log(state, 'Dorian is POWERED UP. Somebody should have stopped him at two.', 'status')
  }
  return
}

/** Use counts live alongside cooldowns, under a prefix no ability name can
 *  collide with, so nothing new has to be added to a Character to hold them. */
const USES = '#uses:'
export function uses(ch: CharacterInstance, abilityName: string): number {
  return ch.cooldowns[USES + abilityName] ?? 0
}

// ---------------------------------------------------------------------------
// Combat (§14)
// ---------------------------------------------------------------------------

function declareAttack(
  state: GameState, pid: PlayerId, attackerIid: InstanceId, defenderIid: InstanceId,
): string | undefined {
  const ps = state.playerState[pid]
  const atk = state.characters[attackerIid]
  const dfn = state.characters[defenderIid]
  if (!atk || atk.owner !== pid) return 'Not your Character.'
  if (!dfn) return 'Invalid target.'
  if (dfn.owner === pid) return 'You cannot attack your own Family.'
  if (dfn.zone !== 'active') return 'You can only attack Active Characters.'
  if (hasStatus(dfn, 'Away')) return 'That Character is Away.'

  const free = ((atk.scratch.freeAttacks as number) ?? 0) > 0
  const check = free
    ? (atk.zone === 'active' && !hasStatus(atk, 'Asleep') && !hasStatus(atk, 'Away') ? { ok: true as const } : { ok: false as const, why: 'Cannot act' })
    : canAttack(state, atk)
  if (!check.ok) return check.why
  if (charmBlocks(atk, defenderIid)) return 'Charmed - cannot attack that Character.'
  if (!free && ps.actionsLeft < 1) return 'No Family Actions left.'

  if (free) {
    atk.scratch.freeAttacks = ((atk.scratch.freeAttacks as number) ?? 0) - 1
  } else {
    ps.actionsLeft -= 1
    atk.actedThisTurn = true
  }

  // Titi The Bum "Attention Hunger" bookkeeping
  atk.scratch.engaged = 1
  dfn.scratch.engaged = 1

  const battle: BattleState = {
    attackerPlayer: pid,
    attackerChar: attackerIid,
    defenderPlayer: dfn.owner,
    defenderChar: defenderIid,
    stage: 'declared',
    passed: [],
    attackRoll: null, defenseRoll: null,
    attackScore: null, defenseScore: null,
    attackMod: (atk.scratch.freeAttackMod as number) ?? 0,
    defenseMod: 0,
    damageDealt: null,
    isFree: free,
    log: [],
  }
  if (free) atk.scratch.freeAttackMod = 0

  state.battle = battle
  for (const p of state.players) state.playerState[p].interferedThisBattle = 0

  log(
    state,
    `${getCharacterDef(atk.defId).name} attacks ${getCharacterDef(dfn.defId).name}. Interference window is open.`,
    'combat',
  )

  maybeResolveBattle(state)
  return
}

/** A player auto-passes if they hold no playable Interfere card or already used theirs. */
function canStillInterfere(state: GameState, pid: PlayerId): boolean {
  const ps = state.playerState[pid]
  if (ps.interferedThisBattle >= 1) return false
  return ps.hand.some((i) => {
    const s = state.stuff[i]
    return s && getStuffDef(s.defId).interfere
  })
}

function maybeResolveBattle(state: GameState) {
  const b = state.battle
  if (!b) return
  for (const p of state.players) {
    if (!b.passed.includes(p) && !canStillInterfere(state, p)) b.passed.push(p)
  }
  if (b.passed.length >= state.players.length) resolveBattle(state)
}

function resolveBattle(state: GameState) {
  const b = state.battle
  if (!b) return
  const atk = state.characters[b.attackerChar]
  const dfn = state.characters[b.defenderChar]
  if (!atk || !dfn || dfn.hp <= 0 || atk.hp <= 0) {
    state.battle = null
    return
  }

  const atkDef = getCharacterDef(atk.defId)
  const dfnDef = getCharacterDef(dfn.defId)

  // Amanda - Momma Bird: redirect onto her, once per Round
  let realDefender = dfn
  for (const ally of adjacentAllies(state, dfn.iid)) {
    if (getCharacterDef(ally.defId).id === 'amanda' && !ally.scratch.mommaBirdUsed && ally.owner === dfn.owner) {
      ally.scratch.mommaBirdUsed = 1
      realDefender = ally
      // She will take it, but she feels it. Without this the redirect was
      // pure profit and Amanda was the strongest card in the game by a mile.
      applyDamage(state, ally, 1, { controller: ally.owner }, 'Momma Bird')
      log(state, `Momma Bird - Amanda steps in front of ${dfnDef.name} and wears one.`, 'combat')
      if (ally.hp <= 0) { realDefender = dfn }
      break
    }
  }

  // Confusion / Wasted check happens at the moment of the attack
  if (actionFails(state, atk)) {
    log(state, `${atkDef.name}'s attack falls apart.`, 'combat')
    state.battle = null
    return
  }

  // The swing, before either roll. The animation runs while the numbers are
  // being worked out, which is the right order: you see somebody take a swing
  // and then find out whether it landed.
  fx(state, { k: 'attack', source: atk.iid, target: realDefender.iid })

  // Step 3 & 4 - rolls (§14)
  let r = d6(state.seed); state.seed = r.seed
  const attackRoll = r.face
  r = d6(state.seed); state.seed = r.seed
  const defenseRoll = r.face

  const atkStat = effectiveStat(state, atk, 'attack')
  const dfnStat = effectiveStat(state, realDefender, 'defense')

  let attackScore = atkStat + attackRoll + b.attackMod
  const defenseScore = dfnStat + defenseRoll + b.defenseMod

  const pacifistPenalty = 0

  b.attackRoll = attackRoll
  b.defenseRoll = defenseRoll
  b.attackScore = attackScore
  b.defenseScore = defenseScore
  b.stage = 'resolved'

  log(
    state,
    `${atkDef.name} ${atkStat}+${attackRoll}${b.attackMod ? `${b.attackMod > 0 ? '+' : ''}${b.attackMod}` : ''} = ${attackScore}  vs  ${getCharacterDef(realDefender.defId).name} ${dfnStat}+${defenseRoll}${b.defenseMod ? `${b.defenseMod > 0 ? '+' : ''}${b.defenseMod}` : ''} = ${defenseScore}`,
    'combat',
  )

  // A dead heat is not a shrug. Both families square off and settle it with a
  // single throw - short by design, and it makes the minigame mean something.
  if (attackScore === defenseScore && b.attackerPlayer !== realDefender.owner) {
    log(state, 'Dead heat. Somebody has to settle this.', 'combat')
    state.minigame = {
      kind: 'rps',
      players: [b.attackerPlayer, realDefender.owner],
      board: Array(9).fill(null),
      picks: [null, null],
      ties: 0,
      turn: 0,
      stake: { kind: 'battleTie', damage: 3, attackerChar: atk.iid, defenderChar: realDefender.iid },
      winner: null,
      done: false,
      prompt: 'Winner lands 3 damage',
    }
    state.battle = null
    return
  }

  // Step 5 - damage (§14)
  const raw = attackScore - defenseScore
  const damage = Math.max(0, raw - pacifistPenalty)
  b.damageDealt = damage

  const ctx: EffectCtx = {
    controller: b.attackerPlayer,
    sourceChar: atk.iid,
    attacker: atk.iid,
    defender: realDefender.iid,
    eventTarget: realDefender.iid,
  }

  if (damage > 0) {
    applyDamage(state, realDefender, damage, ctx)
    // Grandma achievement: KO with Abuela's Wrath is handled in the ability;
    // Gabby achievement: KO while holding Gear
    if (realDefender.hp <= 0 && atkDef.id === 'gabby' && countAttached(state, atk, 'Gear') > 0) {
      atk.scratch.koWithGear = 1
    }
  } else {
    log(state, 'No damage - the Defense held.', 'combat')
  }

  // Natural rolls (§14)
  const atkBL = badLuckThreshold(state, atk)
  if (atkBL > 0 && attackRoll <= atkBL) rollBadLuck(state, atk, ctx)
  const dfnBL = badLuckThreshold(state, realDefender)
  if (dfnBL > 0 && defenseRoll <= dfnBL) rollBadLuck(state, realDefender, { ...ctx, attacker: undefined })

  state.battle = null
}

// ---------------------------------------------------------------------------
// End of turn / round (§7, §8 Phase 4, §24)
// ---------------------------------------------------------------------------

function endTurn(state: GameState, pid: PlayerId, recover?: LimitTrack) {
  const ps = state.playerState[pid]

  // Limit recovery (§24), but only for a Character that had nothing this Round.
  //
  // This used to run unconditionally, and it is why nobody at Jay's table ever
  // saw Drunk, High or Stuffed do anything. A Character may consume once per
  // Turn, which is +1; this took 1 straight back off, off the highest track by
  // design. Those two rules together are a hard mathematical ceiling of tier 1
  // on everything, for every Character, for the whole game - the ladders were
  // unreachable, not badly tuned. Measured: 85% of Characters were knocked out
  // at tier 1 or below.
  //
  // Sobering up is now something you do by taking a Round off, which is a real
  // decision rather than a tax, and it means force-feeding somebody actually
  // sticks as long as the drinks keep coming.
  for (const ch of Object.values(state.characters)) {
    if (ch.owner !== pid || ch.zone === 'recovering') continue
    if (ch.scratch.tookSomething) continue
    const track = recover ?? pickRecoveryTrack(ch)
    if (track && ch.limits[track] > 0) {
      ch.limits[track] -= 1
    }
  }

  // Expire 'turn' modifiers and 0-duration statuses
  for (const ch of Object.values(state.characters)) {
    ch.mods = ch.mods.filter((m) => m.duration !== 'turn')
    // duration -1 = until removed; otherwise tick down on the owner's turn end
    ch.statuses = ch.statuses
      .map((s) => (ch.owner === pid && s.duration > 0 ? { ...s, duration: s.duration - 1 } : s))
      .filter((s) => s.duration === -1 || s.duration > 0)
    ch.actedThisTurn = false
    delete ch.scratch.freeAttacks
    delete ch.scratch.freeAttackMod
    delete ch.scratch.consumedThisTurn
    delete ch.scratch.tookSomething
  }

  // KO recovery (§15)
  for (const ch of Object.values(state.characters)) {
    if (ch.owner !== pid || ch.zone !== 'recovering') continue
    ch.koRecoveryTurns -= 1
    if (ch.koRecoveryTurns <= 0) {
      const def = getCharacterDef(ch.defId)
      ch.hp = def.stats.hp
      const free = openSlots(state, pid)
      if (free.length > 0) {
        ps.field[free[0]] = ch.iid
        ch.zone = 'active'; ch.slot = free[0]
      } else if (ps.bench.length < 2) {
        ps.bench.push(ch.iid)
        ch.zone = 'bench'; ch.slot = null
      } else {
        ch.koRecoveryTurns = 1
        continue
      }
      log(state, `${def.name} recovers and returns at full HP.`, 'status')
    }
  }

  // Grandma / Gabby "must eat" flaw
  for (const ch of activeCharacters(state, pid)) {
    const def = getCharacterDef(ch.defId)
    if ((def.id === 'grandma' || def.id === 'gabby') && ch.limits.food === 0) {
      applyStatMod(state, ch, 'attack', def.id === 'gabby' ? -2 : -1, 'round')
      log(state, `${def.name} is hungry and not in the mood.`, 'status')
    }
  }

  ps.actionsLeft = ACTIONS_PER_TURN
  ps.cardsPlayedThisTurn = 0
  ps.interferedThisBattle = 0

  log(state, `${ps.name} ends their Turn.`)

  // advance
  state.turnIndex = (state.turnIndex + 1) % state.turnOrder.length
  if (state.turnIndex === 0) {
    if (state.finalRound) { finishGame(state); return }
    startNewRound(state)
  }

  if (state.phase === 'gameover') return
  state.phase = 'draw'
  log(state, `${state.playerState[currentPlayer(state)].name}'s Turn.`)
  autoDraw(state)
}

/** With no Kitchen Table there is nothing to decide about drawing, so draw
 *  automatically and drop the player straight into their real turn. */
export function autoDraw(state: GameState) {
  if (state.phase !== 'draw' || state.useKitchenTable) return
  drawInto(state, currentPlayer(state), CARDS_DRAWN_PER_TURN)
  state.phase = 'main'
}

/** Draw and take ownership. Drawing without claiming leaves cards in a hand
 *  that the rest of the engine still thinks belong to nobody. */
function drawInto(state: GameState, pid: PlayerId, n: number) {
  if (n <= 0) return
  const ps = state.playerState[pid]
  const before = ps.hand.length
  drawCards(state, pid, n)
  for (const iid of ps.hand.slice(before)) claim(state, iid, pid)
}

// --------------------------------------------------------------------------
// Minigames - table interaction that is not combat
// --------------------------------------------------------------------------

const TTT_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
]

export function ticTacToeWinner(board: (0 | 1 | null)[]): 0 | 1 | null {
  for (const [a, b, c] of TTT_LINES) {
    if (board[a] !== null && board[a] === board[b] && board[b] === board[c]) return board[a]!
  }
  return null
}

function resolveMinigameStake(state: GameState) {
  const mg = state.minigame
  if (!mg || !mg.winner) { state.minigame = null; return }
  const winner = mg.winner
  const loser = mg.players[0] === winner ? mg.players[1] : mg.players[0]
  const ctx: EffectCtx = { controller: winner }

  if (mg.stake.kind === 'battleTie') {
    // whichever fighter's controller lost the throw takes the hit
    const loserChar = winner === mg.players[0] ? mg.stake.defenderChar : mg.stake.attackerChar
    const target = state.characters[loserChar]
    if (target && target.hp > 0) {
      const winnerChar = winner === mg.players[0] ? mg.stake.attackerChar : mg.stake.defenderChar
      applyDamage(state, target, mg.stake.damage, { controller: winner, attacker: winnerChar, sourceChar: winnerChar }, 'settled it')
    }
    state.minigame = null
    return
  }
  if (mg.stake.kind === 'draw') {
    drawCards(state, winner, mg.stake.n)
    log(state, `${state.playerState[winner].name} draws ${mg.stake.n}.`, 'play')
  } else if (mg.stake.kind === 'damage') {
    // hit the loser's strongest Active Character
    const targets = activeCharacters(state, loser)
      .sort((a, b) => effectiveStat(state, b, 'attack') - effectiveStat(state, a, 'attack'))
    if (targets[0]) applyDamage(state, targets[0], mg.stake.amount, ctx, 'lost at tic tac toe')
  } else if (mg.stake.kind === 'status') {
    for (const c of activeCharacters(state, loser).slice(0, 1)) {
      applyStatus(state, c, mg.stake.status, 1, ctx)
    }
  }
  state.minigame = null
}

/** Highest Clout wins; ties go to whoever crossed the threshold first. */
function finishGame(state: GameState) {
  const ranked = [...state.players].sort((a, b) => {
    const d = state.playerState[b].clout - state.playerState[a].clout
    if (d !== 0) return d
    const ia = state.reachedThreshold.indexOf(a)
    const ib = state.reachedThreshold.indexOf(b)
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
  })
  state.winner = ranked[0]
  state.phase = 'gameover'
  const ps = state.playerState[state.winner]
  log(state, `${ps.name} wins with ${ps.clout} Clout!`, 'clout')
}

function pickRecoveryTrack(ch: CharacterInstance): LimitTrack | null {
  const tiers: [LimitTrack, number][] = [
    ['alcohol', limitTier(ch, 'alcohol')],
    ['weed', limitTier(ch, 'weed')],
    ['food', limitTier(ch, 'food')],
  ]
  tiers.sort((a, b) => b[1] - a[1])
  return tiers[0][1] > 0 ? tiers[0][0] : null
}

/**
 * A hard stop. In 80 simulated six-player games one ran 1241 Rounds and one
 * never ended at all: enough defensive Gear and healing on the board and nobody
 * can KO anybody, and since most Clout comes from KOs the score simply stops
 * moving. Card balance is the real fix, but a public game must not be able to
 * run forever in front of people, so past this point the highest Clout wins.
 */
export const MAX_ROUNDS = 60

function startNewRound(state: GameState) {
  state.round += 1

  if (state.round > MAX_ROUNDS) {
    log(state, `Round ${MAX_ROUNDS} - somebody has to go home. Highest Clout takes it.`, 'clout')
    finishGame(state)
    return
  }

  // Turn order is rolled once, at the start, and then it is the seating for the
  // rest of the game. It used to be re-rolled every Round, which was aimed at a
  // real problem - a fixed last seat swings at the most-softened board and
  // farms the kills, and the sim had seat 6 taking 1.38 KOs a game against
  // seat 1's 0.54 - but the actual cause of that was crossing the Clout
  // threshold ending play on the spot, which handed the later seats a free
  // extra Turn. That is fixed separately: crossing it now starts a final Round
  // so everybody gets the same number of Turns. Re-rolling on top of that
  // bought nothing and cost the thing a table cares about, which is knowing
  // who is after you.

  // Titi The Bum - Attention Hunger
  for (const ch of allActiveEveryone(state)) {
    if (getCharacterDef(ch.defId).id === 'titibum' && !ch.scratch.engaged) {
      applyStatMod(state, ch, 'attack', -1, 'round')
      log(state, 'Titi The Bum was ignored all Round. -1 Attack.', 'status')
    }
    // Justin - THIEF MODE and GOOD VIBES. Drunk he takes something off
    // whoever is standing next to him; Stoned it runs the other way and he
    // hands one of his own over. Same gesture, opposite direction, and both
    // are somebody else's problem to sort out.
    if (getCharacterDef(ch.defId).id === 'justin' && ch.zone === 'active') {
      const drunk = limitTier(ch, 'alcohol') >= 2
      const stoned = limitTier(ch, 'weed') >= 2
      const neighbours = adjacentAllies(state, ch.iid).filter((c) => c.hp > 0)
      if (drunk && neighbours.length) {
        const victim = neighbours.find((c) => c.attached.length > 0)
        const iid = victim?.attached[0]
        if (victim && iid && ch.attached.length < totalItemCap(ch)) {
          victim.attached = victim.attached.filter((x) => x !== iid)
          ch.attached.push(iid)
          state.stuff[iid].attachedTo = ch.iid
          state.stuff[iid].owner = ch.owner
          log(state, `Thief Mode. Justin has taken ${getStuffDef(state.stuff[iid].defId).name} off ${getCharacterDef(victim.defId).name}.`, 'status')
        }
      } else if (stoned && neighbours.length && ch.attached.length) {
        const iid = ch.attached[0]
        const lucky = neighbours[0]
        if (lucky.attached.length < totalItemCap(lucky)) {
          ch.attached = ch.attached.filter((x) => x !== iid)
          lucky.attached.push(iid)
          state.stuff[iid].attachedTo = lucky.iid
          state.stuff[iid].owner = lucky.owner
          log(state, `Good vibes. Justin gives ${getCharacterDef(lucky.defId).name} his ${getStuffDef(state.stuff[iid].defId).name}. He insists.`, 'status')
        }
      }
    }

    // Grandpa - the music builds. Faith goes up a point every Round he is
    // still standing, which makes him the one Character who is worth more in
    // the tenth Round than the first, and the only reason to deal with him
    // early rather than leaving the old man alone.
    if (getCharacterDef(ch.defId).id === 'grandpa' && ch.zone === 'active') {
      ch.scratch.faith = Math.min(5, ((ch.scratch.faith as number) ?? 0) + 1)
    }

    // Hoza - the Red Bull wears off. One a Round, so Wired is something you
    // maintain rather than a switch you flip once and forget.
    if (getCharacterDef(ch.defId).id === 'hoza') {
      const rb = (ch.scratch.redbull as number) ?? 0
      if (rb > 0) ch.scratch.redbull = rb - 1
    }

    // Kevin - Never Skip Leg Day. His entire kit scales off Food, so running
    // on empty is the one state that actually slows him down.
    if (getCharacterDef(ch.defId).id === 'kevin' && ch.limits.food === 0) {
      applyStatMod(state, ch, 'attack', -1, 'round')
      log(state, 'Kevin has not eaten. -1 Attack until he does.', 'status')
    }

    // Kevin - OVERFED. Staying Stuffed is his whole gameplan, and without a
    // ceiling it is simply the best deal in the game: he ran 29% win-share in
    // 150 six-player games as the strongest Character in the deck. Two full
    // Rounds at Stuffed and the third one is a Food Coma. Eat, stuff, destroy,
    // destroy, rest - the rhythm is the balance.
    if (getCharacterDef(ch.defId).id === 'kevin') {
      const stuffed = limitTier(ch, 'food') >= 2
      const rounds = stuffed ? ((ch.cooldowns.overfedRounds ?? 0) + 1) : 0
      ch.cooldowns.overfedRounds = rounds
      if (rounds >= 3) {
        ch.cooldowns.overfedRounds = 0
        ch.limits.food = 0
        applyStatus(state, ch, 'Asleep', 1, { controller: ch.owner })
        applyHeal(state, ch, 4, { controller: ch.owner })
        log(state, 'Kevin is Overfed. Food coma - he rests and comes back empty.', 'status')
      }
    }
  }

  // Expire round modifiers and clear per-round scratch.
  //
  // Scratch is per-Round by design: it is where achievements and passives count
  // things that only matter inside a Round. A few Characters keep something
  // across the whole game, though - Titi Evelyn's ornaments are the point of
  // her - and those need somewhere a new Round does not take away. Keys
  // prefixed `keep:` survive, which is a convention rather than a new field on
  // every Character in the game for the sake of one of them.
  for (const ch of Object.values(state.characters)) {
    ch.mods = ch.mods.filter((m) => m.duration === 'permanent')
    const kept = Object.entries(ch.scratch).filter(([k]) => k.startsWith('keep:'))
    ch.scratch = Object.fromEntries(kept)
  }

  log(state, `--- Round ${state.round} --- order: ${state.turnOrder.map((p) => state.playerState[p].name).join(' -> ')}`)
  revealAffair(state)
}

// ---------------------------------------------------------------------------
// Achievements (§2)
// ---------------------------------------------------------------------------

function checkAchievements(state: GameState) {
  for (const ch of Object.values(state.characters)) {
    const def = getCharacterDef(ch.defId)
    const a = def.achievement
    if (!a || !ch.owner) continue
    // Scored per PLAYER, not per card instance - a 6-player deck holds two
    // copies of every Character and double-dipping was a real Clout leak.
    const scored = state.achievementsScored[ch.owner] ?? (state.achievementsScored[ch.owner] = [])
    if (scored.includes(a.key)) continue
    if (!achievementMet(state, ch, a.key)) continue
    scored.push(a.key)
    ch.achievementsScored.push(a.key)
    awardClout(state, ch.owner, a.clout, `${def.name}: ${a.name}`)
  }
}

function achievementMet(state: GameState, ch: CharacterInstance, key: string): boolean {
  const mine = activeCharacters(state, ch.owner)
  switch (key) {
    case 'hotbox':
      return mine.length === 3 && mine.every((c) => c.limits.weed >= 2)
    case 'cleanPlateClub':
      return ((ch.scratch.foodsThisRound as string[]) ?? []).length >= 3
    case 'nahImGood': {
      if (ch.limits.alcohol > 0 || ch.limits.weed > 0) return false
      const messy = allActiveEveryone(state).filter((c) =>
        c.iid !== ch.iid && (limitTier(c, 'alcohol') >= 2 || limitTier(c, 'weed') >= 2))
      return messy.length >= 3
    }
    case 'everybodyAte':
      return mine.length === 3 && mine.every((c) => c.limits.food >= 1)
    case 'freshman20':
      return limitTier(ch, 'food') >= 3 && ch.attached.length >= 3
    case 'holyRoller':
      return ((ch.scratch.faith as number) ?? 0) >= 5
    case 'wired':
      return ((ch.scratch.redbull as number) ?? 0) >= 3 && ch.zone === 'active'
    case 'oneLove': {
      const chi = mine.find((c) => getCharacterDef(c.defId).id === 'chichi')
      return !!chi && limitTier(ch, 'weed') >= 2 && limitTier(chi, 'weed') >= 2
    }
    case 'crossFaded':
      return limitTier(ch, 'alcohol') >= 2 && limitTier(ch, 'weed') >= 1 && ch.zone === 'active'
    case 'caseClosed': {
      const enemies = state.players.filter((p) => p !== ch.owner).flatMap((p) => activeCharacters(state, p))
      return enemies.filter((c) => c.statuses.some((st) => st.name === 'Busy')).length >= 2
    }
    case 'peakBry':
      // Tier 3 on a tolerance of 4 means four drinks in and still gaining. The
      // hp floor is there so it cannot be scored by a Bry who is about to fall
      // over for unrelated reasons.
      return limitTier(ch, 'alcohol') >= 3 && ch.zone === 'active' && ch.hp >= 7
    case 'absoluteUnit':
      return limitTier(ch, 'food') >= 2 && ch.hp >= 12 && ch.zone === 'active'
    case 'thatsAWrap': {
      const enemies = state.players.filter((p) => p !== ch.owner).flatMap((p) => activeCharacters(state, p))
      return enemies.filter((c) => c.statuses.some((st) => st.name === 'Confused')).length >= 3
    }
    case 'maximumChaos': {
      const enemies = state.players.filter((p) => p !== ch.owner).flatMap((p) => activeCharacters(state, p))
      return new Set(enemies.filter((c) => c.statuses.length > 0).map((c) => c.owner)).size >= 3
    }
    case 'respectBigSexy':
      return ch.zone === 'active' && ch.hp > 0 && ch.hp <= 5 && state.round >= 3
    case 'respectYourElders':
      return !!ch.scratch.kos && (ch.scratch.kos as number) >= 1
    case 'playItYourWay':
      return mine.length === 3 && mine.every((c) => c.mods.some((m) => m.amount > 0))
    case 'familyFeast':
      return mine.length === 3 && mine.every((c) => c.limits.food >= 1)
    case 'turnIntoAShot':
      return ((ch.scratch.kos as number) ?? 0) >= 2
    case 'kindnessWinsSouls':
      return ((ch.scratch.healed as number) ?? 0) >= 8
    case 'pineapplePower':
      return !!ch.scratch.koWithGear
    case 'victoryIsControl':
      return ((ch.scratch.statusedTargets as string[]) ?? []).length >= 4
    case 'collectAndKeep': {
      const owned = Object.values(state.characters).filter((c) => c.owner === ch.owner)
      return owned.reduce((n, c) => n + c.attached.length, 0) >= 3
    }
    default:
      return false
  }
}

// ---------------------------------------------------------------------------
// Redaction - each client only sees its own hand (§ hidden information)
// ---------------------------------------------------------------------------

export function redactFor(state: GameState, viewer: PlayerId): GameState {
  const s: GameState = structuredClone(state)
  for (const pid of s.players) {
    if (pid === viewer) continue
    const ps = s.playerState[pid]
    ps.hand = ps.hand.map((_, i) => `hidden:${pid}:${i}`)
  }
  s.familyDeck = s.familyDeck.map((_, i) => `deck:${i}`)
  return s
}
