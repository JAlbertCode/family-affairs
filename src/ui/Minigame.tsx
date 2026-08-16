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

  if (mg.kind === 'rps') {
    const OPTIONS = [
      { i: 0, glyph: '✊', name: 'Rock' },
      { i: 1, glyph: '✋', name: 'Paper' },
      { i: 2, glyph: '✌️', name: 'Scissors' },
    ]
    return (
      <div className="sheet-bg mg-bg">
        <div className="mg">
          <span className="mg-kicker">Settle it</span>
          <h2>Shoot For It</h2>
          <p className="mg-stake">{mg.prompt}</p>
          {mg.ties > 0 && <p className="mg-tie">Draw {mg.ties} - go again</p>}

          <div className="mg-players">
            <span className={mg.turn === 0 ? 'on' : ''}>{nameOf(a)}{mg.picks[0] !== null && ' ✓'}</span>
            <span className={mg.turn === 1 ? 'on' : ''}>{nameOf(b)}{mg.picks[1] !== null && ' ✓'}</span>
          </div>

          <div className="mg-rps">
            {OPTIONS.map((o) => (
              <button key={o.i} className="mg-throw" disabled={!myTurn}
                onClick={() => send({ k: 'minigameMove', cell: o.i })}>
                <span>{o.glyph}</span><i>{o.name}</i>
              </button>
            ))}
          </div>

          <p className="mg-turn">
            {myTurn ? 'Throw' : `${nameOf(mg.players[mg.turn])} is choosing…`}
          </p>
        </div>
      </div>
    )
  }

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
