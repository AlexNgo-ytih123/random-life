/**
 * Random Life —— 运行时数据加载器
 *
 * 职责：
 *  1. 索引世界数据：把 countries.json / births.json 组织成「国家列表 + 出生人口权重表 + byIso 映射」；
 *  2. 解析指标：从国家对象里取某个指标 {value, year}；
 *  3. 显式的缺失回退策略：数据缺失时返回 null 并标注来源，绝不用 0 冒充。
 *
 * 运行期约束：
 *  - 纯 ES module，浏览器与 Node 都能 import；
 *  - 导入时没有任何副作用（不自动 fetch、不碰 DOM）；
 *  - 浏览器端用 loadWorld(urlPrefix) 拉取静态 JSON；Node 端（测试 / 未来打包）用 loadWorldFromObjects()。
 *
 * 数据形状（见 data/countries.json）：
 *   countries.json : { meta, countries: { ISO3: { iso3, name, region, indicators: { key: {value, year} } } } }
 *   births.json    : { ISO3: { "1950": 12345, ... } }
 */

/** data/ 下的五个数据文件（不含 .json 扩展名） */
export const DATA_FILES = ['countries', 'births', 'history', 'causes', 'meta'];

/* ------------------------------------------------------------------ *
 * 内部小工具
 * ------------------------------------------------------------------ */

/** 只有有限数值才算「有数据」；null / undefined / NaN / Infinity 一律视为缺失（绝不当作 0）。 */
function finiteOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** 任意输入 → 国家映射 {ISO3: country}；兼容两种形状：
 *  - countries.json 载荷 { meta, countries: {ISO3: {...}} }
 *  - 裸映射 {ISO3: {...}}
 */
export function countryMap(source) {
  if (!source || typeof source !== 'object') return {};
  const inner = source.countries;
  if (inner && typeof inner === 'object' && !Array.isArray(inner)) return inner;
  return source;
}

/* ------------------------------------------------------------------ *
 * 1. 索引
 * ------------------------------------------------------------------ */

/**
 * 选出「参考年」（用于出生人口权重）。
 *
 * 规则（确定性、可复现）：
 *  - 候选年份 = births 中出现过的所有整数年份；
 *  - 覆盖率 = 该年份下有有效出生数的国家数；
 *  - 参考年 = 「最新的、覆盖率至少达到半数国家」的年份；
 *  - 若没有任何年份达到半数覆盖，退而使用全局最大年份（少数国家有数据，权重照常计算，其余为 0）。
 *  - 半数的分母 = 参与计算的国家数（默认 births 里出现过的国家；也可由调用方指定）。
 *
 * @param {object} births {ISO3: {year: n}}
 * @param {{countries?: string[]}} [options] 限定参与计算的国家 ISO3
 * @returns {number|null} 参考年；没有任何出生数据时返回 null
 */
export function pickReferenceYear(births, options = {}) {
  const map = births && typeof births === 'object' ? births : {};
  const allowed = Array.isArray(options.countries) ? new Set(options.countries) : null;
  const isIncluded = (iso) => (allowed ? allowed.has(iso) : true);

  const coverage = new Map();
  for (const [iso, series] of Object.entries(map)) {
    if (!isIncluded(iso)) continue;
    if (!series || typeof series !== 'object') continue;
    for (const [rawYear, value] of Object.entries(series)) {
      const year = Number(rawYear);
      if (!Number.isInteger(year)) continue;
      if (finiteOrNull(value) === null) continue; // 无效值不计入覆盖
      coverage.set(year, (coverage.get(year) ?? 0) + 1);
    }
  }
  if (coverage.size === 0) return null;

  const participants = Object.keys(map).filter((iso) => isIncluded(iso)).length;
  const half = Math.ceil(participants / 2);
  const years = [...coverage.keys()].sort((a, b) => b - a); // 由新到旧
  for (const year of years) {
    if (coverage.get(year) >= half) return year;
  }
  return years[0]; // 兜底：全局最大年份
}

/**
 * 建立国家索引。
 *
 * @param {object} raw countries.json 载荷（含 countries 映射）或裸国家映射
 * @param {object} births {ISO3: {year: n}}
 * @returns {{list: object[], weights: {iso3: string, w: number}[], byIso: Record<string, object>}}
 *   - list：国家对象数组，按「参考年出生人口降序 + ISO3 升序」排列（确定性）；
 *   - weights：与 list 同序的 {iso3, w}；参考年没有出生数的国家 w = 0（不会被加权抽中，但仍在 list 里）；
 *   - byIso：ISO3 → 国家对象。
 */
export function buildIndex(raw, births) {
  const map = countryMap(raw);
  const birthMap = births && typeof births === 'object' ? births : {};
  const isos = Object.keys(map).sort();

  const referenceYear = pickReferenceYear(birthMap, { countries: isos });

  const entries = isos.map((iso) => {
    const country = map[iso] ?? {};
    const series = birthMap[iso];
    const w = referenceYear === null ? 0 : (finiteOrNull(series?.[String(referenceYear)]) ?? 0);
    return { iso, country, w };
  });

  // 出生人口降序；相同则 ISO3 升序（保证结果确定）
  entries.sort((a, b) => (b.w - a.w) || (a.iso < b.iso ? -1 : a.iso > b.iso ? 1 : 0));

  return {
    list: entries.map((e) => e.country),
    weights: entries.map((e) => ({ iso3: e.iso, w: e.w })),
    byIso: Object.fromEntries(entries.map((e) => [e.iso, e.country])),
  };
}

/* ------------------------------------------------------------------ *
 * 2. 指标解析
 * ------------------------------------------------------------------ */

/**
 * 取某个指标。
 *
 * @param {object} country { iso3, indicators: { key: {value, year} } }
 * @param {string} key 指标名（如 'lifeExp'、'gini'）
 * @returns {{value: number, year: number|null}|null} 缺失或数值非法时返回 null（不是 0）
 */
export function pickIndicator(country, key) {
  if (!country || typeof country !== 'object') return null;
  const indicators = country.indicators;
  if (!indicators || typeof indicators !== 'object') return null;

  const entry = indicators[key];
  if (entry === null || entry === undefined) return null;

  // 兼容裸数值（没有年份信息）
  if (typeof entry === 'number') {
    return Number.isFinite(entry) ? { value: entry, year: null } : null;
  }
  if (typeof entry !== 'object') return null;

  const value = finiteOrNull(entry.value);
  if (value === null) return null; // 缺失绝不退化成 0
  const year = typeof entry.year === 'number' && Number.isFinite(entry.year) ? entry.year : null;
  return { value, year };
}

/* ------------------------------------------------------------------ *
 * 3. 显式回退策略
 * ------------------------------------------------------------------ */

/**
 * 解析指标并按明确的回退链给出结果：
 *   1. 本国数据      → { value, year, fallback: false, source: 'country' }
 *   2. 区域中位数    → { value: regionMedian, year: null, fallback: true, source: 'region-median' }
 *   3. 彻底没有数据  → { value: null, year: null, fallback: true, source: 'unavailable' }  ← 绝不写 0
 *
 * @param {object} raw countries.json 载荷或裸国家映射
 * @param {string} iso 国家 ISO3
 * @param {string} key 指标名
 * @param {{region?: string|null, regionMedian?: number|null}} [options]
 *        region 仅用于让调用点自解释（模块不自行计算区域中位数）；
 *        regionMedian 必须是显式传入的有限数值。
 */
export function resolveWithFallback(raw, iso, key, options = {}) {
  const opts = options ?? {};
  const map = countryMap(raw);
  const hit = pickIndicator(map[iso], key);
  if (hit) {
    return { value: hit.value, year: hit.year, fallback: false, source: 'country' };
  }

  const median = finiteOrNull(opts.regionMedian);
  if (median !== null) {
    return { value: median, year: null, fallback: true, source: 'region-median' };
  }

  return { value: null, year: null, fallback: true, source: 'unavailable' };
}

/* ------------------------------------------------------------------ *
 * 4. 世界对象装配
 * ------------------------------------------------------------------ */

/**
 * 用已解析好的 JSON 对象装配世界对象（Node 测试 / 未来打包用）。
 *
 * @param {{countries?: object, births?: object, history?: object, causes?: object, meta?: object}} objects
 * @returns {{countries: object, births: object, history: object, causes: object, meta: object, index: object}}
 */
export function loadWorldFromObjects(objects = {}) {
  const source = objects ?? {};
  const countries = source.countries ?? { countries: {} };
  const births = source.births ?? {};
  const history = source.history ?? {};
  const causes = source.causes ?? {};
  const meta = source.meta ?? {};
  return {
    countries,
    births,
    history,
    causes,
    meta,
    index: buildIndex(countries, births),
  };
}

/** 极简 JSON 抓取：带上下文的错误信息，失败就抛，绝不静默返回空对象。 */
async function fetchJson(url, fetchImpl) {
  let res;
  try {
    res = await fetchImpl(url, { headers: { accept: 'application/json' } });
  } catch (err) {
    throw new Error(`加载 ${url} 失败: ${err?.message ?? err}`);
  }
  if (!res || res.ok === false) {
    throw new Error(`加载 ${url} 失败: HTTP ${res?.status ?? '未知状态'}`);
  }
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`解析 ${url} 失败: 不是合法 JSON（${err?.message ?? err}）`);
  }
}

/**
 * 浏览器端：并发拉取 data/ 下的五个 JSON 并装配世界对象。
 * 只有在显式调用时才发起请求；导入本模块不会触发任何网络访问。
 *
 * @param {string} [urlPrefix] 形如 './data/' 或 'data/'
 * @param {{fetchImpl?: Function}} [options] 可注入 fetch（测试用）
 * @returns {Promise<{countries, births, history, causes, meta, index}>}
 */
export async function loadWorld(urlPrefix = './data/', options = {}) {
  const prefixRaw = String(urlPrefix ?? './data/');
  const prefix = prefixRaw.endsWith('/') ? prefixRaw : `${prefixRaw}/`;
  const fetchImpl = options?.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('loadWorld 需要可用的 fetch（浏览器环境或显式传入 fetchImpl）');
  }

  const entries = await Promise.all(
    DATA_FILES.map(async (name) => [name, await fetchJson(`${prefix}${name}.json`, fetchImpl)]),
  );
  return loadWorldFromObjects(Object.fromEntries(entries));
}
