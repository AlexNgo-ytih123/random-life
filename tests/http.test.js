import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { fetchText, fetchJson, parseCsv, parseCsvTable } from '../tools/lib/http.mjs';
import { filterIso3Rows, detectProjectionSplit } from '../tools/fetch-owid.mjs';

/**
 * 把 null 原型的行对象转成普通对象，便于与字面量做 deepEqual 比较
 * （assert/strict 的 deepEqual 会比较原型）。
 */
const plain = (row) => ({ ...row });

/**
 * 起一个本地 stub 服务器：
 *   /not-found → 404（不可重试）
 *   /boom     → 500（可重试）
 * 并记录收到的每个请求路径，用来断言「到底重试了几次」。
 */
async function startStubServer() {
  const hits = [];
  const server = http.createServer((req, res) => {
    hits.push(req.url);
    if (req.url === '/boom') {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('boom');
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('not found');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    base: `http://127.0.0.1:${port}`,
    hits,
    async close() {
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

test('parseCsv 处理带引号与逗号的字段', () => {
  const rows = parseCsv('a,b,c\n1,"x,y",3\n');
  assert.deepEqual(plain(rows[0]), { a: '1', b: 'x,y', c: '3' });
});

test('parseCsv 处理表头里的引号字段', () => {
  const rows = parseCsv('Entity,Code,Year,"Homicide rate per 100,000 population"\nA,B,1,2.5\n');
  assert.equal(rows[0]['Homicide rate per 100,000 population'], '2.5');
});

// ── 以下为计划文档之外的补充测试（覆盖 IMPLEMENTATION NOTES 里列出的边界） ──

test('parseCsv 处理转义引号（"" → "）', () => {
  const rows = parseCsv('a,b\n1,"he said ""hi"""\n');
  assert.deepEqual(plain(rows[0]), { a: '1', b: 'he said "hi"' });
});

test('parseCsv 处理字段内换行', () => {
  const rows = parseCsv('a,b\n1,"line1\nline2"\n2,x\n');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].b, 'line1\nline2');
  assert.deepEqual(plain(rows[1]), { a: '2', b: 'x' });
});

test('parseCsv 处理 CRLF 行尾', () => {
  const rows = parseCsv('a,b\r\n1,"x,y"\r\n2,z\r\n');
  assert.equal(rows.length, 2);
  assert.deepEqual(plain(rows[0]), { a: '1', b: 'x,y' });
  assert.deepEqual(plain(rows[1]), { a: '2', b: 'z' });
});

test('parseCsv 跳过空行', () => {
  const rows = parseCsv('a,b\n\n1,2\n\n\n3,4\n');
  assert.equal(rows.length, 2);
  assert.deepEqual(plain(rows[0]), { a: '1', b: '2' });
  assert.deepEqual(plain(rows[1]), { a: '3', b: '4' });
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

test('parseCsv 的行对象是 null 原型，__proto__ 列不会被吞掉', () => {
  const rows = parseCsv('__proto__,a\nb,1\n');
  assert.equal(Object.getPrototypeOf(rows[0]), null);
  assert.equal(rows[0].__proto__, 'b');
  assert.equal(rows[0].a, '1');
  // 没有污染全局原型
  assert.equal({}.polluted, undefined);
  assert.equal(Object.prototype.hasOwnProperty.call({}, 'a'), false);
});

test('parseCsv 的表头重名 / 空名不会丢数据', () => {
  const { columns, rows } = parseCsvTable('a,,a\n1,2,3\n');
  assert.equal(columns.length, 3);
  assert.equal(new Set(columns).size, 3, '列名必须互不相同');
  assert.equal(rows[0].a, '1');
  assert.equal(rows[0]['#1'], '2');
  assert.equal(rows[0]['a#2'], '3');
});

test('fetchJson 解析 JSON 响应', async () => {
  const data = await fetchJson('data:application/json,%7B%22ok%22%3Atrue%7D');
  assert.deepEqual(data, { ok: true });
});

test('fetchText 4xx 立即失败且不重试（本地 stub 只收到 1 次请求）', async () => {
  const stub = await startStubServer();
  const url = `${stub.base}/not-found`;
  try {
    const started = Date.now();
    await assert.rejects(
      () => fetchText(url, { retries: 2 }),
      (err) => {
        // 错误信息必须带 URL，否则线上排查无从下手
        assert.match(err.message, /not-found/);
        assert.match(err.message, /404/);
        return true;
      },
    );
    // 关键断言：4xx 只请求了一次（没有指数退避重试）
    assert.equal(stub.hits.length, 1, `实际请求了 ${stub.hits.length} 次`);
    // 3 次重试的退避是 1s+2s=3s；不重试应远小于此
    assert.ok(Date.now() - started < 3000, '4xx 不应触发指数退避重试');
  } finally {
    await stub.close();
  }
});

test('fetchText 对 5xx 会重试（本地 stub 收到 3 次请求）', async () => {
  const stub = await startStubServer();
  const url = `${stub.base}/boom`;
  try {
    await assert.rejects(
      () => fetchText(url, { retries: 2 }),
      (err) => {
        assert.match(err.message, /boom/, '错误信息必须带 URL');
        assert.match(err.message, /500/);
        return true;
      },
    );
    // retries=2 → 最多 3 次尝试
    assert.equal(stub.hits.length, 3, `实际请求了 ${stub.hits.length} 次`);
  } finally {
    await stub.close();
  }
});

test('fetchText 对真实 OWID 域名也能工作（离线时跳过）', async (t) => {
  const url = 'https://ourworldindata.org/grapher/life-expectancy.csv';
  try {
    const text = await fetchText(url, { retries: 0, timeoutMs: 20_000 });
    assert.ok(text.length > 0, '响应不应为空');
    assert.match(text.split('\n')[0], /Entity/);
  } catch (err) {
    // 只有「网络不可达」才跳过；服务器明确返回了错误状态则应当失败
    if (err?.status === null || err?.status === undefined) {
      t.skip(`网络不可用，跳过：${err.message}`);
      return;
    }
    throw err;
  }
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
});

test('detectProjectionSplit 无投影列时返回 null', () => {
  const header = ['Entity', 'Code', 'Year', 'life-expectancy'];
  const rows = [{ Entity: 'China', Code: 'CHN', Year: '2020', 'life-expectancy': '78' }];
  assert.equal(detectProjectionSplit(rows, header), null);
});
