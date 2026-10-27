import test from 'node:test';
import assert from 'node:assert/strict';
import { simulateYear } from '../js/engine/orchestrator.js';
import { buildMortality } from '../js/engine/mortality.js';
import { makeRng } from '../js/engine/rng.js';

function person() {
  return { age: 0, stats: { knowledge: 0, health: 100, relations: 50, income: 0, happiness: 60 }, flags: {}, timeline: [], family: { parentsIncome: 10000, children: 0, married: false }, country: null };
}

test('annual mortality only samples the current age, never a new lifetime from birth', () => {
  const ages = [];
  const mortality = { mu(age) { ages.push(age); return age === 40 ? 0 : 100; } };
  const result = simulateYear(person(), 40, { mortality }, () => 0.5);
  assert.equal(result.status, 'alive');
  assert.equal(result.age, 41);
  assert.deepEqual(ages, [40]);
});

test('annual mortality includes the infant year and terminates at the existing model limit', () => {
  for (const age of [0, 119]) {
    const result = simulateYear(person(), age, { mortality: { mu: () => 100 } }, () => 0.5);
    assert.equal(result.status, 'dead');
    assert.equal(result.deathAge, age);
  }
  assert.equal(simulateYear(person(), 119, { mortality: { mu: () => 0 } }, () => 0.5).status, 'dead');
});

test('complete annual simulation preserves calibrated mean lifespan and child mortality', () => {
  const mortality = buildMortality({ e0: 78, infantMort: 5, under5Mort: 10 });
  const rng = makeRng(20261023);
  const n = 5000;
  let total = 0, under5 = 0;
  for (let i = 0; i < n; i++) {
    const state = person();
    while (state.age < 120) {
      simulateYear(state, state.age, { mortality }, rng);
      if (state.status === 'dead') break;
    }
    total += state.deathAge;
    if (state.deathAge < 5) under5++;
  }
  assert.ok(Math.abs(total / n - 78) < 1, `mean lifespan ${total / n}`);
  assert.ok(Math.abs(under5 / n - 0.01) < 0.006, `under5 mortality ${under5 / n}`);
});
