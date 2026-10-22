// mulberry32：32 位种子，周期 2^32，统计性质足够好且实现极短。
//
// 随机数生成器是「分享一生」功能的契约核心：
// 同一个种子必须永远产生同一条人生轨迹（同一个 URL = 同一个人）。
// 因此这里的实现细节（mulberry32、`>>> 0` 截断、抽取顺序）属于
// **公开契约的一部分**：改动它们会让所有已分享的种子链接指向另一段人生。
// tests/rng.test.js 里的「黄金向量」测试就是为了钉死这条契约。

/**
 * FNV-1a 32 位哈希：把字符串种子映射成 32 位无符号整数。
 *
 * - 偏移基数（offset basis）：0x811c9dc5
 * - 质数（prime）：0x01000193（16777619）
 * - 逐字符（UTF-16 码元）异或后乘质数，全程用 Math.imul 做 32 位乘法，
 *   避免 JS 的 53 位浮点乘法丢精度。
 *
 * 选它是因为实现只有几行、分布足够好，而且跨平台结果完全一致。
 *
 * @param {string} text
 * @returns {number} 0 ~ 2^32-1 之间的整数
 */
function fnv1a32(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * 创建一个随机数发生器。
 *
 * @param {number|string} seed
 *   - number：有限数字，内部用 `seed >>> 0` 截断成 32 位无符号整数
 *     （小数取整、负数按 2^32 取模，这是历史行为，不要改）。
 *   - string：按 FNV-1a 32 位哈希映射成整数种子。
 *     分享链接里放的就是字符串种子，所以字符串种子必须稳定可复现。
 * @returns {() => number} 返回 [0, 1) 之间的浮点数
 * @throws {Error} 种子既不是字符串也不是有限数字时抛出
 */
export function makeRng(seed) {
  let a;
  if (typeof seed === 'string') {
    a = fnv1a32(seed);
  } else if (typeof seed === 'number' && Number.isFinite(seed)) {
    a = seed >>> 0;
  } else {
    throw new Error(
      `makeRng: 种子必须是有限数字或字符串，收到 ${typeof seed === 'number' ? seed : typeof seed}`,
    );
  }

  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 在 [min, max) 区间内取一个均匀随机数。
 *
 * 上界是**开区间**（与 rng() 本身一样落在 [0,1)），下界是闭区间。
 *
 * @param {() => number} rng
 * @param {number} min 下界
 * @param {number} max 上界（必须 >= min）
 * @returns {number} [min, max) 之间的浮点数
 * @throws {Error} min / max 不是有限数字，或 min > max
 */
export function uniform(rng, min, max) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    throw new Error(`uniform: min / max 必须是有限数字（收到 min=${min}, max=${max}）`);
  }
  if (min > max) {
    throw new Error(`uniform: min 不能大于 max（min=${min}, max=${max}）`);
  }
  return min + rng() * (max - min);
}

/**
 * 从数组里等概率取一个元素。
 *
 * @param {() => number} rng
 * @param {Array} items 非空数组
 * @returns {*} 数组中的某个元素
 * @throws {Error} items 不是数组或为空数组（空数组没有可选项，静默返回 undefined 会让
 *   后续代码以难以定位的方式出错）
 */
export function pick(rng, items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('pick: 候选数组不能为空');
  }
  return items[Math.floor(rng() * items.length)];
}

/**
 * 按权重抽取一个候选项。
 *
 * ⚠️ **返回的是下标（INDEX），不是元素本身** —— 调用方要自己用下标去取对象。
 *    例如：const i = weighted(rng, [{w:75}, {w:25}]); const item = list[i];
 *
 * 权重规则：
 * - 每一项的 `w` 必须是有限数字且 >= 0（非法权重直接抛错，不做静默兜底）。
 * - 权重全为 0（或总权重不为正）时抛错。
 * - 权重为 0 的项永远抽不到。
 *
 * @param {() => number} rng
 * @param {Array<{w:number}>} items 候选列表，每项带一个数值权重 `w`
 * @returns {number} 被抽中项在 items 中的**下标**
 * @throws {Error} 权重非法、总权重不为正、或候选列表为空
 */
export function weighted(rng, items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('weighted: 候选数组不能为空');
  }

  let total = 0;
  for (let i = 0; i < items.length; i += 1) {
    const w = items[i]?.w;
    if (typeof w !== 'number' || !Number.isFinite(w)) {
      throw new Error(
        `weighted: 第 ${i} 项的权重必须是有限数字（收到 ${String(w)}）`,
      );
    }
    if (w < 0) {
      throw new Error(`weighted: 第 ${i} 项的权重不能为负数（${w}）`);
    }
    total += w;
  }
  if (total <= 0) throw new Error('weighted: 总权重必须为正');

  let roll = rng() * total;
  for (let i = 0; i < items.length; i += 1) {
    roll -= items[i].w;
    if (roll < 0) return i;
  }
  return items.length - 1;
}

// Box–Muller
export function logNormal(rng, median, sigma) {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return median * Math.exp(sigma * z);
}
