import { createGame, applyIntent } from '../engine/state'
import { botIntent } from './bot'
import type { GameState } from '../engine/types'

// Where does Clout actually come from, and who is scoring it when?

const N = Number(process.env.GAMES ?? 120)
const PLAYERS = Number(process.env.PLAYERS ?? 6)

const sources = new Map<string, number>()
const cloutBySeat = new Array(PLAYERS).fill(0)
const koBySeat = new Array(PLAYERS).fill(0)
let crosserWon = 0, finished = 0
let turnsBeforeFirstKO: number[] = []

for (let g = 0; g < N; g++) {
  let state: GameState = createGame(
    Array.from({ length: PLAYERS }, (_, i) => ({ id: `p${i}`, name: `P${i + 1}` })),
    { seed: 5000 + g * 6733, cloutToWin: 10 },
  )
  let guard = 0
  let firstKOturn = -1
  let turns = 0

  while (state.phase !== 'gameover' && guard++ < 40000) {
    const actor = state.minigame && !state.minigame.done
      ? state.minigame.players[state.minigame.turn]
      : state.battle
        ? state.players.find((p) => !state.battle!.passed.includes(p))
        : state.turnOrder[state.turnIndex]
    if (!actor) break
    const intent = botIntent(state, actor)
    if (!intent) break
    const res = applyIntent(state, actor, intent)
    if (res.error) {
      const f = applyIntent(state, state.turnOrder[state.turnIndex], { k: 'endTurn' })
      if (f.error) break
      state = f.state; turns++
      continue
    }
    state = res.state
    if (intent.k === 'endTurn') turns++
    if (firstKOturn < 0 && state.log.some((l) => l.text.includes("is KO'd"))) firstKOturn = turns
  }

  if (firstKOturn >= 0) turnsBeforeFirstKO.push(firstKOturn)

  state.players.forEach((p, seat) => {
    const b = state.cloutSources[p]
    sources.set('COMBAT (KO)', (sources.get('COMBAT (KO)') ?? 0) + b.combat)
    sources.set('ACHIEVEMENTS', (sources.get('ACHIEVEMENTS') ?? 0) + b.achievement)
    sources.set('CARD EFFECTS', (sources.get('CARD EFFECTS') ?? 0) + b.other)
    cloutBySeat[seat] += b.combat + b.achievement + b.other
    koBySeat[seat] += b.combat
  })

  if (state.winner) {
    finished++
    if (state.reachedThreshold[0] === state.winner) crosserWon++
  }
}

const total = [...sources.values()].reduce((a, b) => a + b, 0)
const combat = [...sources.entries()].filter(([k]) => k.startsWith('COMBAT')).reduce((a, [, v]) => a + v, 0)

console.log(`\n=== CLOUT SOURCE DIAGNOSTIC (${N} games, ${PLAYERS}P) ===\n`)
console.log(`Total Clout awarded:  ${total}`)
console.log(`From combat (KOs):    ${combat}  (${((combat / total) * 100).toFixed(1)}%)   <- §2 says this should dominate`)
console.log(`From achievements:    ${total - combat}  (${(((total - combat) / total) * 100).toFixed(1)}%)`)
console.log(`\nFirst KO happens on turn: median ${turnsBeforeFirstKO.sort((a, b) => a - b)[Math.floor(turnsBeforeFirstKO.length / 2)]}`)
console.log(`Threshold-crosser went on to win: ${((crosserWon / finished) * 100).toFixed(1)}%`)

console.log(`\nClout earned per seat:`)
cloutBySeat.forEach((c, i) => console.log(`  Seat ${i + 1}: ${(c / N).toFixed(2)} total   KOs ${(koBySeat[i] / N).toFixed(2)}`))

console.log(`\nTop Clout sources:`)
;[...sources.entries()].sort((a, b) => b[1] - a[1]).slice(0, 16)
  .forEach(([k, v]) => console.log(`  ${((v / total) * 100).toFixed(1).padStart(5)}%  ${(v / N).toFixed(2).padStart(6)}/game  ${k}`))
console.log('')
