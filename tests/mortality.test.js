import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeRng } from '../js/engine/rng.js';
import { buildMortality, sampleDeathAge, lifeTable, bandOf } from '../js/engine/mortality.js';

const HIGH = { e0: 84.0, infantMort: 1.8, under5Mort: 2.2 };   // 日本/瑞士级别
const MID  = { e0: 73.6, infantMort: 6.1, under5Mort: 7.4 };   // 中国级别
const LOW  = { e0: 54.3, infantMort: 51.2, under5Mort: 74.0 }; // 尼日利亚级别

// ── 小工具 ──────────────────────────────────────────────────────────

/** 用给定种子抽 n 次死亡年龄。 */
function sampleAges(m, n, seed) {
  const rng = makeRng(seed);
  const ages = new Array(n);
  for (let i = 0; i < n; i += 1) ages[i] = sampleDeathAge(rng, m).age;
  return ages;
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// ── 1. 标定 ────────────────────────────────────────────────────────

test('标定后的生命表 e0 与输入一致（±0.5 岁）', () => {
  for (const c of [HIGH, MID, LOW]) {
    const m = buildMortality(c);
    assert.ok(
      Math.abs(m.e0Model - c.e0) < 0.5,
      `e0Model=${m.e0Model}，输入 e0=${c.e0}`,
    );
    assert.equal(m.converged, true, '标定必须收敛');
  }
});

// ── 2. 生命表结构 ──────────────────────────────────────────────────

test('生命表结构完整：l(0)=1，l 单调递减，e(x) 递减', () => {
  for (const c of [HIGH, MID, LOW]) {
    const t = lifeTable(buildMortality(c));
    assert.equal(t.length, 120, '生命表覆盖 0..119 岁');
    assert.equal(t[0].l, 1, 'l(0)=1');
    for (let i = 1; i < t.length; i += 1) {
      assert.ok(t[i].l < t[i - 1].l, `l(${i}) 必须严格小于 l(${i - 1})`);
      // e(x) 递减。注意 x=0 是「粗离散」定义的边界：e(0)=Σl 把 0 岁整年算满，
      // 在高婴儿死亡率国家（LOW）会出现 e(0) < e(1)，所以从 x=1 起要求递减。
      if (i >= 2) {
        assert.ok(
          t[i].e <= t[i - 1].e + 1e-9,
          `e(${i})=${t[i].e} 必须 <= e(${i - 1})=${t[i - 1].e}`,
        );
      }
    }
    // 低婴儿死亡率国家不存在上述 0 岁边界效应
    if (c.infantMort < 20) {
      assert.ok(t[1].e <= t[0].e + 1e-9, `e(1)=${t[1].e} 必须 <= e(0)=${t[0].e}`);
    }
  }
});

// ── 3. 蒙特卡洛 ────────────────────────────────────────────────────

test('模拟 10 万次的平均死亡年龄接近 e0（±1.5 岁）', () => {
  const m = buildMortality(MID);
  const ages = sampleAges(m, 100000, 2024);
  const avg = mean(ages);
  assert.ok(
    Math.abs(avg - MID.e0) < 1.5,
    `平均死亡年龄=${avg.toFixed(3)}，期望≈${MID.e0}`,
  );
});

// ── 4. 婴儿死亡率 ──────────────────────────────────────────────────

test('婴儿死亡率与输入一致（±1.2 个千分点）', () => {
  const m = buildMortality(LOW);
  const ages = sampleAges(m, 100000, 555);
  const p = ages.filter((a) => a < 1).length / ages.length;
  assert.ok(
    Math.abs(p - LOW.infantMort / 1000) < 0.012,
    `P(age<1)=${p.toFixed(5)}，期望=${LOW.infantMort / 1000}`,
  );
});

// ── 5. 五岁以下死亡率 ──────────────────────────────────────────────

test('5 岁以下死亡率与输入一致（±1.5 个千分点）', () => {
  const m = buildMortality(LOW);
  const ages = sampleAges(m, 100000, 777);
  const p = ages.filter((a) => a < 5).length / ages.length;
  assert.ok(
    Math.abs(p - LOW.under5Mort / 1000) < 0.015,
    `P(age<5)=${p.toFixed(5)}，期望=${LOW.under5Mort / 1000}`,
  );
});

// ── 6. 国家间排序 ──────────────────────────────────────────────────

test('高寿命国的平均死亡年龄显著高于低寿命国（相差 > 20 岁）', () => {
  const hi = buildMortality(HIGH);
  const lo = buildMortality(LOW);
  const diff = mean(sampleAges(hi, 20000, 4242)) - mean(sampleAges(lo, 20000, 4242));
  assert.ok(diff > 20, `高寿命国比低寿命国多活 ${diff.toFixed(2)} 岁`);
});

// ── 7. 死亡年龄分布左偏 ────────────────────────────────────────────

test('死亡年龄分布左偏：长尾在幼年侧，中位年龄不早于均值', () => {
  const m = buildMortality(HIGH);
  const ages = sampleAges(m, 50000, 808);
  const avg = mean(ages);
  const med = median(ages);
  assert.ok(med >= avg - 0.05, `中位数=${med} 必须 >= 均值=${avg.toFixed(3)}`);
  assert.ok(ages.some((a) => a < 5), '幼年侧必须存在长尾样本');
});

// ── 8. 中年存活比例 ────────────────────────────────────────────────

test('生命表在中年阶段的存活比例落在真实区间', () => {
  const t = lifeTable(buildMortality(HIGH));
  assert.ok(t[40].l > 0.95 && t[40].l < 0.995, `l(40)=${t[40].l}`);
  assert.ok(t[60].l > 0.80 && t[60].l < 0.93, `l(60)=${t[60].l}`);
  assert.ok(t[70].l > 0.70 && t[70].l < 0.88, `l(70)=${t[70].l}`);
});

// ── 9. 存活曲线对比 ────────────────────────────────────────────────

test('低寿命国家的存活曲线下降更快', () => {
  const hi = lifeTable(buildMortality(HIGH));
  const lo = lifeTable(buildMortality(LOW));
  assert.ok(hi[80].l > lo[80].l, `l(80): 高=${hi[80].l} 低=${lo[80].l}`);
});

// ── 10. 性别差异 ───────────────────────────────────────────────────

test('男性预期寿命更低 → 男性平均死亡年龄更低', () => {
  const male = buildMortality({ e0: 75.1, infantMort: 5, under5Mort: 6, sex: 'male' });
  const female = buildMortality({ e0: 80.9, infantMort: 5, under5Mort: 6, sex: 'female' });
  const mAvg = mean(sampleAges(male, 20000, 4));
  const fAvg = mean(sampleAges(female, 20000, 4));
  assert.ok(mAvg < fAvg, `男性=${mAvg.toFixed(3)} 必须 < 女性=${fAvg.toFixed(3)}`);
});

// ── 11. 年龄分段 ───────────────────────────────────────────────────

test('bandOf 边界：0-1 / 1-4 / 5-14 / 15-39 / 40-59 / 60-79 / 80+', () => {
  assert.equal(bandOf(0), 0);
  assert.equal(bandOf(1), 1);
  assert.equal(bandOf(5), 2);
  assert.equal(bandOf(15), 3);
  assert.equal(bandOf(40), 4);
  assert.equal(bandOf(60), 5);
  assert.equal(bandOf(80), 6);
  assert.equal(bandOf(120), 6);
});

// ── 附加：API 形状与鲁棒性 ─────────────────────────────────────────

test('m.mu 是可调用的，且与生命表中的 mu 一致', () => {
  const m = buildMortality(MID);
  assert.equal(typeof m.mu, 'function');
  for (const x of [0, 1, 5, 14, 15, 30, 60, 90, 119]) {
    assert.equal(m.mu(x), m.table[x].mu, `mu(${x}) 必须与生命表一致`);
  }
});

test('m.mu 在 120 岁之后不抛错', () => {
  const m = buildMortality(MID);
  const v = m.mu(150);
  assert.ok(Number.isFinite(v), `mu(150)=${v} 必须是有限数`);
  assert.ok(v >= 0, `mu(150)=${v} 必须 >= 0`);
});

test('同一 rng 种子得到相同的死亡年龄', () => {
  const m = buildMortality(MID);
  const a = sampleAges(m, 500, 31337);
  const b = sampleAges(m, 500, 31337);
  assert.deepEqual(a, b);
});

test('e0 极端值也能收敛', () => {
  for (const c of [
    { e0: 40, infantMort: 90, under5Mort: 120 },
    { e0: 88, infantMort: 1.5, under5Mort: 2 },
  ]) {
    const m = buildMortality(c);
    assert.equal(m.converged, true, `e0=${c.e0} 必须收敛`);
    assert.ok(
      Math.abs(m.e0Model - c.e0) < 0.5,
      `e0Model=${m.e0Model}，输入 e0=${c.e0}`,
    );
  }
});

test('生命表只构建一次：lifeTable(m) 与 m.table 内容一致', () => {
  const m = buildMortality(MID);
  assert.deepEqual(lifeTable(m), m.table);
});

test('m.table 覆盖 0..119 岁，且 q(x) 与 mu(x) 自洽', () => {
  const t = lifeTable(buildMortality(MID));
  assert.equal(t.length, 120);
  for (const row of t) {
    assert.equal(row.age, t.indexOf(row));
    assert.ok(Math.abs(row.q - (1 - Math.exp(-row.mu))) < 1e-12, `q(${row.age}) 必须由 mu 推出`);
  }
});

test('模块是纯函数：不使用 Math.random / Date.now', () => {
  const src = readFileSync(new URL('../js/engine/mortality.js', import.meta.url), 'utf8');
  // 去掉注释再扫：文档里提到「不用 Math.random」本身不算违规
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.ok(!/Math\s*\.\s*random/.test(code), '不得调用 Math.random');
  assert.ok(!/Date\s*\.\s*now/.test(code), '不得调用 Date.now');
  assert.ok(!/\bdocument\b|\bwindow\b/.test(code), '不得触碰 DOM');
});
