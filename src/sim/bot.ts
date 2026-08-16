import type { GameState, Intent, PlayerId, InstanceId } from '../engine/types'
import { getCharacterDef, getStuffDef } from '../engine/cards/deck'
import {
  activeCharacters, canAttack, effectiveStat, familySize, gearSlots, rideSlots,
  countAttached, limitTier, hasStatus, openSlots, currentPlayer, itemCap, totalItemCap,
} from '../engine/selectors'
import { needsTarget } from '../engine/effects'
import { effectsCost } from '../engine/cards/schema'
import { HAND_LIMIT } from '../engine/state'

/**
 * A deliberately simple greedy bot. Its job is not to play well - it is to
 * exercise every code path in the engine so balance numbers and crashes show up.
 */
const TTT_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6],
]

/** Win if you can, block if you must, otherwise take the best empty square. */
function ticTacToeMove(board: (0 | 1 | null)[], me: 0 | 1): number {
  const them = me === 0 ? 1 : 0
  for (const who of [me, them]) {
    for (const line of TTT_LINES) {
      const vals = line.map((i) => board[i])
      if (vals.filter((v) => v === who).length === 2 && vals.includes(null)) {
        return line[vals.indexOf(null)]
      }
    }
  }
  for (const i of [4, 0, 2, 6, 8, 1, 3, 5, 7]) if (board[i] === null) return i
  return board.findIndex((c) => c === null)
}

export function botIntent(state: GameState, pid: PlayerId): Intent | null {
  const ps = state.playerState[pid]

  // A minigame blocks the whole table until it resolves.
  const mg = state.minigame
  if (mg && !mg.done) {
    if (mg.players[mg.turn] !== pid) return null
    if (mg.kind === 'rps') {
      // vary the throw by seat and tie count so it is not always rock
      return { k: 'minigameMove', cell: (pid.charCodeAt(1) + mg.ties) % 3 }
    }
    return { k: 'minigameMove', cell: ticTacToeMove(mg.board, mg.turn) }
  }

  // Interference windows: bots always pass, so battles resolve.
  if (state.battle) return { k: 'passInterference' }

  if (currentPlayer(state) !== pid) return null
  if (state.phase === 'gameover') return null
  if (state.phase === 'draw') return { k: 'drawCard' }

  const mine = activeCharacters(state, pid)
  // Sort enemies by softness, never by seat index - indexing by seat made the
  // lowest-numbered player absorb every ability in the sim and faked a bias.
  const enemies = state.players
    .filter((p) => p !== pid)
    .flatMap((p) => activeCharacters(state, p))
    .filter((c) => c.hp > 0)
    .sort((a, b) => {
      const d = (a.hp + effectiveStat(state, a, 'defense')) - (b.hp + effectiveStat(state, b, 'defense'))
      if (d !== 0) return d
      // tie-break on the instance id, NOT array position - sorting ties by
      // array order made seat 1 absorb everything and faked a turn-order bias
      return a.iid < b.iid ? -1 : 1
    })

  // eat something that is already sitting on a Character (free action)
  for (const ch of mine) {
    if (ch.scratch.consumedThisTurn || hasStatus(ch, 'Asleep') || hasStatus(ch, 'Away')) continue
    const eat = ch.attached.find((i) => {
      const st = state.stuff[i]
      if (!st) return false
      const d = getStuffDef(st.defId)
      if (d.subtype === 'Food') return limitTier(ch, 'food') < 2
      if (d.subtype === 'Drink') return limitTier(ch, 'alcohol') < 2
      if (d.subtype === 'Smoke') return limitTier(ch, 'weed') < 2
      return false
    })
    if (eat) return { k: 'consume', char: ch.iid, iid: eat }
  }

  // ---- 1. play cards (max 2) ----
  if (ps.cardsPlayedThisTurn < 2) {
    // recruit while there is room
    if (familySize(state, pid) < 5) {
      const charCard = ps.hand.find((i) => state.characters[i])
      if (charCard) {
        const slot = openSlots(state, pid)[0]
        return { k: 'playCard', iid: charCard, ...(slot != null ? { slot } : {}) }
      }
    }

    for (const iid of ps.hand) {
      const inst = state.stuff[iid]
      if (!inst) continue
      const def = getStuffDef(inst.defId)

      if (def.subtype === 'Gear' || def.subtype === 'Ride') {
        const limit = def.subtype === 'Gear' ? gearSlots : rideSlots
        const target = mine.find((c) =>
          countAttached(state, c, def.subtype) < limit(c)
          && (!def.onlyFor || def.onlyFor.includes(c.defId)))
        if (target) return { k: 'playCard', iid, targetChar: target.iid }
      }

      if (['Food', 'Drink', 'Smoke'].includes(def.subtype) && !def.interfere) {
        const target = mine.find(
          (c) => countAttached(state, c, def.subtype) < itemCap(c, def.subtype)
            && c.attached.length < totalItemCap(c),
        )
        if (target) return { k: 'playCard', iid, targetChar: target.iid }
      }

      if (def.subtype === 'Consumable' && !def.interfere) {
        // A Consumable that says "choose a Character" is unplayable without
        // one, so the bot has to pick - otherwise the card jams in hand and
        // never contributes to the balance numbers.
        const need = needsTarget(def.effects)
        if (!need) return { k: 'playCard', iid }
        const pool = need === 'ally' ? mine : enemies
        if (pool[0]) return { k: 'playCard', iid, targetChar: pool[0].iid }
      }
    }
  }

  // ---- 2. spend Family Actions ----
  if (ps.actionsLeft > 0) {
    // Abilities before a bare attack. Pick the strongest LEGAL option rather
    // than always reaching for the Power Move: preferring the Power Move by
    // position meant a Character's ability was never played and never tested,
    // which quietly hid half of every kit from the balance numbers.
    let best: { intent: Intent; score: number } | null = null
    for (const ch of mine) {
      if (ch.actedThisTurn || hasStatus(ch, 'Asleep') || hasStatus(ch, 'Away')) continue
      const def = getCharacterDef(ch.defId)
      for (const which of ['powerMove', 'ability'] as const) {
        const ab = which === 'ability' ? def.ability : def.powerMove
        if (!ab) continue
        if (ab.oncePerGame && ch.cooldowns[ab.name] === -1) continue
        if (ab.cooldown && (ch.cooldowns[ab.name] ?? -99) > state.round) continue
        if (ab.requiresLimit) {
          let ok = true
          for (const [t, m] of Object.entries(ab.requiresLimit)) {
            if (ch.limits[t as 'food'] < (m as number)) ok = false
          }
          if (!ok) continue
        }
        const need = needsTarget(ab.effects)
        let intent: Intent | null = null
        if (!need) intent = { k: 'useAbility', char: ch.iid, which }
        else {
          const pool = need === 'ally' ? mine.filter((c) => c.iid !== ch.iid) : enemies
          const target = pool[0]
          if (target) intent = { k: 'useAbility', char: ch.iid, which, targetChar: target.iid }
        }
        if (!intent) continue
        // Save a limited move for when it is actually the better play.
        const score = effectsCost(ab.effects) - (ab.oncePerGame ? 2 : (ab.cooldown ?? 0) * 0.5)
        if (!best || score > best.score) best = { intent, score }
      }
    }
    if (best) return best.intent

    // activated Gear before a bare attack - it is usually stronger
    for (const ch of mine) {
      if (ch.actedThisTurn || hasStatus(ch, 'Asleep') || hasStatus(ch, 'Away')) continue
      for (const i of ch.attached) {
        const st = state.stuff[i]
        if (!st) continue
        const sd = getStuffDef(st.defId)
        const ab = sd.activated
        if (!ab) continue
        const cdKey = `item:${sd.id}`
        if (ab.oncePerGame && ch.cooldowns[cdKey] === -1) continue
        if (ab.cooldown && (ch.cooldowns[cdKey] ?? -99) > state.round) continue
        const need = needsTarget(ab.effects)
        if (!need) return { k: 'useItem', char: ch.iid, iid: i }
        const pool = need === 'ally' ? mine.filter((c) => c.iid !== ch.iid) : enemies
        if (pool[0]) return { k: 'useItem', char: ch.iid, iid: i, targetChar: pool[0].iid }
      }
    }

    // otherwise attack the softest enemy with the hardest hitter
    const attackers = mine
      .filter((c) => canAttack(state, c).ok)
      .sort((a, b) => effectiveStat(state, b, 'attack') - effectiveStat(state, a, 'attack'))
    if (attackers.length && enemies.length) {
      const target = enemies.slice().sort((a, b) => {
        const da = effectiveStat(state, a, 'defense') + a.hp
        const db = effectiveStat(state, b, 'defense') + b.hp
        return da - db
      })[0]
      return { k: 'attack', attacker: attackers[0].iid, defender: target.iid }
    }
  }

  // ---- 3. wrap up ----
  if (ps.hand.length > HAND_LIMIT) {
    return { k: 'discardDown', iids: ps.hand.slice(0, ps.hand.length - HAND_LIMIT) }
  }
  return { k: 'endTurn' }
}
