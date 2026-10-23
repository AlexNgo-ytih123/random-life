// 「人生四条轨迹」的行为契约：教育 / 职业 / 家庭 / 健康。
//
// 这个模块是「随机人生」把一个国家真实统计变成一个人真实一生的翻译层：
//   education ← 国家的平均受教育年限
//   career   ← 国家的人均 GDP 与失业率
//   family   ← 国家的生育率与城镇化率
//   health   ← 年龄（真实人口学曲线）
//
// 这里的测试不追求「模型有多准」，只钉死四件事：
//   ① 数值永远夹紧在 0..100，任何输入都不许产生 NaN / 负数；
//   ② 缺数据（indicators 为空、country 整个没有）绝不抛异常；
//   ③ 国家的数字真的会影响结果（穷国 vs 富国、高生育 vs 低生育）；
//   ④ 同一个种子永远得到同一条轨迹（可复现 = 可分享）。

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeRng } from '../js/engine/rng.js';
import {
  advanceEducation,
  advanceCareer,
  advanceFamily,
  advanceHealth,
} from '../js/engine/stages.js';

// ── 常量与小工具 ────────────────────────────────────────────────────

/** 五个被追踪的统计量。 */
const STAT_KEYS = ['knowledge', 'health', 'relations', 'income', 'happiness'];

/** 示例里给出的中国指标。 */
const CHN_INDICATORS = {
  schooling: { value: 7.6, year: 2020 },
  lifeExp: { value: 78.0, year: 2022 },
  gdpPcapPpp: { value: 21300, year: 2022 },
  urbanRate: { value: 66.4, year: 2022 },
  fertility: { value: 1.0, year: 2022 },
  unemployment: { value: 5.1, year: 2023 },
  agriculture: { value: 22.0, year: 2021 },
};

/**
 * 造一个干净的状态。
 *
 * @param {object} [options]
 * @param {object} [options.indicators] 国家指标（传 {} 模拟「数据全缺」）
 * @param {object} [options.stats] stats 的覆盖项
 * @param {object} [options.flags] flags 的覆盖项
 * @param {object} [options.family] family 的覆盖项
 * @param {string|null} [options.job] 初始职业
 */
function makeState(options = {}) {
  const {
    indicators = CHN_INDICATORS,
    stats = {},
    flags = {},
    family = {},
    job = null,
  } = options;

  return {
    age: 0,
    stats: { knowledge: 0, health: 90, relations: 50, income: 0, happiness: 60, ...stats },
    flags: { ...flags },
    family: { parentsIncome: 30000, children: 0, married: false, ...family },
    job,
    country: { iso3: 'CHN', indicators: { ...indicators } },
  };
}

/** 断言五个统计量都在 0..100 之间。 */
function assertStatsInRange(state, where) {
  for (const key of STAT_KEYS) {
    const v = state.stats[key];
    assert.ok(typeof v === 'number' && Number.isFinite(v), `${where}：${key}=${String(v)} 必须是有限数字`);
    assert.ok(v >= 0, `${where}：${key}=${v} 不得小于 0`);
    assert.ok(v <= 100, `${where}：${key}=${v} 不得大于 100`);
  }
}

/** 跑一整条人生（四条轨迹每年各走一步）。 */
function runLife(seed, { years = 40, indicators = CHN_INDICATORS } = {}) {
  const state = makeState({ indicators });
  const rng = makeRng(seed);
  for (let age = 0; age < years; age += 1) {
    advanceEducation(state, age, rng);
    advanceCareer(state, age, rng);
    advanceFamily(state, age, rng);
    advanceHealth(state, age, rng);
  }
  return state;
}

/** 只跑教育轨迹，返回最终知识。 */
function runEducation(years, indicators, seed) {
  const state = makeState({ indicators });
  const rng = makeRng(seed);
  for (let age = 0; age < years; age += 1) advanceEducation(state, age, rng);
  return state.stats.knowledge;
}

/** 从指定年龄起跑教育轨迹 years 年，返回最终知识。 */
function runEducationFrom(startAge, years, indicators, seed) {
  const state = makeState({ indicators });
  const rng = makeRng(seed);
  for (let i = 0; i < years; i += 1) advanceEducation(state, startAge + i, rng);
  return state.stats.knowledge;
}

/** 只跑职业轨迹（从 18 岁起），返回最终收入分。 */
function runCareer(years, gdpPcapPpp, seed) {
  const state = makeState({
    indicators: { gdpPcapPpp: { value: gdpPcapPpp, year: 2022 } },
    flags: { schooling: 'secondary' },
  });
  const rng = makeRng(seed);
  for (let age = 18; age < 18 + years; age += 1) advanceCareer(state, age, rng);
  return state.stats.income;
}

/** 只跑家庭轨迹（已婚、已给定年龄起算），返回子女数。 */
function runFamily(years, fertility, seed, startAge = 30) {
  const state = makeState({
    indicators: { fertility: { value: fertility, year: 2022 } },
    family: { married: true },
  });
  const rng = makeRng(seed);
  for (let age = startAge; age < startAge + years; age += 1) advanceFamily(state, age, rng);
  return state.family.children;
}

// ── 1. 教育轨迹 ──────────────────────────────────────────────────────

test('教育轨迹随年龄推进知识增长且有上限', () => {
  const state = makeState();
  const rng = makeRng('edu-1');
  let prev = -1;

  for (let i = 0; i < 40; i += 1) {
    const age = 10 + i;
    advanceEducation(state, age, rng);
    const k = state.stats.knowledge;
    assert.ok(Number.isFinite(k), `第 ${i} 年知识必须是有限数字`);
    assert.ok(k >= 0 && k <= 100, `第 ${i} 年 knowledge=${k} 越界`);
    if (i < 10) {
      assert.ok(k > prev, `第 ${i} 年知识必须严格增长：${k} <= ${prev}`);
    }
    prev = k;
  }
});

test('教育终点接近该国平均受教育年限', () => {
  const CEIL_76 = 15 + 8 * 7.6; // ≈ 75.8
  // 「30 年教育」有两种读法，两种都必须成立：
  //   ① 从出生算起跑 30 年轨迹（其中 24 年在读书）；
  //   ② 从 6 岁入学算起，真读满 30 年。
  const fromBirth = runEducation(30, { schooling: { value: 7.6, year: 2020 } }, 'edu-2');
  const fromSchool = runEducationFrom(6, 30, { schooling: { value: 7.6, year: 2020 } }, 'edu-2');

  assert.ok(fromBirth > 40, `受教育年限 7.6 的国家跑满 30 年后知识应超过 40，实际 ${fromBirth}`);
  assert.ok(fromSchool > 40, `真读满 30 年后知识应超过 40，实际 ${fromSchool}`);
  assert.ok(fromBirth <= CEIL_76 + 1e-6, `知识 ${fromBirth} 不得超过该国天花板 ${CEIL_76}`);
  assert.ok(fromSchool <= CEIL_76 + 1e-6, `知识 ${fromSchool} 不得超过该国天花板 ${CEIL_76}`);

  const k12 = runEducation(30, { schooling: { value: 12, year: 2020 } }, 'edu-2');
  const k12School = runEducationFrom(6, 30, { schooling: { value: 12, year: 2020 } }, 'edu-2');
  assert.ok(k12 > fromBirth, `受教育年限 12 的国家（${k12}）必须比 7.6 的国家（${fromBirth}）懂得多`);
  assert.ok(k12School > fromSchool, `受教育年限 12 的国家（${k12School}）必须比 7.6 的国家（${fromSchool}）懂得多`);
  assert.ok(k12 <= 100, `知识 ${k12} 不得超过 100`);
  assert.ok(k12School <= 100, `知识 ${k12School} 不得超过 100`);
});

test('知识天花板随国家平均受教育年限上升而升高', () => {
  const low = runEducation(30, { schooling: { value: 4, year: 2020 } }, 'edu-2b');
  const mid = runEducation(30, { schooling: { value: 7.6, year: 2020 } }, 'edu-2b');
  const high = runEducation(30, { schooling: { value: 12, year: 2020 } }, 'edu-2b');
  assert.ok(low < mid, `低 schooling 国家的知识（${low}）必须低于中等国家（${mid}）`);
  assert.ok(mid < high, `中等 schooling 国家的知识（${mid}）必须低于高 schooling 国家（${high}）`);
});

test('教育阶段随年龄推进（小学 → 中学 → 大学或就业）', () => {
  const state = makeState();
  const rng = makeRng('edu-stage');
  advanceEducation(state, 5, rng);
  assert.equal(state.flags.schooling, 'none', '五岁还没上学');
  advanceEducation(state, 6, rng);
  assert.equal(state.flags.schooling, 'primary', '六岁上小学');
  advanceEducation(state, 12, rng);
  assert.equal(state.flags.schooling, 'secondary', '十二岁上中学');
  advanceEducation(state, 18, rng);
  assert.ok(
    ['secondary', 'university'].includes(state.flags.schooling),
    `十八岁应当是中学毕业或上大学，实际 ${state.flags.schooling}`,
  );
});

// ── 2. 缺数据不崩溃 ──────────────────────────────────────────────────

test('缺数据时不崩溃', () => {
  const state = makeState({ indicators: {} });
  const rng = makeRng('nodata-1');

  for (let age = 0; age < 60; age += 1) {
    advanceEducation(state, age, rng);
    advanceCareer(state, age, rng);
    advanceFamily(state, age, rng);
    advanceHealth(state, age, rng);
    assertStatsInRange(state, `第 ${age} 年`);
  }
});

test('连 country 都没有时也不崩溃', () => {
  const state = makeState();
  delete state.country;
  const rng = makeRng('nodata-2');

  for (let age = 0; age < 40; age += 1) {
    advanceEducation(state, age, rng);
    advanceCareer(state, age, rng);
    advanceFamily(state, age, rng);
    advanceHealth(state, age, rng);
    assertStatsInRange(state, `第 ${age} 年`);
  }
});

test('缺数据时知识天花板退回默认值（63 分以内）', () => {
  const k = runEducation(30, {}, 'nodata-3');
  assert.ok(Number.isFinite(k), '知识必须是有限数字');
  assert.ok(k <= 63 + 1e-6, `缺数据时知识 ${k} 不得超过默认天花板 63`);
});

// ── 3. 职业轨迹 ──────────────────────────────────────────────────────

test('职业轨迹在有工作时提高收入', () => {
  const state = makeState({ flags: { job: 'clerk' }, job: 'clerk' });
  advanceCareer(state, 30, makeRng('career-4'));
  assert.ok(state.stats.income > 0, `有工作就必须有收入，实际 ${state.stats.income}`);
  assertStatsInRange(state, '30 岁');
});

test('职业轨迹不产生负收入', () => {
  const state = makeState({ flags: { schooling: 'secondary' } });
  const rng = makeRng('career-5');

  for (let age = 18; age < 58; age += 1) {
    advanceCareer(state, age, rng);
    assert.ok(Number.isFinite(state.stats.income), `第 ${age} 年收入必须是有限数字`);
    assert.ok(state.stats.income >= 0, `第 ${age} 年收入 ${state.stats.income} 不得为负`);
    assert.ok(state.stats.income <= 100, `第 ${age} 年收入 ${state.stats.income} 不得大于 100`);
  }
});

test('收入有峰值后回落', () => {
  const state = makeState({ flags: { schooling: 'secondary' } });
  const rng = makeRng('career-6');
  let at45 = null;

  for (let age = 18; age < 76; age += 1) {
    advanceCareer(state, age, rng);
    if (age === 45) at45 = state.stats.income;
  }

  assert.ok(at45 !== null, '必须记录到 45 岁的收入');
  assert.ok(
    at45 > state.stats.income,
    `45 岁收入 ${at45} 必须高于 75 岁收入 ${state.stats.income}`,
  );
});

test('十八岁后能找到工作并记下职业', () => {
  const state = makeState({ flags: { schooling: 'secondary' } });
  const rng = makeRng('career-7');
  advanceCareer(state, 18, rng);
  assert.ok(state.job, '十八岁应当有工作');
  assert.equal(state.flags.job, state.job, 'flags.job 必须与 state.job 一致');
  assert.ok(Number.isFinite(state.flags.jobLevel), '必须记录岗位层级（0..100）');
  assert.ok(state.flags.jobLevel > 0 && state.flags.jobLevel <= 100, `岗位层级 ${state.flags.jobLevel} 越界`);
});

test('失业率高的国家更难找到工作', () => {
  // 逐个种子比较：同样的人生里，高失业率的国家待业时间必须更长
  const joblessYears = (unemployment) => {
    let total = 0;
    for (let seed = 0; seed < 40; seed += 1) {
      const state = makeState({
        indicators: {
          gdpPcapPpp: { value: 20000, year: 2022 },
          unemployment: { value: unemployment, year: 2023 },
        },
        flags: { schooling: 'secondary' },
      });
      const rng = makeRng(`unemp-${seed}`);
      for (let age = 18; age < 40; age += 1) {
        advanceCareer(state, age, rng);
        if (!state.job) total += 1;
      }
    }
    return total;
  };

  const high = joblessYears(40);
  const low = joblessYears(2);
  assert.ok(high > low, `高失业率国家待业 ${high} 年必须多于低失业率国家的 ${low} 年`);
});

// ── 4. 健康轨迹 ──────────────────────────────────────────────────────

test('健康随年龄下降', () => {
  const state = makeState({ stats: { health: 90 } });
  const rng = makeRng('health-7');

  for (let age = 0; age <= 40; age += 1) advanceHealth(state, age, rng);
  const at40 = state.stats.health;
  for (let age = 41; age <= 70; age += 1) advanceHealth(state, age, rng);

  assert.ok(state.stats.health < at40, `70 岁的健康 ${state.stats.health} 必须低于 40 岁的 ${at40}`);
});

test('健康永远在 0..100', () => {
  const state = makeState({ stats: { health: 95 } });
  const rng = makeRng('health-8');

  for (let age = 0; age < 100; age += 1) {
    advanceHealth(state, age, rng);
    assert.ok(Number.isFinite(state.stats.health), `第 ${age} 年健康必须是有限数字`);
    assert.ok(state.stats.health >= 0, `第 ${age} 年健康 ${state.stats.health} 不得为负`);
    assert.ok(state.stats.health <= 100, `第 ${age} 年健康 ${state.stats.health} 不得大于 100`);
  }
});

test('低健康可以被压到接近 0 但不会变成负数', () => {
  const state = makeState({ stats: { health: 8 } });
  const rng = makeRng('health-9');
  for (let age = 0; age < 120; age += 1) {
    advanceHealth(state, age, rng);
    assert.ok(state.stats.health >= 0, `第 ${age} 年健康 ${state.stats.health} 不得为负`);
  }
});

// ── 5. 家庭轨迹 ──────────────────────────────────────────────────────

test('家庭轨迹记录子女且不产生负数', () => {
  const state = makeState();
  const rng = makeRng('fam-9');

  for (let age = 25; age < 45; age += 1) {
    advanceFamily(state, age, rng);
    assert.ok(Number.isInteger(state.family.children), `第 ${age} 年子女数必须是整数，实际 ${state.family.children}`);
    assert.ok(state.family.children >= 0, `第 ${age} 年子女数 ${state.family.children} 不得为负`);
  }
});

test('家庭轨迹会生育', () => {
  const children = runFamily(20, 4.5, 'fam-10', 30);
  assert.ok(children >= 1, `已婚且高生育率的国家 20 年后至少应有 1 个孩子，实际 ${children}`);
});

test('高生育率国家孩子更多', () => {
  const high = runFamily(20, 4.5, 'fam-11', 30);
  const low = runFamily(20, 1.1, 'fam-11', 30);
  assert.ok(high > low, `高生育率国家 ${high} 个孩子必须多于低生育率国家 ${low} 个`);
});

test('父母收入随本人变老而衰减且不低于 0', () => {
  const state = makeState();
  const rng = makeRng('fam-12');
  for (let age = 0; age < 90; age += 1) {
    advanceFamily(state, age, rng);
    assert.ok(state.family.parentsIncome >= 0, `第 ${age} 年父母收入不得为负`);
  }
  assert.ok(state.family.parentsIncome < 30000, '父母收入应当随年龄衰减');
});

// ── 6. 国家的数字真的影响结果 ────────────────────────────────────────

test('Rich country yields more income', () => {
  const rich = runCareer(20, 40000, 'career-12');
  const poor = runCareer(20, 2000, 'career-12');
  assert.ok(rich > poor, `富国收入 ${rich} 必须高于穷国收入 ${poor}`);
});

test('父母收入不参与本人收入的计算（收入只看国家与教育）', () => {
  const richParents = makeState({
    indicators: { gdpPcapPpp: { value: 20000, year: 2022 } },
    family: { parentsIncome: 1_000_000 },
    flags: { schooling: 'secondary' },
  });
  const poorParents = makeState({
    indicators: { gdpPcapPpp: { value: 20000, year: 2022 } },
    family: { parentsIncome: 0 },
    flags: { schooling: 'secondary' },
  });
  const rngA = makeRng('career-13');
  const rngB = makeRng('career-13');
  for (let age = 18; age < 38; age += 1) {
    advanceCareer(richParents, age, rngA);
    advanceCareer(poorParents, age, rngB);
  }
  assert.equal(richParents.stats.income, poorParents.stats.income, '父母收入不应直接进入本人的收入分');
});

// ── 7. 确定性与夹紧 ──────────────────────────────────────────────────

test('确定性', () => {
  const a = runLife('determinism');
  const b = runLife('determinism');
  assert.deepEqual(a.stats, b.stats, '同种子必须得到同样的统计量');
  assert.deepEqual(a.flags, b.flags, '同种子必须得到同样的旗标');
  assert.deepEqual(a.family, b.family, '同种子必须得到同样的家庭');
  assert.deepEqual(a.job, b.job, '同种子必须得到同样的职业');

  const c = runLife('determinism-2');
  assert.notDeepEqual(c.stats, a.stats, '不同种子应当得到不同的轨迹');
});

test('所有轨迹都夹紧在 0..100', () => {
  const state = makeState();
  const rng = makeRng('clamp-14');

  for (let age = 0; age < 80; age += 1) {
    advanceEducation(state, age, rng);
    assertStatsInRange(state, `教育 第 ${age} 年`);
    advanceCareer(state, age, rng);
    assertStatsInRange(state, `职业 第 ${age} 年`);
    advanceFamily(state, age, rng);
    assertStatsInRange(state, `家庭 第 ${age} 年`);
    advanceHealth(state, age, rng);
    assertStatsInRange(state, `健康 第 ${age} 年`);
  }
});

test('极端初始值也不会让统计量越界', () => {
  const state = makeState({
    stats: { knowledge: 100, health: 100, relations: 100, income: 100, happiness: 100 },
    family: { parentsIncome: 1e9, children: 7, married: true },
    flags: { schooling: 'university', job: 'manager' },
    job: 'manager',
  });
  const rng = makeRng('clamp-15');
  for (let age = 0; age < 90; age += 1) {
    advanceEducation(state, age, rng);
    advanceCareer(state, age, rng);
    advanceFamily(state, age, rng);
    advanceHealth(state, age, rng);
    assertStatsInRange(state, `第 ${age} 年`);
  }
  assert.ok(state.family.children >= 0, '子女数不得为负');
});

// ── 8. 纯度 ──────────────────────────────────────────────────────────

test('模块是纯函数：不使用 Math.random / Date.now / DOM', () => {
  const src = readFileSync(new URL('../js/engine/stages.js', import.meta.url), 'utf8');
  // 去掉注释再扫：文档里提到「不用 Math.random」本身不算违规
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.ok(!/Math\s*\.\s*random/.test(code), '不得调用 Math.random');
  assert.ok(!/Date\s*\.\s*now/.test(code), '不得调用 Date.now');
  assert.ok(!/\bdocument\b|\bwindow\b/.test(code), '不得触碰 DOM');
});
