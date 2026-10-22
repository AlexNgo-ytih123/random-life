import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 仓库内路径工具 —— 所有构建脚本共享同一套「仓库根目录」与「CLI 入口判定」。
 *
 * 为什么需要它：
 * - 之前各工具各算各的根目录（有的相对 process.cwd()，有的相对脚本目录），
 *   从不同 cwd 运行同一个工具会写到不同的树里，产出无法复现。
 * - CLI 入口判定也有两种写法（basename 比较 vs. 完整路径比较），
 *   basename 那种在重命名后会失效，还会误伤同名的无关文件。
 *
 * 本文件放在 <repo>/tools/lib/paths.mjs，因此仓库根 = 上两级目录。
 */

/** 仓库根目录（绝对路径） */
export const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
);

/** 仓库内的 data/ 目录 */
export const DATA_DIR = path.join(REPO_ROOT, 'data');

/** 仓库内的 data/raw/ 目录（原始下载产物，通常不入库） */
export const RAW_DIR = path.join(DATA_DIR, 'raw');

/**
 * 拼出 data/raw/<sub>/ 目录（绝对路径，与 cwd 无关）。
 * @param {string} sub 子目录名，例如 'worldbank'
 */
export function rawDir(sub) {
  return path.join(RAW_DIR, sub);
}

/**
 * 判断某个模块是否被当作 CLI 直接运行。
 *
 * 用完整路径比较（而不是 basename），重命名脚本不会失效，
 * 同名的无关文件也不会被误判成入口。
 *
 * @param {string} importMetaUrl 调用方的 import.meta.url
 * @returns {boolean}
 */
export function isDirectRun(importMetaUrl) {
  const entry = process.argv[1];
  if (!entry || !importMetaUrl) return false;
  try {
    return path.resolve(entry) === fileURLToPath(importMetaUrl);
  } catch {
    return false;
  }
}
