#!/usr/bin/env node
/**
 * OWID（Our World in Data）世界统计序列抓取器。
 *
 * 产出（data/raw/ 已在 .gitignore 中，不入库）：
 *   data/raw/owid/<key>.csv          只保留 ISO3 有效国家行的 CSV（列全部保留）
 *   data/raw/owid/<key>.meta.json    出处元数据：URL、检索时间、字节数、行列数、投影分界年
 *
 * 用法：
 *   node tools/fetch-owid.mjs                 抓取全部序列
 *   node tools/fetch-owid.mjs --only births    只抓一个序列
 *   node tools/fetch-owid.mjs --cache          复用磁盘上已有的原始文件（不联网）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchText, parseCsvTable, toCsv } from './lib/http.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'data', 'raw', 'owid');
const GRAPHER_BASE = 'https://ourworldindata.org/grapher';

/** ISO3 国家代码：3 位大写字母（World / Africa 这类聚合行的 Code 为空） */
const ISO3_RE = /^[A-Z]{3}$/;

/** OWID 序列表：key 用于文件名，slug 是 grapher 的图表名 */
export const OWID_SERIES = [
  { key: 'births', slug: 'number-of-births' },
  { key: 'lifeExp', slug: 'life-expectancy' },
  { key: 'population', slug: 'population' },
  { key: 'fertility', slug: 'total-fertility-rate' },
  { key: 'childMort', slug: 'child-mortality-igme' },
  { key: 'schooling', slug: 'mean-years-of-schooling' },
  { key: 'agriculture', slug: 'employment-in-agriculture' },
  { key: 'homicide', slug: 'homicide-rate-unodc' },
  { key: 'maternal', slug: 'maternal-mortality' },
  { key: 'smoking', slug: 'share-of-adults-who-smoke' },
];

/**
 * 只保留 ISO3 有效的国家行，剔除 World / Africa / 收入组等聚合行。
 * @param {object[]} rows parseCsv 的输出
 * @returns {object[]}
 */
export function filterIso3Rows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.filter((row) => ISO3_RE.test(String(row?.Code ?? '').trim()));
}

/**
 * 检测「实际值列」与「投影值列」的分界年。
 * OWID 的 UN WPP 类数据里：投影年份的实际列留空、投影列有值；
 * 实际年份则相反。因此：实际列最后有值的年份 = 实际值截止年（分界年）。
 *
 * @param {object[]} rows
 * @param {string[]} columns 表头
 * @returns {{valueColumn:string, projectedColumn:string, actualThroughYear:number|null,
 *            projectedFromYear:number|null, splitYear:number|null}|null}
 */
export function detectProjectionSplit(rows, columns) {
  if (!Array.isArray(columns) || columns.length < 4) return null;

  const valueColumn = columns[3];
  const projectedColumn =
    columns.find((name, idx) => idx >= 4 && /projected/i.test(String(name ?? ''))) ?? null;
  if (!valueColumn || !projectedColumn) return null;

  let actualThroughYear = null;
  let projectedFromYear = null;

  for (const row of rows ?? []) {
    const year = Number.parseInt(String(row?.Year ?? ''), 10);
    if (!Number.isFinite(year)) continue;
    const actual = String(row?.[valueColumn] ?? '').trim();
    const projected = String(row?.[projectedColumn] ?? '').trim();
    if (actual !== '') {
      actualThroughYear = actualThroughYear === null ? year : Math.max(actualThroughYear, year);
    }
    if (projected !== '') {
      projectedFromYear = projectedFromYear === null ? year : Math.min(projectedFromYear, year);
    }
  }

  return {
    valueColumn,
    projectedColumn,
    actualThroughYear,
    projectedFromYear,
    // 分界年 = 最后一年「实际值」；之后都是投影值
    splitYear: actualThroughYear,
  };
}

/**
 * 抓取单个序列，落盘 CSV + meta。
 * @param {{key:string, slug:string}} series
 * @param {{cache?:boolean}} options cache=true 时复用磁盘上已有的文件
 */
export async function fetchSeries(series, options = {}) {
  const url = `${GRAPHER_BASE}/${series.slug}.csv`;
  const csvPath = path.join(OUT_DIR, `${series.key}.csv`);
  const metaPath = path.join(OUT_DIR, `${series.key}.meta.json`);

  if (options.cache && fs.existsSync(csvPath) && fs.existsSync(metaPath)) {
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    return { ...meta, cached: true, csvPath, metaPath };
  }

  const raw = await fetchText(url, { retries: 3, timeoutMs: 60_000 });
  const { columns, rows } = parseCsvTable(raw);
  const kept = filterIso3Rows(rows);

  // 所有列都保留，只过滤行；投影列原样留给后续构建步骤合并
  const csv = toCsv(kept, columns);

  const droppedEntities = [];
  const droppedSet = new Set();
  for (const row of rows) {
    if (ISO3_RE.test(String(row?.Code ?? '').trim())) continue; // 保留行
    const name = String(row?.Entity ?? '').trim();
    if (name && !droppedSet.has(name)) {
      droppedSet.add(name);
      droppedEntities.push(name);
    }
  }

  const meta = {
    key: series.key,
    slug: series.slug,
    source: 'Our World in Data',
    url,
    license: 'CC BY 4.0',
    retrievedAt: new Date().toISOString(),
    bytes: Buffer.byteLength(raw, 'utf8'), // 原始下载字节数
    csvBytes: Buffer.byteLength(csv, 'utf8'), // 落盘（过滤后）字节数
    rowsRaw: rows.length,
    rowsKept: kept.length,
    columns,
    valueColumn: columns[3] ?? null,
    // 实际值 / 投影值的分界（无投影列时为 null）
    projection: detectProjectionSplit(kept, columns),
    dropped: {
      nonIso3Rows: rows.length - kept.length,
      entities: droppedEntities.slice(0, 50),
      entitiesTruncated: droppedEntities.length > 50,
    },
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(csvPath, csv, 'utf8');
  fs.writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');

  return { ...meta, cached: false, csvPath, metaPath };
}

function parseArgs(argv) {
  const options = { only: null, cache: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--cache') options.cache = true;
    else if (arg === '--only') options.only = argv[i + 1] ?? null;
    else if (arg.startsWith('--only=')) options.only = arg.slice('--only='.length);
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const series = options.only
    ? OWID_SERIES.filter((s) => s.key === options.only)
    : OWID_SERIES;

  if (series.length === 0) {
    console.error(`未知序列：${options.only}（可选：${OWID_SERIES.map((s) => s.key).join(', ')}）`);
    process.exitCode = 1;
    return;
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  let failed = 0;
  for (const item of series) {
    try {
      const meta = await fetchSeries(item, { cache: options.cache });
      const split = meta.projection?.splitYear;
      const splitNote = split ? ` split=${split}` : '';
      console.log(
        `OK   ${item.key.padEnd(11)} ${String(meta.bytes).padStart(9)} B  ` +
          `rows ${meta.rowsKept}/${meta.rowsRaw}${splitNote}${meta.cached ? '  [cached]' : ''}`,
      );
    } catch (err) {
      // 单个序列失败不阻断其余序列
      failed += 1;
      console.error(`FAIL ${item.key.padEnd(11)} ${err?.message ?? err}`);
    }
  }

  if (failed > 0) {
    console.error(`\n${failed} 个序列抓取失败`);
    process.exitCode = 1;
  }
}

// 仅在直接运行时作为 CLI 执行（被 import 时不触发网络请求）
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
