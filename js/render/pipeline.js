/**
 * js/render/pipeline.js
 * 最终渲染管线：将 Raster 缓冲区转换为 HTML5 Canvas 像素。
 */

import { pxPalette } from './palette.js';
import { pxScene } from './scene.js';
import { drawSprite } from './sprites.js';
import { SPRITE_MAP } from './sprites.js';

export function renderLifeScene(canvas, state, options = {}) {
  const ctx = canvas.getContext('2d');
  const P = pxPalette(options.dark);
  
  // 1. 构建逻辑模型
  const model = {
    stage: state.age < 13 ? 'm' : state.age < 60 ? 'd' : 'e',
    mood: (state.stats?.happiness || 50) < 35 ? 'low' : (state.stats?.happiness || 50) >= 70 ? 'high' : 'mid',
    region: state.country?.region || 'Asia',
    age: state.age,
    sex: state.sex,
  };
  
  // 2. 绘制背景场景 (192x60)
  const scene = pxScene(model, P);
  
  // 3. 叠加人物 Sprite
  const skinColor = P.skin; // 简化：暂不使用 skinForCountry
  const hairColor = P.hair;
  const clothesColor = P.me; // 默认使用 protagonist 颜色
  
  const personPalette = {
    1: rgb(skinColor),
    2: rgb(hairColor),
    3: rgb(clothesColor),
    4: rgb(P.pants),
  };
  
  const matrix = state.age < 13 ? SPRITE_MAP.person.child : SPRITE_MAP.person.adult;
  // 放置在场景中心略偏右
  scene.blit(
    { 
      w: 6, h: 12, 
      get: (sx, sy) => {
        const val = matrix[sy]?.[sx];
        return val ? personPalette[val] : null;
      } 
    }, 
    100, 48 - 12, 
    rgb(P.outline)
  );
  
  // 4. 输出到 Canvas (5x 缩放)
  const scale = 5;
  canvas.width = 192 * scale;
  canvas.height = 60 * scale;
  
  const imgData = ctx.createImageData(192, 60);
  for (let i = 0; i < scene.data.length; i++) {
    const color = scene.data[i];
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
  
  // 创建临时 canvas 以实现 Nearest Neighbor 缩放
  const tmpCanvas = document.createElement('canvas');
  tmpCanvas.width = 192;
  tmpCanvas.height = 60;
  tmpCanvas.getContext('2d').putImageData(imgData, 0, 0);
  
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tmpCanvas, 0, 0, 192, 60, 0, 0, 192 * scale, 60 * scale);
}

function rgb(hex) {
  return [1, 3, 5].map(start => parseInt(hex.slice(start, start + 2), 16));
}
