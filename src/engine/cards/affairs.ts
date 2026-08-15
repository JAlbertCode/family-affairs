import type { AffairDef } from '../types'

// ---------------------------------------------------------------------------
// FAMILY AFFAIRS (§29-33) — one is revealed at the start of every Round.
// Rule of thumb from §48: change strategy, hit several Characters, create
// opportunities to exploit, and get out of the way quickly.
// Every Affair is written against Tags so it never whiffs (§29).
// ---------------------------------------------------------------------------

const C = '#b0416b'

export const AFFAIRS: AffairDef[] = [
  {
    kind: 'affair', id: 'superbowl', name: 'Super Bowl Weekend', duration: 'round', color: C,
    text: 'All Adult Characters gain +1 Alcohol. Kids gain +1 Attack this Round because supervision has deteriorated.',
    effects: [
      { k: 'limit', target: { scope: 'allActiveEveryone', withTag: 'Adult' }, track: 'alcohol', amount: 1 },
      { k: 'statMod', target: { scope: 'allActiveEveryone', withTag: 'Kid' }, stat: 'attack', amount: 1, duration: 'round' },
    ],
  },
  {
    kind: 'affair', id: 'girlstrip', name: "Girls' Trip", duration: 'round', color: C,
    text: 'All Mom Characters become Away for the Round. Kids gain +1 Attack. Troublemakers gain +1 Attack. Brothers lose 1 Attack.',
    effects: [
      { k: 'status', target: { scope: 'allActiveEveryone', withTag: 'Mom' }, status: 'Away', duration: 1 },
      { k: 'statMod', target: { scope: 'allActiveEveryone', withTag: 'Kid' }, stat: 'attack', amount: 1, duration: 'round' },
      { k: 'statMod', target: { scope: 'allActiveEveryone', withTag: 'Troublemaker' }, stat: 'attack', amount: 1, duration: 'round' },
      { k: 'statMod', target: { scope: 'allActiveEveryone', withTag: 'Brother' }, stat: 'attack', amount: -1, duration: 'round' },
      { k: 'draw', player: 'all', n: 1 },
    ],
  },
  {
    kind: 'affair', id: 'riceisalie', name: 'The Rice Is A Lie', duration: 'round', color: C,
    text: 'The family discovers Grandma uses boxed rice. Cooks lose 2 Defense and become Confused. Everyone else heals 2 HP because apparently they still ate it.',
    effects: [
      { k: 'statMod', target: { scope: 'allActiveEveryone', withTag: 'Cook' }, stat: 'defense', amount: -2, duration: 'round' },
      { k: 'status', target: { scope: 'allActiveEveryone', withTag: 'Cook' }, status: 'Confused', duration: 1 },
      { k: 'heal', target: { scope: 'allActiveEveryone', withoutTag: 'Cook' }, amount: 2 },
    ],
  },
  {
    kind: 'affair', id: 'thanksgiving', name: "Who's Hosting Thanksgiving?", duration: 'round', color: C,
    text: 'All Sisters become Busy arguing about it. All Elders become Fired Up. If there are no Sisters, Adults become Busy instead.',
    effects: [
      { k: 'status', target: { scope: 'allActiveEveryone', withTag: 'Sister' }, status: 'Busy', duration: 1 },
      { k: 'status', target: { scope: 'allActiveEveryone', withTag: 'Elder' }, status: 'Fired Up', duration: 1 },
      { k: 'statMod', target: { scope: 'allActiveEveryone' }, stat: 'defense', amount: -1, duration: 'round' },
    ],
  },
  {
    kind: 'affair', id: 'whomadethismess', name: 'Who Made This Mess?!', duration: 'round', color: C,
    text: 'Troublemakers gain +1 Attack. Caretakers become Busy cleaning it up. Everyone else loses 1 Defense dealing with it.',
    effects: [
      { k: 'statMod', target: { scope: 'allActiveEveryone', withTag: 'Troublemaker' }, stat: 'attack', amount: 1, duration: 'round' },
      { k: 'status', target: { scope: 'allActiveEveryone', withTag: 'Caretaker' }, status: 'Busy', duration: 1 },
      { k: 'statMod', target: { scope: 'allActiveEveryone', withoutTag: 'Troublemaker' }, stat: 'defense', amount: -1, duration: 'round' },
    ],
  },
  {
    kind: 'affair', id: 'titibibichina', name: 'Titi Bibi Goes To China', duration: 'round', color: C,
    text: 'All Elder Characters become Away for the Round. Their controllers each draw 1 card as a souvenir.',
    effects: [
      { k: 'status', target: { scope: 'allActiveEveryone', withTag: 'Elder' }, status: 'Away', duration: 1 },
      { k: 'draw', player: 'all', n: 1 },
    ],
  },
  {
    kind: 'affair', id: 'listedonebay', name: 'Listed On eBay', duration: 'immediate', color: C,
    text: 'Somebody sold somebody else’s stuff. Every Character loses their equipped Ride and everyone draws a card with the proceeds.',
    effects: [
      { k: 'destroyStuff', from: { scope: 'allActiveEveryone' }, subtype: 'Ride' },
      { k: 'draw', player: 'all', n: 1 },
    ],
  },
  {
    kind: 'affair', id: 'onlyoneburger', name: "There's Only One Burger", duration: 'immediate', color: C,
    text: 'Every Kid Character becomes Confused fighting over it. Every Foodie gains +1 Food and +1 Attack this Round.',
    effects: [
      { k: 'status', target: { scope: 'allActiveEveryone', withTag: 'Kid' }, status: 'Confused', duration: 1 },
      { k: 'limit', target: { scope: 'allActiveEveryone', withTag: 'Foodie' }, track: 'food', amount: 1 },
      { k: 'statMod', target: { scope: 'allActiveEveryone', withTag: 'Foodie' }, stat: 'attack', amount: 1, duration: 'round' },
    ],
  },
  {
    kind: 'affair', id: 'familycookout', name: 'Family Cookout', duration: 'immediate', color: C,
    text: 'Everybody eats. All Active Characters gain +1 Food and heal 2 HP. Cooks heal 3 instead.',
    effects: [
      { k: 'limit', target: { scope: 'allActiveEveryone' }, track: 'food', amount: 1 },
      { k: 'heal', target: { scope: 'allActiveEveryone' }, amount: 2 },
      { k: 'heal', target: { scope: 'allActiveEveryone', withTag: 'Cook' }, amount: 1 },
    ],
  },
  {
    kind: 'affair', id: 'groupchatwar', name: 'The Group Chat War', duration: 'round', color: C,
    text: 'Everyone reveals their hand. All Psychic Characters gain +2 Attack this Round because they already knew.',
    effects: [
      { k: 'revealHand', player: 'allOthers' },
      { k: 'statMod', target: { scope: 'allActiveEveryone', withTag: 'Psychic' }, stat: 'attack', amount: 2, duration: 'round' },
    ],
  },
  {
    kind: 'affair', id: 'cousinsvisit', name: 'The Cousins Are Visiting', duration: 'round', color: C,
    text: 'The house is full. Every player draws 2 cards. All Active Characters lose 1 Defense from the noise.',
    effects: [
      { k: 'draw', player: 'all', n: 2 },
      { k: 'statMod', target: { scope: 'allActiveEveryone' }, stat: 'defense', amount: -1, duration: 'round' },
    ],
  },
  {
    kind: 'affair', id: 'somebodybroughtedibles', name: 'Somebody Brought Edibles', duration: 'round', color: C,
    text: 'Every Active Character gains +1 Weed. Stoners gain +2 Attack this Round. Everyone else loses 1 Defense.',
    effects: [
      { k: 'limit', target: { scope: 'allActiveEveryone' }, track: 'weed', amount: 1 },
      { k: 'statMod', target: { scope: 'allActiveEveryone', withTag: 'Stoner' }, stat: 'attack', amount: 2, duration: 'round' },
      { k: 'statMod', target: { scope: 'allActiveEveryone', withoutTag: 'Stoner' }, stat: 'defense', amount: -1, duration: 'round' },
    ],
  },
  {
    kind: 'affair', id: 'quinceanera', name: 'The Quinceañera', duration: 'round', color: C,
    text: 'Everybody dresses up and drinks. All Adults gain +1 Alcohol and +1 Attack. All Kids gain +2 Attack.',
    effects: [
      { k: 'limit', target: { scope: 'allActiveEveryone', withTag: 'Adult' }, track: 'alcohol', amount: 1 },
      { k: 'statMod', target: { scope: 'allActiveEveryone', withTag: 'Adult' }, stat: 'attack', amount: 1, duration: 'round' },
      { k: 'statMod', target: { scope: 'allActiveEveryone', withTag: 'Kid' }, stat: 'attack', amount: 2, duration: 'round' },
    ],
  },
  {
    kind: 'affair', id: 'powerwentout', name: 'The Power Went Out', duration: 'round', color: C,
    text: 'Nobody can see anything. All Active Characters become Bad Luck for the Round. Tech Characters are unaffected and gain +2 Defense.',
    effects: [
      { k: 'status', target: { scope: 'allActiveEveryone', withoutTag: 'Tech' }, status: 'Bad Luck', duration: 1 },
      { k: 'statMod', target: { scope: 'allActiveEveryone', withTag: 'Tech' }, stat: 'defense', amount: 2, duration: 'round' },
    ],
  },
  {
    kind: 'affair', id: 'grandmasaidbehave', name: 'Grandma Said Behave', duration: 'round', color: C,
    text: 'All Troublemakers become Busy. All Elders gain +2 Attack. Respect is optional, consequences are not.',
    effects: [
      { k: 'status', target: { scope: 'allActiveEveryone', withTag: 'Troublemaker' }, status: 'Busy', duration: 1 },
      { k: 'statMod', target: { scope: 'allActiveEveryone', withTag: 'Elder' }, stat: 'attack', amount: 2, duration: 'round' },
    ],
  },
  {
    kind: 'affair', id: 'everyonesbroke', name: "Everyone's Broke Until Friday", duration: 'round', color: C,
    text: 'Every player discards 1 card at random. Everyone loses 1 Attack this Round from the mood.',
    effects: [
      { k: 'discard', player: 'all', n: 1, random: true },
      { k: 'statMod', target: { scope: 'allActiveEveryone' }, stat: 'attack', amount: -1, duration: 'round' },
    ],
  },
  {
    kind: 'affair', id: 'summervacation', name: 'Summer Vacation', duration: 'round', color: C,
    text: 'School is out. Every Kid at the table gets a burst of energy and +2 Attack for the Round, and the Adults gain +1 Defense from bracing for it.',
    effects: [
      { k: 'statMod', target: { scope: 'allActiveEveryone', withTag: 'Kid' }, stat: 'attack', amount: 2, duration: 'round' },
      { k: 'statMod', target: { scope: 'allActiveEveryone', withoutTag: 'Kid' }, stat: 'defense', amount: 1, duration: 'round' },
    ],
  },
  {
    kind: 'affair', id: 'roadtrip', name: 'Road Trip', duration: 'round', color: C,
    text: 'Everyone piles in. All Wheel Gang Characters gain +2 Defense and +1 Attack. Everyone without a Ride is squashed in the back: -1 Attack.',
    effects: [
      { k: 'statMod', target: { scope: 'allActiveEveryone', withTag: 'Wheel Gang' }, stat: 'defense', amount: 2, duration: 'round' },
      { k: 'statMod', target: { scope: 'allActiveEveryone', withTag: 'Wheel Gang' }, stat: 'attack', amount: 1, duration: 'round' },
      { k: 'statMod', target: { scope: 'allActiveEveryone', withoutTag: 'Wheel Gang' }, stat: 'attack', amount: -1, duration: 'round' },
    ],
  },
  {
    kind: 'affair', id: 'somebodyscrying', name: "Somebody's Crying In The Bathroom", duration: 'round', color: C,
    text: 'All Caretakers become Busy checking on them. Everyone else gains +1 Attack because nobody is watching.',
    effects: [
      { k: 'status', target: { scope: 'allActiveEveryone', withTag: 'Caretaker' }, status: 'Busy', duration: 1 },
      { k: 'statMod', target: { scope: 'allActiveEveryone', withoutTag: 'Caretaker' }, stat: 'attack', amount: 1, duration: 'round' },
    ],
  },
  {
    kind: 'affair', id: 'thegoodplates', name: 'She Brought Out The Good Plates', duration: 'round', color: C,
    text: 'This is serious now. All Active Characters gain +2 Defense this Round. Nobody wants to break anything.',
    effects: [
      { k: 'statMod', target: { scope: 'allActiveEveryone' }, stat: 'defense', amount: 2, duration: 'round' },
    ],
  },
  {
    kind: 'affair', id: 'whostolemycharger', name: 'Who Stole My Charger', duration: 'immediate', color: C,
    text: 'Accusations fly. Every player discards 1 card at random and draws 1. Tech Characters gain +1 Attack.',
    effects: [
      { k: 'discard', player: 'all', n: 1, random: true },
      { k: 'draw', player: 'all', n: 1 },
      { k: 'statMod', target: { scope: 'allActiveEveryone', withTag: 'Tech' }, stat: 'attack', amount: 1, duration: 'round' },
    ],
  },
  {
    kind: 'affair', id: 'thediet', name: 'Everybody Is On A Diet Now', duration: 'round', color: C,
    text: 'All Active Characters reduce Food by 1. Foodies lose 2 Attack this Round and are visibly upset.',
    effects: [
      { k: 'limit', target: { scope: 'allActiveEveryone' }, track: 'food', amount: -1 },
      { k: 'statMod', target: { scope: 'allActiveEveryone', withTag: 'Foodie' }, stat: 'attack', amount: -2, duration: 'round' },
    ],
  },
  {
    kind: 'affair', id: 'karaokenight', name: 'Karaoke Night', duration: 'round', color: C,
    text: 'Musicians and Party Animals gain +2 Attack this Round. Everyone else gains +1 Alcohol to cope.',
    effects: [
      { k: 'statMod', target: { scope: 'allActiveEveryone', withTag: 'Musician' }, stat: 'attack', amount: 2, duration: 'round' },
      { k: 'statMod', target: { scope: 'allActiveEveryone', withTag: 'Party Animal' }, stat: 'attack', amount: 2, duration: 'round' },
      { k: 'limit', target: { scope: 'allActiveEveryone', withoutTag: 'Musician' }, track: 'alcohol', amount: 1 },
    ],
  },
  {
    kind: 'affair', id: 'thefuneral', name: 'Everyone Showed Up For Once', duration: 'immediate', color: C,
    text: 'The whole family is here. Everyone patches up a little and nobody talks about it.',
    effects: [
      { k: 'heal', target: { scope: 'allActiveEveryone' }, amount: 2 },
    ],
  },
]

export const AFFAIRS_BY_ID: Record<string, AffairDef> = Object.fromEntries(
  AFFAIRS.map((a) => [a.id, a]),
)
