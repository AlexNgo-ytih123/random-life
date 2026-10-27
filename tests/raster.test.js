import test from 'node:test';
import assert from 'node:assert/strict';
import { Raster } from '../js/render/raster.js';

test('Raster 基础尺寸与边界检查', () => {
  const r = new Raster(192, 60);
  assert.equal(r.w, 192);
  assert.equal(r.h, 60);
  
  // 越界绘制不应抛错
  r.rect(-10, -10, 20, 20, [255, 0, 0]);
  r.rect(180, 50, 50, 50, [255, 0, 0]);
});

test('rect 矩形绘制正确性', () => {
  const r = new Raster(10, 10);
  r.rect(2, 2, 2, 2, [255, 0, 0]);
  assert.deepEqual(r.get(2, 2), [255, 0, 0]);
  assert.deepEqual(r.get(3, 3), [255, 0, 0]);
  assert.deepEqual(r.get(1, 1), null);
  assert.deepEqual(r.get(4, 4), null);
});

test('disc 圆形绘制正确性', () => {
  const r = new Raster(10, 10);
  r.disc(5, 5, 2, [0, 255, 0]);
  assert.deepEqual(r.get(5, 5), [0, 255, 0]);
  assert.deepEqual(r.get(5, 3), [0, 255, 0]); // dist=2
  assert.deepEqual(r.get(5, 2), null); // dist=3
});

test('line 直线绘制(Bresenham)', () => {
  const r = new Raster(10, 10);
  r.line(0, 0, 9, 9, [0, 0, 255]);
  assert.deepEqual(r.get(0, 0), [0, 0, 255]);
  assert.deepEqual(r.get(9, 9), [0, 0, 255]);
  assert.deepEqual(r.get(5, 5), [0, 0, 255]);
  assert.deepEqual(r.get(0, 9), null);
});

test('blit 图像合成与描边(Outline)', () => {
  const bg = new Raster(20, 20);
  const fg = new Raster(5, 5);
  fg.rect(1, 1, 1, 1, [255, 255, 255]); // 只有中心一个点
  
  // 绘制到 bg，使用蓝色描边
  bg.blit(fg, 5, 5, [0, 0, 255]);
  
  // 中心点应为白色
  assert.deepEqual(bg.get(6, 6), [255, 255, 255]);
  // 邻居点应被描边为蓝色
  assert.deepEqual(bg.get(5, 6), [0, 0, 255]);
  assert.deepEqual(bg.get(6, 5), [0, 0, 255]);
  assert.deepEqual(bg.get(7, 6), [0, 0, 255]);
  assert.deepEqual(bg.get(6, 7), [0, 0, 255]);
});

test('clear 清空画布', () => {
  const r = new Raster(10, 10);
  r.rect(0, 0, 5, 5, [255, 0, 0]);
  r.clear();
  assert.deepEqual(r.get(0, 0), null);
});
