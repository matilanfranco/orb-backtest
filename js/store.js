/* Persistencia en localStorage. Todo queda en el dispositivo, no hay servidor. */
(function (root) {
  'use strict';

  // v4: nuevo tipo de entrada 'imbalance' (ruptura con imbalance). Clave nueva para que una versión vieja de la app
  //     (que no conoce ese tipo) nunca lea estos datos y descarte esos trades.
  // v3: el punto de entrada pasa a ser multiselección (lista). v2 suma el punto de entrada; v1 es el original.
  // Al abrir se migra desde la versión más nueva que exista; las claves viejas quedan intactas como respaldo.
  var KEY = 'orb-bt:v4';
  var OLD_KEYS = ['orb-bt:v3', 'orb-bt:v2', 'orb-bt:v1'];
  var VERSION = 4;
  var TYPES = ['absorcion', 'ruptura', 'imbalance'];
  var RRS = [1, 1.5, 2];
  var MFES = [0, 1, 1.5, 2, 3]; // 0 = menos de 1:1, 3 = más de 2:1

  // Punto de entrada (multiselección, puede quedar vacío): FVG, order block, borde del rango.
  var ENTRIES = ['fvg', 'ob', 'borde'];

  function validEntry(e) {
    return Array.isArray(e) && e.every(function (x, i) { return ENTRIES.indexOf(x) !== -1 && e.indexOf(x) === i; });
  }

  function valid(t) {
    return t && typeof t.id === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(t.date) &&
      TYPES.indexOf(t.type) !== -1 &&
      RRS.indexOf(t.rr) !== -1 &&
      (t.result === 'TP' || t.result === 'SL') &&
      MFES.indexOf(t.mfe) !== -1 &&
      typeof t.createdAt === 'number' &&
      validEntry(t.entry);
  }

  // v2 guardaba un valor suelto o null; v3 guarda una lista sin repetidos, en el orden de ENTRIES.
  function normalizeEntry(e) {
    var list = Array.isArray(e) ? e : (e === null || e === undefined ? [] : [e]);
    return ENTRIES.filter(function (x) { return list.indexOf(x) !== -1; });
  }

  // Lleva un trade de cualquier versión al formato actual.
  function normalize(t) {
    if (!t || typeof t !== 'object') return null;
    return {
      id: t.id, date: t.date, type: t.type, rr: t.rr, result: t.result, mfe: t.mfe,
      note: typeof t.note === 'string' ? t.note.slice(0, 500) : '', createdAt: t.createdAt,
      entry: normalizeEntry(t.entry)
    };
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  // ¿Toca recordar el backup? Solo si hay trades nuevos desde el último export y:
  // nunca se exportó y ya hay 5 o más, pasaron 7 días o más, o se cargaron 20 o más.
  var DAY = 24 * 60 * 60 * 1000;
  function backupStatus(trades, lastBackup, now) {
    var since = lastBackup || 0;
    var newTrades = trades.filter(function (t) { return t.createdAt > since; }).length;
    var days = lastBackup ? Math.floor((now - lastBackup) / DAY) : null;
    var due = newTrades > 0 && (lastBackup ? (days >= 7 || newTrades >= 20) : newTrades >= 5);
    return { due: due, newTrades: newTrades, days: days, lastBackup: lastBackup || null };
  }

  function serialize(s) {
    return JSON.stringify({ version: VERSION, trades: s.trades, lastDate: s.lastDate, lastBackup: s.lastBackup });
  }

  var state = load();

  function load() {
    var raw = null, src = KEY;
    try {
      raw = localStorage.getItem(KEY);
      for (var i = 0; !raw && i < OLD_KEYS.length; i++) { src = OLD_KEYS[i]; raw = localStorage.getItem(src); }
      if (!raw) return { trades: [], lastDate: null, lastBackup: null };
      var d = JSON.parse(raw);
      if (!d || !Array.isArray(d.trades)) throw new Error('formato');
      var s = {
        trades: d.trades.map(normalize).filter(valid), lastDate: d.lastDate || null,
        lastBackup: typeof d.lastBackup === 'number' ? d.lastBackup : null
      };
      if (src !== KEY) {
        try { localStorage.setItem(KEY, serialize(s)); } catch (e) { /* se reintenta en el próximo guardado */ }
      }
      return s;
    } catch (e) {
      // Si algo está corrupto, guardamos copia antes de que se pise.
      try { if (raw) localStorage.setItem(src + ':corrupt', raw); } catch (e2) { /* nada */ }
      return { trades: [], lastDate: null, lastBackup: null };
    }
  }

  function persist() {
    try {
      localStorage.setItem(KEY, serialize(state));
      return true;
    } catch (e) {
      return false;
    }
  }

  var api = {
    ENTRIES: ENTRIES,
    all: function () { return state.trades.slice(); },
    getLastDate: function () { return state.lastDate; },
    setLastDate: function (d) { state.lastDate = d; return persist(); },
    backupStatus: function (now) { return backupStatus(state.trades, state.lastBackup, now || Date.now()); },
    markBackup: function (now) { state.lastBackup = now || Date.now(); return persist(); },
    // Pide al navegador que no borre estos datos aunque le falte espacio. Devuelve una promesa con true/false.
    requestPersistence: function () {
      try {
        if (navigator.storage && navigator.storage.persist) {
          return navigator.storage.persisted().then(function (p) { return p || navigator.storage.persist(); })
            .catch(function () { return false; });
        }
      } catch (e) { /* navegador sin soporte */ }
      return Promise.resolve(false);
    },
    add: function (t) {
      var trade = normalize({
        id: uid(), date: t.date, type: t.type, rr: t.rr, result: t.result,
        mfe: t.mfe, note: t.note || '', createdAt: Date.now(),
        entry: t.entry
      });
      if (!valid(trade)) return null;
      state.trades.push(trade);
      return persist() ? trade : null;
    },
    // Reemplaza los datos de un trade existente. Mantiene id y createdAt (el orden del historial no cambia).
    update: function (id, t) {
      var i = -1;
      state.trades.forEach(function (x, k) { if (x.id === id) i = k; });
      if (i === -1) return null;
      var old = state.trades[i];
      var trade = normalize({
        id: old.id, date: t.date, type: t.type, rr: t.rr, result: t.result,
        mfe: t.mfe, note: t.note || '', createdAt: old.createdAt, entry: t.entry
      });
      if (!valid(trade)) return null;
      state.trades[i] = trade;
      if (persist()) return trade;
      state.trades[i] = old;
      return null;
    },
    remove: function (id) {
      state.trades = state.trades.filter(function (t) { return t.id !== id; });
      return persist();
    },
    clear: function () { state.trades = []; return persist(); },
    exportJSON: function () {
      return JSON.stringify({ version: VERSION, exportedAt: new Date().toISOString(), trades: state.trades }, null, 2);
    },
    // Mezcla por id: no duplica lo que ya está. Acepta exportaciones de cualquier versión.
    importJSON: function (text) {
      var d = JSON.parse(text);
      var list = Array.isArray(d) ? d : d.trades;
      if (!Array.isArray(list)) throw new Error('El archivo no tiene trades');
      var have = {};
      state.trades.forEach(function (t) { have[t.id] = true; });
      var added = 0;
      list.map(normalize).forEach(function (t) {
        if (valid(t) && !have[t.id]) { state.trades.push(t); have[t.id] = true; added++; }
      });
      persist();
      return added;
    }
  };

  api.backupStatusOf = backupStatus; // versión pura, para tests
  root.BTStore = api;
})(typeof window !== 'undefined' ? window : globalThis);
