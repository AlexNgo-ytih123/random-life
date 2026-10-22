# Random Life Implementation Plan

> **For implementer:** Use TDD throughout. Write failing test first. Watch it fail. Then implement.

**Goal:** 构建一个纯静态网页人生模拟游戏：玩家被随机生在地球上某个国家，用该国真实统计数据活完一生，每年选一个「本年重点」并在人生岔路口替他做决定，最终产出带数据出处的死亡证明；同一种子可复现同一条人生并可分享。

**Architecture:** 零构建、零运行时依赖的原生 ES 模块。`js/engine/` 是纯函数层（无 DOM，可在 Node 中全量测试），`js/render/` 是自写的 192×60 程序化像素渲染器，`js/ui/` 负责 DOM 与交互。数据由 `tools/` 在构建期从 World Bank API 与 OWID(UN WPP) 抓取并生成静态 `data/*.json`，游戏运行时零网络请求。死亡模型用 Gompertz 年龄别死亡力逐年抽样，以 e₀ 标定，替代参考实现的「预期寿命 ±20 岁三角扰动」。

**Tech Stack:** 原生 ES Modules / `node:test` / Canvas 2D 像素渲染 / SVG 图表 / World Bank Open Data API / OWID grapher CSV / GitHub Pages

**设计文档：** `docs/plans/2026-10-22-random-life-design.md`

---

## 执行顺序与依赖

```
M0 骨架        T1  rng  →  T2  静态服务器 + index.html
M1 数据        T3  OWID 抓取 → T4  WB 抓取 → T5  构建 data/*.json
               T6  data/loader.js（运行时加载 + 缺失回退）
               T7  地图数据
M2 引擎        T8  draw（出生抽样）→ T9  mortality ★ → T10 causes
               T11 focus → T12 decisions → T13 events → T14 stages
               T15 life（编排）→ T16 record（死亡证明）
M3 渲染        T17 raster → T18 palette → T19 sprites → T20 scene → T21 narrator
M4 UI          T22 landing → T23 birth → T24 play → T25 ending
               T26 chart → T27 storage
M5 时光机      T28 history
M6 分享        T29 URL 种子 → T30 分享卡
M7 收尾        T31 README/许可 → T32 CI + Pages
```

**T9（死亡模型）是全项目的统计核心**，它绿了，整个游戏才有意义。
**T8/T10 依赖 T5 产出的真实数据文件**，T9 可以先用 `tests/fixtures/` 里的小型人工数据开发。

---

## M0 · 骨架

### Task 1: 项目骨架 + 种子随机数引擎

**Files:**
- Create: `package.json`
- Create: `js/engine/rng.js`
- Create: `tests/rng.test.js`

**Step 1: 写失败测试** `tests/rng.test.js`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng, pick, weighted, logNormal, uniform } from '../js/engine/rng.js';

test('同一种子产生完全相同的随机序列', () => {
  const a = makeRng(12345);
  const b = makeRng(12345);
  const seqA = Array.from({ length: 50 }, () => a());
  const seqB = Array.from({ length: 50 }, () => b());
  assert.deepEqual(seqA, seqB);
});

test('不同种子产生不同序列', () => {
  const a = Array.from({ length: 20 }, makeRng(1));
  const b = Array.from({ length: 20 }, makeRng(2));
  assert.notDeepEqual(a, b);
});

test('输出落在 [0,1) 区间内', () => {
  const r = makeRng(7);
  for (let i = 0; i < 2000; i++) {
    const v = r();
    assert.ok(v >= 0 && v < 1, `越界: ${v}`);
  }
});

test('uniform 在区间内', () => {
  const r = makeRng(9);
  for (let i = 0; i < 500; i++) {
    const v = uniform(r, 3, 8);
    assert.ok(v >= 3 && v <= 8);
  }
});

test('pick 从数组等概率取元素', () => {
  const r = makeRng(3);
  const items = ['a', 'b', 'c'];
  const counts = { a: 0, b: 0, c: 0 };
  for (let i = 0; i < 3000; i++) counts[pick(r, items)]++;
  for (const k of Object.keys(counts)) {
    assert.ok(Math.abs(counts[k] - 1000) < 150, `${k}=${counts[k]}`);
  }
});

test('weighted 的抽取频率正比于权重', () => {
  const r = makeRng(11);
  const items = [{ w: 75 }, { w: 20 }, { w: 5 }];
  const counts = [0, 0, 0];
  for (let i = 0; i < 20000; i++) counts[weighted(r, items)]++;
  assert.ok(Math.abs(counts[0] / 20000 - 0.75) < 0.02);
  assert.ok(Math.abs(counts[1] / 20000 - 0.20) < 0.02);
  assert.ok(Math.abs(counts[2] / 20000 - 0.05) < 0.015);
});

test('weighted 对零权重项永不抽中', () => {
  const r = makeRng(5);
  for (let i = 0; i < 1000; i++) assert.equal(weighted(r, [{ w: 1 }, { w: 0 }]), 0);
});

test('logNormal 中位数与尺度正确', () => {
  const r = makeRng(13);
  const xs = Array.from({ length: 20000 }, () => logNormal(r, 100, 0.5));
  xs.sort((p, q) => p - q);
  const median = xs[Math.floor(xs.length / 2)];
  assert.ok(Math.abs(median - 100) < 6, `中位数 ${median}`);
});
```

**Step 2: 运行，确认失败**
```
node --test tests/rng.test.js
```
Expected: FAIL — `Cannot find module '../js/engine/rng.js'`

**Step 3: 写最小实现** `js/engine/rng.js`

```js
// mulberry32：32 位种子，周期 2^32，统计性质足够好且实现极短。
export function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function uniform(rng, min, max) {
  return min + rng() * (max - min);
}

export function pick(rng, items) {
  return items[Math.floor(rng() * items.length)];
}

export function weighted(rng, items) {
  let total = 0;
  for (const it of items) total += it.w;
  if (total <= 0) throw new Error('weighted: 总权重必须为正');
  let roll = rng() * total;
  for (let i = 0; i < items.length; i++) {
    roll -= items[i].w;
    if (roll < 0) return i;
  }
  return items.length - 1;
}

// Box–Muller
export function logNormal(rng, median, sigma) {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return median * Math.exp(sigma * z);
}
```

**Step 4: 写 `package.json`**

```json
{
  "name": "random-life",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "一个人生模拟游戏：被随机生在地球上某处，用那地的真实统计活完一生",
  "license": "MIT",
  "scripts": {
    "test": "node --test tests/",
    "start": "node tools/serve.mjs",
    "fetch-data": "node tools/fetch-owid.mjs && node tools/fetch-worldbank.mjs && node tools/build-world-data.mjs && node tools/build-map.mjs"
  },
  "devDependencies": {
    "world-atlas": "^2.0.2",
    "world-countries": "^5.1.0"
  }
}
```

**Step 5: 运行，确认通过**
```
npm test
```
Expected: PASS — 8 tests, 0 fail

**Step 6: 提交**
```
git add package.json js/engine/rng.js tests/rng.test.js
git commit -m "feat: 种子随机数引擎与抽样工具"
```

---

### Task 2: 零依赖静态服务器 + 最小首页

**Files:**
- Create: `tools/serve.mjs`
- Create: `index.html`
- Create: `tests/serve.test.js`

**Step 1: 写失败测试** `tests/serve.test.js`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../tools/serve.mjs';

test('静态服务器能返回 index.html 且不穿越目录', async () => {
  const server = await startServer({ root: process.cwd(), port: 0 });
  const base = `http://127.0.0.1:${server.port}`;
  try {
    const home = await fetch(`${base}/`);
    assert.equal(home.status, 200);
    assert.match(await home.text(), /<html/i);

    const escaped = await fetch(`${base}/../../etc/passwd`, { redirect: 'manual' });
    assert.ok(escaped.status === 404 || escaped.status === 400, `实际 ${escaped.status}`);

    const missing = await fetch(`${base}/nope.js`);
    assert.equal(missing.status, 404);
  } finally {
    await server.close();
  }
});
```

**Step 2: 运行，确认失败** → `Cannot find module '../tools/serve.mjs'`

**Step 3: 实现** `tools/serve.mjs`（用 `node:http` + `node:path`，不引第三方依赖）
- 导出 `startServer({ root, port })` → 返回 `{ port, close() }`
- MIME 表：`.html .js .css .json .svg .png .ico`
- 路径解析后校验 `resolved.startsWith(root)`，否则 404
- CLI 入口：`node tools/serve.mjs` 监听 8080

**Step 4: 实现** `index.html` — 最小可运行骨架：
```html
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Random Life</title>
  <link rel="stylesheet" href="./css/base.css">
</head>
<body>
  <main id="app"><h1>Random Life</h1><p id="boot">正在加载…</p></main>
  <script type="module" src="./js/main.js"></script>
</body>
</html>
```
同时创建 `css/base.css`（最小 reset）与 `js/main.js`（把 `#boot` 改成 "引擎就绪"）。

**Step 5: 运行，确认通过** → `npm test` 全绿

**Step 6: 提交**
```
git commit -m "feat: 零依赖静态服务器与最小首页骨架"
```

---

## M1 · 数据层

### Task 3: OWID 数据抓取器

**Files:**
- Create: `tools/fetch-owid.mjs`
- Create: `tools/lib/http.mjs`
- Create: `tests/http.test.js`

**Step 1: 写失败测试** `tests/http.test.js`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchText, fetchJson, parseCsv } from '../tools/lib/http.mjs';

test('parseCsv 处理带引号与逗号的字段', () => {
  const rows = parseCsv('a,b,c\n1,"x,y",3\n');
  assert.deepEqual(rows[0], { a: '1', b: 'x,y', c: '3' });
});

test('parseCsv 处理表头里的引号字段', () => {
  const rows = parseCsv('Entity,Code,Year,"Homicide rate per 100,000 population"\nA,B,1,2.5\n');
  assert.deepEqual(rows[0]['Homicide rate per 100,000 population'], '2.5');
});

test('fetchText 对非 2xx 抛错且带 URL', async () => {
  await assert.rejects(
    () => fetchText('https://ourworldindata.org/grapher/does-not-exist-xyz.csv'),
    /does-not-exist-xyz/,
  );
});
```

**Step 2: 确认失败** → 模块不存在

**Step 3: 实现** `tools/lib/http.mjs`
- `fetchText(url, { retries = 3, timeoutMs = 30000 })`：指数退避重试（1s/2s/4s），超时用 `AbortSignal.timeout`，非 2xx 抛含 URL 的错误
- `fetchJson(url, opts)`：`fetchText` + `JSON.parse`
- `parseCsv(text)`：**自己写** RFC4180 解析器（处理引号、转义引号、字段内换行），返回对象数组（首行为表头）

**Step 4: 实现** `tools/fetch-owid.mjs`
- 常量表：
```js
const OWID_SERIES = [
  { key: 'births',        slug: 'number-of-births' },
  { key: 'lifeExp',       slug: 'life-expectancy' },
  { key: 'population',    slug: 'population' },
  { key: 'fertility',     slug: 'total-fertility-rate' },
  { key: 'childMort',     slug: 'child-mortality-igme' },
  { key: 'schooling',     slug: 'mean-years-of-schooling' },
  { key: 'agriculture',   slug: 'employment-in-agriculture' },
  { key: 'homicide',      slug: 'homicide-rate-unodc' },
  { key: 'maternal',      slug: 'maternal-mortality' },
  { key: 'smoking',       slug: 'share-of-adults-who-smoke' },
];
```
- 每个序列抓到 `data/raw/owid/<key>.csv`，并写 `data/raw/owid/<key>.meta.json`（记录 URL、检索时间、字节数）
- **只保留 ISO3 有效的国家行**（`Code` 字段是 3 位大写字母），剔除 `World`/`Africa` 等聚合行

**Step 5: 验证**（手工检查，允许失败不阻塞）
```
node tools/fetch-owid.mjs
ls -la data/raw/owid/
```
Expected: 10 个 csv + 10 个 meta.json

**Step 6: 提交**
```
git commit -m "feat: OWID 数据抓取器与 CSV 解析"
```
（`data/raw/` 已在 `.gitignore` 中，不入库）

---

### Task 4: World Bank 数据抓取器

**Files:**
- Create: `tools/fetch-worldbank.mjs`
- Create: `tests/worldbank-parse.test.js`

**Step 1: 写失败测试**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWorldBank } from '../tools/fetch-worldbank.mjs';

test('parseWorldBank 把 API 响应转成 iso3 -> {year: value}', () => {
  const payload = [
    { page: 1 },
    [
      { country: { value: 'China' }, countryiso3code: 'CHN', date: '2022', value: 78.0 },
      { country: { value: 'China' }, countryiso3code: 'CHN', date: '2021', value: 77.9 },
      { country: { value: 'World' }, countryiso3code: '', date: '2022', value: 73.0 },
      { country: { value: 'China' }, countryiso3code: 'CHN', date: '2020', value: null },
    ],
  ];
  const out = parseWorldBank(payload);
  assert.deepEqual(out, { CHN: { 2022: 78.0, 2021: 77.9 } });
});
```

**Step 2: 确认失败** → 模块不存在

**Step 3: 实现** `tools/fetch-worldbank.mjs`
- `export function parseWorldBank(payload)`（纯函数，可测）
- 指标表：
```js
const WB_INDICATORS = [
  { key: 'lifeExp',        code: 'SP.DYN.LE00.IN' },
  { key: 'lifeExpFemale',  code: 'SP.DYN.LE00.FE.IN' },
  { key: 'lifeExpMale',    code: 'SP.DYN.LE00.MA.IN' },
  { key: 'infantMort',     code: 'SP.DYN.IMRT.IN' },
  { key: 'under5Mort',     code: 'SH.DYN.MORT' },
  { key: 'causeCommunicable', code: 'SH.DTH.COMM.ZS' },
  { key: 'causeNcd',       code: 'SH.DTH.NCOM.ZS' },
  { key: 'causeInjury',    code: 'SH.DTH.INJR.ZS' },
  { key: 'gdpPcapPpp',     code: 'NY.GDP.PCAP.PP.CD' },
  { key: 'gini',           code: 'SI.POV.GINI' },
  { key: 'urbanRate',      code: 'SP.URB.TOTL.IN.ZS' },
  { key: 'sexRatioBirth',  code: 'SP.POP.BRTH.MF' },   // 原 SP.POP.SBRT.IN 已被 WB 废弃，2026-10-22 实测确认
  { key: 'unemployment',   code: 'SL.UEM.TOTL.ZS' },
  { key: 'oopHealth',      code: 'SH.XPD.OOPC.CH.ZS' },
  { key: 'doctors',        code: 'SH.MED.PHYS.ZS' },
  { key: 'maternalRatio',  code: 'SH.STA.MMRT' },
  { key: 'immunization',   code: 'SH.IMM.MEAS' },
  { key: 'poverty',        code: 'SI.POV.DDAY' },
  { key: 'homicide',       code: 'VC.IHR.PSRC.P5' },
  { key: 'tertiaryEnroll', code: 'SE.TER.ENRR' },
];
```
- URL 模板：`https://api.worldbank.org/v2/country/all/indicator/{code}?format=json&per_page=20000&date=1990:2023`
- 每个指标落 `data/raw/worldbank/<key>.json` + meta

**Step 4: 验证**
```
node tools/fetch-worldbank.mjs
```
Expected: 19 个 json

**Step 5: 提交** → `git commit -m "feat: World Bank 指标抓取器"`

---

### Task 5: 构建静态数据文件

**Files:**
- Create: `tools/build-world-data.mjs`
- Create: `tests/build-world-data.test.js`

**Step 1: 写失败测试**（纯函数部分可测）

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeSeries, pickLatest, median } from '../tools/build-world-data.mjs';

test('pickLatest 取最新年份的值与其年份', () => {
  const s = { 2019: 1, 2021: 3, 2020: 2 };
  assert.deepEqual(pickLatest(s, 1990, 2023), { value: 3, year: 2021 });
});

test('pickLatest 窗口内无数据时返回 null', () => {
  assert.equal(pickLatest({ 1970: 1 }, 1990, 2023), null);
});

test('pickLatest 尊重截止年份', () => {
  assert.deepEqual(pickLatest({ 2019: 1, 2022: 5 }, 1990, 2020), { value: 1, year: 2019 });
});

test('mergeSeries 合并多序列并按年份排序', () => {
  const out = mergeSeries([{ '2000': 1 }, { '1999': 2 }]);
  assert.deepEqual(Object.keys(out), ['1999', '2000']);
});

test('median 计算中位数', () => {
  assert.equal(median([1, 2, 3]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
});
```

**Step 2: 确认失败**

**Step 3: 实现** `tools/build-world-data.mjs`
- 纯函数导出：`mergeSeries` `pickLatest` `median` `regionOf`（用 OWID 的 world region 列，若无则用内置 ISO3→区域表）
- 主流程：
  1. 读 `data/raw/owid/*.csv` + `data/raw/worldbank/*.json`
  2. 国家集合 = 两者 ISO3 的交集（要求至少有 births 与 lifeExp）
  3. 产出：
     - `data/countries.json`：`{ meta, countries: { ISO3: { iso3, name, nameEn, region, indicators: { key: {value, year} } } } }`
     - `data/births.json`：`{ ISO3: { "1950": n, ... } }`（OWID 的 `Projected` 列合并进同结构，并在 meta 记录 2023 为实际/投影分界）
     - `data/history.json`：`{ ISO3: { "1950": { lifeExp, population, fertility, ... } } }`
     - `data/causes.json`：`{ ISO3: { "2019": { communicable, ncd, injury } } }`
     - `data/meta.json`：`{ generated, series: [{ key, source, url, license, retrieved, unit, note }] }`
  4. **缺失不填 0**：某指标缺失就不写这个 key
- 名字与区域：用内置 `data/name-table.js` 之外的 `tools/lib/names.mjs`，覆盖 ISO3→中文名/英文名/区域

**Step 4: 运行**
```
node tools/build-world-data.mjs
node -e "const d=require('fs').readFileSync('data/countries.json','utf8');const j=JSON.parse(d);console.log(Object.keys(j.countries).length)"
```
Expected: 150+ 个国家

**Step 5: 提交**
```
git add tools/build-world-data.mjs tools/lib/names.mjs tests/build-world-data.test.js data/*.json
git commit -m "feat: 构建静态世界数据文件 countries/births/history/causes/meta"
```

---

### Task 6: 运行时数据加载器

**Files:**
- Create: `js/data/loader.js`
- Create: `tests/loader.test.js`

**Step 1: 写失败测试**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIndex, pickIndicator, resolveWithFallback } from '../js/data/loader.js';

const raw = {
  countries: {
    CHN: { iso3: 'CHN', indicators: { lifeExp: { value: 78, year: 2022 } } },
    NGA: { iso3: 'NGA', indicators: { lifeExp: { value: 54, year: 2021 } } },
  },
};

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
```

**Step 2: 确认失败**

**Step 3: 实现** `js/data/loader.js`
- `buildIndex(raw, births)` → `{ list, weights, byIso }`；`weights` 是按出生人口降序的 `[{iso3, w}]`
- `pickIndicator(country, key)` → `{value, year} | null`
- `resolveWithFallback(raw, iso, key, { region, regionMedian })` → `{value, year, fallback, source}`
- 浏览器端：`loadWorld(urlPrefix)` 用 `fetch` 拉 `data/*.json`；同时提供 `loadWorldFromObjects()` 供 Node 测试与未来打包

**Step 4: 运行** → `npm test` 全绿

**Step 5: 提交** → `git commit -m "feat: 运行时数据加载器与缺失回退策略"`

---

### Task 7: 世界地图数据

**Files:**
- Modify: `package.json`（devDependencies 已含 world-atlas / world-countries）
- Create: `tools/build-map.mjs`
- Create: `data/map.json`（生成物，入库）

**Step 1: 实现** `tools/build-map.mjs`
- `npm i` 安装 devDependencies
- 从 `world-atlas/countries-110m.json`（TopoJSON）**自己写**一个极简 TopoJSON→多边形解码（弧解码 + 环组装），量化到经纬度保留 2 位小数，投影到**等距圆柱** 0–360 / −60…90
- 从 `world-countries` 取每个国家中心点 `latlng` + ISO3
- 产出 `data/map.json`：`{ land: [[[lon,lat],…], …], centroids: { ISO3: [lon, lat] }, width: 720, height: 300 }`
- 体积目标 < 400KB

**Step 2: 验证**
```
node tools/build-map.mjs
node -e "console.log((require('fs').statSync('data/map.json').size/1024).toFixed(0)+'KB')"
```

**Step 3: 提交** → `git commit -m "feat: 世界地图数据（Natural Earth 公有领域）"`

---

## M2 · 引擎

### Task 8: 出生抽样

**Files:**
- Create: `js/engine/draw.js`
- Create: `tests/draw.test.js`

**Step 1: 写失败测试**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../js/engine/rng.js';
import { drawBirthplace, drawSex, drawFamilyIncome, drawUrban } from '../js/engine/draw.js';

const weights = [
  { iso3: 'CHN', w: 10000000 },
  { iso3: 'NGA', w: 7000000 },
  { iso3: 'JPN', w: 800000 },
];

test('出生国抽取频率正比于出生人口', () => {
  const r = makeRng(42);
  const counts = {};
  const N = 100000;
  for (let i = 0; i < N; i++) {
    const iso = drawBirthplace(r, weights).iso3;
    counts[iso] = (counts[iso] || 0) + 1;
  }
  const share = (iso) => counts[iso] / N;
  assert.ok(Math.abs(share('CHN') - 10000000 / 17800000) < 0.01, `CHN=${share('CHN')}`);
  assert.ok(Math.abs(share('NGA') - 7000000 / 17800000) < 0.01);
  assert.ok(Math.abs(share('JPN') - 800000 / 17800000) < 0.01);
});

test('出生地返回国家的统计上下文', () => {
  const out = drawBirthplace(makeRng(1), weights);
  assert.ok(out.iso3);
  assert.ok(out.region);
  assert.ok(out.name);
});

test('性别比例接近 105:100', () => {
  const r = makeRng(7);
  let male = 0;
  const N = 20000;
  for (let i = 0; i < N; i++) if (drawSex(r, 1.05) === 'male') male++;
  assert.ok(Math.abs(male / N - 1.05 / 2.05) < 0.02, `男性占比 ${male / N}`);
});

test('家庭收入分布还原目标基尼', () => {
  const r = makeRng(99);
  const N = 200000;
  const xs = [];
  for (let i = 0; i < N; i++) xs.push(drawFamilyIncome(r, { median: 30000, gini: 0.35 }));
  xs.sort((a, b) => a - b);
  let cum = 0, total = xs.reduce((s, x) => s + x, 0);
  let area = 0;
  for (let i = 0; i < xs.length; i++) { cum += xs[i]; area += cum / total; }
  const gini = 1 - (2 * area) / (xs.length * (total / xs.length)) * (total / xs.length) / (total / xs.length);
  const g = 1 - (2 * area) / xs.length / (total / xs.length);
  assert.ok(Math.abs(g - 0.35) < 0.04, `实测基尼 ${g}`);
});

test('城乡抽取遵守城镇化率', () => {
  const r = makeRng(3);
  let urban = 0;
  const N = 20000;
  for (let i = 0; i < N; i++) if (drawUrban(r, 0.664)) urban++;
  assert.ok(Math.abs(urban / N - 0.664) < 0.02);
});
```

**Step 2: 确认失败**

**Step 3: 实现** `js/engine/draw.js`
- `drawBirthplace(rng, weights, ctx)`：加权抽样 → 返回 `{iso3, name, nameEn, region, chance}`，`chance` = 该国出生占比（用于 UI 显示"你占这个世界出生率的 12.4%"）
- `drawSex(rng, ratio)`：`'male' | 'female'`
- `drawFamilyIncome(rng, {median, gini})`：对数正态，`sigma = gini / (2 * Φ⁻¹(0.75))`，`Φ⁻¹(0.75) = 0.6744898`
- `drawUrban(rng, urbanRate)`
- 全部纯函数，不依赖 DOM

**Step 4: 运行** → `npm test` 全绿（注意 `drawFamilyIncome` 的基尼断言用数值积分，容差 0.04）

**Step 5: 提交** → `git commit -m "feat: 出生抽样（国家/性别/家庭收入/城乡）"`

---

### Task 9: ★ 死亡模型（Gompertz 年龄别死亡力 + e₀ 标定）

**Files:**
- Create: `js/engine/mortality.js`
- Create: `tests/mortality.test.js`
- Create: `tests/fixtures/mortality-cases.js`

**Step 1: 写失败测试** `tests/mortality.test.js`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../js/engine/rng.js';
import { buildMortality, sampleDeathAge, lifeTable } from '../js/engine/mortality.js';

const HIGH = { e0: 84.0, infantMort: 1.8, under5Mort: 2.2 };   // 日/韩/瑞级别
const MID  = { e0: 73.6, infantMort: 6.1, under5Mort: 7.4 };   // 中国级别
const LOW  = e0_low();
function e0_low() { return { e0: 54.3, infantMort: 51.2, under5Mort: 74.0 }; }

test('标定后的生命表 e0 与输入一致（±0.5 岁）', () => {
  for (const c of [HIGH, MID, LOW]) {
    const m = buildMortality(c);
    assert.ok(Math.abs(m.e0Model - c.e0) < 0.5, `e0Model=${m.e0Model} vs ${c.e0}`);
  }
});

test('生命表结构完整：l(0)=1，l 单调递减，e(x) 递减', () => {
  const m = buildMortality(MID);
  const t = lifeTable(m);
  assert.equal(t[0].l, 1);
  for (let i = 1; i < t.length; i++) assert.ok(t[i].l < t[i - 1].l);
  for (let i = 1; i < t.length; i++) assert.ok(t[i].e <= t[i - 1].e + 1e-9);
});

test('模拟 10 万次的平均死亡年龄接近 e0（±1.5 岁）', () => {
  const m = buildMortality(MID);
  const r = makeRng(2024);
  const N = 100000;
  let sum = 0;
  for (let i = 0; i < N; i++) sum += sampleDeathAge(r, m).age;
  const mean = sum / N;
  assert.ok(Math.abs(mean - MID.e0) < 1.5, `平均死亡年龄 ${mean}`);
});

test('婴儿死亡率与输入一致（±1.2 个千分点）', () => {
  const m = buildMortality(LOW);
  const r = makeRng(555);
  const N = 100000;
  let died = 0;
  for (let i = 0; i < N; i++) if (sampleDeathAge(r, m).age < 1) died++;
  const rate = died / N;
  assert.ok(Math.abs(rate - LOW.infantMort / 1000) < 0.012, `实际 ${rate}`);
});

test('5 岁以下死亡率与输入一致（±1.5 个千分点）', () => {
  const m = buildMortality(LOW);
  const r = makeRng(777);
  const N = 100000;
  let died = 0;
  for (let i = 0; i < N; i++) if (sampleDeathAge(r, m).age < 5) died++;
  const rate = died / N;
  assert.ok(Math.abs(rate - LOW.under5Mort / 1000) < 0.015, `实际 ${rate}`);
});

test('高寿命国的平均死亡年龄显著高于低寿命国', () => {
  const r = makeRng(31);
  const mean = (m) => {
    const rr = makeRng(31);
    let s = 0; const N = 20000;
    for (let i = 0; i < N; i++) s += sampleDeathAge(rr, m).age;
    return s / N;
  };
  assert.ok(mean(buildMortality(HIGH)) - mean(buildMortality(LOW)) > 20);
});

test('死亡年龄分布左偏：长尾在幼年侧，中位年龄不早于均值', () => {
  const m = buildMortality(HIGH);
  const r = makeRng(808);
  const ages = [];
  for (let i = 0; i < 50000; i++) ages.push(sampleDeathAge(r, m).age);
  const mean = ages.reduce((a, b) => a + b, 0) / ages.length;
  const sorted = [...ages].sort((a, b) => a - b);
  const median = sorted[sorted.length >> 1];
  // Gompertz 死亡年龄分布是左偏的：长尾在幼年侧，中位年龄 ≥ 均值。
  // 现实亦然（e0=80 的国家，中位死亡年龄约 83 > 均值 80）。
  assert.ok(median >= mean - 0.05, `median=${median} mean=${mean}`);
  assert.ok(ages.some((a) => a < 5), '缺少幼年早逝样本');
});

test('生命表在中年阶段的存活比例落在真实区间', () => {
  const t = lifeTable(buildMortality(HIGH));
  const l = (age) => t[age].l;
  // 日本/瑞士级别：l(40)≈0.975，l(60)≈0.86，l(70)≈0.79
  assert.ok(l(40) > 0.95 && l(40) < 0.995, `l(40)=${l(40)}`);
  assert.ok(l(60) > 0.80 && l(60) < 0.93, `l(60)=${l(60)}`);
  assert.ok(l(70) > 0.70 && l(70) < 0.88, `l(70)=${l(70)}`);
});

test('低寿命国家的存活曲线下降更快', () => {
  const hi = lifeTable(buildMortality(HIGH));
  const lo = lifeTable(buildMortality(LOW));
  assert.ok(hi[80].l > lo[80].l, `l80 高=${hi[80].l} 低=${lo[80].l}`);
});

test('男性预期寿命更低 → 男性平均死亡年龄更低', () => {
  const male = buildMortality({ e0: 75.1, infantMort: 5.0, under5Mort: 6.0, sex: 'male' });
  const female = buildMortality({ e0: 80.9, infantMort: 5.0, under5Mort: 6.0, sex: 'female' });
  const mean = (m) => {
    const rr = makeRng(4);
    let s = 0; const N = 20000;
    for (let i = 0; i < N; i++) s += sampleDeathAge(rr, m).age;
    return s / N;
  };
  assert.ok(mean(male) < mean(female));
});
```

**Step 2: 确认失败** → `Cannot find module '../js/engine/mortality.js'`

**Step 3: 实现** `js/engine/mortality.js`

**数学规格（严格按此实现）：**

设输入 `e0`（岁）、`q0 = infantMort/1000`、`q5 = under5Mort/1000`。

1. **形状参数**：`gamma = clamp(0.075 + (78 - e0) * 0.0009, 0.075, 0.115)`
   单位是**每年**。真实人群的 Gompertz 斜率约 0.075–0.115/年
   （美国 2019：μ(40)≈0.0015、μ(80)≈0.02，ln 比值/40 年 ≈ 0.065–0.08）。
   寿命越短 → 衰老越陡 → gamma 越大。
   ⚠️ 不要写成 0.85–1.15 那一版：那个量级大 10 倍，会让所有人都死在 85 岁前后。
2. **儿童段（固定，不由 e0 决定）**
   - `mu(0) = -ln(1 - q0)`
   - `q1_4 = max(0, (q5 - q0)) / 4`，`mu(1..4) = -ln(1 - q1_4)`
   - `mu(5..14)`：从 `mu(4)` 线性插值到 `mu(15)`
3. **成人段**：`mu(x) = beta * exp(gamma * (x - 15))`，`x >= 15`
   - `mu(15) = beta`（因为 `exp(0)=1`）
   - 因此 `mu(5..14)` 的插值终点是 `beta`，**beta 是未知数**，故每次评估都要重建整条 μ 数组
4. **标定**：用二分法求 `beta`，使生命表算出的 `e0Model` 等于输入 `e0`
   - 对给定的 `beta`，构建 `mu[0..119]`，然后
     `l(0)=1; l(x+1) = l(x) * exp(-mu(x))`
     `e0Model = Σ_{x=0}^{119} l(x)`
   - `e0Model` 关于 `beta` **单调递减** → 可二分
   - **在 log 空间二分**：`logBeta ∈ [-30, 0]`（即 beta ∈ [9.4e-14, 1]），
     迭代 200 次或区间宽度 < 1e-12。实际解约在 `beta ∈ [5e-5, 5e-4]`（e0 从 45 到 90 的映射）。
   - 若 200 次后仍未收敛到 0.01 岁以内，取误差最小的端点并置 `converged = false`（不静默失败）
5. **生命表导出** `lifeTable(m)`：返回 `[{age, mu, q, l, e}]`
   - `q(x) = 1 - exp(-mu(x))`，`e(x) = (Σ_{y=x}^{119} l(y)) / l(x)`
6. **逐年抽样** `sampleDeathAge(rng, m, { maxAge = 119 })`：
   ```
   let surv = 1;
   for (let x = 0; x <= maxAge; x++) {
     if (rng() >= surv) return { age: x, causeBand: bandOf(x) };
     surv *= Math.exp(-m.mu(x));
   }
   return { age: maxAge, causeBand: bandOf(maxAge) };
   ```
   `bandOf(x)`：`0` = 0–1，`1` = 1–4，`2` = 5–14，`3` = 15–39，`4` = 40–59，`5` = 60–79，`6` = 80+

**Step 4: 运行** → `npm test`，重点看 mortality 测试
Expected: 8 个 mortality 测试全绿。若 `e0Model` 不收敛，先调 `gamma` 公式而不是放宽断言。

**Step 5: 提交** → `git commit -m "feat: Gompertz 年龄别死亡力模型，e0 标定与逐年 hazard 抽样"`

---

### Task 10: 死因抽取

**Files:**
- Create: `js/engine/causes.js`
- Create: `tests/causes.test.js`

**Step 1: 写失败测试**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../js/engine/rng.js';
import { sampleCause, reweightByAge, CAUSE_BANDS } from '../js/engine/causes.js';

const mix = { communicable: 8, ncd: 86, injury: 6 };

test('三类死因占比归一化后和为 1', () => {
  const w = reweightByAge(mix, 3);
  const sum = Object.values(w).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
});

test('老年组的非传染占比高于儿童组', () => {
  const child = reweightByAge(mix, 0);
  const old = reweightByAge(mix, 5);
  assert.ok(old.ncd > child.ncd);
});

test('儿童组的传染占比高于老年组', () => {
  const child = reweightByAge(mix, 0);
  const old = reweightByAge(mix, 5);
  assert.ok(child.communicable > old.communicable);
});

test('死因抽样频率大致匹配权重', () => {
  const r = makeRng(1234);
  const counts = { communicable: 0, ncd: 0, injury: 0 };
  const N = 20000;
  for (let i = 0; i < N; i++) counts[sampleCause(r, mix, 3).cause]++;
  const w = reweightByAge(mix, 3);
  for (const k of Object.keys(counts)) {
    assert.ok(Math.abs(counts[k] / N - w[k]) < 0.03, `${k}: ${counts[k] / N} vs ${w[k]}`);
  }
});

test('数据缺失时返回不可用而不是编造', () => {
  const out = sampleCause(makeRng(1), null, 3);
  assert.equal(out.available, false);
  assert.equal(out.cause, null);
});

test('死因带年龄段与口径元数据', () => {
  const out = sampleCause(makeRng(2), mix, 3);
  assert.equal(out.band, 3);
  assert.ok(CAUSE_BANDS[3].label);
  assert.ok(out.source);
});
```

**Step 2: 确认失败**

**Step 3: 实现** `js/engine/causes.js`
- `CAUSE_BANDS`：7 个年龄段的 `{label, ageMin, ageMax}` 与成人期加权系数
- `reweightByAge(mix, band)`：按年龄段对三类占比乘上系数后归一化
  - 0–1：communicable ×3.0，injury ×1.5，ncd ×0.2
  - 1–4：communicable ×2.5，injury ×1.4，ncd ×0.3
  - 5–14：communicable ×1.8，injury ×1.3，ncd ×0.5
  - 15–39：communicable ×1.3，injury ×1.4，ncd ×0.8
  - 40–59：communicable ×0.8，injury ×0.9，ncd ×1.1
  - 60–79：communicable ×0.5，injury ×0.7，ncd ×1.25
  - 80+：communicable ×0.4，injury ×0.6，ncd ×1.35
- `sampleCause(rng, mix, band)`：逆 CDF 抽样 → `{available, cause, causeLabel, band, share, source, year}`
  - `causeLabel`：`communicable → 传染性疾病`，`ncd → 非传染性疾病`，`injury → 伤害`
  - `source` 固定为 `'World Bank cause of death (SH.DTH.*.ZS)'`

**Step 4: 运行** → 全绿

**Step 5: 提交** → `git commit -m "feat: 按年龄段加权的死因抽取"`

---

### Task 11: 重点（focus）系统

**Files:**
- Create: `js/engine/focus.js`
- Create: `tests/focus.test.js`

**Step 1: 写失败测试**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { FOCUSES, applyFocus, focusForAge } from '../js/engine/focus.js';

test('重点列表覆盖六个方向且互不相同', () => {
  assert.ok(FOCUSES.length >= 6);
  assert.equal(new Set(FOCUSES.map((f) => f.id)).size, FOCUSES.length);
});

test('每个重点都影响全部五个统计量', () => {
  for (const f of FOCUSES) {
    for (const k of ['knowledge', 'health', 'relations', 'income', 'happiness']) {
      assert.equal(typeof f.effects[k], 'number', `${f.id}.${k}`);
    }
  }
});

test('读书提高知识、略降健康', () => {
  const f = FOCUSES.find((x) => x.id === 'study');
  assert.ok(f.effects.knowledge > 0);
  assert.ok(f.effects.health <= 0);
});

test('养身体提高健康', () => {
  const f = FOCUSES.find((x) => x.id === 'health');
  assert.ok(f.effects.health > 0);
});

test('applyFocus 把效果施加到状态并夹紧到 0..100', () => {
  const st = { stats: { knowledge: 98, health: 50, relations: 50, income: 0, happiness: 50 } };
  applyFocus(st, FOCUSES.find((f) => f.id === 'study'));
  assert.equal(st.stats.knowledge, 100);
  assert.ok(st.stats.health < 50);
});

test('未满年龄不提供某些重点', () => {
  assert.ok(focusForAge(5).length < FOCUSES.length);
  assert.ok(focusForAge(30).length >= 5);
});
```

**Step 2: 确认失败**

**Step 3: 实现** `js/engine/focus.js`
- `FOCUSES`：6 个，effects 见设计文档 §4.4
- `applyFocus(state, focus)`：逐项加到 `state.stats`，夹紧 0..100
- `focusForAge(age)`：6 岁前不能选「挣钱」；18 岁前不能选「学门手艺」等
- 扩展点：`focus.effects` 里 `income` 表示**当年收入系数增量**而非直接加分

**Step 4: 运行** → 全绿

**Step 5: 提交** → `git commit -m "feat: 年度重点系统"`

---

### Task 12: 人生岔路口（decisions）

**Files:**
- Create: `js/engine/decisions.js`
- Create: `tests/decisions.test.js`

**Step 1: 写失败测试**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { DECISIONS, availableDecisions, resolveDecision } from '../js/engine/decisions.js';

test('每个岔路口都有 id、年龄、选项与效果', () => {
  for (const d of DECISIONS) {
    assert.ok(d.id, '缺 id');
    assert.ok(d.age >= 0, `${d.id} 缺 age`);
    assert.ok(Array.isArray(d.options) && d.options.length >= 2, `${d.id} 选项不足`);
    for (const o of d.options) {
      assert.ok(o.label, `${d.id} 选项缺 label`);
      assert.equal(typeof o.apply, 'function', `${d.id} 选项缺 apply`);
    }
  }
});

test('岔路口 id 唯一', () => {
  assert.equal(new Set(DECISIONS.map((d) => d.id)).size, DECISIONS.length);
});

test('availableDecisions 随年龄推进逐步解锁', () => {
  const a = availableDecisions(6);
  const b = availableDecisions(30);
  assert.ok(b.length > a.length);
  assert.ok(a.every((d) => d.age <= 6));
});

test('resolveDecision 施加选项效果并返回新的状态', () => {
  const st = { age: 18, stats: { knowledge: 40, health: 80, relations: 50, income: 0, happiness: 60 }, flags: {} };
  const dec = DECISIONS.find((d) => d.id === 'secondary_school');
  const out = resolveDecision(st, dec, dec.options[0]);
  assert.notEqual(out, st);
  assert.ok(typeof out.flags[dec.id] === 'string');
});

test('已做过的岔路口不重复出现', () => {
  const st = { flags: { secondary_school: 'public' } };
  const out = availableDecisions(20, st);
  assert.ok(!out.some((d) => d.id === 'secondary_school'));
});
```

**Step 2: 确认失败**

**Step 3: 实现** `js/engine/decisions.js`
- 至少 12 个岔路口（id 用英文，展示文案用中文）：
  `school_entry(6)` `secondary_school(14)` `upper_secondary(17)` `university(19)` `first_job(22)`
  `migration(25)` `relationship(27)` `housing(31)` `child(30)` `career_shift(35)`
  `health_screening(45)` `parenting_care(50)` `retirement(60)` `legacy(70)`
- 每个选项的 `apply(state)` 改 `state.stats` / `state.flags` / `state.timeline`
- 选项效果**只改概率与状态，不直接定生死**（设计原则）

**Step 4: 运行** → 全绿

**Step 5: 提交** → `git commit -m "feat: 人生岔路口决策系统"`

---

### Task 13: 随机事件池

**Files:**
- Create: `js/engine/events.js`
- Create: `tests/events.test.js`

**Step 1: 写失败测试**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../js/engine/rng.js';
import { EVENTS, rollEvent, eventApplies } from '../js/engine/events.js';

test('事件定义完整', () => {
  for (const e of EVENTS) {
    assert.ok(e.id);
    assert.ok(e.text, `${e.id} 缺 text`);
    assert.ok(e.ageMin <= e.ageMax, `${e.id} 年龄区间非法`);
    assert.ok(typeof e.weight === 'number');
  }
});

test('eventApplies 尊重年龄区间与国别条件', () => {
  const e = EVENTS.find((x) => x.id === 'first_job');
  assert.equal(eventApplies(e, 10, { iso3: 'CHN' }), false);
  assert.equal(eventApplies(e, 25, { iso3: 'CHN' }), true);
});

test('rollEvent 返回 null 或合法事件', () => {
  const r = makeRng(12);
  for (let i = 0; i < 500; i++) {
    const e = rollEvent(r, 30, { iso3: 'CHN' }, new Set());
    if (e !== null) assert.ok(e.id && e.text);
  }
});

test('同一事件不会在同一年重复触发', () => {
  const r = makeRng(77);
  const fired = new Set();
  for (let i = 0; i < 200; i++) {
    const e = rollEvent(r, 30, { iso3: 'CHN' }, fired);
    if (e) fired.add(e.id);
  }
  assert.ok(fired.size > 0);
});
```

**Step 2: 确认失败**

**Step 3: 实现** `js/engine/events.js`
- 至少 30 个事件，字段：`{ id, text, ageMin, ageMax, weight, countries?, condition?, effect?, choice? }`
- `choice` 存在时表示带选项的事件（复用 decisions 的 apply 约定）
- 部分事件按国别指标加权（如「新生儿疾病住院」权重 ∝ `1/immunization`）

**Step 4: 运行** → 全绿

**Step 5: 提交** → `git commit -m "feat: 随机事件池"`

---

### Task 14: 人生轨迹（学业/职业/家庭/健康）

**Files:**
- Create: `js/engine/stages.js`
- Create: `tests/stages.test.js`

**Step 1: 写失败测试**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceEducation, advanceCareer, advanceFamily, advanceHealth } from '../js/engine/stages.js';

const ctx = {
  stats: { knowledge: 30, health: 90, relations: 50, income: 0, happiness: 60 },
  flags: { schooling: 'primary' },
  country: { indicators: { schooling: { value: 7.6, year: 2020 } } },
  family: { parentsIncome: 40000 },
};

test('教育轨迹随年龄推进知识增长且有上限', () => {
  const st = { ...ctx, stats: { ...ctx.stats } };
  for (let i = 0; i < 40; i++) advanceEducation(st, 10 + i);
  assert.ok(st.stats.knowledge > 30);
  assert.ok(st.stats.knowledge <= 100);
});

test('教育终点接近该国平均受教育年限', () => {
  const st = { ...ctx, stats: { ...ctx.stats } };
  for (let i = 0; i < 30; i++) advanceEducation(st, 6 + i);
  assert.ok(st.stats.knowledge <= 100);
  assert.ok(st.stats.knowledge >= 40);
});

test('职业轨迹在有工作时提高收入', () => {
  const st = { ...ctx, stats: { ...ctx.stats }, job: 'clerk' };
  advanceCareer(st, 30);
  assert.ok(st.stats.income > 0);
});

test('职业轨迹不产生负收入', () => {
  const st = { ...ctx, stats: { ...ctx.stats } };
  for (let i = 0; i < 20; i++) advanceCareer(st, 18 + i);
  assert.ok(st.stats.income >= 0);
});

test('健康随年龄下降', () => {
  const st = { ...ctx, stats: { ...ctx.stats } };
  const before = st.stats.health;
  for (let i = 0; i < 30; i++) advanceHealth(st, 40 + i);
  assert.ok(st.stats.health < before);
});

test('家庭轨迹记录子女且不产生负数', () => {
  const st = { ...ctx, stats: { ...ctx.stats }, family: { parentsIncome: 40000, children: 0 } };
  for (let i = 0; i < 20; i++) advanceFamily(st, 25 + i);
  assert.ok(st.family.children >= 0);
});
```

**Step 2: 确认失败**

**Step 3: 实现** `js/engine/stages.js`
- `advanceEducation(state, age)`：按 `flags.schooling` 阶段推进知识；知识上限 = `min(100, 15 + 8×该国平均受教育年限)`（知识是「能力分」不是「学年数」）
- `advanceCareer(state, age)`：收入 = 基础收入 × 知识系数 × 职业系数；年龄 > 65 后逐步衰减
- `advanceFamily(state, age)`：按婚姻状态与该国生育率推进子女数
- `advanceHealth(state, age)`：40 岁后每年 −0.3，60 岁后每年 −0.65（作为默认，事件可覆盖）

**Step 4: 运行** → 全绿

**Step 5: 提交** → `git commit -m "feat: 学业/职业/家庭/健康轨迹"`

---

### Task 15: 人生编排（核心整合）

**Files:**
- Create: `js/engine/life.js`
- Create: `tests/life.test.js`

**Step 1: 写失败测试**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { simulateLife } from '../js/engine/life.js';
import { makeWorld } from './helpers/world.js';

const world = makeWorld();

test('同一种子得到完全相同的人生', () => {
  const a = simulateLife(world, { seed: 1234, birthYear: 2026, auto: true });
  const b = simulateLife(world, { seed: 1234, birthYear: 2026, auto: true });
  assert.deepEqual(a.years.map((y) => y.age), b.years.map((y) => y.age));
  assert.equal(a.death.age, b.death.age);
  assert.equal(a.death.cause, b.death.cause);
  assert.equal(a.birth.iso3, b.birth.iso3);
});

test('不同种子得到不同的人生', () => {
  const a = simulateLife(world, { seed: 1, birthYear: 2026, auto: true });
  const b = simulateLife(world, { seed: 2, birthYear: 2026, auto: true });
  assert.notEqual(a.death.age, b.death.age);
});

test('人生有完整的出生与死亡记录', () => {
  const l = simulateLife(world, { seed: 99, birthYear: 2026, auto: true });
  assert.ok(l.birth.iso3);
  assert.ok(l.birth.name);
  assert.ok(l.birth.birthYear);
  assert.ok(l.death.age >= 0);
  assert.ok(l.death.cause);
  assert.ok(l.death.year);
});

test('逐年记录连续且年龄单调递增', () => {
  const l = simulateLife(world, { seed: 5, birthYear: 2026, auto: true });
  for (let i = 0; i < l.years.length; i++) assert.equal(l.years[i].age, i);
});

test('统计量始终在 0..100 区间', () => {
  const l = simulateLife(world, { seed: 8, birthYear: 2026, auto: true });
  for (const y of l.years) {
    for (const k of Object.keys(y.stats)) {
      assert.ok(y.stats[k] >= 0 && y.stats[k] <= 100, `${k}=${y.stats[k]} @${y.age}`);
    }
  }
});

test('生命长度与该国预期寿命同量级', () => {
  const l = simulateLife(world, { seed: 3, birthYear: 2026, auto: true });
  const e0 = world.countries[l.birth.iso3].indicators.lifeExp.value;
  assert.ok(Math.abs(l.death.age - e0) < 15, `寿命 ${l.death.age} vs e0 ${e0}`);
});
```

**Step 2: 确认失败**

**Step 3: 实现** `tests/helpers/world.js`（测试夹具）与 `js/engine/life.js`
- 夹具 `makeWorld()`：3–5 个人造国家（不同 e0/婴儿死亡率/出生人口）+ 对应 `indicators`，供引擎测试用
- `simulateLife(world, { seed, birthYear, auto, choices })`：
  1. `rng = makeRng(seed)`
  2. 抽出生地/性别/家庭经济/城乡/姓名
  3. 构建 `mortality = buildMortality({...})`
  4. 逐年循环：抽事件 → 应用重点 → 推进学业/职业/家庭/健康 → 记录年度快照 → 检查死亡
  5. 死时抽死因
  6. 返回 `{ birth, years, death, flags, timeline, stats }`
- `auto: true` 时重点用 RNG 自动选；`choices` 可传入玩家选择映射 `{ [year]: focusId }`

**Step 4: 运行** → 全绿

**Step 5: 提交** → `git commit -m "feat: 人生逐年编排引擎"`

---

### Task 16: 死亡证明与流水账

**Files:**
- Create: `js/engine/record.js`
- Create: `tests/record.test.js`

**Step 1: 写失败测试**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDeathRecord, buildShareText } from '../js/engine/record.js';
import { simulateLife } from '../js/engine/life.js';
import { makeWorld } from './helpers/world.js';

const life = simulateLife(makeWorld(), { seed: 42, birthYear: 2026, auto: true });

test('死亡证明包含关键字段', () => {
  const rec = buildDeathRecord(life);
  for (const k of ['name', 'sex', 'birthPlace', 'birthDate', 'deathDate', 'age', 'cause']) {
    assert.ok(rec[k], `缺 ${k}`);
  }
});

test('死亡证明包含数据出处', () => {
  const rec = buildDeathRecord(life);
  assert.ok(Array.isArray(rec.sources) && rec.sources.length > 0);
  for (const s of rec.sources) assert.ok(s.name && s.url);
});

test('流水账按年龄升序且每条有文字', () => {
  const rec = buildDeathRecord(life);
  for (let i = 1; i < rec.timeline.length; i++) {
    assert.ok(rec.timeline[i].age >= rec.timeline[i - 1].age);
  }
  for (const row of rec.timeline) assert.ok(row.text);
});

test('分享文本包含姓名、年龄与死因，且可读', () => {
  const t = buildShareText(life);
  assert.ok(t.length > 20);
  assert.match(t, /\d+/);
});
```

**Step 2: 确认失败**

**Step 3: 实现** `js/engine/record.js`
- `buildDeathRecord(life)` → `{ name, sex, birthPlace, birthDate, deathDate, age, cause, causeShare, stats, timeline, sources, dataYears }`
- `buildShareText(life)` → 多行纯文本（含地点、年龄、死因、一句统计对比）

**Step 4: 运行** → 全绿

**Step 5: 提交** → `git commit -m "feat: 死亡证明、流水账与分享文案"`

---

## M3 · 像素渲染

### Task 17: RGBA 栅格与图元

**Files:**
- Create: `js/render/raster.js`
- Create: `tests/raster.test.js`

**Step 1: 写失败测试**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { Raster } from '../js/render/raster.js';

test('栅格尺寸与像素数正确', () => {
  const r = new Raster(192, 60);
  assert.equal(r.width, 192);
  assert.equal(r.height, 60);
  assert.equal(r.data.length, 192 * 60 * 4);
});

test('默认像素全透明', () => {
  const r = new Raster(4, 4);
  assert.deepEqual(Array.from(r.data.slice(0, 4)), [0, 0, 0, 0]);
});

test('set 写入 RGBA 且不越界', () => {
  const r = new Raster(4, 4);
  r.set(1, 2, [255, 0, 0, 255]);
  assert.deepEqual(Array.from(r.data.slice((2 * 4 + 1) * 4, (2 * 4 + 1) * 4 + 4)), [255, 0, 0, 255]);
  r.set(99, 99, [1, 2, 3, 4]); // 不应抛错
});

test('rect 填充矩形区域', () => {
  const r = new Raster(10, 10);
  r.rect(2, 2, 4, 3, [0, 255, 0, 255]);
  assert.equal(r.get(2, 2)[1], 255);
  assert.equal(r.get(5, 4)[1], 255);
  assert.equal(r.get(6, 4)[1], 0);
});

test('blit 合成精灵并支持 alpha 混合', () => {
  const r = new Raster(10, 10);
  const s = new Raster(2, 2);
  s.set(0, 0, [255, 0, 0, 255]);
  s.set(1, 1, [0, 0, 255, 128]);
  r.blit(s, 0, 0);
  assert.deepEqual(Array.from(r.get(0, 0)), [255, 0, 0, 255]);
  assert.equal(r.get(1, 1)[3] < 255, true);
});

test('toImageData 可在有 canvas 的环境构造', () => {
  const r = new Raster(2, 2);
  assert.ok(typeof r.toImageData === 'function');
});
```

**Step 2: 确认失败**

**Step 3: 实现** `js/render/raster.js`
- `class Raster { constructor(width, height) }`，内部 `Uint8ClampedArray`
- 方法：`set` `get` `rect` `disc` `line` `blit` `clear` `copy` `toImageData` `equals`
- `blit(src, x, y, { alpha = 1 } = {})`：源像素按 alpha 混合进目标
- `toImageData()` 在无 `ImageData` 全局时抛清晰错误（Node 环境），并提供 `toArray()` 供测试

**Step 4: 运行** → 全绿

**Step 5: 提交** → `git commit -m "feat: 像素栅格与图元（含 alpha 混合）"`

---

### Task 18: 调色板

**Files:**
- Create: `js/render/palette.js`
- Create: `tests/palette.test.js`

**Step 1: 写失败测试**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { PALETTES, paletteFor, gradeMood, gradeClimate } from '../js/render/palette.js';

test('两套主题都存在且键集合一致', () => {
  assert.ok(PALETTES.paper && PALETTES.night);
  assert.deepEqual(Object.keys(PALETTES.paper).sort(), Object.keys(PALETTES.night).sort());
});

test('所有颜色都是合法 hex', () => {
  for (const theme of Object.values(PALETTES)) {
    for (const [k, v] of Object.entries(theme)) {
      if (typeof v === 'string') assert.match(v, /^#[0-9a-fA-F]{6}$/, `${k}=${v}`);
    }
  }
});

test('paletteFor 返回完整调色板', () => {
  const p = paletteFor({ theme: 'night', climate: 'temperate', mood: 'mid' });
  assert.ok(p.sky);
  assert.ok(p.ground);
});

test('gradeMood 低迷情绪让天空变灰', () => {
  const base = paletteFor({ theme: 'paper', climate: 'temperate', mood: 'mid' });
  const low = paletteFor({ theme: 'paper', climate: 'temperate', mood: 'low' });
  assert.notEqual(base.sky[0], low.sky[0]);
});

test('gradeClimate 干旱气候地面偏沙色', () => {
  const dry = paletteFor({ theme: 'paper', climate: 'arid', mood: 'mid' });
  const wet = paletteFor({ theme: 'paper', climate: 'humid', mood: 'mid' });
  assert.notEqual(dry.ground, wet.ground);
});
```

**Step 2: 确认失败**

**Step 3: 实现** `js/render/palette.js`
- **自创** 32 色 × 2 主题（`paper` 亮、`night` 暗）
- 颜色槽：`sky0 sky1 sky2 sun cloud cloudShade farHill nearHill ground groundAlt road water wall wallShade roof window windowLit outline foliage foliageDark trunk skin0..skin5 hair clothA clothB clothC accent gold danger` 等
- 5 个气候：`cold temperate arid humid plateau`；5 个情绪：`low mid high`
- `gradeMood(p, mood)`、`gradeClimate(p, climate)` 为纯函数

**Step 4: 运行** → 全绿

**Step 5: 提交** → `git commit -m "feat: 自创双主题调色板与气候/情绪分级"`

---

### Task 19: 精灵（参数化人形 + 住所 + 聚落）

**Files:**
- Create: `js/render/sprites.js`
- Create: `tests/sprites.test.js`

**Step 1: 写失败测试**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { person, dwelling, settlement, treeKind } from '../js/render/sprites.js';
import { Raster } from '../js/render/raster.js';
import { PALETTES } from '../js/render/palette.js';

const P = PALETTES.paper;

test('人形尺寸随年龄段变化', () => {
  assert.ok(person(P, { age: 0 }).height < person(P, { age: 8 }).height);
  assert.ok(person(P, { age: 8 }).height < person(P, { age: 30 }).height);
});

test('人形肤色与国籍无关（由 seed 决定）', () => {
  const a = person(P, { age: 30, seed: 42, iso3: 'JPN' });
  const b = person(P, { age: 30, seed: 42, iso3: 'NGA' });
  assert.equal(a.skin, b.skin);
});

test('同 seed 同体型完全一致', () => {
  const a = person(P, { age: 30, seed: 7, iso3: 'CHN' });
  const b = person(P, { age: 30, seed: 7, iso3: 'CHN' });
  assert.deepEqual(a.pixels, b.pixels);
});

test('住所按财富档位改变宽度', () => {
  const poor = dwelling(P, { wealth: 0.05, urban: false });
  const rich = dwelling(P, { wealth: 0.95, urban: true });
  assert.ok(rich.width > poor.width);
});

test('聚落天际线随城镇化率变高', () => {
  const rural = settlement(P, { urbanRate: 0.1, seed: 3 });
  const urban = settlement(P, { urbanRate: 0.95, seed: 3 });
  assert.ok(urban.buildingCount > rural.buildingCount);
});

test('treeKind 按气候返回不同种类', () => {
  assert.notEqual(treeKind('temperate'), treeKind('arid'));
});
```

**Step 2: 确认失败**

**Step 3: 实现** `js/render/sprites.js`
- `person(P, { age, seed, sex, skin, pose })` → `{ raster, width, height, skin, pixels }`
  - 身高：婴儿 8px → 儿童 12px → 成人 16px → 老人 15px（略驼）
  - 结构：头（2×2 或 3×3）、躯干、手臂、腿，全部矩形组合
  - 肤色从 `skin0..skin5` 中**由 seed 哈希**选，**与 iso3 无关**
  - 步态：4 帧循环（`pose: 0..3`）
- `dwelling(P, { wealth, urban })` → 5 档（茅屋/平房/楼房/宅邸）
- `settlement(P, { urbanRate, seed })` → 轮廓线数组
- `treeKind(climate)`

**Step 4: 运行** → 全绿

**Step 5: 提交** → `git commit -m "feat: 参数化人形、住所与聚落精灵"`

---

### Task 20: 场景合成

**Files:**
- Create: `js/render/scene.js`
- Create: `tests/scene.test.js`

**Step 1: 写失败测试**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderScene } from '../js/render/scene.js';
import { PALETTES } from '../js/render/palette.js';

const model = {
  age: 34, sex: 'female', wealth: 0.4, urban: true, urbanRate: 0.66,
  climate: 'temperate', mood: 'mid', stage: 'day', iso3: 'CHN', seed: 'CHN:上海:Li',
  job: 'clerk', people: [{ role: 'me', age: 34 }, { role: 'par', age: 62 }, { role: 'kid', age: 8 }],
};

test('场景尺寸固定 192x60', () => {
  const s = renderScene(model, PALETTES.paper);
  assert.equal(s.width, 192);
  assert.equal(s.height, 60);
});

test('同输入渲染出逐像素一致的结果', () => {
  const a = renderScene(model, PALETTES.paper);
  const b = renderScene(model, PALETTES.paper);
  assert.equal(a.equals(b), true);
});

test('场景没有全透明像素（全部被绘制覆盖）', () => {
  const s = renderScene(model, PALETTES.paper);
  for (let i = 3; i < s.data.length; i += 4) assert.equal(s.data[i], 255, `像素 ${i / 4} 透明`);
});

test('夜间场景整体更暗', () => {
  const day = renderScene({ ...model, stage: 'day' }, PALETTES.paper);
  const night = renderScene({ ...model, stage: 'night' }, PALETTES.night);
  const lum = (r) => { let s = 0; for (let i = 0; i < r.data.length; i += 4) s += r.data[i] + r.data[i+1] + r.data[i+2]; return s; };
  assert.ok(lum(night) < lum(day));
});

test('不同年龄渲染出不同场景', () => {
  const a = renderScene({ ...model, age: 5 }, PALETTES.paper);
  const b = renderScene({ ...model, age: 40 }, PALETTES.paper);
  assert.equal(a.equals(b), false);
});
```

**Step 2: 确认失败**

**Step 3: 实现** `js/render/scene.js`
- `renderScene(model, palette)` → `Raster`
- 层序：天空渐变（3 段 + Bayer 4×4 抖动过渡）→ 天体（日/月/星）→ 远山（双正弦）→ 聚落天际线 → 地面 → 住所 → 工作地道具 → 人物（自左至右）→ 前景植被 → 天气叠加（雨/雪）
- Bayer 矩阵自实现
- **只在状态变化时调用一次**，不在动画帧里重复调用

**Step 4: 运行** → 全绿

**Step 5: 提交** → `git commit -m "feat: 像素场景合成器"`

---

### Task 21: 旁白文案生成

**Files:**
- Create: `js/render/narrator.js`
- Create: `tests/narrator.test.js`

**Step 1: 写失败测试**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { narrateYear, narrateBirth, narrateDeath } from '../js/render/narrator.js';

test('年度旁白包含年龄与地点', () => {
  const t = narrateYear({ age: 22, year: 2048, place: '上海', country: '中国', event: null });
  assert.match(t, /22/);
  assert.match(t, /上海/);
});

test('有事件时旁白包含事件文字', () => {
  const t = narrateYear({ age: 30, year: 2056, place: '上海', country: '中国', event: { text: '厂里效益不好，停产整顿。' } });
  assert.match(t, /停产整顿/);
});

test('出生旁白说明随机性', () => {
  const t = narrateBirth({ name: '李明', country: '中国', place: '四川', chance: 0.089 });
  assert.match(t, /李明/);
  assert.match(t, /四川/);
});

test('死亡旁白包含死因', () => {
  const t = narrateDeath({ name: '李明', age: 74, cause: '非传染性疾病', year: 2082 });
  assert.match(t, /74/);
  assert.match(t, /非传染性疾病/);
});
```

**Step 2: 确认失败**

**Step 3: 实现** `js/render/narrator.js`
- 纯文案生成，按年龄段、事件类型、情绪挑选句式（每类 ≥6 种变体，避免重复感）
- 数据缺失时用中性表述，绝不编造具体数字

**Step 4: 运行** → 全绿

**Step 5: 提交** → `git commit -m "feat: 旁白文案生成"`

---

## M4 · 界面

### Task 22: 落地页

**Files:**
- Modify: `index.html`
- Create: `css/base.css` `css/layout.css` `css/theme.css`
- Create: `js/ui/landing.js`
- Create: `js/main.js`（改写为入口路由）
- Create: `js/ui/dom.js`（极简 DOM 辅助：`el()` `clear()` `on()`）

**Step 1: 实现**
- 落地页内容：标题、实时计数器（全球每秒出生/死亡，用本地推算常量）、设置区（出生权重口径：一生的时长、出生年份（今天/过去 1950–2025/未来）、可选种子输入）、「出生」按钮
- 计数器用 `requestAnimationFrame` 累加，不请求网络
- 主题：亮/暗两套，跟随 `prefers-color-scheme`，可手动切换并存 localStorage
- 全部 DOM 用 `js/ui/dom.js` 的 `el()` 创建，避免 innerHTML 拼接用户数据

**Step 2: 手工验证**
```
npm start
# 浏览器打开 http://localhost:8080
```
Expected: 落地页渲染正常，计数器在动，点「出生」进入出生仪式

**Step 3: 提交** → `git commit -m "feat: 落地页与设置"`

---

### Task 23: 出生仪式

**Files:**
- Create: `js/ui/birth.js`
- Create: `js/ui/worldmap.js`（Canvas 等距圆柱世界地图 + 出生点闪烁）

**Step 1: 实现**
- 播报：抽中的国家、概率、性别、出生地、家庭经济、该国关键指标（带数据年份）
- 世界地图上标出出生点
- 「开始这一生」按钮 → 进入逐年推进

**Step 2: 手工验证** → 地图能画出陆地轮廓并标出出生点

**Step 3: 提交** → `git commit -m "feat: 出生仪式与世界地图"`

---

### Task 24: 逐年推进主界面

**Files:**
- Create: `js/ui/play.js`
- Create: `js/ui/clock.js`（时间流速：暂停 / 1–16× / 一年 N 毫秒）

**Step 1: 实现**
- 布局：顶部状态条（年份、年龄、四条统计量）→ 中部像素画布 + 旁白 → 底部流水账（可滚动）+ 重点选择 + 事件决策
- 每年流程：显示重点选择 → （有事件则显示决策）→ 推进 → 渲染新场景 + 旁白 + 记录
- 工具条：暂停、速度、自动模式、跳过本年度
- 决策弹层：键盘可选（数字键 1–4），焦点管理，Esc 关闭前提示

**Step 2: 手工验证** → 能完整跑完一生并进入死亡证明

**Step 3: 提交** → `git commit -m "feat: 逐年推进主界面"`

---

### Task 25: 死亡证明

**Files:**
- Create: `js/ui/ending.js`

**Step 1: 实现**
- 死亡证明卡（姓名、性别、出生地、出生/死亡日期、年龄、死因与占比）
- 关键统计回顾（最高学历、峰值收入、子女数、迁居次数）
- 一生流水账（可展开）
- 同批出生者：4 个同年同刻出生的对照人生（用同一 seed 派生不同子种子生成）
- 数据出处区块（每项指标 + 来源 + 年份 + 许可）
- 「再来一生」「复制分享链接」「下载分享卡」

**Step 2: 手工验证**

**Step 3: 提交** → `git commit -m "feat: 死亡证明与数据出处"`

---

### Task 26: SVG 生命曲线

**Files:**
- Create: `js/ui/chart.js`
- Create: `tests/chart.test.js`

**Step 1: 写失败测试**（纯函数部分）
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSeries, survivalFromMortality } from '../js/ui/chart.js';

test('buildSeries 把逐年统计转成折线点', () => {
  const s = buildSeries([{ age: 0, stats: { knowledge: 10, health: 90 } }, { age: 1, stats: { knowledge: 12, health: 90 } }]);
  assert.equal(s.knowledge.length, 2);
  assert.equal(s.knowledge[0].x, 0);
});

test('survivalFromMortality 生成单调不增的生存曲线', () => {
  const surv = survivalFromMortality({ mu: (x) => 0.001 * x });
  for (let i = 1; i < surv.length; i++) assert.ok(surv[i] <= surv[i - 1]);
  assert.equal(surv[0], 1);
});
```

**Step 2: 实现** → 纯函数 + SVG 绘制函数
**Step 3: 运行** → 全绿
**Step 4: 提交** → `git commit -m "feat: SVG 生命曲线与生存曲线"`

---

### Task 27: localStorage 存档

**Files:**
- Create: `js/ui/storage.js`
- Create: `tests/storage.test.js`

**Step 1: 写失败测试**（用内存 fake storage）
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../js/ui/storage.js';

function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
}

test('存档可写入并读回', () => {
  const store = createStore(fakeStorage());
  store.save({ seed: 1, age: 12 });
  assert.deepEqual(store.load(), { seed: 1, age: 12 });
});

test('损坏的存档返回 null 而不是抛错', () => {
  const s = fakeStorage();
  s.setItem('random-life.save.v1', '{坏数据');
  assert.equal(createStore(s).load(), null);
});

test('存档带 schema 版本号，版本不匹配时丢弃', () => {
  const s = fakeStorage();
  s.setItem('random-life.save.v1', JSON.stringify({ v: 99, seed: 1 }));
  assert.equal(createStore(s).load(), null);
});
```

**Step 2: 确认失败**
**Step 3: 实现** `js/ui/storage.js`：`createStore(storage)` → `{ save(obj), load(), clear() }`，键 `random-life.save.v1`，载荷 `{ v: 1, ... }`
**Step 4: 运行** → 全绿
**Step 5: 提交** → `git commit -m "feat: localStorage 存档"`

---

## M5 · 时光机

### Task 28: 历史数据选取与插值

**Files:**
- Create: `js/engine/history.js`
- Create: `tests/history.test.js`

**Step 1: 写失败测试**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { indicatorForYear, interpolate, worldYears } from '../js/engine/history.js';

const hist = { CHN: { 1950: { lifeExp: 43.8, population: 544000000 }, 1951: { lifeExp: 44.5, population: 552000000 }, 2000: { lifeExp: 71.4, population: 1263000000 } } };

test('indicatorForYear 返回该年的值与年份', () => {
  assert.deepEqual(indicatorForYear(hist, 'CHN', 'lifeExp', 1950), { value: 43.8, year: 1950 });
});

test('缺失年份用相邻年线性插值', () => {
  const out = indicatorForYear(hist, 'CHN', 'lifeExp', 1951);
  assert.equal(out.year, 1951);
});

test('插值不产生负值', () => {
  const v = interpolate(0, 10, 0.5);
  assert.equal(v, 5);
});

test('worldYears 给出可选的出生年范围', () => {
  const ys = worldYears();
  assert.ok(ys.includes(1950));
  assert.ok(ys.includes(2025));
});
```

**Step 2: 确认失败**
**Step 3: 实现** `js/engine/history.js`
- `indicatorForYear(history, iso, key, year)`：精确命中 → 返回；否则在相邻两年线性插值并标注 `interpolated: true`；再无则返回 `null`
- `worldYears()` → `[1950..2025]`
- 时间机接入 `simulateLife`：`birthYear` 传入后，所有 `indicators` 优先取该年历史值，取不到则回落到最新值并**在 UI 标注数据年份**
- **Step 4: 运行** → 全绿
- **Step 5: 提交** → `git commit -m "feat: 时光机——1950–2025 历史统计接入"`

---

## M6 · 分享

### Task 29: URL 种子读写

**Files:**
- Create: `js/ui/share.js`
- Create: `tests/share.test.js`

**Step 1: 写失败测试**
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeLife, decodeLife, buildUrl } from '../js/ui/share.js';

test('编解码可逆', () => {
  const life = { seed: 12345, birthYear: 1998, world: 'past', duration: 60 };
  assert.deepEqual(decodeLife(encodeLife(life)), life);
});

test('非法参数返回 null', () => {
  assert.equal(decodeLife('%%'), null);
  assert.equal(decodeLife(''), null);
});

test('buildUrl 生成含参数的 URL', () => {
  const u = buildUrl('https://example.com/', { seed: 7, birthYear: 2026 });
  assert.match(u, /seed=7/);
  assert.match(u, /by=2026/);
});
```

**Step 2: 确认失败**
**Step 3: 实现** `js/ui/share.js`：短参数名 `s`(seed) `by`(birthYear) `w`(world) `d`(duration)，用 `URLSearchParams`
**Step 4: 运行** → 全绿
**Step 5: 提交** → `git commit -m "feat: URL 种子分享"`

---

### Task 30: 分享卡 PNG

**Files:**
- Create: `js/ui/sharecard.js`
- Create: `tests/sharecard.test.js`

**Step 1: 写失败测试**（只测纯数据部分）
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { shareCardLines } from '../js/ui/sharecard.js';

test('分享卡包含姓名、年龄、死因与关键数据', () => {
  const lines = shareCardLines({ name: '李明', age: 74, cause: '非传染性疾病', place: '四川成都' });
  assert.ok(lines.some((l) => l.includes('李明')));
  assert.ok(lines.some((l) => l.includes('74')));
});
```

**Step 2: 确认失败**
**Step 3: 实现**：`shareCardLines(life)` 返回文本行；`renderShareCard(canvas, life, palette)` 把像素场景 + 文本画到 960×540 canvas 并 `toBlob` 下载
**Step 4: 运行** → 全绿
**Step 5: 提交** → `git commit -m "feat: 分享卡图片导出"`

---

## M7 · 收尾

### Task 31: README、许可与数据出处页

**Files:**
- Create: `README.md`
- Create: `LICENSE`（MIT）
- Create: `docs/DATA-SOURCES.md`
- Create: `js/ui/about.js`（游戏内「数据出处」页）

**Step 1: 实现**
- README：项目简介、截图、玩法、数据来源、许可、开发命令、致谢与参考项目
- `docs/DATA-SOURCES.md`：每个数据集的 URL、指标口径、许可、检索时间
- 游戏内「数据出处」页：从 `data/meta.json` 渲染

**Step 2: 提交** → `git commit -m "docs: README、MIT 许可与数据出处页"`

---

### Task 32: CI 与 GitHub Pages 部署

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/pages.yml`
- Create: `.gitattributes`

**Step 1: 实现**
- `ci.yml`：`node --test tests/`，Node 22
- `pages.yml`：GitHub Pages 部署（`actions/upload-pages-artifact` + `actions/deploy-pages`），发布根目录静态文件
- `.gitattributes`：`* text=auto eol=lf`

**Step 2: 验证**
```
gh workflow list
gh run list
```

**Step 3: 提交** → `git commit -m "ci: 测试工作流与 GitHub Pages 部署"`

---

## 全局规则

1. **每个任务结束时 `npm test` 必须全绿**，否则不许提交。
2. **提交粒度 = 一个任务**，提交信息用中文 `feat/fix/docs/test/chore:` 前缀。
3. **禁止**：内联 `Math.random()`（一律走注入的 rng）、直接改测试断言来迁就实现、把 `data/raw/` 提交进仓库、复制参考项目的代码或像素数据。
4. **数据缺失处理**：一律 `null` + 标注，绝不填 0。
5. 若某个断言难以满足，先怀疑**模型假设**（如 gamma 公式），再考虑放宽容差——并在提交信息里写清原因。
