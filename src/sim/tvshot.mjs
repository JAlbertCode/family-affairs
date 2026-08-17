// Photographs the living-room screen at the sizes a living room actually has.
//
// The TV is the one screen that cannot be checked by playing: it needs a host,
// a room and other people before it draws anything, which is how it shipped
// with text sitting on top of the artwork at 768p and nobody noticed. ?tv=DEMO
// gives it a board; this looks at that board and fails if anything has escaped
// the panel holding it.
//
// Run:  npm run build && npx vite preview --port 4173 &
//       node src/sim/tvshot.mjs
import { chromium } from 'playwright'
let bad = 0
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox','--disable-dev-shm-usage'] })
for (const [w, h, tag] of [[1920, 1080, '1080p'], [1366, 768, '768p'], [2560, 1440, '1440p']]) {
  const p = await b.newPage({ viewport: { width: w, height: h } })
  p.setDefaultTimeout(8000)
  p.on('pageerror', e => console.log('PAGEERROR', e.message))
  await p.goto('http://localhost:4173/?tv=DEMO', { waitUntil: 'load', timeout: 15000 })
  await p.waitForTimeout(900)
  await p.screenshot({ path: `/tmp/tv-${tag}.png` })
  const r = await p.evaluate(() => {
    const out = []
    for (const fam of document.querySelectorAll('.tv-fam')) {
      const f = fam.getBoundingClientRect()
      const who = fam.querySelector('.tv-famhead b')?.textContent
      for (const t of fam.querySelectorAll('.tok, .tv-empty')) {
        const c = t.getBoundingClientRect()
        const over = Math.round(Math.max(c.bottom - f.bottom, c.right - f.right, f.top - c.top, f.left - c.left))
        if (over > 1) out.push(`${who} +${over}px`)
      }
    }
    return {
      spill: out,
      pageScroll: document.documentElement.scrollHeight - window.innerHeight,
      logBottom: Math.round(document.querySelector('.tv-log')?.getBoundingClientRect().bottom ?? 0),
      viewport: window.innerHeight,
      affair: !!document.querySelector('.tv-affair'),
      fight: !!document.querySelector('.tv-fight'),
      race: document.querySelectorAll('.tv-runner').length,
    }
  })
  console.log(`${tag.padEnd(6)} race:${r.race} fight:${r.fight ? 'yes' : 'NO'}  page scroll:${r.pageScroll}px  ${r.spill.length ? 'SPILLED OUT OF ITS PANEL: ' + r.spill.join(', ') : 'everything inside its panel'}`)
  if (r.spill.length || r.pageScroll > 0 || !r.fight || r.race !== 6) bad++
  await p.close()
}
await b.close()
if (bad) { console.error(`${bad} size(s) laid out wrong. Shots are in /tmp/tv-*.png`); process.exit(1) }
console.log('Shots written to /tmp/tv-*.png')
