// How many cards a player actually has to choose between.
//
// Jay's report was that the hand ends up at one card, which turns every Turn
// into "draw a card, play that card". This measures it rather than arguing
// about it: hand size sampled at the moment a player is about to act.
import { createGame, applyIntent, defaultCloutToWin } from '../engine/state'
import { botIntent } from './bot'
import type { GameState } from '../engine/types'

const GAMES = Number(process.env.GAMES ?? 60)
const PLAYERS = Number(process.env.PLAYERS ?? 4)

const samples: number[] = []
let deckOuts = 0
let plays = 0, turns = 0, overLimit = 0

for (let g = 0; g < GAMES; g++) {
  const players = Array.from({ length: PLAYERS }, (_, i) => ({ id: `p${i}`, name: `P${i + 1}` }))
  let state: GameState = createGame(players, { seed: g * 7919 + 13, cloutToWin: defaultCloutToWin(PLAYERS) })
  for (let step = 0; step < 40000 && state.phase !== 'gameover'; step++) {
    const actor = state.minigame && !state.minigame.done
      ? state.minigame.players[state.minigame.turn]
      : state.battle
        ? state.players.find((p) => !state.battle!.passed.includes(p))
        : state.turnOrder[state.turnIndex]
    if (!actor) break
    if (state.phase === 'main' && !state.battle && !state.minigame) {
      samples.push(state.playerState[state.turnOrder[state.turnIndex]].hand.length)
    }
    const intent = botIntent(state, actor)
    if (!intent) break
    const res = applyIntent(state, actor, intent)
    if (res.error) {
      const forced = applyIntent(state, state.turnOrder[state.turnIndex], { k: 'endTurn' })
      if (forced.error) break
      state = forced.state
      continue
    }
    if (intent.k === 'playCard') plays++
    if (intent.k === 'endTurn') {
      turns++
      if (state.playerState[actor].hand.length > 7) overLimit++
    }
    state = res.state
  }
  if (state.familyDeck.length === 0 && state.familyDiscard.length === 0) deckOuts++
}

samples.sort((a, b) => a - b)
const at = (p: number) => samples[Math.floor(samples.length * p)]
const mean = samples.reduce((a, b) => a + b, 0) / samples.length
const atMostOne = samples.filter((n) => n <= 1).length / samples.length
console.log(`hand size when about to act, ${samples.length} samples over ${GAMES} games:`)
console.log(`  mean ${mean.toFixed(2)}   p10 ${at(0.1)}   median ${at(0.5)}   p90 ${at(0.9)}`)
console.log(`  nothing to choose between (<=1 card): ${(atMostOne * 100).toFixed(1)}%`)
console.log(`  games that ran the deck and discard dry: ${deckOuts}/${GAMES}`)
console.log(`  cards played per Turn: ${(plays / turns).toFixed(2)}`)
console.log(`  Turns ending over the hand limit: ${(overLimit / turns * 100).toFixed(1)}%`)
