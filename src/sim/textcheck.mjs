// Does every card do what it says?
//
// A card's text and its effects are written by hand in the same object, which
// means they can disagree, and when they disagree the text is the lie: the
// engine only ever runs the effects. Jay found this the way players always
// will - "I used a few items and it didn't move the bars" - and no amount of
// reading the file catches it, because the mismatch is between two things that
// look right individually.
//
// So this reads the claim out of the prose and the behaviour out of the data
// and complains when they do not match. Run with `npm run textcheck`.
import { CHARACTERS } from '../engine/cards/characters.ts'
import { STUFF } from '../engine/cards/stuff.ts'
import { AFFAIRS } from '../engine/cards/affairs.ts'

// Deliberately narrow. An early version matched "a cheap shot" as alcohol and
// "the house is full" as food, and a linter that cries wolf gets muted, which
// is worse than not having one.
const TRACKS = [
  { track: 'alcohol', re: /\b(alcohol|drunk|buzzed|wasted)\b/i },
  { track: 'weed',    re: /\b(weed|stoned|zooted)\b/i },
  { track: 'food',    re: /\b(food|stuffed)\b/i },
]

/**
 * Cards whose behaviour is real but lives in the engine rather than in their
 * effects list. Each one names where, so this stays a list of deliberate
 * exceptions rather than a place to hide a bug.
 */
const HARDCODED = new Map([
  ['Pineapple Gloves', 'damage reduction in applyDamage'],
  ['The Home Gym', 'adjacency aura in effectiveStat'],
  ['Teremana', 'per-drinker branch in consumeCard'],
  ['Red Bull', "Hoza's counters in consumeCard"],
  ['The Sugar Free One', "Hoza's counters in consumeCard"],
])

const issues = []
const add = (card, msg) => issues.push({ card, msg })

/** Every limit the data actually moves, from limitGain and from effects. */
function limitsMoved(def) {
  const moved = new Set()
  for (const [k, v] of Object.entries(def.limitGain ?? {})) if (v) moved.add(k)
  // The engine's own rule: eating always moves Food whether the card says so
  // or not, so a Food card counts as moving Food even with an empty limitGain.
  if (def.subtype === 'Food') moved.add('food')
  const walk = (list) => {
    for (const e of list ?? []) {
      if (e.k === 'limit') moved.add(e.track)
      if (e.k === 'forceConsume') moved.add(e.subtype === 'Drink' ? 'alcohol' : e.subtype === 'Smoke' ? 'weed' : 'food')
      if (e.k === 'roll') for (const b of e.branches) walk(b.effects)
      if (e.k === 'ifTag' || e.k === 'ifCharacterActive') { walk(e.then); walk(e.else) }
    }
  }
  walk(def.effects)
  if (def.activated) walk(def.activated.effects)
  return moved
}

function statsMoved(def) {
  const moved = new Set()
  for (const m of def.equipMods ?? []) if (m.amount) moved.add(m.stat)
  const walk = (list) => {
    for (const e of list ?? []) {
      if (e.k === 'statMod') moved.add(e.stat)
      if (e.k === 'swapStats') { moved.add('attack'); moved.add('defense') }
      if (e.k === 'roll') for (const b of e.branches) walk(b.effects)
      if (e.k === 'ifTag' || e.k === 'ifCharacterActive') { walk(e.then); walk(e.else) }
    }
  }
  walk(def.effects)
  if (def.activated) walk(def.activated.effects)
  return moved
}

function verbsUsed(def) {
  const v = new Set()
  const walk = (list) => {
    for (const e of list ?? []) {
      v.add(e.k)
      // A minigame you play for damage deals damage; the stake is where it
      // lives rather than a damage effect sitting next to it.
      if (e.k === 'startMinigame' && e.stake?.kind === 'damage') v.add('damage')
      if (e.k === 'startMinigame' && e.stake?.kind === 'draw') v.add('draw')
      if (e.k === 'roll') for (const b of e.branches) walk(b.effects)
      if (e.k === 'ifTag' || e.k === 'ifCharacterActive') { walk(e.then); walk(e.else) }
    }
  }
  walk(def.effects)
  if (def.activated) walk(def.activated.effects)
  return v
}

// ---- Stuff -----------------------------------------------------------------

for (const d of STUFF) {
  if (HARDCODED.has(d.name)) continue
  const text = `${d.text ?? ''} ${d.activated?.text ?? ''}`
  const moved = limitsMoved(d)
  const stats = statsMoved(d)
  const verbs = verbsUsed(d)

  for (const { track, re } of TRACKS) {
    if (re.test(text) && !moved.has(track)) {
      // "No Alcohol" and "clears 1 Alcohol" are claims about NOT moving it, or
      // moving it down, and both are honest with an empty limitGain only when
      // an effect does the clearing.
      const denies = new RegExp(`no ${track}|not ${track}|clears? \\\\d* ?${track}`, 'i').test(text)
      if (!denies) add(d.name, `text mentions ${track} but nothing moves the ${track} track`)
    }
  }
  // "ignoring Defense" and "Defense will not save them" are statements about
  // bypassing a stat, not about changing one.
  const bypass = /ignor\w* defense|defense (will not|does not|is not)/i.test(text)
  for (const stat of ['attack', 'defense']) {
    const re = new RegExp(`[+-]\\d+ ${stat}|\\b${stat}\\b`, 'i')
    if (re.test(text) && !stats.has(stat) && !(stat === 'defense' && bypass)) {
      add(d.name, `text mentions ${stat} but nothing changes ${stat}`)
    }
  }
  if (/\bheal|\brestore|\bhealth back/i.test(text) && !verbs.has('heal')) {
    add(d.name, 'text promises healing but there is no heal effect')
  }
  if (/\bdamage\b|\bdeal \d/i.test(text) && !verbs.has('damage')) {
    add(d.name, 'text promises damage but there is no damage effect')
  }
  if (/\bdraw\b/i.test(text) && !verbs.has('draw')) {
    add(d.name, 'text promises a draw but there is no draw effect')
  }
  if (!d.effects?.length && !d.activated && !d.equipMods?.length && !Object.keys(d.limitGain ?? {}).length && d.subtype !== 'Food') {
    add(d.name, 'does nothing at all')
  }
}

// ---- Affairs ---------------------------------------------------------------

for (const a of AFFAIRS) {
  const moved = limitsMoved(a)
  const stats = statsMoved(a)
  const verbs = verbsUsed(a)
  for (const { track, re } of TRACKS) {
    if (re.test(a.text) && !moved.has(track)) {
      const denies = new RegExp(`clears? \\\\d* ?${track}`, 'i').test(a.text)
      if (!denies) add(a.name, `text mentions ${track} but nothing moves the ${track} track`)
    }
  }
  for (const stat of ['attack', 'defense']) {
    if (new RegExp(`\\\\b${stat}\\\\b`, 'i').test(a.text) && !stats.has(stat)) {
      add(a.name, `text mentions ${stat} but nothing changes ${stat}`)
    }
  }
  if (/\bdraws?\b/i.test(a.text) && !verbs.has('draw')) add(a.name, 'text promises a draw but there is no draw effect')
  if (/\bdiscards?\b/i.test(a.text) && !verbs.has('discard')) add(a.name, 'text promises a discard but there is no discard effect')
  if (/\bdamage\b/i.test(a.text) && !verbs.has('damage')) add(a.name, 'text promises damage but there is no damage effect')
  if (!a.effects?.length) add(a.name, 'does nothing at all')
}

// ---- Character abilities ---------------------------------------------------

for (const c of CHARACTERS) {
  for (const [label, ab] of [['ability', c.ability], ['powerMove', c.powerMove]]) {
    if (!ab) continue
    const fake = { effects: ab.effects, text: ab.text }
    const moved = limitsMoved(fake)
    const stats = statsMoved(fake)
    const verbs = verbsUsed(fake)
    for (const { track, re } of TRACKS) {
      if (re.test(ab.text) && !moved.has(track)) {
        // "Choose a Stoned ally" is a requirement, not a change to anybody's
        // meter. Same for "requires Food 2+".
        const denies = new RegExp(`clears? \\d* ?${track}|requires|\\ban? \\w+ ally\\b|no ${track}`, 'i').test(ab.text)
        if (!denies && !ab.requiresLimit?.[track]) {
          add(`${c.name} / ${ab.name}`, `${label} text mentions ${track} but nothing moves it`)
        }
      }
    }
    for (const stat of ['attack', 'defense']) {
      if (new RegExp(`\\\\b${stat}\\\\b`, 'i').test(ab.text) && !stats.has(stat)) {
        add(`${c.name} / ${ab.name}`, `${label} text mentions ${stat} but nothing changes it`)
      }
    }
    if (/\bheal\b/i.test(ab.text) && !verbs.has('heal')) add(`${c.name} / ${ab.name}`, 'promises healing, has no heal')
    if (/\bdamage\b|\bdeal \d/i.test(ab.text) && !verbs.has('damage')) add(`${c.name} / ${ab.name}`, 'promises damage, has no damage')
    if (/\bdraw\b/i.test(ab.text) && !verbs.has('draw')) add(`${c.name} / ${ab.name}`, 'promises a draw, has no draw')
  }
}

if (!issues.length) {
  console.log('Every card does what it says.')
  process.exit(0)
}
console.log(`${issues.length} card${issues.length === 1 ? '' : 's'} say something the data does not do:\n`)
for (const i of issues) console.log(`  ${i.card.padEnd(34)} ${i.msg}`)
process.exit(1)
