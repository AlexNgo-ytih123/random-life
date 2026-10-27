import test from 'node:test';
import assert from 'node:assert/strict';
import { browserFixture } from './helpers/edition-fixture.js';

// The full edition first presents a decision at age two, replacing the former
// controller's age-six fixture. This regression exercises the real main module.
test('normal browser entry binds playable controls, loads all data, and renders Chinese names', async t => {
  const fixture = browserFixture(t);
  const original = { window: globalThis.window, fetch: globalThis.fetch, localStorage: globalThis.localStorage };
  const fetchFile = fixture.fetchImpl;
  fixture.fetchImpl = async url => {
    const response = await fetchFile(url);
    if (String(url).endsWith('edition/countries.json')) {
      const countries = (await response.json()).filter(country => country.id === 'CHN');
      return { ok: true, text: async () => JSON.stringify(countries), json: async () => countries };
    }
    return response;
  };
  globalThis.window = fixture.window;
  globalThis.fetch = fixture.fetchImpl;
  globalThis.localStorage = fixture.storage;
  t.after(() => {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  });
  await import('../js/main.js');
  await fixture.callbacks.get('DOMContentLoaded')?.();
  const el = id => fixture.document.getElementById(id);
  assert.equal(el('btn-start').disabled, false);
  await el('btn-start').onclick();
  assert.match(el('ceremony-content').innerHTML, /中国/);
  assert.doesNotMatch(el('ceremony-content').innerHTML, /[\uac00-\ud7af]|undefined|NaN/);
  await el('btn-begin').onclick();
  assert.ok(el('screen-game').classList.contains('active'));
  assert.ok(el('focus-selector').children.length > 0);
  await el('btn-next-year').onclick();
  assert.ok(el('story-panel').innerHTML.length > 0);
  assert.ok(el('peers-panel').innerHTML.length > 0);
});
