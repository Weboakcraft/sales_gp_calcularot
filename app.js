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
      defaultGstPct: 18, defaultWastagePct: 4, defaultInwardPct: 2
    },
    products: [
      { sku: 'CH-EXE-01', name: 'Executive high-back chair', category: 'Office chair', uom: 'Nos', listPrice: 12000, cMaterial: 3200, cHardware: 900, cUpholstery: 1100, cFinishing: 300, cLabour: 800, cPacking: 250, cOther: 0, wastagePct: 4, inwardFreightPct: 2, cbmPerUnit: 0.35, weightPerUnit: 18, gstPct: 18 },
      { sku: 'CH-TSK-02', name: 'Task chair with mesh back', category: 'Office chair', uom: 'Nos', listPrice: 6500, cMaterial: 1700, cHardware: 620, cUpholstery: 480, cFinishing: 180, cLabour: 450, cPacking: 160, cOther: 0, wastagePct: 4, inwardFreightPct: 2, cbmPerUnit: 0.22, weightPerUnit: 11, gstPct: 18 },
      { sku: 'CH-VIS-03', name: 'Visitor chair, cantilever', category: 'Office chair', uom: 'Nos', listPrice: 4200, cMaterial: 1150, cHardware: 300, cUpholstery: 380, cFinishing: 140, cLabour: 300, cPacking: 110, cOther: 0, wastagePct: 4, inwardFreightPct: 2, cbmPerUnit: 0.18, weightPerUnit: 8, gstPct: 18 },
      { sku: 'SF-3ST-01', name: 'Three-seater office sofa', category: 'Sofa', uom: 'Nos', listPrice: 38000, cMaterial: 9800, cHardware: 1200, cUpholstery: 6400, cFinishing: 900, cLabour: 3200, cPacking: 800, cOther: 0, wastagePct: 6, inwardFreightPct: 2, cbmPerUnit: 1.6, weightPerUnit: 62, gstPct: 18 },
      { sku: 'SF-RCL-02', name: 'Single-seat recliner', category: 'Recliner', uom: 'Nos', listPrice: 29000, cMaterial: 7400, cHardware: 3800, cUpholstery: 4200, cFinishing: 600, cLabour: 2600, cPacking: 650, cOther: 0, wastagePct: 5, inwardFreightPct: 2, cbmPerUnit: 0.95, weightPerUnit: 45, gstPct: 18 },
      { sku: 'WS-4ST-01', name: 'Four-seater linear workstation', category: 'Workstation', uom: 'Set', listPrice: 48000, cMaterial: 18000, cHardware: 2500, cUpholstery: 0, cFinishing: 1500, cLabour: 3000, cPacking: 900, cOther: 200, wastagePct: 5, inwardFreightPct: 2, cbmPerUnit: 1.8, weightPerUnit: 120, gstPct: 18 },
      { sku: 'WS-6ST-02', name: 'Six-seater cluster workstation', category: 'Workstation', uom: 'Set', listPrice: 68000, cMaterial: 25500, cHardware: 3600, cUpholstery: 0, cFinishing: 2100, cLabour: 4200, cPacking: 1200, cOther: 300, wastagePct: 5, inwardFreightPct: 2, cbmPerUnit: 2.6, weightPerUnit: 172, gstPct: 18 },
      { sku: 'TB-CNF-01', name: 'Eight-seat conference table', category: 'Table', uom: 'Nos', listPrice: 54000, cMaterial: 21000, cHardware: 2200, cUpholstery: 0, cFinishing: 2400, cLabour: 3400, cPacking: 1100, cOther: 0, wastagePct: 5, inwardFreightPct: 2, cbmPerUnit: 2.2, weightPerUnit: 140, gstPct: 18 },
      { sku: 'TB-EXE-02', name: 'Executive desk with side unit', category: 'Table', uom: 'Nos', listPrice: 32000, cMaterial: 12400, cHardware: 1800, cUpholstery: 0, cFinishing: 1400, cLabour: 2100, cPacking: 700, cOther: 0, wastagePct: 5, inwardFreightPct: 2, cbmPerUnit: 1.3, weightPerUnit: 82, gstPct: 18 },
      { sku: 'ST-PED-01', name: 'Three-drawer mobile pedestal', category: 'Storage', uom: 'Nos', listPrice: 8500, cMaterial: 3100, cHardware: 900, cUpholstery: 0, cFinishing: 420, cLabour: 600, cPacking: 240, cOther: 0, wastagePct: 4, inwardFreightPct: 2, cbmPerUnit: 0.28, weightPerUnit: 24, gstPct: 18 }
    ],
    customers: [],
    approvalMatrix: E.defaultApprovalMatrix
  };

  var CATEGORIES = ['Office chair', 'Sofa', 'Recliner', 'Workstation', 'Table', 'Storage', 'Partition', 'Accessory', 'Other'];

  /* ---------- line rows -------------------------------------------------- */
  var NUMCOLS = [
    ['qty', 'w-xs', 1], ['listPrice', 'w-m', 0], ['discPct', 'w-xs', 0]
  ];
  var COSTCOLS = ['cMaterial', 'cHardware', 'cUpholstery', 'cFinishing', 'cLabour', 'cPacking', 'cOther'];
  var LOGCOLS = ['wastagePct', 'inwardFreightPct', 'cbmPerUnit', 'weightPerUnit'];

  function makeRow(seed) {
    var d = seed || {};
    var tr = document.createElement('tr');
    var cells = [];

    cells.push('<td><input class="w-l" data-k="description" list="dlProducts" value="' +
      esc(d.description || '') + '" placeholder="Type or pick a product"></td>');
    cells.push('<td><select class="w-m" data-k="category">' +
      CATEGORIES.map(function (c) { return '<option' + (c === (d.category || 'Office chair') ? ' selected' : '') + '>' + c + '</option>'; }).join('') +
      '</select></td>');

    NUMCOLS.forEach(function (c) {
      cells.push('<td><input type="number" class="' + c[1] + '" data-k="' + c[0] +
        '" step="any" min="0" value="' + (d[c[0]] !== undefined ? d[c[0]] : c[2]) + '"></td>');
    });
    cells.push('<td class="cell-out" data-out="netValue">—</td>');

    COSTCOLS.forEach(function (k) {
      cells.push('<td><input type="number" class="w-s" data-k="' + k + '" step="any" min="0" value="' + (d[k] || 0) + '"></td>');
    });
    LOGCOLS.forEach(function (k) {
      cells.push('<td><input type="number" class="w-xs" data-k="' + k + '" step="any" min="0" value="' + (d[k] || 0) + '"></td>');
    });

    cells.push('<td class="cell-out" data-out="unitCogs">—</td>');
    cells.push('<td class="cell-out" data-out="cogs">—</td>');
    cells.push('<td class="cell-out" data-out="gp">—</td>');
    cells.push('<td class="cell-out" data-out="gpPct">—</td>');
    cells.push('<td><button class="x-btn" title="Remove this line" aria-label="Remove line">×</button></td>');

    tr.innerHTML = cells.join('');
    tr.dataset.gst = d.gstPct || MASTERS.settings.defaultGstPct;
    tr.dataset.sku = d.sku || '';
    tr.querySelector('.x-btn').addEventListener('click', function () {
      tr.remove(); if (!$('lineBody').children.length) addLine(); recalc();
    });
    // product master autofill
    var nameInput = tr.querySelector('[data-k=description]');
    nameInput.addEventListener('change', function () {
      var hit = MASTERS.products.find(function (p) {
        return p.name === nameInput.value || p.sku === nameInput.value ||
          (p.sku + ' — ' + p.name) === nameInput.value;
      });
      if (!hit) return;
      nameInput.value = hit.name;
      tr.dataset.sku = hit.sku; tr.dataset.gst = hit.gstPct;
      tr.querySelector('[data-k=category]').value = hit.category;
      ['listPrice'].concat(COSTCOLS, LOGCOLS).forEach(function (k) {
        var el = tr.querySelector('[data-k=' + k + ']');
        if (el && hit[k] !== undefined) el.value = hit[k];
      });
      recalc();
    });
    return tr;
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }

  function addLine(seed) { $('lineBody').appendChild(makeRow(seed)); }

  /* ---------- read the whole form into an order object ------------------- */
  function v(id) { var el = $(id); return el ? el.value : ''; }
  function nv(id) { return parseFloat(v(id)) || 0; }

  function readOrder() {
    var lines = [].map.call($('lineBody').children, function (tr) {
      var o = { gstPct: +tr.dataset.gst || 18, sku: tr.dataset.sku || '' };
      [].forEach.call(tr.querySelectorAll('[data-k]'), function (el) {
        o[el.dataset.k] = el.type === 'number' ? (parseFloat(el.value) || 0) : el.value;
      });
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
      recovery: {
        freightBilled: nv('freightBilled'), installBilled: nv('installBilled'),
        packingBilled: nv('packingBilled'), otherBilled: nv('otherBilled')
      },
      l2: {
        freightMode: v('freightMode'), freightRate: nv('freightRate'), handling: nv('handling'),
        insurancePct: nv('insurancePct'), installMode: v('installMode'), installRate: nv('installRate'),
        travel: nv('travel'), sampleCost: nv('sampleCost'), inspection: nv('inspection'),
        specialPacking: nv('specialPacking'), otherDirect: nv('otherDirect')
      },
      l3: {
        commissionPct: nv('commissionPct'), dealerIncentivePct: nv('dealerIncentivePct'),
        cashDiscountPct: nv('cashDiscountPct'), interestPct: nv('interestPct'), creditDays: nv('creditDays'),
        emdAmount: nv('emdAmount'), emdDays: nv('emdDays'), pbgPct: nv('pbgPct'),
        pbgChargePct: nv('pbgChargePct'), pbgMonths: nv('pbgMonths'), tenderFees: nv('tenderFees'),
        gemChargePct: nv('gemChargePct'), ldProvisionPct: nv('ldProvisionPct'),
        warrantyPct: nv('warrantyPct'), badDebtPct: nv('badDebtPct'),
        bankChargePct: nv('bankChargePct'), itcLeakage: nv('itcLeakage')
      },
      l4: {
        factoryOhPct: nv('factoryOhPct'), adminOhPct: nv('adminOhPct'),
        sellingOhPct: nv('sellingOhPct'), depreciation: nv('depreciation')
      },
      tax: { gstTdsPct: nv('gstTdsPct'), tcsPct: nv('tcsPct') },
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
    [].forEach.call($('lineBody').children, function (tr, i) {
      var r = R.lines[i]; if (!r) return;
      var put = function (k, txt) { var c = tr.querySelector('[data-out=' + k + ']'); if (c) c.textContent = txt; };
      put('netValue', money(r.netRevenue));
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
    $('ftCbm').textContent = T.cbm.toFixed(2);
    $('ftKg').textContent = inr.format(Math.round(T.weight));
    $('ftGross').textContent = money(T.grossValue);
    $('ftDisc').textContent = money(T.totalDiscount) + ' (' + pc(T.discountPct) + ')';

    /* level summaries */
    $('sumL1').textContent = money(T.grossProfit) + '  ' + pc(T.grossProfitPct);
    $('sumL2').textContent = money(T.contribution) + '  ' + pc(T.contributionPct);
    $('sumL3').textContent = money(T.netContribution) + '  ' + pc(T.netContributionPct);
    $('sumL4').textContent = money(T.actualGP) + '  ' + pc(T.actualGPPct);
    $('sumL5').textContent = money(T.netCollection);

    /* inline hints */
    $('freightCalc').textContent = 'Works out to ' + money(headAmt(R, 'l2', 'Outward freight'));
    $('installCalc').textContent = 'Works out to ' + money(headAmt(R, 'l2', 'Installation'));
    $('creditCalc').textContent = 'Blocks ' + money(T.creditCost) + ' of interest';
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
      ? 'on ' + compact(T.nsv) + ' sales value · ' + money(T.gpPerUnit) + ' per unit'
      : 'on nil sales value';

    /* waterfall */
    var segs = [
      ['#8C7A5E', T.cogs], ['#6E7F8C', Math.max(0, T.totL2)],
      ['#8C6E7F', Math.max(0, T.totL3)], ['#7A7A6E', Math.max(0, T.totL4)],
      ['#5FCB92', Math.max(0, T.actualGP)]
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

    /* checks */
    $('checkList').innerHTML = R.issues.length
      ? R.issues.map(function (x) {
          return '<div class="check ' + x.sev + '"><i></i><span>' + esc(x.msg) + '</span></div>';
        }).join('')
      : '<div class="check ok"><i style="background:var(--good)"></i><span>Everything checks out. Nothing is priced below cost and no threshold is breached.</span></div>';

    /* cash note */
    $('cashNote').innerHTML = T.nsv
      ? 'You invoice <b>' + money(T.invoiceValue) + '</b>. After <b>' + money(T.gstTds) +
        '</b> GST TDS and <b>' + money(T.incomeTds) + '</b> income-tax deduction, <b>' + money(T.netCollection) +
        '</b> reaches the bank — and a performance guarantee of <b>' + money(T.pbgValue) +
        '</b> stays blocked. Deductions are recoverable, so they never touch gross profit.'
      : 'Enter an order to see the realisation summary.';

    /* action bar */
    $('barGp').textContent = T.nsv ? money(T.actualGP) + ' (' + pc(T.actualGPPct) + ')' : '—';
    $('barNsv').textContent = T.nsv ? compact(T.nsv) : '—';
    $('barVerdict').textContent = T.nsv ? vd.level : '—';
    $('barVerdict').className = T.nsv ? (vd.tone === 'risk' ? 'neg' : (vd.tone === 'good' ? 'pos' : '')) : '';

    runWhatIf(order, T);
    LAST = { order: order, result: R };
  }

  function headAmt(R, level, prefix) {
    var h = R.heads[level].find(function (x) { return x.label.indexOf(prefix) === 0; });
    return h ? h.amount : 0;
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
    row('Net sales value, excluding GST', T.nsv, 'step', 100);
    row('Less production cost', -T.cogs, 'minor', T.cogsPct);
    row('Gross profit', T.grossProfit, 'step', T.grossProfitPct);
    R.heads.l2.forEach(function (h) { row(h.label, -h.amount, 'minor'); });
    row('Contribution', T.contribution, 'step', T.contributionPct);
    R.heads.l3.forEach(function (h) { row(h.label, -h.amount, 'minor'); });
    row('Net contribution', T.netContribution, 'step', T.netContributionPct);
    R.heads.l4.forEach(function (h) { row(h.label, -h.amount, 'minor'); });
    row('Actual gross profit', T.actualGP, 'total', T.actualGPPct);
    return out.join('');
  }

  /* ---------- what-if ---------------------------------------------------- */
  function runWhatIf(order, T) {
    var sh = {
      discountPts: +$('wDisc').value, materialPct: +$('wMat').value,
      labourPct: +$('wLab').value, freightPct: +$('wFrt').value
    };
    $('wDiscO').textContent = sh.discountPts.toFixed(1) + ' pts';
    $('wMatO').textContent = sh.materialPct + '%';
    $('wLabO').textContent = sh.labourPct + '%';
    $('wFrtO').textContent = sh.freightPct + '%';

    var any = sh.discountPts || sh.materialPct || sh.labourPct || sh.freightPct;
    if (!any || !T.nsv) {
      $('wGpPct').textContent = '—'; $('wGpAbs').textContent = '—';
      $('wDelta').textContent = '—'; $('wDelta').className = '';
      return;
    }
    var S = E.sensitivity(order, sh).totals;
    var d = S.actualGP - T.actualGP;
    $('wGpPct').textContent = pc(S.actualGPPct);
    $('wGpPct').className = S.actualGPPct < 0 ? 'neg' : (S.actualGPPct >= 18 ? 'pos' : '');
    $('wGpAbs').textContent = compact(S.actualGP);
    $('wDelta').textContent = (d >= 0 ? '+' : '') + compact(d);
    $('wDelta').className = d < 0 ? 'neg' : 'pos';
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
          category: l.category, qty: l.qty, listPrice: l.listPrice, discPct: l.discPct,
          netValue: r.netRevenue, unitNetPrice: r.unitNetPrice,
          cMaterial: l.cMaterial, cHardware: l.cHardware, cUpholstery: l.cUpholstery,
          cFinishing: l.cFinishing, cLabour: l.cLabour, cPacking: l.cPacking, cOther: l.cOther,
          wastagePct: l.wastagePct, inwardFreightPct: l.inwardFreightPct,
          cbmPerUnit: l.cbmPerUnit, weightPerUnit: l.weightPerUnit,
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
      toast('Fix the errors in Checks before saving.', true); return;
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

    $('dlProducts').innerHTML = MASTERS.products.map(function (p) {
      return '<option value="' + esc(p.name) + '">' + esc(p.sku + ' · ' + p.category) + '</option>';
    }).join('');
    $('dlCustomers').innerHTML = MASTERS.customers.map(function (c) {
      return '<option value="' + esc(c.name) + '">' + esc(c.type || '') + '</option>';
    }).join('');
    if (MASTERS.settings.companyName) $('brandCo').textContent = MASTERS.settings.companyName;
    var s = MASTERS.settings;
    if (s.interestPct) $('interestPct').value = s.interestPct;
    if (s.pbgChargePct) $('pbgChargePct').value = s.pbgChargePct;
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
      var rows = $('lineBody').children;
      if (!rows.length) return addLine();
      var last = rows[rows.length - 1], seed = { gstPct: +last.dataset.gst, sku: last.dataset.sku };
      [].forEach.call(last.querySelectorAll('[data-k]'), function (el) {
        seed[el.dataset.k] = el.type === 'number' ? (parseFloat(el.value) || 0) : el.value;
      });
      addLine(seed); recalc();
    });
    $('btnResetWhatif').addEventListener('click', function () {
      ['wDisc', 'wMat', 'wLab', 'wFrt'].forEach(function (id) { $(id).value = 0; }); recalc();
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
