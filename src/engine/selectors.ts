import type {
  GameState, CharacterInstance, InstanceId, PlayerId, Slot, StatName,
  LimitTrack, Tag, StuffInstance, StatusName,
} from './types'
import { getCharacterDef, getStuffDef } from './cards/deck'

// ---------------------------------------------------------------------------
// ADJACENCY (§13)
//   [ 0 ][ 1 ][ 2 ]   1 is adjacent to 0 and 2. 0 and 2 are adjacent only to 1.
// ---------------------------------------------------------------------------

export const ADJACENT_SLOTS: Record<Slot, Slot[]> = {
  0: [1],
  1: [0, 2],
  2: [1],
}

export function adjacentAllies(state: GameState, iid: InstanceId): CharacterInstance[] {
  const ch = state.characters[iid]
  if (!ch || ch.zone !== 'active' || ch.slot === null) return []
  const field = state.playerState[ch.owner].field
  return ADJACENT_SLOTS[ch.slot]
    .map((s) => field[s])
    .filter((x): x is InstanceId => !!x)
    .map((x) => state.characters[x])
    .filter((c) => c && c.zone === 'active' && !hasStatus(c, 'Away'))
}

/** Characters sitting in the same slot index in every OTHER family (§5 "across from them"). */
export function acrossFrom(state: GameState, iid: InstanceId): CharacterInstance[] {
  const ch = state.characters[iid]
  if (!ch || ch.slot === null) return []
  const out: CharacterInstance[] = []
  for (const pid of state.players) {
    if (pid === ch.owner) continue
    const other = state.playerState[pid].field[ch.slot]
    if (other) {
      const oc = state.characters[other]
      if (oc && oc.zone === 'active' && !hasStatus(oc, 'Away')) out.push(oc)
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// STATUSES
// ---------------------------------------------------------------------------

export function hasStatus(ch: CharacterInstance, s: StatusName): boolean {
  return ch.statuses.some((x) => x.name === s)
}

export function getStatus(ch: CharacterInstance, s: StatusName) {
  return ch.statuses.find((x) => x.name === s)
}

// ---------------------------------------------------------------------------
// LIMIT TIERS (§21-23)
//   tier 0 = sober / no weed / hungry
//   tier 1 = Buzzed / High / Fed
//   tier 2 = Drunk / Stoned / Full
//   tier 3 = Wasted / Zooted / Stuffed   (reached at the character's tolerance)
// ---------------------------------------------------------------------------

export function limitTier(ch: CharacterInstance, track: LimitTrack): 0 | 1 | 2 | 3 {
  const def = getCharacterDef(ch.defId)
  const tol = def.tolerance[track]
  const lvl = ch.limits[track]
  if (lvl <= 0) return 0
  if (lvl >= tol) return 3
  return Math.min(lvl, 2) as 1 | 2
}

export const LIMIT_TIER_NAMES: Record<LimitTrack, [string, string, string, string]> = {
  alcohol: ['Sober', 'Buzzed', 'Drunk', 'Wasted'],
  weed: ['Clear', 'High', 'Stoned', 'Zooted'],
  food: ['Hungry', 'Fed', 'Full', 'Stuffed'],
}

export function limitTierName(ch: CharacterInstance, track: LimitTrack): string {
  return LIMIT_TIER_NAMES[track][limitTier(ch, track)]
}

/** Stat deltas contributed by the three Limit tracks. */
function limitStatDelta(ch: CharacterInstance): Record<StatName, number> {
  const d: Record<StatName, number> = { attack: 0, defense: 0 }
  const id = getCharacterDef(ch.defId).id
  const isElias = id === 'elias'
  const isKevin = id === 'kevin'
  const isCarlitos = id === 'carlitos'
  const isBry = id === 'bry'
  const isLarry = id === 'larry'
  const isChris = id === 'chris'

  // Alcohol (§21)
  const a = limitTier(ch, 'alcohol')
  if (isChris) {
    // DRUNKEN ENGINEERING. The only Character in the game with a penalty for
    // being SOBER. Everyone else starts at their best and trades away from it;
    // Chris starts underwater at "Trust Me" and has to be got a drink before he
    // is worth anything. Then it climbs, and stops climbing at Wasted, so there
    // is a sweet spot rather than "more is always better".
    if (a === 0) { d.attack -= 1; d.defense -= 1 }
    if (a === 2) { d.attack += 1; d.defense += 1 }
    if (a === 3) { d.attack += 2; d.defense += 1 }
    // CROSS-FADED. The only cross-track interaction in the game: Drunk AND at
    // least High at the same time. It is why Chris is the one Character who
    // actively wants Chi Chi standing next to him.
    if (a >= 2 && limitTier(ch, 'weed') >= 1) { d.attack += 1; d.defense += 1 }
  } else if (isLarry) {
    // I'M NOT A COP RIGHT NOW. His curve runs the same direction as everyone
    // else's and further in both directions: he stops being careful. The
    // control kit is built on Defense, so this is the family accidentally
    // dismantling their own best piece by being pleased to see him.
    if (a === 1) d.attack += 1
    if (a === 2) { d.attack += 2; d.defense -= 1 }
    if (a === 3) { d.attack += 3; d.defense -= 2 }
  } else if (isBry) {
    // BUILT FOR THIS. She holds it better than anybody, and the ladder is why
    // her tolerance of 4 matters: everyone else is Wasted at 3 and eating the
    // Defense penalty, Bry is still climbing.
    if (a === 1) d.attack += 1
    if (a === 2) d.attack += 2
    if (a === 3) { d.attack += 2; d.defense += 1 }
  } else if (isKevin) {
    // I Don't Even Drink. Everyone else buys swing with a drink; Kevin's whole
    // build is Defense and alcohol takes it apart.
    if (a === 1) d.defense -= 1
    if (a >= 2) d.defense -= 2
  } else if (isElias) {
    // Drunken Flow. Everyone else trades Defense for swing when they drink;
    // Elias gets sharper. He is the only Character whose alcohol curve goes up
    // all the way, which is the whole joke.
    if (a === 1) d.attack += 1
    if (a === 2) { d.attack += 2; d.defense += 1 }
    if (a === 3) { d.attack += 3; d.defense += 1 }
  } else {
    if (a === 1) d.attack += 1
    if (a === 2 || a === 3) { d.attack += 2; d.defense -= 1 }
  }

  // Weed (§22) - buys Defense, costs the ability to hit anything
  const w = limitTier(ch, 'weed')
  if (isChris) {
    // CREATIVE ENGINEERING. Weed does not take anything off him, it just does
    // not give him the Defense everyone else buys with it either. Getting Chris
    // high is neutral on its own and only pays off once he has had a drink.
    if (w >= 3) d.attack -= 1
  } else if (isLarry) {
    // COMPLETELY CATASTROPHIC. The only weed curve in the game that takes both
    // stats. Zooted also puts him to sleep outright - see applyLimit.
    if (w === 1) d.attack -= 1
    if (w >= 2) { d.attack -= 2; d.defense -= 2 }
  } else if (isBry) {
    // TOO DISTRACTED. The counterweight to the alcohol ladder. She does not get
    // physically worse, she just cannot focus, so she is the one Character who
    // pays the Attack and never collects the Defense everyone else gets back.
    // Tolerance 2 means she skips straight from High to Zooted on the second
    // one, so there is no middle step to write.
    if (w >= 2) d.attack -= 2
  } else if (isKevin) {
    // Why Am I Here. He does not smoke, and it takes the fight out of him
    // without giving back the Defense everyone else gets.
    if (w === 1) d.attack -= 1
    if (w >= 2) d.attack -= 2
  } else {
    if (w === 1) d.defense += 1
    if (w === 2) { d.defense += 2; d.attack -= 1 }
    if (w === 3) { d.defense += 2; d.attack -= 2 }
  }

  // Food (§23)
  const f = limitTier(ch, 'food')
  if (isCarlitos) {
    // I Ate Too Much. He cannot be got at with a drink or a joint, so the plate
    // is the only way in - and it is a real one.
    if (f === 2) d.attack -= 1
    if (f >= 3) { d.attack -= 2; d.defense -= 1 }
  } else if (isKevin) {
    // ALWAYS FED. Every other Character is trying not to get Stuffed. Kevin is
    // trying to stay there - this is the one curve in the game that rewards
    // running the meter all the way up, and it is his entire gameplay loop.
    if (f === 1) d.attack += 1
    // Leans Defense rather than both: at +2/+2 he came out of his first 150
    // games as the strongest Character in the deck. He is a tank, so the wall
    // is the part he keeps.
    // Pure wall. Two nerfs in he was still debuting as a top-two Character, so
    // Stuffed now buys Defense only - the Attack has to come from his Power
    // Move, his items, or somebody feeding him a Protein Shake.
    if (f >= 2) d.defense += 2
  } else {
    if (f === 2) d.defense += 1
    if (f === 3) { d.defense += 1; d.attack -= 1 }
  }

  return d
}

// ---------------------------------------------------------------------------
// EFFECTIVE STATS
//   base + equipped Gear/Rides + temporary mods + Limit tiers + statuses + auras
// ---------------------------------------------------------------------------

export function attachedStuff(state: GameState, ch: CharacterInstance): StuffInstance[] {
  return ch.attached.map((i) => state.stuff[i]).filter(Boolean)
}

export function effectiveStat(state: GameState, ch: CharacterInstance, stat: StatName): number {
  const def = getCharacterDef(ch.defId)
  let v = def.stats[stat]

  // equipped Gear / Rides
  for (const s of attachedStuff(state, ch)) {
    const sd = getStuffDef(s.defId)
    if (!sd.equipMods) continue
    if (sd.subtype !== 'Gear' && sd.subtype !== 'Ride') continue
    for (const m of sd.equipMods) {
      if (m.stat !== stat) continue
      v += m.amount
    }
  }

  // temporary modifiers
  for (const m of ch.mods) if (m.stat === stat) v += m.amount

  // limit tiers
  v += limitStatDelta(ch)[stat]

  // statuses
  if (stat === 'attack' && hasStatus(ch, 'Fired Up')) v += 2

  // ---- auras from allies adjacent to this character ----
  for (const ally of adjacentAllies(state, ch.iid)) {
    const ad = getCharacterDef(ally.defId)
    if (ad.id === 'mikeymoe' && stat === 'defense') v += 1      // Twin Energy
    if (ad.id === 'manny' && stat === 'attack') v += 1          // Big Chain
    for (const s of attachedStuff(state, ally)) {
      const sd = getStuffDef(s.defId)
      if (sd.id === 'bigsexychain' && stat === 'attack') v += 1
      if (sd.id === 'momvan' && stat === 'defense') v += 1
      // Chris's first Construct. It sits on a Character the way Gear does, but
      // what it does is project outwards, which is the whole difference between
      // an Item and a Construct.
      if (sd.id === 'homegym' && stat === 'attack') v += 2
    }
  }

  // ---- Elias: One-Man Production / You're Ruining The Shot ----
  if (def.id === 'elias') {
    const neighbours = adjacentAllies(state, ch.iid)
    // Nobody helping him means nobody in his way.
    if (neighbours.length === 0) v += 1
    // Every Stoned neighbour is one more person wandering through the shot.
    for (const n of neighbours) if (limitTier(n, 'weed') >= 2) v -= 1
  }

  // ---- Bry: I'm Watching Them, and Besties ----
  if (def.id === 'bry') {
    // She is not a better babysitter for having a Kid next to her. She is just
    // louder, and it turns out that is what she needed.
    if (stat === 'attack' && adjacentAllies(state, ch.iid).some((c) => hasTag(c, 'Kid'))) v += 2
    if (stat === 'attack' && activeCharacters(state, ch.owner)
      .some((c) => getCharacterDef(c.defId).id === 'nani')) v += 1
  }
  if (stat === 'defense' && hasTag(ch, 'Kid')
    && adjacentAllies(state, ch.iid).some((c) => getCharacterDef(c.defId).id === 'bry')) v += 1
  if (stat === 'defense' && def.id === 'nani' && activeCharacters(state, ch.owner)
    .some((c) => getCharacterDef(c.defId).id === 'bry')) v += 1

  // ---- Larry: Under Investigation, and Los Jefes ----
  // Same shape as Titi Bibi's: it reads off board position, so where you put
  // him is the decision. Nobody swings freely at somebody taking notes.
  for (const enemy of acrossFrom(state, ch.iid)) {
    if (getCharacterDef(enemy.defId).id !== 'larry') continue
    if (stat === 'attack') v -= 1
    // Los Jefes. Nani runs the operation, Larry enforces it, and the people
    // across the table stop being able to hold a line.
    if (stat === 'defense' && activeCharacters(state, enemy.owner)
      .some((c) => getCharacterDef(c.defId).id === 'nani')) v -= 1
  }

  // ---- Titi Bibi: enemies across from her suffer -1 Attack (No Violence) ----
  if (stat === 'attack') {
    for (const enemy of acrossFrom(state, ch.iid)) {
      if (getCharacterDef(enemy.defId).id === 'titibibi') v -= 1
    }
  }

  return Math.max(0, v)
}

export function effectiveStats(state: GameState, ch: CharacterInstance) {
  return {
    attack: effectiveStat(state, ch, 'attack'),
    defense: effectiveStat(state, ch, 'defense'),
  }
}

// ---------------------------------------------------------------------------
// LEGALITY
// ---------------------------------------------------------------------------

export function isCurrentPlayer(state: GameState, pid: PlayerId): boolean {
  return currentPlayer(state) === pid
}

/** The player whose Turn it is, according to this Round's turn order. */
export function currentPlayer(state: GameState): PlayerId {
  return state.turnOrder[state.turnIndex] ?? state.players[state.turnIndex]
}

export function activeCharacters(state: GameState, pid: PlayerId): CharacterInstance[] {
  return state.playerState[pid].field
    .filter((x): x is InstanceId => !!x)
    .map((x) => state.characters[x])
    .filter(Boolean)
}

export function allActiveEveryone(state: GameState): CharacterInstance[] {
  return state.players.flatMap((p) => activeCharacters(state, p))
}

export function hasTag(ch: CharacterInstance, tag: Tag): boolean {
  return getCharacterDef(ch.defId).tags.includes(tag)
}

/** §27: can this character take an Action at all right now? */
export function canAct(state: GameState, ch: CharacterInstance): { ok: boolean; why?: string } {
  if (ch.zone !== 'active') return { ok: false, why: 'Not on the field' }
  if (hasStatus(ch, 'Asleep')) return { ok: false, why: 'Asleep' }
  if (hasStatus(ch, 'Away')) return { ok: false, why: 'Away' }
  if (ch.actedThisTurn) return { ok: false, why: 'Already acted this Turn' }
  return { ok: true }
}

/** §14: can this character declare a standard Attack? */
export function canAttack(state: GameState, ch: CharacterInstance): { ok: boolean; why?: string } {
  const base = canAct(state, ch)
  if (!base.ok) return base
  if (hasStatus(ch, 'Busy')) return { ok: false, why: 'Busy' }
  if (limitTier(ch, 'weed') === 3) return { ok: false, why: 'Zooted - cannot initiate attacks' }
  return { ok: true }
}

export function canBeTargeted(state: GameState, ch: CharacterInstance): boolean {
  return ch.zone === 'active' && !hasStatus(ch, 'Away') && ch.hp > 0
}

/** Charmed characters cannot attack the one who charmed them (§27). */
export function charmBlocks(ch: CharacterInstance, targetChar: InstanceId): boolean {
  const s = getStatus(ch, 'Charmed')
  return !!s && s.sourceChar === targetChar
}

export function gearSlots(ch: CharacterInstance): number {
  return getCharacterDef(ch.defId).gearSlots ?? 1
}

export function rideSlots(ch: CharacterInstance): number {
  return getCharacterDef(ch.defId).rideSlots ?? 1
}

/** Per-subtype carry limit for consumables. */
export function itemCap(ch: CharacterInstance, subtype: string): number {
  const def = getCharacterDef(ch.defId)
  if (subtype === 'Gear') return def.gearSlots ?? 1
  if (subtype === 'Ride') return def.rideSlots ?? 1
  if (subtype === 'Pet') return def.petSlots ?? 1
  return 2 // Food / Drink / Smoke - "can't have more than 2 Food items attached"
}

/** Total attached Stuff limit. Amanda carries more; everyone else gets 3. */
export function totalItemCap(ch: CharacterInstance): number {
  return getCharacterDef(ch.defId).itemSlots ?? 3
}

export function countAttached(state: GameState, ch: CharacterInstance, subtype: string): number {
  return attachedStuff(state, ch).filter((s) => getStuffDef(s.defId).subtype === subtype).length
}

/** Max family size: 3 Active + 2 Bench (§5). */
export function familySize(state: GameState, pid: PlayerId): number {
  const ps = state.playerState[pid]
  return ps.field.filter(Boolean).length + ps.bench.length
}

export function openSlots(state: GameState, pid: PlayerId): Slot[] {
  const ps = state.playerState[pid]
  const out: Slot[] = []
  for (let i = 0; i < 3; i++) if (!ps.field[i]) out.push(i as Slot)
  return out
}


// ---------------------------------------------------------------------------
// STAT PROVENANCE
//
// A number on a card is useless if the player cannot see where it came from.
// This returns every contribution to a stat so the UI can show the arithmetic
// instead of a mystery total.
// ---------------------------------------------------------------------------

export interface StatPart {
  label: string
  amount: number
  kind: 'base' | 'item' | 'limit' | 'aura' | 'status' | 'temporary'
}

export function explainStat(state: GameState, ch: CharacterInstance, stat: StatName): StatPart[] {
  const def = getCharacterDef(ch.defId)
  const parts: StatPart[] = [{ label: 'Base', amount: def.stats[stat], kind: 'base' }]

  for (const s of attachedStuff(state, ch)) {
    const sd = getStuffDef(s.defId)
    if (!sd.equipMods) continue
    if (!['Gear', 'Ride', 'Pet'].includes(sd.subtype)) continue
    for (const m of sd.equipMods) {
      if (m.stat === stat && m.amount !== 0) {
        parts.push({ label: `${sd.icon ?? ''} ${sd.name}`.trim(), amount: m.amount, kind: 'item' })
      }
    }
  }

  for (const m of ch.mods) {
    if (m.stat !== stat || m.amount === 0) continue
    parts.push({
      label: m.note ?? (m.duration === 'round' ? 'This Round' : m.duration === 'turn' ? 'This Turn' : 'Lasting'),
      amount: m.amount,
      kind: 'temporary',
    })
  }

  const a = limitTier(ch, 'alcohol')
  const who = getCharacterDef(ch.defId).id
  if (who === 'carlitos') {
    const cf = limitTier(ch, 'food')
    if (cf === 2 && stat === 'attack') parts.push({ label: '🍔 I Ate Too Much', amount: -1, kind: 'limit' })
    if (cf >= 3) parts.push({ label: '🍔 I Ate Too Much', amount: stat === 'attack' ? -2 : -1, kind: 'limit' })
  } else if (who === 'kevin') {
    if (a >= 1 && stat === 'defense') {
      parts.push({ label: "🍺 I Don't Even Drink", amount: a === 1 ? -1 : -2, kind: 'limit' })
    }
    const kw = limitTier(ch, 'weed')
    if (kw >= 1 && stat === 'attack') {
      parts.push({ label: '🌿 Why Am I Here', amount: kw === 1 ? -1 : -2, kind: 'limit' })
    }
    const kf = limitTier(ch, 'food')
    if (kf === 1 && stat === 'attack') parts.push({ label: '🍔 Fed', amount: 1, kind: 'limit' })
    if (kf >= 2 && stat === 'defense') parts.push({ label: '🍔 Absolute Unit', amount: 2, kind: 'limit' })
  } else if (who === 'chris') {
    if (a === 0) parts.push({ label: '🔨 Trust Me', amount: -1, kind: 'limit' })
    if (a === 2) parts.push({ label: '🔨 Locked In', amount: 1, kind: 'limit' })
    if (a === 3) parts.push({ label: '🔨 Master Craftsman', amount: stat === 'attack' ? 2 : 1, kind: 'limit' })
    const cw = limitTier(ch, 'weed')
    if (a >= 2 && cw >= 1) parts.push({ label: '🍺🌿 Cross-Faded', amount: 1, kind: 'limit' })
    if (cw >= 3 && stat === 'attack') parts.push({ label: '🌿 Distracted', amount: -1, kind: 'limit' })
  } else if (who === 'larry') {
    if (a >= 1 && stat === 'attack') {
      parts.push({ label: "🍺 I'm Not A Cop Right Now", amount: a, kind: 'limit' })
    }
    if (a >= 2 && stat === 'defense') {
      parts.push({ label: "🍺 I'm Not A Cop Right Now", amount: a === 2 ? -1 : -2, kind: 'limit' })
    }
    const lw = limitTier(ch, 'weed')
    if (lw >= 1 && stat === 'attack') parts.push({ label: '🌿 Catatonic', amount: lw === 1 ? -1 : -2, kind: 'limit' })
    if (lw >= 2 && stat === 'defense') parts.push({ label: '🌿 Catatonic', amount: -2, kind: 'limit' })
  } else if (who === 'bry') {
    if (a >= 1 && stat === 'attack') {
      parts.push({ label: '🥃 Built For This', amount: a === 1 ? 1 : 2, kind: 'limit' })
    }
    if (a >= 3 && stat === 'defense') parts.push({ label: '🥃 Peak Bry', amount: 1, kind: 'limit' })
    const bw = limitTier(ch, 'weed')
    if (bw >= 2 && stat === 'attack') {
      parts.push({ label: '🌿 Too Distracted', amount: -2, kind: 'limit' })
    }
  } else if (who === 'elias') {
    if (a >= 1 && stat === 'attack') {
      parts.push({ label: '🎬 Drunken Flow', amount: a === 1 ? 1 : a === 2 ? 2 : 3, kind: 'limit' })
    }
    if (a >= 2 && stat === 'defense') parts.push({ label: '🎬 Drunken Flow', amount: 1, kind: 'limit' })
  } else {
    if (stat === 'attack' && a === 1) parts.push({ label: '🍺 Buzzed', amount: 1, kind: 'limit' })
    if (a >= 2) {
      if (stat === 'attack') parts.push({ label: a === 3 ? '🍺 Wasted' : '🍺 Drunk', amount: 2, kind: 'limit' })
      if (stat === 'defense') parts.push({ label: a === 3 ? '🍺 Wasted' : '🍺 Drunk', amount: -1, kind: 'limit' })
    }
  }
  // Kevin's Weed and Food rows are written above, in his own branch; running
  // the standard ones as well would report every tier twice.
  if (who !== 'kevin' && who !== 'carlitos') {
    // Bry's Weed row is written in her own branch, but her Food curve is the
    // standard one, so only the Weed half is skipped here.
    if (who !== 'bry' && who !== 'larry' && who !== 'chris') {
      const w = limitTier(ch, 'weed')
      if (w === 1 && stat === 'defense') parts.push({ label: '🌿 High', amount: 1, kind: 'limit' })
      if (w >= 2) {
        if (stat === 'defense') parts.push({ label: w === 3 ? '🌿 Zooted' : '🌿 Stoned', amount: 2, kind: 'limit' })
        if (stat === 'attack') parts.push({ label: w === 3 ? '🌿 Zooted' : '🌿 Stoned', amount: w === 3 ? -2 : -1, kind: 'limit' })
      }
    }
    const f = limitTier(ch, 'food')
    if (f === 2 && stat === 'defense') parts.push({ label: '🍔 Full', amount: 1, kind: 'limit' })
    if (f === 3) {
      if (stat === 'defense') parts.push({ label: '🍔 Stuffed', amount: 1, kind: 'limit' })
      if (stat === 'attack') parts.push({ label: '🍔 Stuffed', amount: -1, kind: 'limit' })
    }
  }

  if (stat === 'attack' && hasStatus(ch, 'Fired Up')) {
    parts.push({ label: '🔥 Fired Up', amount: 2, kind: 'status' })
  }

  if (getCharacterDef(ch.defId).id === 'elias') {
    const ns = adjacentAllies(state, ch.iid)
    if (ns.length === 0) parts.push({ label: '🎥 One-Man Production', amount: 1, kind: 'aura' })
    for (const n of ns) {
      if (limitTier(n, 'weed') >= 2) {
        parts.push({ label: `🌿 ${getCharacterDef(n.defId).name} is ruining the shot`, amount: -1, kind: 'aura' })
      }
    }
  }

  for (const ally of adjacentAllies(state, ch.iid)) {
    const ad = getCharacterDef(ally.defId)
    if (ad.id === 'mikeymoe' && stat === 'defense') parts.push({ label: `Beside ${ad.name}`, amount: 1, kind: 'aura' })
    if (ad.id === 'manny' && stat === 'attack') parts.push({ label: `Beside ${ad.name}`, amount: 1, kind: 'aura' })
    for (const s of attachedStuff(state, ally)) {
      const sd = getStuffDef(s.defId)
      if (sd.id === 'bigsexychain' && stat === 'attack') parts.push({ label: `Beside ${sd.name}`, amount: 1, kind: 'aura' })
      if (sd.id === 'momvan' && stat === 'defense') parts.push({ label: `Beside ${sd.name}`, amount: 1, kind: 'aura' })
      if (sd.id === 'homegym' && stat === 'attack') parts.push({ label: `🏋️ ${sd.name}`, amount: 2, kind: 'aura' })
    }
  }

  if (who === 'bry') {
    if (stat === 'attack' && adjacentAllies(state, ch.iid).some((c) => hasTag(c, 'Kid'))) {
      parts.push({ label: "👶 I'm Watching Them", amount: 2, kind: 'aura' })
    }
    if (stat === 'attack' && activeCharacters(state, ch.owner)
      .some((c) => getCharacterDef(c.defId).id === 'nani')) {
      parts.push({ label: '🍹 Besties', amount: 1, kind: 'aura' })
    }
  }
  if (stat === 'defense' && hasTag(ch, 'Kid')
    && adjacentAllies(state, ch.iid).some((c) => getCharacterDef(c.defId).id === 'bry')) {
    parts.push({ label: '👶 Bry is watching', amount: 1, kind: 'aura' })
  }
  if (stat === 'defense' && who === 'nani' && activeCharacters(state, ch.owner)
    .some((c) => getCharacterDef(c.defId).id === 'bry')) {
    parts.push({ label: '🍹 Besties', amount: 1, kind: 'aura' })
  }

  if (stat === 'attack') {
    for (const enemy of acrossFrom(state, ch.iid)) {
      if (getCharacterDef(enemy.defId).id === 'titibibi') {
        parts.push({ label: 'Facing Titi Bibi', amount: -1, kind: 'aura' })
      }
    }
  }
  for (const enemy of acrossFrom(state, ch.iid)) {
    if (getCharacterDef(enemy.defId).id !== 'larry') continue
    if (stat === 'attack') parts.push({ label: '🔎 Under Investigation', amount: -1, kind: 'aura' })
    if (stat === 'defense' && activeCharacters(state, enemy.owner)
      .some((c) => getCharacterDef(c.defId).id === 'nani')) {
      parts.push({ label: '👔 Los Jefes', amount: -1, kind: 'aura' })
    }
  }

  return parts.filter((p) => p.amount !== 0 || p.kind === 'base')
}

/** What this character does FOR (or TO) the characters beside it. */
/**
 * What a status actually does, in the words a player needs at the moment they
 * see it. "Confused" on a token told you nothing; the rule lived only in a
 * comment in types.ts.
 */
export const STATUS_RULES: Record<string, string> = {
  Confused: 'Before they act, roll a d6. On a 1 or 2 whatever they were doing falls apart and the action is spent anyway.',
  Asleep: 'Cannot act at all. No attacks, no abilities, no items.',
  Busy: 'Cannot attack, cannot use an activated item, and cannot step in to defend somebody else.',
  Away: 'Off the field. Cannot be targeted and counts as nobody\'s neighbour.',
  Charmed: 'Cannot attack whoever charmed them. Everyone else is fair game.',
  'Fired Up': '+2 Attack while it lasts.',
  'Bad Luck': 'A natural 1 on any roll sets off a Bad Luck roll, and those range from mildly bad to being hit by a car.',
}

export function auraSummary(state: GameState, ch: CharacterInstance): string[] {
  const def = getCharacterDef(ch.defId)
  const out: string[] = []
  if (def.id === 'mikeymoe') out.push('Neighbours +1 Defense')
  if (def.id === 'manny') out.push('Neighbours +1 Attack')
  if (def.id === 'chichi') out.push('Neighbours: Bad Luck on a 1')
  if (def.id === 'titibibi') out.push('Enemies opposite -1 Attack')
  if (def.id === 'amanda') out.push('Takes a hit for a neighbour')
  if (def.id === 'elias') out.push('Better alone, worse beside a stoner')
  if (def.id === 'carlitos') out.push('Hands his drinks to a neighbour')
  for (const s of attachedStuff(state, ch)) {
    const sd = getStuffDef(s.defId)
    if (sd.id === 'bigsexychain') out.push('Neighbours get +1 Attack')
    if (sd.id === 'momvan') out.push('Neighbours get +1 Defense')
  }
  return out
}

/** What the neighbours are doing TO this Character, in plain words. The board
 *  showed what a card gave out but never what it was getting, so the effect of
 *  where you place somebody was invisible. */
export function incomingAuras(state: GameState, ch: CharacterInstance): string[] {
  const out: string[] = []
  for (const a of adjacentAllies(state, ch.iid)) {
    const ad = getCharacterDef(a.defId)
    if (ad.id === 'mikeymoe') out.push(`+1 🛡 from ${ad.name}`)
    if (ad.id === 'manny') out.push(`+1 ⚔ from ${ad.name}`)
    if (ad.id === 'chichi') out.push(`Bad Luck risk from ${ad.name}`)
    if (ad.id === 'amanda') out.push(`${ad.name} may take a hit for them`)
    for (const s of attachedStuff(state, a)) {
      const sd = getStuffDef(s.defId)
      if (sd.id === 'bigsexychain') out.push(`+1 ⚔ from ${sd.name}`)
      if (sd.id === 'momvan') out.push(`+1 🛡 from ${sd.name}`)
    }
  }
  for (const e of acrossFrom(state, ch.iid)) {
    if (getCharacterDef(e.defId).id === 'titibibi') out.push('-1 ⚔ from Titi Bibi opposite')
  }
  if (getCharacterDef(ch.defId).id === 'elias') {
    const ns = adjacentAllies(state, ch.iid)
    if (ns.length === 0) out.push('+1 ⚔ +1 🛡 working alone')
    for (const n of ns) {
      if (limitTier(n, 'weed') >= 2) out.push(`-1 ⚔ -1 🛡 - ${getCharacterDef(n.defId).name} is ruining the shot`)
    }
  }
  return out
}

/** True if this character is affected by, or affects, its neighbours. */
export function hasAdjacencyEffect(state: GameState, ch: CharacterInstance): boolean {
  if (auraSummary(state, ch).length > 0) return true
  return adjacentAllies(state, ch.iid).some((a) => auraSummary(state, a).length > 0)
}
