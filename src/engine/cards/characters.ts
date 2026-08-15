import type { CharacterDef } from '../types'

// ---------------------------------------------------------------------------
// CHARACTERS
//
// Stats follow Ruleset §9 / §47, NOT the numbers printed on the concept art.
// The art sheets use a different scale (HP 24-30, Defense up to 9); the ruleset
// budget is HP 8-18 and Attack+Defense+Speed ~= 10-12. Where the doc gives an
// exact statline (Chi Chi, Dorian, Mikey & Moe) that line is used verbatim.
// ---------------------------------------------------------------------------

const T = (a: number, w: number, f: number) => ({ alcohol: a, weed: w, food: f })
const DEFAULT_TOL = T(3, 3, 3)

export const CHARACTERS: CharacterDef[] = [
  // -------------------------------------------------------------- CHI CHI --
  {
    kind: 'character',
    id: 'chichi',
    name: 'Chi Chi',
    title: 'The Trickster',
    archetype: 'Trickster',
    stats: { hp: 11, attack: 4, defense: 2, speed: 5 },
    tags: ['Sister', 'Stoner', 'Troublemaker', 'Trickster'],
    tolerance: T(3, 4, 3), // Professional (§52)
    color: '#7c5cbf',
    art: 'chichi.webp',
    passive: {
      name: 'Professional Stoner',
      text: 'Chi Chi becomes Zooted at Weed 4 instead of Weed 3.',
      hooks: ['tolerance'],
    },
    ability: {
      name: 'Contact High',
      text: 'Chi Chi gains +1 Weed. Adjacent Characters gain +1 Weed and +2 Attack this Turn. Everybody is having a great time.',
      actionCost: 1,
      effects: [
        { k: 'limit', target: { scope: 'self' }, track: 'weed', amount: 1 },
        { k: 'limit', target: { scope: 'adjacentAllies' }, track: 'weed', amount: 1 },
        { k: 'statMod', target: { scope: 'adjacentAllies' }, stat: 'attack', amount: 2, duration: 'turn' },
      ],
    },
    powerMove: {
      name: 'Smoke Magic',
      text: 'Choose a Stoned ally. Roll d6. On 3-6 they may immediately attack again. On 1-2 they become Confused.',
      actionCost: 1,
      effects: [
        {
          k: 'roll',
          branches: [
            { on: [3, 4, 5, 6], label: 'Puff, poof, problem', effects: [{ k: 'extraAttack', target: { scope: 'chosenAllyActive' } }] },
            { on: [1, 2], label: 'Backfire', effects: [{ k: 'status', target: { scope: 'chosenAllyActive' }, status: 'Confused', duration: 1 }] },
          ],
        },
      ],
    },
    flaw: {
      name: 'Bad Influence',
      text: 'Characters adjacent to Chi Chi trigger Bad Luck on natural rolls of 1 or 2.',
      hooks: ['adjacentBadLuck'],
    },
    achievement: {
      name: 'Hotbox',
      text: 'Have all three of your Active Characters at Weed 2 or higher. +1 Clout.',
      clout: 1,
      key: 'hotbox',
    },
  },

  // --------------------------------------------------------------- DORIAN --
  {
    kind: 'character',
    id: 'dorian',
    name: 'Dorian',
    title: 'The Garbage Plate Devourer',
    archetype: 'Bruiser',
    stats: { hp: 15, attack: 5, defense: 3, speed: 2 },
    tags: ['Brother', 'Foodie', 'Caretaker', 'Heavyweight'],
    tolerance: T(3, 3, 4), // Bottomless Pit (§53)
    color: '#e0a43c',
    art: 'dorian.webp',
    passive: {
      name: 'Bottomless Pit',
      text: 'Dorian may reach Food 4. He does not become Stuffed until Food 4.',
      hooks: ['tolerance'],
    },
    ability: {
      name: 'Clean Your Plate',
      text: 'Consume one Food attached to Dorian. He gains +1 Attack this Turn on top of the Food’s normal effect.',
      actionCost: 1,
      effects: [
        { k: 'forceConsume', target: { scope: 'self' }, subtype: 'Food' },
        { k: 'statMod', target: { scope: 'self' }, stat: 'attack', amount: 1, duration: 'turn' },
      ],
    },
    powerMove: {
      name: 'Garbage Plate Rampage',
      text: 'Requires Food 2+. Gain +3 Attack this Turn, then +1 Food. If that exceeds his tolerance he enters Food Coma and falls Asleep.',
      actionCost: 1,
      requiresLimit: { food: 2 },
      effects: [
        { k: 'statMod', target: { scope: 'self' }, stat: 'attack', amount: 3, duration: 'turn' },
        { k: 'limit', target: { scope: 'self' }, track: 'food', amount: 1 },
      ],
    },
    flaw: {
      name: 'Food Coma',
      text: 'If Dorian exceeds his Food tolerance he becomes Asleep until his controller’s next Turn.',
      hooks: ['foodComa'],
    },
    achievement: {
      name: 'Clean Plate Club',
      text: 'Consume 3 differently named Foods during one Round. +1 Clout.',
      clout: 1,
      key: 'cleanPlateClub',
    },
  },

  // --------------------------------------------------------- MIKEY & MOE --
  {
    kind: 'character',
    id: 'mikeymoe',
    name: 'Mikey & Moe',
    title: 'The Chaos Twins',
    archetype: 'Glass Cannon',
    stats: { hp: 10, attack: 4, defense: 2, speed: 6 },
    tags: ['Kid', 'Twin', 'Psychic', 'Troublemaker'],
    tolerance: DEFAULT_TOL,
    color: '#e2603f',
    art: 'mikeymoe.webp',
    passive: {
      name: 'Twin Energy',
      text: 'Adjacent allied Characters gain +1 Speed.',
      hooks: ['auraAdjacentSpeed'],
    },
    ability: {
      name: 'Divide & Conquer',
      text: 'Attack two different Characters. Each attack suffers -2 Attack.',
      actionCost: 1,
      effects: [
        { k: 'extraAttack', target: { scope: 'self' }, attackMod: -2 },
        { k: 'extraAttack', target: { scope: 'self' }, attackMod: -2 },
      ],
    },
    powerMove: {
      name: 'Hot Wheels Barrage',
      text: 'Discard an equipped Ride. Deal 3 damage to any Active Character.',
      actionCost: 1,
      effects: [
        { k: 'destroyStuff', from: { scope: 'self' }, subtype: 'Ride' },
        { k: 'damage', target: { scope: 'chosenEnemyActive' }, amount: 3 },
      ],
    },
    flaw: {
      name: "We Don't Want to Share",
      text: 'When Mikey & Moe consume a Burger, discard it after its effect and they become Confused because they fight over it.',
      hooks: ['burgerFight'],
    },
    achievement: {
      name: 'Maximum Chaos',
      text: 'Have 3 different opponents suffer a status effect in a single Round. +1 Clout.',
      clout: 1,
      key: 'maximumChaos',
    },
  },

  // ---------------------------------------------------------------- MANNY --
  {
    kind: 'character',
    id: 'manny',
    name: 'Manny',
    title: 'Big Sexy',
    archetype: 'Tank',
    stats: { hp: 18, attack: 3, defense: 6, speed: 1 },
    tags: ['Uncle', 'Psychic', 'Heavyweight', 'Wheel Gang', 'Adult'],
    tolerance: T(4, 3, 4), // heavyweight
    color: '#8e5bb5',
    art: 'manny.webp',
    passive: {
      name: 'Big Chain',
      text: 'Adjacent allied Characters gain +1 Attack. Manny is Heavyweight: Alcohol tolerance 4.',
      hooks: ['auraAdjacentAttack', 'tolerance'],
    },
    ability: {
      name: 'Slow But Steady',
      text: 'Manny takes his time. Gain +3 Attack until the end of the Round. Manny may not attack this Turn.',
      actionCost: 1,
      effects: [
        { k: 'statMod', target: { scope: 'self' }, stat: 'attack', amount: 3, duration: 'round' },
        { k: 'status', target: { scope: 'self' }, status: 'Busy', duration: 0 },
      ],
    },
    powerMove: {
      name: 'Knock of Doom',
      text: 'The six-finger hand. Deal 4 damage to one Active enemy. Cooldown 2 Rounds.',
      actionCost: 1,
      cooldown: 2,
      effects: [{ k: 'damage', target: { scope: 'chosenEnemyActive' }, amount: 4 }],
    },
    flaw: {
      name: 'Rushing Manny',
      text: 'Manny has Speed 1. Any effect comparing Speed treats him as the slowest, and he cannot be swapped for free.',
      hooks: ['slow'],
    },
    achievement: {
      name: 'Respect The Big Sexy',
      text: 'Survive a Round at 5 HP or less without being KO’d. +1 Clout.',
      clout: 1,
      key: 'respectBigSexy',
    },
  },

  // ------------------------------------------------------------- GRANDMA --
  {
    kind: 'character',
    id: 'grandma',
    name: 'Oh Grandma',
    title: 'La Reina de la Casa',
    archetype: 'Bruiser',
    stats: { hp: 13, attack: 6, defense: 3, speed: 2 },
    tags: ['Grandma', 'Elder', 'Cook', 'Adult'],
    tolerance: DEFAULT_TOL,
    color: '#c9772f',
    art: 'grandma.webp',
    passive: {
      name: 'I Knew It',
      text: 'The first time each Round a Family Affair negatively affects Grandma, she gains +1 Attack for the Round.',
      hooks: ['iKnewIt'],
    },
    ability: {
      name: 'Summon Food From The Sky',
      text: 'Heal all your Active Characters 2 HP and give each of them +1 Food.',
      actionCost: 1,
      effects: [
        { k: 'heal', target: { scope: 'allMyActive' }, amount: 2 },
        { k: 'limit', target: { scope: 'allMyActive' }, track: 'food', amount: 1 },
      ],
    },
    powerMove: {
      name: "Abuela's Wrath",
      text: 'Chancla attack. Deal 4 damage to one Active enemy and they lose their next Action. Cooldown 2 Rounds.',
      actionCost: 1,
      cooldown: 2,
      effects: [
        { k: 'damage', target: { scope: 'chosenEnemyActive' }, amount: 4 },
        { k: 'status', target: { scope: 'chosenEnemyActive' }, status: 'Busy', duration: 1 },
      ],
    },
    flaw: {
      name: 'Comer o Te Arreglas Conmigo',
      text: 'Grandma cannot end a Turn at Food 0. If she does, she loses 1 Attack until she eats.',
      hooks: ['mustEat'],
    },
    achievement: {
      name: 'Respect Your Elders',
      text: 'KO a Character using Abuela’s Wrath. +1 Clout.',
      clout: 1,
      key: 'respectYourElders',
    },
  },

  // ---------------------------------------------------------------- XAVI --
  {
    kind: 'character',
    id: 'xavi',
    name: 'Xavi',
    title: "The Wheelin' Bard",
    archetype: 'Support',
    stats: { hp: 11, attack: 4, defense: 2, speed: 5 },
    tags: ['Brother', 'Musician', 'Wheel Gang', 'Party Animal'],
    tolerance: T(4, 3, 3), // party animal handles his liquor
    color: '#4aa3d8',
    art: 'xavi.webp',
    passive: {
      name: 'Wheel Life',
      text: 'Xavi may equip two Rides simultaneously and ignores Speed penalties from Rides.',
      hooks: ['dualRide'],
    },
    rideSlots: 2,
    ability: {
      name: 'Upbeat Jam',
      text: 'All your Active Characters gain +1 Attack this Turn. Xavi also gains +1 Speed for the Round.',
      actionCost: 1,
      effects: [
        { k: 'statMod', target: { scope: 'allMyActive' }, stat: 'attack', amount: 1, duration: 'turn' },
        { k: 'statMod', target: { scope: 'self' }, stat: 'speed', amount: 1, duration: 'round' },
      ],
    },
    powerMove: {
      name: 'Midnight Solo',
      text: 'Roll d6. On 4-6 deal 5 damage to one enemy. On 1-3 deal 2 damage and Xavi becomes Busy.',
      actionCost: 1,
      effects: [
        {
          k: 'roll',
          branches: [
            { on: [4, 5, 6], label: 'It rips', effects: [{ k: 'damage', target: { scope: 'chosenEnemyActive' }, amount: 5 }] },
            {
              on: [1, 2, 3],
              label: 'Broke a string',
              effects: [
                { k: 'damage', target: { scope: 'chosenEnemyActive' }, amount: 2 },
                { k: 'status', target: { scope: 'self' }, status: 'Busy', duration: 1 },
              ],
            },
          ],
        },
      ],
    },
    flaw: {
      name: 'Listed On eBay',
      text: 'Xavi will sell anything. At the start of each Round, if Xavi has 2 Rides, one may be taken by any opponent who asks.',
      hooks: ['sellsRides'],
    },
    achievement: {
      name: 'Play It Your Way',
      text: 'Buff all three of your Active Characters in a single Turn. +1 Clout.',
      clout: 1,
      key: 'playItYourWay',
    },
  },

  // -------------------------------------------------------------- AMANDA --
  {
    kind: 'character',
    id: 'amanda',
    name: 'Amanda',
    title: 'The Baker',
    archetype: 'Support',
    stats: { hp: 13, attack: 3, defense: 4, speed: 4 },
    tags: ['Mom', 'Baker', 'Cook', 'Lightweight', 'Adult'],
    tolerance: T(2, 3, 3), // Lightweight (§21)
    gearSlots: 2, // she carries more than most, but 3 stacked too much value
    itemSlots: 4, // "Amanda can have up to 4 Items attached to her"
    color: '#e878a8',
    art: 'amanda.webp',
    passive: {
      name: 'Momma Bird',
      text: 'Once per Round, redirect an attack targeting an adjacent ally onto Amanda instead.',
      hooks: ['mommaBird'],
    },
    ability: {
      name: 'Sugar Rush',
      text: 'Create one Food and attach it to any of your Active Characters. Heal that Character 2 HP.',
      actionCost: 1,
      effects: [
        { k: 'heal', target: { scope: 'chosenAllyActive' }, amount: 2 },
        { k: 'limit', target: { scope: 'chosenAllyActive' }, track: 'food', amount: 1 },
      ],
    },
    powerMove: {
      name: 'Hot Fudge To The Face',
      text: 'Deal 3 damage to an Active enemy, reduce their Attack by 2 for the Round, and their controller discards 1 card.',
      actionCost: 1,
      effects: [
        { k: 'damage', target: { scope: 'chosenEnemyActive' }, amount: 3 },
        { k: 'statMod', target: { scope: 'chosenEnemyActive' }, stat: 'attack', amount: -2, duration: 'round' },
        { k: 'discard', player: 'targetController', n: 1, random: true },
      ],
    },
    flaw: {
      name: 'Lightweight',
      text: 'Amanda becomes Wasted at Alcohol 2 instead of 3.',
      hooks: ['tolerance'],
    },
    achievement: {
      name: 'The Family Feast',
      text: 'Have all three of your Active Characters at Food 1 or higher at the end of your Turn. +1 Clout.',
      clout: 1,
      key: 'familyFeast',
    },
  },

  // ---------------------------------------------------------- TITI THE BUM --
  {
    kind: 'character',
    id: 'titibum',
    name: 'Titi The Bum',
    title: 'The Drama Queen Angel',
    archetype: 'Trickster',
    stats: { hp: 12, attack: 3, defense: 3, speed: 6 },
    tags: ['Aunt', 'Collector', 'Party Animal', 'Troublemaker', 'Adult'],
    tolerance: T(4, 3, 3),
    color: '#d98cae',
    art: 'titibum.webp',
    passive: {
      name: 'Good Luck Charm',
      text: 'Your other Active Characters ignore the first Bad Luck trigger each Round.',
      hooks: ['luckCharm'],
    },
    ability: {
      name: 'Curse You, Babe!',
      text: 'Flip off an Active enemy. They lose 2 Attack for the Round and become Bad Luck for the Round.',
      actionCost: 1,
      effects: [
        { k: 'statMod', target: { scope: 'chosenEnemyActive' }, stat: 'attack', amount: -2, duration: 'round' },
        { k: 'status', target: { scope: 'chosenEnemyActive' }, status: 'Bad Luck', duration: 1 },
      ],
    },
    powerMove: {
      name: 'Elephant Trample',
      text: 'Ride the elephant in a straight line. Deal 3 damage to a chosen enemy and 2 to the Characters beside them.',
      actionCost: 1,
      effects: [
        { k: 'damage', target: { scope: 'chosenEnemyActive' }, amount: 3 },
        { k: 'damage', target: { scope: 'adjacentAllies' }, amount: 2 },
      ],
    },
    flaw: {
      name: 'Attention Hunger',
      text: 'If Titi did not attack or get attacked during a Round, she loses 1 Attack next Round.',
      hooks: ['attentionHunger'],
    },
    achievement: {
      name: 'Turn Into A Shot',
      text: 'Personally KO 2 Characters in one game. +1 Clout.',
      clout: 1,
      key: 'turnIntoAShot',
    },
  },

  // ------------------------------------------------------------- TITI BIBI --
  {
    kind: 'character',
    id: 'titibibi',
    name: 'Titi Bibi',
    title: 'The Sacred Samurai',
    archetype: 'Support',
    stats: { hp: 15, attack: 3, defense: 5, speed: 4 },
    tags: ['Aunt', 'Elder', 'Caretaker', 'Cook', 'Adult'],
    tolerance: DEFAULT_TOL,
    color: '#b9a24a',
    art: 'titibibi.webp',
    passive: {
      name: 'No Violence In This House',
      text: 'Adjacent enemy Characters suffer -1 Attack. Titi Bibi never attacks first willingly.',
      hooks: ['pacifistAura'],
    },
    ability: {
      name: 'Angelic Guard',
      text: 'Choose an ally. They gain +3 Defense until the end of the Round and heal 2 HP.',
      actionCost: 1,
      effects: [
        { k: 'statMod', target: { scope: 'chosenAllyActive' }, stat: 'defense', amount: 3, duration: 'round' },
        { k: 'heal', target: { scope: 'chosenAllyActive' }, amount: 2 },
      ],
    },
    powerMove: {
      name: 'Fortune Cookie',
      text: 'Crack a cookie. Roll d6 for a fortune, good or bad. Titi Bibi keeps the cookie either way.',
      actionCost: 1,
      effects: [
        {
          k: 'roll',
          branches: [
            { on: [1], label: 'Perhaps tomorrow', effects: [{ k: 'status', target: { scope: 'self' }, status: 'Busy', duration: 1 }] },
            { on: [2], label: 'Beware what approaches', effects: [{ k: 'draw', player: 'allOthers', n: 1 }] },
            { on: [3], label: 'A friend arrives', effects: [{ k: 'draw', player: 'controller', n: 1 }] },
            { on: [4], label: 'Prosperity approaches', effects: [{ k: 'draw', player: 'controller', n: 2 }] },
            { on: [5], label: 'Peace brings victory', effects: [{ k: 'heal', target: { scope: 'allMyActive' }, amount: 3 }] },
            { on: [6], label: 'You are blessed', effects: [
              { k: 'heal', target: { scope: 'allMyActive' }, amount: 2 },
              { k: 'statMod', target: { scope: 'allMyActive' }, stat: 'defense', amount: 2, duration: 'round' },
            ] },
          ],
        },
      ],
    },
    flaw: {
      name: 'She Refuses Violence',
      text: 'Titi Bibi can never use a Power Move on the Turn she attacks. Kindness first.',
      hooks: ['pacifist'],
    },
    achievement: {
      name: 'Kindness Wins Souls',
      text: 'Heal 8 total HP across the game. +1 Clout.',
      clout: 1,
      key: 'kindnessWinsSouls',
    },
  },

  // ---------------------------------------------------------------- GABBY --
  {
    kind: 'character',
    id: 'gabby',
    name: 'Gabby',
    title: 'The Wild Scout',
    archetype: 'Bruiser',
    stats: { hp: 14, attack: 6, defense: 3, speed: 3 },
    tags: ['Brother', 'Athlete', 'Foodie', 'Troublemaker'],
    tolerance: T(3, 3, 3),
    color: '#6d8f3f',
    art: 'gabby.webp',
    passive: {
      name: 'Always Prepared',
      text: 'Gabby ignores the first Bad Luck effect that would hit him each Round.',
      hooks: ['scoutPrepared'],
    },
    ability: {
      name: 'Clear Your Plate',
      text: 'Steal one Food or Consumable attached to an Active enemy and immediately consume it.',
      actionCost: 1,
      effects: [
        { k: 'stealStuff', from: { scope: 'chosenEnemyActive' }, subtype: 'Food' },
        { k: 'forceConsume', target: { scope: 'self' }, subtype: 'Food' },
      ],
    },
    powerMove: {
      name: 'Rampage',
      text: 'Gabby snaps. Gain +3 Attack and +2 Speed for the Round, and attack twice this Turn. He is Confused afterwards.',
      actionCost: 1,
      effects: [
        { k: 'statMod', target: { scope: 'self' }, stat: 'attack', amount: 3, duration: 'round' },
        { k: 'statMod', target: { scope: 'self' }, stat: 'speed', amount: 2, duration: 'round' },
        { k: 'extraAttack', target: { scope: 'self' } },
        { k: 'extraAttack', target: { scope: 'self' } },
        { k: 'status', target: { scope: 'self' }, status: 'Confused', duration: 1 },
      ],
    },
    flaw: {
      name: "I'm Hungry And Not In The Mood",
      text: 'If Gabby is at Food 0 at the start of your Turn, he loses 2 Attack until he eats.',
      hooks: ['mustEat'],
    },
    achievement: {
      name: 'Pineapple Power',
      text: 'KO a Character while Gabby has Gear equipped. +1 Clout.',
      clout: 1,
      key: 'pineapplePower',
    },
  },

  // ------------------------------------------------------------------ JAY --
  {
    kind: 'character',
    id: 'jay',
    name: 'Jay',
    title: 'The Remote Commander',
    archetype: 'Balanced',
    stats: { hp: 12, attack: 3, defense: 4, speed: 4 },
    tags: ['Dad', 'Tech', 'Psychic', 'Adult'],
    tolerance: DEFAULT_TOL,
    color: '#3fb6c9',
    art: 'jay.webp',
    passive: {
      name: 'Avatar Mode',
      text: 'Jay is immune to Confused and Charmed. He fights through code.',
      hooks: ['avatarImmune'],
    },
    ability: {
      name: 'System Upgrade',
      text: 'Choose an ally. They gain +2 to a stat of your choice until the end of the Round, and draw a card.',
      actionCost: 1,
      effects: [
        { k: 'statMod', target: { scope: 'chosenAllyActive' }, stat: 'attack', amount: 2, duration: 'round' },
        { k: 'draw', player: 'controller', n: 1 },
      ],
    },
    powerMove: {
      name: 'EMP Blast',
      text: 'Disable every opposing Active Character’s equipped Gear and Rides for the Round, and they lose 1 Speed.',
      actionCost: 1,
      effects: [
        { k: 'statMod', target: { scope: 'allEnemyActive' }, stat: 'speed', amount: -1, duration: 'round' },
        { k: 'status', target: { scope: 'allEnemyActive' }, status: 'Confused', duration: 1 },
      ],
    },
    flaw: {
      name: 'Glass Body',
      text: 'Jay takes 1 extra damage from any attack made by a Character with Speed 5 or higher.',
      hooks: ['glassBody'],
    },
    achievement: {
      name: 'Victory Is Control',
      text: 'Apply a status effect to 4 different enemy Characters in one game. +1 Clout.',
      clout: 1,
      key: 'victoryIsControl',
    },
  },

  // -------------------------------------------------------------- DAINESE --
  {
    kind: 'character',
    id: 'dainese',
    name: 'Dainese',
    title: 'The Dream Hauntress',
    archetype: 'Glass Cannon',
    stats: { hp: 11, attack: 4, defense: 2, speed: 6 },
    tags: ['Sister', 'Collector', 'Troublemaker', 'Psychic'],
    tolerance: DEFAULT_TOL,
    color: '#a63a63',
    art: 'dainese.webp',
    passive: {
      name: 'Fear Feed',
      text: 'Whenever an enemy Character gains a status effect, Dainese heals 1 HP.',
      hooks: ['fearFeed'],
    },
    ability: {
      name: 'Haunt Your Dreams',
      text: 'Target an Active enemy. They become Confused and lose 2 Defense for the Round.',
      actionCost: 1,
      effects: [
        { k: 'status', target: { scope: 'chosenEnemyActive' }, status: 'Confused', duration: 1 },
        { k: 'statMod', target: { scope: 'chosenEnemyActive' }, stat: 'defense', amount: -2, duration: 'round' },
      ],
    },
    powerMove: {
      name: 'Endless Nightmare',
      text: 'Once per game. Every enemy Active Character takes 3 damage and becomes Asleep. All your allies heal 3 HP.',
      actionCost: 1,
      oncePerGame: true,
      effects: [
        { k: 'damage', target: { scope: 'allEnemyActive' }, amount: 3, ignoreDefense: true },
        { k: 'status', target: { scope: 'allEnemyActive' }, status: 'Asleep', duration: 1 },
        { k: 'heal', target: { scope: 'allMyActive' }, amount: 3 },
      ],
    },
    flaw: {
      name: 'Light Exposes',
      text: 'Dainese has only 2 Defense. Any attack from a Character with the Elder tag deals +2 damage to her.',
      hooks: ['lightExposes'],
    },
    achievement: {
      name: 'Collect & Keep',
      text: 'Have 3 or more Stuff cards attached across your Family at once. +1 Clout.',
      clout: 1,
      key: 'collectAndKeep',
    },
  },
]

export const CHARACTERS_BY_ID: Record<string, CharacterDef> = Object.fromEntries(
  CHARACTERS.map((c) => [c.id, c]),
)
