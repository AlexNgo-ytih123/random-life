// 「人生四条轨迹」：教育 / 职业 / 家庭 / 健康。
//
// 这个模块是《随机人生》把「一个国家的真实统计」翻译成「一个人真实的一生」
// 的那一层。四条轨迹各自吃国家的一组指标，把它们变成五个被追踪的统计量：
//
//   教育 advanceEducation ← schooling（平均受教育年限）
//   职业 advanceCareer   ← gdpPcapPpp（人均 GDP）、unemployment（失业率）、agriculture
//   家庭 advanceFamily   ← fertility（生育率）、urbanRate（城镇化率）
//   健康 advanceHealth   ← 年龄本身（真实人口学的年龄别健康曲线）
//
// 为什么要把「国家的数字」接到「一个人的数字」上：
//   这是整个游戏的立身之本。玩家被随机生在地球上某处，那里的真实统计就是他的命：
//   一个平均受教育 4 年的国家，长大成人后就是懂得更少；
//   一个高生育率的国家，30 岁的人就是孩子更多；
//   一个高人均 GDP 的国家，出来的人就是更能挣钱。
//   如果这里写死「所有人 18 岁大学毕业、25 岁结婚、45 岁年薪最高」，
//   那地图上的国家就只是装饰品，整个游戏也就没了意义。
//
// 三条建模原则：
//   ① **纯函数**：不碰 DOM、不联网、不用 Math.random()、不用 Date.now()。
//      随机数一律由调用方注入（js/engine/rng.js 的 makeRng），
//      所以同一个种子永远得到同一条人生轨迹（可分享的 URL = 同一个人）。
//   ② **缺数据不崩**：国家数据可能缺、可能旧、可能压根没有 country 字段。
//      读指标一律走 indicator() 这个防御式读法，缺了就用保守的默认值，
//      绝不允许抛异常 —— 一个缺失的指标不该让整局游戏结束。
//   ③ **夹紧**：五个统计量永远在 0..100 之间，四条轨迹的任何一条都不许越界。
//
// income 是 0..100 的「收入水平分」，不是钱：本模块不出现任何货币金额。

import { uniform } from './rng.js';

// ── 通用常量 ────────────────────────────────────────────────────────

/** 五个被追踪的统计量。 */
const STAT_KEYS = ['knowledge', 'health', 'relations', 'income', 'happiness'];

/** 统计量的取值范围。 */
const STAT_MIN = 0;
const STAT_MAX = 100;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// ── 教育 ────────────────────────────────────────────────────────────

/** 教育阶段的顺序（数值越大 = 阶段越高）。 */
const STAGE_NAMES = ['none', 'primary', 'secondary', 'university'];

/**
 * 每个阶段的「年学习增益」上限（单位：知识点/年，未计递减）。
 *
 * 小学背得多记得快，中学次之，大学最慢（越往后越抽象、越难啃）。
 * 'none' = 没上学，增益为 0。
 */
const STAGE_RATE = [0, 2.6, 2.2, 1.8];

/**
 * 大学的知识门槛（0..100 尺度上的绝对分数）。
 *
 * 为什么用绝对值而不是「本国天花板的比例」？
 *   门槛模拟的是「考试考不考得上」这件事，它跟国家贫富无关，只跟这个人的
 *   脑子有关。用绝对值还带来一个好处：同一个人在不同国家有不同的结局，
 *   而「同一个人在同一国家」的行为是可预期的。
 */
const UNIVERSITY_MIN_KNOWLEDGE = 20;

/** 拿不到 schooling 指标时的兜底：全球平均受教育年限约 6 年。 */
const DEFAULT_MEAN_SCHOOLING = 6;

/**
 * 知识天花板的映射：ceiling = clamp(15 + 8 * 平均受教育年限, 20, 100)。
 *
 * **为什么天花板要由国家的平均受教育年限决定？**
 *   因为成年人的知识水平几乎完全被「他所在社会的教育系统能给他多少年教育」
 *   决定。一个平均受教育 4 年的国家，再天才的人也很难自学成才 ——
 *   没有中学、没有大学、没有像样的教材和同伴。数值上是「年均每多读一年书，
 *   成年后大约多 8 个知识点」，7.6 年（典型中等人均）→ 75.8 分，
 *   12 年（发达经济体）→ 触顶 100 分。
 *   这条曲线把国家间「几十年教育差距」翻译成了「一个人脑子里差多少东西」。
 */
function knowledgeCeiling(meanYears) {
  return clamp(15 + 8 * meanYears, 20, 100);
}

/** 各教育阶段对应的「学历水平分」（0..100，用于岗位层级）。 */
const EDU_SCORE = [8, 25, 50, 85];

// ── 职业 ────────────────────────────────────────────────────────────

/** 法定劳动年龄。 */
const WORK_AGE = 18;
/** 大学毕业年龄。 */
const GRADUATION_AGE = 22;
/** 收入峰值年龄（40~45 之间取中值）。 */
const PEAK_AGE = 42;
/** 退休年龄。 */
const RETIRE_AGE = 65;

/** 拿不到 gdpPcapPpp 时的兜底：全球人均 GDP（PPP）约 12000 美元。 */
const DEFAULT_GDP_PCAP = 12000;

/**
 * 人均 GDP → 0..1 的「国家富裕度」。
 *
 * 用对数：1000 美元和 10000 美元之间的差距，远比 10000 和 20000 之间的差距
 * 更能决定一个成年人的收入水平。区间取 [1000, 100000]，两端夹紧。
 */
function gdpFactor(gdp) {
  return clamp((Math.log10(gdp) - 3) / 2, 0, 1);
}

/** 岗位层级阶梯（level 落在哪一档就是什么工作）。 */
const JOB_TIERS = [
  { max: 20, title: 'laborer' },
  { max: 35, title: 'worker' },
  { max: 50, title: 'clerk' },
  { max: 65, title: 'specialist' },
  { max: 80, title: 'engineer' },
  { max: Infinity, title: 'manager' },
];

/** 中途失业的年龄窗口（岁）与年失业概率。 */
const LAYOFF_MIN_AGE = 50;
const LAYOFF_MAX_AGE = 64;
const LAYOFF_P = 0.02;

/** 收入向「目标收入」靠拢的比例（每年）。 */
const INCOME_TRACKING = 0.5;

/** 每年加薪/跳槽带来的随机波动幅度。 */
const INCOME_NOISE = 0.4;

// ── 家庭 ────────────────────────────────────────────────────────────

/** 拿不到 fertility 指标时的兜底：全球总和生育率约 2.3。 */
const DEFAULT_FERTILITY = 2.3;

/** 婚育年龄窗口。 */
const MARRY_MIN_AGE = 20;
const MARRY_MAX_AGE = 42;
const CHILD_MIN_AGE = 20;
const CHILD_MAX_AGE = 47;

/** 子女数上限（防止出现荒唐数字）。 */
const MAX_CHILDREN = 9;

/** 父母收入随本人年龄的年衰减率（分段）。 */
function parentsDecay(age) {
  if (age < 40) return 0.03;
  if (age < 60) return 0.05;
  return 0.12;
}

// ── 防御式小工具 ────────────────────────────────────────────────────

/**
 * 读一个国家指标，缺失或不是有限数字时返回 null。
 *
 * 整个模块只通过它读数据，所以「缺数据不崩」这条要求只在这一处实现。
 *
 * @param {object} state
 * @param {string} key 指标名，如 'schooling' / 'gdpPcapPpp'
 * @returns {number|null}
 */
function indicator(state, key) {
  const raw = state?.country?.indicators?.[key];
  const value = raw?.value;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** 保证 state.stats 存在且五项都是有限数字。 */
function ensureStats(state) {
  if (!state.stats || typeof state.stats !== 'object') state.stats = {};
  for (const key of STAT_KEYS) {
    const v = state.stats[key];
    if (typeof v !== 'number' || !Number.isFinite(v)) state.stats[key] = 0;
  }
  return state.stats;
}

/** 保证 state.flags 存在。 */
function ensureFlags(state) {
  if (!state.flags || typeof state.flags !== 'object') state.flags = {};
  return state.flags;
}

/** 保证 state.family 存在且字段合法（子女是非负整数、父母收入非负）。 */
function ensureFamily(state) {
  if (!state.family || typeof state.family !== 'object') state.family = {};
  const family = state.family;
  if (typeof family.children !== 'number' || !Number.isFinite(family.children)) family.children = 0;
  family.children = Math.max(0, Math.floor(family.children));
  if (typeof family.parentsIncome !== 'number' || !Number.isFinite(family.parentsIncome)) {
    family.parentsIncome = 0;
  }
  family.parentsIncome = Math.max(0, family.parentsIncome);
  family.married = family.married === true;
  return family;
}

/** 教育阶段名 → 阶段序号（认不出来的当作 'none'）。 */
function stageIndex(name) {
  const i = STAGE_NAMES.indexOf(name);
  return i < 0 ? 0 : i;
}

/** 把全部统计量夹到 0..100。 */
function clampStats(stats) {
  for (const key of STAT_KEYS) {
    const v = stats[key];
    stats[key] = clamp(typeof v === 'number' && Number.isFinite(v) ? v : 0, STAT_MIN, STAT_MAX);
  }
}

// ── 1. 教育轨迹 ─────────────────────────────────────────────────────

/**
 * 推进一年的教育轨迹。
 *
 * 每年做两件事：
 *   ① 先按年龄推进教育阶段（六岁小学、十二岁中学、十八岁看条件上大学）；
 *   ② 再按当前阶段给知识加一点，且增益随「离天花板还有多远」递减。
 *
 * 递减的意义在于：知识是有上限的。一个平均受教育 7.6 年的国家，
 * 无论这个人多努力，他成年后的知识也只能靠近 75.8 那个天花板；
 * 接近之后再怎么念书也上不去了（除非换一个教育年限更高的国家出生）。
 *
 * @param {object} state 玩家状态
 * @param {number} age 当前年龄
 * @param {() => number} rng 注入的随机数发生器
 * @returns {object} 同一个 state（就地修改）
 */
export function advanceEducation(state, age, rng) {
  if (!state) return state;
  const stats = ensureStats(state);
  const flags = ensureFlags(state);
  const a = Number.isFinite(age) ? age : 0;

  // ① 教育阶段推进（一次调用内允许跨过多个门槛，方便从任意年龄接入）
  let stage = stageIndex(flags.schooling);
  if (stage === 0 && a >= 6) stage = 1; // 小学
  if (stage === 1 && a >= 12) stage = 2; // 中学
  if (stage === 2 && a >= 18 && stats.knowledge > UNIVERSITY_MIN_KNOWLEDGE) stage = 3; // 大学
  flags.schooling = STAGE_NAMES[stage];

  // ② 知识增长：增益随天花板递减，永远不会越过天花板
  const meanYears = indicator(state, 'schooling') ?? DEFAULT_MEAN_SCHOOLING;
  const ceiling = knowledgeCeiling(meanYears);
  const rate = STAGE_RATE[stage];
  if (rate > 0 && stats.knowledge < ceiling) {
    // 递减曲线用平方形式：(1 − (知识/天花板)²)。
    //   为什么不是线性的 (1 − 知识/天花板)？因为那样一个人要花六十年
    //   才能靠近天花板，「教育终点接近本国平均受教育年限」这件事就落空了。
    //   平方形式前期学得快（少年期本来就吸收得快），后期又稳稳收敛，
    //   并且在知识正好等于天花板时增益恰好为 0 —— 绝不会越过上限。
    const ratio = stats.knowledge / ceiling;
    const gain = Math.max(0, rate * (1 - ratio * ratio));
    stats.knowledge += gain;
  }

  clampStats(stats);
  return state;
}

// ── 2. 职业轨迹 ─────────────────────────────────────────────────────

/**
 * 收入的年龄曲线：18 岁起有收入，42 岁到顶，之后缓慢下滑，65 岁退休后急剧下落。
 *
 * @param {number} age
 * @returns {number} 0..1 的「收入达成度」
 */
function incomeFactor(age) {
  if (age < WORK_AGE) return 0;
  if (age < PEAK_AGE) {
    // 起步只拿到平台期的四成，然后一路涨到峰值
    const t = (age - WORK_AGE) / (PEAK_AGE - WORK_AGE);
    return 0.4 + 0.6 * t;
  }
  if (age < RETIRE_AGE) {
    // 过了峰值缓慢回落，退休时仍有七成
    const t = (age - PEAK_AGE) / (RETIRE_AGE - PEAK_AGE);
    return 1 - 0.3 * t;
  }
  // 退休后：退休金迅速缩水，85 岁归零
  const t = (age - RETIRE_AGE) / 20;
  if (t >= 1) return 0;
  return 0.7 * Math.pow(1 - t, 1.2);
}

/**
 * 岗位层级（0..100）：它同时决定「这人的收入天花板」和「他是什么工作」。
 *
 * 层级 = 国家富裕度 × 学历加成 − 失业惩罚。
 *   高学历 + 高人均 GDP → 好工作 → 收入天花板高；
 *   低学历 + 低人均 GDP → 体力活 → 天花板低。
 */
function jobLevel(eduScore, gdp, unemployment) {
  const base = 18 + 62 * gdpFactor(gdp);
  const eduFactor = 0.75 + 0.35 * (eduScore / 100);
  const penalty = unemployment === null ? 0 : unemployment;
  return clamp(base * eduFactor - penalty, 3, 100);
}

/** 岗位层级 → 职业名称。 */
function jobTitle(level, eduScore, agriculture) {
  // 农业占比高、学历又低的人，多半在种地
  if (agriculture !== null && agriculture >= 20 && eduScore <= 30) return 'farmer';
  for (const tier of JOB_TIERS) {
    if (level < tier.max) return tier.title;
  }
  return 'manager';
}

/**
 * 推进一年的职业轨迹。
 *
 * 逻辑：
 *   ① 到年龄且没在读书 → 找工作（失业率越高，一年找不到工作的概率越大）；
 *   ② 有工作 → 收入向「岗位层级 × 年龄曲线」靠拢，并带一点年度波动；
 *   ③ 到了 65 岁 → 退休，养老金迅速缩水。
 *
 * 收入分永远在 0..100 之间，且**永远不会为负**（没工作就往 0 掉，不是往负数掉）。
 *
 * @param {object} state
 * @param {number} age
 * @param {() => number} rng
 * @returns {object} 同一个 state
 */
export function advanceCareer(state, age, rng) {
  if (!state) return state;
  const stats = ensureStats(state);
  const flags = ensureFlags(state);
  const a = Number.isFinite(age) ? age : 0;

  const gdp = indicator(state, 'gdpPcapPpp') ?? DEFAULT_GDP_PCAP;
  const unemployment = indicator(state, 'unemployment');
  const agriculture = indicator(state, 'agriculture');
  const eduScore = EDU_SCORE[stageIndex(flags.schooling)];

  // ① 找工作 / 保住工作
  if (!state.job) {
    // 在大学里读书的人不打工
    const inSchool = stageIndex(flags.schooling) === 3 && a < GRADUATION_AGE;
    if (a >= WORK_AGE && !inSchool) {
      // 失业率越高，一年没找到工作的概率越大（取失业率的一半，够狠但不至于离谱）
      const pStay = unemployment === null ? 0 : clamp((unemployment / 100) * 0.6, 0, 0.5);
      const roll = rng ? rng() : 0;
      if (roll >= pStay) {
        const level = jobLevel(eduScore, gdp, unemployment);
        const title = jobTitle(level, eduScore, agriculture);
        flags.jobLevel = level;
        flags.job = title;
        state.job = title;
        stats.happiness = clamp(stats.happiness + 1, STAT_MIN, STAT_MAX);
      }
    }
  } else {
    // 已经工作了，但可能丢工作（中年后更常见）
    if (a >= LAYOFF_MIN_AGE && a < LAYOFF_MAX_AGE) {
      const roll = rng ? rng() : 1;
      if (roll < LAYOFF_P) {
        state.job = null;
        flags.job = null;
        flags.jobLevel = 0;
        stats.happiness = clamp(stats.happiness - 1, STAT_MIN, STAT_MAX);
      }
    }
  }

  // ② 收入轨迹
  const level = Number.isFinite(flags.jobLevel) ? flags.jobLevel : 0;
  if (state.job) {
    // 已经有工作却还没记层级（例如外部直接塞了一个 job 进来）：补算一次
    const effectiveLevel = level > 0 ? level : jobLevel(eduScore, gdp, unemployment);
    flags.jobLevel = effectiveLevel;
    const target = effectiveLevel * incomeFactor(a);
    const noise = rng ? uniform(rng, -1, 1) * INCOME_NOISE : 0;
    stats.income += (target - stats.income) * INCOME_TRACKING + noise;
    // 收入不会超过岗位本身的天花板
    if (stats.income > effectiveLevel) stats.income = effectiveLevel;
  } else {
    // 没有工作：收入缓慢归零（不是变成负数）
    const noise = rng ? uniform(rng, -0.2, 0.2) : 0;
    stats.income = stats.income * 0.8 + noise;
  }
  if (!Number.isFinite(stats.income) || stats.income < 0) stats.income = 0;

  clampStats(stats);
  return state;
}

// ── 3. 家庭轨迹 ─────────────────────────────────────────────────────

/**
 * 推进一年的家庭轨迹。
 *
 * 三件事：
 *   ① 婚配：20~42 岁之间有机会结婚，概率看关系分、城镇化率与生育率
 *      （城镇化与低生育都意味着婚育更晚更少）。
 *   ② 生育：已婚者在育龄窗口里按生育率生孩子，35 岁后概率逐渐走低。
 *   ③ 父母收入衰减：父母在变老、在退休、在离世，所以这份收入会缩水到 0。
 *
 * @param {object} state
 * @param {number} age
 * @param {() => number} rng
 * @returns {object} 同一个 state
 */
export function advanceFamily(state, age, rng) {
  if (!state) return state;
  const stats = ensureStats(state);
  const family = ensureFamily(state);
  const a = Number.isFinite(age) ? age : 0;

  const fertility = indicator(state, 'fertility') ?? DEFAULT_FERTILITY;
  const urban = indicator(state, 'urbanRate');

  // 每年的三次抽样顺序固定，保证同种子下不同国家之间的比较是公平的
  const uMarry = rng ? rng() : 1;
  const uBirth = rng ? rng() : 1;
  const uLife = rng ? rng() : 0.5;

  // ① 婚配
  if (!family.married && a >= MARRY_MIN_AGE && a <= MARRY_MAX_AGE) {
    const urbanRate = urban === null ? 50 : urban;
    const pMarry = clamp(
      0.03 +
        0.0035 * (stats.relations - 50) +
        0.03 * (urbanRate / 100) -
        0.012 * (fertility - DEFAULT_FERTILITY),
      0.004,
      0.3,
    );
    if (uMarry < pMarry) {
      family.married = true;
      stats.happiness = clamp(stats.happiness + 1.5, STAT_MIN, STAT_MAX);
      stats.relations = clamp(stats.relations + 2, STAT_MIN, STAT_MAX);
    }
  }

  // ② 生育：只有成家之后才可能生孩子
  if (family.married && a >= CHILD_MIN_AGE && a <= CHILD_MAX_AGE && family.children < MAX_CHILDREN) {
    // 生育率越高，一年内生一个孩子的概率越大：
    //   总和生育率 1.1 ≈ 十年一个孩子，2.3 ≈ 六年一个，4.5 ≈ 三年一个。
    const pBase = clamp(0.06 + 0.06 * (fertility - 0.8), 0.03, 0.45);
    // 35 岁以后概率逐年走低
    const taper = a <= 33 ? 1 : 1 - 0.8 * ((a - 33) / 14);
    // 家底（本人的收入水平）也影响养孩子的能力
    const household = 0.9 + 0.1 * (stats.income / 100);
    // 还没有孩子的夫妻多半还「打算要一个」，所以更容易很快有第一个
    const wantsFirst = family.children === 0 ? 1.6 : 1;
    const pBirth = pBase * Math.max(0, taper) * household * wantsFirst;
    if (uBirth < pBirth) {
      family.children += 1;
      stats.happiness = clamp(stats.happiness + 0.8, STAT_MIN, STAT_MAX);
      stats.relations = clamp(stats.relations + 0.5, STAT_MIN, STAT_MAX);
    }
  }

  // ③ 父母收入衰减（父母在变老、在退休、在离世）
  family.parentsIncome = Math.max(0, family.parentsIncome * (1 - parentsDecay(a)));

  // 家庭生活的日常起伏：有一点随机，也有一点「成家后更安稳」的系统性回报
  const lifeNoise = uLife * 0.8 - 0.4;
  stats.happiness = clamp(stats.happiness + lifeNoise, STAT_MIN, STAT_MAX);
  if (family.married) {
    stats.relations = clamp(stats.relations + 0.2, STAT_MIN, STAT_MAX);
  }

  family.children = Math.max(0, Math.floor(family.children));
  clampStats(stats);
  return state;
}

// ── 4. 健康轨迹 ─────────────────────────────────────────────────────

/**
 * 推进一年的健康轨迹。
 *
 * 年龄别健康曲线（粗略但方向正确）：
 *   40 岁以前 —— 基本平线（身体还在自我修复）
 *   40~60 岁 —— 每年约 −0.3
 *   60 岁以后 —— 每年约 −0.65（下降明显加速）
 *
 * 再加一点 ±0.2 的随机波动，避免曲线完美得不像人。
 * 实际死亡由 mortality.js 决定，本模块只负责让这个数字往该去的方向走。
 *
 * @param {object} state
 * @param {number} age
 * @param {() => number} rng
 * @returns {object} 同一个 state
 */
export function advanceHealth(state, age, rng) {
  if (!state) return state;
  const stats = ensureStats(state);
  const a = Number.isFinite(age) ? age : 0;

  let delta = 0;
  if (a > 60) delta = -0.65;
  else if (a >= 40) delta = -0.3;

  const noise = rng ? uniform(rng, -0.2, 0.2) : 0;
  stats.health = stats.health + delta + noise;

  clampStats(stats);
  return state;
}
