import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('browser UI exposes every console gameplay screen and safely escapes narrative content', async () => {
  const url = new URL('../js/edition/ui.js', import.meta.url);
  assert.ok(fs.existsSync(url), 'console UI must have a browser adaptation');
  const { escapeHtml, word } = await import(url);
  assert.equal(escapeHtml('<img onerror="bad">'), '&lt;img onerror=&quot;bad&quot;&gt;');
  for (const language of ['en', 'ja', 'zh']) {
    const ctx = { lang: language, l: (en, ja, zh) => ({ en, ja, zh })[language] };
    for (const key of ['resume', 'past', 'achievements', 'shop', 'log', 'nextDecision', 'auto', 'save', 'reroll', 'random']) {
      assert.ok(word(ctx, key).length > 0, `UI language ${language}: ${key}`);
    }
  }
});

test('HTML keeps the pixel scene and exposes controls for the complete edition feature set', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const id of ['language-select', 'seed-input', 'btn-resume', 'btn-past', 'btn-achievements', 'btn-reroll', 'btn-next-decision', 'btn-auto', 'btn-shop', 'btn-log', 'btn-save-menu', 'story-panel', 'peers-panel', 'screen-library', 'scene-canvas']) {
    assert.ok(html.includes(`id="${id}"`), `missing feature entry ${id}`);
  }
});
