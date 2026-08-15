// ---------------------------------------------------------------------------
// FAMILY AFFAIRS — core types
// Implements Game Design & Ruleset v0.1
// ---------------------------------------------------------------------------

export type PlayerId = string
export type InstanceId = string // unique id of a physical card in this game
export type DefId = string      // id of a card definition

// --- Tags (§12) -------------------------------------------------------------

export const RELATIONSHIP_TAGS = [
  'Mom', 'Dad', 'Brother', 'Sister', 'Kid', 'Twin', 'Cousin',
  'Grandma', 'Grandpa', 'Aunt', 'Uncle', 'Grandkid', 'Elder', 'Adult',
] as const

export const PERSONALITY_TAGS = [
  'Troublemaker', 'Foodie', 'Cook', 'Caretaker', 'Party Animal', 'Stoner',
  'Psychic', 'Wheel Gang', 'Athlete', 'Animal Lover', 'Lightweight',
  'Heavyweight', 'Trickster', 'Collector', 'Baker', 'Musician', 'Tech',
] as const

export type Tag = (typeof RELATIONSHIP_TAGS)[number] | (typeof PERSONALITY_TAGS)[number]

// --- Statuses (§27) ---------------------------------------------------------

export type StatusName =
  | 'Confused'   // roll before action, 1-2 fails
  | 'Asleep'     // cannot act
  | 'Busy'       // cannot attack / use activated / defend another
  | 'Away'       // off-field, untargetable, not adjacent
  | 'Charmed'    // cannot attack the charmer
  | 'Fired Up'   // +2 attack
  | 'Bad Luck'   // natural 1 triggers a Bad Luck roll

export interface StatusInstance {
  name: StatusName
  /** rounds remaining; -1 = until removed, 0 = expires at end of current turn */
  duration: number
  /** for Charmed: who charmed them */
  sourcePlayer?: PlayerId
  sourceChar?: InstanceId
  /** Bad Luck triggers on natural rolls <= this (default 1) */
  threshold?: number
}

// --- Limits (§20-24) --------------------------------------------------------

export type LimitTrack = 'alcohol' | 'weed' | 'food'

export interface Limits {
  alcohol: number
  weed: number
  food: number
}

/** Threshold at which the character reaches the TOP (level-3) state of a track.
 *  Default 3 for all. Lightweight = 2 alcohol. Chi Chi = 4 weed. Dorian = 4 food. */
export interface Tolerance {
  alcohol: number
  weed: number
  food: number
}

// --- Stats (§9) -------------------------------------------------------------

export interface Stats {
  hp: number
  attack: number
  defense: number
}

/** Speed was removed: it never entered combat resolution, so it was a number
 *  on the card that changed nothing. Attack and Defense carry the fight; HP
 *  and abilities carry the identity. */
export type StatName = 'attack' | 'defense'

export interface StatMod {
  stat: StatName
  amount: number
  /** 'turn' = end of current turn, 'round' = end of current round, 'permanent' */
  duration: 'turn' | 'round' | 'permanent'
  note?: string
}

// --- Targeting --------------------------------------------------------------

export type TargetScope =
  | 'self'
  | 'adjacentAllies'
  | 'adjacentAny'          // adjacent within the same field (allies)
  | 'allMyActive'
  | 'allMyCharacters'
  | 'allEnemyActive'
  | 'allActiveEveryone'
  | 'chosenEnemyActive'
  | 'chosenAllyActive'
  | 'chosenAnyActive'
  | 'randomEnemyActive'
  | 'attacker'
  | 'defender'
  | 'eventTarget'          // the character the current effect chain is about

export interface TargetSpec {
  scope: TargetScope
  /** further filter by tag */
  withTag?: Tag
  withoutTag?: Tag
  /** cap number of characters affected */
  max?: number
}

// --- Effects ----------------------------------------------------------------
// Declarative effect DSL. Card data stays data; the engine interprets. (§43)

export type Effect =
  | { k: 'damage'; target: TargetSpec; amount: number; ignoreDefense?: boolean }
  | { k: 'heal'; target: TargetSpec; amount: number }
  | { k: 'statMod'; target: TargetSpec; stat: StatName; amount: number; duration: StatMod['duration'] }
  /** Trade Attack and Defense for the Round. Expressed as a swap rather than
   *  two statMods because the amounts depend on the Character it lands on. */
  | { k: 'swapStats'; target: TargetSpec }
  | { k: 'status'; target: TargetSpec; status: StatusName; duration: number; threshold?: number }
  | { k: 'removeStatus'; target: TargetSpec; status: StatusName }
  | { k: 'limit'; target: TargetSpec; track: LimitTrack; amount: number }
  | { k: 'draw'; player: 'controller' | 'targetController' | 'all' | 'allOthers'; n: number }
  | { k: 'discard'; player: 'controller' | 'targetController' | 'all' | 'allOthers'; n: number; random?: boolean }
  | { k: 'clout'; player: 'controller' | 'targetController'; n: number }
  | { k: 'grantAction'; target: TargetSpec; n: number }
  | { k: 'extraAttack'; target: TargetSpec; attackMod?: number }
  | { k: 'stealStuff'; from: TargetSpec; subtype?: StuffType }
  | { k: 'destroyStuff'; from: TargetSpec; subtype?: StuffType }
  | { k: 'forceConsume'; target: TargetSpec; subtype: 'Food' | 'Drink' | 'Smoke' }
  | { k: 'revealHand'; player: 'targetController' | 'allOthers' }
  | { k: 'badLuck'; target: TargetSpec }
  | { k: 'roll'; branches: RollBranch[] }
  | { k: 'ifTag'; tag: Tag; present: boolean; then: Effect[]; else?: Effect[] }
  | { k: 'ifCharacterActive'; defId: DefId; then: Effect[]; else?: Effect[] }
  | { k: 'startMinigame'; kind: 'tictactoe' | 'rps'; stake: { kind: 'damage'; amount: number } | { kind: 'draw'; n: number } | { kind: 'status'; status: StatusName } }
  | { k: 'note'; text: string }

export interface RollBranch {
  /** d6 faces this branch covers */
  on: number[]
  effects: Effect[]
  label?: string
}

// --- Card definitions -------------------------------------------------------

export type StuffType = 'Food' | 'Drink' | 'Smoke' | 'Gear' | 'Ride' | 'Pet' | 'Consumable'

export interface Ability {
  name: string
  text: string
  /** costs 1 Family Action unless 0 */
  actionCost: 0 | 1
  effects: Effect[]
  /** requires the character be at/above these limit levels */
  requiresLimit?: Partial<Record<LimitTrack, number>>
  /** once per game */
  oncePerGame?: boolean
  /** rounds between uses */
  cooldown?: number
}

export interface Achievement {
  name: string
  text: string
  clout: number
  /** engine-checked achievement key */
  key: string
}

export interface Passive {
  name: string
  text: string
  /** engine hook keys this passive participates in; see effects.ts */
  hooks: string[]
}

export interface CharacterDef {
  kind: 'character'
  id: DefId
  name: string
  title: string
  archetype: 'Tank' | 'Bruiser' | 'Glass Cannon' | 'Trickster' | 'Support' | 'Balanced'
  stats: Stats
  tags: Tag[]
  tolerance: Tolerance
  /** how many Gear this character may equip (default 1) */
  gearSlots?: number
  /** how many Rides this character may equip (default 1) */
  rideSlots?: number
  /** how many Pets this character may keep (default 1) */
  petSlots?: number
  /** total attached Stuff this character may carry (default 3) */
  itemSlots?: number
  passive?: Passive
  ability?: Ability
  powerMove?: Ability
  flaw?: Passive
  achievement?: Achievement
  /** art file in /public/art, e.g. "chichi.png" — optional */
  art?: string
  /** accent colour for the card frame */
  color: string
}

export interface StuffDef {
  kind: 'stuff'
  id: DefId
  name: string
  subtype: StuffType
  text: string
  /** copies in the Family Deck */
  copies: number
  /** Gear/Ride/Pet: persistent stat bonuses while equipped */
  equipMods?: { stat: StatName; amount: number }[]
  /** Pet only: chance out of 6 that the pet loses its nerve and does nothing */
  skittish?: number
  /** Gear/Ride/Pet may carry an ability the holder can trigger while equipped. */
  activated?: Ability
  /** Can this be handed to a RIVAL? A drink or an edible can be slipped to
   *  somebody; a joint has to be rolled, lit and passed, so it cannot. */
  giftable?: boolean
  /** Some things belong to one person. Only these Characters may hold it. */
  onlyFor?: DefId[]
  /** Food/Drink/Smoke: limit gained on consumption */
  limitGain?: Partial<Record<LimitTrack, number>>
  /** effects on use/consume */
  effects: Effect[]
  /** a single glyph shown on the card face; card packs may supply their own */
  icon?: string
  /** filename under public/art/. When present it replaces the glyph on the
   *  full-size card face and tints the board token. The glyph stays as the
   *  fallback so a card is never blank while art is still being made. */
  art?: string
  /** may be played during another player's battle (§16) */
  interfere?: boolean
  /** Interfere cards target: which window they are legal in */
  interfereWindow?: 'beforeRoll' | 'afterRoll'
  color: string
}

export interface AffairDef {
  kind: 'affair'
  id: DefId
  name: string
  text: string
  /** immediate effects on reveal */
  effects: Effect[]
  /** 'round' = active all round, 'immediate' = resolve and discard */
  duration: 'immediate' | 'round'
  color: string
}

export type CardDef = CharacterDef | StuffDef | AffairDef

// --- Runtime instances ------------------------------------------------------

export type Slot = 0 | 1 | 2 // LEFT, CENTER, RIGHT (§5)

export interface CharacterInstance {
  iid: InstanceId
  defId: DefId
  owner: PlayerId
  hp: number
  maxHp: number
  limits: Limits
  statuses: StatusInstance[]
  mods: StatMod[]
  /** equipped Gear/Ride/Food instance ids */
  attached: InstanceId[]
  /** has this character already acted this turn (§8 phase 3) */
  actedThisTurn: boolean
  /** KO recovery: rounds until it may return */
  koRecoveryTurns: number
  /** where it lives */
  zone: 'active' | 'bench' | 'recovering'
  slot: Slot | null
  /** ability cooldown bookkeeping: abilityName -> round it may next be used */
  cooldowns: Record<string, number>
  /** achievement keys already scored */
  achievementsScored: string[]
  /** per-round scratch used by achievements/passives */
  scratch: Record<string, number | string[]>
}

export interface StuffInstance {
  iid: InstanceId
  defId: DefId
  owner: PlayerId
  /** character it is attached to, if equipped */
  attachedTo: InstanceId | null
}

export type CardInstance =
  | ({ type: 'character' } & CharacterInstance)
  | ({ type: 'stuff' } & StuffInstance)

// --- Player -----------------------------------------------------------------

export interface PlayerState {
  id: PlayerId
  name: string
  clout: number
  hand: InstanceId[]
  /** slot -> character instance id */
  field: (InstanceId | null)[]
  bench: InstanceId[]
  /** actions remaining this turn (§8 phase 3) */
  actionsLeft: number
  /** cards played from hand this turn (max 2, §8 phase 2) */
  cardsPlayedThisTurn: number
  /** interfere cards played in the current battle */
  interferedThisBattle: number
  connected: boolean
}

// --- Combat (§14) -----------------------------------------------------------

export type BattleStage =
  | 'declared'      // attacker & target chosen, interference window open
  | 'rolling'       // rolls being made
  | 'resolved'

export interface BattleState {
  attackerPlayer: PlayerId
  attackerChar: InstanceId
  defenderPlayer: PlayerId
  defenderChar: InstanceId
  stage: BattleStage
  /** players who have passed on the current interference window */
  passed: PlayerId[]
  attackRoll: number | null
  defenseRoll: number | null
  attackScore: number | null
  defenseScore: number | null
  /** modifiers injected by interfere cards */
  attackMod: number
  defenseMod: number
  damageDealt: number | null
  /** free extra attack (no action cost), e.g. from Divide & Conquer */
  isFree: boolean
  log: string[]
}

// --- Pending decisions ------------------------------------------------------
// The engine never guesses; when a choice is required it parks a Pending.

export interface PendingChoice {
  id: string
  player: PlayerId
  kind: 'chooseCharacter' | 'chooseCard' | 'chooseOption'
  prompt: string
  /** legal instance ids, or option labels */
  options: { value: string; label: string }[]
  /** effects queued to run once resolved, with {eventTarget} bound */
  resume: Effect[]
  min: number
  max: number
}

// --- Game state -------------------------------------------------------------

/** 'draw' = must draw to begin the turn; 'main' = play cards + spend actions
 *  (the doc's Phase 2 and Phase 3 share one screen, with separate budgets:
 *   2 cards from hand, 2 Family Actions); 'end' = discard down to 7 and pass. */
export type Phase = 'lobby' | 'draw' | 'main' | 'end' | 'gameover'

export interface GameState {
  version: number
  seed: number
  cloutToWin: number
  players: PlayerId[]
  playerState: Record<PlayerId, PlayerState>
  characters: Record<InstanceId, CharacterInstance>
  stuff: Record<InstanceId, StuffInstance>
  familyDeck: InstanceId[]
  familyDiscard: InstanceId[]
  affairsDeck: DefId[]
  affairsDiscard: DefId[]
  /** the Kitchen Table market (§42) — 3 face-up cards */
  kitchenTable: (InstanceId | null)[]
  useKitchenTable: boolean
  currentAffair: DefId | null
  round: number
  turnIndex: number       // index into players[]
  phase: Phase
  battle: BattleState | null
  pending: PendingChoice | null
  /** Set once someone crosses the Clout threshold. The Round is played out so
   *  every seat gets the same number of Turns, then the game ends. */
  finalRound: boolean
  /** order in which players crossed the threshold — breaks ties */
  reachedThreshold: PlayerId[]
  winner: PlayerId | null
  /** Clout scored per player, per achievement key — once each, per player. */
  achievementsScored: Record<PlayerId, string[]>
  /** Scoreboard breakdown, survives log truncation. */
  cloutSources: Record<PlayerId, { combat: number; achievement: number; other: number }>
  /** A minigame currently blocking play, if any. */
  minigame: MinigameState | null
  /** Seating order for the current Round. Re-rolled every Round (see §9 Speed
   *  / initiative) because a fixed order hands the last seat every last hit. */
  turnOrder: PlayerId[]
  log: LogEntry[]
  /** monotonically increasing, used to key UI animations */
  tick: number
}

// --- Minigames (§ table interaction) ---------------------------------------

export interface MinigameState {
  /** 'rps' resolves in one pick each and exists because tic tac toe is the
   *  long one — a minigame must never hold the table up for long. */
  kind: 'tictactoe' | 'rps'
  /** the two players involved; [0] moves first and is X */
  players: [PlayerId, PlayerId]
  /** tic tac toe: 9 cells, null | 0 | 1 (index into players) */
  board: (0 | 1 | null)[]
  /** rock paper scissors: each player's pick, 0 rock / 1 paper / 2 scissors */
  picks: (number | null)[]
  /** how many times a tie has been replayed */
  ties: number
  turn: 0 | 1
  /** what the winner gets */
  stake:
    | { kind: 'damage'; amount: number }
    | { kind: 'draw'; n: number }
    | { kind: 'status'; status: StatusName }
    /** raised by a tied combat roll: the loser's fighter takes the damage */
    | { kind: 'battleTie'; damage: number; attackerChar: InstanceId; defenderChar: InstanceId }
  /** set once resolved */
  winner: PlayerId | null
  done: boolean
  prompt: string
}

export interface LogEntry {
  t: number
  round: number
  text: string
  kind: 'system' | 'combat' | 'affair' | 'play' | 'clout' | 'status'
}

// --- Player intents (what clients send the host) ----------------------------

export type Intent =
  | { k: 'startGame'; cloutToWin: number; useKitchenTable: boolean }
  | { k: 'drawCard'; fromKitchenTable?: number }
  | { k: 'playCard'; iid: InstanceId; targetChar?: InstanceId; slot?: Slot }
  | { k: 'attack'; attacker: InstanceId; defender: InstanceId }
  | { k: 'useAbility'; char: InstanceId; which: 'ability' | 'powerMove'; targetChar?: InstanceId }
  | { k: 'consume'; char: InstanceId; iid: InstanceId }
  | { k: 'minigameMove'; cell: number }
  | { k: 'useItem'; char: InstanceId; iid: InstanceId; targetChar?: InstanceId }
  | { k: 'swap'; activeChar: InstanceId; benchChar: InstanceId }
  | { k: 'recoverStatus'; char: InstanceId; status: StatusName }
  | { k: 'interfere'; iid: InstanceId; targetChar?: InstanceId }
  | { k: 'passInterference' }
  | { k: 'confirmRolls' }
  | { k: 'resolveChoice'; choiceId: string; values: string[] }
  | { k: 'endTurn'; recover?: LimitTrack }
  | { k: 'discardDown'; iids: InstanceId[] }

export interface IntentEnvelope {
  player: PlayerId
  intent: Intent
}
