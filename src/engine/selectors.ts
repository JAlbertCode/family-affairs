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
  const isAdrian = id === 'adrian'
  const isDorian = id === 'dorian'
  const isEvelyn = id === 'titievelyn'

  // Alcohol (§21)
  const a = limitTier(ch, 'alcohol')
  if (isAdrian) {
    // He is fine drunk. It just is not where his value is, so the ladder is
    // shallow and flat rather than a trade: no Defense comes off, and nothing
    // above Buzzed adds much. Weed is the track that matters for him.
    if (a >= 1) d.attack += 1
    // HIGHER CONSCIOUSNESS. The second cross-track interaction in the deck and
    // the larger of the two: Drunk and at least High together. Chris gets +1/+1
    // out of the same shape; Adrian is the Character the mechanic was written
    // for, so his is worth twice that.
    if (a >= 2 && limitTier(ch, 'weed') >= 1) { d.attack += 2; d.defense += 2 }
  } else if (isChris) {
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
  } else if (isEvelyn) {
    // SKINNY MARGARITA. The first one loosens her up and the second starts the
    // party - she is the only Character in the deck who gets better at holding
    // the room by drinking. The third is where she stops hosting: the usual
    // Wasted mess, and her whole aura goes off with it (see effectiveStat).
    if (a === 1) d.defense += 1
    if (a === 2) { d.attack += 1; d.defense += 1 }
    if (a >= 3) { d.attack += 2; d.defense -= 1 }
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
  if (isAdrian) {
    // CHILL VIBES into CLAIMS GET QUESTIONABLE. Stoned is where he wants to
    // live, and tier 2 is the sweet spot: it is the gate on Fake Claims. Going
    // one further does not soften him, it removes him - see applyLimit.
    if (w === 1) d.defense += 1
    if (w === 2) d.defense += 2
    if (w === 3) d.defense += 2
  } else if (isChris) {
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
  } else if (isDorian) {
    // BLUNT FOCUS. One or two settles him and he swings harder. He is the only
    // Character who buys Attack with weed rather than Defense, and the only one
    // whose sweet spot is a window rather than a ceiling: the third one is not
    // more of the same, it is everybody else's curve arriving at once.
    if (w === 1 || w === 2) d.attack += 1
    if (w >= 3) { d.attack -= 2; d.defense += 2 }
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
  } else if (isAdrian) {
    // He wants substances and vibes, not a food coma. No Defense to collect
    // here, and Stuffed sends him to sleep the same way Zooted does.
    if (f >= 2) d.attack -= 1
  } else if (isEvelyn) {
    // She has been feeding this family her whole life. A plate does nothing to
    // her until it is a real plate, and it never costs her the way it costs
    // everyone else - which is what makes Dinner At Titi's safe to point at
    // herself and dangerous to point at anybody with a normal appetite.
    if (f >= 2) d.defense += 1
  } else if (isDorian) {
    // EAT TO GROW. The plate is a ladder rather than a tax: first he gets
    // harder to move, then he starts hitting back, then he is CHUNKY - all the
    // Attack in the deck and slower for it. Tolerance 4 is what buys the third
    // rung; everyone else is Stuffed and asleep by then, which is exactly where
    // his fourth plate puts him too.
    if (f === 1) d.defense += 1
    if (f === 2) { d.defense += 1; d.attack += 1 }
    if (f >= 3) { d.attack += 2; d.defense -= 1 }
  } else {
    if (f === 2) d.defense += 1
    if (f === 3) { d.defense += 1; d.attack -= 1 }
  }

  // CROSS-FADED. Measured over sixty games, 47.5% of Characters were knocked
  // out stone cold sober, clear and hungry, and another 37% at tier 1 where the
  // curve is a single point - so 85% of deaths happened before any of the three
  // meters did anything anybody could feel. The cause is not that the meters
  // fill slowly; it is that they fill *sideways*. A Character who has had a
  // beer, a joint and a plate is at tier 1 on three tracks and tier 2 on none,
  // and every ladder in the game reads one track at a time, so the most common
  // state at the table was worth almost nothing.
  //
  // Being lit on more than one thing at once is also the actual joke of this
  // game, and half the character sheets already assume it exists. Bold and
  // sloppy: Attack up, Defense down, on top of whatever the individual tracks
  // are already doing.
  const lit = (['alcohol', 'weed', 'food'] as const).filter((t) => limitTier(ch, t) >= 1).length
  if (lit >= 2) { d.attack += 1; d.defense -= 1 }
  if (lit >= 3) { d.attack += 1; d.defense -= 1 }

  return d
}

/**
 * What a Limit track actually does to THIS Character, rung by rung.
 *
 * The ladders are per-Character - Kevin gets tougher on a full stomach and
 * Carlitos falls apart, weed sharpens Dorian and switches Larry off - and none
 * of that was anywhere on screen. You could read what a Character was on right
 * now, but not what one more drink would do to them, which is the only question
 * that matters when you are deciding who to hand it to.
 *
 * Computed rather than written down, by asking `limitStatDelta` what it would
 * say at each rung. Nothing can drift out of date with the rules because it is
 * the rules being asked.
 */
export interface LimitRung {
  level: number
  tier: 0 | 1 | 2 | 3
  name: string
  attack: number
  defense: number
  /** past their tolerance - this is the rung that undoes them */
  over: boolean
}

function atLevel(ch: CharacterInstance, track: LimitTrack, level: number): CharacterInstance {
  return { ...ch, limits: { ...ch.limits, [track]: level } }
}

export function limitLadder(state: GameState, ch: CharacterInstance, track: LimitTrack): LimitRung[] {
  const def = getCharacterDef(ch.defId)
  const tol = def.tolerance[track]
  // Diffed through `effectiveStat` rather than the Limit curve alone, because
  // the curve is not the whole story for everybody: Titi Evelyn's Defense comes
  // mostly from the room, and the room walks out when she has had one too many.
  // Reading only the curve made her third margarita look like an upgrade.
  const zero = atLevel(ch, track, 0)
  const baseA = effectiveStat(state, zero, 'attack')
  const baseD = effectiveStat(state, zero, 'defense')
  const out: LimitRung[] = []
  for (let level = 1; level <= tol + 1; level++) {
    const probe = atLevel(ch, track, level)
    out.push({
      level,
      tier: limitTier(probe, track),
      name: LIMIT_TIER_NAMES[track][limitTier(probe, track)],
      attack: effectiveStat(state, probe, 'attack') - baseA,
      defense: effectiveStat(state, probe, 'defense') - baseD,
      over: level > tol,
    })
  }
  return out
}

/** What one more of something would do to them, right now. Null when it would
 *  change nothing at all, which is itself worth not saying. */
export function limitForecast(
  state: GameState, ch: CharacterInstance, track: LimitTrack, amount = 1,
): { attack: number; defense: number; from: string; to: string; over: boolean } | null {
  const def = getCharacterDef(ch.defId)
  const cap = def.tolerance[track] + 1
  const next = Math.max(0, Math.min(cap, ch.limits[track] + amount))
  if (next === ch.limits[track]) return null
  const probe = atLevel(ch, track, next)
  return {
    attack: effectiveStat(state, probe, 'attack') - effectiveStat(state, ch, 'attack'),
    defense: effectiveStat(state, probe, 'defense') - effectiveStat(state, ch, 'defense'),
    from: limitTierName(ch, track),
    to: LIMIT_TIER_NAMES[track][limitTier(atLevel(ch, track, next), track)],
    over: next > def.tolerance[track],
  }
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

  // HOSTESS WITH THE MOSTEST. The only Character in the deck whose numbers are
  // a function of how many people turned up: two more bodies on the table is
  // another point of Defense, to a ceiling, and the whole thing switches off
  // the moment she has had one too many and stops hosting. Counted across the
  // whole table rather than her own Family, because it is a gathering.
  if (stat === 'defense' && def.id === 'titievelyn' && limitTier(ch, 'alcohol') < 3) {
    const room = allActiveEveryone(state).filter((c) => c.iid !== ch.iid).length
    v += Math.min(3, Math.floor(room / 2))
  }

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
  if (stat === 'attack' && hasStatus(ch, 'Powered Up')) v += 2

  // ---- auras from allies adjacent to this character ----
  // PARTY MODE. Two margaritas in, the music is on and it is everybody's
  // problem - her whole Active Family swings harder, not just the neighbours,
  // because a party is not an adjacency.
  if (stat === 'attack') {
    for (const a of activeCharacters(state, ch.owner)) {
      if (a.iid === ch.iid) continue
      if (getCharacterDef(a.defId).id !== 'titievelyn') continue
      if (limitTier(a, 'alcohol') === 2) v += 1
    }
  }

  for (const ally of adjacentAllies(state, ch.iid)) {
    const ad = getCharacterDef(ally.defId)
    if (ad.id === 'mikeymoe' && stat === 'defense') v += 1      // Twin Energy
    if (ad.id === 'manny' && stat === 'attack') v += 1          // Big Chain
    for (const s of attachedStuff(state, ally)) {
      const sd = getStuffDef(s.defId)
      // Constructs. They sit on a Character the way Gear does, but what they
      // do projects outwards, which is the whole difference between an Item and
      // a Construct - and it is now a field on the card rather than three id
      // checks in here, so a card pack can ship one.
      if (sd.aura?.stat === stat) v += sd.aura.amount
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

  // ---- Justin: Giant Reach ----
  // He is reaching over whoever is in front of him, so it comes off their
  // Defense rather than adding to his Attack - same arithmetic, but it reads
  // as height rather than as strength.
  if (stat === 'defense') {
    for (const enemy of acrossFrom(state, ch.iid)) {
      if (getCharacterDef(enemy.defId).id === 'justin') v -= 1
    }
  }

  // ---- Grandpa: the Sunday Service aura, sized by Faith ----
  // Read off whoever is standing next to him rather than off him, because the
  // whole character is what he does for other people.
  if (stat === 'defense') {
    for (const ally of adjacentAllies(state, ch.iid)) {
      if (getCharacterDef(ally.defId).id !== 'grandpa') continue
      const f = (ally.scratch.faith as number) ?? 0
      v += f >= 5 ? 3 : f >= 3 ? 2 : 1
    }
  }

  // ---- Hoza: Red Bull, Clutch Player, Ride or Die ----
  if (def.id === 'hoza') {
    const rb = (ch.scratch.redbull as number) ?? 0
    if (rb >= 1 && stat === 'attack') v += 1
    if (rb >= 2 && stat === 'defense') v += 1
    if (rb >= 3 && stat === 'attack') v += 1
    // CLUTCH PLAYER. He is at his best when somebody actually needs him, so
    // this reads off the rest of the family rather than off him: an ally under
    // half health, or a slot that just emptied, and he sharpens up.
    const family = activeCharacters(state, ch.owner)
    const hurt = family.some((c) => c.iid !== ch.iid && c.hp > 0 && c.hp * 2 <= c.maxHp)
    if (hurt && stat === 'attack') v += 1
  }
  // RIDE OR DIE. The engine has no reactions, so "jumps in when somebody needs
  // backup" is a standing aura rather than an interrupt: stand next to Hoza and
  // you are harder to hurt, all the time, without him having to be asked.
  if (stat === 'defense' && adjacentAllies(state, ch.iid)
    .some((c) => getCharacterDef(c.defId).id === 'hoza')) v += 2

  // ---- Adrian + Chi Chi: Good Vibes ----
  // The family's dedicated stoner duo. Worth double when they have actually
  // committed to it, which is the only aura in the game gated on a Limit tier.
  if (def.id === 'adrian' || def.id === 'chichi') {
    const partner = def.id === 'adrian' ? 'chichi' : 'adrian'
    const other = activeCharacters(state, ch.owner)
      .find((c) => getCharacterDef(c.defId).id === partner)
    if (other && stat === 'defense') {
      v += (limitTier(ch, 'weed') >= 2 && limitTier(other, 'weed') >= 2) ? 2 : 1
    }
  }

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
  const tags = getCharacterDef(ch.defId).tags
  // Adult is not a tag anybody has to remember to write down, it is the absence
  // of being a child - and leaving it to each card meant six Characters quietly
  // did not have it. Grandpa was not an Adult while Oh Grandma was; Super Bowl
  // Weekend poured drinks for two thirds of the table and skipped a grown man
  // holding a guitar. Nothing an author has to remember on twenty-three cards
  // stays right, so it is derived.
  if (tag === 'Adult') return !tags.includes('Kid') && !tags.includes('Grandkid')
  return tags.includes(tag)
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
  } else if (who === 'adrian') {
    if (a >= 1 && stat === 'attack') parts.push({ label: '🍺 Feeling Good', amount: 1, kind: 'limit' })
    const aw = limitTier(ch, 'weed')
    if (aw === 1 && stat === 'defense') parts.push({ label: '🌿 Chill Vibes', amount: 1, kind: 'limit' })
    if (aw >= 2 && stat === 'defense') parts.push({ label: '🌿 Claims Get Questionable', amount: 2, kind: 'limit' })
    if (a >= 2 && aw >= 1) parts.push({ label: '🍺🌿 Higher Consciousness', amount: 2, kind: 'limit' })
    const af = limitTier(ch, 'food')
    if (af >= 2 && stat === 'attack') parts.push({ label: '🍔 Too Full', amount: -1, kind: 'limit' })
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
  } else if (who === 'dorian') {
    const dw = limitTier(ch, 'weed')
    if ((dw === 1 || dw === 2) && stat === 'attack') parts.push({ label: '🌿 Blunt Focus', amount: 1, kind: 'limit' })
    if (dw >= 3) parts.push({ label: '🌿 Smoked Too Much', amount: stat === 'attack' ? -2 : 2, kind: 'limit' })
    const df = limitTier(ch, 'food')
    if (df === 1 && stat === 'defense') parts.push({ label: '🍔 Eat To Grow', amount: 1, kind: 'limit' })
    if (df === 2) parts.push({ label: '🍔 Eat To Grow', amount: 1, kind: 'limit' })
    if (df >= 3) parts.push({ label: '🍔 Chunky', amount: stat === 'attack' ? 2 : -1, kind: 'limit' })
    if (a >= 1) {
      if (stat === 'attack') parts.push({ label: a === 1 ? '🍺 Buzzed' : a === 3 ? '🍺 Wasted' : '🍺 Drunk', amount: a === 1 ? 1 : 2, kind: 'limit' })
      if (a >= 2 && stat === 'defense') parts.push({ label: a === 3 ? '🍺 Wasted' : '🍺 Drunk', amount: -1, kind: 'limit' })
    }
  } else if (who === 'titievelyn') {
    if (a === 1 && stat === 'defense') parts.push({ label: '🍸 Skinny Margarita', amount: 1, kind: 'limit' })
    if (a === 2) parts.push({ label: '🍸 Party Mode', amount: 1, kind: 'limit' })
    if (a >= 3) parts.push({ label: '🍸 Stopped Hosting', amount: stat === 'attack' ? 2 : -1, kind: 'limit' })
    const ef = limitTier(ch, 'food')
    if (ef >= 2 && stat === 'defense') parts.push({ label: '🍔 Used To It', amount: 1, kind: 'limit' })
    const ew = limitTier(ch, 'weed')
    if (ew === 1 && stat === 'defense') parts.push({ label: '🌿 High', amount: 1, kind: 'limit' })
    if (ew >= 2) {
      if (stat === 'defense') parts.push({ label: ew === 3 ? '🌿 Zooted' : '🌿 Stoned', amount: 2, kind: 'limit' })
      if (stat === 'attack') parts.push({ label: ew === 3 ? '🌿 Zooted' : '🌿 Stoned', amount: ew === 3 ? -2 : -1, kind: 'limit' })
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
  if (who !== 'kevin' && who !== 'carlitos' && who !== 'dorian' && who !== 'titievelyn') {
    // Bry's Weed row is written in her own branch, but her Food curve is the
    // standard one, so only the Weed half is skipped here.
    if (who !== 'bry' && who !== 'larry' && who !== 'chris' && who !== 'adrian') {
      const w = limitTier(ch, 'weed')
      if (w === 1 && stat === 'defense') parts.push({ label: '🌿 High', amount: 1, kind: 'limit' })
      if (w >= 2) {
        if (stat === 'defense') parts.push({ label: w === 3 ? '🌿 Zooted' : '🌿 Stoned', amount: 2, kind: 'limit' })
        if (stat === 'attack') parts.push({ label: w === 3 ? '🌿 Zooted' : '🌿 Stoned', amount: w === 3 ? -2 : -1, kind: 'limit' })
      }
    }
    const f = who === 'adrian' ? 0 : limitTier(ch, 'food')
    if (f === 2 && stat === 'defense') parts.push({ label: '🍔 Full', amount: 1, kind: 'limit' })
    if (f === 3) {
      if (stat === 'defense') parts.push({ label: '🍔 Stuffed', amount: 1, kind: 'limit' })
      if (stat === 'attack') parts.push({ label: '🍔 Stuffed', amount: -1, kind: 'limit' })
    }
  }

  const lit = (['alcohol', 'weed', 'food'] as const).filter((t) => limitTier(ch, t) >= 1).length
  if (lit >= 2) {
    parts.push({
      label: lit >= 3 ? '🍺🌿🍔 Cross-Faded' : '🍺🌿 Cross-Faded',
      amount: (stat === 'attack' ? 1 : -1) * (lit >= 3 ? 2 : 1),
      kind: 'limit',
    })
  }

  if (stat === 'attack' && hasStatus(ch, 'Powered Up')) {
    parts.push({ label: '⚡ Powered Up', amount: 2, kind: 'status' })
  }

  if (stat === 'defense' && who === 'titievelyn' && limitTier(ch, 'alcohol') < 3) {
    const room = allActiveEveryone(state).filter((c) => c.iid !== ch.iid).length
    const n = Math.min(3, Math.floor(room / 2))
    if (n > 0) parts.push({ label: `🏠 ${room} people here`, amount: n, kind: 'aura' })
  }
  if (stat === 'attack') {
    for (const a2 of activeCharacters(state, ch.owner)) {
      if (a2.iid === ch.iid) continue
      if (getCharacterDef(a2.defId).id !== 'titievelyn') continue
      if (limitTier(a2, 'alcohol') === 2) parts.push({ label: '🍸 Party Mode', amount: 1, kind: 'aura' })
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
      if (sd.aura?.stat === stat) parts.push({ label: `Beside ${sd.name}`, amount: sd.aura.amount, kind: 'aura' })

    }
  }

  if (stat === 'defense') {
    for (const ally of adjacentAllies(state, ch.iid)) {
      if (getCharacterDef(ally.defId).id !== 'grandpa') continue
      const f = (ally.scratch.faith as number) ?? 0
      parts.push({ label: '🙏 Sunday Service', amount: f >= 5 ? 3 : f >= 3 ? 2 : 1, kind: 'aura' })
    }
    for (const enemy of acrossFrom(state, ch.iid)) {
      if (getCharacterDef(enemy.defId).id === 'justin') {
        parts.push({ label: '🏀 Facing Justin', amount: -1, kind: 'aura' })
      }
    }
  }

  if (who === 'hoza') {
    const rb = (ch.scratch.redbull as number) ?? 0
    if (rb >= 1 && stat === 'attack') {
      parts.push({ label: rb >= 3 ? '🐂 Wired' : '🐂 Red Bull', amount: rb >= 3 ? 2 : 1, kind: 'limit' })
    }
    if (rb >= 2 && stat === 'defense') parts.push({ label: '🐂 Red Bull', amount: 1, kind: 'limit' })
    const family = activeCharacters(state, ch.owner)
    if (stat === 'attack' && family.some((c) => c.iid !== ch.iid && c.hp > 0 && c.hp * 2 <= c.maxHp)) {
      parts.push({ label: '🤝 Clutch Player', amount: 1, kind: 'aura' })
    }
  }
  if (stat === 'defense' && adjacentAllies(state, ch.iid)
    .some((c) => getCharacterDef(c.defId).id === 'hoza')) {
    parts.push({ label: '🤝 Ride Or Die', amount: 2, kind: 'aura' })
  }

  if (who === 'adrian' || who === 'chichi') {
    const partner = who === 'adrian' ? 'chichi' : 'adrian'
    const other = activeCharacters(state, ch.owner)
      .find((c) => getCharacterDef(c.defId).id === partner)
    if (other && stat === 'defense') {
      const both = limitTier(ch, 'weed') >= 2 && limitTier(other, 'weed') >= 2
      parts.push({ label: '🌿 Good Vibes', amount: both ? 2 : 1, kind: 'aura' })
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
  'Powered Up': '+2 Attack, and The Truth is one phone call away.',
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
  if (def.id === 'titievelyn') {
    out.push(limitTier(ch, 'alcohol') >= 3
      ? 'Has stopped hosting'
      : `Harder to break the fuller the room gets`)
    if (limitTier(ch, 'alcohol') === 2) out.push('PARTY MODE: your family +1 Attack')
  }
  for (const s of attachedStuff(state, ch)) {
    const sd = getStuffDef(s.defId)
    if (sd.aura) out.push(`Neighbours get ${sd.aura.amount > 0 ? '+' : ''}${sd.aura.amount} ${sd.aura.stat === 'attack' ? 'Attack' : 'Defense'}`)
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
      if (sd.aura) out.push(`${sd.aura.amount > 0 ? '+' : ''}${sd.aura.amount} ${sd.aura.stat === 'attack' ? '⚔' : '🛡'} from ${sd.name}`)
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
