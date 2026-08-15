import { useCallback, useEffect, useMemo, useState } from 'react'
import { Room, type RoomView } from './net/room'
import type { Intent } from './engine/types'
import { Lobby } from './ui/Lobby'
import { Table } from './ui/Table'
import './ui/styles.css'

export default function App() {
  const room = useMemo(() => new Room(), [])
  const [view, setView] = useState<RoomView>(() => room.view())
  const [busy, setBusy] = useState(false)

  useEffect(() => room.subscribe(setView), [room])

  // Warn the host before they nuke everyone else's game by closing the tab.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (room.role === 'host' && room.view().started) { e.preventDefault(); e.returnValue = '' }
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

  if (view.state && view.you) {
    return <Table state={view.state} you={view.you} error={view.error} send={send} hotseat={view.hotseat} />
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
