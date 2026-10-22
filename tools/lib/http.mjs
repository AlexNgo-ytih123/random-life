#!/usr/bin/env node
/**
 * 极简 HTTP / CSV 工具库 —— 只用 Node 22 内置能力（全局 fetch + node:fs/path/url），零第三方依赖。
 *
 * 导出：
 * - fetchText(url, opts)  带指数退避重试（1s/2s/4s）与超时的文本抓取；错误信息始终包含 URL
 * - fetchJson(url, opts)  fetchText + JSON.parse
 * - parseCsv(text)        自己实现的 RFC4180 CSV 解析器，返回「对象数组」（首行表头不计入）
 *                          行对象为 null 原型（Object.create(null)），__proto__ 等列名安全
 * - parseCsvTable(text)   同上，但额外返回表头数组
 * - toCsv(rows, columns)  把对象数组序列化回 CSV（过滤后落盘用）
 */

/** 默认 UA：礼貌抓取，便于对方识别与限流 */
const USER_AGENT = 'random-life-build/0.1 (+https://ourworldindata.org)';

/** 指数退避的基数：第 n 次重试等待 1s / 2s / 4s */
const BACKOFF_BASE_MS = 1_000;

/** 带上下文的 HTTP 错误（url/status/body 全部保留，便于排查） */
export class HttpError extends Error {
  constructor(message, { url = '', status = null, body = '', cause = null } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'HttpError';
    this.url = url;
    this.status = status;
    this.body = body;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 抓取文本。
 * - 重试：网络错误 / 超时 / 5xx / 429（退避 1s、2s、4s）
 * - 不重试：其余 4xx（404 立即失败，错误信息带 URL）
 *
 * @param {string} url
 * @param {{retries?:number, timeoutMs?:number, headers?:object}} options
 * @returns {Promise<string>}
 */
export async function fetchText(url, options = {}) {
  const {
    retries = 3,
    timeoutMs = 30_000,
    headers = {},
  } = options;

  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    let retryable = true;

    try {
      const res = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          'user-agent': USER_AGENT,
          accept: 'text/csv,application/json;q=0.9,text/plain;q=0.8,*/*;q=0.5',
          ...headers,
        },
      });

      const body = await res.text();
      if (res.ok) return body;

      // 5xx 与 429 值得重试；其余 4xx 属于「不存在 / 无权限」，立即失败
      retryable = res.status >= 500 || res.status === 429;
      lastError = new HttpError(
        `GET ${url} failed: HTTP ${res.status} ${res.statusText}`.trim(),
        { url, status: res.status, body },
      );
    } catch (err) {
      // 这里只可能是网络错误 / 超时（try 块内不抛 HttpError）—— 一律可重试
      lastError = new HttpError(`GET ${url} failed: ${err?.message ?? String(err)}`, {
        url,
        cause: err,
      });
      retryable = true;
    }

    if (!retryable) break;
    if (attempt < retries) {
      // 指数退避：1s / 2s / 4s
      await sleep(BACKOFF_BASE_MS * 2 ** attempt);
    }
  }

  throw lastError ?? new HttpError(`GET ${url} failed: unknown error`, { url });
}

/**
 * 抓取并解析 JSON。
 * @param {string} url
 * @param {object} options 透传给 fetchText
 */
export async function fetchJson(url, options = {}) {
  const text = await fetchText(url, options);
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new HttpError(`GET ${url} failed: invalid JSON (${err?.message ?? err})`, {
      url,
      body: text.slice(0, 500),
      cause: err,
    });
  }
}

/**
 * RFC4180 CSV 解析器：支持引号包裹、"" 转义引号、字段内换行、CRLF、空行跳过。
 * 返回 { columns, rows }；rows 为对象数组，首行（表头）不计入。
 *
 * 表头规范化：
 * - 空表头 → 用列号占位（`#3`），避免多个空表头互相覆盖。
 * - 重复表头 → 追加列号后缀（`name#3`），保留全部列的数据。
 * - 行对象使用 null 原型（Object.create(null)）：列名恰好是 `__proto__` /
 *   `constructor` 时不会被静默丢弃，也不会污染 Object.prototype。
 *
 * @param {string} text
 * @returns {{columns: string[], rows: object[]}}
 */
export function parseCsvTable(text) {
  if (typeof text !== 'string' || text.length === 0) return { columns: [], rows: [] };

  // 去掉 UTF-8 BOM
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  const records = [];
  let record = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  while (i < src.length) {
    const ch = src[i];

    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"'; // "" → "
          i += 2;
          continue;
        }
        inQuotes = false; // 结束引号
        i += 1;
        continue;
      }
      field += ch; // 引号内的逗号/换行都是普通字符
      i += 1;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ',') {
      record.push(field);
      field = '';
      i += 1;
      continue;
    }
    if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1; // CRLF
      record.push(field);
      field = '';
      records.push(record);
      record = [];
      i += 1;
      continue;
    }

    field += ch;
    i += 1;
  }

  // 收尾：文件末尾没有换行符时补上最后一条记录
  if (field !== '' || record.length > 0) {
    record.push(field);
    records.push(record);
  }

  // 跳过空行
  const table = records.filter((r) => !(r.length === 1 && r[0].trim() === ''));
  if (table.length === 0) return { columns: [], rows: [] };

  // 表头：去空白 → 空名/重名消歧；headerIndex 用 null 原型，__proto__ 之类的列名安全
  const headerIndex = Object.create(null);
  const columns = [];
  const rawColumns = table[0].map((name) => name.trim());
  for (let c = 0; c < rawColumns.length; c += 1) {
    let name = rawColumns[c];
    if (name === '') name = `#${c}`;
    if (name in headerIndex) name = `${name}#${c}`;
    headerIndex[name] = c;
    columns.push(name);
  }

  const rows = table.slice(1).map((cells) => {
    const obj = Object.create(null);
    for (const name of columns) {
      const c = headerIndex[name];
      obj[name] = c < cells.length ? cells[c] : '';
    }
    return obj;
  });

  return { columns, rows };
}

/**
 * 只取行（表头不计入）。空表头 → 空数组。
 * @param {string} text
 * @returns {object[]}
 */
export function parseCsv(text) {
  return parseCsvTable(text).rows;
}

const CSV_SPECIAL = /[",\r\n]/;

function csvEscape(value) {
  const s = value === null || value === undefined ? '' : String(value);
  return CSV_SPECIAL.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * 把对象数组序列化回 CSV 文本（以 \n 结尾，UTF-8）。
 * @param {object[]} rows
 * @param {string[]} [columns] 默认取第一行的键
 */
export function toCsv(rows, columns) {
  const list = Array.isArray(rows) ? rows : [];
  const cols = columns ?? (list.length > 0 ? Object.keys(list[0]) : []);
  const lines = [cols.map(csvEscape).join(',')];
  for (const row of list) {
    lines.push(cols.map((c) => csvEscape(row?.[c] ?? '')).join(','));
  }
  return `${lines.join('\n')}\n`;
}
