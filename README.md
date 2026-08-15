# Family Affairs

A competitive family battle card game. 2–6 players, live, on their own phones.

Digital implementation of **Game Design & Ruleset v0.1**.

## Play

- **Online:** one person taps *Host a game* and reads out the 4-letter room code; everyone else taps *Join with a code*. The host's browser runs the game — if they close the tab, the game ends.
- **One device:** *Pass and play on this device* runs the whole table on one phone. Good for testing and for a real kitchen table.
- **Install it:** open the site on a phone and Add to Home Screen. It runs full-screen like an app.

## Develop

```bash
npm install
npm run dev        # local dev server
npm run build      # typecheck + production build
```

## Balance tooling

The rules engine is pure TypeScript and runs headless, so balance questions get answered with numbers instead of arguments.

```bash
npx tsx src/sim/simulate.ts   # full games, win rates by seat and by character
npx tsx src/sim/diagnose.ts   # where Clout actually comes from
npx tsx src/sim/sweep.ts      # Clout threshold vs player count vs game length
node   src/sim/uitest.mjs     # drives the real UI in a browser (needs npm run build + preview)
```

Environment knobs: `GAMES`, `PLAYERS`, `CLOUT`.

## Layout

```
src/engine/       pure rules engine — no React, no network, fully deterministic
  types.ts        every game concept, one file
  state.ts        createGame + the authoritative reducer
  effects.ts      the declarative effect interpreter
  selectors.ts    derived stats, adjacency, legality
  rng.ts          seeded RNG — games are reproducible from (seed, intents)
  cards/          characters.ts, stuff.ts, affairs.ts, deck.ts
src/net/          host-authoritative P2P over WebRTC (PeerJS)
src/ui/           React components
src/sim/          bots, balance harnesses, browser test
public/art/       drop character art here as <id>.png (chichi.png, dorian.png, …)
```

## Adding content

New cards are data, not code (§43 Modular Expansion Rule). A new character is one
object in `src/engine/cards/characters.ts`; a new Family Affair is one object in
`affairs.ts`. Effects are a declarative union in `types.ts` — the engine
interprets them, so most new content needs no engine changes at all.

## Where this deviates from the paper ruleset

These are deliberate, and each one came out of running the simulator:

1. **Turn order is re-rolled every Round.** With fixed seating, the last player
   swings at the most-softened board and farms the kills — seat 6 won 39% of
   games against seat 1's 4%. Rotating the order flattened it to within noise.
2. **The game finishes the Round.** Crossing the Clout threshold starts a final
   Round instead of ending play instantly, so every seat gets the same number of
   Turns. Highest Clout wins; ties go to whoever crossed first.
3. **Clout to win scales with player count** (10 / 8 / 7 for 2–3 / 4–5 / 6
   players) so a six-handed game doesn't run twice as long as a two-handed one.
   §2's 7/10/15 presets are all still selectable in the lobby.
4. **Food, Drinks and Smoke attach to a Character and are consumed later** as a
   free once-per-turn action, rather than resolving the moment they're played.
   Without this nothing is ever *attached*, which silently disabled Gabby's
   Clear Your Plate, Dorian's Clean Your Plate, force-feeding, and Take A Shot.
5. **Achievements score once per player**, not once per card. A 4–6 player deck
   holds two copies of every Character, so per-card scoring double-dipped.
6. **Phase 2 and Phase 3 share one screen.** Separate budgets are still enforced
   (2 cards from hand, 2 Family Actions) but you aren't locked out of playing a
   card after attacking.
7. **Stat lines follow §9/§47, not the concept art.** The art sheets use a
   different scale (HP 24–30, Defense up to 9); the ruleset budget is HP 8–18
   with Attack+Defense+Speed ≈ 10–12. Where the doc gives an exact statline
   (Chi Chi, Dorian, Mikey & Moe) it is used verbatim.
