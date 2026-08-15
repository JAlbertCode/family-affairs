import type {
  GameState, Effect, TargetSpec, CharacterInstance, InstanceId, PlayerId,
  LimitTrack, StatusName, StatName, LogEntry,
} from './types'
import { getCharacterDef, getStuffDef } from './cards/deck'
import {
  activeCharacters, adjacentAllies, allActiveEveryone, hasTag, hasStatus,
  limitTier, canBeTargeted, effectiveStat,
} from './selectors'
import { d6, pick, shuffle } from './rng'

// ---------------------------------------------------------------------------
// Effect resolution context
// ---------------------------------------------------------------------------

export interface EffectCtx {
  controller: PlayerId
  sourceChar?: InstanceId
  /** the character this effect chain is "about" (e.g. the one who ate the Food) */
  eventTarget?: InstanceId
  attacker?: InstanceId
  defender?: InstanceId
  /** targets the player explicitly chose when submitting the intent */
  chosen?: InstanceId[]
}

export function log(state: GameState, text: string, kind: LogEntry['kind'] = 'system') {
  state.log.push({ t: state.tick++, round: state.round, text, kind })
  if (state.log.length > 400) state.log.splice(0, state.log.length - 400)
}

// ---------------------------------------------------------------------------
// Targeting
// ---------------------------------------------------------------------------

export function resolveTargets(state: GameState, spec: TargetSpec, ctx: EffectCtx): CharacterInstance[] {
  let list: CharacterInstance[] = []
  const src = ctx.sourceChar ? state.characters[ctx.sourceChar] : undefined
  const evt = ctx.eventTarget ? state.characters[ctx.eventTarget] : undefined
  const anchor = evt ?? src

  switch (spec.scope) {
    case 'self':
      if (src) list = [src]
      else if (evt) list = [evt]
      break
    case 'eventTarget':
      if (evt) list = [evt]
      break
    case 'attacker':
      if (ctx.attacker) list = [state.characters[ctx.attacker]]
      break
    case 'defender':
      if (ctx.defender) list = [state.characters[ctx.defender]]
      break
    case 'adjacentAllies':
    case 'adjacentAny':
      if (anchor) list = adjacentAllies(state, anchor.iid)
      break
    case 'allMyActive':
      list = activeCharacters(state, anchor?.owner ?? ctx.controller)
      break
    case 'allMyCharacters': {
      const owner = anchor?.owner ?? ctx.controller
      list = Object.values(state.characters).filter((c) => c.owner === owner)
      break
    }
    case 'allEnemyActive': {
      const me = anchor?.owner ?? ctx.controller
      list = state.players.filter((p) => p !== me).flatMap((p) => activeCharacters(state, p))
      break
    }
    case 'allActiveEveryone':
      list = allActiveEveryone(state)
      break
    case 'randomEnemyActive': {
      const me = anchor?.owner ?? ctx.controller
      const pool = state.players.filter((p) => p !== me).flatMap((p) => activeCharacters(state, p))
      const r = pick(pool, state.seed)
      state.seed = r.seed
      list = r.item ? [r.item] : []
      break
    }
    case 'chosenEnemyActive':
    case 'chosenAllyActive':
    case 'chosenAnyActive':
      list = (ctx.chosen ?? []).map((i) => state.characters[i]).filter(Boolean)
      break
  }

  list = list.filter((c) => c && canBeTargeted(state, c))
  if (spec.withTag) list = list.filter((c) => hasTag(c, spec.withTag!))
  if (spec.withoutTag) list = list.filter((c) => !hasTag(c, spec.withoutTag!))
  if (spec.max != null) list = list.slice(0, spec.max)

  // de-dupe
  const seen = new Set<string>()
  return list.filter((c) => (seen.has(c.iid) ? false : (seen.add(c.iid), true)))
}

/** Does this effect list require the player to nominate a target up front? */
export function needsTarget(effects: Effect[]): 'enemy' | 'ally' | 'any' | null {
  for (const e of effects) {
    const t = (e as any).target as TargetSpec | undefined
    const f = (e as any).from as TargetSpec | undefined
    for (const spec of [t, f]) {
      if (!spec) continue
      if (spec.scope === 'chosenEnemyActive') return 'enemy'
      if (spec.scope === 'chosenAllyActive') return 'ally'
      if (spec.scope === 'chosenAnyActive') return 'any'
    }
    if (e.k === 'roll') {
      for (const b of e.branches) {
        const r = needsTarget(b.effects)
        if (r) return r
      }
    }
    if (e.k === 'ifTag' || e.k === 'ifCharacterActive') {
      const r = needsTarget(e.then) ?? (e.else ? needsTarget(e.else) : null)
      if (r) return r
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export function applyDamage(
  state: GameState, target: CharacterInstance, amount: number, ctx: EffectCtx, note = '',
) {
  if (amount <= 0) return
  let dmg = amount
  const def = getCharacterDef(target.defId)

  // Jay — Glass Body: +1 damage from fast attackers
  if (def.id === 'jay' && ctx.attacker) {
    const atk = state.characters[ctx.attacker]
    if (atk && effectiveStat(state, atk, 'attack') >= 5) dmg += 1
  }
  // Dainese — Light Exposes: Elders hit her harder
  if (def.id === 'dainese' && ctx.attacker) {
    const atk = state.characters[ctx.attacker]
    if (atk && hasTag(atk, 'Elder')) dmg += 2
  }
  // Pineapple Gloves reduce incoming damage by 1
  const hasGloves = target.attached.some((i) => state.stuff[i] && getStuffDef(state.stuff[i].defId).id === 'pineapplegloves')
  if (hasGloves) dmg = Math.max(0, dmg - 1)

  target.hp = Math.max(0, target.hp - dmg)
  log(state, `${def.name} takes ${dmg} damage${note ? ` (${note})` : ''} — ${target.hp} HP left.`, 'combat')

  if (target.hp <= 0) knockOut(state, target, ctx)
}

export function applyHeal(state: GameState, target: CharacterInstance, amount: number, ctx: EffectCtx) {
  if (amount <= 0 || target.hp <= 0) return
  const before = target.hp
  target.hp = Math.min(target.maxHp, target.hp + amount)
  const healed = target.hp - before
  if (healed <= 0) return

  // Titi Bibi achievement: total healing done by her controller
  if (ctx.sourceChar) {
    const src = state.characters[ctx.sourceChar]
    if (src && getCharacterDef(src.defId).id === 'titibibi') {
      src.scratch.healed = ((src.scratch.healed as number) ?? 0) + healed
    }
  }
  log(state, `${getCharacterDef(target.defId).name} heals ${healed} — ${target.hp} HP.`, 'status')
}

/** §15 KO. Not elimination — the Clout race continues. */
export function knockOut(state: GameState, target: CharacterInstance, ctx: EffectCtx) {
  const def = getCharacterDef(target.defId)
  target.mods = []
  target.statuses = []
  target.limits = { alcohol: 0, weed: 0, food: 0 }
  target.attached.forEach((i) => {
    const s = state.stuff[i]
    if (s) { s.attachedTo = null; state.familyDiscard.push(i) }
  })
  target.attached = []

  // vacate its slot
  const ps = state.playerState[target.owner]
  if (target.slot !== null) ps.field[target.slot] = null
  ps.bench = ps.bench.filter((x) => x !== target.iid)
  target.slot = null
  target.zone = 'recovering'
  target.koRecoveryTurns = 1
  target.actedThisTurn = false

  log(state, `${def.name} is KO'd.`, 'combat')

  // Clout to the attacker's controller (§2)
  const scorer = ctx.attacker ? state.characters[ctx.attacker]?.owner : ctx.controller
  if (scorer && scorer !== target.owner) {
    awardClout(state, scorer, 1, `KO'd ${def.name}`)
    // Titi The Bum achievement
    if (ctx.attacker) {
      const atk = state.characters[ctx.attacker]
      if (atk) atk.scratch.kos = ((atk.scratch.kos as number) ?? 0) + 1
    }
  }
}

export function awardClout(state: GameState, pid: PlayerId, n: number, why: string) {
  const ps = state.playerState[pid]
  if (!ps) return
  ps.clout += n
  const bucket = state.cloutSources[pid] ?? (state.cloutSources[pid] = { combat: 0, achievement: 0, other: 0 })
  if (why.startsWith("KO'd")) bucket.combat += n
  else if (why.includes(':')) bucket.achievement += n
  else bucket.other += n
  log(state, `${ps.name} gains ${n} Clout (${why}) — now ${ps.clout}.`, 'clout')

  // Crossing the threshold does NOT end the game immediately. The Round is
  // played to completion so every seat has had the same number of Turns, then
  // the highest Clout wins. Without this, later seats win far too often.
  if (ps.clout >= state.cloutToWin) {
    if (!state.reachedThreshold.includes(pid)) state.reachedThreshold.push(pid)
    if (!state.finalRound) {
      state.finalRound = true
      log(state, `${ps.name} hits ${state.cloutToWin} Clout! Final Round — everyone finishes their Turn.`, 'clout')
    }
  }
}

export function applyStatus(
  state: GameState, target: CharacterInstance, name: StatusName, duration: number, ctx: EffectCtx, threshold?: number,
) {
  const def = getCharacterDef(target.defId)
  // Jay — Avatar Mode: immune to Confused and Charmed
  if (def.id === 'jay' && (name === 'Confused' || name === 'Charmed')) {
    log(state, `Jay's avatar shrugs off ${name}.`, 'status')
    return
  }
  const existing = target.statuses.find((s) => s.name === name)
  if (existing) {
    existing.duration = Math.max(existing.duration, duration)
    if (threshold != null) existing.threshold = threshold
  } else {
    target.statuses.push({
      name, duration,
      sourcePlayer: ctx.controller,
      sourceChar: ctx.sourceChar,
      ...(threshold != null ? { threshold } : {}),
    })
    log(state, `${def.name} is now ${name}.`, 'status')

    // Dainese — Fear Feed: heals when an enemy gains a status
    for (const c of allActiveEveryone(state)) {
      if (getCharacterDef(c.defId).id === 'dainese' && c.owner !== target.owner) {
        applyHeal(state, c, 1, { controller: c.owner, sourceChar: c.iid })
      }
    }
    // Jay achievement bookkeeping
    if (ctx.sourceChar) {
      const src = state.characters[ctx.sourceChar]
      if (src && src.owner !== target.owner) {
        const list = (src.scratch.statusedTargets as string[]) ?? []
        if (!list.includes(target.iid)) src.scratch.statusedTargets = [...list, target.iid]
      }
    }
  }
}

export function removeStatus(state: GameState, target: CharacterInstance, name: StatusName) {
  target.statuses = target.statuses.filter((s) => s.name !== name)
}

export function applyLimit(state: GameState, target: CharacterInstance, track: LimitTrack, amount: number, ctx: EffectCtx) {
  const def = getCharacterDef(target.defId)
  const before = limitTier(target, track)
  const cap = def.tolerance[track] + 1
  target.limits[track] = Math.max(0, Math.min(cap, target.limits[track] + amount))
  const after = limitTier(target, track)

  if (after !== before) {
    const names = { alcohol: ['Sober', 'Buzzed', 'Drunk', 'Wasted'], weed: ['Clear', 'High', 'Stoned', 'Zooted'], food: ['Hungry', 'Fed', 'Full', 'Stuffed'] }[track]
    log(state, `${def.name} is now ${names[after]}.`, 'status')
  }

  // Dorian — Food Coma: exceeding tolerance puts him to sleep
  if (track === 'food' && def.id === 'dorian' && target.limits.food > def.tolerance.food) {
    applyStatus(state, target, 'Asleep', 1, ctx)
    log(state, 'Dorian enters Food Coma.', 'status')
  }
}

export function applyStatMod(
  state: GameState, target: CharacterInstance, stat: StatName, amount: number, duration: 'turn' | 'round' | 'permanent',
) {
  target.mods.push({ stat, amount, duration })
}

// ---------------------------------------------------------------------------
// Bad Luck (§28) — d6 table, no second deck
// ---------------------------------------------------------------------------

export function rollBadLuck(state: GameState, target: CharacterInstance, ctx: EffectCtx) {
  const def = getCharacterDef(target.defId)

  // Gabby — Always Prepared / Titi The Bum — Good Luck Charm
  if (def.id === 'gabby' && !target.scratch.badLuckIgnored) {
    target.scratch.badLuckIgnored = 1
    log(state, 'Gabby was Always Prepared. Bad Luck ignored.', 'status')
    return
  }
  for (const ally of activeCharacters(state, target.owner)) {
    if (getCharacterDef(ally.defId).id === 'titibum' && ally.iid !== target.iid && !ally.scratch.charmUsed) {
      ally.scratch.charmUsed = 1
      log(state, `Titi The Bum's Good Luck Charm cancels Bad Luck on ${def.name}.`, 'status')
      return
    }
  }

  const r = d6(state.seed)
  state.seed = r.seed
  log(state, `Bad Luck for ${def.name} — rolled ${r.face}.`, 'status')

  switch (r.face) {
    case 1:
      log(state, 'Hit By a Car.', 'status')
      applyDamage(state, target, 4, ctx, 'Bad Luck')
      break
    case 2: {
      log(state, 'Dropped It.', 'status')
      const food = target.attached.find((i) => {
        const s = state.stuff[i]
        return s && ['Food', 'Consumable'].includes(getStuffDef(s.defId).subtype)
      })
      if (food) detachAndDiscard(state, target, food)
      break
    }
    case 3:
      log(state, "Where's My Phone?", 'status')
      applyStatus(state, target, 'Busy', 1, ctx)
      break
    case 4: {
      log(state, 'Wrong Group Chat — hand revealed.', 'status')
      state.playerState[target.owner].hand.forEach(() => {})
      break
    }
    case 5: {
      log(state, 'Ride Trouble — the Ride does nothing this Round.', 'status')
      applyStatMod(state, target, 'defense', -2, 'round')
      break
    }
    case 6:
      log(state, 'Lucky Break — nothing happens.', 'status')
      break
  }
}

export function detachAndDiscard(state: GameState, ch: CharacterInstance, iid: InstanceId) {
  ch.attached = ch.attached.filter((x) => x !== iid)
  const s = state.stuff[iid]
  if (s) { s.attachedTo = null; state.familyDiscard.push(iid) }
}

// ---------------------------------------------------------------------------
// Draw / discard
// ---------------------------------------------------------------------------

export function drawCards(state: GameState, pid: PlayerId, n: number) {
  const ps = state.playerState[pid]
  for (let i = 0; i < n; i++) {
    if (state.familyDeck.length === 0) {
      if (state.familyDiscard.length === 0) return
      const r = shuffle(state.familyDiscard, state.seed)
      state.familyDeck = r.arr
      state.seed = r.seed
      state.familyDiscard = []
      log(state, 'Family Deck reshuffled from the discard pile.')
    }
    const card = state.familyDeck.shift()
    if (card) ps.hand.push(card)
  }
}

export function discardRandom(state: GameState, pid: PlayerId, n: number) {
  const ps = state.playerState[pid]
  for (let i = 0; i < n && ps.hand.length > 0; i++) {
    const r = pick(ps.hand, state.seed)
    state.seed = r.seed
    if (!r.item) break
    ps.hand = ps.hand.filter((x) => x !== r.item)
    state.familyDiscard.push(r.item)
  }
  if (n > 0) log(state, `${ps.name} discards ${Math.min(n, ps.hand.length + n)} card(s).`, 'play')
}

// ---------------------------------------------------------------------------
// Consumption (§20, §25)
// ---------------------------------------------------------------------------

export function consumeAttached(
  state: GameState, ch: CharacterInstance, subtype: 'Food' | 'Drink' | 'Smoke', ctx: EffectCtx,
): boolean {
  const iid = ch.attached.find((i) => {
    const s = state.stuff[i]
    return s && getStuffDef(s.defId).subtype === subtype
  })
  if (!iid) return false
  return consumeCard(state, ch, iid, ctx)
}

export function consumeCard(state: GameState, ch: CharacterInstance, iid: InstanceId, ctx: EffectCtx): boolean {
  const inst = state.stuff[iid]
  if (!inst) return false
  const def = getStuffDef(inst.defId)
  const chDef = getCharacterDef(ch.defId)

  log(state, `${chDef.name} consumes ${def.name}.`, 'play')

  const innerCtx: EffectCtx = { ...ctx, eventTarget: ch.iid }
  if (def.limitGain) {
    for (const [track, amt] of Object.entries(def.limitGain)) {
      applyLimit(state, ch, track as LimitTrack, amt as number, innerCtx)
    }
  }
  runEffects(state, def.effects, innerCtx)

  // Mikey & Moe — We Don't Want To Share
  if (chDef.id === 'mikeymoe' && def.id === 'burger') {
    applyStatus(state, ch, 'Confused', 1, innerCtx)
    log(state, 'Mikey & Moe fight over the Burger.', 'status')
  }
  // Dorian achievement bookkeeping
  if (chDef.id === 'dorian' && def.subtype === 'Food') {
    const eaten = (ch.scratch.foodsThisRound as string[]) ?? []
    if (!eaten.includes(def.id)) ch.scratch.foodsThisRound = [...eaten, def.id]
  }

  ch.attached = ch.attached.filter((x) => x !== iid)
  inst.attachedTo = null
  state.familyDiscard.push(iid)
  return true
}

// ---------------------------------------------------------------------------
// The interpreter
// ---------------------------------------------------------------------------

export function runEffects(state: GameState, effects: Effect[], ctx: EffectCtx) {
  for (const e of effects) runEffect(state, e, ctx)
}

function runEffect(state: GameState, e: Effect, ctx: EffectCtx) {
  switch (e.k) {
    case 'damage': {
      for (const t of resolveTargets(state, e.target, ctx)) {
        applyDamage(state, t, e.amount, ctx)
      }
      break
    }
    case 'heal': {
      for (const t of resolveTargets(state, e.target, ctx)) applyHeal(state, t, e.amount, ctx)
      break
    }
    case 'statMod': {
      for (const t of resolveTargets(state, e.target, ctx)) applyStatMod(state, t, e.stat, e.amount, e.duration)
      break
    }
    case 'status': {
      for (const t of resolveTargets(state, e.target, ctx)) applyStatus(state, t, e.status, e.duration, ctx, e.threshold)
      break
    }
    case 'removeStatus': {
      for (const t of resolveTargets(state, e.target, ctx)) removeStatus(state, t, e.status)
      break
    }
    case 'limit': {
      for (const t of resolveTargets(state, e.target, ctx)) applyLimit(state, t, e.track, e.amount, ctx)
      break
    }
    case 'draw': {
      for (const p of resolvePlayers(state, e.player, ctx)) drawCards(state, p, e.n)
      break
    }
    case 'discard': {
      for (const p of resolvePlayers(state, e.player, ctx)) discardRandom(state, p, e.n)
      break
    }
    case 'clout': {
      for (const p of resolvePlayers(state, e.player, ctx)) awardClout(state, p, e.n, 'card effect')
      break
    }
    case 'grantAction': {
      for (const t of resolveTargets(state, e.target, ctx)) {
        t.actedThisTurn = false
        state.playerState[t.owner].actionsLeft += e.n
      }
      break
    }
    case 'extraAttack': {
      // Grants a free attack: no Family Action cost, ignores "already acted".
      for (const t of resolveTargets(state, e.target, ctx)) {
        t.scratch.freeAttacks = ((t.scratch.freeAttacks as number) ?? 0) + 1
        if (e.attackMod) {
          t.scratch.freeAttackMod = ((t.scratch.freeAttackMod as number) ?? 0) + e.attackMod
        }
        log(state, `${getCharacterDef(t.defId).name} gets a free attack.`, 'combat')
      }
      break
    }
    case 'stealStuff': {
      const thief = ctx.sourceChar ? state.characters[ctx.sourceChar] : undefined
      if (!thief) break
      for (const victim of resolveTargets(state, e.from, ctx)) {
        const iid = victim.attached.find((i) => {
          const s = state.stuff[i]
          return s && (!e.subtype || getStuffDef(s.defId).subtype === e.subtype)
        })
        if (iid) {
          victim.attached = victim.attached.filter((x) => x !== iid)
          thief.attached.push(iid)
          const inst = state.stuff[iid]
          if (inst) { inst.attachedTo = thief.iid; inst.owner = thief.owner }
          log(state, `${getCharacterDef(thief.defId).name} steals ${getStuffDef(inst!.defId).name}.`, 'play')
          break
        }
      }
      break
    }
    case 'destroyStuff': {
      for (const victim of resolveTargets(state, e.from, ctx)) {
        const iid = victim.attached.find((i) => {
          const s = state.stuff[i]
          return s && (!e.subtype || getStuffDef(s.defId).subtype === e.subtype)
        })
        if (iid) detachAndDiscard(state, victim, iid)
      }
      break
    }
    case 'forceConsume': {
      for (const t of resolveTargets(state, e.target, ctx)) consumeAttached(state, t, e.subtype, ctx)
      break
    }
    case 'revealHand': {
      log(state, 'Hands are revealed.', 'play')
      break
    }
    case 'badLuck': {
      for (const t of resolveTargets(state, e.target, ctx)) rollBadLuck(state, t, ctx)
      break
    }
    case 'roll': {
      const r = d6(state.seed)
      state.seed = r.seed
      const branch = e.branches.find((b) => b.on.includes(r.face))
      log(state, `Rolled ${r.face}${branch?.label ? ` — ${branch.label}` : ''}.`, 'combat')
      if (branch) runEffects(state, branch.effects, ctx)
      break
    }
    case 'ifTag': {
      const anyone = allActiveEveryone(state).some((c) => hasTag(c, e.tag))
      const go = anyone === e.present ? e.then : e.else
      if (go) runEffects(state, go, ctx)
      break
    }
    case 'ifCharacterActive': {
      const present = allActiveEveryone(state).some((c) => getCharacterDef(c.defId).id === e.defId)
      const go = present ? e.then : e.else
      if (go) runEffects(state, go, ctx)
      break
    }
    case 'startMinigame': {
      // Pick the opponent with the most Clout — the game should target the leader.
      const rivals = state.players.filter((p) => p !== ctx.controller)
      const rival = rivals.sort((a, b) => state.playerState[b].clout - state.playerState[a].clout)[0]
      if (!rival) break
      state.minigame = {
        kind: e.kind,
        players: [ctx.controller, rival],
        board: Array(9).fill(null),
        turn: 0,
        stake: e.stake,
        winner: null,
        done: false,
        prompt: e.stake.kind === 'damage'
          ? `Winner deals ${e.stake.amount} damage`
          : e.stake.kind === 'draw' ? `Winner draws ${e.stake.n}` : `Loser is ${e.stake.status}`,
      }
      log(state, `${state.playerState[ctx.controller].name} challenges ${state.playerState[rival].name} to tic tac toe.`, 'play')
      break
    }
    case 'note':
      log(state, e.text)
      break
  }
}

function resolvePlayers(
  state: GameState, who: 'controller' | 'targetController' | 'all' | 'allOthers', ctx: EffectCtx,
): PlayerId[] {
  switch (who) {
    case 'controller': return [ctx.controller]
    case 'targetController': {
      const t = ctx.eventTarget ? state.characters[ctx.eventTarget] : undefined
      const c = ctx.chosen?.[0] ? state.characters[ctx.chosen[0]] : undefined
      const owner = (c ?? t)?.owner
      return owner ? [owner] : []
    }
    case 'all': return [...state.players]
    case 'allOthers': return state.players.filter((p) => p !== ctx.controller)
  }
}
