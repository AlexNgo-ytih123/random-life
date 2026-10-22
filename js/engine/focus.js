// 「年度重点」：玩家每一年挑一件想投入的事，这一年的努力会推动五个被追踪的统计量。
//
// 五个统计量（全部 0..100）：
//   knowledge 知识 / health 健康 / relations 关系 / income 收入 / happiness 幸福
//
// 设计原则：**重点是一种推动，不是一张保证书**。
// 同一个重点、同一个年龄，在不同人身上应当有不同结果，所以效果里带 ±15% 的抖动；
// 抖动只改大小，不改方向（一个让人身体变差的选择不会因为运气好就变成好事）。
// 随机数一律由调用方注入（js/engine/rng.js 的 makeRng），因此同一个种子
// 永远得到同一条人生轨迹。
//
// 纯函数模块：不碰 DOM、不联网、不用 Math.random()、不用 Date.now()。

import { uniform } from './rng.js';

/** 五个被追踪的统计量。顺序固定：它同时是抖动抽样顺序与结算顺序。 */
const STAT_KEYS = ['knowledge', 'health', 'relations', 'income', 'happiness'];

/** 抖动系数区间：[0.85, 1.15)。 */
const JITTER_MIN = 0.85;
const JITTER_MAX = 1.15;

/** 统计量的取值范围。 */
const STAT_MIN = 0;
const STAT_MAX = 100;

/**
 * 全部可选重点。
 *
 * ⚠️ **effects.income 的语义要特别注意**：
 *    其它四项（知识/健康/关系/幸福）就是直接加到对应统计量上的点数；
 *    而 `income` 表示的是**收入系数的百分点增量** —— 它推动的是「以后每年
 *    能挣多少」这条收入轨迹（百分比），而不是「今年的收入点数」。
 *    `applyFocus` 出于「一套机制处理五项」的考虑，仍然把 income 的值
 *    同样加到 `state.stats.income` 上（与其他四项完全一样的方式），
 *    由上层把 stats.income 解读成收入系数。写成同一套数值，
 *    是为了让 UI 和日志能直接显示「这一年会推动多少」而不必分两套规则。
 *
 * minAge 是解锁年龄：不满 6 岁还没有可选重点（`focusForAge(5)` 返回空数组）。
 *
 * 数据是声明式的、冻结的：调用方改不动它，只能读。
 */
export const FOCUSES = Object.freeze([
  Object.freeze({
    id: 'study',
    label: '读书',
    description: '书本里的世界更宽，但身体会先付出代价。',
    minAge: 6,
    effects: Object.freeze({ knowledge: 4, health: -1, relations: 0, income: 0, happiness: 1 }),
  }),
  Object.freeze({
    id: 'play',
    label: '玩伴',
    description: '和小伙伴撒欢最快乐，也最耽误功课。',
    minAge: 6,
    effects: Object.freeze({ knowledge: 1, health: 1, relations: 4, income: 0, happiness: 3 }),
  }),
  Object.freeze({
    id: 'work',
    label: '挣钱',
    description: '钱包鼓起来的那几年，身体和心情都得让路。',
    minAge: 16,
    effects: Object.freeze({ knowledge: 0, health: -2, relations: 0, income: 5, happiness: 0 }),
  }),
  Object.freeze({
    id: 'train',
    label: '练身体',
    description: '身上有力气了，脑子和消遣只能往后排。',
    minAge: 6,
    effects: Object.freeze({ knowledge: 0, health: 4, relations: -1, income: 0, happiness: 1 }),
  }),
  Object.freeze({
    id: 'skill',
    label: '学门手艺',
    description: '手上有了吃饭的本事，见识和收入一起长。',
    minAge: 12,
    effects: Object.freeze({ knowledge: 3, health: 0, relations: 0, income: 3, happiness: 0 }),
  }),
  Object.freeze({
    id: 'family',
    label: '陪伴家人',
    description: '把时间留给身边的人，收入上就得松一松。',
    minAge: 6,
    effects: Object.freeze({ knowledge: 0, health: 0, relations: 3, income: -1, happiness: 2 }),
  }),
]);

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/**
 * 保留两位小数，但**不把非零值抹成 0**：
 * 抹掉符号会让「让健康变差」变成「没影响」，与「抖动不改方向」相矛盾。
 */
function round2(v) {
  const r = Math.round(v * 100) / 100;
  return r === 0 && v !== 0 ? v : r;
}

/**
 * 某一年可以选哪些重点。
 *
 * @param {number} age 年龄
 * @returns {Array} FOCUSES 中 minAge <= age 的子集，保持声明顺序；不满 6 岁返回空数组
 */
export function focusForAge(age) {
  if (typeof age !== 'number' || !Number.isFinite(age)) return [];
  return FOCUSES.filter((f) => f.minAge <= age);
}

/**
 * 算出「这个重点实际上会推动多少」——也就是 applyFocus 真正施加的那组数值。
 *
 * 有 rng 时，每个非零效果都会乘上一个从 [0.85, 1.15) 均匀抽出的系数；
 * 零效果保持为 0（也不会去消耗随机数）。系数恒为正，所以**效果的方向不会变**。
 *
 * @param {object|null} focus 重点
 * @param {() => number} [rng] 注入的随机数发生器；不给就是完全确定的基础效果
 * @returns {object|null} { knowledge, health, relations, income, happiness }；focus 为空时返回 null
 */
export function focusEffects(focus, rng) {
  if (!focus) return null;

  const base = focus.effects && typeof focus.effects === 'object' ? focus.effects : {};
  const useRng = typeof rng === 'function';
  const out = {};

  for (const key of STAT_KEYS) {
    const raw = base[key];
    const value = typeof raw === 'number' && Number.isFinite(raw) ? raw : 0;

    if (value === 0 || !useRng) {
      out[key] = value;
      continue;
    }

    const multiplier = uniform(rng, JITTER_MIN, JITTER_MAX);
    out[key] = round2(value * multiplier);
  }

  return out;
}

/**
 * 把一个重点施加到玩家的状态上。
 *
 * 流程：算出（可能带抖动的）效果 → 加到对应统计量 → 把**每一个**统计量夹到 0..100。
 * 抖动在夹紧**之前**完成，所以「+4」在高处会被夹成 100 而不是溢出。
 *
 * @param {object} state 玩家状态，需含 state.stats
 * @param {object|null} focus 重点；为空时什么都不做
 * @param {() => number} [rng] 注入的随机数发生器；不给就是完全确定的基础效果
 * @returns {object} 同一个 state（就地修改，便于链式调用）
 */
export function applyFocus(state, focus, rng) {
  if (!state || !focus) return state;

  const effects = focusEffects(focus, rng);
  if (!state.stats || typeof state.stats !== 'object') state.stats = {};
  const stats = state.stats;

  for (const key of STAT_KEYS) {
    const current = typeof stats[key] === 'number' && Number.isFinite(stats[key]) ? stats[key] : 0;
    stats[key] = clamp(current + effects[key], STAT_MIN, STAT_MAX);
  }

  return state;
}
