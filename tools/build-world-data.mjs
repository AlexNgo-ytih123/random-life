#!/usr/bin/env node
/**
 * 把 data/raw/ 下的 OWID + World Bank 原始下载清洗成游戏的静态数据文件。
 *
 * 产出（全部是构建期静态文件，运行时零网络请求）：
 *   data/countries.json  { meta, countries: { ISO3: { iso3, name, nameEn, region, indicators } } }
 *   data/births.json     { ISO3: { "1950": 出生数, ... } }        （实际值与 UN 投影值合并）
 *   data/history.json    { ISO3: { "1950": { lifeExp, population, fertility }, ... } }
 *   data/causes.json     { ISO3: { "2019": { communicable, ncd, injury }, ... } }
 *   data/meta.json       { generated, series: [{ key, source, url, license, retrieved, unit, note }] }
 *
 * 约定：
 * - **缺失不填 0**：某指标/某年没有数据，就不写这个 key。
 * - **不插值、不外推**：history.json 只记录原始数据里真实存在的年份。
 * - **确定性**：同一份原始输入跑两次，除 data/meta.json 的 generated（按天）外逐字节一致。
 * - 本文件可被安全 import（不会触发任何 IO）；只有直接 `node tools/build-world-data.mjs` 才执行构建。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseCsvTable } from './lib/http.mjs';
import { nameOf, nameEnOf, regionOf } from './lib/names.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW_OWID_DIR = path.join(ROOT, 'data', 'raw', 'owid');
const RAW_WB_DIR = path.join(ROOT, 'data', 'raw', 'worldbank');
const OUT_DIR = path.join(ROOT, 'data');

/* ================================================================== *
 * 一、纯函数层（可被测试直接调用，不碰文件系统）
 * ================================================================== */

/** ISO3 国家代码：3 位大写字母 */
const ISO3_RE = /^[A-Z]{3}$/;

/**
 * 把任意输入转成有限数字；无法转换时返回 null（注意 null/'' 不能变成 0）。
 * @param {unknown} value
 * @returns {number|null}
 */
export function toNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') return null;
  const text = String(value).trim();
  if (text === '') return null;
  const num = Number(text);
  return Number.isFinite(num) ? num : null;
}

/**
 * 合并多个「年份 → 数值」序列。
 * 后面的序列只补空缺，不覆盖前面已有的值；返回的键按年份升序。
 *
 * @param {Array<Record<string, unknown>>} list
 * @returns {Record<string, number>}
 */
export function mergeSeries(list) {
  /** @type {Record<string, number>} */
  const out = {};
  if (!Array.isArray(list)) return out;

  for (const series of list) {
    if (!series || typeof series !== 'object') continue;
    for (const [rawYear, rawValue] of Object.entries(series)) {
      const year = Number(rawYear);
      if (!Number.isFinite(year)) continue;
      const value = toNumber(rawValue);
      if (value === null) continue;
      const key = String(year);
      if (key in out) continue; // 已有值不覆盖
      out[key] = value;
    }
  }

  return Object.fromEntries(
    Object.entries(out).sort((a, b) => Number(a[0]) - Number(b[0])),
  );
}

/**
 * 在 [fromYear, toYear] 窗口内取最新一个有值的年份。
 *
 * @param {Record<string, unknown>|null} series 年份 → 数值
 * @param {number} fromYear
 * @param {number} toYear
 * @returns {{value:number, year:number}|null}
 */
export function pickLatest(series, fromYear, toYear) {
  if (!series || typeof series !== 'object') return null;

  let bestYear = null;
  let bestValue = null;

  for (const [rawYear, rawValue] of Object.entries(series)) {
    const year = Number(rawYear);
    if (!Number.isFinite(year)) continue;
    if (Number.isFinite(fromYear) && year < fromYear) continue;
    if (Number.isFinite(toYear) && year > toYear) continue;
    const value = toNumber(rawValue);
    if (value === null) continue;
    if (bestYear === null || year > bestYear) {
      bestYear = year;
      bestValue = value;
    }
  }

  if (bestYear === null) return null;
  return { value: bestValue, year: bestYear };
}

/**
 * 中位数；空列表返回 null。
 * @param {number[]|null} list
 * @returns {number|null}
 */
export function median(list) {
  if (!Array.isArray(list)) return null;
  const nums = list
    .map((v) => toNumber(v))
    .filter((v) => v !== null)
    .sort((a, b) => a - b);
  if (nums.length === 0) return null;
  const mid = Math.floor(nums.length / 2);
  if (nums.length % 2 === 1) return nums[mid];
  return (nums[mid - 1] + nums[mid]) / 2;
}

/**
 * 四舍五入到小数点后 4 位（整数原样返回，避免大整数出现浮点尾巴）。
 * @param {number} value
 * @returns {number}
 */
export function round4(value) {
  if (!Number.isFinite(value)) return value;
  if (Number.isInteger(value)) return value;
  const rounded = Number(value.toFixed(4));
  return Object.is(rounded, -0) ? 0 : rounded;
}

export { regionOf, nameOf, nameEnOf };

/* ================================================================== *
 * 二、常量表：指标 → 数据来源 / 单位 / 说明
 * ================================================================== */

/** OWID 的 10 个原始序列（读取顺序即优先级：population 优先提供英文名） */
const OWID_KEYS = [
  'population',
  'lifeExp',
  'births',
  'fertility',
  'childMort',
  'schooling',
  'agriculture',
  'homicide',
  'maternal',
  'smoking',
];

/** World Bank 的 20 个原始指标 */
const WB_KEYS = [
  'lifeExp',
  'lifeExpFemale',
  'lifeExpMale',
  'infantMort',
  'under5Mort',
  'causeCommunicable',
  'causeNcd',
  'causeInjury',
  'gdpPcapPpp',
  'gini',
  'urbanRate',
  'sexRatioBirth',
  'unemployment',
  'oopHealth',
  'doctors',
  'maternalRatio',
  'immunization',
  'poverty',
  'homicide',
  'tertiaryEnroll',
];

/**
 * data/countries.json 里的 indicators：键顺序即输出顺序。
 * source 为 'owid' | 'wb'；causes* 三个键特殊处理（取三者都存在的最新年份）。
 */
const INDICATOR_DEFS = [
  { key: 'lifeExp', source: 'owid', series: 'lifeExp', from: 1950, to: 2100 },
  { key: 'lifeExpFemale', source: 'wb', series: 'lifeExpFemale', from: 1990, to: 2023 },
  { key: 'lifeExpMale', source: 'wb', series: 'lifeExpMale', from: 1990, to: 2023 },
  { key: 'infantMort', source: 'wb', series: 'infantMort', from: 1990, to: 2023 },
  { key: 'under5Mort', source: 'wb', series: 'under5Mort', from: 1990, to: 2023 },
  { key: 'gdpPcapPpp', source: 'wb', series: 'gdpPcapPpp', from: 1990, to: 2023 },
  { key: 'gini', source: 'wb', series: 'gini', from: 1990, to: 2023 },
  { key: 'urbanRate', source: 'wb', series: 'urbanRate', from: 1990, to: 2023 },
  { key: 'sexRatioBirth', source: 'wb', series: 'sexRatioBirth', from: 1990, to: 2023 },
  { key: 'unemployment', source: 'wb', series: 'unemployment', from: 1990, to: 2023 },
  { key: 'oopHealth', source: 'wb', series: 'oopHealth', from: 1990, to: 2023 },
  { key: 'doctors', source: 'wb', series: 'doctors', from: 1990, to: 2023 },
  { key: 'maternalRatio', source: 'wb', series: 'maternalRatio', from: 1990, to: 2023 },
  { key: 'immunization', source: 'wb', series: 'immunization', from: 1990, to: 2023 },
  { key: 'poverty', source: 'wb', series: 'poverty', from: 1990, to: 2023 },
  { key: 'homicide', source: 'owid', series: 'homicide', from: 1990, to: 2100 },
  { key: 'tertiaryEnroll', source: 'wb', series: 'tertiaryEnroll', from: 1990, to: 2023 },
  { key: 'schooling', source: 'owid', series: 'schooling', from: 1950, to: 2100 },
  { key: 'agriculture', source: 'owid', series: 'agriculture', from: 1950, to: 2100 },
  { key: 'smoking', source: 'owid', series: 'smoking', from: 1950, to: 2100 },
  { key: 'fertility', source: 'owid', series: 'fertility', from: 1950, to: 2100 },
  { key: 'population', source: 'owid', series: 'population', from: 1950, to: 2100 },
  { key: 'childMort', source: 'owid', series: 'childMort', from: 1950, to: 2100 },
  { key: 'causesCommunicable', source: 'causes', series: 'communicable', from: 1900, to: 2100 },
  { key: 'causesNcd', source: 'causes', series: 'ncd', from: 1900, to: 2100 },
  { key: 'causesInjury', source: 'causes', series: 'injury', from: 1900, to: 2100 },
];

/** 每个原始序列的单位与说明（写进 data/meta.json） */
const SERIES_INFO = {
  'owid:births': {
    unit: '人/年',
    note: '联合国世界人口展望（UN WPP）出生人口；2023 年及以前为估计值，2024 年起为投影值',
  },
  'owid:lifeExp': {
    unit: '岁',
    note: '联合国世界人口展望（UN WPP）出生时预期寿命；原始数据含 1950 年前的历史重建值',
  },
  'owid:population': {
    unit: '人',
    note: '联合国世界人口展望（UN WPP）总人口；原始数据含负年份的历史重建值，构建时已剔除',
  },
  'owid:fertility': {
    unit: '每名女性生育数',
    note: '联合国世界人口展望（UN WPP）总和生育率',
  },
  'owid:childMort': {
    unit: '‰（每千名活产儿）',
    note: '联合国儿童死亡率估算（UN IGME）5 岁以下儿童死亡率',
  },
  'owid:schooling': {
    unit: '年（平均受教育年限）',
    note: 'Barro-Lee 口径的 15 岁以上人口平均受教育年限（经 OWID 整理）',
  },
  'owid:agriculture': {
    unit: '%（就业人口中农业占比）',
    note: '就业于农业的人口占比（ILO 口径，经 OWID 整理）',
  },
  'owid:homicide': {
    unit: '每 10 万人',
    note: '联合国毒品和犯罪问题办公室（UNODC）故意杀人率（每 10 万人）',
  },
  'owid:maternal': {
    unit: '每 10 万活产儿',
    note: '联合国孕产妇死亡比估算（每 10 万活产儿）',
  },
  'owid:smoking': {
    unit: '%（成年人吸烟率，年龄标准化）',
    note: '成年人吸烟或使用烟草人口占比（年龄标准化）',
  },
  'wb:lifeExp': { unit: '岁', note: '出生时预期寿命（总人口）' },
  'wb:lifeExpFemale': { unit: '岁', note: '出生时预期寿命（女性）' },
  'wb:lifeExpMale': { unit: '岁', note: '出生时预期寿命（男性）' },
  'wb:infantMort': { unit: '‰（每千名活产儿）', note: '婴儿死亡率（1 岁以下，每千名活产儿）' },
  'wb:under5Mort': { unit: '‰（每千名活产儿）', note: '5 岁以下儿童死亡率（每千名活产儿）' },
  'wb:causeCommunicable': {
    unit: '%（占死亡总数）',
    note: '传染性疾病、孕产妇与营养条件导致的死亡占比',
  },
  'wb:causeNcd': { unit: '%（占死亡总数）', note: '非传染性疾病导致的死亡占比' },
  'wb:causeInjury': { unit: '%（占死亡总数）', note: '伤害导致的死亡占比' },
  'wb:gdpPcapPpp': { unit: '现价国际元（PPP）', note: '人均 GDP（购买力平价，现价国际元）' },
  'wb:gini': { unit: '基尼指数（0-100）', note: '居民收入基尼系数' },
  'wb:urbanRate': { unit: '%（城市人口占比）', note: '城市人口占总人口比重' },
  'wb:sexRatioBirth': { unit: '每 100 名女婴对应的男婴数', note: '出生人口性别比' },
  'wb:unemployment': { unit: '%（失业率）', note: '失业率（占总劳动力比重，ILO 估算）' },
  'wb:oopHealth': { unit: '%（占卫生总支出）', note: '自付医疗支出占卫生总支出的比例' },
  'wb:doctors': { unit: '每千人医生数', note: '每 1,000 人拥有的执业医师数' },
  'wb:maternalRatio': { unit: '每 10 万活产儿', note: '孕产妇死亡比（模型估算，每 10 万活产儿）' },
  'wb:immunization': {
    unit: '%（12-23 月龄儿童）',
    note: '12-23 月龄儿童麻疹疫苗接种率',
  },
  'wb:poverty': {
    unit: '%（人口占比）',
    note: '日均消费低于 3 美元（2021 PPP）的人口占比',
  },
  'wb:homicide': { unit: '每 10 万人', note: '故意杀人率（每 10 万人）' },
  'wb:tertiaryEnroll': { unit: '%（毛入学率）', note: '高等教育毛入学率' },
};

/* ================================================================== *
 * 三、IO 层：读原始文件
 * ================================================================== */

/**
 * 列出目录下的数据文件；**排除** `*.meta.json`（那是出处记录，不是数据）。
 * @param {string} dir
 * @param {string} ext 例如 '.csv' / '.json'
 * @returns {string[]}
 */
export function listDataFiles(dir, ext) {
  let entries = [];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return [];
  }
  return entries
    .filter((name) => name.endsWith(ext) && !name.endsWith('.meta.json'))
    .filter((name) => !name.endsWith(`meta${ext}`))
    .sort();
}

/**
 * 读一个 JSON 文件；不存在或损坏时返回 null（不抛异常）。
 * @param {string} file
 * @returns {object|null}
 */
export function readJsonSafe(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * 在 CSV 表头里挑出「数值列」：
 * 优先用原始 meta.json 记录的 valueColumn；没有就取第一个看起来像数据的列。
 *
 * @param {string[]} columns
 * @param {object|null} meta
 * @returns {string|null}
 */
export function pickValueColumn(columns, meta) {
  const declared = meta?.valueColumn;
  if (declared && columns.includes(declared)) return declared;
  const candidate = columns.find(
    (name, idx) =>
      idx >= 3 &&
      !/^(Entity|Code|Year)$/i.test(name) &&
      !/region|annotation|note/i.test(name),
  );
  return candidate ?? null;
}

/**
 * 读一个 OWID 序列（CSV）。
 *
 * @param {string} key
 * @returns {{key:string, meta:object|null, valueColumn:string|null,
 *            projectedColumn:string|null, values:Map<string, Map<number, number>>,
 *            projected:Map<string, Map<number, number>>,
 *            entities:Map<string,string>, regions:Map<string,string>}}
 */
export function readOwidSeries(key) {
  const csvPath = path.join(RAW_OWID_DIR, `${key}.csv`);
  const meta = readJsonSafe(path.join(RAW_OWID_DIR, `${key}.meta.json`));
  const empty = {
    key,
    meta,
    valueColumn: null,
    projectedColumn: null,
    values: new Map(),
    projected: new Map(),
    entities: new Map(),
    regions: new Map(),
  };
  if (!fs.existsSync(csvPath)) return empty;

  const { columns, rows } = parseCsvTable(fs.readFileSync(csvPath, 'utf8'));
  const valueColumn = pickValueColumn(columns, meta);
  const projectedColumn =
    columns.find((name) => /projected/i.test(name) && name !== valueColumn) ?? null;
  const regionColumn = columns.find((name) => /region/i.test(name)) ?? null;

  const values = new Map();
  const projected = new Map();
  const entities = new Map();
  const regions = new Map();

  for (const row of rows) {
    const iso3 = String(row?.Code ?? '').trim().toUpperCase();
    if (!ISO3_RE.test(iso3)) continue;
    const year = Number.parseInt(String(row?.Year ?? '').trim(), 10);
    if (!Number.isFinite(year)) continue;

    const entity = String(row?.Entity ?? '').trim();
    if (entity && !entities.has(iso3)) entities.set(iso3, entity);

    if (regionColumn) {
      const region = String(row?.[regionColumn] ?? '').trim();
      if (region && !regions.has(iso3)) regions.set(iso3, region);
    }

    if (valueColumn) {
      const value = toNumber(row?.[valueColumn]);
      if (value !== null) {
        let byYear = values.get(iso3);
        if (!byYear) {
          byYear = new Map();
          values.set(iso3, byYear);
        }
        byYear.set(year, value);
      }
    }

    if (projectedColumn) {
      const value = toNumber(row?.[projectedColumn]);
      if (value !== null) {
        let byYear = projected.get(iso3);
        if (!byYear) {
          byYear = new Map();
          projected.set(iso3, byYear);
        }
        byYear.set(year, value);
      }
    }
  }

  return {
    key,
    meta,
    valueColumn,
    projectedColumn,
    values,
    projected,
    entities,
    regions,
  };
}

/**
 * 读一个 World Bank 指标（JSON，形状为 { ISO3: { "年份": 数值 } }）。
 *
 * @param {string} key
 * @returns {{key:string, meta:object|null, values:Map<string, Map<number, number>>}}
 */
export function readWorldBankSeries(key) {
  const filePath = path.join(RAW_WB_DIR, `${key}.json`);
  const meta = readJsonSafe(path.join(RAW_WB_DIR, `${key}.meta.json`));
  const values = new Map();
  if (!fs.existsSync(filePath)) return { key, meta, values };

  const raw = readJsonSafe(filePath);
  if (!raw || typeof raw !== 'object') return { key, meta, values };

  for (const [rawIso3, rawByYear] of Object.entries(raw)) {
    const iso3 = String(rawIso3).trim().toUpperCase();
    if (!ISO3_RE.test(iso3)) continue;
    if (!rawByYear || typeof rawByYear !== 'object') continue;
    const byYear = new Map();
    for (const [rawYear, rawValue] of Object.entries(rawByYear)) {
      const year = Number.parseInt(String(rawYear).trim(), 10);
      const value = toNumber(rawValue);
      if (!Number.isFinite(year) || value === null) continue;
      byYear.set(year, value);
    }
    if (byYear.size > 0) values.set(iso3, byYear);
  }

  return { key, meta, values };
}

/** Map<number, number> → { "年份": 数值 }（按年份升序；JS 的整数键本身即升序） */
function mapToYearObject(byYear) {
  const out = {};
  for (const year of [...byYear.keys()].sort((a, b) => a - b)) {
    out[String(year)] = round4(byYear.get(year));
  }
  return out;
}

/* ================================================================== *
 * 四、主流程
 * ================================================================== */

/**
 * 跑完整条构建流水线，返回写出去的文件路径与统计信息。
 * @param {{outDir?:string}} [options]
 */
export function buildAll(options = {}) {
  const outDir = options.outDir ?? OUT_DIR;
  fs.mkdirSync(outDir, { recursive: true });

  /* 0) 原始数据必须齐全，否则直接报错（避免静默产出空数据） */
  const missing = [
    ...OWID_KEYS.map((key) => path.join(RAW_OWID_DIR, `${key}.csv`)),
    ...WB_KEYS.map((key) => path.join(RAW_WB_DIR, `${key}.json`)),
  ].filter((file) => !fs.existsSync(file));
  if (missing.length > 0) {
    throw new Error(
      `缺少原始数据文件（${missing.length} 个），请先运行 node tools/fetch-owid.mjs 与 node tools/fetch-worldbank.mjs：\n` +
        missing.map((file) => `  - ${path.relative(ROOT, file)}`).join('\n'),
    );
  }

  /* 1) 读原始数据 */
  const owid = new Map();
  for (const key of OWID_KEYS) owid.set(key, readOwidSeries(key));
  const wb = new Map();
  for (const key of WB_KEYS) wb.set(key, readWorldBankSeries(key));

  const owidCodes = new Set();
  for (const series of owid.values()) {
    for (const iso3 of series.values.keys()) owidCodes.add(iso3);
  }
  const wbCodes = new Set();
  for (const series of wb.values()) {
    for (const iso3 of series.values.keys()) wbCodes.add(iso3);
  }

  /* 2) 国家集合 = 两者 ISO3 的交集，且必须有 births 与 lifeExp */
  const countryCodes = [...owidCodes]
    .filter((iso3) => wbCodes.has(iso3))
    .filter((iso3) => {
      const births = owid.get('births')?.values.get(iso3);
      const lifeExp = owid.get('lifeExp')?.values.get(iso3);
      return Boolean(births && births.size > 0 && lifeExp && lifeExp.size > 0);
    })
    .sort();

  /* 3) 名字与区域 */
  const entities = new Map(); // 英文名（OWID Entity 列优先）
  const owidRegions = new Map(); // OWID 的 "World region according to OWID" 列
  for (const key of OWID_KEYS) {
    const series = owid.get(key);
    for (const [iso3, entity] of series.entities) {
      if (!entities.has(iso3)) entities.set(iso3, entity);
    }
    for (const [iso3, region] of series.regions) {
      if (!owidRegions.has(iso3)) owidRegions.set(iso3, region);
    }
  }

  /* 4) causes.json：只有三项都存在的年份才保留（不重新归一化） */
  const causeComm = wb.get('causeCommunicable')?.values ?? new Map();
  const causeNcd = wb.get('causeNcd')?.values ?? new Map();
  const causeInj = wb.get('causeInjury')?.values ?? new Map();

  const causes = {};
  for (const iso3 of countryCodes) {
    const comm = causeComm.get(iso3);
    const ncd = causeNcd.get(iso3);
    const inj = causeInj.get(iso3);
    if (!comm || !ncd || !inj) continue;
    const years = [...comm.keys()].filter(
      (year) => ncd.has(year) && inj.has(year),
    );
    if (years.length === 0) continue;
    const byYear = {};
    for (const year of years.sort((a, b) => a - b)) {
      byYear[String(year)] = {
        communicable: round4(comm.get(year)),
        ncd: round4(ncd.get(year)),
        injury: round4(inj.get(year)),
      };
    }
    causes[iso3] = byYear;
  }

  /* 5) births.json / history.json / countries.json */
  const births = {};
  const history = {};
  const countries = {};

  const historySeries = ['lifeExp', 'population', 'fertility'];
  const HISTORY_FROM_YEAR = 1950;

  for (const iso3 of countryCodes) {
    /* 5.1 出生人口：实际值 + UN 投影值合并成同一张年份表 */
    const actual = owid.get('births')?.values.get(iso3) ?? new Map();
    const projected = owid.get('births')?.projected.get(iso3) ?? new Map();
    const birthsByYear = new Map();
    for (const [year, value] of actual) birthsByYear.set(year, value);
    for (const [year, value] of projected) {
      if (!birthsByYear.has(year)) birthsByYear.set(year, value);
    }
    if (birthsByYear.size > 0) births[iso3] = mapToYearObject(birthsByYear);

    /* 5.2 历史序列：只记录真实存在的年份，不插值、不补 0 */
    const historyByYear = {};
    for (const seriesKey of historySeries) {
      const series = owid.get(seriesKey)?.values.get(iso3);
      if (!series) continue;
      for (const [year, value] of series) {
        if (year < HISTORY_FROM_YEAR) continue; // 剔除负年份/远古年份
        const bucket = (historyByYear[year] ??= {});
        bucket[seriesKey] = round4(value);
      }
    }
    if (Object.keys(historyByYear).length > 0) {
      history[iso3] = Object.fromEntries(
        Object.entries(historyByYear).sort((a, b) => Number(a[0]) - Number(b[0])),
      );
    }

    /* 5.3 indicators：每个指标取「最新可用年份」的值 */
    const indicators = {};
    for (const def of INDICATOR_DEFS) {
      if (def.source === 'causes') {
        const byYear = causes[iso3];
        if (!byYear) continue;
        const years = Object.keys(byYear).sort((a, b) => Number(a) - Number(b));
        if (years.length === 0) continue;
        const year = years[years.length - 1];
        const entry = byYear[year];
        const value = entry?.[def.series];
        if (value === undefined) continue;
        indicators[def.key] = { value: round4(value), year: Number(year) };
        continue;
      }

      const source = def.source === 'owid' ? owid : wb;
      const byYear = source.get(def.series)?.values.get(iso3);
      if (!byYear) continue;
      const plain = {};
      for (const [year, value] of byYear) plain[year] = value;
      const latest = pickLatest(plain, def.from, def.to);
      if (!latest) continue; // 缺失不填 0
      indicators[def.key] = { value: round4(latest.value), year: latest.year };
    }

    const nameEn = entities.get(iso3) || nameEnOf(iso3) || iso3;
    const name = nameOf(iso3) || nameEn; // 中文名缺失时回退英文名
    const region = owidRegions.get(iso3) || regionOf(iso3) || null;

    countries[iso3] = {
      iso3,
      name,
      nameEn,
      region,
      indicators,
    };
  }

  /* 6) meta.json：出处、许可、检索时间、单位、口径说明 */
  const birthsMeta = owid.get('births')?.meta ?? null;
  const splitYear = birthsMeta?.projection?.splitYear ?? birthsMeta?.projection?.actualThroughYear ?? null;
  const projectedFromYear = birthsMeta?.projection?.projectedFromYear ?? null;

  const series = [];
  for (const key of OWID_KEYS) {
    const meta = owid.get(key)?.meta ?? null;
    series.push({
      key,
      source: meta?.source ?? 'Our World in Data',
      url: meta?.url ?? `https://ourworldindata.org/grapher/${meta?.slug ?? key}.csv`,
      license: 'CC BY 4.0',
      retrieved: meta?.retrievedAt ?? null,
      unit: SERIES_INFO[`owid:${key}`]?.unit ?? '',
      note: SERIES_INFO[`owid:${key}`]?.note ?? '',
    });
  }
  for (const key of WB_KEYS) {
    const meta = wb.get(key)?.meta ?? null;
    series.push({
      key,
      source: meta?.source ?? 'World Bank Open Data',
      url: meta?.url ?? '',
      license: 'CC BY 4.0',
      retrieved: meta?.retrieved ?? null,
      unit: SERIES_INFO[`wb:${key}`]?.unit ?? '',
      note: SERIES_INFO[`wb:${key}`]?.note ?? '',
    });
  }

  const meta = {
    generated: new Date().toISOString().slice(0, 10),
    countryCount: countryCodes.length,
    births: {
      actualThroughYear: splitYear,
      projectedFromYear,
      note: '出生人口在 2023 年（含）之前为实际/估计值，2024 年起为 UN WPP 投影值，两者合并在同一张年份表里',
    },
    series,
  };

  /* 7) 落盘 */
  const written = [];
  const write = (file, value, pretty) => {
    const target = path.join(outDir, file);
    fs.writeFileSync(target, JSON.stringify(value, null, pretty ? 2 : 0), 'utf8');
    written.push(target);
  };

  write(
    'countries.json',
    {
      meta: {
        countryCount: countryCodes.length,
        generatedBy: 'tools/build-world-data.mjs',
        sources: ['Our World in Data', 'World Bank Open Data'],
        births: { actualThroughYear: splitYear, projectedFromYear },
        note: 'indicators 中缺失的指标不写入该 key（不填 0）；数值四舍五入到小数点后 4 位。',
      },
      countries,
    },
    false, // 紧凑输出：静态资源，体积优先（git diff 交给 tools/ 重新生成即可）
  );
  write('births.json', births, false);
  write('history.json', history, false);
  write('causes.json', causes, false);
  write('meta.json', meta, true);

  return {
    written,
    countryCount: countryCodes.length,
    birthsCountries: Object.keys(births).length,
    historyCountries: Object.keys(history).length,
    causesCountries: Object.keys(causes).length,
  };
}

/* ================================================================== *
 * 五、CLI 入口（import 本文件时不会执行）
 * ================================================================== */

function isDirectRun() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return path.resolve(entry) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

if (isDirectRun()) {
  const result = buildAll();
  const rel = (p) => path.relative(ROOT, p);
  console.log('✔ 已生成静态数据文件：');
  for (const file of result.written) {
    const bytes = fs.statSync(file).size;
    console.log(`  - ${rel(file)}  (${(bytes / 1024).toFixed(1)} KB)`);
  }
  console.log(
    `  国家数 ${result.countryCount}（births ${result.birthsCountries} / history ${result.historyCountries} / causes ${result.causesCountries}）`,
  );
}
