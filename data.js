// File: data.js

'use strict';

(() => {
  const floorDefinitions = [
    {
      floor: 1,
      name: '練習場',
      element: 'thunder',
      enemyNames: [
        'スパークスライム',
        'ボルトバット',
        'ギアパペット',
        'ストーンガード'
      ],
      bossName: 'アイアンゴーレム'
    },
    {
      floor: 2,
      name: '草原',
      element: 'thunder',
      enemyNames: [
        'グラススライム',
        'ストームウルフ',
        'ホーンラビット',
        'サンダービーク'
      ],
      bossName: 'ストームファング'
    },
    {
      floor: 3,
      name: '森林',
      element: 'water',
      enemyNames: [
        'モススライム',
        'フォレストバット',
        'ウッドパペット',
        'リーフトレント'
      ],
      bossName: 'エルダーウッド'
    },
    {
      floor: 4,
      name: '魔の池',
      element: 'water',
      enemyNames: [
        'アクアスライム',
        'ミストフロッグ',
        'アビスフィッシュ',
        'スワンプサーペント'
      ],
      bossName: 'アビスサーペント'
    },
    {
      floor: 5,
      name: '魔の森',
      element: 'dark',
      enemyNames: [
        'シャドウスライム',
        'ナイトバット',
        'カースパペット',
        'ダークトレント'
      ],
      bossName: 'ナイトメアトレント'
    },
    {
      floor: 6,
      name: '魔の山',
      element: 'thunder',
      enemyNames: [
        'ロックスライム',
        'マウンテンホーク',
        'ロックパペット',
        'ストーンタイタン'
      ],
      bossName: 'グラナイトタイタン'
    },
    {
      floor: 7,
      name: '火山',
      element: 'fire',
      enemyNames: [
        'マグマスライム',
        'フレイムバット',
        'ラヴァパペット',
        'ファイアドレイク'
      ],
      bossName: 'インフェルノドラゴン'
    },
    {
      floor: 8,
      name: '死の橋',
      element: 'dark',
      enemyNames: [
        'ファントム',
        'デスバット',
        'ボーンナイト',
        'ゲートガード'
      ],
      bossName: 'デスゲートキーパー'
    },
    {
      floor: 9,
      name: '魔王城',
      element: 'dark',
      enemyNames: [
        'シャドウハウンド',
        'デーモンメイジ',
        'ダークナイト',
        'ロイヤルガード'
      ],
      bossName: '魔王ヴァルゼノス'
    },
    {
      floor: 10,
      name: '魔界',
      element: 'dark',
      enemyNames: [
        'ヴォイドスライム',
        'アビスウィング',
        'カオスナイト',
        'ヴォイドロード'
      ],
      bossName: '深淵王アビス・レガリア'
    }
  ];

  const enemyDefinitions = [];
  const areas = [];
  const encounters = [];

  const archetypes = [
    { hpRate: 0.85, atkRate: 0.75, defRate: 0.6 },
    { hpRate: 0.8, atkRate: 1.2, defRate: 0.65 },
    { hpRate: 1, atkRate: 1, defRate: 1 },
    { hpRate: 1.2, atkRate: 0.85, defRate: 1.6 }
  ];

  for (const floor of floorDefinitions) {
    const ids = [];

    floor.enemyNames.forEach((name, position) => {
      const serial = (floor.floor - 1) * 4 + position + 1;
      const id = 'e' + String(serial).padStart(3, '0');

      ids.push(id);

      enemyDefinitions.push({
        id,
        name,
        element: floor.element,
        image: './assets/enemies/' + id + '.png',
        ...archetypes[position]
      });
    });

    const bossId = 'b' + String(floor.floor).padStart(3, '0');
    const backgroundId = 's' + String(floor.floor).padStart(3, '0');

    enemyDefinitions.push({
      id: bossId,
      name: floor.bossName,
      element: floor.element,
      image: './assets/enemies/' + bossId + '.PNG',
      hpRate: 1,
      atkRate: 1,
      defRate: 1.25
    });

    areas.push({
      from: (floor.floor - 1) * 10 + 1,
      to: floor.floor * 10,
      name: floor.name,
      element: floor.element,
      background: './assets/backgrounds/' + backgroundId + '.PNG',
      backgroundPosition: 'center 58%'
    });

    encounters.push({
      floor: floor.floor,
      normal: ids,
      boss: bossId
    });
  }

  // 通算100だけ、専用のエリア名にする。
  areas[areas.length - 1].to = 99;

  areas.push({
    from: 100,
    to: 100,
    name: '魔界・塔の頂',
    element: 'dark',
    background: './assets/backgrounds/s010.PNG',
    backgroundPosition: 'center 58%'
  });

  window.TQ_DATA = {
    version: 3,
    battleVersion: 3,

    rules: {
      floors: 10,
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
      { rank: 1, sourceRank: 1, statMultiplier: 1 },
      { rank: 2, sourceRank: 3, statMultiplier: 4 },
      { rank: 3, sourceRank: 5, statMultiplier: 16 }
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

    enemies: enemyDefinitions,
    areas,
    encounters,

    balance: {
      // 想定育成曲線だけに利用する。
      // プレイヤーの転生は管理画面から任意に行う。
      reincarnateAfterStage: [80, 100],
      averageDamageFactors: [1.65, 2.1, 2.6],

      roundTargets: [
        { from: 1, to: 2, normal: 1.5, boss: 4 },
        { from: 3, to: 6, normal: 2.5, boss: 6.5 },
        { from: 7, to: 9, normal: 4.5, boss: 11 },
        { from: 10, to: 10, normal: 6.5, boss: 17.5 }
      ]
    },

    // 個別ステージの上書き。
    // 敵は1〜3体まで指定可能。
    // 通常のボス戦は各階1体だが、上書きで複数体にも対応。
    stageOverrides: {
      // 設定例：
      // "1-9": {
      //   enemies: ["e003", "e004"],
      //   hpMultiplier: 1,
      //   atkMultiplier: 1
      // }
    }
  };
})();
