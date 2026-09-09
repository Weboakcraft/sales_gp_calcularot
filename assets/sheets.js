/* ===========================================================================
   Sheets API layer
   Talks to the Apps Script web app. Every call is POST with
   Content-Type: text/plain so the browser treats it as a "simple request"
   and skips the CORS preflight that Apps Script cannot answer.
   Falls back to browser storage when no endpoint is configured, so the
   calculator stays fully usable offline.
   =========================================================================== */
(function (root) {
  'use strict';

  var LS_URL = 'gp.endpoint', LS_TOKEN = 'gp.token', LS_CACHE = 'gp.cache';

  function ls(k, v) {
    try {
      if (v === undefined) return localStorage.getItem(k);
      if (v === null) { localStorage.removeItem(k); return null; }
      localStorage.setItem(k, v); return v;
    } catch (e) { return null; }
  }

  /* assets/config.js wins when it holds a real value; otherwise fall back to
     whatever was typed into the Connect Sheets dialog on this device. */
  var CFG = root.GP_CONFIG || {};
  var unset = function (v) {
    return !v || /^PASTE_|CHANGE-ME/.test(String(v).trim());
  };
  var pick = function (cfgVal, lsKey) {
    return unset(cfgVal) ? (ls(lsKey) || '') : String(cfgVal).trim();
  };

  var API = {
    endpoint: pick(CFG.endpoint, LS_URL),
    token: pick(CFG.token, LS_TOKEN),
    fromConfig: !unset(CFG.endpoint),
    online: false,

    configure: function (url, token) {
      this.endpoint = (url || '').trim();
      this.token = (token || '').trim();
      ls(LS_URL, this.endpoint); ls(LS_TOKEN, this.token);
    },

    call: function (action, payload) {
      var self = this;
      if (!this.endpoint) return Promise.reject(new Error('No Google Sheets endpoint configured.'));
      return fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: action, token: this.token, payload: payload || {} })
      })
        .then(function (r) {
          if (!r.ok) throw new Error('Sheets responded ' + r.status);
          return r.json();
        })
        .then(function (j) {
          if (!j.ok) throw new Error(j.error || 'Sheets rejected the request.');
          self.online = true;
          return j.data;
        })
        .catch(function (e) { self.online = false; throw e; });
    },

    /* masters + settings in one round trip on page load */
    bootstrap: function () { return this.call('bootstrap'); },
    nextOrderId: function () { return this.call('nextOrderId'); },
    saveOrder: function (bundle) { return this.call('saveOrder', bundle); },
    getOrder: function (id) { return this.call('getOrder', { orderId: id }); },
    listOrders: function (limit) { return this.call('listOrders', { limit: limit || 100 }); },

    /* -------- offline mirror -------- */
    cacheLocal: function (bundle) {
      var all = this.readLocal();
      all[bundle.order.orderId] = bundle;
      ls(LS_CACHE, JSON.stringify(all));
    },
    readLocal: function () {
      try { return JSON.parse(ls(LS_CACHE) || '{}'); } catch (e) { return {}; }
    }
  };

  root.SheetsAPI = API;
})(typeof window !== 'undefined' ? window : globalThis);
