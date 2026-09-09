/****************************************************************************
 * Sales GP Calculator — Google Sheets backend
 * ---------------------------------------------------------------------------
 * 1. Open your Google Sheet  ->  Extensions  ->  Apps Script
 * 2. Paste this file over Code.gs and save
 * 3. Run  setupDatabase()  once. It builds every sheet, header and sample row.
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

  M_Products: ['SKU', 'Product Name', 'Category', 'UOM', 'List Price', 'Material Cost',
    'Hardware Cost', 'Fabric/Foam Cost', 'Finishing Cost', 'Labour Cost', 'Packing Cost',
    'Other Cost', 'Wastage %', 'Inward Freight %', 'CBM per Unit', 'Weight per Unit (kg)',
    'GST %', 'HSN Code', 'Active'],

  M_Customers: ['Customer Code', 'Customer Name', 'Customer Type', 'GSTIN', 'State',
    'City', 'Credit Days', 'Default Discount %', 'Sales Commission %', 'Credit Limit',
    'Salesperson', 'Active'],

  M_ApprovalMatrix: ['Minimum GP %', 'Approval Level', 'Approver', 'Tone (good/watch/risk)'],

  M_FreightRates: ['Zone', 'From State', 'To State', 'Basis (cbm/kg/unit)', 'Rate',
    'Minimum Charge', 'Transit Days', 'Transporter'],

  T_Orders: ['Order ID', 'Order Date', 'Delivery Date', 'Status', 'Salesperson', 'Channel',
    'Customer Name', 'Customer Type', 'Customer GSTIN', 'Delivery State',
    'Total Qty', 'Total CBM', 'Total Weight (kg)',
    'Gross Order Value', 'Total Discount', 'Discount %', 'Recovery Billed', 'Net Sales Value',
    'Production Cost', 'Gross Profit', 'Gross Profit %',
    'Direct Order Cost', 'Contribution', 'Contribution %',
    'Commercial Cost', 'Net Contribution', 'Net Contribution %',
    'Overhead Cost', 'ACTUAL GP', 'ACTUAL GP %', 'GP per Unit', 'Total Cost',
    'GST Amount', 'Invoice Value', 'GST TDS', 'Income Tax TDS', 'Net Collection',
    'Break-even Value', 'Target GP %', 'Value Needed for Target', 'Price Gap %',
    'Approval Level', 'Approver', 'Credit Days', 'Interest % p.a.',
    'Saved At', 'Saved By', 'Input JSON'],

  T_OrderLines: ['Order ID', 'Line No', 'SKU', 'Description', 'Category', 'Qty',
    'List Price', 'Discount %', 'Net Line Value', 'Unit Net Price',
    'Material', 'Hardware', 'Fabric/Foam', 'Finishing', 'Labour', 'Packing', 'Other',
    'Wastage %', 'Inward Freight %', 'CBM per Unit', 'Weight per Unit',
    'Unit Cost', 'Total Line Cost', 'Line GP', 'Line GP %', 'GST %', 'GST Amount'],

  T_OrderCosts: ['Order ID', 'Level', 'Cost Head', 'Amount', 'Scales With Revenue'],

  Sys_AuditLog: ['Timestamp', 'User', 'Action', 'Order ID', 'Actual GP', 'Actual GP %',
    'Approval Level', 'Detail']
};

/* order of keys written into T_Orders — index-matched to the header above */
var ORDER_KEYS = ['orderId', 'orderDate', 'deliveryDate', 'status', 'salesperson', 'channel',
  'customerName', 'customerType', 'customerGstin', 'customerState',
  'totalQty', 'totalCbm', 'totalWeight',
  'grossValue', 'totalDiscount', 'discountPct', 'recoveryBilled', 'netSalesValue',
  'productionCost', 'grossProfit', 'grossProfitPct',
  'directCost', 'contribution', 'contributionPct',
  'commercialCost', 'netContribution', 'netContributionPct',
  'overheadCost', 'actualGP', 'actualGPPct', 'gpPerUnit', 'totalCost',
  'gstAmount', 'invoiceValue', 'gstTds', 'incomeTds', 'netCollection',
  'breakEvenValue', 'targetGpPct', 'requiredValueForTarget', 'priceGapPct',
  'approvalLevel', 'approvedBy', 'creditDays', 'interestPct'];

var LINE_KEYS = ['orderId', 'lineNo', 'sku', 'description', 'category', 'qty',
  'listPrice', 'discPct', 'netValue', 'unitNetPrice',
  'cMaterial', 'cHardware', 'cUpholstery', 'cFinishing', 'cLabour', 'cPacking', 'cOther',
  'wastagePct', 'inwardFreightPct', 'cbmPerUnit', 'weightPerUnit',
  'unitCost', 'totalCost', 'lineGP', 'lineGPPct', 'gstPct', 'gstAmount'];

var COST_KEYS = ['orderId', 'level', 'head', 'amount', 'scalesWithRevenue'];

/* ===========================================================================
   ONE-TIME SETUP
   =========================================================================== */
function setupDatabase() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  Object.keys(SCHEMA).forEach(function (name) {
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    var headers = SCHEMA[name];
    sh.clear();
    sh.getRange(1, 1, 1, headers.length).setValues([headers])
      .setFontWeight('bold').setFontFamily('Arial').setFontSize(10)
      .setBackground('#231F1A').setFontColor('#F2EDE4')
      .setVerticalAlignment('middle').setWrap(true);
    sh.setFrozenRows(1);
    sh.setRowHeight(1, 38);
    sh.getRange(1, 1, sh.getMaxRows(), headers.length).setFontFamily('Arial');
  });

  seedSettings(ss);
  seedApprovalMatrix(ss);
  seedProducts(ss);
  seedCustomers(ss);
  seedFreight(ss);
  formatOrders(ss);

  var first = ss.getSheetByName('Settings');
  ss.setActiveSheet(first);
  SpreadsheetApp.getUi().alert(
    'Database ready.\n\n' + Object.keys(SCHEMA).length + ' sheets created with headers, ' +
    'sample master data and formatting.\n\nNext: Deploy > New deployment > Web app, then paste the /exec URL into the calculator.'
  );
}

function seedSettings(ss) {
  var rows = [
    ['companyName', 'Your Company — order profitability', 'Shown beside the app title'],
    ['orderPrefix', ORDER_PREFIX, 'Prefix for auto-generated order IDs'],
    ['orderCounter', 1000, 'Last number issued. The app increments this.'],
    ['interestPct', 11, 'Cost of funds, % per annum'],
    ['pbgChargePct', 1.5, 'Bank charge on performance guarantees, % p.a.'],
    ['targetGpPct', 20, 'House target gross profit %'],
    ['defaultGstPct', 18, 'Default GST rate on furniture'],
    ['defaultWastagePct', 4, 'Standard material wastage'],
    ['defaultInwardPct', 2, 'Inward freight as % of material'],
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
    ['CH-EXE-01', 'Executive high-back chair', 'Office chair', 'Nos', 12000, 3200, 900, 1100, 300, 800, 250, 0, 4, 2, 0.35, 18, 18, '9401', 'Yes'],
    ['CH-TSK-02', 'Task chair with mesh back', 'Office chair', 'Nos', 6500, 1700, 620, 480, 180, 450, 160, 0, 4, 2, 0.22, 11, 18, '9401', 'Yes'],
    ['CH-VIS-03', 'Visitor chair, cantilever', 'Office chair', 'Nos', 4200, 1150, 300, 380, 140, 300, 110, 0, 4, 2, 0.18, 8, 18, '9401', 'Yes'],
    ['SF-3ST-01', 'Three-seater office sofa', 'Sofa', 'Nos', 38000, 9800, 1200, 6400, 900, 3200, 800, 0, 6, 2, 1.6, 62, 18, '9401', 'Yes'],
    ['SF-RCL-02', 'Single-seat recliner', 'Recliner', 'Nos', 29000, 7400, 3800, 4200, 600, 2600, 650, 0, 5, 2, 0.95, 45, 18, '9401', 'Yes'],
    ['WS-4ST-01', 'Four-seater linear workstation', 'Workstation', 'Set', 48000, 18000, 2500, 0, 1500, 3000, 900, 200, 5, 2, 1.8, 120, 18, '9403', 'Yes'],
    ['WS-6ST-02', 'Six-seater cluster workstation', 'Workstation', 'Set', 68000, 25500, 3600, 0, 2100, 4200, 1200, 300, 5, 2, 2.6, 172, 18, '9403', 'Yes'],
    ['TB-CNF-01', 'Eight-seat conference table', 'Table', 'Nos', 54000, 21000, 2200, 0, 2400, 3400, 1100, 0, 5, 2, 2.2, 140, 18, '9403', 'Yes'],
    ['TB-EXE-02', 'Executive desk with side unit', 'Table', 'Nos', 32000, 12400, 1800, 0, 1400, 2100, 700, 0, 5, 2, 1.3, 82, 18, '9403', 'Yes'],
    ['ST-PED-01', 'Three-drawer mobile pedestal', 'Storage', 'Nos', 8500, 3100, 900, 0, 420, 600, 240, 0, 4, 2, 0.28, 24, 18, '9403', 'Yes']
  ];
  var sh = ss.getSheetByName('M_Products');
  sh.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  sh.getRange(2, 5, rows.length, 12).setNumberFormat('#,##0.00');
  sh.setColumnWidth(2, 230);
  sh.getRange(rows.length + 3, 1).setValue(
    'Edit these rows freely — the calculator loads them as its product master. Keep Active = Yes for anything you still sell.');
}

function seedCustomers(ss) {
  var rows = [
    ['CUST-001', 'Example Corporate Buyer Pvt Ltd', 'Corporate', '09ABCDE1234F1Z5', 'Uttar Pradesh', 'Noida', 45, 12, 2, 2000000, 'Rahul', 'Yes'],
    ['CUST-002', 'Example Dealer & Sons', 'Dealer', '07FGHIJ5678K2Z9', 'Delhi', 'New Delhi', 30, 25, 0, 1000000, 'Priya', 'Yes'],
    ['CUST-003', 'State Public Works Department', 'Government / GeM', '', 'Uttar Pradesh', 'Lucknow', 90, 5, 0, 5000000, 'Rahul', 'Yes']
  ];
  var sh = ss.getSheetByName('M_Customers');
  sh.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  sh.setColumnWidth(2, 260);
  sh.getRange(rows.length + 3, 1).setValue('Replace these three sample rows with your real customers.');
}

function seedFreight(ss) {
  var rows = [
    ['North', 'Uttar Pradesh', 'Delhi NCR', 'cbm', 1100, 3000, 2, 'Local fleet'],
    ['North', 'Uttar Pradesh', 'Punjab', 'cbm', 1400, 4000, 3, 'Partner transporter'],
    ['West', 'Uttar Pradesh', 'Maharashtra', 'cbm', 2100, 8000, 5, 'Partner transporter'],
    ['South', 'Uttar Pradesh', 'Karnataka', 'cbm', 2400, 9000, 6, 'Partner transporter'],
    ['East', 'Uttar Pradesh', 'West Bengal', 'cbm', 1900, 7000, 5, 'Partner transporter']
  ];
  var sh = ss.getSheetByName('M_FreightRates');
  sh.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  sh.getRange(rows.length + 3, 1).setValue(
    'Reference rates for quoting. Look up the row that matches the delivery state and type the rate into the calculator.');
}

function formatOrders(ss) {
  var sh = ss.getSheetByName('T_Orders');
  var last = sh.getMaxRows() - 1;
  var money = [14, 15, 17, 18, 19, 20, 22, 23, 25, 26, 28, 29, 31, 32, 33, 34, 35, 36, 37, 38, 40];
  money.forEach(function (c) { sh.getRange(2, c, last, 1).setNumberFormat('#,##0;(#,##0);-'); });
  [16, 21, 24, 27, 30, 39, 41].forEach(function (c) {
    sh.getRange(2, c, last, 1).setNumberFormat('0.0"%";(0.0"%");-');
  });
  // colour the ACTUAL GP % column by health
  var gpPct = sh.getRange(2, 30, last, 1);
  var rules = [
    SpreadsheetApp.newConditionalFormatRule().whenNumberGreaterThanOrEqualTo(18)
      .setBackground('#E4F0E8').setFontColor('#1E7A4C').setRanges([gpPct]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenNumberBetween(8, 18)
      .setBackground('#FAEEDB').setFontColor('#B0731A').setRanges([gpPct]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenNumberLessThan(8)
      .setBackground('#F9E5E3').setFontColor('#AE2B22').setRanges([gpPct]).build()
  ];
  sh.setConditionalFormatRules(rules);
  sh.hideColumns(48); // Input JSON — machine use only
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
    .filter(function (r) { return String(r[18]).toLowerCase() !== 'no'; })
    .map(function (r) {
      return {
        sku: r[0], name: r[1], category: r[2], uom: r[3], listPrice: +r[4] || 0,
        cMaterial: +r[5] || 0, cHardware: +r[6] || 0, cUpholstery: +r[7] || 0,
        cFinishing: +r[8] || 0, cLabour: +r[9] || 0, cPacking: +r[10] || 0, cOther: +r[11] || 0,
        wastagePct: +r[12] || 0, inwardFreightPct: +r[13] || 0,
        cbmPerUnit: +r[14] || 0, weightPerUnit: +r[15] || 0,
        gstPct: +r[16] || 18, hsn: r[17]
      };
    });

  var customers = readTable('M_Customers')
    .filter(function (r) { return String(r[11]).toLowerCase() !== 'no'; })
    .map(function (r) {
      return {
        code: r[0], name: r[1], type: r[2], gstin: r[3], state: r[4], city: r[5],
        creditDays: +r[6] || 0, defaultDiscountPct: +r[7] || 0,
        commissionPct: +r[8] || 0, salesperson: r[10]
      };
    });

  var approvalMatrix = readTable('M_ApprovalMatrix').map(function (r) {
    return { minPct: +r[0], level: r[1], who: r[2], tone: String(r[3] || 'watch') };
  }).sort(function (a, b) { return b.minPct - a.minPct; });

  var freight = readTable('M_FreightRates').map(function (r) {
    return { zone: r[0], from: r[1], to: r[2], basis: r[3], rate: +r[4] || 0, min: +r[5] || 0, days: +r[6] || 0 };
  });

  return { settings: settings, products: products, customers: customers,
           approvalMatrix: approvalMatrix, freightRates: freight };
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

  /* --- cost heads (replace) --- */
  var shC = sheet('T_OrderCosts');
  deleteRowsFor(shC, id);
  if (b.costs && b.costs.length) {
    var crows = b.costs.map(function (c) {
      return COST_KEYS.map(function (k) { return c[k] === undefined ? '' : c[k]; });
    });
    shC.getRange(shC.getLastRow() + 1, 1, crows.length, COST_KEYS.length).setValues(crows);
  }

  /* --- audit --- */
  sheet('Sys_AuditLog').appendRow([
    now, user, at > 0 ? 'Updated' : 'Created', id,
    b.order.actualGP, b.order.actualGPPct, b.order.approvalLevel,
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
  var idx = { id: 0, date: 1, cust: 6, nsv: 17, gp: 28, gpPct: 29, appr: 41 };
  return rows.slice(-(limit || 100)).reverse().map(function (r) {
    return {
      orderId: r[idx.id], orderDate: r[idx.date], customer: r[idx.cust],
      netSalesValue: r[idx.nsv], actualGP: r[idx.gp],
      actualGPPct: r[idx.gpPct], approvalLevel: r[idx.appr]
    };
  });
}

/* ===========================================================================
   Menu — convenience for whoever owns the sheet
   =========================================================================== */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('GP Calculator')
    .addItem('Set up / reset database', 'setupDatabase')
    .addItem('Issue next order ID', 'showNextId')
    .addToUi();
}
function showNextId() {
  SpreadsheetApp.getUi().alert('Next order ID: ' + nextOrderId());
}
