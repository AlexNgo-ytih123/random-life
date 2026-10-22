// 出生地抽取：决定「你生在哪里、你是什么家庭出身」。
//
// 这一层回答的是人生的地基：
//   - **出生国**：按「该国占全球出生人口的比例」抽取，而不是按人口比例。
//     差别很大：1960 年印度+中国占全球出生人口的 ~40%，今天仍然占 ~35%，
//     而卢森堡只有 0.0001%。按人口抽会让玩家大概率生在美国或印度，
//     按出生人口抽才符合「地球上的婴儿都出生在哪里」这个直觉。
//     权重由调用方从 data/births.json 按**出生年份**取出（1950~2025），
//     本模块对年份无感 —— 它只消费给它的权重。
//   - **性别**：男/女出生比（世界值约 105:100）。
//   - **家庭收入**：用「中位数 + 基尼系数」唯一定标一个对数正态分布。
//     为什么不用「平均收入 ± 波动」：国家之间最重要的差别是**不平等程度**
//     （基尼 0.25 的丹麦和基尼 0.55 的南非，平均数一样但人生完全不同），
//     而家庭收入是右偏分布（少数人极高，多数人接近中位数），
//     对数正态正好能同时抓住这两点。
//   - **城乡**：按城镇化率抽。
//
// 纯函数模块：不碰 DOM、不联网、不用 Math.random()、不用 Date.now()。
// 随机数一律由调用方注入（js/engine/rng.js 的 makeRng），
// 因此同一个种子永远得到同一条人生轨迹。

import { weighted, logNormal } from './rng.js';

// ── 标准正态分布的逆函数（分位数） ─────────────────────────────────
//
// normSInv(p) = 标准正态分布的分位数：Φ⁻¹(p)。
// 用 Acklam 的有理逼近（相对误差 ~1e-9）+ 一步 Halley 修正，
// 中间区域精度可达 ~1e-15。为了做这一步修正，需要标准正态 CDF Φ，
// 下面用 Cephes 的 erf/erfc（公共领域，精度 ~1e-16）算它。
// 不引入任何第三方依赖。

/** 2π 的平方根。 */
const SQRT_2PI = 2.506628274631000502415765284811;
/** 1/√2。 */
const INV_SQRT2 = 0.70710678118654752440084436210485;

// Cephes erf/erfc 的系数（double 精度，|误差| < 1e-16）
const ERF_T = [
  9.60497373987051638749e0, 9.00260197203842689217e1, 2.23200534594684319226e3,
  7.00332514112805075473e3, 5.55923013010394962768e4,
];
const ERF_U = [
  3.35617141647503099647e1, 5.21357949780152679795e2, 4.59432382970980127987e3,
  2.26290000613890934246e4, 4.92673942608635921086e4,
];
const ERF_P = [
  2.46196981473530512524e-10, 5.64189564831068821977e-1, 7.46321056442269912687e0,
  4.86371970985681366614e1, 1.96520832956077098242e2, 5.26445194995477358631e2,
  9.34528527171957607540e2, 1.02755188689515710272e3, 5.57535335369399327526e2,
];
const ERF_Q = [
  1.32281951154744992508e1, 8.67072140885989742329e1, 3.54937778887819891062e2,
  9.75708501743205489753e2, 1.82390916687909736289e3, 2.24633760818710981792e3,
  1.65666309194161350182e3, 5.57535340817727675546e2,
];

/**
 * 多项式求值：coef[0]·x^N + coef[1]·x^(N-1) + … + coef[N]（共 N+1 项）。
 *
 * ⚠️ Horner 法的方向别搞反：从 **coef[0]（最高次项系数）** 出发，
 *    每次乘 x 再加下一个系数。
 * @param {number} x
 * @param {number[]} coef
 * @param {number} N 最高次幂
 * @returns {number}
 */
function polevl(x, coef, N) {
  let ans = coef[0];
  for (let i = 1; i <= N; i += 1) ans = ans * x + coef[i];
  return ans;
}

/**
 * 多项式求值（首项系数为 1）：x^N + coef[0]·x^(N-1) + … + coef[N-1]（共 N 项）。
 *
 * ⚠️ 注意这里跟 polevl 的**项数约定不同**：p1evl 的 N 是「项数」，
 *    所以它只读到 coef[N-1]（Cephes 原版的约定）。
 * @param {number} x
 * @param {number[]} coef
 * @param {number} N 项数
 * @returns {number}
 */
function p1evl(x, coef, N) {
  let ans = x + coef[0];
  for (let i = 1; i < N; i += 1) ans = ans * x + coef[i];
  return ans;
}

/**
 * 误差函数 erf(x)。
 * @param {number} x
 * @returns {number} 落在 [-1, 1]
 */
function erf(x) {
  if (Math.abs(x) > 1.0) {
    const y = erfc(x);
    return x >= 0.0 ? 1.0 - y : y - 1.0;
  }
  const z = x * x;
  return (x * polevl(z, ERF_T, 4)) / p1evl(z, ERF_U, 5);
}

/**
 * 余误差函数 erfc(x) = 1 − erf(x)。
 *
 * [1, 8] 区间用 Cephes 的有理逼近（相对误差 ~1e-16）；
 * 8 以上用渐近展开 erfc(a) = exp(−a²)/(a√π)·Σ(−1)ⁿ(2n−1)!!/(2a²)ⁿ。
 * 左尾极小值时 exp(−x²) 会下溢到 0。
 *
 * @param {number} a
 * @returns {number} 落在 [0, 2]
 */
function erfc(a) {
  const x = Math.abs(a);
  if (x < 1.0) return 1.0 - erf(a);

  const z = Math.exp(-a * a); // 下溢时自然变成 0
  let y;
  if (x < 8.0) {
    y = (z * polevl(x, ERF_P, 8)) / p1evl(x, ERF_Q, 8);
  } else {
    // 渐近展开：项在 n ≈ a² 之前单调变小，取到相对误差 < 1e-17 为止
    const inv = 1 / (2 * x * x);
    let sum = 1;
    let term = 1;
    for (let n = 1; n <= 40; n += 1) {
      term *= -(2 * n - 1) * inv;
      sum += term;
      if (Math.abs(term) < 1e-18 * Math.abs(sum)) break;
    }
    y = (z * sum) / (x * Math.sqrt(Math.PI));
  }

  if (a < 0.0) y = 2.0 - y;
  if (!(y > 0.0)) return a < 0.0 ? 2.0 : 0.0;
  if (y > 2.0) return a < 0.0 ? 2.0 : 2.0;
  return y;
}

/**
 * 标准正态 CDF：Φ(x) = P(Z ≤ x)。
 * @param {number} x
 * @returns {number}
 */
function normCdf(x) {
  if (x < 0) return 0.5 * erfc(-x * INV_SQRT2);
  return 1.0 - 0.5 * erfc(x * INV_SQRT2);
}

/**
 * 标准正态生存函数：Q(x) = P(Z > x) = 1 − Φ(x)。
 * 在右尾用这个形式算，误差不随 p→1 而丢精度。
 * @param {number} x
 * @returns {number}
 */
function normSf(x) {
  return 0.5 * erfc(x * INV_SQRT2);
}

// Acklam 有理逼近的系数
const ACKLAM_A = [
  -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
  1.38357751867269e2, -3.066479806614716e1, 2.506628277459239,
];
const ACKLAM_B = [
  -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
  6.680131188771972e1, -1.328068155288572e1,
];
const ACKLAM_C = [
  -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
  -2.549732539343734, 4.374664141464968, 2.938163982698783,
];
const ACKLAM_D = [
  7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416,
];

/** Acklam 分段点：中央区用中段有理逼近，两侧用尾部。 */
const P_LOW = 0.02425;
const P_HIGH = 1 - P_LOW;

/**
 * 标准正态分布的逆函数（分位数）：Φ⁻¹(p)。
 *
 * 算法：
 *   1. Acklam 有理逼近（Peter J. Acklam, 2001），全区间相对误差 ~1e-9。
 *   2. 中间区域再走一步 Halley 修正：
 *        e = Φ(x) − p
 *        u = e·√(2π)·exp(x²/2)
 *        x ← x − u / (1 + x·u/2)
 *      一步之后误差从 ~1e-9 降到机器精度量级。
 *
 * ⚠️ 修正步在两端不能随便用：exp(x²/2) 会溢出，
 *    而且右尾 Φ(x)≈1 与 p≈1 相减会丢有效位。
 *    所以只在 |x| 足够小时才修正；远尾直接返回 Acklam 的结果
 *    （那里 Acklam 的**相对**误差已经是 1e-10 量级，够用）。
 *
 * 实测精度（对照 Python statistics.NormalDist / Wichura AS241，1432 个点）：
 *   中央区 p∈[1e-12, 1−1e-12]：绝对误差 ≤ 1.8e-15（机器精度量级）
 *   极端尾 p=1e-300：相对误差 ≈ 9.7e-11
 *
 * @param {number} p 累积概率，必须落在 (0, 1) 开区间
 * @returns {number} 标准正态分位数 z
 * @throws {Error} p 不是 (0,1) 内的有限数字
 */
export function normSInv(p) {
  if (typeof p !== 'number' || !Number.isFinite(p) || p <= 0 || p >= 1) {
    throw new Error(`normSInv: p 必须是 (0,1) 开区间内的有限数字（收到 ${String(p)}）`);
  }

  // ── 1. Acklam 逼近 ──
  let x;
  if (p < P_LOW) {
    const q = Math.sqrt(-2 * Math.log(p));
    x =
      (((((ACKLAM_C[0] * q + ACKLAM_C[1]) * q + ACKLAM_C[2]) * q + ACKLAM_C[3]) * q +
        ACKLAM_C[4]) *
        q +
        ACKLAM_C[5]) /
      ((((ACKLAM_D[0] * q + ACKLAM_D[1]) * q + ACKLAM_D[2]) * q + ACKLAM_D[3]) * q + 1);
  } else if (p <= P_HIGH) {
    const q = p - 0.5;
    const r = q * q;
    x =
      ((((((ACKLAM_A[0] * r + ACKLAM_A[1]) * r + ACKLAM_A[2]) * r + ACKLAM_A[3]) * r +
        ACKLAM_A[4]) *
        r +
        ACKLAM_A[5]) *
        q) /
      (((((ACKLAM_B[0] * r + ACKLAM_B[1]) * r + ACKLAM_B[2]) * r + ACKLAM_B[3]) * r +
        ACKLAM_B[4]) *
        r +
        1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x =
      -(((((ACKLAM_C[0] * q + ACKLAM_C[1]) * q + ACKLAM_C[2]) * q + ACKLAM_C[3]) * q +
        ACKLAM_C[4]) *
        q +
        ACKLAM_C[5]) /
      ((((ACKLAM_D[0] * q + ACKLAM_D[1]) * q + ACKLAM_D[2]) * q + ACKLAM_D[3]) * q + 1);
  }

  // ── 2. 一步 Halley 修正（仅在数值安全的中间区域） ──
  // exp(x²/2) 在 |x| > 37.4 时会溢出；这里保守地在 |x| ≥ 26.5 就收手
  // （那里 Acklam 的结果已经准到 1e-9 量级，够用）。
  if (x * x < 700) {
    // e = Φ(x) − p。分左右两支算，避免大数相减丢有效位：
    //   x < 0  → Φ(x) 与 p 都是小数，直接相减；
    //   x ≥ 0  → 改用 Q(x)=1−Φ(x) 与 (1−p) 相减。
    const e = x < 0 ? normCdf(x) - p : (1 - p) - normSf(x);
    const u = e * SQRT_2PI * Math.exp((x * x) / 2);
    if (Number.isFinite(u)) {
      const denom = 1 + (x * u) / 2;
      if (denom !== 0) {
        const next = x - u / denom;
        if (Number.isFinite(next)) x = next;
      }
    }
  }

  return x;
}

/**
 * 抽取出生国家。
 *
 * 权重 `w` 是该国在**参考年份**的出生人口数（不是人口数！）。
 * 按权重比例抽取 —— 所以印度、中国出现的频率远高于它们的人口占比。
 * 权重数组由调用方从 data/births.json 按出生年份构造，本模块不含任何国别表。
 *
 * @param {() => number} rng 注入的随机数发生器
 * @param {Array<{iso3:string, w:number}>} weights 候选国家及其出生人口权重
 *   （通常按 w 降序排列；顺序不影响概率）
 * @param {Object<string, Object>} [ctx] ISO3 → 国家元数据（name/nameEn/region 等）
 * @returns {?Object} 被抽中的国家 + 统计上下文 + `chance`；
 *   权重为空或全为 0（无数据）时返回 `null`
 * @throws {Error} weights 不是数组，或某个权重不是有限非负数
 */
export function drawBirthplace(rng, weights, ctx = {}) {
  if (!Array.isArray(weights)) {
    throw new Error('drawBirthplace: weights 必须是数组');
  }
  if (weights.length === 0) return null;

  // 先自己把权重校验一遍：非法权重要抛错（交给 weighted 抛规范错误），
  // 全 0 权重则是「没有数据」，返回 null 让调用方处理。
  let total = 0;
  let valid = true;
  for (let i = 0; i < weights.length; i += 1) {
    const w = weights[i]?.w;
    if (typeof w !== 'number' || !Number.isFinite(w) || w < 0) {
      valid = false;
      break;
    }
    total += w;
  }
  if (valid && total <= 0) return null;

  const index = weighted(rng, weights);
  const entry = weights[index];

  // 统计上下文：ctx 里没有这个国家就留空，不要崩。
  const meta =
    ctx && typeof ctx === 'object' ? ctx[entry.iso3] : undefined;
  const fields = meta && typeof meta === 'object' ? meta : {};

  return {
    ...entry,
    ...fields,
    // chance = 该国占全球出生人口的比例，UI 用它说
    // 「你占这个世界出生人口的 12.4%」。
    chance: total > 0 ? entry.w / total : 0,
  };
}

/**
 * 抽取性别。
 *
 * @param {() => number} rng 注入的随机数发生器
 * @param {number} [ratio=1.05] 每 1 个女婴对应的男婴数（世界值约 1.05）
 * @returns {'male'|'female'}
 * @throws {Error} ratio 不是有限非负数
 */
export function drawSex(rng, ratio = 1.05) {
  if (typeof ratio !== 'number' || !Number.isFinite(ratio) || ratio < 0) {
    throw new Error(`drawSex: ratio 必须是有限非负数（收到 ${String(ratio)}）`);
  }
  const pMale = ratio / (1 + ratio);
  return rng() < pMale ? 'male' : 'female';
}

/**
 * 抽取家庭收入（PPP 美元）。
 *
 * 分布：对数正态，中位数 = `median`，基尼系数 = `gini`。
 *
 * 对数正态的基尼系数有个漂亮的闭式解：
 *   G = 2·Φ(σ/√2) − 1        （σ 是对数尺度上的标准差）
 * 反解得到：
 *   σ = √2 · Φ⁻¹((1+G)/2)
 * 于是（中位数 + 基尼）唯一定标了一个家庭收入分布。
 *
 * @param {() => number} rng 注入的随机数发生器
 * @param {{median:number, gini:number}} opts
 *   - `median` 家庭收入中位数（必须是正的有限数字）
 *   - `gini` 基尼系数，会被夹到 [0, 0.9]
 * @returns {number} 家庭收入（PPP 美元），恒为正数
 * @throws {Error} median 不是正的有限数字
 */
export function drawFamilyIncome(rng, { median, gini } = {}) {
  if (typeof median !== 'number' || !Number.isFinite(median) || median <= 0) {
    throw new Error(
      `drawFamilyIncome: 中位数 median 必须是正的有限数字（收到 ${String(median)}）`,
    );
  }

  // 基尼夹到 [0, 0.9]：0 = 完全平均主义，0.9 已经离谱到没法当现实用。
  let g = typeof gini === 'number' && Number.isFinite(gini) ? gini : 0;
  if (g < 0) g = 0;
  if (g > 0.9) g = 0.9;

  // σ = √2 · Φ⁻¹((1+G)/2)
  const sigma = Math.SQRT2 * normSInv((1 + g) / 2);

  // logNormal(median, σ) = median · exp(σ·z)，z 是标准正态偏离量。
  return logNormal(rng, median, sigma);
}

/**
 * 抽取城乡。
 *
 * @param {() => number} rng 注入的随机数发生器
 * @param {number} urbanRate 城镇化率（会被夹到 [0,1]）
 * @returns {boolean} true = 城镇
 * @throws {Error} urbanRate 不是有限数
 */
export function drawUrban(rng, urbanRate) {
  if (typeof urbanRate !== 'number' || !Number.isFinite(urbanRate)) {
    throw new Error(`drawUrban: urbanRate 必须是有限数字（收到 ${String(urbanRate)}）`);
  }
  const p = urbanRate < 0 ? 0 : urbanRate > 1 ? 1 : urbanRate;
  return rng() < p;
}
