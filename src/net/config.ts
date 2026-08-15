/**
 * Everything about HOW two browsers find each other, in one place.
 *
 * Two separate jobs, and it is worth keeping them straight because they fail
 * differently and cost differently:
 *
 *  1. SIGNALLING — a broker that introduces two browsers. It carries the
 *     handshake and nothing else. If it goes down, games already running are
 *     unaffected; nobody can start a NEW one. Default is PeerJS's free public
 *     broker: fine for testing, shared and rate-limited, so it is the first
 *     thing to replace if hosting a game starts failing.
 *
 *  2. ICE (STUN + TURN) — how the two browsers actually reach each other once
 *     introduced. STUN is free and gets most pairs connected directly. TURN
 *     relays the traffic when they cannot, which is the 10-20% of players on
 *     symmetric NAT, strict corporate wifi, or certain mobile carriers. Without
 *     a TURN server those players do not get a slow game, they get no game.
 *
 * Both are configured by environment variable so switching to a self-hosted
 * broker or a paid TURN tier is a rebuild, not a rewrite. Nothing here is a
 * secret: TURN credentials ship to the browser by design, which is why every
 * provider issues short-lived ones. Treat them as rate limits, not passwords.
 */

const env = import.meta.env

/** `a, b , c` -> ['a','b','c'] */
function list(v: string | undefined): string[] {
  return (v ?? '').split(',').map((s) => s.trim()).filter(Boolean)
}

const STUN_URLS = list(env.VITE_STUN_URLS).length
  ? list(env.VITE_STUN_URLS)
  : ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302']

const TURN_URLS = list(env.VITE_TURN_URLS)
const TURN_USERNAME = env.VITE_TURN_USERNAME as string | undefined
const TURN_CREDENTIAL = env.VITE_TURN_CREDENTIAL as string | undefined

/** True when a relay is available, so the UI can be honest about the odds. */
export const hasTurn = TURN_URLS.length > 0 && !!TURN_USERNAME && !!TURN_CREDENTIAL

export function iceServers(): RTCIceServer[] {
  const out: RTCIceServer[] = [{ urls: STUN_URLS }]
  if (hasTurn) {
    out.push({ urls: TURN_URLS, username: TURN_USERNAME, credential: TURN_CREDENTIAL })
  }
  return out
}

/**
 * PeerJS options. With no signalling env vars set this returns exactly what the
 * library defaults to — the public broker — so the app runs with zero config.
 */
export function peerOptions() {
  const host = env.VITE_PEER_HOST as string | undefined
  const base: Record<string, unknown> = {
    config: {
      iceServers: iceServers(),
      // With a relay available, gathering keeps going after the first direct
      // candidate so a blocked pair still has a fallback route to try.
      iceCandidatePoolSize: hasTurn ? 4 : 0,
    },
    debug: 0,
  }
  if (!host) return base

  return {
    ...base,
    host,
    port: Number(env.VITE_PEER_PORT ?? 443),
    path: (env.VITE_PEER_PATH as string | undefined) ?? '/',
    secure: (env.VITE_PEER_SECURE ?? 'true') !== 'false',
  }
}

/** Shown on the connection screen so a failure is diagnosable, not mysterious. */
export function networkSummary(): string {
  const broker = (env.VITE_PEER_HOST as string | undefined) ?? 'the public PeerJS broker'
  return hasTurn
    ? `Signalling via ${broker}, with a relay available if a direct connection is blocked.`
    : `Signalling via ${broker}. No relay is configured, so players on a restrictive network may not be able to connect.`
}
