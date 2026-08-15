import Peer, { type DataConnection } from 'peerjs'
import { peerOptions, hasTurn } from './config'
import type { GameState, Intent, PlayerId } from '../engine/types'
import { applyIntent, createGame, redactFor } from '../engine/state'
import {
  PROTOCOL_VERSION, makeRoomCode, normalizeRoomCode, peerIdForRoom, assignSeat,
  type ClientMsg, type HostMsg, type LobbyPlayer,
} from './protocol'

// ---------------------------------------------------------------------------
// Host-authoritative P2P room.
//
// The host's browser owns the one true GameState. Clients never mutate it;
// they send Intents and receive a redacted snapshot (their own hand only).
// That means no server, no cost, and no way for a client to peek at hands.
// Trade-off: if the host closes the tab, the game ends. Stated up front in
// the UI so nobody is surprised.
// ---------------------------------------------------------------------------

export type ConnStatus = 'idle' | 'connecting' | 'connected' | 'error' | 'closed'

export interface RoomView {
  role: 'host' | 'client'
  /** Pass-and-play on a single device: no networking, the view follows
   *  whoever needs to act. Also the only way to try the game solo. */
  hotseat: boolean
  status: ConnStatus
  code: string
  you: PlayerId | null
  lobby: LobbyPlayer[]
  state: GameState | null
  error: string | null
  started: boolean
}

type Listener = (view: RoomView) => void

// Signalling and ICE both live in net/config.ts so they can be pointed at a
// self-hosted broker or a paid TURN tier without touching this file.
const PEER_OPTS = peerOptions()

/**
 * PeerJS error types are accurate and unreadable. Each one here maps to a thing
 * the player can actually do something about — and 'unavailable-id' in
 * particular means the room code is taken, not that anything is broken.
 */
export function explainPeerError(err: unknown): string {
  const type = (err as any)?.type as string | undefined
  const msg = String((err as any)?.message ?? err)
  switch (type) {
    case 'peer-unavailable':
      return 'No game with that code. Check the four letters, or ask the host to read them out again.'
    case 'unavailable-id':
      return 'That room code is already in use. Starting a new one.'
    case 'network':
    case 'server-error':
    case 'socket-error':
    case 'socket-closed':
      return 'Lost the connection to the signalling server. It brokers the introduction only — try again in a moment.'
    case 'browser-incompatible':
      return 'This browser does not support the peer-to-peer connection the game needs. Chrome, Edge, Firefox or Safari 15+ all work.'
    case 'webrtc':
      return hasTurn
        ? 'Could not open a direct connection, and the relay did not answer either. Try again, or play pass-and-play on one device.'
        : 'Could not open a direct connection. Some networks — office wifi and a few mobile carriers — block this, and no relay is configured. Pass-and-play on one device always works.'
    default:
      return msg
  }
}

export class Room {
  role: 'host' | 'client' = 'host'
  hotseat = false
  status: ConnStatus = 'idle'
  code = ''
  you: PlayerId | null = null
  error: string | null = null

  private peer: Peer | null = null
  private listeners = new Set<Listener>()

  // host-side
  private conns = new Map<PlayerId, DataConnection>()
  private names = new Map<PlayerId, string>()
  private order: PlayerId[] = []
  private game: GameState | null = null

  // client-side
  private hostConn: DataConnection | null = null
  private myState: GameState | null = null
  private lobbyCache: LobbyPlayer[] = []

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn)
    fn(this.view())
    return () => this.listeners.delete(fn)
  }

  private emit() {
    const v = this.view()
    this.listeners.forEach((l) => l(v))
  }

  view(): RoomView {
    // In hotseat the "local player" is whoever the game is waiting on: the
    // active player normally, or the next person who still owes an interference
    // decision while a battle is open.
    let you = this.you
    if (this.hotseat && this.game) {
      const g = this.game
      const mg = g.minigame
      const b = g.battle
      // Follow whoever the game is actually waiting on, in priority order:
      // a minigame blocks everything, then an open interference window, then
      // the active player. Miss any one of these and the table deadlocks.
      you = mg && !mg.done
        ? mg.players[mg.turn]
        : b
          ? (g.players.find((p) => !b.passed.includes(p)) ?? g.players[g.turnIndex])
          : (g.turnOrder[g.turnIndex] ?? g.players[g.turnIndex])
    }
    return {
      role: this.role,
      hotseat: this.hotseat,
      status: this.status,
      code: this.code,
      you,
      lobby: this.role === 'host' ? this.hostLobby() : this.lobbyCache,
      state: this.role === 'host'
        ? (this.game ? redactFor(this.game, you ?? this.you ?? '') : null)
        : this.myState,
      error: this.error,
      started: !!(this.role === 'host' ? this.game : this.myState),
    }
  }

  private hostLobby(): LobbyPlayer[] {
    return this.order.map((id) => ({
      id,
      name: this.names.get(id) ?? 'Player',
      connected: id === this.you ? true : (this.conns.get(id)?.open ?? false),
      isHost: id === this.you,
    }))
  }

  /** Start a pass-and-play game on this device only. */
  startLocal(names: string[], opts: { cloutToWin: number; useKitchenTable: boolean }) {
    this.role = 'host'
    this.hotseat = true
    this.status = 'connected'
    this.code = 'LOCAL'
    this.order = names.map((_, i) => `p${i}`)
    names.forEach((n, i) => this.names.set(`p${i}`, n))
    this.you = 'p0'
    this.game = createGame(
      this.order.map((id) => ({ id, name: this.names.get(id)! })),
      { seed: (Date.now() ^ (Math.random() * 0xffffffff)) | 0, ...opts },
    )
    this.emit()
  }

  // ------------------------------------------------------------------ HOST --

  async host(displayName: string): Promise<string> {
    this.role = 'host'
    this.status = 'connecting'
    this.error = null
    this.emit()

    // Retry a few times in case the room code is already taken on the broker.
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = makeRoomCode()
      try {
        await this.openPeer(peerIdForRoom(code))
        this.code = code
        this.you = 'p0'
        this.names.set('p0', displayName || 'Host')
        this.order = ['p0']
        this.status = 'connected'
        this.attachHostHandlers()
        this.emit()
        return code
      } catch (e: any) {
        if (attempt === 4) {
          this.status = 'error'
          this.error = e?.message ?? 'Could not open a room.'
          this.emit()
          throw e
        }
      }
    }
    throw new Error('unreachable')
  }

  private openPeer(id: string): Promise<Peer> {
    return new Promise((resolve, reject) => {
      const p = new Peer(id, PEER_OPTS as any)
      const timer = setTimeout(
        () => reject(new Error('Timed out reaching the signalling server. It may be busy — try again in a moment.')),
        12000,
      )
      p.on('open', () => { clearTimeout(timer); this.peer = p; resolve(p) })
      p.on('error', (err) => { clearTimeout(timer); p.destroy(); reject(new Error(explainPeerError(err))) })
    })
  }

  private attachHostHandlers() {
    const peer = this.peer!
    peer.on('connection', (conn) => {
      conn.on('open', () => {
        conn.on('data', (raw) => this.onClientMsg(conn, raw as ClientMsg))
      })
      conn.on('close', () => {
        for (const [pid, c] of this.conns) {
          if (c === conn) {
            if (this.game) this.game.playerState[pid].connected = false
            break
          }
        }
        this.broadcastLobby()
        this.broadcastState()
        this.emit()
      })
      conn.on('error', () => this.emit())
    })
    peer.on('error', (err) => {
      this.error = explainPeerError(err)
      this.emit()
    })
    peer.on('close', () => { this.status = 'closed'; this.emit() })
  }

  private onClientMsg(conn: DataConnection, msg: ClientMsg) {
    if (msg.t === 'ping') { this.send(conn, { t: 'pong' }); return }

    if (msg.t === 'join') {
      if (msg.protocol !== PROTOCOL_VERSION) {
        this.send(conn, { t: 'kicked', reason: 'Different game version — everyone should reload the page.' })
        return
      }
      const seatResult = assignSeat({
        name: msg.name,
        order: this.order,
        names: this.names,
        connOpen: new Map([...this.conns].map(([id, c]) => [id, c.open])),
        hostSeat: this.you,
        started: !!this.game,
        maxPlayers: 6,
      })
      if (!seatResult.ok) {
        this.send(conn, { t: 'kicked', reason: seatResult.reason })
        return
      }
      const pid = seatResult.seat
      if (seatResult.isNewSeat) this.order.push(pid)
      this.names.set(pid, seatResult.name)
      this.conns.set(pid, conn)
      if (this.game) this.game.playerState[pid].connected = true

      this.send(conn, { t: 'welcome', you: pid, lobby: this.hostLobby(), protocol: PROTOCOL_VERSION })
      this.broadcastLobby()
      this.broadcastState()
      this.emit()
      return
    }

    const pid = [...this.conns.entries()].find(([, c]) => c === conn)?.[0]
    if (!pid) return

    if (msg.t === 'rename') {
      this.names.set(pid, msg.name)
      if (this.game) this.game.playerState[pid].name = msg.name
      this.broadcastLobby(); this.broadcastState(); this.emit()
      return
    }

    if (msg.t === 'intent') {
      this.submit(pid, msg.intent)
    }
  }

  /** Host-side entry point for every intent, local or remote. */
  submit(pid: PlayerId, intent: Intent) {
    if (this.hotseat) pid = this.view().you ?? pid
    if (this.role !== 'host') {
      this.sendToHost({ t: 'intent', intent })
      return
    }

    if (intent.k === 'startGame') {
      if (pid !== this.you) return
      if (this.order.length < 2) {
        this.error = 'Family Affairs needs at least 2 players.'
        this.emit()
        return
      }
      this.game = createGame(
        this.order.map((id) => ({ id, name: this.names.get(id) ?? id })),
        {
          seed: (Date.now() ^ (Math.random() * 0xffffffff)) | 0,
          cloutToWin: intent.cloutToWin,
          useKitchenTable: intent.useKitchenTable,
        },
      )
      this.broadcastState()
      this.emit()
      return
    }

    if (!this.game) return
    const res = applyIntent(this.game, pid, intent)
    if (res.error) {
      const conn = this.conns.get(pid)
      if (conn && pid !== this.you) this.send(conn, { t: 'error', message: res.error })
      else { this.error = res.error; setTimeout(() => { this.error = null; this.emit() }, 3500) }
      this.emit()
      return
    }
    this.game = res.state
    this.error = null
    this.broadcastState()
    this.emit()
  }

  private broadcastLobby() {
    const lobby = this.hostLobby()
    for (const [, conn] of this.conns) {
      if (conn.open) this.send(conn, { t: 'lobby', lobby })
    }
  }

  private broadcastState() {
    if (!this.game) return
    for (const [pid, conn] of this.conns) {
      if (conn.open) this.send(conn, { t: 'state', state: redactFor(this.game, pid), you: pid })
    }
  }

  private send(conn: DataConnection, msg: HostMsg) {
    try { conn.send(msg) } catch { /* connection died mid-send */ }
  }

  // ---------------------------------------------------------------- CLIENT --

  async join(codeInput: string, displayName: string): Promise<void> {
    this.role = 'client'
    this.status = 'connecting'
    this.error = null
    this.code = normalizeRoomCode(codeInput)
    this.emit()

    if (this.code.length < 4) {
      this.status = 'error'
      this.error = 'Room codes are 4 characters.'
      this.emit()
      throw new Error(this.error)
    }

    await this.openPeer(`${peerIdForRoom(this.code)}-guest-${Math.random().toString(36).slice(2, 8)}`)
    const peer = this.peer!

    await new Promise<void>((resolve, reject) => {
      const conn = peer.connect(peerIdForRoom(this.code), { reliable: true })
      const timer = setTimeout(() => reject(new Error(`No room found with code ${this.code}.`)), 15000)

      conn.on('open', () => {
        clearTimeout(timer)
        this.hostConn = conn
        this.status = 'connected'
        conn.send({ t: 'join', name: displayName, protocol: PROTOCOL_VERSION } satisfies ClientMsg)
        this.emit()
        resolve()
      })
      conn.on('data', (raw) => this.onHostMsg(raw as HostMsg))
      conn.on('close', () => {
        this.status = 'closed'
        this.error = 'The host closed the game.'
        this.emit()
      })
      conn.on('error', (e) => { clearTimeout(timer); reject(e) })
    }).catch((e) => {
      this.status = 'error'
      this.error = e?.message ?? 'Could not join.'
      this.emit()
      throw e
    })
  }

  private onHostMsg(msg: HostMsg) {
    switch (msg.t) {
      case 'welcome':
        this.you = msg.you
        this.lobbyCache = msg.lobby
        break
      case 'lobby':
        this.lobbyCache = msg.lobby
        break
      case 'state':
        this.myState = msg.state
        this.you = msg.you
        this.error = null
        break
      case 'error':
        this.error = msg.message
        setTimeout(() => { this.error = null; this.emit() }, 3500)
        break
      case 'kicked':
        this.error = msg.reason
        this.status = 'error'
        break
      case 'pong':
        return
    }
    this.emit()
  }

  private sendToHost(msg: ClientMsg) {
    if (this.hostConn?.open) this.hostConn.send(msg)
  }

  leave() {
    this.peer?.destroy()
    this.peer = null
    this.hostConn = null
    this.conns.clear()
    this.status = 'closed'
    this.emit()
  }
}
