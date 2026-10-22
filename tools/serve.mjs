#!/usr/bin/env node
/**
 * Random Life —— 零依赖静态文件服务器
 *
 * 仅使用 Node 标准库：node:http / node:path / node:fs / node:url。
 *
 * 两种用法：
 *   1) 作为模块导入： import { startServer } from './tools/serve.mjs';
 *      const s = await startServer({ root: process.cwd(), port: 0 });
 *      // s.port / await s.close()
 *   2) 作为命令行：   node tools/serve.mjs   （默认监听 8080）
 */
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';

import { isDirectRun } from './lib/paths.mjs';

/** 扩展名 → Content-Type */
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const DEFAULT_PORT = 8080;
const DEFAULT_HOST = '127.0.0.1';

/** 根据文件扩展名推断 Content-Type，未知类型一律按二进制流返回 */
export function contentTypeFor(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

/**
 * 判断 resolved 是否位于 rootDir 之内。
 * 用 path.relative 而不是字符串 startsWith，避免 /srv/root 与 /srv/root-evil 这类前缀误判。
 */
export function isInsideRoot(rootDir, resolved) {
  if (resolved === rootDir) return true;
  const rel = path.relative(rootDir, resolved);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/** 从原始请求行里切出未经规范化的路径部分（去掉 query / hash） */
function rawPathname(rawUrl) {
  const cut = rawUrl.search(/[?#]/);
  return cut === -1 ? rawUrl : rawUrl.slice(0, cut);
}

/** 统一的纯文本错误响应 */
function sendText(res, status, message) {
  const body = `${message}\n`;
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(body);
}

/**
 * 判断解码后的相对路径里是否含有点号开头的片段（隐藏文件 / .git / .. 等）。
 * @param {string} relative 已去掉开头斜杠的相对路径
 */
function hasDotSegment(relative) {
  return relative.split(/[\\/]/).some((seg) => seg.startsWith('.'));
}

/**
 * 把一个绝对路径（已确认在 root 之内）解析成最终可服务的文件路径。
 * 目标不存在时返回 ok:true，由后续 stat 统一给出 404。
 *
 * 真实路径（解符号链接后）必须仍在 root 之内 —— 防符号链接逃逸
 * （root 里的软链指向 root 之外时，纯字面量判断会放行）。
 *
 * @param {string} rootDir
 * @param {string} absolutePath
 * @returns {Promise<{ok: true, filePath: string} | {ok: false, status: number, reason: string}>}
 */
async function resolveAbsolutePath(rootDir, absolutePath) {
  if (!isInsideRoot(rootDir, absolutePath)) {
    return { ok: false, status: 404, reason: 'outside-root' };
  }
  // 目标不存在 → 先放行，交给 stat 处理（404）
  let realTarget;
  try {
    realTarget = await fs.promises.realpath(absolutePath);
  } catch {
    return { ok: true, filePath: absolutePath };
  }
  const realRoot = await fs.promises.realpath(rootDir).catch(() => rootDir);
  if (!isInsideRoot(realRoot, realTarget)) {
    return { ok: false, status: 404, reason: 'symlink-escape' };
  }
  return { ok: true, filePath: absolutePath };
}

/**
 * 把请求路径解析成 rootDir 内的绝对文件路径。
 *
 * 解析顺序（URL 只解码一次）：
 * 1. 必须是绝对路径形式，否则 404；
 * 2. 百分号编码非法 → 400；
 * 3. 含 NUL 字节 → 400；
 * 4. 含点号开头的片段（隐藏文件 / `..`）→ 404；
 * 5. 归一化后不在 root 之内 → 404；
 * 6. 真实路径（解符号链接后）不在 root 之内 → 404。
 *
 * @param {string} rootDir
 * @param {string} rawUrl 原始请求行（可带 query / hash）
 * @returns {Promise<{ok: true, filePath: string} | {ok: false, status: number, reason: string}>}
 */
export async function resolveRequestPath(rootDir, rawUrl) {
  const raw = rawPathname(rawUrl ?? '/');
  if (!raw.startsWith('/')) {
    return { ok: false, status: 404, reason: 'not-absolute' };
  }

  let decoded;
  try {
    // 只解码这一次：解码后再归一化，%2e%2e%2f 这类编码穿越也会被还原并拦下
    decoded = decodeURIComponent(raw);
  } catch {
    return { ok: false, status: 400, reason: 'bad-encoding' };
  }

  if (decoded.includes('\0')) {
    return { ok: false, status: 400, reason: 'nul-byte' };
  }

  // 去掉开头的斜杠后交给 path.resolve 归一化（它会处理 ../ 与 ..\）
  const relative = decoded.replace(/^\/+/, '');

  // 隐藏文件 / 上级目录一律不提供
  if (hasDotSegment(relative)) {
    return { ok: false, status: 404, reason: 'dot-segment' };
  }

  const resolved = path.resolve(rootDir, relative);
  return resolveAbsolutePath(rootDir, resolved);
}

/** 处理单个 HTTP 请求 */
async function handleRequest(req, res, rootDir) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8', Allow: 'GET, HEAD' });
    res.end('405 Method Not Allowed\n');
    return;
  }

  const resolved = await resolveRequestPath(rootDir, req.url ?? '/');
  if (!resolved.ok) {
    sendText(res, resolved.status, `${resolved.status} ${resolved.status === 400 ? 'Bad Request' : 'Not Found'}`);
    return;
  }

  const filePath = resolved.filePath;

  let stat;
  try {
    stat = await fs.promises.stat(filePath);
  } catch {
    sendText(res, 404, '404 Not Found');
    return;
  }

  // 目录 → 尝试其下的 index.html；没有就 404（不暴露目录列表）
  if (stat.isDirectory()) {
    const indexPath = path.join(filePath, 'index.html');
    const indexResolved = await resolveAbsolutePath(rootDir, indexPath);
    if (!indexResolved.ok) {
      sendText(res, 404, '404 Not Found');
      return;
    }
    try {
      stat = await fs.promises.stat(indexPath);
    } catch {
      sendText(res, 404, '404 Not Found');
      return;
    }
    if (!stat.isFile()) {
      sendText(res, 404, '404 Not Found');
      return;
    }
    return sendFile(req, res, indexPath, stat);
  }

  if (!stat.isFile()) {
    sendText(res, 404, '404 Not Found');
    return;
  }
  return sendFile(req, res, filePath, stat);
}

/** 发送文件内容 */
function sendFile(req, res, filePath, stat) {
  res.writeHead(200, {
    'Content-Type': contentTypeFor(filePath),
    'Content-Length': stat.size,
    'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  const stream = fs.createReadStream(filePath);
  stream.on('error', () => {
    res.destroy();
  });
  stream.pipe(res);
}

/**
 * 校验端口号：必须是 [0, 65535] 之间的整数，否则回退到默认端口。
 * @param {unknown} raw
 * @returns {number}
 */
export function normalizePort(raw) {
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 0 || port > 65535) return DEFAULT_PORT;
  return port;
}

/**
 * 启动静态服务器
 * @param {{root?: string, port?: number, host?: string}} options
 * @returns {Promise<{port: number, host: string, root: string, close: () => Promise<void>}>}
 */
export async function startServer({ root = process.cwd(), port = DEFAULT_PORT, host = DEFAULT_HOST } = {}) {
  const rootDir = path.resolve(root);
  const listenPort = normalizePort(port);

  const server = http.createServer((req, res) => {
    handleRequest(req, res, rootDir).catch(() => {
      if (!res.headersSent) {
        sendText(res, 500, '500 Internal Server Error');
      } else {
        res.destroy();
      }
    });
  });

  await new Promise((resolve, reject) => {
    const onError = (err) => reject(err);
    server.once('error', onError);
    server.listen(listenPort, host, () => {
      server.off('error', onError);
      resolve();
    });
  });

  const address = server.address();
  const actualPort = address && typeof address === 'object' ? address.port : listenPort;

  return {
    port: actualPort,
    host,
    root: rootDir,
    /** 关闭服务器，返回一个在完全关闭后才 resolve 的 Promise */
    close() {
      return new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
        // 只断开空闲的 keep-alive 连接：closeAllConnections() 会掐断正在传输的响应，
        // 让客户端拿到被截断的文件。close() 本身会等待在途请求自然结束。
        if (typeof server.closeIdleConnections === 'function') server.closeIdleConnections();
      });
    },
  };
}

/** CLI 入口：node tools/serve.mjs */
if (isDirectRun(import.meta.url)) {
  const rawPort = process.env.PORT ?? DEFAULT_PORT;
  const port = normalizePort(rawPort);
  if (String(port) !== String(rawPort)) {
    console.error(`警告：PORT=${rawPort} 不是合法端口号，回退到 ${DEFAULT_PORT}`);
  }
  const host = process.env.HOST ?? DEFAULT_HOST;
  const root = process.env.ROOT ?? process.cwd();
  const server = await startServer({ root, port, host });
  console.log(`Random Life 开发服务器已启动`);
  console.log(`  地址: http://${host}:${server.port}/`);
  console.log(`  根目录: ${server.root}`);
  console.log(`按 Ctrl+C 结束。`);
}
