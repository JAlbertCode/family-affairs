// Does this card do anything?
//
// Jay's report: "there's still a bunch of items that don't actually change
// stuffed, high, or drunkness". The text linter checks that a card's prose
// matches its effects; this checks the thing before that, which is whether the
// effects exist at all - and, for anything you put in your mouth, whether it
// moves the meter its whole subtype is named after.
import { STUFF, STUFF_BY_ID } from '../engine/cards/stuff'
import { AFFAIRS } from '../engine/cards/affairs'
import type { Effect } from '../engine/types'

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

for (const a of AFFAIRS) {
  const kinds = walk(a.effects)
  if (kinds.size === 0) problems.push(`INERT AFFAIR  ${a.id.padEnd(17)} ${a.name} - no effects at all`)
}

if (problems.length) {
  console.log(`${problems.length} card(s) to look at:\n`)
  for (const p of problems.sort()) console.log('  ' + p)
  process.exit(1)
} else {
  console.log('Every card moves something.')
}
