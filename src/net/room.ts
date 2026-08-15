import Peer, { type DataConnection } from 'peerjs'
import type { GameState, Intent, PlayerId } from '../engine/types'
import { applyIntent, createGame, redactFor } from '../engine/state'
import {
  PROTOCOL_VERSION, makeRoomCode, normalizeRoomCode, peerIdForRoom,
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

const PEER_OPTS = {
  // PeerJS's free public broker handles signalling only; game traffic is direct
  // browser-to-browser over WebRTC. These STUN servers are Google's public ones.
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' },
    ],
  },
  debug: 0 as const,
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
      const b = this.game.battle
      you = b
        ? (this.game.players.find((p) => !b.passed.includes(p)) ?? this.game.players[this.game.turnIndex])
        : (this.game.turnOrder[this.game.turnIndex] ?? this.game.players[this.game.turnIndex])
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
      const p = new Peer(id, PEER_OPTS)
      const timer = setTimeout(() => reject(new Error('Timed out reaching the signalling server.')), 12000)
      p.on('open', () => { clearTimeout(timer); this.peer = p; resolve(p) })
      p.on('error', (err) => { clearTimeout(timer); p.destroy(); reject(err) })
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
      this.error = String((err as any)?.message ?? err)
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
      // reconnect to an existing seat if the name matches
      let pid: PlayerId | undefined
      for (const [id, n] of this.names) {
        if (n === msg.name && !(this.conns.get(id)?.open)) { pid = id; break }
      }
      if (!pid) {
        if (this.game) {
          this.send(conn, { t: 'kicked', reason: 'That game has already started.' })
          return
        }
        if (this.order.length >= 6) {
          this.send(conn, { t: 'kicked', reason: 'This game is full (6 players).' })
          return
        }
        pid = `p${this.order.length}`
        this.order.push(pid)
      }
      this.names.set(pid, msg.name || `Player ${this.order.length}`)
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
