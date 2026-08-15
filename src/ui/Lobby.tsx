import { useState } from 'react'
import type { RoomView } from '../net/room'
import { defaultCloutToWin } from '../engine/state'
import { deckSummary } from '../engine/cards/deck'

export function Lobby({
  view, onHost, onJoin, onStart, onLocal, busy,
}: {
  view: RoomView
  onHost: (name: string) => void
  onJoin: (code: string, name: string) => void
  onStart: (cloutToWin: number, useKitchenTable: boolean) => void
  onLocal: (names: string[], cloutToWin: number, useKitchenTable: boolean) => void
  busy: boolean
}) {
  const [localCount, setLocalCount] = useState(4)
  const [name, setName] = useState(() => localStorage.getItem('fa.name') ?? '')
  const [code, setCode] = useState('')
  const [screen, setScreen] = useState<'home' | 'join' | 'local'>('home')
  const [kitchen, setKitchen] = useState(false)
  const [cloutOverride, setCloutOverride] = useState<number | null>(null)

  const remember = (n: string) => { setName(n); localStorage.setItem('fa.name', n) }
  const inRoom = view.status === 'connected' && !!view.code
  const isHost = view.role === 'host'
  const count = view.lobby.length
  const suggested = defaultCloutToWin(Math.max(2, count))
  const clout = cloutOverride ?? suggested

  // ------------------------------------------------------------ in a room --
  if (inRoom) {
    return (
      <div className="lobby">
        <div>
          <span className="field-label">Room code — everyone types this in</span>
          <div className="card-panel">
            <div className="roomcode">{view.code}</div>
            <button
              className="btn ghost sm"
              style={{ margin: '6px auto 0' }}
              onClick={() => navigator.clipboard?.writeText(view.code)}
            >Copy code</button>
          </div>
        </div>

        <div className="card-panel">
          <span className="field-label">Family ({count}/6)</span>
          {view.lobby.map((p) => (
            <div className="player-row" key={p.id}>
              <i className={`dot ${p.connected ? '' : 'off'}`} />
              <span>{p.name}</span>
              {p.isHost && <span className="pill">HOST</span>}
              {p.id === view.you && <span className="pill">YOU</span>}
            </div>
          ))}
          {count < 2 && <div className="lobby-tag" style={{ marginTop: 8 }}>Waiting for at least one more player…</div>}
        </div>

        {isHost ? (
          <>
            <div className="card-panel">
              <span className="field-label">Clout to win</span>
              <div className="seg">
                {[5, 7, 8, 10, 15].map((c) => (
                  <button key={c} aria-pressed={clout === c} onClick={() => setCloutOverride(c)}>{c}</button>
                ))}
              </div>
              <div className="lobby-tag" style={{ marginTop: 8 }}>
                {cloutOverride == null
                  ? `${suggested} is tuned for ${count} player${count === 1 ? '' : 's'} — about 30-40 minutes.`
                  : `Recommended for ${count} players: ${suggested}.`}
              </div>
            </div>

            <div className="card-panel">
              <span className="field-label">Kitchen Table (optional rule §42)</span>
              <div className="seg">
                <button aria-pressed={!kitchen} onClick={() => setKitchen(false)}>Off</button>
                <button aria-pressed={kitchen} onClick={() => setKitchen(true)}>On</button>
              </div>
              <div className="lobby-tag" style={{ marginTop: 8 }}>
                Three cards face-up in the middle. On your draw you may take one instead of drawing blind.
              </div>
            </div>

            <button className="btn gold" disabled={count < 2 || busy} onClick={() => onStart(clout, kitchen)}>
              Start the Family Affair
            </button>
          </>
        ) : (
          <div className="lobby-tag">Waiting for the host to start…</div>
        )}

        <div className="warn">
          Heads up: the host's device runs the game. If they close this tab, the game ends for everyone.
        </div>
        {view.error && <div className="err">{view.error}</div>}
      </div>
    )
  }

  // ---------------------------------------------------------------- entry --
  const deck = deckSummary(4)
  return (
    <div className="lobby">
      <div className="brand">
        <span className="b1">FAMILY<br />AFFAIRS</span>
        <span className="b2">BAKE IT · TAKE IT · FEED IT</span>
      </div>
      <div className="lobby-tag">
        Build a ridiculous family, feed them, get them drunk, and fight everyone else's family.
        2–6 players on separate phones. {deck.total} cards, {deck.affairs} Family Affairs.
      </div>

      <div className="card-panel">
        <span className="field-label">Your name</span>
        <input
          type="text" value={name} placeholder="Who are you?"
          maxLength={16} onChange={(e) => remember(e.target.value)}
        />
      </div>

      {screen === 'home' ? (
        <>
          <button className="btn" disabled={!name.trim() || busy} onClick={() => onHost(name.trim())}>
            {busy ? 'Opening room…' : 'Host a game'}
          </button>
          <button className="btn ghost" disabled={!name.trim()} onClick={() => setScreen('join')}>
            Join with a code
          </button>
          <button className="btn ghost" data-testid="local-mode" onClick={() => setScreen('local')}>
            Pass and play on this device
          </button>
        </>
      ) : screen === 'local' ? (
        <>
          <div className="card-panel">
            <span className="field-label">How many players at this table?</span>
            <div className="seg">
              {[2, 3, 4, 5, 6].map((n) => (
                <button key={n} aria-pressed={localCount === n} onClick={() => setLocalCount(n)}>{n}</button>
              ))}
            </div>
            <div className="lobby-tag" style={{ marginTop: 8 }}>
              One device, passed around. First to {defaultCloutToWin(localCount)} Clout — about 30-40 minutes.
            </div>
          </div>
          <button
            className="btn gold" data-testid="start-local"
            onClick={() => onLocal(
              Array.from({ length: localCount }, (_, i) => `Player ${i + 1}`),
              defaultCloutToWin(localCount), false,
            )}
          >Start pass-and-play</button>
          <button className="btn ghost" onClick={() => setScreen('home')}>Back</button>
        </>
      ) : (
        <>
          <div className="card-panel">
            <span className="field-label">Room code</span>
            <input
              type="text" className="code-input" value={code} placeholder="ABCD" maxLength={4}
              autoCapitalize="characters" autoCorrect="off"
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            />
          </div>
          <button className="btn" disabled={code.length < 4 || busy} onClick={() => onJoin(code, name.trim())}>
            {busy ? 'Connecting…' : 'Join game'}
          </button>
          <button className="btn ghost" onClick={() => setScreen('home')}>Back</button>
        </>
      )}

      {view.error && <div className="err">{view.error}</div>}

      <div className="lobby-tag" style={{ marginTop: 'auto', paddingTop: 12 }}>
        Everyone plays on their own device. One person hosts and shares the 4-letter code.
        Add this page to your home screen to play it like an app.
      </div>
    </div>
  )
}
