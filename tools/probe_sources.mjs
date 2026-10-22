#!/usr/bin/env node
/**
 * Probe candidate open data sources for a global life-simulation dataset.
 * Usage: node tools/probe_sources.mjs
 * Prints: URL, status, content-type, bytes, and a tiny sample.
 */
const SOURCES = [
  ["WB life expectancy", "https://api.worldbank.org/v2/country/all/indicator/SP.DYN.LE00.IN?format=json&per_page=20000&date=2015:2022"],
  ["WB gdp per capita ppp", "https://api.worldbank.org/v2/country/all/indicator/NY.GDP.PCAP.PP.CD?format=json&per_page=20000&date=2015:2022"],
  ["WB births (SP.DYN.CBRT.IN crude birth rate)", "https://api.worldbank.org/v2/country/all/indicator/SP.DYN.CBRT.IN?format=json&per_page=20000&date=2018:2022"],
  ["WB infant mortality", "https://api.worldbank.org/v2/country/all/indicator/SP.DYN.IMRT.IN?format=json&per_page=20000&date=2018:2022"],
  ["WB under5 mortality", "https://api.worldbank.org/v2/country/all/indicator/SH.DYN.MORT?format=json&per_page=20000&date=2018:2022"],
  ["WB gini", "https://api.worldbank.org/v2/country/all/indicator/SI.POV.GINI?format=json&per_page=20000&date=2010:2022"],
  ["WB urbanization", "https://api.worldbank.org/v2/country/all/indicator/SP.URB.TOTL.IN.ZS?format=json&per_page=20000&date=2018:2022"],
  ["WB schooling years", "https://api.worldbank.org/v2/country/all/indicator/SE.ADT.LITR.ZS?format=json&per_page=20000&date=2015:2022"],
  ["OWID grapher life-expectancy", "https://ourworldindata.org/grapher/life-expectancy.csv"],
  ["OWID grapher births", "https://ourworldindata.org/grapher/births-per-year.csv"],
  ["OWID grapher child-mortality-igme", "https://ourworldindata.org/grapher/child-mortality-igme.csv"],
  ["OWID grapher homicide", "https://ourworldindata.org/grapher/homicide-rate-unodc.csv"],
  ["OWID grapher maternal mortality", "https://ourworldindata.org/grapher/maternal-mortality.csv"],
  ["OWID grapher smoking", "https://ourworldindata.org/grapher/share-of-adults-who-smoke.csv"],
  ["OWID grapher life-satisfaction", "https://ourworldindata.org/grapher/life-satisfaction.csv"],
  ["OWID grapher fertility", "https://ourworldindata.org/grapher/fertility-rate.csv"],
  ["UN WPP csv (mirror on OWID) population", "https://ourworldindata.org/grapher/population.csv"],
  ["UN WPP births csv", "https://ourworldindata.org/grapher/annual-births-per-woman.csv"],
];

const timeout = (ms) => AbortSignal.timeout(ms);

for (const [name, url] of SOURCES) {
  try {
    const res = await fetch(url, { signal: timeout(25000), headers: { "user-agent": "pilotdeck-probe/1.0" } });
    const buf = Buffer.from(await res.arrayBuffer());
    const ct = res.headers.get("content-type") || "";
    let sample = buf.subarray(0, 160).toString("utf8").replace(/\s+/g, " ");
    if (ct.includes("csv")) {
      const lines = buf.toString("utf8").split("\n");
      sample = `lines=${lines.length} header=${lines[0]} row1=${lines[1] || ""}`;
    }
    console.log(`OK   [${res.status}] ${name}\n     ${url}\n     bytes=${buf.length} ct=${ct}\n     ${sample}\n`);
  } catch (e) {
    console.log(`FAIL ${name}\n     ${url}\n     ${e.message}\n`);
  }
}
