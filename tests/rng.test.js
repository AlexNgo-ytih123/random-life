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

// ── 黄金向量：钉死「种子 → 人生」的公开契约 ──────────────────────────
//
// 随机数模块存在的唯一理由就是：同一个种子必须永远对应同一条人生。
// 下面的数值是**故意写死**的：改 mulberry32 的实现、改 `>>> 0` 截断、
// 改抽取顺序，都会让这些断言失败 —— 这是我们要的（那等于悄悄作废了
// 所有已经分享出去的种子链接）。
//
// 重新生成（确有必要时）：
//   node -e "import('./js/engine/rng.js').then(({makeRng}) =>
//     console.log(JSON.stringify(Array.from({length:10}, makeRng(12345)))))"

test('黄金向量：makeRng(12345) 的前 10 个输出固定不变', () => {
  const expected = [
    0.9797282677609473, 0.3067522644996643, 0.484205421525985, 0.817934412509203,
    0.5094283693470061, 0.34747186047025025, 0.07375754183158278, 0.7663964673411101,
    0.9968264393974096, 0.8250224851071835,
  ];
  const actual = Array.from({ length: 10 }, makeRng(12345));
  assert.deepEqual(actual, expected);
});

test('黄金向量：makeRng(0) 的前 5 个输出固定不变', () => {
  const expected = [
    0.26642920868471265, 0.0003297457005828619, 0.2232720274478197, 0.1462021479383111,
    0.46732782293111086,
  ];
  const actual = Array.from({ length: 5 }, makeRng(0));
  assert.deepEqual(actual, expected);
});

test('黄金向量：makeRng("abc")（字符串种子走 FNV-1a 哈希）固定不变', () => {
  const expected = [
    0.5166419988963753, 0.6596221292857081, 0.0018796597141772509, 0.8993499737698585,
    0.7205349628347903,
  ];
  const actual = Array.from({ length: 5 }, makeRng('abc'));
  assert.deepEqual(actual, expected);
});

test('字符串种子：两个相同的字符串种子产生完全相同的序列', () => {
  const a = Array.from({ length: 30 }, makeRng('hello-world'));
  const b = Array.from({ length: 30 }, makeRng('hello-world'));
  assert.deepEqual(a, b);
});

test('字符串种子不会退化成 0 号种子', () => {
  // 旧实现里 'abc' >>> 0 === 0，所有非数字字符串都共用 0 号种子的人生
  const str = Array.from({ length: 10 }, makeRng('abc'));
  const zero = Array.from({ length: 10 }, makeRng(0));
  assert.notDeepEqual(str, zero);
});

test('不同的字符串种子产生不同的序列', () => {
  const a = Array.from({ length: 20 }, makeRng('alpha'));
  const b = Array.from({ length: 20 }, makeRng('beta'));
  assert.notDeepEqual(a, b);
});

test('makeRng 对非有限数字种子抛错（而不是静默变成 0 号种子）', () => {
  assert.throws(() => makeRng(NaN), /有限数字|字符串/);
  assert.throws(() => makeRng(Infinity), /有限数字|字符串/);
  assert.throws(() => makeRng(-Infinity), /有限数字|字符串/);
  assert.throws(() => makeRng(undefined), /有限数字|字符串/);
  assert.throws(() => makeRng(null), /有限数字|字符串/);
  assert.throws(() => makeRng({}), /有限数字|字符串/);
});

test('uniform 在区间内（上界开区间）', () => {
  const r = makeRng(9);
  for (let i = 0; i < 500; i++) {
    const v = uniform(r, 3, 8);
    assert.ok(v >= 3 && v < 8, `越界: ${v}`);
  }
});

test('uniform 拒绝非法区间', () => {
  const r = makeRng(9);
  assert.throws(() => uniform(r, 8, 3), /min/);
  assert.throws(() => uniform(r, NaN, 3), /有限数字/);
  assert.throws(() => uniform(r, 1, Infinity), /有限数字/);
  // 相等的上下界是合法的，退化成常量
  assert.equal(uniform(r, 5, 5), 5);
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

test('pick 遇到空数组抛错（而不是静默返回 undefined）', () => {
  const r = makeRng(3);
  assert.throws(() => pick(r, []), /不能为空/);
  assert.throws(() => pick(r, null), /不能为空/);
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

test('weighted 返回的是下标而不是元素', () => {
  const r = makeRng(11);
  const items = [{ w: 1 }, { w: 0 }];
  const index = weighted(r, items);
  assert.equal(typeof index, 'number');
  assert.equal(index, 0);
  assert.equal(items[index], items[0]);
});

test('weighted 对零权重项永不抽中', () => {
  const r = makeRng(5);
  for (let i = 0; i < 1000; i++) assert.equal(weighted(r, [{ w: 1 }, { w: 0 }]), 0);
});

test('weighted 只有一个候选项时返回 0', () => {
  const r = makeRng(5);
  for (let i = 0; i < 100; i++) assert.equal(weighted(r, [{ w: 3 }]), 0);
});

test('weighted 拒绝非法权重（NaN / Infinity / 负数 / 非数字）', () => {
  const r = makeRng(5);
  assert.throws(() => weighted(r, [{ w: NaN }]), /有限数字/);
  assert.throws(() => weighted(r, [{ w: Infinity }]), /有限数字/);
  assert.throws(() => weighted(r, [{ w: -Infinity }]), /有限数字/);
  assert.throws(() => weighted(r, [{ w: '5' }]), /有限数字/);
  assert.throws(() => weighted(r, [{ w: undefined }]), /有限数字/);
  assert.throws(() => weighted(r, [{}]), /有限数字/);
  assert.throws(() => weighted(r, [{ w: 10 }, { w: -5 }]), /不能为负/);
});

test('weighted 总权重为 0 时抛错', () => {
  const r = makeRng(5);
  assert.throws(() => weighted(r, [{ w: 0 }, { w: 0 }]), /总权重必须为正/);
  assert.throws(() => weighted(r, []), /不能为空/);
});

test('logNormal 中位数与尺度正确', () => {
  const r = makeRng(13);
  const xs = Array.from({ length: 20000 }, () => logNormal(r, 100, 0.5));
  xs.sort((a, b) => a - b);
  const median = xs[Math.floor(xs.length / 2)];
  assert.ok(Math.abs(median - 100) < 6, `中位数 ${median}`);
});
