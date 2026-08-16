import { assignSeat, type SeatRequest } from './protocol'

// Regression tests for the lobby bug where the host could never start a game.
// Two tabs in the same browser share localStorage, so they send the SAME name.
// The old reconnect check matched the host's own seat (the host has no entry in
// the connection map, so "is their connection closed?" was vacuously true) and
// the second tab silently took the host's chair, pinning the lobby at 1 player.

let pass = 0
const failures: string[] = []

function check(label: string, cond: boolean) {
  if (cond) pass++
  else failures.push(label)
}

const base = (over: Partial<SeatRequest> = {}): SeatRequest => ({
  name: 'Jay',
  order: ['p0'],
  names: new Map([['p0', 'Jay']]),
  connOpen: new Map(),      // host has no connection entry - that was the trap
  hostSeat: 'p0',
  started: false,
  maxPlayers: 6,
  ...over,
})

// --- the actual bug -------------------------------------------------------
{
  const r = assignSeat(base())
  check('same-named guest does NOT take the host seat', r.ok && r.seat === 'p1')
  check('same-named guest gets a brand new seat', r.ok && r.isNewSeat === true)
  check('duplicate name is disambiguated', r.ok && r.name === 'Jay (2)')
}

// --- a third tab, same name ------------------------------------------------
{
  const r = assignSeat(base({
    order: ['p0', 'p1'],
    names: new Map([['p0', 'Jay'], ['p1', 'Jay (2)']]),
    connOpen: new Map([['p1', true]]),
  }))
  check('third tab gets its own seat', r.ok && r.seat === 'p2')
  check('third tab name avoids both taken names', r.ok && r.name === 'Jay (3)')
}

// --- genuine reconnect still works -----------------------------------------
{
  const r = assignSeat(base({
    order: ['p0', 'p1'],
    names: new Map([['p0', 'Host'], ['p1', 'Moe']]),
    connOpen: new Map([['p1', false]]),   // Moe was here and dropped
    name: 'Moe',
  }))
  check('dropped player reclaims their seat', r.ok && r.seat === 'p1')
  check('reclaimed seat is not a new seat', r.ok && r.isNewSeat === false)
  check('reclaimed player keeps their name', r.ok && r.name === 'Moe')
}

// --- a still-connected player cannot be displaced ---------------------------
{
  const r = assignSeat(base({
    order: ['p0', 'p1'],
    names: new Map([['p0', 'Host'], ['p1', 'Moe']]),
    connOpen: new Map([['p1', true]]),    // Moe is still here
    name: 'Moe',
  }))
  check('impostor cannot take a live seat', r.ok && r.seat === 'p2')
}

// --- capacity and lifecycle -------------------------------------------------
{
  const full = assignSeat(base({
    order: ['p0', 'p1', 'p2', 'p3', 'p4', 'p5'],
    names: new Map([['p0', 'a'], ['p1', 'b'], ['p2', 'c'], ['p3', 'd'], ['p4', 'e'], ['p5', 'f']]),
    connOpen: new Map([['p1', true], ['p2', true], ['p3', true], ['p4', true], ['p5', true]]),
    name: 'g',
  }))
  check('seventh player is refused', !full.ok)

  const started = assignSeat(base({ started: true, name: 'Newcomer' }))
  check('newcomer refused once the game began', !started.ok)

  const rejoinStarted = assignSeat(base({
    started: true,
    order: ['p0', 'p1'],
    names: new Map([['p0', 'Host'], ['p1', 'Moe']]),
    connOpen: new Map([['p1', false]]),
    name: 'Moe',
  }))
  check('but a dropped player may rejoin a running game', rejoinStarted.ok && rejoinStarted.seat === 'p1')
}

// --- blank names ------------------------------------------------------------
{
  const r = assignSeat(base({ name: '   ', names: new Map([['p0', 'Host']]) }))
  check('blank name falls back to a default', r.ok && r.name === 'Player')
}

// --- the ghost-seat bug ---------------------------------------------------
// Reported from a real game: somebody backed out, their old seat stayed in the
// lobby, and they came back as a second player called "Jay (2)". The old check
// only reconnected you when the host had already seen your socket close, and a
// closed tab does not always report that in time.
{
  // Same browser returns while the host still believes the old socket is open.
  const r = assignSeat(base({
    name: 'Jay',
    clientId: 'cabc',
    order: ['p0', 'p1'],
    names: new Map([['p0', 'Host'], ['p1', 'Jay']]),
    clients: new Map([['p1', 'cabc']]),
    connOpen: new Map([['p1', true]]),
  }))
  check('same browser reclaims its seat even while the old socket looks open',
    r.ok && r.seat === 'p1' && !r.isNewSeat && r.takeover === true)
  check('and keeps its own name rather than becoming Jay (2)', r.ok && r.name === 'Jay')
}
{
  // A genuinely different person with the same name still gets their own seat.
  const r = assignSeat(base({
    name: 'Jay',
    clientId: 'cdifferent',
    order: ['p0', 'p1'],
    names: new Map([['p0', 'Host'], ['p1', 'Jay']]),
    clients: new Map([['p1', 'cabc']]),
    connOpen: new Map([['p1', true]]),
  }))
  check('a different browser with the same name gets a new seat',
    r.ok && r.seat === 'p2' && r.isNewSeat)
  check('and is disambiguated in the lobby', r.ok && r.name === 'Jay (2)')
}
{
  // A returning browser gets its seat back even after the game has started,
  // which is the case that matters most: mid-game refresh.
  const r = assignSeat(base({
    name: 'Jay',
    clientId: 'cabc',
    order: ['p0', 'p1'],
    names: new Map([['p0', 'Host'], ['p1', 'Jay']]),
    clients: new Map([['p1', 'cabc']]),
    connOpen: new Map([['p1', false]]),
    started: true,
  }))
  check('a mid-game reconnect is allowed back into a started game',
    r.ok && r.seat === 'p1' && !r.isNewSeat)
}
{
  // The host's chair is never reclaimable by a guest, id or no id.
  const r = assignSeat(base({
    name: 'Host',
    clientId: 'chost',
    order: ['p0'],
    names: new Map([['p0', 'Host']]),
    clients: new Map([['p0', 'chost']]),
    connOpen: new Map(),
  }))
  check('the host seat is still never handed to a joiner', r.ok && r.seat !== 'p0')
}


console.log(`\n=== SEAT ASSIGNMENT ===`)
console.log(`${pass} passed, ${failures.length} failed`)
for (const f of failures) console.log(`  ✗ ${f}`)
if (failures.length) process.exit(1)
console.log('')
