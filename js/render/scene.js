/**
 * js/render/scene.js
 * 场景构建器：利用 Raster 绘制 lofi 像素景观。
 * 包含：天空渐变、随机云层、远山/建筑、地面与道具。
 */

import { Raster } from './raster.js';
import { pxPalette, pxMix } from './palette.js';

// 场景配置
const SCENE_CONFIG = {
  W: 192,
  H: 60,
  HORIZON: 48, // 地平线高度
};

/**
 * 绘制天空背景
 * @param {Raster} r 
 * @param {Object} P 调色板
 * @param {Object} model { stage: 'm'|'d'|'e', mood: 'low'|'mid'|'high' }
 */
function drawSky(r, P, model) {
  const colors = P.sky; // [top, mid, bottom]
  const { stage, mood } = model;
  
  // 根据 stage (morning, day, evening) 简单的颜色偏移
  // 此处简化：直接使用 P.sky 的渐变
  for (let y = 0; y < SCENE_CONFIG.HORIZON; y++) {
    let color = colors[0];
    if (y > SCENE_CONFIG.HORIZON * 0.3) color = colors[1];
    if (y > SCENE_CONFIG.HORIZON * 0.6) color = colors[2];
    
    // Mood 影响：低落时向 cloudLow 混合
    if (mood === 'low') {
      color = pxMix(color, P.cloudLow, 0.4);
    }
    
    r.rect(0, y, SCENE_CONFIG.W, 1, hexToRgb(color));
  }
}

function drawGround(r, P, model) {
  const color = model.region === 'MENA' ? P.soil : P.grass;
  r.rect(0, SCENE_CONFIG.HORIZON, SCENE_CONFIG.W, SCENE_CONFIG.H - SCENE_CONFIG.HORIZON, hexToRgb(color));
}

function hexToRgb(hex) {
  if (hex.startsWith('rgb')) return JSON.parse(`[${hex.slice(4, -1)}]`);
  const bigint = parseInt(hex.slice(1), 16);
  return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
}

/**
 * 构建完整场景
 * @param {Object} model 场景状态模型
 * @param {Object} P 调色板
 * @returns {Raster} 渲染后的栅格
 */
export function pxScene(model, P) {
  const r = new Raster(SCENE_CONFIG.W, SCENE_CONFIG.H);
  
  drawSky(r, P, model);
  drawGround(r, P, model);
  
  // 简单点缀：随机云朵
  const cloudColor = hexToRgb(P.cloud);
  for (let i = 0; i < 3; i++) {
    const cx = Math.random() * SCENE_CONFIG.W;
    const cy = Math.random() * (SCENE_CONFIG.HORIZON * 0.5);
    r.disc(cx, cy, 2 + Math.random() * 3, cloudColor);
  }
  
  return r;
}
