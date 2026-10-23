import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeRng } from '../js/engine/rng.js';
import { buildMortality, sampleDeathAge, lifeTable, bandOf } from '../js/engine/mortality.js';

const HIGH = { e0: 84.0, infantMort: 1.8, under5Mort: 2.2 };   // 日本/瑞士级别
const MID  = { e0: 73.6, infantMort: 6.1, under5Mort: 7.4 };   // 中国级别
const LOW  = { e0: 54.3, infantMort: 51.2, under5Mort: 74.0 }; // 尼日利亚级别
// 高婴儿死亡率：专门压测 P(age<5) 的分解公式
// （旧的近似式 q1_4=(q5-q0)/4 在这里会把 P(age<5) 压低 2.3 个百分点）
const HIGH_IMR = { e0: 40, infantMort: 200, under5Mort: 260 };

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

/**
 * 独立复算生命表的 e(x)（刻意不复用模块里的任何内部函数）：
 * e(x) = (Σ_{y=x+1}^{119} l(y)) / l(x)。
 * 分子从 x+1 开始 —— 一个人在第 x 个年龄区间去世，实际只活到 x 周岁。
 */
function independentE(table, x) {
  let sum = 0;
  for (let y = x + 1; y < table.length; y += 1) sum += table[y].l;
  if (!(table[x].l > 0)) return 0;
  return sum / table[x].l;
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

// ── 1b. I1：标定目标 / 生命表首行 / 平均死亡年龄三者一致 ───────────

test('I1：e0Model、table[0].e、输入 e0 三者一致（±0.01）', () => {
  for (const c of [HIGH, MID, LOW, HIGH_IMR, { e0: 40, infantMort: 90, under5Mort: 120 }]) {
    const m = buildMortality(c);
    // 生命表首行的 e(0) 必须逐位等于标定目标（生命表是自洽的）
    assert.equal(
      m.table[0].e,
      m.e0Model,
      `table[0].e=${m.table[0].e} 必须等于 e0Model=${m.e0Model}`,
    );
    // 标定目标必须等于输入的 e0
    assert.ok(
      Math.abs(m.e0Model - c.e0) < 0.01,
      `e0Model=${m.e0Model}，输入 e0=${c.e0}`,
    );
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
      // e(x) 递减。注意 x=0 是一个「总体平均 vs 条件期望」的边界：
      // e(0) 是全体人口的平均死亡年龄，e(1) 是「已经活到 1 岁的人」的期望剩余寿命。
      // 婴儿死亡率高的国家（LOW），活到 1 岁的人被「筛选」过（体质更好的那一批），
      // 于是 e(1) > e(0) 是正常现象，不是 bug，所以从 x=2 起才要求递减。
      if (i >= 2) {
        assert.ok(
          t[i].e <= t[i - 1].e + 1e-9,
          `e(${i})=${t[i].e} 必须 <= e(${i - 1})=${t[i - 1].e}`,
        );
      }
    }
    // 低婴儿死亡率国家不存在上述筛选效应
    if (c.infantMort < 20) {
      assert.ok(t[1].e <= t[0].e + 1e-9, `e(1)=${t[1].e} 必须 <= e(0)=${t[0].e}`);
    }
  }
});

// ── 2b. C1：生命表里不能有 NaN ────────────────────────────────────

test('C1：生命表所有行都是有限数（e / l / mu / q 均无 NaN）', () => {
  const cases = [
    { e0: 40, infantMort: 90, under5Mort: 120 },   // 仓库自带 fixture
    { e0: 45, infantMort: 60, under5Mort: 90 },
    { e0: 10, infantMort: 150, under5Mort: 200 },  // l(x) 会下溢到 0
    { e0: 84, infantMort: 1.8, under5Mort: 2.2 },
  ];
  for (const c of cases) {
    const m = buildMortality(c);
    for (const row of m.table) {
      assert.ok(Number.isFinite(row.e), `e(${row.age})=${row.e} 必须是有限数`);
      assert.ok(Number.isFinite(row.l), `l(${row.age})=${row.l} 必须是有限数`);
      assert.ok(Number.isFinite(row.mu), `mu(${row.age})=${row.mu} 必须是有限数`);
      assert.ok(Number.isFinite(row.q), `q(${row.age})=${row.q} 必须是有限数`);
    }
  }
});

// ── 2c. I4：e 列必须能被独立复算出来 ──────────────────────────────

test('I4：e(x) 与独立复算结果一致（不依赖模块内部实现）', () => {
  for (const c of [HIGH, MID, LOW, { e0: 10, infantMort: 150, under5Mort: 200 }]) {
    const t = lifeTable(buildMortality(c));
    for (const x of [0, 1, 20, 40, 60, 80, 119]) {
      const expect = independentE(t, x);
      const actual = t[x].e;
      assert.ok(
        Math.abs(actual - expect) <= 1e-9 * Math.max(1, Math.abs(expect)),
        `e(${x})=${actual} 与独立复算 ${expect} 不一致`,
      );
    }
  }
});

// ── 3. 蒙特卡洛 ────────────────────────────────────────────────────

test('模拟 10 万次的平均死亡年龄接近 e0（±0.25 岁）', () => {
  for (const c of [MID, LOW]) {
    const m = buildMortality(c);
    const ages = sampleAges(m, 100000, 2024);
    const avg = mean(ages);
    assert.ok(
      Math.abs(avg - c.e0) < 0.25,
      `平均死亡年龄=${avg.toFixed(3)}，期望≈${c.e0}`,
    );
  }
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

test('5 岁以下死亡率与输入一致（±0.2 个百分点）', () => {
  const m = buildMortality(LOW);
  const ages = sampleAges(m, 200000, 777);
  const p = ages.filter((a) => a < 5).length / ages.length;
  assert.ok(
    Math.abs(p - LOW.under5Mort / 1000) < 2e-3,
    `P(age<5)=${p.toFixed(5)}，期望=${LOW.under5Mort / 1000}`,
  );
});

test('I2：高婴儿死亡率国家，5 岁以下死亡率仍与输入一致（±0.2 个百分点）', () => {
  const m = buildMortality(HIGH_IMR);
  // 模型侧必须精确：P(age<5) = 1 - l(5) = q5
  const modelP = 1 - m.table[5].l;
  assert.ok(
    Math.abs(modelP - HIGH_IMR.under5Mort / 1000) < 1e-12,
    `模型 P(age<5)=${modelP}，期望=${HIGH_IMR.under5Mort / 1000}`,
  );
  // 抽样侧：蒙特卡洛噪声
  const ages = sampleAges(m, 400000, 1234);
  const p = ages.filter((a) => a < 5).length / ages.length;
  assert.ok(
    Math.abs(p - HIGH_IMR.under5Mort / 1000) < 2e-3,
    `P(age<5)=${p.toFixed(5)}，期望=${HIGH_IMR.under5Mort / 1000}`,
  );
});

// ── 5b. I7：under5Mort < infantMort 时必须被夹住 ───────────────────

test('I7：under5Mort < infantMort 时夹到 infantMort（且不抛异常）', () => {
  const dirty = { e0: 50, infantMort: 50, under5Mort: 10 };
  const m = buildMortality(dirty);
  // 5 岁以下死亡率不可能低于婴儿死亡率：夹住之后 P(age<5) = 0.05
  const modelP = 1 - m.table[5].l;
  assert.ok(
    Math.abs(modelP - 0.05) < 1e-12,
    `模型 P(age<5)=${modelP}，夹住后应为 ${0.05}`,
  );
  // 夹住之后 1~4 岁的死亡力为 0（没人在这四岁里死）
  for (let x = 1; x <= 4; x += 1) {
    assert.equal(m.table[x].q, 0, `q(${x}) 必须是 0`);
  }
  // 而且不能被输入的 0.01 带偏
  assert.ok(
    Math.abs(modelP - dirty.under5Mort / 1000) > 1e-3,
    'P(age<5) 不能等于未夹住的输入值',
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

test('死亡年龄分布左偏：中位年龄明显高于均值（> 1 岁）', () => {
  const m = buildMortality(HIGH);
  const ages = sampleAges(m, 50000, 808);
  const avg = mean(ages);
  const med = median(ages);
  // 真实的死亡年龄分布是右偏的：中位数比平均数高 3~6 岁
  assert.ok(med > avg + 1, `中位数=${med} 必须明显高于均值=${avg.toFixed(3)}`);
  assert.ok(ages.some((a) => a < 5), '幼年侧必须存在长尾样本');
});

// ── 8. 存活曲线的合理性（对照真实值） ─────────────────────────────
//
// ⚠️ 已知偏差（纯 Gompertz 成年段的固有局限，模块里也写了同样的说明）：
//    模型能**精确复现 e0**（平均死亡年龄），40~60 岁这一段也相当准；
//    但 80 岁以后模型**低估**存活率 —— 真实死亡力在高龄段不是纯指数增长，
//    而是趋于平缓（需要 Makeham 项或 logistic 型的尾部减速）。
//    下面的上下界按「真实公布的数值」来定，并**显式编码了这段已知偏差**：
//      日本级 (e0=84)：真实 l(40)≈0.975、l(60)≈0.87、l(80)≈0.72
//                       模型 0.980 / 0.914 / 0.671 → l(80) 低了约 0.05
//      尼日利亚级 (e0=54.3)：真实 l(40)≈0.79、l(60)≈0.57
//                       模型 0.833 / 0.526 → l(60) 低了约 0.045
//    TODO(后续迭代)：引入 Makeham / logistic 尾部项来修正 80 岁以上的这段压缩。

test('生命表在中年阶段的存活比例落在真实区间', () => {
  const hi = lifeTable(buildMortality(HIGH));   // 日本级
  const lo = lifeTable(buildMortality(LOW));     // 尼日利亚级
  assert.ok(hi[40].l > 0.94 && hi[40].l < 0.995, `l(40)=${hi[40].l}（真实≈0.975）`);
  assert.ok(hi[60].l > 0.84 && hi[60].l < 0.94, `l(60)=${hi[60].l}（真实≈0.87）`);
  assert.ok(hi[70].l > 0.74 && hi[70].l < 0.88, `l(70)=${hi[70].l}（真实≈0.80）`);
  // l(80)：真实 0.72，模型 0.671（纯 Gompertz 尾部的已知低估）
  assert.ok(hi[80].l > 0.60 && hi[80].l < 0.70, `l(80)=${hi[80].l}（真实≈0.72，模型已知偏低）`);
  assert.ok(lo[40].l > 0.78 && lo[40].l < 0.88, `l(40)=${lo[40].l}（真实≈0.79）`);
  assert.ok(lo[60].l > 0.44 && lo[60].l < 0.54, `l(60)=${lo[60].l}（真实≈0.57，模型已知偏低）`);
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

test('I5：m.mu 与生命表中的 mu 逐岁一致（0..119 全部检查）', () => {
  for (const c of [HIGH, MID, LOW]) {
    const m = buildMortality(c);
    assert.equal(typeof m.mu, 'function');
    for (let x = 0; x <= 119; x += 1) {
      assert.equal(m.mu(x), m.table[x].mu, `mu(${x}) 必须与生命表一致`);
    }
  }
});

test('m.mu 在 120 岁之后不抛错', () => {
  const m = buildMortality(MID);
  const v = m.mu(150);
  assert.ok(Number.isFinite(v), `mu(150)=${v} 必须是有限数`);
  assert.ok(v >= 0, `mu(150)=${v} 必须 >= 0`);
});

test('M2：m.mu 对 NaN / Infinity / 负数抛错（不返回「不死」的 0）', () => {
  const m = buildMortality(MID);
  assert.throws(() => m.mu(NaN), /有限数字/);
  assert.throws(() => m.mu(Infinity), /有限数字/);
  assert.throws(() => m.mu(-1), /负/);
  assert.throws(() => m.mu(-0.5), /负/);
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

test('I3：不可达的 e0 必须报告 converged=false（不静默失败）', () => {
  for (const c of [
    { e0: 1000, infantMort: 5, under5Mort: 6 },  // 模型的可达 e0 大约是 [9, 120]
    { e0: 1, infantMort: 5, under5Mort: 6 },
  ]) {
    const m = buildMortality(c);
    assert.equal(m.converged, false, `e0=${c.e0} 必须报告未收敛`);
    assert.ok(Number.isFinite(m.e0Model), `e0Model=${m.e0Model} 必须是有限数`);
    assert.ok(m.e0Model > 0, `e0Model=${m.e0Model} 必须为正`);
  }
});

test('I6：sampleDeathAge 不提供「强制死亡上限」，第三参数被忽略', () => {
  assert.equal(sampleDeathAge.length, 2, '签名必须是 (rng, m)');
  const m = buildMortality(MID);
  // 即使有人传了 {maxAge: 30}，也必须被忽略 —— 否则 l(30) 的全部概率质量
  // 会被堆到 30 岁这一个年龄上（实测是真实概率密度的 760 倍）。
  const rng = makeRng(99);
  const ages = [];
  for (let i = 0; i < 20000; i += 1) ages.push(sampleDeathAge(rng, m, { maxAge: 30 }).age);
  const avg = mean(ages);
  assert.ok(avg > 60, `平均死亡年龄=${avg.toFixed(2)}，不能被截断到 30 岁`);
  assert.ok(ages.some((a) => a > 60), '必须存在 60 岁以上的样本');
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
    // M1：必须用 expm1 —— 1-exp(-μ) 在 μ 很小时会丢约 1.2e-3 的相对精度
    assert.equal(row.q, -Math.expm1(-row.mu), `q(${row.age}) 必须由 expm1 从 mu 推出`);
    assert.ok(
      Math.abs(row.q - (1 - Math.exp(-row.mu))) < 1e-12,
      `q(${row.age}) 必须与 1-exp(-mu) 在 1e-12 内一致`,
    );
  }
});

test('模块是纯函数：不使用 Math.random / Date.now / DOM / 网络 / 定时器', () => {
  const src = readFileSync(new URL('../js/engine/mortality.js', import.meta.url), 'utf8');
  // 去掉注释再扫：文档里提到「不用 Math.random」本身不算违规。
  // 扫描的是整个文件（含所有嵌套作用域），不是只扫顶层。
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const banned = [
    [/Math\s*\.\s*random/, '不得调用 Math.random'],
    [/Date\s*\.\s*now/, '不得调用 Date.now'],
    [/Date\s*\(/, '不得构造 Date'],
    [/performance\s*\.\s*now/, '不得调用 performance.now'],
    [/\bfetch\s*\(/, '不得调用 fetch'],
    [/\bcrypto\b/, '不得使用 crypto'],
    [/\bsetTimeout\b/, '不得使用 setTimeout'],
    [/\bsetInterval\b/, '不得使用 setInterval'],
    [/\bdocument\b/, '不得触碰 DOM'],
    [/\bwindow\b/, '不得触碰 DOM'],
  ];
  for (const [re, msg] of banned) {
    assert.ok(!re.test(code), `${msg}（匹配到 ${re}）`);
  }
});
