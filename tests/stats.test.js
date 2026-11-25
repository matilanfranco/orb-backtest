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

test('groupByTags: un trade con varios puntos de entrada cuenta en cada grupo', () => {
  const t = [
    { ...mk('2026-04-01', 'ruptura', 1, 'TP', 2, 1), entry: ['fvg'] },
    { ...mk('2026-04-02', 'ruptura', 1, 'TP', 1.5, 2), entry: ['fvg', 'ob'] },
    { ...mk('2026-04-03', 'ruptura', 1, 'SL', 0, 3), entry: ['ob'] },
    { ...mk('2026-04-04', 'ruptura', 1, 'TP', 1, 4), entry: [] },
    mk('2026-04-05', 'ruptura', 1, 'SL', 0, 5) // sin el campo
  ];
  const g = S.groupByTags(t, 'entry');
  assert.strictEqual(g.withData, 3);
  assert.strictEqual(g.missing, 2);
  assert.deepStrictEqual(Object.keys(g.groups).sort(), ['fvg', 'ob']);
  assert.strictEqual(g.groups.fvg.summary.n, 2);
  assert.strictEqual(g.groups.ob.summary.n, 2);
  assert.strictEqual(g.groups.fvg.ideal.best, 1.5);
  assert.strictEqual(g.groups.ob.summary.netR, 0); // +1 y -1
});

test('groupBy con "¿se formó FVG?" (booleano) separa sí y no', () => {
  const t = [
    { ...mk('2026-05-01', 'absorcion', 1, 'TP', 2, 1), fvgFormed: true },
    { ...mk('2026-05-02', 'ruptura', 1, 'TP', 1.5, 2), fvgFormed: true },
    { ...mk('2026-05-03', 'absorcion', 1, 'SL', 0, 3), fvgFormed: false }
  ];
  const g = S.groupBy(t, x => x.fvgFormed);
  assert.strictEqual(g.true.summary.n, 2);
  assert.strictEqual(g.true.ideal.best, 1.5);
  assert.strictEqual(g.false.summary.n, 1);
});

test('idealTargets con objetivos de más de 2R: usa mfeX y deja afuera los >2 sin dato', () => {
  const mk = (mfe, mfeX) => ({ result: 'TP', rr: 1, mfe, mfeX: mfeX === undefined ? null : mfeX });
  const t = [mk(0), mk(1), mk(2), mk(3, 2.6), mk(3, 3.4), mk(3)];
  const r = S.idealTargets(t, S.TARGETS_EXT);
  const row = (T) => r.rows.find(x => x.target === T);
  assert.strictEqual(row(2).hits, 4);          // hasta 2R cuentan todos (los >2 sin dato también)
  assert.strictEqual(row(2).n, 6);
  assert.strictEqual(row(2.5).n, 5);           // el >2 sin número queda afuera
  assert.strictEqual(row(2.5).unknown, 1);
  assert.strictEqual(row(2.5).hits, 2);
  assert.strictEqual(row(3).hits, 1);
  assert.strictEqual(row(4).hits, 0);
  assert.ok(Math.abs(row(3).expectancy - (3 - 4) / 5) < 1e-9);
  assert.strictEqual(S.hasExact(t), true);
  assert.strictEqual(S.hasExact([mk(3)]), false);
});

test('idealTargets sin objetivos explícitos sigue evaluando 1, 1.5 y 2', () => {
  const r = S.idealTargets([{ result: 'TP', rr: 1, mfe: 3, mfeX: 5 }]);
  assert.deepStrictEqual(r.rows.map(x => x.target), [1, 1.5, 2]);
});
