import { CHARACTERS } from './characters'
import { STUFF } from './stuff'
import { AFFAIRS } from './affairs'
import {
  validateCharacter, validateStuff, validateAffair, abilityCost, registerCharacterIds,
  registerStuffIds, RULES, type Issue,
} from './schema'

registerCharacterIds(CHARACTERS.map((c) => c.id))
registerStuffIds(STUFF.map((s) => s.id))

// Every card in the game is held to the same rules an outside author would be.
// If we can't pass our own validator, the validator is a lie.

const issues: Issue[] = [
  ...CHARACTERS.flatMap(validateCharacter),
  ...STUFF.flatMap(validateStuff),
  ...AFFAIRS.flatMap(validateAffair),
]

const errors = issues.filter((i) => i.severity === 'error')
const warns = issues.filter((i) => i.severity === 'warn')

console.log('\n=== CARD VALIDATION ===')
console.log(`${CHARACTERS.length} characters, ${STUFF.length} stuff, ${AFFAIRS.length} affairs\n`)

if (errors.length) {
  console.log(`ERRORS (${errors.length}) — these would block a card pack from loading:`)
  for (const i of errors) console.log(`  ✗ ${i.card.padEnd(18)} ${i.field.padEnd(18)} ${i.message}`)
  console.log('')
}
if (warns.length) {
  console.log(`WARNINGS (${warns.length}):`)
  for (const i of warns) console.log(`  ! ${i.card.padEnd(18)} ${i.field.padEnd(18)} ${i.message}`)
  console.log('')
}
if (!errors.length && !warns.length) console.log('All cards pass.\n')

// Power budget table — the thing to eyeball when adding a character.
console.log('Ability power budgets (ability cap ' + RULES.abilityBudget + ', power move cap ' + RULES.powerMoveBudget + '):')
const rows = CHARACTERS.map((c) => ({
  name: c.name,
  statTotal: c.stats.attack + c.stats.defense,
  hp: c.stats.hp,
  ability: c.ability ? abilityCost(c.ability) : 0,
  power: c.powerMove ? abilityCost(c.powerMove) : 0,
})).sort((a, b) => (b.ability + b.power) - (a.ability + a.power))

console.log('  character         HP    A+D   ability   power   total')
for (const r of rows) {
  const tot = r.ability + r.power
  const flag = r.ability > RULES.abilityBudget || r.power > RULES.powerMoveBudget ? '  <<' : ''
  console.log(
    `  ${r.name.padEnd(16)} ${String(r.hp).padStart(3)}   ${String(r.statTotal).padStart(5)}   ` +
    `${r.ability.toFixed(1).padStart(7)}   ${r.power.toFixed(1).padStart(5)}   ${tot.toFixed(1).padStart(5)}${flag}`,
  )
}
console.log('')

if (errors.length) process.exit(1)
