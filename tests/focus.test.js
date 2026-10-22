import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeRng } from '../js/engine/rng.js';
import { FOCUSES, focusForAge, applyFocus, focusEffects } from '../js/engine/focus.js';

// ── 常量与小工具 ────────────────────────────────────────────────────

/** 五个被追踪的统计量，顺序固定（也是抖动抽样与结算的顺序）。 */
const STAT_KEYS = ['knowledge', 'health', 'relations', 'income', 'happiness'];

/** 规格表里写死的六个重点及其数值（作为契约钉死）。 */
const SPEC = {
  study: { label: '读书', minAge: 6, knowledge: 4, health: -1, relations: 0, income: 0, happiness: 1 },
  play: { label: '玩伴', minAge: 6, knowledge: 1, health: 1, relations: 4, income: 0, happiness: 3 },
  work: { label: '挣钱', minAge: 16, knowledge: 0, health: -2, relations: 0, income: 5, happiness: 0 },
  train: { label: '练身体', minAge: 6, knowledge: 0, health: 4, relations: -1, income: 0, happiness: 1 },
  skill: { label: '学门手艺', minAge: 12, knowledge: 3, health: 0, relations: 0, income: 3, happiness: 0 },
  family: { label: '陪伴家人', minAge: 6, knowledge: 0, health: 0, relations: 3, income: -1, happiness: 2 },
};

const byId = (id) => FOCUSES.find((f) => f.id === id);

/** 造一个干净的 state（stats 齐全，可覆盖个别键）。 */
function makeState(overrides = {}) {
  return {
    stats: { knowledge: 50, health: 50, relations: 50, income: 50, happiness: 50, ...overrides },
  };
}

const idsOf = (list) => list.map((f) => f.id);

// ── 1. 列表结构 ──────────────────────────────────────────────────────

test('重点列表覆盖六个方向且 id 互不相同', () => {
  assert.ok(Array.isArray(FOCUSES), 'FOCUSES 必须是数组');
  assert.ok(FOCUSES.length >= 6, `FOCUSES 至少要六个方向，实际 ${FOCUSES.length}`);
  const ids = idsOf(FOCUSES);
  assert.equal(new Set(ids).size, ids.length, `id 必须互不相同：${ids.join(', ')}`);
  for (const f of FOCUSES) {
    assert.equal(typeof f.id, 'string');
    assert.ok(f.id.length > 0, 'id 不能为空串');
    assert.equal(typeof f.label, 'string');
    assert.ok(f.label.length > 0, 'label 不能为空');
    assert.equal(typeof f.description, 'string');
    assert.ok(f.description.length > 0, 'description 不能为空');
    assert.ok(Number.isFinite(f.minAge), `minAge 必须是有限数字（${f.id}）`);
  }
});

test('每个重点都影响全部五个统计量', () => {
  for (const f of FOCUSES) {
    for (const key of STAT_KEYS) {
      const v = f.effects?.[key];
      assert.equal(typeof v, 'number', `${f.id} 的 ${key} 必须是数字（实际 ${String(v)}）`);
      assert.ok(Number.isFinite(v), `${f.id} 的 ${key} 必须是有限数字`);
    }
  }
});

test('规格表里的六个重点数值与契约一致', () => {
  for (const [id, spec] of Object.entries(SPEC)) {
    const f = byId(id);
    assert.ok(f, `缺少重点 ${id}`);
    assert.equal(f.label, spec.label, `${id} 的 label`);
    assert.equal(f.minAge, spec.minAge, `${id} 的 minAge`);
    for (const key of STAT_KEYS) {
      assert.equal(f.effects[key], spec[key], `${id} 的 ${key} 效果`);
    }
  }
});

test('FOCUSES 是冻结的只读数据（调用方改不动）', () => {
  assert.ok(Object.isFrozen(FOCUSES), 'FOCUSES 数组必须被冻结');
  for (const f of FOCUSES) {
    assert.ok(Object.isFrozen(f), `${f.id} 必须被冻结`);
    assert.ok(Object.isFrozen(f.effects), `${f.id}.effects 必须被冻结`);
  }
});

// ── 2. 重点本身的取舍 ────────────────────────────────────────────────

test('读书提高知识、略降健康', () => {
  const study = byId('study');
  assert.ok(study, '必须存在 study 重点');
  assert.ok(study.effects.knowledge > 0, '读书必须提高知识');
  assert.ok(study.effects.health <= 0, '读书必须略降（或不升）健康');
});

test('养身体提高健康', () => {
  const train = byId('train');
  assert.ok(train, '必须存在 train 重点');
  assert.ok(train.effects.health > 0, '练身体必须提高健康');
});

test('学手艺与挣钱偏向收入，陪伴家人偏向关系', () => {
  assert.ok(byId('skill').effects.income > 0, '学手艺必须提高收入系数');
  assert.ok(byId('work').effects.income > 0, '挣钱必须提高收入系数');
  assert.ok(byId('family').effects.relations > 0, '陪伴家人必须提高关系');
  assert.ok(byId('play').effects.relations > 0, '玩伴必须提高关系');
});

// ── 3. 年龄门槛 ──────────────────────────────────────────────────────

test('focusForAge(5) 返回空数组', () => {
  assert.deepEqual(focusForAge(5), [], '五岁前没有可选重点');
  assert.equal(focusForAge(5).length, 0);
  assert.deepEqual(focusForAge(0), [], '零岁没有可选重点');
});

test('未满年龄不提供某些重点', () => {
  const ten = focusForAge(10);
  assert.ok(!idsOf(ten).includes('work'), '十岁不该能挣钱');
  assert.ok(!idsOf(ten).includes('skill'), '十岁不该能学手艺');
  assert.ok(idsOf(ten).includes('study'), '十岁应该能读书');
  assert.ok(idsOf(ten).includes('play'), '十岁应该能玩伴');
  assert.ok(idsOf(ten).includes('train'), '十岁应该能练身体');
  assert.ok(idsOf(ten).includes('family'), '十岁应该能陪伴家人');

  const thirty = focusForAge(30);
  assert.ok(thirty.length >= 5, `三十岁至少五个重点，实际 ${thirty.length}`);
  for (const id of Object.keys(SPEC)) {
    assert.ok(idsOf(thirty).includes(id), `三十岁应该能选 ${id}`);
  }
});

test('focusForAge 按门槛切换，且保持声明顺序', () => {
  assert.ok(!idsOf(focusForAge(11)).includes('skill'), '十二岁前不该有 skill');
  assert.ok(idsOf(focusForAge(12)).includes('skill'), '十二岁该有 skill');
  assert.ok(!idsOf(focusForAge(15)).includes('work'), '十六岁前不该有 work');
  assert.ok(idsOf(focusForAge(16)).includes('work'), '十六岁该有 work');

  const order = idsOf(focusForAge(99));
  const declared = idsOf(FOCUSES).filter((id) => order.includes(id));
  assert.deepEqual(order, declared, '子集必须保持 FOCUSES 的声明顺序');
  assert.equal(focusForAge(99).length, FOCUSES.length, '高龄时应当全部可选');
});

// ── 4. applyFocus ────────────────────────────────────────────────────

test('applyFocus 把效果施加到状态并夹紧到 0..100', () => {
  const state = makeState({ knowledge: 98 });
  const returned = applyFocus(state, byId('study'));
  assert.equal(returned, state, '应当返回同一个 state 以便链式调用');
  assert.equal(state.stats.knowledge, 100, '98 + 4 应当被夹到 100');
  assert.equal(state.stats.health, 49, '健康应当被扣 1');
  assert.equal(state.stats.relations, 50, '关系不该变化');
  assert.equal(state.stats.income, 50, '收入不该变化');
  assert.equal(state.stats.happiness, 51, '幸福应当加 1');
});

test('applyFocus 会让所有统计量留在 0..100', () => {
  const a = makeState({ health: 99 });
  applyFocus(a, byId('train'));
  assert.ok(a.stats.health <= 100, `health=${a.stats.health} 不得 > 100`);
  assert.equal(a.stats.health, 100, '99 + 4 应当被夹到 100');

  const b = makeState({ knowledge: 0 });
  applyFocus(b, byId('study'));
  assert.ok(b.stats.knowledge >= 0, `knowledge=${b.stats.knowledge} 不得 < 0`);
  assert.equal(b.stats.knowledge, 4);

  for (const f of FOCUSES) {
    const s = makeState({ knowledge: 99, health: 99, relations: 99, income: 99, happiness: 99 });
    applyFocus(s, f);
    for (const key of STAT_KEYS) {
      assert.ok(s.stats[key] >= 0 && s.stats[key] <= 100, `${f.id} 的 ${key}=${s.stats[key]} 越界`);
    }
  }
});

test('applyFocus 缺少的统计量按 0 处理', () => {
  const state = { stats: { knowledge: 10 } };
  applyFocus(state, byId('study'));
  assert.equal(state.stats.knowledge, 14);
  assert.equal(state.stats.health, 0, '缺失的健康应当从 0 起算并被夹到 0');
  assert.ok(Number.isFinite(state.stats.income));
});

test('applyFocus(null) 不改变状态', () => {
  const state = makeState();
  const before = structuredClone(state);
  const returned = applyFocus(state, null);
  assert.equal(returned, state);
  assert.deepEqual(state, before, 'focus 为 null 时状态必须原封不动');
  assert.deepEqual(applyFocus(state, undefined), state);
  assert.deepEqual(state, before);
});

test('不传 rng 时效果是确定性的', () => {
  const a = makeState();
  const b = makeState();
  applyFocus(a, byId('study'));
  applyFocus(b, byId('study'));
  assert.deepEqual(a.stats, b.stats, '同一个起点 + 同一个重点 = 同样的结果');
  for (const f of FOCUSES) {
    const x = makeState();
    const y = makeState();
    applyFocus(x, f);
    applyFocus(y, f);
    assert.deepEqual(x.stats, y.stats, `${f.id} 必须是确定性的`);
  }
});

// ── 5. 抖动 ──────────────────────────────────────────────────────────

test('传 rng 时有抖动但符号不变', () => {
  const rng = makeRng(1);
  const study = byId('study');
  const seen = new Set();

  for (let i = 0; i < 200; i += 1) {
    // 「新状态」= 全零起点：读书后知识必然为正，健康必然不为正
    const state = makeState({ knowledge: 0, health: 0, relations: 0, income: 0, happiness: 0 });
    applyFocus(state, study, rng);
    assert.ok(state.stats.knowledge > 0, `第 ${i} 次：knowledge=${state.stats.knowledge} 必须 > 0`);
    assert.ok(state.stats.health <= 0, `第 ${i} 次：health=${state.stats.health} 必须 <= 0`);
    seen.add(state.stats.knowledge);
  }

  assert.ok(seen.size > 1, `抖动必须真的存在，实际只出现了 ${seen.size} 种取值`);

  // 抖动的原始效果同样不得改符号，也不得越出 ±15%
  const rng2 = makeRng(1);
  for (let i = 0; i < 200; i += 1) {
    const eff = focusEffects(study, rng2);
    assert.ok(eff.knowledge > 0, `第 ${i} 次：抖动后的知识效果必须 > 0`);
    assert.ok(eff.health < 0, `第 ${i} 次：抖动后的健康效果必须 < 0`);
    assert.ok(Math.abs(eff.knowledge - 4) <= 0.6 + 1e-9, `knowledge=${eff.knowledge} 超出 ±15%`);
    assert.ok(Math.abs(eff.health + 1) <= 0.15 + 1e-9, `health=${eff.health} 超出 ±15%`);
    // 零效果不该被抖动改成别的东西
    assert.equal(eff.relations, 0, '零效果必须仍是 0');
    assert.equal(eff.income, 0, '零效果必须仍是 0');
    assert.ok(Math.abs(eff.happiness - 1) <= 0.15 + 1e-9, `happiness=${eff.happiness} 超出 ±15%`);
  }
});

test('focusEffects 与 applyFocus 结果一致', () => {
  for (const f of FOCUSES) {
    const rngA = makeRng(42);
    const rngB = makeRng(42);
    const effects = focusEffects(f, rngA);

    const state = makeState();
    const before = { ...state.stats };
    applyFocus(state, f, rngB);

    for (const key of STAT_KEYS) {
      const delta = state.stats[key] - before[key];
      assert.ok(
        Math.abs(delta - effects[key]) < 1e-9,
        `${f.id} 的 ${key}：实际增量 ${delta} 与 focusEffects 的 ${effects[key]} 不一致`,
      );
    }
  }
});

test('focusEffects 不修改 focus 本身', () => {
  const f = byId('study');
  const snapshot = structuredClone(f);
  focusEffects(f, makeRng(7));
  assert.deepEqual(f, snapshot, 'focus 不得被改动');
  assert.deepEqual(f.effects, snapshot.effects);
});

test('focusEffects 不带 rng 时给出基础效果', () => {
  for (const f of FOCUSES) {
    const eff = focusEffects(f);
    for (const key of STAT_KEYS) {
      assert.equal(eff[key], f.effects[key], `${f.id} 的 ${key} 基础效果`);
    }
  }
});

// ── 6. 纯度 ──────────────────────────────────────────────────────────

test('模块是纯函数：不使用 Math.random / Date.now / DOM', () => {
  const src = readFileSync(new URL('../js/engine/focus.js', import.meta.url), 'utf8');
  // 去掉注释再扫：文档里提到「不用 Math.random」本身不算违规
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.ok(!/Math\s*\.\s*random/.test(code), '不得调用 Math.random');
  assert.ok(!/Date\s*\.\s*now/.test(code), '不得调用 Date.now');
  assert.ok(!/\bdocument\b|\bwindow\b/.test(code), '不得触碰 DOM');
});
