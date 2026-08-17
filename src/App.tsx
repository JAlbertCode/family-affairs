import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Room, loadSession, clearSession, liveElsewhere, type RoomView, type SavedSession } from './net/room'
import type { Intent } from './engine/types'
import { createGame } from './engine/state'
import { AFFAIRS } from './engine/cards/affairs'
import { Lobby } from './ui/Lobby'
import { Builder } from './ui/builder/Builder'
import { Tv } from './ui/Tv'
import { Table } from './ui/Table'
import './ui/styles.css'

export default function App() {
  const room = useMemo(() => new Room(), [])
  const [view, setView] = useState<RoomView>(() => room.view())
  const [busy, setBusy] = useState(false)
  const [resuming, setResuming] = useState(() => !!loadSession())
  const tried = useRef(false)
  // ?tv=CODE turns this tab into the living-room screen. A URL rather than a
  // button because the way it gets onto a TV is somebody casting a tab or
  // plugging in a cable, and both of those want an address you can just open.
  const tvCode = useMemo(() => {
    try { return (new URLSearchParams(location.search).get('tv') ?? '').toUpperCase() } catch { return '' }
  }, [])
  /**
   * The room code from the URL.
   *
   * It is taken at face value and it is never second-guessed. This used to be
   * withheld when this browser's own session had timed out, on the theory that
   * a stale session meant a stale link - but the two have nothing to do with
   * each other. A guest who closes the tab for half an hour, or anybody
   * following a link in a browser that happens to hold an old session, was
   * being shown a plain menu whose only button opens a brand new room, while
   * the room in the address bar was still running. The URL is the one copy of
   * the code that outlives storage. Withholding it threw away the fallback.
   */
  const [inviteCode] = useState(() => {
    try {
      const raw = new URLSearchParams(location.search).get('room') ?? ''
      return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
    } catch { return '' }
  })

  const [building, setBuilding] = useState(() => {
    try { return new URLSearchParams(location.search).has('build') } catch { return false }
  })

  /**
   * The code only comes out of the URL when somebody deliberately leaves.
   *
   * It used to come out whenever there was no live room, which meant a reload
   * that failed to resume deleted the last copy of the code in the same tick
   * it became the only copy. Storage had already been lost; the URL was the
   * fallback; the fallback wiped itself. That is the whole share bug: come
   * back, nothing knows the room, the only button on screen makes a new one.
   */
  const dropRoomFromUrl = useCallback(() => {
    try {
      const url = new URL(location.href)
      url.searchParams.delete('room')
      history.replaceState(null, '', url)
    } catch { /* nothing important depends on this */ }
  }, [])

  useEffect(() => room.subscribe(setView), [room])

  /**
   * Put people back where they were. Phones reload tabs on their own and
   * pull-to-refresh happens by accident; with no server, a refresh used to
   * mean the game was simply gone. The host reopens the same room code with
   * the state it was holding, and a guest re-announces under the same name and
   * gets their seat back.
   */
  const [resumeFailed, setResumeFailed] = useState<SavedSession | null>(null)
  const [duplicate, setDuplicate] = useState<SavedSession | null>(null)

  /**
   * ?tv=DEMO renders the living-room screen against a game made up on the spot.
   *
   * The TV is the one screen in this app that cannot be checked by playing:
   * it needs a host, a room and other people before it draws anything at all,
   * which is how it shipped with a layout nobody had ever looked at. This is a
   * board with six families on it, one keypress away, and it costs a call to
   * the same `createGame` the room already imports.
   */
  const demo = useMemo(() => (tvCode === 'DEMO' ? demoState() : null), [tvCode])

  useEffect(() => {
    if (!tvCode || tvCode === 'DEMO' || tried.current) return
    tried.current = true
    let stop = false
    const attempt = async (n: number) => {
      if (stop) return
      try { await room.spectate(tvCode) } catch {
        // The host may not be up yet - a TV is usually switched on first.
        if (n < 60) setTimeout(() => attempt(n + 1), 3000)
      }
    }
    attempt(0)
    setResuming(false)
    return () => { stop = true }
  }, [room, tvCode])

  useEffect(() => {
    if (tvCode) return
    if (tried.current) return
    tried.current = true
    const s = loadSession()
    if (!s) { setResuming(false); return }
    // Another tab of this browser already has this room open, which is what
    // opening a shared link on a phone does. Two tabs cannot both be the host,
    // and the loser spends half a minute failing to prove it before saying so.
    // Say it immediately instead.
    if (liveElsewhere(s.code)) { setDuplicate(s); setResuming(false); return }
    ;(async () => {
      try {
        if (s.role === 'host') await room.resumeHost(s)
        else await room.resumeClient(s)
        setResumeFailed(null)
      } catch {
        // Keep the session. Throwing it away on the first failure is what made
        // sharing a link look like it destroyed the room, and the code is the
        // one thing the player cannot reconstruct on their own.
        setResumeFailed(s)
      } finally {
        setResuming(false)
      }
    })()
  }, [room])

  const retry = useCallback(async (s: SavedSession) => {
    setResuming(true)
    setDuplicate(null)
    try {
      if (s.role === 'host') await room.resumeHost(s)
      else await room.resumeClient(s)
      setResumeFailed(null)
    } catch { setResumeFailed(s) } finally { setResuming(false) }
  }, [room])

  // A refresh mid-game is almost never deliberate. Browsers only allow the
  // generic prompt, but the generic prompt is enough to stop the accident.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (room.hotseat) return
      if (!room.code) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [room])

  const onHost = useCallback(async (name: string) => {
    setBusy(true)
    try { await room.host(name) } catch { /* surfaced through view.error */ }
    setBusy(false)
  }, [room])

  const onJoin = useCallback(async (code: string, name: string) => {
    setBusy(true)
    try { await room.join(code, name) } catch { /* surfaced through view.error */ }
    setBusy(false)
  }, [room])

  const onRecover = useCallback(async (code: string, name: string) => {
    setBusy(true)
    try { await room.recover(code, name) } catch { /* surfaced through view.error */ }
    setBusy(false)
  }, [room])

  const onLeave = useCallback(() => {
    room.leave(); setResuming(false); dropRoomFromUrl()
  }, [room, dropRoomFromUrl])

  const send = useCallback((intent: Intent) => {
    if (view.you) room.submit(view.you, intent)
  }, [room, view.you])

  // Once somebody has won there is nothing to come back to, and a stale
  // session would drop the next visit straight into a finished game.
  useEffect(() => {
    if (view.state?.phase !== 'gameover') return
    clearSession()
    dropRoomFromUrl()
  }, [view.state?.phase, dropRoomFromUrl])

  /**
   * Keep the room code in the address bar for as long as the room is live.
   * Reopening a closed tab, restoring a session, sharing the URL or just
   * hitting back all recover the code without anyone having to have written it
   * down. It is also the thing people paste into a group chat.
   */
  useEffect(() => {
    try {
      if (!view.code || view.hotseat) return
      const url = new URL(location.href)
      url.searchParams.set('room', view.code)
      if (url.toString() !== location.href) history.replaceState(null, '', url)
    } catch { /* nothing important depends on this */ }
  }, [view.code, view.hotseat])


  // The builder is its own screen rather than a modal: it is a workbench, not
  // a dialog, and people will sit in it for an hour. ?build keeps it a real URL
  // that can be bookmarked and shared without adding a router.
  if (tvCode) {
    return (
      <Tv
        state={demo ?? view.state}
        turnStartedAt={demo ? Date.now() - 62_000 : view.turnStartedAt}
        code={view.code || tvCode}
        waiting={view.error ?? (view.status === 'connected'
          ? `${view.lobby.length} in the room. Waiting for the host to start.`
          : 'Looking for the room…')}
      />
    )
  }

  if (building) {
    return <Builder onExit={() => {
      setBuilding(false)
      try {
        const url = new URL(location.href)
        url.searchParams.delete('build')
        history.replaceState(null, '', url)
      } catch { /* nothing depends on it */ }
    }} />
  }

  if (view.state && view.you) {
    return (
      <Table
        state={view.state} you={view.you} error={view.error} send={send}
        turnStartedAt={view.turnStartedAt}
        hotseat={view.hotseat}
        /* pass-and-play has no room for anyone to join */
        code={view.hotseat ? '' : view.code}
        onLeave={view.hotseat ? undefined : onLeave}
      />
    )
  }

  // Deliberately its own screen rather than a warning on the lobby: everything
  // on the lobby starts something, and starting something is the one action
  // that would actually cost this player their game.
  if (duplicate) {
    return (
      <div className="app">
        <div className="lobby">
          <div className="brand"><span className="b1">FAMILY<br />AFFAIRS</span></div>
          <div className="card-panel">
            <span className="field-label">Already open</span>
            <div className="roomcode">{duplicate.code}</div>
            <p className="lobby-tag" style={{ fontSize: '.78rem', textAlign: 'center', margin: '4px 0 0' }}>
              This room is open in another tab. Go back to it - that is the one
              holding the game.
            </p>
          </div>
          <button className="btn gold" onClick={() => retry(duplicate)}>Use this tab instead</button>
          <button className="btn ghost" onClick={() => { setDuplicate(null); setResuming(false) }}>
            Do something else
          </button>
        </div>
      </div>
    )
  }

  if (resuming || resumeFailed) {
    const s = resumeFailed
    return (
      <div className="app">
        <div className="lobby">
          <div className="brand"><span className="b1">FAMILY<br />AFFAIRS</span></div>
          {s ? (
            <>
              <div className="card-panel">
                <span className="field-label">Your room</span>
                <div className="roomcode">{s.code}</div>
                <p className="lobby-tag" style={{ fontSize: '.78rem', textAlign: 'center', margin: '4px 0 0' }}>
                  {s.role === 'host'
                    ? 'Could not reopen it just yet. The code is still yours; try again in a moment.'
                    : 'Could not reach the host just yet. They may be coming back too.'}
                </p>
              </div>
              <button className="btn gold" onClick={() => retry(s)}>Try again</button>
              <button className="btn ghost" onClick={() => { clearSession(); dropRoomFromUrl(); setResumeFailed(null) }}>
                Give up and start fresh
              </button>
            </>
          ) : (
            <>
              <div className="lobby-tag">Putting you back in the room…</div>
              <button className="btn ghost" onClick={() => { clearSession(); setResuming(false) }}>
                Start fresh instead
              </button>
            </>
          )}
          {view.error && <div className="lobby-tag" style={{ opacity: .7 }}>{view.error}</div>}
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <Lobby
        view={view}
        busy={busy}
        onHost={onHost}
        onJoin={onJoin}
        onRecover={onRecover}
        inviteCode={inviteCode}
        onStart={(cloutToWin, useKitchenTable, turnSeconds) => send({ k: 'startGame', cloutToWin, useKitchenTable, turnSeconds })}
        onLocal={(names, cloutToWin, useKitchenTable, turnSeconds) => room.startLocal(names, { cloutToWin, useKitchenTable, turnSeconds })}
        onLeave={onLeave}
        onBuild={() => {
          try {
            const url = new URL(location.href)
            url.searchParams.set('build', '1')
            history.replaceState(null, '', url)
          } catch { /* nothing depends on it */ }
          setBuilding(true)
        }}
      />
    </div>
  )
}

/**
 * A mid-game board, deterministic, for looking at the TV screen with.
 *
 * Six families because six is the layout that has to work; a spread of Clout,
 * damage, Limits and statuses because an empty board hides every case where a
 * token grows taller than the panel holding it.
 */
function demoState(): RoomView['state'] {
  const names = ['Jay', 'Bry', 'Dorian', 'Kevin', 'Nani', 'Grandma']
  const g = createGame(names.map((n, i) => ({ id: `p${i}`, name: n })), { seed: 20260817, cloutToWin: 7 })
  // Distinct Characters, or the screen is three copies of the same face and a
  // layout problem hides behind looking like a bug in the deck.
  const seen = new Set<string>()
  const pool = Object.values(g.characters).filter((c) => !seen.has(c.defId) && seen.add(c.defId))
  let n = 0
  g.players.forEach((pid, p) => {
    const ps = g.playerState[pid]
    ps.clout = [5, 3, 6, 1, 4, 2][p]
    ps.hand = ps.hand.slice(0, [7, 2, 5, 4, 6, 3][p])
    // The sixth family is left empty on purpose: three dashed slots is a case
    // the layout has to hold as surely as three tall tokens.
    for (let s = 0; s < (p === 5 ? 0 : 3); s++) {
      const ch = pool[n++]
      if (!ch) continue
      ch.owner = pid; ch.zone = 'active'; ch.slot = s as 0 | 1 | 2
      ch.hp = Math.max(1, ch.maxHp - ((p + s) % 4) * 3)
      ch.limits = { alcohol: (p + s) % 4, weed: (s + 1) % 4, food: (p + 2 * s) % 4 }
      if ((p + s) % 5 === 0) ch.statuses = [{ name: 'Asleep', duration: 1 }]
      ps.field[s] = ch.iid
    }
  })
  // A fight in progress, because the band it puts on the screen is the one
  // thing on this display that only exists for a few seconds and so is the one
  // nobody would ever catch by looking.
  const fighters = g.players.flatMap((pid) => g.playerState[pid].field.filter(Boolean) as string[])
  if (fighters.length >= 4) {
    g.battle = {
      attackerPlayer: g.characters[fighters[0]].owner, attackerChar: fighters[0],
      defenderPlayer: g.characters[fighters[3]].owner, defenderChar: fighters[3],
      stage: 'declared', passed: [], attackRoll: null, defenseRoll: null,
      attackScore: null, defenseScore: null, attackMod: 0, defenseMod: 0,
      damageDealt: null, isFree: false, log: [],
    }
  }
  g.turnSeconds = 90
  g.round = 4
  // An Affair is on the board most Rounds and it is the widest thing on the
  // screen, so a demo without one is not the layout that has to hold.
  g.currentAffair = g.currentAffair ?? AFFAIRS[0]?.id ?? null
  return g
}
