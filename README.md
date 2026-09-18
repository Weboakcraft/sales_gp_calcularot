# Sales GP Calculator

Order-level gross profit for a furniture manufacturer. Front end is static HTML/CSS/JS
(deploys to GitHub Pages), database is Google Sheets, backend is a Google Apps Script
web app. No server, no build step, no monthly bill.

```
GitHub Pages (static)  ──POST──>  Apps Script /exec  ──>  Google Sheets
   index.html                        Code.gs               9 sheets
   assets/engine.js  (maths)
   assets/app.js     (UI)
   assets/sheets.js  (API)
```

---

## 1. What it calculates

Most calculators stop at `price − material cost` and call it gross profit. That number is
usually 15–20 points too optimistic. This one builds the rate from the model's own BOM and
keeps GST out of the margin entirely.

| Level | Costs deducted | Result |
|---|---|---|
| **1** BOM & rate | armrest, seat mechanism, base, wheels | **Gross profit** |
| **2** GST | GST at the applicable rate | Rate with GST — *deliberately excluded from GP* |

GST is worked out on the side and never reduces gross profit. The engine still carries
order-direct, commercial and overhead cost heads, and the saved sheet still has columns for
them, but the calculator no longer collects any of them, so contribution, net contribution
and actual GP all equal gross profit.

Each of the four parts is a dropdown of the variants you sell — every armrest, every seat
mechanism, every base, every castor — and picking one brings its rate in from
`M_Components`. A model carries its standard spec, so choosing the model fills all four
dropdowns and all four rates at once; change one for a particular customer and only that
rate moves. Type over a rate and your figure stands.

Nothing else is counted and nothing is loaded on top: BOM cost is
`armrest + seat mechanism + base + wheels`, and gross profit is measured against that.

The ten models to start with: Hurricane, Matrix HB, Matrix MB, 01, 15 No., Butterfly, Robo,
Pears, 07, Boom. Their rates ship as zero — fill them in the `M_Products` sheet.

### Beyond the arithmetic

- **Break-even sales value.** The engine separates every cost head into revenue-scaling and
  fixed, then solves `NSV × (1 − v) − F = 0` rather than summing costs naively.
- **Target-price solver.** Give it a target GP% and it returns the sales value needed, the
  price rise required, and the maximum discount that still lands on target.
- **Approval routing.** GP% maps to a sign-off level from a table you control in the sheet.
- **Validation.** Any line priced below its own production cost turns red, and saving is
  blocked until the error is fixed.

---

## 2. Google Sheets database structure

Eight sheets. Run `setupDatabase()` and all of this is created with headers, formatting,
conditional colour on the GP column, and sample master data.

It is safe to run again whenever this file changes. It adds what is missing, rewrites the
header row, **deletes any column past the last one in the schema and any sheet this version
no longer uses**, and leaves every row you have typed exactly where it is. A master that
already holds data is not re-seeded. Sheets of your own that the calculator does not know
about are left alone and listed in the summary.

`clearTransactions()` — on the **GP Calculator** menu — empties `T_Orders`, `T_OrderLines`
and `Sys_AuditLog` and touches no master. Use it once after a column change, so old orders
saved under the previous layout do not sit under the new headers.

### Masters — you maintain these

**`Settings`** — `Key | Value | Notes`
Eight rows: `companyName`, `orderPrefix`, `orderCounter`, `interestPct`, `pbgChargePct`,
`targetGpPct`, `defaultGstPct`, `currency`.
Yellow-filled cells are the ones to edit. `orderCounter` is bumped automatically.

**`M_Products`** — 11 columns
`Model Code | Model Name | UOM | Sale Rate | Standard Armrest | Standard Seat Mechanism |
Standard Base | Standard Wheels | GST % | HSN Code | Active`

The four standard columns hold a **component name** from `M_Components`, not a rate — that
is the model's normal specification. Pick a model in a line and the sale rate and all four
parts populate. Leave one blank and that dropdown starts empty.
Set `Active = No` to retire a model without deleting its history.

**`M_Components`** — 4 columns
`Component Type | Component Name | Rate | Active`

Every variant you sell, one row each. `Component Type` must read exactly `Armrest`,
`Seat mechanism`, `Base` or `Wheels` — that is what decides which dropdown the row appears
in. This is the single place a part's rate lives; change it here and every new line picks it
up.

**`M_Customers`** — 8 columns
`Customer Code | Customer Name | Customer Type | GSTIN | State | City | Salesperson | Active`

**`M_ApprovalMatrix`** — 4 columns
`Minimum GP % | Approval Level | Approver | Tone (good/watch/risk)`
Keep it sorted highest-first. The app takes the first row whose threshold is met.
Ships as 25 / 18 / 12 / 6 / below → auto-approved, Sales Manager, GM, Director, blocked.

### Transactions — the app writes these

**`T_Orders`** — 30 columns, one row per order, upserted on `Order ID`.
Identity and customer, then the ladder as the app shows it: gross value → discount →
**Rate without GST** → BOM cost → **Gross Profit** and **Gross Profit %** → GP per unit →
GST → **Rate with GST** → break-even, target, price gap → approval level and approver →
`Saved At`, `Saved By`, and a hidden `Input JSON` column holding the complete input state so
any order reloads exactly.

`Gross Profit %` is conditionally coloured: green ≥18, amber 8–18, red below 8. This sheet is
analytics-ready as it stands — pivot it by salesperson, customer type, or channel with no
further preparation.

**`T_OrderLines`** — 23 columns, one row per line, FK `Order ID`, replaced on each save.
Each part is stored as the variant chosen *and* the rate it carried, so you can answer both
"which armrest do we actually sell" and "what are seat mechanisms costing us across all
Matrix HB orders" directly.

**`Sys_AuditLog`** — 8 columns
`Timestamp | User | Action | Order ID | Gross Profit | Gross Profit % | Approval Level | Detail`
Every save, with the Google account that made it. This is the discount-approval trail.

---

## 3. Setup

**Sheets and backend**

1. Create a Google Sheet, name it something like `Sales GP Database`.
2. Extensions → Apps Script. Replace `Code.gs` with `apps-script/Code.gs`.
3. Change `SHARED_TOKEN` at the top to your own string.
4. Run `setupDatabase()`. Authorise when prompted. All eight sheets appear.
5. Deploy → New deployment → Web app. Execute as **Me**, access **Anyone**. Copy the `/exec` URL.

Opening that URL in a browser should return `{"ok":true,...}`.

**Front end**

6. Open `assets/config.js` and fill in both fields:

```javascript
window.GP_CONFIG = {
  endpoint: 'https://script.google.com/macros/s/AKfyc.../exec',
  token:    'OAK-84E2X-8XMX7-9KYF7'
};
```

   The token must match `SHARED_TOKEN` in `Code.gs` exactly. Leave `endpoint` on its
   `PASTE_` placeholder and the app runs in local mode instead.
7. Push `index.html`, `assets/` and `README.md` to a repo.
8. Settings → Pages → deploy from `main`, folder `/ (root)`.

The app connects on load — no per-person setup, and the dot in the header turns green when
the sheet is reachable. **Connect Sheets** is still there to point a single browser at a
different sheet for testing; it only takes effect while `config.js` is on its placeholder.

**If the repo is public, `config.js` is public too.** Either make the repo private, or drop
`assets/config.js` into `.gitignore`, leave a `config.example.js` in its place, and let each
person use the **Connect Sheets** dialog once.

**Why POST with `Content-Type: text/plain`:** it makes every call a CORS "simple request",
so the browser skips the preflight `OPTIONS` that Apps Script cannot answer. This is the
usual reason Sheets backends fail from GitHub Pages.

---

## 4. Daily use

Fill top to bottom. The right-hand panel recalculates on every keystroke — the large figure
is actual GP%, and its colour is the approval verdict.

- **Add line** or **Duplicate last line** for similar items
- Pick a model to autofill the sale rate and its standard four parts; change any dropdown and that rate follows
- **Ctrl/Cmd + S** saves · **Ctrl/Cmd + Enter** adds a line
- **Print sheet** produces a clean approval note with the ladder intact
- **Download JSON** exports the full bundle for email or archive

With no endpoint configured everything still works and saves to the browser, so the sales
team can quote offline and sync later.

---

## 5. Extending it

- **New cost head:** add the input to `index.html`, read it in `readOrder()` in `app.js`,
  push it inside `compute()` in `engine.js`, then add the column to `SCHEMA` and the key to
  `LINE_KEYS`/`ORDER_KEYS` in `Code.gs` and re-run `setupDatabase()`.
- **After editing anything in `assets/`:** bump the `?v=` number on that tag in `index.html`.
  Browsers cache those files hard, and a half-updated page looks broken in ways the code is
  not responsible for.
- **Different approval thresholds:** edit `M_ApprovalMatrix`. No code change.
- **Per-category overhead rates:** add a column to `M_Products` and read it in `bootstrap()`.
- **Costing by BOM instead of standard cost:** add an `M_BOM` sheet keyed on SKU and resolve
  it in `bootstrap()` before returning products — the engine already takes per-unit costs.

`assets/engine.js` has no DOM or network dependency. It runs under Node unchanged, which
makes the maths straightforward to unit-test.

---

## 6. A caution on the numbers

The overhead percentages and cost of funds shipped as defaults are
placeholders. Overhead absorption in particular decides whether an order reads as
profitable, so derive it from your own trial balance — total factory overhead for the year
divided by total production cost — before anyone quotes from this. Everything else is
arithmetic; that one figure is a judgement.
