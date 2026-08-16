import { createGame, applyIntent, defaultCloutToWin } from '../engine/state'
import { botIntent } from './bot'
import type { GameState } from '../engine/types'
import { getCharacterDef } from '../engine/cards/deck'
import { deckSummary } from '../engine/cards/deck'

// ---------------------------------------------------------------------------
// Balance harness. Runs N full games of bots and reports the numbers §60 says
// still need playtesting: game length, Clout pacing, win rates, KO counts.
// ---------------------------------------------------------------------------

interface GameResult {
  rounds: number
  turns: number
  winner: string | null
  cloutSpread: number[]
  kos: number
  charAppearances: Record<string, number>
  charWins: Record<string, number>
  errors: string[]
}

function runOne(playerCount: number, seed: number, cloutToWin: number): GameResult {
  const players = Array.from({ length: playerCount }, (_, i) => ({ id: `p${i}`, name: `P${i + 1}` }))
  let state: GameState = createGame(players, { seed, cloutToWin })
  const errors: string[] = []
  let turns = 0
  let guard = 0

  while (state.phase !== 'gameover' && guard < 40000) {
    guard++
    const actor = state.minigame && !state.minigame.done
      ? state.minigame.players[state.minigame.turn]
      : state.battle
        ? state.players.find((p) => !state.battle!.passed.includes(p))
        : state.turnOrder[state.turnIndex]
    if (!actor) break

    const intent = botIntent(state, actor)
    if (!intent) break

    const before = state.tick
    const res = applyIntent(state, actor, intent)
    if (res.error) {
      errors.push(`${intent.k}: ${res.error}`)
      // bail out of a stuck turn
      const forced = applyIntent(state, state.turnOrder[state.turnIndex], { k: 'endTurn' })
      if (forced.error) break
      state = forced.state
      turns++
      continue
    }
    state = res.state
    if (intent.k === 'endTurn') turns++
    if (state.tick === before && intent.k !== 'passInterference') { /* no-op guard */ }
  }

  const charAppearances: Record<string, number> = {}
  const charWins: Record<string, number> = {}
  for (const ch of Object.values(state.characters)) {
    if (!ch.owner) continue
    const name = getCharacterDef(ch.defId).name
    charAppearances[name] = (charAppearances[name] ?? 0) + 1
    if (ch.owner === state.winner) charWins[name] = (charWins[name] ?? 0) + 1
  }

  return {
    rounds: state.round,
    turns,
    winner: state.winner,
    cloutSpread: state.players.map((p) => state.playerState[p].clout),
    kos: state.log.filter((l) => l.text.includes("is KO'd")).length,
    charAppearances,
    charWins,
    errors,
  }
}

function main() {
  const N = Number(process.env.GAMES ?? 200)
  const PLAYERS = Number(process.env.PLAYERS ?? 6)
  // Default to what the lobby actually gives players. Hard-coding 10 here meant
  // the balance numbers described a game nobody was going to play.
  const CLOUT = Number(process.env.CLOUT ?? defaultCloutToWin(PLAYERS))

  console.log(`\n=== FAMILY AFFAIRS BALANCE SIM ===`)
  const ds = deckSummary(PLAYERS)
  console.log(`Deck for ${PLAYERS}P: ${ds.total} cards`, ds.counts, `| ${ds.affairs} Family Affairs`)
  console.log(`Running ${N} games, ${PLAYERS} players, first to ${CLOUT} Clout...\n`)

  const results: GameResult[] = []
  const allErrors = new Map<string, number>()
  for (let i = 0; i < N; i++) {
    const r = runOne(PLAYERS, 1000 + i * 7919, CLOUT)
    results.push(r)
    for (const e of r.errors) allErrors.set(e, (allErrors.get(e) ?? 0) + 1)
  }

  const finished = results.filter((r) => r.winner)
  const rounds = results.map((r) => r.rounds).sort((a, b) => a - b)
  const turns = results.map((r) => r.turns).sort((a, b) => a - b)
  const q = (arr: number[], p: number) => arr[Math.floor(arr.length * p)] ?? 0
  const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / (arr.length || 1)

  console.log(`Completed:     ${finished.length}/${N} games reached a winner`)
  console.log(`Rounds:        median ${q(rounds, 0.5)}  p10 ${q(rounds, 0.1)}  p90 ${q(rounds, 0.9)}  max ${rounds[rounds.length - 1]}`)
  console.log(`Total turns:   median ${q(turns, 0.5)}`)
  console.log(`Est. length:   ~${Math.round(mean(rounds) * PLAYERS * 0.5)} min at 30s/turn`)
  console.log(`KOs per game:  ${mean(results.map((r) => r.kos)).toFixed(1)}`)

  // seat fairness - with fair rules every seat should win ~1/PLAYERS of the time
  const seatWins = new Array(PLAYERS).fill(0)
  for (const r of finished) {
    const idx = Number(r.winner!.slice(1))
    seatWins[idx]++
  }
  console.log(`\nSeat win rate (expect ${(100 / PLAYERS).toFixed(1)}% each):`)
  seatWins.forEach((w, i) => {
    const pct = (w / (finished.length || 1)) * 100
    console.log(`  Seat ${i + 1}: ${pct.toFixed(1)}%  ${'#'.repeat(Math.round(pct))}`)
  })

  // character strength - win rate when recruited
  const app: Record<string, number> = {}
  const win: Record<string, number> = {}
  for (const r of results) {
    for (const [k, v] of Object.entries(r.charAppearances)) app[k] = (app[k] ?? 0) + v
    for (const [k, v] of Object.entries(r.charWins)) win[k] = (win[k] ?? 0) + v
  }
  console.log(`\nCharacter win-share when in play (expect ~${(100 / PLAYERS).toFixed(0)}%):`)
  Object.keys(app)
    .map((k) => ({ k, rate: ((win[k] ?? 0) / app[k]) * 100, n: app[k] }))
    .sort((a, b) => b.rate - a.rate)
    .forEach((c) => {
      const flag = c.rate > 100 / PLAYERS + 8 ? '  << strong' : c.rate < 100 / PLAYERS - 8 ? '  << weak' : ''
      console.log(`  ${c.k.padEnd(16)} ${c.rate.toFixed(1)}%  (n=${c.n})${flag}`)
    })

  if (allErrors.size) {
    console.log(`\nRejected intents (bot tried something illegal - expected, but check for engine bugs):`)
    ;[...allErrors.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)
      .forEach(([e, n]) => console.log(`  ${n.toString().padStart(5)}x  ${e}`))
  }
  console.log('')
}

main()
