/* Estadísticas puras (sin DOM). Funciona en el navegador (window.BTStats) y en node (tests). */
(function (root) {
  'use strict';

  // Objetivos que se evalúan para el "take profit ideal".
  var TARGETS = [1, 1.5, 2];

  // Resultado real de un trade en R: Take = +rr, SL = -1.
  function rOf(t) { return t.result === 'TP' ? t.rr : -1; }

  function sortTrades(trades) {
    return trades.slice().sort(function (a, b) {
      if (a.date === b.date) return a.createdAt - b.createdAt;
      return a.date < b.date ? -1 : 1;
    });
  }

  function summarize(trades) {
    var list = sortTrades(trades);
    var n = list.length;
    var wins = 0, grossWin = 0, grossLoss = 0, net = 0, peak = 0, maxDD = 0;
    var curW = 0, curL = 0, maxW = 0, maxL = 0, rrSum = 0;
    var equity = [];
    list.forEach(function (t) {
      var r = rOf(t);
      net += r;
      equity.push(net);
      rrSum += t.rr;
      if (r > 0) {
        wins++; grossWin += r; curW++; curL = 0;
        if (curW > maxW) maxW = curW;
      } else {
        grossLoss += -r; curL++; curW = 0;
        if (curL > maxL) maxL = curL;
      }
      if (net > peak) peak = net;
      if (peak - net > maxDD) maxDD = peak - net;
    });
    var winRate = n ? wins / n : 0;
    var avgRR = n ? rrSum / n : 0;
    return {
      n: n,
      wins: wins,
      losses: n - wins,
      winRate: winRate,
      margin: n ? 1.96 * Math.sqrt(winRate * (1 - winRate) / n) : 0, // margen de error 95% del win rate
      netR: net,
      expectancy: n ? net / n : 0,
      grossWin: grossWin,
      grossLoss: grossLoss,
      profitFactor: grossLoss ? grossWin / grossLoss : (grossWin > 0 ? Infinity : 0),
      maxDD: maxDD,
      maxWinStreak: maxW,
      maxLossStreak: maxL,
      avgRR: avgRR,
      breakEvenWR: n ? 1 / (1 + avgRR) : 0, // win rate mínimo para no perder con tus R:R
      equity: equity
    };
  }

  // Take profit ideal: para cada objetivo T, un trade "gana" si el máximo movimiento a favor llegó a T,
  // y si no llegó se asume pérdida de 1R.
  function idealTargets(trades) {
    var n = trades.length;
    var rows = [];
    var best = null, bestExp = -Infinity;
    if (!n) return { rows: rows, best: null };
    TARGETS.forEach(function (T) {
      var hits = trades.filter(function (t) { return t.mfe >= T; }).length;
      var winRate = hits / n;
      var expectancy = (hits * T - (n - hits)) / n;
      var breakEven = 1 / (1 + T);
      rows.push({
        target: T, n: n, hits: hits, reach: winRate,
        breakEven: breakEven, edge: winRate - breakEven, expectancy: expectancy
      });
      if (expectancy > bestExp) { bestExp = expectancy; best = T; }
    });
    return { rows: rows, best: best };
  }

  // Cuántos trades terminaron en cada categoría de máximo movimiento.
  function mfeDistribution(trades) {
    var buckets = [0, 1, 1.5, 2, 3];
    var out = {};
    buckets.forEach(function (b) { out[b] = 0; });
    trades.forEach(function (t) { out[t.mfe] = (out[t.mfe] || 0) + 1; });
    return out;
  }

  function groupBy(trades, keyFn) {
    var groups = {};
    trades.forEach(function (t) {
      var k = keyFn(t);
      (groups[k] = groups[k] || []).push(t);
    });
    var out = {};
    Object.keys(groups).forEach(function (k) {
      out[k] = { summary: summarize(groups[k]), ideal: idealTargets(groups[k]) };
    });
    return out;
  }

  // Agrupa por un campo que es una lista de etiquetas (ej. punto de entrada ['fvg', 'ob']).
  // Un trade con varias etiquetas cuenta en cada uno de sus grupos; los que tienen la lista vacía quedan aparte.
  function groupByTags(trades, field) {
    var lists = {};
    var withData = 0;
    trades.forEach(function (t) {
      var tags = Array.isArray(t[field]) ? t[field] : [];
      if (tags.length) withData++;
      tags.forEach(function (tag) { (lists[tag] = lists[tag] || []).push(t); });
    });
    var groups = {};
    Object.keys(lists).forEach(function (k) {
      groups[k] = { summary: summarize(lists[k]), ideal: idealTargets(lists[k]) };
    });
    return { groups: groups, withData: withData, missing: trades.length - withData };
  }

  var api = {
    TARGETS: TARGETS,
    rOf: rOf,
    sortTrades: sortTrades,
    summarize: summarize,
    idealTargets: idealTargets,
    mfeDistribution: mfeDistribution,
    groupBy: groupBy,
    groupByTags: groupByTags
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BTStats = api;
})(typeof window !== 'undefined' ? window : globalThis);
