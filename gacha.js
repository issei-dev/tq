// File: gacha.js

'use strict';

window.TQ_GACHA = (() => {
  const CONFIG = {
    singleCost: 500,
    elevenCost: 5000,
    characterDuplicateShards: 1,
    spiritDuplicateShards: 1
  };

  const SPIRITS = [
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

  const ITEMS = [
    {
      id: 'exp_boost_potion',
      name: '経験値2倍ポーション',
      description: '使用機能は次回実装'
    },
    {
      id: 'coin_boost_potion',
      name: 'コイン2倍ポーション',
      description: '使用機能は次回実装'
    }
  ];

  const $ = (id) => document.getElementById(id);

  let api = null;
  let drawing = false;
  let lastResults = [];

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

  // 剰余による偏りを避けた整数乱数。
  function randomInt(max) {
    if (
      !Number.isSafeInteger(max) ||
      max < 1 ||
      max > 4294967296
    ) {
      throw new Error('抽選範囲が不正です。');
    }

    if (!window.crypto?.getRandomValues) {
      throw new Error('この環境では安全な乱数を利用できません。');
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

  function addItem(save, id, amount) {
    let item = save.items.find((entry) => entry.id === id);

    if (!item) {
      item = {
        id,
        quantity: 0
      };

      save.items.push(item);
    }

    const next = item.quantity + amount;

    if (!Number.isSafeInteger(next)) {
      throw new Error('アイテムの所持上限です。');
    }

    item.quantity = next;
  }

  function characterPool() {
    return window.TQ_DATA.characters.filter((entry) => {
      return entry.gachaEnabled !== false;
    });
  }

  function drawOne(save) {
    const category = randomInt(100);

    if (category < 60) {
      const item = choose(ITEMS);
      addItem(save, item.id, 1);

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
          save,
          'character_shard_' + character.id,
          CONFIG.characterDuplicateShards
        );

        return {
          category: 'キャラクター',
          name: character.name,
          message:
            '重複 → キャラの欠片×' +
            CONFIG.characterDuplicateShards,
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

    const spirit = choose(SPIRITS);

    const owned = save.ownedSpirits.find((entry) => {
      return entry.id === spirit.id;
    });

    if (owned) {
      const next = owned.shards + CONFIG.spiritDuplicateShards;

      if (!Number.isSafeInteger(next)) {
        throw new Error('精霊の欠片の所持上限です。');
      }

      owned.shards = next;

      return {
        category: '精霊',
        name: spirit.name,
        message:
          '重複 → 精霊の欠片×' +
          CONFIG.spiritDuplicateShards,
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

  function itemLabel(id) {
    const definition = ITEMS.find((entry) => entry.id === id);

    if (definition) {
      return definition.name;
    }

    const prefix = 'character_shard_';

    if (id.startsWith(prefix)) {
      const characterId = id.slice(prefix.length);

      const character = window.TQ_DATA.characters.find((entry) => {
        return entry.id === characterId;
      });

      return (character?.name || characterId) + 'の欠片';
    }

    return id;
  }

  function renderResults() {
    const root = $('gachaResults');
    root.replaceChildren();

    if (lastResults.length === 0) {
      root.append(
        node('p', 'muted', 'この画面を開いてからの抽選結果を表示します。')
      );

      return;
    }

    lastResults.forEach((result, index) => {
      const card = node('article', 'gacha-result');

      if (result.isNew) {
        card.classList.add('gacha-new');
      }

      card.append(
        node(
          'p',
          'muted',
          (index + 1) + '. ' + result.category
        ),
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

  function renderInventory() {
    const save = api.getSave();
    const root = $('gachaInventory');
    root.replaceChildren();

    const items = save.items.filter((entry) => entry.quantity > 0);

    if (items.length === 0) {
      root.append(node('p', 'muted', '所持アイテムはありません。'));
      return;
    }

    for (const item of items) {
      root.append(
        node(
          'p',
          'muted',
          itemLabel(item.id) +
          ' ×' +
          item.quantity.toLocaleString('ja-JP')
        )
      );
    }
  }

  function render() {
    if (!api || !$('gachaDialog')) {
      return;
    }

    const save = api.getSave();

    if (!save) {
      return;
    }

    const active = save.battle?.state === 'active';
    const blocked = drawing || active;
    const hasCharacterPool = characterPool().length > 0;

    $('openGacha').disabled = blocked;
    $('closeGacha').disabled = drawing;

    $('gachaCoins').textContent =
      save.coins.toLocaleString('ja-JP') + ' COIN';

    $('gachaSingle').disabled =
      blocked ||
      !hasCharacterPool ||
      save.coins < CONFIG.singleCost;

    $('gachaEleven').disabled =
      blocked ||
      !hasCharacterPool ||
      save.coins < CONFIG.elevenCost;

    $('gachaMessage').textContent = drawing
      ? '抽選・保存中…'
      : active
        ? '戦闘中はガチャを利用できません。'
        : !hasCharacterPool
          ? 'キャラクターの抽選対象が未登録です。'
          : 'アイテム60％／キャラクター30％／精霊10％';

    renderInventory();
  }

  async function draw(count) {
    if (drawing || !api) {
      return;
    }

    if (count !== 1 && count !== 11) {
      return;
    }

    const cost = count === 1
      ? CONFIG.singleCost
      : CONFIG.elevenCost;

    const confirmed = confirm(
      cost.toLocaleString('ja-JP') +
      'コインで' +
      count +
      '回抽選しますか？'
    );

    if (!confirmed) {
      return;
    }

    drawing = true;
    render();

    let results = [];

    try {
      const success = await api.transact(() => {
        const save = api.getSave();

        if (save.battle?.state === 'active') {
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
          return drawOne(save);
        });
      });

      // 保存成功が確認できた結果のみ表示する。
      if (success) {
        lastResults = results;
        renderResults();
      }
    } finally {
      drawing = false;
      render();
    }
  }

  function createUI() {
    const section = node('section', 'management-section');
    const buttons = node('div', 'button-row');
    const open = node('button', '', 'ガチャ・所持アイテム');

    open.id = 'openGacha';

    buttons.append(open);

    section.append(
      node('h3', '', 'ガチャ'),
      buttons,
      node(
        'p',
        'muted',
        '1回500コイン／11回5,000コイン。戦闘中は利用できません。'
      )
    );

    $('management').append(section);

    const dialog = document.createElement('dialog');
    dialog.id = 'gachaDialog';

    const header = node('div', 'dialog-header');
    const close = node('button', '', '閉じる');
    close.id = 'closeGacha';

    header.append(
      node('h2', '', '召喚ガチャ'),
      close
    );

    const coins = node('p', 'coins');
    coins.id = 'gachaCoins';

    const message = node('p', 'muted');
    message.id = 'gachaMessage';

    const drawButtons = node('div', 'button-row');
    const single = node('button', 'primary', '1回｜500コイン');
    const eleven = node('button', 'primary', '11回｜5,000コイン');

    single.id = 'gachaSingle';
    eleven.id = 'gachaEleven';

    drawButtons.append(single, eleven);

    const results = node('div', 'gacha-results');
    results.id = 'gachaResults';
    results.setAttribute('aria-live', 'polite');

    const inventory = node('div', '');
    inventory.id = 'gachaInventory';

    dialog.append(
      header,
      coins,
      message,
      drawButtons,
      node(
        'p',
        'muted',
        '11回とも同じ確率で独立抽選します。レア保証はありません。'
      ),
      node('h3', '', '抽選結果'),
      results,
      node('h3', '', '所持アイテム'),
      inventory,
      node(
        'p',
        'muted',
        'ポーション使用・欠片交換は未実装です。精霊の欠片は精霊一覧で確認できます。'
      )
    );

    document.body.append(dialog);

    open.onclick = () => {
      if (drawing || api.getSave().battle?.state === 'active') {
        return;
      }

      lastResults = [];
      renderResults();
      render();
      dialog.showModal();
    };

    close.onclick = () => {
      if (!drawing) {
        dialog.close();
      }
    };

    single.onclick = () => draw(1);
    eleven.onclick = () => draw(11);

    dialog.addEventListener('cancel', (event) => {
      if (drawing) {
        event.preventDefault();
      }
    });
  }

  function init(callbacks) {
    if (api) {
      return;
    }

    api = callbacks;
    createUI();
    renderResults();
  }

  return {
    init,
    render
  };
})();
