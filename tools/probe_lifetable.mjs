#!/usr/bin/env node
/** Probe: is a real age-specific life table obtainable? (OWID grapher + UN WPP) */
const OWID = [
  "life-expectancy-at-age-10", "life-expectancy-at-age-15", "life-expectancy-at-age-20",
  "life-expectancy-at-age-25", "life-expectancy-at-age-30", "life-expectancy-at-age-40",
  "life-expectancy-at-age-50", "life-expectancy-at-age-60", "life-expectancy-at-age-70",
  "life-expectancy-at-age-80", "life-expectancy-at-age-85",
  "life-expectancy-at-birth", "life-table-survivors-to-age-10", "life-table-life-expectancy",
  "survivors-to-age-10", "survivors-to-age-65", "life-expectancy-by-age",
];

console.log("=== OWID grapher slugs ===");
for (const slug of OWID) {
  const url = `https://ourworldindata.org/grapher/${slug}.csv`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!r.ok) { console.log(`--   ${slug} (${r.status})`); continue; }
    const t = await r.text();
    const header = t.slice(0, t.indexOf("\n"));
    const lines = t.split("\n").length;
    console.log(`OK   ${slug} lines=${lines} header="${header.slice(0, 90)}"`);
  } catch (e) { console.log(`--   ${slug} ${e.message}`); }
}

console.log("\n=== OWID catalog search: life table ===");
for (const q of ["life table", "survivors", "cohort life table"]) {
  try {
    const u = `https://api.ourworldindata.org/v1/search.json?q=${encodeURIComponent(q)}&limit=8`;
    const r = await fetch(u, { signal: AbortSignal.timeout(20000) });
    const j = await r.json();
    const items = (j?.results?.catalog ?? j?.results ?? []).map((x) => x.title ?? x.name ?? x.slug);
    console.log(`[${r.status}] "${q}" → ${items.join(" | ") || "(none)"}`);
  } catch (e) { console.log(`-- "${q}" ${e.message}`); }
}

console.log("\n=== UN WPP life table files ===");
for (const u of [
  "https://population.un.org/wpp/assets/Excel Files/1_Indicator (Standard)/CSV_FILES/WPP2024_Life_Table_Medium.csv.gz",
  "https://population.un.org/wpp/assets/Excel Files/1_Indicator (Standard)/CSV_FILES/WPP2024_DB1_Medium.csv.gz",
]) {
  try {
    const r = await fetch(u, { method: "HEAD", signal: AbortSignal.timeout(25000) });
    console.log(`[${r.status}] ${u} len=${r.headers.get("content-length")}`);
  } catch (e) { console.log(`-- ${u.slice(-40)} ${e.message}`); }
}
