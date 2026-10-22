import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../tools/serve.mjs';

test('静态服务器能返回 index.html 且不穿越目录', async () => {
  const server = await startServer({ root: process.cwd(), port: 0 });
  const base = `http://127.0.0.1:${server.port}`;
  try {
    const home = await fetch(`${base}/`);
    assert.equal(home.status, 200);
    assert.match(await home.text(), /<html/i);

    const escaped = await fetch(`${base}/../../etc/passwd`, { redirect: 'manual' });
    assert.ok(escaped.status === 404 || escaped.status === 400, `实际 ${escaped.status}`);

    const missing = await fetch(`${base}/nope.js`);
    assert.equal(missing.status, 404);
  } finally {
    await server.close();
  }
});

test('百分号编码的目录穿越同样被拒绝', async () => {
  const server = await startServer({ root: process.cwd(), port: 0 });
  const base = `http://127.0.0.1:${server.port}`;
  try {
    // %2e%2e%2f = ../ ，解码后仍是越界路径
    const encoded = await fetch(`${base}/%2e%2e%2f%2e%2e%2fetc%2fpasswd`, { redirect: 'manual' });
    assert.ok(encoded.status === 404 || encoded.status === 400, `实际 ${encoded.status}`);

    // 反斜杠形式（Windows 下同样危险）
    const backslash = await fetch(`${base}/%2e%2e%5c%2e%2e%5cetc%5cpasswd`, { redirect: 'manual' });
    assert.ok(backslash.status === 404 || backslash.status === 400, `实际 ${backslash.status}`);

    // 非法百分号编码
    const malformed = await fetch(`${base}/%E0%A4%A`);
    assert.equal(malformed.status, 400);
  } finally {
    await server.close();
  }
});

test('按扩展名返回正确的 Content-Type，且目录不暴露列表', async () => {
  const server = await startServer({ root: process.cwd(), port: 0 });
  const base = `http://127.0.0.1:${server.port}`;
  try {
    const home = await fetch(`${base}/`);
    assert.match(home.headers.get('content-type') ?? '', /text\/html/);

    const script = await fetch(`${base}/js/main.js`);
    assert.equal(script.status, 200);
    assert.match(script.headers.get('content-type') ?? '', /javascript/);

    const style = await fetch(`${base}/css/base.css`);
    assert.equal(style.status, 200);
    assert.match(style.headers.get('content-type') ?? '', /text\/css/);

    // 目录没有 index.html 时必须 404，而不是列出目录
    const dir = await fetch(`${base}/js`);
    assert.equal(dir.status, 404);
  } finally {
    await server.close();
  }
});
