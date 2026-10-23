// 随机事件池：那些不是你选择、而是落在你身上的事。
//
// 玩家每年挑一个「重点」（engine/focus.js），那是自己的努力；
// 事件池提供的是另一半——世界在这一年对你做的事：
//   一场高热、一次停工、一场丰收、一次洪水、一张彩票、一个远房亲戚的婚礼。
//
// 三条设计原则：
//
//   1. **事件只叙述，不宣判。**
//      事件可以让人病、可以让人破产、可以把健康压到很低，
//      但它**永远不写生死字段**——什么时候死由 mortality 模型说了算。
//      事件能做的只是把 health 往 0 推。
//
//   2. **权重来自当地统计。**
//      疫苗接种率低的国家，婴儿生病的概率更高；
//      贫困率高的地方，缺粮更常见；凶杀率高的地区，街头冲突更频繁；
//      农业就业占比高的地方，收成好坏直接决定这一年。
//      指示值缺失时一律退回 1 —— 数据缺失不该改写人生。
//
//   3. **纯函数。**
//      不碰 DOM、不联网、不用 Math.random()、不用 Date.now()。
//      所有随机性都来自调用方注入的 rng，因此同一个种子永远得到同一条人生。
//
// 抽取流程（rollEvent）：
//   年龄区间 ∧ 国别 ∧ 条件 → 去掉已经触发过的 → 按权重抽一个。
//   抽中之后由**调用方**把 id 登记进 fired，rollEvent 自己不动 fired
//   （保持纯函数，事件结算的责任在调用方）。

import { weighted } from './rng.js';

/** 五个被追踪的统计量（与 engine/focus.js 保持一致），全部 0..100。 */
const STAT_KEYS = ['knowledge', 'health', 'relations', 'income', 'happiness'];

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// ── 内部小工具 ──────────────────────────────────────────────────────

/**
 * 取出某个国家指标的值。
 *
 * 兼容两种形状（真实数据是 `{value, year}`，测试里常用裸数字）：
 *   indicators.immunization = 95
 *   indicators.immunization = { value: 95, year: 2023 }
 *
 * @param {object} state
 * @param {string} key 指标名
 * @returns {number|null} 有限数值；缺失时返回 null（绝不拿 0 冒充）
 */
function indicator(state, key) {
  const ind = state?.country?.indicators;
  if (!ind || typeof ind !== 'object') return null;
  const raw = ind[key];
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (raw && typeof raw === 'object' && typeof raw.value === 'number' && Number.isFinite(raw.value)) {
    return raw.value;
  }
  return null;
}

/** 保证 state.stats 存在且五个统计量都是有限数字（缺失按 0 起算）。 */
function ensureStats(state) {
  if (!state.stats || typeof state.stats !== 'object') state.stats = {};
  const s = state.stats;
  for (const key of STAT_KEYS) {
    if (typeof s[key] !== 'number' || !Number.isFinite(s[key])) s[key] = 0;
  }
  return s;
}

/** 把五个统计量夹到 0..100。 */
function clampStats(state) {
  const s = ensureStats(state);
  for (const key of STAT_KEYS) s[key] = clamp(s[key], 0, 100);
  return s;
}

/**
 * 改几个统计量（每次改动后立刻夹紧）。
 * 正数是变好，负数是变坏。
 */
function bump(state, delta) {
  const s = ensureStats(state);
  for (const key of STAT_KEYS) {
    const d = delta[key];
    if (typeof d !== 'number' || !Number.isFinite(d)) continue;
    s[key] = clamp(s[key] + d, 0, 100);
  }
  return s;
}

/** 往时间线里记一笔。 */
function note(state, text) {
  if (!state || typeof state !== 'object') return;
  if (!Array.isArray(state.timeline)) state.timeline = [];
  state.timeline.push({ age: Number.isFinite(state.age) ? state.age : 0, text });
}

/** 打一个标记（flags）。 */
function mark(state, key, value = true) {
  if (!state || typeof state !== 'object') return;
  if (!state.flags || typeof state.flags !== 'object') state.flags = {};
  state.flags[key] = value;
}

/**
 * 取一个区间内的随机数；没有 rng 时退回固定值（保证效果依然可用）。
 * 只在 effect / 选项里用，用来让同一件事的代价有多有少。
 */
function rand(rng, min, max, fallback) {
  if (typeof rng !== 'function') return fallback;
  return min + rng() * (max - min);
}

/**
 * 事件效果的包装器：执行完之后统一把统计量夹到 0..100。
 * 这样每个 effect 只需要关心「往哪个方向推」，夹紧由包装器兜底。
 */
function fx(fn) {
  return (state, rng) => {
    if (!state || typeof state !== 'object') return;
    fn(state, rng);
    clampStats(state);
  };
}

// ── 事件池 ──────────────────────────────────────────────────────────

/**
 * 全部随机事件。
 *
 * 每条事件：
 *   id        英文蛇形标识（稳定，进了 fired 就不会再抽到）
 *   text      一句中文叙述，出现在玩家眼前
 *   ageMin/ageMax  年龄闭区间
 *   weight    基础权重（相对频率）
 *   countries 可选，限定只在这些 ISO3 国家发生
 *   condition 可选，(state) => boolean；返回 false 就跳过
 *   weightFor 可选，(state) => number；返回的动态权重乘在基础权重上，
 *              非正数等于「这一条不参加抽取」
 *   effect    可选，(state, rng) => void；改统计量、写时间线、打标记
 *   choice    可选；带选项的事件，options[].apply(state, rng) 改状态
 */
export const EVENTS = [
  // ── 婴幼儿（0~6 岁） ───────────────────────────────────────────
  {
    id: 'infant_illness',
    text: '一场高烧在夜里烧上你的额头，母亲抱着你跑了半夜才排上号。',
    ageMin: 0,
    ageMax: 1,
    weight: 12,
    // 疫苗接种率越低，婴儿这一关越难过
    weightFor: (state) => {
      const imm = indicator(state, 'immunization');
      if (imm === null) return 1;
      return clamp(0.5 + Math.max(0, 100 - imm) / 30, 0.4, 3);
    },
    effect: fx((state, rng) => {
      bump(state, { health: -rand(rng, 4, 9, 6), happiness: -2 });
      note(state, '那年的疫苗本上，你的第一针打得很晚。');
    }),
  },
  {
    id: 'vaccination_campaign',
    text: '社区来了接种队，队伍拐了两个弯，母亲抱着你排在中间。',
    ageMin: 0,
    ageMax: 6,
    weight: 9,
    effect: fx((state) => {
      bump(state, { health: 4, knowledge: 1 });
      note(state, '你胳膊上留了一个小疤，那天队伍里全是小孩的哭声。');
    }),
  },
  {
    id: 'early_walking_fall',
    text: '你扶着茶几学会了走路，松开手的那天摔在门槛上，磕破了下巴。',
    ageMin: 1,
    ageMax: 3,
    weight: 5,
    effect: fx((state) => {
      bump(state, { health: -1, happiness: 1, knowledge: 1 });
    }),
  },
  {
    id: 'nursery_song',
    text: '托儿所的阿姨教你唱了一首歌，你唱到一半忘了词，掌声还是响了。',
    ageMin: 2,
    ageMax: 5,
    weight: 4,
    effect: fx((state) => {
      bump(state, { happiness: 4, relations: 2 });
    }),
  },
  {
    id: 'childhood_food_shortage',
    text: '今年收成不好，锅里的米汤越兑越稀，一家人把碗底刮了又刮。',
    ageMin: 0,
    ageMax: 10,
    weight: 4,
    // 贫困越重，缺粮越常见
    weightFor: (state) => {
      const p = indicator(state, 'poverty');
      if (p === null) return 1;
      return clamp(0.4 + p / 20, 0.4, 3);
    },
    effect: fx((state) => {
      bump(state, { health: -4, happiness: -4, income: -1 });
      note(state, '那几年你记住了饿的滋味，也记住了大人把最后一块饼推过来。');
    }),
  },

  // ── 童年（5~14 岁） ───────────────────────────────────────────
  {
    id: 'schoolyard_conflict',
    text: '课间在操场上和人推搡起来，你被按在沙地上，膝盖蹭掉一层皮。',
    ageMin: 6,
    ageMax: 12,
    weight: 6,
    effect: fx((state) => {
      bump(state, { health: -2, relations: -1, happiness: -1 });
    }),
  },
  {
    id: 'broken_bone',
    text: '从院子里的树上摔下来，锁骨断了，你在石膏里过完了一个夏天。',
    ageMin: 5,
    ageMax: 18,
    weight: 3,
    effect: fx((state) => {
      bump(state, { health: -6, happiness: -2 });
      note(state, '那个夏天你错过了整年的体育课。');
    }),
  },
  {
    id: 'teacher_praises_essay',
    text: '班主任把你的作文在全班念了一遍，你红着耳朵低下了头。',
    ageMin: 7,
    ageMax: 14,
    weight: 5,
    effect: fx((state) => {
      bump(state, { knowledge: 3, happiness: 4, relations: 1 });
    }),
  },
  {
    id: 'long_road_to_school',
    text: '上学要翻一个半小时的山路，冬天鞋里总是湿的，手冻得握不住笔。',
    ageMin: 6,
    ageMax: 14,
    weight: 2,
    weightFor: (state) => {
      const p = indicator(state, 'poverty');
      if (p === null) return 1;
      return clamp(0.4 + p / 20, 0.4, 3);
    },
    effect: fx((state) => {
      bump(state, { knowledge: -2, happiness: -2, health: -1 });
    }),
  },
  {
    id: 'childhood_fever_wave',
    text: '班上一个小朋友一个接一个地发烧，教室里整天弥漫着姜汤的味道。',
    ageMin: 5,
    ageMax: 14,
    weight: 4,
    effect: fx((state) => {
      bump(state, { health: -5, happiness: -3 });
    }),
  },
  {
    id: 'homework_pile',
    text: '作业本摞得比砖还高，你抄到凌晨两点，笔芯用完了三根。',
    ageMin: 7,
    ageMax: 16,
    weight: 3,
    effect: fx((state) => {
      bump(state, { knowledge: 3, health: -3, happiness: -2 });
    }),
  },

  // ── 少年（13~22 岁） ──────────────────────────────────────────
  {
    id: 'school_exam',
    text: '大考摆在你面前，考场外的走廊安静得能听见自己的心跳。',
    ageMin: 15,
    ageMax: 18,
    weight: 10,
    choice: {
      prompt: '最后一年，你怎么读书？',
      options: [
        {
          id: 'cram',
          label: '通宵刷题',
          detail: '把三年的课本压进一年，灯亮到凌晨三点。',
          apply: fx((state) => {
            bump(state, { knowledge: 8, health: -6, happiness: -4 });
          }),
        },
        {
          id: 'steady',
          label: '按部就班',
          detail: '每天做几套题，剩下的时间留给睡眠。',
          apply: fx((state) => {
            bump(state, { knowledge: 4, health: 1, happiness: 1 });
          }),
        },
        {
          id: 'give_up',
          label: '弃考',
          detail: '交了白卷，走出考场时风很大。',
          apply: fx((state) => {
            bump(state, { knowledge: -3, happiness: 2 });
            mark(state, 'droppedOut');
          }),
        },
      ],
    },
    effect: fx((state) => {
      note(state, '考完最后一场，你在考场门口站了很久。');
    }),
  },
  {
    id: 'first_job',
    text: '你在店里找到一份活，端盘子、搬货、算账，工资按周发。',
    ageMin: 16,
    ageMax: 22,
    weight: 8,
    effect: fx((state) => {
      bump(state, { income: 5, knowledge: 2, health: -2, happiness: 1 });
      mark(state, 'employed');
      note(state, '第一份工钱买了个并不需要的东西，但你高兴了一路。');
    }),
  },
  {
    id: 'street_fight',
    text: '夜里在街口和人打了一架，鼻梁歪了，肿了半个月。',
    ageMin: 14,
    ageMax: 25,
    weight: 5,
    // 凶杀率高的地区，街头的暴力更常见
    weightFor: (state) => {
      const h = indicator(state, 'homicide');
      if (h === null) return 1;
      return clamp(0.6 + h / 5, 0.6, 3);
    },
    effect: fx((state) => {
      bump(state, { health: -6, relations: -1, happiness: -2 });
    }),
  },
  {
    id: 'music_band',
    text: '你和几个同学攒了个乐队，暑假在广场上演出，电流声盖过了跑调。',
    ageMin: 13,
    ageMax: 22,
    weight: 4,
    effect: fx((state) => {
      bump(state, { relations: 6, happiness: 6, knowledge: 1, income: 1 });
      note(state, '那支乐队只演了三场，但你们合过一张照片。');
    }),
  },
  {
    id: 'first_crush',
    text: '你悄悄喜欢上了一个人，整个学期都在绕远路回家。',
    ageMin: 13,
    ageMax: 18,
    weight: 4,
    effect: fx((state) => {
      bump(state, { happiness: 5, relations: 2 });
    }),
  },
  {
    id: 'stray_dog',
    text: '你在桥洞下捡了条土狗回家，它的毛是黄白相间的。',
    ageMin: 10,
    ageMax: 18,
    weight: 3,
    effect: fx((state) => {
      bump(state, { happiness: 5, relations: 2, income: -1 });
      mark(state, 'hasPet');
    }),
  },
  {
    id: 'classroom_argument',
    text: '和班主任顶了嘴，你被叫到办公室，出来的时候脸还是红的。',
    ageMin: 13,
    ageMax: 19,
    weight: 3,
    effect: fx((state) => {
      bump(state, { happiness: -4, relations: -2, knowledge: 1 });
    }),
  },

  // ── 成年（18~65 岁） ──────────────────────────────────────────
  {
    id: 'factory_closure',
    text: '厂里效益不好，停产整顿，你的名字出现在买断工龄的名单上。',
    ageMin: 18,
    ageMax: 60,
    weight: 5,
    condition: (state) => !!state?.flags?.employed,
    weightFor: (state) => {
      const u = indicator(state, 'unemployment');
      if (u === null) return 1;
      return clamp(0.5 + u / 6, 0.5, 3);
    },
    choice: {
      prompt: '厂子不开了，你怎么办？',
      options: [
        {
          id: 'severance',
          label: '拿买断工龄走人',
          detail: '一次性拿到一笔钱，从此自己找出路。',
          apply: fx((state) => {
            bump(state, { income: -3, happiness: -4, knowledge: 1 });
            mark(state, 'laidOff');
          }),
        },
        {
          id: 'wait',
          label: '留下等复产',
          detail: '留在车间里等那台也许会重新开起来的机器。',
          apply: fx((state) => {
            bump(state, { income: -8, health: -3, happiness: -6 });
            mark(state, 'laidOff');
          }),
        },
        {
          id: 'move',
          label: '换个城市找活',
          detail: '行李捆好就上车，去一个谁也不认识你的地方。',
          apply: fx((state) => {
            bump(state, { income: 3, relations: -5, happiness: -3, health: -2 });
            mark(state, 'laidOff');
            mark(state, 'movedCity');
          }),
        },
      ],
    },
    effect: fx((state) => {
      note(state, '停产那天，车间的灯比平常早灭了一个小时。');
    }),
  },
  {
    id: 'new_plant_opens',
    text: '新区落了座新厂，招工的队伍排到路口，喇叭从早响到晚。',
    ageMin: 20,
    ageMax: 60,
    weight: 4,
    weightFor: (state) => {
      const u = indicator(state, 'unemployment');
      if (u === null) return 1;
      return clamp(1.6 - u / 12, 0.5, 2);
    },
    effect: fx((state) => {
      bump(state, { income: 6, knowledge: 1, health: -1 });
    }),
  },
  {
    id: 'promotion',
    text: '你被提拔了，工位搬到了楼上，工资条上的数字也换了位置。',
    ageMin: 25,
    ageMax: 60,
    weight: 5,
    condition: (state) => !!state?.flags?.employed,
    effect: fx((state) => {
      bump(state, { income: 7, happiness: 4, health: -2, relations: -1 });
      mark(state, 'promoted');
      note(state, '第一次有人叫你「领导」，你不太习惯。');
    }),
  },
  {
    id: 'car_accident',
    text: '一场大雨之后的追尾，你的车头撞上护栏，气囊里全是棉花味。',
    ageMin: 18,
    ageMax: 75,
    weight: 4,
    weightFor: (state) => {
      const u = indicator(state, 'urbanRate');
      if (u === null) return 1;
      return clamp(0.5 + u / 60, 0.5, 2);
    },
    effect: fx((state, rng) => {
      bump(state, { health: -rand(rng, 5, 11, 8), income: -3, happiness: -3 });
    }),
  },
  {
    id: 'house_fire',
    text: '夜里线路短路，厨房烧了起来，消防车拉了一夜的水。',
    ageMin: 20,
    ageMax: 70,
    weight: 2,
    effect: fx((state) => {
      bump(state, { income: -5, happiness: -4, relations: 2, health: -2 });
      note(state, '烧掉的是厨房和半年的积蓄，救回来的是邻居们搬来的东西。');
    }),
  },
  {
    id: 'good_harvest',
    text: '今年风调雨顺，仓里的粮食堆到了房梁，你搬了一整晚。',
    ageMin: 15,
    ageMax: 75,
    weight: 6,
    // 农业就业占比高的地方，收成直接决定这一年
    weightFor: (state) => {
      const a = indicator(state, 'agriculture');
      if (a === null) return 1;
      return clamp(0.5 + a / 25, 0.5, 2.5);
    },
    effect: fx((state) => {
      bump(state, { income: 6, happiness: 5 });
      note(state, '秋收之后，仓里第一次装不下了。');
    }),
  },
  {
    id: 'bad_harvest',
    text: '一场冰雹砸了半坡地，谷穗全砸进了泥里，今年的收成折了腰。',
    ageMin: 15,
    ageMax: 75,
    weight: 6,
    weightFor: (state) => {
      const a = indicator(state, 'agriculture');
      if (a === null) return 1;
      const p = indicator(state, 'poverty');
      const base = clamp(0.5 + a / 25, 0.5, 2.5);
      return p === null ? base : clamp(base + p / 40, 0.5, 3);
    },
    effect: fx((state) => {
      bump(state, { income: -5, happiness: -4, health: -1 });
    }),
  },
  {
    id: 'flood',
    text: '连日暴雨，河漫过街面，家具漂到了巷口，你捞回了一只鞋。',
    ageMin: 5,
    ageMax: 90,
    weight: 3,
    effect: fx((state) => {
      bump(state, { income: -4, health: -3, happiness: -4 });
    }),
  },
  {
    id: 'earthquake',
    text: '夜里地动了一下，柜子倒了，屋顶裂开一道缝，全家人站在院子里。',
    ageMin: 5,
    ageMax: 90,
    weight: 2,
    effect: fx((state) => {
      bump(state, { health: -7, income: -4, happiness: -5, relations: 2 });
      note(state, '那晚邻居们把被子互相搭在院子里过了一宿。');
    }),
  },
  {
    id: 'lottery_win',
    text: '你随手买的两块钱中了，兑奖窗口的队伍排到了街对面。',
    ageMin: 18,
    ageMax: 80,
    weight: 1,
    effect: fx((state, rng) => {
      bump(state, { income: rand(rng, 8, 18, 12), happiness: 8, relations: 2 });
      note(state, '你把奖金分成两份，一份存起来，一份请所有人吃了顿饭。');
    }),
  },
  {
    id: 'lawsuit',
    text: '一纸传票寄到了家里，一段关系从此要靠法院来判。',
    ageMin: 25,
    ageMax: 75,
    weight: 2,
    choice: {
      prompt: '官司怎么打？',
      options: [
        {
          id: 'settle',
          label: '庭上和解',
          detail: '少赔一点，但从此抬头不见低头见。',
          apply: fx((state) => {
            bump(state, { income: -3, happiness: -2, relations: -1 });
          }),
        },
        {
          id: 'fight',
          label: '硬扛到底',
          detail: '钱和精力都要搭进去，但你说的是真话。',
          apply: fx((state) => {
            bump(state, { income: -8, health: -4, happiness: -6, knowledge: 2 });
          }),
        },
        {
          id: 'admit',
          label: '认赔了事',
          detail: '认下责任，把这件事尽快翻过去。',
          apply: fx((state) => {
            bump(state, { income: -9, happiness: -5 });
          }),
        },
      ],
    },
    effect: fx((state) => {
      note(state, '那几个月，你说话前都会先想一遍后果。');
    }),
  },
  {
    id: 'business_failure',
    text: '你盘下的铺子撑了两年，卷帘门拉下来那天，你在门口站了很久。',
    ageMin: 25,
    ageMax: 65,
    weight: 2,
    condition: (state) => !!state?.flags?.employed,
    choice: {
      prompt: '账上的钱只够再撑三个月，你开始算另一笔账。',
      options: [
        {
          id: 'again',
          label: '借一笔再来一次',
          detail: '把老家的房子押上，再赌一次。',
          apply: fx((state) => {
            bump(state, { income: -10, happiness: -3, knowledge: 4 });
            mark(state, 'businessRetry');
          }),
        },
        {
          id: 'close',
          label: '关店去打零工',
          detail: '把货一件件清掉，然后去工地。',
          apply: fx((state) => {
            bump(state, { income: -6, happiness: -5, health: -4 });
          }),
        },
        {
          id: 'investor',
          label: '找投资人',
          detail: '把你的计划和账本摊在别人面前。',
          apply: fx((state, rng) => {
            if (typeof rng === 'function' && rng() < 0.4) {
              bump(state, { income: 12, happiness: 6, relations: 3 });
            } else {
              bump(state, { income: -3, happiness: -2, knowledge: 2 });
            }
          }),
        },
      ],
    },
    effect: fx((state) => {
      note(state, '关门那天，你把卷帘门上的锁检查了三遍。');
    }),
  },
  {
    id: 'moved_to_city',
    text: '省城的厂子在招人，火车票比一个月的房租还便宜。',
    ageMin: 15,
    ageMax: 35,
    weight: 4,
    weightFor: (state) => {
      const u = indicator(state, 'urbanRate');
      if (u === null) return 1;
      return clamp(0.6 + u / 80, 0.6, 1.8);
    },
    choice: {
      prompt: '去，还是不去？',
      options: [
        {
          id: 'go',
          label: '搬过去',
          detail: '把行李捆好，先去干两年再说。',
          apply: fx((state) => {
            bump(state, { income: 5, relations: -6, happiness: 2, knowledge: 2 });
            mark(state, 'movedToCity');
          }),
        },
        {
          id: 'stay',
          label: '留在原地',
          detail: '这里熟，一个电话就能叫来帮忙。',
          apply: fx((state) => {
            bump(state, { income: -1, relations: 3, happiness: -1 });
          }),
        },
        {
          id: 'later',
          label: '再等等看',
          detail: '机会总会有的，你对自己说。',
          apply: fx((state) => {
            bump(state, { happiness: 1, knowledge: 1 });
          }),
        },
      ],
    },
    effect: fx((state) => {
      note(state, '第一次坐长途车，你把窗户开了一条缝。');
    }),
  },
  {
    id: 'neighbor_lends_tools',
    text: '邻居家盖房，借了你一车砖和一把电钻，几年后才还上。',
    ageMin: 20,
    ageMax: 80,
    weight: 3,
    effect: fx((state) => {
      bump(state, { relations: 5, income: -1, happiness: 2 });
    }),
  },
  {
    id: 'factory_accident',
    text: '传送带卷走了手套，工伤停了两个月，厂里赔的钱不够看病。',
    ageMin: 18,
    ageMax: 65,
    weight: 3,
    effect: fx((state) => {
      bump(state, { health: -8, income: -5, happiness: -3 });
    }),
  },
  {
    id: 'overtime_nights',
    text: '这半年项目赶工，你连着四十天在十点后才离开办公室。',
    ageMin: 25,
    ageMax: 55,
    weight: 4,
    effect: fx((state) => {
      bump(state, { income: 3, health: -4, happiness: -4, relations: -3 });
    }),
  },
  {
    id: 'first_car',
    text: '你终于有了第一辆车，二手车的漆掉了一半，但那是你的。',
    ageMin: 20,
    ageMax: 40,
    weight: 5,
    effect: fx((state) => {
      bump(state, { income: -6, happiness: 7, knowledge: 1 });
      mark(state, 'hasCar');
      note(state, '你把车开出城，在加油站门口坐了半小时，什么也没干。');
    }),
  },

  // ── 健康 ──────────────────────────────────────────────────────
  {
    id: 'diagnosis_chronic',
    text: '体检单上有一行红字，从此你要长期吃药，早晚都得记着。',
    ageMin: 35,
    ageMax: 90,
    weight: 4,
    // 活得久的国家，慢病出现得更晚也更多
    weightFor: (state) => {
      const e = indicator(state, 'lifeExp');
      if (e === null) return 1;
      return clamp(0.5 + (e - 60) / 20, 0.5, 2.5);
    },
    effect: fx((state) => {
      bump(state, { health: -8, happiness: -6, income: -2, knowledge: 1 });
      mark(state, 'chronicIllness');
      note(state, '从这天起，你开始认真看食品包装上的字。');
    }),
  },
  {
    id: 'diagnosis_acute',
    text: '医生把化验单推过来，说要住院观察几天，床位要排队。',
    ageMin: 20,
    ageMax: 85,
    weight: 3,
    effect: fx((state) => {
      bump(state, { health: -6, income: -3, happiness: -3 });
    }),
  },
  {
    id: 'surgery',
    text: '手术排到了下周三，术后你在病房里数了十几天天花板。',
    ageMin: 20,
    ageMax: 85,
    weight: 3,
    effect: fx((state) => {
      bump(state, { health: -7, income: -4, happiness: -3, knowledge: 2 });
    }),
  },
  {
    id: 'mental_low',
    text: '有几个月你什么都不想做，早上睁眼先发呆半个小时。',
    ageMin: 15,
    ageMax: 85,
    weight: 5,
    condition: (state) => {
      const h = state?.stats?.happiness;
      return typeof h === 'number' && h < 75;
    },
    choice: {
      prompt: '这段日子，你打算怎么办？',
      options: [
        {
          id: 'clinic',
          label: '去看医生',
          detail: '挂号、排队、说明白，这一次不算逃跑。',
          apply: fx((state) => {
            bump(state, { health: 4, happiness: 4, income: -2, knowledge: 1 });
            mark(state, 'sawTherapist');
          }),
        },
        {
          id: 'endure',
          label: '自己扛过去',
          detail: '谁也不说，等它自己过去。',
          apply: fx((state) => {
            bump(state, { happiness: -6, health: -5, relations: -2 });
          }),
        },
        {
          id: 'friend',
          label: '找朋友说说',
          detail: '有人愿意听，你就先说一半。',
          apply: fx((state) => {
            bump(state, { relations: 5, happiness: 2, health: -1 });
          }),
        },
      ],
    },
    effect: fx((state) => {
      note(state, '那年你把很多话咽了回去，后来只学会了一件小事：别硬撑。');
    }),
  },
  {
    id: 'hospital_bill',
    text: '住院费结清了，账单的最后一个数字你看了很久，然后把它塞回抽屉。',
    ageMin: 30,
    ageMax: 90,
    weight: 2,
    effect: fx((state) => {
      bump(state, { income: -6, happiness: -4 });
    }),
  },
  {
    id: 'quit_smoking',
    text: '你把最后一包烟扔进了垃圾桶，第一周咳嗽，第二周轻松了。',
    ageMin: 25,
    ageMax: 80,
    weight: 2,
    effect: fx((state) => {
      bump(state, { health: 6, happiness: -2 });
      mark(state, 'quitSmoking');
    }),
  },
  {
    id: 'back_pain',
    text: '搬重物闪了一下腰，从此弯腰得慢一点，起身要扶一把东西。',
    ageMin: 35,
    ageMax: 80,
    weight: 3,
    effect: fx((state) => {
      bump(state, { health: -3, happiness: -2 });
    }),
  },

  // ── 家庭 ──────────────────────────────────────────────────────
  {
    id: 'wedding',
    text: '你们办了婚礼，酒席的菜一直上到晚上十点，最后只剩一盘花生。',
    ageMin: 20,
    ageMax: 60,
    weight: 4,
    effect: fx((state) => {
      bump(state, { relations: 8, happiness: 8, income: -5 });
      mark(state, 'married');
      note(state, '那天你穿的外套，袖口还是借来的。');
    }),
  },
  {
    id: 'first_child_born',
    text: '凌晨四点你听见第一声啼哭，握着他小小的手，一动也不敢动。',
    ageMin: 22,
    ageMax: 50,
    weight: 5,
    condition: (state) => !!state?.flags?.married,
    effect: fx((state) => {
      bump(state, { relations: 8, happiness: 9, health: -3, income: -3 });
      mark(state, 'hasChild');
      const children = Number.isFinite(state.flags.children) ? state.flags.children : 0;
      mark(state, 'children', children + 1);
      note(state, '你把手机调成静音，但每半小时还是要看一眼婴儿床。');
    }),
  },
  {
    id: 'family_funeral',
    text: '办了一场葬礼，很多亲戚来了，谁也没说话，只有纸钱在风里翻。',
    ageMin: 15,
    ageMax: 95,
    weight: 3,
    effect: fx((state) => {
      bump(state, { happiness: -10, relations: 3, health: -2 });
      note(state, '那天的路很长，你走在队伍中间，谁也没扶谁。');
    }),
  },
  {
    id: 'family_argument',
    text: '为一件小事你和父母吵了起来，饭桌上谁也没动筷子。',
    ageMin: 12,
    ageMax: 70,
    weight: 4,
    effect: fx((state) => {
      bump(state, { happiness: -7, relations: -3 });
    }),
  },
  {
    id: 'child_leaves_home',
    text: '孩子收拾好行李，说想自己闯闯，你站在门口没说话。',
    ageMin: 40,
    ageMax: 75,
    weight: 3,
    condition: (state) => Number.isFinite(state?.flags?.children) && state.flags.children > 0,
    effect: fx((state) => {
      bump(state, { relations: -3, happiness: -5, income: -2 });
      note(state, '你把门口的鞋架往里挪了挪，腾出一格，又觉得空。');
    }),
  },
  {
    id: 'sibling_wedding',
    text: '弟弟要结婚了，你被塞进一屋子不认识的亲戚中间，成了必须敬酒的那个。',
    ageMin: 20,
    ageMax: 60,
    weight: 2,
    effect: fx((state) => {
      bump(state, { relations: 4, happiness: 3, income: -1 });
    }),
  },
  {
    id: 'parents_ill',
    text: '父母的体检报告上也有红字，你连夜买了回家的票。',
    ageMin: 30,
    ageMax: 70,
    weight: 3,
    effect: fx((state) => {
      bump(state, { happiness: -6, relations: 3, income: -2, health: -1 });
    }),
  },
  {
    id: 'parent_passing',
    text: '父亲走了，你在他旧外套的口袋里摸到半张过期的车票。',
    ageMin: 45,
    ageMax: 85,
    weight: 2,
    effect: fx((state) => {
      bump(state, { happiness: -12, relations: -2, health: -3 });
      note(state, '你把他那件外套叠好，几年后还是没舍得扔。');
    }),
  },

  // ── 老年 ──────────────────────────────────────────────────────
  {
    id: 'retirement',
    text: '到了退休的年纪，手续办了，那天你没去上班，也没起床。',
    ageMin: 55,
    ageMax: 75,
    weight: 5,
    condition: (state) => !!state?.flags?.employed,
    effect: fx((state) => {
      bump(state, { income: -8, happiness: 3, health: -1, relations: 1 });
      mark(state, 'retired');
      note(state, '第一个不用看闹钟的早晨，你睡到了自然醒。');
    }),
  },
  {
    id: 'old_fall',
    text: '浴室里滑了一跤，股骨上从此多了颗钉子。',
    ageMin: 65,
    ageMax: 100,
    weight: 4,
    effect: fx((state) => {
      bump(state, { health: -12, happiness: -5, relations: 2 });
      note(state, '从此洗澡要坐着，家人说好了要扶你一把。');
    }),
  },
  {
    id: 'grandchild',
    text: '孙辈出生了，你抱了一下午，胳膊酸得抬不起来。',
    ageMin: 55,
    ageMax: 95,
    weight: 3,
    effect: fx((state) => {
      bump(state, { relations: 7, happiness: 8, health: -1 });
      mark(state, 'grandchild');
    }),
  },
  {
    id: 'spouse_lost',
    text: '老伴先走了，家里安静得不像话，你不太习惯一个人吃饭。',
    ageMin: 60,
    ageMax: 100,
    weight: 2,
    effect: fx((state) => {
      bump(state, { happiness: -14, relations: -5, health: -3 });
      mark(state, 'widowed');
    }),
  },
  {
    id: 'old_friend_dies',
    text: '老同学走了，你在讣告里看见了那个熟悉的名字。',
    ageMin: 60,
    ageMax: 100,
    weight: 2,
    effect: fx((state) => {
      bump(state, { happiness: -7, relations: -2 });
      note(state, '你翻出了那年的毕业照，发现自己已经认不出后排的人。');
    }),
  },
  {
    id: 'return_to_hometown',
    text: '你搬回了老家，熟人比你记忆里少了很多，路上被人叫出了小名。',
    ageMin: 60,
    ageMax: 95,
    weight: 2,
    effect: fx((state) => {
      bump(state, { happiness: 3, relations: 2, income: -2 });
    }),
  },

  // ── 特定国家 / 地区 ───────────────────────────────────────────
  {
    id: 'sahel_famine',
    text: '连续三年没下够雨，村口的井露了底，粮价一个月翻了三倍。',
    ageMin: 5,
    ageMax: 60,
    weight: 6,
    countries: ['NER', 'TCD', 'MLI', 'BFA', 'SDN', 'SOM', 'ETH', 'MRT', 'SEN', 'NGA'],
    weightFor: (state) => {
      const p = indicator(state, 'poverty');
      if (p === null) return 1;
      return clamp(0.5 + p / 15, 0.5, 3);
    },
    effect: fx((state) => {
      bump(state, { health: -12, happiness: -8, income: -5, knowledge: 1 });
      note(state, '那年你学会的第一件正经事是认粮价。');
    }),
  },
  {
    id: 'epidemic_west_africa',
    text: '疫区的消息一天比一天紧，诊所门口排起长队，街上的人开始绕路走。',
    ageMin: 0,
    ageMax: 80,
    weight: 5,
    countries: ['NGA', 'GHA', 'CIV', 'SEN', 'GIN', 'MLI', 'TCD'],
    effect: fx((state) => {
      bump(state, { health: -10, happiness: -6, income: -3 });
      note(state, '那几个月，街上最常被问的一句话是「吃了没」。');
    }),
  },
  {
    id: 'epidemic_central_africa',
    text: '消息是从邻村传过来的，随后是路边的空摊位，再后来是关着的门。',
    ageMin: 0,
    ageMax: 80,
    weight: 5,
    countries: ['COD', 'COG', 'CMR', 'CAF', 'GAB', 'AGO'],
    effect: fx((state) => {
      bump(state, { health: -10, happiness: -7, income: -3 });
    }),
  },
  {
    id: 'lagos_flood',
    text: '拉各斯的雨季淹了整条街，水到腰，摊主把菜摆到了屋顶上。',
    ageMin: 5,
    ageMax: 70,
    weight: 3,
    countries: ['NGA'],
    effect: fx((state) => {
      bump(state, { income: -4, health: -3, happiness: -4 });
    }),
  },
  {
    id: 'conscription_israel',
    text: '征兵通知下来了，家里谁也没拦你，你去了。',
    ageMin: 18,
    ageMax: 30,
    weight: 5,
    countries: ['ISR'],
    effect: fx((state) => {
      bump(state, { health: -3, knowledge: 3, relations: 4, happiness: -3 });
      mark(state, 'served');
    }),
  },
  {
    id: 'conscription_korea',
    text: '入伍通知贴到了家门口，你背着包上了长途车。',
    ageMin: 18,
    ageMax: 28,
    weight: 5,
    countries: ['KOR'],
    effect: fx((state) => {
      bump(state, { health: -3, knowledge: 3, relations: 4, happiness: -4 });
      mark(state, 'served');
    }),
  },
  {
    id: 'diwali_india',
    text: '排灯节到了，街上挂满油灯，邻居把窗台擦得干干净净。',
    ageMin: 5,
    ageMax: 85,
    weight: 4,
    countries: ['IND'],
    effect: fx((state) => {
      bump(state, { happiness: 6, relations: 3, income: -1 });
    }),
  },
  {
    id: 'eid_gathering',
    text: '开斋节的清早，院子里支起长桌，一整个家族坐了下来。',
    ageMin: 8,
    ageMax: 90,
    weight: 4,
    countries: ['SAU', 'EGY', 'IDN', 'PAK', 'MAR', 'BGD', 'IRN', 'TUR', 'DZA'],
    effect: fx((state) => {
      bump(state, { happiness: 6, relations: 4, income: -1 });
    }),
  },
  {
    id: 'california_wildfire',
    text: '山火烧到了山脚，天是橘红色的，你把湿毛巾捂在了门缝上。',
    ageMin: 15,
    ageMax: 90,
    weight: 2,
    countries: ['USA', 'CAN'],
    effect: fx((state) => {
      bump(state, { health: -6, income: -5, happiness: -5, relations: 2 });
    }),
  },
];

// ── 判定与抽取 ──────────────────────────────────────────────────────

/**
 * 某条事件在「这个年龄、这个国家」是否成立。
 *
 * 三个条件全要满足：
 *   ① 年龄落在 [ageMin, ageMax]（闭区间）；
 *   ② 如果事件限定了国家，那么 country.iso3 必须在名单里
 *      （country 为空时，限定国别的事件一律不成立）；
 *   ③ 如果事件带条件，条件函数必须返回 true。
 *
 * ⚠️ 条件函数拿到的 state 可能不存在（调用方没给）。
 *    本模块里的条件都写成「拿不到 state 就不成立」，所以没有 state 时
 *    条件类事件会被跳过；条件函数若能容忍 state 缺失，返回 true 即可照常生效。
 *
 * @param {object} event 事件定义
 * @param {number} age 年龄
 * @param {{iso3?:string}|null|undefined} country 所在国家
 * @param {object} [state] 玩家状态（给条件函数用）
 * @returns {boolean}
 */
export function eventApplies(event, age, country, state) {
  if (!event || typeof event !== 'object') return false;
  if (typeof age !== 'number' || !Number.isFinite(age)) return false;
  if (age < event.ageMin || age > event.ageMax) return false;

  if (Array.isArray(event.countries) && event.countries.length > 0) {
    const iso3 = country && typeof country === 'object' ? country.iso3 : null;
    if (typeof iso3 !== 'string' || iso3.length === 0) return false;
    const hit = event.countries.some(
      (c) => typeof c === 'string' && c.toUpperCase() === iso3.toUpperCase(),
    );
    if (!hit) return false;
  }

  if (typeof event.condition === 'function') {
    let ok = false;
    try {
      ok = event.condition(state) === true;
    } catch {
      ok = false;
    }
    if (!ok) return false;
  }

  return true;
}

/**
 * 抽一条事件。
 *
 * 流程：过滤 → 算权重 → 加权抽一个。
 *   - 过滤：年龄 ∧ 国别 ∧ 条件 ∧ 还没触发过（fired）；
 *   - 权重：基础 weight × weightFor(state)（有 weightFor 才乘）；
 *     weightFor 返回非正数 = 这条事件这一轮不参加抽取；
 *   - 没有候选时**一个随机数都不消耗**，直接返回 null。
 *
 * ⚠️ 本函数**不修改 fired**。抽中之后由调用方把 event.id 登记进 fired，
 *    这样「同一个事件一辈子只发生一次」的责任落在事件结算那一层，
 *    本函数保持纯函数、便于测试。
 *
 * @param {() => number} rng 注入的随机数发生器
 * @param {number} age 年龄
 * @param {{iso3?:string}|null|undefined} country 所在国家
 * @param {Set<string>} fired 已经触发过的事件 id
 * @param {object} [state] 玩家状态（给条件与 weightFor 用）
 * @param {Array<object>} [pool=EVENTS] 候选池（默认整个事件池；测试与扩展用）
 * @returns {object|null} 抽中的事件；没有候选时返回 null
 */
export function rollEvent(rng, age, country, fired, state, pool = EVENTS) {
  if (typeof rng !== 'function') {
    throw new Error('rollEvent: rng 必须是函数');
  }
  const source = Array.isArray(pool) ? pool : EVENTS;
  const used = fired instanceof Set ? fired : new Set();

  const candidates = [];
  for (const event of source) {
    if (!event || typeof event !== 'object' || typeof event.id !== 'string') continue;
    if (used.has(event.id)) continue;
    if (!eventApplies(event, age, country, state)) continue;

    let w = event.weight;
    if (typeof event.weightFor === 'function') {
      const dynamic = event.weightFor(state);
      w *= typeof dynamic === 'number' && Number.isFinite(dynamic) ? dynamic : 0;
    }
    if (!(w > 0)) continue;

    candidates.push({ w, event });
  }

  // 没有候选 → 不消耗任何随机数
  if (candidates.length === 0) return null;

  const index = weighted(rng, candidates);
  return candidates[index].event;
}
