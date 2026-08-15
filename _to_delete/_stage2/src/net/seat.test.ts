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
  connOpen: new Map(),      // host has no connection entry — that was the trap
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

console.log(`\n=== SEAT ASSIGNMENT ===`)
console.log(`${pass} passed, ${failures.length} failed`)
for (const f of failures) console.log(`  ✗ ${f}`)
if (failures.length) process.exit(1)
console.log('')
