import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseWorldBank,
  apiError,
  countValues,
  resolveIndicator,
  indicatorUrl,
  WB_INDICATORS,
} from '../tools/fetch-worldbank.mjs';

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

test('导入 fetch-worldbank 模块不会触发任何网络请求', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (...args) => {
    calls += 1;
    throw new Error('导入阶段不应该发起网络请求');
  };
  try {
    // 带 query 的动态 import 会重新执行一次模块（绕过 ESM 缓存）
    const mod = await import(`../tools/fetch-worldbank.mjs?fresh=${Date.now()}`);
    assert.equal(typeof mod.parseWorldBank, 'function');
    assert.equal(calls, 0, '导入模块时不能调用 fetch');
  } finally {
    globalThis.fetch = originalFetch;
  }
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

test('indicatorUrl 对指标代码做百分号编码', () => {
  const url = indicatorUrl('SP.DYN.LE00.IN');
  assert.ok(url.includes('SP.DYN.LE00.IN'), '正常代码不应被改动');
  assert.ok(url.includes('per_page=20000'));
  assert.ok(url.includes('date=1990:2023'));
  // 含特殊字符的代码必须被编码
  assert.ok(!indicatorUrl('A/B?C').includes('/A/'), '代码里的 / 必须被编码');
  assert.ok(indicatorUrl('A/B?C').includes(encodeURIComponent('A/B?C')));
});

// ── C1 回归测试：空解析结果必须算「失败」，不能当成成功落盘 ──

const validPayload = [
  { page: 1, pages: 1 },
  [
    { countryiso3code: 'CHN', date: '2022', value: 78.0 },
    { countryiso3code: 'DEU', date: '2021', value: 81.0 },
  ],
];

test('resolveIndicator 正常响应返回非空序列', async () => {
  const result = await resolveIndicator(
    { key: 'lifeExp', code: 'SP.DYN.LE00.IN' },
    async () => JSON.stringify(validPayload),
    () => true,
  );
  assert.equal(result.error, null);
  assert.equal(result.code, 'SP.DYN.LE00.IN');
  assert.deepEqual(result.series, { CHN: { 2022: 78.0 }, DEU: { 2021: 81.0 } });
});

test('resolveIndicator 解析为空时返回 null（而不是空对象）', async () => {
  // 所有行都被 isCountry 过滤掉 → 解析结果为空
  const result = await resolveIndicator(
    { key: 'lifeExp', code: 'SP.DYN.LE00.IN' },
    async () => JSON.stringify(validPayload),
    () => false,
  );
  assert.equal(result.series, null, '空结果必须是 null，不能是 {}（{} 是真值，会被当成成功）');
  assert.ok(result.error instanceof Error);
  assert.match(result.error.message, /空/);
});

test('resolveIndicator 响应结构异常时返回 null', async () => {
  const result = await resolveIndicator(
    { key: 'lifeExp', code: 'SP.DYN.LE00.IN' },
    async () => JSON.stringify([{ page: 1 }]),
    () => true,
  );
  assert.equal(result.series, null);
  assert.ok(result.error instanceof Error);
});

test('resolveIndicator 遇到 API 错误响应时返回 null', async () => {
  const result = await resolveIndicator(
    { key: 'lifeExp', code: 'SP.DYN.LE00.IN' },
    async () => JSON.stringify([{ message: [{ id: '120', key: 'Invalid value', value: 'x' }] }]),
    () => true,
  );
  assert.equal(result.series, null);
  assert.match(result.error.message, /API 报错/);
});

test('resolveIndicator 主代码失败时回退到备用代码', async () => {
  const urls = [];
  const result = await resolveIndicator(
    { key: 'sexRatioBirth', code: 'SP.POP.SBRT.IN', fallback: 'SP.POP.BRTH.MF' },
    async (url) => {
      urls.push(url);
      if (url.includes('SP.POP.SBRT.IN')) {
        return JSON.stringify([{ message: [{ id: '120', key: 'Invalid value', value: 'x' }] }]);
      }
      return JSON.stringify(validPayload);
    },
    () => true,
  );
  assert.equal(result.code, 'SP.POP.BRTH.MF');
  assert.ok(result.series && Object.keys(result.series).length > 0);
  assert.equal(urls.length, 2);
});

test('resolveIndicator 遇到分页响应时拒绝落盘', async () => {
  const paged = [{ page: 1, pages: 3 }, validPayload[1]];
  const result = await resolveIndicator(
    { key: 'lifeExp', code: 'SP.DYN.LE00.IN' },
    async () => JSON.stringify(paged),
    () => true,
  );
  assert.equal(result.series, null, '被分页截断的数据不能当成完整数据');
  assert.match(result.error.message, /分页/);
});

test('WB_INDICATORS 里的每个指标都有 key 与 code', () => {
  assert.ok(WB_INDICATORS.length >= 20);
  for (const item of WB_INDICATORS) {
    assert.equal(typeof item.key, 'string');
    assert.equal(typeof item.code, 'string');
  }
});
