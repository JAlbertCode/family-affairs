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
    stats: { hp: 15, attack: 5, defense: 3 },
    tags: ['Brother', 'Stoner', 'Troublemaker', 'Trickster'],
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
      text: 'Chi Chi takes one to the dome: +1 Weed. He and the Characters beside him gain +2 Attack this Turn. Everybody is having a great time.',
      actionCost: 1,
      effects: [
        { k: 'limit', target: { scope: 'self' }, track: 'weed', amount: 1 },
        { k: 'statMod', target: { scope: 'self' }, stat: 'attack', amount: 2, duration: 'turn' },
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
      text: 'Characters across the table from Chi Chi trigger Bad Luck on a natural 1 or 2. His own family beside him still goes sideways on a natural 1.',
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
    stats: { hp: 15, attack: 5, defense: 3 },
    tags: ['Brother', 'Foodie', 'Caretaker', 'Heavyweight'],
    tolerance: T(3, 3, 4), // Bottomless Pit (§53)
    color: '#e0a43c',
    art: 'dorian.webp',
    startsWith: ['donutcrown'],
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
    stats: { hp: 10, attack: 6, defense: 2 },
    tags: ['Kid', 'Twin', 'Psychic', 'Troublemaker'],
    tolerance: DEFAULT_TOL,
    color: '#e2603f',
    art: 'mikeymoe.webp',
    passive: {
      name: 'Twin Energy',
      text: 'Adjacent allied Characters gain +1 Defense.',
      hooks: ['auraAdjacentDefense'],
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
    stats: { hp: 18, attack: 2, defense: 6 },
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
      text: 'Manny takes his time. Gain +2 Attack until the end of the Round. Manny may not attack this Turn.',
      actionCost: 1,
      effects: [
        { k: 'statMod', target: { scope: 'self' }, stat: 'attack', amount: 2, duration: 'round' },
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
      text: 'Manny does not do second helpings. He can never take a free extra attack from any source.',
      hooks: ['noFreeAttacks'],
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
    stats: { hp: 13, attack: 6, defense: 2 },
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
    stats: { hp: 11, attack: 4, defense: 4 },
    tags: ['Brother', 'Musician', 'Wheel Gang', 'Party Animal'],
    tolerance: T(4, 3, 3), // party animal handles his liquor
    color: '#4aa3d8',
    art: 'xavi.webp',
    passive: {
      name: 'Wheel Life',
      text: 'Xavi may equip two Rides at once. Wheels are not a limitation.',
      hooks: ['dualRide'],
    },
    rideSlots: 2,
    ability: {
      name: 'Upbeat Jam',
      text: 'All your Active Characters gain +1 Attack this Turn. Xavi also gains +1 Defense for the Round. He needs a Turn off before he plays it again.',
      actionCost: 1,
      cooldown: 2,
      effects: [
        { k: 'statMod', target: { scope: 'allMyActive' }, stat: 'attack', amount: 1, duration: 'turn' },
        { k: 'statMod', target: { scope: 'self' }, stat: 'defense', amount: 1, duration: 'round' },
      ],
    },
    powerMove: {
      name: 'Midnight Solo',
      text: 'Roll d6. On 4-6 deal 4 damage to one enemy. On 1-3 deal 2 damage and Xavi becomes Busy.',
      actionCost: 1,
      effects: [
        {
          k: 'roll',
          branches: [
            { on: [4, 5, 6], label: 'It rips', effects: [{ k: 'damage', target: { scope: 'chosenEnemyActive' }, amount: 4 }] },
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
    stats: { hp: 12, attack: 4, defense: 4 },
    tags: ['Mom', 'Baker', 'Cook', 'Lightweight', 'Adult'],
    tolerance: T(2, 3, 3), // Lightweight (§21)
    gearSlots: 2, // she carries more than most, but 3 stacked too much value
    itemSlots: 3, // she out-performed the field at 4; three still reads as the one who carries everything
    color: '#e878a8',
    art: 'amanda.webp',
    passive: {
      name: 'Momma Bird',
      text: 'Once per Round, redirect an attack targeting an adjacent ally onto Amanda instead. Stepping in front of it costs her 1 HP.',
      hooks: ['mommaBird'],
    },
    ability: {
      name: 'Sugar Rush',
      text: 'Create one Food and attach it to any of your Active Characters. Heal that Character 2 HP. She needs a Turn to bake the next batch.',
      actionCost: 1,
      cooldown: 2,
      effects: [
        { k: 'heal', target: { scope: 'chosenAllyActive' }, amount: 2 },
        { k: 'limit', target: { scope: 'chosenAllyActive' }, track: 'food', amount: 1 },
      ],
    },
    powerMove: {
      name: 'Hot Fudge To The Face',
      text: 'Deal 3 damage to an Active enemy, reduce their Attack by 2 for the Round, and their controller discards 1 card. Cooldown 2 Rounds.',
      actionCost: 1,
      cooldown: 2,
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
    stats: { hp: 12, attack: 4, defense: 4 },
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
      text: 'Ride the elephant in a straight line. Deal 3 damage to a chosen enemy and 2 to the Characters beside them. Cooldown 2 Rounds.',
      actionCost: 1,
      cooldown: 2,
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
    stats: { hp: 15, attack: 3, defense: 5 },
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
      name: 'Saying Grace',
      text: 'Everyone at her end of the table bows their head. The Characters beside her heal 2 HP, and she and both of them gain +1 Defense for the Round. Once every other Turn.',
      actionCost: 1,
      cooldown: 2,
      effects: [
        { k: 'statMod', target: { scope: 'self' }, stat: 'defense', amount: 1, duration: 'round' },
        { k: 'heal', target: { scope: 'adjacentAllies' }, amount: 2 },
        { k: 'statMod', target: { scope: 'adjacentAllies' }, stat: 'defense', amount: 1, duration: 'round' },
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
    stats: { hp: 16, attack: 6, defense: 2 },
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
      text: 'Gabby snaps. Gain +3 Attack for the Round and attack twice this Turn. He is Confused afterwards. Cooldown 2 Rounds.',
      actionCost: 1,
      cooldown: 2,
      effects: [
        { k: 'statMod', target: { scope: 'self' }, stat: 'attack', amount: 3, duration: 'round' },
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
    stats: { hp: 12, attack: 3, defense: 5 },
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
      text: 'Scramble every opposing Active Character for the Round: they lose 1 Attack and become Confused. Cooldown 2 Rounds.',
      actionCost: 1,
      cooldown: 2,
      effects: [
        { k: 'statMod', target: { scope: 'allEnemyActive' }, stat: 'attack', amount: -1, duration: 'round' },
        { k: 'status', target: { scope: 'allEnemyActive' }, status: 'Confused', duration: 1 },
      ],
    },
    flaw: {
      name: 'Glass Body',
      text: 'Jay takes 1 extra damage from any attack made by a Character with Attack 5 or higher.',
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
    stats: { hp: 11, attack: 6, defense: 2 },
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

  // ----------------------------------------------------------------- NANI --
  {
    kind: 'character',
    id: 'nani',
    name: 'Nani',
    title: 'The One With The Spreadsheet',
    archetype: 'Support',
    stats: { hp: 17, attack: 3, defense: 5 },
    tags: ['Sister', 'Caretaker', 'Athlete', 'Collector', 'Adult'],
    tolerance: { alcohol: 3, weed: 3, food: 3 },
    color: '#3fa87d',
    art: 'nani.webp',
    petSlots: 2,
    passive: {
      name: 'Everything Is Handled',
      text: 'Nani keeps two Pets instead of one, and Pets she keeps never lose their nerve.',
      hooks: ['petHandler'],
    },
    ability: {
      name: 'Colour-Coded Plan',
      text: 'Draw a card, then give any ally +2 Defense until the end of the Round. Somebody has to think ahead.',
      actionCost: 1,
      effects: [
        { k: 'draw', player: 'controller', n: 1 },
        { k: 'statMod', target: { scope: 'chosenAllyActive' }, stat: 'defense', amount: 2, duration: 'round' },
      ],
    },
    powerMove: {
      name: 'The Group Chat Has Spoken',
      text: 'Nani organises the whole family. Every one of your Active Characters heals 2 HP and clears one status. Cooldown 2 Rounds.',
      actionCost: 1,
      cooldown: 2,
      effects: [
        { k: 'heal', target: { scope: 'allMyActive' }, amount: 2 },
        { k: 'removeStatus', target: { scope: 'allMyActive' }, status: 'Confused' },
        { k: 'removeStatus', target: { scope: 'allMyActive' }, status: 'Busy' },
      ],
    },
    flaw: {
      name: 'Overworked',
      text: 'If Nani uses an ability two Rounds running, she loses 2 Defense until the end of the next Round. She needs a day off.',
      hooks: ['overworked'],
    },
    achievement: {
      name: 'Colour-Coded',
      text: 'End a Turn with every one of your Active Characters holding at least one item. +1 Clout.',
      clout: 1,
      key: 'colourCoded',
    },
  },

  // ----------------------------------------------------------------- ELIAS --
  // The whole kit is built around one idea: Elias is better on his own and
  // better after a drink, and worse the second anyone else gets involved.
  {
    kind: 'character',
    id: 'elias',
    name: 'Elias',
    title: 'The One-Man Production',
    archetype: 'Trickster',
    stats: { hp: 12, attack: 3, defense: 5 },
    tags: ['Brother', 'Trickster', 'Collector', 'Adult'],
    tolerance: T(4, 2, 3), // drinks well, cannot handle weed at all
    color: '#c94f7c',
    art: 'elias.webp',
    passive: {
      name: 'One-Man Production',
      text: 'Elias works alone. While no allied Character sits beside him he gains +1 Attack and +1 Defense. Every Stoned Character beside him costs him 1 of each - they are ruining the shot.',
      hooks: ['oneManProduction', 'ruiningTheShot'],
    },
    ability: {
      name: "You're In The Scene",
      text: 'Elias directs an opposing Character. They become Confused for the Round: whatever they try may not come out the way they meant it.',
      actionCost: 1,
      effects: [
        { k: 'status', target: { scope: 'chosenEnemyActive' }, status: 'Confused', duration: 1 },
      ],
    },
    powerMove: {
      name: 'Authentic Reaction',
      text: 'Elias pulls a prop gun on the family. BANG - a little flag comes out. Every opposing Active Character becomes Confused, and Elias gains +2 Attack for the Round because the reaction was perfect. Cooldown 2 Rounds.',
      actionCost: 1,
      cooldown: 2,
      effects: [
        { k: 'status', target: { scope: 'allEnemyActive' }, status: 'Confused', duration: 1 },
        { k: 'statMod', target: { scope: 'self' }, stat: 'attack', amount: 2, duration: 'round' },
      ],
    },
    flaw: {
      name: 'Empty Stomach',
      text: 'Elias cannot drink on nothing. Any Alcohol he gains at Food 0 counts double. Getting Stoned is worse: he immediately eats a Food he is carrying and forgets what he was directing.',
      hooks: ['emptyStomach', 'whatWereWeMaking'],
    },
    achievement: {
      name: 'That’s A Wrap',
      text: 'Have three different opposing Characters Confused at the same time. +1 Clout.',
      clout: 1,
      key: 'thatsAWrap',
    },
  },

  // ----------------------------------------------------------------- KEVIN --
  // The only Character in the game who WANTS the Food meter maxed. Everyone
  // else is trying not to get Stuffed; Kevin's whole loop is eat, stuff,
  // destroy, and the two things the rest of the table runs on - drink and
  // smoke - take him apart. See limitStatDelta for the inverted curve.
  {
    kind: 'character',
    id: 'kevin',
    name: 'Kevin',
    title: 'The Tech Tank',
    archetype: 'Tank',
    stats: { hp: 14, attack: 3, defense: 5 },
    tags: ['Brother', 'Athlete', 'Tech', 'Heavyweight', 'Adult'],
    tolerance: T(2, 2, 3), // eats like it is a job, cannot handle the rest
    color: '#c0392b',
    art: 'kevin.webp',
    gearSlots: 2,
    passive: {
      name: 'Always Fed',
      text: 'Food makes Kevin stronger instead of slower. Fed: +1 Attack. Stuffed: +2 Defense and nothing gets through. Alcohol costs him Defense and Weed costs him Attack - he does not drink and he does not smoke.',
      hooks: ['alwaysFed', 'iDontEvenDrink', 'whyAmIHere'],
    },
    ability: {
      name: 'Protein Shake',
      text: 'Kevin drinks his own thing. +1 Food, and +1 Attack and +1 Defense for the Round. Nobody else wants any.',
      actionCost: 1,
      effects: [
        { k: 'limit', target: { scope: 'self' }, track: 'food', amount: 1 },
        { k: 'statMod', target: { scope: 'self' }, stat: 'attack', amount: 1, duration: 'round' },
        { k: 'statMod', target: { scope: 'self' }, stat: 'defense', amount: 1, duration: 'round' },
      ],
    },
    powerMove: {
      name: 'Powerlift',
      text: 'Requires Food 2+. Kevin picks an Active enemy up off the ground and puts them back down. 4 damage, and they are Busy for the Round. Cooldown 2 Rounds.',
      actionCost: 1,
      cooldown: 2,
      requiresLimit: { food: 2 },
      effects: [
        { k: 'damage', target: { scope: 'chosenEnemyActive' }, amount: 4 },
        { k: 'status', target: { scope: 'chosenEnemyActive' }, status: 'Busy', duration: 1 },
      ],
    },
    flaw: {
      name: 'Overfed',
      text: 'Two full Rounds Stuffed and the third is a food coma: Kevin falls Asleep, heals 4 and wakes up empty. Any Round he starts at Food 0 he also loses 1 Attack until he eats. Eat, stuff, destroy, destroy, rest.',
      hooks: ['overfed', 'legDay'],
    },
    achievement: {
      name: 'Absolute Unit',
      text: 'Have Kevin Stuffed at the end of your Turn with at least 12 HP. +1 Clout.',
      clout: 1,
      key: 'absoluteUnit',
    },
  },

  // ------------------------------------------------------------- CARLITOS --
  // The sober one, which in this family is the strangest thing about him. He
  // cannot be got drunk or stoned, and refusing is only half of it - the drink
  // goes to whoever is standing next to him. See applyLimit.
  {
    kind: 'character',
    id: 'carlitos',
    name: 'Papito Carlitos',
    title: 'The Sober Hustler',
    archetype: 'Trickster',
    stats: { hp: 13, attack: 4, defense: 4 },
    tags: ['Uncle', 'Trickster', 'Troublemaker', 'Athlete', 'Adult'],
    tolerance: T(2, 2, 3), // moot for the first two: nothing gets past Sober Influence
    color: '#c0392b',
    art: 'carlitos.webp',
    startsWith: ['poolstick'],
    passive: {
      name: 'Sober Influence',
      text: 'Carlitos does not drink and does not smoke. Alcohol and Weed aimed at him are handed to a Character standing next to him instead. Nothing is wasted; it is just no longer his problem.',
      hooks: ['soberInfluence'],
    },
    ability: {
      name: 'Trick Shot',
      text: 'One off the cushion. 3 damage to a chosen enemy, and the ball carries on into the Characters beside them for 1 more. He needs to line the next one up: cooldown 2 Rounds.',
      actionCost: 1,
      cooldown: 2,
      effects: [
        { k: 'damage', target: { scope: 'chosenEnemyActive' }, amount: 3 },
        { k: 'damage', target: { scope: 'adjacentAllies' }, amount: 1 },
      ],
    },
    powerMove: {
      name: "Carlitos' Mocktail",
      text: 'No alcohol in it whatsoever, and it still goes up. Burn one item off a chosen enemy and deal them 2 damage. Cooldown 2 Rounds.',
      actionCost: 1,
      cooldown: 2,
      effects: [
        { k: 'destroyStuff', from: { scope: 'chosenEnemyActive' } },
        { k: 'damage', target: { scope: 'chosenEnemyActive' }, amount: 2 },
      ],
    },
    flaw: {
      name: 'I Ate Too Much',
      text: 'The plate is the only way to get to him. At Food 2 he loses 1 Attack; at Food 3 he loses 2 Attack and 1 Defense and has no interest in the pool table.',
      hooks: ['ateTooMuch'],
    },
    achievement: {
      name: "Nah, I'm Good",
      text: 'End your Turn with Carlitos completely sober while three other Characters on the table are Drunk or Stoned. +1 Clout.',
      clout: 1,
      key: 'nahImGood',
    },
  },

  // ------------------------------------------------------------------ BRY --
  {
    kind: 'character',
    id: 'bry',
    name: 'Bry',
    title: 'The Party Captain',
    archetype: 'Support',
    stats: { hp: 14, attack: 4, defense: 4 },
    tags: ['Sister', 'Adult', 'Athlete', 'Party Animal', 'Caretaker'],
    // Tolerance 4 on alcohol is the highest in the deck and it is the point:
    // everyone else is Wasted at 3 and eating the penalty while she is still on
    // the way up. Weed 1 is the lowest, and that is the point too.
    tolerance: T(4, 2, 3),
    color: '#e84393',
    art: 'bry.webp',
    startsWith: ['nerfgun'],
    passive: {
      name: "I'm Watching Them",
      text: 'While a Kid is standing next to Bry she gets +2 Attack and the Kid gets +1 Defense. Nothing about this should work and it keeps working. Besties: while Nani is also Active, Bry gets +1 Attack and Nani gets +1 Defense.',
      hooks: ['watchingThem', 'besties'],
    },
    ability: {
      name: 'Deadeye Bry',
      text: 'She is unreasonably good with a Nerf gun. 3 damage to a chosen enemy, straight through Defense, because it is a foam dart and Defense was never the problem. Cooldown 2 Rounds.',
      actionCost: 1,
      cooldown: 2,
      effects: [
        { k: 'damage', target: { scope: 'chosenEnemyActive' }, amount: 3, ignoreDefense: true },
      ],
    },
    powerMove: {
      name: 'Physical Therapy',
      text: 'She actually does this for a living. Heal a chosen ally 4, give them +2 Defense for the Round, and get them off the bench: clears Busy and Asleep. Cooldown 2 Rounds.',
      actionCost: 1,
      cooldown: 2,
      effects: [
        { k: 'heal', target: { scope: 'chosenAllyActive' }, amount: 4 },
        { k: 'statMod', target: { scope: 'chosenAllyActive' }, stat: 'defense', amount: 2, duration: 'round' },
        { k: 'removeStatus', target: { scope: 'chosenAllyActive' }, status: 'Busy' },
        { k: 'removeStatus', target: { scope: 'chosenAllyActive' }, status: 'Asleep' },
      ],
    },
    flaw: {
      name: 'Too Distracted',
      text: 'She can drink anybody here under the table and cannot smoke at all. Two puffs and she is Zooted, and it costs her 2 Attack while giving back none of the Defense everyone else collects. Chi Chi is her worst matchup in the family.',
      hooks: ['tooDistracted'],
    },
    achievement: {
      name: 'Peak Bry',
      text: 'End your Turn with Bry at her top Alcohol tier and still standing at full swing. +1 Clout.',
      clout: 1,
      key: 'peakBry',
    },
  },

  // ---------------------------------------------------------------- LARRY --
  {
    kind: 'character',
    id: 'larry',
    name: 'Larry',
    title: 'The Fed',
    archetype: 'Support',
    stats: { hp: 14, attack: 3, defense: 5 },
    tags: ['Dad', 'Adult', 'Collector', 'Athlete'],
    // Alcohol 3 is ordinary; the family gets him there fast enough without
    // help. Weed 2 is the whole counter-play: two and he is on the couch.
    tolerance: T(3, 2, 3),
    color: '#2f6f4e',
    art: 'larry.webp',
    startsWith: ['boricua'],
    passive: {
      name: 'Under Investigation',
      text: 'Nobody swings freely at the man taking notes. Enemy Characters directly across from Larry lose 1 Attack. Los Jefes: while Nani is also Active they lose 1 Defense as well, because now it is organised.',
      hooks: ['underInvestigation', 'losJefes'],
    },
    ability: {
      name: 'Busted',
      text: 'He has had the file open since he walked in. A chosen enemy becomes Busy until their next Turn: no attacking, no abilities, no stepping in for anybody. Cooldown 2 Rounds.',
      actionCost: 1,
      cooldown: 2,
      effects: [
        { k: 'status', target: { scope: 'chosenEnemyActive' }, status: 'Busy', duration: 1 },
      ],
    },
    powerMove: {
      name: 'Federal Raid',
      text: 'He stops pretending this is a normal family gathering. Confiscate one Item from a chosen enemy, detain them (Busy until their next Turn), and deal 2. Cooldown 2 Rounds.',
      actionCost: 1,
      cooldown: 2,
      effects: [
        { k: 'stealStuff', from: { scope: 'chosenEnemyActive' } },
        { k: 'status', target: { scope: 'chosenEnemyActive' }, status: 'Busy', duration: 1 },
        { k: 'damage', target: { scope: 'chosenEnemyActive' }, amount: 2 },
      ],
    },
    flaw: {
      name: 'Catatonic',
      text: 'Weed tolerance 2, and the only curve in the game that takes both stats: -1 Attack at High, then -2 Attack and -2 Defense. Reaching Zooted puts him Asleep outright. Pass Larry a joint and the entire investigation stops.',
      hooks: ['catatonic'],
    },
    achievement: {
      name: 'Case Closed',
      text: 'End your Turn with two enemy Characters detained at once. +1 Clout.',
      clout: 1,
      key: 'caseClosed',
    },
  },
]

export const CHARACTERS_BY_ID: Record<string, CharacterDef> = Object.fromEntries(
  CHARACTERS.map((c) => [c.id, c]),
)
