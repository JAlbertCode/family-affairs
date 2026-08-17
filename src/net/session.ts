import type { GameState, PlayerId } from '../engine/types'

// ---------------------------------------------------------------------------
// Everything this browser remembers between loads.
//
// Kept out of room.ts because none of it needs a peer, a connection or a game
// engine, and because the rules in here are the ones that decide whether
// somebody who shares a link and comes back gets their room or a stranger's
// empty lobby. That is worth being able to test without a network.
// ---------------------------------------------------------------------------

const SESSION_KEY = 'fa.session'
const CLIENT_ID_KEY = 'fa.clientId'
const ROLE_KEY = 'fa.lastRole'
const LIVE_KEY = 'fa.live'
const TAB_KEY = 'fa.tab'

/**
 * An id for this tab that survives a reload but is not shared with any other
 * tab. sessionStorage is the only store with exactly that lifetime: localStorage
 * is shared by every tab, and a plain variable dies on refresh - and a refresh
 * that looked like a second tab would break the thing this exists to protect.
 */
function tabId(): string {
  try {
    let id = sessionStorage.getItem(TAB_KEY)
    if (!id) { id = `t${Math.random().toString(36).slice(2)}`; sessionStorage.setItem(TAB_KEY, id) }
    return id
  } catch { return `t${Math.random().toString(36).slice(2)}` }
}

const LIVE_STALE_MS = 6000

/**
 * Is some other tab of this browser holding this room right now?
 *
 * Sharing a link on a phone almost always opens it in a second tab, and both
 * tabs read the same localStorage. Left alone the second tab tries to resume a
 * room the first one still has: it spends half a minute failing to take the
 * peer id back, and the player watching it thinks the game broke.
 */
export function liveElsewhere(code: string): boolean {
  try {
    const raw = localStorage.getItem(LIVE_KEY)
    if (!raw) return false
    const l = JSON.parse(raw) as { code: string; tab: string; at: number }
    return l.code === code && l.tab !== tabId() && Date.now() - l.at < LIVE_STALE_MS
  } catch { return false }
}

/** Say this tab has this room. Called on a timer, because the only claim worth
 *  reading is a recent one: a tab that dies stops writing and the claim rots. */
export function claimLive(code: string) {
  try {
    localStorage.setItem(LIVE_KEY, JSON.stringify({ code, tab: tabId(), at: Date.now() }))
  } catch { /* private mode; the claim just never gets made */ }
}


/** Stable per-browser id. Identity that survives a reload, unlike a socket. */
export function clientId(): string {
  try {
    let id = localStorage.getItem(CLIENT_ID_KEY)
    if (!id) {
      id = `c${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
      localStorage.setItem(CLIENT_ID_KEY, id)
    }
    return id
  } catch {
    return `c${Math.random().toString(36).slice(2)}`
  }
}
/**
 * How long a session is worth coming back to.
 *
 * A game in progress is worth restoring hours later - people put a game down
 * and pick it up. A lobby is not. The room code now stays in the URL until
 * somebody deliberately leaves, and a host session is written the moment a room
 * opens, so without a shorter fuse on the lobby case every future visit to the
 * site drops you straight back into an empty room from last night instead of
 * the main menu. Twenty minutes is long enough for the case the lobby session
 * exists for - reload after sharing the link, which happens in seconds - and
 * short enough that it is never what greets you tomorrow.
 */
const SESSION_MAX_AGE_MS = 4 * 60 * 60 * 1000
const LOBBY_MAX_AGE_MS = 20 * 60 * 1000

export interface SavedSession {
  v: 1
  role: 'host' | 'client'
  code: string
  name: string
  at: number
  /** host only: the game it was running, if one had started */
  game?: GameState
  order?: PlayerId[]
  names?: [PlayerId, string][]
  clients?: [PlayerId, string][]
}

function parse(raw: string | null): SavedSession | null {
  if (!raw) return null
  try {
    const s = JSON.parse(raw) as SavedSession
    if (s?.v !== 1 || !s.code || !s.name) return null
    return s
  } catch { return null }
}

/**
 * Whatever this browser last saved, ignoring how old it is.
 *
 * Whichever of the two stores is newer wins. They are written together but they
 * fail apart: a game state is big enough to hit a localStorage quota that a
 * session-storage copy of the same thing might survive, and then the store that
 * silently kept yesterday's smaller record would otherwise be the one read.
 */
function readSession(): SavedSession | null {
  let a: SavedSession | null = null
  let b: SavedSession | null = null
  try { a = parse(localStorage.getItem(SESSION_KEY)) } catch { /* private mode */ }
  try { b = parse(sessionStorage.getItem(SESSION_KEY)) } catch { /* private mode */ }
  if (!a) return b
  if (!b) return a
  return b.at > a.at ? b : a
}

export function loadSession(): SavedSession | null {
  const s = readSession()
  if (!s) return null
  // A host session with no game in it was a lobby, and a lobby goes stale
  // fast. A client cannot tell from its own session whether a game had
  // started, so it gets the short fuse too: rejoining a room that is still
  // live is what the comeback panel is for.
  const age = Date.now() - s.at
  const inGame = s.role === 'host' && !!s.game
  if (age > (inGame ? SESSION_MAX_AGE_MS : LOBBY_MAX_AGE_MS)) {
    // Only the automatic resume is off. The code in the URL still stands - it is
    // the one copy that outlives storage - and so does the thirty-byte note
    // saying which side of that room this browser was on, because the room may
    // well still be running and both of those are how somebody gets back in.
    forget()
    return null
  }
  return s
}

/** Drop the saved state but keep the note about which room this browser was in.
 *  Used when a session simply got old, which says nothing about the room. */
function forget() {
  try { localStorage.removeItem(SESSION_KEY) } catch { /* private mode */ }
  try { sessionStorage.removeItem(SESSION_KEY) } catch { /* private mode */ }
}

/** Drop everything. For leaving and for a finished game: both mean this browser
 *  has no business anywhere near that room again. */
export function clearSession() {
  forget()
  try { localStorage.removeItem(ROLE_KEY) } catch { /* private mode */ }
  try { localStorage.removeItem(LIVE_KEY) } catch { /* private mode */ }
}

/** What a saved session is worth. Hosting a game beats hosting a lobby beats
 *  holding a guest seat, and nothing may trade down. */
function rank(s: Pick<SavedSession, 'role' | 'game'>): number {
  return s.role === 'client' ? 1 : s.game ? 3 : 2
}

export function saveSession(s: Omit<SavedSession, 'v' | 'at'>) {
  // Two tabs of the same browser share this storage, and the second one is
  // normally a link somebody opened out of a group chat. It must never write
  // its thinner record - a guest seat, or a lobby with no game in it - over the
  // tab that is holding the authoritative game, because the host holds the only
  // copy there is. Every deliberate step down (leaving, a finished game) clears
  // the session first, so a hard no here costs nothing.
  const prev = readSession()
  if (prev && prev.code === s.code && Date.now() - prev.at < SESSION_MAX_AGE_MS && rank(prev) > rank(s)) return
  const raw = JSON.stringify({ ...s, v: 1, at: Date.now() })
  // Both stores, because they fail differently. localStorage is the one that
  // survives the tab being discarded and reopened, but it is also the one iOS
  // refuses in private browsing and evicts under storage pressure.
  // sessionStorage survives neither of those but does survive a plain reload,
  // and a game state is a few hundred KB, which is enough to hit a quota that
  // a room code never would.
  try { localStorage.setItem(SESSION_KEY, raw) } catch { /* quota or private mode */ }
  try { sessionStorage.setItem(SESSION_KEY, raw) } catch { /* nothing left to try */ }
  // Last resort, and the important one: the code on its own is tiny and never
  // hits a quota. If everything above failed, the URL still carries it and this
  // tells the next load that this browser was the host rather than a guest.
  try { localStorage.setItem(ROLE_KEY, `${s.role}:${s.code}:${s.name}`) } catch { /* give up */ }
}

/**
 * What this browser was, for a room code it can still see in the URL.
 *
 * The full session is a whole GameState. This is thirty bytes, so it survives
 * things the session does not, and it answers the only question that matters
 * when somebody comes back to a room they can no longer prove they were in:
 * do you reopen this, or do you knock on it.
 */
export function lastRole(code: string): { role: 'host' | 'client'; name: string } | null {
  try {
    const raw = localStorage.getItem(ROLE_KEY)
    if (!raw) return null
    const [role, c, ...rest] = raw.split(':')
    if (c !== code || (role !== 'host' && role !== 'client')) return null
    return { role, name: rest.join(':') }
  } catch { return null }
}

