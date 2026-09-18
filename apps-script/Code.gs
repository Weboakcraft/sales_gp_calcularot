/****************************************************************************
 * Sales GP Calculator — Google Sheets backend
 * ---------------------------------------------------------------------------
 * 1. Open your Google Sheet  ->  Extensions  ->  Apps Script
 * 2. Paste this file over Code.gs and save
 * 3. Run  setupDatabase(). Safe to run again any time: it adds what is missing,
 *    rewrites the header row, deletes columns and sheets this version no longer
 *    uses, and leaves every row you have already typed alone.
 * 4. Change SHARED_TOKEN below to something only your team knows.
 * 5. Deploy -> New deployment -> Web app
 *      Execute as:  Me
 *      Who has access:  Anyone
 *    Copy the /exec URL into the calculator's "Connect Sheets" dialog.
 ****************************************************************************/

var SHARED_TOKEN = 'OAK-84E2X-8XMX7-9KYF7';   // must match token in assets/config.js
var ORDER_PREFIX = 'ORD';

/* ===========================================================================
   SCHEMA — single source of truth for both setup and save
   =========================================================================== */
var SCHEMA = {
  Settings: ['Key', 'Value', 'Notes'],

  M_Products: ['Model Code', 'Model Name', 'UOM', 'Sale Rate', 'Standard Armrest',
    'Standard Seat Mechanism', 'Standard Base', 'Standard Wheels', 'GST %', 'HSN Code',
    'Active'],

  M_Components: ['Component Type', 'Component Name', 'Rate', 'Active'],

  M_Customers: ['Customer Code', 'Customer Name', 'Customer Type', 'GSTIN', 'State',
    'City', 'Salesperson', 'Active'],

  M_ApprovalMatrix: ['Minimum GP %', 'Approval Level', 'Approver', 'Tone (good/watch/risk)'],

  T_Orders: ['Order ID', 'Order Date', 'Delivery Date', 'Status', 'Salesperson', 'Channel',
    'Customer Name', 'Customer Type', 'Customer GSTIN', 'Delivery State',
    'Total Qty', 'Gross Order Value', 'Total Discount', 'Discount %',
    'Rate without GST', 'BOM Cost', 'Gross Profit', 'Gross Profit %', 'GP per Unit',
    'GST Amount', 'Rate with GST',
    'Break-even Value', 'Target GP %', 'Value Needed for Target', 'Price Gap %',
    'Approval Level', 'Approver',
    'Saved At', 'Saved By', 'Input JSON'],

  T_OrderLines: ['Order ID', 'Line No', 'Model Code', 'Model', 'Qty',
    'Sale Rate', 'Discount %', 'Net Line Value', 'Unit Net Price',
    'Armrest', 'Armrest Rate', 'Seat Mechanism', 'Seat Mechanism Rate',
    'Base', 'Base Rate', 'Wheels', 'Wheels Rate',
    'Unit Cost', 'Total Line Cost', 'Line GP', 'Line GP %', 'GST %', 'GST Amount'],

  Sys_AuditLog: ['Timestamp', 'User', 'Action', 'Order ID', 'Gross Profit', 'Gross Profit %',
    'Approval Level', 'Detail']
};

/* Sheets earlier versions of this calculator created and this one no longer
   uses. setupDatabase() deletes these outright. */
var OBSOLETE_SHEETS = ['M_FreightRates', 'T_OrderCosts'];

/* order of keys written into T_Orders — index-matched to the header above */
var ORDER_KEYS = ['orderId', 'orderDate', 'deliveryDate', 'status', 'salesperson', 'channel',
  'customerName', 'customerType', 'customerGstin', 'customerState',
  'totalQty', 'grossValue', 'totalDiscount', 'discountPct',
  'netSalesValue', 'productionCost', 'grossProfit', 'grossProfitPct', 'gpPerUnit',
  'gstAmount', 'invoiceValue',
  'breakEvenValue', 'targetGpPct', 'requiredValueForTarget', 'priceGapPct',
  'approvalLevel', 'approvedBy'];

var LINE_KEYS = ['orderId', 'lineNo', 'sku', 'model', 'qty',
  'listPrice', 'discPct', 'netValue', 'unitNetPrice',
  'armrestName', 'cArmrest', 'seatMechName', 'cSeatMech',
  'baseName', 'cBase', 'wheelsName', 'cWheels',
  'unitCost', 'totalCost', 'lineGP', 'lineGPPct', 'gstPct', 'gstAmount'];

/* ===========================================================================
   ONE-TIME SETUP
   =========================================================================== */
function setupDatabase() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var removed = [], created = [], trimmed = [], widened = [], seeded = [], untouched = [];

  /* 1 — sheets this version no longer uses go away */
  OBSOLETE_SHEETS.forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (sh) { ss.deleteSheet(sh); removed.push(name); }
  });

  /* 2 — every sheet in SCHEMA: present, correct headers, no stray columns.
         Rows you have already typed are left exactly where they are. */
  Object.keys(SCHEMA).forEach(function (name) {
    var headers = SCHEMA[name];
    var sh = ss.getSheetByName(name);
    if (!sh) { sh = ss.insertSheet(name); created.push(name); }

    var have = sh.getMaxColumns();
    if (have > headers.length) {
      sh.deleteColumns(headers.length + 1, have - headers.length);
      trimmed.push(name + ' (−' + (have - headers.length) + ')');
    } else if (have < headers.length) {
      sh.insertColumnsAfter(have, headers.length - have);
      widened.push(name);
    }

    sh.getRange(1, 1, 1, headers.length).setValues([headers])
      .setFontWeight('bold').setFontFamily('Arial').setFontSize(10)
      .setBackground('#231F1A').setFontColor('#F2EDE4')
      .setVerticalAlignment('middle').setWrap(true);
    sh.setFrozenRows(1);
    sh.setRowHeight(1, 38);
  });

  /* 3 — seed only what is still empty, so your own rows are never overwritten */
  var seeders = {
    Settings: seedSettings, M_ApprovalMatrix: seedApprovalMatrix,
    M_Products: seedProducts, M_Components: seedComponents, M_Customers: seedCustomers
  };
  Object.keys(seeders).forEach(function (name) {
    if (ss.getSheetByName(name).getLastRow() < 2) { seeders[name](ss); seeded.push(name); }
    else untouched.push(name);
  });

  formatOrders(ss);

  /* 4 — anything else in this file is yours; say so rather than deleting it */
  var mine = Object.keys(SCHEMA);
  var strangers = ss.getSheets().map(function (sh) { return sh.getName(); })
    .filter(function (n) { return mine.indexOf(n) < 0; });

  ss.setActiveSheet(ss.getSheetByName('Settings'));

  var lines = ['Database is up to date. ' + mine.length + ' sheets in use.'];
  if (removed.length) lines.push('\nDeleted (no longer used): ' + removed.join(', '));
  if (created.length) lines.push('\nCreated: ' + created.join(', '));
  if (trimmed.length) lines.push('\nExtra columns removed from: ' + trimmed.join(', '));
  if (widened.length) lines.push('\nColumns added to: ' + widened.join(', '));
  if (seeded.length) lines.push('\nSample rows written to: ' + seeded.join(', '));
  if (untouched.length) lines.push('\nAlready had data, left alone: ' + untouched.join(', '));
  if (strangers.length) lines.push('\nNot part of the calculator, left alone: ' + strangers.join(', '));
  if (untouched.length) lines.push('\n\nA master that already had rows keeps them as they were. ' +
             'If those rows came from an older version, check they still sit under the right ' +
             'headers before quoting from them.');
  lines.push('\n\nOld orders saved under the previous column layout will not line up with the ' +
             'new headers. Run clearTransactions() if you want T_Orders, T_OrderLines and ' +
             'Sys_AuditLog emptied.');
  SpreadsheetApp.getUi().alert(lines.join(''));
}

/* Empties the three transaction sheets and leaves every master untouched.
   Run this only when you want the saved order history gone for good. */
function clearTransactions() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();
  var answer = ui.alert('Delete all saved orders?',
    'T_Orders, T_OrderLines and Sys_AuditLog will be emptied. Masters are not touched. ' +
    'This cannot be undone.', ui.ButtonSet.YES_NO);
  if (answer !== ui.Button.YES) return;

  ['T_Orders', 'T_OrderLines', 'Sys_AuditLog'].forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (sh && sh.getLastRow() > 1) sh.deleteRows(2, sh.getLastRow() - 1);
  });
  formatOrders(ss);
  ui.alert('Saved orders cleared.');
}

function seedSettings(ss) {
  var rows = [
    ['companyName', 'Your Company — order profitability', 'Shown beside the app title'],
    ['orderPrefix', ORDER_PREFIX, 'Prefix for auto-generated order IDs'],
    ['orderCounter', 1000, 'Last number issued. The app increments this.'],
    ['targetGpPct', 20, 'House target gross profit %'],
    ['defaultGstPct', 18, 'Default GST rate on furniture'],
    ['currency', 'INR', 'Reporting currency']
  ];
  var sh = ss.getSheetByName('Settings');
  sh.getRange(2, 1, rows.length, 3).setValues(rows);
  sh.getRange(2, 2, rows.length, 1).setFontColor('#0000FF');   // blue = editable input
  sh.setColumnWidth(1, 170); sh.setColumnWidth(2, 240); sh.setColumnWidth(3, 380);
  sh.getRange(2, 2, rows.length, 1).setBackground('#FFFF00');
}

function seedApprovalMatrix(ss) {
  var rows = [
    [25, 'Auto-approved', 'No sign-off needed', 'good'],
    [18, 'Level 1', 'Sales Manager', 'good'],
    [12, 'Level 2', 'General Manager', 'watch'],
    [6, 'Level 3', 'Director', 'watch'],
    [-999, 'Blocked', 'Proprietor approval only', 'risk']
  ];
  var sh = ss.getSheetByName('M_ApprovalMatrix');
  sh.getRange(2, 1, rows.length, 4).setValues(rows);
  sh.getRange(2, 1, rows.length, 4).setFontColor('#0000FF').setBackground('#FFFF00');
  sh.getRange(rows.length + 3, 1).setValue(
    'Rows must stay sorted from the highest GP % down. The app picks the first row whose Minimum GP % is met.');
}

function seedProducts(ss) {
  var rows = [
    ['HURRICANE', 'Hurricane', 'Nos', 0, '', '', '', '', 18, '9401', 'Yes'],
    ['MATRIX-HB', 'Matrix HB', 'Nos', 0, '', '', '', '', 18, '9401', 'Yes'],
    ['MATRIX-MB', 'Matrix MB', 'Nos', 0, '', '', '', '', 18, '9401', 'Yes'],
    ['01', '01', 'Nos', 0, '', '', '', '', 18, '9401', 'Yes'],
    ['15-NO', '15 No.', 'Nos', 0, '', '', '', '', 18, '9401', 'Yes'],
    ['BUTTERFLY', 'Butterfly', 'Nos', 0, '', '', '', '', 18, '9401', 'Yes'],
    ['ROBO', 'Robo', 'Nos', 0, '', '', '', '', 18, '9401', 'Yes'],
    ['PEARS', 'Pears', 'Nos', 0, '', '', '', '', 18, '9401', 'Yes'],
    ['07', '07', 'Nos', 0, '', '', '', '', 18, '9401', 'Yes'],
    ['BOOM', 'Boom', 'Nos', 0, '', '', '', '', 18, '9401', 'Yes']
  ];
  var sh = ss.getSheetByName('M_Products');
  sh.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  sh.getRange(2, 4, rows.length, 1).setNumberFormat('#,##0.00');
  sh.setColumnWidth(2, 230);
  sh.getRange(rows.length + 3, 1).setValue(
    'Edit these rows freely — the calculator loads them as its model master. The four standard columns take a component name from M_Components; leave one blank and that part starts empty on a new line.');
}

function seedComponents(ss) {
  var rows = [
    ['Armrest', 'Without armrest', 0, 'Yes'],
    ['Armrest', 'Fixed armrest', 0, 'Yes'],
    ['Armrest', 'Adjustable armrest (1D)', 0, 'Yes'],
    ['Armrest', 'Adjustable armrest (2D)', 0, 'Yes'],
    ['Armrest', 'PU armrest', 0, 'Yes'],
    ['Seat mechanism', 'Fixed', 0, 'Yes'],
    ['Seat mechanism', 'Butterfly tilt', 0, 'Yes'],
    ['Seat mechanism', 'Multilock', 0, 'Yes'],
    ['Seat mechanism', 'Synchro', 0, 'Yes'],
    ['Base', 'Nylon base', 0, 'Yes'],
    ['Base', 'Aluminium base', 0, 'Yes'],
    ['Base', 'MS base', 0, 'Yes'],
    ['Base', 'Fixed / cantilever', 0, 'Yes'],
    ['Wheels', 'Nylon castor', 0, 'Yes'],
    ['Wheels', 'PU castor', 0, 'Yes'],
    ['Wheels', 'Glides — no wheel', 0, 'Yes']
  ];
  var sh = ss.getSheetByName('M_Components');
  sh.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  sh.getRange(2, 3, rows.length, 1).setNumberFormat('#,##0.00');
  sh.setColumnWidth(2, 230);
  sh.getRange(rows.length + 3, 1).setValue(
    'These four types fill the dropdowns in the Armrest, Seat mechanism, Base and Wheels columns. ' +
    'Component Type must read exactly Armrest, Seat mechanism, Base or Wheels. Add your own rows and rates freely.');
}

function seedCustomers(ss) {
  var rows = [
    ['CUST-001', 'Example Corporate Buyer Pvt Ltd', 'Corporate', '09ABCDE1234F1Z5', 'Uttar Pradesh', 'Noida', 'Rahul', 'Yes'],
    ['CUST-002', 'Example Dealer & Sons', 'Dealer', '07FGHIJ5678K2Z9', 'Delhi', 'New Delhi', 'Priya', 'Yes'],
    ['CUST-003', 'State Public Works Department', 'Government / GeM', '', 'Uttar Pradesh', 'Lucknow', 'Rahul', 'Yes']
  ];
  var sh = ss.getSheetByName('M_Customers');
  sh.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  sh.setColumnWidth(2, 260);
  sh.getRange(rows.length + 3, 1).setValue('Replace these three sample rows with your real customers.');
}

function formatOrders(ss) {
  var sh = ss.getSheetByName('T_Orders');
  var last = sh.getMaxRows() - 1;
  // 12 Gross · 13 Discount · 15 Rate without GST · 16 BOM cost · 17 GP · 19 GP/unit
  // 20 GST · 21 Rate with GST · 22 Break-even · 24 Value needed
  [12, 13, 15, 16, 17, 19, 20, 21, 22, 24].forEach(function (c) {
    sh.getRange(2, c, last, 1).setNumberFormat('#,##0;(#,##0);-');
  });
  [14, 18, 23, 25].forEach(function (c) {
    sh.getRange(2, c, last, 1).setNumberFormat('0.0"%";(0.0"%");-');
  });
  // colour the Gross Profit % column by health
  var gpPct = sh.getRange(2, 18, last, 1);
  var rules = [
    SpreadsheetApp.newConditionalFormatRule().whenNumberGreaterThanOrEqualTo(18)
      .setBackground('#E4F0E8').setFontColor('#1E7A4C').setRanges([gpPct]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenNumberBetween(8, 18)
      .setBackground('#FAEEDB').setFontColor('#B0731A').setRanges([gpPct]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenNumberLessThan(8)
      .setBackground('#F9E5E3').setFontColor('#AE2B22').setRanges([gpPct]).build()
  ];
  sh.setConditionalFormatRules(rules);
  sh.hideColumns(SCHEMA.T_Orders.length); // Input JSON — machine use only
}

/* ===========================================================================
   WEB APP ENTRY POINTS
   =========================================================================== */
function doPost(e) {
  var req = {};
  try { req = JSON.parse(e.postData.contents); } catch (err) { return fail('Request body was not valid JSON.'); }
  if (SHARED_TOKEN && req.token !== SHARED_TOKEN) return fail('Token rejected.');

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    switch (req.action) {
      case 'bootstrap': return ok(bootstrap());
      case 'nextOrderId': return ok({ orderId: nextOrderId() });
      case 'saveOrder': return ok(saveOrder(req.payload));
      case 'getOrder': return ok(getOrder(req.payload.orderId));
      case 'listOrders': return ok(listOrders(req.payload.limit));
      case 'ping': return ok({ pong: true });
      default: return fail('Unknown action: ' + req.action);
    }
  } catch (err) {
    return fail(err.message);
  } finally {
    try { lock.releaseLock(); } catch (ignore) {}
  }
}

/* browser sanity check — opening the /exec URL shows this */
function doGet() {
  return ContentService.createTextOutput(
    JSON.stringify({ ok: true, service: 'Sales GP Calculator backend', time: new Date() })
  ).setMimeType(ContentService.MimeType.JSON);
}

function ok(data) {
  return ContentService.createTextOutput(JSON.stringify({ ok: true, data: data }))
    .setMimeType(ContentService.MimeType.JSON);
}
function fail(msg) {
  return ContentService.createTextOutput(JSON.stringify({ ok: false, error: msg }))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ===========================================================================
   ACTIONS
   =========================================================================== */
function sheet(name) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh) throw new Error('Sheet "' + name + '" is missing. Run setupDatabase() first.');
  return sh;
}

function readTable(name) {
  var sh = sheet(name);
  var last = sh.getLastRow();
  if (last < 2) return [];
  var w = SCHEMA[name].length;
  return sh.getRange(2, 1, last - 1, w).getValues()
    .filter(function (r) { return String(r[0]).trim() !== ''; });
}

function bootstrap() {
  var settings = {};
  readTable('Settings').forEach(function (r) {
    var val = r[1];
    settings[String(r[0]).trim()] = (typeof val === 'number') ? val : String(val);
  });

  var products = readTable('M_Products')
    .filter(function (r) { return String(r[10]).toLowerCase() !== 'no'; })
    .map(function (r) {
      return {
        sku: r[0], name: r[1], uom: r[2], listPrice: +r[3] || 0,
        armrestName: r[4] || '', seatMechName: r[5] || '',
        baseName: r[6] || '', wheelsName: r[7] || '',
        gstPct: +r[8] || 18, hsn: r[9]
      };
    });

  var components = readTable('M_Components')
    .filter(function (r) { return r[1] && String(r[3]).toLowerCase() !== 'no'; })
    .map(function (r) {
      return { type: String(r[0]).trim(), name: String(r[1]).trim(), rate: +r[2] || 0 };
    });

  var customers = readTable('M_Customers')
    .filter(function (r) { return String(r[7]).toLowerCase() !== 'no'; })
    .map(function (r) {
      return {
        code: r[0], name: r[1], type: r[2], gstin: r[3],
        state: r[4], city: r[5], salesperson: r[6]
      };
    });

  var approvalMatrix = readTable('M_ApprovalMatrix').map(function (r) {
    return { minPct: +r[0], level: r[1], who: r[2], tone: String(r[3] || 'watch') };
  }).sort(function (a, b) { return b.minPct - a.minPct; });

  return { settings: settings, products: products, components: components,
           customers: customers, approvalMatrix: approvalMatrix };
}

function nextOrderId() {
  var sh = sheet('Settings');
  var vals = sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), 2).getValues();
  var prefix = ORDER_PREFIX, row = -1, counter = 1000;
  vals.forEach(function (r, i) {
    if (r[0] === 'orderPrefix') prefix = String(r[1] || ORDER_PREFIX);
    if (r[0] === 'orderCounter') { counter = parseInt(r[1], 10) || 1000; row = i + 2; }
  });
  counter += 1;
  if (row > 0) sh.getRange(row, 2).setValue(counter);
  return prefix + '-' + String(counter).padStart(5, '0');
}

function findRow(sh, orderId) {
  var last = sh.getLastRow();
  if (last < 2) return -1;
  var ids = sh.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(orderId)) return i + 2;
  return -1;
}

function deleteRowsFor(sh, orderId) {
  var last = sh.getLastRow();
  if (last < 2) return;
  var ids = sh.getRange(2, 1, last - 1, 1).getValues();
  for (var i = ids.length - 1; i >= 0; i--) {
    if (String(ids[i][0]) === String(orderId)) sh.deleteRow(i + 2);
  }
}

function saveOrder(b) {
  if (!b || !b.order || !b.order.orderId) throw new Error('Order ID is missing.');
  var id = String(b.order.orderId).trim();
  var user = Session.getActiveUser().getEmail() || 'anonymous';
  var now = new Date();

  /* --- header (upsert) --- */
  var shO = sheet('T_Orders');
  var row = ORDER_KEYS.map(function (k) {
    var v = b.order[k];
    return (v === undefined || v === null) ? '' : v;
  });
  row.push(now, user, JSON.stringify(b.inputs || {}));
  var at = findRow(shO, id);
  if (at > 0) shO.getRange(at, 1, 1, row.length).setValues([row]);
  else shO.appendRow(row);

  /* --- lines (replace) --- */
  var shL = sheet('T_OrderLines');
  deleteRowsFor(shL, id);
  if (b.lines && b.lines.length) {
    var lrows = b.lines.map(function (l) {
      return LINE_KEYS.map(function (k) { return l[k] === undefined ? '' : l[k]; });
    });
    shL.getRange(shL.getLastRow() + 1, 1, lrows.length, LINE_KEYS.length).setValues(lrows);
  }

  /* --- audit --- */
  sheet('Sys_AuditLog').appendRow([
    now, user, at > 0 ? 'Updated' : 'Created', id,
    b.order.grossProfit, b.order.grossProfitPct, b.order.approvalLevel,
    (b.lines || []).length + ' lines · ' + b.order.customerName
  ]);

  return { orderId: id, mode: at > 0 ? 'updated' : 'created', savedAt: now };
}

function getOrder(orderId) {
  var shO = sheet('T_Orders');
  var at = findRow(shO, orderId);
  if (at < 0) return null;
  var vals = shO.getRange(at, 1, 1, SCHEMA.T_Orders.length).getValues()[0];
  var order = {};
  ORDER_KEYS.forEach(function (k, i) { order[k] = vals[i]; });
  var inputs = null;
  try { inputs = JSON.parse(vals[SCHEMA.T_Orders.length - 1] || 'null'); } catch (e) {}
  return { order: order, inputs: inputs };
}

function listOrders(limit) {
  var rows = readTable('T_Orders');
  // positions follow SCHEMA.T_Orders, so they move with it rather than by hand
  var col = function (title) { return SCHEMA.T_Orders.indexOf(title); };
  var idx = {
    id: col('Order ID'), date: col('Order Date'), cust: col('Customer Name'),
    nsv: col('Rate without GST'), gp: col('Gross Profit'),
    gpPct: col('Gross Profit %'), appr: col('Approval Level')
  };
  return rows.slice(-(limit || 100)).reverse().map(function (r) {
    return {
      orderId: r[idx.id], orderDate: r[idx.date], customer: r[idx.cust],
      netSalesValue: r[idx.nsv], grossProfit: r[idx.gp],
      grossProfitPct: r[idx.gpPct], approvalLevel: r[idx.appr]
    };
  });
}

/* ===========================================================================
   Menu — convenience for whoever owns the sheet
   =========================================================================== */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('GP Calculator')
    .addItem('Set up / update database', 'setupDatabase')
    .addItem('Issue next order ID', 'showNextId')
    .addSeparator()
    .addItem('Clear saved orders', 'clearTransactions')
    .addToUi();
}
function showNextId() {
  SpreadsheetApp.getUi().alert('Next order ID: ' + nextOrderId());
}
