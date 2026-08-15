import type { CardDef, DefId, StuffDef, CharacterDef, AffairDef } from '../types'
import { CHARACTERS, CHARACTERS_BY_ID } from './characters'
import { STUFF, STUFF_BY_ID } from './stuff'
import { AFFAIRS, AFFAIRS_BY_ID } from './affairs'

import { registerCharacterIds, registerStuffIds } from './schema'

export { CHARACTERS, STUFF, AFFAIRS, CHARACTERS_BY_ID, STUFF_BY_ID, AFFAIRS_BY_ID }

// Base-game Characters are always a legal target for character-locked stuff,
// including stuff that arrives later in a third-party pack.
registerCharacterIds(CHARACTERS.map((c) => c.id))
registerStuffIds(STUFF.map((s) => s.id))

export function getCharacterDef(id: DefId): CharacterDef {
  const d = CHARACTERS_BY_ID[id]
  if (!d) throw new Error(`unknown character def: ${id}`)
  return d
}

export function getStuffDef(id: DefId): StuffDef {
  const d = STUFF_BY_ID[id]
  if (!d) throw new Error(`unknown stuff def: ${id}`)
  return d
}

export function getAffairDef(id: DefId): AffairDef {
  const d = AFFAIRS_BY_ID[id]
  if (!d) throw new Error(`unknown affair def: ${id}`)
  return d
}

export function getAnyDef(id: DefId): CardDef {
  return CHARACTERS_BY_ID[id] ?? STUFF_BY_ID[id] ?? AFFAIRS_BY_ID[id]
}

/**
 * Family Deck composition (§50). The prototype list is tuned for 2-3 players;
 * for 4-6 we double it so a long six-handed game never decks out.
 */
export function buildFamilyDeckDefIds(playerCount: number): DefId[] {
  // The doubling here was set when there were ~30 kinds of Stuff and a six-
  // handed deck needed the bulk. There are far more kinds now, so variety comes
  // from the card list itself and doubling only buries the Characters: at 2x
  // they fell to 11% of the deck, KOs per game dropped, and because Clout comes
  // mostly from KOs the median six-player game stretched to about 90 minutes.
  const mult = 1
  // Characters are the point of the game; a table of six wants bodies to
  // recruit far more than it wants another copy of every utility card.
  const charCopies = playerCount <= 3 ? 2 : 3

  const out: DefId[] = []
  for (const c of CHARACTERS) {
    for (let i = 0; i < charCopies; i++) out.push(c.id)
  }
  for (const s of STUFF) {
    for (let i = 0; i < s.copies * mult; i++) out.push(s.id)
  }
  return out
}

export function buildAffairsDeckDefIds(): DefId[] {
  return AFFAIRS.map((a) => a.id)
}

/** Deck stats for the rules screen. */
export function deckSummary(playerCount: number) {
  const ids = buildFamilyDeckDefIds(playerCount)
  const counts: Record<string, number> = {}
  for (const id of ids) {
    const def = getAnyDef(id)
    const key = def.kind === 'character' ? 'Character' : (def as StuffDef).subtype
    counts[key] = (counts[key] ?? 0) + 1
  }
  return { total: ids.length, counts, affairs: AFFAIRS.length }
}
