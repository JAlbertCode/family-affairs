// Drives the built app in a real browser: starts a pass-and-play game and plays
// real turns through the actual UI, catching console errors and dead ends.
//
// Run:  npm run build
//       npx vite preview --port 4173 &
//       node src/sim/uitest.mjs
//
// Selectors here track the real DOM. When the UI is restructured this file has
// to move with it - a harness that silently stops finding the play button
// reports a perfectly healthy game in which nobody ever does anything, which is
// worse than no harness at all.
import { chromium } from 'playwright'

const URL = process.env.URL ?? 'http://localhost:4173/'
const STEPS = Number(process.env.STEPS ?? 420)

const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})
const page = await browser.newPage({ viewport: { width: 414, height: 896 } })
page.setDefaultTimeout(2000)

const errors = []
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))
page.on('console', (m) => {
  const t = m.text()
  if (m.type() === 'error' && !t.includes('404') && !t.includes('Failed to load resource')) errors.push(t)
})

await page.goto(URL, { waitUntil: 'domcontentloaded' })
await page.getByTestId('local-mode').click()
await page.getByTestId('start-local').click()
await page.waitForSelector('.topbar')
console.log('game started')

const click = async (loc) => {
  try { if (await loc.count()) { await loc.first().click({ timeout: 1200 }); return true } } catch {}
  return false
}
const closeSheet = async () => {
  if (await click(page.locator('.cardsheet-actions .btn.ghost'))) return true
  if (await click(page.locator('.ai-close'))) return true
  if (await click(page.locator('.sheet .btn.ghost'))) return true
  try { await page.mouse.click(207, 12) } catch {}
  return false
}

// The ladders live behind Details, which the step loop deliberately never
// opens (a read-only sheet consumes nothing, so cycling onto it reopens the
// same panel forever). They are the only place the game says what a drink does
// to a particular Character, so check them once, on the way past.
let ladderRungs = 0
let clipped = 0
try {
  // The first-run coach is a modal with a cut-out that swallows clicks
  // everywhere else, so it has to go before anything can be tapped.
  for (let i = 0; i < 8 && (await page.locator('.coach').count()); i++) {
    await click(page.locator('.coach-actions .btn.ghost'))
    await page.waitForTimeout(160)
  }
  await click(page.locator('.myslots .tok:not(.tok-empty)').first())
  await page.waitForTimeout(250)
  await click(page.locator('.actionsheet .chip.ghost'))
  await page.waitForTimeout(300)
  ladderRungs = await page.locator('.rung').count()
  // Nothing on an opened card should be hidden behind a control. The sheet used
  // to clip the rules text and put a "more" button over the last line, so a
  // Character's flaw was routinely something nobody had read.
  clipped = await page.locator('.face-more').count()
  await closeSheet()
  await page.waitForTimeout(200)
} catch { /* reported as zero below */ }

let played = 0, attacks = 0, battles = 0, turns = 0, abilities = 0, minigames = 0, idle = 0

for (let i = 0; i < STEPS; i++) {
  if (await page.locator('.winner').count()) { console.log('GAME OVER reached'); break }
  try {
  // The first-run coach is a modal with a cut-out that swallows clicks
  // everywhere else on the page. It is only shown once per browser, so it
  // never appears in a manual retest of a game already in progress - and a
  // harness that silently sits behind it reports a perfectly healthy game in
  // which nobody ever does anything, which is exactly the failure this file's
  // header warns about. It went unnoticed for a whole session.
  if (await page.locator('.coach').count()) {
    await click(page.locator('.coach-actions .btn.ghost'))
    continue
  }
  // Every branch below `continue`s, so progress has to be counted here or a
  // loop that opens and closes the same sheet forever looks like a healthy run.
  idle++
  if (idle > 25) {
    console.log('\n=== STUCK: no progress in 25 steps ===')
    console.log('buttons:', JSON.stringify((await page.locator('button:not([disabled])').allTextContents()).slice(0, 20)))
    await page.screenshot({ path: 'stuck.png' })
    break
  }

  // pass-and-play handoff, battles and Affairs all gate the board
  if (await click(page.locator('.handoff button'))) continue
  if (await click(page.getByRole('button', { name: /^Pass |^Continue$/ }))) { battles++; continue }
  if (await click(page.getByRole('button', { name: /^Draw / }))) continue
  if (await click(page.locator('.mg-throw:not([disabled])'))) { minigames++; continue }
  if (await click(page.locator('.mg-cell:not([disabled])'))) { minigames++; continue }
  if (await page.locator('.mg').count()) { await page.waitForTimeout(60); continue }
  if (await click(page.locator('.affair-card .btn'))) continue

  // an open sheet blocks everything behind it, so deal with it first
  if (!(await page.locator('.targetbar').count())) {
    const play = page.getByRole('button', { name: /^Play / })
    if ((await play.count()) && (await play.first().isEnabled())) {
      await click(play)
      await page.waitForTimeout(120)
      if (await page.locator('.targetbar').count()) {
        if (!(await click(page.locator('.tok.target')))) await click(page.getByRole('button', { name: 'Cancel' }))
      }
      played++; idle = 0; continue
    }
    // A board token's sheet: attack, ability, Power Move or an item. Scope this
    // to the sheet itself - matching glyphs anywhere on the page started
    // catching board tokens once Characters began rendering 🍺🌿🍔 limit meters
    // and item icons, and the harness spent every step clicking tokens.
    // .chip.ghost is "Details", which opens a read-only sheet and consumes
    // nothing - cycling onto it just reopens the same panel forever.
    const act = page.locator('.actionsheet .chip:not([disabled]):not(.ghost)')
    if (await act.count()) {
      const k = await act.count()
      const pick = act.nth(i % k)
      // The chip list changes as the sheet re-renders - selecting a Character
      // adds a Move chip per slot, using an item removes one - so the handle
      // can go stale between reading it and clicking it. That is a harness
      // problem, not a game problem, and it should not end the run.
      let label = ''
      try { label = (await pick.textContent()) ?? '' } catch { continue }
      await click(pick)
      await page.waitForTimeout(160)
      if (await page.locator('.tok.target').count()) await click(page.locator('.tok.target'))
      else if (await page.locator('.targetbar').count()) await click(page.getByRole('button', { name: 'Cancel' }))
      if (label.trim().startsWith('⚔')) attacks++; else abilities++
      idle = 0; continue
    }
    if (await page.locator('.sheet-bg, .cardsheet, .actionsheet').count()) { await closeSheet(); continue }
  }

  // play something out of hand
  const hand = page.locator('.hs-card.playable')
  const hc = await hand.count()
  if (hc) { await click(hand.nth(i % hc)); await page.waitForTimeout(120); continue }

  // otherwise poke one of my own Characters and see what it offers
  const mine = page.locator('.myslots .tok:not(.tok-empty)')
  const n = await mine.count()
  if (n && i % 3 !== 2) {
    await click(mine.nth(i % n))
    await page.waitForTimeout(140)
    continue
  }

  // End turn last: it is always available, so trying it first means the
  // harness never plays a single card.
  if (await click(page.locator('.actionbar button', { hasText: 'End turn' }))) { turns++; idle = 0; continue }

  await page.waitForTimeout(50)
  } catch (e) {
    // A long run in a small container can lose the browser to memory pressure.
    // That is the harness dying, not the game, and it should report what it got
    // to rather than throwing a stack trace over the top of the numbers.
    console.log(`stopped early at step ${i}: ${String(e).split('\n')[0]}`)
    break
  }
}

console.log(`\nlimit ladders: ${ladderRungs} rungs${ladderRungs ? '' : '  <-- NOT RENDERING'}`)
console.log(`card clipped:  ${clipped ? 'YES - "more" button is back' : 'no, whole card visible'}`)
console.log(`turns ended:   ${turns}`)
console.log(`cards played:  ${played}`)
console.log(`attacks:       ${attacks}`)
console.log(`abilities:     ${abilities}`)
console.log(`minigame moves:${minigames}`)
console.log(`battle steps:  ${battles}`)
console.log(`reached:       ${await page.locator('.round').first().textContent().catch(() => '?')}`)
console.log(`console errors: ${errors.length}`)
errors.slice(0, 10).forEach((e) => console.log('  !', e))

await browser.close()
process.exit(errors.length ? 1 : 0)
