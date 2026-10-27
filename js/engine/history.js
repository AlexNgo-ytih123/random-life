/**
 * js/engine/history.js
 * 历史统计插值模块：实现 1950-2025 之间的指标平滑过渡。
 */

/**
 * 对指标时间序列进行线性插值，获取目标年份的值
 * @param {Object} series { "1960": 55.2, "1970": 60.1, ... }
 * @param {number} targetYear 目标年份
 * @returns {number|null} 插值后的数值
 */
export function interpolateIndicator(series, targetYear) {
  if (!series || typeof series !== 'object') return null;
  
  const years = Object.keys(series).map(Number).sort((a, b) => a - b);
  if (years.length === 0) return null;

  // 1. 精确命中
  if (series[targetYear] !== undefined) return series[targetYear];

  // 2. 寻找最近的两个邻居
  let leftIdx = -1;
  let rightIdx = -1;

  for (let i = 0; i < years.length; i++) {
    if (years[i] < targetYear) leftIdx = i;
    if (years[i] > targetYear) {
      rightIdx = i;
      break;
    }
  }

  // 情况 A: targetYear 早于所有记录 -> 取最早的值
  if (leftIdx === -1) return series[years[0]];

  // 情况 B: targetYear 晚于所有记录 -> 取最晚的值
  if (rightIdx === -1) return series[years[years.length - 1]];

  // 情况 C: 在两个记录点之间 -> 线性插值
  const y1 = years[leftIdx];
  const v1 = series[y1];
  const y2 = years[rightIdx];
  const v2 = series[y2];

  if (v1 === null || v2 === null) return v1 ?? v2 ?? null;

  // 线性插值公式: v = v1 + (v2 - v1) * (target - y1) / (y2 - y1)
  return v1 + (v2 - v1) * (targetYear - y1) / (y2 - y1);
}

/**
 * 为整个国家在特定年份构建指标快照
 * @param {Object} countryData { indicators: { lifeExp: { "1960": 50, ... }, ... } }
 * @param {number} year 目标年份
 * @returns {Object} { lifeExp: 52.3, ... }
 */
export function buildYearlyIndicators(countryData, year) {
  if (!countryData || !countryData.indicators) return {};
  
  const snapshot = {};
  for (const key in countryData.indicators) {
    const series = countryData.indicators[key];
    // 如果 series 是时间序列对象 { "1960": 50, ... }
    if (series && typeof series === 'object' && !Array.isArray(series) && (series.value === undefined)) {
      snapshot[key] = interpolateIndicator(series, year);
    } else if (series && series.value !== undefined) {
      // 如果已经是处理好的单一值对象 { value, year }，直接返回 value
      snapshot[key] = series.value;
    }
  }
  return snapshot;
}

// 返回带年份的指标，外推时保留真实来源年份，插值时记录两个端点。
function historicalIndicator(series, requestedYear) {
  const years = Object.keys(series).map(Number)
    .filter(year => Number.isFinite(year) && Number.isFinite(series[year]))
    .sort((a, b) => a - b);
  if (!years.length) return null;
  if (years.includes(requestedYear)) {
    return { value: series[requestedYear], year: requestedYear, requestedYear, fallback: false, sourceYears: [requestedYear] };
  }
  const left = years.filter(year => year < requestedYear).at(-1);
  const right = years.find(year => year > requestedYear);
  if (left !== undefined && right !== undefined) {
    const value = series[left] + (series[right] - series[left]) * (requestedYear - left) / (right - left);
    return { value, year: null, requestedYear, interpolated: true, fallback: false, sourceYears: [left, right] };
  }
  const year = left ?? right;
  return { value: series[year], year, requestedYear, fallback: true, sourceYears: [year] };
}

export function countryForYear(world, iso3, year) {
  const country = world.index.byIso[iso3];
  if (!country) return null;
  const indicators = Object.fromEntries(Object.entries(country.indicators || {}).map(([key, entry]) => [key, {
    ...entry, requestedYear: year, fallback: entry.year !== year,
  }]));
  const history = world.history?.[iso3] || {};
  const keys = new Set(Object.values(history).flatMap(row => Object.keys(row || {})));
  for (const key of keys) {
    const series = Object.fromEntries(Object.entries(history).map(([sourceYear, row]) => [sourceYear, row?.[key]]));
    const entry = historicalIndicator(series, year);
    if (entry) indicators[key] = { ...entry, source: 'Our World in Data' };
  }
  return { ...country, indicators };
}

// 死因用死亡日历年的整条观测记录：优先最近的过去年份，无过去记录时取最早年份。
export function causeForYear(world, iso3, requestedYear) {
  const history = world.causes?.[iso3] || {};
  const years = Object.keys(history).map(Number).filter(year => {
    const row = history[year];
    return Number.isFinite(year) && ['communicable', 'ncd', 'injury'].some(key => Number.isFinite(row?.[key]) && row[key] > 0);
  }).sort((a, b) => a - b);
  const year = years.filter(year => year <= requestedYear).at(-1) ?? years[0];
  if (year === undefined) return { mix: null, year: null, requestedYear, fallback: true, source: null };
  return { mix: { ...history[year] }, year, requestedYear, fallback: year !== requestedYear, source: 'World Bank cause of death (SH.DTH.COMM/NCOM/INJR.ZS)' };
}
