import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createDocument } from './helpers/dom.js';

const root = new URL('../', import.meta.url);
test('normal entry exposes the existing playable screens and every module dependency exists', () => {
  const html = readFileSync(new URL('index.html', root), 'utf8');
  for (const id of ['btn-start', 'btn-begin', 'btn-next-year', 'screen-ending']) {
    assert.ok(html.includes(`id="${id}"`), `missing game control ${id}`);
  }
  const seen = new Set();
  function visit(url) {
    assert.ok(existsSync(url), `missing module ${url.pathname}`);
    if (seen.has(url.href)) return;
    seen.add(url.href);
    const source = readFileSync(url, 'utf8');
    for (const match of source.matchAll(/from\s+['"]([.][^'"]+)['"]/g)) visit(new URL(match[1], url));
  }
  visit(new URL('js/main.js', root));
});

test('existing renderer modules can be linked and draw finite opaque scene pixels', async () => {
  const pipeline = new URL('js/render/pipeline.js', root);
  assert.ok(existsSync(pipeline), 'normal renderer filename must exist');
  await import(pipeline);
  const { pxScene } = await import(new URL('js/render/scene.js', root));
  const { pxPalette } = await import(new URL('js/render/palette.js', root));
  const scene = pxScene({ age: 20, mood: 'mid', region: 'Asia' }, pxPalette());
  assert.equal(scene.data.length, 192 * 60);
  assert.ok(scene.data.every(c => Array.isArray(c) && c.length === 3 && c.every(Number.isFinite)));
});

test('restored scene renders the existing character palette as RGB pixels', async t => {
  const old = globalThis.document;
  const document = createDocument('');
  globalThis.document = document;
  t.after(() => { if (old === undefined) delete globalThis.document; else globalThis.document = old; });
  const { renderLifeScene } = await import(new URL('js/render/pipeline.js', root));
  const canvas = document.createElement('canvas');
  renderLifeScene(canvas, { age: 20, stats: { happiness: 60 } });
  const offset = (38 * 192 + 102) * 4;
  assert.deepEqual([...canvas.lastDraw.data.slice(offset, offset + 4)], [255, 218, 185, 255]);
});

test('map marker uses the data projection for country longitude and latitude', async t => {
  const old = globalThis.document;
  const document = createDocument('');
  globalThis.document = document;
  t.after(() => { if (old === undefined) delete globalThis.document; else globalThis.document = old; });
  const { renderWorldMap } = await import(new URL('js/render/map.js', root));
  const canvas = document.createElement('canvas');
  const map = JSON.parse(readFileSync(new URL('data/map.json', root), 'utf8'));
  renderWorldMap(canvas, map, 'CHN');
  const [lon, lat] = map.centroids.CHN;
  const x = Math.round((lon + map.projection.lonOffset) * map.projection.scale);
  const y = Math.round((map.projection.latTop - lat) * map.projection.scale);
  const offset = (y * map.width + x) * 4;
  assert.deepEqual([...canvas.lastDraw.data.slice(offset, offset + 4)], [255, 255, 255, 255]);
});
