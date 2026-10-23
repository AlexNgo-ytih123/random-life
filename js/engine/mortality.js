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
// 约定（很重要）：e(x) 的分子从 x+1 开始，即
//     e(x) = (Σ_{y=x+1}^{119} l(y)) / l(x)
//   一个人在「第 x 个年龄区间」里去世，实际只活到 x 周岁，对应的整年数是 x。
//   于是 e(0) = Σ_{y=1}^{119} l(y) 正好等于「模拟出来的平均死亡年龄」，
//   标定目标、生命表首行 e(0)、蒙特卡洛平均死亡年龄三者严格一致，
//   不会再出现「标定到 e0、实际却系统性地少活 1 岁」的偏差。
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
const LOG_BRACKET_EPS = 1e-14;
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
 *   [0]      婴儿：μ(0) = -log1p(-q0)，q0 是婴儿死亡率（每千）。
 *   [1..4]   幼儿：1~4 岁共用一个年别率 q1_4，它由「5 岁前死亡概率 = q5」
 *            **精确反解**得到（见 buildMortality）：
 *            (1-q0)·(1-q1_4)^4 = 1-q5。
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
 * 由死亡力曲线算出存活到各年龄的概率 l(x)。
 *
 * l(0) = 1；l(x+1) = l(x)·exp(-μ(x))。
 *
 * 单独抽成函数，是为了让「标定」和「建表」走**完全相同的浮点运算顺序**：
 * 这样 buildMortality 返回的 e0Model 与 table[0].e 才会逐位相同
 * （浮点加法不满足结合律，两处各自求和会差最后几位）。
 *
 * @param {number[]} mu 长度 120 的死亡力数组
 * @returns {number[]} 长度 120 的存活概率数组
 */
function buildL(mu) {
  const l = new Array(MAX_AGE + 1);
  l[0] = 1;
  for (let x = 0; x < MAX_AGE; x += 1) {
    l[x + 1] = l[x] * Math.exp(-mu[x]);
  }
  return l;
}

/**
 * 后缀和：suffix[x] = Σ_{y=x}^{119} l(y)；suffix[120] = 0（120 岁以后不再计入）。
 *
 * @param {number[]} l 长度 120 的存活概率数组
 * @returns {number[]} 长度 121 的后缀和数组
 */
function buildSuffix(l) {
  const suffix = new Array(MAX_AGE + 2);
  suffix[MAX_AGE + 1] = 0;
  for (let x = MAX_AGE; x >= 0; x -= 1) {
    suffix[x] = suffix[x + 1] + l[x];
  }
  return suffix;
}

/**
 * 由死亡力曲线算出生命表。
 *
 * l(0) = 1；l(x+1) = l(x)·exp(-μ(x))；
 * q(x) = -expm1(-μ(x))（数学上等于 1-exp(-μ(x))，但 μ 很小时精度高得多：
 *        1-exp(-μ) 在 μ≈1e-6 时会丢掉约 1.2e-3 的相对精度）；
 * e(x) = (Σ_{y=x+1}^{119} l(y)) / l(x)。
 *
 * ⚠️ e(x) 的分子从 x+1 开始（见文件头的约定）：e(0) = Σ_{y=1}^{119} l(y)
 *    就是模型的平均死亡年龄，也是标定目标。
 *
 * ⚠️ l(x) 下溢到 0 时（低寿命模型的高龄段，例如 e0=10 的模型在 112 岁以后），
 *    l(x)=0 意味着「没有一个人活到 x 岁」，此时 e(x) 无意义。
 *    这里取 0，避免 0/0 = NaN 污染整张表。
 *
 * @param {number[]} mu 长度 120 的死亡力数组
 * @returns {Array<{age:number,mu:number,q:number,l:number,e:number}>}
 */
function buildTable(mu) {
  const l = buildL(mu);
  const suffix = buildSuffix(l);

  const table = new Array(MAX_AGE + 1);
  for (let x = 0; x <= MAX_AGE; x += 1) {
    table[x] = {
      age: x,
      mu: mu[x],
      q: -Math.expm1(-mu[x]),
      l: l[x],
      e: l[x] > 0 ? suffix[x + 1] / l[x] : 0,
    };
  }
  return table;
}

/**
 * 标定：求 beta，使生命表的 e0 等于输入的 e0。
 *
 * 标定目标 e0Model(beta) = Σ_{x=1}^{119} l(x)（= e(0)，见 buildTable 的说明），
 * 它对 beta **单调递减**（beta 越大 → 死亡力越高 → 活得更短），
 * 所以可以在 log(beta) 上二分。
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
    // 用与 buildTable 完全一致的运算顺序，保证 e0Model 与 table[0].e 逐位相同
    return buildSuffix(buildL(mu))[1];
  };

  let lo = BETA_LOG_MIN;
  let hi = BETA_LOG_MAX;
  for (let i = 0; i < MAX_ITER; i += 1) {
    const mid = (lo + hi) / 2;
    if (mid === lo || mid === hi) break; // 浮点精度已经榨干
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
  // ⚠️ 真实数据里偶尔出现 under5Mort < infantMort（口径不同、年份不同导致的脏数据）。
  //    但定义上「5 岁以下死亡率」不可能低于「婴儿死亡率」——0~4 岁的死亡包含了 0 岁那一份。
  //    所以这里把 q5 抬到 q0。**不抛异常**：现实数据就是脏的，游戏必须继续跑，
  //    静默夹住并在注释里说明，比让整个国家「炸掉」或悄悄违反输入更可取。
  const q5 = Math.max(under5Mort / 1000, q0);
  // log1p 在 q 很小时比 log(1-q) 精度高（q=0.005 时相对误差差约 1e-13）
  const mu0 = -Math.log1p(-q0);

  // 1~4 岁的年别死亡率：由「5 岁前死亡概率 = q5」**精确反解**。
  //   1 - (1-q0)·(1-q1_4)^4 = q5
  //   ⇒ (1-q1_4)^4 = (1-q5)/(1-q0)
  //   ⇒ q1_4 = 1 - ((1-q5)/(1-q0))^(1/4)
  // 旧的近似式 q1_4 = (q5-q0)/4 会让 P(age<5) 系统性地偏低 2~3 个百分点
  // （IMR=200 时差 2.3e-2，IMR=300 时差 3.3e-2），所以改成精确解。
  let q1_4 = 0;
  if (q0 < 1 && q5 > q0) {
    const ratio = (1 - q5) / (1 - q0);
    if (ratio > 0) q1_4 = 1 - Math.pow(ratio, 0.25);
  }
  if (!(q1_4 > 0)) q1_4 = 0; // 兜底：NaN / 负数一律当 0（不死亡）
  const mu14 = -Math.log1p(-q1_4);

  const { beta, e0Model, converged } = calibrate(e0, gamma, mu0, mu14);
  const muArray = buildMuArray(beta, gamma, mu0, mu14);
  const table = buildTable(muArray);

  /**
   * 年龄别死亡力 μ(x)。整数年龄直接查表；15 岁以后用 Gompertz 外推，
   * 所以 120 岁以后调用也不会抛错（只会越来越陡）。
   *
   * ⚠️ 非法输入（NaN / Infinity / 负年龄）直接抛错。
   *    以前这里返回 0，而 0 的含义是「不死」：抽样器里 `rng() < q` 恒为假，
   *    NaN 会被静默地翻译成「活到年龄上限」，把数据错误伪装成一条正常的人生。
   */
  const mu = (x) => {
    if (!Number.isFinite(x)) {
      throw new Error(`m.mu: 年龄必须是有限数字（收到 ${x}）`);
    }
    if (x < 0) {
      throw new Error(`m.mu: 年龄不能为负（收到 ${x}）`);
    }
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
 * q(x) = -expm1(-μ(x))（等价于 1-exp(-μ(x))，但小 μ 时更准）。
 * 因为是条件抽样（前提是已经活到 x 岁），
 * 「本年死亡」的无条件概率自动等于 l(x)·q(x)，正是生命表里的那一份。
 *
 * ⚠️ 与任务书伪代码的一处位移修正（重要）：
 *   伪代码以 surv = 1 起步、每轮判 `rng() >= surv`，那样 `rng() >= 1` 恒为假，
 *   「第 0 年死亡」永远抽不到，P(age = 0) = 0，与「婴儿死亡率」这个输入直接矛盾
 *   （任务书自己的注释也写的是 P(death at age 0) = 1 - exp(-μ(0)) = q0）。
 *   本实现采用等价的条件概率写法，每次迭代消耗一个随机数（抽取次数不变），
 *   保证 P(age = 0) = q0、P(age < 5) = q5。
 *
 * ⚠️ 没有任何「强制死亡上限」参数：模型本身就以 MAX_AGE=119 收口，
 *    活过 119 岁的概率 l(120) 在数值上就是 0。
 *    以前这里有个 maxAge 选项，会把 l(cap) 的**全部**概率质量堆到 cap 那一个年龄上
 *    （cap=20 时是真实概率密度的 760 倍，cap=50 时是 43 倍），是个陷阱，已删除。
 *
 * @param {() => number} rng 注入的随机数发生器
 * @param {object} m buildMortality 的返回值
 * @returns {{age:number, band:number}} 死亡年龄（周岁）及其分段
 */
export function sampleDeathAge(rng, m) {
  if (typeof rng !== 'function') {
    throw new Error('sampleDeathAge: rng 必须是函数');
  }
  if (!m || typeof m.mu !== 'function') {
    throw new Error('sampleDeathAge: m 必须是 buildMortality 的返回值');
  }

  for (let x = 0; x <= MAX_AGE; x += 1) {
    const q = -Math.expm1(-m.mu(x));
    if (rng() < q) return { age: x, band: bandOf(x) };
  }
  // 活过了 119 岁（概率 l(120) ≈ 0）：按模型上限收口
  return { age: MAX_AGE, band: bandOf(MAX_AGE) };
}
