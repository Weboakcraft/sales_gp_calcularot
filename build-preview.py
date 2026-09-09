#!/usr/bin/env python3
"""Bundle index.html + assets into one self-contained preview file."""
import re, sys, pathlib

root = pathlib.Path(__file__).parent
html = (root / 'index.html').read_text()
css  = (root / 'assets/styles.css').read_text()
js = [(root / f'assets/{n}.js').read_text() for n in ('engine', 'sheets', 'app')]
# the demo is meant to be shared, so never bake real credentials into it
js.insert(1, "window.GP_CONFIG = { endpoint: 'PASTE_YOUR_EXEC_URL_HERE', token: '' };")

DEMO = """
/* preview only: fill a realistic order so the panel is alive on load */
window.addEventListener('load', function () {
  setTimeout(function () {
    var $ = function (i) { return document.getElementById(i); };
    var set = function (i, v) { var e = $(i); if (e) e.value = v; };
    set('custName', 'Meridian Business Park Pvt Ltd');
    set('custType', 'Corporate');
    set('custGstin', '09ABCDE1234F1Z5');
    set('custState', 'Uttar Pradesh');
    set('salesperson', 'Rahul Verma');
    set('deliveryDate', new Date(Date.now() + 26 * 864e5).toISOString().slice(0, 10));

    var body = $('lineBody'); body.innerHTML = '';
    [['Executive high-back chair', 60, 16],
     ['Four-seater linear workstation', 12, 11],
     ['Eight-seat conference table', 3, 8]].forEach(function (d) {
      $('btnAddLine').click();
      var tr = body.lastElementChild;
      var n = tr.querySelector('[data-k=description]');
      n.value = d[0];
      n.dispatchEvent(new Event('change', { bubbles: true }));
      tr.querySelector('[data-k=qty]').value = d[1];
      tr.querySelector('[data-k=discPct]').value = d[2];
    });

    [['freightRate', 1400], ['handling', 9000], ['insurancePct', 0.2],
     ['installRate', 300], ['travel', 14000], ['inspection', 12000],
     ['freightBilled', 30000], ['installBilled', 18000],
     ['commissionPct', 2], ['creditDays', 60], ['pbgPct', 5], ['pbgMonths', 18],
     ['warrantyPct', 1.5], ['badDebtPct', 0.75], ['bankChargePct', 0.2],
     ['factoryOhPct', 12], ['adminOhPct', 3.5], ['sellingOhPct', 2.5]
    ].forEach(function (p) { set(p[0], p[1]); });

    $('custName').dispatchEvent(new Event('input', { bubbles: true }));
  }, 60);
});
"""

html = html.replace('<link rel="stylesheet" href="assets/styles.css">',
                    '<style>\n' + css + '\n</style>')

scripts = re.search(
    r'<script src="assets/engine\.js"></script>\s*'
    r'<script src="assets/config\.js"></script>\s*'
    r'<script src="assets/sheets\.js"></script>\s*'
    r'<script src="assets/app\.js"></script>', html)
if not scripts:
    sys.exit('script tags not found')

blob = '\n'.join('<script>\n%s\n</script>' % s for s in js)
blob += '\n<script>\n' + DEMO + '\n</script>'
html = html[:scripts.start()] + blob + html[scripts.end():]

out = root / 'preview.html'
out.write_text(html)
print('wrote', out, len(html), 'chars')
