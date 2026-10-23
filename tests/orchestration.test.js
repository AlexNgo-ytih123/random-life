import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../js/engine/rng.js';
import { drawBirthplace, drawSex, drawFamilyIncome, drawUrban } from '../js/engine/draw.js';
import { buildMortality, sampleDeathAge } from '../js/engine/mortality.js';
import { availableDecisions, resolveDecision } from '../js/engine/decisions.js';
import { rollEvent } from '../js/engine/events.js';
import { applyFocus } from '../js/engine/focus.js';
import { advanceEducation, advanceCareer, advanceFamily, advanceHealth } from '../js/engine/stages.js';
import { simulateYear } from '../js/engine/orchestrator.js';

test('simulateYear 完整年度流程：重点 -> 轨迹 -> 事件 -> 死亡', () => {
  const rng = makeRng(42);
  const state = {
    age: 20,
    stats: { knowledge: 50, health: 50, relations: 50, income: 50, happiness: 50 },
    flags: {},
    timeline: [],
    family: { parentsIncome: 20000, children: 0, married: false },
    country: { 
      iso3: 'CHN', 
      indicators: { schooling: {value: 10}, gdpPcapPpp: {value: 15000}, urbanRate: {value: 60} } 
    },
  };
  
  // 模拟一个年度
  const result = simulateYear(state, 20, { focusId: 'study' }, rng);
  
  assert.equal(result.age, 21);
  assert.ok(result.stats.knowledge > 50, '重点 study 应提高知识');
  assert.ok(result.timeline.length > 0, '年度结束应有记录');
  assert.equal(result.status, 'alive', '20 岁不应随便死亡');
});

test('全生命周期模拟：从出生到死亡', () => {
  const rng = makeRng(123);
  const weights = [{ iso3: 'CHN', w: 1000000 }];
  const ctx = { CHN: { name: '中国', region: 'Asia' } };
  
  // 1. 出生
  const birthplace = drawBirthplace(rng, weights, ctx);
  const sex = drawSex(rng);
  const income = drawFamilyIncome(rng, { median: 10000, gini: 0.4 });
  const urban = drawUrban(rng, 0.6);
  
  let state = {
    age: 0,
    stats: { knowledge: 0, health: 100, relations: 50, income: 0, happiness: 50 },
    flags: {},
    timeline: [],
    family: { parentsIncome: income, children: 0, married: false },
    country: { ...birthplace, indicators: { schooling: {value: 9}, lifeExp: {value: 78} } },
  };
  
  const mortality = buildMortality({ 
    e0: state.country.indicators.lifeExp.value, 
    infantMort: 5, 
    under5Mort: 10 
  });
  
  // 2. 逐年推进
  while (state.age < 120) {
    // 随机选个重点
    const available = applyFocus(state, { id: 'play' }, rng); // 简化：固定选 play
    
    // 处理决策
    const decisions = availableDecisions(state.age, state);
    if (decisions.length > 0) {
      resolveDecision(state, decisions[0], decisions[0].options[0], rng);
    }
    
    // 随机事件
    const event = rollEvent(rng, state.age, state.country, new Set(), state);
    if (event) {
      if (event.effect) event.effect(state, rng);
    }
    
    // 轨迹推进
    advanceEducation(state, state.age, rng);
    advanceCareer(state, state.age, rng);
    advanceFamily(state, state.age, rng);
    advanceHealth(state, state.age, rng);
    
    // 死亡抽样
    const death = sampleDeathAge(rng, mortality);
    if (state.age >= death.age) {
      state.status = 'dead';
      state.deathAge = state.age;
      break;
    }
    
    state.age++;
  }
  
  assert.ok(state.status === 'dead', '人生必须以死亡结束');
  assert.ok(state.deathAge >= 0 && state.deathAge <= 120, '死亡年龄在合理区间');
});

test('确定性：相同种子产生相同的生命轨迹', () => {
  const simulate = (seed) => {
    const rng = makeRng(seed);
    let state = { age: 0, stats: { knowledge: 0, health: 100, relations: 50, income: 0, happiness: 50 }, flags: {}, timeline: [], family: { parentsIncome: 10000, children: 0, married: false }, country: { iso3: 'CHN', indicators: { schooling: {value: 9}, lifeExp: {value: 78} } } };
    const mortality = buildMortality({ e0: 78, infantMort: 5, under5Mort: 10 });
    while (state.age < 120) {
      applyFocus(state, { id: 'study' }, rng);
      const d = availableDecisions(state.age, state);
      if (d.length > 0) resolveDecision(state, d[0], d[0].options[0], rng);
      const e = rollEvent(rng, state.age, state.country, new Set(), state);
      if (e && e.effect) e.effect(state, rng);
      advanceEducation(state, state.age, rng);
      advanceCareer(state, state.age, rng);
      advanceFamily(state, state.age, rng);
      advanceHealth(state, state.age, rng);
      if (state.age >= sampleDeathAge(rng, mortality).age) { state.status = 'dead'; break; }
      state.age++;
    }
    return state;
  };
  
  const life1 = simulate(12345);
  const life2 = simulate(12345);
  assert.deepEqual(life1, life2);
});
