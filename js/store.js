/* Persistencia en localStorage. Todo queda en el dispositivo, no hay servidor. */
(function (root) {
  'use strict';

  var KEY = 'orb-bt:v1';
  var TYPES = ['absorcion', 'ruptura'];
  var RRS = [1, 1.5, 2];
  var MFES = [0, 1, 1.5, 2, 3]; // 0 = menos de 1:1, 3 = más de 2:1

  function valid(t) {
    return t && typeof t.id === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(t.date) &&
      TYPES.indexOf(t.type) !== -1 &&
      RRS.indexOf(t.rr) !== -1 &&
      (t.result === 'TP' || t.result === 'SL') &&
      MFES.indexOf(t.mfe) !== -1 &&
      typeof t.createdAt === 'number';
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  var state = load();

  function load() {
    var raw = null;
    try {
      raw = localStorage.getItem(KEY);
      if (!raw) return { trades: [], lastDate: null };
      var d = JSON.parse(raw);
      if (!d || !Array.isArray(d.trades)) throw new Error('formato');
      return { trades: d.trades.filter(valid), lastDate: d.lastDate || null };
    } catch (e) {
      // Si algo está corrupto, guardamos copia antes de que se pise.
      try { if (raw) localStorage.setItem(KEY + ':corrupt', raw); } catch (e2) { /* nada */ }
      return { trades: [], lastDate: null };
    }
  }

  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ version: 1, trades: state.trades, lastDate: state.lastDate }));
      return true;
    } catch (e) {
      return false;
    }
  }

  var api = {
    all: function () { return state.trades.slice(); },
    getLastDate: function () { return state.lastDate; },
    setLastDate: function (d) { state.lastDate = d; return persist(); },
    add: function (t) {
      var trade = {
        id: uid(), date: t.date, type: t.type, rr: t.rr, result: t.result,
        mfe: t.mfe, note: (t.note || '').slice(0, 300), createdAt: Date.now()
      };
      if (!valid(trade)) return null;
      state.trades.push(trade);
      return persist() ? trade : null;
    },
    remove: function (id) {
      state.trades = state.trades.filter(function (t) { return t.id !== id; });
      return persist();
    },
    clear: function () { state.trades = []; return persist(); },
    exportJSON: function () {
      return JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), trades: state.trades }, null, 2);
    },
    // Mezcla por id: no duplica lo que ya está.
    importJSON: function (text) {
      var d = JSON.parse(text);
      var list = Array.isArray(d) ? d : d.trades;
      if (!Array.isArray(list)) throw new Error('El archivo no tiene trades');
      var have = {};
      state.trades.forEach(function (t) { have[t.id] = true; });
      var added = 0;
      list.forEach(function (t) {
        if (valid(t) && !have[t.id]) { state.trades.push(t); have[t.id] = true; added++; }
      });
      persist();
      return added;
    }
  };

  root.BTStore = api;
})(window);
