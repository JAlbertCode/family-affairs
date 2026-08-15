import { iceServers, hasTurn } from './config'

/**
 * A real connectivity test, not a guess.
 *
 * "It won't connect" is the least actionable bug report a peer-to-peer game can
 * get, because the failure is in the player's network rather than in anything
 * they can see. This gathers ICE candidates against the actual configured
 * servers and reports which kinds came back:
 *
 *   host   — this machine's own addresses. Always present.
 *   srflx  — STUN worked: the internet can see a route back to this browser.
 *            Enough on its own for most players.
 *   relay  — TURN worked: even if a direct route is impossible, traffic can be
 *            bounced through the relay. This is the one that saves the 10-20%
 *            of players behind symmetric NAT or strict wifi.
 *
 * No relay candidate while TURN is configured means the credentials are wrong
 * or exhausted — worth knowing before six people are sitting around waiting.
 */

export type CheckVerdict = 'good' | 'direct-only' | 'blocked' | 'unsupported'

export interface CheckResult {
  verdict: CheckVerdict
  host: boolean
  srflx: boolean
  relay: boolean
  /** one line, written for a player rather than for a network engineer */
  message: string
  ms: number
}

export async function checkConnection(timeoutMs = 6000): Promise<CheckResult> {
  const started = Date.now()
  const found = { host: false, srflx: false, relay: false }

  if (typeof RTCPeerConnection === 'undefined') {
    return {
      verdict: 'unsupported', ...found, ms: 0,
      message: 'This browser cannot do peer-to-peer connections. Chrome, Edge, Firefox or Safari 15+ all work.',
    }
  }

  const pc = new RTCPeerConnection({ iceServers: iceServers() })

  try {
    await new Promise<void>((resolve) => {
      const done = () => resolve()
      const timer = setTimeout(done, timeoutMs)

      pc.onicecandidate = (e) => {
        if (!e.candidate) { clearTimeout(timer); done(); return }
        const type = e.candidate.type ?? parseType(e.candidate.candidate)
        if (type === 'host') found.host = true
        if (type === 'srflx' || type === 'prflx') found.srflx = true
        if (type === 'relay') {
          found.relay = true
          // A relay candidate is the answer to the only question that matters.
          clearTimeout(timer)
          done()
        }
      }

      // A data channel is required or nothing is gathered at all — this is the
      // same transport the game itself uses, so the test is representative.
      pc.createDataChannel('probe')
      pc.createOffer()
        .then((o) => pc.setLocalDescription(o))
        .catch(() => { clearTimeout(timer); done() })
    })
  } finally {
    pc.onicecandidate = null
    pc.close()
  }

  const ms = Date.now() - started
  return { ...found, ms, ...verdictFor(found) }
}

function parseType(candidate: string): string | undefined {
  return /\btyp (\w+)/.exec(candidate)?.[1]
}

function verdictFor(f: { host: boolean; srflx: boolean; relay: boolean }): { verdict: CheckVerdict; message: string } {
  if (f.relay) {
    return {
      verdict: 'good',
      message: 'Connection looks good. Direct play works, and there is a relay to fall back on if your network blocks it.',
    }
  }
  if (f.srflx) {
    return {
      verdict: 'direct-only',
      message: hasTurn
        ? 'You can connect to other players directly. The relay did not answer, so a player on a very restrictive network may still have trouble reaching you.'
        : 'You can connect to other players directly. No relay is set up, so if someone cannot reach you, everyone joining the same wifi usually fixes it.',
    }
  }
  return {
    verdict: 'blocked',
    message: 'This network is blocking the connection the game needs — office and guest wifi often do. Try a phone hotspot, or play pass-and-play on one device.',
  }
}
