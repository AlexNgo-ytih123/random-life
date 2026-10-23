// 「人生岔路口」：一次性、年龄触发的重大选择。
//
// 这份测试钉住三件事：
//   1. 数据结构（每个岔路口都有 id / 年龄 / 选项 / 效果）；
//   2. 语义（一辈子只做一次；已经做过的不会再出现）；
//   3. 纯度（不碰生死、不用 Math.random、统计量永远在 0..100）。

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeRng } from '../js/engine/rng.js';
import { DECISIONS, availableDecisions, resolveDecision } from '../js/engine/decisions.js';

// ── 常量与小工具 ────────────────────────────────────────────────────

/** 五个被追踪的统计量，顺序固定。 */
const STAT_KEYS = ['knowledge', 'health', 'relations', 'income', 'happiness'];

/** 造一个干净、指标齐全的 state。 */
function makeState(overrides = {}) {
  const base = {
    age: 20,
    stats: { knowledge: 50, health: 50, relations: 50, income: 50, happiness: 50 },
    flags: {},
    family: { parentsIncome: 20000, children: 0, married: false },
    timeline: [],
    country: {
      iso3: 'CHN',
      indicators: {
        lifeExp: { value: 77.95, year: 2023 },
        schooling: { value: 8.99, year: 2020 },
        tertiaryEnroll: { value: 74.59, year: 2023 },
        fertility: { value: 0.999, year: 2023 },
        urbanRate: { value: 65.53, year: 2023 },
        gdpPcapPpp: { value: 25200, year: 2023 },
        gini: { value: 36, year: 2022 },
        oopHealth: { value: 32.17, year: 2023 },
        doctors: { value: 3.11, year: 2022 },
        unemployment: { value: 4.67, year: 2023 },
        agriculture: { value: 21.68, year: 2025 },
      },
    },
  };
  return {
    ...base,
    ...overrides,
    stats: { ...base.stats, ...(overrides.stats || {}) },
    family: { ...base.family, ...(overrides.family || {}) },
  };
}

/** 条件尽量都能满足的 state（知识高、还没成家、已有一两个孩子）。 */
function richState(age = 20) {
  return makeState({
    age,
    stats: { knowledge: 80, relations: 60 },
    family: { parentsIncome: 20000, children: 1, married: false },
  });
}

const byId = (id) => DECISIONS.find((d) => d.id === id);
const idsOf = (list) => list.map((d) => d.id);

// ── 1. 数据结构 ──────────────────────────────────────────────────────

test('每个岔路口都有 id、年龄、选项与效果', () => {
  assert.ok(Array.isArray(DECISIONS), 'DECISIONS 必须是数组');
  assert.ok(DECISIONS.length >= 12, `至少要 12 个岔路口，实际 ${DECISIONS.length}`);

  for (const d of DECISIONS) {
    assert.equal(typeof d.id, 'string', `${d.id} 缺 id`);
    assert.ok(d.id.length > 0, 'id 不能为空串');
    assert.ok(/^[a-z0-9_]+$/.test(d.id), `${d.id} 应当是英文 snake_case`);
    assert.equal(Number.isInteger(d.age), true, `${d.id} 的 age 必须是整数`);
    assert.ok(d.age >= 0, `${d.id} 的 age 不能为负`);
    assert.equal(typeof d.title, 'string', `${d.id} 缺 title`);
    assert.ok(d.title.length > 0, `${d.id} 的 title 不能为空`);
    assert.equal(typeof d.prompt, 'string', `${d.id} 缺 prompt`);
    assert.ok(d.prompt.length > 0, `${d.id} 的 prompt 不能为空`);

    assert.ok(Array.isArray(d.options), `${d.id} 缺 options`);
    assert.ok(d.options.length >= 2 && d.options.length <= 4, `${d.id} 的选项数必须在 2..4`);

    for (const o of d.options) {
      assert.equal(typeof o.id, 'string', `${d.id} 的选项缺 id`);
      assert.ok(o.id.length > 0, `${d.id} 的选项 id 不能为空`);
      assert.equal(typeof o.label, 'string', `${d.id}/${o.id} 缺 label`);
      assert.ok(o.label.length > 0, `${d.id}/${o.id} 的 label 不能为空`);
      assert.equal(typeof o.detail, 'string', `${d.id}/${o.id} 缺 detail`);
      assert.ok(o.detail.length > 0, `${d.id}/${o.id} 的 detail 不能为空`);
      assert.equal(typeof o.apply, 'function', `${d.id}/${o.id} 缺 apply`);
    }
  }
});

test('岔路口 id 唯一', () => {
  const ids = idsOf(DECISIONS);
  assert.equal(new Set(ids).size, ids.length, `id 必须互不相同：${ids.join(', ')}`);
});

test('选项 id 在同一个岔路口内也唯一', () => {
  for (const d of DECISIONS) {
    const ids = d.options.map((o) => o.id);
    assert.equal(new Set(ids).size, ids.length, `${d.id} 的选项 id 重复`);
  }
});

// ── 2. availableDecisions ───────────────────────────────────────────

test('availableDecisions 随年龄推进逐步解锁', () => {
  assert.ok(availableDecisions(6).length >= 1, '六岁应当至少有一个岔路口');
  assert.ok(availableDecisions(30).length >= 1, '三十岁应当至少有一个岔路口');

  const seen = new Set();
  for (let age = 0; age <= 100; age += 1) {
    for (const d of availableDecisions(age, richState(age))) seen.add(d.id);
  }
  assert.ok(seen.size >= 12, `所有年龄加起来至少覆盖 12 个岔路口，实际 ${seen.size}`);
});

test('availableDecisions 只给出该年龄的岔路口，并保持声明顺序', () => {
  const list = availableDecisions(19, richState(19));
  assert.ok(list.length >= 1, '十九岁应当有岔路口');
  for (const d of list) assert.equal(d.age, 19, `${d.id} 的年龄不是 19`);

  const declared = idsOf(DECISIONS).filter((id) => list.some((d) => d.id === id));
  assert.deepEqual(idsOf(list), declared, '必须保持 DECISIONS 的声明顺序');
});

test('没有 state 时按年龄给出全部岔路口', () => {
  assert.deepEqual(availableDecisions(6, null), DECISIONS.filter((d) => d.age === 6));
  assert.deepEqual(availableDecisions(6, undefined), DECISIONS.filter((d) => d.age === 6));
  assert.deepEqual(availableDecisions(3, null), [], '三岁没有岔路口');
});

test('availableDecisions 对非法年龄返回空数组', () => {
  assert.deepEqual(availableDecisions('x', richState()), []);
  assert.deepEqual(availableDecisions(NaN, richState()), []);
  assert.deepEqual(availableDecisions(undefined, richState()), []);
});

// ── 3. resolveDecision ──────────────────────────────────────────────

test('resolveDecision 施加选项效果并返回状态', () => {
  const state = makeState({ age: 6 });
  const dec = byId('school_entry');
  const option = dec.options[0];
  const before = { ...state.stats };

  const out = resolveDecision(state, dec, option, makeRng(7));

  assert.ok(out, '必须返回状态');
  assert.equal(state.flags.school_entry, option.id, '应当把选择记进 state.flags');
  assert.equal(out.flags.school_entry, option.id, '返回的状态里也应当记着这次选择');
  assert.equal(state.timeline.length, 1, '时间线应当多出一条');
  assert.equal(state.timeline[0].age, 6, '时间线条目应当带上年龄');
  assert.equal(typeof state.timeline[0].text, 'string', '时间线条目应当有中文文案');
  assert.ok(state.timeline[0].text.length > 0);
  assert.notDeepEqual(state.stats, before, '选项的效果必须真的作用到统计量上');
});

test('已做过的岔路口不重复出现', () => {
  const state = makeState({ age: 6 });
  const dec = byId('school_entry');
  resolveDecision(state, dec, dec.options[0], makeRng(1));

  const after = availableDecisions(6, state);
  assert.ok(!after.some((d) => d.id === 'school_entry'), '做过的岔路口不该再出现');
  assert.ok(after.length === 0 || !idsOf(after).includes('school_entry'));
});

test('每个决策都能被解析而不抛错', () => {
  for (const d of DECISIONS) {
    for (const o of d.options) {
      const state = richState(d.age);
      const out = resolveDecision(state, d, o, makeRng(11));
      assert.equal(state.flags[d.id], o.id, `${d.id}/${o.id} 没有记录选择`);
      assert.equal(state.timeline.length, 1, `${d.id}/${o.id} 时间线不对`);
      assert.ok(out, `${d.id}/${o.id} 必须返回状态`);
    }
  }
});

test('resolveDecision 拒绝非法参数', () => {
  const dec = byId('school_entry');
  const state = makeState({ age: 6 });

  assert.throws(() => resolveDecision(state, dec, { id: 'nope', label: '假的', apply() {} }, makeRng(1)), /选项/);
  assert.throws(() => resolveDecision(state, dec, null, makeRng(1)), /选项/);
  assert.throws(() => resolveDecision(state, dec, undefined, makeRng(1)), /选项/);
  assert.throws(() => resolveDecision(state, null, dec.options[0], makeRng(1)), /decision/);
  assert.throws(() => resolveDecision(state, undefined, dec.options[0], makeRng(1)), /decision/);
  assert.throws(() => resolveDecision(null, dec, dec.options[0], makeRng(1)), /state/);

  // 一辈子只做一次：同一个岔路口做第二次必须抛错
  resolveDecision(state, dec, dec.options[0], makeRng(1));
  assert.throws(() => resolveDecision(state, dec, dec.options[1], makeRng(1)), /已经/);
});

// ── 4. 统计量的边界 ─────────────────────────────────────────────────

test('统计量始终在 0..100', () => {
  for (const extreme of [0, 100]) {
    for (const d of DECISIONS) {
      for (const o of d.options) {
        const state = makeState({
          age: d.age,
          stats: {
            knowledge: extreme,
            health: extreme,
            relations: extreme,
            income: extreme,
            happiness: extreme,
          },
        });
        resolveDecision(state, d, o, makeRng(3));
        for (const key of STAT_KEYS) {
          const v = state.stats[key];
          assert.ok(typeof v === 'number' && v >= 0 && v <= 100, `${d.id}/${o.id} 的 ${key}=${v} 越界`);
        }
      }
    }
  }
});

// ── 5. 决策不能直接决定生死 ─────────────────────────────────────────

test('决策不能直接决定生死', () => {
  for (const d of DECISIONS) {
    for (const o of d.options) {
      const state = makeState({ age: d.age });
      o.apply(state, makeRng(5));

      assert.ok(!('dead' in state), `${d.id}/${o.id} 不得写 state.dead`);
      assert.ok(!('deathAge' in state), `${d.id}/${o.id} 不得写 state.deathAge`);
      assert.ok(!('alive' in state) || state.alive !== false, `${d.id}/${o.id} 不得把人判死`);
      assert.ok(!('causeOfDeath' in state), `${d.id}/${o.id} 不得写死因`);
      assert.equal(state.flags[d.id], o.id, `${d.id}/${o.id} 应当记录这次选择`);
    }
  }
});

// ── 6. rng 注入 ─────────────────────────────────────────────────────

test('option.apply 拿到注入的 rng', () => {
  let received = null;
  const probe = {
    id: 'probe',
    label: '探针',
    detail: '探针',
    apply(state, rng) {
      received = rng;
      return state;
    },
  };
  const rng = makeRng(1);
  probe.apply(makeState(), rng);
  assert.equal(received, rng, 'apply 收到的第二个参数必须就是注入的 rng');

  // 不同的 rng 状态 → 至少有一个选项给出不同结果
  let differing = 0;
  for (const d of DECISIONS) {
    for (const o of d.options) {
      const a = makeState({ age: d.age });
      const b = makeState({ age: d.age });
      o.apply(a, makeRng(1));
      o.apply(b, makeRng(999));
      if (JSON.stringify(a.stats) !== JSON.stringify(b.stats)) differing += 1;
    }
  }
  assert.ok(differing > 0, '必须有选项真的用到了注入的 rng');

  // 同一个种子 → 完全确定
  for (const d of DECISIONS) {
    for (const o of d.options) {
      const a = makeState({ age: d.age });
      const b = makeState({ age: d.age });
      o.apply(a, makeRng(42));
      o.apply(b, makeRng(42));
      assert.deepEqual(a.stats, b.stats, `${d.id}/${o.id} 必须是确定的`);
      assert.deepEqual(a.flags, b.flags, `${d.id}/${o.id} 的 flags 必须是确定的`);
    }
  }
});

// ── 7. 条件门控 ─────────────────────────────────────────────────────

test('条件门控生效', () => {
  const conditioned = DECISIONS.filter((d) => typeof d.condition === 'function');
  assert.ok(conditioned.length >= 1, '至少要有一个带 condition 的岔路口');

  // 每个岔路口都有一个「条件被踩翻」的 state：知识为零、关系为零、孩子一堆、已经结婚
  const FAILING = {
    university: makeState({ stats: { knowledge: 0 } }),
    relationship: makeState({ family: { married: true } }),
    child: makeState({ family: { children: 9 } }),
    legacy: makeState({ stats: { relations: 0 }, family: { children: 0 } }),
  };
  const fallback = makeState({
    stats: { knowledge: 0, relations: 0 },
    family: { parentsIncome: 0, children: 9, married: true },
  });
  for (const d of conditioned) {
    const list = availableDecisions(d.age, FAILING[d.id] || fallback);
    assert.ok(
      !list.some((x) => x.id === d.id),
      `${d.id} 在不满足条件时应当被隐藏`,
    );
  }

  // 条件满足时应当出现
  for (const d of conditioned) {
    const list = availableDecisions(d.age, richState(d.age));
    assert.ok(
      list.some((x) => x.id === d.id),
      `${d.id} 在条件满足时应当出现`,
    );
  }
});

// ── 8. 纯度 ─────────────────────────────────────────────────────────

test('模块是纯函数：不使用 Math.random / Date.now / DOM', () => {
  const src = readFileSync(new URL('../js/engine/decisions.js', import.meta.url), 'utf8');
  // 去掉注释再扫：文档里提到「不用 Math.random」本身不算违规
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.ok(!/Math\s*\.\s*random/.test(code), '不得调用 Math.random');
  assert.ok(!/Date\s*\.\s*now/.test(code), '不得调用 Date.now');
  assert.ok(!/\bdocument\b|\bwindow\b/.test(code), '不得触碰 DOM');
});
