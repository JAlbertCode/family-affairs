// Does this card do anything WHEN IT IS PLAYED?
//
// `impact.ts` reads the card definitions and asks whether there are effects at
// all. This asks the harder question: it plays thousands of real cards in real
// games and watches the game state either side of each one. A card can pass
// every static check and still resolve to nothing - a target scope that finds
// nobody, a branch that never fires, a status the target already had, a heal on
// somebody at full health every single time.
//
// A card reported here was played and changed nothing, every time. That is
// either a bug or a card that needs a fallback, and neither is visible any
// other way.
import { createGame, applyIntent, defaultCloutToWin } from '../engine/state'
import { botIntent } from './bot'
import { getAnyDef } from '../engine/cards/deck'
import { STUFF } from '../engine/cards/stuff'
import { AFFAIRS } from '../engine/cards/affairs'
import { CHARACTERS } from '../engine/cards/characters'
import type { GameState } from '../engine/types'

const GAMES = Number(process.env.GAMES ?? 120)
const PLAYERS = Number(process.env.PLAYERS ?? 5)

/** Everything a card could plausibly move, flattened to a comparable string. */
function fingerprint(s: GameState): string {
  const chars = Object.values(s.characters).map((c) =>
    `${c.iid}:${c.hp}:${c.zone}:${c.slot}:${c.limits.alcohol},${c.limits.weed},${c.limits.food}`
    + `:${c.statuses.map((x) => x.name + x.duration).sort().join('|')}`
    + `:${c.mods.map((m) => m.stat + m.amount + m.duration).sort().join('|')}`
    + `:${[...c.attached].sort().join('|')}`
    + `:${Object.entries(c.scratch).map(([k, v]) => k + String(v)).sort().join('|')}`
    + `:${Object.entries(c.cooldowns).map(([k, v]) => k + v).sort().join('|')}`,
  ).sort().join(';')
  const players = s.players.map((p) => {
    const ps = s.playerState[p]
    return `${p}:${ps.clout}:${ps.hand.length}:${ps.actionsLeft}:${ps.field.join(',')}:${ps.bench.join(',')}`
  }).join(';')
  return `${chars}#${players}#${s.familyDiscard.length}#${s.battle ? 'B' : ''}${s.minigame ? 'M' : ''}`
}

const played = new Map<string, number>()
const inert = new Map<string, number>()

function note(id: string, before: string, after: string) {
  played.set(id, (played.get(id) ?? 0) + 1)
  if (before === after) inert.set(id, (inert.get(id) ?? 0) + 1)
}

for (let g = 0; g < GAMES; g++) {
  const players = Array.from({ length: PLAYERS }, (_, i) => ({ id: `p${i}`, name: `P${i + 1}` }))
  let state: GameState = createGame(players, { seed: g * 15485863 + 7, cloutToWin: defaultCloutToWin(PLAYERS) })
  let affair = state.currentAffair

  for (let step = 0; step < 40000 && state.phase !== 'gameover'; step++) {
    const actor = state.minigame && !state.minigame.done
      ? state.minigame.players[state.minigame.turn]
      : state.battle
        ? state.players.find((p) => !state.battle!.passed.includes(p))
        : state.turnOrder[state.turnIndex]
    if (!actor) break

    const intent = botIntent(state, actor)
    if (!intent) break

    // What card, if any, is this intent about?
    let card: string | null = null
    if (intent.k === 'playCard' || intent.k === 'interfere') card = state.stuff[intent.iid]?.defId ?? state.characters[intent.iid]?.defId ?? null
    else if (intent.k === 'consume' || intent.k === 'useItem') card = state.stuff[intent.iid]?.defId ?? null
    else if (intent.k === 'useAbility') {
      const ch = state.characters[intent.char]
      const d = ch ? CHARACTERS.find((c) => c.id === ch.defId) : null
      const ab = d ? (intent.which === 'ability' ? d.ability : d.powerMove) : null
      card = ab ? `${d!.id}/${ab.name}` : null
    }

    // A Character card only ever "does" something by arriving, and arriving is
    // a board change the fingerprint already sees - but it is not a rules
    // effect, so recruiting is not an interesting answer to this question.
    if (card && state.characters[(intent as any).iid]) card = null

    const before = card ? fingerprint(state) : ''
    const res = applyIntent(state, actor, intent)
    if (res.error) {
      const forced = applyIntent(state, state.turnOrder[state.turnIndex], { k: 'endTurn' })
      if (forced.error) break
      state = forced.state
      continue
    }
    state = res.state
    if (card) note(card, before, fingerprint(state))

    // An Affair turns over between Rounds, outside any intent. Compare across
    // the reveal by watching the id change.
    if (state.currentAffair !== affair) {
      // The reveal has already happened by the time we see it, so the honest
      // measure is whether the log says it landed on anybody.
      const landed = state.log.slice(-6).some((l) => /lands on (\d+) Character/.test(l.text) && !/lands on nobody/.test(l.text))
      if (state.currentAffair) {
        const id = `AFFAIR:${state.currentAffair}`
        played.set(id, (played.get(id) ?? 0) + 1)
        if (!landed) inert.set(id, (inert.get(id) ?? 0) + 1)
      }
      affair = state.currentAffair
    }
  }
}

const rows: string[] = []
const never: string[] = []
const sometimes: string[] = []

for (const [id, n] of [...played.entries()].sort()) {
  const dead = inert.get(id) ?? 0
  const name = id.startsWith('AFFAIR:') ? AFFAIRS.find((a) => a.id === id.slice(7))?.name ?? id
    : id.includes('/') ? id
    : (() => { try { return getAnyDef(id).name } catch { return id } })()
  const share = dead / n
  if (n >= 5 && share === 1) never.push(`  ${String(name).padEnd(34)} played ${n}x, changed nothing every time`)
  else if (n >= 20 && share >= 0.5) sometimes.push(`  ${String(name).padEnd(34)} ${(share * 100).toFixed(0)}% of ${n} plays changed nothing`)
}

const seen = new Set(played.keys())
const unplayed = [
  ...STUFF.filter((s) => !seen.has(s.id)).map((s) => s.name),
  ...AFFAIRS.filter((a) => !seen.has(`AFFAIR:${a.id}`)).map((a) => a.name),
]

console.log(`${GAMES} games, ${PLAYERS} players. ${[...played.values()].reduce((a, b) => a + b, 0)} card resolutions watched.\n`)
if (never.length) { console.log('DID NOTHING, EVERY TIME:'); never.forEach((r) => console.log(r)); console.log('') }
if (sometimes.length) { console.log('DID NOTHING MORE THAN HALF THE TIME:'); sometimes.forEach((r) => console.log(r)); console.log('') }
if (unplayed.length) { console.log(`NEVER CAME UP (the bot may simply not play these): ${unplayed.length}`); console.log('  ' + unplayed.join(', ')); console.log('') }
if (!never.length && !sometimes.length) console.log('Every card that got played changed the game.')
if (never.length) process.exit(1)
