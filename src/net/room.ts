import Peer, { type DataConnection } from 'peerjs'
import { peerOptions, hasTurn } from './config'
import type { GameState, Intent, PlayerId } from '../engine/types'
import { applyIntent, createGame, redactFor } from '../engine/state'
import {
  PROTOCOL_VERSION, makeRoomCode, normalizeRoomCode, peerIdForRoom, assignSeat,
  type ClientMsg, type HostMsg, type LobbyPlayer,
} from './protocol'
import { clearSession, claimLive, clientId, loadSession, saveSession, type SavedSession } from './session'

// Re-exported so callers keep importing "the room" rather than having to know
// how it remembers things.
export {
  clientId, clearSession, lastRole, loadSession, liveElsewhere, type SavedSession,
} from './session'

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
 * the player can actually do something about - and 'unavailable-id' in
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
      return 'Lost the connection to the signalling server. It brokers the introduction only - try again in a moment.'
    case 'browser-incompatible':
      return 'This browser does not support the peer-to-peer connection the game needs. Chrome, Edge, Firefox or Safari 15+ all work.'
    case 'webrtc':
      return hasTurn
        ? 'Could not open a direct connection, and the relay did not answer either. Try again, or play pass-and-play on one device.'
        : 'Could not open a direct connection. Some networks - office wifi and a few mobile carriers - block this, and no relay is configured. Pass-and-play on one device always works.'
    default:
      return msg
  }
}


/**
 * A refresh should not cost you the game.
 *
 * Phones reload tabs on their own, people pull-to-refresh by accident, and a
 * hosted game has no server to fall back on - so the room remembers who you
 * were. Clients re-announce with the same name and `assignSeat` hands their
 * chair back; the host restores the authoritative state it was already
 * holding, because when the host disappears there is nowhere else for it to
 * live.
 */
/** A viewer id that can never be a seat, so `redactFor` hides every hand. */
export const SPECTATOR = '__tv'

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
  /** Screens watching the table without a seat. Kept apart from `conns` so
   *  nothing that walks the player list ever finds one. */
  private spectators = new Set<DataConnection>()
  private names = new Map<PlayerId, string>()
  private clients = new Map<PlayerId, string>()
  private order: PlayerId[] = []
  private game: GameState | null = null

  // client-side
  spectating = false
  private hostConn: DataConnection | null = null
  private myState: GameState | null = null
  private lobbyCache: LobbyPlayer[] = []

  constructor() {
    // Say, continuously, that this tab has this room. Continuously because the
    // only useful reading is "in the last few seconds": a tab that was closed
    // or discarded stops writing and the claim rots on its own, which is the
    // one thing a flag set on unload could never be trusted to do on a phone.
    try {
      setInterval(() => {
        if (!this.code || this.hotseat || this.spectating) return
        claimLive(this.code)
      }, 2000)
    } catch { /* no timers, no claim, no harm */ }
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn)
    fn(this.view())
    return () => this.listeners.delete(fn)
  }

  /** Snapshot whatever a reload would need to put this player back. */
  private persist() {
    if (this.hotseat || this.spectating || !this.code || !this.you) return
    const name = this.names.get(this.you) ?? ''
    if (this.role === 'client') {
      saveSession({ role: 'client', code: this.code, name })
      return
    }
    saveSession({
      role: 'host', code: this.code, name,
      game: this.game ?? undefined,
      order: this.order,
      names: [...this.names.entries()],
      clients: [...this.clients.entries()],
    })
  }

  private emit() {
    this.persist()
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

  /**
   * Re-open the room this browser was hosting before it reloaded, on the same
   * code and with the same game. The host holds the only copy of the
   * authoritative state, so without this a stray refresh ends everybody's game.
   */
  async resumeHost(s: SavedSession): Promise<void> {
    this.role = 'host'
    this.status = 'connecting'
    this.error = null
    this.emit()

    // The broker still has the previous peer registered under this room code
    // for a few seconds after the tab goes away, so the first attempt to take
    // it back reliably fails with `unavailable-id`. That is a wait, not a
    // failure: reloading after sharing a link is the single most common way
    // back into this code path, and giving up on attempt one is what made a
    // share look like it destroyed the room.
    await this.retakePeer(peerIdForRoom(s.code))
    this.code = s.code
    this.you = 'p0'
    this.names = new Map(s.names ?? [['p0', s.name]])
    this.clients = new Map(s.clients ?? [])
    this.order = s.order?.length ? s.order : ['p0']
    this.game = s.game ?? null
    // Everyone else is, by definition, not connected yet.
    if (this.game) for (const p of this.game.players) this.game.playerState[p].connected = p === 'p0'
    this.status = 'connected'
    this.attachHostHandlers()
    this.emit()
  }

  /**
   * Reclaim a peer id the broker may still think is in use. Backs off until it
   * frees up rather than treating the first collision as fatal.
   */
  private async retakePeer(id: string, attempts = 8): Promise<Peer> {
    let lastErr: unknown
    for (let n = 0; n < attempts; n++) {
      try {
        return await this.openPeer(id)
      } catch (e: any) {
        lastErr = e
        const type = e?.type ?? ''
        const retryable = type === 'unavailable-id' || /already|taken|in use/i.test(String(e?.message ?? ''))
        if (!retryable && n > 1) break
        this.error = `Getting the room back… (${n + 1}/${attempts})`
        this.emit()
        await new Promise((r) => setTimeout(r, 900 + n * 700))
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error('Could not reopen the room.')
  }

  /**
   * Rejoin a room this browser was a guest in. The host may itself be in the
   * middle of coming back, so this is patient too.
   */
  async resumeClient(s: SavedSession): Promise<void> {
    let lastErr: unknown
    for (let n = 0; n < 5; n++) {
      try { await this.join(s.code, s.name); return } catch (e) {
        lastErr = e
        this.error = `Looking for room ${s.code}… (${n + 1}/5)`
        this.emit()
        await new Promise((r) => setTimeout(r, 1000 + n * 800))
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error('Could not rejoin.')
  }

  /**
   * Get back into a room when all you have is its code.
   *
   * This is the path for the reload that lost everything. Jay's report was
   * exact: press Share, post the link, come back, and the game has a brand new
   * room code. That only happens when the saved session is gone, because with
   * a session the resume path never lets you reach a Host button - so the fix
   * cannot be more resume, it has to be a way in that needs nothing but the
   * code, and the code is in the URL.
   *
   * It tries to take the code back as host first. If the broker says the id is
   * in use then somebody is already hosting that room - the other tab, or a
   * genuine host whose link you followed - so it joins instead. One button,
   * and it is right either way without asking the player which they were.
   */
  async recover(code: string, displayName: string): Promise<'host' | 'client'> {
    this.role = 'host'
    this.status = 'connecting'
    this.error = null
    this.emit()
    try {
      await this.openPeer(peerIdForRoom(code))
    } catch (e: any) {
      const taken = e?.type === 'unavailable-id' || /already|taken|in use/i.test(String(e?.message ?? ''))
      if (!taken) { this.status = 'error'; this.error = e?.message ?? 'Could not reach the room.'; this.emit(); throw e }
      await this.join(code, displayName)
      return 'client'
    }
    this.code = code
    this.you = 'p0'
    this.names.set('p0', displayName || 'Host')
    this.order = ['p0']
    // No game comes back this way. Anyone who was mid-game is holding their own
    // redacted copy and cannot rebuild the authoritative one, so this reopens
    // the lobby rather than pretending to restore a table.
    this.game = null
    this.status = 'connected'
    this.attachHostHandlers()
    this.emit()
    return 'host'
  }

  /**
   * Watch a room without joining it.
   *
   * Same transport as a player, same redaction path, minus the seat. The TV
   * never sends an intent, so there is nothing to guard against beyond not
   * letting it occupy one of the six chairs.
   */
  async spectate(code: string): Promise<void> {
    this.role = 'client'
    this.status = 'connecting'
    this.error = null
    this.spectating = true
    this.emit()
    await this.connectAsClient(code, 'TV', true)
  }

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
        () => reject(new Error('Timed out reaching the signalling server. It may be busy - try again in a moment.')),
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
        this.send(conn, { t: 'kicked', reason: 'Different game version - everyone should reload the page.' })
        return
      }

      // A spectator watches and never acts, so it skips seat assignment
      // entirely. The redaction that hides other players' hands already does
      // the right thing for a viewer who is nobody: `redactFor` keeps only the
      // viewer's own hand, and a viewer with no seat has none, so every hand at
      // the table stays face down. No engine change, no new redaction path, and
      // no way for the TV to leak somebody's cards.
      if (msg.spectate) {
        this.spectators.add(conn)
        conn.on('close', () => this.spectators.delete(conn))
        this.send(conn, { t: 'welcome', you: SPECTATOR, lobby: this.hostLobby(), protocol: PROTOCOL_VERSION })
        if (this.game) this.send(conn, { t: 'state', state: redactFor(this.game, SPECTATOR), you: SPECTATOR })
        return
      }
      const seatResult = assignSeat({
        name: msg.name,
        clientId: msg.clientId,
        order: this.order,
        names: this.names,
        clients: this.clients,
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

      // Same browser reclaiming its chair: hang up the old socket first, or the
      // ghost keeps its seat in the lobby while the player sits in a new one.
      if (seatResult.takeover) {
        const stale = this.conns.get(pid)
        if (stale && stale !== conn) { try { stale.close() } catch { /* already gone */ } }
      }

      this.names.set(pid, seatResult.name)
      if (msg.clientId) this.clients.set(pid, msg.clientId)
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

  /**
   * Get out of the room. A guest simply disconnects and their seat is left for
   * them to reclaim; a host closing up ends it for everybody, so they are told
   * that before they do it. Either way the saved session goes, or the next load
   * would drag you straight back into the room you just left.
   */
  leave() {
    clearSession()
    for (const c of this.conns.values()) { try { c.close() } catch { /* already gone */ } }
    this.conns.clear()
    try { this.hostConn?.close() } catch { /* already gone */ }
    this.hostConn = null
    try { this.peer?.destroy() } catch { /* already gone */ }
    this.peer = null

    this.role = 'host'
    this.hotseat = false
    this.status = 'idle'
    this.code = ''
    this.you = null
    this.error = null
    this.names.clear()
    this.clients.clear()
    this.order = []
    this.game = null
    this.myState = null
    this.lobbyCache = []
    this.emit()
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
    for (const conn of this.spectators) {
      if (conn.open) this.send(conn, { t: 'lobby', lobby })
    }
  }

  private broadcastState() {
    if (!this.game) return
    for (const [pid, conn] of this.conns) {
      if (conn.open) this.send(conn, { t: 'state', state: redactFor(this.game, pid), you: pid })
    }
    // One redaction for every screen watching, because they all see the same
    // thing: nothing private at all.
    if (this.spectators.size) {
      const seen = redactFor(this.game, SPECTATOR)
      for (const conn of this.spectators) {
        if (conn.open) this.send(conn, { t: 'state', state: seen, you: SPECTATOR })
      }
    }
  }

  private send(conn: DataConnection, msg: HostMsg) {
    try { conn.send(msg) } catch { /* connection died mid-send */ }
  }

  // ---------------------------------------------------------------- CLIENT --

  async join(codeInput: string, displayName: string): Promise<void> {
    return this.connectAsClient(codeInput, displayName, false)
  }

  private async connectAsClient(codeInput: string, displayName: string, spectate: boolean): Promise<void> {
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
        conn.send({
          t: 'join', name: displayName, spectate: spectate || undefined,
          protocol: PROTOCOL_VERSION, clientId: clientId(),
        } satisfies ClientMsg)
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

}
