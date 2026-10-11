// File: collection.js

'use strict';

window.TQ_COLLECTION = (() => {
  const CONFIG = {
    // 正式公開時にfalseへ変更する。
    enableTestSpiritGrant: true
  };

  const spiritDefinitions = [
    {
      id: 'luminaria',
      name: 'ルミナリア',
      englishName: 'Luminaria',
      element: 'light',
      description: '輝く光輪を纏う、原初の光を司る女神精霊'
    },
    {
      id: 'astraea',
      name: 'アストライア',
      englishName: 'Astraea',
      element: 'light',
      description: '星々の運行と調和を維持する、天界の守護精霊'
    },
    {
      id: 'seraphiel',
      name: 'セラフィエル',
      englishName: 'Seraphiel',
      element: 'light',
      description: '全属性の精霊を束ねる、真白き翼の熾天使'
    },
    {
      id: 'ignis',
      name: 'イグニス',
      englishName: 'Ignis',
      element: 'fire',
      description: '劫火から生まれた、炎の意志を宿す獣型精霊'
    },
    {
      id: 'vulcan',
      name: 'ヴァルカン',
      englishName: 'Vulcan',
      element: 'fire',
      description: '鍛冶と地熱を司る重装甲精霊'
    },
    {
      id: 'prometheus',
      name: 'プロメテウス',
      englishName: 'Prometheus',
      element: 'fire',
      description: '天界から至高の炎を盗み出した炎神'
    },
    {
      id: 'aquaria',
      name: 'アクアリア',
      englishName: 'Aquaria',
      element: 'water',
      description: '清らかな水流を操る、美しき水竜精霊'
    },
    {
      id: 'leviathan',
      name: 'レヴィアタン',
      englishName: 'Leviathan',
      element: 'water',
      description: '大海原の海底に眠り、荒波を起こす巨神精霊'
    },
    {
      id: 'celsius',
      name: 'セルシウス',
      englishName: 'Celsius',
      element: 'water',
      description: '絶対零度の氷雪を纏う氷精霊'
    },
    {
      id: 'voltris',
      name: 'ボルトリス',
      englishName: 'Voltris',
      element: 'thunder',
      description: '電撃を放ち、戦場を駆け抜ける紫電の雷獣'
    },
    {
      id: 'indra',
      name: 'インドラ',
      englishName: 'Indra',
      element: 'thunder',
      description: '天から雷霆を撃ち落とす、武勇の雷神'
    },
    {
      id: 'fulgur',
      name: 'フルグル',
      englishName: 'Fulgur',
      element: 'thunder',
      description: '高電圧を蓄え、過負荷を爆発させる閃光精霊'
    }
  ].map((definition) => ({
    ...definition,
    image: './assets/spirits/' + definition.id + '.png',
    target: definition.element === 'light'
      ? 'all'
      : definition.element,
    attackBonuses: definition.element === 'light'
      ? [0.1, 0.3, 0.5]
      : [0.3, 0.5, 0.8]
  }));

  const spirits = new Map(
    spiritDefinitions.map((definition) => [
      definition.id,
      definition
    ])
  );

  const $ = (id) => document.getElementById(id);
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const number = (value) => Number(value).toLocaleString('ja-JP');

  let api = null;
  let tab = 'characters';
  let draft = null;

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

  function requireInteger(value, min, max, label) {
    if (
      !Number.isSafeInteger(value) ||
      value < min ||
      value > max
    ) {
      throw new Error(label + 'が不正です。');
    }

    return value;
  }

  function requiredExp(level) {
    const config = window.TQ_DATA.rules.levelExp;

    return Math.floor(
      config.base +
      config.linear * level +
      config.quadratic * level * level
    );
  }

  function characterState(raw) {
    const D = window.TQ_DATA;
    const definition = D.characters.find((item) => {
      return item.id === raw?.id;
    });

    if (!definition) {
      throw new Error('所持キャラクターの定義がありません。');
    }

    const level = requireInteger(
      raw.level,
      1,
      D.rules.maxLevel,
      '所持キャラのレベル'
    );

    const rank = requireInteger(
      raw.rank,
      1,
      D.rules.maxRank,
      '所持キャラのランク'
    );

    const exp = requireInteger(
      raw.exp,
      0,
      Number.MAX_SAFE_INTEGER,
      '所持キャラの経験値'
    );

    if (
      (level === D.rules.maxLevel && exp !== 0) ||
      (level < D.rules.maxLevel && exp >= requiredExp(level))
    ) {
      throw new Error('所持キャラのレベルと経験値が一致しません。');
    }

    return {
      id: raw.id,
      level,
      rank,
      exp
    };
  }

  // 既存セーブへ所持・編成データを追加する。
  // すでに追加済みの場合は、内容を検証して読み込む。
  function hydrate(base, raw = base) {
    const result = clone(base);

    if (raw.collectionVersion === undefined) {
      result.collectionVersion = 1;
      result.ownedCharacters = result.party.map(characterState);
      result.ownedSpirits = [];
      result.items = [];
      result.formation = {
        characterIds: result.party.map((member) => member.id),
        spiritId: null
      };

      return result;
    }

    if (raw.collectionVersion !== 1) {
      throw new Error('対応していない所持データ形式です。');
    }

    if (
      !Array.isArray(raw.ownedCharacters) ||
      !Array.isArray(raw.ownedSpirits) ||
      !Array.isArray(raw.items) ||
      !raw.formation
    ) {
      throw new Error('所持データが不正です。');
    }

    const ownedCharacters = raw.ownedCharacters.map(characterState);
    const characterIds = new Set(
      ownedCharacters.map((member) => member.id)
    );

    if (
      ownedCharacters.length < 4 ||
      characterIds.size !== ownedCharacters.length
    ) {
      throw new Error('所持キャラクターに不足または重複があります。');
    }

    const ownedSpirits = raw.ownedSpirits.map((entry) => {
      if (!spirits.has(entry?.id)) {
        throw new Error('所持精霊の定義がありません。');
      }

      return {
        id: entry.id,
        rank: requireInteger(entry.rank, 1, 3, '精霊ランク'),
        shards: requireInteger(
          entry.shards ?? 0,
          0,
          Number.MAX_SAFE_INTEGER,
          '精霊の欠片'
        )
      };
    });

    const spiritIds = new Set(
      ownedSpirits.map((entry) => entry.id)
    );

    if (spiritIds.size !== ownedSpirits.length) {
      throw new Error('所持精霊が重複しています。');
    }

    const items = raw.items.map((entry) => {
      if (
        typeof entry?.id !== 'string' ||
        !/^[a-zA-Z0-9_-]{1,80}$/.test(entry.id)
      ) {
        throw new Error('アイテムIDが不正です。');
      }

      return {
        id: entry.id,
        quantity: requireInteger(
          entry.quantity,
          0,
          Number.MAX_SAFE_INTEGER,
          'アイテム数量'
        )
      };
    });

    if (new Set(items.map((entry) => entry.id)).size !== items.length) {
      throw new Error('所持アイテムが重複しています。');
    }

    const selectedIds = raw.formation.characterIds;

    if (
      !Array.isArray(selectedIds) ||
      selectedIds.length !== 4 ||
      new Set(selectedIds).size !== 4 ||
      selectedIds.some((id) => !characterIds.has(id))
    ) {
      throw new Error('出撃編成が不正です。');
    }

    const spiritId = raw.formation.spiritId ?? null;

    if (spiritId !== null && !spiritIds.has(spiritId)) {
      throw new Error('未所持の精霊が装備されています。');
    }

    result.collectionVersion = 1;
    result.ownedCharacters = ownedCharacters;
    result.ownedSpirits = ownedSpirits;
    result.items = items;
    result.formation = {
      characterIds: [...selectedIds],
      spiritId
    };

    const ownedMap = new Map(
      ownedCharacters.map((member) => [member.id, member])
    );

    // 出撃中のpartyは、所持データから作成する。
    result.party = selectedIds.map((id) => {
      return clone(ownedMap.get(id));
    });

    return result;
  }

  // 戦闘・転生で更新された出撃キャラを所持データへ反映する。
  function syncParty(save) {
    const ownedMap = new Map(
      save.ownedCharacters.map((member) => [
        member.id,
        member
      ])
    );

    for (const member of save.party) {
      if (!ownedMap.has(member.id)) {
        throw new Error('出撃キャラが所持データにありません。');
      }

      ownedMap.set(member.id, characterState(member));
    }

    save.ownedCharacters = Array.from(ownedMap.values());
  }

  function equippedSpirit(save) {
    const id = save.formation?.spiritId;

    if (!id) {
      return null;
    }

    const owned = save.ownedSpirits.find((entry) => {
      return entry.id === id;
    });

    const definition = spirits.get(id);

    if (!owned || !definition) {
      throw new Error('装備中の精霊が不正です。');
    }

    return {
      ...definition,
      rank: owned.rank,
      shards: owned.shards,
      bonus: definition.attackBonuses[owned.rank - 1]
    };
  }

  function attackWithBlessing(save, characterId, baseAtk) {
    const spirit = equippedSpirit(save);

    if (!spirit) {
      return baseAtk;
    }

    const character = window.TQ_DATA.characters.find((entry) => {
      return entry.id === characterId;
    });

    const applies = spirit.target === 'all' ||
      spirit.target === character.element;

    return applies
      ? Math.floor(baseAtk * (1 + spirit.bonus))
      : baseAtk;
  }

  function blessingText(spirit) {
    if (!spirit) {
      return '精霊未装備';
    }

    const target = spirit.target === 'all'
      ? '全員'
      : window.TQ_DATA.elements[spirit.target].name + '属性';

    const bonus = spirit.bonus ??
      spirit.attackBonuses[spirit.rank - 1];

    return target + 'のATK＋' + Math.round(bonus * 100) + '％';
  }

  function setFormation(save, ids, spiritId) {
    if (save.battle?.state === 'active') {
      throw new Error('戦闘中は編成を変更できません。');
    }

    syncParty(save);

    const ownedMap = new Map(
      save.ownedCharacters.map((member) => [
        member.id,
        member
      ])
    );

    if (
      ids.length !== 4 ||
      new Set(ids).size !== 4 ||
      ids.some((id) => !ownedMap.has(id))
    ) {
      throw new Error('異なる所持キャラを4人選んでください。');
    }

    if (
      spiritId !== null &&
      !save.ownedSpirits.some((entry) => entry.id === spiritId)
    ) {
      throw new Error('その精霊は所持していません。');
    }

    save.formation = {
      characterIds: [...ids],
      spiritId
    };

    save.party = ids.map((id) => clone(ownedMap.get(id)));

    // 終了済み戦闘の旧パーティ表示を解除する。
    save.battle = null;
  }

  function placeholder(element, spirit) {
    const color = window.TQ_DATA.elements[element].color;

    const svg = [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 300">',
      '<g fill="' + color + '">',
      spirit
        ? '<path d="M100 35 L160 130 L100 255 L40 130 Z"/>'
        : '<circle cx="100" cy="65" r="32"/>',
      spirit
        ? '<circle cx="100" cy="135" r="28" fill="#fff" opacity=".55"/>'
        : '<path d="M65 110 L135 110 L160 280 L40 280 Z"/>',
      '</g>',
      '</svg>'
    ].join('');

    return 'data:image/svg+xml;charset=utf-8,' +
      encodeURIComponent(svg);
  }

  function cardImage(paths, element, spirit) {
    const image = document.createElement('img');
    const candidates = [
      ...paths.filter(Boolean),
      placeholder(element, spirit)
    ];

    let index = 0;

    image.className = spirit
      ? 'collection-image spirit-image'
      : 'collection-image';

    image.alt = '';
    image.loading = 'lazy';
    image.decoding = 'async';

    image.onerror = () => {
      index += 1;

      if (index < candidates.length) {
        image.src = candidates[index];
      } else {
        image.onerror = null;
      }
    };

    image.src = candidates[0];

    return image;
  }

  function renderList() {
    if (!api) {
      return;
    }

    const save = api.getSave();
    const root = $('collectionList');

    root.replaceChildren();

    $('showCharacters').setAttribute(
      'aria-pressed',
      String(tab === 'characters')
    );

    $('showSpirits').setAttribute(
      'aria-pressed',
      String(tab === 'spirits')
    );

    if (tab === 'characters') {
      $('collectionTitle').textContent = '所持キャラクター';

      for (const member of save.ownedCharacters) {
        const definition = window.TQ_DATA.characters.find((entry) => {
          return entry.id === member.id;
        });

        const value = api.stats(member);
        const card = node('article', 'collection-card');

        card.append(
          cardImage(
            definition.portraits.slice(0, member.rank).reverse(),
            definition.element,
            false
          ),
          node('strong', '', definition.name),
          node(
            'p',
            'muted',
            window.TQ_DATA.elements[definition.element].name +
            '／R' + member.rank + ' Lv.' + member.level
          ),
          node(
            'p',
            'muted',
            definition.jobs[member.rank - 1]
          ),
          node(
            'p',
            'muted',
            'HP ' + number(value.hp) +
            '／ATK ' + number(value.atk) +
            '／DEF ' + number(value.def)
          )
        );

        if (save.formation.characterIds.includes(member.id)) {
          card.append(node('p', 'collection-equipped', '出撃中'));
        }

        root.append(card);
      }

      return;
    }

    $('collectionTitle').textContent = '所持精霊';

    if (save.ownedSpirits.length === 0) {
      root.append(
        node('p', 'muted', '精霊をまだ所持していません。')
      );
    }

    for (const entry of save.ownedSpirits) {
      const definition = spirits.get(entry.id);

      const spirit = {
        ...definition,
        rank: entry.rank,
        bonus: definition.attackBonuses[entry.rank - 1]
      };

      const card = node('article', 'collection-card');

      card.append(
        cardImage([definition.image], definition.element, true),
        node('strong', '', definition.name),
        node(
          'p',
          'muted',
          window.TQ_DATA.elements[definition.element].name +
          '／R' + entry.rank
        ),
        node('p', 'muted', blessingText(spirit)),
        node('p', 'muted', definition.description),
        node('p', 'muted', '欠片：' + number(entry.shards))
      );

      if (save.formation.spiritId === entry.id) {
        card.append(node('p', 'collection-equipped', '装備中'));
      }

      root.append(card);
    }
  }

  function renderFormation() {
    if (!api || !draft) {
      return;
    }

    const save = api.getSave();
    const root = $('formationCharacters');

    root.replaceChildren();

    for (let index = 0; index < 4; index += 1) {
      const label = node(
        'label',
        'formation-slot',
        '行動順 ' + (index + 1)
      );

      const select = document.createElement('select');

      for (const member of save.ownedCharacters) {
        const definition = window.TQ_DATA.characters.find((entry) => {
          return entry.id === member.id;
        });

        const option = node(
          'option',
          '',
          definition.name + '／R' + member.rank + ' Lv.' + member.level
        );

        option.value = member.id;
        select.append(option);
      }

      select.value = draft.characterIds[index];

      select.onchange = () => {
        draft.characterIds[index] = select.value;
        renderFormationPreview();
      };

      label.append(select);
      root.append(label);
    }

    const spiritSelect = $('formationSpirit');
    spiritSelect.replaceChildren();

    const emptyOption = node('option', '', '精霊なし');
    emptyOption.value = '';
    spiritSelect.append(emptyOption);

    for (const entry of save.ownedSpirits) {
      const definition = spirits.get(entry.id);
      const option = node(
        'option',
        '',
        definition.name + '／R' + entry.rank
      );

      option.value = entry.id;
      spiritSelect.append(option);
    }

    spiritSelect.value = draft.spiritId || '';

    spiritSelect.onchange = () => {
      draft.spiritId = spiritSelect.value || null;
      renderFormationPreview();
    };

    renderFormationPreview();
  }

  function renderFormationPreview() {
    const save = api.getSave();
    const root = $('formationPreview');

    root.replaceChildren();

    const valid = new Set(draft.characterIds).size === 4;
    const active = save.battle?.state === 'active';

    $('saveFormation').disabled = !valid || active;

    if (!valid) {
      root.append(
        node('p', 'muted', '同じキャラクターを複数枠には配置できません。')
      );
    }

    if (active) {
      root.append(
        node('p', 'muted', '戦闘中は編成を変更できません。')
      );
    }

    const previewSave = {
      ...save,
      formation: draft
    };

    const spirit = equippedSpirit(previewSave);

    if (spirit) {
      root.append(
        cardImage([spirit.image], spirit.element, true),
        node(
          'strong',
          '',
          spirit.name + ' R' + spirit.rank
        )
      );
    }

    root.append(node('p', 'muted', blessingText(spirit)));

    for (const id of draft.characterIds) {
      const member = save.ownedCharacters.find((entry) => entry.id === id);
      const definition = window.TQ_DATA.characters.find((entry) => entry.id === id);
      const base = api.stats(member).atk;

      root.append(
        node(
          'p',
          'muted',
          definition.name +
          '：ATK ' + number(base) +
          ' → ' + number(attackWithBlessing(previewSave, id, base))
        )
      );
    }
  }

  function render() {
    if (!api) {
      return;
    }

    const save = api.getSave();
    const spirit = equippedSpirit(save);

    $('blessingStatus').textContent = spirit
      ? spirit.name + ' R' + spirit.rank + '｜' + blessingText(spirit)
      : '精霊未装備';

    $('grantTestSpirit').hidden = !CONFIG.enableTestSpiritGrant;
    $('grantTestSpirit').disabled =
      save.battle?.state === 'active' ||
      save.ownedSpirits.some((entry) => entry.id === 'luminaria');

    if ($('collectionDialog').open) {
      renderList();
    }
  }

  function init(callbacks) {
    api = callbacks;

    $('openCollection').onclick = () => {
      tab = 'characters';
      renderList();
      $('collectionDialog').showModal();
    };

    $('closeCollection').onclick = () => {
      $('collectionDialog').close();
    };

    $('showCharacters').onclick = () => {
      tab = 'characters';
      renderList();
    };

    $('showSpirits').onclick = () => {
      tab = 'spirits';
      renderList();
    };

    $('openFormation').onclick = () => {
      draft = clone(api.getSave().formation);
      renderFormation();
      $('formationDialog').showModal();
    };

    $('closeFormation').onclick = () => {
      $('formationDialog').close();
      draft = null;
    };

    $('saveFormation').onclick = async () => {
      const selected = clone(draft);

      const success = await api.transact(() => {
        setFormation(
          api.getSave(),
          selected.characterIds,
          selected.spiritId
        );
      });

      if (success) {
        $('formationDialog').close();
        draft = null;
      }
    };

    $('grantTestSpirit').onclick = async () => {
      await api.transact(() => {
        const save = api.getSave();

        if (
          !CONFIG.enableTestSpiritGrant ||
          save.battle?.state === 'active'
        ) {
          throw new Error('テスト精霊を付与できません。');
        }

        if (save.ownedSpirits.some((entry) => entry.id === 'luminaria')) {
          throw new Error('ルミナリアは獲得済みです。');
        }

        save.ownedSpirits.push({
          id: 'luminaria',
          rank: 1,
          shards: 0
        });
      });
    };
  }

  return {
    init,
    render,
    hydrate,
    syncParty,
    attackWithBlessing,
    equippedSpirit,
    blessingText
  };
})();
