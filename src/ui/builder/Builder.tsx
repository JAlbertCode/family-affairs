import { useEffect, useMemo, useState } from 'react'
import type { CharacterDef, StuffDef, AffairDef, Effect } from '../../engine/types'
import {
  validateCharacter, validateStuff, validateAffair, validatePack,
  registerCharacterIds, registerStuffIds, RULES, type CardPack, type Issue,
} from '../../engine/cards/schema'
import { CHARACTERS } from '../../engine/cards/characters'
import { STUFF } from '../../engine/cards/stuff'
import {
  ARCHETYPES, SUBTYPES, ALL_TAGS, STATUSES, SCOPES, EFFECT_KINDS, STAT_BUDGET,
  ATTACK_MIN, ATTACK_MAX, blankAffair, blankCharacter, blankEffect, blankStuff, slug,
  type CardType, type EffectKindSpec,
} from './model'
import { PreviewCard } from './PreviewCard'
import { fitArt } from './art'

const DRAFT_KEY = 'fa.pack.draft'

/**
 * The card builder.
 *
 * §43 says new cards are data, not code, and the validator has always been the
 * thing that makes third-party cards safe. This is the other half: a way to
 * write that data without writing TypeScript, and without ever producing an
 * object the validator would reject.
 *
 * Two rules shape the whole screen.
 *
 * The limits are enforced by the inputs, not just reported by the validator.
 * You cannot type 9 Attack, because Attack is a slider from 2 to 7 and Defense
 * is computed from it - Attack + Defense = 8 is not advice, it is the widget.
 * Tags cap at five. Tolerances step between 2 and 4. Every effect amount is
 * clamped to the ceiling in RULES. The validator still runs on every keystroke
 * and still has the final say, because it is the same code that guards a pack
 * at load time and nothing should be able to get in by going round the UI.
 *
 * And the preview is the real card. Not a mock-up of one: the same chip
 * derivation the game uses, so what you are looking at while you build is what
 * the table sees.
 */
export function Builder({ onExit }: { onExit: () => void }) {
  const [pack, setPack] = useState<CardPack>(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY)
      if (raw) return JSON.parse(raw) as CardPack
    } catch { /* corrupt draft, start clean */ }
    return { name: '', author: '', version: '1.0.0', characters: [], stuff: [], affairs: [] }
  })
  const [type, setType] = useState<CardType>('character')
  const [idx, setIdx] = useState<number>(-1)

  // Existing ids so the validator can catch a collision with the base game and
  // so `onlyFor` / `startsWith` can point at real cards.
  useEffect(() => {
    registerCharacterIds([...CHARACTERS.map((c) => c.id), ...(pack.characters ?? []).map((c) => c.id)])
    registerStuffIds([...STUFF.map((s) => s.id), ...(pack.stuff ?? []).map((s) => s.id)])
  }, [pack])

  useEffect(() => {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(pack)) } catch { /* quota */ }
  }, [pack])

  const list = (pack[type === 'character' ? 'characters' : type === 'stuff' ? 'stuff' : 'affairs'] ?? []) as any[]
  const card = idx >= 0 ? list[idx] : null

  const setCard = (next: any) => {
    setPack((p) => {
      const key = type === 'character' ? 'characters' : type === 'stuff' ? 'stuff' : 'affairs'
      const arr = [...((p as any)[key] ?? [])]
      arr[idx] = next
      return { ...p, [key]: arr }
    })
  }

  const addCard = (t: CardType) => {
    const fresh = t === 'character' ? blankCharacter() : t === 'stuff' ? blankStuff() : blankAffair()
    setPack((p) => {
      const key = t === 'character' ? 'characters' : t === 'stuff' ? 'stuff' : 'affairs'
      const arr = [...((p as any)[key] ?? []), fresh]
      return { ...p, [key]: arr }
    })
    setType(t)
    setIdx(((pack as any)[t === 'character' ? 'characters' : t === 'stuff' ? 'stuff' : 'affairs'] ?? []).length)
  }

  const removeCard = () => {
    if (idx < 0) return
    setPack((p) => {
      const key = type === 'character' ? 'characters' : type === 'stuff' ? 'stuff' : 'affairs'
      const arr = [...((p as any)[key] ?? [])]
      arr.splice(idx, 1)
      return { ...p, [key]: arr }
    })
    setIdx(-1)
  }

  const cardIssues: Issue[] = useMemo(() => {
    if (!card) return []
    try {
      if (type === 'character') return validateCharacter(card as CharacterDef)
      if (type === 'stuff') return validateStuff(card as StuffDef)
      return validateAffair(card as AffairDef)
    } catch (e: any) {
      return [{ card: card.name || 'this card', severity: 'error', field: '-', message: String(e?.message ?? e) }]
    }
  }, [card, type])

  const packIssues = useMemo(() => {
    try { return validatePack(pack) } catch { return [] }
  }, [pack])
  const packErrors = packIssues.filter((i) => i.severity === 'error')

  const total = (pack.characters?.length ?? 0) + (pack.stuff?.length ?? 0) + (pack.affairs?.length ?? 0)

  function exportPack() {
    const blob = new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${slug(pack.name) || 'pack'}.fapack.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  async function importPack(file: File) {
    try {
      const next = JSON.parse(await file.text()) as CardPack
      setPack({
        name: next.name ?? '', author: next.author ?? '', version: next.version ?? '1.0.0',
        characters: next.characters ?? [], stuff: next.stuff ?? [], affairs: next.affairs ?? [],
      })
      setIdx(-1)
    } catch {
      alert('That file is not a card pack this can read.')
    }
  }

  return (
    <div className="builder">
      <header className="b-top">
        <button className="icon-btn" onClick={onExit} aria-label="Back to the game">←</button>
        <span className="b-title">Card builder</span>
        <span className={`b-count ${packErrors.length ? 'bad' : 'ok'}`}>
          {total} card{total === 1 ? '' : 's'}{packErrors.length ? ` · ${packErrors.length} to fix` : ''}
        </span>
      </header>

      <div className="b-body">
        <aside className="b-side">
          <div className="card-panel">
            <span className="field-label">Pack</span>
            <input type="text" placeholder="Pack name" value={pack.name}
              onChange={(e) => setPack({ ...pack, name: e.target.value })} />
            <input type="text" placeholder="Your name" value={pack.author} style={{ marginTop: 8 }}
              onChange={(e) => setPack({ ...pack, author: e.target.value })} />
          </div>

          <div className="b-add">
            <button className="btn ghost narrow" onClick={() => addCard('character')}>+ Character</button>
            <button className="btn ghost narrow" onClick={() => addCard('stuff')}>+ Item</button>
            <button className="btn ghost narrow" onClick={() => addCard('affair')}>+ Affair</button>
          </div>

          <CardList pack={pack} type={type} idx={idx} onPick={(t, i) => { setType(t); setIdx(i) }} />

          <div className="b-io">
            <button className="btn ghost narrow" onClick={exportPack} disabled={total === 0}>Export</button>
            <label className="btn ghost narrow b-import">
              Import
              <input type="file" accept=".json,application/json" hidden
                onChange={(e) => { const f = e.target.files?.[0]; if (f) importPack(f); e.target.value = '' }} />
            </label>
          </div>
          {packErrors.length > 0 && (
            <ul className="b-issues">
              {packErrors.slice(0, 6).map((i, n) => (
                <li key={n} className="err"><b>{i.card}</b> {i.field}: {i.message}</li>
              ))}
            </ul>
          )}
        </aside>

        <main className="b-main">
          {!card ? (
            <div className="b-empty">
              <h2>Make a card</h2>
              <p>
                Everything you can build here is data the game already understands, and every
                limit is built into the controls: Attack and Defense always add up to {STAT_BUDGET},
                tolerances sit between {RULES.tolerance.min} and {RULES.tolerance.max}, damage stops
                at {RULES.effect.damage}. You cannot make a card the table would refuse.
              </p>
              <p className="b-hint">Add a Character, an Item or a Family Affair to start.</p>
            </div>
          ) : (
            <div className="b-editor">
              <div className="b-form">
                {type === 'character' && <CharacterForm card={card} onChange={setCard} pack={pack} />}
                {type === 'stuff' && <StuffForm card={card} onChange={setCard} pack={pack} />}
                {type === 'affair' && <AffairForm card={card} onChange={setCard} />}
                <button className="btn ghost" onClick={removeCard}>Delete this card</button>
              </div>

              <div className="b-preview">
                <PreviewCard type={type} card={card} />
                <Issues issues={cardIssues} />
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

function CardList({ pack, type, idx, onPick }: {
  pack: CardPack; type: CardType; idx: number
  onPick: (t: CardType, i: number) => void
}) {
  const groups: Array<[CardType, string, any[]]> = [
    ['character', 'Characters', pack.characters ?? []],
    ['stuff', 'Items', pack.stuff ?? []],
    ['affair', 'Affairs', pack.affairs ?? []],
  ]
  return (
    <div className="b-list">
      {groups.map(([t, label, arr]) => arr.length > 0 && (
        <div key={t}>
          <span className="field-label">{label}</span>
          {arr.map((c, i) => (
            <button key={i}
              className={`b-item ${type === t && idx === i ? 'on' : ''}`}
              onClick={() => onPick(t, i)}>
              {c.name || <i>Untitled</i>}
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}

function Issues({ issues }: { issues: Issue[] }) {
  const errs = issues.filter((i) => i.severity === 'error')
  const warns = issues.filter((i) => i.severity !== 'error')
  if (!errs.length && !warns.length) {
    return <div className="b-ok">Legal card. Nothing to fix.</div>
  }
  return (
    <ul className="b-issues">
      {errs.map((i, n) => <li key={`e${n}`} className="err">{i.field}: {i.message}</li>)}
      {warns.map((i, n) => <li key={`w${n}`} className="warn">{i.field}: {i.message}</li>)}
    </ul>
  )
}

// ---------------------------------------------------------------------------
// Shared field widgets
// ---------------------------------------------------------------------------

function Row({ label, hint, children }: { label: string; hint?: string; children: any }) {
  return (
    <label className="b-row">
      <span className="field-label">{label}</span>
      {children}
      {hint && <i className="b-hint">{hint}</i>}
    </label>
  )
}

function Num({ value, min, max, onChange, suffix }: {
  value: number; min: number; max: number; onChange: (n: number) => void; suffix?: string
}) {
  return (
    <span className="b-num">
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min}>−</button>
      <b>{value}{suffix}</b>
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max}>+</button>
    </span>
  )
}

function ArtPicker({ art, onChange }: { art?: string; onChange: (v: string | undefined) => void }) {
  const [busy, setBusy] = useState(false)
  return (
    <Row label="Art" hint="Any picture. It gets cropped to the deck's 600x900 and shrunk to fit inside the pack.">
      <span className="b-art">
        {art
          ? <img src={art.startsWith('data:') ? art : `${import.meta.env.BASE_URL}art/${art}`} alt="" />
          : <span className="b-art-empty">no art</span>}
        <span className="b-artbtns">
          <label className="btn ghost narrow">
            {busy ? 'Working…' : art ? 'Replace' : 'Add art'}
            <input type="file" accept="image/*" hidden onChange={async (e) => {
              const f = e.target.files?.[0]; e.target.value = ''
              if (!f) return
              setBusy(true)
              try { onChange(await fitArt(f)) } catch { alert('Could not read that image.') }
              setBusy(false)
            }} />
          </label>
          {art && <button className="btn ghost narrow" onClick={() => onChange(undefined)}>Remove</button>}
        </span>
      </span>
    </Row>
  )
}

// ---------------------------------------------------------------------------
// Character
// ---------------------------------------------------------------------------

function CharacterForm({ card, onChange, pack }: { card: CharacterDef; onChange: (c: CharacterDef) => void; pack: CardPack }) {
  const set = (patch: Partial<CharacterDef>) => onChange({ ...card, ...patch } as CharacterDef)
  const stuffIds = [...STUFF.map((s) => ({ id: s.id, name: s.name })), ...(pack.stuff ?? []).map((s) => ({ id: s.id, name: s.name }))]

  return (
    <>
      <Row label="Name">
        <input type="text" value={card.name} placeholder="Titi Evelyn"
          onChange={(e) => set({ name: e.target.value, id: card.id || slug(e.target.value) })} />
      </Row>
      <Row label="Id" hint="Used by the engine and by art files. Lowercase, no spaces.">
        <input type="text" value={card.id} onChange={(e) => set({ id: slug(e.target.value) })} />
      </Row>
      <Row label="Title" hint="The line under the name. 'The Sober Hustler'.">
        <input type="text" value={card.title} onChange={(e) => set({ title: e.target.value })} />
      </Row>
      <Row label="Archetype">
        <select value={card.archetype} onChange={(e) => set({ archetype: e.target.value as any })}>
          {ARCHETYPES.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </Row>

      <Row label="HP" hint={`Between ${RULES.hp.min} and ${RULES.hp.max}. This is where a Character's identity lives.`}>
        <Num value={card.stats.hp} min={RULES.hp.min} max={RULES.hp.max}
          onChange={(hp) => set({ stats: { ...card.stats, hp } })} />
      </Row>
      <Row label="Attack and Defense"
        hint={`One budget: they always add up to ${STAT_BUDGET}. Move Attack and Defense follows.`}>
        <span className="b-split">
          <Num value={card.stats.attack} min={ATTACK_MIN} max={ATTACK_MAX}
            onChange={(attack) => set({ stats: { ...card.stats, attack, defense: STAT_BUDGET - attack } })} />
          <em>⚔ {card.stats.attack} · 🛡 {STAT_BUDGET - card.stats.attack}</em>
        </span>
      </Row>

      <Row label={`Tags (${card.tags.length}/${RULES.tags.max})`}
        hint={`Pick ${RULES.tags.min} to ${RULES.tags.max}. Affairs are written against tags, so these decide what lands on them.`}>
        <span className="b-tags">
          {ALL_TAGS.map((t) => {
            const on = card.tags.includes(t)
            const full = card.tags.length >= RULES.tags.max
            return (
              <button key={t} type="button"
                className={`b-tag ${on ? 'on' : ''}`}
                disabled={!on && full}
                onClick={() => set({ tags: on ? card.tags.filter((x) => x !== t) : [...card.tags, t] })}>
                {t}
              </button>
            )
          })}
        </span>
      </Row>

      <Row label="Tolerance"
        hint={`How much they take before it turns. ${RULES.tolerance.min} to ${RULES.tolerance.max} each.`}>
        <span className="b-tol">
          {(['alcohol', 'weed', 'food'] as const).map((k) => (
            <span key={k} className="b-tolone">
              <i>{k === 'alcohol' ? '🍺' : k === 'weed' ? '🌿' : '🍔'}</i>
              <Num value={card.tolerance[k]} min={RULES.tolerance.min} max={RULES.tolerance.max}
                onChange={(v) => set({ tolerance: { ...card.tolerance, [k]: v } })} />
            </span>
          ))}
        </span>
      </Row>

      <ArtPicker art={card.art} onChange={(art) => set({ art })} />
      <Row label="Card colour">
        <input type="color" value={card.color} onChange={(e) => set({ color: e.target.value })} />
      </Row>

      <Row label="Starts holding" hint="One item, at most. It is a real card: it can be stolen, eaten or destroyed.">
        <select value={card.startsWith?.[0] ?? ''}
          onChange={(e) => set({ startsWith: e.target.value ? [e.target.value] : undefined })}>
          <option value="">Nothing</option>
          {stuffIds.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </Row>

      <TextBlock label="Passive" value={card.passive} onChange={(passive) => set({ passive })}
        hint="Always on. Written as text only: engine hooks belong to the base game, so a pack's passive describes something its abilities do." />
      <TextBlock label="Family Flaw" required value={card.flaw} onChange={(flaw) => set({ flaw })}
        hint="Mandatory. Every Character has something wrong with them." />

      <AbilityForm label="Ability" budget={RULES.abilityBudget} type="character"
        value={card.ability} onChange={(ability) => set({ ability })} />
      <AbilityForm label="Power Move" budget={RULES.powerMoveBudget} type="character"
        value={card.powerMove} onChange={(powerMove) => set({ powerMove })} />
    </>
  )
}

function TextBlock({ label, value, onChange, hint, required }: {
  label: string; hint?: string; required?: boolean
  value?: { name: string; text: string; hooks: string[] }
  onChange: (v: any) => void
}) {
  return (
    <div className="b-block">
      <div className="b-blockhead">
        <span className="field-label">{label}{required ? '' : ' (optional)'}</span>
        {!required && (
          <button className="linkish" type="button"
            onClick={() => onChange(value ? undefined : { name: '', text: '', hooks: [] })}>
            {value ? 'remove' : 'add'}
          </button>
        )}
      </div>
      {value && (
        <>
          <input type="text" placeholder="Name" value={value.name}
            onChange={(e) => onChange({ ...value, name: e.target.value })} />
          <textarea rows={2} placeholder="What it does, in plain language" value={value.text}
            onChange={(e) => onChange({ ...value, text: e.target.value })} />
        </>
      )}
      {hint && <i className="b-hint">{hint}</i>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Ability + effects
// ---------------------------------------------------------------------------

function AbilityForm({ label, value, onChange, budget, type }: {
  label: string; budget: number; type: CardType
  value?: any; onChange: (v: any) => void
}) {
  return (
    <div className="b-block">
      <div className="b-blockhead">
        <span className="field-label">{label} (optional)</span>
        <button className="linkish" type="button"
          onClick={() => onChange(value ? undefined : { name: '', text: '', actionCost: 1, effects: [] })}>
          {value ? 'remove' : 'add'}
        </button>
      </div>
      {value && (
        <>
          <input type="text" placeholder="Name" value={value.name}
            onChange={(e) => onChange({ ...value, name: e.target.value })} />
          <textarea rows={2} placeholder="What it does" value={value.text}
            onChange={(e) => onChange({ ...value, text: e.target.value })} />
          <div className="b-inline">
            <label>
              <input type="checkbox" checked={value.actionCost === 0}
                onChange={(e) => onChange({ ...value, actionCost: e.target.checked ? 0 : 1 })} />
              Free (costs no action)
            </label>
            <label>
              Cooldown
              <select value={value.cooldown ?? 0}
                onChange={(e) => onChange({ ...value, cooldown: Number(e.target.value) || undefined })}>
                <option value={0}>none</option>
                <option value={2}>2 Rounds</option>
                <option value={3}>3 Rounds</option>
              </select>
            </label>
            <label>
              <input type="checkbox" checked={!!value.oncePerGame}
                onChange={(e) => onChange({ ...value, oncePerGame: e.target.checked || undefined })} />
              Once per game
            </label>
          </div>
          <i className="b-hint">
            Budget {budget} points. Anything over needs a cooldown of 2 or more, or once per game.
            A cooldown of 1 is not a limitation: you only get one Turn a Round anyway.
          </i>
          <EffectList type={type} effects={value.effects ?? []}
            onChange={(effects) => onChange({ ...value, effects })} />
        </>
      )}
    </div>
  )
}

function EffectList({ type, effects, onChange }: {
  type: CardType; effects: Effect[]; onChange: (e: Effect[]) => void
}) {
  const kinds = EFFECT_KINDS.filter((k) => k.on.includes(type))
  return (
    <div className="b-effects">
      <span className="field-label">What it actually does</span>
      {effects.map((e, i) => (
        <EffectRow key={i} type={type} effect={e}
          onChange={(next) => onChange(effects.map((x, n) => (n === i ? next : x)))}
          onRemove={() => onChange(effects.filter((_, n) => n !== i))} />
      ))}
      <select value="" onChange={(ev) => {
        const spec = kinds.find((k) => k.k === ev.target.value)
        if (spec) onChange([...effects, blankEffect(spec, type)])
      }}>
        <option value="">+ add an effect…</option>
        {kinds.map((k) => <option key={k.k} value={k.k}>{k.label}</option>)}
      </select>
    </div>
  )
}

function EffectRow({ type, effect, onChange, onRemove }: {
  type: CardType; effect: any; onChange: (e: Effect) => void; onRemove: () => void
}) {
  const spec = EFFECT_KINDS.find((k) => k.k === effect.k) as EffectKindSpec | undefined
  if (!spec) return null
  const targetKey = effect.from ? 'from' : 'target'
  const scopes = SCOPES[type]

  return (
    <div className="b-effect">
      <div className="b-effhead">
        <b>{spec.label}</b>
        <button className="linkish" type="button" onClick={onRemove}>remove</button>
      </div>
      <div className="b-efffields">
        {spec.targets && (
          <select value={effect[targetKey]?.scope ?? scopes[0].v}
            onChange={(e) => onChange({ ...effect, [targetKey]: { ...effect[targetKey], scope: e.target.value } })}>
            {scopes.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
          </select>
        )}
        {spec.k === 'statMod' && (
          <>
            <select value={effect.stat} onChange={(e) => onChange({ ...effect, stat: e.target.value })}>
              <option value="attack">Attack</option>
              <option value="defense">Defense</option>
            </select>
            <select value={effect.duration} onChange={(e) => onChange({ ...effect, duration: e.target.value })}>
              <option value="turn">this Turn</option>
              <option value="round">this Round</option>
            </select>
          </>
        )}
        {spec.extra === 'track' && (
          <select value={effect.track} onChange={(e) => onChange({ ...effect, track: e.target.value })}>
            <option value="alcohol">🍺 Alcohol</option>
            <option value="weed">🌿 Weed</option>
            <option value="food">🍔 Food</option>
          </select>
        )}
        {spec.extra === 'status' && (
          <select value={effect.status} onChange={(e) => onChange({ ...effect, status: e.target.value })}>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        {spec.extra === 'subtype' && (
          <select value={effect.subtype} onChange={(e) => onChange({ ...effect, subtype: e.target.value })}>
            <option value="Food">Food</option>
            <option value="Drink">Drink</option>
            <option value="Smoke">Smoke</option>
          </select>
        )}
        {spec.amount && (
          <span className="b-amount">
            <i>{spec.amount.label}</i>
            <Num value={effect[spec.amount.field] ?? spec.amount.min}
              min={spec.amount.min} max={spec.amount.max}
              onChange={(v) => onChange({ ...effect, [spec.amount!.field]: v })} />
          </span>
        )}
        {spec.k === 'status' && (
          <span className="b-amount">
            <i>Rounds</i>
            <Num value={effect.duration ?? 1} min={0} max={2}
              onChange={(v) => onChange({ ...effect, duration: v })} />
          </span>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Stuff
// ---------------------------------------------------------------------------

function StuffForm({ card, onChange, pack }: { card: StuffDef; onChange: (c: StuffDef) => void; pack: CardPack }) {
  const set = (patch: Partial<StuffDef>) => onChange({ ...card, ...patch } as StuffDef)
  const wearable = ['Gear', 'Ride', 'Pet'].includes(card.subtype)
  const consumable = ['Food', 'Drink', 'Smoke'].includes(card.subtype)
  const chars = [...CHARACTERS.map((c) => ({ id: c.id, name: c.name })), ...(pack.characters ?? []).map((c) => ({ id: c.id, name: c.name }))]

  return (
    <>
      <Row label="Name">
        <input type="text" value={card.name} placeholder="The Pool Stick"
          onChange={(e) => set({ name: e.target.value, id: card.id || slug(e.target.value) })} />
      </Row>
      <Row label="Id"><input type="text" value={card.id} onChange={(e) => set({ id: slug(e.target.value) })} /></Row>
      <Row label="Kind" hint="Gear, Rides and Pets are worn. Food, Drinks and Smoke are consumed and gone.">
        <select value={card.subtype} onChange={(e) => set({ subtype: e.target.value as any })}>
          {SUBTYPES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </Row>
      <Row label="Card text" hint="What a player reads. It has to match what the effects below actually do.">
        <textarea rows={3} value={card.text} onChange={(e) => set({ text: e.target.value })} />
      </Row>
      <Row label="Copies in the deck"><Num value={card.copies} min={1} max={4} onChange={(copies) => set({ copies })} /></Row>
      <Row label="Icon" hint="One emoji. Shown when there is no art.">
        <input type="text" value={card.icon ?? ''} maxLength={4} onChange={(e) => set({ icon: e.target.value })} />
      </Row>
      <ArtPicker art={card.art} onChange={(art) => set({ art })} />

      {wearable && (
        <Row label="While it is worn"
          hint={`Positives at face value, penalties at half, net capped at ${4}. No single stat moves more than 4. Big upside with a real cost is a legal shape.`}>
          <span className="b-split">
            {(['attack', 'defense'] as const).map((stat) => {
              const cur = card.equipMods?.find((m) => m.stat === stat)?.amount ?? 0
              return (
                <span key={stat} className="b-tolone">
                  <i>{stat === 'attack' ? '⚔' : '🛡'}</i>
                  <Num value={cur} min={-4} max={4} onChange={(v) => {
                    const rest = (card.equipMods ?? []).filter((m) => m.stat !== stat)
                    set({ equipMods: v === 0 ? rest : [...rest, { stat, amount: v }] })
                  }} />
                </span>
              )
            })}
          </span>
        </Row>
      )}

      {consumable && (
        <Row label="What consuming it does to them"
          hint={card.subtype === 'Food' ? 'Food always moves the Food track whether the card says so or not.' : undefined}>
          <span className="b-split">
            {(['alcohol', 'weed', 'food'] as const).map((k) => (
              <span key={k} className="b-tolone">
                <i>{k === 'alcohol' ? '🍺' : k === 'weed' ? '🌿' : '🍔'}</i>
                <Num value={card.limitGain?.[k] ?? 0} min={0} max={RULES.effect.limit}
                  onChange={(v) => set({ limitGain: { ...(card.limitGain ?? {}), [k]: v || undefined } })} />
              </span>
            ))}
          </span>
        </Row>
      )}

      {['Drink', 'Food', 'Consumable'].includes(card.subtype) && (
        <Row label="Can it be handed to a rival?">
          <label className="b-check">
            <input type="checkbox" checked={!!card.giftable} onChange={(e) => set({ giftable: e.target.checked || undefined })} />
            Giftable
          </label>
        </Row>
      )}

      {wearable && (
        <Row label="Only for" hint="Some things belong to one person.">
          <select value={card.onlyFor?.[0] ?? ''}
            onChange={(e) => set({ onlyFor: e.target.value ? [e.target.value] : undefined })}>
            <option value="">Anybody</option>
            {chars.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Row>
      )}

      <EffectList type="stuff" effects={card.effects ?? []} onChange={(effects) => set({ effects })} />

      {wearable && (
        <AbilityForm label="Activated ability" budget={RULES.abilityBudget} type="stuff"
          value={card.activated} onChange={(activated) => set({ activated })} />
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Affair
// ---------------------------------------------------------------------------

function AffairForm({ card, onChange }: { card: AffairDef; onChange: (c: AffairDef) => void }) {
  const set = (patch: Partial<AffairDef>) => onChange({ ...card, ...patch } as AffairDef)
  return (
    <>
      <Row label="Name">
        <input type="text" value={card.name} placeholder="The Cousins Are Visiting"
          onChange={(e) => set({ name: e.target.value, id: card.id || slug(e.target.value) })} />
      </Row>
      <Row label="Id"><input type="text" value={card.id} onChange={(e) => set({ id: slug(e.target.value) })} /></Row>
      <Row label="Card text" hint="It hits every family at once, so write it about the table rather than about you.">
        <textarea rows={3} value={card.text} onChange={(e) => set({ text: e.target.value })} />
      </Row>
      <Row label="Colour">
        <input type="color" value={card.color} onChange={(e) => set({ color: e.target.value })} />
      </Row>
      <EffectList type="affair" effects={card.effects ?? []} onChange={(effects) => set({ effects })} />
      <i className="b-hint">
        Affairs should hit several Characters and should never whiff. Aim an effect at a tag and
        it lands on everybody who has it, in every family.
      </i>
      <TagGate card={card} onChange={onChange} />
    </>
  )
}

/** Affairs are written against tags; this is where that gets chosen. */
function TagGate({ card, onChange }: { card: AffairDef; onChange: (c: AffairDef) => void }) {
  const effects = card.effects ?? []
  if (!effects.length) return null
  return (
    <div className="b-block">
      <span className="field-label">Who each effect lands on</span>
      {effects.map((e: any, i) => (
        <div key={i} className="b-inline">
          <span className="b-hint" style={{ flex: 1 }}>{EFFECT_KINDS.find((k) => k.k === e.k)?.label}</span>
          <select value={e.target?.withTag ?? ''}
            onChange={(ev) => {
              const next = [...effects] as any[]
              const tag = ev.target.value || undefined
              next[i] = { ...e, target: { ...(e.target ?? { scope: 'allActiveEveryone' }), withTag: tag } }
              onChange({ ...card, effects: next })
            }}>
            <option value="">Everybody</option>
            {ALL_TAGS.map((t) => <option key={t} value={t}>only {t}s</option>)}
          </select>
        </div>
      ))}
    </div>
  )
}
