/**
 * js/render/sprites.js
 * 像素角色与道具矩阵定义。
 * 使用简单的 2D 数组（像素值）定义 lofi 角色。
 * 0 = 透明, 1 = 肤色(skin), 2 = 头发(hair), 3 = 衣服(clothes), 4 = 细节(detail)
 */

export const SPRITE_MAP = {
  // 人物基础矩阵 (6x12 px)
  person: {
    adult: [
      [0, 0, 2, 2, 0, 0],
      [0, 2, 2, 2, 2, 0],
      [0, 2, 1, 1, 2, 0],
      [0, 2, 1, 1, 2, 0],
      [0, 0, 2, 2, 0, 0],
      [0, 0, 3, 3, 0, 0],
      [0, 3, 3, 3, 3, 0],
      [0, 3, 3, 3, 3, 0],
      [0, 3, 3, 3, 3, 0],
      [0, 0, 3, 3, 0, 0],
      [0, 0, 4, 4, 0, 0],
      [0, 0, 4, 4, 0, 0],
    ],
    child: [
      [0, 0, 2, 2, 0, 0],
      [0, 2, 2, 2, 2, 0],
      [0, 2, 1, 1, 2, 0],
      [0, 0, 2, 2, 0, 0],
      [0, 0, 3, 3, 0, 0],
      [0, 3, 3, 3, 3, 0],
      [0, 3, 3, 3, 3, 0],
      [0, 0, 3, 3, 0, 0],
      [0, 0, 4, 4, 0, 0],
      [0, 0, 4, 4, 0, 0],
      [0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0],
    ],
  },
  // 宠物 (3x3 px)
  pet: {
    dog: [
      [0, 2, 0],
      [2, 1, 2],
      [0, 4, 0],
    ],
  },
};

/**
 * 将矩阵渲染到 Raster 上
 * @param {Raster} r 目标栅格
 * @param {number[][]} matrix 像素矩阵
 * @param {number} x 目标 X
 * @param {number} y 目标 Y
 * @param {Object} palette 颜色映射 { 1: skinColor, 2: hairColor, ... }
 */
export function drawSprite(r, matrix, x, y, palette) {
  for (let sy = 0; sy < matrix.length; sy++) {
    for (let sx = 0; sx < matrix[sy].length; sx++) {
      const val = matrix[sy][sx];
      if (val !== 0) {
        const color = palette[val] || [0, 0, 0];
        r.px(x + sx, y + sy, color);
      }
    }
  }
}

/**
 * 构建人物颜色映射
 */
export function getPersonPalette(P, { skin, hair, clothes }) {
  return {
    1: skin,
    2: hair,
    3: clothes,
    4: P.pants,
  };
}
