#!/usr/bin/env node
/** Probe candidate OWID grapher slugs for indicators we still need. */
const SLUGS = [
  "births", "child-births", "number-of-births", "births-per-year",
  "annual-number-of-births", "births-in-the-world", "crude-birth-rate",
  "total-fertility-rate", "fertility-rate-with-projections", "fertility",
  "life-satisfaction", "happiness", "wellbeing", "life-satisfaction-cantril-ladder",
  "share-of-one-year-olds-vaccinated", "immunization-rates",
  "mortality-rate-from-heart-disease", "cardiovascular-disease-death-rates",
  "road-death-rate", "road-traffic-deaths", "death-rate-from-road-traffic-injuries",
  "self-harm", "suicide-rates", "death-rate-from-conflicts",
  "share-of-adults-who-obese", "food-insecurity", "poverty-rate",
  "mean-years-of-schooling", "average-years-of-schooling",
  "share-of-workers-in-employment-by-sector", "employment-in-agriculture",
  "internet-users", "urban-population",
];

const res = await Promise.all(SLUGS.map(async (s) => {
  const url = `https://ourworldindata.org/grapher/${s}.csv`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (r.status !== 200) return { s, status: r.status };
    const t = await r.text();
    const lines = t.split("\n");
    return { s, status: 200, lines: lines.length, header: lines[0], row1: lines[1] || "" };
  } catch (e) {
    return { s, status: "ERR", err: e.message };
  }
}));

for (const r of res) {
  if (r.status === 200) {
    console.log(`OK   ${r.s}\n     lines=${r.lines}\n     ${r.header}\n     ${r.row1}\n`);
  } else {
    console.log(`--   ${r.s} (${r.status}${r.err ? " " + r.err : ""})`);
  }
}
