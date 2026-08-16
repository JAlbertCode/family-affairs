import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Room, loadSession, clearSession, type RoomView, type SavedSession } from './net/room'
import type { Intent } from './engine/types'
import { Lobby } from './ui/Lobby'
import { Builder } from './ui/builder/Builder'
import { Table } from './ui/Table'
import './ui/styles.css'

export default function App() {
  const room = useMemo(() => new Room(), [])
  const [view, setView] = useState<RoomView>(() => room.view())
  const [busy, setBusy] = useState(false)
  const [resuming, setResuming] = useState(() => !!loadSession())
  const tried = useRef(false)
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

  useEffect(() => {
    if (tried.current) return
    tried.current = true
    const s = loadSession()
    if (!s) return
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
    if (view.state?.phase === 'gameover') clearSession()
  }, [view.state?.phase])

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
        hotseat={view.hotseat}
        /* pass-and-play has no room for anyone to join */
        code={view.hotseat ? '' : view.code}
        onLeave={view.hotseat ? undefined : onLeave}
      />
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
        onStart={(cloutToWin, useKitchenTable) => send({ k: 'startGame', cloutToWin, useKitchenTable })}
        onLocal={(names, cloutToWin, useKitchenTable) => room.startLocal(names, { cloutToWin, useKitchenTable })}
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
