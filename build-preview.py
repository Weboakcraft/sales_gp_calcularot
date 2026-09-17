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
    [['Hurricane', 40, 10, 9800, 5200, 180, 240, ['Adjustable armrest', 320]],
     ['Matrix HB', 12, 8, 14500, 7900, 220, 300, null],
     ['Robo', 6, 5, 7400, 4100, 150, 210, null]].forEach(function (d) {
      $('btnAddLine').click();
      var tr = body.querySelectorAll('tr.line');
      tr = tr[tr.length - 1];
      var sel = tr.querySelector('[data-k=model]');
      sel.value = d[0];
      tr.querySelector('[data-k=qty]').value = d[1];
      tr.querySelector('[data-k=discPct]').value = d[2];
      tr.querySelector('[data-k=listPrice]').value = d[3];
      tr.querySelector('[data-k=cStandard]').value = d[4];
      tr.querySelector('[data-k=cPacking]').value = d[5];
      tr.querySelector('[data-k=cFreight]').value = d[6];
      if (d[7]) {
        tr.querySelector('.add-btn').click();
        var cr = body.querySelector('tr.cust[data-parent="' + tr.dataset.id + '"]');
        cr.querySelector('[data-k=desc]').value = d[7][0];
        cr.querySelector('[data-k=rate]').value = d[7][1];
      }
    });

    set('gstPct', 18);

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
