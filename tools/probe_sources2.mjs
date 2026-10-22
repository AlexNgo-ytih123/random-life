#!/usr/bin/env node
/** Round 2: World Bank cause-of-death + more indicators, plus OWID happiness slugs. */
const WB = [
  ["communicable death %", "SH.DTH.COMM.ZS"],
  ["ncd death %", "SH.DTH.NCOM.ZS"],
  ["injury death %", "SH.DTH.INJR.ZS"],
  ["cause of death (all)", "SH.DTH.CAUSE.ZS"],
  ["cause of death (communicable)", "SH.DTH.COMM.ZS"],
  ["homicide per 100k", "VC.IHR.PSRC.P5"],
  ["fertility rate", "SP.DYN.TFRT.IN"],
  ["school enrollment tertiary", "SE.TER.ENRR"],
  ["unemployment", "SL.UEM.TOTL.ZS"],
  ["out-of-pocket health %", "SH.XPD.OOPC.CH.ZS"],
  ["health expenditure per capita", "SH.XPD.CHEX.PC.CD"],
  ["physicians per 1000", "SH.MED.PHYS.ZS"],
  ["adolescent fertility", "SP.ADO.TFRT"],
  ["maternal mortality ratio", "SH.STA.MMRT"],
  ["skilled birth attendance", "SH.STA.BRTC.ZS"],
  ["measles immunization", "SH.IMM.MEAS"],
  ["male labor force participation", "SL.TLF.CACT.MA.ZS"],
  ["female labor participation", "SL.TLF.CACT.FE.ZS"],
  ["net migration", "SM.POP.NETM"],
  ["fertility-to-life", "SP.DYN.TFRT.IN"],
  ["gov education spend %gdp", "SE.XPD.TOTL.GD.ZS"],
  ["internet users %", "IT.NET.USER.ZS"],
  ["urban population %", "SP.URB.TOTL.IN.ZS"],
  ["age dependency old", "SP.POP.DPND.OL"],
  ["poverty headcount $2.15", "SI.POV.DDAY"],
  ["child labor %", "SL.TLF.0714.ZS"],
  ["nuclear family size?", "SP.HOU.2M"],
];

for (const [name, ind] of WB) {
  const url = `https://api.worldbank.org/v2/country/all/indicator/${ind}?format=json&per_page=20000&date=2015:2023`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!r.ok) { console.log(`--   ${name} (${ind}) HTTP ${r.status}`); continue; }
    const j = await r.json();
    const rows = Array.isArray(j?.[1]) ? j[1] : [];
    const withVal = rows.filter((x) => x.value !== null);
    const countries = new Set(withVal.map((x) => x.countryiso3code).filter(Boolean));
    console.log(`OK   ${name} (${ind}) total=${rows.length} nonNull=${withVal.length} countries=${countries.size}`);
    if (withVal[0]) console.log(`     e.g. ${withVal[0].country.value} ${withVal[0].date} = ${withVal[0].value}`);
  } catch (e) {
    console.log(`--   ${name} (${ind}) ${e.message}`);
  }
}

const SLUGS = [
  "happiness-and-life-satisfaction", "life-satisfaction-cantril", "cantril-ladder",
  "life-satisfaction-whr", "average-life-satisfaction", "life-satisfaction-ladder",
  "happiness-whr", "world-happiness-report", "life-satisfaction-2015-2017",
  "happiness-in-cantril-ladder", "wellbeing-in-cantril-ladder", "life-satisfaction-index",
];
console.log("--- OWID happiness slugs ---");
for (const s of SLUGS) {
  try {
    const r = await fetch(`https://ourworldindata.org/grapher/${s}.csv`, { signal: AbortSignal.timeout(15000) });
    if (r.status !== 200) { console.log(`--   ${s} (${r.status})`); continue; }
    const t = await r.text(); const l = t.split("\n");
    console.log(`OK   ${s} lines=${l.length}\n     ${l[0]}\n     ${l[1] || ""}`);
  } catch (e) { console.log(`--   ${s} ${e.message}`); }
}
