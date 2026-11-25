const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const STORE = path.join(__dirname, '..', 'js', 'store.js');

// localStorage falso y carga limpia de store.js en cada test.
function loadStore(initial) {
  const data = Object.assign({}, initial);
  globalThis.localStorage = {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); }
  };
  delete require.cache[STORE];
  delete globalThis.BTStore;
  require(STORE);
  return { DB: globalThis.BTStore, data };
}

const v1Trade = { id: 'a1', date: '2026-01-05', type: 'absorcion', rr: 1, result: 'TP', mfe: 2, note: 'x', createdAt: 1 };

test('migra v1 a v2 sin perder trades y deja v1 como respaldo', () => {
  const v1Raw = JSON.stringify({ version: 1, trades: [v1Trade], lastDate: '2026-01-05' });
  const { DB, data } = loadStore({ 'orb-bt:v1': v1Raw });
  const all = DB.all();
  assert.strictEqual(all.length, 1);
  assert.strictEqual(all[0].id, 'a1');
  assert.strictEqual(all[0].range, null);
  assert.strictEqual(all[0].news, null);
  assert.strictEqual(DB.getLastDate(), '2026-01-05');
  assert.strictEqual(data['orb-bt:v1'], v1Raw);
  const v2 = JSON.parse(data['orb-bt:v2']);
  assert.strictEqual(v2.version, 2);
  assert.strictEqual(v2.trades.length, 1);
});

test('si ya hay v2, no vuelve a leer v1', () => {
  const v2Raw = JSON.stringify({ version: 2, trades: [], lastDate: null });
  const v1Raw = JSON.stringify({ version: 1, trades: [v1Trade], lastDate: null });
  const { DB } = loadStore({ 'orb-bt:v2': v2Raw, 'orb-bt:v1': v1Raw });
  assert.strictEqual(DB.all().length, 0);
});

test('add guarda contexto válido y descarta valores raros', () => {
  const { DB } = loadStore({});
  const t = DB.add({ date: '2026-02-01', type: 'ruptura', rr: 1.5, result: 'SL', mfe: 1, note: '',
    range: 'grande', space: 'gt2', candle: 'fuerte', news: false });
  assert.ok(t);
  assert.deepStrictEqual([t.range, t.space, t.candle, t.news], ['grande', 'gt2', 'fuerte', false]);
  const u = DB.add({ date: '2026-02-01', type: 'ruptura', rr: 1, result: 'TP', mfe: 1, range: 'enorme' });
  assert.ok(u);
  assert.strictEqual(u.range, null);
});

test('importa exportaciones v1 y no duplica', () => {
  const { DB } = loadStore({});
  const file = JSON.stringify({ version: 1, trades: [v1Trade] });
  assert.strictEqual(DB.importJSON(file), 1);
  assert.strictEqual(DB.importJSON(file), 0);
  assert.strictEqual(DB.all()[0].candle, null);
});
