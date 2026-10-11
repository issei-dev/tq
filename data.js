// File: data.js

'use strict';

window.TQ_DATA = {
  version: 2,

  // 戦闘ルールを変更した際に更新する。
  // 異なるバージョンの戦闘途中データは解除する。
  battleVersion: 2,

  rules: {
    floors: 100,
    stagesPerFloor: 10,
    maxLevel: 99,
    maxRank: 3,

    levelExp: {
      base: 25,
      linear: 12,
      quadratic: 1
    },

    rewards: {
      expBase: 300,
      expQuadratic: 1.5,
      bossExpMultiplier: 1.5,
      coinBase: 10,
      coinPerStage: 3,
      bossCoinMultiplier: 3
    }
  },

  rankDefinitions: [
    {
      rank: 1,
      sourceRank: 1,
      statMultiplier: 1
    },
    {
      rank: 2,
      sourceRank: 3,
      statMultiplier: 4
    },
    {
      rank: 3,
      sourceRank: 5,
      statMultiplier: 16
    }
  ],

  elements: {
    fire: { name: '炎', color: '#ed785c' },
    water: { name: '水', color: '#70c7ed' },
    thunder: { name: '雷', color: '#f0cc65' },
    light: { name: '光', color: '#d8c8f3' },
    dark: { name: '闇', color: '#a888cf' }
  },

  initialParty: [
    'leon',
    'serena',
    'rizel',
    'lumina'
  ],

  characters: [
    {
      id: 'leon',
      name: 'レオン',
      fullName: 'レオン・ヴァルク',
      element: 'fire',
      base: { hp: 110, atk: 30, def: 17 },
      growth: { hp: 11, atk: 3, def: 2 },
      jobs: [
        'ブレイズセイバー',
        'インフェルノブレイダー',
        'フェニックスロード'
      ],
      portraits: [
        './assets/characters/leon_r1.webp',
        './assets/characters/leon_r3.webp',
        './assets/characters/leon_r5.webp'
      ],
      skills: [
        'flame_edge',
        'blaze_heart',
        'guardian_flare'
      ]
    },
    {
      id: 'serena',
      name: 'セレナ',
      fullName: 'セレナ・アクエリス',
      element: 'water',
      base: { hp: 95, atk: 32, def: 13 },
      growth: { hp: 9, atk: 4, def: 1 },
      jobs: [
        'アクアメイジ',
        'フロストウィザード',
        'オーシャンエンプレス'
      ],
      portraits: [
        './assets/characters/serena_r1.webp',
        './assets/characters/serena_r3.webp',
        './assets/characters/serena_r5.webp'
      ],
      skills: [
        'aqua_lance',
        'healing_wave',
        'mist_veil'
      ]
    },
    {
      id: 'rizel',
      name: 'リゼル',
      fullName: 'リゼル・ヴォルト',
      element: 'thunder',
      base: { hp: 100, atk: 33, def: 14 },
      growth: { hp: 10, atk: 4, def: 1 },
      jobs: [
        'スパークエッジ',
        'サンダーリーパー',
        'ライトニングヴァルキリー'
      ],
      portraits: [
        './assets/characters/rizel_r1.webp',
        './assets/characters/rizel_r3.webp',
        './assets/characters/rizel_r5.webp'
      ],
      skills: [
        'bolt_rush',
        'edge_charge',
        'thunder_break'
      ]
    },
    {
      id: 'lumina',
      name: 'ルミナ',
      fullName: 'ルミナ・アステル',
      element: 'light',
      base: { hp: 100, atk: 30, def: 15 },
      growth: { hp: 10, atk: 3, def: 2 },
      jobs: [
        'ライトアーチャー',
        'セレスティアルボウ',
        'アストラルセラフ'
      ],
      portraits: [
        './assets/characters/lumina_r1.webp',
        './assets/characters/lumina_r3.webp',
        './assets/characters/lumina_r5.webp'
      ],
      skills: [
        'ray_shot',
        'holy_mark',
        'seraphic_rain'
      ]
    }
  ],

  skills: [
    {
      id: 'flame_edge',
      type: 'damage',
      target: 'enemy',
      cooldown: 2,
      variants: [
        { name: 'フレイムエッジ', power: 1.4 },
        { name: 'インフェルノエッジ', power: 1.8 },
        { name: 'フェニックスブレイカー', power: 2.2 }
      ]
    },
    {
      id: 'blaze_heart',
      type: 'buff',
      target: 'self',
      cooldown: 3,
      variants: [
        { name: 'ブレイズハート', power: 1.5 },
        { name: 'インフェルノソウル', power: 1.7 },
        { name: 'フェニックスソウル', power: 2 }
      ]
    },
    {
      id: 'guardian_flare',
      type: 'cover',
      target: 'self',
      cooldown: 5,
      variants: [
        { name: 'ガーディアンフレア', reduction: 0 },
        { name: 'インフェルノガード', reduction: 0.15 },
        { name: 'フェニックスイージス', reduction: 0.25 }
      ]
    },
    {
      id: 'aqua_lance',
      type: 'damage',
      target: 'enemy',
      cooldown: 2,
      variants: [
        { name: 'アクアランス', power: 1.4 },
        { name: 'フロストランス', power: 1.8 },
        { name: 'オーシャンジャベリン', power: 2.2 }
      ]
    },
    {
      id: 'healing_wave',
      type: 'heal',
      target: 'ally',
      cooldown: 3,
      variants: [
        { name: 'ヒーリングウェーブ', power: 3 },
        { name: 'クリスタルヒール', power: 4 },
        { name: 'オーシャンリバイヴ', power: 5 }
      ]
    },
    {
      id: 'mist_veil',
      type: 'weaken',
      target: 'allEnemies',
      cooldown: 5,
      variants: [
        { name: 'ミストヴェール', power: 0.8 },
        { name: 'フロストヴェール', power: 0.7 },
        { name: 'オーシャンサンクチュアリ', power: 0.6 }
      ]
    },
    {
      id: 'bolt_rush',
      type: 'damage',
      target: 'enemy',
      hits: 2,
      cooldown: 2,
      variants: [
        { name: 'ボルトラッシュ', power: 0.8 },
        { name: 'サンダーフラリー', power: 1 },
        { name: 'ヴァルキリーブリッツ', power: 1.2 }
      ]
    },
    {
      id: 'edge_charge',
      type: 'buff',
      target: 'self',
      cooldown: 3,
      variants: [
        { name: 'エッジチャージ', power: 1.5 },
        { name: 'サンダーオーバードライブ', power: 1.7 },
        { name: 'ヴァルキリーオーバードライブ', power: 2 }
      ]
    },
    {
      id: 'thunder_break',
      type: 'damage',
      target: 'enemy',
      cooldown: 5,
      variants: [
        {
          name: 'サンダーブレイク',
          power: 2,
          defenseScale: 0.5
        },
        {
          name: 'サンダーリッパー',
          power: 2.4,
          defenseScale: 0.4
        },
        {
          name: 'ヴァルキリージャッジメント',
          power: 2.8,
          defenseScale: 0.3
        }
      ]
    },
    {
      id: 'ray_shot',
      type: 'damage',
      target: 'enemy',
      cooldown: 2,
      variants: [
        { name: 'レイショット', power: 1.4 },
        { name: 'セレスティアルショット', power: 1.8 },
        { name: 'アストラルジャベリン', power: 2.2 }
      ]
    },
    {
      id: 'holy_mark',
      type: 'mark',
      target: 'enemy',
      cooldown: 3,
      variants: [
        { name: 'ホーリーマーク', power: 1.3 },
        { name: 'セレスティアルマーク', power: 1.5 },
        { name: 'アストラルシール', power: 1.7 }
      ]
    },
    {
      id: 'seraphic_rain',
      type: 'damage',
      target: 'allEnemies',
      cooldown: 5,
      variants: [
        { name: 'セラフィックレイン', power: 1.2 },
        { name: 'セレスティアルレイン', power: 1.5 },
        { name: 'アストラルスターフォール', power: 1.8 }
      ]
    }
  ],

  enemies: [
    {
      id: 'spark_slime',
      name: 'スパークスライム',
      bossName: 'スパークキング',
      element: 'thunder',
      image: './assets/enemies/enemy_spark_slime.webp',
      bossImage: './assets/enemies/enemy_spark_slime.webp',
      hpRate: 0.85,
      atkRate: 0.75,
      defRate: 0.6
    },
    {
      id: 'bolt_bat',
      name: 'ボルトバット',
      bossName: 'ボルトウィング',
      element: 'thunder',
      image: './assets/enemies/enemy_bolt_bat.webp',
      bossImage: './assets/enemies/enemy_bolt_bat.webp',
      hpRate: 0.8,
      atkRate: 1.2,
      defRate: 0.65
    },
    {
      id: 'gear_puppet',
      name: 'ギアパペット',
      bossName: 'ギアコマンダー',
      element: 'thunder',
      image: './assets/enemies/enemy_gear_puppet.webp',
      bossImage: './assets/enemies/enemy_gear_puppet.webp',
      hpRate: 1,
      atkRate: 1,
      defRate: 1
    },
    {
      id: 'stone_guard',
      name: 'ストーンガード',
      bossName: 'ストーンセンチネル',
      element: 'thunder',
      image: './assets/enemies/enemy_stone_guard.webp',
      bossImage: './assets/enemies/enemy_stone_guard.webp',
      hpRate: 1.2,
      atkRate: 0.85,
      defRate: 1.6
    },
    {
      id: 'iron_golem',
      name: 'アイアンゴーレム',
      bossName: 'アイアンゴーレム',
      element: 'thunder',
      image: './assets/enemies/boss_iron_golem.webp',
      bossImage: './assets/enemies/boss_iron_golem.webp',
      hpRate: 1,
      atkRate: 1,
      defRate: 1.25
    }
  ],

  areas: [
    { from: 1, to: 10, name: '練習場', element: 'thunder' },
    { from: 11, to: 20, name: '草原', element: 'thunder' },
    { from: 21, to: 30, name: '森林', element: 'water' },
    { from: 31, to: 40, name: '魔の池', element: 'water' },
    { from: 41, to: 50, name: '魔の森', element: 'dark' },
    { from: 51, to: 60, name: '魔の山', element: 'thunder' },
    { from: 61, to: 70, name: '火山', element: 'fire' },
    { from: 71, to: 80, name: '死の橋', element: 'dark' },
    { from: 81, to: 90, name: '魔王城', element: 'dark' },
    { from: 91, to: 99, name: '魔界', element: 'dark' },
    { from: 100, to: 100, name: '魔界・塔の頂', element: 'dark' }
  ],

  encounters: [
    {
      from: 1,
      to: 2,
      normal: ['spark_slime', 'bolt_bat'],
      bosses: ['spark_slime', 'bolt_bat']
    },
    {
      from: 3,
      to: 6,
      normal: ['spark_slime', 'bolt_bat', 'gear_puppet'],
      bosses: ['gear_puppet']
    },
    {
      from: 7,
      to: 9,
      normal: ['gear_puppet', 'stone_guard', 'bolt_bat'],
      bosses: ['stone_guard']
    },
    {
      from: 10,
      to: 100,
      normal: ['spark_slime', 'bolt_bat', 'gear_puppet', 'stone_guard'],
      bosses: ['iron_golem']
    }
  ],

  // 想定育成曲線上で転生を行う時期。
  // 実際のプレイヤーの転生は任意。
  balance: {
    reincarnateAfterStage: [80, 350],
    averageDamageFactors: [1.65, 2.1, 2.6],
    roundTargets: [
      { from: 1, to: 2, normal: 1.5, boss: 4 },
      { from: 3, to: 6, normal: 2.5, boss: 6.5 },
      { from: 7, to: 9, normal: 4.5, boss: 11 },
      { from: 10, to: 100, normal: 6.5, boss: 17.5 }
    ]
  },

  // 個別設定の例：
  // "3-5": {
  //   enemies: ["gear_puppet", "bolt_bat"],
  //   hpMultiplier: 1.1,
  //   atkMultiplier: 1
  // }
  stageOverrides: {}
};
