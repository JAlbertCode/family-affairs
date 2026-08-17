import { useState } from 'react'
import { normalizeRoomCode } from '../net/protocol'
import { hasTurn } from '../net/config'
import { checkConnection, type CheckResult } from '../net/checkConnection'
import { lastRole, type RoomView } from '../net/room'
import { defaultCloutToWin } from '../engine/state'
import { deckSummary } from '../engine/cards/deck'
import { artUrl } from './artHashes'

export function Lobby({
  view, onHost, onJoin, onRecover, onStart, onLocal, onLeave, onBuild, inviteCode, busy,
}: {
  view: RoomView
  onHost: (name: string) => void
  onJoin: (code: string, name: string) => void
  onRecover: (code: string, name: string) => void
  /** A room code from the URL that is still worth offering. '' when it is not. */
  inviteCode: string
  onStart: (cloutToWin: number, useKitchenTable: boolean, turnSeconds: number) => void
  onLocal: (names: string[], cloutToWin: number, useKitchenTable: boolean, turnSeconds: number) => void
  onLeave: () => void
  onBuild: () => void
  busy: boolean
}) {
  const [localCount, setLocalCount] = useState(4)
  const [localNames, setLocalNames] = useState<string[]>([])
  const [shared, setShared] = useState<'link' | 'code' | null>(null)

  const joinUrl = (code: string) => `${location.origin}${location.pathname}?room=${code}`

  function copy(text: string, kind: 'link' | 'code') {
    try { navigator.clipboard?.writeText(text) } catch { /* insecure context */ }
    setShared(kind)
    setTimeout(() => setShared(null), 1800)
  }

  /** Native share sheet where there is one, clipboard everywhere else. */
  async function share(code: string) {
    const url = joinUrl(code)
    const data = { title: 'Family Affairs', text: `Join my game. Room ${code}.`, url }
    try {
      if (navigator.share) { await navigator.share(data); return }
    } catch { /* dismissed, fall through to copying */ }
    copy(url, 'link')
  }
  const [name, setName] = useState(() => localStorage.getItem('fa.name') ?? '')
  const [code, setCode] = useState(() => inviteCode)
  const [screen, setScreen] = useState<'home' | 'join' | 'local'>(() => {
    return 'home'
  })
  const [kitchen, setKitchen] = useState(false)
  // Ninety seconds by default. A party game dies when one person thinks for
  // four minutes and the other five reach for their phones, and the fix is not
  // to hurry that person - it is to let the table see the clock and to move on
  // when it runs out. Nothing is lost when it fires.
  const [turnSeconds, setTurnSeconds] = useState(90)
  const [cloutOverride, setCloutOverride] = useState<number | null>(null)
  const [check, setCheck] = useState<CheckResult | 'running' | null>(null)

  async function runCheck() {
    setCheck('running')
    try { setCheck(await checkConnection()) } catch { setCheck(null) }
  }

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
          <span className="field-label">Room code</span>
          <div className="card-panel">
            <div className="roomcode">{view.code}</div>
            <p className="lobby-tag" style={{ textAlign: 'center', fontSize: '.76rem', margin: '2px 0 10px' }}>
              Send the link and they join without typing anything.
            </p>
            <div className="lobby-tag" style={{ fontSize: '.74rem' }}>
              Playing in the same room? Open{' '}
              <b style={{ color: 'var(--gold)' }}>
                {typeof location !== 'undefined' ? `${location.host}${location.pathname}?tv=${view.code}` : ''}
              </b>{' '}
              on a laptop and cast it to the TV. It shows the whole table and nobody's hand.
            </div>
            <div className="sharerow">
              <button className="btn" onClick={() => share(view.code)}>
                {shared === 'link' ? 'Link copied' : 'Share link'}
              </button>
              <button className="btn ghost" onClick={() => copy(view.code, 'code')}>
                {shared === 'code' ? 'Copied' : 'Copy code'}
              </button>
            </div>
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
                  ? `${suggested} is tuned for ${count} player${count === 1 ? '' : 's'} - about 45 minutes.`
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
                instead of drawing blind - so everyone can see what everyone else wants.
              </div>
            </div>

            <div className="card-panel">
              <span className="field-label">Turn timer</span>
              <div className="seg">
                {[0, 60, 90, 150].map((n) => (
                  <button key={n} aria-pressed={turnSeconds === n} onClick={() => setTurnSeconds(n)}>
                    {n === 0 ? 'Off' : n < 60 ? `${n}s` : `${n / 60}m${n % 60 ? ` ${n % 60}s` : ''}`}
                  </button>
                ))}
              </div>
              <div className="lobby-tag" style={{ marginTop: 8 }}>
                Everybody sees the same countdown on whoever is up, not just the person taking
                the turn. When it runs out the turn ends and nothing is lost - you keep your
                cards and your board, the table just moves on.
              </div>
            </div>

            <button className="btn gold" disabled={count < 2 || busy} onClick={() => onStart(clout, kitchen, turnSeconds)}>
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

        {isHost && (
          <div className="warn">
            Your device is running the game. Keep this tab open and don't let your phone sleep.
            If it reloads by accident the room comes back on the same code, but if you close it
            deliberately the game ends for everyone.
          </div>
        )}
        {view.error && <div className="err">{view.error}</div>}

        <button
          className="btn ghost"
          onClick={() => {
            const msg = isHost
              ? 'Close the room? This ends the game for everyone in it.'
              : 'Leave this room?'
            if (confirm(msg)) onLeave()
          }}
        >{isHost ? 'Close the room' : 'Leave room'}</button>
      </div>
    )
  }

  // ---------------------------------------------------------------- entry --
  const deck = deckSummary(4)

  /**
   * A room code in the URL with no live room means somebody is coming back to
   * a game they were already in. That is either a guest following a shared
   * link, or the host whose tab was discarded and whose saved session went
   * with it - and from here those look identical, so do not make the player
   * pick. `onRecover` takes the code back as host if it is free and joins it if
   * it is not, which is the correct answer in both cases.
   *
   * Without this the host lands on a plain Host / Join screen and the only
   * thing to press makes a brand new room. That is Jay's bug exactly: share
   * the link, come back, new code.
   */
  const urlRoom = inviteCode
  const wasHost = urlRoom ? lastRole(urlRoom)?.role === 'host' : false

  return (
    <div className="lobby">
      <div className="hero">
        <img src={artUrl('family.webp')} alt="" />
      </div>
      <div className="brand">
        <span className="b1">FAMILY<br />AFFAIRS</span>
        <span className="b2">BAKE IT · TAKE IT · FEED IT</span>
      </div>
      <div className="lobby-tag">
        Build a ridiculous family, feed them, get them drunk, and fight everyone else's family.
      </div>

      {/* Somebody who has never seen this lands on a name box and four buttons
          and has no way to know whether they are supposed to Host or Join. It
          is three steps and it takes eight words to say, so say it before the
          buttons rather than in a paragraph underneath them. */}
      {screen === 'home' && !urlRoom && (
        <ol className="howitworks">
          <li><b>One person starts a game</b> and reads out the four-letter code.</li>
          <li><b>Everyone else taps “I have a code”</b> and types it in.</li>
          <li><b>Play on your own phones</b>, around the same table. 2–6 people, about 45 minutes.</li>
        </ol>
      )}

      <div className="card-panel">
        <span className="field-label">Your name</span>
        <input
          type="text" value={name} placeholder="Who are you?"
          maxLength={16} onChange={(e) => remember(e.target.value)}
        />
      </div>

      {urlRoom && (
        <div className="card-panel comeback">
          <span className="field-label">{wasHost ? 'Your room' : 'You were invited to'}</span>
          <div className="roomcode">{urlRoom}</div>
          <button
            className="btn gold" style={{ marginTop: 12 }}
            disabled={!name.trim() || busy}
            onClick={() => onRecover(urlRoom, name.trim())}
          >
            {busy ? 'Getting you in…' : wasHost ? 'Reopen my room' : `Get into ${urlRoom}`}
          </button>
          <p className="lobby-tag" style={{ fontSize: '.74rem', margin: '10px 0 0' }}>
            {wasHost
              ? 'You were hosting this one. This takes the code back if it is free, and joins it if somebody else already has it.'
              : 'This takes you straight in. Everything below starts a different game.'}
          </p>
        </div>
      )}

      {screen === 'home' ? (
        <>
          {/* "Host" is jargon to everybody who has not played one of these
              before, and a greyed-out button that will not say why it is grey
              is worse than no button. */}
          <button className="btn gold" disabled={!name.trim() || busy} onClick={() => onHost(name.trim())}>
            {busy ? 'Opening room…' : 'Start a game'}
          </button>
          <button className="btn" disabled={!name.trim()} onClick={() => setScreen('join')}>
            I have a code
          </button>
          {/* Said once, under both, instead of replacing two labels with the
              same sentence and taking away what the buttons are for. */}
          {!name.trim() && (
            <div className="lobby-tag subtle" style={{ marginTop: -4, color: 'var(--gold)' }}>
              Put your name in above and these light up.
            </div>
          )}

          <div className="orline"><span>or, if you are on your own</span></div>

          <button className="btn ghost" data-testid="local-mode" onClick={() => setScreen('local')}>
            Try it on this phone
          </button>
          <div className="lobby-tag subtle" style={{ marginTop: -4 }}>
            Runs every player on this one screen and you take each turn in order. Nobody else
            needed, and it is the fastest way to see how it plays.
          </div>

          <button className="btn ghost narrow" data-testid="build-mode" onClick={onBuild}>
            Make your own cards
          </button>
          <div className="lobby-tag subtle">
            Games connect your phones directly to each other, so it depends on your network more
            than on the game.{' '}
            <button className="linkish" onClick={runCheck} disabled={check === 'running'}>
              {check === 'running' ? 'Checking…' : 'Check my connection'}
            </button>
            {check && check !== 'running' && (
              <span className={`checkline ${check.verdict}`}>
                <b>
                  {check.verdict === 'good' ? '✓ Good to go'
                    : check.verdict === 'direct-only' ? '✓ Should be fine'
                    : check.verdict === 'blocked' ? '✕ This network is blocking it'
                    : '✕ Browser not supported'}
                </b>
                {check.message}
              </span>
            )}
          </div>
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
              Names are optional, but the game says whose turn it is by name - so on one screen it
              is a lot easier to know who to hand it to. A gold banner at the top always shows it.
              <br /><br />
              First to {defaultCloutToWin(localCount)} Clout wins - about 45 minutes.
            </div>
          </div>
          <button
            className="btn gold" data-testid="start-local"
            onClick={() => onLocal(
              Array.from({ length: localCount }, (_, i) => (localNames[i] ?? '').trim() || `Player ${i + 1}`),
              defaultCloutToWin(localCount), false, 0,
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
