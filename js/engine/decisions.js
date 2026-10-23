// 「人生岔路口」：一辈子只会遇到几次、而且只发生一次的重要选择。
//
// 它和「年度重点」（js/engine/focus.js）是两套东西：
//   - 年度重点是**每年**都能挑一件想投入的事，颗粒度是「这一年」；
//   - 岔路口是**一辈子只出现一次**的选择，颗粒度是「一生」：
//     上不上学、要不要读大学、结不结婚、要不要出国、买不买房……
//
// ── 设计红线：岔路口不能决定生死 ──────────────────────────────────
// 一个岔路口只能改变「概率」和「状态」：调整统计量、写 flag、改家庭成员、
// 记一条时间线。它**绝不能**写 state.dead / state.deathAge / state.alive，
// 生死归 js/engine/mortality.js 管。这条红线由 tests/decisions.test.js 钉死。
//
// ── 纯函数模块 ────────────────────────────────────────────────────
// 不碰 DOM、不联网、不用 Math.random()、不用 Date.now()。
// 任何随机都来自调用方注入的 rng，因此同一个种子永远得到同一条人生。
//
// ── 与国别数据的关系 ──────────────────────────────────────────────
// 岔路口要尊重你出生的地方：学费贵不贵、能不能读大学、当地生育率如何、
// 医保自付比例多高 —— 都从 state.country.indicators 里读，**读不到就当没有**
// （绝不因为缺数据而崩掉，也绝不因为缺数据就把选项变成另一种样子）。

import { uniform } from './rng.js';

// ── 常量 ────────────────────────────────────────────────────────────

/** 五个被追踪的统计量。顺序固定：也是结算顺序。 */
const STAT_KEYS = ['knowledge', 'health', 'relations', 'income', 'happiness'];

/** 统计量的取值范围。 */
const STAT_MIN = 0;
const STAT_MAX = 100;

/** 效果的抖动幅度：±15%。抖动只改大小，不改方向。 */
const JITTER_SPREAD = 0.15;

// ── 小工具 ──────────────────────────────────────────────────────────

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/**
 * 保留两位小数，但不把非零值抹成 0
 * （抹掉符号会让「让健康变差」变成「没影响」，与「抖动不改方向」相矛盾）。
 */
function round2(v) {
  const r = Math.round(v * 100) / 100;
  return r === 0 && v !== 0 ? v : r;
}

/** 取一个数字，不是数字就返回 fallback。 */
const numOr = (v, fallback = null) => (isNum(v) ? v : fallback);

/**
 * 读一个国别指标。缺国家、缺指标、缺年份都返回 null —— 绝不抛错。
 * @param {object} state
 * @param {string} key 指标名，如 'lifeExp' / 'schooling' / 'fertility'
 * @returns {number|null}
 */
function indicator(state, key) {
  const indicators = state && state.country && state.country.indicators;
  if (!indicators || typeof indicators !== 'object') return null;
  const record = indicators[key];
  if (record === null || record === undefined) return null;
  const value = typeof record === 'object' ? record.value : record;
  return isNum(value) ? value : null;
}

/** 拿到 state.stats，缺就补齐（缺失的统计量按 0 起算）。 */
function ensureStats(state) {
  if (!state.stats || typeof state.stats !== 'object') state.stats = {};
  for (const key of STAT_KEYS) {
    if (!isNum(state.stats[key])) state.stats[key] = 0;
  }
  return state.stats;
}

/** 把五个统计量全部夹到 0..100。 */
function clampStats(state) {
  const stats = ensureStats(state);
  for (const key of STAT_KEYS) stats[key] = clamp(stats[key], STAT_MIN, STAT_MAX);
  return stats;
}

/**
 * 施加一组统计量变化，并顺手夹到 0..100。
 *
 * 给了 rng 就给每个非零变化乘上一个 [0.85, 1.15) 的系数：抖动只改大小，
 * 不改方向（一个让人身体变差的选择不会因为运气好就变成好事）。
 *
 * @param {object} state
 * @param {object} deltas { knowledge, health, relations, income, happiness }
 * @param {() => number} [rng]
 * @returns {object} 同一个 state
 */
function bump(state, deltas, rng) {
  const stats = ensureStats(state);
  for (const key of STAT_KEYS) {
    const raw = deltas ? deltas[key] : 0;
    if (!isNum(raw) || raw === 0) continue;
    const value = typeof rng === 'function'
      ? round2(raw * (1 + uniform(rng, -JITTER_SPREAD, JITTER_SPREAD)))
      : raw;
    stats[key] = clamp(stats[key] + value, STAT_MIN, STAT_MAX);
  }
  return state;
}

/** 掷一次骰子：小于概率就算命中。没有 rng 时按「不命中」处理（确定行为）。 */
function roll(rng, probability) {
  if (typeof rng !== 'function') return false;
  return rng() < probability;
}

/** 写一个 flag。 */
function setFlag(state, key, value) {
  if (!state.flags || typeof state.flags !== 'object') state.flags = {};
  state.flags[key] = value;
}

/** 拿到 state.family，缺就补齐。 */
function family(state) {
  if (!state.family || typeof state.family !== 'object') state.family = {};
  return state.family;
}

/** 家里是否拮据：父母收入低且已知。数据未知时按「不拮据」处理。 */
function isTightOnMoney(state) {
  const income = numOr(state && state.family && state.family.parentsIncome);
  if (income === null) return false;
  return income < 6000;
}

// ── 岔路口数据 ──────────────────────────────────────────────────────
//
// 声明顺序即展示顺序。每条包含：
//   id       英文 snake_case 的稳定标识
//   age      这个选择出现的年龄
//   title    短标题（中文）
//   prompt   一句话说明赌注是什么（中文）
//   context  可选：根据国别数据补一句话（中文），由 decisionPrompt() 调用
//   condition 可选：条件不满足时这条岔路口就不出现
//   options  2~4 个选项，每个有 id / label / detail / outcome / apply
//
// 选项的 detail 是「取舍提示」（不剧透结果），outcome 是「时间线上那一句」。

const RAW_DECISIONS = [
  {
    id: 'school_entry',
    age: 6,
    title: '上不上学',
    prompt: '六岁了，附近的小学开始招生——你家供得起这笔钱吗？',
    context(state) {
      const years = indicator(state, 'schooling');
      if (years === null) return '';
      return `这个国家的平均受教育年限约 ${Math.round(years)} 年。`;
    },
    options: [
      {
        id: 'attend',
        label: '去上学',
        detail: '学费是一笔开销，但六年下来，路会宽很多。',
        outcome: '你背起书包，去了离家最近的那间教室。',
        apply(state, rng) {
          const years = indicator(state, 'schooling');
          const knowledge = 8 + (years !== null && years >= 8 ? 2 : 0);
          const tight = isTightOnMoney(state);
          bump(state, { knowledge, relations: 2, income: tight ? -3 : -1, happiness: tight ? -2 : 1 }, rng);
          setFlag(state, 'schooling', 'primary');
          return state;
        },
      },
      {
        id: 'work',
        label: '出去干活',
        detail: '钱来得早，可十六岁以后的门槛会等在前面。',
        outcome: '你找了个能糊口的活计，早早知道了钱是什么。',
        apply(state, rng) {
          bump(state, { income: 5, knowledge: -1, health: -2, relations: -1, happiness: -1 }, rng);
          setFlag(state, 'schooling', 'none');
          return state;
        },
      },
      {
        id: 'home',
        label: '留在家帮忙',
        detail: '省下学费，也替家里分担了，可同龄人这会儿在念书。',
        outcome: '你留在家里，替大人分担着家务。',
        apply(state, rng) {
          bump(state, { relations: 4, income: 2, knowledge: -2, happiness: 1 }, rng);
          setFlag(state, 'schooling', 'home');
          return state;
        },
      },
    ],
  },

  {
    id: 'secondary_school',
    age: 14,
    title: '继续念书吗',
    prompt: '中学的门口还开着：进去要花钱，不进去要挣钱。',
    context(state) {
      const years = indicator(state, 'schooling');
      if (years === null) return '';
      return `这里的孩子平均要念 ${Math.round(years)} 年书。`;
    },
    options: [
      {
        id: 'continue',
        label: '继续读高中',
        detail: '学历会慢慢兑现，眼下的日子要更紧一点。',
        outcome: '你把书包重新背了起来。',
        apply(state, rng) {
          bump(state, { knowledge: 8, income: -2, health: -1, happiness: -1 }, rng);
          setFlag(state, 'schooling', 'secondary');
          return state;
        },
      },
      {
        id: 'vocational',
        label: '读职校学手艺',
        detail: '手上的本事早一天会，早一天能挣钱。',
        outcome: '你进了一间教手艺的学校。',
        apply(state, rng) {
          const urban = indicator(state, 'urbanRate');
          bump(state, {
            knowledge: 4,
            income: 3,
            health: -2,
            happiness: urban !== null && urban >= 60 ? 0 : -1,
          }, rng);
          setFlag(state, 'schooling', 'vocational');
          return state;
        },
      },
      {
        id: 'work',
        label: '出去打工',
        detail: '工资是真的，学到的东西是真的少。',
        outcome: '你收拾好东西，去了工地或柜台后面。',
        apply(state, rng) {
          bump(state, { income: 8, knowledge: -4, health: -3, relations: -2, happiness: -1 }, rng);
          setFlag(state, 'schooling', 'work');
          return state;
        },
      },
    ],
  },

  {
    id: 'upper_secondary',
    age: 17,
    title: '高中之后',
    prompt: '高中读完，接下来往哪儿走？',
    context(state) {
      const enroll = indicator(state, 'tertiaryEnroll');
      if (enroll === null) return '';
      return `这里大约 ${Math.round(enroll)}% 的人会接着上大学。`;
    },
    options: [
      {
        id: 'university_track',
        label: '准备考大学',
        detail: '再熬几年，机会会变多，眼下的收入会变少。',
        outcome: '你把书桌搬回家，开始准备考试。',
        apply(state, rng) {
          bump(state, { knowledge: 7, income: -2, health: -1, happiness: -1 }, rng);
          setFlag(state, 'schooling', 'university_track');
          return state;
        },
      },
      {
        id: 'military',
        label: '去参军',
        detail: '纪律、体格和见识都会重塑你，代价是几年时间。',
        outcome: '你穿上了军装。',
        apply(state, rng) {
          bump(state, { knowledge: 2, health: 2, relations: 4, income: -1, happiness: 1 }, rng);
          setFlag(state, 'schooling', 'military');
          return state;
        },
      },
      {
        id: 'work',
        label: '直接工作',
        detail: '早点挣钱，也早点面对真实的价目表。',
        outcome: '你领到第一份正式工牌。',
        apply(state, rng) {
          bump(state, { income: 8, knowledge: -2, health: -2, happiness: -1 }, rng);
          setFlag(state, 'schooling', 'work');
          return state;
        },
      },
      {
        id: 'farm',
        label: '回乡务农',
        detail: '土地不会骗人，收成看天。',
        outcome: '你回到了那片田里。',
        apply(state, rng) {
          const agri = indicator(state, 'agriculture');
          const income = agri !== null && agri >= 25 ? 6 : 3;
          bump(state, { income, health: 1, knowledge: -3, relations: 2, happiness: 1 }, rng);
          setFlag(state, 'schooling', 'farm');
          return state;
        },
      },
    ],
  },

  {
    id: 'university',
    age: 19,
    title: '大学',
    prompt: '录取通知在手，问题是：读哪种、读哪里的、谁付钱。',
    context(state) {
      const life = indicator(state, 'lifeExp');
      if (life === null) return '';
      return `在这样的国家里，平均能活到 ${Math.round(life)} 岁 —— 读书要还很久。`;
    },
    // 条件：知识得撑得住大学；这个国家得有大学（数据缺失时不武断地否定）。
    condition(state) {
      const knowledge = numOr(state && state.stats && state.stats.knowledge, 0);
      if (knowledge < 30) return false;
      const enroll = indicator(state, 'tertiaryEnroll');
      if (enroll !== null && enroll < 20) return false;
      return true;
    },
    options: [
      {
        id: 'public',
        label: '读公立大学（贷款）',
        detail: '学费能贷，毕业后慢慢还，机会也最稳。',
        outcome: '你填了志愿，等着开学。',
        apply(state, rng) {
          const gdp = indicator(state, 'gdpPcapPpp');
          const cost = gdp !== null && gdp < 5000 ? -6 : -4;
          bump(state, { knowledge: 12, income: cost, health: -2, happiness: -2 }, rng);
          setFlag(state, 'schooling', 'university');
          setFlag(state, 'university_mode', 'public');
          return state;
        },
      },
      {
        id: 'private',
        label: '读私立，自费',
        detail: '知识一样多，只是账单厚得多。',
        outcome: '你签下了那张学费分期。',
        apply(state, rng) {
          bump(state, { knowledge: 10, income: -8, health: -2, happiness: -1 }, rng);
          setFlag(state, 'schooling', 'university');
          setFlag(state, 'university_mode', 'private');
          return state;
        },
      },
      {
        id: 'scholarship',
        label: '争取奖学金',
        detail: '成了能轻很多，不成就得自己扛。',
        outcome: '你递交了奖学金申请，等着回音。',
        apply(state, rng) {
          const enroll = indicator(state, 'tertiaryEnroll');
          const knowledge = numOr(state.stats && state.stats.knowledge, 50);
          const base = enroll !== null ? Math.min(enroll, 90) / 100 * 0.3 : 0.15;
          const won = roll(rng, 0.25 + base + knowledge / 200);
          bump(state, {
            knowledge: won ? 14 : 10,
            income: won ? -1 : -6,
            health: -2,
            happiness: won ? 2 : -1,
          }, rng);
          setFlag(state, 'schooling', 'university');
          setFlag(state, 'university_mode', won ? 'scholarship' : 'self_paid');
          setFlag(state, 'scholarship', won ? 'won' : 'missed');
          return state;
        },
      },
      {
        id: 'abroad',
        label: '出国读',
        detail: '语言、家人和预算都要重新算一遍。',
        outcome: '你收拾了行李箱。',
        apply(state, rng) {
          const life = indicator(state, 'lifeExp');
          const longLife = life !== null && life >= 75;
          bump(state, {
            knowledge: longLife ? 14 : 10,
            relations: -6,
            income: -6,
            health: longLife ? -1 : -2,
            happiness: longLife ? 3 : 1,
          }, rng);
          setFlag(state, 'schooling', 'university');
          setFlag(state, 'university_mode', 'abroad');
          setFlag(state, 'abroad', true);
          return state;
        },
      },
    ],
  },

  {
    id: 'first_job',
    age: 22,
    title: '第一份工作',
    prompt: '第一份正式工作：稳定、收入，还是离家里远一点。',
    context(state) {
      const unemployment = indicator(state, 'unemployment');
      if (unemployment === null) return '';
      return `这里的失业率约 ${Math.round(unemployment)}%。`;
    },
    options: [
      {
        id: 'stable',
        label: '找一份稳定的工作',
        detail: '日子平淡可预期，涨得慢也塌不了。',
        outcome: '你坐进了自己的工位。',
        apply(state, rng) {
          const unemployment = indicator(state, 'unemployment');
          const pay = unemployment !== null && unemployment > 12 ? 5 : 8;
          bump(state, { income: pay, health: -2, knowledge: 2, happiness: 2 }, rng);
          setFlag(state, 'job', 'stable');
          return state;
        },
      },
      {
        id: 'risky',
        label: '做一份高收入的工作',
        detail: '钱来得凶，变动也来得凶。',
        outcome: '你签下了一份没人保证的合同。',
        apply(state, rng) {
          bump(state, { income: 13, health: -4, happiness: 1 }, rng);
          setFlag(state, 'job', 'risky');
          return state;
        },
      },
      {
        id: 'away',
        label: '去远一点的地方',
        detail: '换个城市重新开始，家里人会想你。',
        outcome: '你拖着箱子，去了另一座城市。',
        apply(state, rng) {
          const gdp = indicator(state, 'gdpPcapPpp');
          const urban = indicator(state, 'urbanRate');
          bump(state, {
            income: gdp !== null && gdp > 20000 ? 9 : 6,
            relations: -5,
            knowledge: 3,
            happiness: urban !== null && urban >= 70 ? -2 : -1,
          }, rng);
          setFlag(state, 'job', 'away');
          return state;
        },
      },
    ],
  },

  {
    id: 'migration',
    age: 25,
    title: '要不要出国',
    prompt: '另一种语言、另一套规则、另一张工资单——你敢不敢换？',
    context(state) {
      const gdp = indicator(state, 'gdpPcapPpp');
      if (gdp === null) return '';
      return `这里的人均产出约 ${Math.round(gdp)} 美元。`;
    },
    options: [
      {
        id: 'stay',
        label: '留下',
        detail: '熟悉的人、熟悉的口音，机会也就熟悉。',
        outcome: '你留了下来。',
        apply(state, rng) {
          bump(state, { relations: 2, happiness: -1 }, rng);
          setFlag(state, 'migration', 'stayed');
          return state;
        },
      },
      {
        id: 'migrate',
        label: '出国',
        detail: '机会更宽，语言和家人都是新的代价。',
        outcome: '你登上了飞机。',
        apply(state, rng) {
          const gdp = indicator(state, 'gdpPcapPpp');
          bump(state, {
            income: gdp !== null && gdp > 20000 ? 10 : 7,
            knowledge: 3,
            relations: -8,
            health: -1,
            happiness: 2,
          }, rng);
          setFlag(state, 'migration', 'migrated');
          setFlag(state, 'abroad', true);
          return state;
        },
      },
      {
        id: 'return',
        label: '出国几年再回来',
        detail: '先闯出去，再带着经验和钱回来。',
        outcome: '你在异国租下第一间小屋。',
        apply(state, rng) {
          bump(state, { income: 4, knowledge: 4, relations: -3, happiness: 1 }, rng);
          setFlag(state, 'migration', 'returned');
          setFlag(state, 'abroad', true);
          return state;
        },
      },
    ],
  },

  {
    id: 'relationship',
    age: 27,
    title: '成家',
    prompt: '有人愿意把往后几十年交给你，你愿意吗？',
    context(state) {
      const fertility = indicator(state, 'fertility');
      if (fertility === null) return '';
      return `这里的生育率约 ${fertility.toFixed(2)}。`;
    },
    // 条件：还没成家，而且知道当地的生育率（数据缺失时不乱出题）。
    condition(state) {
      if (state && state.family && state.family.married) return false;
      return indicator(state, 'fertility') !== null;
    },
    options: [
      {
        id: 'early',
        label: '早点结婚',
        detail: '家里热起来，支出和责任也提前到来。',
        outcome: '你们办了婚礼。',
        apply(state, rng) {
          const fertility = indicator(state, 'fertility');
          const usual = fertility !== null && fertility >= 2;
          bump(state, {
            relations: usual ? 8 : 6,
            happiness: usual ? 6 : 4,
            income: -3,
            health: -2,
          }, rng);
          family(state).married = true;
          setFlag(state, 'marital', 'married_early');
          return state;
        },
      },
      {
        id: 'later',
        label: '再等两年',
        detail: '多攒一点底气，少一点慌张。',
        outcome: '你把婚期往后推了推。',
        apply(state, rng) {
          bump(state, { relations: 3, happiness: 3, income: 2, health: 1 }, rng);
          family(state).married = true;
          setFlag(state, 'marital', 'married_late');
          return state;
        },
      },
      {
        id: 'single',
        label: '先一个人过',
        detail: '钱是自己的，时间也是自己的。',
        outcome: '你把钥匙揣进自己口袋。',
        apply(state, rng) {
          bump(state, { income: 5, relations: -6, happiness: 1 }, rng);
          setFlag(state, 'marital', 'single');
          return state;
        },
      },
    ],
  },

  {
    id: 'child',
    age: 30,
    title: '要孩子吗',
    prompt: '一个孩子会改写你的时间表、花销和未来。',
    context(state) {
      const fertility = indicator(state, 'fertility');
      if (fertility === null) return '';
      return `这里的生育率约 ${fertility.toFixed(2)}。`;
    },
    // 条件：孩子还生得动。
    condition(state) {
      const children = numOr(state && state.family && state.family.children, 0);
      return children < 3;
    },
    options: [
      {
        id: 'yes',
        label: '要一个',
        detail: '幸福和花销会同时长大。',
        outcome: '家里多了一个小小心跳。',
        apply(state, rng) {
          const fertility = indicator(state, 'fertility');
          const supported = fertility !== null && fertility >= 1.8;
          bump(state, {
            relations: supported ? 7 : 5,
            happiness: 6,
            income: -5,
            health: -3,
          }, rng);
          const f = family(state);
          f.children = (numOr(f.children, 0) || 0) + 1;
          setFlag(state, 'childbearing', 'started');
          return state;
        },
      },
      {
        id: 'later',
        label: '过两年再说',
        detail: '现在还不是时候，可日子一直在走。',
        outcome: '你把这件事先放进了抽屉。',
        apply(state, rng) {
          bump(state, { happiness: 2, income: 1 }, rng);
          setFlag(state, 'childbearing', 'deferred');
          return state;
        },
      },
      {
        id: 'no',
        label: '不要',
        detail: '人生轻一点，世界少一点牵挂。',
        outcome: '你把日子留给了自己。',
        apply(state, rng) {
          bump(state, { income: 4, relations: -4, happiness: -1 }, rng);
          setFlag(state, 'childbearing', 'declined');
          return state;
        },
      },
    ],
  },

  {
    id: 'housing',
    age: 31,
    title: '住房',
    prompt: '住哪儿，决定了你每月要还多少、睡得好不好。',
    context(state) {
      const urban = indicator(state, 'urbanRate');
      if (urban === null) return '';
      return `这里的城镇化率约 ${Math.round(urban)}%。`;
    },
    options: [
      {
        id: 'buy',
        label: '买房',
        detail: '月供压人，但房子写在你的名下。',
        outcome: '你拿到了钥匙。',
        apply(state, rng) {
          const urban = indicator(state, 'urbanRate');
          const cost = urban !== null && urban >= 60 ? -10 : -8;
          bump(state, { income: cost, happiness: 4, relations: 1 }, rng);
          setFlag(state, 'housing', 'own');
          return state;
        },
      },
      {
        id: 'rent',
        label: '租房',
        detail: '住得轻，搬得动，攒不下资产。',
        outcome: '你和房东签了合同。',
        apply(state, rng) {
          bump(state, { income: -4, happiness: 1 }, rng);
          setFlag(state, 'housing', 'rent');
          return state;
        },
      },
      {
        id: 'family',
        label: '和父母住',
        detail: '省下开销，代价是边界。',
        outcome: '你把行李搬回了原来的房间。',
        apply(state, rng) {
          bump(state, { income: 2, relations: 4, happiness: -1 }, rng);
          setFlag(state, 'housing', 'family');
          return state;
        },
      },
    ],
  },

  {
    id: 'career_shift',
    age: 35,
    title: '转行',
    prompt: '还来得及重来一次：稳，还是换一个天花板。',
    context(state) {
      const gini = indicator(state, 'gini');
      if (gini === null) return '';
      return `这里的基尼系数约 ${Math.round(gini)} —— 差距越大，挪动越值钱。`;
    },
    options: [
      {
        id: 'stay',
        label: '留在原行业',
        detail: '熟能生巧，代价是天花板已经看得见。',
        outcome: '你把简历收了起来。',
        apply(state, rng) {
          bump(state, { income: 3, happiness: 3, knowledge: 1 }, rng);
          setFlag(state, 'career', 'steady');
          return state;
        },
      },
      {
        id: 'shift',
        label: '换个赛道',
        detail: '从零学起，几年后才见分晓。',
        outcome: '你报了新行业的课。',
        apply(state, rng) {
          const gini = indicator(state, 'gini');
          const pay = gini !== null && gini >= 40 ? 3 : 0;
          bump(state, { income: -2 + pay, knowledge: 6, happiness: 4, health: -2 }, rng);
          setFlag(state, 'career', 'shifted');
          return state;
        },
      },
      {
        id: 'startup',
        label: '自己干',
        detail: '上限很高，地板很低。',
        outcome: '你注册了自己的公司。',
        apply(state, rng) {
          const lucky = roll(rng, 0.5);
          bump(state, {
            income: lucky ? 9 : 3,
            happiness: 5,
            health: -5,
            knowledge: 3,
          }, rng);
          setFlag(state, 'career', 'startup');
          return state;
        },
      },
    ],
  },

  {
    id: 'health_screening',
    age: 45,
    title: '体检',
    prompt: '身体开始给信号：查一查，还是不查。',
    context(state) {
      const oop = indicator(state, 'oopHealth');
      if (oop === null) return '';
      return `这里的医疗自付比例约 ${Math.round(oop)}%。`;
    },
    options: [
      {
        id: 'full',
        label: '做一次全面体检',
        detail: '花钱、耗时，还可能查出不想要的答案。',
        outcome: '你抽了血，做了一堆检查。',
        apply(state, rng) {
          const oop = indicator(state, 'oopHealth');
          const doctors = indicator(state, 'doctors');
          const cost = oop !== null && oop >= 30 ? -4 : -2;
          const gain = doctors !== null && doctors < 2 ? 3 : 6;
          bump(state, { health: gain, income: cost, happiness: -2 }, rng);
          setFlag(state, 'screening', 'full');
          return state;
        },
      },
      {
        id: 'basic',
        label: '做常规检查',
        detail: '便宜、快，能挡住大问题。',
        outcome: '你做了几项基础检查。',
        apply(state, rng) {
          bump(state, { health: 3, income: -1 }, rng);
          setFlag(state, 'screening', 'basic');
          return state;
        },
      },
      {
        id: 'skip',
        label: '这次先不去',
        detail: '省下钱和心慌，也省下早知道的机会。',
        outcome: '你把体检单折起来，收进了抽屉。',
        apply(state, rng) {
          bump(state, { health: -2, happiness: 2, income: 1 }, rng);
          setFlag(state, 'screening', 'none');
          return state;
        },
      },
    ],
  },

  {
    id: 'parenting_care',
    age: 50,
    title: '照顾父母',
    prompt: '父母老了，你的五十岁要分给谁。',
    context(state) {
      const oop = indicator(state, 'oopHealth');
      if (oop === null) return '';
      return `这里的医疗自付比例约 ${Math.round(oop)}% —— 看病要自己掏多少。`;
    },
    options: [
      {
        id: 'full',
        label: '全职照顾',
        detail: '时间、精力和身体都要交出去一部分。',
        outcome: '你把工作的时间表换成了陪床的。',
        apply(state, rng) {
          bump(state, { relations: 8, income: -6, health: -3, happiness: -1 }, rng);
          setFlag(state, 'caregiving', 'full');
          return state;
        },
      },
      {
        id: 'support',
        label: '出钱也出力',
        detail: '两边都不放弃，两边都难做满。',
        outcome: '你成了家里那个跑得最多的人。',
        apply(state, rng) {
          bump(state, { relations: 5, income: -3, health: -1, happiness: 1 }, rng);
          setFlag(state, 'caregiving', 'support');
          return state;
        },
      },
      {
        id: 'distance',
        label: '保持距离',
        detail: '你保住了自己的生活，也保住了自己的心。',
        outcome: '你把电话打长了，频率没变。',
        apply(state, rng) {
          bump(state, { income: 2, relations: -5, happiness: -2 }, rng);
          setFlag(state, 'caregiving', 'distance');
          return state;
        },
      },
    ],
  },

  {
    id: 'retirement',
    age: 60,
    title: '退休',
    prompt: '六十岁：继续干，还是把时间还给自己。',
    context(state) {
      const life = indicator(state, 'lifeExp');
      if (life === null) return '';
      return `在这里，六十岁之后大概还有 ${Math.max(0, Math.round(life - 60))} 年。`;
    },
    options: [
      {
        id: 'now',
        label: '提前退休',
        detail: '收入少一大截，时间和身体回来了。',
        outcome: '你把工位收拾干净了。',
        apply(state, rng) {
          const life = indicator(state, 'lifeExp');
          const cut = life !== null && life >= 80 ? -4 : -6;
          bump(state, { income: cut, health: 4, happiness: 4 }, rng);
          setFlag(state, 'retirement', 'retired');
          return state;
        },
      },
      {
        id: 'later',
        label: '继续工作',
        detail: '钱和意义还在，身体要跟上。',
        outcome: '你续了合同。',
        apply(state, rng) {
          bump(state, { income: 6, health: -3, happiness: -1 }, rng);
          setFlag(state, 'retirement', 'working');
          return state;
        },
      },
      {
        id: 'part',
        label: '半退休',
        detail: '一半时间干活，一半时间生活。',
        outcome: '你把一周分成了两半。',
        apply(state, rng) {
          bump(state, { income: 1, health: 1, happiness: 2 }, rng);
          setFlag(state, 'retirement', 'part_time');
          return state;
        },
      },
    ],
  },

  {
    id: 'legacy',
    age: 70,
    title: '留下什么',
    prompt: '七十岁以后，你留下的东西会被别人记住。',
    condition(state) {
      const children = numOr(state && state.family && state.family.children, 0);
      if (children > 0) return true;
      const relations = numOr(state && state.stats && state.stats.relations, 0);
      return relations >= 40;
    },
    options: [
      {
        id: 'family',
        label: '留给子女',
        detail: '他们会记得你把什么留给了他们。',
        outcome: '你把存折推到了孩子面前。',
        apply(state, rng) {
          bump(state, { relations: 6, income: -5, happiness: 3 }, rng);
          setFlag(state, 'legacy', 'family');
          return state;
        },
      },
      {
        id: 'charity',
        label: '捐给社会',
        detail: '钱去了一个你看不见名字的地方。',
        outcome: '你在回执上签了字。',
        apply(state, rng) {
          bump(state, { happiness: 6, relations: 3, income: -4 }, rng);
          setFlag(state, 'legacy', 'charity');
          return state;
        },
      },
      {
        id: 'teach',
        label: '留一门本事',
        detail: '书、图纸、录下来的课，比钱传得久。',
        outcome: '你把手稿整理成了一本册子。',
        apply(state, rng) {
          bump(state, { knowledge: 8, relations: 4, happiness: 2 }, rng);
          setFlag(state, 'legacy', 'knowledge');
          return state;
        },
      },
    ],
  },
];

/**
 * 全部岔路口。
 *
 * 每个选项的 apply 被包了一层：它除了跑原始效果，还会把这次选择记进
 * `state.flags[decision.id] = option.id`。这样「一次性」这件事在数据层
 * 也是自洽的 —— 无论调用方是走 resolveDecision 还是直接调 apply。
 *
 * 数据是声明式的、冻结的：调用方改不动它，只能读。
 */
export const DECISIONS = Object.freeze(
  RAW_DECISIONS.map((d) => {
    const options = d.options.map((o) => Object.freeze({
      id: o.id,
      label: o.label,
      detail: o.detail,
      outcome: o.outcome || o.detail,
      apply(state, rng) {
        const applied = o.apply(state, rng);
        const target = applied && typeof applied === 'object' ? applied : state;
        if (target) setFlag(target, d.id, o.id);
        return target;
      },
    }));

    const decision = {
      id: d.id,
      age: d.age,
      title: d.title,
      prompt: d.prompt,
      options: Object.freeze(options),
    };
    if (typeof d.context === 'function') decision.context = d.context;
    if (typeof d.condition === 'function') decision.condition = d.condition;
    return Object.freeze(decision);
  }),
);

// ── 查询 ────────────────────────────────────────────────────────────

/**
 * 这个年龄有哪些岔路口可以选。
 *
 * 规则：
 *   - 年龄必须正好等于决策的 age（不是「小于等于」）；
 *   - 已经做过的（`state.flags[decision.id]` 存在）不再出现；
 *   - 带 condition 的，条件不满足就隐藏；
 *   - 保持 DECISIONS 的声明顺序。
 *
 * state 为 null / undefined 时按「没有 flags」处理，并且**不做条件过滤**
 * （没有 state 就没有任何信息可依据，此时按「有得选」处理）。
 *
 * @param {number} age
 * @param {object} [state]
 * @returns {object[]} DECISIONS 的子集
 */
export function availableDecisions(age, state) {
  if (!isNum(age)) return [];

  const hasState = state !== null && state !== undefined && typeof state === 'object';
  const flags = hasState && state.flags && typeof state.flags === 'object' ? state.flags : {};

  return DECISIONS.filter((d) => {
    if (d.age !== age) return false;

    const done = flags[d.id];
    if (done !== undefined && done !== null) return false;

    if (!hasState) return true;
    if (typeof d.condition !== 'function') return true;

    try {
      return Boolean(d.condition(state));
    } catch {
      // 条件里读不到数据就不要把这条路堵死之外的东西误伤：读不懂就当不满足。
      return false;
    }
  });
}

/**
 * 岔路口的提示语：prompt 加上根据国别数据补出来的那一句。
 *
 * @param {object} decision
 * @param {object} [state]
 * @returns {string}
 */
export function decisionPrompt(decision, state) {
  if (!decision) return '';
  const base = typeof decision.prompt === 'string' ? decision.prompt : '';
  if (typeof decision.context !== 'function') return base;
  let extra = '';
  try {
    extra = decision.context(state) || '';
  } catch {
    extra = '';
  }
  return extra ? `${base}${extra}` : base;
}

// ── 结算 ────────────────────────────────────────────────────────────

/**
 * 做出选择。
 *
 * 流程：校验 → 检查是不是已经做过了 → 施加选项效果 → 记录选择 →
 * 写一条时间线 → 把统计量夹回 0..100。
 *
 * ⚠️ 这里刻意**不**碰生死：岔路口只改概率与状态，生死归 mortality.js。
 *
 * @param {object} state 玩家状态
 * @param {object} decision 岔路口（来自 DECISIONS）
 * @param {object} option 该岔路口下的某个选项
 * @param {() => number} [rng] 注入的随机数发生器
 * @returns {object} 结算后的状态
 * @throws {Error} 参数非法，或这个岔路口已经做过了
 */
export function resolveDecision(state, decision, option, rng) {
  if (!decision || typeof decision !== 'object') {
    throw new Error('resolveDecision: decision 不能为空，必须是一个岔路口对象');
  }
  if (typeof decision.id !== 'string' || !decision.id) {
    throw new Error('resolveDecision: decision 缺少 id');
  }
  if (!Array.isArray(decision.options) || decision.options.length === 0) {
    throw new Error(`resolveDecision: 岔路口「${decision.id}」没有选项`);
  }
  if (!state || typeof state !== 'object') {
    throw new Error('resolveDecision: state 不能为空');
  }

  // 选项要么就是那个对象，要么至少 id 一样（调用方可能传了一份拷贝）
  const chosen = decision.options.find((o) => o === option)
    || decision.options.find((o) => o && typeof o === 'object' && o.id === (option && option.id));
  if (!chosen) {
    throw new Error(`resolveDecision: 传入的选项不是「${decision.id}」的合法选项`);
  }

  if (!state.flags || typeof state.flags !== 'object') state.flags = {};
  const done = state.flags[decision.id];
  if (done !== undefined && done !== null) {
    throw new Error(`resolveDecision: 岔路口「${decision.id}」已经做过了，一辈子只做一次`);
  }

  // 施加效果：选项可以就地改，也可以返回一个新状态
  const applied = chosen.apply(state, rng);
  const next = applied && typeof applied === 'object' ? applied : state;

  if (!next.flags || typeof next.flags !== 'object') next.flags = {};
  next.flags[decision.id] = chosen.id;

  if (!Array.isArray(next.timeline)) next.timeline = [];
  const text = typeof chosen.outcome === 'string' && chosen.outcome
    ? chosen.outcome
    : (typeof chosen.detail === 'string' ? chosen.detail : decision.title || '');
  next.timeline.push({
    age: isNum(next.age) ? next.age : decision.age,
    text,
  });

  clampStats(next);

  // 返回一个新句柄，但里面装的还是同一份状态（stats / flags / timeline / family
  // 都是同一批对象）：既可以 `state = resolveDecision(state, ...)`，
  // 也不会让调用方误以为原状态被换掉了。
  return { ...next };
}
