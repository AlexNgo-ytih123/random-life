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
  xs.sort((a, b) => a - b);
  const median = xs[Math.floor(xs.length / 2)];
  assert.ok(Math.abs(median - 100) < 6, `中位数 ${median}`);
});
