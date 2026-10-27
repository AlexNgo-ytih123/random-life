import fs from 'node:fs';
import { createDocument } from './dom.js';

export function memoryStorage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key), values };
}

export function browserFixture(t, storage = memoryStorage()) {
  const root = new URL('../../', import.meta.url);
  const document = createDocument(fs.readFileSync(new URL('index.html', root), 'utf8'));
  const previousDocument = globalThis.document;
  globalThis.document = document;
  t.after(() => { if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument; });
  const callbacks = new Map();
  const copied = [];
  const window = {
    location: { href: 'http://localhost/?seed=42', search: '?seed=42', reload() {} },
    addEventListener: (name, callback) => callbacks.set(name, callback),
    removeEventListener: name => callbacks.delete(name),
    confirm: () => false,
    setInterval: callback => { callbacks.set('timer', callback); return 1; },
    clearInterval: () => callbacks.delete('timer'),
    navigator: { clipboard: { writeText: async text => copied.push(text) } },
    localStorage: storage,
  };
  const requested = [];
  const fetchImpl = async url => {
    const file = new URL(String(url), 'http://localhost/').pathname.slice(1);
    requested.push(file);
    try {
      const text = fs.readFileSync(new URL(file, root), 'utf8');
      return { ok: true, status: 200, text: async () => text, json: async () => JSON.parse(text) };
    } catch { return { ok: false, status: 404, text: async () => '' }; }
  };
  return { document, window, storage, navigator: window.navigator, fetchImpl, callbacks, copied, requested, year: 2026 };
}
