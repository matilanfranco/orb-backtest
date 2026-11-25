/* UI: registrar, estadísticas, historial. Vanilla JS, sin build. */
(function () {
  'use strict';

  // Subir en cada cambio publicado: se ve en Historial y sirve para confirmar que el celu se actualizó.
  var APP_VERSION = '2026-11-25.6';

  var S = window.BTStats;
  var DB = window.BTStore;

  var TYPES = ['absorcion', 'ruptura'];
  var TYPE_LABEL = { absorcion: 'Absorción', ruptura: 'Ruptura' };
  var TYPE_SHORT = TYPE_LABEL;
  // ¿El impulso dejó FVG? (sí / no / sin dato): el movimiento después de romper o absorber el borde del rango.
  // Aplica a los dos tipos de entrada. Es independiente de si se entró en un FVG (eso es el punto de entrada).
  var FVGF_OPTS = [['si', 'Sí', true], ['no', 'No', false]];
  function fvgfLabel(v) { return v === true ? 'Impulso con FVG' : (v === false ? 'Impulso sin FVG' : ''); }
  var RR_OPTS = [1, 1.5, 2];
  var MFE_OPTS = [
    { v: 0, label: 'Menos de 1:1', short: '<1' },
    { v: 1, label: '1:1', short: '1' },
    { v: 1.5, label: '1.5:1', short: '1.5' },
    { v: 2, label: '2:1', short: '2' },
    { v: 3, label: 'Más de 2:1', short: '>2' }
  ];
  // Punto de entrada (multiselección). Los valores tienen que coincidir con BTStore.ENTRIES.
  var ENTRY_OPTS = [['fvg', 'FVG'], ['ob', 'OB'], ['borde', 'Borde del rango']];
  var DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  var TITLES = { log: 'Registrar', stats: 'Estadísticas', history: 'Historial' };

  var ui = {
    persisted: false, // el navegador aceptó no borrar los datos
    hEdit: null,      // edición en el historial: { id, d: borrador, orig: JSON del original }
    tab: 'log',
    step: 0,
    date: DB.getLastDate() || todayStr(),
    draft: newDraft(),
    filter: 'all'
  };

  /* ---------- helpers ---------- */
  function newDraft() {
    // mfeXText: lo que se escribió en "¿hasta cuántos R?" (solo con "más de 2:1"); se valida al guardar.
    return { type: null, rr: 1, result: null, mfe: null, mfeXText: '', note: '', entry: [], fvgFormed: null };
  }
  function pad(n) { return String(n).padStart(2, '0'); }
  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function rrLabel(rr) { return rr + ':1'; }
  // Máximo exacto (solo "más de 2:1"): '' = sin dato, número > 2 (hasta MFEX_MAX), o NaN si lo escrito no sirve.
  function parseMfeX(text) {
    var s = String(text || '').trim().replace(',', '.');
    if (!s) return null;
    var v = Number(s);
    return isFinite(v) && v > 2 && v <= DB.MFEX_MAX ? Math.round(v * 100) / 100 : NaN;
  }
  function mfeXInput(id, text, mini) {
    var bad = text && isNaN(parseMfeX(text));
    return '<div class="mfex' + (mini ? ' mini' : '') + '"><label for="' + id + '">¿Hasta cuántos R llegó?</label>' +
      '<input id="' + id + '" class="input' + (mini ? ' mini' : '') + '" type="text" inputmode="decimal" autocomplete="off" ' +
      'placeholder="ej: 3.2 · opcional" value="' + esc(text) + '"></div>' +
      '<p class="hint mfex-bad"' + (bad ? '' : ' hidden') + '>Tiene que ser un número mayor a 2 (ej: 2.5 o 3.2).</p>';
  }
  function mfeLabel(v, exact) {
    if (v === 3 && typeof exact === 'number') return exact + 'R';
    var o = MFE_OPTS.filter(function (x) { return x.v === v; })[0];
    return o ? o.label : '?';
  }
  function fmtR(x) { return (x > 0 ? '+' : '') + x.toFixed(2) + 'R'; }
  function fmtPct(x, d) { return (x * 100).toFixed(d === undefined ? 0 : d) + '%'; }
  function fmtPF(x) { return x === Infinity ? '∞' : x.toFixed(2); }
  function cls(x) { return x > 0 ? 'pos' : (x < 0 ? 'neg' : ''); }
  function weekday(dateStr) {
    var p = dateStr.split('-').map(Number);
    return new Date(p[0], p[1] - 1, p[2]).getDay();
  }
  function mfeAllowed(v, rr, result) { return result === 'TP' ? v >= rr : v < rr; }
  // Ej: "FVG + OB". Vacío si no se marcó ninguno.
  function entryLabel(entry) {
    return ENTRY_OPTS.filter(function (o) { return (entry || []).indexOf(o[0]) !== -1; })
      .map(function (o) { return o[1]; }).join(' + ');
  }

  var toastTimer = null;
  function toast(msg) {
    var el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2200);
  }

  /* ---------- backup ---------- */
  function backupLine(b) {
    if (!b.lastBackup) return 'Nunca exportaste un backup.';
    return 'Último backup: ' + (b.days === 0 ? 'hoy' : (b.days === 1 ? 'ayer' : 'hace ' + b.days + ' días')) +
      (b.newTrades ? ' · ' + b.newTrades + ' trade' + (b.newTrades === 1 ? '' : 's') + ' nuevo' + (b.newTrades === 1 ? '' : 's') + ' desde entonces' : '') + '.';
  }
  function backupBanner() {
    var b = DB.backupStatus();
    if (!b.due) return '';
    return '<div class="warn backup"><span>' + backupLine(b) + ' Guardá una copia por si se borra el teléfono.</span>' +
      '<button class="chip" data-action="export-json">Hacer backup</button></div>';
  }

  /* ---------- registrar ---------- */
  function viewLog() {
    var d = ui.draft;
    if (ui.step === 0) {
      var count = DB.all().filter(function (t) { return t.date === ui.date; }).length;
      return backupBanner() +
        '<section class="card">' +
          '<label class="lbl" for="date">Fecha del setup</label>' +
          '<input type="date" id="date" class="input" value="' + esc(ui.date) + '" max="' + todayStr() + '">' +
          '<p class="hint">Trades guardados en esta fecha: <b>' + count + '</b></p>' +
        '</section>' +
        '<section class="stack">' +
          '<button class="btn big abs" data-action="type" data-v="absorcion">Entrada por absorción</button>' +
          '<button class="btn big brk" data-action="type" data-v="ruptura">Entrada por ruptura</button>' +
        '</section>';
    }

    var crumb = '<p class="crumb">' + esc(ui.date) + ' · <b>' + TYPE_LABEL[d.type] + '</b>' +
      (ui.step >= 2 ? ' · ' + rrLabel(d.rr) : '') +
      (ui.step >= 3 ? ' · ' + d.result : '') + '</p>';

    if (ui.step === 1) {
      return crumb +
        '<section class="card">' +
          '<h2 class="q">¿R:R?</h2>' +
          '<div class="chips">' +
            RR_OPTS.map(function (rr) {
              return '<button class="chip' + (d.rr === rr ? ' sel' : '') + '" data-action="rr" data-v="' + rr + '">' +
                rrLabel(rr) + (rr === 1 ? '<small>por defecto</small>' : '') + '</button>';
            }).join('') +
          '</div>' +
        '</section>' +
        '<div class="row">' +
          '<button class="btn ghost" data-action="back">Atrás</button>' +
          '<button class="btn primary" data-action="next">Siguiente</button>' +
        '</div>';
    }

    if (ui.step === 2) {
      return crumb +
        '<section class="card"><h2 class="q">¿Salió SL o Take?</h2></section>' +
        '<section class="stack">' +
          '<button class="btn big tp" data-action="result" data-v="TP">Take profit (+' + d.rr + 'R)</button>' +
          '<button class="btn big sl" data-action="result" data-v="SL">Stop loss (−1R)</button>' +
        '</section>' +
        '<div class="row"><button class="btn ghost" data-action="back">Atrás</button></div>';
    }

    // step 3
    var hint = d.result === 'TP'
      ? 'Salió Take: el movimiento fue al menos ' + rrLabel(d.rr) + '. ¿Hasta dónde llegó antes de volver al nivel del SL?'
      : 'Salió SL: no llegó a ' + rrLabel(d.rr) + '. ¿Cuánto fue a favor antes de llegar al nivel del SL?';
    return crumb +
      '<section class="card">' +
        '<h2 class="q">Máximo movimiento antes de llegar al nivel del SL</h2>' +
        '<p class="hint">' + hint + '</p>' +
        '<div class="chips col">' +
          MFE_OPTS.map(function (o) {
            var ok = mfeAllowed(o.v, d.rr, d.result);
            return '<button class="chip' + (d.mfe === o.v ? ' sel' : '') + '"' +
              (ok ? '' : ' disabled') + ' data-action="mfe" data-v="' + o.v + '">' + o.label + '</button>';
          }).join('') +
        '</div>' +
        (d.mfe === 3 ? mfeXInput('mfex', d.mfeXText) : '') +
      '</section>' +
      '<section class="card">' +
        '<p class="lbl">Punto de entrada <span class="hint">· opcional, podés marcar varios</span></p>' +
        '<div class="chips ctx">' +
          ENTRY_OPTS.map(function (o) {
            var on = d.entry.indexOf(o[0]) !== -1;
            return '<button class="chip' + (on ? ' sel' : '') + '" aria-pressed="' + on + '" data-action="entry" data-v="' + o[0] + '">' +
              (on ? '✓ ' : '') + o[1] + '</button>';
          }).join('') +
        '</div>' +
        '<p class="lbl">¿El impulso dejó FVG? <span class="hint">· después de romper o absorber el borde · opcional</span></p>' +
        '<div class="chips ctx">' +
          FVGF_OPTS.map(function (o) {
            var on = d.fvgFormed === o[2];
            return '<button class="chip' + (on ? ' sel' : '') + '" aria-pressed="' + on + '" data-action="fvgf" data-v="' + o[0] + '">' + o[1] + '</button>';
          }).join('') +
        '</div>' +
        '<label class="lbl" for="note">Descripción (opcional)</label>' +
        '<textarea id="note" class="input area" maxlength="500" rows="3" placeholder="ej: barrió el máximo y dejó FVG en M1">' + esc(d.note) + '</textarea>' +
      '</section>' +
      '<div class="row">' +
        '<button class="btn ghost" data-action="back">Atrás</button>' +
        '<button class="btn primary" data-action="save"' + (d.mfe === null ? ' disabled' : '') + '>Guardar</button>' +
      '</div>';
  }

  /* ---------- estadísticas ---------- */
  function card(label, value, sub, c) {
    return '<div class="stat"><span class="k">' + label + '</span><span class="v ' + (c || '') + '">' + value +
      '</span>' + (sub ? '<span class="s">' + sub + '</span>' : '') + '</div>';
  }

  function equitySvg(equity) {
    var pts = [0].concat(equity);
    var w = 320, h = 130, pad = 10;
    var min = Math.min.apply(null, pts), max = Math.max.apply(null, pts);
    if (max === min) { max += 1; min -= 1; }
    var x = function (i) { return pad + (w - 2 * pad) * (i / (pts.length - 1)); };
    var y = function (v) { return h - pad - (h - 2 * pad) * ((v - min) / (max - min)); };
    var line = pts.map(function (v, i) { return x(i).toFixed(1) + ',' + y(v).toFixed(1); }).join(' ');
    var last = pts[pts.length - 1];
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" class="equity" role="img" aria-label="Curva de capital en R">' +
      '<line x1="' + pad + '" x2="' + (w - pad) + '" y1="' + y(0).toFixed(1) + '" y2="' + y(0).toFixed(1) + '" class="zero"/>' +
      '<polyline points="' + line + '" class="eqline ' + (last >= 0 ? 'up' : 'down') + '"/>' +
      '</svg>';
  }

  // ¿Hasta dónde llegaron los trades? % que alcanzó cada objetivo y cuál hubiera rendido más (RR ideal).
  function reachCard(trades, ideal, ext) {
    var n = trades.length;
    var over2 = trades.filter(function (t) { return t.mfe === 3; }).length;
    var noNum = trades.filter(function (t) { return t.mfe === 3 && typeof t.mfeX !== 'number'; }).length;
    var bestRow = ideal.rows.filter(function (r) { return r.target === ideal.best; })[0];
    var rows = ideal.rows.map(function (r) {
      var b = r.target === ideal.best;
      var tr = '<tr' + (b ? ' class="best"' : '') + '><td>' + rrLabel(r.target) + (b ? ' ★' : '') + '</td>' +
        '<td>' + fmtPct(r.reach, 0) + ' <small>(' + r.hits + '/' + r.n + ')' + (r.unknown ? '*' : '') + '</small></td>' +
        '<td>' + fmtPct(r.breakEven, 0) + '</td>' +
        '<td class="' + cls(r.expectancy) + '">' + fmtR(r.expectancy) + '</td></tr>';
      if (r.target === 2) {
        tr += '<tr class="info"><td>Más de 2:1</td><td>' + fmtPct(over2 / n, 0) + ' <small>(' + over2 + '/' + n + ')</small></td>' +
          '<td colspan="2"><small>' + (ext ? 'ver 2.5:1 en adelante' : 'sin saber cuánto más') + '</small></td></tr>';
      }
      return tr;
    }).join('');
    var tip = '';
    if (over2 && !ext) {
      tip = '<p class="hint">Para saber si 2.5:1 o 3:1 rinden más, anotá <b>hasta cuántos R llegó</b> cuando marcás ' +
        '"Más de 2:1" (se puede agregar a los viejos con Editar en el Historial).</p>';
    } else if (noNum) {
      tip = '<p class="hint">* ' + noNum + ' trade' + (noNum === 1 ? '' : 's') + ' de "más de 2:1" sin número: ' +
        'no cuentan en las filas de más de 2R. Podés completarlos con Editar en el Historial.</p>';
    }
    return '<section class="card"><h3>¿Hasta dónde llegaron? · RR ideal</h3>' +
      (bestRow ? '<p class="ideal">RR ideal: <b>' + rrLabel(bestRow.target) + '</b> <span class="' + cls(bestRow.expectancy) + '">' +
        fmtR(bestRow.expectancy) + ' por trade</span></p>' : '') +
      '<table class="tbl"><thead><tr><th>Objetivo</th><th>Llegó</th><th>Necesario</th><th>Expectativa</th></tr></thead><tbody>' +
      rows + '</tbody></table>' +
      '<p class="hint">"Llegó" = % de trades en los que el precio alcanzó ese objetivo antes de volver al SL. ' +
      '"Necesario" = % mínimo para no perder con ese objetivo. "Expectativa" = R promedio por trade si siempre hubieras puesto ' +
      'el take ahí (los que no llegan cuentan −1R). ★ = el que más rinde.</p>' + tip + '</section>';
  }

  function bestLabel(ideal) { return ideal.best === null ? '—' : rrLabel(ideal.best); }

  function viewStats() {
    var all = DB.all();
    var trades = ui.filter === 'all' ? all : all.filter(function (t) { return t.type === ui.filter; });

    var chips = '<div class="chips tight">' +
      [['all', 'Todas']].concat(TYPES.map(function (k) { return [k, TYPE_SHORT[k]]; })).map(function (f) {
        return '<button class="chip' + (ui.filter === f[0] ? ' sel' : '') + '" data-action="filter" data-v="' + f[0] + '">' + f[1] + '</button>';
      }).join('') + '</div>';

    if (!trades.length) {
      return chips + '<section class="card empty"><p>Todavía no hay trades' +
        (ui.filter === 'all' ? '' : ' de este tipo') + '.</p><p class="hint">Registrá algunos en la pestaña Registrar.</p></section>';
    }

    var s = S.summarize(trades);
    var ext = S.hasExact(trades);
    var ideal = S.idealTargets(trades, ext ? S.TARGETS_EXT : S.TARGETS);
    var html = chips;

    if (s.n < 30) {
      html += '<p class="warn">Muestra chica (' + s.n + ' trades). Con menos de 30, los números todavía son ruido.</p>';
    }

    html += '<section class="grid">' +
      card('Trades', s.n, s.wins + ' take · ' + s.losses + ' SL') +
      card('Win rate', fmtPct(s.winRate, 1), '± ' + fmtPct(s.margin, 1) + ' (95%)') +
      card('R neto', fmtR(s.netR), '', cls(s.netR)) +
      card('Expectativa', fmtR(s.expectancy), 'por trade', cls(s.expectancy)) +
      card('Profit factor', fmtPF(s.profitFactor), 'R ganado ÷ R perdido', s.profitFactor >= 1 ? 'pos' : 'neg') +
      card('Máx. drawdown', '−' + s.maxDD.toFixed(2) + 'R', '', s.maxDD > 0 ? 'neg' : '') +
      card('Racha perdedora', s.maxLossStreak, 'máxima') +
      card('Racha ganadora', s.maxWinStreak, 'máxima') +
    '</section>';

    if (ui.filter === 'all') html += typeCompare(trades);

    html += '<section class="card"><h3>Win rate vs. lo que necesitás</h3>' +
      '<p>Tu win rate: <b>' + fmtPct(s.winRate, 1) + '</b> · mínimo para no perder con tus R:R: <b>' + fmtPct(s.breakEvenWR, 1) + '</b> ' +
      '<span class="' + (s.winRate > s.breakEvenWR ? 'pos' : 'neg') + '">(' +
      (s.winRate >= s.breakEvenWR ? '+' : '') + ((s.winRate - s.breakEvenWR) * 100).toFixed(1) + ' pts)</span></p></section>';

    html += '<section class="card"><h3>Curva de capital (R)</h3>' + (s.n > 1 ? equitySvg(s.equity) : '<p class="hint">Hacen falta al menos 2 trades.</p>') + '</section>';

    html += reachCard(trades, ideal, ext);

    var dist = S.mfeDistribution(trades);
    var maxCount = Math.max.apply(null, MFE_OPTS.map(function (o) { return dist[o.v] || 0; })) || 1;
    html += '<section class="card"><h3>Máximo movimiento antes del SL</h3>' +
      MFE_OPTS.map(function (o) {
        var c = dist[o.v] || 0;
        return '<div class="bar"><span class="bl">' + o.label + '</span><span class="bt"><i style="width:' + (100 * c / maxCount).toFixed(0) + '%"></i></span><span class="bn">' + c + '</span></div>';
      }).join('') + '</section>';

    html += contextSection(trades);

    var byRR = S.groupBy(trades, function (t) { return t.rr; });
    html += '<section class="card"><h3>Por R:R elegido</h3>' + groupTable(byRR, function (k) { return rrLabel(Number(k)); }, ['1', '1.5', '2'], true) + '</section>';

    var byDay = S.groupBy(trades, function (t) { return weekday(t.date); });
    html += '<section class="card"><h3>Por día de la semana</h3>' + groupTable(byDay, function (k) { return DAYS[k]; }, ['1', '2', '3', '4', '5', '0', '6'], true) + '</section>';

    return html;
  }

  // Tipos de entrada lado a lado. Resalta el mejor de cada fila.
  function typeCompare(trades) {
    var g = S.groupBy(trades, function (t) { return t.type; });
    var NA = '<span class="hint">—</span>';
    // [etiqueta, valor a mostrar, número para comparar, más alto es mejor?, color]
    var metrics = [
      ['Trades', function (x) { return x.summary.n + '<br><small>' + x.summary.wins + ' TP · ' + x.summary.losses + ' SL</small>'; }],
      ['Win rate', function (x) { return fmtPct(x.summary.winRate, 1) + '<br><small>± ' + fmtPct(x.summary.margin, 0) + '</small>'; },
        function (x) { return x.summary.winRate; }, true],
      ['Win rate mínimo', function (x) { return fmtPct(x.summary.breakEvenWR, 1); }],
      ['R neto', function (x) { return fmtR(x.summary.netR); }, function (x) { return x.summary.netR; }, true, function (x) { return cls(x.summary.netR); }],
      ['Expectativa', function (x) { return fmtR(x.summary.expectancy); }, function (x) { return x.summary.expectancy; }, true, function (x) { return cls(x.summary.expectancy); }],
      ['Profit factor', function (x) { return fmtPF(x.summary.profitFactor); }, function (x) { return x.summary.profitFactor; }, true,
        function (x) { return x.summary.profitFactor >= 1 ? 'pos' : 'neg'; }],
      ['Máx. drawdown', function (x) { return '−' + x.summary.maxDD.toFixed(2) + 'R'; }, function (x) { return x.summary.maxDD; }, false],
      ['Racha perdedora', function (x) { return x.summary.maxLossStreak; }, function (x) { return x.summary.maxLossStreak; }, false],
      ['TP ideal', function (x) { return bestLabel(x.ideal); }]
    ];
    var present = TYPES.filter(function (k) { return g[k]; });
    var rows = metrics.map(function (m) {
      // El mejor de la fila (solo si hay al menos 2 tipos con datos y no empatan todos).
      var best = null;
      if (m[2] && present.length > 1) {
        var vals = present.map(function (k) { return m[2](g[k]); });
        var top = m[3] ? Math.max.apply(null, vals) : Math.min.apply(null, vals);
        var winners = present.filter(function (k, i) { return vals[i] === top; });
        if (winners.length < present.length) best = winners;
      }
      return '<tr><th scope="row">' + m[0] + '</th>' + TYPES.map(function (k) {
        var x = g[k];
        if (!x) return '<td>' + NA + '</td>';
        var c = (m[4] ? m[4](x) : '') + (best && best.indexOf(k) !== -1 ? ' better' : '');
        return '<td class="' + c + '">' + m[1](x) + '</td>';
      }).join('') + '</tr>';
    });
    return '<section class="card"><h3>Por tipo de entrada</h3>' +
      '<table class="tbl cmp"><thead><tr><th></th>' +
      TYPES.map(function (k) { return '<th class="' + k + '">' + TYPE_SHORT[k] + '</th>'; }).join('') +
      '</tr></thead><tbody>' + rows.join('') + '</tbody></table>' +
      '<p class="hint">Resaltado = mejor de la fila. "Win rate mínimo" es el que necesitás para no perder con los R:R que usaste. ' +
      'Si los ± del win rate se superponen mucho, la diferencia todavía puede ser casualidad.</p></section>';
  }

  // Expectativa de cada objetivo (1, 1.5, 2) por punto de entrada y por "¿el impulso dejó FVG?".
  function contextSection(trades) {
    var g = S.groupByTags(trades, 'entry');
    var html = tpTable('Take profit ideal por punto de entrada', g, ENTRY_OPTS, 'sin punto de entrada marcado',
      'Todavía no marcaste el punto de entrada en ningún trade.',
      'Si un trade tiene varios puntos marcados, cuenta en cada uno. ');
    var withF = trades.filter(function (t) { return t.fvgFormed === true || t.fvgFormed === false; });
    var gf = { groups: S.groupBy(withF, function (t) { return t.fvgFormed; }), withData: withF.length, missing: trades.length - withF.length };
    html += tpTable('Take profit ideal: ¿el impulso dejó FVG?', gf, [['true', 'Sí'], ['false', 'No']], 'sin marcar',
      'Todavía no marcaste "¿El impulso dejó FVG?" en ningún trade.', '');
    return html;
  }

  // Tabla de expectativa por objetivo para cada grupo. opts: [[clave, etiqueta]].
  function tpTable(titleText, g, opts, missingText, emptyText, extraHint) {
    var title = '<section class="card"><h3>' + titleText + '</h3>';
    if (!g.withData) {
      return title + '<p class="hint">' + emptyText + ' Se marca (opcional) al registrar, en la pantalla del máximo movimiento, ' +
        'o editando el trade en el historial.</p></section>';
    }
    var rows = opts.filter(function (o) { return g.groups[o[0]]; }).map(function (o) {
      var grp = g.groups[o[0]];
      var best = grp.ideal.best;
      return '<tr' + (grp.summary.n < 10 ? ' class="low"' : '') + '><td>' + o[1] + '</td><td>' + grp.summary.n + '</td>' +
        grp.ideal.rows.map(function (r) {
          var b = r.target === best;
          return '<td class="' + cls(r.expectancy) + (b ? ' bestc' : '') + '">' +
            (r.expectancy > 0 ? '+' : '') + r.expectancy.toFixed(2) + (b ? '★' : '') + '</td>';
        }).join('') + '</tr>';
    });
    return title +
      (g.missing ? '<p class="hint">' + g.missing + ' trade' + (g.missing === 1 ? '' : 's') + ' ' + missingText + '</p>' : '') +
      '<table class="tbl"><thead><tr><th></th><th>N</th>' +
      S.TARGETS.map(function (T) { return '<th>' + rrLabel(T) + '</th>'; }).join('') +
      '</tr></thead><tbody>' + rows.join('') + '</tbody></table>' +
      '<p class="hint">Expectativa en R por trade con cada objetivo. ★ = mejor objetivo del grupo. ' +
      extraHint +
      'Los grupos con menos de 10 trades se ven atenuados: todavía no son confiables.</p></section>';
  }

  function groupTable(groups, label, order, noBest) {
    var rows = order.filter(function (k) { return groups[k]; }).map(function (k) {
      var g = groups[k].summary;
      return '<tr><td>' + label(k) + '</td><td>' + g.n + '</td><td>' + fmtPct(g.winRate, 0) + '</td>' +
        '<td class="' + cls(g.netR) + '">' + fmtR(g.netR) + '</td>' +
        (noBest ? '' : '<td>' + bestLabel(groups[k].ideal) + '</td>') + '</tr>';
    });
    if (!rows.length) return '<p class="hint">Sin datos.</p>';
    return '<table class="tbl"><thead><tr><th></th><th>N</th><th>Win</th><th>R neto</th>' +
      (noBest ? '' : '<th>TP ideal</th>') + '</tr></thead><tbody>' + rows.join('') + '</tbody></table>';
  }

  /* ---------- historial ---------- */
  function viewHistory() {
    var all = DB.all();
    var list = S.sortTrades(all).reverse();
    var html = backupBanner() + '<section class="card"><h3>Datos</h3>' +
      '<p class="hint">Todo se guarda solo en este dispositivo, también sin internet. ' + backupLine(DB.backupStatus()) +
      (ui.persisted ? ' Almacenamiento protegido ✓' : '') + '</p>' +
      '<div class="chips tight">' +
        '<button class="chip" data-action="export-json">Exportar JSON</button>' +
        '<button class="chip" data-action="export-csv">Exportar CSV</button>' +
        '<button class="chip" data-action="import">Importar JSON</button>' +
        '<button class="chip danger" data-action="clear">Borrar todo</button>' +
      '</div>' +
      '<input type="file" id="importFile" accept="application/json,.json" hidden>' +
      '<p class="hint ver">Versión de la app: ' + APP_VERSION + '</p>' +
    '</section>';

    if (!list.length) return html + '<section class="card empty"><p>No hay trades guardados.</p></section>';

    html += '<section class="list">' + list.map(function (t) {
      if (ui.hEdit && ui.hEdit.id === t.id) return itemEditor(t, ui.hEdit.d);
      var r = S.rOf(t);
      return '<div class="item" id="it-' + esc(t.id) + '">' +
        '<div class="top"><span class="date">' + esc(t.date) + '</span>' +
          '<span class="tag ' + t.type + '">' + TYPE_LABEL[t.type] + '</span>' +
          '<span class="badge ' + (t.result === 'TP' ? 'tp' : 'sl') + '">' + t.result + ' ' + fmtR(r) + '</span></div>' +
        '<div class="sub">R:R ' + rrLabel(t.rr) + ' · máx. ' + mfeLabel(t.mfe, t.mfeX) + (entryLabel(t.entry) ? ' · Entrada en ' + esc(entryLabel(t.entry)) : '') +
          (fvgfLabel(t.fvgFormed) ? ' · ' + fvgfLabel(t.fvgFormed) : '') + '</div>' +
        (t.note ? '<div class="sub ctx">' + esc(t.note) + '</div>' : '') +
        '<div class="acts">' +
          '<button class="edit" aria-label="Editar trade" data-action="edit" data-id="' + esc(t.id) + '">Editar</button>' +
          '<button class="del" aria-label="Borrar trade" data-action="del" data-id="' + esc(t.id) + '">Borrar</button>' +
        '</div>' +
      '</div>';
    }).join('') + '</section>';
    return html;
  }

  // Editor compacto dentro de la tarjeta del historial.
  function itemEditor(t, d) {
    function chips(field, opts, isOn, extra) {
      return '<div class="chips mini' + (extra || '') + '">' + opts.map(function (o) {
        var on = isOn(o[0]);
        var dis = field === 'mfe' && !mfeAllowed(o[0], d.rr, d.result);
        return '<button class="chip' + (on ? ' sel' : '') + '"' + (dis ? ' disabled' : '') +
          ' data-action="hset" data-f="' + field + '" data-v="' + o[0] + '">' + esc(o[1]) + '</button>';
      }).join('') + '</div>';
    }
    function eq(field) { return function (v) { return d[field] === v; }; }
    function row(label, content) { return '<div class="erow"><span class="el">' + label + '</span>' + content + '</div>'; }
    var ok = d.mfe !== null && mfeAllowed(d.mfe, d.rr, d.result) && /^\d{4}-\d{2}-\d{2}$/.test(d.date);
    return '<div class="item editing" id="it-' + esc(t.id) + '">' +
      row('Fecha', '<input type="date" id="edate" class="input mini" value="' + esc(d.date) + '" max="' + todayStr() + '">') +
      row('Tipo', chips('type', TYPES.map(function (k) { return [k, TYPE_SHORT[k]]; }), eq('type'))) +
      row('R:R', chips('rr', RR_OPTS.map(function (v) { return [v, rrLabel(v)]; }), eq('rr'))) +
      row('Resultado', chips('result', [['TP', 'TP'], ['SL', 'SL']], eq('result'), ' res')) +
      row('Máx. mov.', chips('mfe', MFE_OPTS.map(function (o) { return [o.v, o.short]; }), eq('mfe')) +
        (d.mfe === null ? '<p class="need">Elegí hasta dónde llegó</p>' : '') +
        (d.mfe === 3 ? '<div class="need-wide">' + mfeXInput('emfex', d.mfeXText, true) + '</div>' : '')) +
      row('Entrada', chips('entry', ENTRY_OPTS.map(function (o) { return [o[0], o[1] === 'Borde del rango' ? 'Borde' : o[1]]; }),
        function (v) { return d.entry.indexOf(v) !== -1; })) +
      row('¿Impulso con FVG?', chips('fvgFormed', FVGF_OPTS, function (v) { return fvgfValue(v) === d.fvgFormed; })) +
      '<textarea id="enote" class="input area mini" maxlength="500" rows="2" placeholder="Descripción (opcional)">' + esc(d.note) + '</textarea>' +
      '<div class="row erow-btns">' +
        '<button class="btn ghost" data-action="hcancel">Cancelar</button>' +
        '<button class="btn primary" data-action="hsave"' + (ok ? '' : ' disabled') + '>Guardar</button>' +
      '</div>' +
    '</div>';
  }

  /* ---------- render ---------- */
  // keepScroll: no volver arriba (para cambios dentro de la misma pantalla).
  function render(keepScroll) {
    var y = window.scrollY;
    document.getElementById('title').textContent = TITLES[ui.tab];
    var view = document.getElementById('view');
    view.innerHTML = ui.tab === 'log' ? viewLog() : (ui.tab === 'stats' ? viewStats() : viewHistory());
    Array.prototype.forEach.call(document.querySelectorAll('.tabbar button'), function (b) {
      b.classList.toggle('active', b.dataset.tab === ui.tab);
    });
    window.scrollTo(0, keepScroll ? y : 0);
  }

  /* ---------- archivos ---------- */
  // Devuelve true si el archivo se compartió/descargó, false si el usuario canceló.
  async function saveFile(name, mime, text) {
    var file = new File([text], name, { type: mime });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: name });
        return true;
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return false;
    }
    var url = URL.createObjectURL(file);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    return true;
  }

  function csvCell(v) { return '"' + String(v).replace(/"/g, '""') + '"'; }
  function toCSV() {
    var rows = [['fecha', 'tipo', 'rr', 'resultado', 'r', 'max_movimiento', 'max_r', 'punto_entrada', 'impulso_con_fvg', 'descripcion']];
    S.sortTrades(DB.all()).forEach(function (t) {
      rows.push([t.date, t.type, t.rr, t.result, S.rOf(t), t.mfe, t.mfeX === null || t.mfeX === undefined ? '' : t.mfeX, (t.entry || []).join('+'),
        t.fvgFormed === true ? 'si' : (t.fvgFormed === false ? 'no' : ''), t.note || '']);
    });
    return rows.map(function (r) { return r.map(csvCell).join(','); }).join('\n');
  }

  /* ---------- acciones ---------- */
  function fvgfValue(code) { return code === 'si' ? true : (code === 'no' ? false : null); }
  function hDirty() { return ui.hEdit && JSON.stringify(ui.hEdit.d) !== ui.hEdit.orig; }
  // Muestra la tarjeta en pantalla si quedó fuera (al abrir o cerrar un editor).
  function revealItem(id) {
    var el = document.getElementById('it-' + id);
    if (!el) return;
    var r = el.getBoundingClientRect();
    if (r.top < 60 || r.bottom > window.innerHeight - 70) el.scrollIntoView({ block: 'nearest' });
  }

  var actions = {
    type: function (el) {
      if (!ui.date) { toast('Elegí una fecha'); return; }
      DB.setLastDate(ui.date);
      ui.draft = newDraft();
      ui.draft.type = el.dataset.v;
      ui.step = 1;
      render();
    },
    rr: function (el) { ui.draft.rr = Number(el.dataset.v); render(); },
    next: function () { ui.step = 2; render(); },
    back: function () { ui.step = Math.max(0, ui.step - 1); render(); },
    result: function (el) {
      var d = ui.draft;
      d.result = el.dataset.v;
      if (d.mfe !== null && !mfeAllowed(d.mfe, d.rr, d.result)) d.mfe = null;
      ui.step = 3;
      render();
    },
    mfe: function (el) {
      ui.draft.mfe = Number(el.dataset.v);
      if (ui.draft.mfe !== 3) ui.draft.mfeXText = '';
      render(true);
    },
    entry: function (el) {
      var v = el.dataset.v, cur = ui.draft.entry;
      var next = cur.indexOf(v) === -1 ? cur.concat([v]) : cur.filter(function (x) { return x !== v; });
      ui.draft.entry = ENTRY_OPTS.map(function (o) { return o[0]; }).filter(function (x) { return next.indexOf(x) !== -1; });
      var y = window.scrollY;
      render();
      window.scrollTo(0, y);
    },
    fvgf: function (el) {
      var v = fvgfValue(el.dataset.v);
      ui.draft.fvgFormed = ui.draft.fvgFormed === v ? null : v;
      render(true);
    },
    save: function () {
      var d = ui.draft;
      if (d.mfe === null || !mfeAllowed(d.mfe, d.rr, d.result)) { toast('Elegí el máximo movimiento'); return; }
      var mfeX = d.mfe === 3 ? parseMfeX(d.mfeXText) : null;
      if (mfeX !== null && isNaN(mfeX)) { toast('"¿Hasta cuántos R?" tiene que ser mayor a 2'); return; }
      var data = {
        date: ui.date, type: d.type, rr: d.rr, result: d.result, mfe: d.mfe, mfeX: mfeX, note: d.note,
        entry: d.entry, fvgFormed: d.fvgFormed
      };
      var t = DB.add(data);
      if (!t) { toast('No se pudo guardar (¿almacenamiento lleno?)'); return; }
      askPersistence();
      ui.draft = newDraft();
      ui.step = 0;
      render();
      toast('Guardado ✓  ' + fmtR(S.rOf(t)));
    },
    // Edición en el historial: abre la tarjeta con un editor compacto.
    edit: function (el) {
      var t = DB.all().filter(function (x) { return x.id === el.dataset.id; })[0];
      if (!t) return;
      if (hDirty() && !confirm('Tenés cambios sin guardar en otro trade. ¿Descartarlos?')) return;
      var d = { date: t.date, type: t.type, rr: t.rr, result: t.result, mfe: t.mfe,
        mfeXText: typeof t.mfeX === 'number' ? String(t.mfeX) : '', note: t.note || '', entry: (t.entry || []).slice(), fvgFormed: t.fvgFormed === undefined ? null : t.fvgFormed };
      ui.hEdit = { id: t.id, d: d, orig: JSON.stringify(d) };
      render(true);
      revealItem(t.id);
    },
    hset: function (el) {
      var d = ui.hEdit && ui.hEdit.d;
      if (!d) return;
      var f = el.dataset.f, v = el.dataset.v;
      if (f === 'rr' || f === 'mfe') v = Number(v);
      if (f === 'entry') {
        var next = d.entry.indexOf(v) === -1 ? d.entry.concat([v]) : d.entry.filter(function (x) { return x !== v; });
        d.entry = ENTRY_OPTS.map(function (o) { return o[0]; }).filter(function (x) { return next.indexOf(x) !== -1; });
      } else if (f === 'fvgFormed') {
        v = fvgfValue(v);
        d.fvgFormed = d.fvgFormed === v ? null : v; // tocar de nuevo lo quita
      } else {
        d[f] = v;
      }
      // Si cambia el R:R o el resultado, el máximo movimiento puede dejar de ser coherente.
      if (d.mfe !== null && !mfeAllowed(d.mfe, d.rr, d.result)) d.mfe = null;
      if (d.mfe !== 3) d.mfeXText = '';
      render(true);
    },
    hsave: function () {
      var h = ui.hEdit;
      if (!h) return;
      var d = h.d;
      if (d.mfe === null || !mfeAllowed(d.mfe, d.rr, d.result)) { toast('Elegí el máximo movimiento'); return; }
      var mfeX = d.mfe === 3 ? parseMfeX(d.mfeXText) : null;
      if (mfeX !== null && isNaN(mfeX)) { toast('"¿Hasta cuántos R?" tiene que ser mayor a 2'); return; }
      var data = {
        date: d.date, type: d.type, rr: d.rr, result: d.result, mfe: d.mfe, mfeX: mfeX, note: d.note,
        entry: d.entry, fvgFormed: d.fvgFormed
      };
      if (!DB.update(h.id, data)) { toast('No se pudo guardar el cambio'); return; }
      ui.hEdit = null;
      render(true);
      revealItem(h.id);
      toast('Cambios guardados ✓');
    },
    hcancel: function () {
      var id = ui.hEdit && ui.hEdit.id;
      ui.hEdit = null;
      render(true);
      if (id) revealItem(id);
    },
    filter: function (el) { ui.filter = el.dataset.v; render(); },
    del: function (el) {
      if (!confirm('¿Borrar este trade?')) return;
      DB.remove(el.dataset.id);
      if (ui.hEdit && ui.hEdit.id === el.dataset.id) ui.hEdit = null;
      render(true);
    },
    'export-json': function () {
      var day = todayStr();
      saveFile('orb-backtest-' + day + '.json', 'application/json', DB.exportJSON()).then(function (ok) {
        if (!ok) return;
        DB.markBackup();
        render();
        toast('Backup listo ✓');
      });
    },
    'export-csv': function () { saveFile('orb-backtest.csv', 'text/csv', toCSV()); },
    import: function () { var f = document.getElementById('importFile'); if (f) f.click(); },
    clear: function () {
      if (confirm('¿Borrar TODOS los trades? Esto no se puede deshacer.') && confirm('Última confirmación: borrar todo.')) {
        DB.clear(); render(); toast('Datos borrados');
      }
    }
  };

  var viewEl = document.getElementById('view');
  viewEl.addEventListener('click', function (e) {
    var el = e.target.closest('[data-action]');
    if (!el || el.disabled) return;
    var fn = actions[el.dataset.action];
    if (fn) fn(el);
  });
  viewEl.addEventListener('input', function (e) {
    if (e.target.id === 'note') ui.draft.note = e.target.value;
    else if (e.target.id === 'enote' && ui.hEdit) ui.hEdit.d.note = e.target.value;
    else if (e.target.id === 'mfex' || (e.target.id === 'emfex' && ui.hEdit)) {
      (e.target.id === 'mfex' ? ui.draft : ui.hEdit.d).mfeXText = e.target.value;
      var warn = e.target.parentNode.parentNode.querySelector('.mfex-bad');
      if (warn) warn.hidden = !(e.target.value.trim() && isNaN(parseMfeX(e.target.value)));
    }
  });
  viewEl.addEventListener('change', function (e) {
    if (e.target.id === 'date') {
      ui.date = e.target.value;
      render();
    } else if (e.target.id === 'edate' && ui.hEdit) {
      ui.hEdit.d.date = e.target.value;
      render(true);
    } else if (e.target.id === 'importFile') {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var n = DB.importJSON(String(reader.result));
          render();
          toast('Importados: ' + n);
        } catch (err) { toast('Archivo inválido'); }
      };
      reader.readAsText(file);
    }
  });
  Array.prototype.forEach.call(document.querySelectorAll('.tabbar button'), function (b) {
    b.addEventListener('click', function () { ui.tab = b.dataset.tab; render(); });
  });

  // Pide almacenamiento persistente (el navegador puede decidir no darlo; se reintenta al guardar).
  function askPersistence() {
    if (ui.persisted) return;
    DB.requestPersistence().then(function (ok) {
      if (ok && !ui.persisted) { ui.persisted = true; if (ui.tab === 'history') render(); }
    });
  }

  render();
  askPersistence();

  // Offline: el service worker solo funciona en https o localhost.
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    var hadController = !!navigator.serviceWorker.controller;
    var reloaded = false;
    // Cuando se instala una versión nueva, recarga sola (salvo que estés a mitad de un registro).
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (!hadController || reloaded) return;
      if (ui.step === 0 && !ui.hEdit) { reloaded = true; location.reload(); }
      else toast('Hay una versión nueva: se aplica al volver a abrir la app');
    });
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').then(function (reg) {
        // Al volver a la app (desde otra app o la pantalla de inicio), busca actualizaciones.
        document.addEventListener('visibilitychange', function () {
          if (document.visibilityState === 'visible') reg.update().catch(function () { /* sin red */ });
        });
      }).catch(function () { /* sin offline, pero la app sigue andando */ });
    });
  }
})();
