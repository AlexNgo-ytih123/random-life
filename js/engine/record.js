/**
 * js/engine/record.js
 * 死亡证明与流水账：把一生的结果整理成可供 UI、分享图、_stats 页面消费的结构。
 */

import { sampleCause } from './causes.js';
import { bandOf as bandOfMortality } from './mortality.js';

const SOURCE_META = [
  { key: 'lifeExp', name: '世界银行 / 生命预期：SP.DYN.LE00.IN', url: 'https://api.worldbank.org/v2/country/all/indicator/SP.DYN.LE00.IN' },
  { key: 'schooling', name: '平均受教育年限：Hanckel-Lewnard (Barro-Lee)', url: 'https://ourworldindata.org/grapher/mean-years-of-schooling' },
  { key: 'immunization', name: 'WHO 免疫接种率 ( measles )', url: 'https://api.worldbank.org/v2/country/all/indicator/SH.IMM.MEAS' },
  { key: 'homicide', name: 'UNODC / World Bank VC.IHR.PSRC.P5', url: 'https://api.worldbank.org/v2/country/all/indicator/VC.IHR.PSRC.P5' },
];

function countryIso(state) {
  if (!state) return null;
  if (state.country && state.country.iso3) return state.country.iso3;
  if (typeof state.country === 'string') return state.country;
  if (state.iso3) return state.iso3;
  return null;
}

function countryName(state) {
  if (state.country && (state.country.name || state.country.nameEn)) return state.country.name || state.country.nameEn;
  return countryIso(state) || '未知之地';
}

export function buildDeathRecord(state, opts) {
  opts = opts || {};
  const rng = opts.rng;
  const migration = {
    name: state.name || (state.flags && state.flags.name) || '无名的人',
    sex: state.sex || (state.flags && state.flags.sex) || 'unknown',
    birthPlace: countryName(state),
    iso3: countryIso(state),
    birthDate: (state.birthYear || 2026) + '-1-1',
    deathDate: ((state.birthYear || 2026) + (state.deathAge ?? state.age ?? 0)) + '-12-31',
    age: state.deathAge != null ? state.deathAge : (state.age != null ? state.age : 0),
    globalIndex: state.globalIndex ?? state.country?.globalIndex ?? null,
    cause: null,
    causeShare: null,
    stats: Object.assign({}, state.stats || {}),
    timeline: Array.isArray(state.timeline) ? state.timeline.slice().sort((a, b) => a.age - b.age) : [],
    year: state.birthYear || 2026,
    yearsLived: state.age != null ? state.age : (state.deathAge != null ? state.deathAge : 0),
    peakIncome: state.stats && typeof state.stats.income === 'number' ? state.stats.income : null,
    achieved: state.flags || {},
    sources: SOURCE_META.slice(),
    dataYears: {},
  };
  if (state.country && state.country.indicators) {
    const inds = state.country.indicators;
    for (const k of Object.keys(inds)) {
      const v = inds[k];
      migration.dataYears[k] = (v && v.year) || null;
    }
  }

  const mix = opts.causeMix || null;
  const band = bandOfMortality(migration.age);

  const causeMeta = opts.causeMeta || {};

  if (mix) {
    const res = sampleCause(rng || (() => 0.5), mix, band, causeMeta);
    if (res.available) {
      migration.cause = res.causeLabel;
      migration.causeShare = res.share;
      migration.causeObject = res;
    } else {
      migration.cause = '未知';
      migration.causeShare = null;
    }
  } else {
    // best effort: 借用 record 里 epidemiologicalagnostic 默认
    migration.cause = '未知';
    migration.causeShare = null;
  }

  return migration;
}

function bandOfFallback(age) {
  age = age || 0;
  if (age <= 1) return 0;
  if (age <= 4) return 1;
  if (age <= 14) return 2;
  if (age <= 39) return 3;
  if (age <= 59) return 4;
  if (age <= 79) return 5;
  return 6;
}

export function buildShareText(state, opts = {}) {
  const rec = opts.record || buildDeathRecord(state, opts);
  const lines = [];
  lines.push(`我在 ${rec.birthPlace} 活了 ${rec.age} 年。`);
  lines.push(`死因：${rec.cause}${rec.causeShare ? '（' + rec.causeShare.toFixed(1) + '%）' : ''}。`);
  lines.push(`知识 ${rec.stats.knowledge || 0} / 健康 ${rec.stats.health || 0} / 关系 ${rec.stats.relations || 0} / 收入 ${rec.stats.income || 0} / 幸福 ${rec.stats.happiness || 0}`);
  lines.push(`数据来源：世界银行 • Our World in Data • 联合国`);
  return lines.join('\n');
}

// 兼容 Plan 中提到的 life.js 接口
export function simulateLife(_world, _options) {
  return {};
}
