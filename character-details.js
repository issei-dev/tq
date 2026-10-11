// File: character-details.js

'use strict';

window.TQ_CHARACTER_DETAILS = (() => {
  const $ = (id) => document.getElementById(id);

  // 各ページのvoiceに音声ファイルのパスを設定すると、
  // そのページに再生ボタンを表示する。
  const STORIES = {
    valeon: [
      {
        rank: 1,
        title: '境界に残された剣',
        pages: [
          {
            speaker: 'ヴァレオン',
            text:
              '境界の門には、もう誰もいない。' +
              'それでも、この剣を置いていくことはできなかった。',
            voice: null
          },
          {
            speaker: 'ヴァレオン',
            text:
              '塔の中に、守護者たちの記録があるという。' +
              '彼らが何を守り、なぜ姿を消したのか。俺はそれを確かめたい。',
            voice: null
          },
          {
            speaker: 'ヴァレオン',
            text:
              'お前たちの道まで、闇に渡すつもりはない。' +
              '進め。背中は俺が守る。',
            voice: null
          }
        ]
      },
      {
        rank: 2,
        title: '闇に誓う',
        pages: [
          {
            speaker: 'ヴァレオン',
            text:
              '深い闇に触れるほど、昔の声が聞こえる。' +
              '戻れ、と。ここから先を知るな、と。',
            voice: null
          },
          {
            speaker: 'ヴァレオン',
            text:
              'だが、恐れだけで剣を握っていた頃とは違う。' +
              '今は、隣を歩く者たちの足音が聞こえる。',
            voice: null
          },
          {
            speaker: 'ヴァレオン',
            text:
              '闇は俺の敵であり、力でもある。' +
              'どちらになるかは、この剣を振るう俺が決める。',
            voice: null
          }
        ]
      },
      {
        rank: 3,
        title: '夜蝕の向こうへ',
        pages: [
          {
            speaker: 'ヴァレオン',
            text:
              '守護者たちは、光を取り戻すために闇を引き受けた。' +
              'その記録を読んだ時、ようやくこの剣の重さが分かった。',
            voice: null
          },
          {
            speaker: 'ヴァレオン',
            text:
              '同じ道を、同じ結末まで歩く必要はない。' +
              '俺には今、一人では見つけられなかった道が見えている。',
            voice: null
          },
          {
            speaker: 'ヴァレオン',
            text:
              '夜蝕は、終わらない夜ではない。' +
              '光が戻るまでの間だけ、俺たちがここを守ればいい。',
            voice: null
          }
        ]
      }
    ],
    igresia: [
      {
        rank: 1,
        title: '消えない火種',
        pages: [
          {
            speaker: 'イグレシア',
            text:
              '炎は、壊すためだけのものではないの。' +
              '冷えた手を温める、小さな火だってあるでしょう？',
            voice: null
          },
          {
            speaker: 'イグレシア',
            text:
              '塔には、不死鳥の火種が眠っているという記録がある。' +
              'もし本当なら、失われた土地にも、もう一度芽が出るかもしれない。',
            voice: null
          },
          {
            speaker: 'イグレシア',
            text:
              'まずは、目の前にいる人を守りたい。' +
              '大きな奇跡を待つより、今できることを一つずつ。',
            voice: null
          }
        ]
      },
      {
        rank: 2,
        title: '灰の中の温度',
        pages: [
          {
            speaker: 'イグレシア',
            text:
              '強い炎ほど、扱いを間違えれば何も残さない。' +
              '力を得たのに、前より慎重になってしまったわ。',
            voice: null
          },
          {
            speaker: 'イグレシア',
            text:
              'でも、灰の下には温もりが残ることがある。' +
              '消えたように見えても、まだ終わっていない命がある。',
            voice: null
          },
          {
            speaker: 'イグレシア',
            text:
              'その小さな温度を、見逃したくない。' +
              '私の炎は、もう一度立ち上がるために使う。',
            voice: null
          }
        ]
      },
      {
        rank: 3,
        title: '再生の翼',
        pages: [
          {
            speaker: 'イグレシア',
            text:
              '火種を見つければ、すべてが元に戻ると思っていた。' +
              'でも、再生は過去をそのまま取り戻すことではなかった。',
            voice: null
          },
          {
            speaker: 'イグレシア',
            text:
              '失ったものを抱えたまま、新しい命を育てていく。' +
              '不死鳥の炎は、そのための力だったのね。',
            voice: null
          },
          {
            speaker: 'イグレシア',
            text:
              '行きましょう。塔の向こうにも、私たちを待つ土地がある。' +
              '今度は、この炎で未来を灯したい。',
            voice: null
          }
        ]
      }
    ]
  };

  let api = null;
  let selectedId = null;
  let selectedEpisode = 0;
  let pageIndex = 0;
  let audio = null;

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

  function stopVoice() {
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      audio = null;
    }
  }

  function selectedMember() {
    return api.getSave().ownedCharacters.find((entry) => {
      return entry.id === selectedId;
    });
  }

  function portrait(definition, rank) {
    const image = document.createElement('img');

    const color = window.TQ_DATA.elements[
      definition.element
    ].color;

    const svg = [
      '<svg xmlns="http://www.w3.org/2000/svg"',
      ' viewBox="0 0 120 160">',
      '<g fill="' + color + '">',
      '<circle cx="60" cy="36" r="22"/>',
      '<path d="M35 65 Q60 53 85 65 L103 150 L17 150 Z"/>',
      '</g>',
      '</svg>'
    ].join('');

    const candidates = [
      ...definition.portraits
        .slice(0, rank)
        .reverse()
        .filter(Boolean),
      'data:image/svg+xml;charset=utf-8,' +
        encodeURIComponent(svg)
    ];

    let index = 0;

    image.className = 'detail-portrait';
    image.alt = definition.name;
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

  function renderProfile(member, definition) {
    const root = $('characterDetailProfile');
    const value = api.stats(member);

    const blessedAtk = window.TQ_COLLECTION.attackWithBlessing(
      api.getSave(),
      member.id,
      value.atk
    );

    root.replaceChildren();

    const info = node('div', 'detail-profile-text');

    info.append(
      node('h3', '', definition.name),
      node(
        'p',
        'muted',
        window.TQ_DATA.elements[definition.element].name +
        '属性／R' +
        member.rank +
        ' Lv.' +
        member.level
      ),
      node(
        'p',
        '',
        definition.jobs[member.rank - 1]
      ),
      node(
        'p',
        'muted',
        'HP ' +
        value.hp.toLocaleString('ja-JP') +
        '／ATK ' +
        value.atk.toLocaleString('ja-JP') +
        '／DEF ' +
        value.def.toLocaleString('ja-JP')
      ),
      node(
        'p',
        'muted',
        '装備精霊の加護適用後ATK：' +
        blessedAtk.toLocaleString('ja-JP')
      )
    );

    if (definition.profile?.title) {
      info.append(
        node('strong', '', definition.profile.title)
      );
    }

    info.append(
      node(
        'p',
        'muted',
        definition.profile?.description ||
        'プロフィール本文は未登録です。'
      )
    );

    root.append(
      portrait(definition, member.rank),
      info
    );

    const skillRoot = $('characterDetailSkills');
    skillRoot.replaceChildren();

    for (const id of definition.skills) {
      const skill = api.skillFor(id, member.rank);

      const panel = node('div', 'detail-skill');

      panel.append(
        node('strong', '', skill.name),
        node('p', 'muted', api.skillDescription(skill)),
        node(
          'p',
          'muted',
          '再使用まで：' + skill.cooldown + '手番'
        )
      );

      skillRoot.append(panel);
    }
  }

  function renderStory(member) {
    const episodes = STORIES[member.id] || [];
    const tabs = $('characterStoryEpisodes');
    const root = $('characterStoryPage');

    tabs.replaceChildren();
    root.replaceChildren();

    if (episodes.length === 0) {
      root.append(
        node('p', 'muted', 'このキャラクターのストーリーは未登録です。')
      );

      return;
    }

    if (
      !episodes[selectedEpisode] ||
      episodes[selectedEpisode].rank > member.rank
    ) {
      selectedEpisode = 0;
      pageIndex = 0;
    }

    episodes.forEach((episode, index) => {
      const unlocked = member.rank >= episode.rank;

      const button = node(
        'button',
        '',
        'R' +
        episode.rank +
        '｜' +
        episode.title +
        (unlocked ? '' : '｜未解放')
      );

      button.disabled = !unlocked || api.isBlocked();

      button.setAttribute(
        'aria-pressed',
        String(selectedEpisode === index)
      );

      button.onclick = () => {
        if (api.isBlocked()) {
          return;
        }

        stopVoice();
        selectedEpisode = index;
        pageIndex = 0;
        render();
      };

      tabs.append(button);
    });

    const episode = episodes[selectedEpisode];

    pageIndex = Math.min(
      pageIndex,
      episode.pages.length - 1
    );

    const page = episode.pages[pageIndex];

    root.append(
      node('h3', '', episode.title),
      node('strong', 'story-speaker', page.speaker),
      node('p', 'story-text', page.text),
      node(
        'p',
        'muted',
        (pageIndex + 1) + '／' + episode.pages.length
      )
    );

    if (page.voice) {
      const voiceButton = node('button', '', 'ボイス再生');

      voiceButton.disabled = api.isBlocked();

      voiceButton.onclick = async () => {
        if (api.isBlocked()) {
          return;
        }

        stopVoice();

        const currentAudio = new Audio(page.voice);
        audio = currentAudio;

        currentAudio.addEventListener('error', () => {
          if (audio === currentAudio) {
            $('characterDetailNotice').textContent =
              '音声ファイルを読み込めませんでした。';
          }
        });

        try {
          await currentAudio.play();
        } catch (error) {
          if (audio === currentAudio) {
            $('characterDetailNotice').textContent =
              '音声を再生できませんでした。';
          }
        }
      };

      root.append(voiceButton);
    }

    const navigation = node('div', 'button-row');

    const previous = node('button', '', '前へ');
    previous.disabled = pageIndex === 0 || api.isBlocked();

    previous.onclick = () => {
      if (api.isBlocked()) {
        return;
      }

      stopVoice();
      pageIndex -= 1;
      render();
    };

    const next = node('button', 'primary', '次へ');

    next.disabled =
      pageIndex >= episode.pages.length - 1 ||
      api.isBlocked();

    next.onclick = () => {
      if (api.isBlocked()) {
        return;
      }

      stopVoice();
      pageIndex += 1;
      render();
    };

    navigation.append(previous, next);
    root.append(navigation);
  }

  function render() {
    if (!api || !api.getSave()) {
      return;
    }

    $('openCharacterDetails').disabled = api.isBlocked();
    $('closeCharacterDetails').disabled = api.isBlocked();

    if (!$('characterDetailsDialog').open) {
      return;
    }

    const save = api.getSave();
    const select = $('characterDetailSelect');

    if (!selectedMember()) {
      stopVoice();
      selectedId = save.ownedCharacters[0]?.id || null;
      selectedEpisode = 0;
      pageIndex = 0;
    }

    select.replaceChildren();

    for (const member of save.ownedCharacters) {
      const definition = window.TQ_DATA.characters.find((entry) => {
        return entry.id === member.id;
      });

      const option = node(
        'option',
        '',
        definition.name +
        '／R' +
        member.rank +
        ' Lv.' +
        member.level
      );

      option.value = member.id;
      select.append(option);
    }

    select.value = selectedId || '';
    select.disabled = api.isBlocked();

    const member = selectedMember();

    if (!member) {
      $('characterDetailProfile').replaceChildren();
      $('characterDetailSkills').replaceChildren();
      $('characterStoryEpisodes').replaceChildren();
      $('characterStoryPage').textContent =
        '所持キャラクターがありません。';

      return;
    }

    const definition = window.TQ_DATA.characters.find((entry) => {
      return entry.id === member.id;
    });

    renderProfile(member, definition);
    renderStory(member);
  }

  function createUI() {
    const section = node('section', 'management-section');
    const open = node('button', '', 'キャラクター詳細・ストーリー');

    open.id = 'openCharacterDetails';

    section.append(
      node('h3', '', '仲間の記録'),
      open,
      node(
        'p',
        'muted',
        '所持キャラクターの能力と、ランクごとに解放される物語を確認できます。'
      )
    );

    $('management').append(section);

    const dialog = document.createElement('dialog');
    dialog.id = 'characterDetailsDialog';

    const header = node('div', 'dialog-header');
    const close = node('button', '', '閉じる');

    close.id = 'closeCharacterDetails';

    header.append(
      node('h2', '', 'キャラクター詳細'),
      close
    );

    const select = document.createElement('select');
    select.id = 'characterDetailSelect';
    select.setAttribute('aria-label', '閲覧するキャラクター');

    const profile = node('div', 'detail-profile');
    profile.id = 'characterDetailProfile';

    const skillList = node('div', 'detail-skills');
    skillList.id = 'characterDetailSkills';

    const episodes = node('div', 'button-row story-episodes');
    episodes.id = 'characterStoryEpisodes';

    const page = node('div', 'story-page');
    page.id = 'characterStoryPage';

    const notice = node('p', 'muted');
    notice.id = 'characterDetailNotice';
    notice.setAttribute('role', 'status');

    dialog.append(
      header,
      select,
      profile,
      node('h3', '', 'スキル'),
      skillList,
      node('h3', '', 'ストーリー'),
      episodes,
      page,
      notice
    );

    document.body.append(dialog);

    open.onclick = () => {
      if (api.isBlocked()) {
        return;
      }

      selectedId = api.getSave().ownedCharacters[0]?.id || null;
      selectedEpisode = 0;
      pageIndex = 0;
      notice.textContent = '';

      dialog.showModal();
      render();
    };

    close.onclick = () => {
      if (!api.isBlocked()) {
        dialog.close();
      }
    };

    select.onchange = () => {
      if (api.isBlocked()) {
        return;
      }

      stopVoice();
      selectedId = select.value;
      selectedEpisode = 0;
      pageIndex = 0;
      notice.textContent = '';
      render();
    };

    dialog.addEventListener('close', stopVoice);

    dialog.addEventListener('cancel', (event) => {
      if (api.isBlocked()) {
        event.preventDefault();
      }
    });

    window.addEventListener('pagehide', stopVoice);
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
