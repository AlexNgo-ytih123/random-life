// 随机事件池的契约测试。
//
// 事件池是「世界对你做的事」：玩家每年挑一个自己的「重点」（engine/focus.js），
// 事件池则提供那一年落在自己头上的、不是自己选择的东西 —— 一场高热、一次停工、
// 一场丰收、一次洪水、一张彩票。
//
// 这里钉死三件事：
//   1. 事件的**形状**必须完整合法（id / text / 年龄区间 / 权重 / 选项）；
//   2. 抽取必须**确定**（同一个种子 → 同一条人生）、可复现、且不越权改状态；
//   3. 事件只能推动五个统计量，**永远不能直接决定生死**（生死归 mortality 模型管）。

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeRng } from '../js/engine/rng.js';
import { EVENTS, rollEvent, eventApplies } from '../js/engine/events.js';

// ── 常量与小工具 ────────────────────────────────────────────────────

/** 五个被追踪的统计量（与 engine/focus.js 一致）。 */
const STAT_KEYS = ['knowledge', 'health', 'relations', 'income', 'happiness'];

const byId = (id) => EVENTS.find((e) => e.id === id);

/** 造一个干净、可用的 state。 */
function makeState(overrides = {}) {
  const { stats, flags, indicators, ...rest } = overrides;
  return {
    age: 30,
    stats: {
      knowledge: 50,
      health: 50,
      relations: 50,
      income: 50,
      happiness: 50,
      ...(stats || {}),
    },
    flags: { ...(flags || {}) },
    timeline: [],
    country: { iso3: 'CHN', indicators: { ...(indicators || {}) } },
    ...rest,
  };
}

/** 把所有统计量都设成同一个值的 state（用来测夹紧）。 */
function flatState(value) {
  const s = makeState();
  for (const k of STAT_KEYS) s.stats[k] = value;
  return s;
}

// ── 1. 事件定义完整 ──────────────────────────────────────────────────

test('事件定义完整', () => {
  assert.ok(Array.isArray(EVENTS), 'EVENTS 必须是数组');
  const seen = new Set();
  for (const e of EVENTS) {
    assert.ok(e && typeof e === 'object', '每个事件必须是对象');
    assert.equal(typeof e.id, 'string', 'id 必须是字符串');
    assert.ok(e.id.length > 0, 'id 不能为空串');
    assert.ok(/^[a-z][a-z0-9_]*$/.test(e.id), `id 必须是英文蛇形命名：${e.id}`);
    assert.ok(!seen.has(e.id), `id 必须唯一：${e.id}`);
    seen.add(e.id);

    assert.equal(typeof e.text, 'string', `${e.id} 的 text 必须是字符串`);
    assert.ok(e.text.trim().length > 0, `${e.id} 缺 text`);

    assert.ok(Number.isFinite(e.ageMin), `${e.id} 的 ageMin 必须是有限数字`);
    assert.ok(Number.isFinite(e.ageMax), `${e.id} 的 ageMax 必须是有限数字`);
    assert.ok(e.ageMin <= e.ageMax, `${e.id} 年龄区间非法`);

    assert.equal(typeof e.weight, 'number', `${e.id} 的 weight 必须是数字`);
    assert.ok(Number.isFinite(e.weight), `${e.id} 的 weight 必须是有限数字`);
    assert.ok(e.weight > 0, `${e.id} 的 weight 必须为正`);

    if (e.countries !== undefined) {
      assert.ok(Array.isArray(e.countries), `${e.id} 的 countries 必须是数组`);
      assert.ok(e.countries.length > 0, `${e.id} 的 countries 不能是空数组`);
      for (const c of e.countries) {
        assert.equal(typeof c, 'string', `${e.id} 的 countries 元素必须是字符串`);
        assert.match(c, /^[A-Z]{3}$/, `${e.id} 的国家码必须是 ISO3：${c}`);
      }
    }
    if (e.condition !== undefined) {
      assert.equal(typeof e.condition, 'function', `${e.id} 的 condition 必须是函数`);
    }
    if (e.weightFor !== undefined) {
      assert.equal(typeof e.weightFor, 'function', `${e.id} 的 weightFor 必须是函数`);
    }
    if (e.effect !== undefined) {
      assert.equal(typeof e.effect, 'function', `${e.id} 的 effect 必须是函数`);
    }
    if (e.choice !== undefined) {
      assert.equal(typeof e.choice.prompt, 'string', `${e.id} 的 choice.prompt 必须是字符串`);
      assert.ok(e.choice.prompt.trim().length > 0, `${e.id} 的 choice.prompt 不能为空`);
      assert.ok(Array.isArray(e.choice.options), `${e.id} 的 choice.options 必须是数组`);
      assert.ok(e.choice.options.length >= 2, `${e.id} 的选项至少两个`);
      const optIds = new Set();
      for (const o of e.choice.options) {
        assert.equal(typeof o.id, 'string', `${e.id} 的选项 id 必须是字符串`);
        assert.ok(o.id.length > 0 && !optIds.has(o.id), `${e.id} 的选项 id 必须非空且唯一`);
        optIds.add(o.id);
        assert.equal(typeof o.label, 'string', `${e.id} 的选项 label 必须是字符串`);
        assert.ok(o.label.trim().length > 0, `${e.id} 的选项 label 不能为空`);
        assert.equal(typeof o.detail, 'string', `${e.id} 的选项 detail 必须是字符串`);
        assert.equal(typeof o.apply, 'function', `${e.id} 的选项 apply 必须是函数`);
      }
    }
  }
});

// ── 2. 事件池足够丰富 ────────────────────────────────────────────────

test('事件池足够丰富', () => {
  assert.ok(EVENTS.length >= 30, `事件池至少 30 条，实际 ${EVENTS.length}`);
});

test('事件池覆盖了任务书点名的那几种人生场景', () => {
  const required = [
    // 婴幼儿 / 童年
    'infant_illness', 'vaccination_campaign', 'schoolyard_conflict', 'sahel_famine',
    // 少年
    'school_exam', 'first_job', 'street_fight', 'music_band',
    // 成年
    'factory_closure', 'new_plant_opens', 'promotion', 'car_accident', 'house_fire',
    'good_harvest', 'bad_harvest', 'flood', 'earthquake', 'lottery_win', 'lawsuit',
    'business_failure',
    // 健康
    'diagnosis_chronic', 'diagnosis_acute', 'surgery', 'mental_low',
    // 家庭
    'wedding', 'first_child_born', 'family_funeral', 'family_argument', 'child_leaves_home',
    // 老年
    'retirement', 'old_fall', 'grandchild',
    // 国别专属
    'epidemic_west_africa', 'diwali_india', 'conscription_israel',
  ];
  for (const id of required) {
    assert.ok(byId(id), `事件池里缺少 ${id}`);
  }
});

test('每个年龄段都有事件可抽', () => {
  const state = makeState({
    flags: { employed: true, married: true, hasChild: true, children: 2 },
  });
  for (const age of [0, 5, 10, 15, 20, 30, 45, 60, 75, 90]) {
    const n = EVENTS.filter((e) => eventApplies(e, age, { iso3: 'CHN' }, state)).length;
    assert.ok(n > 0, `${age} 岁没有任何事件可抽`);
  }
});

// ── 3. eventApplies 尊重年龄区间 ─────────────────────────────────────

test('eventApplies 尊重年龄区间与国别条件', () => {
  const e = { id: 't_age', text: '测试事件', ageMin: 20, ageMax: 40, weight: 1 };
  assert.equal(eventApplies(e, 10, { iso3: 'CHN' }), false);
  assert.equal(eventApplies(e, 30, { iso3: 'CHN' }), true);
  assert.equal(eventApplies(e, 30, { iso3: 'CHN' }), true);
  assert.equal(eventApplies(e, 50, { iso3: 'CHN' }), false);
  // 闭区间：两端都算命中
  assert.equal(eventApplies(e, 20, { iso3: 'CHN' }), true);
  assert.equal(eventApplies(e, 40, { iso3: 'CHN' }), true);

  // 事件池里也要有一条正好 20..40、没有国别与条件限制的事件
  const real = EVENTS.find((x) => x.ageMin === 20 && x.ageMax === 40 && !x.countries && !x.condition);
  assert.ok(real, '事件池里应当存在一条 20..40 且不受国别/条件限制的事件');
  assert.equal(eventApplies(real, 30, { iso3: 'CHN' }), true);
  assert.equal(eventApplies(real, 19, { iso3: 'CHN' }), false);
  assert.equal(eventApplies(real, 41, { iso3: 'CHN' }), false);
});

// ── 4. 国别限定 ─────────────────────────────────────────────────────

test('国别限定的事件只在指定国家触发', () => {
  const e = { id: 't_country', text: '测试事件', ageMin: 0, ageMax: 90, weight: 1, countries: ['NGA'] };
  assert.equal(eventApplies(e, 30, { iso3: 'CHN' }), false);
  assert.equal(eventApplies(e, 30, { iso3: 'NGA' }), true);
  // 没有国家信息时，限定国别的事件不适用
  assert.equal(eventApplies(e, 30, null), false);
  assert.equal(eventApplies(e, 30, undefined), false);

  const real = EVENTS.find((x) => Array.isArray(x.countries) && x.countries.includes('NGA'));
  assert.ok(real, '事件池里应当存在限定 NGA 的事件');
  assert.equal(eventApplies(real, 30, { iso3: 'CHN' }), false);
  assert.equal(eventApplies(real, 30, { iso3: 'NGA' }), true);
});

// ── 5. rollEvent 返回 null 或合法事件 ────────────────────────────────

test('rollEvent 返回 null 或合法事件', () => {
  const r = makeRng(12);
  for (let i = 0; i < 500; i += 1) {
    const e = rollEvent(r, 30, { iso3: 'CHN' }, new Set(), makeState());
    if (e !== null) {
      assert.ok(e.id, `第 ${i} 次抽到了没有 id 的事件`);
      assert.ok(e.text, `第 ${i} 次抽到了没有 text 的事件`);
      assert.ok(EVENTS.some((x) => x.id === e.id), `第 ${i} 次抽到了事件池之外的事件：${e.id}`);
    }
  }
});

test('rollEvent 在没有候选时返回 null', () => {
  const r = makeRng(3);
  assert.equal(rollEvent(r, -1, { iso3: 'CHN' }, new Set(), makeState()), null);
  assert.equal(rollEvent(r, 500, { iso3: 'CHN' }, new Set(), makeState()), null);
  // 所有候选都已在 fired 里 → 同样返回 null
  const fired = new Set(EVENTS.map((e) => e.id));
  assert.equal(rollEvent(r, 30, { iso3: 'CHN' }, fired, makeState()), null);
});

// ── 6. 同一事件不会重复触发 ──────────────────────────────────────────

test('同一事件不会在同一年重复触发', () => {
  const r = makeRng(77);
  const fired = new Set();
  let lastSize = 0;
  for (let i = 0; i < 200; i += 1) {
    const e = rollEvent(r, 30, { iso3: 'CHN' }, fired, makeState());
    if (e === null) continue;
    assert.ok(!fired.has(e.id), `事件 ${e.id} 在同一年重复触发了`);
    fired.add(e.id);
    assert.ok(fired.size > lastSize, 'fired 集合必须随抽中事件增长');
    lastSize = fired.size;
  }
  assert.ok(fired.size > 1, `200 次抽取后应当触发过多个事件，实际 ${fired.size}`);
});

// ── 7. rollEvent 不修改 fired ────────────────────────────────────────

test('rollEvent 不修改 fired', () => {
  const fired = new Set(['first_job']);
  const snapshot = [...fired];
  const r = makeRng(5);
  for (let i = 0; i < 50; i += 1) {
    rollEvent(r, 30, { iso3: 'CHN' }, fired, makeState());
  }
  assert.deepEqual([...fired], snapshot, 'rollEvent 不得修改 fired（由调用方在事件结算后自行登记）');
  assert.equal(fired.size, 1);
});

test('已经在 fired 里的事件不会再被抽到', () => {
  const target = byId('first_job');
  const fired = new Set([target.id]);
  const r = makeRng(9);
  for (let i = 0; i < 200; i += 1) {
    const e = rollEvent(r, 30, { iso3: 'CHN' }, fired, makeState());
    if (e) assert.notEqual(e.id, target.id, '已触发过的事件不该再出现');
  }
});

// ── 8. 无候选时不消耗随机数 ─────────────────────────────────────────

test('无候选事件时不消耗随机数', () => {
  let n = 0;
  const counting = () => {
    n += 1;
    return 0.5;
  };
  assert.equal(rollEvent(counting, -1, { iso3: 'CHN' }, new Set(), makeState()), null);
  assert.equal(n, 0, '没有候选时不得消耗任何随机数');
  assert.equal(rollEvent(counting, 500, { iso3: 'CHN' }, new Set(), makeState()), null);
  assert.equal(n, 0, '没有候选时不得消耗任何随机数');
});

test('成功抽取恰好消耗一个随机数', () => {
  let n = 0;
  const counting = () => {
    n += 1;
    return 0.5;
  };
  const e = rollEvent(counting, 30, { iso3: 'CHN' }, new Set(), makeState());
  assert.ok(e, '三十岁应当抽得到事件');
  assert.equal(n, 1, '一次抽取只应消耗一个随机数（seed → 人生的公开契约）');
});

// ── 9. 确定性 ────────────────────────────────────────────────────────

test('确定性：同一个种子产生同一条事件序列', () => {
  const run = (seed) => {
    const r = makeRng(seed);
    const fired = new Set();
    const out = [];
    for (let i = 0; i < 200; i += 1) {
      const e = rollEvent(r, 30, { iso3: 'CHN' }, fired, makeState());
      if (!e) continue;
      out.push(e.id);
      fired.add(e.id);
    }
    return out;
  };
  assert.deepEqual(run(2024), run(2024), '同一种子必须给出同一条事件序列');
  assert.notDeepEqual(run(2024), run(2025), '不同种子应当给出不同的序列');
});

// ── 10. 权重决定频率 ─────────────────────────────────────────────────

test('权重决定频率', () => {
  const pool = [
    { id: 'heavy', text: '常发生', ageMin: 20, ageMax: 40, weight: 90 },
    { id: 'light', text: '少见', ageMin: 20, ageMax: 40, weight: 10 },
  ];
  const r = makeRng(31415);
  let heavy = 0;
  let light = 0;
  for (let i = 0; i < 4000; i += 1) {
    const e = rollEvent(r, 30, { iso3: 'CHN' }, new Set(), makeState(), pool);
    if (e.id === 'heavy') heavy += 1;
    else if (e.id === 'light') light += 1;
  }
  assert.equal(heavy + light, 4000, '两个事件必须覆盖全部抽取');
  const share = heavy / (heavy + light);
  assert.ok(share > 0.8, `90:10 的权重应当让常发生的事件占八成以上，实际 ${share}`);
  assert.ok(share < 0.98, `90:10 的权重不该让常发生的事件近乎必中，实际 ${share}`);
  assert.ok(heavy > light * 3, `常发生的事件必须明显更多，${heavy} vs ${light}`);
});

test('weightFor 会按当地指标改变权重', () => {
  const target = byId('childhood_food_shortage');
  assert.equal(typeof target.weightFor, 'function', '缺粮事件应当按贫困率动态加权');

  // 池子里再放一条**固定权重**的同伴事件：同伴的概率不变，
  // 目标事件被抽到的比例就只取决于它自己的动态权重。
  const pool = [
    target,
    { id: 'filler', text: '对照组', ageMin: 0, ageMax: 90, weight: 10 },
  ];
  const share = (poverty) => {
    const r = makeRng(2718);
    const state = makeState({ indicators: { poverty } });
    let hit = 0;
    for (let i = 0; i < 2000; i += 1) {
      const e = rollEvent(r, 8, { iso3: 'CHN' }, new Set(), state, pool);
      if (e && e.id === target.id) hit += 1;
    }
    return hit / 2000;
  };
  const poor = share(70);
  const rich = share(2);
  assert.ok(poor > rich * 2, `贫困国家的缺粮事件必须明显更多：${poor} vs ${rich}`);
});

test('weightFor 返回非正数的事件被排除', () => {
  const pool = [
    { id: 'never', text: '不会出现', ageMin: 20, ageMax: 40, weight: 100, weightFor: () => 0 },
    { id: 'always', text: '总会出现', ageMin: 20, ageMax: 40, weight: 1 },
  ];
  const r = makeRng(11);
  for (let i = 0; i < 200; i += 1) {
    const e = rollEvent(r, 30, { iso3: 'CHN' }, new Set(), makeState(), pool);
    assert.ok(e, '应当还有别的候选');
    assert.equal(e.id, 'always');
  }
});

// ── 11. 副作用把统计量夹在 0..100 ───────────────────────────────────

test('事件的副作用把统计量夹在 0..100', () => {
  for (const e of EVENTS) {
    if (typeof e.effect !== 'function') continue;
    for (const base of [0, 50, 100]) {
      const state = flatState(base);
      e.effect(state, makeRng(4));
      for (const k of STAT_KEYS) {
        const v = state.stats[k];
        assert.ok(Number.isFinite(v), `${e.id} 的 ${k} 必须是有限数字（实际 ${v}）`);
        assert.ok(v >= 0 && v <= 100, `${e.id} 的 ${k}=${v} 越界（起点 ${base}）`);
      }
    }
  }
});

test('选项的副作用也把统计量夹在 0..100', () => {
  for (const e of EVENTS) {
    if (!e.choice) continue;
    for (const o of e.choice.options) {
      for (const base of [0, 50, 100]) {
        const state = flatState(base);
        o.apply(state, makeRng(6));
        for (const k of STAT_KEYS) {
          const v = state.stats[k];
          assert.ok(Number.isFinite(v), `${e.id}/${o.id} 的 ${k} 必须是有限数字（实际 ${v}）`);
          assert.ok(v >= 0 && v <= 100, `${e.id}/${o.id} 的 ${k}=${v} 越界（起点 ${base}）`);
        }
      }
    }
  }
});

test('事件可以把经过写进时间线并打上标记', () => {
  const e = byId('first_child_born');
  const state = makeState({ age: 28 });
  e.effect(state, makeRng(8));
  assert.ok(Array.isArray(state.timeline) && state.timeline.length > 0, '应当留下时间线记录');
  const last = state.timeline[state.timeline.length - 1];
  assert.equal(typeof last.text, 'string');
  assert.ok(last.text.length > 0);
  assert.equal(last.age, 28, '时间线记录应当带上当时的年龄');
  assert.equal(state.flags.hasChild, true, '应当打上「已有子女」的标记');
});

// ── 12. 事件不能直接决定生死 ─────────────────────────────────────────

test('事件不能直接决定生死', () => {
  for (const e of EVENTS) {
    if (typeof e.effect !== 'function') continue;
    const state = makeState();
    e.effect(state, makeRng(10));
    assert.ok(!('dead' in state), `${e.id} 的 effect 不得写 state.dead`);
    assert.ok(!('deathAge' in state), `${e.id} 的 effect 不得写 state.deathAge`);
    assert.ok(!('alive' in state), `${e.id} 的 effect 不得写 state.alive`);
  }
  for (const e of EVENTS) {
    if (!e.choice) continue;
    for (const o of e.choice.options) {
      const state = makeState();
      o.apply(state, makeRng(10));
      assert.ok(!('dead' in state), `${e.id}/${o.id} 不得写 state.dead`);
      assert.ok(!('deathAge' in state), `${e.id}/${o.id} 不得写 state.deathAge`);
    }
  }
});

test('事件把健康压到 0 也不直接宣判死亡', () => {
  const state = flatState(0);
  const e = EVENTS.find((x) => typeof x.effect === 'function' && x.ageMin <= 40);
  e.effect(state, makeRng(2));
  assert.equal(state.stats.health, 0, '健康可以掉到 0');
  assert.ok(!('dead' in state), '但生死归 mortality 模型管，事件不得自己写 dead');
});

// ── 13. 年龄越界时不会抽到超龄事件 ───────────────────────────────────

test('年龄越界时不会抽到超龄事件', () => {
  const r = makeRng(4242);
  for (let i = 0; i < 300; i += 1) {
    const e = rollEvent(r, 5, { iso3: 'CHN' }, new Set(), makeState());
    if (!e) continue;
    assert.ok(e.ageMin <= 5, `抽到了超龄事件 ${e.id}（ageMin=${e.ageMin}）`);
    assert.ok(e.ageMax >= 5, `抽到了不在年龄区间的事件 ${e.id}（ageMax=${e.ageMax}）`);
  }
});

// ── 14. 纯度 ─────────────────────────────────────────────────────────

test('模块是纯函数：不使用 Math.random / Date.now / DOM', () => {
  const src = readFileSync(new URL('../js/engine/events.js', import.meta.url), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.ok(!/Math\s*\.\s*random/.test(code), '不得调用 Math.random');
  assert.ok(!/Date\s*\.\s*now/.test(code), '不得调用 Date.now');
  assert.ok(!/\bdocument\b|\bwindow\b/.test(code), '不得触碰 DOM');
  assert.ok(!/\bfetch\s*\(/.test(code), '不得联网');
  assert.ok(!/\bdead\b|deathAge/i.test(code), '事件模块不得出现生死字段（生死归 mortality 模型管）');
});
