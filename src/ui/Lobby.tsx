import { useState } from 'react'
import { hasTurn } from '../net/config'
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
  const [localNames, setLocalNames] = useState<string[]>([])
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
                  ? `${suggested} is tuned for ${count} player${count === 1 ? '' : 's'} — about 45 minutes.`
                  : `Recommended for ${count} players: ${suggested}.`}
              </div>
            </div>

            <div className="card-panel">
              <span className="field-label">Shared card row</span>
              <div className="seg">
                <button aria-pressed={!kitchen} onClick={() => setKitchen(false)}>Off</button>
                <button aria-pressed={kitchen} onClick={() => setKitchen(true)}>On</button>
              </div>
              <div className="lobby-tag" style={{ marginTop: 8 }}>
                Puts three cards face-up in the middle. On your turn you can take one of those
                instead of drawing blind — so everyone can see what everyone else wants.
              </div>
            </div>

            <button className="btn gold" disabled={count < 2 || busy} onClick={() => onStart(clout, kitchen)}>
              {count < 2 ? 'Waiting for one more player…' : 'Start the Family Affair'}
            </button>
            {count < 2 && (
              <div className="lobby-tag" style={{ marginTop: -8 }}>
                You need at least 2 players. Share the code <strong>{view.code}</strong>, or go back
                and pick <strong>Play on this device</strong> to try the game on your own.
              </div>
            )}
          </>
        ) : (
          <div className="lobby-tag">Waiting for the host to start…</div>
        )}

        <div className="warn">
          Your device is running the game. If you close this tab, the game ends for everyone —
          so keep it open and don't let your phone sleep.
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
            Play on this device
          </button>
          <div className="lobby-tag">
            <strong style={{ color: 'var(--gold)' }}>Just want to see how it plays?</strong> Pick
            “Play on this device”. It runs every player on this one screen and you take each turn
            in order — no second phone, nobody else needed.
          </div>
          {!hasTurn && (
            <div className="lobby-tag subtle">
              Games connect your phones directly to each other. A few networks — some office wifi
              and mobile carriers — block that. If hosting or joining will not connect, everyone
              switching to the same wifi usually fixes it, and “Play on this device” always works.
            </div>
          )}
        </>
      ) : screen === 'local' ? (
        <>
          <div className="card-panel">
            <span className="field-label">How many players?</span>
            <div className="seg">
              {[2, 3, 4, 5, 6].map((n) => (
                <button key={n} aria-pressed={localCount === n} onClick={() => setLocalCount(n)}>{n}</button>
              ))}
            </div>
            <span className="field-label" style={{ marginTop: 12 }}>Who is playing?</span>
            <div className="namelist">
              {Array.from({ length: localCount }, (_, i) => (
                <input
                  key={i} type="text" className="name-input" maxLength={14}
                  value={localNames[i] ?? ''}
                  placeholder={`Player ${i + 1}`}
                  autoCapitalize="words" autoCorrect="off"
                  onChange={(e) => setLocalNames((ns) => {
                    const next = [...ns]
                    next[i] = e.target.value
                    return next
                  })}
                />
              ))}
            </div>
            <div className="lobby-tag" style={{ marginTop: 8 }}>
              Names are optional, but the game says whose turn it is by name — so on one screen it
              is a lot easier to know who to hand it to. A gold banner at the top always shows it.
              <br /><br />
              First to {defaultCloutToWin(localCount)} Clout wins — about 45 minutes.
            </div>
          </div>
          <button
            className="btn gold" data-testid="start-local"
            onClick={() => onLocal(
              Array.from({ length: localCount }, (_, i) => (localNames[i] ?? '').trim() || `Player ${i + 1}`),
              defaultCloutToWin(localCount), false,
            )}
          >Start game</button>
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
        To play with other people: one person hosts and reads out the 4-letter code, everyone
        else joins with it. Add this page to your home screen to play it like an app.
      </div>
    </div>
  )
}
