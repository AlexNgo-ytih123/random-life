# Random Life — 设计文档

> 一个人生模拟游戏：你被随机生在地球上某个地方，用那地的真实统计活完一生，
> 人生每个阶段的关键决定由你替他做。
>
> 状态：设计已定稿，等待批准后进入实施计划阶段
> 日期：2026-10-22

---

## 1. 目标与非目标

### 目标
- **全球随机出生**：出生地按各国实际出生人口加权抽取，玩家无法选择。
- **真实统计驱动**：预期寿命、婴儿/儿童死亡、死因结构、人均收入、基尼、城镇化、
  教育年限、生育率、失业率、凶杀率、医疗自付比例、吸烟率等，全部来自公开统计接口。
- **逐年推进 + 每年选重点**：每一年玩家选一个「本年重点」，遇到人生岔路口时做选择。
- **一次就过**：一条命走完就到死亡证明，不能重来（可用种子复现同一条命）。
- **可分享**：URL 带种子，任何人打开看到完全相同的一生。
- **像素长卷演出**：192×60 程序化像素场景随人生变化，旁白用 DOM 层。
- **时光机**：可选 1950–2025 的出生年，**使用那一年真实的历史统计**。

### 非目标
- 不做账号系统、不做广告、不做内购。
- 不做多语言 v1（结构上预留 i18n）。
- 不做像素美术资产（全部程序化生成，仓库零二进制资源）。
- 不追求"像素画得像原版"——画法、配色、角色造型全部自创。

---

## 2. 与既有作品的关系（原创性边界）

| 来源 | 借鉴 | 明确不做 |
|---|---|---|
| `1in8b.life`（原版） | 玩法内核：随机出生 → 真实统计 → 替他决策 → 死亡记录 | 不复制其代码、文案、像素素材、数据管线 |
| `huongvnn/1in8blifel-`（参考实现，越南语） | **技术思路**：程序化像素渲染的 192×60 栅格、调色板注入、Bayer 抖动、确定性哈希、自动描边、逐层画家算法 | **不复制任何代码、精灵矩阵、调色板表、文案**。该仓库无自身许可文件，其角色矩阵注释为「Full Authentic Character Sprite Matrices」（疑似源自原版 Hipo 的 MIT 素材）——一律不取用 |

**本项目全部代码自写**，数据来自公开接口并逐条标注出处与许可。

### 2.1 对参考实现的明确改进（差异化主张）

| 参考实现 | 本项目 |
|---|---|
| 死亡年龄 = 预期寿命 ±20 岁三角扰动（`Math.random()*2-1`） | **Gompertz 年龄别死亡力逐年抽样**，用 e₀ / 婴儿死亡率 / 5 岁以下死亡率三点标定 |
| 全程 `Math.random()` | **mulberry32 种子随机**，同种子 → 同一生 → 可分享、可回归测试 |
| 零测试，单文件 634KB、12460 行内联脚本 | ES 模块 + `node:test`，引擎 100% 可测 |
| "时光机"只改年份标签，统计仍是最新快照 | **真历史数据**（UN WPP 1950–2023 逐年回溯） |
| 5 年段死亡率被当作年度率使用、婴儿死亡在生存曲线上被抹掉 | 生命表按 1 年龄构建，婴儿段单独建模 |
| 国籍 → 肤色硬映射 | 外观与国籍**解耦**，由种子独立随机 |
| 每帧全场景重栅格化（25fps） | 场景仅在状态变化时重绘，动画用 DOM 过渡 |
| 无分享卡、无 URL 复现 | URL 种子复现 + Canvas 合成分享卡 PNG |
| 状态字段约 55 个，运行时还在偷偷加字段；两套统计词汇表靠手写适配器桥接 | 单一统计词汇表；状态由构造函数生成，带 schema 版本号 |

---

## 3. 玩家体验流程

```
落地页 ──▶ 出生设置 ──▶ 出生仪式 ──▶ 逐年推进 ⇄ 重点/决策 ──▶ 死亡证明 ──▶ 分享
  │          │             │              │                        │
  │          │             │              └─ 时光机：选出生年 ─────┘
  │          │             └─ 抽国家 / 性别 / 家庭经济 / 姓名
  │          └─ 出生权重口径（按出生人口 / 按现有人口）、一生时长、种子（可留空随机）
  └─ 实时计数器：此刻全球有多少人出生 / 死亡
```

### 3.1 逐年推进
- 每年一个「重点」选择（用功读书 / 学门手艺 / 挣钱 / 养身体 / 处关系 / 陪家人），
  决定当年时间分配 → 影响知识、健康、关系、收入机会、幸福的增量。
- 人生岔路口（入学、中考/升学、志愿填报、首次就业、购房、婚育、疾病、退休…）
  在特定年龄触发，给 2–4 个选项，选项改变后续概率而非直接定生死。
- 随机事件按年龄区间 × 国别特征加权抽取；多数自动发生（只叙述），少数带选择。
- 时间流速：可选 30 分钟 / 1 小时 / 1.5 小时走完一生；可暂停、1–16× 加速、自动模式。

### 3.2 死亡证明
- 死因：按**死亡时的年龄**在**该国该年龄段的死因结构**中抽取。
- 附：出生信息、一生流水账、关键数据回看、同批出生者（4 个同年同刻出生的对照人生）、
  数据出处标注。

---

## 4. 引擎设计

纯函数优先，零 DOM 依赖，浏览器与 Node 共用同一套 ES 模块。

### 4.1 模块与职责

| 模块 | 职责 | 关键导出 |
|---|---|---|
| `engine/rng.js` | mulberry32 种子随机 + 抽样工具（整数/浮点/加权/正态/对数正态） | `makeRng`, `pick`, `weighted`, `logNormal` |
| `engine/draw.js` | 出生抽样：国家 / 性别 / 家庭经济 / 城乡 / 姓名 | `drawBirthplace`, `drawSex`, `drawFamily` |
| `engine/mortality.js` | 死亡力构造与标定、逐年 hazard 抽样 | `buildMortality`, `sampleDeathAge` |
| `engine/causes.js` | 死因结构：按国别 + 年龄段加权 | `sampleCause` |
| `engine/focus.js` | 重点定义与年度资源分配 | `FOCUSES`, `applyFocus` |
| `engine/decisions.js` | 人生岔路口定义与判定 | `DECISIONS`, `availableDecisions` |
| `engine/events.js` | 随机事件池与抽取 | `EVENTS`, `rollEvent` |
| `engine/stages.js` | 学业 / 职业 / 收入 / 家庭 / 健康轨迹 | `advanceEducation`, `advanceCareer`, `advanceFamily` |
| `engine/life.js` | 逐年编排，产出完整人生记录 | `simulateLife` |
| `engine/record.js` | 死亡证明、流水账、分享文本 | `buildDeathRecord` |

### 4.2 死亡模型（核心）

**输入**（每个国家 × 出生年 × 性别）：
- `e0` 预期寿命（分性别：World Bank `SP.DYN.LE00.IN` / `.FE.` / `.MA.`）
- `m0` 婴儿死亡率（`SP.DYN.IMRT.IN`，每千活产）
- `q5` 5 岁以下死亡率（`SH.DYN.MORT`，每千活产）
- 死因三类占比（`SH.DTH.COMM.ZS` / `SH.DTH.NCOM.ZS` / `SH.DTH.INJR.ZS`）

**构造年龄别死亡力 μ(x)**（x 为整数年龄）：

1. `q0 = m0 / 1000`；`μ(0) = -ln(1 - q0)`。
2. 1–4 岁：`q1_4 = (q5 - q0) / 4`（近似均布），`μ(x) = -ln(1 - q1_4)`。
3. 5–14 岁：从 `μ(4)` 线性插值到 15 岁的成人水平 `μ15`。
4. 15 岁及以上：**Gompertz** `μ(x) = β·exp(γ·(x-15))`。
   - `γ = clamp(0.075 + (78 - e₀) × 0.0009, 0.075, 0.115)`（单位：每年）。
     真实人群的 Gompertz 斜率约 0.075–0.115/年；寿命越短，衰老越陡。
   - `β` **由 e₀ 标定**：在 log 空间二分求 `β`，使生命表算出的
     `e0_model = Σ_{x=0}^{119} l(x)` 等于 `e0_data`（`e0_model` 关于 `β` 单调递减）。
     实际解落在 `β ∈ [5e-5, 5e-4]`。
   - **已知局限**：纯 Gompertz 在 80 岁后高估死亡（`l(80)` 约 0.57，真实约 0.72），
     即高龄段被略微"压缩"；中段（40–70 岁）吻合良好。后续可引入 Makeham 项
     或改用 Royston–Makeham 对数型改善。
5. 截断到 120 岁。

**逐年抽样**：第 x 年生存概率 `p = exp(-μ(x))`；`rng < 1-p` → 当年死亡。
死亡年龄即死亡年份所在年龄。

**死因**（`engine/causes.js`）：
- 取死亡年龄所在年龄段的国别三类占比，按年龄重加权：
  `<5 岁` 传染/围产期权重上浮；`15–49` 伤害与传染上浮；`≥60` 非传染上浮。
- 逆 CDF 抽样 → 三类之一（传染性疾病 / 非传染性疾病 / 伤害）；
  特殊死因：孕产妇（用 `SH.STA.MMRT` 在育龄期给微小概率）、婴幼儿（出生缺陷/围产期）单列为子类。
- 数据缺失时**显式返回"数据不可用"，绝不编造**（沿用参考实现的诚实原则）。

### 4.3 出生抽样
- **国家**：`births[country][birthYear]` 加权（UN WPP `number-of-births`）；
  切到「按现有人口」模式则用 `population[country][birthYear]`。
- **性别**：出生性别比 `SP.POP.SBRT.IN`（缺失则 1.05）。
- **家庭经济**：国家内收入分布用**对数正态**，参数由该国基尼反解：
  `σ = gini / (2 × Φ⁻¹(0.75))`（Gini 对数正态近似），中位数按人均 GDP PPP 缩放。
  家庭起点再叠加城乡（`SP.URB.TOTL.IN.ZS`）与父亲职业（按农业就业占比 `employment-in-agriculture` 抽样）。
- **姓名**：按 OWID 世界区域 + 姓氏表 + 随机名，格式随区域变化。

### 4.4 重点（focus）系统
```js
{ id:'study',  label:'用功读书', effects:{ knowledge:+6, health:-1, relations:-1, income:0, happiness:-1 } }
{ id:'trade',  label:'学门手艺', effects:{ knowledge:+1, health:-2, relations:+1, income:+4, happiness:0 } }
{ id:'earn',   label:'挣钱',     effects:{ knowledge:-1, health:-2, relations:-2, income:+7, happiness:-1 } }
{ id:'health', label:'养身体',   effects:{ knowledge:-1, health:+7, relations:0, income:0, happiness:+2 } }
{ id:'social', label:'处关系',   effects:{ knowledge:-1, health:0, relations:+7, income:+1, happiness:+3 } }
{ id:'family', label:'陪家人',   effects:{ knowledge:-1, health:+1, relations:+4, income:-1, happiness:+4 } }
```
（数值为初值，靠引擎里的**统计平衡**与**曲线合理性**测试来校准，不靠手感。）

### 4.5 统计量
`health` / `happiness` / `knowledge` / `relations`，0–100。
- health：随年龄自然下降（40 岁后加速），被就医/锻炼/职业暴露/慢性病事件改变；归零 → 死亡。
- knowledge：由教育年限起点 + 重点累积 + 升学事件决定，上限约 70 后收益递减。
- relations：由婚姻/子女/亲密度/社交重点累积，丧偶/丧亲/长期异地下跌。
- happiness：由收入（对数）、健康、关系、债务、丧亲事件共同决定。

---

## 5. 数据层

### 5.1 数据源清单（全部已实测可访问）

| 数据 | 来源 | 指标 / 序列 | 覆盖 | 许可 |
|---|---|---|---|---|
| 出生人口 | OWID ← UN WPP 2024 | `number-of-births` | 1950–2023 + 投影至 2100 | CC BY 4.0 / UN CC BY 3.0 IGO |
| 预期寿命 | OWID ← UN WPP | `life-expectancy` | 1950–2023 | 同上 |
| 人口 | OWID ← UN WPP | `population` | –10000–2023 | 同上 |
| 生育率 | OWID ← UN WPP | `total-fertility-rate` | 1950–2023 | 同上 |
| 儿童死亡率 | OWID ← UN IGME | `child-mortality-igme` | 1957– | 同上 |
| 教育年限 / 农业就业 | OWID | `mean-years-of-schooling`, `employment-in-agriculture` | 1870– / 1991– | 同上 |
| 凶杀率 | OWID ← UNODC | `homicide-rate-unodc` | 1990– | 同上 |
| 孕产妇死亡率 | OWID | `maternal-mortality` | 1985– | 同上 |
| 吸烟率 | OWID | `share-of-adults-who-smoke` | 2000– | 同上 |
| 预期寿命(分性别) | World Bank API | `SP.DYN.LE00.IN` `.FE.` `.MA.` | 1960– | CC BY 4.0 |
| 婴儿/5岁以下死亡 | World Bank API | `SP.DYN.IMRT.IN`, `SH.DYN.MORT` | 1960– | CC BY 4.0 |
| 死因三类占比 | World Bank API | `SH.DTH.COMM/NCOM/INJR.ZS` | 2000– | CC BY 4.0 |
| 人均 GDP(PPP) | World Bank API | `NY.GDP.PCAP.PP.CD` | 1990– | CC BY 4.0 |
| 基尼 | World Bank API | `SI.POV.GINI` | 1981– | CC BY 4.0 |
| 城镇化 | World Bank API | `SP.URB.TOTL.IN.ZS` | 1960– | CC BY 4.0 |
| 出生性别比 | World Bank API | `SP.POP.SBRT.IN` | 1960– | CC BY 4.0 |
| 失业率 | World Bank API | `SL.UEM.TOTL.ZS` | 1991– | CC BY 4.0 |
| 医疗自付比例 | World Bank API | `SH.XPD.OOPC.CH.ZS` | 2000– | CC BY 4.0 |
| 医生密度 | World Bank API | `SH.MED.PHYS.ZS` | 2000– | CC BY 4.0 |
| 孕产妇死亡率(ratio) | World Bank API | `SH.STA.MMRT` | 2000– | CC BY 4.0 |
| 贫困发生率 | World Bank API | `SI.POV.DDAY` | 1981– | CC BY 4.0 |
| 接种率 | World Bank API | `SH.IMM.MEAS` | 1980– | CC BY 4.0 |
| 出生性别比/治安等 | World Bank API | `VC.IHR.PSRC.P5` | 1990– | CC BY 4.0 |
| 世界地图底图 | npm `world-atlas`（构建期） | `land-110m` TopoJSON | – | Public Domain (Natural Earth) |
| 国家中心点 | npm `world-countries`（构建期） | latlng | – | MIT |

> **WHO GHE 2023 细粒度死因**（参考实现使用，CC BY-NC-SA 3.0 IGO，含 NC 非商业条款）**v1 不引入**：
> 接口未对齐、非商业条款限制、且 WB 三大类足以支撑 v1。留作后续可选增强，届时单独标注许可。

### 5.2 产物与元数据

```
data/
  countries.json    // 每国：iso3, name, region, 指标值 + 数据年份 + 来源
  births.json       // iso3 -> { year: {actual, projected} }  出生人口
  history.json      // iso3 -> { year: {e0, population, tfr, ...} } 历史序列（时光机）
  causes.json       // iso3 -> { year: {communicable, ncd, injury} }
  map.json          // 简化陆地多边形 + 国家中心点（quantize 后）
  meta.json         // 每项数据的来源 URL、许可、检索时间、指标口径说明
```

**诚实原则**：每个指标都带 `{value, year, source}`，UI 在数据旁展示年份；
某项缺失时用**最近可得年份**并明确标注，或标记为不可用——绝不静默填 0。

### 5.3 抓取管线
```
tools/fetch-worldbank.mjs   → 拉 WB 指标 → data/raw/worldbank-*.json
tools/fetch-owid.mjs        → 拉 OWID CSV → data/raw/owid-*.csv
tools/build-world-data.mjs  → 清洗/对齐/插值 → data/*.json（含 meta）
tools/build-map.mjs         → world-atlas → data/map.json
```
`npm run fetch-data` 一次跑完；产物提交进仓库，**游戏运行时零网络请求**。

---

## 6. 像素渲染器（自写）

**与参考实现相同的骨架，不同的代码与画法。**

- 栅格：**192×60 RGBA**，`Uint8ClampedArray`，支持 alpha（参考实现无 alpha，null 变黑）。
- 图层：画家算法，层序 = 天空渐变 → 天体 → 远景地形 → 中景聚落 → 地面 → 住所 →
  工作地道具 → 人物 → 前景植被 → 天气叠加。
- 调色板：**自创** 32 色 × 2 主题（`paper` / `night`），支持按气候带（寒/温/干/热/高原）
  与情绪（低/中/高）做色彩分级。
- 天空：3 段渐变 + **Bayer 4×4 有序抖动**过渡带（自实现，灵感来自参考实现的做法）。
- 角色：**参数化人形**（头/躯干/四肢矩形组合），4 种体型档（婴儿/儿童/成人/老人），
  肤色与国籍**无关**，由种子独立取样。
- 住所：按家庭财富档（茅屋/平房/楼房/宅邸）与城乡切换形态。
- 聚落：按城镇化率决定天际线密度，按地区决定植被（针叶/阔叶/棕榈/稀树/无）。
- 确定性：场景细节用 `FNV-1a(seedString) → xorshift32`，同一出生地永远长得一样。
- **性能**：场景只在状态变化时重绘一次，动画交给 DOM（淡入淡出/位移），
  绝不每帧重栅格化。
- 旁白与统计文字**全部在 DOM 层**，画布只画像素。

---

## 7. 目录结构

```
random-life/
├─ index.html
├─ README.md  LICENSE  CONTRIBUTING.md
├─ package.json            # 仅 scripts，无运行时依赖
├─ css/  base.css layout.css theme.css pixel.css
├─ js/
│  ├─ main.js
│  ├─ engine/  rng draw mortality causes focus decisions events stages life record
│  ├─ data/    loader countries names scenes
│  ├─ render/  raster palette sprites scene narrator
│  └─ ui/      landing birth play ending chart storage share
├─ data/     countries.json births.json history.json causes.json map.json meta.json
├─ tools/    fetch-worldbank.mjs fetch-owid.mjs build-world-data.mjs build-map.mjs serve.mjs
├─ tests/    *.test.js  (node:test)
└─ docs/plans/
```

- 浏览器加载：`<script type="module" src="./js/main.js">`，无构建步骤。
- 本地开发：`npm start` → `node tools/serve.mjs`（零依赖静态服务器）。
- 测试：`npm test` → `node --test tests/`。
- 部署：GitHub Pages（仓库根目录）。

---

## 8. 测试策略（TDD，每个任务先写失败的测试）

| 测试文件 | 断言 |
|---|---|
| `rng.test.js` | 同种子产生同序列；不同种子不同；抽样在界内；加权抽样频率 ∝ 权重（卡方粗检） |
| `mortality.test.js` | 拟合后 `e0_model` 与数据差 < 0.5 岁；10 万次模拟平均寿命落在 `e0 ± 1`；婴儿死亡率 ≈ `m0/1000`；5 岁以下死亡率 ≈ `q5/1000`；高 e0 国平均死亡年龄显著高于低 e0 国；死亡年龄分布右偏（众数 < 均值） |
| `causes.test.js` | 三类占比之和为 1（±0.01）；老年样本非传染占比 > 儿童样本；数据缺失时返回 unavailable 而非编造 |
| `draw.test.js` | 国家抽样频率 ∝ 出生人口（卡方粗检）；性别比 ≈ 1.05；家庭收入分布基尼 ≈ 国家基尼（±0.05） |
| `focus.test.js` | 每个重点对各统计量的作用方向与幅度符合定义；总时间分配守恒 |
| `life.test.js` | 同种子 → 同一条命（逐字段相等）；不同种子 → 不同；一生长度合理；教育/收入/婚育轨迹不出现负值或越界 |
| `history.test.js` | 1950 年出生者使用的 e₀ 与 1950 年数据一致；插值不产生负值或阶跃 |
| `render.test.js` | 栅格尺寸正确；调色板完整（每色不透明）；场景在同输入下逐像素一致；无 null 像素泄漏 |

**回归护栏**：任何改动后 `npm test` 必须全绿；死亡模型的统计断言是核心护栏。

---

## 9. 里程碑

| 阶段 | 交付 | 验收 |
|---|---|---|
| M0 骨架 | package.json、目录、测试运行器、静态服务器 | `npm test` 空跑通过，`npm start` 出页面 |
| M1 数据 | 抓取管线 + `data/*.json` + meta 出处 | `node tools/build-world-data.mjs` 可重复产出；meta 覆盖全部指标 |
| M2 引擎 | rng / draw / mortality / causes / focus / decisions / events / life | 统计断言全绿（e₀ 拟合、抽样频率、基尼还原） |
| M3 渲染 | raster / palette / sprites / scene | 像素测试绿；浏览器里能看到一年一景 |
| M4 UI | 落地页 → 出生仪式 → 逐年推进（重点 + 决策）→ 死亡证明 | 端到端可玩通 |
| M5 时光机 | 1950–2025 历史数据接入 + 年份标注 | 1950 年样本使用 1950 年统计 |
| M6 分享/存档 | URL 种子、分享卡 PNG、localStorage 存档 | 同 URL 两次打开得到同一生 |
| M7 收尾 | README、许可与出处页、Pages 部署、CI | 线上可访问；`npm test` 在 CI 绿 |

---

## 10. 风险与对策

| 风险 | 对策 |
|---|---|
| 死亡模型标定不收敛 | 二分法带边界裁剪；`e₀` 标定失败时回退到 Gompertz 纯解 + 明确记录 |
| 数据缺失（尤其小国、分性别） | 每项带年份；回退到区域中位数并在 UI 标注；缺失不填 0 |
| 像素场景美术效果不佳 | 先保证可读性（剪影 + 色彩分级），再迭代；所有图形程序化，零资产依赖 |
| 单文件膨胀 | 强制 ES 模块边界；渲染/引擎/UI 分层；每个模块单一职责 |
| 出生国分布与真实不符 | `draw.test.js` 卡方粗检拦住 |
| 与原版过于相似 | 差异化已列在 §2.1；视觉与文案全部自创 |
| npm 依赖污染 | 依赖仅存在于 `devDependencies`，且只被 `tools/` 使用；游戏运行时零依赖 |

---

## 11. 决策记录

- 主题：全球随机出生的人生模拟（原版同题材），非城市/生态/文明模拟。
- 技术栈：纯静态 HTML + 原生 ES 模块，零构建、零运行时依赖。
- 数据：官方开放数据接口抓取 → 构建期生成静态 JSON，运行时零网络。
- UI：像素长卷演出（192×60 程序化像素 + DOM 旁白）。
- 决策密度：每年选重点 + 人生岔路口选择。
- 首版范围：单局 + 死亡证明 + 流水账 + 时光机(1950–2025) + 种子分享。
- 名称：**Random Life**（GitHub 仓库 `random-life`）。
- GitHub：**公开仓库**，账号 `AlexNgo-ytih123`。
