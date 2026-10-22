// 运行时数据加载器测试（TDD：先写测试，再实现）
// 核心原则：缺失数据绝不静默填 0，必须是 null / absent 并显式标注来源。
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  buildIndex,
  pickIndicator,
  resolveWithFallback,
  loadWorld,
  loadWorldFromObjects,
} from '../js/data/loader.js';

const raw = {
  countries: {
    CHN: { iso3: 'CHN', indicators: { lifeExp: { value: 78, year: 2022 } } },
    NGA: { iso3: 'NGA', indicators: { lifeExp: { value: 54, year: 2021 } } },
  },
};

/* ------------------------------------------------------------------ *
 * 计划里的四条基础用例
 * ------------------------------------------------------------------ */

test('buildIndex 建立国家列表与按出生人口抽取的权重表', () => {
  const idx = buildIndex(raw, { CHN: { 2026: 10000000 }, NGA: { 2026: 7000000 } });
  assert.equal(idx.list.length, 2);
  assert.equal(idx.weights[0].iso3, 'CHN');
});

test('pickIndicator 命中时返回值与年份', () => {
  assert.deepEqual(pickIndicator(raw.countries.CHN, 'lifeExp'), { value: 78, year: 2022 });
});

test('pickIndicator 缺失时返回 null 而不是 0', () => {
  assert.equal(pickIndicator(raw.countries.CHN, 'gini'), null);
});

test('resolveWithFallback 用区域中位数回退并标注来源', () => {
  const out = resolveWithFallback(raw, 'CHN', 'gini', { region: 'Asia', regionMedian: 35 });
  assert.equal(out.value, 35);
  assert.equal(out.fallback, true);
  assert.equal(out.source, 'region-median');
});

/* ------------------------------------------------------------------ *
 * buildIndex：参考年、零权重国家、byIso
 * ------------------------------------------------------------------ */

test('buildIndex 按参考年出生人口降序排列，出生数相同的按 ISO3 升序', () => {
  const idx = buildIndex(raw, { CHN: { 2026: 10000000 }, NGA: { 2026: 7000000 } });
  assert.deepEqual(
    idx.weights.map((x) => x.iso3),
    ['CHN', 'NGA'],
  );
  assert.deepEqual(idx.weights[0], { iso3: 'CHN', w: 10000000 });
  assert.deepEqual(idx.weights[1], { iso3: 'NGA', w: 7000000 });
  // list 与 weights 顺序一致
  assert.deepEqual(
    idx.list.map((c) => c.iso3),
    ['CHN', 'NGA'],
  );
});

test('buildIndex 参考年取“至少半数国家有值”的最新年份', () => {
  // 2026 只有 CHN 有值（1/3 < 半数），2025 有 NGA 与 IND → 参考年应为 2025
  const births = {
    CHN: { 2026: 10 },
    NGA: { 2025: 5 },
    IND: { 2025: 3 },
  };
  const raw3 = {
    countries: {
      CHN: { iso3: 'CHN' },
      NGA: { iso3: 'NGA' },
      IND: { iso3: 'IND' },
    },
  };
  const idx = buildIndex(raw3, births);
  assert.deepEqual(
    idx.weights.map((x) => x.iso3),
    ['NGA', 'IND', 'CHN'],
  );
  assert.deepEqual(idx.weights[2], { iso3: 'CHN', w: 0 });
});

test('buildIndex 参考年缺失出生数的国家仍留在列表里，权重为 0（不被抽中）', () => {
  const idx = buildIndex(raw, { CHN: { 2026: 10000000 } });
  assert.equal(idx.list.length, 2);
  assert.equal(idx.weights.find((x) => x.iso3 === 'NGA').w, 0);
  assert.equal(idx.weights.find((x) => x.iso3 === 'CHN').w, 10000000);
});

test('buildIndex 提供 byIso 映射，且 list 元素是原始国家对象', () => {
  const idx = buildIndex(raw, { CHN: { 2026: 1 }, NGA: { 2026: 2 } });
  assert.equal(idx.byIso.CHN, raw.countries.CHN);
  assert.equal(idx.byIso.NGA, raw.countries.NGA);
  assert.equal(Object.keys(idx.byIso).length, 2);
});

test('buildIndex 对空输入返回空索引而不是抛错', () => {
  const idx = buildIndex({}, {});
  assert.deepEqual(idx.list, []);
  assert.deepEqual(idx.weights, []);
  assert.deepEqual(idx.byIso, {});
});

/* ------------------------------------------------------------------ *
 * pickIndicator：非有限值一律视为缺失
 * ------------------------------------------------------------------ */

test('pickIndicator 对非有限数值返回 null（绝不返回 0）', () => {
  const country = { iso3: 'XXX', indicators: { gini: { value: null, year: 2020 } } };
  assert.equal(pickIndicator(country, 'gini'), null);
  const nanCountry = { indicators: { gini: { value: NaN, year: 2020 } } };
  assert.equal(pickIndicator(nanCountry, 'gini'), null);
});

test('pickIndicator 对空国家 / 空 indicators 安全返回 null', () => {
  assert.equal(pickIndicator(null, 'lifeExp'), null);
  assert.equal(pickIndicator(undefined, 'lifeExp'), null);
  assert.equal(pickIndicator({}, 'lifeExp'), null);
  assert.equal(pickIndicator({ indicators: {} }, 'lifeExp'), null);
});

/* ------------------------------------------------------------------ *
 * resolveWithFallback：三级回退策略
 * ------------------------------------------------------------------ */

test('resolveWithFallback 命中本国数据时标注 source=country 且 fallback=false', () => {
  const out = resolveWithFallback(raw, 'CHN', 'lifeExp', { region: 'Asia', regionMedian: 35 });
  assert.deepEqual(out, { value: 78, year: 2022, fallback: false, source: 'country' });
});

test('resolveWithFallback 没有任何可用途径时返回 null + unavailable，绝不是 0', () => {
  const out = resolveWithFallback(raw, 'CHN', 'gini', { region: 'Asia' });
  assert.deepEqual(out, { value: null, year: null, fallback: true, source: 'unavailable' });
  assert.notEqual(out.value, 0);
});

test('resolveWithFallback 区域中位数非法时退到 unavailable', () => {
  const out = resolveWithFallback(raw, 'CHN', 'gini', { region: 'Asia', regionMedian: NaN });
  assert.equal(out.value, null);
  assert.equal(out.source, 'unavailable');
  assert.equal(out.fallback, true);
});

/* ------------------------------------------------------------------ *
 * loadWorldFromObjects / loadWorld
 * ------------------------------------------------------------------ */

test('loadWorldFromObjects 组装世界对象并附带 index', () => {
  const world = loadWorldFromObjects({
    countries: raw,
    births: { CHN: { 2026: 10000000 }, NGA: { 2026: 7000000 } },
    history: {},
    causes: {},
    meta: { generated: '2026-01-01' },
  });
  assert.equal(world.countries, raw);
  assert.equal(world.meta.generated, '2026-01-01');
  assert.equal(world.index.list.length, 2);
  assert.equal(world.index.weights[0].iso3, 'CHN');
});

test('loadWorld 依次并发拉取五个 JSON 文件并组装世界对象', async () => {
  const requested = [];
  const payloads = {
    'countries.json': raw,
    'births.json': { CHN: { 2026: 10000000 }, NGA: { 2026: 7000000 } },
    'history.json': {},
    'causes.json': {},
    'meta.json': { generated: '2026-01-01' },
  };
  const fetchImpl = async (url) => {
    requested.push(url);
    const name = String(url).split('/').pop();
    if (!(name in payloads)) return { ok: false, status: 404, text: async () => '' };
    return { ok: true, status: 200, text: async () => JSON.stringify(payloads[name]) };
  };

  const world = await loadWorld('data/', { fetchImpl });
  assert.deepEqual(requested.sort(), [
    'data/births.json',
    'data/causes.json',
    'data/countries.json',
    'data/history.json',
    'data/meta.json',
  ]);
  assert.equal(world.index.list.length, 2);
  assert.equal(world.index.weights[0].iso3, 'CHN');
  assert.equal(world.meta.generated, '2026-01-01');
});

test('loadWorld 在文件缺失时报出具体 URL，不静默吞掉', async () => {
  const fetchImpl = async () => ({ ok: false, status: 404, text: async () => '' });
  await assert.rejects(
    () => loadWorld('./data/', { fetchImpl }),
    (err) => /countries\.json/.test(err.message) && /404/.test(err.message),
  );
});

test('导入 loader 模块不触发任何 fetch（无副作用）', () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const loaderUrl = pathToFileURL(path.join(here, '..', 'js', 'data', 'loader.js')).href;
  const script = [
    "globalThis.fetch = () => { throw new Error('fetch must not run at import time'); };",
    `await import(${JSON.stringify(loaderUrl)});`,
    "console.log('import-ok');",
  ].join('\n');
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    encoding: 'utf8',
  });
  assert.match(out, /import-ok/);
});
