// File: game.js

'use strict';

(() => {
  const D = window.TQ_DATA;
  const SAVE_KEY = 'towerquest.pages.save.v1';
  const OLD_BACKUP_KEY = 'towerquest.pages.pre-rank3.backup';
  const SCHEMA_VERSION = 2;

  const $ = (id) => document.getElementById(id);
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const number = (value) => Number(value).toLocaleString('ja-JP');

  let save = null;
  let busy = false;
  let fatal = false;
  let pendingHeal = null;
  let selectedEnemy = 0;

  let MAX_STAGE = 0;
  let characters = new Map();
  let enemies = new Map();
  let skills = new Map();

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

  function rankDefinition(rank) {
    const result = D.rankDefinitions.find((item) => {
      return item.rank === rank;
    });

    if (!result) {
      throw new Error('ランク定義がありません。');
    }

    return result;
  }

  function skillFor(id, rank) {
    const base = skills.get(id);
    const variant = base && base.variants[rank - 1];

    if (!base || !variant) {
      throw new Error('ランク別スキル定義がありません。');
    }

    return {
      ...base,
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
          '％として計算'
        : '';

      return target +
        'ATK×' +
        skill.power +
        hits +
        defense;
    }

    if (skill.type === 'heal') {
      return '生存中の味方1人をATK×' +
        skill.power +
        '回復';
    }

    if (skill.type === 'buff') {
      return 'この手番の通常攻撃ダメージ×' +
        skill.power;
    }

    if (skill.type === 'weaken') {
      return '次の敵フェーズの敵ATKを' +
        Math.round((1 - skill.power) * 100) +
        '％低下';
    }

    if (skill.type === 'mark') {
      return '敵が次に受ける1発のダメージ×' +
        skill.power;
    }

    if (skill.type === 'cover') {
      const reduction = Math.round(skill.reduction * 100);

      return '次の自分の手番まで単体攻撃をかばう' +
        (
          reduction
            ? '。単体被ダメージ' + reduction + '％軽減'
            : ''
        );
    }

    return '';
  }

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

  function areaFor(floor) {
    const area = D.areas.find((item) => {
      return floor >= item.from && floor <= item.to;
    });

    if (!area) {
      throw new Error('エリア定義がありません。');
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
        ) *
        (boss ? config.bossExpMultiplier : 1)
      ),
      coins: Math.floor(
        (
          config.coinBase +
          config.coinPerStage * index
        ) *
        (boss ? config.bossCoinMultiplier : 1)
      )
    };
  }

  function grantExp(member, amount) {
    if (member.level >= D.rules.maxLevel) {
      member.exp = 0;
      return;
    }

    member.exp += amount;

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

  function freshSave() {
    return {
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
    };
  }

  function validateParty(raw, oldRankSystem) {
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
        throw new Error('キャラクターが不正です。');
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
        oldRankSystem ? 5 : D.rules.maxRank,
        'ランク'
      );

      if (oldRankSystem) {
        // 旧1→新1、旧2・3→新2、旧4・5→新3。
        rank = 1 + Math.ceil((rank - 1) / 2);
      }

      const exp = integer(
        member.exp,
        0,
        Number.MAX_SAFE_INTEGER,
        '経験値'
      );

      if (
        (
          level === D.rules.maxLevel &&
          exp !== 0
        ) ||
        (
          level < D.rules.maxLevel &&
          exp >= neededExp(level)
        )
      ) {
        throw new Error('経験値とレベルが一致しません。');
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

  function validateBattle(raw, party, highestCleared) {
    if (!raw) {
      return null;
    }

    if (raw.version !== D.battleVersion) {
      return null;
    }

    if (!['active', 'won', 'lost'].includes(raw.state)) {
      throw new Error('戦闘状態が不正です。');
    }

    const index = integer(
      raw.index,
      1,
      MAX_STAGE,
      '戦闘ステージ'
    );

    if (index > Math.min(highestCleared + 1, MAX_STAGE)) {
      throw new Error('未解放ステージの戦闘です。');
    }

    integer(raw.round, 1, 1000000, 'ラウンド');
    integer(raw.actor, 0, party.length - 1, '行動者');

    if (
      !Array.isArray(raw.allies) ||
      raw.allies.length !== party.length ||
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
        throw new Error('味方の効果状態が不正です。');
      }

      ally.cooldowns.forEach((value) => {
        integer(value, 0, 1000, 'スキル待ち時間');
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

    const enemiesAlive = battle.enemies.some((enemy) => {
      return enemy.hp > 0;
    });

    const alliesAlive = battle.allies.some((ally) => {
      return ally.hp > 0;
    });

    if (battle.state === 'active') {
      if (
        !enemiesAlive ||
        !alliesAlive ||
        battle.allies[battle.actor].hp <= 0
      ) {
        throw new Error('進行中の戦闘が不正です。');
      }
    }

    if (battle.state === 'lost' && alliesAlive) {
      throw new Error('敗北状態が不正です。');
    }

    if (battle.state === 'won') {
      if (
        enemiesAlive ||
        !alliesAlive ||
        highestCleared < index ||
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
        levelUps: Array.isArray(raw.rewards.levelUps)
          ? raw.rewards.levelUps.map((text) => {
              return String(text).slice(0, 100);
            })
          : []
      };
    }

    return battle;
  }

  function normalizeSave(raw) {
    if (!raw || typeof raw !== 'object') {
      throw new Error('セーブデータが不正です。');
    }

    const gasSave = raw.game !== 'towerquest-pages' &&
      Array.isArray(raw.party) &&
      raw.clearedFloor !== undefined;

    const oldPages = raw.game === 'towerquest-pages' &&
      raw.schemaVersion === 1;

    const newPages = raw.game === 'towerquest-pages' &&
      raw.schemaVersion === SCHEMA_VERSION;

    if (!gasSave && !oldPages && !newPages) {
      throw new Error('対応していないセーブ形式です。');
    }

    const migrated = gasSave || oldPages;
    const party = validateParty(raw.party, migrated);

    const highestCleared = gasSave
      ? integer(
          raw.clearedFloor,
          0,
          D.rules.floors,
          '突破階層'
        ) * D.rules.stagesPerFloor
      : integer(
          raw.highestCleared,
          0,
          MAX_STAGE,
          '突破ステージ'
        );

    const selectedStage = gasSave
      ? Math.min(highestCleared + 1, MAX_STAGE)
      : integer(
          raw.selectedStage,
          1,
          MAX_STAGE,
          '選択ステージ'
        );

    if (selectedStage > Math.min(highestCleared + 1, MAX_STAGE)) {
      throw new Error('選択ステージが未解放です。');
    }

    const battleReset = !!raw.battle && (
      migrated ||
      raw.battle.version !== D.battleVersion
    );

    return {
      migrated,
      battleReset,
      value: {
        game: 'towerquest-pages',
        schemaVersion: SCHEMA_VERSION,
        revision: gasSave
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
        highestCleared,
        selectedStage,
        party,
        battle: migrated
          ? null
          : validateBattle(raw.battle, party, highestCleared),
        updatedAt: new Date().toISOString()
      }
    };
  }

  function persist() {
    save.updatedAt = new Date().toISOString();

    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify(save)
    );
  }

  function validateMaster() {
    if (
      !D ||
      !D.rules ||
      !Array.isArray(D.rankDefinitions) ||
      !Array.isArray(D.characters) ||
      !Array.isArray(D.enemies) ||
      !Array.isArray(D.skills) ||
      !Array.isArray(D.initialParty) ||
      !Array.isArray(D.areas) ||
      !Array.isArray(D.encounters) ||
      !D.balance
    ) {
      throw new Error('data.jsを正しく読み込めません。');
    }

    integer(D.rules.floors, 1, 1000, '階層数');
    integer(D.rules.stagesPerFloor, 1, 100, 'ステージ数');
    integer(D.rules.maxLevel, 1, 999, '最大レベル');

    integer(
      D.rules.maxRank,
      1,
      D.rankDefinitions.length,
      '最大ランク'
    );

    integer(D.battleVersion, 1, 1000000, '戦闘バージョン');

    MAX_STAGE = D.rules.floors * D.rules.stagesPerFloor;

    characters = new Map(
      D.characters.map((item) => [item.id, item])
    );

    enemies = new Map(
      D.enemies.map((item) => [item.id, item])
    );

    skills = new Map(
      D.skills.map((item) => [item.id, item])
    );

    if (
      characters.size !== D.characters.length ||
      enemies.size !== D.enemies.length ||
      skills.size !== D.skills.length
    ) {
      throw new Error('マスターに重複したIDがあります。');
    }

    if (
      D.initialParty.length !== 4 ||
      new Set(D.initialParty).size !== 4
    ) {
      throw new Error('初期パーティは異なる4人を設定してください。');
    }

    for (let rank = 1; rank <= D.rules.maxRank; rank += 1) {
      finite(
        rankDefinition(rank).statMultiplier,
        1,
        1000000,
        'ランク倍率'
      );
    }

    for (const id of D.initialParty) {
      const character = characters.get(id);

      if (!character || !D.elements[character.element]) {
        throw new Error('初期キャラクターの定義が不正です。');
      }

      if (
        !Array.isArray(character.jobs) ||
        character.jobs.length < D.rules.maxRank ||
        !Array.isArray(character.portraits) ||
        !Array.isArray(character.skills) ||
        character.skills.length !== 3
      ) {
        throw new Error('キャラクターのランク別設定が不足しています。');
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

      for (const skillId of character.skills) {
        for (let rank = 1; rank <= D.rules.maxRank; rank += 1) {
          const skill = skillFor(skillId, rank);

          integer(skill.cooldown, 1, 1000, '待ち時間');

          if (skill.type === 'cover') {
            finite(skill.reduction, 0, 0.95, 'かばう軽減');
          } else if (skill.type === 'weaken') {
            finite(skill.power, 0.05, 1, '弱体化倍率');
          } else {
            finite(skill.power, 0.01, 100, 'スキル倍率');
          }

          if (skill.hits !== undefined) {
            integer(skill.hits, 1, 20, '攻撃回数');
          }

          if (skill.defenseScale !== undefined) {
            finite(skill.defenseScale, 0, 1, '防御参照倍率');
          }
        }
      }
    }

    for (let floor = 1; floor <= D.rules.floors; floor += 1) {
      areaFor(floor);

      const encounter = D.encounters.find((item) => {
        return floor >= item.from && floor <= item.to;
      });

      const rounds = D.balance.roundTargets.find((item) => {
        return floor >= item.from && floor <= item.to;
      });

      if (
        !encounter ||
        !Array.isArray(encounter.normal) ||
        !encounter.normal.length ||
        !Array.isArray(encounter.bosses) ||
        !encounter.bosses.length ||
        !rounds
      ) {
        throw new Error('階層の出現設定またはバランス設定が不足しています。');
      }

      for (const id of [
        ...encounter.normal,
        ...encounter.bosses
      ]) {
        if (!enemies.has(id)) {
          throw new Error('出現する敵の定義がありません：' + id);
        }
      }
    }
  }

  function boot() {
    try {
      validateMaster();

      const rawText = localStorage.getItem(SAVE_KEY);
      let message = 'このブラウザに自動保存します';

      if (rawText) {
        const result = normalizeSave(JSON.parse(rawText));
        save = result.value;

        if (result.migrated) {
          if (!localStorage.getItem(OLD_BACKUP_KEY)) {
            localStorage.setItem(
              OLD_BACKUP_KEY,
              rawText
            );
          }

          save.revision += 1;
          persist();

          message = '旧セーブを最大ランク3の仕様へ移行しました';
        } else if (result.battleReset) {
          save.revision += 1;
          persist();

          message = '戦闘仕様の更新に伴い、戦闘途中の状態を解除しました';
        }
      } else {
        save = freshSave();
        persist();
     // File: game.js

function renderArenaBackground(floor) {
  const backgrounds = [
    {
      from: 1,
      to: 10,
      image: './assets/backgrounds/s001.png',
      position: 'center 58%'
    }

    // 他のエリアの背景を用意したら、
    // この配列へ設定を追加する。
  ];

  const config = backgrounds.find((item) => {
    return floor >= item.from && floor <= item.to;
  });

  const arena = $('emptyArena').closest('.arena');

  if (!config) {
    // 未登録エリアではCSSの代替背景を使用する。
    arena.style.removeProperty('background-image');
    arena.style.removeProperty('background-position');
    return;
  }

  // 薄い暗色レイヤーで、敵と文字を見やすくする。
  // 画像が読み込めなくても背景色は残る。
  arena.style.backgroundImage = [
    'linear-gradient(rgba(8, 12, 22, 0.18), rgba(8, 12, 22, 0.28))',
    'url("' + config.image + '")'
  ].join(', ');

  arena.style.backgroundPosition = config.position;
} }

      render();
      status(message);
    } catch (error) {
      fatal = true;
      $('openManagement').disabled = true;

      $('result').textContent =
        '起動できませんでした。保存データは自動で削除していません。';

      status('起動エラー：' + error.message);
    }
  }

  function checkRevision() {
    const raw = localStorage.getItem(SAVE_KEY);

    if (!raw) {
      throw new Error('保存データがありません。再読み込みしてください。');
    }

    const disk = JSON.parse(raw);

    if (disk.revision !== save.revision) {
      throw new Error(
        '別タブで進行が変更されました。再読み込みしてください。'
      );
    }
  }

  function transact(action) {
    if (busy || fatal || !save) {
      return false;
    }

    const previous = clone(save);
    busy = true;
    let success = false;
    let errorMessage = '';

    try {
      checkRevision();
      action();

      save.revision = previous.revision + 1;
      persist();

      pendingHeal = null;
      success = true;
    } catch (error) {
      save = previous;
      errorMessage = error.message;
    } finally {
      busy = false;
    }

    render();

    if (success) {
      status('保存済み');
    } else {
      status('操作を確定できませんでした：' + errorMessage);
    }

    return success;
  }

  function isActive() {
    return !!save &&
      !!save.battle &&
      save.battle.state === 'active';
  }

  function referenceMember(index) {
    const member = {
      id: 'leon',
      level: 1,
      rank: 1,
      exp: 0
    };

    for (let stage = 1; stage < index; stage += 1) {
      grantExp(member, rewardFor(stage).exp);

      const threshold =
        D.balance.reincarnateAfterStage[member.rank - 1];

      if (
        member.rank < D.rules.maxRank &&
        member.level === D.rules.maxLevel &&
        threshold !== undefined &&
        stage >= threshold
      ) {
        member.rank += 1;
        member.level = 1;
        member.exp = 0;
      }
    }

    return member;
  }

  function targetRounds(floor, boss) {
    const config = D.balance.roundTargets.find((item) => {
      return floor >= item.from && floor <= item.to;
    });

    if (!config) {
      throw new Error('戦闘ラウンド設定がありません。');
    }

    return boss ? config.boss : config.normal;
  }

  function encounterIds(index) {
    const info = stageInfo(index);
    const override = D.stageOverrides?.[stageName(index)];

    if (override && Array.isArray(override.enemies)) {
      return override.enemies;
    }

    const group = D.encounters.find((item) => {
      return info.floor >= item.from && info.floor <= item.to;
    });

    if (!group) {
      throw new Error('敵の出現設定がありません。');
    }

    const pool = info.boss
      ? group.bosses
      : group.normal;

    if (info.boss) {
      return [
        pool[(info.floor - 1) % pool.length]
      ];
    }

    const count = info.floor <= 2
      ? 1
      : info.stage % 3 === 0
        ? 3
        : 2;

    return Array.from({ length: count }, (_, i) => {
      return pool[
        (info.floor + info.stage + i - 2) % pool.length
      ];
    });
  }

  function createEnemyStates(index) {
    const info = stageInfo(index);
    const area = areaFor(info.floor);
    const ids = encounterIds(index);
    const reference = referenceMember(index);
    const value = stats(reference);

    const override =
      D.stageOverrides?.[stageName(index)] || {};

    if (ids.length < 1 || ids.length > 3) {
      throw new Error('敵は1〜3体で設定してください。');
    }

    const damageFactor =
      D.balance.averageDamageFactors[reference.rank - 1];

    finite(
      damageFactor,
      0.01,
      100,
      '想定ダメージ係数'
    );

    const hpMultiplier = override.hpMultiplier ?? 1;
    const atkMultiplier = override.atkMultiplier ?? 1;

    finite(hpMultiplier, 0.01, 100, '敵HP補正');
    finite(atkMultiplier, 0.01, 100, '敵ATK補正');

    const totalHp = value.atk *
      4 *
      damageFactor *
      targetRounds(info.floor, info.boss);

    return ids.map((id, i) => {
      const definition = enemies.get(id);

      if (!definition) {
        throw new Error('敵定義がありません：' + id);
      }

      const maxHp = Math.max(
        1,
        Math.floor(
          totalHp / ids.length *
          definition.hpRate *
          hpMultiplier
        )
      );

      const atk = Math.max(
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
      );

      let name = info.boss
        ? definition.bossName
        : definition.name;

      if (info.floor > 10) {
        name = area.name + 'の' + name;
      }

      if (index === MAX_STAGE) {
        name = '深淵王アビス・レガリア（仮画像）';
      }

      if (
        !info.boss &&
        ids.filter((item) => item === id).length > 1
      ) {
        name += ' ' + (i + 1);
      }

      return {
        id,
        name,
        element: info.floor <= 10
          ? definition.element
          : area.element,
        maxHp,
        hp: maxHp,
        atk,
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

  function startBattle(index) {
    if (isActive()) {
      throw new Error('先に現在の戦闘から撤退してください。');
    }

    integer(
      index,
      1,
      Math.min(save.highestCleared + 1, MAX_STAGE),
      'ステージ'
    );

    save.selectedStage = index;
    selectedEnemy = 0;

    save.battle = {
      version: D.battleVersion,
      index,
      state: 'active',
      round: 1,
      actor: 0,
      rewards: null,
      log: [
        stageName(index) + '：戦闘開始'
      ],
      allies: save.party.map((member) => {
        const value = stats(member);
        const definition = characters.get(member.id);

        return {
          id: member.id,
          rank: member.rank,
          maxHp: value.hp,
          hp: value.hp,
          atk: value.atk,
          def: value.def,
          defense: false,
          cover: false,
          coverReduction: 0,
          attackBuff: 1,
          cooldowns: definition.skills.map(() => 0),
          usedSkills: definition.skills.map(() => false)
        };
      }),
      enemies: createEnemyStates(index)
    };
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
    const battle = save.battle;

    if (
      battle.enemies[selectedEnemy] &&
      battle.enemies[selectedEnemy].hp > 0
    ) {
      return battle.enemies[selectedEnemy];
    }

    return battle.enemies.find((enemy) => {
      return enemy.hp > 0;
    });
  }

  function hitEnemy(
    actor,
    enemy,
    power,
    defenseScale = 1,
    modifier = 1
  ) {
    if (!enemy || enemy.hp <= 0) {
      return;
    }

    const definition = characters.get(actor.id);

    const base = Math.max(
      1,
      actor.atk * power -
      enemy.def * defenseScale / 2
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
  }

  function useSkill(actor, slot, allyIndex) {
    const definition = characters.get(actor.id);

    integer(
      slot,
      0,
      definition.skills.length - 1,
      'スキル'
    );

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

    if (skill.type === 'damage') {
      addLog(definition.name + '：' + skill.name);

      const targets = skill.target === 'allEnemies'
        ? battle.enemies.filter((item) => item.hp > 0)
        : [enemy];

      for (const target of targets) {
        for (
          let hit = 0;
          hit < (skill.hits || 1);
          hit += 1
        ) {
          hitEnemy(
            actor,
            target,
            skill.power,
            skill.defenseScale ?? 1
          );
        }
      }
    } else if (skill.type === 'heal') {
      integer(
        allyIndex,
        0,
        battle.allies.length - 1,
        '回復対象'
      );

      const target = battle.allies[allyIndex];

      if (target.hp <= 0) {
        throw new Error('戦闘不能の味方は回復できません。');
      }

      const before = target.hp;

      target.hp = Math.min(
        target.maxHp,
        target.hp + Math.floor(actor.atk * skill.power)
      );

      addLog(
        skill.name +
        '：' +
        characters.get(target.id).name +
        'を' +
        number(target.hp - before) +
        '回復'
      );
    } else if (skill.type === 'buff') {
      actor.attackBuff = skill.power;
      addLog(definition.name + '：' + skill.name);
    } else if (skill.type === 'cover') {
      actor.cover = true;
      actor.coverReduction = skill.reduction;
      addLog(definition.name + '：' + skill.name);
    } else if (skill.type === 'weaken') {
      battle.enemies.forEach((target) => {
        target.weaken = skill.power;
      });

      addLog(skill.name + '：敵の攻撃力が低下');
    } else if (skill.type === 'mark') {
      if (!enemy) {
        throw new Error('攻撃対象がありません。');
      }

      enemy.mark = skill.power;

      addLog(
        skill.name +
        '：' +
        enemy.name +
        'に光の印'
      );
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

    if (!actor || actor.hp <= 0) {
      throw new Error('行動者が不正です。');
    }

    let endTurn = false;

    if (command === 'attack') {
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

      addLog(
        characters.get(actor.id).name +
        'は防御した'
      );

      endTurn = true;
    } else if (command === 'skill') {
      useSkill(actor, slot, allyIndex);
    } else {
      throw new Error('コマンドが不正です。');
    }

    if (battle.enemies.every((enemy) => enemy.hp <= 0)) {
      victory();
      return;
    }

    if (endTurn) {
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

    while (
      next < battle.allies.length &&
      battle.allies[next].hp <= 0
    ) {
      next += 1;
    }

    if (next < battle.allies.length) {
      battle.actor = next;
      beginTurn(battle.allies[next]);
      return;
    }

    enemyPhase();

    if (battle.state !== 'active') {
      return;
    }

    battle.round += 1;

    battle.actor = battle.allies.findIndex((ally) => {
      return ally.hp > 0;
    });

    beginTurn(battle.allies[battle.actor]);
  }

  function damageAlly(
    enemy,
    target,
    power,
    enraged,
    singleAttack
  ) {
    const definition = characters.get(target.id);

    const base = Math.max(
      1,
      enemy.atk *
      enemy.weaken *
      power *
      (enraged ? 1.15 : 1) -
      target.def / 2
    );

    const coverRate = singleAttack && target.cover
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
  }

  function enemyPhase() {
    const battle = save.battle;
    const boss = stageInfo(battle.index).boss;
    const big = boss && battle.round % 3 === 0;
    const sweep = big && battle.round % 6 === 0;

    const activeEnemies = battle.enemies.filter((item) => {
      return item.hp > 0;
    });

    for (const enemy of activeEnemies) {
      const living = battle.allies.filter((ally) => {
        return ally.hp > 0;
      });

      if (!living.length) {
        break;
      }

      const enraged = boss &&
        enemy.hp <= enemy.maxHp / 2;

      if (sweep) {
        addLog(enemy.name + 'の全体攻撃！');

        for (const target of living) {
          damageAlly(
            enemy,
            target,
            0.85,
            enraged,
            false
          );
        }
      } else {
        let target = living[
          Math.floor(Math.random() * living.length)
        ];

        const guardian = living.find((ally) => {
          return ally.cover;
        });

        if (guardian && guardian !== target) {
          target = guardian;

          addLog(
            characters.get(target.id).name +
            'がかばった'
          );
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
        '全滅。育成・コイン・解放済みステージは維持されます。'
      );
    }
  }

  function victory() {
    const battle = save.battle;

    if (battle.state !== 'active') {
      return;
    }

    const reward = rewardFor(battle.index);
    const levelUps = [];

    if (!Number.isSafeInteger(save.coins + reward.coins)) {
      throw new Error('コインの保存上限に達しました。');
    }

    save.coins += reward.coins;

    save.highestCleared = Math.max(
      save.highestCleared,
      battle.index
    );

    save.party.forEach((member) => {
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
    });

    battle.state = 'won';

    battle.rewards = {
      exp: reward.exp,
      coins: reward.coins,
      levelUps
    };

    addLog(
      '勝利！ EXP +' +
      number(reward.exp) +
      ' / COIN +' +
      number(reward.coins)
    );
  }

  function reincarnate(id) {
    if (isActive()) {
      throw new Error('戦闘中は転生できません。');
    }

    const member = save.party.find((item) => {
      return item.id === id;
    });

    if (
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

  function image(
    paths,
    element,
    className,
    alt,
    enemy
  ) {
    const img = document.createElement('img');
    const fallback = placeholder(element, enemy);

    const candidates = [
      ...new Set(paths.filter(Boolean)),
      fallback
    ];

    let index = 0;

    img.className = className;
    img.alt = alt;
    img.decoding = 'async';
    img.draggable = false;

    img.onerror = () => {
      index += 1;

      if (index < candidates.length) {
        img.src = candidates[index];
      } else {
        img.onerror = null;
      }
    };

    img.src = candidates[index];

    return img;
  }

  function portraitPaths(definition, rank) {
    return definition.portraits
      .slice(0, rank)
      .reverse();
  }

  function hpBar(hp, maxHp) {
    const outer = node('div', 'hp-bar');
    const inner = node('div', 'hp-fill');

    inner.style.width =
      Math.max(
        0,
        Math.min(100, hp / maxHp * 100)
      ) + '%';

    outer.append(inner);

    return outer;
  }

  function createPortraitOverlay(
    name,
    meta,
    hp,
    maxHp
  ) {
    const overlay = node('div', 'portrait-overlay');

    overlay.append(
      node('div', 'overlay-name', name),
      node('div', 'overlay-meta', meta),
      hpBar(hp, maxHp),
      node(
        'div',
        'hp-text',
        number(hp) + ' / ' + number(maxHp)
      )
    );

    return overlay;
  }

  function render() {
    if (!save) {
      return;
    }

    const battle = save.battle;

    const displayIndex = battle
      ? battle.index
      : Math.min(
          save.highestCleared + 1,
          MAX_STAGE
        );

    const info = stageInfo(displayIndex);
    const area = areaFor(info.floor);

    $('coins').textContent =
      'COIN ' + number(save.coins);

    $('stageLabel').textContent =
      stageName(displayIndex) +
      (info.boss ? ' B' : '');

    $('stageLabel').title =
      stageName(displayIndex) +
      (info.boss ? '：ボス戦' : '：通常戦');

    $('areaLabel').textContent = area.name;
    $('areaLabel').title = area.name;

    $('roundLabel').textContent = battle
      ? 'R ' + battle.round
      : save.highestCleared === MAX_STAGE
        ? 'CLEAR'
        : 'R —';

    renderEnemies();
    renderParty();
    renderCommands();
    renderResult();
    renderManagement();

    $('log').replaceChildren();

    if (battle) {
      for (const line of battle.log) {
        $('log').append(
          node('div', '', line)
        );
      }

      $('log').scrollTop = $('log').scrollHeight;
    }

    if (fatal) {
      document.querySelectorAll('button').forEach((button) => {
        button.disabled = true;
      });
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

    if (isActive() && boss) {
      const warnings = [];

      if (battle.round % 6 === 0) {
        warnings.push(
          '全体攻撃の予兆！ 防御で備えよう'
        );
      } else if (battle.round % 3 === 0) {
        warnings.push(
          '強打の予兆！ 防御・かばうが有効'
        );
      }

      if (battle.enemies.some((enemy) => {
        return enemy.hp > 0 &&
          enemy.hp <= enemy.maxHp / 2;
      })) {
        warnings.push(
          'ボス激昂：攻撃威力が上昇'
        );
      }

      $('warning').textContent =
        warnings.join(' / ');
    }

    if (
      !battle.enemies[selectedEnemy] ||
      battle.enemies[selectedEnemy].hp <= 0
    ) {
      selectedEnemy = Math.max(
        0,
        battle.enemies.findIndex((enemy) => {
          return enemy.hp > 0;
        })
      );
    }

    battle.enemies.forEach((enemy, index) => {
      const definition = enemies.get(enemy.id);

      const classes = [
        'enemy',
        battle.enemies.length === 1 ? 'single' : '',
        selectedEnemy === index ? 'selected' : '',
        enemy.hp <= 0 ? 'dead' : ''
      ].filter(Boolean).join(' ');

      const button = node('button', classes);
      const frame = node('div', 'portrait-frame');

      const meta =
        D.elements[enemy.element].name +
        (boss ? ' / BOSS' : '');

      button.disabled =
        !isActive() ||
        enemy.hp <= 0;

      button.title = enemy.name;

      button.setAttribute(
        'aria-label',
        enemy.name +
        ' 属性' +
        D.elements[enemy.element].name +
        ' HP ' +
        enemy.hp +
        '/' +
        enemy.maxHp
      );

      button.setAttribute(
        'aria-pressed',
        String(selectedEnemy === index)
      );

      frame.append(
        image(
          [
            boss
              ? definition.bossImage
              : definition.image,
            definition.image
          ],
          enemy.element,
          'enemy-image',
          enemy.name,
          true
        ),
        createPortraitOverlay(
          enemy.name,
          meta,
          enemy.hp,
          enemy.maxHp
        )
      );

      button.append(frame);

      button.onclick = () => {
        if (fatal || busy) {
          return;
        }

        selectedEnemy = index;
        renderEnemies();
      };

      $('enemies').append(button);
    });
  }

  function renderParty() {
    $('party').replaceChildren();

    save.party.forEach((member, index) => {
      const definition = characters.get(member.id);
      const value = stats(member);

      const ally = save.battle
        ? save.battle.allies[index]
        : null;

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

      const meta =
        D.elements[definition.element].name +
        ' / R' +
        member.rank +
        ' Lv.' +
        member.level;

      button.setAttribute(
        'aria-label',
        definition.name +
        ' ランク' +
        member.rank +
        ' レベル' +
        member.level +
        ' HP ' +
        hp +
        '/' +
        maxHp
      );

      frame.append(
        image(
          portraitPaths(definition, member.rank),
          definition.element,
          'character-image',
          definition.name,
          false
        ),
        createPortraitOverlay(
          definition.name,
          meta,
          hp,
          maxHp
        )
      );

      button.append(frame);

      button.onclick = () => {
        if (fatal || busy) {
          return;
        }

        if (
          pendingHeal !== null &&
          hp > 0 &&
          isActive()
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

    const actor = save.battle.allies[
      save.battle.actor
    ];

    const definition = characters.get(actor.id);

    $('turnLabel').textContent = pendingHeal !== null
      ? '回復する味方をタップ'
      : definition.name +
        'の行動 / R' +
        actor.rank;

    $('attack').disabled = pendingHeal !== null;
    $('defend').disabled = pendingHeal !== null;

    definition.skills.forEach((id, slot) => {
      const skill = skillFor(id, actor.rank);
      const cooldown = actor.cooldowns[slot];
      const used = actor.usedSkills[slot];

      const button = node('button', 'skill');

      button.disabled =
        cooldown > 0 ||
        used ||
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

        if (skill.target === 'ally') {
          pendingHeal = slot;
          renderParty();
          renderCommands();
        } else {
          transact(() => {
            performAction('skill', slot);
          });
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
      ? '塔へ挑戦'
      : battle.state === 'won'
        ? battle.index === MAX_STAGE
          ? 'TOWER CLEAR'
          : 'VICTORY'
        : 'DEFEAT';

    root.append(
      node('div', 'result-title', title)
    );

    if (battle && battle.rewards) {
      root.append(
        node(
          'p',
          '',
          'EXP +' +
          number(battle.rewards.exp) +
          ' / COIN +' +
          number(battle.rewards.coins)
        )
      );

      for (const text of battle.rewards.levelUps) {
        root.append(
          node('div', 'muted', text)
        );
      }
    }

    if (save.party.some((member) => {
      return member.level === D.rules.maxLevel &&
        member.rank < D.rules.maxRank;
    })) {
      root.append(
        node(
          'p',
          'muted',
          '転生可能な仲間がいます。管理画面で確認できます。'
        )
      );
    }

    const buttons = node(
      'div',
      'result-buttons'
    );

    function addButton(label, index, primary) {
      const button = node(
        'button',
        primary ? 'primary' : '',
        label
      );

      button.onclick = () => {
        transact(() => {
          startBattle(index);
        });
      };

      buttons.append(button);
    }

    if (!battle) {
      addButton(
        '挑戦する',
        Math.min(
          save.highestCleared + 1,
          MAX_STAGE
        ),
        true
      );
    } else {
      if (
        battle.state === 'won' &&
        battle.index < MAX_STAGE
      ) {
        addButton(
          '次のステージへ',
          battle.index + 1,
          true
        );
      }

      addButton(
        '同じステージに挑戦',
        battle.index,
        false
      );
    }

    root.append(buttons);
  }

  function renderManagement() {
    $('progressText').textContent =
      '突破済み：' +
      save.highestCleared +
      'ステージ / 突破階層：' +
      Math.floor(
        save.highestCleared /
        D.rules.stagesPerFloor
      ) +
      '階';

    $('coinText').textContent =
      number(save.coins) + ' COIN';

    const floorSelect = $('floorSelect');

    const previousFloor =
      Number(floorSelect.value) ||
      stageInfo(save.selectedStage).floor;

    const available = Math.min(
      save.highestCleared + 1,
      MAX_STAGE
    );

    const lastFloor = stageInfo(available).floor;

    floorSelect.replaceChildren();

    for (
      let floor = 1;
      floor <= lastFloor;
      floor += 1
    ) {
      const option = node(
        'option',
        '',
        floor +
        '階 / ' +
        areaFor(floor).name
      );

      option.value = floor;
      floorSelect.append(option);
    }

    floorSelect.value = Math.min(
      previousFloor,
      lastFloor
    );

    populateStages();

    $('startSelected').disabled = isActive();
    $('retreat').disabled = !isActive();

    $('members').replaceChildren();

    save.party.forEach((member) => {
      const definition = characters.get(member.id);
      const value = stats(member);
      const panel = node('div', 'member-panel');

      panel.append(
        node(
          'strong',
          '',
          definition.name +
          ' / ' +
          definition.jobs[member.rank - 1]
        ),
        node(
          'p',
          'muted',
          'R' +
          member.rank +
          ' Lv.' +
          member.level +
          ' / HP ' +
          number(value.hp) +
          ' / ATK ' +
          number(value.atk) +
          ' / DEF ' +
          number(value.def)
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
            skill.name +
            '：' +
            skillDescription(skill)
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
        if (fatal || busy) {
          return;
        }

        const nextRank = member.rank + 1;

        const after = stats({
          id: member.id,
          rank: nextRank,
          level: 1
        });

        const currentMultiplier =
          rankDefinition(member.rank).statMultiplier;

        const nextMultiplier =
          rankDefinition(nextRank).statMultiplier;

        const increase =
          nextMultiplier / currentMultiplier;

        const message = [
          definition.name + 'を転生しますか？',
          'ランク ' + member.rank + ' → ' + nextRank,
          'ジョブ：' + definition.jobs[nextRank - 1],
          'レベルは1に戻ります。',
          '',
          'HP ' + value.hp + ' → ' + after.hp,
          'ATK ' + value.atk + ' → ' + after.atk,
          'DEF ' + value.def + ' → ' + after.def,
          '',
          '基礎値とレベル成長量は前ランクの' +
            increase +
            '倍になります。',
          'スキル名と効果量も上位版へ変化します。',
          'コインとステージ解放は維持されます。'
        ].join('\n');

        if (window.confirm(message)) {
          transact(() => {
            reincarnate(member.id);
          });
        }
      };

      panel.append(button);
      $('members').append(panel);
    });
  }

  function populateStages() {
    const floor = Number(
      $('floorSelect').value
    );

    const count = D.rules.stagesPerFloor;

    const available = Math.min(
      save.highestCleared + 1,
      MAX_STAGE
    );

    const max = Math.min(
      count,
      available - (floor - 1) * count
    );

    const selectedInfo = stageInfo(
      save.selectedStage
    );

    const previous =
      Number($('stageSelect').value) ||
      (
        selectedInfo.floor === floor
          ? selectedInfo.stage
          : 1
      );

    $('stageSelect').replaceChildren();

    for (
      let stage = 1;
      stage <= max;
      stage += 1
    ) {
      const option = node(
        'option',
        '',
        stage +
        (
          stage === count
            ? '［ボス］'
            : '［通常］'
        )
      );

      option.value = stage;
      $('stageSelect').append(option);
    }

    $('stageSelect').value = Math.min(
      previous,
      max
    );

    renderPreview();
  }

  function selectedStageIndex() {
    return (
      Number($('floorSelect').value) - 1
    ) *
      D.rules.stagesPerFloor +
      Number($('stageSelect').value);
  }

  function renderPreview() {
    const index = selectedStageIndex();

    if (!index || index < 1) {
      return;
    }

    const info = stageInfo(index);

    const names = encounterIds(index).map((id) => {
      const definition = enemies.get(id);

      if (!definition) {
        throw new Error('敵定義がありません：' + id);
      }

      return info.boss
        ? definition.bossName
        : definition.name;
    });

    const reward = rewardFor(index);

    $('encounterPreview').textContent =
      names.join(' / ') +
      '｜EXP ' +
      number(reward.exp) +
      '｜COIN ' +
      number(reward.coins);
  }

  function exportSave() {
    if (!save) {
      return;
    }

    const blob = new Blob(
      [
        JSON.stringify(save, null, 2)
      ],
      {
        type: 'application/json'
      }
    );

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;

    link.download =
      'towerquest-rank3-' +
      new Date().toISOString().slice(0, 10) +
      '.json';

    document.body.append(link);
    link.click();
    link.remove();

    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  async function importSave(file) {
    if (!file || fatal || busy) {
      return;
    }

    try {
      if (file.size > 2000000) {
        throw new Error('ファイルが大きすぎます。');
      }

      const text = await file.text();
      const raw = JSON.parse(text);
      const result = normalizeSave(raw);
      const imported = result.value;

      const message = [
        '現在の進行を読み込んだデータで置き換えます。',
        '必要なら先にバックアップしてください。',
        '',
        'コイン：' + number(imported.coins),
        '突破済み：' +
          imported.highestCleared +
          'ステージ',
        result.migrated
          ? '旧ランク1→新1、旧2・3→新2、旧4・5→新3へ移行します。'
          : '新ランク仕様のセーブです。',
        result.battleReset
          ? '旧仕様の戦闘途中データは解除します。'
          : '同じ戦闘仕様なら、戦闘途中の状態も復元します。',
        '',
        '読み込みますか？'
      ].join('\n');

      if (!window.confirm(message)) {
        return;
      }

      transact(() => {
        save = imported;
        selectedEnemy = 0;
      });
    } catch (error) {
      status(
        '読み込みエラー：' +
        error.message
      );
    } finally {
      $('saveFile').value = '';
    }
  }

  function bindEvents() {
    $('openManagement').onclick = () => {
      if (fatal || busy || !save) {
        return;
      }

      renderManagement();
      $('management').showModal();
    };

    $('closeManagement').onclick = () => {
      $('management').close();
    };

    $('floorSelect').onchange = () => {
      if (!fatal) {
        populateStages();
      }
    };

    $('stageSelect').onchange = () => {
      if (!fatal) {
        renderPreview();
      }
    };

    $('startSelected').onclick = () => {
      const index = selectedStageIndex();

      const success = transact(() => {
        startBattle(index);
      });

      if (success) {
        $('management').close();
      }
    };

    $('retreat').onclick = () => {
      if (
        !isActive() ||
        !window.confirm(
          '撤退しますか？ この戦闘の報酬は獲得できません。'
        )
      ) {
        return;
      }

      transact(() => {
        save.battle = null;
      });
    };

    $('attack').onclick = () => {
      transact(() => {
        performAction('attack');
      });
    };

    $('defend').onclick = () => {
      transact(() => {
        performAction('defend');
      });
    };

    $('cancelHeal').onclick = () => {
      if (fatal || busy) {
        return;
      }

      pendingHeal = null;
      renderParty();
      renderCommands();
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

    window.addEventListener('storage', (event) => {
      if (
        event.key !== SAVE_KEY &&
        event.key !== null
      ) {
        return;
      }

      fatal = true;

      document.querySelectorAll('button').forEach((button) => {
        button.disabled = true;
      });

      status(
        '別タブでセーブが変更されました。このページを再読み込みしてください。'
      );
    });
  }

  bindEvents();
  boot();
})();
