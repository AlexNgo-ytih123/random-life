/**
 * js/render/raster.js
 * 极简像素栅格渲染器。
 * 提供 2D 像素缓冲区的基本绘制原语，支持简单的像素描边 (Dilation Outline)。
 */

export class Raster {
  /**
   * @param {number} w 宽度
   * @param {number} h 高度
   */
  constructor(w, h) {
    this.w = w;
    this.h = h;
    // 使用扁平数组存储 [r, g, b] 或 null (透明)
    this.data = new Array(w * h).fill(null);
  }

  /**
   * 设置单个像素点
   */
  px(x, y, color) {
    x = Math.round(x);
    y = Math.round(y);
    if (x >= 0 && x < this.w && y >= 0 && y < this.h) {
      this.data[y * this.w + x] = color;
    }
  }

  /**
   * 获取单个像素点
   */
  get(x, y) {
    x = Math.round(x);
    y = Math.round(y);
    if (x >= 0 && x < this.w && y >= 0 && y < this.h) {
      return this.data[y * this.w + x];
    }
    return null;
  }

  /**
   * 绘制实心矩形
   */
  rect(x, y, w, h, color) {
    for (let i = 0; i < w; i++) {
      for (let j = 0; j < h; j++) {
        this.px(x + i, y + j, color);
      }
    }
  }

  /**
   * 绘制实心圆
   */
  disc(cx, cy, r, color) {
    const r2 = r * r;
    // 为了消除锯齿感，使用稍微宽松的圆半径判定
    const threshold = r2 + r * 0.8;
    for (let i = -Math.ceil(r); i <= Math.ceil(r); i++) {
      for (let j = -Math.ceil(r); j <= Math.ceil(r); j++) {
        if (i * i + j * j <= threshold) {
          this.px(cx + i, cy + j, color);
        }
      }
    }
  }

  /**
   * 绘制直线 (Bresenham)
   */
  line(x0, y0, x1, y1, color) {
    x0 = Math.round(x0); y0 = Math.round(y0);
    x1 = Math.round(x1); y1 = Math.round(y1);
    let dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    let dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let err = dx + dy, e2;

    while (true) {
      this.px(x0, y0, color);
      if (x0 === x1 && y0 === y1) break;
      e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  /**
   * 将另一个 Raster 绘制到此画布上
   * @param {Raster} src 源栅格
   * @param {number} x 目标 X
   * @param {number} y 目标 Y
   * @param {number[]} outlineColor 描边颜色 [r, g, b]
   */
  blit(src, x, y, outlineColor) {
    // 1. 绘制描边 (Dilated Outline)
    // 遍历源图，若某像素透明但邻居有色，则绘制描边色
    for (let sy = 0; sy < src.h; sy++) {
      for (let sx = 0; sx < src.w; sx++) {
        const color = src.get(sx, sy);
        if (!color) {
          // 检查 4-邻居
          if (src.get(sx - 1, sy) || src.get(sx + 1, sy) || src.get(sx, sy - 1) || src.get(sx, sy + 1)) {
            this.px(x + sx, y + sy, outlineColor);
          }
        }
      }
    }

    // 2. 绘制原图 (覆盖描边)
    for (let sy = 0; sy < src.h; sy++) {
      for (let sx = 0; sx < src.w; sx++) {
        const color = src.get(sx, sy);
        if (color) {
          this.px(x + sx, y + sy, color);
        }
      }
    }
  }

  /**
   * 清空画布
   */
  clear() {
    this.data.fill(null);
  }
}
