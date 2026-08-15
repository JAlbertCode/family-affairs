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
  const d: Record<StatName, number> = { attack: 0, defense: 0, speed: 0 }

  // Alcohol (§21)
  const a = limitTier(ch, 'alcohol')
  if (a === 1) d.attack += 1
  if (a === 2 || a === 3) { d.attack += 2; d.defense -= 1 }

  // Weed (§22)
  const w = limitTier(ch, 'weed')
  if (w === 1) d.defense += 1
  if (w === 2) { d.defense += 2; d.speed -= 1 }
  if (w === 3) { d.defense += 2; d.speed -= 2 }

  // Food (§23)
  const f = limitTier(ch, 'food')
  if (f === 2) d.defense += 1
  if (f === 3) { d.defense += 1; d.speed -= 2 }

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
      // Xavi ignores Speed penalties from Rides (Wheel Life)
      if (def.id === 'xavi' && sd.subtype === 'Ride' && m.stat === 'speed' && m.amount < 0) continue
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
    if (ad.id === 'mikeymoe' && stat === 'speed') v += 1        // Twin Energy
    if (ad.id === 'manny' && stat === 'attack') v += 1          // Big Chain
    for (const s of attachedStuff(state, ally)) {
      const sd = getStuffDef(s.defId)
      if (sd.id === 'bigsexychain' && stat === 'attack') v += 1
      if (sd.id === 'momvan' && stat === 'speed') v += 1
    }
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
    speed: effectiveStat(state, ch, 'speed'),
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
  if (limitTier(ch, 'weed') === 3) return { ok: false, why: 'Zooted — cannot initiate attacks' }
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
  return 2 // Food / Drink / Smoke — "can't have more than 2 Food items attached"
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
