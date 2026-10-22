// mulberry32：32 位种子，周期 2^32，统计性质足够好且实现极短。
export function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function uniform(rng, min, max) {
  return min + rng() * (max - min);
}

export function pick(rng, items) {
  return items[Math.floor(rng() * items.length)];
}

export function weighted(rng, items) {
  let total = 0;
  for (const it of items) total += it.w;
  if (total <= 0) throw new Error('weighted: 总权重必须为正');
  let roll = rng() * total;
  for (let i = 0; i < items.length; i++) {
    roll -= items[i].w;
    if (roll < 0) return i;
  }
  return items.length - 1;
}

// Box–Muller
export function logNormal(rng, median, sigma) {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return median * Math.exp(sigma * z);
}
