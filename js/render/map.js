/**
 * js/render/map.js
 * 世界地图渲染器：基于 data/map.json 绘制 lofi 风格的全球分布图。
 */

import { Raster } from './raster.js';

/**
 * 绘制世界地图
 * @param {HTMLCanvasElement} canvas 
 * @param {Object} mapData data/map.json 的内容
 * @param {string} highlightIso3 需要高亮的国家 ISO3
 */
export function renderWorldMap(canvas, mapData, highlightIso3 = null) {
  if (!mapData) return;

  const { land, centroids, width, height } = mapData;
  const r = new Raster(width, height);
  
  // 1. 绘制陆地轮廓
  // 颜色：浅灰蓝
  const landColor = [200, 220, 230];
  const outlineColor = [160, 180, 190];
  
  for (const ring of land) {
    for (let i = 0; i < ring.length; i++) {
      const p1 = ring[i];
      const p2 = ring[(i + 1) % ring.length];
      r.line(p1[0], p1[1], p2[0], p2[1], outlineColor);
    }
  }
  
  // 填充陆地 (简化版：用点填充或直接绘制)
  // 由于是 lofi 风格，我们仅绘制轮廓，底色由 canvas 背景提供
  
  // 2. 绘制出生点
  if (highlightIso3 && centroids[highlightIso3]) {
    const [lon, lat] = centroids[highlightIso3];
    const { scale = 2, lonOffset = 180, latTop = 90 } = mapData.projection || {};
    const cx = (lon + lonOffset) * scale;
    const cy = (latTop - lat) * scale;
    // 绘制一个发光的红点
    r.disc(cx, cy, 2, [255, 0, 0]);
    r.disc(cx, cy, 1, [255, 255, 255]);
  }
  
  // 3. 输出到 Canvas
  const ctx = canvas.getContext('2d');
  const scale = canvas.width / width;
  
  // 创建临时 canvas 实现 Nearest Neighbor 缩放
  const tmpCanvas = document.createElement('canvas');
  tmpCanvas.width = width;
  tmpCanvas.height = height;
  const tmpCtx = tmpCanvas.getContext('2d');
  const imgData = tmpCtx.createImageData(width, height);
  
  for (let i = 0; i < r.data.length; i++) {
    const color = r.data[i];
    const idx = i * 4;
    if (color) {
      imgData.data[idx] = color[0];
      imgData.data[idx + 1] = color[1];
      imgData.data[idx + 2] = color[2];
      imgData.data[idx + 3] = 255;
    } else {
      imgData.data[idx + 3] = 0;
    }
  }
  tmpCtx.putImageData(imgData, 0, 0);
  
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tmpCanvas, 0, 0, width, height, 0, 0, canvas.width, canvas.height);
}
