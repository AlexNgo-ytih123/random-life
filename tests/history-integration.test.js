import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { loadWorldFromObjects } from '../js/data/loader.js';

async function history() {
  const url = new URL('../js/engine/history.js', import.meta.url);
  assert.ok(existsSync(url), 'history must be accessible under its standard module name');
  return import(url);
}

test('selected birth year uses the actual country context and historical life expectancy', async () => {
  const { countryForYear } = await history();
  const read = name => JSON.parse(readFileSync(new URL(`../data/${name}.json`, import.meta.url)));
  const world = loadWorldFromObjects({ countries: read('countries'), history: read('history') });
  const before = JSON.stringify(world.countries);
  const old = countryForYear(world, 'CHN', 1950);
  const modern = countryForYear(world, 'CHN', 2023);
  assert.equal(old.name, '中国');
  assert.equal(old.region, 'Asia');
  assert.equal(old.indicators.lifeExp.value, world.history.CHN[1950].lifeExp);
  assert.equal(old.indicators.lifeExp.year, 1950);
  assert.notEqual(old.indicators.lifeExp.value, modern.indicators.lifeExp.value);
  assert.equal(old.indicators.infantMort.year, 2023);
  assert.equal(old.indicators.infantMort.fallback, true);
  assert.equal(JSON.stringify(world.countries), before, 'source data must not be mutated');
});

test('historical gaps preserve observed years and missing values never become zero', async () => {
  const { countryForYear, causeForYear } = await history();
  const world = loadWorldFromObjects({ countries: { countries: { TST: { iso3: 'TST', name: 'Test', indicators: {} } } }, history: { TST: { 1950: { lifeExp: 50 }, 1960: { lifeExp: 60 } } }, causes: { TST: { 2000: { communicable: 10, ncd: 80, injury: 10 }, 2020: { communicable: 5, ncd: 90, injury: 5 } } } });
  const interpolated = countryForYear(world, 'TST', 1955).indicators.lifeExp;
  assert.equal(interpolated.value, 55);
  assert.equal(interpolated.interpolated, true);
  assert.deepEqual(interpolated.sourceYears, [1950, 1960]);
  const future = countryForYear(world, 'TST', 2026);
  assert.equal(future.indicators.lifeExp.value, 60);
  assert.equal(future.indicators.lifeExp.year, 1960);
  assert.equal(future.indicators.lifeExp.fallback, true);
  assert.equal(future.indicators.infantMort, undefined);
  assert.equal(causeForYear(world, 'TST', 2010).year, 2000);
  assert.equal(causeForYear(world, 'TST', 2100).year, 2020);
  assert.equal(causeForYear(world, 'TST', 1950).year, 2000);
  assert.equal(causeForYear(world, 'XXX', 2020).mix, null);
});

test('record and share use one sampled cause with the death data source year', async () => {
  const { buildDeathRecord, buildShareText } = await import('../js/engine/record.js');
  const state = { age: 1, deathAge: 1, birthYear: 1950, stats: {}, country: { iso3: 'CHN', indicators: { lifeExp: { value: 50, year: 1950 } } } };
  const opts = { rng: () => 0.1, causeMix: { communicable: 100, ncd: 0, injury: 0 }, causeMeta: { year: 2000, source: 'test cause source' } };
  const record = buildDeathRecord(state, opts);
  assert.equal(record.cause, '传染病');
  assert.equal(record.causeObject.year, 2000);
  assert.equal(record.causeObject.source, 'test cause source');
  assert.match(buildShareText(state, { record }), /死因：传染病/);
  assert.equal(buildDeathRecord(state).cause, '未知');
});

test('historical interpolation skips null and missing observations between valid endpoints', async () => {
  const { countryForYear } = await history();
  const world = loadWorldFromObjects({ countries: { countries: { TST: { iso3: 'TST', indicators: {} } } }, history: { TST: { 1950: { lifeExp: 50 }, 1952: { lifeExp: null }, 1953: { population: 100 }, 1960: { lifeExp: 60 } } } });
  const entry = countryForYear(world, 'TST', 1955).indicators.lifeExp;
  assert.equal(entry.value, 55);
  assert.deepEqual(entry.sourceYears, [1950, 1960]);
});
