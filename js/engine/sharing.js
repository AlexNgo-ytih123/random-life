/**
 * js/engine/sharing.js
 * 分享系统：处理 URL 种子持久化与分享文案生成。
 */

import { buildShareText } from './record.js';

/**
 * 从 URL 中提取种子
 * @returns {number|null}
 */
export function getSeedFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const seed = params.get('seed');
  return seed ? parseInt(seed, 10) : null;
}

/**
 * 生成分享链接
 * @param {number} seed 
 * @returns {string}
 */
export function generateShareLink(seed) {
  const url = new URL(window.location.href);
  url.searchParams.set('seed', seed);
  return url.toString();
}

/**
 * 生成社交分享文案
 * @param {Object} state 玩家状态
 * @returns {string}
 */
export function generateSocialText(state) {
  if (!state || !state.player) return '我在《Random Life》中开启了一段人生！';
  
  const p = state.player;
  const record = {
    name: p.name,
    age: p.age,
    birthPlace: p.country?.name || '某地',
    stats: p.stats,
  };
  
  return `我在《Random Life》中出生在 ${record.birthPlace}，活到了 ${record.age} 岁。\n最终统计：知识 ${record.stats.knowledge} | 幸福 ${record.stats.happiness}\n快来试试你的全球出生索引！\n${generateShareLink(p.seed)}`;
}
