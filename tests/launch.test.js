import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

test('double-click launcher is available in the project root and uses its own directory', () => {
  const file = new URL('../启动游戏.cmd', import.meta.url);
  assert.ok(existsSync(file), 'a double-click entry must be present');
  const source = readFileSync(file, 'utf8');
  assert.match(source, /%~dp0/);
  assert.match(source, /node.*tools\\launch\.mjs/);
});

test('launcher serves the correct project on an available loopback port and opens its HTTP URL', async t => {
  const file = new URL('../tools/launch.mjs', import.meta.url);
  assert.ok(existsSync(file), 'the launcher implementation must exist');
  const { launchGame } = await import(file);
  const opened = [];
  const game = await launchGame({ openBrowser: async url => opened.push(url), log: () => {} });
  t.after(() => game.close());
  assert.equal(game.root, path.resolve(fileURLToPath(new URL('../', import.meta.url))));
  assert.match(game.url, /^http:\/\/127\.0\.0\.1:\d+\/$/);
  assert.deepEqual(opened, [game.url]);
  const response = await fetch(game.url);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /id="btn-start"/);
  for (const file of ['js/main.js', 'data/countries.json']) {
    const asset = await fetch(new URL(file, game.url));
    assert.equal(asset.status, 200);
    await asset.text();
  }
});

test('failure to open the default browser leaves a working HTTP URL and server', async t => {
  const file = new URL('../tools/launch.mjs', import.meta.url);
  assert.ok(existsSync(file), 'the launcher implementation must exist');
  const { launchGame } = await import(file);
  const messages = [];
  const game = await launchGame({ openBrowser: async () => { throw new Error('browser unavailable'); }, log: text => messages.push(text) });
  t.after(() => game.close());
  const response = await fetch(game.url);
  assert.equal(response.status, 200);
  await response.text();
  assert.ok(messages.some(message => message.includes(game.url)));
  assert.ok(messages.some(message => message.includes('browser unavailable')));
});
