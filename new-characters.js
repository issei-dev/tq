// File: new-characters.js

'use strict';

(() => {
  const D = window.TQ_DATA;

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function fail(message) {
    throw new Error('新キャラクター追加エラー：' + message);
  }

  if (
    !D ||
    !Array.isArray(D.characters) ||
    !Array.isArray(D.skills) ||
    !Array.isArray(D.initialParty)
  ) {
    fail('先にdata.jsを読み込んでください。');
  }

  // 初期メンバーをテンプレートとして使用する。
  function initialCharacter(element) {
    const character = D.characters.find((entry) => {
      return D.initialParty.includes(entry.id) &&
        entry.element === element;
    });

    if (!character) {
      fail(element + '属性の初期キャラクターがありません。');
    }

    return character;
  }

  function findSkillTemplate(character, type) {
    if (!Array.isArray(character.skills)) {
      fail('テンプレートキャラのスキル設定がありません。');
    }

    for (const id of character.skills) {
      const skill = D.skills.find((entry) => entry.id === id);

      if (skill?.type === type) {
        if (
          !Array.isArray(skill.variants) ||
          skill.variants.length < 3
        ) {
          fail('ランク別スキル設定が不足しています：' + id);
        }

        return skill;
      }
    }

    fail(
      character.name +
      'に必要なスキル種別がありません：' +
      type
    );
  }

  function createSkill(template, specification) {
    const result = clone(template);

    result.id = specification.id;
    result.name = specification.names[0];

    result.variants = result.variants
      .slice(0, 3)
      .map((variant, index) => {
        const next = {
          ...variant,
          name: specification.names[index]
        };

        // マスターに属性指定がある場合も、
        // 新キャラの属性と一致させる。
        if ('element' in next) {
          next.element = specification.element;
        }

        return next;
      });

    if ('element' in result) {
      result.element = specification.element;
    }

    return result;
  }

  function createCharacter(template, specification) {
    const result = clone(template);

    result.id = specification.id;
    result.name = specification.name;
    result.element = specification.element;
    result.jobs = [...specification.jobs];

    result.base = {
      ...specification.base
    };

    // 成長量は対応する初期キャラから継承する。
    result.growth = clone(template.growth);

    result.skills = specification.skills.map((entry) => {
      return entry.id;
    });

    result.portraits = [
      './assets/characters/' + specification.id + '_r1.png',
      './assets/characters/' + specification.id + '_r2.png',
      './assets/characters/' + specification.id + '_r3.png'
    ];

    result.gachaEnabled = true;

    // 将来のキャラ詳細・ストーリー画面用データ。
    result.profile = {
      gender: specification.gender,
      title: specification.title,
      description: specification.description
    };

    return result;
  }

  const swordTemplate = initialCharacter('fire');
  const mageTemplate = initialCharacter('water');

  const specifications = [
    {
      id: 'valeon',
      name: 'ヴァレオン',
      element: 'dark',
      gender: 'male',
      title: '夜蝕の守護者',
      description:
        '魔界へ通じる境界を守っていた剣士。' +
        '闇の力を剣に封じ、失われた守護者たちの記録を求めて塔を登る。',
      template: swordTemplate,
      base: {
        hp: 110,
        atk: 34,
        def: 13
      },
      jobs: [
        'ダスクブレイダー',
        'アビスナイト',
        'エクリプスロード'
      ],
      skills: [
        {
          id: 'valeon_shadow_slash',
          type: 'damage',
          names: [
            'シャドウスラッシュ',
            'アビススラッシュ',
            'エクリプスエッジ'
          ]
        },
        {
          id: 'valeon_dark_oath',
          type: 'buff',
          names: [
            'ダークオース',
            'アビスオース',
            'エクリプスオース'
          ]
        },
        {
          id: 'valeon_night_guard',
          type: 'cover',
          names: [
            'ナイトガード',
            'アビスガーディアン',
            'エクリプスバスティオン'
          ]
        }
      ]
    },
    {
      id: 'igresia',
      name: 'イグレシア',
      element: 'fire',
      gender: 'female',
      title: '再生の焔を継ぐ者',
      description:
        '破壊ではなく再生を求めて炎を研究する魔法使い。' +
        '塔の深部に眠る不死鳥の火種を探している。',
      template: mageTemplate,
      base: {
        hp: 92,
        atk: 35,
        def: 12
      },
      jobs: [
        'フレイムキャスター',
        'インフェルノメイジ',
        'フェニックスオラクル'
      ],
      skills: [
        {
          id: 'igresia_flame_burst',
          type: 'damage',
          names: [
            'フレイムバースト',
            'インフェルノバースト',
            'フェニックスノヴァ'
          ]
        },
        {
          id: 'igresia_ember_heal',
          type: 'heal',
          names: [
            'エンバーヒール',
            'リバイバルフレイム',
            'フェニックスグレイス'
          ]
        },
        {
          id: 'igresia_ash_veil',
          type: 'weaken',
          names: [
            'アッシュヴェール',
            'シンダーカース',
            'インフェルノエクリプス'
          ]
        }
      ]
    }
  ];

  const pendingCharacters = [];
  const pendingSkills = [];

  const reservedCharacterIds = new Set(
    D.characters.map((entry) => entry.id)
  );

  const reservedSkillIds = new Set(
    D.skills.map((entry) => entry.id)
  );

  for (const specification of specifications) {
    const existingCharacter = D.characters.find((entry) => {
      return entry.id === specification.id;
    });

    // 同じファイルを再評価しても重複追加しない。
    if (existingCharacter) {
      const valid = existingCharacter.element ===
        specification.element &&
        Array.isArray(existingCharacter.skills) &&
        existingCharacter.skills.length === 3 &&
        specification.skills.every((entry, index) => {
          return existingCharacter.skills[index] === entry.id &&
            D.skills.some((skill) => {
              return skill.id === entry.id &&
                skill.type === entry.type;
            });
        });

      if (!valid) {
        fail(
          '同じIDのキャラクターが別設定で存在します：' +
          specification.id
        );
      }

      continue;
    }

    if (!D.elements?.[specification.element]) {
      fail(
        '属性定義がありません：' +
        specification.element
      );
    }

    if (reservedCharacterIds.has(specification.id)) {
      fail('キャラクターIDが重複しています。');
    }

    reservedCharacterIds.add(specification.id);

    for (const skillSpecification of specification.skills) {
      if (reservedSkillIds.has(skillSpecification.id)) {
        fail(
          'スキルIDが重複しています：' +
          skillSpecification.id
        );
      }

      const template = findSkillTemplate(
        specification.template,
        skillSpecification.type
      );

      pendingSkills.push(
        createSkill(template, {
          ...skillSpecification,
          element: specification.element
        })
      );

      reservedSkillIds.add(skillSpecification.id);
    }

    pendingCharacters.push(
      createCharacter(
        specification.template,
        specification
      )
    );
  }

  // 全定義の検証後にマスターへ反映する。
  D.skills.push(...pendingSkills);
  D.characters.push(...pendingCharacters);
})();
