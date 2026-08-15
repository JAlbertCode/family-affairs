import type {
  CharacterDef, StuffDef, AffairDef, Effect, Ability, Tag, StatName,
} from '../types'
import { RELATIONSHIP_TAGS, PERSONALITY_TAGS } from '../types'

// ---------------------------------------------------------------------------
// CARD SCHEMA & POWER BUDGET
//
// The point of this file: anyone should be able to author cards for Family
// Affairs — a friend, a fan, a model — without being able to break the game.
// Every constraint here comes from the ruleset, and every card in the game
// (ours and theirs) is checked against it. If a card cannot pass, it does not
// load. That is what makes "other people issue their own cards" safe.
// ---------------------------------------------------------------------------

export const RULES = {
  hp: { min: 8, max: 18 },
  attack: { min: 2, max: 7 },
  defense: { min: 1, max: 6 },
  /** Attack + Defense. Every character sits on the same budget; identity comes
   *  from HP and abilities, not from a bigger number. */
  statBudget: { min: 8, max: 8 },
  tolerance: { min: 2, max: 4 },
  tags: { min: 2, max: 5 },
  achievementClout: { min: 1, max: 1 },

  /** Effect magnitude ceilings. Anything stronger needs a cost (see below). */
  effect: {
    damage: 4,
    damageWithCost: 6,
    heal: 4,
    statMod: 3,
    limit: 2,
    draw: 2,
    discard: 2,
  },

  /** Ability power budget, in points. See `effectCost`. */
  abilityBudget: 6,
  powerMoveBudget: 10,

  /** How many characters an effect may hit before it counts as an area effect. */
  areaMultiplier: 2.0,
} as const

const ALL_TAGS = new Set<string>([...RELATIONSHIP_TAGS, ...PERSONALITY_TAGS])

/** Characters a pack is allowed to reference. Filled in by the validator entry
 *  point so a third-party pack can lock stuff to its OWN characters too. */
const knownCharacterIds = new Set<string>()
export function registerCharacterIds(ids: string[]) {
  for (const id of ids) knownCharacterIds.add(id)
}
const knownStuffIds = new Set<string>()
export function registerStuffIds(ids: string[]) {
  for (const id of ids) knownStuffIds.add(id)
}

export interface Issue {
  card: string
  severity: 'error' | 'warn'
  field: string
  message: string
}

// ---------------------------------------------------------------------------
// Power budget
// ---------------------------------------------------------------------------

const AREA_SCOPES = new Set([
  'allEnemyActive', 'allActiveEveryone', 'allMyActive', 'allMyCharacters', 'adjacentAllies', 'adjacentAny',
])

const BAD_STATUSES = new Set(['Confused', 'Asleep', 'Busy', 'Bad Luck', 'Charmed'])

/** Is this effect aimed at the card's own Character, as a drawback? */
const onSelf = (t: any) => t?.scope === 'self'

/** Rough point value of a single effect, scaled up when it hits a whole board.
 *  Drawbacks a card inflicts on itself score NEGATIVE — they are a cost the
 *  designer paid, and pricing them as power is how you end up rejecting a
 *  character who is already losing. */
export function effectCost(e: Effect): number {
  const spread = (t: any) => (t && AREA_SCOPES.has(t.scope) ? RULES.areaMultiplier : 1)

  switch (e.k) {
    case 'damage':
      if (onSelf(e.target)) return -e.amount * 0.8
      return e.amount * 1.0 * spread(e.target) * (e.ignoreDefense ? 1.3 : 1)
    case 'heal': return e.amount * 0.8 * spread(e.target)
    case 'statMod': {
      const w = e.duration === 'permanent' ? 2.5 : e.duration === 'round' ? 1.2 : 0.7
      if (onSelf(e.target) && e.amount < 0) return -Math.abs(e.amount) * w
      return Math.abs(e.amount) * w * spread(e.target)
    }
    case 'status':
      if (onSelf(e.target)) return BAD_STATUSES.has(e.status) ? -2.5 : 2.5
      return 2.5 * spread(e.target)
    case 'removeStatus': return 1.0 * spread(e.target)
    // Worth a lot on a wall, worth nothing on a glass cannon. Priced at what
    // a deliberate build can get out of it, not at the average.
    case 'swapStats': return 2.5 * spread(e.target)
    case 'limit': {
      // pushing your OWN character toward a Limit threshold is a real risk
      if (onSelf(e.target) && e.amount > 0) return -e.amount * 0.5
      return Math.abs(e.amount) * 1.0 * spread(e.target)
    }
    case 'draw': return e.n * 1.5
    case 'discard': return e.n * 1.5
    case 'clout': return e.n * 8            // Clout is the win condition; very expensive
    case 'grantAction': return e.n * 3
    case 'extraAttack': return 3
    case 'stealStuff': return 2.5
    case 'destroyStuff': return 2
    case 'forceConsume': return 1.5
    case 'revealHand': return 1
    case 'badLuck': return 1.5 * spread(e.target)
    case 'roll': {
      // average the branches, weighted by how many faces each covers
      const total = e.branches.reduce((n, b) => n + b.on.length, 0) || 1
      return e.branches.reduce((sum, b) => sum + (b.on.length / total) * effectsCost(b.effects), 0)
    }
    case 'ifTag':
    case 'ifCharacterActive':
      return Math.max(effectsCost(e.then), e.else ? effectsCost(e.else) : 0) * 0.8
    case 'startMinigame': return 3
    case 'note': return 0
  }
}

export function effectsCost(list: Effect[]): number {
  return list.reduce((n, e) => n + effectCost(e), 0)
}

/** Cost reductions for genuine limitations (§46 balancing mechanisms). */
function abilityDiscount(a: Ability): number {
  let d = 1
  if (a.oncePerGame) d *= 0.45
  // A player gets one Turn per Round, so `cooldown: 1` already comes back
  // around next Turn — it costs the card nothing and earns no discount here.
  else if (a.cooldown) d *= 1 - Math.min(0.35, Math.max(0, a.cooldown - 1) * 0.15)
  if (a.requiresLimit && Object.keys(a.requiresLimit).length) d *= 0.85
  if (a.actionCost === 0) d *= 1.4 // free abilities are worth MORE, not less
  return d
}

export function abilityCost(a: Ability): number {
  return effectsCost(a.effects) * abilityDiscount(a)
}

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

function checkAbility(name: string, label: string, a: Ability, budget: number, out: Issue[]) {
  if (![0, 1].includes(a.actionCost)) {
    out.push({ card: name, severity: 'error', field: `${label}.actionCost`, message: 'Must cost 0 or 1 Family Action.' })
  }
  if (!a.text?.trim()) {
    out.push({ card: name, severity: 'error', field: `${label}.text`, message: 'Needs rules text players can read.' })
  }
  if (a.text && a.text.length > 220) {
    out.push({ card: name, severity: 'warn', field: `${label}.text`, message: 'Card text should stay short — flavour belongs in the art.' })
  }
  if (!a.effects?.length) {
    out.push({ card: name, severity: 'error', field: `${label}.effects`, message: 'Does nothing.' })
  }

  const gambled = a.effects.some((e) => e.k === 'roll')
  const hasCost = !!(a.oncePerGame || a.cooldown || a.requiresLimit || gambled)
  for (const e of flatten(a.effects)) {
    if (e.k === 'damage') {
      const cap = hasCost ? RULES.effect.damageWithCost : RULES.effect.damage
      if (e.amount > cap) {
        out.push({
          card: name, severity: 'error', field: `${label}.damage`,
          message: `Deals ${e.amount}. Max is ${cap}${hasCost ? '' : ' without a cooldown, limit requirement, or once-per-game'}.`,
        })
      }
    }
    if (e.k === 'heal' && e.amount > RULES.effect.heal) {
      out.push({ card: name, severity: 'error', field: `${label}.heal`, message: `Heals ${e.amount}. Max is ${RULES.effect.heal}.` })
    }
    if (e.k === 'statMod' && Math.abs(e.amount) > RULES.effect.statMod) {
      out.push({ card: name, severity: 'error', field: `${label}.statMod`, message: `Shifts a stat by ${e.amount}. Max is ±${RULES.effect.statMod}.` })
    }
    if (e.k === 'clout') {
      out.push({ card: name, severity: 'error', field: `${label}.clout`, message: 'Cards may not award Clout directly. Clout comes from combat and Achievements.' })
    }
  }

  const cost = abilityCost(a)
  if (cost > budget) {
    out.push({
      card: name, severity: 'error', field: label,
      message: `Power budget ${cost.toFixed(1)} exceeds ${budget}. Add a cooldown, a limit requirement, or weaken it.`,
    })
  }
}

function flatten(list: Effect[]): Effect[] {
  const out: Effect[] = []
  for (const e of list) {
    out.push(e)
    if (e.k === 'roll') for (const b of e.branches) out.push(...flatten(b.effects))
    if (e.k === 'ifTag' || e.k === 'ifCharacterActive') {
      out.push(...flatten(e.then))
      if (e.else) out.push(...flatten(e.else))
    }
  }
  return out
}

export function validateCharacter(c: CharacterDef): Issue[] {
  const out: Issue[] = []
  const n = c.name ?? c.id ?? '(unnamed)'
  const err = (field: string, message: string) => out.push({ card: n, severity: 'error', field, message })
  const warn = (field: string, message: string) => out.push({ card: n, severity: 'warn', field, message })

  if (!c.id || !/^[a-z0-9]+$/.test(c.id)) err('id', 'Needs a lowercase alphanumeric id.')
  if (!c.name?.trim()) err('name', 'Needs a name.')

  const s = c.stats
  if (!s) { err('stats', 'Missing stats.'); return out }
  for (const [k, r] of [['hp', RULES.hp], ['attack', RULES.attack], ['defense', RULES.defense]] as const) {
    const v = s[k as 'hp']
    if (typeof v !== 'number' || !Number.isInteger(v)) err(k, 'Must be a whole number.')
    else if (v < r.min || v > r.max) err(k, `${v} is outside the allowed ${r.min}-${r.max}.`)
  }

  const budget = (s.attack ?? 0) + (s.defense ?? 0)
  if (budget < RULES.statBudget.min || budget > RULES.statBudget.max) {
    err('stats', `Attack+Defense = ${budget}. Every character must total ${RULES.statBudget.min}.`)
  }

  // Tanks get high HP but must pay for it in offence, and vice versa.
  if (s.hp >= 15 && s.attack >= 6) warn('stats', 'High HP and high Attack together — check this against a Tank archetype.')

  if (!Array.isArray(c.tags) || c.tags.length < RULES.tags.min || c.tags.length > RULES.tags.max) {
    err('tags', `Needs ${RULES.tags.min}-${RULES.tags.max} tags.`)
  }
  for (const t of c.tags ?? []) {
    if (!ALL_TAGS.has(t)) err('tags', `"${t}" is not a known tag. Add it to types.ts first so other cards can react to it.`)
  }

  for (const k of ['alcohol', 'weed', 'food'] as const) {
    const v = c.tolerance?.[k]
    if (typeof v !== 'number' || v < RULES.tolerance.min || v > RULES.tolerance.max) {
      err(`tolerance.${k}`, `Must be ${RULES.tolerance.min}-${RULES.tolerance.max}.`)
    }
  }

  // §34: disadvantages are mandatory.
  if (!c.flaw) err('flaw', 'Every Character needs a Family Flaw. Disadvantages are mandatory.')

  if (c.ability) checkAbility(n, 'ability', c.ability, RULES.abilityBudget, out)
  if (c.powerMove) {
    checkAbility(n, 'powerMove', c.powerMove, RULES.powerMoveBudget, out)
    // A Power Move gets a bigger budget than an ability. The price of that is
    // that it cannot also be available every single Turn — otherwise the
    // Character's own ability is strictly worse and never gets played, which
    // is exactly what the balance sim caught.
    const raw = effectsCost(c.powerMove.effects)
    const limited = c.powerMove.oncePerGame || (c.powerMove.cooldown ?? 0) >= 2
    if (raw > RULES.abilityBudget && !limited) {
      err('powerMove', `Power Move is worth ${raw.toFixed(1)}, above the ${RULES.abilityBudget}-point ability cap, so it needs cooldown 2+ or oncePerGame.`)
    }
  }
  if (!c.ability && !c.powerMove) err('ability', 'Needs at least one activated ability.')

  // Starting stuff is free value that never had to be drawn, so it is capped
  // and has to name cards that exist.
  if (c.startsWith) {
    if (c.startsWith.length > 1) err('startsWith', 'A Character may start with at most 1 item.')
    for (const id of c.startsWith) {
      if (!knownStuffIds.has(id)) err('startsWith', `Unknown Stuff id "${id}".`)
    }
  }

  if (c.achievement) {
    const cl = c.achievement.clout
    if (cl < RULES.achievementClout.min || cl > RULES.achievementClout.max) {
      err('achievement.clout', `Achievements are worth exactly ${RULES.achievementClout.min} Clout.`)
    }
    if (!c.achievement.key) err('achievement.key', 'Needs an engine key the game can check.')
  }

  if ((c.gearSlots ?? 1) > 3) err('gearSlots', 'At most 3 Gear.')
  if ((c.rideSlots ?? 1) > 2) err('rideSlots', 'At most 2 Rides.')
  if ((c.petSlots ?? 1) > 2) err('petSlots', 'At most 2 Pets.')
  if ((c.itemSlots ?? 3) > 5) err('itemSlots', 'At most 5 attached items.')

  return out
}

export function validateStuff(d: StuffDef): Issue[] {
  const out: Issue[] = []
  const n = d.name ?? d.id ?? '(unnamed)'
  const err = (field: string, message: string) => out.push({ card: n, severity: 'error', field, message })

  if (!d.id || !/^[a-z0-9]+$/.test(d.id)) err('id', 'Needs a lowercase alphanumeric id.')
  if (!d.text?.trim()) err('text', 'Needs rules text.')
  if (d.copies < 1 || d.copies > 4) err('copies', 'Between 1 and 4 copies in the deck.')
  if (d.edible && !['Gear', 'Ride', 'Pet'].includes(d.subtype)) {
    err('edible', 'Food, Drink and Smoke are already consumable — `edible` is for Gear and Rides.')
  }
  // Character-locked stuff has to name Characters that actually exist, or the
  // card is simply unplayable once it is drawn.
  if (d.onlyFor) {
    if (!d.onlyFor.length) err('onlyFor', 'Lists no Characters, so nobody can ever hold it.')
    if (d.subtype !== 'Gear' && d.subtype !== 'Ride' && d.subtype !== 'Pet') {
      err('onlyFor', 'Only Gear, Rides and Pets can be locked to a Character.')
    }
    for (const id of d.onlyFor) {
      if (!knownCharacterIds.has(id)) err('onlyFor', `Unknown Character id "${id}".`)
    }
  }

  for (const e of flatten(d.effects ?? [])) {
    if (e.k === 'damage' && e.amount > RULES.effect.damage) err('effects', `Deals ${e.amount}. Max is ${RULES.effect.damage} for Stuff.`)
    if (e.k === 'heal' && e.amount > RULES.effect.heal) err('effects', `Heals ${e.amount}. Max is ${RULES.effect.heal}.`)
    if (e.k === 'clout') err('effects', 'Cards may not award Clout directly.')
    if (e.k === 'statMod' && Math.abs(e.amount) > RULES.effect.statMod) err('effects', `Shifts a stat by ${e.amount}. Max is ±${RULES.effect.statMod}.`)
  }

  // An activated item ability is held to the same budget as a character's.
  if (d.activated) checkAbility(n, 'activated', d.activated, RULES.abilityBudget, out)
  if (d.activated && !['Gear', 'Ride', 'Pet'].includes(d.subtype)) {
    err('activated', 'Only Gear, Rides and Pets can carry an activated ability.')
  }

  const total = (d.equipMods ?? []).reduce((n2, m) => n2 + Math.abs(m.amount), 0)
  if (['Gear', 'Ride', 'Pet'].includes(d.subtype) && total > 4) {
    err('equipMods', `Total stat swing ${total} is too high for one item. Keep it at 4 or less.`)
  }
  if (d.limitGain) {
    for (const [k, v] of Object.entries(d.limitGain)) {
      if ((v as number) > RULES.effect.limit) err('limitGain', `${k} +${v} is too much. Max ${RULES.effect.limit}.`)
    }
  }
  return out
}

export function validateAffair(a: AffairDef): Issue[] {
  const out: Issue[] = []
  const n = a.name ?? a.id ?? '(unnamed)'
  const err = (field: string, message: string) => out.push({ card: n, severity: 'error', field, message })
  const warn = (field: string, message: string) => out.push({ card: n, severity: 'warn', field, message })

  if (!a.id || !/^[a-z0-9]+$/.test(a.id)) err('id', 'Needs a lowercase alphanumeric id.')
  if (!a.text?.trim()) err('text', 'Needs rules text.')

  const flat = flatten(a.effects ?? [])
  if (!flat.length) err('effects', 'Does nothing.')

  for (const e of flat) {
    if (e.k === 'clout') err('effects', 'Family Affairs may not award Clout directly — that decides games at random.')
    if (e.k === 'damage' && e.amount > 3) err('effects', `Deals ${e.amount} to a whole board. Keep Affair damage at 3 or less.`)
    if (e.k === 'heal' && e.amount > 3) err('effects', `Heals ${e.amount} board-wide. Keep it at 3 or less.`)
    if (e.k === 'statMod' && Math.abs(e.amount) > 2) err('effects', `Shifts a stat by ${e.amount} board-wide. Max ±2 for an Affair.`)
    if (e.k === 'statMod' && e.duration === 'permanent') err('effects', 'Affairs must not change stats permanently.')
    if (e.k === 'status' && e.duration > 1) err('effects', 'Affair statuses should last a single Round.')
  }

  // §29: Affairs should hit several characters, and should never whiff entirely.
  const targeted = flat.some((e) => 'target' in e && (e as any).target?.scope?.startsWith('all'))
  if (!targeted) warn('effects', 'Nothing targets a whole group. Affairs are meant to hit several Characters.')

  const tagGated = flat.every((e) => 'target' in e && (e as any).target?.withTag)
  if (tagGated && flat.length > 0) {
    warn('effects', 'Every effect is gated behind a tag — this Affair does nothing if that tag is absent. Add a fallback.')
  }

  return out
}

// ---------------------------------------------------------------------------
// Card packs — the third-party entry point
// ---------------------------------------------------------------------------

export interface CardPack {
  name: string
  author: string
  version: string
  characters?: CharacterDef[]
  stuff?: StuffDef[]
  affairs?: AffairDef[]
}

/**
 * Validate a whole pack. Returns every problem found; the caller decides
 * whether to load it. Anything with severity 'error' must block loading.
 */
export function validatePack(pack: CardPack, knownIds: Set<string> = new Set()): Issue[] {
  const out: Issue[] = []
  if (!pack.name) out.push({ card: '(pack)', severity: 'error', field: 'name', message: 'Packs need a name.' })
  if (!pack.author) out.push({ card: '(pack)', severity: 'error', field: 'author', message: 'Packs need an author.' })

  // A pack may lock its own stuff to its own characters, so register those
  // before anything is checked.
  registerCharacterIds((pack.characters ?? []).map((c) => c.id))
  registerStuffIds((pack.stuff ?? []).map((s) => s.id))

  const seen = new Set(knownIds)
  const claim = (id: string, label: string) => {
    if (seen.has(id)) out.push({ card: label, severity: 'error', field: 'id', message: `id "${id}" is already taken.` })
    seen.add(id)
  }

  for (const c of pack.characters ?? []) { claim(c.id, c.name); out.push(...validateCharacter(c)) }
  for (const s of pack.stuff ?? []) { claim(s.id, s.name); out.push(...validateStuff(s)) }
  for (const a of pack.affairs ?? []) { claim(a.id, a.name); out.push(...validateAffair(a)) }
  return out
}
