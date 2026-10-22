import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer, contentTypeFor, isInsideRoot, resolveRequestPath, normalizePort } from '../tools/serve.mjs';

test('静态服务器能返回 index.html', async () => {
  const server = await startServer({ root: process.cwd(), port: 0 });
  const base = `http://127.0.0.1:${server.port}`;
  try {
    const home = await fetch(`${base}/`);
    assert.equal(home.status, 200);
    assert.match(await home.text(), /<html/i);

    const missing = await fetch(`${base}/nope.js`);
    assert.equal(missing.status, 404);
  } finally {
    await server.close();
  }
});

test('路径穿越：root 之外真实存在的文件也拿不到', async () => {
  // 用临时目录构造一个「root 之外确实有文件」的场景：
  // 如果服务器没有做包含性检查，这个文件是可以被读到的。
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'random-life-serve-'));
  const root = path.join(tmp, 'root');
  fs.mkdirSync(root);
  fs.writeFileSync(path.join(root, 'ok.txt'), 'inside', 'utf8');
  fs.writeFileSync(path.join(tmp, 'secret.txt'), 'top-secret', 'utf8');

  const server = await startServer({ root, port: 0 });
  const base = `http://127.0.0.1:${server.port}`;
  try {
    // 正控制：root 之内的文件必须能正常拿到（否则「全部 404」也算通过）
    const ok = await fetch(`${base}/ok.txt`);
    assert.equal(ok.status, 200);
    assert.equal(await ok.text(), 'inside');

    // 前提：目标文件真的在磁盘上，而且就在 root 的外面
    const secretPath = path.join(tmp, 'secret.txt');
    assert.ok(fs.existsSync(secretPath), '前提：secret.txt 必须真实存在');
    assert.equal(path.resolve(root, '../secret.txt'), secretPath, '前提：该路径确实越出 root');

    // %2e%2e%2f = ../
    const escaped = await fetch(`${base}/%2e%2e%2fsecret.txt`, { redirect: 'manual' });
    assert.equal(escaped.status, 404, '目录穿越必须被拒绝');
    assert.ok(!(await escaped.text()).includes('top-secret'), '不能泄露 root 之外的内容');

    // 反斜杠形式（Windows 下同样危险）
    const backslash = await fetch(`${base}/%2e%2e%5csecret.txt`, { redirect: 'manual' });
    assert.equal(backslash.status, 404, '反斜杠目录穿越必须被拒绝');
  } finally {
    await server.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('百分号编码的目录穿越与非法编码被拒绝', async () => {
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

test('隐藏文件（点号开头的片段）一律 404', async () => {
  const server = await startServer({ root: process.cwd(), port: 0 });
  const base = `http://127.0.0.1:${server.port}`;
  try {
    const gitConfig = await fetch(`${base}/.git/config`, { redirect: 'manual' });
    assert.equal(gitConfig.status, 404, '不能泄露 .git 内容');

    const nested = await fetch(`${base}/.git%2fconfig`, { redirect: 'manual' });
    assert.equal(nested.status, 404, '编码后的隐藏路径同样要拦住');
  } finally {
    await server.close();
  }
});

test('指向 root 之外的符号链接不会被服务', async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'random-life-link-'));
  const root = path.join(tmp, 'root');
  fs.mkdirSync(root);
  fs.writeFileSync(path.join(tmp, 'secret.txt'), 'top-secret', 'utf8');
  const link = path.join(root, 'link.txt');
  try {
    fs.symlinkSync(path.join(tmp, 'secret.txt'), link);
  } catch (err) {
    // Windows 上没有开发者模式 / 管理员权限时无法创建符号链接
    fs.rmSync(tmp, { recursive: true, force: true });
    t.skip(`无法创建符号链接：${err.message}`);
    return;
  }

  const server = await startServer({ root, port: 0 });
  const base = `http://127.0.0.1:${server.port}`;
  try {
    const res = await fetch(`${base}/link.txt`, { redirect: 'manual' });
    assert.equal(res.status, 404, '越界的符号链接必须被拒绝');
    assert.ok(!(await res.text()).includes('top-secret'));
  } finally {
    await server.close();
    fs.rmSync(tmp, { recursive: true, force: true });
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

// ── 安全相关的纯函数单测 ──

test('contentTypeFor 按扩展名返回 Content-Type', () => {
  assert.equal(contentTypeFor('index.html'), 'text/html; charset=utf-8');
  assert.equal(contentTypeFor('a/main.js'), 'text/javascript; charset=utf-8');
  assert.equal(contentTypeFor('a/main.mjs'), 'text/javascript; charset=utf-8');
  assert.equal(contentTypeFor('a/base.css'), 'text/css; charset=utf-8');
  assert.equal(contentTypeFor('a/data.json'), 'application/json; charset=utf-8');
  assert.equal(contentTypeFor('a/logo.PNG'), 'image/png');
  assert.equal(contentTypeFor('a/unknown.xyz'), 'application/octet-stream');
  assert.equal(contentTypeFor('no-extension'), 'application/octet-stream');
});

test('isInsideRoot 正确判断包含关系', () => {
  const root = path.resolve(path.sep === '\\' ? 'C:\\srv\\root' : '/srv/root');
  assert.equal(isInsideRoot(root, root), true);
  assert.equal(isInsideRoot(root, path.join(root, 'a', 'b.txt')), true);
  // 前缀相同但不是子目录（/srv/root-evil）
  assert.equal(isInsideRoot(root, `${root}-evil`), false);
  assert.equal(isInsideRoot(root, path.resolve(root, '..', 'other')), false);
});

test('resolveRequestPath 区分 400（编码非法）与 404（越界 / 隐藏文件）', async () => {
  const root = path.resolve(path.sep === '\\' ? 'C:\\srv\\root' : '/srv/root');

  const bad = await resolveRequestPath(root, '/%E0%A4%A');
  assert.equal(bad.ok, false);
  assert.equal(bad.status, 400);

  const outside = await resolveRequestPath(root, '/../etc/passwd');
  assert.equal(outside.ok, false);
  assert.equal(outside.status, 404);

  const dotfile = await resolveRequestPath(root, '/.git/config');
  assert.equal(dotfile.ok, false);
  assert.equal(dotfile.status, 404);

  const ok = await resolveRequestPath(root, '/a/b.txt');
  assert.equal(ok.ok, true);
  assert.equal(ok.filePath, path.join(root, 'a', 'b.txt'));
});

test('normalizePort 拒绝非法端口并回退到默认值', () => {
  assert.equal(normalizePort(8080), 8080);
  assert.equal(normalizePort('8080'), 8080);
  assert.equal(normalizePort(0), 0);
  assert.equal(normalizePort('abc'), 8080);
  assert.equal(normalizePort(NaN), 8080);
  assert.equal(normalizePort(70000), 8080);
  assert.equal(normalizePort(-1), 8080);
  assert.equal(normalizePort(80.5), 8080);
});
