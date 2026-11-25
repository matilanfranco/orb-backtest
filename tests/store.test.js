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
  assert.strictEqual(all[0].entry, null);
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

test('add guarda el punto de entrada y descarta valores raros', () => {
  const { DB } = loadStore({});
  for (const e of ['fvg', 'ob', 'borde']) {
    const t = DB.add({ date: '2026-02-01', type: 'ruptura', rr: 1.5, result: 'SL', mfe: 1, note: '', entry: e });
    assert.ok(t);
    assert.strictEqual(t.entry, e);
  }
  const u = DB.add({ date: '2026-02-01', type: 'ruptura', rr: 1, result: 'TP', mfe: 1, entry: 'otra' });
  assert.ok(u);
  assert.strictEqual(u.entry, null);
});

test('la descripción se guarda hasta 500 caracteres', () => {
  const { DB } = loadStore({});
  const t = DB.add({ date: '2026-02-01', type: 'ruptura', rr: 1, result: 'TP', mfe: 1, note: 'x'.repeat(600) });
  assert.strictEqual(t.note.length, 500);
});

test('importa exportaciones v1 y no duplica', () => {
  const { DB } = loadStore({});
  const file = JSON.stringify({ version: 1, trades: [v1Trade] });
  assert.strictEqual(DB.importJSON(file), 1);
  assert.strictEqual(DB.importJSON(file), 0);
  assert.strictEqual(DB.all()[0].entry, null);
});

test('update edita un trade y mantiene id y createdAt', () => {
  const { DB, data } = loadStore({});
  const a = DB.add({ date: '2026-03-01', type: 'absorcion', rr: 1, result: 'SL', mfe: 0, note: '' });
  const b = DB.add({ date: '2026-03-02', type: 'ruptura', rr: 1, result: 'TP', mfe: 1, note: '' });
  const u = DB.update(a.id, { date: '2026-03-03', type: 'ruptura', rr: 1.5, result: 'TP', mfe: 2, note: 'corregido', entry: 'ob' });
  assert.ok(u);
  assert.strictEqual(u.id, a.id);
  assert.strictEqual(u.createdAt, a.createdAt);
  assert.deepStrictEqual([u.date, u.type, u.rr, u.result, u.mfe, u.note, u.entry],
    ['2026-03-03', 'ruptura', 1.5, 'TP', 2, 'corregido', 'ob']);
  assert.strictEqual(DB.all().length, 2);
  assert.strictEqual(DB.all().find(t => t.id === b.id).note, '');
  const saved = JSON.parse(data['orb-bt:v2']).trades.find(t => t.id === a.id);
  assert.strictEqual(saved.note, 'corregido');
});

test('update rechaza datos inválidos y no toca el trade', () => {
  const { DB } = loadStore({});
  const a = DB.add({ date: '2026-03-01', type: 'absorcion', rr: 1, result: 'SL', mfe: 0, note: 'x' });
  assert.strictEqual(DB.update(a.id, { date: 'mal', type: 'absorcion', rr: 1, result: 'SL', mfe: 0 }), null);
  assert.strictEqual(DB.update('no-existe', { date: '2026-03-01', type: 'absorcion', rr: 1, result: 'SL', mfe: 0 }), null);
  assert.deepStrictEqual(DB.all()[0], a);
});
