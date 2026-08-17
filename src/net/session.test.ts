// What this browser remembers between loads, and the two ways it used to
// forget. Both of them looked identical from the sofa: you shared the link,
// you came back, and the game had a brand new room code.
//
//   1. A second tab wrote a thinner record over the one holding the game. On a
//      phone a shared link opens in a new tab as a matter of course, and both
//      tabs read the same localStorage, so this was not an edge case.
//   2. A session that had timed out was allowed to invalidate the room code in
//      the URL. Those two facts have nothing to do with each other, and the URL
//      is the only copy of the code that outlives storage.
//
// Neither is reachable from a browser test without moving the clock and owning
// two tabs at once, which is exactly why they survived so long.

class FakeStore {
  private m = new Map<string, string>()
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null }
  setItem(k: string, v: string) { this.m.set(k, v) }
  removeItem(k: string) { this.m.delete(k) }
  get size() { return this.m.size }
}

let now = 1_000_000_000_000
const realNow = Date.now
Date.now = () => now

const local = new FakeStore()
const session = new FakeStore()
;(globalThis as any).localStorage = local
;(globalThis as any).sessionStorage = session

const {
  saveSession, loadSession, clearSession, lastRole, liveElsewhere, claimLive,
} = await import('./session')

let pass = 0
const failures: string[] = []
function check(label: string, cond: boolean) {
  if (cond) pass++
  else failures.push(label)
}
function reset() { clearSession(); local.removeItem('fa.live'); session.removeItem('fa.tab') }

const HOUR = 60 * 60 * 1000
const MINUTE = 60 * 1000
const game = { fake: 'state' } as any

// --- 1. a thinner record must not land on a fatter one --------------------
{
  reset()
  saveSession({ role: 'host', code: 'ABCD', name: 'Jay', game, order: ['p0'] })
  // The second tab joins the same room as a guest, because that is what
  // `recover` does when it finds the code already taken - by the first tab.
  saveSession({ role: 'client', code: 'ABCD', name: 'Jay' })
  const s = loadSession()
  check('host-with-game survives a client write', s?.role === 'host' && !!s?.game)
}
{
  reset()
  saveSession({ role: 'host', code: 'ABCD', name: 'Jay', game, order: ['p0'] })
  // The second tab reopens the room as host. It has no game to restore, and
  // saying so would throw away the only copy of the one being played.
  saveSession({ role: 'host', code: 'ABCD', name: 'Jay', order: ['p0'] })
  check('host-with-game survives an empty host write', !!loadSession()?.game)
}
{
  reset()
  saveSession({ role: 'client', code: 'ABCD', name: 'Jay' })
  saveSession({ role: 'host', code: 'ABCD', name: 'Jay', game, order: ['p0'] })
  check('trading up is always allowed', loadSession()?.role === 'host')
}
{
  reset()
  saveSession({ role: 'host', code: 'ABCD', name: 'Jay', game, order: ['p0'] })
  saveSession({ role: 'client', code: 'WXYZ', name: 'Jay' })
  check('a different room is a different question', loadSession()?.code === 'WXYZ')
}
{
  // Leaving and finishing both clear first, so a genuine step down is never
  // blocked. If it were, the next load would drag you back into a dead game.
  reset()
  saveSession({ role: 'host', code: 'ABCD', name: 'Jay', game, order: ['p0'] })
  clearSession()
  saveSession({ role: 'client', code: 'ABCD', name: 'Jay' })
  check('clearing first lets you step down', loadSession()?.role === 'client')
}
{
  reset()
  saveSession({ role: 'host', code: 'ABCD', name: 'Jay', game, order: ['p0'] })
  now += 5 * HOUR
  saveSession({ role: 'client', code: 'ABCD', name: 'Jay' })
  check('yesterday does not get a veto', loadSession()?.role === 'client')
  now -= 5 * HOUR
}

// --- 2. how long a session is worth resuming ------------------------------
{
  reset()
  saveSession({ role: 'host', code: 'ABCD', name: 'Jay', order: ['p0'] })
  now += 21 * MINUTE
  check('a lobby goes cold in twenty minutes', loadSession() === null)
  // The room may still be running. Which side of it this browser was on is
  // thirty bytes and is exactly what the way back in needs to know.
  check('an expired session keeps the note about the room', lastRole('ABCD')?.role === 'host')
  now -= 21 * MINUTE
}
{
  reset()
  saveSession({ role: 'host', code: 'ABCD', name: 'Jay', order: ['p0'] })
  clearSession()
  check('leaving drops the note too', lastRole('ABCD') === null)
}
{
  reset()
  saveSession({ role: 'host', code: 'ABCD', name: 'Jay', game, order: ['p0'] })
  now += 3 * HOUR
  check('a game in progress is worth coming back to', loadSession()?.code === 'ABCD')
  now -= 3 * HOUR
}
{
  reset()
  saveSession({ role: 'host', code: 'ABCD', name: 'Jay', game, order: ['p0'] })
  now += 5 * HOUR
  check('but not for ever', loadSession() === null)
  now -= 5 * HOUR
}

// --- 3. the two stores fail apart, so the newer one wins ------------------
{
  reset()
  // A game state is big. localStorage is the store that hits a quota first, and
  // the failure is silent - so it can be left holding an older, smaller record
  // while sessionStorage has the current one. Reading it in order would have
  // restored the wrong game.
  saveSession({ role: 'host', code: 'OLDX', name: 'Jay', game, order: ['p0'] })
  now += MINUTE
  session.setItem('fa.session', JSON.stringify({
    v: 1, role: 'host', code: 'NEWX', name: 'Jay', at: now, order: ['p0'], game,
  }))
  check('the newer of the two stores wins', loadSession()?.code === 'NEWX')
}

// --- 4. one tab at a time ------------------------------------------------
{
  reset()
  claimLive('ABCD')
  check('a tab does not see itself', liveElsewhere('ABCD') === false)
}
{
  reset()
  // A reload is the same tab: sessionStorage carries the tab id through it,
  // which is the whole reason the id lives there. Get this wrong and every
  // refresh looks like a duplicate tab and refuses to put you back.
  claimLive('ABCD')
  const survives = session.getItem('fa.tab')
  check('a reload is still the same tab', !!survives && liveElsewhere('ABCD') === false)
}
{
  reset()
  claimLive('ABCD')
  session.removeItem('fa.tab')  // a new tab starts with empty sessionStorage
  check('a second tab is seen', liveElsewhere('ABCD') === true)
}
{
  reset()
  claimLive('ABCD')
  session.removeItem('fa.tab')
  check('a different room is not a clash', liveElsewhere('WXYZ') === false)
}
{
  reset()
  claimLive('ABCD')
  session.removeItem('fa.tab')
  now += 7000
  check('a claim rots when the tab stops writing', liveElsewhere('ABCD') === false)
  now -= 7000
}

Date.now = realNow
if (failures.length) {
  console.error(`session: ${failures.length} failed`)
  for (const f of failures) console.error(`  ✗ ${f}`)
  process.exit(1)
}
console.log(`session: ${pass} checks pass`)

export {}
