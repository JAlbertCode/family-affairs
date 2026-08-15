import type { GameState, Intent, PlayerId } from '../engine/types'

/** Bumped whenever the wire format changes, so stale tabs fail loudly. */
export const PROTOCOL_VERSION = 1

/** PeerJS ids are global across the public broker, so namespace ours. */
export const PEER_PREFIX = 'famaff-v1-'

export interface LobbyPlayer {
  id: PlayerId
  name: string
  connected: boolean
  isHost: boolean
}

// ---- client -> host --------------------------------------------------------

export type ClientMsg =
  | { t: 'join'; name: string; protocol: number }
  | { t: 'intent'; intent: Intent }
  | { t: 'rename'; name: string }
  | { t: 'ping' }

// ---- host -> client --------------------------------------------------------

export type HostMsg =
  | { t: 'welcome'; you: PlayerId; lobby: LobbyPlayer[]; protocol: number }
  | { t: 'lobby'; lobby: LobbyPlayer[] }
  | { t: 'state'; state: GameState; you: PlayerId }
  | { t: 'error'; message: string }
  | { t: 'kicked'; reason: string }
  | { t: 'pong' }

// ---- room codes ------------------------------------------------------------

// No I/O/0/1 — they get misread when people say the code out loud.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function makeRoomCode(len = 4): string {
  let out = ''
  const buf = new Uint32Array(len)
  crypto.getRandomValues(buf)
  for (let i = 0; i < len; i++) out += ALPHABET[buf[i] % ALPHABET.length]
  return out
}

export function normalizeRoomCode(input: string): string {
  return input.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function peerIdForRoom(code: string): string {
  return PEER_PREFIX + normalizeRoomCode(code)
}

// ---------------------------------------------------------------------------
// Seat assignment
//
// Pure so it can be tested without a browser or a signalling server. This is
// the logic that decides which chair a joining player gets, and getting it
// wrong is invisible until a lobby refuses to start.
// ---------------------------------------------------------------------------

export interface SeatRequest {
  /** requested display name */
  name: string
  /** seats already handed out, in order */
  order: PlayerId[]
  /** seat -> name */
  names: Map<PlayerId, string>
  /** seat -> is that seat's connection currently open? absent = never connected */
  connOpen: Map<PlayerId, boolean>
  /** the host's own seat, which no one may ever take */
  hostSeat: PlayerId | null
  /** has the game already started? */
  started: boolean
  maxPlayers: number
}

export type SeatResult =
  | { ok: true; seat: PlayerId; name: string; isNewSeat: boolean }
  | { ok: false; reason: string }

export function assignSeat(req: SeatRequest): SeatResult {
  // 1. Reconnect: only to a seat that actually held a connection and dropped,
  //    and never to the host's own seat (the host has no connection entry, so
  //    a naive check matches it and a same-named guest steals the chair).
  let seat: PlayerId | undefined
  for (const [id, n] of req.names) {
    if (id === req.hostSeat) continue
    if (n === req.name && req.connOpen.has(id) && req.connOpen.get(id) === false) { seat = id; break }
  }

  let isNewSeat = false
  if (!seat) {
    if (req.started) return { ok: false, reason: 'That game has already started.' }
    if (req.order.length >= req.maxPlayers) return { ok: false, reason: `This game is full (${req.maxPlayers} players).` }
    seat = `p${req.order.length}`
    isNewSeat = true
  }

  // 2. Two tabs in one browser share the remembered name; keep the lobby readable.
  let name = (req.name || 'Player').trim() || 'Player'
  const taken = new Set([...req.names].filter(([id]) => id !== seat).map(([, n]) => n))
  if (taken.has(name)) {
    let i = 2
    while (taken.has(`${name} (${i})`)) i++
    name = `${name} (${i})`
  }

  return { ok: true, seat, name, isNewSeat }
}
