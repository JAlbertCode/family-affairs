import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Room, loadSession, clearSession, type RoomView } from './net/room'
import type { Intent } from './engine/types'
import { Lobby } from './ui/Lobby'
import { Table } from './ui/Table'
import './ui/styles.css'

export default function App() {
  const room = useMemo(() => new Room(), [])
  const [view, setView] = useState<RoomView>(() => room.view())
  const [busy, setBusy] = useState(false)
  const [resuming, setResuming] = useState(() => !!loadSession())
  const tried = useRef(false)

  useEffect(() => room.subscribe(setView), [room])

  /**
   * Put people back where they were. Phones reload tabs on their own and
   * pull-to-refresh happens by accident; with no server, a refresh used to
   * mean the game was simply gone. The host reopens the same room code with
   * the state it was holding, and a guest re-announces under the same name and
   * gets their seat back.
   */
  useEffect(() => {
    if (tried.current) return
    tried.current = true
    const s = loadSession()
    if (!s) return
    ;(async () => {
      try {
        if (s.role === 'host') await room.resumeHost(s)
        else await room.resumeClient(s)
      } catch {
        clearSession()
      } finally {
        setResuming(false)
      }
    })()
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

  const send = useCallback((intent: Intent) => {
    if (view.you) room.submit(view.you, intent)
  }, [room, view.you])

  // Once somebody has won there is nothing to come back to, and a stale
  // session would drop the next visit straight into a finished game.
  useEffect(() => {
    if (view.state?.phase === 'gameover') clearSession()
  }, [view.state?.phase])

  if (view.state && view.you) {
    return <Table state={view.state} you={view.you} error={view.error} send={send} hotseat={view.hotseat} />
  }

  if (resuming) {
    return (
      <div className="app">
        <div className="lobby">
          <div className="brand"><span className="b1">FAMILY<br />AFFAIRS</span></div>
          <div className="lobby-tag">Putting you back in the room…</div>
          <button className="btn ghost" onClick={() => { clearSession(); setResuming(false); location.reload() }}>
            Start fresh instead
          </button>
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
        onStart={(cloutToWin, useKitchenTable) => send({ k: 'startGame', cloutToWin, useKitchenTable })}
        onLocal={(names, cloutToWin, useKitchenTable) => room.startLocal(names, { cloutToWin, useKitchenTable })}
      />
    </div>
  )
}
