// File: game.js

'use strict';

(() => {
  const D = window.TQ_DATA;
  const SAVE_KEY = 'towerquest.pages.save.v1';
  const MIGRATION_BACKUP_KEY = 'towerquest.pages.before-100-stage.backup';
  const SCHEMA_VERSION = 3;

  const $ = (id) => document.getElementById(id);
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const number = (value) => Number(value).toLocaleString('ja-JP');

  let save = null;
  let busy = false;
  let fatal = false;
  let pendingHeal = null;
  let selectedEnemy = 0;
  let maxStage = 100;

  let characters = new Map();
  let enemies = new Map();
  let skills = new Map();

  const referenceCache = new Map();
  const backgroundCache = new Map();
  let backgroundToken = 0;

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
    if (!Number.isSafeInteger(value) || value < min || value > max) {
      throw new Error(label + 'が不正です。');
    }

    return value;
  }

  function finite(value, min, max, label) {
    if (!Number.isFinite(value) || value < min || value > max) {
      throw new Error(label + 'が不正です。');
    }

    return value;
  }

  function rankDefinition(rank) {
    const definition = D.rankDefinitions.find((item) => {
      return item.rank === rank;
    });

    if (!definition) {
      throw new Error('ランク定義がありません。');
    }

    return definition;
  }

  function skillFor(id, rank) {
    const base = skills.get(id);
    const variant = base?.variants[rank - 1];

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
        ? '。敵DEFを' + Math.round(skill.defenseScale * 100) + '％で計算'
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
        Math.round((1 - skill.power) * 100) + '％低下';
    }

    if (skill.type === 'mark') {
      return '敵が次に受ける1発のダメージ×' + skill.power;
    }

    if (skill.type === 'cover') {
      const reduction = Math.round(skill.reduction * 100);

      return '次の自分の手番まで単体攻撃をかばう' +
        (reduction ? '。単体被ダメージ' + reduction + '％軽減' : '');
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

  // エリアのfrom/toは通算ステージ番号。
  function areaFor(index) {
    const area = D.areas.find((item) => {
      return index >= item.from && index <= item.to;
    });

    if (!area) {
      throw new Error('エリア定義がありません：' + index);
    }

    return area;
  }

  function stats(member) {
    const definition = characters.get(member.id);
    const multiplier = rankDefinition(member.rank).statMultiplier;
    const value = {};

    for (const key of ['hp', 'atk', 'def']) {
      value[key] = (
        definition.base[key] +
        definition.growth[key] * (member.level - 1)
      ) * multiplier;
    }

    return value;
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
        (config.expBase + config.expQuadratic * index * index) *
        (boss ? config.bossExpMultiplier : 1)
      ),
      coins: Math.floor(
        (config.coinBase + config.coinPerStage * index) *
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

  function validateParty(raw, oldRanks) {
    if (!Array.isArray(raw) || raw.length !== 4) {
      throw new Error('パーティは4人必要です。');
    }

    const ids = new Set();

    return raw.map((member) => {
      if (!member || !characters.has(member.id) || ids.has(member.id)) {
        throw new Error('パーティのキャラクターが不正です。');
      }

      ids.add(member.id);

      const level = integer(member.level, 1, D.rules.maxLevel, 'レベル');
      let rank = integer(
        member.rank,
        1,
        oldRanks ? 5 : D.rules.maxRank,
        'ランク'
      );

      if (oldRanks) {
        rank = 1 + Math.ceil((rank - 1) / 2);
      }

      const exp = integer(member.exp, 0, Number.MAX_SAFE_INTEGER, '経験値');

      if (
        (level === D.rules.maxLevel && exp !== 0) ||
        (level < D.rules.maxLevel && exp >= neededExp(level))
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
    const values = [type === 'cover' ? 0 : 1];

    for (const skill of D.skills) {
      if (skill.type === type) {
        for (const variant of skill.variants) {
          if (variant[property] !== undefined) {
            values.push(variant[property]);
          }
        }
      }
    }

    return values;
  }

  function validateBattle(raw, party, cleared) {
    if (!raw || raw.version !== D.battleVersion) {
      return null;
    }

    if (!['active', 'won', 'lost'].includes(raw.state)) {
      throw new Error('戦闘状態が不正です。');
    }

    const index = integer(raw.index, 1, maxStage, '戦闘ステージ');
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
      log: Array.isArray(raw.log)
        ? raw.log.slice(-40).map((line) => String(line).slice(0, 300))
        : [],
      allies: [],
      enemies: []
    };

    raw.allies.forEach((ally, i) => {
      const member = party[i];
      const definition = characters.get(member.id);

      if (!ally || ally.id !== member.id || ally.rank !== member.rank) {
        throw new Error('戦闘中のパーティが不正です。');
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
        !ally.usedSkills.every((value) => typeof value === 'boolean')
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

    const alliesAlive = battle.allies.some((ally) => ally.hp > 0);
    const enemiesAlive = battle.enemies.some((enemy) => enemy.hp > 0);

    if (
      battle.state === 'active' &&
      (!alliesAlive || !enemiesAlive || battle.allies[battle.actor].hp <= 0)
    ) {
      throw new Error('進行中の戦闘状態が不正です。');
    }

    if (battle.state === 'lost' && alliesAlive) {
      throw new Error('敗北状態が不正です。');
    }

    if (battle.state === 'won') {
      if (!alliesAlive || enemiesAlive || cleared < index || !raw.rewards) {
        throw new Error('勝利状態が不正です。');
      }

      battle.rewards = {
        exp: integer(raw.rewards.exp, 0, Number.MAX_SAFE_INTEGER, '報酬経験値'),
        coins: integer(raw.rewards.coins, 0, Number.MAX_SAFE_INTEGER, '報酬コイン'),
        levelUps: Array.isArray(raw.rewards.levelUps)
          ? raw.rewards.levelUps.map((text) => String(text).slice(0, 100))
          : []
      };
    }

    return battle;
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

    let originalCleared;

    if (gas) {
      originalCleared =
        integer(raw.clearedFloor, 0, 100, '旧突破階層') *
        D.rules.stagesPerFloor;
    } else {
      originalCleared = integer(
        raw.highestCleared,
        0,
        migrated ? 1000 : maxStage,
        '突破ステージ'
      );
    }

    const cleared = Math.min(originalCleared, maxStage);

    const selected = migrated
      ? Math.min(cleared + 1, maxStage)
      : integer(raw.selectedStage, 1, maxStage, '選択ステージ');

    if (selected > Math.min(cleared + 1, maxStage)) {
      throw new Error('選択ステージが未解放です。');
    }

    const battleReset = !!raw.battle &&
      (migrated || raw.battle.version !== D.battleVersion);

    return {
      migrated,
      battleReset,
      capped: originalCleared > maxStage,
      value: {
        game: 'towerquest-pages',
        schemaVersion: SCHEMA_VERSION,
        revision: gas
          ? 0
          : integer(raw.revision ?? 0, 0, Number.MAX_SAFE_INTEGER, '保存番号'),
        coins: integer(raw.coins, 0, Number.MAX_SAFE_INTEGER, 'コイン'),
        highestCleared: cleared,
        selectedStage: selected,
        party,
        battle: migrated
          ? null
          : validateBattle(raw.battle, party, cleared),
        updatedAt: new Date().toISOString()
      }
    };
  }

  function persist() {
    save.updatedAt = new Date().toISOString();
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  }

  function validateMaster() {
    if (
      !D ||
      !D.rules ||
      !Array.isArray(D.characters) ||
      !Array.isArray(D.enemies) ||
      !Array.isArray(D.skills) ||
      !Array.isArray(D.areas) ||
      !Array.isArray(D.encounters) ||
      !Array.isArray(D.rankDefinitions) ||
      !Array.isArray(D.initialParty) ||
      !D.balance
    ) {
      throw new Error('data.jsを読み込めません。');
    }

    integer(D.rules.floors, 1, 100, '階層数');
    integer(D.rules.stagesPerFloor, 1, 100, 'ステージ数');
    integer(D.rules.maxRank, 1, D.rankDefinitions.length, '最大ランク');

    maxStage = D.rules.floors * D.rules.stagesPerFloor;

    characters = new Map(D.characters.map((item) => [item.id, item]));
    enemies = new Map(D.enemies.map((item) => [item.id, item]));
    skills = new Map(D.skills.map((item) => [item.id, item]));

    if (
      characters.size !== D.characters.length ||
      enemies.size !== D.enemies.length ||
      skills.size !== D.skills.length
    ) {
      throw new Error('マスターに重複IDがあります。');
    }

    if (D.initialParty.length !== 4 || new Set(D.initialParty).size !== 4) {
      throw new Error('初期パーティは異なる4人を指定してください。');
    }

    for (const id of D.initialParty) {
      const character = characters.get(id);

      if (
        !character ||
        !D.elements[character.element] ||
        character.skills.length !== 3 ||
        character.jobs.length < D.rules.maxRank
      ) {
        throw new Error('キャラクター定義が不足しています。');
      }

      for (let rank = 1; rank <= D.rules.maxRank; rank += 1) {
        finite(rankDefinition(rank).statMultiplier, 1, 1000000, 'ランク倍率');

        for (const skillId of character.skills) {
          const skill = skillFor(skillId, rank);
          integer(skill.cooldown, 1, 1000, '待ち時間');

          if (skill.type === 'cover') {
            finite(skill.reduction, 0, 0.95, 'かばう軽減');
          } else {
            finite(skill.power, 0.01, 100, 'スキル倍率');
          }
        }
      }
    }

    for (let index = 1; index <= maxStage; index += 1) {
      areaFor(index);

      const ids = encounterIds(index);

      if (ids.length < 1 || ids.length > 3 || ids.some((id) => !enemies.has(id))) {
        throw new Error('敵の出現設定が不正です：' + stageName(index));
      }

      targetRounds(stageInfo(index).floor, stageInfo(index).boss);
    }
  }

  function boot() {
    try {
      validateMaster();

      const text = localStorage.getItem(SAVE_KEY);
      let message = '全10階・100ステージ／自動保存';

      if (text) {
        const result = normalizeSave(JSON.parse(text));
        save = result.value;

        if (result.migrated || result.battleReset) {
          if (!localStorage.getItem(MIGRATION_BACKUP_KEY)) {
            localStorage.setItem(MIGRATION_BACKUP_KEY, text);
          }

          save.revision += 1;
          persist();

          message = result.migrated
            ? '全10階・100ステージ仕様へセーブを移行しました'
            : '戦闘仕様更新に伴い、戦闘途中の状態を解除しました';

          if (result.capped) {
            message += '。突破数は100へ補正しました';
          }
        }
      } else {
        save = freshSave();
        persist();
      }

      $('openManagement').disabled = false;
      render();
      status(message);
    } catch (error) {
      fatal = true;
      $('openManagement').disabled = true;
      $('result').textContent =
        '起動できませんでした。保存データは削除していません。';
      status('起動エラー：' + error.message);
    }
  }

  // File: game.js

async function transact(action) {
  if (busy || fatal || !save) {
    return false;
  }

  const before = clone(save);
  busy = true;
  battleFxQueue.length = 0;

  let committed = false;
  let errorMessage = '';

  setBattleInputLocked(true);

  try {
    const disk = JSON.parse(localStorage.getItem(SAVE_KEY));

    if (!disk || disk.revision !== save.revision) {
      throw new Error(
        '別タブで進行が変わりました。再読み込みしてください。'
      );
    }

    action();

    save.revision = before.revision + 1;
    persist();

    pendingHeal = null;
    committed = true;

    if (battleFxQueue.length > 0) {
      status('戦闘演出中…');
    }

    // 表示中のDOMを残して演出し、終了後に最新状態へ更新する。
    // セーブはすでに確定しているため、演出失敗で報酬を戻さない。
    try {
      await playBattleFxQueue();
    } catch (error) {
      console.warn('戦闘演出を省略しました。', error);
    }
  } catch (error) {
    if (!committed) {
      save = before;
    }

    errorMessage = error.message;
  } finally {
    battleFxQueue.length = 0;
    busy = false;

    render();
    setBattleInputLocked(false);
  }

  if (fatal) {
    status(
      '別タブで保存データが変わりました。再読み込みしてください。'
    );
  } else {
    status(
      committed
        ? '保存済み'
        : '操作を確定できませんでした：' + errorMessage
    );
  }

  return committed;
}

  function isActive() {
    return !!save?.battle && save.battle.state === 'active';
  }

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

      const threshold = D.balance.reincarnateAfterStage[member.rank - 1];

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

    if (Array.isArray(override?.enemies)) {
      return override.enemies;
    }

    const group = D.encounters.find((item) => item.floor === info.floor);

    if (!group) {
      throw new Error('階層の敵設定がありません。');
    }

    if (info.boss) {
      return [group.boss];
    }

    // 各階で、弱い敵から順に種類を増やす。
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
    const override = D.stageOverrides?.[stageName(index)] || {};

    const hpMultiplier = override.hpMultiplier ?? 1;
    const atkMultiplier = override.atkMultiplier ?? 1;

    finite(hpMultiplier, 0.01, 100, '敵HP補正');
    finite(atkMultiplier, 0.01, 100, '敵ATK補正');

    const factor = D.balance.averageDamageFactors[reference.rank - 1];
    const totalHp = value.atk * 4 * factor *
      targetRounds(info.floor, info.boss);

    return ids.map((id, i) => {
      const definition = enemies.get(id);

      const maxHp = Math.max(
        1,
        Math.floor(totalHp / ids.length * definition.hpRate * hpMultiplier)
      );

      const atk = Math.max(
        1,
        Math.floor(
          (
            value.def / 2 +
            value.hp * (info.boss ? 0.14 : 0.09) / ids.length
          ) * definition.atkRate * atkMultiplier
        )
      );

      const duplicate = ids.filter((item) => item === id).length > 1;

      return {
        id,
        name: definition.name + (duplicate ? ' ' + (i + 1) : ''),
        element: definition.element,
        maxHp,
        hp: maxHp,
        atk,
        def: Math.max(
          1,
          Math.floor(
            value.atk * (info.boss ? 0.4 : 0.22) * definition.defRate
          )
        ),
        mark: 1,
        weaken: 1
      };
    });
  }

  function startBattle(index) {
    if (isActive()) {
      throw new Error('先に撤退してください。');
    }

    integer(index, 1, Math.min(save.highestCleared + 1, maxStage), 'ステージ');

    save.selectedStage = index;
    selectedEnemy = 0;

    save.battle = {
      version: D.battleVersion,
      index,
      state: 'active',
      round: 1,
      actor: 0,
      rewards: null,
      log: [stageName(index) + '／' + areaFor(index).name + '：戦闘開始'],
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
      enemies: createEnemies(index)
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
    const list = save.battle.enemies;
    return list[selectedEnemy]?.hp > 0
      ? list[selectedEnemy]
      : list.find((enemy) => enemy.hp > 0);
  }

  function hitEnemy(actor, enemy, power, defenseScale = 1, modifier = 1) {
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
    addLog(definition.name + ' → ' + enemy.name + '：' + number(amount));
  }

  function useSkill(actor, slot, allyIndex) {
    const definition = characters.get(actor.id);
    integer(slot, 0, definition.skills.length - 1, 'スキル');

    if (actor.cooldowns[slot] > 0 || actor.usedSkills[slot]) {
      throw new Error('そのスキルは使用できません。');
    }

    const skill = skillFor(definition.skills[slot], actor.rank);
    const battle = save.battle;
    const enemy = targetEnemy();

    if (skill.type === 'damage') {
      addLog(definition.name + '：' + skill.name);

      const targets = skill.target === 'allEnemies'
        ? battle.enemies.filter((item) => item.hp > 0)
        : [enemy];

      for (const target of targets) {
        for (let hit = 0; hit < (skill.hits || 1); hit += 1) {
          hitEnemy(actor, target, skill.power, skill.defenseScale ?? 1);
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

      addLog(
        skill.name + '：' + characters.get(target.id).name +
        'を' + number(target.hp - before) + '回復'
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
      enemy.mark = skill.power;
      addLog(skill.name + '：' + enemy.name + 'に光の印');
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
      hitEnemy(actor, targetEnemy(), 1, 1, actor.attackBuff);
      endTurn = true;
    } else if (command === 'defend') {
      actor.defense = true;
      addLog(characters.get(actor.id).name + 'は防御した');
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
    actor.cooldowns = actor.cooldowns.map((value) => Math.max(0, value - 1));
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
      battle.actor = battle.allies.findIndex((ally) => ally.hp > 0);
      beginTurn(battle.allies[battle.actor]);
    }
  }

  function damageAlly(enemy, target, power, enraged, single) {
    const definition = characters.get(target.id);
    const base = Math.max(
      1,
      enemy.atk * enemy.weaken * power * (enraged ? 1.15 : 1) -
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
    addLog(enemy.name + ' → ' + definition.name + '：' + number(amount));
  }

  function enemyPhase() {
    const battle = save.battle;
    const boss = stageInfo(battle.index).boss;
    const big = boss && battle.round % 3 === 0;
    const sweep = big && battle.round % 6 === 0;

    for (const enemy of battle.enemies.filter((item) => item.hp > 0)) {
      const living = battle.allies.filter((ally) => ally.hp > 0);

      if (!living.length) {
        break;
      }

      const enraged = boss && enemy.hp <= enemy.maxHp / 2;

      if (sweep) {
        addLog(enemy.name + 'の全体攻撃！');

        for (const target of living) {
          damageAlly(enemy, target, 0.85, enraged, false);
        }
      } else {
        let target = living[Math.floor(Math.random() * living.length)];
        const guardian = living.find((ally) => ally.cover);

        if (guardian && guardian !== target) {
          target = guardian;
          addLog(characters.get(target.id).name + 'がかばった');
        }

        if (big) {
          addLog(enemy.name + 'の強打！');
        }

        damageAlly(enemy, target, big ? 1.8 : 1, enraged, true);
      }
    }

    battle.enemies.forEach((enemy) => {
      enemy.weaken = 1;
    });

    if (battle.allies.every((ally) => ally.hp <= 0)) {
      battle.state = 'lost';
      addLog('全滅。育成・コイン・突破済みステージは維持されます。');
    }
  }

  function victory() {
    const battle = save.battle;

    if (battle.state !== 'active') {
      return;
    }

    const reward = rewardFor(battle.index);

    if (!Number.isSafeInteger(save.coins + reward.coins)) {
      throw new Error('コインの保存上限です。');
    }

    save.coins += reward.coins;
    save.highestCleared = Math.max(save.highestCleared, battle.index);

    const levelUps = [];

    for (const member of save.party) {
      const before = member.level;
      grantExp(member, reward.exp);

      if (member.level > before) {
        levelUps.push(
          characters.get(member.id).name +
          ' Lv.' + before + ' → ' + member.level
        );
      }
    }

    battle.state = 'won';
    battle.rewards = {
      ...reward,
      levelUps
    };

    addLog(
      '勝利！ EXP +' + number(reward.exp) +
      ' / COIN +' + number(reward.coins)
    );
  }

  function reincarnate(id) {
    const member = save.party.find((item) => item.id === id);

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

    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
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

    fill.style.width = Math.max(0, Math.min(100, hp / maxHp * 100)) + '%';
    bar.append(fill);

    panel.append(
      node('div', 'overlay-name', name),
      node('div', 'overlay-meta', meta),
      bar,
      node('div', 'hp-text', number(hp) + ' / ' + number(maxHp))
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
    const key = path + '|' + (area.backgroundPosition || 'center');

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

      arena.style.backgroundPosition = area.backgroundPosition || 'center';
    });
  }

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
    $('stageLabel').textContent = stageName(index) + (info.boss ? ' B' : '');
    $('areaLabel').textContent = area.name;
    $('areaLabel').title = area.name;

    $('roundLabel').textContent = battle
      ? 'R ' + battle.round
      : save.highestCleared === maxStage
        ? 'CLEAR'
        : 'R —';

    renderBackground(index);
    renderEnemies();
    renderParty();
    renderCommands();
    renderResult();
    renderManagement();

    $('log').replaceChildren();

    for (const line of battle?.log || []) {
      $('log').append(node('div', '', line));
    }

    $('log').scrollTop = $('log').scrollHeight;

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
    const warnings = [];

    if (isActive() && boss) {
      if (battle.round % 6 === 0) {
        warnings.push('全体攻撃の予兆！ 防御で備えよう');
      } else if (battle.round % 3 === 0) {
        warnings.push('強打の予兆！ 防御・かばうが有効');
      }

      if (battle.enemies.some((enemy) => {
        return enemy.hp > 0 && enemy.hp <= enemy.maxHp / 2;
      })) {
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
        'aria-label',
        enemy.name + ' HP ' + enemy.hp + '/' + enemy.maxHp
      );

      button.setAttribute('aria-pressed', String(selectedEnemy === index));

      frame.append(
        image([definition.image], enemy.element, 'enemy-image', enemy.name, true),
        overlay(
          enemy.name,
          D.elements[enemy.element].name + (boss ? ' / BOSS' : ''),
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
        isActive() && save.battle.actor === index ? 'active' : '',
        hp <= 0 ? 'dead' : '',
        pendingHeal !== null && hp > 0 ? 'heal-target' : ''
      ].filter(Boolean).join(' ');

      const button = node('button', classes);
      const frame = node('div', 'portrait-frame');

      button.setAttribute(
        'aria-label',
        definition.name + ' R' + member.rank +
        ' Lv.' + member.level + ' HP ' + hp + '/' + maxHp
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
          ' / R' + member.rank + ' Lv.' + member.level,
          hp,
          maxHp
        )
      );

      button.append(frame);

      button.onclick = () => {
        if (pendingHeal !== null && hp > 0 && isActive() && !fatal && !busy) {
          const slot = pendingHeal;
          transact(() => performAction('skill', slot, index));
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

      button.disabled = used || cooldown > 0 || pendingHeal !== null;

      button.append(
        node('span', 'skill-name', (slot + 1) + '. ' + skill.name),
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
      root.append(
        node(
          'p',
          '',
          'EXP +' + number(battle.rewards.exp) +
          ' / COIN +' + number(battle.rewards.coins)
        )
      );

      for (const text of battle.rewards.levelUps) {
        root.append(node('div', 'muted', text));
      }
    }

    if (save.party.some((member) => {
      return member.level === D.rules.maxLevel && member.rank < D.rules.maxRank;
    })) {
      root.append(node('p', 'muted', '転生可能な仲間がいます。管理で確認できます。'));
    }

    const buttons = node('div', 'result-buttons');

    function addButton(label, index, primary) {
      const button = node('button', primary ? 'primary' : '', label);
      button.onclick = () => transact(() => startBattle(index));
      buttons.append(button);
    }

    if (!battle) {
      addButton(
        save.highestCleared === maxStage ? '最終ステージに再挑戦' : '挑戦する',
        Math.min(save.highestCleared + 1, maxStage),
        true
      );
    } else {
      if (battle.state === 'won' && battle.index < maxStage) {
        addButton('次のステージへ', battle.index + 1, true);
      }

      addButton('同じステージに挑戦', battle.index, false);
    }

    root.append(buttons);
  }

  function renderManagement() {
    $('progressText').textContent =
      '突破 ' + save.highestCleared + '/100ステージ・' +
      Math.floor(save.highestCleared / D.rules.stagesPerFloor) + '/10階';

    $('coinText').textContent = number(save.coins) + ' COIN';

    const available = Math.min(save.highestCleared + 1, maxStage);
    const maxFloor = stageInfo(available).floor;
    const previous = Number($('floorSelect').value) ||
      stageInfo(save.selectedStage).floor;

    $('floorSelect').replaceChildren();

    for (let floor = 1; floor <= maxFloor; floor += 1) {
      const firstIndex = (floor - 1) * D.rules.stagesPerFloor + 1;
      const option = node('option', '', floor + '階／' + areaFor(firstIndex).name);
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
      const panel = node('div', 'member-panel');

      panel.append(
        node('strong', '', definition.name + '／' + definition.jobs[member.rank - 1]),
        node(
          'p',
          'muted',
          'R' + member.rank + ' Lv.' + member.level +
          '／HP ' + number(value.hp) +
          ' ATK ' + number(value.atk) +
          ' DEF ' + number(value.def)
        ),
        node(
          'p',
          'muted',
          member.level === D.rules.maxLevel
            ? '最大レベル'
            : 'EXP ' + number(member.exp) + '/' + number(neededExp(member.level))
        )
      );

      for (const id of definition.skills) {
        const skill = skillFor(id, member.rank);
        panel.append(node('p', 'muted', skill.name + '：' + skillDescription(skill)));
      }

      const button = node(
        'button',
        '',
        member.rank >= D.rules.maxRank ? '最大ランク' : '転生する'
      );

      button.disabled = isActive() ||
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
          'スキルも上位版になります。',
          'コインと突破状況は維持します。'
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
    const available = Math.min(save.highestCleared + 1, maxStage);
    const max = Math.min(count, available - (floor - 1) * count);
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
    return (Number($('floorSelect').value) - 1) *
      D.rules.stagesPerFloor +
      Number($('stageSelect').value);
  }

  function renderPreview() {
    const index = selectedIndex();

    if (!index) {
      return;
    }

    const names = encounterIds(index).map((id) => enemies.get(id).name);
    const reward = rewardFor(index);

    $('encounterPreview').textContent =
      areaFor(index).name + '／' + names.join('・') +
      '／EXP ' + number(reward.exp) +
      '／COIN ' + number(reward.coins);
  }

  function exportSave() {
    if (!save) {
      return;
    }

    const blob = new Blob(
      [JSON.stringify(save, null, 2)],
      { type: 'application/json' }
    );

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = 'towerquest-100stages-' +
      new Date().toISOString().slice(0, 10) + '.json';

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

      const result = normalizeSave(JSON.parse(await file.text()));

      const message = [
        '現在の進行を置き換えます。',
        '必要なら先にバックアップしてください。',
        '',
        'コイン：' + number(result.value.coins),
        '突破済み：' + result.value.highestCleared + '/100',
        result.migrated ? '旧セーブを新仕様へ移行します。' : '',
        result.capped ? '旧突破数を100へ補正します。' : '',
        result.battleReset ? '旧戦闘途中データは解除します。' : '',
        '',
        '読み込みますか？'
      ].filter(Boolean).join('\n');

      if (confirm(message)) {
        transact(() => {
          save = result.value;
          selectedEnemy = 0;
        });
      }
    } catch (error) {
      status('読み込みエラー：' + error.message);
    } finally {
      $('saveFile').value = '';
    }
  }
// File: game.js

/* ========================================
   戦闘演出キュー
   ======================================== */

const battleFxQueue = [];

let enemyFxActors = null;

function setBattleInputLocked(locked) {
  const app = document.querySelector('.app');

  if (app) {
    app.classList.toggle('is-animating', locked);
    app.setAttribute('aria-busy', String(locked));
  }

  if (locked || fatal) {
    document.querySelectorAll('button').forEach((button) => {
      button.disabled = true;
    });
  }

  // ロック解除時のボタン状態はrender()で復元する。
}

function queueBattleFx(event) {
  battleFxQueue.push(event);
}

function fxTarget(side, index) {
  const root = side === 'ally'
    ? $('party')
    : $('enemies');

  return root.children[index] || null;
}

function prefersReducedMotion() {
  return window.matchMedia(
    '(prefers-reduced-motion: reduce)'
  ).matches;
}

async function animateElement(element, frames, duration) {
  if (!element || typeof element.animate !== 'function') {
    return;
  }

  const animation = element.animate(frames, {
    duration: prefersReducedMotion()
      ? Math.min(duration, 100)
      : duration,
    easing: 'ease-out',
    fill: 'none'
  });

  try {
    await animation.finished;
  } catch (error) {
    // タブ切り替えなどで演出が中断されても進行は維持する。
  } finally {
    animation.cancel();
  }
}

async function animateAttackMove(element) {
  if (!element) {
    return;
  }

  element.classList.add('is-performing');

  try {
    const distance = prefersReducedMotion() ? 0 : 36;

    await animateElement(
      element,
      [
        { transform: 'translateY(0)' },
        {
          transform: 'translateY(-' + distance + 'px)',
          offset: 0.45
        },
        { transform: 'translateY(0)' }
      ],
      300
    );
  } finally {
    element.classList.remove('is-performing');
  }
}

async function animateShake(element) {
  if (!element) {
    return;
  }

  const distance = prefersReducedMotion() ? 0 : 6;

  await animateElement(
    element,
    [
      { transform: 'translateX(0)' },
      { transform: 'translateX(-' + distance + 'px)' },
      { transform: 'translateX(' + distance + 'px)' },
      { transform: 'translateX(-' + distance + 'px)' },
      { transform: 'translateX(' + distance + 'px)' },
      { transform: 'translateX(0)' }
    ],
    240
  );
}

async function showBattleNumber(element, amount, healing) {
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
    await animateElement(
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

async function showAttributeEffect(element, elementId, mode) {
  if (!element) {
    return;
  }

  const color = mode === 'heal'
    ? '#86efb7'
    : D.elements[elementId]?.color || '#ffffff';

  const effect = node(
    'div',
    'battle-effect effect-' + elementId + ' effect-' + mode
  );

  effect.style.setProperty('--effect-color', color);

  const ring = node('div', 'effect-ring');
  const core = node('div', 'effect-core');

  effect.append(ring, core);
  element.append(effect);

  const animations = [];

  animations.push(
    animateElement(
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
  );

  const baseTransform = mode === 'strike'
    ? 'translate(-50%, -50%) rotate(-35deg)'
    : 'translate(-50%, -50%)';

  animations.push(
    animateElement(
      core,
      [
        {
          opacity: 0,
          transform: baseTransform + ' scale(0.5)'
        },
        {
          opacity: 0.85,
          transform: baseTransform + ' scale(1)',
          offset: 0.35
        },
        {
          opacity: 0,
          transform: baseTransform + ' scale(1.3)'
        }
      ],
      320
    )
  );

  const count = prefersReducedMotion() ? 4 : 8;

  for (let i = 0; i < count; i += 1) {
    const particle = node('div', 'effect-particle');
    effect.append(particle);

    const angle = Math.PI * 2 * i / count;
    const distance = mode === 'heal' ? 28 : 38;
    const x = Math.cos(angle) * distance;
    const y = mode === 'heal'
      ? -20 - Math.abs(Math.sin(angle) * distance)
      : Math.sin(angle) * distance;

    animations.push(
      animateElement(
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
              'translate(calc(-50% + ' + x + 'px), ' +
              'calc(-50% + ' + y + 'px)) scale(0.8)'
          }
        ],
        420
      )
    );
  }

  try {
    await Promise.all(animations);
  } finally {
    effect.remove();
  }
}

async function playBattleFxQueue() {
  for (const event of battleFxQueue) {
    if (fatal) {
      break;
    }

    const target = fxTarget(event.side, event.index);

    if (event.kind === 'move') {
      await animateAttackMove(target);
      continue;
    }

    if (event.kind === 'cast') {
      await showAttributeEffect(
        target,
        event.element,
        'enhance'
      );
      continue;
    }

    if (event.kind === 'damage') {
      await Promise.all([
        animateShake(target),
        showBattleNumber(target, event.amount, false),
        showAttributeEffect(
          target,
          event.element,
          event.skill ? 'attack' : 'strike'
        )
      ]);

      continue;
    }

    if (event.kind === 'heal') {
      await Promise.all([
        showBattleNumber(target, event.amount, true),
        showAttributeEffect(target, event.element, 'heal')
      ]);

      continue;
    }

    if (event.kind === 'enhance') {
      await showAttributeEffect(
        target,
        event.element,
        'enhance'
      );

      continue;
    }

    if (event.kind === 'debuff') {
      await showAttributeEffect(
        target,
        event.element,
        'attack'
      );
    }
  }
}

/* ========================================
   既存の戦闘処理に演出イベントを追加
   ======================================== */

let activeSkillFx = false;

const performActionWithoutFx = performAction;

performAction = function (command, slot, allyIndex) {
  if (
    command === 'attack' &&
    isActive()
  ) {
    queueBattleFx({
      kind: 'move',
      side: 'ally',
      index: save.battle.actor
    });
  }

  return performActionWithoutFx(command, slot, allyIndex);
};

const hitEnemyWithoutFx = hitEnemy;

hitEnemy = function (
  actor,
  enemy,
  power,
  defenseScale = 1,
  modifier = 1
) {
  if (!enemy || enemy.hp <= 0) {
    return hitEnemyWithoutFx(
      actor,
      enemy,
      power,
      defenseScale,
      modifier
    );
  }

  const definition = characters.get(actor.id);
  const index = save.battle.enemies.indexOf(enemy);
  const before = enemy.hp;
  const mark = enemy.mark;

  // ダメージ数値は、HPを超えた分も含めて表示する。
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
      mark
    )
  );

  const result = hitEnemyWithoutFx(
    actor,
    enemy,
    power,
    defenseScale,
    modifier
  );

  if (enemy.hp < before) {
    queueBattleFx({
      kind: 'damage',
      side: 'enemy',
      index,
      element: definition.element,
      amount,
      skill: activeSkillFx
    });
  }

  return result;
};

const useSkillWithoutFx = useSkill;

useSkill = function (actor, slot, allyIndex) {
  const definition = characters.get(actor.id);
  const skill = skillFor(
    definition.skills[slot],
    actor.rank
  );

  const actorIndex = save.battle.allies.indexOf(actor);
  const target = targetEnemy();
  const targetIndex = save.battle.enemies.indexOf(target);

  queueBattleFx({
    kind: 'cast',
    side: 'ally',
    index: actorIndex,
    element: definition.element
  });

  const healTarget = skill.type === 'heal'
    ? save.battle.allies[allyIndex]
    : null;

  const previousHp = healTarget?.hp ?? 0;
  const previousSkillFx = activeSkillFx;

  let result;

  activeSkillFx = true;

  try {
    result = useSkillWithoutFx(actor, slot, allyIndex);
  } finally {
    activeSkillFx = previousSkillFx;
  }

  if (skill.type === 'heal') {
    queueBattleFx({
      kind: 'heal',
      side: 'ally',
      index: allyIndex,
      element: definition.element,
      amount: healTarget.hp - previousHp
    });
  } else if (
    skill.type === 'buff' ||
    skill.type === 'cover'
  ) {
    queueBattleFx({
      kind: 'enhance',
      side: 'ally',
      index: actorIndex,
      element: definition.element
    });
  } else if (skill.type === 'weaken') {
    save.battle.enemies.forEach((enemy, index) => {
      if (enemy.hp > 0) {
        queueBattleFx({
          kind: 'debuff',
          side: 'enemy',
          index,
          element: definition.element
        });
      }
    });
  } else if (skill.type === 'mark') {
    queueBattleFx({
      kind: 'debuff',
      side: 'enemy',
      index: targetIndex,
      element: definition.element
    });
  }

  return result;
};

const enemyPhaseWithoutFx = enemyPhase;

enemyPhase = function () {
  enemyFxActors = new Set();

  try {
    return enemyPhaseWithoutFx();
  } finally {
    enemyFxActors = null;
  }
};

const damageAllyWithoutFx = damageAlly;

damageAlly = function (
  enemy,
  target,
  power,
  enraged,
  single
) {
  const enemyIndex = save.battle.enemies.indexOf(enemy);
  const allyIndex = save.battle.allies.indexOf(target);

  // 全体攻撃でも、同じ敵の移動は1回だけにする。
  if (
    enemyFxActors &&
    !enemyFxActors.has(enemyIndex)
  ) {
    enemyFxActors.add(enemyIndex);

    queueBattleFx({
      kind: 'move',
      side: 'enemy',
      index: enemyIndex
    });
  }

  const definition = characters.get(target.id);
  const before = target.hp;

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

  const result = damageAllyWithoutFx(
    enemy,
    target,
    power,
    enraged,
    single
  );

  if (target.hp < before) {
    queueBattleFx({
      kind: 'damage',
      side: 'ally',
      index: allyIndex,
      element: enemy.element,
      amount,
      skill: power !== 1
    });
  }

  return result;
};
  function bindEvents() {
    $('openManagement').onclick = () => {
      if (!fatal && !busy && save) {
        renderManagement();
        $('management').showModal();
      }
    };

    $('closeManagement').onclick = () => $('management').close();

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
      const index = selectedIndex();

      if (transact(() => startBattle(index))) {
        $('management').close();
      }
    };

    $('retreat').onclick = () => {
      if (isActive() && confirm('撤退しますか？ この戦闘の報酬は獲得できません。')) {
        transact(() => {
          save.battle = null;
        });
      }
    };

    $('attack').onclick = () => transact(() => performAction('attack'));
    $('defend').onclick = () => transact(() => performAction('defend'));

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

    window.addEventListener('storage', (event) => {
      if (event.key !== SAVE_KEY && event.key !== null) {
        return;
      }

      fatal = true;

      document.querySelectorAll('button').forEach((button) => {
        button.disabled = true;
      });

      status('別タブで保存データが変わりました。再読み込みしてください。');
    });
  }

  bindEvents();
  boot();
})();
