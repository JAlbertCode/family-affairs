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
