import type { GameState, Intent, PlayerId } from '../engine/types'

/**
 * Tic tac toe, played for real between two players at the table.
 * Everything else is blocked until it resolves, so it stays short by design.
 */
export function Minigame({
  state, you, send,
}: {
  state: GameState
  you: PlayerId
  send: (i: Intent) => void
}) {
  const mg = state.minigame
  if (!mg || mg.done) return null

  const [a, b] = mg.players
  const myIndex = mg.players.indexOf(you)
  const myTurn = myIndex >= 0 && mg.turn === myIndex
  const nameOf = (p: PlayerId) => state.playerState[p]?.name ?? p

  return (
    <div className="sheet-bg mg-bg">
      <div className="mg">
        <span className="mg-kicker">Settle it</span>
        <h2>Tic Tac Toe</h2>
        <p className="mg-stake">{mg.prompt}</p>

        <div className="mg-players">
          <span className={mg.turn === 0 ? 'on' : ''}><b>✕</b> {nameOf(a)}</span>
          <span className={mg.turn === 1 ? 'on' : ''}><b>◯</b> {nameOf(b)}</span>
        </div>

        <div className="mg-grid">
          {mg.board.map((cell, i) => (
            <button
              key={i}
              className={`mg-cell ${cell === 0 ? 'x' : cell === 1 ? 'o' : ''}`}
              disabled={!myTurn || cell !== null}
              onClick={() => send({ k: 'minigameMove', cell: i })}
              aria-label={`Square ${i + 1}`}
            >
              {cell === 0 ? '✕' : cell === 1 ? '◯' : ''}
            </button>
          ))}
        </div>

        <p className="mg-turn">
          {myTurn ? 'Your move' : `${nameOf(mg.players[mg.turn])} is thinking…`}
        </p>
      </div>
    </div>
  )
}
