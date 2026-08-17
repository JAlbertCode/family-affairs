// Does this card do anything?
//
// Jay's report: "there's still a bunch of items that don't actually change
// stuffed, high, or drunkness". The text linter checks that a card's prose
// matches its effects; this checks the thing before that, which is whether the
// effects exist at all - and, for anything you put in your mouth, whether it
// moves the meter its whole subtype is named after.
import { STUFF, STUFF_BY_ID } from '../engine/cards/stuff'
import { AFFAIRS } from '../engine/cards/affairs'
import { CHARACTERS } from '../engine/cards/characters'
import type { Effect, Tag } from '../engine/types'

const TRACK_KINDS = new Set(['limit', 'alcohol', 'weed', 'food'])

function walk(effects: Effect[] | undefined, seen: Set<string> = new Set()): Set<string> {
  for (const e of effects ?? []) {
    seen.add(e.k)
    const any = e as any
    if (any.effects) walk(any.effects, seen)
    if (any.branches) for (const b of any.branches) walk(b.effects, seen)
    if (any.then) walk(any.then, seen)
    if (any.otherwise) walk(any.otherwise, seen)
    if (any.options) for (const o of any.options) walk(o.effects, seen)
  }
  return seen
}

const problems: string[] = []
// Advisory: who counts as a Kid or a Mom in this family is not a thing a linter
// gets to decide, so a thin tag is reported and never fatal.
const notes: string[] = []

// Duplicate ids silently shadow each other in the by-id lookup, so one of the
// two cards is in the deck list and never once resolves as itself.
const counts = new Map<string, number>()
for (const s of STUFF) counts.set(s.id, (counts.get(s.id) ?? 0) + 1)
for (const [id, n] of counts) if (n > 1) problems.push(`DUPLICATE ID  ${id} appears ${n} times in STUFF - ${Object.keys(STUFF_BY_ID).length} unique ids for ${STUFF.length} cards`)

for (const s of STUFF) {
  const kinds = walk(s.effects)
  const gain = Object.entries(s.limitGain ?? {}).filter(([, v]) => v)
  const movesTrack = gain.length > 0 || [...kinds].some((k) => TRACK_KINDS.has(k))
  const doesAnything = kinds.size > 0 || gain.length > 0 || !!s.equipMods?.length
    || !!s.activated || !!s.interfere || !!s.aura

  if (!doesAnything) problems.push(`INERT         ${s.subtype.padEnd(11)} ${s.id.padEnd(17)} ${s.name} - nothing: no effects, no limitGain, no equipMods, no aura`)
  else if ((s.subtype === 'Food' || s.subtype === 'Drink' || s.subtype === 'Smoke') && !movesTrack) {
    problems.push(`NO METER      ${s.subtype.padEnd(11)} ${s.id.padEnd(17)} ${s.name} - you consume it and no Limit track moves`)
  }
}

// A card that aims at a tag nobody has is a card that does nothing, and no
// amount of reading the card tells you that - it is a property of the deck, not
// of the card. Six cards were keyed to Kid, which one Character in twenty-three
// has, and Super Bowl Weekend poured drinks for an Adult tag that six grown
// adults had been left off.
const tagUsers: Map<string, Set<string>> = new Map()
function note(t: string | undefined, who: string) {
  if (!t) return
  if (!tagUsers.has(t)) tagUsers.set(t, new Set())
  tagUsers.get(t)!.add(who)
}
function tags(effects: Effect[] | undefined, who: string) {
  for (const e of effects ?? []) {
    const any = e as any
    for (const k of ['target', 'from']) { note(any[k]?.withTag, who); note(any[k]?.withoutTag, who) }
    note(any.tag, who)
    for (const k of ['effects', 'then', 'else']) if (any[k]) tags(any[k], who)
    if (any.branches) for (const b of any.branches) tags(b.effects, who)
  }
}
for (const c of CHARACTERS) { tags(c.ability?.effects, c.name); tags(c.powerMove?.effects, c.name) }
for (const s of STUFF) { tags(s.effects, s.name); tags(s.activated?.effects, s.name) }
for (const a of AFFAIRS) tags(a.effects, a.name)

/** Mirrors `hasTag`: Adult is derived from not being a child, not written down. */
const holders = (t: string) => CHARACTERS.filter((c) => (t === 'Adult'
  ? !(c.tags as string[]).includes('Kid') && !(c.tags as string[]).includes('Grandkid')
  : (c.tags as string[]).includes(t as Tag))).length

for (const [tag, cards] of tagUsers) {
  const n = holders(tag)
  const list = [...cards].sort().join(', ')
  if (n === 0) problems.push(`DEAD TAG      ${tag.padEnd(14)} nobody in the deck has it, and ${cards.size} card(s) aim at it: ${list}`)
  else if (n < 3) notes.push(`THIN TAG      ${tag.padEnd(14)} only ${n} of ${CHARACTERS.length} Characters have it, and ${cards.size} card(s) aim at it: ${list}`)
}

for (const a of AFFAIRS) {
  const kinds = walk(a.effects)
  if (kinds.size === 0) problems.push(`INERT AFFAIR  ${a.id.padEnd(17)} ${a.name} - no effects at all`)
}

if (notes.length) {
  console.log(`${notes.length} tag(s) too thin for the cards aimed at them:\n`)
  for (const n of notes.sort()) console.log('  ' + n)
  console.log('')
}
if (problems.length) {
  console.log(`${problems.length} card(s) to look at:\n`)
  for (const p of problems.sort()) console.log('  ' + p)
  process.exit(1)
}
console.log('Every card moves something, and every tag a card aims at exists.')
