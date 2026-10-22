#!/usr/bin/env node
/**
 * World Bank Open Data 抓取器
 *
 * 抓取游戏需要的 20 个指标，按指标落盘到 data/raw/worldbank/<key>.json：
 *   { "CHN": { "2022": 78.0, "2021": 77.9 }, ... }        ← iso3 -> { 年份: 数值 }
 * 同时写一份 <key>.meta.json，记录指标代码、请求 URL、检索时间、字节数与非空值数量。
 *
 * 注意：
 * - 纯函数 parseWorldBank(payload) 单独导出，便于测试；导入本模块不会触发任何网络请求。
 * - HTTP 抓取统一走 tools/lib/http.mjs（重试 + 指数退避 + 超时，错误信息必带 URL）。
 * - 落盘目录基于仓库根目录（tools/lib/paths.mjs），与运行时的 cwd 无关。
 * - 标准库 + 全局 fetch，无第三方依赖。
 */
import fs from 'node:fs';
import path from 'node:path';

import { fetchText, fetchJson } from './lib/http.mjs';
import { rawDir, isDirectRun } from './lib/paths.mjs';

/* ------------------------------------------------------------------ *
 * 常量
 * ------------------------------------------------------------------ */

/** 需要抓取的指标表：key 是落盘文件名，也是 data/countries.json 里的指标键。 */
export const WB_INDICATORS = [
  { key: 'lifeExp', code: 'SP.DYN.LE00.IN' },
  { key: 'lifeExpFemale', code: 'SP.DYN.LE00.FE.IN' },
  { key: 'lifeExpMale', code: 'SP.DYN.LE00.MA.IN' },
  { key: 'infantMort', code: 'SP.DYN.IMRT.IN' },
  { key: 'under5Mort', code: 'SH.DYN.MORT' },
  { key: 'causeCommunicable', code: 'SH.DTH.COMM.ZS' },
  { key: 'causeNcd', code: 'SH.DTH.NCOM.ZS' },
  { key: 'causeInjury', code: 'SH.DTH.INJR.ZS' },
  { key: 'gdpPcapPpp', code: 'NY.GDP.PCAP.PP.CD' },
  { key: 'gini', code: 'SI.POV.GINI' },
  { key: 'urbanRate', code: 'SP.URB.TOTL.IN.ZS' },
  // 计划里的 SP.POP.SBRT.IN 会被 WB API 拒绝（error id 120 "Invalid value"）；
  // 指标目录中唯一的"出生性别比"是 SP.POP.BRTH.MF，主代码失败时自动回退到它。
  { key: 'sexRatioBirth', code: 'SP.POP.SBRT.IN', fallback: 'SP.POP.BRTH.MF' },
  { key: 'unemployment', code: 'SL.UEM.TOTL.ZS' },
  { key: 'oopHealth', code: 'SH.XPD.OOPC.CH.ZS' },
  { key: 'doctors', code: 'SH.MED.PHYS.ZS' },
  { key: 'maternalRatio', code: 'SH.STA.MMRT' },
  { key: 'immunization', code: 'SH.IMM.MEAS' },
  { key: 'poverty', code: 'SI.POV.DDAY' },
  { key: 'homicide', code: 'VC.IHR.PSRC.P5' },
  { key: 'tertiaryEnroll', code: 'SE.TER.ENRR' },
];

const API_BASE = 'https://api.worldbank.org/v2';
const DATE_RANGE = '1990:2023';

/** 单个指标的请求 URL。 */
export function indicatorUrl(code) {
  return `${API_BASE}/country/all/indicator/${encodeURIComponent(code)}?format=json&per_page=20000&date=${DATE_RANGE}`;
}

/** 国家清单 URL：region.id === 'NA' 即为聚合行（World / Africa / Euro area ...）。 */
const COUNTRY_LIST_URL = `${API_BASE}/country?format=json&per_page=400`;

/** 落盘目录（相对仓库根目录，与 cwd 无关）。 */
const OUT_DIR = rawDir('worldbank');

/* ------------------------------------------------------------------ *
 * 纯函数：解析 API 响应
 * ------------------------------------------------------------------ */

/** 归一化 ISO3 代码：必须是 3 个字母；统一转大写；不合法返回 null。 */
function normalizeIso3(raw) {
  if (typeof raw !== 'string') return null;
  const code = raw.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : null;
}

/** 把 value 转成有限数字；null / undefined / NaN / 空串 / 其它类型返回 null。 */
function toFiniteNumber(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw === 'string') {
    const text = raw.trim();
    if (text === '') return null;
    const num = Number(text);
    return Number.isFinite(num) ? num : null;
  }
  return null;
}

/** 把 date 转成四位年份数字；不合法返回 null。 */
function toYear(raw) {
  if (typeof raw === 'number') return Number.isInteger(raw) ? raw : null;
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  return /^\d{4}$/.test(text) ? Number(text) : null;
}

/**
 * 把 World Bank 的 [meta, rows] 响应转成 { iso3: { 年份: 数值 } }。
 *
 * 纯函数，不做 IO，可直接单测。
 *
 * 规则：
 * - 响应不是 [meta, rows] 结构（null / [] / 普通对象 / 第二项不是数组）时返回 {}。
 * - 跳过 countryiso3code 为空、不是 3 位字母代码的行（聚合行与非法代码）。
 * - 跳过 value 为 null / undefined / NaN 的行（该国该年无数据）。
 * - 年份用数字键（JS 对象键实际是字符串，out.CHN[2022] 与 out.CHN['2022'] 等价）。
 *
 * @param {unknown} payload API 原始 JSON
 * @param {{ isCountry?: (code: string) => boolean }} [options]
 *        isCountry 是额外的"是否真实国家"判定；默认只按 3 位字母代码过滤。
 *        CLI 会传入基于 World Bank 国家清单的判定，从而剔除 AFE/ARB/WLD 这类聚合行。
 * @returns {Record<string, Record<number, number>>}
 */
export function parseWorldBank(payload, options = {}) {
  const out = {};
  if (!Array.isArray(payload) || payload.length < 2 || !Array.isArray(payload[1])) return out;

  const isCountry = typeof options.isCountry === 'function' ? options.isCountry : () => true;

  for (const row of payload[1]) {
    if (!row || typeof row !== 'object') continue;

    const code = normalizeIso3(row.countryiso3code);
    if (code === null) continue;
    if (!isCountry(code)) continue;

    const value = toFiniteNumber(row.value);
    if (value === null) continue;

    const year = toYear(row.date);
    if (year === null) continue;

    if (!out[code]) out[code] = {};
    out[code][year] = value;
  }
  return out;
}

/** 统计序列里非空值的总数（国家 × 年份 的有效点）。 */
export function countValues(series) {
  let total = 0;
  for (const years of Object.values(series)) total += Object.keys(years).length;
  return total;
}

/**
 * 识别 World Bank 的错误响应。
 * API 出错时仍返回 HTTP 200，body 形如
 *   [{ "message": [{ "id": "120", "key": "Invalid value", "value": "..." }] }]
 * 返回 null 表示不是错误响应。
 */
export function apiError(payload) {
  const message = payload?.[0]?.message;
  if (!Array.isArray(message) || message.length === 0) return null;
  return message
    .map((m) => (m && typeof m === 'object' ? `${m.key ?? m.id}: ${m.value}` : String(m)))
    .join('; ');
}

/* ------------------------------------------------------------------ *
 * 抓取辅助
 * ------------------------------------------------------------------ */

/**
 * 取 World Bank 国家清单，返回真实国家的 ISO3 集合（剔除聚合行）。
 *
 * 失败时抛错：API 出错时仍返回 HTTP 200，body 里是 { message: [...] }，
 * 必须显式识别；否则 payload[1] 是 undefined，会得到一个「非空但全是假」的
 * 过滤集合，把所有指标都过滤成空结果。
 *
 * @returns {Promise<Set<string>>}
 */
async function fetchCountryIso3Set() {
  const payload = await fetchJson(COUNTRY_LIST_URL, { retries: 2, timeoutMs: 30_000 });

  const apiErr = apiError(payload);
  if (apiErr) {
    throw new Error(`国家清单接口返回错误：${apiErr}`);
  }

  const rows = Array.isArray(payload?.[1]) ? payload[1] : [];
  const set = new Set();
  for (const c of rows) {
    // region.id === 'NA' 表示聚合条目（World / Africa / Euro area ...）
    if (!c || typeof c !== 'object') continue;
    if (c.region && c.region.id === 'NA') continue;
    const code = normalizeIso3(c.id);
    if (code) set.add(code);
  }
  return set;
}

/**
 * 抓取一个指标的序列（主代码失败时自动回退到备用代码）。
 *
 * **失败即失败**：解析不出任何数据时返回 series = null（而不是空对象 {}），
 * 调用方据此跳过落盘并计入失败数。空对象是「真值」，一旦漏掉这一步，
 * 一个空响应就会被当成有效数据写进 data/raw/worldbank/<key>.json，
 * 还会在 meta 里留下 "code": null 与一个 .../indicator/null?... 的假 URL。
 *
 * @param {{key:string, code:string, fallback?:string}} indicator
 * @param {(url: string) => Promise<string>} getText 注入的取文本函数（便于测试）
 * @param {(code: string) => boolean} isCountry 是否真实国家的判定
 * @returns {Promise<{series: Record<string, Record<number, number>>|null,
 *                    code: string|null, text: string|null, payload: unknown,
 *                    error: Error|null}>}
 */
export async function resolveIndicator(indicator, getText, isCountry = () => true) {
  const { key, code, fallback } = indicator;
  const candidates = [code, ...(fallback ? [fallback] : [])];

  let lastError = null;

  for (const candidate of candidates) {
    const url = indicatorUrl(candidate);
    let text = null;
    let payload = null;

    try {
      text = await getText(url);
      payload = JSON.parse(text);
    } catch (err) {
      lastError = err;
      continue; // 网络/解析失败 → 试下一个候选代码
    }

    const apiErr = apiError(payload);
    if (apiErr) {
      lastError = new Error(`API 报错（${apiErr}）`);
      console.error(`    ${key}: 代码 ${candidate} 被 API 拒绝（${apiErr}）`);
      continue; // 试下一个候选代码
    }

    // 分页保护：pages > 1 说明结果被 per_page 截断了，必须报错而不是落盘残缺数据
    const pages = Number(payload?.[0]?.pages ?? 0);
    if (Number.isFinite(pages) && pages > 1) {
      lastError = new Error(`响应被分页截断（pages=${pages}），per_page 不够`);
      console.error(`    ${key}: 代码 ${candidate} 返回 ${pages} 页数据，结果可能不完整`);
      continue; // 试下一个候选代码
    }

    const series = parseWorldBank(payload, { isCountry });
    if (Object.keys(series).length === 0) {
      // 关键：空结果必须记为失败，且 series 保持 null
      lastError = new Error('解析结果为空（响应结构异常）');
      continue;
    }

    return { series, code: candidate, text, payload, error: null };
  }

  return { series: null, code: null, text: null, payload: null, error: lastError ?? new Error('未知错误') };
}

/* ------------------------------------------------------------------ *
 * CLI
 * ------------------------------------------------------------------ */

/** 抓全部指标并落盘。返回失败数量。 */
async function fetchAll() {
  const outDir = OUT_DIR;
  fs.mkdirSync(outDir, { recursive: true });

  // 真实国家清单：用来剔除 AFE/ARB/WLD/EUU 这类"有 3 位代码但其实是聚合"的行。
  let iso3Set = null;
  try {
    const fetched = await fetchCountryIso3Set();
    if (fetched.size === 0) {
      // 空集合会让 isCountry 拒绝所有国家 → 所有指标都解析成空 → 静默产出空数据
      throw new Error('国家清单为空');
    }
    iso3Set = fetched;
    console.error(`国家清单：${iso3Set.size} 个真实国家（已排除聚合行）`);
  } catch (err) {
    iso3Set = null;
    console.error(`警告：国家清单获取失败（${err.message}），退化为"3 位字母代码"过滤`);
  }
  const isCountry = iso3Set ? (code) => iso3Set.has(code) : () => true;
  const filter = iso3Set ? 'world-bank-country-list' : 'iso3-3-letter';

  const getText = (url) => fetchText(url, { retries: 3, timeoutMs: 60_000 });

  let failures = 0;
  for (const indicator of WB_INDICATORS) {
    const { key, code } = indicator;
    const { series, code: usedCode, text, payload, error } = await resolveIndicator(
      indicator,
      getText,
      isCountry,
    );

    try {
      // series 为 null 表示「没拿到数据」——绝不落盘空文件
      if (!series) throw error ?? new Error('未知错误');

      const url = indicatorUrl(usedCode);
      const values = countValues(series);
      const countries = Object.keys(series).length;

      const dataPath = path.join(outDir, `${key}.json`);
      // 数据文件与 meta 文件统一以换行结尾
      const dataText = `${JSON.stringify(series)}\n`;
      fs.writeFileSync(dataPath, dataText, 'utf8');

      const firstRow = Array.isArray(payload?.[1]) ? payload[1][0] : null;
      const meta = {
        type: 'meta',
        key,
        code: usedCode,
        requestedCode: code,
        name: firstRow?.indicator?.value ?? null,
        source: 'World Bank Open Data',
        sourceId: payload?.[0]?.sourceid ?? null,
        lastUpdated: payload?.[0]?.lastupdated ?? null,
        url,
        retrieved: new Date().toISOString(),
        bytes: Buffer.byteLength(text, 'utf8'),
        fileBytes: Buffer.byteLength(dataText, 'utf8'),
        values,
        countries,
        dateRange: DATE_RANGE,
        filter,
      };
      fs.writeFileSync(path.join(outDir, `${key}.meta.json`), `${JSON.stringify(meta, null, 2)}\n`, 'utf8');

      const note = usedCode === code ? '' : ` (回退自 ${code})`;
      console.log(`OK   ${key.padEnd(18)} ${usedCode.padEnd(16)} values=${String(values).padStart(6)} countries=${countries}${note}`);
    } catch (err) {
      failures += 1;
      console.error(`FAIL ${key.padEnd(18)} ${code.padEnd(16)} ${err.message}`);
    }
  }

  console.log(`\n完成：成功 ${WB_INDICATORS.length - failures} / ${WB_INDICATORS.length}，输出目录 ${outDir}`);
  return failures;
}

// 只有直接运行本文件时才抓数据；被 import 时不做任何 IO。
if (isDirectRun(import.meta.url)) {
  const failures = await fetchAll();
  if (failures > 0) process.exitCode = 1;
}
