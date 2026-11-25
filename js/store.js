/* Persistencia en localStorage. Todo queda en el dispositivo, no hay servidor. */
(function (root) {
  'use strict';

  // v2 suma el punto de entrada (opcional). v1 se migra al abrir y queda intacta como respaldo.
  var KEY = 'orb-bt:v2';
  var OLD_KEY = 'orb-bt:v1';
  var VERSION = 2;
  var TYPES = ['absorcion', 'ruptura'];
  var RRS = [1, 1.5, 2];
  var MFES = [0, 1, 1.5, 2, 3]; // 0 = menos de 1:1, 3 = más de 2:1

  // Contexto del setup. null = no se cargó.
  var CTX = {
    entry: ['fvg', 'ob', 'borde'] // punto de entrada: FVG, order block o borde del rango
  };
  var CTX_KEYS = Object.keys(CTX);

  function valid(t) {
    return t && typeof t.id === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(t.date) &&
      TYPES.indexOf(t.type) !== -1 &&
      RRS.indexOf(t.rr) !== -1 &&
      (t.result === 'TP' || t.result === 'SL') &&
      MFES.indexOf(t.mfe) !== -1 &&
      typeof t.createdAt === 'number' &&
      CTX_KEYS.every(function (k) { return t[k] === null || CTX[k].indexOf(t[k]) !== -1; });
  }

  // Lleva un trade de cualquier versión al formato actual (los campos de contexto que falten quedan en null).
  function normalize(t) {
    if (!t || typeof t !== 'object') return null;
    var out = {
      id: t.id, date: t.date, type: t.type, rr: t.rr, result: t.result, mfe: t.mfe,
      note: typeof t.note === 'string' ? t.note.slice(0, 500) : '', createdAt: t.createdAt
    };
    CTX_KEYS.forEach(function (k) { out[k] = CTX[k].indexOf(t[k]) !== -1 ? t[k] : null; });
    return out;
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function serialize(s) {
    return JSON.stringify({ version: VERSION, trades: s.trades, lastDate: s.lastDate });
  }

  var state = load();

  function load() {
    var raw = null, src = KEY;
    try {
      raw = localStorage.getItem(KEY);
      if (!raw) { src = OLD_KEY; raw = localStorage.getItem(OLD_KEY); }
      if (!raw) return { trades: [], lastDate: null };
      var d = JSON.parse(raw);
      if (!d || !Array.isArray(d.trades)) throw new Error('formato');
      var s = { trades: d.trades.map(normalize).filter(valid), lastDate: d.lastDate || null };
      if (src === OLD_KEY) {
        try { localStorage.setItem(KEY, serialize(s)); } catch (e) { /* se reintenta en el próximo guardado */ }
      }
      return s;
    } catch (e) {
      // Si algo está corrupto, guardamos copia antes de que se pise.
      try { if (raw) localStorage.setItem(src + ':corrupt', raw); } catch (e2) { /* nada */ }
      return { trades: [], lastDate: null };
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
    CTX: CTX,
    all: function () { return state.trades.slice(); },
    getLastDate: function () { return state.lastDate; },
    setLastDate: function (d) { state.lastDate = d; return persist(); },
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
    // Mezcla por id: no duplica lo que ya está. Acepta exportaciones v1 y v2.
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

  root.BTStore = api;
})(typeof window !== 'undefined' ? window : globalThis);
