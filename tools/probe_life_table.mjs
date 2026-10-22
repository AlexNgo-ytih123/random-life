#!/usr/bin/env node
/** Probe for life-table anchors (e65, survival to 65) and check data year coverage. */
const SLUGS = [
  "life-expectancy-at-age-65", "life-expectancy-65", "survival-to-age-65",
  "survivors-to-age-65", "expected-years-of-life-left-at-age-65",
  "life-expectancy-at-age-15", "life-expectancy-at-70", "life-expectancy-at-age-80",
  "adult-mortality", "probability-of-dying-between-15-and-60",
  "adult-mortality-rate", "mortality-rate-of-adults",
];
console.log("--- life table slugs ---");
for (const s of SLUGS) {
  try {
    const r = await fetch(`https://ourworldindata.org/grapher/${s}.csv`, { signal: AbortSignal.timeout(15000) });
    if (r.status !== 200) { console.log(`--   ${s} (${r.status})`); continue; }
    const t = await r.text(); const l = t.split("\n");
    console.log(`OK   ${s} lines=${l.length}\n     ${l[0]}\n     ${l[1] || ""}`);
  } catch (e) { console.log(`--   ${s} ${e.message}`); }
}

console.log("\n--- year coverage of key OWID series ---");
for (const s of ["number-of-births", "life-expectancy", "population", "total-fertility-rate", "mean-years-of-schooling"]) {
  try {
    const r = await fetch(`https://ourworldindata.org/grapher/${s}.csv`, { signal: AbortSignal.timeout(25000) });
    const t = await r.text(); const l = t.split("\n").filter(Boolean);
    const head = l[0].split(",");
    const yi = head.indexOf("Year");
    let min = 1e9, max = -1e9, proj = 0, rows = 0, countries = new Set();
    for (let i = 1; i < l.length; i++) {
      const p = l[i].split(",");
      const y = +p[yi];
      if (!Number.isFinite(y)) continue;
      min = Math.min(min, y); max = Math.max(max, y); rows++;
      if (p[0]) countries.add(p[0]);
      if (head.length > 4 && p[4] && p[4].trim()) proj++;
    }
    console.log(`${s}: years ${min}–${max}, rows=${rows}, entities=${countries.size}, projectedRows=${proj}`);
    console.log(`   header: ${head.join(" | ")}`);
  } catch (e) { console.log(`${s}: ERR ${e.message}`); }
}
