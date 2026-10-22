import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeSeries, pickLatest, median, regionOf } from '../tools/build-world-data.mjs';

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

/* ------------------------------------------------------------------ *
 * 以下为实现说明里约定的边界行为（补充测试）
 * ------------------------------------------------------------------ */

test('pickLatest 忽略非有限值与非数字年份', () => {
  assert.deepEqual(pickLatest({ 2021: null, 2020: 2 }, 1990, 2023), { value: 2, year: 2020 });
  assert.equal(pickLatest({ 2021: NaN }, 1990, 2023), null);
  assert.equal(pickLatest({}, 1990, 2023), null);
  assert.equal(pickLatest(null, 1990, 2023), null);
  assert.equal(pickLatest({ 'x': 1 }, 1990, 2023), null);
});

test('pickLatest 尊重起始年份', () => {
  assert.deepEqual(pickLatest({ 1980: 9, 2005: 4 }, 1990, 2023), { value: 4, year: 2005 });
});

test('mergeSeries 后面的序列只补空缺、不覆盖已有值', () => {
  const out = mergeSeries([{ '2000': 1, '2001': 2 }, { '2000': 99, '2002': 3 }]);
  assert.deepEqual(out, { 2000: 1, 2001: 2, 2002: 3 });
  assert.deepEqual(Object.keys(out), ['2000', '2001', '2002']);
});

test('mergeSeries 接受空数组与空对象', () => {
  assert.deepEqual(mergeSeries([]), {});
  assert.deepEqual(mergeSeries([{}]), {});
  assert.deepEqual(mergeSeries(null), {});
});

test('median 偶数个取中间两个的平均，奇数个取正中', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([10, 2]), 6);
  assert.equal(median([4]), 4);
});

test('median 空列表返回 null', () => {
  assert.equal(median([]), null);
  assert.equal(median(null), null);
});

test('regionOf 返回六大洲之一，未知代码返回 null', () => {
  const REGIONS = ['Africa', 'Asia', 'Europe', 'North America', 'South America', 'Oceania'];
  assert.ok(REGIONS.includes(regionOf('CHN')));
  assert.equal(regionOf('CHN'), 'Asia');
  assert.equal(regionOf('USA'), 'North America');
  assert.equal(regionOf('BRA'), 'South America');
  assert.equal(regionOf('DEU'), 'Europe');
  assert.equal(regionOf('EGY'), 'Africa');
  assert.equal(regionOf('AUS'), 'Oceania');
  assert.equal(regionOf('ZZZ'), null);
  assert.equal(regionOf(''), null);
  assert.equal(regionOf(null), null);
});
