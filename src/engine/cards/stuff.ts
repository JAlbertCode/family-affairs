import type { StuffDef } from '../types'

// ---------------------------------------------------------------------------
// STUFF (§17-19, §37-39) — Food, Drink, Smoke, Gear, Ride, Consumable.
// `copies` follows the §50 prototype composition. deck.ts scales it up for
// 4-6 player games so the deck does not run dry.
// ---------------------------------------------------------------------------

const FOOD = '#e0a43c'
const DRINK = '#d4713f'
const SMOKE = '#6d9f52'
const GEAR = '#8892b0'
const RIDE = '#4aa3d8'
const UTIL = '#b06fb0'

export const STUFF: StuffDef[] = [
  // ------------------------------------------------------------------ FOOD --
  {
    kind: 'stuff', id: 'burger', name: 'Burger', subtype: 'Food', copies: 3, giftable: true, icon: '🍔', color: FOOD,
    text: 'Heal 2 HP. +1 Food.',
    limitGain: { food: 1 },
    effects: [{ k: 'heal', target: { scope: 'eventTarget' }, amount: 2 }],
  },
  {
    kind: 'stuff', id: 'cake', name: 'Cake', subtype: 'Food', copies: 2, giftable: true, icon: '🍰', color: FOOD,
    text: 'Heal 3 HP. +1 Food.',
    limitGain: { food: 1 },
    effects: [{ k: 'heal', target: { scope: 'eventTarget' }, amount: 3 }],
  },
  {
    kind: 'stuff', id: 'garbageplate', name: 'Garbage Plate', subtype: 'Food', copies: 2, giftable: true, icon: '🍽️', color: FOOD,
    text: 'Heal 3 HP. +2 Food. +2 Attack this Turn.',
    limitGain: { food: 2 },
    effects: [
      { k: 'heal', target: { scope: 'eventTarget' }, amount: 3 },
      { k: 'statMod', target: { scope: 'eventTarget' }, stat: 'attack', amount: 2, duration: 'turn' },
    ],
  },
  {
    kind: 'stuff', id: 'sancocho', name: 'Sancocho', subtype: 'Food', copies: 2, giftable: true, icon: '🍲', color: FOOD,
    text: '+1 Food. Heal 1 HP to every Active Character in that Family.',
    limitGain: { food: 1 },
    effects: [{ k: 'heal', target: { scope: 'allMyActive' }, amount: 1 }],
  },
  {
    kind: 'stuff', id: 'pizzacake', name: 'Pizza Cake', subtype: 'Food', copies: 2, giftable: true, icon: '🍕', color: FOOD,
    text: 'Heal 2 HP. +1 Food. +1 Attack this Turn.',
    limitGain: { food: 1 },
    effects: [
      { k: 'heal', target: { scope: 'eventTarget' }, amount: 2 },
      { k: 'statMod', target: { scope: 'eventTarget' }, stat: 'attack', amount: 1, duration: 'turn' },
    ],
  },
  {
    kind: 'stuff', id: 'chickenwings', name: 'Chicken Wings', subtype: 'Food', copies: 2, giftable: true, icon: '🍗', color: FOOD,
    text: 'Heal 1 HP. +1 Food. +2 Defense this Round.',
    limitGain: { food: 1 },
    effects: [
      { k: 'heal', target: { scope: 'eventTarget' }, amount: 1 },
      { k: 'statMod', target: { scope: 'eventTarget' }, stat: 'defense', amount: 2, duration: 'round' },
    ],
  },
  {
    kind: 'stuff', id: 'pineapple', name: 'Pineapple', subtype: 'Food', copies: 2, giftable: true, icon: '🍍', color: FOOD,
    text: 'Eat it: heal 2 HP and +1 Food. Or throw it: 3 damage to an Active enemy.',
    limitGain: { food: 1 },
    effects: [{ k: 'heal', target: { scope: 'eventTarget' }, amount: 2 }],
  },

  // ----------------------------------------------------------------- DRINK --
  {
    kind: 'stuff', id: 'pepsi', name: 'Can Of Pepsi', subtype: 'Drink', copies: 3, giftable: true, icon: '🥤', color: '#d4713f',
    text: 'No alcohol. Heal 2 HP and reduce Weed by 1. Sometimes you just need a Pepsi.',
    effects: [
      { k: 'heal', target: { scope: 'eventTarget' }, amount: 2 },
      { k: 'limit', target: { scope: 'eventTarget' }, track: 'weed', amount: -1 },
    ],
  },
  {
    kind: 'stuff', id: 'beer', name: 'Beer', subtype: 'Drink', copies: 3, giftable: true, icon: '🍺', color: DRINK,
    text: '+1 Alcohol. Heal 1 HP.',
    limitGain: { alcohol: 1 },
    effects: [{ k: 'heal', target: { scope: 'eventTarget' }, amount: 1 }],
  },
  {
    kind: 'stuff', id: 'shot', name: 'Shot', subtype: 'Drink', copies: 3, giftable: true, icon: '🥃', color: DRINK,
    text: 'INTERFERE. Give any Character +1 Alcohol.',
    limitGain: { alcohol: 1 },
    effects: [],
    interfere: true,
    interfereWindow: 'beforeRoll',
  },
  {
    kind: 'stuff', id: 'strongdrink', name: 'Strong Drink', subtype: 'Drink', copies: 2, giftable: true, icon: '🍸', color: DRINK,
    text: '+2 Alcohol. +3 Attack this Turn. Dangerous.',
    limitGain: { alcohol: 2 },
    effects: [{ k: 'statMod', target: { scope: 'eventTarget' }, stat: 'attack', amount: 3, duration: 'turn' }],
  },
  {
    kind: 'stuff', id: 'mocktail', name: 'Mocktail', subtype: 'Drink', copies: 2, icon: '🍹', color: DRINK,
    text: 'Reduce Alcohol by 2. Heal 2 HP. No Alcohol gained.',
    effects: [
      { k: 'limit', target: { scope: 'eventTarget' }, track: 'alcohol', amount: -2 },
      { k: 'heal', target: { scope: 'eventTarget' }, amount: 2 },
    ],
  },

  // ----------------------------------------------------------------- SMOKE --
  {
    kind: 'stuff', id: 'weednug', name: 'Weed Nug', subtype: 'Smoke', copies: 3, icon: '🌿', color: SMOKE,
    text: '+1 Weed.',
    limitGain: { weed: 1 },
    effects: [],
  },
  {
    kind: 'stuff', id: 'edible', name: 'Edible', subtype: 'Smoke', copies: 2, giftable: true, icon: '🍪', color: SMOKE,
    text: '+1 Food and +1 Weed. Heal 1 HP.',
    limitGain: { weed: 1, food: 1 },
    effects: [{ k: 'heal', target: { scope: 'eventTarget' }, amount: 1 }],
  },
  {
    kind: 'stuff', id: 'weedbrownies', name: 'Weed Brownies', subtype: 'Smoke', copies: 2, giftable: true, icon: '🍫', color: SMOKE,
    text: 'Counts as Food and Smoke. +1 Food, +1 Weed, heal 2 HP, -1 Attack this Round.',
    limitGain: { weed: 1, food: 1 },
    effects: [
      { k: 'heal', target: { scope: 'eventTarget' }, amount: 2 },
      { k: 'statMod', target: { scope: 'eventTarget' }, stat: 'attack', amount: -1, duration: 'round' },
    ],
  },
  {
    kind: 'stuff', id: 'contacthigh', name: 'Contact High', subtype: 'Smoke', copies: 2, icon: '💨', color: SMOKE,
    text: 'INTERFERE. The target Character and both Characters adjacent to them gain +1 Weed.',
    effects: [
      { k: 'limit', target: { scope: 'eventTarget' }, track: 'weed', amount: 1 },
      { k: 'limit', target: { scope: 'adjacentAllies' }, track: 'weed', amount: 1 },
    ],
    interfere: true,
    interfereWindow: 'beforeRoll',
  },

  {
    kind: 'stuff', id: 'nerdedibles', name: 'The Nerd Edibles', subtype: 'Smoke', copies: 3, giftable: true, icon: '🍬', color: '#6d9f52',
    text: 'Unexpectedly strong. +2 Weed. This Character loses their next Turn contemplating life.',
    limitGain: { weed: 2 },
    effects: [{ k: 'status', target: { scope: 'eventTarget' }, status: 'Asleep', duration: 1 }],
  },

  // ------------------------------------------------------------------ GEAR --
  {
    kind: 'stuff', id: 'chancla', name: 'Chancla', subtype: 'Gear', copies: 2, icon: '🩴', color: GEAR,
    text: 'Equip. +2 Attack. A swift strike with ultimate abuela power.',
    equipMods: [{ stat: 'attack', amount: 2 }],
    effects: [],
  },
  {
    kind: 'stuff', id: 'woodenspoon', name: 'Wooden Spoon', subtype: 'Gear', copies: 2, icon: '🥄', color: GEAR,
    text: 'Equip. +1 Attack, +1 Defense. Her sacred weapon.',
    equipMods: [{ stat: 'attack', amount: 1 }, { stat: 'defense', amount: 1 }],
    effects: [],
  },
  {
    kind: 'stuff', id: 'shades', name: 'Shades', subtype: 'Gear', copies: 2, icon: '🕶️', color: GEAR,
    text: 'Equip. +2 Defense. Nobody knows what you are looking at.',
    equipMods: [{ stat: 'defense', amount: 2 }],
    effects: [],
  },
  {
    kind: 'stuff', id: 'pan', name: 'Pan', subtype: 'Gear', copies: 1, icon: '🍳', color: GEAR,
    text: 'Equip. +3 Attack, -1 Defense. Heavy, loud, and swung with feeling.',
    equipMods: [{ stat: 'attack', amount: 3 }, { stat: 'defense', amount: -1 }],
    effects: [],
  },
  {
    kind: 'stuff', id: 'pineapplegloves', name: 'Pineapple Gloves', subtype: 'Gear', copies: 1, icon: '🥊', color: GEAR,
    text: 'Equip. +2 Attack, +1 Defense. Reduces damage taken by 1.',
    equipMods: [{ stat: 'attack', amount: 2 }, { stat: 'defense', amount: 1 }],
    effects: [],
  },
  {
    kind: 'stuff', id: 'bigsexychain', name: 'Big Sexy Chain', subtype: 'Gear', copies: 1, icon: '📿', color: GEAR,
    text: 'Equip. +1 Attack. Adjacent allies gain +1 Attack. The chain of greatness.',
    equipMods: [{ stat: 'attack', amount: 1 }],
    effects: [],
  },
  {
    kind: 'stuff', id: 'guitar', name: 'Guitar', subtype: 'Gear', copies: 1, icon: '🎸', color: GEAR,
    text: 'Equip. +2 Attack. Life rolls different when you play your own song.',
    equipMods: [{ stat: 'attack', amount: 2 }],
    effects: [],
  },

  {
    kind: 'stuff', id: 'walkingstick', name: "Manny's Walking Stick", subtype: 'Gear', copies: 2, icon: '🦯', color: GEAR,
    text: 'Equip. +2 Attack. Trip somebody: spend an Action to make an Active enemy Busy for a Round.',
    equipMods: [{ stat: 'attack', amount: 2 }],
    activated: {
      name: 'Trip Them',
      text: 'An Active enemy goes down and becomes Busy for the Round.',
      actionCost: 1,
      cooldown: 1,
      effects: [{ k: 'status', target: { scope: 'chosenEnemyActive' }, status: 'Busy', duration: 1 }],
    },
    effects: [],
  },
  {
    kind: 'stuff', id: 'smartwatch', name: 'Smart Watch', subtype: 'Gear', copies: 2, icon: '⌚', color: GEAR,
    text: 'Equip. +1 Attack, +1 Defense. Check your rings: spend an Action to draw a card.',
    equipMods: [{ stat: 'attack', amount: 1 }, { stat: 'defense', amount: 1 }],
    activated: {
      name: 'Close Your Rings',
      text: 'Draw a card. The watch says you are behind on steps.',
      actionCost: 1,
      cooldown: 2,
      effects: [{ k: 'draw', player: 'controller', n: 1 }],
    },
    effects: [],
  },
  {
    kind: 'stuff', id: 'oculus', name: 'The Oculus', subtype: 'Gear', copies: 2, icon: '🥽', color: GEAR,
    text: 'Equip. +2 Defense, -1 Attack. Hand it to somebody: spend an Action to make an Active enemy Confused.',
    equipMods: [{ stat: 'defense', amount: 2 }, { stat: 'attack', amount: -1 }],
    activated: {
      name: 'You Have To Try This',
      text: 'An Active enemy puts it on and becomes Confused. They cannot see the room.',
      actionCost: 1,
      cooldown: 1,
      effects: [{ k: 'status', target: { scope: 'chosenEnemyActive' }, status: 'Confused', duration: 1 }],
    },
    effects: [],
  },
  {
    kind: 'stuff', id: 'spatula', name: 'The Spatula', subtype: 'Gear', copies: 2, icon: '🍳', color: GEAR,
    text: 'Equip. +1 Attack, +1 Defense. Serve somebody: spend an Action to force any Character to eat a Food they are holding.',
    equipMods: [{ stat: 'attack', amount: 1 }, { stat: 'defense', amount: 1 }],
    activated: {
      name: 'Eat Something',
      text: 'Force a Character to consume a Food attached to them, wherever that lands them.',
      actionCost: 1,
      effects: [{ k: 'forceConsume', target: { scope: 'chosenAnyActive' }, subtype: 'Food' }],
    },
    effects: [],
  },
  {
    kind: 'stuff', id: 'bentpan', name: "Liv's Bent Pan", subtype: 'Gear', copies: 1, icon: '🥘', color: GEAR,
    text: 'Equip. +3 Attack, -1 Defense. Permanently deformed. Nobody has ever explained what happened, and Liv is not going to start now.',
    equipMods: [{ stat: 'attack', amount: 3 }, { stat: 'defense', amount: -1 }],
    activated: {
      name: 'Swing It Again',
      text: 'Deal 3 damage to an Active enemy. The shape gets worse every time.',
      actionCost: 1,
      cooldown: 2,
      effects: [{ k: 'damage', target: { scope: 'chosenEnemyActive' }, amount: 3 }],
    },
    effects: [],
  },

  // ------------------------------------------------------------------ RIDE --
  {
    kind: 'stuff', id: 'skateboard', name: 'Skateboard', subtype: 'Ride', copies: 2, icon: '🛹', color: RIDE,
    text: 'Ride. +1 Attack, +1 Defense. Roll up on somebody.',
    equipMods: [{ stat: 'attack', amount: 1 }, { stat: 'defense', amount: 1 }],
    effects: [],
  },
  {
    kind: 'stuff', id: 'wheelchair', name: 'Wheelchair', subtype: 'Ride', copies: 2, icon: '🦽', color: RIDE,
    text: 'Ride. +2 Defense. Wheels beat legs.',
    equipMods: [{ stat: 'defense', amount: 2 }],
    effects: [],
  },
  {
    kind: 'stuff', id: 'rocketwheelchair', name: 'Rocket Wheelchair', subtype: 'Ride', copies: 1, icon: '🚀', color: RIDE,
    text: 'Ride. +2 Attack, +1 Defense. Absolutely not street legal.',
    equipMods: [{ stat: 'attack', amount: 2 }, { stat: 'defense', amount: 1 }],
    effects: [],
  },
  {
    kind: 'stuff', id: 'momvan', name: 'Mom Van', subtype: 'Ride', copies: 1, icon: '🚐', color: RIDE,
    text: 'Ride. +1 Defense. Adjacent allies gain +1 Defense. Everybody gets in.',
    equipMods: [{ stat: 'defense', amount: 1 }],
    effects: [],
  },
  {
    kind: 'stuff', id: 'shoppingcart', name: 'Shopping Cart', subtype: 'Ride', copies: 1, icon: '🛒', color: RIDE,
    text: 'Ride. +2 Attack, -1 Defense. It has one bad wheel.',
    equipMods: [{ stat: 'attack', amount: 2 }, { stat: 'defense', amount: -1 }],
    effects: [],
  },
  {
    kind: 'stuff', id: 'bike', name: 'Bike', subtype: 'Ride', copies: 1, icon: '🚲', color: RIDE,
    text: 'Ride. +1 Attack, +1 Defense.',
    equipMods: [{ stat: 'attack', amount: 1 }, { stat: 'defense', amount: 1 }],
    effects: [],
  },

  // ------------------------------------------------------------------ PET --
  {
    kind: 'stuff', id: 'cash', name: 'Cash The Dog', subtype: 'Pet', copies: 2, icon: '🐕', color: '#c98d4a',
    text: 'Pet. +2 Attack, +1 Defense. Cash is brave right up until he is not — on a roll of 1 he hides and gives nothing this battle.',
    equipMods: [{ stat: 'attack', amount: 2 }, { stat: 'defense', amount: 1 }],
    skittish: 1,
    effects: [],
  },

  {
    kind: 'stuff', id: 'elephant', name: 'The Elephant', subtype: 'Ride', copies: 1, icon: '🐘', color: '#4aa3d8',
    text: 'Ride. +3 Attack, -1 Defense. Enormous, unhurried, and impossible to argue with.',
    equipMods: [{ stat: 'attack', amount: 3 }, { stat: 'defense', amount: -1 }],
    effects: [],
  },

  // ------------------------------------------------------------ CONSUMABLE --
  {
    kind: 'stuff', id: 'takeashot', name: 'Take A Shot', subtype: 'Consumable', copies: 2, icon: '🥃', color: UTIL,
    text: 'INTERFERE. Give any Character +1 Alcohol right now. Watch what happens.',
    effects: [{ k: 'limit', target: { scope: 'eventTarget' }, track: 'alcohol', amount: 1 }],
    interfere: true,
    interfereWindow: 'beforeRoll',
  },
  {
    kind: 'stuff', id: 'tooskinny', name: "Grandma Says You're Too Skinny", subtype: 'Consumable', copies: 1, icon: '👵', color: UTIL,
    text: 'INTERFERE. Target Character must consume a Food attached to them immediately.',
    effects: [{ k: 'forceConsume', target: { scope: 'eventTarget' }, subtype: 'Food' }],
    interfere: true,
    interfereWindow: 'beforeRoll',
  },
  {
    kind: 'stuff', id: 'notsofast', name: 'Not So Fast', subtype: 'Consumable', copies: 2, icon: '✋', color: UTIL,
    text: 'INTERFERE. The attacking Character suffers -3 Attack for this battle.',
    effects: [{ k: 'statMod', target: { scope: 'attacker' }, stat: 'attack', amount: -3, duration: 'turn' }],
    interfere: true,
    interfereWindow: 'beforeRoll',
  },
  {
    kind: 'stuff', id: 'holdmyplate', name: 'Hold My Plate', subtype: 'Consumable', copies: 1, icon: '🛡️', color: UTIL,
    text: 'INTERFERE. The defending Character gains +3 Defense for this battle and heals 2 HP.',
    effects: [
      { k: 'statMod', target: { scope: 'defender' }, stat: 'defense', amount: 3, duration: 'turn' },
      { k: 'heal', target: { scope: 'defender' }, amount: 2 },
    ],
    interfere: true,
    interfereWindow: 'beforeRoll',
  },
  {
    kind: 'stuff', id: 'familydrama', name: 'Family Drama', subtype: 'Consumable', copies: 1, icon: '🎭', color: UTIL,
    text: 'INTERFERE. The attacker becomes Confused. Roll before every Action, 1-2 fails.',
    effects: [{ k: 'status', target: { scope: 'attacker' }, status: 'Confused', duration: 1 }],
    interfere: true,
    interfereWindow: 'beforeRoll',
  },
  {
    kind: 'stuff', id: 'siblingrivalry', name: 'Sibling Rivalry', subtype: 'Consumable', copies: 1, icon: '👊', color: UTIL,
    text: 'INTERFERE. Attacker and defender each take 2 damage. Nobody wins this one.',
    effects: [
      { k: 'damage', target: { scope: 'attacker' }, amount: 2, ignoreDefense: true },
      { k: 'damage', target: { scope: 'defender' }, amount: 2, ignoreDefense: true },
    ],
    interfere: true,
    interfereWindow: 'afterRoll',
  },
  {
    kind: 'stuff', id: 'whosephoneisthis', name: 'Whose Phone Is This?', subtype: 'Consumable', copies: 1, icon: '📱', color: UTIL,
    text: 'Reveal every other player’s hand. Draw 1 card.',
    effects: [
      { k: 'revealHand', player: 'allOthers' },
      { k: 'draw', player: 'controller', n: 1 },
    ],
  },
  {
    kind: 'stuff', id: 'itsnotyourturn', name: "It's Not Your Turn", subtype: 'Consumable', copies: 1, icon: '⏳', color: UTIL,
    text: 'INTERFERE. Cancel one Gear or Ride bonus on the attacking Character for this battle.',
    effects: [{ k: 'statMod', target: { scope: 'attacker' }, stat: 'attack', amount: -2, duration: 'turn' }],
    interfere: true,
    interfereWindow: 'beforeRoll',
  },
  {
    kind: 'stuff', id: 'tictactoe', name: 'Tic Tac Toe', subtype: 'Consumable', copies: 1, icon: '⭕', color: '#b06fb0',
    text: 'Settle it properly. Play a real game of tic tac toe against an opponent — the winner deals 4 damage to a Character of their choice.',
    effects: [{ k: 'startMinigame', kind: 'tictactoe', stake: { kind: 'damage', amount: 4 } }],
  },
  {
    kind: 'stuff', id: 'shootforit', name: 'Shoot For It', subtype: 'Consumable', copies: 2, icon: '✊', color: UTIL,
    text: 'One throw of rock paper scissors against the player in the lead. Winner deals 3 damage. Takes five seconds.',
    effects: [{ k: 'startMinigame', kind: 'rps', stake: { kind: 'damage', amount: 3 } }],
  },
  {
    kind: 'stuff', id: 'onemoreround', name: 'One More Round', subtype: 'Consumable', copies: 1, icon: '🍻', color: UTIL,
    text: 'Everybody drinks. Every Active Character in the game gains +1 Alcohol, whether they wanted to or not.',
    effects: [{ k: 'limit', target: { scope: 'allActiveEveryone' }, track: 'alcohol', amount: 1 }],
  },
  {
    kind: 'stuff', id: 'passitaround', name: 'Pass It Around', subtype: 'Consumable', copies: 1, icon: '💨', color: UTIL,
    text: 'INTERFERE. Give any Character +2 Weed right now. Watch them slide straight past Stoned.',
    effects: [{ k: 'limit', target: { scope: 'eventTarget' }, track: 'weed', amount: 2 }],
    interfere: true,
    interfereWindow: 'beforeRoll',
  },
  {
    kind: 'stuff', id: 'seconds', name: 'You Are Having Seconds', subtype: 'Consumable', copies: 1, icon: '🍽️', color: UTIL,
    text: 'INTERFERE. Give any Character +2 Food. Being Stuffed is a real problem and it is now theirs.',
    effects: [{ k: 'limit', target: { scope: 'eventTarget' }, track: 'food', amount: 2 }],
    interfere: true,
    interfereWindow: 'beforeRoll',
  },
  {
    kind: 'stuff', id: 'flatcoke', name: 'Flat Coke', subtype: 'Drink', copies: 2, giftable: true, icon: '🥤', color: DRINK,
    text: 'No fizz. No alcohol. -1 Attack for the Round — too disappointed to fight anybody.',
    effects: [{ k: 'statMod', target: { scope: 'eventTarget' }, stat: 'attack', amount: -1, duration: 'round' }],
  },
  {
    kind: 'stuff', id: 'leftovers', name: "Grandma's Leftovers", subtype: 'Food', copies: 3, giftable: true, icon: '🥡', color: FOOD,
    text: '+1 Food. +2 Defense, -1 Attack for the Round. Heavy in the best possible way.',
    limitGain: { food: 1 },
    effects: [
      { k: 'statMod', target: { scope: 'eventTarget' }, stat: 'defense', amount: 2, duration: 'round' },
      { k: 'statMod', target: { scope: 'eventTarget' }, stat: 'attack', amount: -1, duration: 'round' },
    ],
  },
  {
    kind: 'stuff', id: 'fakehydration', name: 'Fake Hydration', subtype: 'Drink', copies: 2, giftable: true, icon: '🚰', color: DRINK,
    text: 'It looks like a water bottle. It is not water. +2 Alcohol, and they had no idea.',
    limitGain: { alcohol: 2 },
    effects: [],
  },
  {
    kind: 'stuff', id: 'hotsauce', name: 'Hot Sauce', subtype: 'Food', copies: 3, giftable: true, icon: '🌶️', color: FOOD,
    text: 'Goes on everything. +2 Attack for the Round. Does not count toward Food.',
    effects: [{ k: 'statMod', target: { scope: 'eventTarget' }, stat: 'attack', amount: 2, duration: 'round' }],
  },
  {
    kind: 'stuff', id: 'scoobysnacks', name: 'Twin Scooby Snacks', subtype: 'Food', copies: 2, giftable: true, icon: '🍪', color: FOOD,
    text: '+1 Food. Heal 2 HP. The Character beside them gets one too — there are always exactly two.',
    limitGain: { food: 1 },
    effects: [
      { k: 'heal', target: { scope: 'eventTarget' }, amount: 2 },
      { k: 'heal', target: { scope: 'adjacentAllies' }, amount: 2 },
    ],
  },
  {
    kind: 'stuff', id: 'petrock', name: 'The Pet Rock', subtype: 'Pet', copies: 2, giftable: true, icon: '🪨', color: '#8892b0',
    text: 'Pet. Does nothing at all. Slip it into a rival’s pocket to take up a slot they wanted, then watch them spend an Action getting rid of it.',
    equipMods: [],
    activated: {
      name: 'Throw The Rock',
      text: 'Hurl it at an Active enemy for 2 damage. The rock is then somebody else’s problem.',
      actionCost: 1,
      effects: [{ k: 'damage', target: { scope: 'chosenEnemyActive' }, amount: 2 }],
    },
    effects: [],
  },
  {
    kind: 'stuff', id: 'graduation', name: 'Somebody Graduated', subtype: 'Consumable', copies: 2, icon: '🎓', color: UTIL,
    text: 'Everybody is proud and everybody drinks. Every Active Character in the game gains +1 Alcohol.',
    effects: [{ k: 'limit', target: { scope: 'allActiveEveryone' }, track: 'alcohol', amount: 1 }],
  },
  {
    kind: 'stuff', id: 'toast', name: 'A Toast', subtype: 'Consumable', copies: 2, icon: '🥂', color: UTIL,
    text: 'Raise a glass and point at somebody. That Character gains +2 Alcohol. It would be rude to refuse.',
    effects: [{ k: 'limit', target: { scope: 'chosenAnyActive' }, track: 'alcohol', amount: 2 }],
  },

  // --- Dorian's crown, and the rest of the stuff that only belongs to one person
  {
    kind: 'stuff', id: 'donutcrown', name: "Dorian's Donut Crown", subtype: 'Gear', copies: 2, onlyFor: ['dorian'], icon: '👑', color: FOOD,
    text: 'Equip to Dorian only. +1 Attack. Crack the crown open and hand out a free donut: roll d6 for what was in it.',
    equipMods: [{ stat: 'attack', amount: 1 }],
    activated: {
      name: 'Free Donuts',
      text: 'Pick any Active Character and roll d6. 1-3 it was a plain donut (+1 Food, heal 2). 4-5 somebody laced it (+1 Weed). 6 it was soaked in rum (+1 Alcohol, +1 Attack this Turn).',
      actionCost: 1,
      cooldown: 2,
      effects: [
        {
          k: 'roll',
          branches: [
            { on: [1, 2, 3], label: 'Just a donut', effects: [
              { k: 'limit', target: { scope: 'chosenAnyActive' }, track: 'food', amount: 1 },
              { k: 'heal', target: { scope: 'chosenAnyActive' }, amount: 2 },
            ] },
            { on: [4, 5], label: 'Somebody laced it', effects: [
              { k: 'limit', target: { scope: 'chosenAnyActive' }, track: 'weed', amount: 1 },
            ] },
            { on: [6], label: 'Rum glaze', effects: [
              { k: 'limit', target: { scope: 'chosenAnyActive' }, track: 'alcohol', amount: 1 },
              { k: 'statMod', target: { scope: 'chosenAnyActive' }, stat: 'attack', amount: 1, duration: 'turn' },
            ] },
          ],
        },
      ],
    },
    effects: [],
  },
  {
    kind: 'stuff', id: 'walker', name: "Grandpa's Walker", subtype: 'Gear', copies: 2, icon: '🦼', color: GEAR,
    text: 'Equip. +3 Defense, -1 Attack. Nobody is knocking this over, and nobody is getting anywhere fast either.',
    equipMods: [{ stat: 'defense', amount: 3 }, { stat: 'attack', amount: -1 }],
    effects: [],
  },
  {
    kind: 'stuff', id: 'sharpied', name: 'Sharpied While You Slept', subtype: 'Consumable', copies: 3, icon: '🖊️', color: UTIL,
    text: 'Got caught lacking. Play on any Character in the game: nobody can take them seriously, -1 Attack for the rest of the game.',
    effects: [
      { k: 'statMod', target: { scope: 'chosenAnyActive' }, stat: 'attack', amount: -1, duration: 'permanent' },
    ],
  },
  {
    kind: 'stuff', id: 'potpie', name: "Titi Evelyn's Chicken Pot Pie", subtype: 'Food', copies: 3, giftable: true, icon: '🥧', color: FOOD,
    text: 'Nobody makes it like Titi Evelyn. Heal 4 HP, +1 Food. She will not say what is in it, but it is +1 Weed too.',
    limitGain: { food: 1, weed: 1 },
    effects: [{ k: 'heal', target: { scope: 'self' }, amount: 4 }],
  },
  {
    kind: 'stuff', id: 'nerfgun', name: 'Nerf Gun', subtype: 'Gear', copies: 3, icon: '🔫', color: GEAR,
    text: 'Equip. Pop somebody from across the room for 2 damage. It does not hurt, it is just annoying.',
    equipMods: [],
    activated: {
      name: 'Foam Dart',
      text: 'Deal 2 damage to any Active enemy. Defense will not save them, it is a foam dart.',
      actionCost: 1,
      cooldown: 2,
      effects: [{ k: 'damage', target: { scope: 'chosenEnemyActive' }, amount: 2, ignoreDefense: true }],
    },
    effects: [],
  },
  {
    kind: 'stuff', id: 'basketball', name: 'The Basketball', subtype: 'Gear', copies: 2, icon: '🏀', color: GEAR,
    text: 'Equip. +1 Attack. Call somebody out and play them for it — winner lands 3 damage.',
    equipMods: [{ stat: 'attack', amount: 1 }],
    activated: {
      name: 'Game of 21',
      text: 'Challenge an Active enemy. Play it out. Winner deals 3 damage.',
      actionCost: 1,
      cooldown: 2,
      effects: [{ k: 'startMinigame', kind: 'tictactoe', stake: { kind: 'damage', amount: 3 } }],
    },
    effects: [],
  },
  {
    kind: 'stuff', id: 'karaokemic', name: 'The Karaoke Mic', subtype: 'Gear', copies: 2, icon: '🎤', color: GEAR,
    text: 'Equip. Grab the mic and take the floor: everybody in your family gets +1 Attack for the Round, and one rival is too busy watching to do anything.',
    equipMods: [],
    activated: {
      name: 'Take The Mic',
      text: 'Your Active Characters gain +1 Attack for the Round. One Active enemy becomes Busy for the Round because they cannot look away.',
      actionCost: 1,
      cooldown: 2,
      effects: [
        { k: 'statMod', target: { scope: 'allMyActive' }, stat: 'attack', amount: 1, duration: 'round' },
        { k: 'status', target: { scope: 'chosenEnemyActive' }, status: 'Busy', duration: 1 },
      ],
    },
    effects: [],
  },
  {
    kind: 'stuff', id: 'soccerball', name: 'The Soccer Ball', subtype: 'Gear', copies: 2, icon: '⚽', color: GEAR,
    text: 'Equip. +1 Defense. Start a game in the driveway — whoever wins comes back inside with something.',
    equipMods: [{ stat: 'defense', amount: 1 }],
    activated: {
      name: 'Driveway Match',
      text: 'Challenge an Active enemy. Shoot for it. Winner draws 2 cards.',
      actionCost: 1,
      cooldown: 2,
      effects: [{ k: 'startMinigame', kind: 'rps', stake: { kind: 'draw', n: 2 } }],
    },
    effects: [],
  },
]

export const STUFF_BY_ID: Record<string, StuffDef> = Object.fromEntries(
  STUFF.map((s) => [s.id, s]),
)
