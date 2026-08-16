# Family Affairs

A competitive family battle card game. 2-6 players, live, on their own phones.

Digital implementation of **Game Design & Ruleset v0.1**.

## Run it

One command. It installs, builds, and serves:

```bash
npm start
```

It prints two URLs:

```
  Local:   http://localhost:4173/
  Network: http://192.168.1.42:4173/     <- open this one on your phone
```

The **Network** URL works on any device on the same wifi, which is how you test
with real phones before deploying anywhere.

## How to test it

**Fastest, one device, no setup.** Open the site, tap **Play on this device**,
pick a player count, hit Start. Every player shares the one screen and a gold
banner at the top tells you whose turn it is. Nothing is hidden between seats in
this mode, so it is the quickest way to learn the game.

**Two browser tabs.** Tab 1: *Host a game* → note the 4-letter code. Tab 2: open
the same URL → *Join with a code* → type it. Two tabs in one browser share the
saved name, so the second one shows up with a `(2)` suffix. Once 2 players are in
the lobby, the host's Start button turns gold.

**Real phones.** Run `npm start`, open the **Network** URL on each phone, then
host on one and join on the others. This exercises the actual peer-to-peer path.

> The host's device runs the game. If the host closes the tab or their phone
> sleeps, the game ends for everyone.

## Deploying

Pushing to `main` builds and publishes to GitHub Pages automatically
(`.github/workflows/deploy.yml`). The workflow turns Pages on for the repo on its
first run, so there is nothing to click.

**Live:** https://jalbertcode.github.io/family-affairs/

The game is static files. The rules engine runs in each player's browser and game
traffic goes directly peer-to-peer, so nothing holds game state server-side.
Cloudflare Pages, Netlify and Vercel serve it equally well and want `VITE_BASE=/`
instead of the repo-name prefix; `vite.config.ts` reads that from the
environment, so moving hosts is a setting rather than a change.

### Network configuration

Both of the following are optional and documented in `.env.example`. With nothing
set, the app runs exactly as it does today. Both are read in `src/net/config.ts`.

**TURN relay.** Two browsers connect directly using STUN, which is free and works
for most pairs. Roughly 10-20% of players, those behind symmetric NAT, strict
corporate wifi or certain mobile carriers, cannot be connected without a relay,
and for them the game does not work at all. A card game relays a few small JSON
messages per turn, not video, so the volume is tiny.

Set `VITE_TURN_URLS`, `VITE_TURN_USERNAME` and `VITE_TURN_CREDENTIAL` as GitHub
Actions repository secrets and the deploy picks them up. With Metered, the
dashboard's *TURN Server → Add Credential → Show ICE Servers Array* panel has all
three; the URLs are the same for every account, only the credentials are yours.

The lobby's **Check my connection** verifies it end to end: it gathers real ICE
candidates against the configured servers and reports whether a relay candidate
came back.

**Signalling.** The public PeerJS broker introduces two browsers and carries no
game traffic. If it goes down, running games are unaffected and new ones cannot
start. Self-hosting is `npx peer` behind TLS, a small stateless Node process that
fits in a free tier. Point `VITE_PEER_HOST` at it.

## Develop

```bash
npm install
npm run dev        # dev server with hot reload, also on the network
npm run build      # typecheck + production build
npm test           # seat-assignment tests, card validation, balance sim
```

## Stats

Every Character sits on the same budget: **Attack + Defense = 8**. Identity comes
from HP and abilities, not from a bigger number.

There is no Speed stat. Attack rolls are Attack vs Defense, so the Limit tracks
cost Attack: getting Stoned or Stuffed buys you Defense and takes away your
ability to hit anything.

## Interface design

One screen: opponents along the top, your family above your hand at the bottom.
Most of the layout rules below come from how established mobile card games solve
the same problems.

**Your side is at the bottom.** Opponents sit along the top, your family sits
above your hand at the bottom of the screen, the way a physical table is laid out
and the way Yu-Gi-Oh, Pokémon and Hearthstone all arrange a board. The things you
touch most are nearest your thumbs.

**Attacking is one tap from the board.** Tapping one of your characters raises a
sheet of action chips, Attack first and largest. Tap Attack, tap an enemy, done.
The action bar states what the Turn is asking for.

**Every number shows its working.** Tapping a character breaks each stat into
where it came from: base, gear, Limit tracks, and who they are standing next to.
"Attack 6 = base 6, +1 Buzzed, −1 facing Titi Bibi" is legible in a way that a
bare 6 is not, and it is how adjacency becomes visible.

**Placement is marked.** Every token shows two strips: what that Character gives
the people beside them, and what those people are giving back.

**Drunk, High and Stuffed are meters, not badges.** All three show on every
Character all the time, one pip per step, with the last pip marking that
Character's own tolerance. A Heavyweight's line sits in a different place from a
Lightweight's, and that difference is the whole mechanic.

**A card in hand and the same card in play look nothing alike.** In hand a card
is nearly full-screen with its art, full rules text and every stat spelled out,
because that is where decisions get made. On the board the same character is a
compact token showing only how hurt it is, how dangerous it is, and what is wrong
with it. Full detail is one tap away.

**Reading a card and playing it are separate actions.** Tapping anything, a card
in hand or an item already on the board, opens it to read. It only resolves when
you press the explicit Play or Use button, and then you still choose the target.
The most common complaint about Slay the Spire's mobile port is that brushing the
screen while reading a card plays it, and that is worth designing around.

**Only offer what is legal.** Cards and actions with nowhere to go are disabled
and say why, "Nobody to play it on yet", "Nobody on the other side of the table
yet", instead of walking you into a targeting step with nothing to tap. Playable
cards are outlined in gold. When a card needs a target, everything illegal dims
and the valid targets pulse.

**Numbers before prose.** Each card shows its effects as chips, `⚔+3`, `🛡-1`,
`🍺+2`, `clears Busy`, derived from the card's own data rather than its rules
text, so the chip and what the engine does cannot drift apart. A card written by
somebody else gets the same summary for free.

**A dead Turn passes itself.** If there is no legal play and nobody who can act,
the game ends the Turn rather than making you hunt for the button. It happens
every Round; it is not a decision.

**Touch sizing.** Tap targets are at least 44px with at least 8px between them.
Primary actions live in the bottom 40% of the screen where a thumb reaches; the
log sits in a top corner precisely because it is rarely wanted.

**Say things out loud.** Whose turn it is gets an unmissable flash rather than a
subtle glow, because ambient turn cues get missed.

## Card validation

Every card, ours and anyone else's, is checked against the ruleset before it can
load. Run it with:

```bash
npm run validate
```

`src/engine/cards/schema.ts` holds the hard constraints (HP 8-18,
Attack+Defense = 8, damage ceilings, mandatory Family Flaw, no card may hand out
Clout directly) plus a **power budget** that prices each ability's effects and
rejects anything over cap. Three rules worth knowing if you are writing cards:

- Self-inflicted drawbacks score **negative**. A cost is not power, and pricing
  it as power rejects characters who are already losing.
- `cooldown: 1` is **not** a limitation and earns no discount. A player takes one
  Turn per Round, so it is already available again on their next Turn. A Power
  Move worth more than the ability cap needs `cooldown: 2` or `oncePerGame`.
- Gear is priced on what it gives you: positives at face value, penalties at
  half, net capped at 4, with a hard limit of 4 on any single stat. Big upside
  with a real cost is a legal shape.

This is what makes third-party cards safe: `validatePack()` takes a
`CardPack` of characters, stuff and affairs from anyone, and returns every
violation. Anything with severity `error` must block loading. A model writing
cards cannot invent a 40-damage ability, a stat line that breaks the budget, or
a tag the engine has never heard of; the validator refuses it.

The budget is a guardrail against absurd cards, not a balance oracle. Real
balance still comes from the simulator and from humans playing.

## Balance tooling

The rules engine is pure TypeScript and runs headless, so balance questions get
answered with numbers instead of arguments.

```bash
npx tsx src/sim/simulate.ts   # full games, win rates by seat and by character
npx tsx src/sim/diagnose.ts   # where Clout actually comes from
npx tsx src/sim/sweep.ts      # Clout threshold vs player count vs game length
node   src/sim/uitest.mjs     # drives the real UI in a browser (needs npm run build + preview)
```

Environment knobs: `GAMES`, `PLAYERS`, `CLOUT`.

## Layout

```
src/engine/       pure rules engine - no React, no network, fully deterministic
  types.ts        every game concept, one file
  state.ts        createGame + the authoritative reducer
  effects.ts      the declarative effect interpreter
  selectors.ts    derived stats, adjacency, legality
  rng.ts          seeded RNG - games are reproducible from (seed, intents)
  cards/          characters.ts, stuff.ts, affairs.ts, deck.ts
src/net/          host-authoritative P2P over WebRTC (PeerJS)
src/ui/           React components
src/sim/          bots, balance harnesses, browser test
public/art/       art as <id>.webp - the card id, lowercase, no hyphens
                  (chichi.webp, titibum.webp, donutcrown.webp, …)
```

## Adding content

New cards are data, not code (§43 Modular Expansion Rule). A new character is one
object in `src/engine/cards/characters.ts`; a new Family Affair is one object in
`affairs.ts`. Effects are a declarative union in `types.ts`, and the engine
interprets them, so most new content needs no engine changes at all.

## Where this deviates from the paper ruleset

These are deliberate, and each one came out of running the simulator:

1. **Turn order is re-rolled every Round.** With fixed seating, the last player
   swings at the most-softened board and farms the kills: seat 6 won 39% of games
   against seat 1's 4%. Rotating the order flattens it to within noise.
2. **The game finishes the Round.** Crossing the Clout threshold starts a final
   Round instead of ending play instantly, so every seat gets the same number of
   Turns. Highest Clout wins; ties go to whoever crossed first.
3. **Clout to win is tuned per table size** (6 for 2-5 players, 5 for 6) so
   every size lands around 80 turns, or roughly 45 minutes. Six needs a *lower*
   threshold than four, which reads backwards until you count targets: more
   players means more to KO each Round, and KOs are where most Clout comes from.
   §2's 7/10/15 presets are all still selectable in the lobby.
4. **A game cannot run past 60 Rounds.** Highest Clout takes it. With enough
   defensive Gear on the board nobody can KO anybody and the score stops moving.
   Card balance is the real fix; this is the guarantee that a game in front of
   real people always finishes.
5. **Food, Drinks and Smoke attach to a Character and are consumed later** as a
   free once-per-turn action, rather than resolving the moment they are played.
   Attachment is what Gabby's Clear Your Plate, Dorian's Clean Your Plate,
   force-feeding and Take A Shot all read.
6. **Achievements score once per player**, not once per card. A 4-6 player deck
   holds two copies of every Character, so per-card scoring double-dips.
7. **Phase 2 and Phase 3 share one screen.** Separate budgets are still enforced
   (2 cards from hand, 3 Family Actions) but you are not locked out of playing a
   card after attacking.
8. **Stat lines follow §9/§47, not the concept art.** The art sheets use a
   different scale (HP 24-30, Defense up to 9); the ruleset budget is HP 8-18
   with Attack+Defense = 8. Where the doc gives an exact statline (Chi Chi,
   Dorian, Mikey & Moe) it is used verbatim.
9. **Power Moves above the ability cap are limited.** A Power Move gets a bigger
   budget than an ability; the price of that is it cannot also be available every
   Turn. Without the rule, a character's own ability is strictly worse than their
   Power Move and never gets played.
