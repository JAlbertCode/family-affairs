import type {
  CharacterDef, StuffDef, AffairDef, Effect, Tag, StuffType, TargetScope, StatusName,
} from '../../engine/types'
import { RELATIONSHIP_TAGS, PERSONALITY_TAGS } from '../../engine/types'
import { RULES } from '../../engine/cards/schema'

/**
 * The rules, restated as things the form can enforce.
 *
 * The validator is the backstop and stays the authority - it is the same code
 * that guards a pack at load time, so nothing gets in by going round the UI.
 * But a builder that lets you type 9 Attack and then tells you off is a worse
 * tool than one where 9 Attack is not a thing you can express. Everything here
 * is derived from RULES rather than copied, so the two cannot drift.
 */

export const ARCHETYPES = ['Tank', 'Bruiser', 'Glass Cannon', 'Trickster', 'Support', 'Balanced'] as const
export const SUBTYPES: StuffType[] = ['Food', 'Drink', 'Smoke', 'Gear', 'Ride', 'Pet', 'Consumable']
export const ALL_TAGS: Tag[] = [...RELATIONSHIP_TAGS, ...PERSONALITY_TAGS] as Tag[]

export const STATUSES: StatusName[] = [
  'Confused', 'Asleep', 'Busy', 'Away', 'Charmed', 'Fired Up', 'Powered Up', 'Bad Luck',
]

/** Attack and Defense are one budget, so the form only ever asks for one. */
export const STAT_BUDGET = RULES.statBudget.min
export const ATTACK_MIN = Math.max(RULES.attack.min, STAT_BUDGET - RULES.defense.max)
export const ATTACK_MAX = Math.min(RULES.attack.max, STAT_BUDGET - RULES.defense.min)

export interface EffectKindSpec {
  k: Effect['k']
  label: string
  /** which card types may use it */
  on: Array<'character' | 'stuff' | 'affair'>
  amount?: { field: string; min: number; max: number; label: string }
  targets?: boolean
  extra?: 'track' | 'status' | 'subtype'
  note?: string
}

/**
 * The effects a third party may use, and how far each may go.
 *
 * This is deliberately a subset. `clout` is missing because no card may ever
 * hand out Clout directly; `roll`, `ifTag` and `ifCharacterActive` are missing
 * because they nest other effects and a nesting editor is a worse first
 * version than none. Nothing here can express something the engine cannot do,
 * which is the whole point: a card's text must match its effects, and the only
 * way to guarantee that at scale is to generate both from the same object.
 */
export const EFFECT_KINDS: EffectKindSpec[] = [
  { k: 'damage', label: 'Deal damage', on: ['character', 'stuff', 'affair'], targets: true,
    amount: { field: 'amount', min: 1, max: RULES.effect.damage, label: 'Damage' } },
  { k: 'heal', label: 'Heal', on: ['character', 'stuff', 'affair'], targets: true,
    amount: { field: 'amount', min: 1, max: RULES.effect.heal, label: 'Healing' } },
  { k: 'statMod', label: 'Change a stat for a while', on: ['character', 'stuff', 'affair'], targets: true,
    amount: { field: 'amount', min: -RULES.effect.statMod, max: RULES.effect.statMod, label: 'Amount' } },
  { k: 'limit', label: 'Move a Limit track', on: ['character', 'stuff', 'affair'], targets: true, extra: 'track',
    amount: { field: 'amount', min: -RULES.effect.limit, max: RULES.effect.limit, label: 'Amount' } },
  { k: 'status', label: 'Apply a status', on: ['character', 'stuff', 'affair'], targets: true, extra: 'status' },
  { k: 'removeStatus', label: 'Clear a status', on: ['character', 'stuff', 'affair'], targets: true, extra: 'status' },
  { k: 'swapStats', label: 'Swap Attack and Defense', on: ['character', 'stuff', 'affair'], targets: true },
  { k: 'extraAttack', label: 'Attack again', on: ['character', 'stuff'], targets: true },
  { k: 'stealStuff', label: 'Steal an item', on: ['character', 'stuff', 'affair'], targets: true },
  { k: 'destroyStuff', label: 'Destroy an item', on: ['character', 'stuff', 'affair'], targets: true },
  { k: 'forceConsume', label: 'Make them consume something', on: ['character', 'stuff', 'affair'], targets: true, extra: 'subtype' },
  { k: 'draw', label: 'Draw cards', on: ['character', 'stuff', 'affair'],
    amount: { field: 'n', min: 1, max: RULES.effect.draw, label: 'Cards' } },
  { k: 'discard', label: 'Discard cards', on: ['character', 'stuff', 'affair'],
    amount: { field: 'n', min: 1, max: RULES.effect.discard, label: 'Cards' } },
]

/** Scopes offered per card type. An Affair with a single chosen target does not
 *  make sense - nobody is holding it to choose with. */
export const SCOPES: Record<'character' | 'stuff' | 'affair', { v: TargetScope; label: string }[]> = {
  character: [
    { v: 'self', label: 'This Character' },
    { v: 'chosenEnemyActive', label: 'A chosen enemy' },
    { v: 'chosenAllyActive', label: 'A chosen ally' },
    { v: 'chosenAnyActive', label: 'Anybody you choose' },
    { v: 'adjacentAllies', label: 'The Characters beside them' },
    { v: 'allMyActive', label: 'Your whole family' },
    { v: 'allEnemyActive', label: 'Every enemy' },
    { v: 'randomEnemyActive', label: 'A random enemy' },
  ],
  stuff: [
    { v: 'self', label: 'Whoever holds it' },
    { v: 'chosenEnemyActive', label: 'A chosen enemy' },
    { v: 'chosenAllyActive', label: 'A chosen ally' },
    { v: 'chosenAnyActive', label: 'Anybody you choose' },
    { v: 'adjacentAllies', label: 'The Characters beside them' },
    { v: 'allMyActive', label: 'Your whole family' },
    { v: 'allEnemyActive', label: 'Every enemy' },
  ],
  affair: [
    { v: 'allActiveEveryone', label: 'Everybody at the table' },
    { v: 'allMyActive', label: 'Each family, their own Characters' },
  ],
}

export type CardType = 'character' | 'stuff' | 'affair'

export function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 24)
}

export function blankCharacter(): CharacterDef {
  return {
    kind: 'character', id: '', name: '', title: '', archetype: 'Balanced',
    stats: { hp: 14, attack: 4, defense: STAT_BUDGET - 4 },
    tags: [], tolerance: { alcohol: 3, weed: 3, food: 3 },
    color: '#c94f7c', art: '',
    flaw: { name: '', text: '', hooks: [] },
  } as CharacterDef
}

export function blankStuff(): StuffDef {
  return {
    kind: 'stuff', id: '', name: '', subtype: 'Gear', text: '', copies: 2,
    icon: '🎁', color: '#8892b0', equipMods: [], effects: [],
  } as StuffDef
}

export function blankAffair(): AffairDef {
  return {
    kind: 'affair', id: '', name: '', text: '', duration: 'round',
    color: '#b0416b', effects: [],
  } as AffairDef
}

/** A fresh effect of a kind, with every required field already legal. */
export function blankEffect(spec: EffectKindSpec, type: CardType): Effect {
  const scope = SCOPES[type][0].v
  const base: any = { k: spec.k }
  if (spec.targets) base[spec.k === 'stealStuff' || spec.k === 'destroyStuff' ? 'from' : 'target'] = { scope }
  if (spec.amount) base[spec.amount.field] = Math.max(1, Math.min(spec.amount.max, 1))
  if (spec.k === 'statMod') { base.stat = 'attack'; base.duration = 'round'; base.amount = 1 }
  if (spec.k === 'limit') base.track = 'alcohol'
  if (spec.k === 'status' || spec.k === 'removeStatus') base.status = 'Confused'
  if (spec.k === 'forceConsume') base.subtype = 'Food'
  if (spec.k === 'draw' || spec.k === 'discard') base.player = 'controller'
  return base as Effect
}
