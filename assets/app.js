/* ===========================================================================
   Sales GP Calculator — application layer
   =========================================================================== */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var E = window.GPEngine, API = window.SheetsAPI;

  /* ---------- formatting (Indian numbering) ------------------------------ */
  var inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
  var inr2 = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function money(v) { var n = +v || 0; return (n < 0 ? '−₹' : '₹') + inr.format(Math.abs(Math.round(n))); }
  function money2(v) { var n = +v || 0; return (n < 0 ? '−₹' : '₹') + inr2.format(Math.abs(n)); }
  function pc(v) { var n = +v || 0; return (isFinite(n) ? n.toFixed(1) : '0.0') + '%'; }
  function compact(v) {
    var n = Math.abs(+v || 0), s = (+v < 0 ? '−' : '');
    if (n >= 1e7) return s + '₹' + (n / 1e7).toFixed(2) + ' Cr';
    if (n >= 1e5) return s + '₹' + (n / 1e5).toFixed(2) + ' L';
    return s + '₹' + inr.format(Math.round(n));
  }

  /* ---------- fallback masters (used until Sheets is connected) ---------- */
  var MASTERS = {
    settings: {
      companyName: 'Manufacturing · order profitability',
      interestPct: 11, pbgChargePct: 1.5, targetGpPct: 20,
      defaultGstPct: 18
    },
    products: [
      { sku: 'HURRICANE', name: 'Hurricane', listPrice: 0, cStandard: 0, cPacking: 0, cFreight: 0 },
      { sku: 'MATRIX-HB', name: 'Matrix HB', listPrice: 0, cStandard: 0, cPacking: 0, cFreight: 0 },
      { sku: 'MATRIX-MB', name: 'Matrix MB', listPrice: 0, cStandard: 0, cPacking: 0, cFreight: 0 },
      { sku: '01', name: '01', listPrice: 0, cStandard: 0, cPacking: 0, cFreight: 0 },
      { sku: '15-NO', name: '15 No.', listPrice: 0, cStandard: 0, cPacking: 0, cFreight: 0 },
      { sku: 'BUTTERFLY', name: 'Butterfly', listPrice: 0, cStandard: 0, cPacking: 0, cFreight: 0 },
      { sku: 'ROBO', name: 'Robo', listPrice: 0, cStandard: 0, cPacking: 0, cFreight: 0 },
      { sku: 'PEARS', name: 'Pears', listPrice: 0, cStandard: 0, cPacking: 0, cFreight: 0 },
      { sku: '07', name: '07', listPrice: 0, cStandard: 0, cPacking: 0, cFreight: 0 },
      { sku: 'BOOM', name: 'Boom', listPrice: 0, cStandard: 0, cPacking: 0, cFreight: 0 }
    ],
    customers: [],
    approvalMatrix: E.defaultApprovalMatrix
  };

  /* ---------- line rows -------------------------------------------------- */
  var NUMCOLS = [
    ['qty', 'w-xs', 1], ['listPrice', 'w-m', 0], ['discPct', 'w-xs', 0]
  ];
  var COSTCOLS = ['cStandard', 'cPacking', 'cFreight'];
  var rowSeq = 0;

  function modelOptions(sel) {
    return '<option value="">Pick a model</option>' + MASTERS.products.map(function (p) {
      return '<option' + (p.name === sel ? ' selected' : '') + '>' + esc(p.name) + '</option>';
    }).join('');
  }

  function custRowsOf(id) {
    return [].slice.call($('lineBody').querySelectorAll('tr.cust[data-parent="' + id + '"]'));
  }

  function makeCustRow(id, seed) {
    var d = seed || {};
    var tr = document.createElement('tr');
    tr.className = 'cust';
    tr.dataset.parent = id;
    tr.innerHTML =
      '<td colspan="5" class="l"><span class="cust-tag">Customisation</span>' +
      '<input class="w-l" data-k="desc" value="' + esc(d.desc || '') +
      '" placeholder="What changed — e.g. adjustable armrest"></td>' +
      '<td></td>' +
      '<td><input type="number" class="w-s" data-k="rate" step="any" value="' + (d.rate || 0) + '"></td>' +
      '<td colspan="7"><button class="x-btn" title="Remove this customisation" aria-label="Remove customisation">×</button></td>';
    tr.querySelector('.x-btn').addEventListener('click', function () { tr.remove(); recalc(); });
    return tr;
  }

  function addCustRow(tr, seed) {
    var id = tr.dataset.id;
    var rows = custRowsOf(id);
    var after = rows.length ? rows[rows.length - 1] : tr;
    after.parentNode.insertBefore(makeCustRow(id, seed), after.nextSibling);
  }

  function makeRow(seed) {
    var d = seed || {};
    var tr = document.createElement('tr');
    tr.className = 'line';
    tr.dataset.id = 'L' + (++rowSeq);
    var cells = [];

    cells.push('<td><select class="w-l" data-k="model">' + modelOptions(d.model) + '</select></td>');

    NUMCOLS.forEach(function (c) {
      cells.push('<td><input type="number" class="' + c[1] + '" data-k="' + c[0] +
        '" step="any" min="0" value="' + (d[c[0]] !== undefined ? d[c[0]] : c[2]) + '"></td>');
    });
    cells.push('<td class="cell-out" data-out="netValue">—</td>');

    cells.push('<td><input type="number" class="w-s" data-k="cStandard" step="any" min="0" value="' + (d.cStandard || 0) + '"></td>');
    cells.push('<td class="cell-out" data-out="custTotal">—</td>');
    cells.push('<td><input type="number" class="w-s" data-k="cPacking" step="any" min="0" value="' + (d.cPacking || 0) + '"></td>');
    cells.push('<td><input type="number" class="w-s" data-k="cFreight" step="any" min="0" value="' + (d.cFreight || 0) + '"></td>');

    cells.push('<td class="cell-out" data-out="unitCogs">—</td>');
    cells.push('<td class="cell-out" data-out="cogs">—</td>');
    cells.push('<td class="cell-out" data-out="gp">—</td>');
    cells.push('<td class="cell-out" data-out="gpPct">—</td>');
    cells.push('<td class="row-acts">' +
      '<button class="add-btn" title="Add a customisation" aria-label="Add customisation">+</button>' +
      '<button class="x-btn" title="Remove this line" aria-label="Remove line">×</button></td>');

    tr.innerHTML = cells.join('');
    tr.dataset.sku = d.sku || '';
    tr.querySelector('.x-btn').addEventListener('click', function () {
      custRowsOf(tr.dataset.id).forEach(function (c) { c.remove(); });
      tr.remove();
      if (!$('lineBody').querySelector('tr.line')) addLine();
      recalc();
    });
    tr.querySelector('.add-btn').addEventListener('click', function () { addCustRow(tr); recalc(); });

    // model master autofill — standard rate, packing and freight for that model
    var modelSel = tr.querySelector('[data-k=model]');
    modelSel.addEventListener('change', function () {
      var hit = MASTERS.products.find(function (p) { return p.name === modelSel.value; });
      if (!hit) { tr.dataset.sku = ''; return; }
      tr.dataset.sku = hit.sku;
      ['listPrice'].concat(COSTCOLS).forEach(function (k) {
        var el = tr.querySelector('[data-k=' + k + ']');
        if (el && hit[k] !== undefined) el.value = hit[k];
      });
      recalc();
    });
    (d.customs || []).forEach(function (c) { addCustRowLater(tr, c); });
    return tr;
  }

  // customisation rows can only be inserted once the line row is in the table
  var pending = [];
  function addCustRowLater(tr, c) { pending.push([tr, c]); }
  function flushCustRows() {
    pending.forEach(function (x) { addCustRow(x[0], x[1]); });
    pending = [];
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }

  function addLine(seed) { $('lineBody').appendChild(makeRow(seed)); flushCustRows(); }

  /* ---------- read the whole form into an order object ------------------- */
  function v(id) { var el = $(id); return el ? el.value : ''; }
  function nv(id) { return parseFloat(v(id)) || 0; }

  function readOrder() {
    var gst = nv('gstPct');
    var lines = [].filter.call($('lineBody').children, function (tr) {
      return tr.classList.contains('line');
    }).map(function (tr) {
      var o = { gstPct: gst, sku: tr.dataset.sku || '' };
      [].forEach.call(tr.querySelectorAll('[data-k]'), function (el) {
        o[el.dataset.k] = el.type === 'number' ? (parseFloat(el.value) || 0) : el.value;
      });
      o.customs = custRowsOf(tr.dataset.id).map(function (cr) {
        return {
          desc: cr.querySelector('[data-k=desc]').value,
          rate: parseFloat(cr.querySelector('[data-k=rate]').value) || 0
        };
      });
      o.cCustom = o.customs.reduce(function (a, c) { return a + c.rate; }, 0);
      o.description = o.model;
      return o;
    });
    return {
      meta: {
        orderId: v('orderId'), orderDate: v('orderDate'), deliveryDate: v('deliveryDate'),
        status: v('orderStatus'), salesperson: v('salesperson'), channel: v('channel')
      },
      customer: {
        name: v('custName'), type: v('custType'), gstin: v('custGstin'), state: v('custState')
      },
      lines: lines,
      // levels 2 and 3 were removed from the sheet — nothing feeds them any more
      recovery: {}, l2: {}, l3: {},
      l4: {},
      tax: {},
      targetGpPct: nv('targetGpPct'),
      approvalMatrix: MASTERS.approvalMatrix
    };
  }

  /* ---------- write an order object back into the form ------------------- */
  function writeOrder(o) {
    var set = function (id, val) { var el = $(id); if (el && val !== undefined && val !== null) el.value = val; };
    var m = o.meta || {}, c = o.customer || {};
    set('orderId', m.orderId); set('orderDate', m.orderDate); set('deliveryDate', m.deliveryDate);
    set('orderStatus', m.status); set('salesperson', m.salesperson); set('channel', m.channel);
    set('custName', c.name); set('custType', c.type); set('custGstin', c.gstin); set('custState', c.state);
    set('gstPct', (o.lines && o.lines[0] && o.lines[0].gstPct) || 18);
    ['recovery', 'l2', 'l3', 'l4', 'tax'].forEach(function (grp) {
      Object.keys(o[grp] || {}).forEach(function (k) { set(k, o[grp][k]); });
    });
    set('targetGpPct', o.targetGpPct);
    $('lineBody').innerHTML = '';
    (o.lines && o.lines.length ? o.lines : [{}]).forEach(addLine);
    recalc();
  }

  /* ---------- render ----------------------------------------------------- */
  function recalc() {
    var order = readOrder();
    var R = E.compute(order);
    var T = R.totals;

    /* line outputs */
    [].filter.call($('lineBody').children, function (tr) {
      return tr.classList.contains('line');
    }).forEach(function (tr, i) {
      var r = R.lines[i]; if (!r) return;
      var put = function (k, txt) { var c = tr.querySelector('[data-out=' + k + ']'); if (c) c.textContent = txt; };
      put('netValue', money(r.netRevenue));
      put('custTotal', r.unitCustom ? money(r.unitCustom) : '—');
      put('unitCogs', money(r.unitCogs));
      put('cogs', money(r.cogs));
      put('gp', money(r.gp));
      put('gpPct', r.qty ? pc(r.gpPct) : '—');
      var gpc = tr.querySelector('[data-out=gpPct]'), gc = tr.querySelector('[data-out=gp]');
      var cls = r.gp < 0 ? 'neg' : (r.gpPct >= 20 ? 'pos' : '');
      gpc.className = 'cell-out ' + cls; gc.className = 'cell-out ' + cls;
      tr.classList.toggle('under', r.belowCost);
    });

    /* footers */
    $('ftQty').textContent = inr.format(T.qty);
    $('ftCust').textContent = money(T.customisation);
    $('ftGross').textContent = money(T.grossValue);
    $('ftDisc').textContent = money(T.totalDiscount) + ' (' + pc(T.discountPct) + ')';

    /* level summaries */
    $('sumL1').textContent = money(T.grossProfit) + '  ' + pc(T.grossProfitPct);
    $('sumL2').textContent = money(T.invoiceValue);

    /* inline hints */
    $('outNoGst').value = money2(T.nsv);
    $('outGst').value = money2(T.gstTotal);
    $('outInvoice').value = money2(T.invoiceValue);
    $('outBreakeven').value = money(R.solver.breakEvenNSV);

    /* hero */
    var tone = T.actualGPPct >= 18 ? 'good' : (T.actualGPPct >= 8 ? 'watch' : 'risk');
    var fig = $('gpPct');
    fig.textContent = (T.nsv ? pc(T.actualGPPct) : '—');
    fig.className = 'gp-figure ' + (T.nsv ? tone : '');
    $('gpAbs').textContent = money(T.actualGP);
    $('gpSub').textContent = T.nsv
      ? 'on ' + compact(T.nsv) + ' without GST · ' + money(T.gpPerUnit) + ' per unit'
      : 'on nil sales value';

    /* waterfall */
    var segs = [
      ['#8C7A5E', T.cogs], ['#5FCB92', Math.max(0, T.actualGP)]
    ];
    var span = segs.reduce(function (s, x) { return s + x[1]; }, 0) || 1;
    $('fall').innerHTML = segs.map(function (s) {
      return '<i style="background:' + s[0] + ';width:' + (s[1] / span * 100).toFixed(2) + '%"></i>';
    }).join('');

    /* verdict */
    var vd = R.verdict;
    $('verdict').className = 'verdict ' + (T.nsv ? vd.tone : '');
    $('verdict').innerHTML = T.nsv
      ? '<b>' + esc(vd.level) + '</b><span>' + esc(vd.who) + '</span>'
      : '<b>Awaiting input</b><span>Add a product line to see the approval level.</span>';

    /* ladder */
    $('ladder').innerHTML = ladderHTML(R);

    /* solver */
    var s = R.solver;
    $('solverNote').innerHTML = T.nsv
      ? (s.priceGapPct <= 0.05
        ? 'Already at or above the ' + pc(s.targetPct) + ' target. You have <b>' + money(T.nsv - s.requiredNSV) +
          '</b> of headroom before the target is breached — about <b>' + pc(Math.abs(s.priceGapPct)) + '</b> of price.'
        : 'To reach ' + pc(s.targetPct) + ' you need <b>' + compact(s.requiredNSV) + '</b> of sales value — raise prices by <b>' +
          pc(s.priceGapPct) + '</b>, or hold list price and cap the discount at <b>' +
          (s.maxDiscountForTarget >= 0 ? pc(s.maxDiscountForTarget) : 'nothing — list price alone will not get there') + '</b>.')
      : 'Set a target to see the price you need.';

    /* action bar */
    $('barGp').textContent = T.nsv ? money(T.actualGP) + ' (' + pc(T.actualGPPct) + ')' : '—';
    $('barNsv').textContent = T.nsv ? compact(T.nsv) : '—';
    $('barVerdict').textContent = T.nsv ? vd.level : '—';
    $('barVerdict').className = T.nsv ? (vd.tone === 'risk' ? 'neg' : (vd.tone === 'good' ? 'pos' : '')) : '';

    LAST = { order: order, result: R };
  }

  function ladderHTML(R) {
    var T = R.totals, out = [];
    var row = function (label, val, cls, pct) {
      out.push('<div class="rung ' + (cls || '') + '"><span>' + esc(label) + '</span><span class="v">' +
        money(val) + (pct !== undefined ? '<span class="pc">' + pc(pct) + '</span>' : '') + '</span></div>');
    };
    row('Gross order value', T.grossValue, 'step');
    if (T.totalDiscount) row('Less discount', -T.totalDiscount, 'minor', T.discountPct);
    if (T.recovery) row('Add freight, installation & other billed', T.recovery, 'minor');
    row('Rate without GST', T.nsv, 'step', 100);
    row('Less BOM cost', -T.cogs, 'minor', T.cogsPct);
    row('Gross profit', T.grossProfit, 'total', T.grossProfitPct);
    row('GST on the order', T.gstTotal, 'minor');
    row('Rate with GST', T.invoiceValue, 'step');
    return out.join('');
  }

  /* ---------- toast ------------------------------------------------------ */
  var toastTimer;
  function toast(msg, isErr) {
    var t = $('toast'); t.textContent = msg;
    t.className = 'toast show' + (isErr ? ' err' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = 'toast' + (isErr ? ' err' : ''); }, 4200);
  }

  /* ---------- persistence ------------------------------------------------ */
  var LAST = null;

  function bundle() {
    var order = LAST.order, R = LAST.result, T = R.totals;
    return {
      order: {
        orderId: order.meta.orderId, orderDate: order.meta.orderDate,
        deliveryDate: order.meta.deliveryDate, status: order.meta.status,
        salesperson: order.meta.salesperson, channel: order.meta.channel,
        customerName: order.customer.name, customerType: order.customer.type,
        customerGstin: order.customer.gstin, customerState: order.customer.state,
        totalQty: T.qty, totalCbm: T.cbm, totalWeight: T.weight,
        grossValue: T.grossValue, totalDiscount: T.totalDiscount, discountPct: T.discountPct,
        recoveryBilled: T.recovery, netSalesValue: T.nsv,
        productionCost: T.cogs, grossProfit: T.grossProfit, grossProfitPct: T.grossProfitPct,
        directCost: T.totL2, contribution: T.contribution, contributionPct: T.contributionPct,
        commercialCost: T.totL3, netContribution: T.netContribution, netContributionPct: T.netContributionPct,
        overheadCost: T.totL4, actualGP: T.actualGP, actualGPPct: T.actualGPPct,
        gpPerUnit: T.gpPerUnit, totalCost: T.totalCost,
        gstAmount: T.gstTotal, invoiceValue: T.invoiceValue,
        gstTds: T.gstTds, incomeTds: T.incomeTds, netCollection: T.netCollection,
        breakEvenValue: R.solver.breakEvenNSV, targetGpPct: R.solver.targetPct,
        requiredValueForTarget: R.solver.requiredNSV, priceGapPct: R.solver.priceGapPct,
        approvalLevel: R.verdict.level, approvedBy: R.verdict.who,
        creditDays: order.l3.creditDays, interestPct: order.l3.interestPct
      },
      lines: order.lines.map(function (l, i) {
        var r = R.lines[i];
        return {
          orderId: order.meta.orderId, lineNo: i + 1, sku: l.sku, description: l.description,
          qty: l.qty, listPrice: l.listPrice, discPct: l.discPct,
          netValue: r.netRevenue, unitNetPrice: r.unitNetPrice,
          model: l.model, cStandard: l.cStandard, cCustom: l.cCustom,
          customisationDetail: (l.customs || []).map(function (c) { return c.desc + ' ' + c.rate; }).join('; '),
          cPacking: l.cPacking, cFreight: l.cFreight,
          unitCost: r.unitCogs, totalCost: r.cogs, lineGP: r.gp, lineGPPct: r.gpPct,
          gstPct: l.gstPct, gstAmount: r.gstAmt
        };
      }),
      costs: [].concat(
        R.heads.l2.map(function (h) { return { orderId: order.meta.orderId, level: 2, head: h.label, amount: h.amount, scalesWithRevenue: h.ofRevenue }; }),
        R.heads.l3.map(function (h) { return { orderId: order.meta.orderId, level: 3, head: h.label, amount: h.amount, scalesWithRevenue: h.ofRevenue }; }),
        R.heads.l4.map(function (h) { return { orderId: order.meta.orderId, level: 4, head: h.label, amount: h.amount, scalesWithRevenue: h.ofRevenue }; })
      ),
      inputs: LAST.order
    };
  }

  function save() {
    if (!LAST) return;
    if (!LAST.result.valid) {
      var first = (LAST.result.issues.find(function (x) { return x.sev === 'error'; }) || {}).msg;
      toast(first || 'Fix the errors before saving.', true); return;
    }
    if (!$('orderId').value.trim()) { toast('Give the order an ID first.', true); return; }
    var b = bundle();
    API.cacheLocal(b);
    if (!API.endpoint) { toast('Saved on this device. Connect Google Sheets to store it centrally.'); return; }
    $('btnSave').disabled = true; $('btnSave').textContent = 'Saving…';
    API.saveOrder(b)
      .then(function (d) {
        setConn(true);
        toast('Saved ' + (d && d.orderId ? d.orderId : b.order.orderId) + ' to Google Sheets.');
      })
      .catch(function (e) { setConn(false); toast(e.message + ' Kept a local copy.', true); })
      .finally(function () { $('btnSave').disabled = false; $('btnSave').textContent = 'Save to Google Sheets'; });
  }

  function setConn(on) {
    $('connDot').className = 'dot ' + (on ? 'on' : (API.endpoint ? 'off' : ''));
    $('connText').textContent = on ? 'Google Sheets' : (API.endpoint ? 'Sheets unreachable' : 'Local only');
  }

  /* ---------- boot ------------------------------------------------------- */
  function applyMasters(m) {
    if (m.settings) Object.assign(MASTERS.settings, m.settings);
    if (m.products && m.products.length) MASTERS.products = m.products;
    if (m.customers) MASTERS.customers = m.customers;
    if (m.approvalMatrix && m.approvalMatrix.length) MASTERS.approvalMatrix = m.approvalMatrix;

    [].forEach.call(document.querySelectorAll('[data-k=model]'), function (sel) {
      sel.innerHTML = modelOptions(sel.value);
    });
    $('dlCustomers').innerHTML = MASTERS.customers.map(function (c) {
      return '<option value="' + esc(c.name) + '">' + esc(c.type || '') + '</option>';
    }).join('');
    if (MASTERS.settings.companyName) $('brandCo').textContent = MASTERS.settings.companyName;
    var s = MASTERS.settings;
    if (s.targetGpPct) $('targetGpPct').value = s.targetGpPct;
  }

  function newOrder() {
    var d = new Date().toISOString().slice(0, 10);
    $('orderDate').value = d;
    $('orderId').value = 'ORD-' + Date.now().toString().slice(-6);
    $('lineBody').innerHTML = ''; addLine();
    if (API.endpoint) {
      API.nextOrderId().then(function (r) { if (r && r.orderId) $('orderId').value = r.orderId; }).catch(function () {});
    }
    recalc();
  }

  function loadOrder() {
    var id = prompt('Order ID to load');
    if (!id) return;
    var local = API.readLocal()[id.trim()];
    var done = function (b) {
      if (!b) { toast('No order found with that ID.', true); return; }
      writeOrder(b.inputs || b.order);
      toast('Loaded ' + id.trim() + '.');
    };
    if (API.endpoint) {
      API.getOrder(id.trim()).then(function (b) { setConn(true); done(b || local); })
        .catch(function () { setConn(false); done(local); });
    } else done(local);
  }

  function connectDialog() {
    var url = prompt('Apps Script web app URL (ends with /exec)', API.endpoint || '');
    if (url === null) return;
    var tok = prompt('Shared token (must match SHARED_TOKEN in Code.gs)', API.token || '');
    API.configure(url, tok || '');
    if (!API.endpoint) { setConn(false); toast('Disconnected. Working locally.'); return; }
    API.bootstrap().then(function (m) {
      applyMasters(m || {}); setConn(true);
      toast('Connected. Loaded ' + (m.products || []).length + ' products and ' + (m.customers || []).length + ' customers.');
    }).catch(function (e) { setConn(false); toast(e.message, true); });
  }

  function exportJSON() {
    if (!LAST) return;
    var b = bundle();
    var blob = new Blob([JSON.stringify(b, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (b.order.orderId || 'order') + '.json';
    a.click(); URL.revokeObjectURL(a.href);
    toast('Downloaded ' + a.download);
  }

  /* ---------- events ----------------------------------------------------- */
  function init() {
    applyMasters({});
    newOrder();

    var within = function (e, sel) {
      var t = e.target;
      return t && typeof t.closest === 'function' && t.closest(sel);
    };
    document.addEventListener('input', function (e) {
      if (within(e, '.shell, .masthead')) recalc();
    });
    document.addEventListener('change', function (e) {
      if (within(e, '.shell')) recalc();
    });

    $('btnAddLine').addEventListener('click', function () { addLine(); recalc(); });
    $('btnClearLines').addEventListener('click', function () {
      $('lineBody').innerHTML = ''; addLine(); recalc();
    });
    $('btnDuplicate').addEventListener('click', function () {
      var rows = $('lineBody').querySelectorAll('tr.line');
      if (!rows.length) return addLine();
      var last = rows[rows.length - 1], seed = { sku: last.dataset.sku };
      [].forEach.call(last.querySelectorAll('[data-k]'), function (el) {
        seed[el.dataset.k] = el.type === 'number' ? (parseFloat(el.value) || 0) : el.value;
      });
      seed.customs = custRowsOf(last.dataset.id).map(function (cr) {
        return { desc: cr.querySelector('[data-k=desc]').value, rate: parseFloat(cr.querySelector('[data-k=rate]').value) || 0 };
      });
      addLine(seed); recalc();
    });
    $('btnSave').addEventListener('click', save);
    $('btnNew').addEventListener('click', newOrder);
    $('btnLoad').addEventListener('click', loadOrder);
    $('btnExport').addEventListener('click', exportJSON);
    $('btnPrint').addEventListener('click', function () { window.print(); });
    $('btnConnect').addEventListener('click', connectDialog);

    document.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); save(); }
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); addLine(); recalc(); }
    });

    setConn(false);
    if (API.endpoint) {
      API.bootstrap().then(function (m) { applyMasters(m || {}); setConn(true); })
        .catch(function () { setConn(false); });
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
