import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchText, fetchJson, parseCsv } from '../tools/lib/http.mjs';
import { filterIso3Rows, detectProjectionSplit } from '../tools/fetch-owid.mjs';

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

// ── 以下为计划文档之外的补充测试（覆盖 IMPLEMENTATION NOTES 里列出的边界） ──

test('parseCsv 处理转义引号（"" → "）', () => {
  const rows = parseCsv('a,b\n1,"he said ""hi"""\n');
  assert.deepEqual(rows[0], { a: '1', b: 'he said "hi"' });
});

test('parseCsv 处理字段内换行', () => {
  const rows = parseCsv('a,b\n1,"line1\nline2"\n2,x\n');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].b, 'line1\nline2');
  assert.deepEqual(rows[1], { a: '2', b: 'x' });
});

test('parseCsv 处理 CRLF 行尾', () => {
  const rows = parseCsv('a,b\r\n1,"x,y"\r\n2,z\r\n');
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { a: '1', b: 'x,y' });
  assert.deepEqual(rows[1], { a: '2', b: 'z' });
});

test('parseCsv 跳过空行', () => {
  const rows = parseCsv('a,b\n\n1,2\n\n\n3,4\n');
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { a: '1', b: '2' });
  assert.deepEqual(rows[1], { a: '3', b: '4' });
});

test('parseCsv 只有表头时返回空数组', () => {
  assert.deepEqual(parseCsv('a,b,c\n'), []);
  assert.deepEqual(parseCsv(''), []);
});

test('parseCsv 保留所有列（含 OWID 的世界区域列）', () => {
  const rows = parseCsv(
    'Entity,Code,Year,value,World region according to OWID\nChina,CHN,2020,1.2,Asia\n',
  );
  assert.equal(rows[0]['World region according to OWID'], 'Asia');
  assert.equal(rows[0].value, '1.2');
});

test('fetchJson 解析 JSON 响应', async () => {
  const data = await fetchJson('data:application/json,%7B%22ok%22%3Atrue%7D');
  assert.deepEqual(data, { ok: true });
});

test('fetchText 4xx 立即失败（不重试）', async () => {
  const started = Date.now();
  await assert.rejects(
    () => fetchText('https://ourworldindata.org/grapher/does-not-exist-xyz-404.csv'),
    /does-not-exist-xyz-404/,
  );
  // 3 次重试的退避是 1s+2s+4s=7s；4xx 快速失败应远小于此
  assert.ok(Date.now() - started < 6000, '4xx 不应触发指数退避重试');
});

// ── fetch-owid.mjs 的纯函数 ──

test('filterIso3Rows 只保留 ISO3 有效的国家行', () => {
  const rows = [
    { Entity: 'China', Code: 'CHN', Year: '2020' },
    { Entity: 'World', Code: '', Year: '2020' },
    { Entity: 'Africa', Code: '', Year: '2020' },
    { Entity: 'Kosovo', Code: 'OWID_KOS', Year: '2020' },
    { Entity: 'Germany', Code: 'DEU', Year: '2020' },
  ];
  const kept = filterIso3Rows(rows);
  assert.deepEqual(kept.map((r) => r.Entity), ['China', 'Germany']);
});

test('detectProjectionSplit 找出实际值与投影值的分界年', () => {
  const header = ['Entity', 'Code', 'Year', 'number-of-births', 'Projected (Projected)'];
  const rows = [
    { Entity: 'China', Code: 'CHN', Year: '2023', 'number-of-births': '10', 'Projected (Projected)': '' },
    { Entity: 'China', Code: 'CHN', Year: '2024', 'number-of-births': '', 'Projected (Projected)': '9' },
    { Entity: 'China', Code: 'CHN', Year: '2025', 'number-of-births': '', 'Projected (Projected)': '9.5' },
  ];
  const split = detectProjectionSplit(rows, header);
  assert.equal(split.valueColumn, 'number-of-births');
  assert.equal(split.projectedColumn, 'Projected (Projected)');
  assert.equal(split.actualThroughYear, 2023);
  assert.equal(split.projectedFromYear, 2024);
  assert.equal(split.splitYear, 2023);
});

test('detectProjectionSplit 无投影列时返回 null', () => {
  const header = ['Entity', 'Code', 'Year', 'life-expectancy'];
  const rows = [{ Entity: 'China', Code: 'CHN', Year: '2020', 'life-expectancy': '78' }];
  assert.equal(detectProjectionSplit(rows, header), null);
});
