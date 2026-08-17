// Do the Limit tracks ever get to matter before somebody dies?
//
// Jay's report from a real game: most Characters are knocked out before Drunk,
// High or Stuffed does anything. That is a question with a number attached -
// the tier a Character was on when it went down, and the highest tier it ever
// reached at all - so measure it before touching a single card.
import { createGame, applyIntent, defaultCloutToWin } from '../engine/state'
import { botIntent } from './bot'
import { limitTier } from '../engine/selectors'
import type { GameState, CharacterInstance } from '../engine/types'

const GAMES = Number(process.env.GAMES ?? 60)
const PLAYERS = Number(process.env.PLAYERS ?? 4)
const TRACKS = ['alcohol', 'weed', 'food'] as const

const peak = new Map<string, number>()          // best tier any track ever hit
const peakBy: Record<string, number[]> = { alcohol: [], weed: [], food: [] }
const atKo: number[] = []
let kos = 0, everActive = 0
let roundsToFirstTier2 = 0, gamesWithTier2 = 0

function best(ch: CharacterInstance) {
  return Math.max(...TRACKS.map((t) => limitTier(ch, t)))
}

for (let g = 0; g < GAMES; g++) {
  const players = Array.from({ length: PLAYERS }, (_, i) => ({ id: `p${i}`, name: `P${i + 1}` }))
  let state: GameState = createGame(players, { seed: g * 6151 + 3, cloutToWin: defaultCloutToWin(PLAYERS) })
  const seenAlive = new Set<string>()
  const lives = new Map<string, number>()
  let firstTier2 = 0

  for (let step = 0; step < 40000 && state.phase !== 'gameover'; step++) {
    const actor = state.minigame && !state.minigame.done
      ? state.minigame.players[state.minigame.turn]
      : state.battle
        ? state.players.find((p) => !state.battle!.passed.includes(p))
        : state.turnOrder[state.turnIndex]
    if (!actor) break

    for (const ch of Object.values(state.characters)) {
      if (ch.zone === 'bench' || !ch.slot === null) { /* counted below */ }
      if (ch.zone === 'active' && ch.hp > 0) {
        seenAlive.add(ch.iid)
        const b = best(ch)
        // Per life, not per Character: a KO wipes the meters, so counting a
        // whole game as one run says every Character gets Wasted eventually
        // while every individual life is spent stone cold sober.
        const key = `${ch.iid}#${lives.get(ch.iid) ?? 0}`
        peak.set(key, Math.max(peak.get(key) ?? 0, b))
        if (b >= 2 && !firstTier2) firstTier2 = state.round
      }
    }

    // KO clears the meters, so a reading taken afterwards always says Sober.
    // Snapshot before the intent resolves or the answer is a tautology.
    const before = new Map(Object.values(state.characters).map((c) => [c.iid, { hp: c.hp, tier: best(c) }]))
    const intent = botIntent(state, actor)
    if (!intent) break
    const res = applyIntent(state, actor, intent)
    if (res.error) {
      const forced = applyIntent(state, state.turnOrder[state.turnIndex], { k: 'endTurn' })
      if (forced.error) break
      state = forced.state
      continue
    }
    state = res.state
    // Anything that just hit zero: what was it carrying when it went down?
    for (const ch of Object.values(state.characters)) {
      const b = before.get(ch.iid)
      if (ch.hp <= 0 && b && b.hp > 0) {
        atKo.push(b.tier); kos++
        lives.set(ch.iid, (lives.get(ch.iid) ?? 0) + 1)
      }
    }
  }

  everActive += seenAlive.size
  for (const iid of seenAlive) {
    const ch = state.characters[iid]
    if (!ch) continue
    for (const t of TRACKS) peakBy[t].push(limitTier(ch, t))
  }
  if (firstTier2) { gamesWithTier2++; roundsToFirstTier2 += firstTier2 }
}

const pct = (n: number, d: number) => `${((n / d) * 100).toFixed(1)}%`
const hist = (xs: number[]) => [0, 1, 2, 3].map((t) => `t${t} ${pct(xs.filter((x) => x === t).length, xs.length)}`).join('  ')

const peaks = [...peak.values()]
console.log(`${GAMES} games, ${PLAYERS} players, ${everActive} Characters that were ever on a field.\n`)
console.log('Highest tier a Character reached on its best track, per life:')
console.log('  ' + hist(peaks))
console.log(`  never got past Sober/Clear/Hungry on anything: ${pct(peaks.filter((p) => p === 0).length, peaks.length)}`)
console.log(`  reached the tier where the curves actually bite (2+): ${pct(peaks.filter((p) => p >= 2).length, peaks.length)}\n`)
console.log(`What ${kos} knocked-out Characters were carrying when they went down:`)
console.log('  ' + hist(atKo))
console.log(`\nFinal tier per track, over every Character that was ever on a field:`)
for (const t of TRACKS) console.log(`  ${t.padEnd(8)} ${hist(peakBy[t])}`)
console.log(`\nFirst time anybody hit tier 2 in a game: Round ${(roundsToFirstTier2 / Math.max(1, gamesWithTier2)).toFixed(1)} (${gamesWithTier2}/${GAMES} games ever got there)`)
