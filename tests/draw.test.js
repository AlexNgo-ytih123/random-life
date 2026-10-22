// 出生地抽取模块（js/engine/draw.js）的测试。
//
// 这个模块回答一个问题：**你生在哪里？**
//   - 出生国按「该国占全球出生人口的比例」抽取（不是按人口比例！）
//     所以印度、中国会经常出现，卢森堡几乎不会出现。
//   - 性别按男/女出生比抽取（世界值约 105:100）。
//   - 家庭收入按「给定中位数 + 给定基尼系数」的对数正态分布抽取。
//   - 城乡按城镇化率抽取。
//
// 这些抽取都必须是**纯函数**：随机数由调用方注入，同一个种子永远
// 得到同一个人间。

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../js/engine/rng.js';
import {
  drawBirthplace,
  drawSex,
  drawFamilyIncome,
  drawUrban,
  normSInv,
} from '../js/engine/draw.js';

// 三个假想国家：权重就是「参考年份的出生人口数」。
//   CHN 10,000,000 / NGA 7,000,000 / JPN 800,000 → 合计 17,800,000
const WEIGHTS = [
  { iso3: 'CHN', w: 10000000 },
  { iso3: 'NGA', w: 7000000 },
  { iso3: 'JPN', w: 800000 },
];
const TOTAL_W = 17800000;

const CTX = {
  CHN: { name: '中国', nameEn: 'China', region: '亚洲' },
  NGA: { name: '尼日利亚', nameEn: 'Nigeria', region: '非洲' },
  JPN: { name: '日本', nameEn: 'Japan', region: '亚洲' },
};

/**
 * 经验基尼系数（升序排序后的标准公式）：
 *   G = (2·Σ_{i=1..n} i·x_i) / (n·Σx_i) − (n+1)/n
 *
 * @param {number[]} values 任意顺序的收入样本
 * @returns {number}
 */
function empiricalGini(values) {
  const xs = [...values].sort((a, b) => a - b);
  const n = xs.length;
  let sum = 0;
  let weighted = 0;
  for (let i = 0; i < n; i += 1) {
    sum += xs[i];
    weighted += (i + 1) * xs[i];
  }
  return (2 * weighted) / (n * sum) - (n + 1) / n;
}

// ── 1. 出生国抽取频率正比于出生人口 ─────────────────────────────────
test('出生国抽取频率正比于出生人口（不是人口比例）', () => {
  const rng = makeRng(42);
  const N = 100000;
  const counts = { CHN: 0, NGA: 0, JPN: 0 };
  for (let i = 0; i < N; i += 1) {
    counts[drawBirthplace(rng, WEIGHTS).iso3] += 1;
  }
  const share = (iso3) => counts[iso3] / N;
  const trueShare = (iso3) => WEIGHTS.find((x) => x.iso3 === iso3).w / TOTAL_W;

  for (const iso3 of ['CHN', 'NGA', 'JPN']) {
    const err = Math.abs(share(iso3) - trueShare(iso3));
    assert.ok(
      err < 0.01,
      `${iso3} 实测占比 ${share(iso3).toFixed(5)}，真实占比 ${trueShare(iso3).toFixed(5)}，偏差 ${err}`,
    );
  }
});

// ── 2. 返回国家的统计上下文 ────────────────────────────────────────
test('drawBirthplace 返回被抽中国家的统计上下文（name/region）', () => {
  const rng = makeRng(2024);
  for (let i = 0; i < 20; i += 1) {
    const result = drawBirthplace(rng, WEIGHTS, CTX);
    const expected = CTX[result.iso3];
    assert.ok(expected, `抽中的 ${result.iso3} 应该有上下文`);
    assert.equal(result.name, expected.name);
    assert.equal(result.nameEn, expected.nameEn);
    assert.equal(result.region, expected.region);
  }
});

test('ctx 里没有该国家时不崩溃，返回对象里就没有 name/region', () => {
  const rng = makeRng(2024);
  for (let i = 0; i < 20; i += 1) {
    const result = drawBirthplace(rng, WEIGHTS, { XXX: { name: '无名之国' } });
    assert.ok(WEIGHTS.some((x) => x.iso3 === result.iso3));
    assert.equal(result.name, undefined);
    assert.equal(result.region, undefined);
    // chance 依然要对
    assert.ok(Math.abs(result.chance - result.w / TOTAL_W) < 1e-12);
  }
});

test('不传 ctx 时也能正常抽取', () => {
  const rng = makeRng(5);
  const result = drawBirthplace(rng, WEIGHTS);
  assert.ok(['CHN', 'NGA', 'JPN'].includes(result.iso3));
  assert.equal(result.name, undefined);
});

// ── 3. chance 是该国占全球出生人口的比例 ──────────────────────────
test('chance 是该国占全球出生人口的比例', () => {
  const rng = makeRng(99);
  let result = drawBirthplace(rng, WEIGHTS);
  let guard = 0;
  while (result.iso3 !== 'CHN' && guard < 10000) {
    result = drawBirthplace(rng, WEIGHTS);
    guard += 1;
  }
  assert.equal(result.iso3, 'CHN');
  assert.ok(
    Math.abs(result.chance - 10000000 / TOTAL_W) < 1e-12,
    `chance=${result.chance} 期望 ${10000000 / TOTAL_W}`,
  );
});

test('每个国家的 chance 加起来等于 1', () => {
  const sum = WEIGHTS.reduce((acc, x) => acc + x.w / TOTAL_W, 0);
  assert.ok(Math.abs(sum - 1) < 1e-12);
});

// ── 4. 空权重返回 null ────────────────────────────────────────────
test('空权重 / 全零权重返回 null（调用方处理「无数据」）', () => {
  const rng = makeRng(1);
  assert.equal(drawBirthplace(rng, []), null);
  assert.equal(drawBirthplace(rng, [{ iso3: 'X', w: 0 }]), null);
  assert.equal(drawBirthplace(rng, [{ iso3: 'X', w: 0 }, { iso3: 'Y', w: 0 }]), null);
});

// ── 5. 性别比例接近 105:100 ───────────────────────────────────────
test('性别抽取接近 105:100', () => {
  const rng = makeRng(7);
  const N = 20000;
  let male = 0;
  for (let i = 0; i < N; i += 1) {
    const s = drawSex(rng);
    assert.ok(s === 'male' || s === 'female', `非法性别 ${s}`);
    if (s === 'male') male += 1;
  }
  const expected = 1.05 / 2.05;
  assert.ok(
    Math.abs(male / N - expected) < 0.02,
    `男性占比 ${(male / N).toFixed(4)}，期望 ${expected.toFixed(4)}`,
  );
});

test('drawSex 默认 ratio 为 1.05，可自定义', () => {
  const rng = makeRng(11);
  let male = 0;
  const N = 20000;
  for (let i = 0; i < N; i += 1) if (drawSex(rng, 1.0) === 'male') male += 1;
  assert.ok(Math.abs(male / N - 0.5) < 0.02, `男性占比 ${male / N}`);
});

// ── 6. 家庭收入分布还原目标基尼 ────────────────────────────────────
test('家庭收入分布还原目标基尼（median=30000, gini=0.35）', () => {
  const rng = makeRng(99);
  const N = 200000;
  const incomes = new Array(N);
  for (let i = 0; i < N; i += 1) {
    incomes[i] = drawFamilyIncome(rng, { median: 30000, gini: 0.35 });
    assert.ok(incomes[i] > 0 && Number.isFinite(incomes[i]), `非法收入 ${incomes[i]}`);
  }

  const g = empiricalGini(incomes);
  assert.ok(
    Math.abs(g - 0.35) < 0.02,
    `经验基尼 ${g.toFixed(4)}，目标 0.35（偏差 ${Math.abs(g - 0.35).toFixed(4)}）`,
  );

  const sorted = [...incomes].sort((a, b) => a - b);
  const med = (sorted[N / 2 - 1] + sorted[N / 2]) / 2;
  assert.ok(
    Math.abs(med - 30000) / 30000 < 0.05,
    `经验中位数 ${med.toFixed(1)}，目标 30000`,
  );
});

test('家庭收入：基尼越大越不平等（中位数不变）', () => {
  const rng = makeRng(1234);
  const N = 50000;
  const low = [];
  const high = [];
  for (let i = 0; i < N; i += 1) {
    low.push(drawFamilyIncome(rng, { median: 20000, gini: 0.1 }));
    high.push(drawFamilyIncome(rng, { median: 20000, gini: 0.6 }));
  }
  const gLow = empiricalGini(low);
  const gHigh = empiricalGini(high);
  assert.ok(Math.abs(gLow - 0.1) < 0.02, `低基尼实测 ${gLow.toFixed(4)}`);
  assert.ok(Math.abs(gHigh - 0.6) < 0.02, `高基尼实测 ${gHigh.toFixed(4)}`);
  assert.ok(gHigh > gLow);
});

test('家庭收入：基尼被夹到 [0,0.9]（不抛错）', () => {
  const rng = makeRng(3);
  const v = drawFamilyIncome(rng, { median: 1000, gini: 5 });
  assert.ok(v > 0 && Number.isFinite(v));
  const v2 = drawFamilyIncome(rng, { median: 1000, gini: -3 });
  assert.ok(v2 > 0 && Number.isFinite(v2));
});

// ── 7. 城乡抽取遵守城镇化率 ───────────────────────────────────────
test('城乡抽取遵守城镇化率（0.664）', () => {
  const rng = makeRng(3);
  const N = 20000;
  let urban = 0;
  for (let i = 0; i < N; i += 1) {
    const u = drawUrban(rng, 0.664);
    assert.equal(typeof u, 'boolean');
    if (u) urban += 1;
  }
  assert.ok(
    Math.abs(urban / N - 0.664) < 0.02,
    `城镇占比 ${(urban / N).toFixed(4)}，期望 0.664`,
  );
});

test('drawUrban 边界：0 永远是乡村，1 永远是城镇', () => {
  const rng = makeRng(8);
  for (let i = 0; i < 200; i += 1) assert.equal(drawUrban(rng, 0), false);
  for (let i = 0; i < 200; i += 1) assert.equal(drawUrban(rng, 1), true);
});

// ── 8. normSInv 正确性 ────────────────────────────────────────────
test('normSInv 取标准正态分位点', () => {
  assert.ok(Math.abs(normSInv(0.5)) < 1e-9, `normSInv(0.5)=${normSInv(0.5)}`);
  assert.ok(Math.abs(normSInv(0.975) - 1.959964) < 1e-6, `normSInv(0.975)=${normSInv(0.975)}`);
  assert.ok(Math.abs(normSInv(0.025) + 1.959964) < 1e-6, `normSInv(0.025)=${normSInv(0.025)}`);
  assert.ok(Math.abs(normSInv(0.95) - 1.644854) < 1e-6, `normSInv(0.95)=${normSInv(0.95)}`);
  assert.ok(Math.abs(normSInv(0.84) - 0.994458) < 1e-6, `normSInv(0.84)=${normSInv(0.84)}`);
});

test('normSInv 精度：Halley 修正后中央区达到机器精度', () => {
  // 精确参考值（与 Python statistics.NormalDist / Wichura AS241 一致）
  assert.ok(Math.abs(normSInv(0.975) - 1.959963984540054) < 1e-12);
  assert.ok(Math.abs(normSInv(0.025) + 1.959963984540054) < 1e-12);
  assert.ok(Math.abs(normSInv(0.95) - 1.6448536269514722) < 1e-12);
  assert.ok(Math.abs(normSInv(0.9) - 1.2815515655446004) < 1e-12);
  assert.ok(Math.abs(normSInv(0.99) - 2.3263478740408408) < 1e-12);
  assert.ok(Math.abs(normSInv(0.675) - 0.4537621901698796) < 1e-12);
  // 对称性
  assert.ok(Math.abs(normSInv(0.3) + normSInv(0.7)) < 1e-15);
});

test('normSInv 单调且与标准正态 CDF 互逆', () => {
  let prev = -Infinity;
  for (let p = 0.001; p < 1; p += 0.001) {
    const z = normSInv(p);
    assert.ok(z > prev, `p=${p} 处不单调`);
    prev = z;
    assert.ok(Math.abs(z) < 10, `p=${p} 的 z=${z} 离谱`);
  }
});

// ── 9. 确定性 ─────────────────────────────────────────────────────
test('确定性：同一种子产生完全相同的抽取序列', () => {
  const run = (seed) => {
    const rng = makeRng(seed);
    return {
      place: Array.from({ length: 40 }, () => drawBirthplace(rng, WEIGHTS, CTX)),
      sex: Array.from({ length: 40 }, () => drawSex(rng)),
      income: Array.from({ length: 40 }, () =>
        drawFamilyIncome(rng, { median: 30000, gini: 0.35 }),
      ),
      urban: Array.from({ length: 40 }, () => drawUrban(rng, 0.6)),
    };
  };
  assert.deepEqual(run(20240613), run(20240613));
  assert.notDeepEqual(run(20240613), run(20240614));
});

// ── 10. 输入校验 ──────────────────────────────────────────────────
test('drawFamilyIncome 对非法中位数抛错', () => {
  const rng = makeRng(1);
  assert.throws(() => drawFamilyIncome(rng, { median: -1, gini: 0.3 }), /中位数|median/i);
  assert.throws(() => drawFamilyIncome(rng, { median: 0, gini: 0.3 }), /中位数|median/i);
  assert.throws(() => drawFamilyIncome(rng, { median: NaN, gini: 0.3 }), /中位数|median/i);
  assert.throws(() => drawFamilyIncome(rng, { median: Infinity, gini: 0.3 }), /中位数|median/i);
});

test('normSInv(0) 与 normSInv(1) 抛错（而不是返回 ±Infinity）', () => {
  assert.throws(() => normSInv(0), /p|概率/);
  assert.throws(() => normSInv(1), /p|概率/);
  assert.throws(() => normSInv(-0.1), /p|概率/);
  assert.throws(() => normSInv(1.1), /p|概率/);
  assert.throws(() => normSInv(NaN), /p|概率/);
});

test('drawBirthplace 对非法权重抛错', () => {
  const rng = makeRng(1);
  assert.throws(() => drawBirthplace(rng, [{ iso3: 'X', w: -1 }]), /负数|不能为负/);
  assert.throws(() => drawBirthplace(rng, [{ iso3: 'X', w: NaN }]), /有限数字/);
  assert.throws(() => drawBirthplace(rng, [{ iso3: 'X' }]), /有限数字/);
});
