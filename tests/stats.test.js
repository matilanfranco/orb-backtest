const test = require('node:test');
const assert = require('node:assert');
const S = require('../js/stats.js');

const mk = (date, type, rr, result, mfe, createdAt) => ({ id: String(createdAt), date, type, rr, result, mfe, note: '', createdAt });

const trades = [
  mk('2026-01-05', 'absorcion', 1,   'TP', 2,   1), // +1
  mk('2026-01-05', 'ruptura',   1,   'SL', 0,   2), // -1
  mk('2026-01-06', 'absorcion', 1.5, 'TP', 1.5, 3), // +1.5
  mk('2026-01-07', 'ruptura',   1.5, 'SL', 1,   4)  // -1
];

test('summarize: números base', () => {
  const s = S.summarize(trades);
  assert.strictEqual(s.n, 4);
  assert.strictEqual(s.wins, 2);
  assert.strictEqual(s.winRate, 0.5);
  assert.strictEqual(s.netR, 0.5);
  assert.strictEqual(s.expectancy, 0.125);
  assert.strictEqual(s.profitFactor, 2.5 / 2);
  assert.strictEqual(s.maxDD, 1);
  assert.strictEqual(s.maxWinStreak, 1);
  assert.strictEqual(s.maxLossStreak, 1);
  assert.deepStrictEqual(s.equity, [1, 0, 1.5, 0.5]);
});

test('summarize: vacío no rompe', () => {
  const s = S.summarize([]);
  assert.strictEqual(s.n, 0);
  assert.strictEqual(s.winRate, 0);
  assert.strictEqual(s.profitFactor, 0);
});

test('summarize: solo ganadores da profit factor infinito', () => {
  const s = S.summarize([mk('2026-01-05', 'ruptura', 1, 'TP', 1, 1)]);
  assert.strictEqual(s.profitFactor, Infinity);
});

test('summarize: rachas y drawdown con secuencia mixta', () => {
  const seq = [
    mk('2026-02-01', 'ruptura', 1, 'SL', 0, 1),
    mk('2026-02-02', 'ruptura', 1, 'SL', 0, 2),
    mk('2026-02-03', 'ruptura', 1, 'SL', 0, 3),
    mk('2026-02-04', 'ruptura', 1, 'TP', 1, 4),
    mk('2026-02-05', 'ruptura', 1, 'TP', 1, 5)
  ];
  const s = S.summarize(seq);
  assert.strictEqual(s.maxLossStreak, 3);
  assert.strictEqual(s.maxWinStreak, 2);
  assert.strictEqual(s.maxDD, 3);
});

test('idealTargets: elige el objetivo con mejor expectativa', () => {
  const r = S.idealTargets(trades);
  const byT = Object.fromEntries(r.rows.map(x => [x.target, x]));
  assert.strictEqual(byT[1].hits, 3);
  assert.strictEqual(byT[1].expectancy, 0.5);
  assert.strictEqual(byT[1.5].hits, 2);
  assert.strictEqual(byT[1.5].expectancy, 0.25);
  assert.strictEqual(byT[2].hits, 1);
  assert.strictEqual(byT[2].expectancy, -0.25);
  assert.strictEqual(r.best, 1);
});

test('idealTargets: gana 1.5 cuando la mayoría llega a 1.5', () => {
  const t = [
    mk('2026-03-01', 'ruptura', 1, 'TP', 1.5, 1),
    mk('2026-03-02', 'ruptura', 1, 'TP', 2, 2),
    mk('2026-03-03', 'ruptura', 1, 'TP', 3, 3),
    mk('2026-03-04', 'ruptura', 1, 'SL', 0, 4)
  ];
  assert.strictEqual(S.idealTargets(t).best, 1.5);
});

test('groupBy y distribución', () => {
  const g = S.groupBy(trades, t => t.type);
  assert.strictEqual(g.absorcion.summary.n, 2);
  assert.strictEqual(g.ruptura.summary.n, 2);
  assert.strictEqual(g.absorcion.summary.netR, 2.5);
  const d = S.mfeDistribution(trades);
  assert.strictEqual(d[0], 1);
  assert.strictEqual(d[1], 1);
  assert.strictEqual(d[1.5], 1);
  assert.strictEqual(d[2], 1);
  assert.strictEqual(d[3], 0);
});

test('orden por fecha y luego por creación', () => {
  const unsorted = [trades[3], trades[0], trades[2], trades[1]];
  const ids = S.sortTrades(unsorted).map(t => t.id);
  assert.deepStrictEqual(ids, ['1', '2', '3', '4']);
});

test('groupByField: agrupa por contexto y cuenta los sin dato', () => {
  const t = [
    { ...mk('2026-04-01', 'ruptura', 1, 'TP', 2, 1), space: 'gt2' },
    { ...mk('2026-04-02', 'ruptura', 1, 'TP', 1.5, 2), space: 'gt2' },
    { ...mk('2026-04-03', 'ruptura', 1, 'SL', 0, 3), space: 'lt1' },
    { ...mk('2026-04-04', 'ruptura', 1, 'TP', 1, 4), space: null },
    mk('2026-04-05', 'ruptura', 1, 'SL', 0, 5) // trade viejo, sin el campo
  ];
  const g = S.groupByField(t, 'space');
  assert.strictEqual(g.withData, 3);
  assert.strictEqual(g.missing, 2);
  assert.deepStrictEqual(Object.keys(g.groups).sort(), ['gt2', 'lt1']);
  assert.strictEqual(g.groups.gt2.summary.n, 2);
  assert.strictEqual(g.groups.gt2.ideal.best, 1.5);
  assert.strictEqual(g.groups.lt1.ideal.best, 1);
});

test('groupByField: booleanos (noticias) quedan como claves "true"/"false"', () => {
  const t = [
    { ...mk('2026-04-01', 'absorcion', 1, 'TP', 1, 1), news: true },
    { ...mk('2026-04-02', 'absorcion', 1, 'SL', 0, 2), news: false },
    { ...mk('2026-04-03', 'absorcion', 1, 'SL', 0, 3), news: false }
  ];
  const g = S.groupByField(t, 'news');
  assert.strictEqual(g.groups.true.summary.n, 1);
  assert.strictEqual(g.groups.false.summary.n, 2);
  assert.strictEqual(g.missing, 0);
});
