import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWorldBank, apiError, countValues } from '../tools/fetch-worldbank.mjs';

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

test('parseWorldBank 对非预期结构返回空对象', () => {
  assert.deepEqual(parseWorldBank(null), {});
  assert.deepEqual(parseWorldBank(undefined), {});
  assert.deepEqual(parseWorldBank([]), {});
  assert.deepEqual(parseWorldBank({}), {});
  assert.deepEqual(parseWorldBank({ page: 1 }), {});
  assert.deepEqual(parseWorldBank([{ page: 1 }]), {});
  assert.deepEqual(parseWorldBank([{ page: 1 }, 'not-an-array']), {});
});

test('parseWorldBank 跳过非 3 位 ISO3 与无值行', () => {
  const payload = [
    { page: 1 },
    [
      { country: { value: 'China' }, countryiso3code: 'CHN', date: '2020', value: 1 },
      { country: { value: 'Bad' }, countryiso3code: 'CH', date: '2020', value: 2 },
      { country: { value: 'World' }, countryiso3code: '', date: '2020', value: 3 },
      { country: { value: 'USA' }, countryiso3code: 'USA', date: '2020', value: null },
      { country: { value: 'USA' }, countryiso3code: 'USA', date: '2020', value: undefined },
      { country: { value: 'USA' }, countryiso3code: 'USA', date: '2020', value: NaN },
      { country: { value: 'Germany' }, countryiso3code: 'DEU', date: '2019', value: 80.5 },
    ],
  ];
  const out = parseWorldBank(payload);
  assert.deepEqual(out, { CHN: { 2020: 1 }, DEU: { 2019: 80.5 } });
});

test('parseWorldBank 年份以数字键存取', () => {
  const out = parseWorldBank([{}, [{ countryiso3code: 'CHN', date: '1990', value: 1.5 }]]);
  assert.equal(out.CHN[1990], 1.5);
  assert.deepEqual(Object.keys(out.CHN), ['1990']);
});

test('parseWorldBank 导入时不触发任何网络请求', () => {
  assert.equal(typeof parseWorldBank, 'function');
});

test('apiError 识别 API 的错误响应（HTTP 200 但 body 是 message）', () => {
  const errPayload = [
    { message: [{ id: '120', key: 'Invalid value', value: 'The provided parameter value is not valid' }] },
  ];
  assert.match(apiError(errPayload), /Invalid value/);
  assert.equal(apiError([{ page: 1 }, []]), null);
  assert.equal(apiError(null), null);
});

test('countValues 统计国家 × 年份 的有效点数', () => {
  assert.equal(countValues({ CHN: { 2022: 1, 2021: 2 }, USA: { 2020: 3 } }), 3);
  assert.equal(countValues({}), 0);
});
