import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../js/engine/rng.js';
import { bandOf } from '../js/engine/mortality.js';
import { CAUSE_BANDS, reweightByAge, sampleCause } from '../js/engine/causes.js';

// 死因模块的测试。
//
// data/causes.json 里是**全年龄**口径的死因结构（世界银行 SH.DTH.COMM/NCOM/INJR.ZS），
// 而玩家是在某个具体年龄段去世的 —— 一个 1 岁的孩子和一个 85 岁的老人
// 面对的是完全不同的死因分布。所以这里要验证的核心是：
//   ① 按年龄段重加权后三类的和仍然是 1（没有凭空多出或少掉概率）；
//   ② 重加权确实把死因分布往「符合年龄」的方向推；
//   ③ 抽样频率跟权重吻合，且一次抽样只消耗一个随机数（保证种子 → 人生的契约）；
//   ④ 数据缺失时明确说「不可用」，绝不编造一个死因。

/** 三个测试共用的国家死因结构（百分数，不必加总到 100）。 */
const MIX = { communicable: 20, ncd: 70, injury: 10 };

// ── 1. 归一化 ──────────────────────────────────────────────────────

test('三类死因占比归一化后和为 1', () => {
  for (let band = 0; band < CAUSE_BANDS.length; band += 1) {
    const w = reweightByAge(MIX, band);
    assert.ok(w, `band ${band} 必须给出权重`);
    const sum = w.communicable + w.ncd + w.injury;
    assert.ok(
      Math.abs(sum - 1) < 1e-9,
      `band ${band} 的三类占比之和 ${sum} 必须是 1`,
    );
    for (const key of ['communicable', 'ncd', 'injury']) {
      assert.ok(w[key] >= 0, `band ${band} 的 ${key} 不能为负`);
      assert.ok(w[key] <= 1, `band ${band} 的 ${key} 不能大于 1`);
    }
  }
});

// ── 2~3. 年龄方向正确 ──────────────────────────────────────────────

test('老年组的非传染占比高于儿童组', () => {
  const old = reweightByAge(MIX, 5);
  const young = reweightByAge(MIX, 0);
  assert.ok(old.ncd > young.ncd, `老年 ncd=${old.ncd} 必须高于儿童 ncd=${young.ncd}`);
});

test('儿童组的传染占比高于老年组', () => {
  const young = reweightByAge(MIX, 0);
  const old = reweightByAge(MIX, 5);
  assert.ok(
    young.communicable > old.communicable,
    `儿童 communicable=${young.communicable} 必须高于老年 ${old.communicable}`,
  );
});

// ── 4. 抽样频率 ────────────────────────────────────────────────────

test('死因抽样频率大致匹配权重', () => {
  const mix = { communicable: 8, ncd: 86, injury: 6 };
  const band = 3;
  const p = reweightByAge(mix, band);

  const N = 20000;
  const rng = makeRng(1234);
  const counts = { communicable: 0, ncd: 0, injury: 0 };
  for (let i = 0; i < N; i += 1) {
    const r = sampleCause(rng, mix, band);
    assert.equal(r.available, true);
    counts[r.cause] += 1;
  }

  for (const key of ['communicable', 'ncd', 'injury']) {
    const empirical = counts[key] / N;
    assert.ok(
      Math.abs(empirical - p[key]) < 0.03,
      `${key} 的经验占比 ${empirical} 与理论占比 ${p[key]} 偏差过大（counts=${JSON.stringify(counts)}）`,
    );
  }
});

// ── 5. 数据缺失 ────────────────────────────────────────────────────

test('数据缺失时返回不可用而不是编造', () => {
  const rng = makeRng(7);

  const missing = sampleCause(rng, null, 3);
  assert.equal(missing.available, false);
  assert.equal(missing.cause, null);
  assert.equal(missing.causeLabel, null);
  assert.equal(missing.share, null);
  assert.equal(missing.source, null);
  assert.equal(missing.year, null);

  const zero = sampleCause(rng, { communicable: 0, ncd: 0, injury: 0 }, 3);
  assert.equal(zero.available, false);
  assert.equal(zero.cause, null);
  assert.equal(zero.causeLabel, null);
  assert.equal(zero.share, null);

  // 字段缺失（部分键不存在）也必须被当作 0 处理，而不是 NaN
  const partial = sampleCause(rng, { ncd: 70 }, 3);
  assert.equal(partial.available, true);
  assert.equal(partial.cause, 'ncd');
});

// ── 6. 元数据回显 ──────────────────────────────────────────────────

test('死因带年龄段与口径元数据', () => {
  const rng = makeRng(11);
  const r = sampleCause(rng, MIX, 3, { year: 2019, source: 'x' });
  assert.equal(r.available, true);
  assert.equal(r.band, 3);
  assert.equal(typeof CAUSE_BANDS[3].label, 'string');
  assert.ok(CAUSE_BANDS[3].label.length > 0, '年龄段标签不能为空');
  assert.equal(r.year, 2019);
  assert.equal(r.source, 'x');
});

// ── 7. 随机数消耗 ──────────────────────────────────────────────────

test('每次抽样只消耗一个随机数', () => {
  let n = 0;
  const counting = () => {
    n += 1;
    return 0.5;
  };
  sampleCause(counting, MIX, 3);
  assert.equal(n, 1, `一次抽样必须恰好消耗 1 个随机数，实际消耗 ${n} 个`);
});

// ── 8. 确定性 ──────────────────────────────────────────────────────

test('确定性：同一种子产生完全相同的死因序列', () => {
  const draw = (seed) => {
    const rng = makeRng(seed);
    return Array.from({ length: 50 }, () => sampleCause(rng, MIX, 3).cause);
  };
  assert.deepEqual(draw(2024), draw(2024));
  assert.notDeepEqual(draw(2024), draw(2025));
});

// ── 9. band 钳制 ───────────────────────────────────────────────────

test('band 越界时钳制', () => {
  assert.deepEqual(reweightByAge(MIX, 99), reweightByAge(MIX, 6));
  assert.deepEqual(reweightByAge(MIX, -5), reweightByAge(MIX, 0));
  assert.deepEqual(reweightByAge(MIX, 99), reweightByAge(MIX, 6));
  // 越界的 band 在抽样时也必须被钳制，而不是抛错
  const rng = makeRng(3);
  const r = sampleCause(rng, MIX, 99);
  assert.equal(r.available, true);
  assert.equal(r.band, 6);
});

// ── 10. share 是百分数 ─────────────────────────────────────────────

test('share 是百分数且落在 0..100', () => {
  const rng = makeRng(99);
  for (let i = 0; i < 500; i += 1) {
    const r = sampleCause(rng, MIX, 3);
    assert.equal(typeof r.share, 'number');
    assert.ok(r.share >= 0 && r.share <= 100, `share=${r.share} 必须落在 0..100`);
    // 一位小数
    assert.equal(r.share, Math.round(r.share * 10) / 10, `share=${r.share} 必须保留一位小数`);
  }
});

// ── 11. 年龄段表 ───────────────────────────────────────────────────

test('CAUSE_BANDS 覆盖 7 段且与 mortality 的 bandOf 一致', () => {
  assert.equal(CAUSE_BANDS.length, 7);

  // 每个分段挑一个代表年龄：0 / 1 / 5 / 15 / 40 / 60 / 80
  const probes = [0, 1, 5, 15, 40, 60, 80];

  for (let i = 0; i < CAUSE_BANDS.length; i += 1) {
    const b = CAUSE_BANDS[i];
    assert.equal(typeof b.label, 'string');
    assert.ok(b.label.length > 0, `band ${i} 的标签不能为空`);
    assert.ok(Number.isFinite(b.ageMin), `band ${i} 的 ageMin 必须是有限数字`);
    assert.ok(Number.isFinite(b.ageMax), `band ${i} 的 ageMax 必须是有限数字`);
    assert.ok(b.ageMin <= b.ageMax, `band ${i} 的 ageMin 不能大于 ageMax`);

    // 代表年龄必须落在该分段的区间内
    const age = probes[i];
    assert.ok(
      age >= b.ageMin && age <= b.ageMax,
      `band ${i}（${b.label}）必须覆盖 ${age} 岁，实际区间 ${b.ageMin}~${b.ageMax}`,
    );

    // 与 mortality.bandOf 一致：分段的起始年龄必须仍然落在同一个分段里
    assert.equal(bandOf(b.ageMin), i, `band ${i} 的起始年龄 ${b.ageMin} 与 bandOf 不一致`);

    // 三个因子都必须存在且为正
    for (const key of ['communicable', 'ncd', 'injury']) {
      assert.ok(
        Number.isFinite(b.factors[key]) && b.factors[key] > 0,
        `band ${i} 的 ${key} 因子必须是正数`,
      );
    }
  }
});

// ── 附加：脏数据不得产生 NaN ───────────────────────────────────────

test('缺失或非法数值按 0 处理，不会产生 NaN', () => {
  const dirty = { communicable: NaN, ncd: 86, injury: undefined };
  const w = reweightByAge(dirty, 3);
  assert.ok(w, '部分字段缺失时仍应给出权重');
  for (const key of ['communicable', 'ncd', 'injury']) {
    assert.ok(Number.isFinite(w[key]), `${key} 不能是 NaN/Infinity`);
  }
  assert.ok(Math.abs(w.communicable + w.ncd + w.injury - 1) < 1e-9);

  // 全脏 → 不可用
  assert.equal(reweightByAge({ communicable: NaN, ncd: null, injury: 'x' }, 3), null);
  assert.equal(reweightByAge(null, 3), null);
});
