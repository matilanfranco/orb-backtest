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

test('migra v1 a v3 sin perder trades y deja v1 como respaldo', () => {
  const v1Raw = JSON.stringify({ version: 1, trades: [v1Trade], lastDate: '2026-01-05' });
  const { DB, data } = loadStore({ 'orb-bt:v1': v1Raw });
  const all = DB.all();
  assert.strictEqual(all.length, 1);
  assert.strictEqual(all[0].id, 'a1');
  assert.deepStrictEqual(all[0].entry, []);
  assert.strictEqual(DB.getLastDate(), '2026-01-05');
  assert.strictEqual(data['orb-bt:v1'], v1Raw);
  const v3 = JSON.parse(data['orb-bt:v3']);
  assert.strictEqual(v3.version, 3);
  assert.strictEqual(v3.trades.length, 1);
});

test('migra v2 (entrada única) a v3 (lista) y deja v2 como respaldo', () => {
  const v2Raw = JSON.stringify({ version: 2, lastDate: null, trades: [
    { ...v1Trade, id: 'b1', entry: 'ob' },
    { ...v1Trade, id: 'b2', entry: null },
    { ...v1Trade, id: 'b3', entry: 'otra' }
  ] });
  const v1Raw = JSON.stringify({ version: 1, trades: [v1Trade], lastDate: null });
  const { DB, data } = loadStore({ 'orb-bt:v2': v2Raw, 'orb-bt:v1': v1Raw });
  const byId = Object.fromEntries(DB.all().map(t => [t.id, t]));
  assert.deepStrictEqual(Object.keys(byId).sort(), ['b1', 'b2', 'b3']); // lee v2, no v1
  assert.deepStrictEqual(byId.b1.entry, ['ob']);
  assert.deepStrictEqual(byId.b2.entry, []);
  assert.deepStrictEqual(byId.b3.entry, []);
  assert.strictEqual(data['orb-bt:v2'], v2Raw);
  assert.strictEqual(JSON.parse(data['orb-bt:v3']).trades.length, 3);
});

test('si ya hay v3, no vuelve a leer las viejas', () => {
  const v3Raw = JSON.stringify({ version: 3, trades: [], lastDate: null });
  const v2Raw = JSON.stringify({ version: 2, trades: [v1Trade], lastDate: null });
  const { DB } = loadStore({ 'orb-bt:v3': v3Raw, 'orb-bt:v2': v2Raw });
  assert.strictEqual(DB.all().length, 0);
});

test('add guarda varios puntos de entrada, sin repetidos y en orden fijo', () => {
  const { DB } = loadStore({});
  const t = DB.add({ date: '2026-02-01', type: 'ruptura', rr: 1.5, result: 'SL', mfe: 1, note: '', entry: ['borde', 'fvg', 'borde'] });
  assert.ok(t);
  assert.deepStrictEqual(t.entry, ['fvg', 'borde']);
  const u = DB.add({ date: '2026-02-01', type: 'ruptura', rr: 1, result: 'TP', mfe: 1, entry: ['otra', 'ob'] });
  assert.deepStrictEqual(u.entry, ['ob']);
  const w = DB.add({ date: '2026-02-01', type: 'ruptura', rr: 1, result: 'TP', mfe: 1 });
  assert.deepStrictEqual(w.entry, []);
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
  assert.deepStrictEqual(DB.all()[0].entry, []);
});

test('update edita un trade y mantiene id y createdAt', () => {
  const { DB, data } = loadStore({});
  const a = DB.add({ date: '2026-03-01', type: 'absorcion', rr: 1, result: 'SL', mfe: 0, note: '' });
  const b = DB.add({ date: '2026-03-02', type: 'ruptura', rr: 1, result: 'TP', mfe: 1, note: '' });
  const u = DB.update(a.id, { date: '2026-03-03', type: 'ruptura', rr: 1.5, result: 'TP', mfe: 2, note: 'corregido', entry: ['ob', 'fvg'] });
  assert.ok(u);
  assert.strictEqual(u.id, a.id);
  assert.strictEqual(u.createdAt, a.createdAt);
  assert.deepStrictEqual([u.date, u.type, u.rr, u.result, u.mfe, u.note, u.entry],
    ['2026-03-03', 'ruptura', 1.5, 'TP', 2, 'corregido', ['fvg', 'ob']]);
  assert.strictEqual(DB.all().length, 2);
  assert.strictEqual(DB.all().find(t => t.id === b.id).note, '');
  const saved = JSON.parse(data['orb-bt:v3']).trades.find(t => t.id === a.id);
  assert.strictEqual(saved.note, 'corregido');
});

test('update rechaza datos inválidos y no toca el trade', () => {
  const { DB } = loadStore({});
  const a = DB.add({ date: '2026-03-01', type: 'absorcion', rr: 1, result: 'SL', mfe: 0, note: 'x' });
  assert.strictEqual(DB.update(a.id, { date: 'mal', type: 'absorcion', rr: 1, result: 'SL', mfe: 0 }), null);
  assert.strictEqual(DB.update('no-existe', { date: '2026-03-01', type: 'absorcion', rr: 1, result: 'SL', mfe: 0 }), null);
  assert.deepStrictEqual(DB.all()[0], a);
});

test('backupStatus: cuándo recordar el backup', () => {
  const { DB } = loadStore({});
  const f = DB.backupStatusOf;
  const DAY = 86400000;
  const now = 100 * DAY;
  const tr = (n, at) => Array.from({ length: n }, (_, i) => ({ createdAt: at + i }));
  assert.strictEqual(f([], null, now).due, false);                       // sin trades
  assert.strictEqual(f(tr(4, 1), null, now).due, false);                 // nunca exportó, pocos trades
  assert.strictEqual(f(tr(5, 1), null, now).due, true);                  // nunca exportó, 5 trades
  const last = now - 3 * DAY;
  assert.strictEqual(f(tr(3, last + 1), last, now).due, false);          // 3 días y 3 nuevos
  assert.strictEqual(f(tr(20, last + 1), last, now).due, true);          // 20 nuevos
  const old = now - 8 * DAY;
  assert.strictEqual(f(tr(1, old + 1), old, now).due, true);             // 8 días y hay nuevos
  const s = f(tr(10, 1), old, now);                                      // 8 días pero nada nuevo
  assert.strictEqual(s.due, false);
  assert.strictEqual(s.days, 8);
  assert.strictEqual(s.newTrades, 0);
});

test('markBackup se guarda y sobrevive a reabrir la app', () => {
  const { DB, data } = loadStore({});
  for (let i = 0; i < 5; i++) DB.add({ date: '2026-02-01', type: 'ruptura', rr: 1, result: 'TP', mfe: 1 });
  assert.strictEqual(DB.backupStatus().due, true);
  DB.markBackup(Date.now() + 1);
  const reopened = loadStore(data).DB;
  assert.strictEqual(reopened.backupStatus().due, false);
  assert.strictEqual(reopened.all().length, 5);
});
