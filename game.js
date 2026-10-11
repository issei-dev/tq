// File: game.js

'use strict';

(() => {
  const D = window.TQ_DATA;
  const C = window.TQ_COLLECTION;
  const U = window.TQ_SPIRIT_UPGRADE;

  const SAVE_KEY = 'towerquest.pages.save.v1';
  const BACKUP_KEY = 'towerquest.pages.before-collection.backup';
  const SCHEMA_VERSION = 3;

  const $ = (id) => document.getElementById(id);
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const number = (value) => Number(value).toLocaleString('ja-JP');

  const ITEM_DEFINITIONS = [
    {
      id: 'exp_potion_2',
      name: '獲得経験値ポーション2倍',
      type: 'exp',
      multiplier: 2,
      weight: 10
    },
    {
      id: 'exp_potion_3',
      name: '獲得経験値ポーション3倍',
      type: 'exp',
      multiplier: 3,
      weight: 30
    },
    {
      id: 'exp_potion_5',
      name: '獲得経験値ポーション5倍',
      type: 'exp',
      multiplier: 5,
      weight: 10
    },
    {
      id: 'coin_potion_2',
      name: '獲得コインポーション2倍',
      type: 'coins',
      multiplier: 2,
      weight: 10
    },
    {
      id: 'coin_potion_3',
      name: '獲得コインポーション3倍',
      type: 'coins',
      multiplier: 3,
      weight: 30
    },
    {
      id: 'coin_potion_5',
      name: '獲得コインポーション5倍',
      type: 'coins',
      multiplier: 5,
      weight: 10
    }
  ];

  const SPIRIT_DEFINITIONS = [
    { id: 'luminaria', name: 'ルミナリア' },
    { id: 'astraea', name: 'アストライア' },
    { id: 'seraphiel', name: 'セラフィエル' },
    { id: 'ignis', name: 'イグニス' },
    { id: 'vulcan', name: 'ヴァルカン' },
    { id: 'prometheus', name: 'プロメテウス' },
    { id: 'aquaria', name: 'アクアリア' },
    { id: 'leviathan', name: 'レヴィアタン' },
    { id: 'celsius', name: 'セルシウス' },
    { id: 'voltris', name: 'ボルトリス' },
    { id: 'indra', name: 'インドラ' },
    { id: 'fulgur', name: 'フルグル' }
  ];

  const GACHA = {
    singleCost: 500,
    elevenCost: 5000,
    characterDuplicateShards: 1,
    spiritDuplicateShards: 1
  };

  let save = null;
  let busy = false;
  let fatal = false;
  let pendingHeal = null;
  let selectedEnemy = 0;
  let maxStage = 100;
  let lastGachaResults = [];

  let characters = new Map();
  let enemies = new Map();
  let skills = new Map();

  const fxQueue = [];
  const referenceCache = new Map();
  const backgroundCache = new Map();

  let backgroundToken = 0;

  // --------------------------------------------------
  // 共通処理
  // --------------------------------------------------

  function node(tag, className, text) {
    const element = document.createElement(tag);

    if (className) {
      element.className = className;
    }

    if (text !== undefined) {
      element.textContent = text;
    }

    if (tag === 'button') {
      element.type = 'button';
    }

    return element;
  }

  function status(text) {
    $('status').textContent = text;
  }

  function integer(value, min, max, label) {
    if (
      !Number.isSafeInteger(value) ||
      value < min ||
      value > max
    ) {
      throw new Error(label + 'が不正です。');
    }

    return value;
  }

  function finite(value, min, max, label) {
    if (
      !Number.isFinite(value) ||
      value < min ||
      value > max
    ) {
      throw new Error(label + 'が不正です。');
    }

    return value;
  }

  function safeAdd(a, b, label) {
    return integer(
      a + b,
      0,
      Number.MAX_SAFE_INTEGER,
      label
    );
  }

  function isActive() {
    return save?.battle?.state === 'active';
  }

  function validateMultiplier(value) {
    if (![1, 2, 3, 5].includes(value)) {
      throw new Error('ポーション倍率が不正です。');
    }

    return value;
  }

  function rankDefinition(rank) {
    const definition = D.rankDefinitions.find((entry) => {
      return entry.rank === rank;
    });

    if (!definition) {
      throw new Error('ランク定義がありません。');
    }

    return definition;
  }

  function skillFor(id, rank) {
    const definition = skills.get(id);
    const variant = definition?.variants[rank - 1];

    if (!definition || !variant) {
      throw new Error('ランク別スキル定義がありません。');
    }

    return {
      ...definition,
      ...variant
    };
  }

  function skillDescription(skill) {
    if (skill.type === 'damage') {
      const target = skill.target === 'allEnemies'
        ? '敵全体に各'
        : '敵単体に';

      const hits = (skill.hits || 1) > 1
        ? 'を' + skill.hits + '回'
        : '';

      const defense = skill.defenseScale !== undefined
        ? '。敵DEFを' +
          Math.round(skill.defenseScale * 100) +
          '％で計算'
        : '';

      return target + 'ATK×' + skill.power + hits + defense;
    }

    if (skill.type === 'heal') {
      return '生存中の味方1人をATK×' + skill.power + '回復';
    }

    if (skill.type === 'buff') {
      return 'この手番の通常攻撃ダメージ×' + skill.power;
    }

    if (skill.type === 'weaken') {
      return '次の敵フェーズの敵ATKを' +
        Math.round((1 - skill.power) * 100) +
        '％低下';
    }

    if (skill.type === 'mark') {
      return '敵が次に受ける1発のダメージ×' + skill.power;
    }

    if (skill.type === 'cover') {
      const reduction = Math.round(skill.reduction * 100);

      return '次の自分の手番まで単体攻撃をかばう' +
        (reduction > 0
          ? '。単体被ダメージ' + reduction + '％軽減'
          : '');
    }

    return '';
  }

  // --------------------------------------------------
  // ステージ・育成・報酬
  // --------------------------------------------------

  function stageInfo(index) {
    const count = D.rules.stagesPerFloor;

    return {
      floor: Math.floor((index - 1) / count) + 1,
      stage: (index - 1) % count + 1,
      boss: index % count === 0
    };
  }

  function stageName(index) {
    const info = stageInfo(index);
    return info.floor + '-' + info.stage;
  }

  function areaFor(index) {
    const area = D.areas.find((entry) => {
      return index >= entry.from && index <= entry.to;
    });

    if (!area) {
      throw new Error('エリア定義がありません：' + index);
    }

    return area;
  }

  function stats(member) {
    const definition = characters.get(member.id);

    if (!definition) {
      throw new Error('キャラクター定義がありません。');
    }

    const multiplier = rankDefinition(member.rank).statMultiplier;
    const result = {};

    for (const key of ['hp', 'atk', 'def']) {
      result[key] = (
        definition.base[key] +
        definition.growth[key] * (member.level - 1)
      ) * multiplier;
    }

    return result;
  }

  function neededExp(level) {
    const config = D.rules.levelExp;

    return Math.floor(
      config.base +
      config.linear * level +
      config.quadratic * level * level
    );
  }

  function rewardFor(index) {
    const config = D.rules.rewards;
    const boss = stageInfo(index).boss;

    return {
      exp: Math.floor(
        (
          config.expBase +
          config.expQuadratic * index * index
        ) * (boss ? config.bossExpMultiplier : 1)
      ),
      coins: Math.floor(
        (
          config.coinBase +
          config.coinPerStage * index
        ) * (boss ? config.bossCoinMultiplier : 1)
      )
    };
  }

  function grantExp(member, amount) {
    if (member.level >= D.rules.maxLevel) {
      member.exp = 0;
      return;
    }

    member.exp = safeAdd(member.exp, amount, '経験値');

    while (member.level < D.rules.maxLevel) {
      const required = neededExp(member.level);

      if (member.exp < required) {
        break;
      }

      member.exp -= required;
      member.level += 1;
    }

    if (member.level === D.rules.maxLevel) {
      member.exp = 0;
    }
  }

  // --------------------------------------------------
  // セーブ生成・検証・移行
  // --------------------------------------------------

  function freshSave() {
    const result = C.hydrate({
      game: 'towerquest-pages',
      schemaVersion: SCHEMA_VERSION,
      revision: 0,
      coins: 0,
      highestCleared: 0,
      selectedStage: 1,
      party: D.initialParty.map((id) => ({
        id,
        level: 1,
        rank: 1,
        exp: 0
      })),
      battle: null,
      updatedAt: new Date().toISOString()
    });

    result.itemSystemVersion = 1;

    result.rewardBoosts = {
      exp: 1,
      coins: 1
    };

    return result;
  }

  function validateParty(raw, oldRanks) {
    if (!Array.isArray(raw) || raw.length !== 4) {
      throw new Error('パーティは4人必要です。');
    }

    const seen = new Set();

    return raw.map((member) => {
      if (
        !member ||
        !characters.has(member.id) ||
        seen.has(member.id)
      ) {
        throw new Error('パーティのキャラクターが不正です。');
      }

      seen.add(member.id);

      const level = integer(
        member.level,
        1,
        D.rules.maxLevel,
        'レベル'
      );

      let rank = integer(
        member.rank,
        1,
        oldRanks ? 5 : D.rules.maxRank,
        'ランク'
      );

      if (oldRanks) {
        rank = 1 + Math.ceil((rank - 1) / 2);
      }

      const exp = integer(
        member.exp,
        0,
        Number.MAX_SAFE_INTEGER,
        '経験値'
      );

      if (
        (level === D.rules.maxLevel && exp !== 0) ||
        (
          level < D.rules.maxLevel &&
          exp >= neededExp(level)
        )
      ) {
        throw new Error('レベルと経験値が一致しません。');
      }

      return {
        id: member.id,
        level,
        rank,
        exp
      };
    });
  }

  function effectValues(type, property) {
    const result = [type === 'cover' ? 0 : 1];

    for (const skill of D.skills) {
      if (skill.type !== type) {
        continue;
      }

      for (const variant of skill.variants) {
        if (variant[property] !== undefined) {
          result.push(variant[property]);
        }
      }
    }

    return result;
  }

  function validateBattle(raw, party, cleared) {
    if (!raw || raw.version !== D.battleVersion) {
      return null;
    }

    if (!['active', 'won', 'lost'].includes(raw.state)) {
      throw new Error('戦闘状態が不正です。');
    }

    const index = integer(
      raw.index,
      1,
      maxStage,
      '戦闘ステージ'
    );

    integer(raw.round, 1, 1000000, 'ラウンド');
    integer(raw.actor, 0, 3, '行動者');

    if (index > Math.min(cleared + 1, maxStage)) {
      throw new Error('未解放ステージの戦闘です。');
    }

    if (
      !Array.isArray(raw.allies) ||
      raw.allies.length !== 4 ||
      !Array.isArray(raw.enemies) ||
      raw.enemies.length < 1 ||
      raw.enemies.length > 3
    ) {
      throw new Error('戦闘参加者が不正です。');
    }

    const buffs = effectValues('buff', 'power');
    const marks = effectValues('mark', 'power');
    const weakens = effectValues('weaken', 'power');
    const reductions = effectValues('cover', 'reduction');

    const battle = {
      version: D.battleVersion,
      index,
      state: raw.state,
      round: raw.round,
      actor: raw.actor,
      rewards: null,
      blessing: null,
      log: Array.isArray(raw.log)
        ? raw.log.slice(-40).map((line) => {
            return String(line).slice(0, 300);
          })
        : [],
      allies: [],
      enemies: []
    };

    raw.allies.forEach((ally, i) => {
      const member = party[i];
      const definition = characters.get(member.id);

      if (
        !ally ||
        ally.id !== member.id ||
        ally.rank !== member.rank
      ) {
        throw new Error('戦闘中のパーティが一致しません。');
      }

      integer(ally.maxHp, 1, 1000000000, '最大HP');
      integer(ally.hp, 0, ally.maxHp, 'HP');
      integer(ally.atk, 1, 1000000000, 'ATK');
      integer(ally.def, 0, 1000000000, 'DEF');

      if (
        typeof ally.defense !== 'boolean' ||
        typeof ally.cover !== 'boolean' ||
        !buffs.includes(ally.attackBuff) ||
        !reductions.includes(ally.coverReduction) ||
        !Array.isArray(ally.cooldowns) ||
        !Array.isArray(ally.usedSkills) ||
        ally.cooldowns.length !== definition.skills.length ||
        ally.usedSkills.length !== definition.skills.length ||
        !ally.usedSkills.every((value) => {
          return typeof value === 'boolean';
        })
      ) {
        throw new Error('味方のスキル状態が不正です。');
      }

      ally.cooldowns.forEach((value) => {
        integer(value, 0, 1000, '待ち時間');
      });

      battle.allies.push({
        id: member.id,
        rank: member.rank,
        maxHp: ally.maxHp,
        hp: ally.hp,
        atk: ally.atk,
        def: ally.def,
        defense: ally.defense,
        cover: ally.cover,
        coverReduction: ally.coverReduction,
        attackBuff: ally.attackBuff,
        cooldowns: [...ally.cooldowns],
        usedSkills: [...ally.usedSkills]
      });
    });

    raw.enemies.forEach((enemy) => {
      if (
        !enemy ||
        !enemies.has(enemy.id) ||
        !D.elements[enemy.element] ||
        !marks.includes(enemy.mark) ||
        !weakens.includes(enemy.weaken)
      ) {
        throw new Error('敵の状態が不正です。');
      }

      integer(enemy.maxHp, 1, 1000000000, '敵最大HP');
      integer(enemy.hp, 0, enemy.maxHp, '敵HP');
      integer(enemy.atk, 1, 1000000000, '敵ATK');
      integer(enemy.def, 0, 1000000000, '敵DEF');

      battle.enemies.push({
        id: enemy.id,
        name: String(enemy.name).slice(0, 100),
        element: enemy.element,
        maxHp: enemy.maxHp,
        hp: enemy.hp,
        atk: enemy.atk,
        def: enemy.def,
        mark: enemy.mark,
        weaken: enemy.weaken
      });
    });

    const alliesAlive = battle.allies.some((ally) => {
      return ally.hp > 0;
    });

    const enemiesAlive = battle.enemies.some((enemy) => {
      return enemy.hp > 0;
    });

    if (
      battle.state === 'active' &&
      (
        !alliesAlive ||
        !enemiesAlive ||
        battle.allies[battle.actor].hp <= 0
      )
    ) {
      throw new Error('進行中の戦闘状態が不正です。');
    }

    if (battle.state === 'lost' && alliesAlive) {
      throw new Error('敗北状態が不正です。');
    }

    if (battle.state === 'won') {
      if (
        !alliesAlive ||
        enemiesAlive ||
        cleared < index ||
        !raw.rewards
      ) {
        throw new Error('勝利状態が不正です。');
      }

      battle.rewards = {
        exp: integer(
          raw.rewards.exp,
          0,
          Number.MAX_SAFE_INTEGER,
          '報酬経験値'
        ),
        coins: integer(
          raw.rewards.coins,
          0,
          Number.MAX_SAFE_INTEGER,
          '報酬コイン'
        ),
        expMultiplier: validateMultiplier(
          raw.rewards.expMultiplier ?? 1
        ),
        coinMultiplier: validateMultiplier(
          raw.rewards.coinMultiplier ?? 1
        ),
        levelUps: Array.isArray(raw.rewards.levelUps)
          ? raw.rewards.levelUps.map((text) => {
              return String(text).slice(0, 100);
            })
          : []
      };
    }

    if (
      raw.blessing &&
      typeof raw.blessing.name === 'string' &&
      typeof raw.blessing.text === 'string'
    ) {
      battle.blessing = {
        name: raw.blessing.name.slice(0, 80),
        text: raw.blessing.text.slice(0, 160)
      };
    }

    return battle;
  }

  function hydrateItemSystem(value, raw) {
    if (
      raw.itemSystemVersion !== undefined &&
      raw.itemSystemVersion !== 1
    ) {
      throw new Error('対応していないアイテム形式です。');
    }

    let migrated = raw.itemSystemVersion === undefined;

    value.itemSystemVersion = 1;

    value.rewardBoosts = {
      exp: validateMultiplier(raw.rewardBoosts?.exp ?? 1),
      coins: validateMultiplier(raw.rewardBoosts?.coins ?? 1)
    };

    const oldIds = {
      exp_boost_potion: 'exp_potion_2',
      coin_boost_potion: 'coin_potion_2'
    };

    const merged = new Map();

    for (const item of value.items) {
      const id = oldIds[item.id] || item.id;

      if (id !== item.id) {
        migrated = true;
      }

      const quantity = safeAdd(
        merged.get(id) || 0,
        item.quantity,
        'アイテム数量'
      );

      merged.set(id, quantity);
    }

    value.items = Array.from(merged, ([id, quantity]) => ({
      id,
      quantity
    }));

    return migrated;
  }

  function normalizeSave(raw) {
    if (!raw || typeof raw !== 'object') {
      throw new Error('セーブデータが不正です。');
    }

    const gas = raw.game !== 'towerquest-pages' &&
      Array.isArray(raw.party) &&
      raw.clearedFloor !== undefined;

    const pages = raw.game === 'towerquest-pages' &&
      [1, 2, 3].includes(raw.schemaVersion);

    if (!gas && !pages) {
      throw new Error('対応していないセーブ形式です。');
    }

    const migrated = gas || raw.schemaVersion !== SCHEMA_VERSION;
    const oldRanks = gas || raw.schemaVersion === 1;
    const party = validateParty(raw.party, oldRanks);

    const originalCleared = gas
      ? integer(raw.clearedFloor, 0, 100, '旧突破階層') *
        D.rules.stagesPerFloor
      : integer(
          raw.highestCleared,
          0,
          migrated ? 1000 : maxStage,
          '突破ステージ'
        );

    const cleared = Math.min(originalCleared, maxStage);

    const selected = migrated
      ? Math.min(cleared + 1, maxStage)
      : integer(
          raw.selectedStage,
          1,
          maxStage,
          '選択ステージ'
        );

    if (selected > Math.min(cleared + 1, maxStage)) {
      throw new Error('選択ステージが未解放です。');
    }

    const base = {
      game: 'towerquest-pages',
      schemaVersion: SCHEMA_VERSION,
      revision: gas
        ? 0
        : integer(
            raw.revision ?? 0,
            0,
            Number.MAX_SAFE_INTEGER,
            '保存番号'
          ),
      coins: integer(
        raw.coins,
        0,
        Number.MAX_SAFE_INTEGER,
        'コイン'
      ),
      highestCleared: cleared,
      selectedStage: selected,
      party,
      battle: null,
      updatedAt: new Date().toISOString()
    };

    const value = C.hydrate(base, oldRanks ? base : raw);
    const itemsMigrated = hydrateItemSystem(value, raw);

    const battleReset = !!raw.battle &&
      (
        migrated ||
        raw.battle.version !== D.battleVersion
      );

    value.battle = migrated
      ? null
      : validateBattle(raw.battle, value.party, cleared);

    return {
      migrated,
      collectionMigrated: raw.collectionVersion === undefined,
      itemsMigrated,
      battleReset,
      capped: originalCleared > maxStage,
      value
    };
  }

  function persist() {
    C.syncParty(save);
    save.updatedAt = new Date().toISOString();
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  }

  // --------------------------------------------------
  // マスター検証・起動
  // --------------------------------------------------

  function validateMaster() {
    if (
      !D ||
      !C ||
      !U ||
      !D.rules ||
      !D.elements ||
      !D.balance ||
      !Array.isArray(D.characters) ||
      !Array.isArray(D.enemies) ||
      !Array.isArray(D.skills) ||
      !Array.isArray(D.rankDefinitions) ||
      !Array.isArray(D.initialParty) ||
      !Array.isArray(D.areas) ||
      !Array.isArray(D.encounters)
    ) {
      throw new Error(
        'data.js・collection.js・spirit-upgrade.jsを確認してください。'
      );
    }

    if (
      D.rules.floors !== 10 ||
      D.rules.stagesPerFloor !== 10 ||
      D.rules.maxLevel !== 99 ||
      D.rules.maxRank !== 3
    ) {
      throw new Error(
        'data.jsは全10階・各10ステージ・Lv99・ランク3版を使用してください。'
      );
    }

    integer(D.battleVersion, 1, 1000000, '戦闘バージョン');

    maxStage = D.rules.floors * D.rules.stagesPerFloor;

    characters = new Map(
      D.characters.map((entry) => [entry.id, entry])
    );

    enemies = new Map(
      D.enemies.map((entry) => [entry.id, entry])
    );

    skills = new Map(
      D.skills.map((entry) => [entry.id, entry])
    );

    if (
      characters.size !== D.characters.length ||
      enemies.size !== D.enemies.length ||
      skills.size !== D.skills.length
    ) {
      throw new Error('マスターに重複IDがあります。');
    }

    if (
      D.initialParty.length !== 4 ||
      new Set(D.initialParty).size !== 4
    ) {
      throw new Error('初期パーティは異なる4人を指定してください。');
    }

    if (
      !Array.isArray(D.balance.averageDamageFactors) ||
      !Array.isArray(D.balance.reincarnateAfterStage) ||
      !Array.isArray(D.balance.roundTargets)
    ) {
      throw new Error('戦闘バランス設定が不足しています。');
    }

    for (let rank = 1; rank <= D.rules.maxRank; rank += 1) {
      if (
        rankDefinition(rank).statMultiplier !==
        Math.pow(4, rank - 1)
      ) {
        throw new Error('ランク倍率は1・4・16にしてください。');
      }

      finite(
        D.balance.averageDamageFactors[rank - 1],
        0.01,
        100,
        '想定ダメージ係数'
      );
    }

    for (const character of D.characters) {
      if (
        !/^[a-zA-Z0-9_-]{1,64}$/.test(character.id) ||
        !D.elements[character.element] ||
        !Array.isArray(character.skills) ||
        character.skills.length !== 3 ||
        !Array.isArray(character.jobs) ||
        character.jobs.length < D.rules.maxRank ||
        !Array.isArray(character.portraits)
      ) {
        throw new Error('キャラクター設定が不足しています。');
      }

      for (const key of ['hp', 'atk', 'def']) {
        integer(
          character.base[key],
          key === 'def' ? 0 : 1,
          1000000,
          '初期ステータス'
        );

        integer(
          character.growth[key],
          0,
          1000000,
          '成長量'
        );
      }

      for (const id of character.skills) {
        for (let rank = 1; rank <= D.rules.maxRank; rank += 1) {
          const skill = skillFor(id, rank);

          if (
            ![
              'damage',
              'heal',
              'buff',
              'weaken',
              'mark',
              'cover'
            ].includes(skill.type)
          ) {
            throw new Error('未対応のスキル種別です。');
          }

          integer(skill.cooldown, 1, 1000, 'スキル待ち時間');

          if (skill.type === 'cover') {
            finite(skill.reduction, 0, 0.95, 'かばう軽減');
          } else if (skill.type === 'weaken') {
            finite(skill.power, 0.01, 1, '弱体化倍率');
          } else {
            finite(skill.power, 0.01, 100, 'スキル倍率');
          }

          if (skill.hits !== undefined) {
            integer(skill.hits, 1, 20, '攻撃回数');
          }

          if (skill.defenseScale !== undefined) {
            finite(
              skill.defenseScale,
              0,
              1,
              '防御参照倍率'
            );
          }
        }
      }
    }

    for (const id of D.initialParty) {
      if (!characters.has(id)) {
        throw new Error('初期キャラクターがありません。');
      }
    }

    for (const enemy of D.enemies) {
      if (!D.elements[enemy.element]) {
        throw new Error('敵の属性が不正です。');
      }

      for (const key of ['hpRate', 'atkRate', 'defRate']) {
        finite(enemy[key], 0.01, 100, '敵能力補正');
      }
    }

    for (let level = 1; level < D.rules.maxLevel; level += 1) {
      integer(
        neededExp(level),
        1,
        Number.MAX_SAFE_INTEGER,
        '必要経験値'
      );
    }

    for (let index = 1; index <= maxStage; index += 1) {
      areaFor(index);

      const ids = encounterIds(index);

      if (
        ids.length < 1 ||
        ids.length > 3 ||
        ids.some((id) => !enemies.has(id))
      ) {
        throw new Error(
          '敵の出現設定が不正です：' + stageName(index)
        );
      }

      const info = stageInfo(index);

      finite(
        targetRounds(info.floor, info.boss),
        0.1,
        1000,
        '想定ラウンド数'
      );

      const reward = rewardFor(index);

      integer(
        reward.exp,
        0,
        Number.MAX_SAFE_INTEGER,
        '基本経験値'
      );

      integer(
        reward.coins,
        0,
        Number.MAX_SAFE_INTEGER,
        '基本コイン'
      );
    }
  }

  function boot() {
    try {
      validateMaster();
      createExtraUI();

      C.init({
        getSave: () => save,
        stats: (member) => stats(member),
        transact: (action) => transact(action)
      });

      U.init({
        getSave: () => save,
        isBlocked: () => busy || fatal,
        transact: (action) => transact(action)
      });

      const text = localStorage.getItem(SAVE_KEY);
      let message = '全10階・100ステージ／自動保存';

      if (text) {
        const result = normalizeSave(JSON.parse(text));
        save = result.value;

        if (
          result.migrated ||
          result.collectionMigrated ||
          result.itemsMigrated ||
          result.battleReset
        ) {
          if (!localStorage.getItem(BACKUP_KEY)) {
            localStorage.setItem(BACKUP_KEY, text);
          }

          save.revision = safeAdd(save.revision, 1, '保存番号');
          persist();

          message = 'セーブを新仕様へ更新しました。';

          if (result.itemsMigrated) {
            message += ' 旧ポーションは対応する2倍ポーションへ移行しました。';
          }

          if (result.battleReset) {
            message += ' 旧戦闘途中データは解除しました。';
          }

          if (result.capped) {
            message += ' 突破数は100へ補正しました。';
          }
        }
      } else {
        save = freshSave();
        persist();
      }

      render();
      status(message);
    } catch (error) {
      fatal = true;
      lockInput(true);

      $('result').textContent =
        '起動できませんでした。保存データは削除していません。';

      status('起動エラー：' + error.message);
    }
  }

  // --------------------------------------------------
  // 操作ロック・保存トランザクション
  // --------------------------------------------------

  function lockInput(locked) {
    const app = document.querySelector('.app');

    if (app) {
      app.classList.toggle('is-animating', locked);
      app.setAttribute('aria-busy', String(locked));
    }

    if (locked || fatal) {
      document.querySelectorAll('button, select').forEach((element) => {
        element.disabled = true;
      });
    } else {
      document.querySelectorAll('select').forEach((element) => {
        element.disabled = false;
      });
    }
  }

  async function transact(action) {
    if (busy || fatal || !save) {
      return false;
    }

    const before = clone(save);

    busy = true;
    fxQueue.length = 0;
    lockInput(true);

    let committed = false;
    let message = '';

    try {
      const disk = JSON.parse(localStorage.getItem(SAVE_KEY));

      if (!disk || disk.revision !== save.revision) {
        fatal = true;

        throw new Error(
          '別タブで進行が変わりました。再読み込みしてください。'
        );
      }

      action();

      save.revision = safeAdd(
        before.revision,
        1,
        '保存番号'
      );

      persist();

      pendingHeal = null;
      committed = true;

      if (fxQueue.length > 0) {
        status('戦闘演出中…');
      }

      try {
        await playFxQueue();
      } catch (error) {
        console.warn('演出を省略しました。', error);
      }
    } catch (error) {
      if (!committed) {
        save = before;
      }

      message = error.message;
    } finally {
      fxQueue.length = 0;
      busy = false;
      lockInput(false);
      render();
    }

    if (fatal) {
      status(
        '別タブで保存データが変わりました。再読み込みしてください。'
      );
    } else {
      status(
        committed
          ? '保存済み'
          : '操作を確定できませんでした：' + message
      );
    }

    return committed;
  }

  // --------------------------------------------------
  // 敵生成
  // --------------------------------------------------

  function referenceMember(index) {
    if (referenceCache.has(index)) {
      return referenceCache.get(index);
    }

    const member = {
      id: D.initialParty[0],
      rank: 1,
      level: 1,
      exp: 0
    };

    for (let i = 1; i < index; i += 1) {
      grantExp(member, rewardFor(i).exp);

      const threshold =
        D.balance.reincarnateAfterStage[member.rank - 1];

      if (
        member.rank < D.rules.maxRank &&
        member.level === D.rules.maxLevel &&
        threshold !== undefined &&
        i >= threshold
      ) {
        member.rank += 1;
        member.level = 1;
        member.exp = 0;
      }
    }

    referenceCache.set(index, clone(member));

    return member;
  }

  function targetRounds(floor, boss) {
    const config = D.balance.roundTargets.find((entry) => {
      return floor >= entry.from && floor <= entry.to;
    });

    if (!config) {
      throw new Error('戦闘ラウンド設定がありません。');
    }

    return boss ? config.boss : config.normal;
  }

  function encounterIds(index) {
    const info = stageInfo(index);
    const override = D.stageOverrides?.[stageName(index)];

    if (Array.isArray(override?.enemies)) {
      return override.enemies;
    }

    const group = D.encounters.find((entry) => {
      return entry.floor === info.floor;
    });

    if (!group) {
      throw new Error('階層の敵設定がありません。');
    }

    if (info.boss) {
      return [group.boss];
    }

    if (!Array.isArray(group.normal) || group.normal.length === 0) {
      throw new Error('通常敵の出現設定がありません。');
    }

    const unlocked = info.stage <= 2
      ? 1
      : info.stage <= 4
        ? 2
        : info.stage <= 6
          ? 3
          : 4;

    const pool = group.normal.slice(0, unlocked);

    const count = info.floor <= 2
      ? 1
      : info.stage % 3 === 0
        ? 3
        : 2;

    return Array.from({ length: count }, (_, i) => {
      return pool[(info.stage - 1 + i) % pool.length];
    });
  }

  function createEnemies(index) {
    const info = stageInfo(index);
    const ids = encounterIds(index);
    const reference = referenceMember(index);
    const value = stats(reference);

    const override =
      D.stageOverrides?.[stageName(index)] || {};

    const hpMultiplier = override.hpMultiplier ?? 1;
    const atkMultiplier = override.atkMultiplier ?? 1;

    finite(hpMultiplier, 0.01, 100, '敵HP補正');
    finite(atkMultiplier, 0.01, 100, '敵ATK補正');

    const factor =
      D.balance.averageDamageFactors[reference.rank - 1];

    // 敵の強さはステージ基準で固定。
    // 精霊加護やポーションに連動させない。
    const totalHp = value.atk * 4 * factor *
      targetRounds(info.floor, info.boss);

    return ids.map((id, i) => {
      const definition = enemies.get(id);

      const duplicate = ids.filter((entry) => {
        return entry === id;
      }).length > 1;

      const maxHp = Math.max(
        1,
        Math.floor(
          totalHp /
          ids.length *
          definition.hpRate *
          hpMultiplier
        )
      );

      return {
        id,
        name: definition.name + (duplicate ? ' ' + (i + 1) : ''),
        element: definition.element,
        maxHp,
        hp: maxHp,
        atk: Math.max(
          1,
          Math.floor(
            (
              value.def / 2 +
              value.hp *
              (info.boss ? 0.14 : 0.09) /
              ids.length
            ) *
            definition.atkRate *
            atkMultiplier
          )
        ),
        def: Math.max(
          1,
          Math.floor(
            value.atk *
            (info.boss ? 0.4 : 0.22) *
            definition.defRate
          )
        ),
        mark: 1,
        weaken: 1
      };
    });
  }

  // --------------------------------------------------
  // 戦闘
  // --------------------------------------------------

  function startBattle(index) {
    if (isActive()) {
      throw new Error('先に撤退してください。');
    }

    integer(
      index,
      1,
      Math.min(save.highestCleared + 1, maxStage),
      'ステージ'
    );

    save.selectedStage = index;
    selectedEnemy = 0;

    const spirit = C.equippedSpirit(save);

    const blessing = spirit
      ? {
          name: spirit.name + ' R' + spirit.rank,
          text: C.blessingText(spirit)
        }
      : null;

    save.battle = {
      version: D.battleVersion,
      index,
      state: 'active',
      round: 1,
      actor: 0,
      rewards: null,
      blessing,
      log: [
        stageName(index) +
        '／' +
        areaFor(index).name +
        '：戦闘開始'
      ],
      allies: save.party.map((member) => {
        const value = stats(member);
        const definition = characters.get(member.id);

        return {
          id: member.id,
          rank: member.rank,
          maxHp: value.hp,
          hp: value.hp,
          atk: C.attackWithBlessing(
            save,
            member.id,
            value.atk
          ),
          def: value.def,
          defense: false,
          cover: false,
          coverReduction: 0,
          attackBuff: 1,
          cooldowns: definition.skills.map(() => 0),
          usedSkills: definition.skills.map(() => false)
        };
      }),
      enemies: createEnemies(index)
    };

    if (blessing) {
      addLog(blessing.name + '：' + blessing.text);
    }

    if (
      save.rewardBoosts.exp > 1 ||
      save.rewardBoosts.coins > 1
    ) {
      addLog('報酬効果：' + boostText());
    }
  }

  function addLog(text) {
    save.battle.log.push(text);
    save.battle.log = save.battle.log.slice(-40);
  }

  function elementRate(attack, defense) {
    const strong = {
      fire: 'thunder',
      water: 'fire',
      thunder: 'water',
      light: 'dark',
      dark: 'light'
    };

    if (strong[attack] === defense) {
      return 1.5;
    }

    if (
      ['fire', 'water', 'thunder'].includes(attack) &&
      strong[defense] === attack
    ) {
      return 0.75;
    }

    return 1;
  }

  function targetEnemy() {
    const list = save.battle.enemies;

    return list[selectedEnemy]?.hp > 0
      ? list[selectedEnemy]
      : list.find((enemy) => enemy.hp > 0);
  }

  function queueFx(event) {
    fxQueue.push(event);
  }

  function hitEnemy(
    actor,
    enemy,
    power,
    defenseScale = 1,
    modifier = 1,
    skillAttack = false
  ) {
    if (!enemy || enemy.hp <= 0) {
      return;
    }

    const definition = characters.get(actor.id);

    const base = Math.max(
      1,
      actor.atk * power - enemy.def * defenseScale / 2
    );

    const amount = Math.max(
      1,
      Math.floor(
        base *
        elementRate(definition.element, enemy.element) *
        modifier *
        enemy.mark
      )
    );

    enemy.mark = 1;
    enemy.hp = Math.max(0, enemy.hp - amount);

    addLog(
      definition.name +
      ' → ' +
      enemy.name +
      '：' +
      number(amount)
    );

    queueFx({
      kind: 'damage',
      side: 'enemy',
      index: save.battle.enemies.indexOf(enemy),
      element: definition.element,
      amount,
      skill: skillAttack
    });
  }

  function useSkill(actor, slot, allyIndex) {
    const definition = characters.get(actor.id);

    integer(slot, 0, definition.skills.length - 1, 'スキル');

    if (
      actor.cooldowns[slot] > 0 ||
      actor.usedSkills[slot]
    ) {
      throw new Error('そのスキルは使用できません。');
    }

    const skill = skillFor(
      definition.skills[slot],
      actor.rank
    );

    const battle = save.battle;
    const enemy = targetEnemy();
    const actorIndex = battle.allies.indexOf(actor);

    queueFx({
      kind: 'cast',
      side: 'ally',
      index: actorIndex,
      element: definition.element
    });

    if (skill.type === 'damage') {
      addLog(definition.name + '：' + skill.name);

      const targets = skill.target === 'allEnemies'
        ? battle.enemies.filter((entry) => entry.hp > 0)
        : [enemy];

      for (const target of targets) {
        for (let hit = 0; hit < (skill.hits || 1); hit += 1) {
          hitEnemy(
            actor,
            target,
            skill.power,
            skill.defenseScale ?? 1,
            1,
            true
          );
        }
      }
    } else if (skill.type === 'heal') {
      integer(allyIndex, 0, 3, '回復対象');

      const target = battle.allies[allyIndex];

      if (target.hp <= 0) {
        throw new Error('戦闘不能の味方は回復できません。');
      }

      const before = target.hp;

      target.hp = Math.min(
        target.maxHp,
        target.hp + Math.floor(actor.atk * skill.power)
      );

      const amount = target.hp - before;

      addLog(
        skill.name +
        '：' +
        characters.get(target.id).name +
        'を' +
        number(amount) +
        '回復'
      );

      queueFx({
        kind: 'heal',
        side: 'ally',
        index: allyIndex,
        element: definition.element,
        amount
      });
    } else if (
      skill.type === 'buff' ||
      skill.type === 'cover'
    ) {
      if (skill.type === 'buff') {
        actor.attackBuff = skill.power;
      } else {
        actor.cover = true;
        actor.coverReduction = skill.reduction;
      }

      addLog(definition.name + '：' + skill.name);

      queueFx({
        kind: 'enhance',
        side: 'ally',
        index: actorIndex,
        element: definition.element
      });
    } else if (skill.type === 'weaken') {
      battle.enemies.forEach((target, index) => {
        if (target.hp > 0) {
          target.weaken = skill.power;

          queueFx({
            kind: 'debuff',
            side: 'enemy',
            index,
            element: definition.element
          });
        }
      });

      addLog(skill.name + '：敵の攻撃力が低下');
    } else if (skill.type === 'mark') {
      if (!enemy) {
        throw new Error('対象の敵がいません。');
      }

      enemy.mark = skill.power;

      addLog(skill.name + '：' + enemy.name + 'に光の印');

      queueFx({
        kind: 'debuff',
        side: 'enemy',
        index: battle.enemies.indexOf(enemy),
        element: definition.element
      });
    } else {
      throw new Error('未対応のスキルです。');
    }

    actor.cooldowns[slot] = skill.cooldown;
    actor.usedSkills[slot] = true;
  }

  function performAction(command, slot, allyIndex) {
    if (!isActive()) {
      throw new Error('戦闘中ではありません。');
    }

    const battle = save.battle;
    const actor = battle.allies[battle.actor];

    let endTurn = false;

    if (command === 'attack') {
      queueFx({
        kind: 'move',
        side: 'ally',
        index: battle.actor
      });

      hitEnemy(
        actor,
        targetEnemy(),
        1,
        1,
        actor.attackBuff
      );

      endTurn = true;
    } else if (command === 'defend') {
      actor.defense = true;

      addLog(characters.get(actor.id).name + 'は防御した');

      queueFx({
        kind: 'enhance',
        side: 'ally',
        index: battle.actor,
        element: characters.get(actor.id).element
      });

      endTurn = true;
    } else if (command === 'skill') {
      useSkill(actor, slot, allyIndex);
    } else {
      throw new Error('コマンドが不正です。');
    }

    if (battle.enemies.every((enemy) => enemy.hp <= 0)) {
      victory();
    } else if (endTurn) {
      nextActor();
    }
  }

  function beginTurn(actor) {
    actor.defense = false;
    actor.cover = false;
    actor.coverReduction = 0;
    actor.attackBuff = 1;
    actor.usedSkills.fill(false);

    actor.cooldowns = actor.cooldowns.map((value) => {
      return Math.max(0, value - 1);
    });
  }

  function nextActor() {
    const battle = save.battle;
    let next = battle.actor + 1;

    while (next < 4 && battle.allies[next].hp <= 0) {
      next += 1;
    }

    if (next < 4) {
      battle.actor = next;
      beginTurn(battle.allies[next]);
      return;
    }

    enemyPhase();

    if (battle.state === 'active') {
      battle.round += 1;

      battle.actor = battle.allies.findIndex((ally) => {
        return ally.hp > 0;
      });

      beginTurn(battle.allies[battle.actor]);
    }
  }

  function damageAlly(enemy, target, power, enraged, single) {
    const definition = characters.get(target.id);

    const base = Math.max(
      1,
      enemy.atk *
      enemy.weaken *
      power *
      (enraged ? 1.15 : 1) -
      target.def / 2
    );

    const coverRate = single && target.cover
      ? 1 - target.coverReduction
      : 1;

    const amount = Math.max(
      1,
      Math.floor(
        base *
        elementRate(enemy.element, definition.element) *
        (target.defense ? 0.5 : 1) *
        coverRate
      )
    );

    target.hp = Math.max(0, target.hp - amount);

    addLog(
      enemy.name +
      ' → ' +
      definition.name +
      '：' +
      number(amount)
    );

    queueFx({
      kind: 'damage',
      side: 'ally',
      index: save.battle.allies.indexOf(target),
      element: enemy.element,
      amount,
      skill: power !== 1
    });
  }

  function enemyPhase() {
    const battle = save.battle;
    const boss = stageInfo(battle.index).boss;
    const big = boss && battle.round % 3 === 0;
    const sweep = big && battle.round % 6 === 0;

    for (const enemy of battle.enemies.filter((entry) => entry.hp > 0)) {
      const living = battle.allies.filter((ally) => ally.hp > 0);

      if (!living.length) {
        break;
      }

      const enraged = boss && enemy.hp <= enemy.maxHp / 2;

      queueFx({
        kind: 'move',
        side: 'enemy',
        index: battle.enemies.indexOf(enemy)
      });

      if (sweep) {
        addLog(enemy.name + 'の全体攻撃！');

        for (const target of living) {
          damageAlly(enemy, target, 0.85, enraged, false);
        }
      } else {
        let target = living[
          Math.floor(Math.random() * living.length)
        ];

        const guardian = living.find((ally) => ally.cover);

        if (guardian && guardian !== target) {
          target = guardian;
          addLog(characters.get(target.id).name + 'がかばった');
        }

        if (big) {
          addLog(enemy.name + 'の強打！');
        }

        damageAlly(
          enemy,
          target,
          big ? 1.8 : 1,
          enraged,
          true
        );
      }
    }

    battle.enemies.forEach((enemy) => {
      enemy.weaken = 1;
    });

    if (battle.allies.every((ally) => ally.hp <= 0)) {
      battle.state = 'lost';

      addLog(
        '全滅。育成・コイン・突破状況・ポーション効果は維持されます。'
      );
    }
  }

  function victory() {
    const battle = save.battle;

    if (battle.state !== 'active') {
      return;
    }

    const base = rewardFor(battle.index);
    const expMultiplier = save.rewardBoosts.exp;
    const coinMultiplier = save.rewardBoosts.coins;

    const reward = {
      exp: integer(
        base.exp * expMultiplier,
        0,
        Number.MAX_SAFE_INTEGER,
        '獲得経験値'
      ),
      coins: integer(
        base.coins * coinMultiplier,
        0,
        Number.MAX_SAFE_INTEGER,
        '獲得コイン'
      ),
      expMultiplier,
      coinMultiplier
    };

    save.coins = safeAdd(
      save.coins,
      reward.coins,
      'コイン'
    );

    save.highestCleared = Math.max(
      save.highestCleared,
      battle.index
    );

    const levelUps = [];

    // 経験値を獲得するのは、出撃中の4人のみ。
    for (const member of save.party) {
      const before = member.level;
      grantExp(member, reward.exp);

      if (member.level > before) {
        levelUps.push(
          characters.get(member.id).name +
          ' Lv.' +
          before +
          ' → ' +
          member.level
        );
      }
    }

    battle.state = 'won';

    battle.rewards = {
      ...reward,
      levelUps
    };

    addLog(
      '勝利！ EXP +' +
      number(reward.exp) +
      ' / COIN +' +
      number(reward.coins)
    );

    if (expMultiplier > 1 || coinMultiplier > 1) {
      addLog(
        'ポーション適用：経験値×' +
        expMultiplier +
        '／コイン×' +
        coinMultiplier +
        '。効果を消費しました。'
      );
    }

    save.rewardBoosts = {
      exp: 1,
      coins: 1
    };
  }

  function reincarnate(id) {
    const member = save.party.find((entry) => {
      return entry.id === id;
    });

    if (
      isActive() ||
      !member ||
      member.level !== D.rules.maxLevel ||
      member.rank >= D.rules.maxRank
    ) {
      throw new Error('転生条件を満たしていません。');
    }

    member.rank += 1;
    member.level = 1;
    member.exp = 0;

    save.battle = null;
  }

  // --------------------------------------------------
  // アイテム
  // --------------------------------------------------

  function boostText() {
    return '経験値×' +
      save.rewardBoosts.exp +
      '／コイン×' +
      save.rewardBoosts.coins;
  }

  function itemDefinition(id) {
    return ITEM_DEFINITIONS.find((entry) => {
      return entry.id === id;
    });
  }

  function itemLabel(id) {
    const definition = itemDefinition(id);

    if (definition) {
      return definition.name;
    }

    const prefix = 'character_shard_';

    if (id.startsWith(prefix)) {
      const characterId = id.slice(prefix.length);
      const character = characters.get(characterId);

      return (character?.name || characterId) + 'の欠片';
    }

    return id;
  }

  function addItem(id, amount) {
    let item = save.items.find((entry) => {
      return entry.id === id;
    });

    if (!item) {
      item = {
        id,
        quantity: 0
      };

      save.items.push(item);
    }

    item.quantity = safeAdd(
      item.quantity,
      amount,
      'アイテム数量'
    );
  }

  async function usePotion(id) {
    if (busy || fatal || isActive()) {
      return;
    }

    const definition = itemDefinition(id);

    if (!definition) {
      return;
    }

    const current = save.rewardBoosts[definition.type];
    const label = definition.type === 'exp'
      ? '経験値'
      : 'コイン';

    const lines = [
      definition.name + 'を1個使用しますか？',
      '次の勝利1回の獲得' +
        label +
        'が' +
        definition.multiplier +
        '倍になります。',
      '敗北・撤退では効果を消費しません。'
    ];

    if (current > 1) {
      lines.push(
        '現在の' +
        current +
        '倍効果は上書きされます。倍率は重複しません。'
      );
    }

    if (!confirm(lines.join('\n'))) {
      return;
    }

    await transact(() => {
      if (isActive()) {
        throw new Error('戦闘中はポーションを使用できません。');
      }

      const item = save.items.find((entry) => {
        return entry.id === id;
      });

      if (!item || item.quantity < 1) {
        throw new Error('ポーションを所持していません。');
      }

      item.quantity -= 1;
      save.rewardBoosts[definition.type] = definition.multiplier;
    });
  }

  // --------------------------------------------------
  // ガチャ
  // --------------------------------------------------

  function randomInt(max) {
    integer(max, 1, 4294967296, '抽選範囲');

    if (!window.crypto?.getRandomValues) {
      throw new Error('この環境では抽選用乱数を利用できません。');
    }

    const buffer = new Uint32Array(1);
    const limit = Math.floor(4294967296 / max) * max;

    do {
      window.crypto.getRandomValues(buffer);
    } while (buffer[0] >= limit);

    return buffer[0] % max;
  }

  function choose(list) {
    if (!Array.isArray(list) || list.length === 0) {
      throw new Error('抽選対象が登録されていません。');
    }

    return list[randomInt(list.length)];
  }

  function weightedItem() {
    const total = ITEM_DEFINITIONS.reduce((sum, entry) => {
      return sum + entry.weight;
    }, 0);

    let roll = randomInt(total);

    for (const item of ITEM_DEFINITIONS) {
      if (roll < item.weight) {
        return item;
      }

      roll -= item.weight;
    }

    throw new Error('アイテム抽選に失敗しました。');
  }

  function characterPool() {
    return D.characters.filter((entry) => {
      return entry.gachaEnabled !== false;
    });
  }

  function drawOne() {
    const category = randomInt(100);

    if (category < 60) {
      const item = weightedItem();
      addItem(item.id, 1);

      return {
        category: 'アイテム',
        name: item.name,
        message: '1個獲得',
        isNew: false
      };
    }

    if (category < 90) {
      const character = choose(characterPool());

      const owned = save.ownedCharacters.some((entry) => {
        return entry.id === character.id;
      });

      if (owned) {
        addItem(
          'character_shard_' + character.id,
          GACHA.characterDuplicateShards
        );

        return {
          category: 'キャラクター',
          name: character.name,
          message:
            '重複 → キャラの欠片×' +
            GACHA.characterDuplicateShards,
          isNew: false
        };
      }

      save.ownedCharacters.push({
        id: character.id,
        level: 1,
        rank: 1,
        exp: 0
      });

      return {
        category: 'キャラクター',
        name: character.name,
        message: 'ランク1・レベル1で加入',
        isNew: true
      };
    }

    const spirit = choose(SPIRIT_DEFINITIONS);

    const owned = save.ownedSpirits.find((entry) => {
      return entry.id === spirit.id;
    });

    if (owned) {
      owned.shards = safeAdd(
        owned.shards,
        GACHA.spiritDuplicateShards,
        '精霊の欠片'
      );

      return {
        category: '精霊',
        name: spirit.name,
        message:
          '重複 → 精霊の欠片×' +
          GACHA.spiritDuplicateShards,
        isNew: false
      };
    }

    save.ownedSpirits.push({
      id: spirit.id,
      rank: 1,
      shards: 0
    });

    return {
      category: '精霊',
      name: spirit.name,
      message: 'ランク1で加入',
      isNew: true
    };
  }

  async function drawGacha(count) {
    if (
      busy ||
      fatal ||
      isActive() ||
      ![1, 11].includes(count)
    ) {
      return;
    }

    const cost = count === 1
      ? GACHA.singleCost
      : GACHA.elevenCost;

    if (
      !confirm(
        number(cost) +
        'コインで' +
        count +
        '回抽選しますか？'
      )
    ) {
      return;
    }

    let results = [];

    const success = await transact(() => {
      if (isActive()) {
        throw new Error('戦闘中はガチャを利用できません。');
      }

      if (save.coins < cost) {
        throw new Error('コインが不足しています。');
      }

      if (characterPool().length === 0) {
        throw new Error('キャラクターの抽選対象が未登録です。');
      }

      save.coins -= cost;

      results = Array.from({ length: count }, () => {
        return drawOne();
      });
    });

    if (success) {
      lastGachaResults = results;
      renderGachaResults();
    }
  }

  // --------------------------------------------------
  // 追加画面の生成
  // --------------------------------------------------

  function createExtraUI() {
    const management = $('management');

    const section = node('section', 'management-section');
    const buttons = node('div', 'button-row');

    const openGacha = node('button', '', '召喚ガチャ');
    openGacha.id = 'openGacha';

    const openItems = node('button', '', '所持アイテム');
    openItems.id = 'openItems';

    const boost = node('p', 'muted');
    boost.id = 'managementBoost';

    buttons.append(openGacha, openItems);

    section.append(
      node('h3', '', 'ガチャ・アイテム'),
      buttons,
      boost,
      node(
        'p',
        'muted',
        '1回500コイン／11回5,000コイン。' +
        'ポーションは次の勝利1回に適用します。'
      )
    );

    management.append(section);

    const battleBoost = node('div', 'blessing-status');
    battleBoost.id = 'rewardBoostStatus';

    $('blessingStatus').after(battleBoost);

    const gachaDialog = document.createElement('dialog');
    gachaDialog.id = 'gachaDialog';

    const gachaHeader = node('div', 'dialog-header');
    const closeGacha = node('button', '', '閉じる');
    closeGacha.id = 'closeGacha';

    gachaHeader.append(
      node('h2', '', '召喚ガチャ'),
      closeGacha
    );

    const coins = node('p', 'coins');
    coins.id = 'gachaCoins';

    const message = node('p', 'muted');
    message.id = 'gachaMessage';

    const drawButtons = node('div', 'button-row');

    const single = node('button', 'primary', '1回｜500コイン');
    single.id = 'gachaSingle';

    const eleven = node('button', 'primary', '11回｜5,000コイン');
    eleven.id = 'gachaEleven';

    drawButtons.append(single, eleven);

    const rates = node('details', 'management-section');
    const rateList = node('div', '');

    rateList.append(
      node(
        'p',
        'muted',
        'アイテム60％／キャラクター30％／精霊10％'
      )
    );

    for (const item of ITEM_DEFINITIONS) {
      rateList.append(
        node(
          'p',
          'muted',
          item.name +
          '：全体' +
          (item.weight * 0.6).toFixed(0) +
          '％／アイテム枠内' +
          item.weight +
          '％'
        )
      );
    }

    rateList.append(
      node(
        'p',
        'muted',
        'キャラクター枠内・精霊枠内は均等抽選。' +
        '11回とも独立抽選で、レア保証はありません。'
      ),
      node(
        'p',
        'muted',
        '重複キャラは対応するキャラの欠片1個、' +
        '重複精霊は対応する精霊の欠片1個になります。'
      )
    );

    rates.append(
      node('summary', '', '排出率を確認'),
      rateList
    );

    const results = node('div', 'gacha-results');
    results.id = 'gachaResults';
    results.setAttribute('aria-live', 'polite');

    gachaDialog.append(
      gachaHeader,
      coins,
      message,
      drawButtons,
      rates,
      node('h3', '', '抽選結果'),
      results
    );

    const itemDialog = document.createElement('dialog');
    itemDialog.id = 'itemDialog';

    const itemHeader = node('div', 'dialog-header');
    const closeItems = node('button', '', '閉じる');
    closeItems.id = 'closeItems';

    itemHeader.append(
      node('h2', '', '所持アイテム'),
      closeItems
    );

    const itemBoost = node('p', 'muted');
    itemBoost.id = 'itemBoost';

    const itemList = node('div', '');
    itemList.id = 'itemList';

    itemDialog.append(
      itemHeader,
      itemBoost,
      node(
        'p',
        'muted',
        '同じ種類の効果は上書きします。経験値とコインは併用可能です。' +
        '使用は戦闘開始前のみ。キャラの欠片交換は未実装です。'
      ),
      itemList
    );

    document.body.append(gachaDialog, itemDialog);

    openGacha.onclick = () => {
      if (busy || fatal || isActive()) {
        return;
      }

      lastGachaResults = [];
      renderExtraUI();
      gachaDialog.showModal();
    };

    closeGacha.onclick = () => {
      if (!busy) {
        gachaDialog.close();
      }
    };

    openItems.onclick = () => {
      if (busy || fatal) {
        return;
      }

      renderItems();
      itemDialog.showModal();
    };

    closeItems.onclick = () => {
      if (!busy) {
        itemDialog.close();
      }
    };

    single.onclick = () => drawGacha(1);
    eleven.onclick = () => drawGacha(11);

    for (const dialog of [gachaDialog, itemDialog]) {
      dialog.addEventListener('cancel', (event) => {
        if (busy) {
          event.preventDefault();
        }
      });
    }
  }

  function renderGachaResults() {
    const root = $('gachaResults');
    root.replaceChildren();

    if (lastGachaResults.length === 0) {
      root.append(
        node(
          'p',
          'muted',
          'この画面を開いてからの抽選結果を表示します。'
        )
      );

      return;
    }

    lastGachaResults.forEach((result, index) => {
      const card = node(
        'article',
        'gacha-result' + (result.isNew ? ' gacha-new' : '')
      );

      card.append(
        node('p', 'muted', (index + 1) + '. ' + result.category),
        node(
          'strong',
          '',
          result.name + (result.isNew ? '｜NEW' : '')
        ),
        node('p', 'muted', result.message)
      );

      root.append(card);
    });
  }

  function renderItems() {
    const root = $('itemList');
    root.replaceChildren();

    $('itemBoost').textContent =
      '次の勝利に適用：' + boostText();

    const owned = save.items.filter((entry) => {
      return entry.quantity > 0;
    });

    if (owned.length === 0) {
      root.append(
        node('p', 'muted', '所持アイテムはありません。')
      );

      return;
    }

    for (const item of owned) {
      const definition = itemDefinition(item.id);
      const panel = node('section', 'management-section');

      panel.append(
        node(
          'strong',
          '',
          itemLabel(item.id) + ' ×' + number(item.quantity)
        )
      );

      if (definition) {
        panel.append(
          node(
            'p',
            'muted',
            '次の勝利1回の獲得' +
            (definition.type === 'exp' ? '経験値' : 'コイン') +
            'を' +
            definition.multiplier +
            '倍にします。'
          )
        );

        const button = node('button', '', '1個使用');

        button.disabled = isActive() || busy || fatal;
        button.onclick = () => usePotion(item.id);

        panel.append(button);
      } else {
        panel.append(
          node(
            'p',
            'muted',
            'このアイテムの交換・使用機能は未実装です。'
          )
        );
      }

      root.append(panel);
    }
  }

  function renderExtraUI() {
    $('managementBoost').textContent =
      '次の勝利に適用：' + boostText();

    $('rewardBoostStatus').textContent =
      '報酬効果：' + boostText() + '｜次の勝利1回';

    $('gachaCoins').textContent = number(save.coins) + ' COIN';

    const noPool = characterPool().length === 0;

    $('openGacha').disabled = isActive() || busy || fatal;
    $('openItems').disabled = busy || fatal;
    $('closeGacha').disabled = busy || fatal;
    $('closeItems').disabled = busy || fatal;

    $('gachaSingle').disabled =
      isActive() ||
      busy ||
      fatal ||
      noPool ||
      save.coins < GACHA.singleCost;

    $('gachaEleven').disabled =
      isActive() ||
      busy ||
      fatal ||
      noPool ||
      save.coins < GACHA.elevenCost;

    $('gachaMessage').textContent = isActive()
      ? '戦闘中はガチャを利用できません。'
      : noPool
        ? 'キャラクターの抽選対象が未登録です。'
        : 'アイテム60％／キャラクター30％／精霊10％';

    renderGachaResults();
    renderItems();
  }

  // --------------------------------------------------
  // 画像・背景
  // --------------------------------------------------

  function placeholder(element, enemy) {
    const color = D.elements[element].color;

    const shape = enemy
      ? [
          '<path d="M35 44 L23 20 L42 30 L60 20 L78 30 L97 20 L85 44',
          ' L94 105 L76 123 L44 123 L26 105 Z"/>',
          '<path d="M43 65 L51 65 M69 65 L77 65"',
          ' stroke="#fff" stroke-width="5"/>'
        ].join('')
      : [
          '<circle cx="60" cy="34" r="20"/>',
          '<path d="M37 60 Q60 50 83 60 L98 132 L22 132 Z"/>'
        ].join('');

    const svg = [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 150">',
      '<g fill="' + color + '">',
      shape,
      '</g>',
      '</svg>'
    ].join('');

    return 'data:image/svg+xml;charset=utf-8,' +
      encodeURIComponent(svg);
  }

  function image(paths, element, className, alt, enemy) {
    const img = document.createElement('img');

    const sources = [
      ...new Set(paths.filter(Boolean)),
      placeholder(element, enemy)
    ];

    let index = 0;

    img.className = className;
    img.alt = alt;
    img.decoding = 'async';
    img.draggable = false;

    img.onerror = () => {
      index += 1;

      if (index < sources.length) {
        img.src = sources[index];
      } else {
        img.onerror = null;
      }
    };

    img.src = sources[0];

    return img;
  }

  function overlay(name, meta, hp, maxHp) {
    const panel = node('div', 'portrait-overlay');
    const bar = node('div', 'hp-bar');
    const fill = node('div', 'hp-fill');

    fill.style.width = Math.max(
      0,
      Math.min(100, hp / maxHp * 100)
    ) + '%';

    bar.append(fill);

    panel.append(
      node('div', 'overlay-name', name),
      node('div', 'overlay-meta', meta),
      bar,
      node(
        'div',
        'hp-text',
        number(hp) + ' / ' + number(maxHp)
      )
    );

    return panel;
  }

  function loadBackground(path) {
    if (backgroundCache.has(path)) {
      return backgroundCache.get(path);
    }

    const promise = new Promise((resolve) => {
      const img = new Image();

      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = path;
    });

    backgroundCache.set(path, promise);

    return promise;
  }

  function renderBackground(index) {
    const area = areaFor(index);
    const arena = $('arena');

    const path = area.background || '';
    const position = area.backgroundPosition || 'center';
    const key = path + '|' + position;

    if (arena.dataset.backgroundKey === key) {
      return;
    }

    arena.dataset.backgroundKey = key;

    const token = ++backgroundToken;

    arena.style.removeProperty('background-image');
    arena.style.removeProperty('background-position');

    if (!path) {
      return;
    }

    loadBackground(path).then((loaded) => {
      if (!loaded || token !== backgroundToken) {
        return;
      }

      arena.style.backgroundImage = [
        'linear-gradient(rgba(8,12,22,0.18), rgba(8,12,22,0.28))',
        'url("' + path + '")'
      ].join(', ');

      arena.style.backgroundPosition = position;
    });
  }

  // --------------------------------------------------
  // 全体画面更新
  // --------------------------------------------------

  function render() {
    if (!save) {
      return;
    }

    const battle = save.battle;

    const index = battle
      ? battle.index
      : Math.min(save.highestCleared + 1, maxStage);

    const info = stageInfo(index);
    const area = areaFor(index);

    $('coins').textContent = 'COIN ' + number(save.coins);

    $('stageLabel').textContent =
      stageName(index) + (info.boss ? ' B' : '');

    $('areaLabel').textContent = area.name;
    $('areaLabel').title = area.name;

    $('roundLabel').textContent = battle
      ? 'R ' + battle.round
      : save.highestCleared === maxStage
        ? 'CLEAR'
        : 'R —';

    // 全体ロックで無効化した固定ボタンを復元する。
    for (const id of [
      'openManagement',
      'closeManagement',
      'exportSave',
      'importSave',
      'cancelHeal',
      'openCollection',
      'openFormation',
      'closeCollection',
      'closeFormation'
    ]) {
      $(id).disabled = false;
    }

    renderBackground(index);
    renderEnemies();
    renderParty();
    renderCommands();
    renderResult();
    renderManagement();

    C.render();

    // 戦闘の加護は、開始時に確定した値を表示する。
    if (battle) {
      $('blessingStatus').textContent = battle.blessing
        ? battle.blessing.name + '｜' + battle.blessing.text
        : 'この戦闘の精霊加護：なし';
    }

    renderExtraUI();
    U.render();

    // collection.js側の編成保存ボタンを復元する。
    const formationSelects =
      $('formationCharacters').querySelectorAll('select');

    const ids = Array.from(formationSelects, (select) => {
      return select.value;
    });

    $('saveFormation').disabled =
      isActive() ||
      ids.length !== 4 ||
      new Set(ids).size !== 4;

    $('log').replaceChildren();

    for (const line of battle?.log || []) {
      $('log').append(node('div', '', line));
    }

    $('log').scrollTop = $('log').scrollHeight;

    if (fatal || busy) {
      lockInput(true);
    }
  }

  function renderEnemies() {
    const battle = save.battle;

    $('enemies').replaceChildren();
    $('emptyArena').hidden = !!battle;
    $('warning').textContent = '';

    if (!battle) {
      return;
    }

    const boss = stageInfo(battle.index).boss;
    const warnings = [];

    if (isActive() && boss) {
      if (battle.round % 6 === 0) {
        warnings.push('全体攻撃の予兆！ 防御で備えよう');
      } else if (battle.round % 3 === 0) {
        warnings.push('強打の予兆！ 防御・かばうが有効');
      }

      if (
        battle.enemies.some((enemy) => {
          return enemy.hp > 0 && enemy.hp <= enemy.maxHp / 2;
        })
      ) {
        warnings.push('ボス激昂');
      }
    }

    $('warning').textContent = warnings.join(' / ');

    if (!(battle.enemies[selectedEnemy]?.hp > 0)) {
      selectedEnemy = Math.max(
        0,
        battle.enemies.findIndex((enemy) => enemy.hp > 0)
      );
    }

    battle.enemies.forEach((enemy, index) => {
      const definition = enemies.get(enemy.id);

      const classes = [
        'enemy',
        selectedEnemy === index ? 'selected' : '',
        enemy.hp <= 0 ? 'dead' : ''
      ].filter(Boolean).join(' ');

      const button = node('button', classes);
      const frame = node('div', 'portrait-frame');

      button.disabled = !isActive() || enemy.hp <= 0;
      button.title = enemy.name;

      button.setAttribute(
        'aria-pressed',
        String(selectedEnemy === index)
      );

      button.setAttribute(
        'aria-label',
        enemy.name +
        ' HP ' +
        enemy.hp +
        '/' +
        enemy.maxHp
      );

      frame.append(
        image(
          [definition.image],
          enemy.element,
          'enemy-image',
          enemy.name,
          true
        ),
        overlay(
          enemy.name,
          D.elements[enemy.element].name +
          (boss ? ' / BOSS' : ''),
          enemy.hp,
          enemy.maxHp
        )
      );

      button.append(frame);

      button.onclick = () => {
        if (!fatal && !busy) {
          selectedEnemy = index;
          renderEnemies();
        }
      };

      $('enemies').append(button);
    });
  }

  function renderParty() {
    $('party').replaceChildren();

    save.party.forEach((member, index) => {
      const definition = characters.get(member.id);
      const value = stats(member);
      const ally = save.battle?.allies[index];

      const hp = ally ? ally.hp : value.hp;
      const maxHp = ally ? ally.maxHp : value.hp;

      const classes = [
        'character',
        isActive() && save.battle.actor === index
          ? 'active'
          : '',
        hp <= 0 ? 'dead' : '',
        pendingHeal !== null && hp > 0
          ? 'heal-target'
          : ''
      ].filter(Boolean).join(' ');

      const button = node('button', classes);
      const frame = node('div', 'portrait-frame');

      button.setAttribute(
        'aria-label',
        definition.name +
        ' R' +
        member.rank +
        ' Lv.' +
        member.level +
        ' HP ' +
        hp +
        '/' +
        maxHp
      );

      frame.append(
        image(
          definition.portraits.slice(0, member.rank).reverse(),
          definition.element,
          'character-image',
          definition.name,
          false
        ),
        overlay(
          definition.name,
          D.elements[definition.element].name +
          ' / R' +
          member.rank +
          ' Lv.' +
          member.level,
          hp,
          maxHp
        )
      );

      button.append(frame);

      button.onclick = () => {
        if (
          pendingHeal !== null &&
          hp > 0 &&
          isActive() &&
          !fatal &&
          !busy
        ) {
          const slot = pendingHeal;

          transact(() => {
            performAction('skill', slot, index);
          });
        }
      };

      $('party').append(button);
    });
  }

  function renderCommands() {
    $('commands').hidden = !isActive();
    $('skills').replaceChildren();
    $('cancelHeal').hidden = pendingHeal === null;

    if (!isActive()) {
      return;
    }

    const actor = save.battle.allies[save.battle.actor];
    const definition = characters.get(actor.id);

    $('turnLabel').textContent = pendingHeal !== null
      ? '回復する味方をタップ'
      : definition.name + 'の行動 / R' + actor.rank;

    $('attack').disabled = pendingHeal !== null;
    $('defend').disabled = pendingHeal !== null;

    definition.skills.forEach((id, slot) => {
      const skill = skillFor(id, actor.rank);
      const used = actor.usedSkills[slot];
      const cooldown = actor.cooldowns[slot];

      const button = node('button', 'skill');

      button.disabled =
        used ||
        cooldown > 0 ||
        pendingHeal !== null;

      button.append(
        node(
          'span',
          'skill-name',
          (slot + 1) + '. ' + skill.name
        ),
        node(
          'span',
          'skill-description',
          used
            ? 'この手番で使用済み'
            : cooldown > 0
              ? '再使用まで ' + cooldown + '手番'
              : skillDescription(skill)
        )
      );

      button.onclick = () => {
        if (fatal || busy) {
          return;
        }

        if (skill.type === 'heal') {
          pendingHeal = slot;
          renderParty();
          renderCommands();
        } else {
          transact(() => performAction('skill', slot));
        }
      };

      $('skills').append(button);
    });
  }

  function renderResult() {
    const root = $('result');

    root.replaceChildren();
    root.hidden = isActive();

    if (isActive()) {
      return;
    }

    const battle = save.battle;

    const title = !battle
      ? save.highestCleared === maxStage
        ? '全ステージ突破済み'
        : '塔へ挑戦'
      : battle.state === 'won'
        ? battle.index === maxStage
          ? 'TOWER CLEAR'
          : 'VICTORY'
        : 'DEFEAT';

    root.append(node('div', 'result-title', title));

    if (battle?.rewards) {
      const reward = battle.rewards;

      root.append(
        node(
          'p',
          '',
          'EXP +' +
          number(reward.exp) +
          ' / COIN +' +
          number(reward.coins)
        )
      );

      if (
        reward.expMultiplier > 1 ||
        reward.coinMultiplier > 1
      ) {
        root.append(
          node(
            'p',
            'muted',
            '適用倍率：経験値×' +
            reward.expMultiplier +
            '／コイン×' +
            reward.coinMultiplier
          )
        );
      }

      for (const text of reward.levelUps) {
        root.append(node('div', 'muted', text));
      }
    }

    if (
      save.party.some((member) => {
        return member.level === D.rules.maxLevel &&
          member.rank < D.rules.maxRank;
      })
    ) {
      root.append(
        node(
          'p',
          'muted',
          '転生可能な仲間がいます。管理で確認できます。'
        )
      );
    }

    const buttons = node('div', 'result-buttons');

    function addButton(label, index, primary) {
      const button = node(
        'button',
        primary ? 'primary' : '',
        label
      );

      button.onclick = () => transact(() => startBattle(index));
      buttons.append(button);
    }

    if (!battle) {
      addButton(
        save.highestCleared === maxStage
          ? '最終ステージに再挑戦'
          : '挑戦する',
        Math.min(save.highestCleared + 1, maxStage),
        true
      );
    } else {
      if (battle.state === 'won' && battle.index < maxStage) {
        addButton('次のステージへ', battle.index + 1, true);
      }

      addButton(
        '同じステージに挑戦',
        battle.index,
        false
      );
    }

    root.append(buttons);
  }

  // --------------------------------------------------
  // 管理画面
  // --------------------------------------------------

  function renderManagement() {
    $('progressText').textContent =
      '突破 ' +
      save.highestCleared +
      '/' +
      maxStage +
      'ステージ・' +
      Math.floor(
        save.highestCleared / D.rules.stagesPerFloor
      ) +
      '/' +
      D.rules.floors +
      '階';

    $('coinText').textContent =
      number(save.coins) + ' COIN';

    const available = Math.min(
      save.highestCleared + 1,
      maxStage
    );

    const maxFloor = stageInfo(available).floor;

    const previous = Number($('floorSelect').value) ||
      stageInfo(save.selectedStage).floor;

    $('floorSelect').replaceChildren();

    for (let floor = 1; floor <= maxFloor; floor += 1) {
      const first =
        (floor - 1) * D.rules.stagesPerFloor + 1;

      const option = node(
        'option',
        '',
        floor + '階／' + areaFor(first).name
      );

      option.value = floor;
      $('floorSelect').append(option);
    }

    $('floorSelect').value = Math.min(previous, maxFloor);

    populateStages();

    $('startSelected').disabled = isActive();
    $('retreat').disabled = !isActive();

    $('members').replaceChildren();

    for (const member of save.party) {
      const definition = characters.get(member.id);
      const value = stats(member);

      const blessedAtk = C.attackWithBlessing(
        save,
        member.id,
        value.atk
      );

      const panel = node('div', 'member-panel');

      panel.append(
        node(
          'strong',
          '',
          definition.name +
          '／' +
          definition.jobs[member.rank - 1]
        ),
        node(
          'p',
          'muted',
          'R' +
          member.rank +
          ' Lv.' +
          member.level +
          '／HP ' +
          number(value.hp) +
          ' ATK ' +
          number(value.atk) +
          ' DEF ' +
          number(value.def)
        ),
        node(
          'p',
          'muted',
          '精霊加護適用後ATK：' + number(blessedAtk)
        ),
        node(
          'p',
          'muted',
          member.level === D.rules.maxLevel
            ? '最大レベル'
            : 'EXP ' +
              number(member.exp) +
              '/' +
              number(neededExp(member.level))
        )
      );

      for (const id of definition.skills) {
        const skill = skillFor(id, member.rank);

        panel.append(
          node(
            'p',
            'muted',
            skill.name + '：' + skillDescription(skill)
          )
        );
      }

      const button = node(
        'button',
        '',
        member.rank >= D.rules.maxRank
          ? '最大ランク'
          : '転生する'
      );

      button.disabled =
        isActive() ||
        member.level !== D.rules.maxLevel ||
        member.rank >= D.rules.maxRank;

      button.onclick = () => {
        if (
          fatal ||
          busy ||
          member.rank >= D.rules.maxRank
        ) {
          return;
        }

        const nextRank = member.rank + 1;

        const after = stats({
          id: member.id,
          rank: nextRank,
          level: 1
        });

        const message = [
          definition.name + 'を転生しますか？',
          'R' + member.rank + ' → R' + nextRank,
          definition.jobs[nextRank - 1],
          'レベルは1に戻ります。',
          '',
          'HP ' + value.hp + ' → ' + after.hp,
          'ATK ' + value.atk + ' → ' + after.atk,
          'DEF ' + value.def + ' → ' + after.def,
          '',
          '上記は精霊加護を含まない数値です。',
          'コイン・突破状況・ポーション効果は維持します。'
        ].join('\n');

        if (confirm(message)) {
          transact(() => reincarnate(member.id));
        }
      };

      panel.append(button);
      $('members').append(panel);
    }
  }

  function populateStages() {
    const floor = Number($('floorSelect').value);
    const count = D.rules.stagesPerFloor;

    const available = Math.min(
      save.highestCleared + 1,
      maxStage
    );

    const max = Math.min(
      count,
      available - (floor - 1) * count
    );

    const selected = stageInfo(save.selectedStage);

    const previous = Number($('stageSelect').value) ||
      (selected.floor === floor ? selected.stage : 1);

    $('stageSelect').replaceChildren();

    for (let stage = 1; stage <= max; stage += 1) {
      const option = node(
        'option',
        '',
        stage + (stage === count ? '［ボス］' : '［通常］')
      );

      option.value = stage;
      $('stageSelect').append(option);
    }

    $('stageSelect').value = Math.min(previous, max);

    renderPreview();
  }

  function selectedIndex() {
    return (
      Number($('floorSelect').value) - 1
    ) * D.rules.stagesPerFloor +
      Number($('stageSelect').value);
  }

  function renderPreview() {
    const index = selectedIndex();

    if (!index) {
      return;
    }

    const names = encounterIds(index).map((id) => {
      return enemies.get(id).name;
    });

    const reward = rewardFor(index);

    $('encounterPreview').textContent =
      areaFor(index).name +
      '／' +
      names.join('・') +
      '／EXP ' +
      number(reward.exp * save.rewardBoosts.exp) +
      '／COIN ' +
      number(reward.coins * save.rewardBoosts.coins);
  }

  // --------------------------------------------------
  // バックアップ
  // --------------------------------------------------

  function exportSave() {
    if (!save || busy) {
      return;
    }

    const blob = new Blob(
      [JSON.stringify(save, null, 2)],
      { type: 'application/json' }
    );

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;

    link.download = 'towerquest-spirit-upgrade-' +
      new Date().toISOString().slice(0, 10) +
      '.json';

    document.body.append(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function importSave(file) {
    if (!file || fatal || busy) {
      return;
    }

    try {
      if (file.size > 2000000) {
        throw new Error('ファイルが大きすぎます。');
      }

      const result = normalizeSave(
        JSON.parse(await file.text())
      );

      if (busy || fatal) {
        return;
      }

      const message = [
        '現在の進行を置き換えます。',
        '必要なら先にバックアップしてください。',
        '',
        'コイン：' + number(result.value.coins),
        '突破済み：' +
          result.value.highestCleared +
          '/' +
          maxStage,
        '所持キャラ：' +
          result.value.ownedCharacters.length +
          '人',
        '所持精霊：' +
          result.value.ownedSpirits.length +
          '体',
        '報酬効果：経験値×' +
          result.value.rewardBoosts.exp +
          '／コイン×' +
          result.value.rewardBoosts.coins,
        result.migrated
          ? '旧セーブを新仕様へ移行します。'
          : '',
        result.itemsMigrated
          ? 'アイテム仕様を更新します。'
          : '',
        result.battleReset
          ? '旧戦闘途中データは解除します。'
          : '',
        '',
        '読み込みますか？'
      ].filter(Boolean).join('\n');

      if (!confirm(message)) {
        return;
      }

      const success = await transact(() => {
        save = result.value;
        selectedEnemy = 0;
      });

      if (success) {
        lastGachaResults = [];

        for (const id of [
          'formationDialog',
          'collectionDialog',
          'gachaDialog',
          'itemDialog',
          'spiritUpgradeDialog'
        ]) {
          $(id).close();
        }

        renderExtraUI();
        U.render();
      }
    } catch (error) {
      status('読み込みエラー：' + error.message);
    } finally {
      $('saveFile').value = '';
    }
  }

  // --------------------------------------------------
  // 戦闘演出
  // --------------------------------------------------

  function fxTarget(side, index) {
    const root = side === 'ally'
      ? $('party')
      : $('enemies');

    return root.children[index] || null;
  }

  function reducedMotion() {
    return window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;
  }

  async function animate(element, frames, duration) {
    if (!element || typeof element.animate !== 'function') {
      return;
    }

    const animation = element.animate(frames, {
      duration: reducedMotion()
        ? Math.min(duration, 100)
        : duration,
      easing: 'ease-out',
      fill: 'none'
    });

    try {
      await animation.finished;
    } catch (error) {
      // 演出が中断されても、保存済みの進行は維持する。
    } finally {
      animation.cancel();
    }
  }

  async function attackMove(element, side) {
    if (!element) {
      return;
    }

    element.classList.add('is-performing');

    try {
      const distance = reducedMotion()
        ? 0
        : side === 'enemy'
          ? 28
          : -36;

      await animate(
        element,
        [
          {
            transform: 'translateY(0)'
          },
          {
            transform: 'translateY(' + distance + 'px)',
            offset: 0.45
          },
          {
            transform: 'translateY(0)'
          }
        ],
        300
      );
    } finally {
      element.classList.remove('is-performing');
    }
  }

  async function shake(element) {
    const distance = reducedMotion() ? 0 : 6;

    await animate(
      element,
      [
        {
          transform: 'translateX(0)'
        },
        {
          transform: 'translateX(-' + distance + 'px)'
        },
        {
          transform: 'translateX(' + distance + 'px)'
        },
        {
          transform: 'translateX(-' + distance + 'px)'
        },
        {
          transform: 'translateX(' + distance + 'px)'
        },
        {
          transform: 'translateX(0)'
        }
      ],
      240
    );
  }

  async function showNumber(element, amount, healing) {
    if (!element) {
      return;
    }

    const label = node(
      'div',
      'battle-number' + (healing ? ' healing' : ''),
      (healing ? '+' : '') + number(amount)
    );

    element.append(label);

    try {
      await animate(
        label,
        [
          {
            opacity: 0,
            transform: 'translate(-50%, 8px)'
          },
          {
            opacity: 1,
            transform: 'translate(-50%, -4px)',
            offset: 0.25
          },
          {
            opacity: 0,
            transform: 'translate(-50%, -30px)'
          }
        ],
        450
      );
    } finally {
      label.remove();
    }
  }

  async function attributeEffect(element, elementId, mode) {
    if (!element) {
      return;
    }

    const color = mode === 'heal'
      ? '#86efb7'
      : D.elements[elementId]?.color || '#ffffff';

    const effect = node(
      'div',
      'battle-effect effect-' +
      elementId +
      ' effect-' +
      mode
    );

    effect.style.setProperty('--effect-color', color);

    const ring = node('div', 'effect-ring');
    const core = node('div', 'effect-core');

    effect.append(ring, core);
    element.append(effect);

    const jobs = [
      animate(
        ring,
        [
          {
            opacity: 0,
            transform: 'translate(-50%, -50%) scale(0.35)'
          },
          {
            opacity: 0.95,
            transform: 'translate(-50%, -50%) scale(0.85)',
            offset: 0.35
          },
          {
            opacity: 0,
            transform: 'translate(-50%, -50%) scale(1.45)'
          }
        ],
        380
      )
    ];

    const coreTransform = mode === 'strike'
      ? 'translate(-50%, -50%) rotate(-35deg)'
      : 'translate(-50%, -50%)';

    jobs.push(
      animate(
        core,
        [
          {
            opacity: 0,
            transform: coreTransform + ' scale(0.5)'
          },
          {
            opacity: 0.85,
            transform: coreTransform + ' scale(1)',
            offset: 0.35
          },
          {
            opacity: 0,
            transform: coreTransform + ' scale(1.3)'
          }
        ],
        320
      )
    );

    const count = reducedMotion() ? 4 : 8;

    for (let i = 0; i < count; i += 1) {
      const particle = node('div', 'effect-particle');
      effect.append(particle);

      const angle = Math.PI * 2 * i / count;
      const distance = mode === 'heal' ? 28 : 38;

      const x = Math.cos(angle) * distance;

      const y = mode === 'heal'
        ? -20 - Math.abs(Math.sin(angle) * distance)
        : Math.sin(angle) * distance;

      jobs.push(
        animate(
          particle,
          [
            {
              opacity: 0,
              transform: 'translate(-50%, -50%) scale(0.3)'
            },
            {
              opacity: 1,
              offset: 0.2
            },
            {
              opacity: 0,
              transform:
                'translate(calc(-50% + ' +
                x +
                'px), calc(-50% + ' +
                y +
                'px)) scale(0.8)'
            }
          ],
          420
        )
      );
    }

    try {
      await Promise.all(jobs);
    } finally {
      effect.remove();
    }
  }

  async function playFxQueue() {
    for (const event of fxQueue) {
      if (fatal) {
        break;
      }

      const target = fxTarget(event.side, event.index);

      if (event.kind === 'move') {
        await attackMove(target, event.side);
      } else if (event.kind === 'damage') {
        await Promise.all([
          shake(target),
          showNumber(target, event.amount, false),
          attributeEffect(
            target,
            event.element,
            event.skill ? 'attack' : 'strike'
          )
        ]);
      } else if (event.kind === 'heal') {
        await Promise.all([
          showNumber(target, event.amount, true),
          attributeEffect(target, event.element, 'heal')
        ]);
      } else if (
        event.kind === 'cast' ||
        event.kind === 'enhance'
      ) {
        await attributeEffect(
          target,
          event.element,
          'enhance'
        );
      } else if (event.kind === 'debuff') {
        await attributeEffect(
          target,
          event.element,
          'attack'
        );
      }
    }
  }

  // --------------------------------------------------
  // イベント
  // --------------------------------------------------

  function bindEvents() {
    $('openManagement').onclick = () => {
      if (!fatal && !busy && save) {
        renderManagement();
        C.render();
        renderExtraUI();
        U.render();

        $('management').showModal();
      }
    };

    $('closeManagement').onclick = () => {
      if (!busy) {
        $('management').close();
      }
    };

    $('floorSelect').onchange = () => {
      if (!fatal && !busy) {
        populateStages();
      }
    };

    $('stageSelect').onchange = () => {
      if (!fatal && !busy) {
        renderPreview();
      }
    };

    $('startSelected').onclick = async () => {
      const index = selectedIndex();

      if (await transact(() => startBattle(index))) {
        $('management').close();
      }
    };

    $('retreat').onclick = () => {
      if (
        !busy &&
        !fatal &&
        isActive() &&
        confirm(
          '撤退しますか？ 報酬は獲得できません。' +
          'ポーション効果は維持されます。'
        )
      ) {
        transact(() => {
          save.battle = null;
        });
      }
    };

    $('attack').onclick = () => {
      transact(() => performAction('attack'));
    };

    $('defend').onclick = () => {
      transact(() => performAction('defend'));
    };

    $('cancelHeal').onclick = () => {
      if (!fatal && !busy) {
        pendingHeal = null;
        renderParty();
        renderCommands();
      }
    };

    $('exportSave').onclick = exportSave;

    $('importSave').onclick = () => {
      if (!fatal && !busy) {
        $('saveFile').click();
      }
    };

    $('saveFile').onchange = (event) => {
      importSave(event.target.files[0]);
    };

    document.querySelectorAll('dialog').forEach((dialog) => {
      dialog.addEventListener('cancel', (event) => {
        if (busy) {
          event.preventDefault();
        }
      });
    });

    window.addEventListener('storage', (event) => {
      if (
        event.storageArea !== localStorage ||
        (event.key !== SAVE_KEY && event.key !== null)
      ) {
        return;
      }

      fatal = true;
      lockInput(true);

      status(
        '別タブで保存データが変わりました。再読み込みしてください。'
      );
    });
  }

  bindEvents();
  boot();
})();
