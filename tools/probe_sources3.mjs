#!/usr/bin/env node
/** Probe: specific cause-of-death indicators, WHO GHO API, and Natural Earth basemap. */
const WB_CAUSES = [
  ["malaria", "SH.DTH.MALN.ZS"], ["hiv", "SH.DTH.BSST.ZS"], ["tb", "SH.DTH.TBCZ.ZS"],
  ["injuries", "SH.DTH.INJR.ZS"], ["ncd", "SH.DTH.NCOM.ZS"], ["communicable", "SH.DTH.COMM.ZS"],
  ["maternal", "SH.DTH.MMRT.ZS"], ["respiratory", "SH.DTH.RES.ZS"], ["cervical", "SH.DTH.CERV.ZS"],
  ["diarrheal", "SH.DTH.DIAR.ZS"], ["lower-resp", "SH.DTH.LRES.ZS"], ["neonatal", "SH.DTH.NEQU.ZS"],
  ["suicide", "VC.IHR.PSRC.P5"], ["road", "SH.DTH.ROAD.ZS"], ["cancer", "SH.DTH.NCD.ZS"],
  ["diabetes", "SH.DTH.DIAB.ZS"], ["cardiovascular", "SH.DTH.CARD.ZS"],
];
console.log("=== WB cause indicators ===");
for (const [name, ind] of WB_CAUSES) {
  const url = `https://api.worldbank.org/v2/country/all/indicator/${ind}?format=json&per_page=20000&date=2018:2022`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!r.ok) { console.log(`--   ${name} ${ind} HTTP ${r.status}`); continue; }
    const j = await r.json();
    const rows = Array.isArray(j?.[1]) ? j[1] : [];
    const v = rows.filter((x) => x.value !== null && x.countryiso3code);
    const cset = new Set(v.map((x) => x.countryiso3code));
    console.log(`OK   ${name} ${ind} nonNull=${v.length} countries=${cset.size}${v[0] ? ` e.g. ${v[0].country.value}=${v[0].value}` : ""}`);
  } catch (e) { console.log(`--   ${name} ${ind} ${e.message}`); }
}

console.log("\n=== WHO GHO OData ===");
for (const u of [
  "https://ghoapi.azureedge.net/api/WHOSIS_000001",
  "https://ghoapi.azureedge.net/api/Indicator?$filter=contains(IndicatorName,%27leading%27)",
]) {
  try {
    const r = await fetch(u, { signal: AbortSignal.timeout(20000) });
    const t = await r.text();
    console.log(`[${r.status}] ${u} bytes=${t.length}\n     ${t.slice(0, 240).replace(/\s+/g, " ")}`);
  } catch (e) { console.log(`-- ${u} ${e.message}`); }
}

console.log("\n=== Natural Earth basemap ===");
for (const u of [
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson",
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_map_units.geojson",
]) {
  try {
    const r = await fetch(u, { signal: AbortSignal.timeout(30000) });
    const t = await r.text();
    const n = (t.match(/"type":\s*"Feature"/g) || []).length;
    console.log(`[${r.status}] ${u}\n     bytes=${t.length} features=${n}`);
  } catch (e) { console.log(`-- ${u} ${e.message}`); }
}
