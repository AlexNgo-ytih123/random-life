// 死因模型：决定「这个人是被什么带走的」。
//
// 数据来源是 data/causes.json —— 世界银行按国家、按年发布的三类死因占比：
//   SH.DTH.COMM.ZS  传染病
//   SH.DTH.NCOM.ZS  非传染性疾病
//   SH.DTH.INJR.ZS  伤害
//
// ⚠️ 这份数据是**全年龄**口径的，而玩家是在某个具体年龄段去世的。
//   直接拿全年龄结构去抽，结果会非常失真：
//     - 2019 年的中国，全年龄死因里传染病只占约 3.5%，
//       但一岁以内夭折的孩子几乎全部是被传染病（肺炎、腹泻等）带走的；
//     - 反过来，85 岁的老人死于心脑血管疾病或癌症的概率，
//       远高于「全年龄」平均水平。
//   年龄别死因结构是各国死因统计里最稳定的规律之一：
//   年龄越大 → 传染病占比越低、非传染性疾病占比越高。
//
// 所以本模块做两件事：
//   ① reweightByAge：把全年龄结构乘上「年龄系数」再归一化，
//      得到近似的**年龄段**死因结构；
//   ② sampleCause：在该结构上用逆 CDF 抽一个具体的死因。
//
// 年龄系数（CAUSE_BANDS 里的 factors）是标定出来的经验值，
// 不是精确的年龄别死亡率矩阵。但它保住了核心体验：
// 「在这个国家、这个年代、以这个年纪死去的人，死因画像应该长这样」。
//
// 纯函数模块：不碰 DOM、不联网、不用 Math.random()、不用 Date.now()。
// 随机数一律由调用方注入（js/engine/rng.js 的 makeRng），
// 因此同一个种子永远得到同一个死因。

/** 死因的采样顺序。逆 CDF 依赖固定顺序，改动会作废已分享的种子。 */
const CAUSE_ORDER = ['communicable', 'ncd', 'injury'];

/** 死因的显示名。 */
const CAUSE_LABELS = {
  communicable: '传染病',
  ncd: '非传染性疾病',
  injury: '伤害',
};

/** 数据口径的默认说明（当调用方没给 meta.source 时）。 */
export const DEFAULT_SOURCE = 'World Bank cause of death (SH.DTH.COMM/NCOM/INJR.ZS)';

/**
 * 年龄分段及其死因系数。
 *
 * 下标必须与 js/engine/mortality.js 的 `bandOf(age)` 完全一致：
 *   0: 0 岁      1: 1~4 岁     2: 5~14 岁    3: 15~39 岁
 *   4: 40~59 岁  5: 60~79 岁   6: 80 岁以上
 *
 * `factors` 是把全年龄结构变成年龄段结构的乘子：
 *   - 婴儿期传染系数高达 3.0（同时非传染只有 0.2）——婴儿夭折几乎都是感染；
 *   - 老年期非传染系数 1.25~1.35、传染只有 0.4~0.5 —— 老年死因以慢病为主。
 *
 * `ageMin`/`ageMax` 是该分段覆盖的年龄闭区间（用于 UI 展示与自检）。
 * 注意 bandOf 的边界是左闭右开（[0,1) [1,5) …），
 * 所以 band 0 的 ageMax=1 表示「第一年生命」，1 岁本身已属于 band 1；
 * band 6 的 ageMax=120 是人类寿命的实际上限（mortality.js 的 MAX_AGE 是 119）。
 */
export const CAUSE_BANDS = [
  { label: '婴儿期', ageMin: 0, ageMax: 1, factors: { communicable: 3.0, ncd: 0.2, injury: 1.5 } },
  { label: '幼儿期', ageMin: 1, ageMax: 4, factors: { communicable: 2.5, ncd: 0.3, injury: 1.4 } },
  { label: '儿童期', ageMin: 5, ageMax: 14, factors: { communicable: 1.8, ncd: 0.5, injury: 1.3 } },
  { label: '青年期', ageMin: 15, ageMax: 39, factors: { communicable: 1.3, ncd: 0.8, injury: 1.4 } },
  { label: '中年期', ageMin: 40, ageMax: 59, factors: { communicable: 0.8, ncd: 1.1, injury: 0.9 } },
  { label: '老年期', ageMin: 60, ageMax: 79, factors: { communicable: 0.5, ncd: 1.25, injury: 0.7 } },
  { label: '高龄期', ageMin: 80, ageMax: 120, factors: { communicable: 0.4, ncd: 1.35, injury: 0.6 } },
];

/**
 * 钳制年龄段下标到 [0, 6]。
 * 越界不抛错：调用方（尤其是外部数据）给错下标时，退化成最接近的合法分段
 * 比让整局游戏崩掉要好。
 *
 * @param {number} band
 * @returns {number} 0..6
 */
function clampBand(band) {
  if (!Number.isFinite(band)) return 0;
  const n = Math.floor(band);
  if (n < 0) return 0;
  if (n > CAUSE_BANDS.length - 1) return CAUSE_BANDS.length - 1;
  return n;
}

/**
 * 按年龄段重加权。
 *
 * 输入是**全年龄**的百分数（不必加总到 100），输出是归一化后的概率（和为 1）。
 * 缺失 / 非有限 / 负数的字段一律按 0 处理，绝不产生 NaN。
 *
 * @param {{communicable?:number, ncd?:number, injury?:number}|null} mix
 *   某国某年的三类死因占比（百分数）
 * @param {number} band 年龄段下标（越界会被钳制到 [0,6]）
 * @returns {{communicable:number, ncd:number, injury:number}|null}
 *   归一化后的概率（和为 1）；数据不可用时返回 null
 */
export function reweightByAge(mix, band) {
  const b = clampBand(band);
  const { factors } = CAUSE_BANDS[b];

  if (!mix || typeof mix !== 'object') return null;

  const out = {};
  let total = 0;
  for (const key of CAUSE_ORDER) {
    const raw = mix[key];
    const value = typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : 0;
    const w = value * factors[key];
    out[key] = w;
    total += w;
  }

  // 三类全为 0（或全是非数）→ 没有可用数据。
  // 这里必须返回 null 让调用方知道「查无此因」，而不是硬凑一个假答案。
  if (!(total > 0)) return null;

  for (const key of CAUSE_ORDER) out[key] /= total;
  return out;
}

/**
 * 抽一个死因。
 *
 * 逆 CDF（累积概率）抽样，**恰好消耗一个随机数**，
 * 因此不会打乱别的模块对随机数序列的消耗节奏（种子 → 人生的公开契约）。
 *
 * @param {() => number} rng 注入的随机数发生器
 * @param {{communicable?:number, ncd?:number, injury?:number}|null} mix
 *   某国某年的三类死因占比（百分数）
 * @param {number} band 年龄段下标（越界会被钳制到 [0,6]）
 * @param {{year?:number|string, source?:string}} [meta]
 *   数据口径元信息（数据年份 / 来源），会原样回显
 * @returns {{
 *   available: boolean, cause: string|null, causeLabel: string|null,
 *   band: number, share: number|null, source: string|null, year: number|string|null
 * }}
 */
export function sampleCause(rng, mix, band, meta = {}) {
  if (typeof rng !== 'function') {
    throw new Error('sampleCause: rng 必须是函数');
  }

  const b = clampBand(band);
  const weighted = reweightByAge(mix, b);

  // 数据不可用 → 明确告诉调用方「没有死因数据」。
  // 注意此时 source/year 也返回 null：没有数据就没有口径可言。
  if (!weighted) {
    return {
      available: false,
      cause: null,
      causeLabel: null,
      band: b,
      share: null,
      source: null,
      year: null,
    };
  }

  const u = rng(); // 唯一的一次随机数消耗

  // 逆 CDF：找到第一个累积概率超过 u 的类别。
  // 浮点误差可能让最后的累积和略小于 1，此时退回概率最大的类别。
  let acc = 0;
  let cause = null;
  let prob = 0;
  let fallback = null;
  let fallbackProb = 0;
  for (const key of CAUSE_ORDER) {
    const p = weighted[key];
    if (p > fallbackProb) {
      fallback = key;
      fallbackProb = p;
    }
    acc += p;
    if (cause === null && u < acc) {
      cause = key;
      prob = p;
    }
  }
  if (cause === null) {
    cause = fallback;
    prob = fallbackProb;
  }

  const m = meta && typeof meta === 'object' ? meta : {};
  const source =
    typeof m.source === 'string' && m.source.length > 0 ? m.source : DEFAULT_SOURCE;
  const year = m.year === undefined || m.year === null ? null : m.year;

  return {
    available: true,
    cause,
    causeLabel: CAUSE_LABELS[cause],
    band: b,
    // share 是**百分数**（0~100），保留一位小数
    share: Math.round(prob * 1000) / 10,
    source,
    year,
  };
}
