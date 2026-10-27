// Complete offline data catalogue from the MIT-licensed PowerShell edition.
export const DATA_FILES = Object.freeze({
  countries: 'countries.json', names: 'names.json', citiesEn: 'cities_en.json',
  countryEn: 'country_en.json', countryJa: 'country_ja.json', countryZh: 'country_zh.json',
  eras: 'eras.json', dishes: 'dishes.json', festivals: 'festivals.json',
  hobbies: 'hobbies.json', ethnicities: 'ethnicities.json', events: 'events.json',
  reflections: 'reflections.json', shop: 'shop.json',
});

export async function loadEdition(prefix = './data/edition/', { fetchImpl = globalThis.fetch } = {}) {
  const base = prefix.endsWith('/') ? prefix : `${prefix}/`;
  const entries = await Promise.all(Object.entries(DATA_FILES).map(async ([key, file]) => {
    const url = `${base}${file}`;
    const response = await fetchImpl(url);
    if (!response || response.ok === false) throw new Error(`${url}: HTTP ${response?.status ?? 'unavailable'}`);
    const value = JSON.parse(await response.text());
    if (value === null || typeof value !== 'object') throw new Error(`${url}: invalid data`);
    return [key, value];
  }));
  return Object.fromEntries(entries);
}
