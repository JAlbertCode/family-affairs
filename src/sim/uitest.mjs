// Drives the built app in a real browser: starts a pass-and-play game and plays
// real turns through the actual UI, catching console errors and dead ends.
//
// Run:  npm run build && npm run preview   (then, in another shell)
//       URL=http://localhost:4173/ node src/sim/uitest.mjs
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
  if (m.type() === 'error' && !t.includes('404')) errors.push(t)
})

await page.goto(URL, { waitUntil: 'domcontentloaded' })
await page.getByTestId('local-mode').click()
await page.getByTestId('start-local').click()
await page.waitForSelector('.topbar')
console.log('game started')

const click = async (loc) => {
  try { if (await loc.count()) { await loc.first().click(); return true } } catch {}
  return false
}

let played = 0, attacks = 0, battles = 0, turns = 0, idle = 0

for (let i = 0; i < STEPS; i++) {
  if (await page.locator('.winner').count()) { console.log('GAME OVER reached'); break }

  // stray sheet? close it
  if (await page.locator('.sheet-bg').count()) {
    if (!(await click(page.locator('.sheet .btn.ghost').last()))) await page.mouse.click(207, 20)
    continue
  }
  // battle in progress
  if (await click(page.getByRole('button', { name: /^Pass |^Continue$|Waiting for/ }))) { battles++; continue }
  // draw phase
  if (await click(page.getByRole('button', { name: 'Draw a card' }))) continue

  // play a card the UI says is playable
  await click(page.getByRole('tab', { name: /Your hand/ }))
  await page.waitForTimeout(70)
  const playableDots = page.locator('.raildots button.playable')
  if (await playableDots.count()) {
    await click(playableDots.first())
    await page.waitForTimeout(110)
    const play = page.getByRole('button', { name: /^Play / })
    if ((await play.count()) && (await play.first().isEnabled())) {
      await click(play)
      await page.waitForTimeout(110)
      if (await page.locator('.targetbar').count()) {
        if (!(await click(page.locator('.tok.target')))) await click(page.getByRole('button', { name: 'Cancel' }))
      }
      played++; idle = 0; continue
    }
  }

  // attack with someone
  await click(page.getByRole('tab', { name: /Field/ }))
  const mine = page.locator('.myfamily .tok:not(.tok-empty)')
  if (await mine.count()) {
    await click(mine.first())
    await page.waitForTimeout(130)
    const atk = page.locator('.opt:not([disabled])', { hasText: 'Attack' })
    if (await atk.count()) {
      await click(atk)
      await page.waitForTimeout(130)
      if (await click(page.locator('.opp .tok.target'))) { attacks++; idle = 0; continue }
    }
    if (!(await click(page.locator('.sheet .btn.ghost').last()))) await page.mouse.click(207, 20)
  }

  if (await click(page.getByRole('button', { name: 'End turn' }))) { turns++; idle = 0; continue }

  if (++idle > 8) {
    console.log('\n=== NO LEGAL AFFORDANCE ===')
    console.log('buttons:', JSON.stringify((await page.locator('button:not([disabled])').allTextContents()).slice(0, 20)))
    await page.screenshot({ path: 'stuck.png' })
    break
  }
  await page.waitForTimeout(50)
}

console.log(`\nturns ended:   ${turns}`)
console.log(`cards played:  ${played}`)
console.log(`attacks:       ${attacks}`)
console.log(`battle steps:  ${battles}`)
console.log(`reached:       ${await page.locator('.round').first().textContent().catch(() => '?')}`)
console.log(`console errors: ${errors.length}`)
errors.slice(0, 10).forEach((e) => console.log('  !', e))

await browser.close()
process.exit(errors.length ? 1 : 0)
