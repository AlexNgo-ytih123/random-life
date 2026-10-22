// 死亡率模型：把一个国家的真实统计（出生时预期寿命 e0、婴儿死亡率、5 岁以下儿童死亡率）
// 标定成一条「年龄别死亡力 μ(x)」曲线，再用生命表逐年抽样死亡年龄。
//
// 为什么不用「预期寿命 ± 20 年」那种拍脑袋的写法：
//   真实人口的死亡年龄分布是 Gompertz 型的（先平后陡），而且各国之间差的
//   远不止一个固定偏移量 —— 高寿命国家的老年死亡很稀疏、很多人活到 90 岁以上，
//   低寿命国家则很多人在中年就离场。拍脑袋的写法会同时丢掉这两件事。
//   生命表（life table）把这两件事都保留了下来：
//     l(x) = 活到 x 岁的概率
//     μ(x) = x 岁的死亡力（一年内死亡的概率 ≈ 1 - exp(-μ(x))）
//     e(x) = 活到 x 岁的期望剩余寿命
//   有了 l 和 μ，就能从「一个国家的统计数字」推出「这个人什么时候死」。
//
// 纯函数模块：不碰 DOM、不联网、不用 Math.random()、不用 Date.now()。
// 随机数一律由调用方注入（js/engine/rng.js 的 makeRng），因此同一个种子
// 永远得到同一条人生轨迹。

/** 生命表覆盖的年龄上限（含）。 */
const MAX_AGE = 119;

/** Gompertz 斜率的合理区间（单位：每年）。真实世界的斜率大约 0.075~0.115。 */
const GAMMA_MIN = 0.075;
const GAMMA_MAX = 0.115;

/** beta 的对数搜索区间：[e^-30, e^0] ≈ [9.4e-14, 1]。 */
const BETA_LOG_MIN = -30;
const BETA_LOG_MAX = 0;

/** 二分标定的迭代上限与收敛判据。 */
const MAX_ITER = 200;
const LOG_BRACKET_EPS = 1e-12;
const E0_TOL = 0.01;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/**
 * 年龄分段（用于 UI 上的「死于 XX 段」标签）。
 *
 * 0: 0 岁      1: 1~4 岁     2: 5~14 岁    3: 15~39 岁
 * 4: 40~59 岁  5: 60~79 岁   6: 80 岁以上
 *
 * 边界是左闭右开：[0,1) [1,5) [5,15) [15,40) [40,60) [60,80) [80,∞)
 *
 * @param {number} age
 * @returns {number} 分段下标 0..6
 */
export function bandOf(age) {
  if (!Number.isFinite(age)) return 0;
  if (age < 1) return 0;
  if (age < 5) return 1;
  if (age < 15) return 2;
  if (age < 40) return 3;
  if (age < 60) return 4;
  if (age < 80) return 5;
  return 6;
}

/**
 * 由给定的 beta 重建整条死亡力曲线 μ(0..119)。
 *
 * 三段结构：
 *   [0]      婴儿：μ(0) = -ln(1 - q0)，q0 是婴儿死亡率（每千）。
 *   [1..4]   幼儿：1~4 岁共用一个年别率 q1_4 = max(0, q5 - q0) / 4，
 *            于是 (1-q0)·(1-q1_4)^4 ≈ 1 - q0 - 4·q1_4 = 1 - q5，
 *            也就是「5 岁前死亡」的概率约等于输入的 5 岁以下死亡率 q5。
 *   [5..14]  学龄：从 μ(4) 线性插值到 μ(15) = beta。
 *   [15..]   成年：Gompertz，μ(x) = beta · exp(gamma · (x - 15))。
 *
 * ⚠️ 整条曲线都依赖 beta（μ(5..14) 的插值终点就是 beta），
 *    所以标定过程中每换一个候选 beta 都必须整条重建。
 *
 * @param {number} beta μ(15)，即 15 岁的死亡力
 * @param {number} gamma Gompertz 斜率
 * @param {number} mu0 μ(0)
 * @param {number} mu14 μ(1..4) 的公共值
 * @returns {number[]} 长度 120 的死亡力数组
 */
function buildMuArray(beta, gamma, mu0, mu14) {
  const mu = new Array(MAX_AGE + 1);
  mu[0] = mu0;
  for (let x = 1; x <= 4; x += 1) mu[x] = mu14;
  // 5..14 线性插值：x=4 时是 mu14，x=15 时是 beta（每步 (beta-mu14)/11）
  for (let x = 5; x <= 14; x += 1) {
    mu[x] = mu14 + (beta - mu14) * ((x - 4) / 11);
  }
  for (let x = 15; x <= MAX_AGE; x += 1) {
    mu[x] = beta * Math.exp(gamma * (x - 15));
  }
  return mu;
}

/**
 * 由死亡力曲线算出生命表。
 *
 * l(0) = 1；l(x+1) = l(x)·exp(-μ(x))；q(x) = 1 - exp(-μ(x))；
 * e(x) = (Σ_{y=x}^{119} l(y)) / l(x)。
 *
 * 注意 e(x) 用的是「粗离散」定义：把 x 岁这一整年都算进了剩余寿命里。
 * 这带来两个后果：
 *   ① e(0) = Σ l(y) 正好等于我们标定用的 e0（标定目标就是它）；
 *   ② 在高婴儿死亡率的国家，e(0) 可能反而略小于 e(1)（0 岁那一整年被算满，
 *      而 1 岁往后每年都在死人）—— 这是定义带来的边界效应，不是 bug。
 *
 * @param {number[]} mu 长度 120 的死亡力数组
 * @returns {Array<{age:number,mu:number,q:number,l:number,e:number}>}
 */
function buildTable(mu) {
  const l = new Array(MAX_AGE + 1);
  l[0] = 1;
  for (let x = 0; x < MAX_AGE; x += 1) {
    l[x + 1] = l[x] * Math.exp(-mu[x]);
  }

  // e(x) = (Σ_{y=x}^{119} l(y)) / l(x)：用后缀和倒着算，一次搞定。
  const table = new Array(MAX_AGE + 1);
  let suffix = 0;
  for (let x = MAX_AGE; x >= 0; x -= 1) {
    suffix += l[x];
    table[x] = {
      age: x,
      mu: mu[x],
      q: 1 - Math.exp(-mu[x]),
      l: l[x],
      e: suffix / l[x],
    };
  }
  return table;
}

/**
 * 标定：求 beta，使生命表的 e0 等于输入的 e0。
 *
 * e0Model(beta) = Σ_{x=0}^{119} l(x)，它对 beta **单调递减**
 * （beta 越大 → 死亡力越高 → 活得更短），所以可以在 log(beta) 上二分。
 *
 * ⚠️ 每次都要重建整条 mu 曲线（见 buildMuArray 的说明）。
 *
 * @param {number} targetE0
 * @param {number} gamma
 * @param {number} mu0
 * @param {number} mu14
 * @returns {{beta:number, e0Model:number, converged:boolean}}
 */
function calibrate(targetE0, gamma, mu0, mu14) {
  const e0ModelFor = (beta) => {
    const mu = buildMuArray(beta, gamma, mu0, mu14);
    let l = 1;
    let sum = 0;
    for (let x = 0; x <= MAX_AGE; x += 1) {
      sum += l;
      l *= Math.exp(-mu[x]);
    }
    return sum;
  };

  let lo = BETA_LOG_MIN;
  let hi = BETA_LOG_MAX;
  for (let i = 0; i < MAX_ITER; i += 1) {
    const mid = (lo + hi) / 2;
    // e0Model 随 beta 递减：偏大就往小的一侧收
    if (e0ModelFor(Math.exp(mid)) > targetE0) lo = mid;
    else hi = mid;
    if (hi - lo < LOG_BRACKET_EPS) break;
  }

  // 取两个端点里更准的那个（永不静默失败）
  const betaLo = Math.exp(lo);
  const betaHi = Math.exp(hi);
  const e0Lo = e0ModelFor(betaLo);
  const e0Hi = e0ModelFor(betaHi);
  const useLo = Math.abs(e0Lo - targetE0) <= Math.abs(e0Hi - targetE0);
  const beta = useLo ? betaLo : betaHi;
  const e0Model = useLo ? e0Lo : e0Hi;

  return { beta, e0Model, converged: Math.abs(e0Model - targetE0) <= E0_TOL };
}

/**
 * 构造一个国家的死亡率模型。
 *
 * @param {object} input
 * @param {number} input.e0 出生时预期寿命（岁）
 * @param {number} input.infantMort 婴儿死亡率（每千活产儿）
 * @param {number} input.under5Mort 5 岁以下儿童死亡率（每千活产儿）
 * @param {'male'|'female'|'total'} [input.sex] 性别（仅作记录，见下方说明）
 * @returns {{
 *   e0: number, e0Model: number, gamma: number, beta: number,
 *   converged: boolean, sex: string|null, mu: (x:number)=>number,
 *   table: Array<{age:number,mu:number,q:number,l:number,e:number}>
 * }}
 */
export function buildMortality(input = {}) {
  const { e0, infantMort, under5Mort, sex } = input;

  if (!Number.isFinite(e0) || e0 <= 0) {
    throw new Error(`buildMortality: e0 必须是正数（收到 ${e0}）`);
  }
  if (!Number.isFinite(infantMort) || infantMort < 0 || infantMort >= 1000) {
    throw new Error(`buildMortality: infantMort 必须是 [0,1000) 内的数（收到 ${infantMort}）`);
  }
  if (!Number.isFinite(under5Mort) || under5Mort < 0 || under5Mort >= 1000) {
    throw new Error(`buildMortality: under5Mort 必须是 [0,1000) 内的数（收到 ${under5Mort}）`);
  }
  if (sex !== undefined && sex !== null && typeof sex !== 'string') {
    throw new Error(`buildMortality: sex 必须是字符串（收到 ${typeof sex}）`);
  }

  // 形状参数：预期寿命越低 → 老化越陡 → gamma 越大
  const gamma = clamp(0.075 + (78 - e0) * 0.0009, GAMMA_MIN, GAMMA_MAX);

  const q0 = infantMort / 1000;
  const q5 = under5Mort / 1000;
  const mu0 = -Math.log(1 - q0);
  const q1_4 = Math.max(0, q5 - q0) / 4;
  const mu14 = -Math.log(1 - q1_4);

  const { beta, e0Model, converged } = calibrate(e0, gamma, mu0, mu14);
  const muArray = buildMuArray(beta, gamma, mu0, mu14);
  const table = buildTable(muArray);

  /**
   * 年龄别死亡力 μ(x)。整数年龄直接查表；15 岁以后用 Gompertz 外推，
   * 所以 120 岁以后调用也不会抛错（只会越来越陡）。
   */
  const mu = (x) => {
    if (!Number.isFinite(x) || x < 0) return 0;
    if (x >= 15) {
      const v = beta * Math.exp(gamma * (x - 15));
      // x 极大时 exp 会溢出，这里夹住，别让 Infinity 污染下游
      return Number.isFinite(v) ? v : Number.MAX_VALUE;
    }
    const i = Math.floor(x);
    const frac = x - i;
    const lo = muArray[i];
    const hi = i + 1 <= 14 ? muArray[i + 1] : beta; // μ(15) = beta
    return lo + (hi - lo) * frac;
  };

  return {
    e0,
    e0Model,
    gamma,
    beta,
    converged,
    // sex 只作记录：模型本身不含性别差异，调用方应直接传该性别的 e0
    // （例如男 75.1 / 女 80.9），这样曲线自动就带上了性别差异。
    sex: sex ?? null,
    mu,
    table,
  };
}

/**
 * 取生命表。
 *
 * buildMortality 已经把表建好并挂在 m.table 上，这里直接复用
 * （不要每次调用都重算）。若传入的对象没有 table，则按 m.mu 现场重建。
 *
 * @param {object} m buildMortality 的返回值
 * @returns {Array<{age:number,mu:number,q:number,l:number,e:number}>}
 */
export function lifeTable(m) {
  if (!m || typeof m.mu !== 'function') {
    throw new Error('lifeTable: m 必须是 buildMortality 的返回值');
  }
  if (Array.isArray(m.table) && m.table.length === MAX_AGE + 1) {
    return m.table;
  }
  const mu = new Array(MAX_AGE + 1);
  for (let x = 0; x <= MAX_AGE; x += 1) mu[x] = m.mu(x);
  return buildTable(mu);
}

/**
 * 逐年抽样死亡年龄。
 *
 * 每活过一年就抽一次「本年是否死亡」的 Bernoulli，条件死亡概率是
 * q(x) = 1 - exp(-μ(x))。因为是条件抽样（前提是已经活到 x 岁），
 * 「本年死亡」的无条件概率自动等于 l(x)·q(x)，正是生命表里的那一份。
 *
 * ⚠️ 与任务书伪代码的一处位移修正（重要）：
 *   伪代码以 surv = 1 起步、每轮判 `rng() >= surv`，那样 `rng() >= 1` 恒为假，
 *   「第 0 年死亡」永远抽不到，P(age = 0) = 0，与「婴儿死亡率」这个输入直接矛盾
 *   （任务书自己的注释也写的是 P(death at age 0) = 1 - exp(-μ(0)) = q0）。
 *   本实现采用等价的条件概率写法，每次迭代消耗一个随机数（抽取次数不变），
 *   保证 P(age = 0) = q0、P(age < 5) ≈ q5。
 *
 * @param {() => number} rng 注入的随机数发生器
 * @param {object} m buildMortality 的返回值
 * @param {object} [opts]
 * @param {number} [opts.maxAge=119] 最大年龄，超过则按该年龄截断
 * @returns {{age:number, band:number}} 死亡年龄（周岁）及其分段
 */
export function sampleDeathAge(rng, m, opts = {}) {
  if (typeof rng !== 'function') {
    throw new Error('sampleDeathAge: rng 必须是函数');
  }
  if (!m || typeof m.mu !== 'function') {
    throw new Error('sampleDeathAge: m 必须是 buildMortality 的返回值');
  }
  const maxAge = Number.isFinite(opts.maxAge)
    ? Math.max(0, Math.floor(opts.maxAge))
    : MAX_AGE;

  for (let x = 0; x <= maxAge; x += 1) {
    const mu = m.mu(x);
    const q = 1 - Math.exp(-mu);
    if (rng() < q) return { age: x, band: bandOf(x) };
  }
  // 活过了 maxAge：按最大年龄截断
  return { age: maxAge, band: bandOf(maxAge) };
}
