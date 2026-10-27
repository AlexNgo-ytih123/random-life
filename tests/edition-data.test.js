import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('every source data file is loaded under its runtime key without dropping multilingual records', async () => {
  const moduleUrl = new URL('../js/edition/data.js', import.meta.url);
  assert.ok(fs.existsSync(moduleUrl), 'the edition runtime loader must exist');
  const { loadEdition, DATA_FILES } = await import(moduleUrl);
  const requested = [];
  const data = await loadEdition('./data/edition/', { fetchImpl: async url => {
    requested.push(url);
    const text = fs.readFileSync(new URL(`../${url}`, import.meta.url), 'utf8');
    return { ok: true, text: async () => text };
  } });
  assert.equal(Object.keys(DATA_FILES).length, 14);
  assert.equal(requested.length, 14);
  assert.equal(new Set(requested).size, 14);
  assert.equal(data.countries.length, 172);
  assert.equal(data.events.length, 60);
  assert.equal(data.shop.length, 7);
  assert.equal(Object.keys(data.reflections).length, 5);
  for (const [key, file] of Object.entries(DATA_FILES)) {
    const original = JSON.parse(fs.readFileSync(new URL(`../vendor/powershell-edition/data/${file}`, import.meta.url), 'utf8'));
    if (key === 'names') {
      const { zh: correctedChinese, ...otherNames } = data.names;
      const { zh: originalChinese, ...originalOtherNames } = original;
      assert.deepEqual(otherNames, originalOtherNames, 'all other name clusters preserved');
      for (const kind of ['m', 'f', 's']) {
        assert.equal(correctedChinese[kind].length, originalChinese[kind].length);
        assert.ok(correctedChinese[kind].every(name => /^[\p{Script=Han}]+$/u.test(name)), 'Chinese runtime names must use Han characters');
      }
    } else assert.deepEqual(data[key], original, `all source records preserved: ${file}`);
  }
});

test('edition loader reports a failed file instead of silently starting with partial data', async () => {
  const moduleUrl = new URL('../js/edition/data.js', import.meta.url);
  assert.ok(fs.existsSync(moduleUrl));
  const { loadEdition } = await import(moduleUrl);
  await assert.rejects(loadEdition('data/edition', { fetchImpl: async () => ({ ok: false, status: 404 }) }), /countries.json.*404/);
});
