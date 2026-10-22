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
import { fileURLToPath } from 'node:url';

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

/** 把请求路径解析成 rootDir 内的绝对文件路径；越界返回 null */
export function resolveRequestPath(rootDir, rawUrl) {
  const raw = rawPathname(rawUrl ?? '/');
  if (!raw.startsWith('/')) return null; // 必须是绝对路径形式

  let decoded;
  try {
    // 先解码再解析，这样 %2e%2e%2f 这类编码穿越也会被还原并拦下
    decoded = decodeURIComponent(raw);
  } catch {
    return null; // 非法百分号编码
  }

  if (decoded.includes('\0')) return null; // NUL 字节截断攻击

  // 去掉开头的斜杠后交给 path.resolve 归一化（它会处理 ../ 与 ..\）
  const relative = decoded.replace(/^\/+/, '');
  const resolved = path.resolve(rootDir, relative);
  if (!isInsideRoot(rootDir, resolved)) return null; // 目录穿越
  return resolved;
}

/** 处理单个 HTTP 请求 */
async function handleRequest(req, res, rootDir) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8', Allow: 'GET, HEAD' });
    res.end('405 Method Not Allowed\n');
    return;
  }

  const raw = rawPathname(req.url ?? '/');
  // decodeURIComponent 失败说明 URL 编码非法
  try {
    decodeURIComponent(raw);
  } catch {
    sendText(res, 400, '400 Bad Request');
    return;
  }

  const filePath = resolveRequestPath(rootDir, req.url ?? '/');
  if (!filePath) {
    sendText(res, 404, '404 Not Found');
    return;
  }

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
    if (!isInsideRoot(rootDir, indexPath)) {
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
 * 启动静态服务器
 * @param {{root?: string, port?: number, host?: string}} options
 * @returns {Promise<{port: number, host: string, root: string, close: () => Promise<void>}>}
 */
export async function startServer({ root = process.cwd(), port = DEFAULT_PORT, host = DEFAULT_HOST } = {}) {
  const rootDir = path.resolve(root);

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
    server.listen(port, host, () => {
      server.off('error', onError);
      resolve();
    });
  });

  const address = server.address();
  const actualPort = address && typeof address === 'object' ? address.port : port;

  return {
    port: actualPort,
    host,
    root: rootDir,
    /** 关闭服务器，返回一个在完全关闭后才 resolve 的 Promise */
    close() {
      return new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
        // 断开 keep-alive 连接，否则 close() 会一直挂着
        if (typeof server.closeIdleConnections === 'function') server.closeIdleConnections();
        if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
      });
    },
  };
}

/** CLI 入口：node tools/serve.mjs */
const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  const port = Number(process.env.PORT ?? DEFAULT_PORT);
  const host = process.env.HOST ?? DEFAULT_HOST;
  const root = process.env.ROOT ?? process.cwd();
  const server = await startServer({ root, port, host });
  console.log(`Random Life 开发服务器已启动`);
  console.log(`  地址: http://${host}:${server.port}/`);
  console.log(`  根目录: ${server.root}`);
  console.log(`按 Ctrl+C 结束。`);
}
