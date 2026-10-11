// File: spirit-upgrade.js

'use strict';

window.TQ_SPIRIT_UPGRADE = (() => {
  const $ = (id) => document.getElementById(id);

  const UPGRADE_COSTS = {
    1: 3,
    2: 6
  };

  const DEFINITIONS = [
    {
      id: 'luminaria',
      name: 'ルミナリア',
      element: 'light'
    },
    {
      id: 'astraea',
      name: 'アストライア',
      element: 'light'
    },
    {
      id: 'seraphiel',
      name: 'セラフィエル',
      element: 'light'
    },
    {
      id: 'ignis',
      name: 'イグニス',
      element: 'fire'
    },
    {
      id: 'vulcan',
      name: 'ヴァルカン',
      element: 'fire'
    },
    {
      id: 'prometheus',
      name: 'プロメテウス',
      element: 'fire'
    },
    {
      id: 'aquaria',
      name: 'アクアリア',
      element: 'water'
    },
    {
      id: 'leviathan',
      name: 'レヴィアタン',
      element: 'water'
    },
    {
      id: 'celsius',
      name: 'セルシウス',
      element: 'water'
    },
    {
      id: 'voltris',
      name: 'ボルトリス',
      element: 'thunder'
    },
    {
      id: 'indra',
      name: 'インドラ',
      element: 'thunder'
    },
    {
      id: 'fulgur',
      name: 'フルグル',
      element: 'thunder'
    }
  ];

  const definitions = new Map(
    DEFINITIONS.map((entry) => [entry.id, entry])
  );

  let api = null;
  let upgrading = false;

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

  function isActive(save) {
    return save.battle?.state === 'active';
  }

  // 加護値はcollection.jsの既存処理から取得する。
  // このファイルに別の加護倍率を持たせない。
  function blessingFor(save, id, rank) {
    const owned = save.ownedSpirits.find((entry) => {
      return entry.id === id;
    });

    if (!owned) {
      throw new Error('その精霊は所持していません。');
    }

    const previewSave = {
      ...save,
      formation: {
        ...save.formation,
        spiritId: id
      },
      ownedSpirits: save.ownedSpirits.map((entry) => {
        return entry.id === id
          ? {
              ...entry,
              rank
            }
          : entry;
      })
    };

    const spirit = window.TQ_COLLECTION.equippedSpirit(
      previewSave
    );

    if (!spirit) {
      throw new Error('精霊の加護を取得できません。');
    }

    return window.TQ_COLLECTION.blessingText(spirit);
  }

  function spiritImage(definition) {
    const image = document.createElement('img');
    const color = window.TQ_DATA.elements[
      definition.element
    ].color;

    const svg = [
      '<svg xmlns="http://www.w3.org/2000/svg"',
      ' viewBox="0 0 200 300">',
      '<path d="M100 35 L160 130 L100 255 L40 130 Z"',
      ' fill="' + color + '"/>',
      '<circle cx="100" cy="135" r="28"',
      ' fill="#fff" opacity=".55"/>',
      '</svg>'
    ].join('');

    image.className = 'spirit-upgrade-image';
    image.alt = definition.name;
    image.loading = 'lazy';
    image.decoding = 'async';

    image.onerror = () => {
      image.onerror = null;
      image.src = 'data:image/svg+xml;charset=utf-8,' +
        encodeURIComponent(svg);
    };

    image.src = './assets/spirits/' +
      definition.id +
      '.png';

    return image;
  }

  async function upgrade(id) {
    if (upgrading || !api) {
      return;
    }

    const save = api.getSave();
    const owned = save.ownedSpirits.find((entry) => {
      return entry.id === id;
    });

    const definition = definitions.get(id);

    if (
      !owned ||
      !definition ||
      isActive(save) ||
      owned.rank >= 3
    ) {
      return;
    }

    const expectedRank = owned.rank;
    const cost = UPGRADE_COSTS[expectedRank];

    if (owned.shards < cost) {
      return;
    }

    const confirmed = confirm(
      [
        definition.name + 'を強化しますか？',
        'ランク' + expectedRank +
          ' → ランク' + (expectedRank + 1),
        '',
        '現在：' + blessingFor(save, id, expectedRank),
        '強化後：' + blessingFor(
          save,
          id,
          expectedRank + 1
        ),
        '',
        'この精霊の欠片を' + cost + '個消費します。',
        '装備中の場合、次の戦闘から強化した加護が適用されます。'
      ].join('\n')
    );

    if (!confirmed) {
      return;
    }

    upgrading = true;
    render();

    try {
      const success = await api.transact(() => {
        const currentSave = api.getSave();

        if (isActive(currentSave)) {
          throw new Error('戦闘中は精霊を強化できません。');
        }

        const current = currentSave.ownedSpirits.find((entry) => {
          return entry.id === id;
        });

        if (
          !current ||
          current.rank !== expectedRank ||
          current.rank >= 3
        ) {
          throw new Error('精霊のランクが変わりました。');
        }

        const required = UPGRADE_COSTS[current.rank];

        if (
          !Number.isSafeInteger(current.shards) ||
          current.shards < required
        ) {
          throw new Error('精霊の欠片が不足しています。');
        }

        current.shards -= required;
        current.rank += 1;
      });

      if (success) {
        $('spiritUpgradeNotice').textContent =
          definition.name +
          'がランク' +
          (expectedRank + 1) +
          'になりました。';
      }
    } finally {
      upgrading = false;
      render();
    }
  }

  function renderCards(save) {
    const root = $('spiritUpgradeList');
    root.replaceChildren();

    if (save.ownedSpirits.length === 0) {
      root.append(
        node(
          'p',
          'muted',
          '精霊をまだ所持していません。ガチャで獲得できます。'
        )
      );

      return;
    }

    for (const owned of save.ownedSpirits) {
      const definition = definitions.get(owned.id);

      if (!definition) {
        root.append(
          node(
            'p',
            'muted',
            '未対応の精霊：' + owned.id
          )
        );

        continue;
      }

      const card = node('article', 'spirit-upgrade-card');
      const equipped = save.formation.spiritId === owned.id;

      card.append(
        spiritImage(definition),
        node(
          'strong',
          '',
          definition.name +
          '｜R' +
          owned.rank +
          (equipped ? '｜装備中' : '')
        ),
        node(
          'p',
          'muted',
          blessingFor(save, owned.id, owned.rank)
        ),
        node(
          'p',
          'muted',
          '所持している欠片：' +
          owned.shards.toLocaleString('ja-JP') +
          '個'
        )
      );

      if (owned.rank >= 3) {
        card.append(
          node(
            'p',
            'spirit-upgrade-max',
            '最大ランク'
          )
        );
      } else {
        const cost = UPGRADE_COSTS[owned.rank];
        const missing = Math.max(0, cost - owned.shards);

        card.append(
          node(
            'p',
            'muted',
            '次の加護：' +
            blessingFor(save, owned.id, owned.rank + 1)
          ),
          node(
            'p',
            'muted',
            '必要な欠片：' +
            cost +
            '個' +
            (missing > 0
              ? '／あと' + missing + '個'
              : '')
          )
        );

        const button = node(
          'button',
          'primary',
          'ランク' + (owned.rank + 1) + 'へ強化'
        );

        button.disabled =
          upgrading ||
          api.isBlocked() ||
          isActive(save) ||
          missing > 0;

        button.onclick = () => upgrade(owned.id);

        card.append(button);
      }

      root.append(card);
    }
  }

  function render() {
    if (!api || !$('spiritUpgradeDialog')) {
      return;
    }

    const save = api.getSave();

    if (!save) {
      return;
    }

    const blocked = upgrading || api.isBlocked();

    $('openSpiritUpgrade').disabled =
      blocked ||
      isActive(save);

    $('closeSpiritUpgrade').disabled = blocked;

    $('spiritUpgradeState').textContent = isActive(save)
      ? '戦闘中は強化できません。'
      : 'ランク1→2：欠片3個／ランク2→3：欠片6個';

    if ($('spiritUpgradeDialog').open) {
      renderCards(save);
    }
  }

  function createUI() {
    const section = node('section', 'management-section');
    const buttons = node('div', 'button-row');
    const open = node('button', '', '精霊を強化');

    open.id = 'openSpiritUpgrade';
    buttons.append(open);

    section.append(
      node('h3', '', '精霊強化'),
      buttons,
      node(
        'p',
        'muted',
        '重複獲得で集めた精霊の欠片を使用します。最大ランク3。'
      )
    );

    $('management').append(section);

    const dialog = document.createElement('dialog');
    dialog.id = 'spiritUpgradeDialog';

    const header = node('div', 'dialog-header');
    const close = node('button', '', '閉じる');

    close.id = 'closeSpiritUpgrade';

    header.append(
      node('h2', '', '精霊強化'),
      close
    );

    const state = node('p', 'muted');
    state.id = 'spiritUpgradeState';

    const notice = node('p', 'spirit-upgrade-notice');
    notice.id = 'spiritUpgradeNotice';
    notice.setAttribute('role', 'status');
    notice.setAttribute('aria-live', 'polite');

    const list = node('div', 'spirit-upgrade-grid');
    list.id = 'spiritUpgradeList';

    dialog.append(
      header,
      state,
      node(
        'p',
        'muted',
        '対象精霊自身の欠片だけを使用します。' +
        '強化しても、未装備の精霊は自動装備されません。'
      ),
      notice,
      list
    );

    document.body.append(dialog);

    open.onclick = () => {
      if (
        upgrading ||
        api.isBlocked() ||
        isActive(api.getSave())
      ) {
        return;
      }

      notice.textContent = '';
      dialog.showModal();
      render();
    };

    close.onclick = () => {
      if (!upgrading && !api.isBlocked()) {
        dialog.close();
      }
    };

    dialog.addEventListener('cancel', (event) => {
      if (upgrading || api.isBlocked()) {
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
  }

  return {
    init,
    render
  };
})();
