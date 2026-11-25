/* UI: registrar, estadísticas, historial. Vanilla JS, sin build. */
(function () {
  'use strict';

  var S = window.BTStats;
  var DB = window.BTStore;

  var TYPE_LABEL = { absorcion: 'Absorción', ruptura: 'Ruptura' };
  var RR_OPTS = [1, 1.5, 2];
  var MFE_OPTS = [
    { v: 0, label: 'Menos de 1:1' },
    { v: 1, label: '1:1' },
    { v: 1.5, label: '1.5:1' },
    { v: 2, label: '2:1' },
    { v: 3, label: 'Más de 2:1' }
  ];
  var DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  var TITLES = { log: 'Registrar', stats: 'Estadísticas', history: 'Historial' };

  var ui = {
    tab: 'log',
    step: 0,
    date: DB.getLastDate() || todayStr(),
    draft: newDraft(),
    filter: 'all'
  };

  /* ---------- helpers ---------- */
  function newDraft() { return { type: null, rr: 1, result: null, mfe: null, note: '' }; }
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
  function rrLabel(rr) { return rr === 1 ? '1:1' : (rr === 1.5 ? '1.5:1' : '2:1'); }
  function mfeLabel(v) {
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

  var toastTimer = null;
  function toast(msg) {
    var el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2200);
  }

  /* ---------- registrar ---------- */
  function viewLog() {
    var d = ui.draft;
    if (ui.step === 0) {
      var count = DB.all().filter(function (t) { return t.date === ui.date; }).length;
      return '' +
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
        '<label class="lbl" for="note">Nota (opcional)</label>' +
        '<input type="text" id="note" class="input" maxlength="300" placeholder="ej: FVG + estructura M1" value="' + esc(d.note) + '">' +
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

  function bestLabel(ideal) { return ideal.best === null ? '—' : rrLabel(ideal.best); }

  function viewStats() {
    var all = DB.all();
    var trades = ui.filter === 'all' ? all : all.filter(function (t) { return t.type === ui.filter; });

    var chips = '<div class="chips tight">' +
      [['all', 'Todas'], ['absorcion', 'Absorción'], ['ruptura', 'Ruptura']].map(function (f) {
        return '<button class="chip' + (ui.filter === f[0] ? ' sel' : '') + '" data-action="filter" data-v="' + f[0] + '">' + f[1] + '</button>';
      }).join('') + '</div>';

    if (!trades.length) {
      return chips + '<section class="card empty"><p>Todavía no hay trades' +
        (ui.filter === 'all' ? '' : ' de este tipo') + '.</p><p class="hint">Registrá algunos en la pestaña Registrar.</p></section>';
    }

    var s = S.summarize(trades);
    var ideal = S.idealTargets(trades);
    var html = chips;

    if (s.n < 30) {
      html += '<p class="warn">Muestra chica (' + s.n + ' trades). Con menos de 30, los números todavía son ruido.</p>';
    }

    html += '<section class="grid">' +
      card('Trades', s.n, s.wins + ' take · ' + s.losses + ' SL') +
      card('Win rate', fmtPct(s.winRate, 1), '± ' + fmtPct(s.margin, 1) + ' (95%)') +
      card('R neto', fmtR(s.netR), '', cls(s.netR)) +
      card('Expectativa', fmtR(s.expectancy), 'por trade', cls(s.expectancy)) +
      card('Profit factor', fmtPF(s.profitFactor), '', s.profitFactor >= 1 ? 'pos' : 'neg') +
      card('Máx. drawdown', '−' + s.maxDD.toFixed(2) + 'R', '', s.maxDD > 0 ? 'neg' : '') +
      card('Racha perdedora', s.maxLossStreak, 'máxima') +
      card('Racha ganadora', s.maxWinStreak, 'máxima') +
    '</section>';

    html += '<section class="card"><h3>Win rate vs. lo que necesitás</h3>' +
      '<p>Tu win rate: <b>' + fmtPct(s.winRate, 1) + '</b> · mínimo para no perder con tus R:R: <b>' + fmtPct(s.breakEvenWR, 1) + '</b> ' +
      '<span class="' + (s.winRate > s.breakEvenWR ? 'pos' : 'neg') + '">(' +
      (s.winRate >= s.breakEvenWR ? '+' : '') + ((s.winRate - s.breakEvenWR) * 100).toFixed(1) + ' pts)</span></p></section>';

    html += '<section class="card"><h3>Curva de capital (R)</h3>' + (s.n > 1 ? equitySvg(s.equity) : '<p class="hint">Hacen falta al menos 2 trades.</p>') + '</section>';

    html += '<section class="card"><h3>Take profit ideal</h3>' +
      '<table class="tbl"><thead><tr><th>Objetivo</th><th>Llegó</th><th>Necesario</th><th>Expectativa</th></tr></thead><tbody>' +
      ideal.rows.map(function (r) {
        return '<tr' + (r.target === ideal.best ? ' class="best"' : '') + '><td>' + rrLabel(r.target) + (r.target === ideal.best ? ' ★' : '') + '</td>' +
          '<td>' + fmtPct(r.reach, 0) + ' <small>(' + r.hits + '/' + r.n + ')</small></td>' +
          '<td>' + fmtPct(r.breakEven, 0) + '</td>' +
          '<td class="' + cls(r.expectancy) + '">' + fmtR(r.expectancy) + '</td></tr>';
      }).join('') + '</tbody></table>' +
      '<p class="hint">Con tus datos, el objetivo con mejor expectativa es <b>' + bestLabel(ideal) + '</b>. ' +
      '"Llegó" = % de trades donde el máximo movimiento alcanzó ese objetivo; si no llegó, se asume pérdida de 1R.</p></section>';

    var dist = S.mfeDistribution(trades);
    var maxCount = Math.max.apply(null, MFE_OPTS.map(function (o) { return dist[o.v] || 0; })) || 1;
    html += '<section class="card"><h3>Máximo movimiento antes del SL</h3>' +
      MFE_OPTS.map(function (o) {
        var c = dist[o.v] || 0;
        return '<div class="bar"><span class="bl">' + o.label + '</span><span class="bt"><i style="width:' + (100 * c / maxCount).toFixed(0) + '%"></i></span><span class="bn">' + c + '</span></div>';
      }).join('') + '</section>';

    if (ui.filter === 'all') {
      var byType = S.groupBy(trades, function (t) { return t.type; });
      html += '<section class="card"><h3>Por tipo de entrada</h3>' + groupTable(byType, function (k) { return TYPE_LABEL[k]; }, ['absorcion', 'ruptura']) + '</section>';
    }

    var byRR = S.groupBy(trades, function (t) { return t.rr; });
    html += '<section class="card"><h3>Por R:R elegido</h3>' + groupTable(byRR, function (k) { return rrLabel(Number(k)); }, ['1', '1.5', '2'], true) + '</section>';

    var byDay = S.groupBy(trades, function (t) { return weekday(t.date); });
    html += '<section class="card"><h3>Por día de la semana</h3>' + groupTable(byDay, function (k) { return DAYS[k]; }, ['1', '2', '3', '4', '5', '0', '6'], true) + '</section>';

    return html;
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
    var html = '<section class="card"><h3>Datos</h3>' +
      '<p class="hint">Todo se guarda solo en este dispositivo. Exportá una copia de vez en cuando.</p>' +
      '<div class="chips tight">' +
        '<button class="chip" data-action="export-json">Exportar JSON</button>' +
        '<button class="chip" data-action="export-csv">Exportar CSV</button>' +
        '<button class="chip" data-action="import">Importar JSON</button>' +
        '<button class="chip danger" data-action="clear">Borrar todo</button>' +
      '</div>' +
      '<input type="file" id="importFile" accept="application/json,.json" hidden>' +
    '</section>';

    if (!list.length) return html + '<section class="card empty"><p>No hay trades guardados.</p></section>';

    html += '<section class="list">' + list.map(function (t) {
      var r = S.rOf(t);
      return '<div class="item">' +
        '<div class="top"><span class="date">' + esc(t.date) + '</span>' +
          '<span class="tag ' + t.type + '">' + TYPE_LABEL[t.type] + '</span>' +
          '<span class="badge ' + (t.result === 'TP' ? 'tp' : 'sl') + '">' + t.result + ' ' + fmtR(r) + '</span></div>' +
        '<div class="sub">R:R ' + rrLabel(t.rr) + ' · máx. ' + mfeLabel(t.mfe) + (t.note ? ' · ' + esc(t.note) : '') + '</div>' +
        '<button class="del" aria-label="Borrar trade" data-action="del" data-id="' + esc(t.id) + '">Borrar</button>' +
      '</div>';
    }).join('') + '</section>';
    return html;
  }

  /* ---------- render ---------- */
  function render() {
    document.getElementById('title').textContent = TITLES[ui.tab];
    var view = document.getElementById('view');
    view.innerHTML = ui.tab === 'log' ? viewLog() : (ui.tab === 'stats' ? viewStats() : viewHistory());
    Array.prototype.forEach.call(document.querySelectorAll('.tabbar button'), function (b) {
      b.classList.toggle('active', b.dataset.tab === ui.tab);
    });
    window.scrollTo(0, 0);
  }

  /* ---------- archivos ---------- */
  async function saveFile(name, mime, text) {
    var file = new File([text], name, { type: mime });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: name });
        return;
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return;
    }
    var url = URL.createObjectURL(file);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function csvCell(v) { return '"' + String(v).replace(/"/g, '""') + '"'; }
  function toCSV() {
    var rows = [['fecha', 'tipo', 'rr', 'resultado', 'r', 'max_movimiento', 'nota']];
    S.sortTrades(DB.all()).forEach(function (t) {
      rows.push([t.date, t.type, t.rr, t.result, S.rOf(t), t.mfe, t.note || '']);
    });
    return rows.map(function (r) { return r.map(csvCell).join(','); }).join('\n');
  }

  /* ---------- acciones ---------- */
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
    back: function () { ui.step = Math.max(0, ui.step - 1); if (ui.step < 3) ui.draft.mfe = null; render(); },
    result: function (el) { ui.draft.result = el.dataset.v; ui.draft.mfe = null; ui.step = 3; render(); },
    mfe: function (el) { ui.draft.mfe = Number(el.dataset.v); render(); },
    save: function () {
      var d = ui.draft;
      if (d.mfe === null || !mfeAllowed(d.mfe, d.rr, d.result)) { toast('Elegí el máximo movimiento'); return; }
      var t = DB.add({ date: ui.date, type: d.type, rr: d.rr, result: d.result, mfe: d.mfe, note: d.note });
      if (!t) { toast('No se pudo guardar (¿almacenamiento lleno?)'); return; }
      ui.draft = newDraft();
      ui.step = 0;
      render();
      toast('Guardado ✓  ' + fmtR(S.rOf(t)));
    },
    filter: function (el) { ui.filter = el.dataset.v; render(); },
    del: function (el) {
      if (confirm('¿Borrar este trade?')) { DB.remove(el.dataset.id); render(); }
    },
    'export-json': function () { saveFile('orb-backtest.json', 'application/json', DB.exportJSON()); },
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
  });
  viewEl.addEventListener('change', function (e) {
    if (e.target.id === 'date') {
      ui.date = e.target.value;
      render();
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

  render();

  // Offline: el service worker solo funciona en https o localhost.
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { /* sin offline, pero la app sigue andando */ });
    });
  }
})();
