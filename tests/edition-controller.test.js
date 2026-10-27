import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { browserFixture } from './helpers/edition-fixture.js';

async function start(t) {
  const url = new URL('../js/edition/app.js', import.meta.url);
  assert.ok(fs.existsSync(url), 'all imported features need a working web controller');
  const { createGameApp } = await import(url);
  const fixture = browserFixture(t);
  const app = createGameApp(fixture);
  t.after(() => app.destroy());
  assert.notEqual(await app.init(), false);
  return { app, fixture, el: id => fixture.document.getElementById(id) };
}

test('web controls preserve pending choices across saves and rerolls and expose all edition features', async t => {
  const { app, fixture, el } = await start(t);
  assert.equal(fixture.requested.filter(name => name.startsWith('data/edition/')).length, 14);
  assert.equal(el('btn-start').disabled, false);
  await app.startBirth();
  assert.equal(app.screen, 'screen-ceremony');
  assert.doesNotMatch(el('ceremony-content').innerHTML, /undefined|NaN|\[object Object\]/);
  app.context.chance = () => false; // Deterministic survival fixture; mortality is independently tested.
  await app.begin();
  assert.equal(app.screen, 'screen-game');
  await app.nextYear();
  await app.nextYear();
  assert.equal(app.state.yearsLived, 2);
  assert.equal(app.state.pendingDecision.id, 'temper');
  assert.ok(el('decision-options'));
  await app.nextYear();
  assert.equal(app.state.yearsLived, 2, 'unresolved choices cannot be skipped');
  await app.saveAndMenu();
  assert.equal(app.screen, 'screen-landing');
  const saved = fixture.storage.getItem('pilotdeck.edition.active');
  assert.ok(saved);
  await app.reroll();
  assert.equal(fixture.storage.getItem('pilotdeck.edition.active'), saved, 'a candidate birth must not replace a committed life');
  await app.resume();
  assert.equal(app.state.yearsLived, 2);
  assert.equal(app.state.pendingDecision.id, 'temper');
  app.context.chance = () => false;
  await app.chooseDecision(app.state.pendingDecision.choices[0].id);
  assert.equal(app.state.pendingDecision, null);
  assert.equal(app.state.yearsLived, 2);
  while (app.state.yearsLived < 5) await app.nextYear();
  assert.ok(app.state.pendingReflection);
  await app.chooseReflection(0);
  assert.equal(app.state.pendingReflection, null);
  await app.openLibrary('achievements');
  assert.equal(app.screen, 'screen-library');
  assert.ok(el('library-content').innerHTML.length > 100);
  await app.closeLibrary();
  await app.setLanguage('en');
  assert.equal(app.context.lang, 'en');
  assert.match(el('btn-shop').textContent, /shop/i);
  await app.setLanguage('ja');
  assert.equal(app.context.lang, 'ja');
  await app.setLanguage('zh');
  app.state.yearsLived = 16;
  app.state.stats.wealth = 10000;
  await app.openLibrary('shop');
  assert.match(el('library-content').innerHTML, /10,000/);
  const before = app.state.stats.wealth;
  assert.equal(await app.buy('dinner'), true);
  assert.equal(app.state.stats.wealth, before - 200);
  await app.closeLibrary();
  await app.setFocus('health');
  assert.equal(app.state.currentFocus, 'health');
});

test('browser controller completes a life, archives it once, and copies a matching summary', async t => {
  const { app, fixture, el } = await start(t);
  await app.startBirth();
  await app.begin();
  for (let guard = 0; guard < 250 && app.state.alive; guard++) {
    if (app.state.pendingDecision) await app.chooseDecision(app.state.pendingDecision.choices[0].id);
    else if (app.state.pendingReflection) await app.chooseReflection(0);
    else await app.nextYear();
  }
  assert.equal(app.state.alive, false);
  assert.equal(app.screen, 'screen-ending');
  assert.ok(app.state.yearsLived >= 1 && app.state.yearsLived <= 115);
  assert.doesNotMatch(el('death-record').innerHTML, /undefined|NaN|\[object Object\]/);
  const archive = JSON.parse(fixture.storage.getItem('pilotdeck.edition.pastLives'));
  assert.equal(archive.records.length, 1);
  await app.nextYear();
  assert.equal(JSON.parse(fixture.storage.getItem('pilotdeck.edition.pastLives')).records.length, 1);
  await app.copyShare();
  assert.ok(fixture.copied[0].includes(app.state.name.full));
  assert.ok(fixture.copied[0].includes(String(app.state.yearsLived)));
  await app.openLibrary('past');
  assert.ok(el('library-content').innerHTML.includes(app.state.name.full));
});

test('pending dialogs retain source random, save/menu and reflection effect controls', async t => {
  const { app, fixture, el } = await start(t);
  await app.startBirth();
  app.context.chance = () => false;
  await app.begin();
  await app.nextYear();
  await app.nextYear();
  assert.ok(el('btn-random-choice'), 'pending decisions need a visible random action');
  assert.ok(el('btn-modal-save'), 'the modal must provide a pointer-accessible save/menu action');
  await el('btn-random-choice').onclick();
  assert.equal(app.state.pendingDecision, null);
  while (app.state.yearsLived < 5) await app.nextYear();
  const reflection = app.state.pendingReflection;
  assert.ok(reflection);
  const buttons = el('decision-options').children;
  for (const [index, option] of reflection.questions.flatMap(q => q.options).entries()) {
    for (const [stat, value] of Object.entries(option.stat || {})) {
      assert.ok(buttons[index].innerHTML.includes(app.context.statName(stat)));
      assert.ok(buttons[index].innerHTML.includes(value >= 0 ? `+${value}` : String(value)), 'stat consequences must be visible before choosing');
    }
  }
  await el('btn-modal-save').onclick();
  assert.equal(app.screen, 'screen-landing');
  await app.resume();
  const keyboard = fixture.callbacks.get('keydown');
  keyboard({ key: 'r', target: fixture.document.body, preventDefault() {} });
  assert.equal(app.state.pendingReflection, null, 'R must choose a canonical random reflection option');
  keyboard({ key: 'v', target: fixture.document.body, preventDefault() {} });
  assert.equal(app.screen, 'screen-landing', 'V must save and return to the menu');
});

test('a failed initial request can be retried without reloading the page', async t => {
  const { createGameApp } = await import('../js/edition/app.js');
  const fixture = browserFixture(t);
  const realFetch = fixture.fetchImpl;
  let failing = true;
  fixture.fetchImpl = async url => failing ? { ok: false, status: 503 } : realFetch(url);
  const app = createGameApp(fixture);
  t.after(() => app.destroy());
  assert.equal(await app.init(), false);
  assert.equal(fixture.document.getElementById('btn-start').disabled, true);
  const retry = fixture.document.getElementById('btn-retry');
  assert.ok(retry);
  failing = false;
  assert.notEqual(await retry.onclick(), false);
  assert.equal(fixture.document.getElementById('btn-start').disabled, false);
});

test('automatic advancement pauses for choices and keyboard input fields do not advance a life', async t => {
  const { createGameApp } = await import('../js/edition/app.js');
  const fixture = browserFixture(t);
  let scheduled = null;
  fixture.window.setTimeout = callback => { scheduled = callback; return 7; };
  fixture.window.clearTimeout = () => { scheduled = null; };
  const app = createGameApp(fixture);
  t.after(() => app.destroy());
  await app.init();
  await app.startBirth();
  app.context.chance = () => false;
  await app.begin();
  const keydown = fixture.callbacks.get('keydown');
  keydown({ key: ' ', target: { tagName: 'INPUT' }, preventDefault() {} });
  assert.equal(app.state.yearsLived, 0);
  keydown({ key: ' ', target: fixture.document.body, preventDefault() {} });
  assert.equal(app.state.yearsLived, 1);
  assert.equal(app.toggleAuto(), true);
  const tick = scheduled;
  scheduled = null;
  tick();
  assert.equal(app.state.yearsLived, 2);
  assert.ok(app.state.pendingDecision);
  assert.equal(scheduled, null, 'auto must pause instead of choosing on behalf of the player');
});
