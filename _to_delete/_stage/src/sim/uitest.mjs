// Drives the built app in a real browser: starts a pass-and-play game and
// plays real turns through the actual UI, catching console errors and dead ends.
import { chromium } from 'playwright'

const URL = process.env.URL ?? 'http://localhost:4173/'
const MAX_TURNS = Number(process.env.TURNS ?? 60)

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})
const page = await browser.newPage({ viewport: { width: 414, height: 896 } })
page.setDefaultTimeout(1200)

const errors = []
page.on('console', (m) => {
  const t = m.text()
  // art/*.png 404s are expected until real card art is dropped in
  if (m.type() === 'error' && !t.includes('404')) errors.push(t)
})
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))

await page.goto(URL, { waitUntil: 'domcontentloaded' })
await page.getByTestId('local-mode').click()
await page.getByTestId('start-local').click()
await page.waitForSelector('.topbar')
console.log('game started, table rendered')
await page.screenshot({ path: '/home/claude/fa/shots/01-table.png' })

const click = async (loc) => {
  try { if (await loc.count()) { await loc.first().click(); return true } } catch {}
  return false
}

let turns = 0, battles = 0, attacks = 0, recruits = 0, plays = 0, idle = 0

for (let i = 0; i < MAX_TURNS * 14; i++) {
  if (await page.locator('.winner').count()) { console.log('GAME OVER screen reached'); break }
  if (turns >= MAX_TURNS) break

  // 1. resolve any open battle
  if (await page.locator('.sheet.battle').count()) {
    if (await click(page.locator('.sheet.battle .btn:not([disabled])'))) battles++
    else await page.waitForTimeout(80)
    continue
  }
  // 2. never leave an action sheet hanging
  if (await page.locator('.sheet').count()) {
    if (!(await click(page.locator('.sheet .btn.ghost').last()))) await page.mouse.click(207, 24)
    continue
  }
  // 3. draw phase
  if (await click(page.getByRole('button', { name: 'Draw a card' }))) continue

  // 4. recruit if we hold a Character and have an open slot
  const charCard = page.locator('.hcard:not([disabled])', { has: page.locator('.htype', { hasText: 'CHARACTER' }) })
  const emptyMine = page.locator('.section-title:has-text("Your family") + .slots .ch.empty')
  if ((await charCard.count()) && (await emptyMine.count())) {
    await click(charCard)
    if (await click(page.locator('.ch.empty.target'))) { recruits++; continue }
    await click(page.getByRole('button', { name: 'Cancel' }))
  }

  // 5. try to attack with each of our characters
  const mine = page.locator('.section-title:has-text("Your family") + .slots .ch:not(.empty)')
  let did = false
  const mineCount = await mine.count()
  for (let k = 0; k < mineCount; k++) {
    if (!(await click(mine.nth(k)))) continue
    if (!(await page.locator('.sheet').count())) continue
    const atk = page.locator('.opt:not([disabled])', { hasText: 'Attack' })
    if (await atk.count()) {
      await click(atk)
      if (await click(page.locator('.opp .ch.target'))) { attacks++; did = true; break }
    }
    if (!(await click(page.locator('.sheet .btn.ghost').last()))) await page.mouse.click(207, 24)
  }
  if (did) continue

  // 6. dump a card onto one of our own characters
  const stuffCard = page.locator('.hcard:not([disabled])').first()
  if ((await stuffCard.count()) && mineCount) {
    await click(stuffCard)
    if (await click(page.locator('.section-title:has-text("Your family") + .slots .ch.target'))) { plays++; continue }
    await click(page.getByRole('button', { name: 'Cancel' }))
  }

  // 7. ending the turn must always be possible
  if (await click(page.getByRole('button', { name: 'End turn' }))) { turns++; idle = 0; continue }

  if (++idle > 6) {
    console.log('\n=== NO LEGAL AFFORDANCE ===')
    console.log('turn label:', await page.locator('.turn').first().textContent().catch(() => '?'))
    console.log('buttons:', JSON.stringify((await page.locator('button:not([disabled])').allTextContents()).slice(0, 20)))
    await page.screenshot({ path: '/home/claude/fa/shots/stuck.png' })
    break
  }
  await page.waitForTimeout(80)
}

await page.screenshot({ path: '/home/claude/fa/shots/02-midgame.png' })
console.log(`\nturns ended:   ${turns}`)
console.log(`recruits:      ${recruits}`)
console.log(`attacks:       ${attacks}`)
console.log(`battle passes: ${battles}`)
console.log(`cards played:  ${plays}`)
console.log(`reached:       ${await page.locator('.round').first().textContent().catch(() => '?')}`)
console.log(`console errors: ${errors.length}`)
errors.slice(0, 10).forEach((e) => console.log('  !', e))

await browser.close()
process.exit(errors.length ? 1 : 0)
