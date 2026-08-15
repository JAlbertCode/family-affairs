import { createGame, applyIntent } from '../engine/state'
import { botIntent } from './bot'
import type { GameState } from '../engine/types'

// §60 says the 10-Clout threshold is a starting point, not a finished rule.
// This sweeps it against player count to find a default that lands the game
// inside the 30-60 minute target from the design brief.

const SECONDS_PER_TURN = 20 // a tap-to-act digital turn, including interference

function run(players: number, clout: number, seed: number) {
  let state: GameState = createGame(
    Array.from({ length: players }, (_, i) => ({ id: `p${i}`, name: `P${i + 1}` })),
    { seed, cloutToWin: clout },
  )
  let guard = 0, turns = 0
  while (state.phase !== 'gameover' && guard++ < 40000) {
    const actor = state.battle
      ? state.players.find((p) => !state.battle!.passed.includes(p))
      : state.turnOrder[state.turnIndex]
    if (!actor) break
    const intent = botIntent(state, actor)
    if (!intent) break
    const res = applyIntent(state, actor, intent)
    if (res.error) {
      const f = applyIntent(state, state.turnOrder[state.turnIndex], { k: 'endTurn' })
      if (f.error) break
      state = f.state; turns++; continue
    }
    state = res.state
    if (intent.k === 'endTurn') turns++
  }
  return { turns, rounds: state.round, done: !!state.winner }
}

const N = Number(process.env.GAMES ?? 60)
console.log('\n=== CLOUT THRESHOLD SWEEP ===')
console.log(`${N} games per cell, ~${SECONDS_PER_TURN}s per turn. Target: 30-60 min.\n`)
console.log('players  clout   rounds   turns    est.min   in-target')
console.log('-------  -----   ------   -----    -------   ---------')

for (const players of [2, 4, 6]) {
  for (const clout of [5, 6, 7, 8, 10]) {
    const rs = Array.from({ length: N }, (_, i) => run(players, clout, 3000 + i * 4801))
    const done = rs.filter((r) => r.done).length
    const med = (arr: number[]) => arr.sort((a, b) => a - b)[Math.floor(arr.length / 2)]
    const turns = med(rs.map((r) => r.turns))
    const rounds = med(rs.map((r) => r.rounds))
    const mins = Math.round((turns * SECONDS_PER_TURN) / 60)
    const ok = mins >= 25 && mins <= 60 && done === rs.length
    console.log(
      `${String(players).padStart(7)}  ${String(clout).padStart(5)}   ${String(rounds).padStart(6)}   ${String(turns).padStart(5)}    ${String(mins).padStart(7)}   ${ok ? '  YES  <<' : ''}`,
    )
  }
  console.log('')
}
