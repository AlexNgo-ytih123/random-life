import test from 'node:test';
import assert from 'node:assert/strict';
import { drawBirthplace } from '../js/engine/draw.js';

test('birth record contains the existing global index field without taking a second random draw', () => {
  let calls = 0;
  const birth = drawBirthplace(() => { calls++; return 0.75; }, [{ iso3: 'AAA', w: 20 }, { iso3: 'BBB', w: 80 }]);
  assert.equal(birth.iso3, 'BBB');
  assert.equal(birth.globalIndex, 75);
  assert.equal(birth.totalWorldBirths, 100);
  assert.equal(calls, 1);
});
