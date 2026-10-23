import { makeRng } from './rng.js';
import { FOCUSES, applyFocus } from './focus.js';
import { availableDecisions, resolveDecision } from './decisions.js';
import { rollEvent } from './events.js';
import { advanceEducation, advanceCareer, advanceFamily, advanceHealth } from './stages.js';
import { buildMortality, sampleDeathAge } from './mortality.js';

/**
 * js/engine/orchestrator.js
 * 人生年度循环编排器：把「出生抽样 → 重点 → 轨迹 → 决策 → 事件 → 死亡」
 * 串成一个连贯的年度推进过程。所有的随机数都经由 rng 注入，因此相同种子
 * 永远得到完全相同的一生。
 */

export const DEFAULT_STATE = {
  age: 0,
  stats: { knowledge: 0, health: 100, relations: 50, income: 0, happiness: 60 },
  flags: {},
  timeline: [],
  firedEvents: [],
  family: { parentsIncome: 0, children: 0, married: false },
  country: null,
  lifeExp: null,
  mortality: null,
  job: null,
};

/**
 * 根据国家指标构建死亡模型；若已缓存在 state.mortality 则复用。
 */
export function mortalityFor(state) {
  if (state.mortality) return state.mortality;
  const ind = state.country && state.country.indicators ? state.country.indicators : {};
  let e0 = 78;
  if (ind.lifeExp && typeof ind.lifeExp.value === 'number' && Number.isFinite(ind.lifeExp.value)) e0 = ind.lifeExp.value;
  let q0 = 5;
  if (ind.infantMort && typeof ind.infantMort.value === 'number') q0 = ind.infantMort.value;
  if (q0 < 0) q0 = 0;
  if (q0 > 1000) q0 = 1000;
  let q5 = 10;
  if (ind.under5Mort && typeof ind.under5Mort.value === 'number') q5 = ind.under5Mort.value;
  if (q5 < 0) q5 = 0;
  if (q5 > 1000) q5 = 1000;
  const m = buildMortality({ e0, infantMort: q0, under5Mort: q5 });
  state.mortality = m;
  return m;
}

/**
 * simulateYear
 * 模拟一年的完整流程，返回更新后的 state。
 *
 * @param {Object} state  当前状态
 * @param {number} age    当前年龄
 * @param {Object} options { focusId?, autoDecide?, mortality? }
 * @param {Function} rng  注入的随机数生成器
 */
export function simulateYear(state, age, options, rng) {
  if (!state) throw new Error('state 不能为空');
  state.age = age;

  const m = options && options.mortality ? options.mortality : mortalityFor(state);

  // 1. 应用年度重点
  if (options && options.focusId) {
    const f = FOCUSES.find((x) => x.id === options.focusId);
    if (f) applyFocus(state, f, rng);
  }

  // 2. 推进四大轨迹
  advanceEducation(state, age, rng);
  advanceCareer(state, age, rng);
  advanceFamily(state, age, rng);
  advanceHealth(state, age, rng);

  // 3. 决策（若 autoDecide）
  const firedEvents = state.firedEvents || (state.firedEvents = []);
  const firedSet = new Set(state.firedEvents || []);
  if (options && options.autoDecide) {
    const decisions = availableDecisions(age, state);
    for (const d of decisions) {
      if (d.options && d.options.length) resolveDecision(state, d, d.options[0], rng);
    }
  }

  // 4. 随机事件
  const event = rollEvent(rng, age, state.country, firedSet, state);
  if (event) {
    if (event.effect) event.effect(state, rng);
    if (!firedSet.has(event.id)) {
      firedSet.add(event.id);
      state.firedEvents = [...firedSet];
    }
  }

  // 5. 死亡检查
  const death = sampleDeathAge(rng, m);
  if (age >= death.age) {
    const deadState = Object.assign({}, state, { age, status: 'dead', deathAge: age });
    state.status = 'dead';
    state.deathAge = age;
    return deadState;
  }

  // 6. 活到了下一年
  state.status = 'alive';
  state.age = age + 1;
  return state;
}
