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
usually 15–20 points too optimistic. This one runs five levels and only the first four
touch GP.

| Level | Costs deducted | Result |
|---|---|---|
| **1** Production | material, hardware, fabric/foam, finishing, labour, packing, wastage, inward freight | **Gross profit** |
| **2** Order-direct | outward freight, handling, transit insurance, installation, travel, samples, BIS/inspection, special packing — less anything billed to the customer | **Contribution** |
| **3** Commercial | commission, dealer incentive, cash discount, working-capital cost, EMD blocking, bank guarantee, tender fees, marketplace charge, LD provision, warranty provision, bad debt, bank charges, non-creditable GST | **Net contribution** |
| **4** Overhead | factory overhead absorption, admin, selling & marketing, depreciation | **Actual GP** |
| **5** Tax & cash | GST, GST TDS, income-tax TDS/TCS | Invoice value and net collection — *deliberately excluded from GP* |

Three decisions worth knowing about, because they are where most spreadsheets go wrong:

- **Freight billed to the customer is revenue, not a cost offset.** It sits in net sales value
  and the freight you actually pay sits in Level 2. Netting them hides whether you are
  recovering logistics or subsidising them.
- **Working-capital cost runs on the receivable including GST**, not the taxable value.
  You fund the whole invoice for the credit period, GST included.
- **TDS and TCS never reduce gross profit.** They are recoverable, so they belong in the
  cash-realisation block only. Treating them as cost understates every government order.

Wastage and inward freight compound onto the *material* family only, not onto labour —
you don't scrap wages.

### Beyond the arithmetic

- **Break-even sales value.** The engine separates every cost head into revenue-scaling and
  fixed, then solves `NSV × (1 − v) − F = 0` rather than summing costs naively.
- **Target-price solver.** Give it a target GP% and it returns the sales value needed, the
  price rise required, and the maximum discount that still lands on target.
- **Stress sliders.** Extra discount, material inflation, labour inflation, freight rise —
  each re-runs the whole model and shows the GP that survives.
- **Approval routing.** GP% maps to a sign-off level from a table you control in the sheet.
- **Validation.** Any line priced below its own production cost turns red and blocks saving.

---

## 2. Google Sheets database structure

Nine sheets. Run `setupDatabase()` once and all of this is created with headers,
formatting, conditional colour on the GP column, and sample master data.

### Masters — you maintain these

**`Settings`** — `Key | Value | Notes`
Ten rows: `companyName`, `orderPrefix`, `orderCounter`, `interestPct`, `pbgChargePct`,
`targetGpPct`, `defaultGstPct`, `defaultWastagePct`, `defaultInwardPct`, `currency`.
Yellow-filled cells are the ones to edit. `orderCounter` is bumped automatically.

**`M_Products`** — 19 columns
`SKU | Product Name | Category | UOM | List Price | Material Cost | Hardware Cost |
Fabric/Foam Cost | Finishing Cost | Labour Cost | Packing Cost | Other Cost | Wastage % |
Inward Freight % | CBM per Unit | Weight per Unit (kg) | GST % | HSN Code | Active`

This drives the autofill. Type a product name in a line and every cost field populates.
Set `Active = No` to retire an item without deleting its history.

**`M_Customers`** — 12 columns
`Customer Code | Customer Name | Customer Type | GSTIN | State | City | Credit Days |
Default Discount % | Sales Commission % | Credit Limit | Salesperson | Active`

**`M_ApprovalMatrix`** — 4 columns
`Minimum GP % | Approval Level | Approver | Tone (good/watch/risk)`
Keep it sorted highest-first. The app takes the first row whose threshold is met.
Ships as 25 / 18 / 12 / 6 / below → auto-approved, Sales Manager, GM, Director, blocked.

**`M_FreightRates`** — 8 columns
`Zone | From State | To State | Basis (cbm/kg/unit) | Rate | Minimum Charge | Transit Days | Transporter`
Reference table for quoting.

### Transactions — the app writes these

**`T_Orders`** — 48 columns, one row per order, upserted on `Order ID`.
Identity, customer, volumetrics, then the full ladder: gross value → discount → recovery →
net sales value → production cost → gross profit → direct cost → contribution → commercial
cost → net contribution → overhead → **ACTUAL GP** and **ACTUAL GP %** → tax and collection →
break-even, target, price gap → approval level and approver → `Saved At`, `Saved By`, and a
hidden `Input JSON` column holding the complete input state so any order reloads exactly.

`ACTUAL GP %` is conditionally coloured: green ≥18, amber 8–18, red below 8. This sheet is
analytics-ready as it stands — pivot it by salesperson, customer type, or channel with no
further preparation.

**`T_OrderLines`** — 27 columns, one row per line, FK `Order ID`, replaced on each save.
Every cost component is stored separately rather than as a single COGS figure, so you can
answer "what is fabric costing us across all sofa orders this quarter" directly.

**`T_OrderCosts`** — 5 columns, long format:
`Order ID | Level | Cost Head | Amount | Scales With Revenue`
Long format on purpose. New cost heads never need a schema change, and it pivots cleanly
into a cost-structure report.

**`Sys_AuditLog`** — 8 columns
`Timestamp | User | Action | Order ID | Actual GP | Actual GP % | Approval Level | Detail`
Every save, with the Google account that made it. This is the discount-approval trail.

---

## 3. Setup

**Sheets and backend**

1. Create a Google Sheet, name it something like `Sales GP Database`.
2. Extensions → Apps Script. Replace `Code.gs` with `apps-script/Code.gs`.
3. Change `SHARED_TOKEN` at the top to your own string.
4. Run `setupDatabase()`. Authorise when prompted. All nine sheets appear.
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
- Type a product name to autofill all ten cost fields from the master
- **Ctrl/Cmd + S** saves · **Ctrl/Cmd + Enter** adds a line
- **Print sheet** produces a clean approval note with the ladder intact
- **Download JSON** exports the full bundle for email or archive

With no endpoint configured everything still works and saves to the browser, so the sales
team can quote offline and sync later.

---

## 5. Extending it

- **New cost head:** add the input to `index.html`, read it in `readOrder()` in `app.js`,
  and push it in the right level inside `compute()` in `engine.js`. `T_OrderCosts` needs no
  change — long format absorbs it.
- **Different approval thresholds:** edit `M_ApprovalMatrix`. No code change.
- **Per-category overhead rates:** add a column to `M_Products` and read it in `bootstrap()`.
- **Costing by BOM instead of standard cost:** add an `M_BOM` sheet keyed on SKU and resolve
  it in `bootstrap()` before returning products — the engine already takes per-unit costs.

`assets/engine.js` has no DOM or network dependency. It runs under Node unchanged, which
makes the maths straightforward to unit-test.

---

## 6. A caution on the numbers

The overhead percentages, wastage rates and cost of funds shipped as defaults are
placeholders. Overhead absorption in particular decides whether an order reads as
profitable, so derive it from your own trial balance — total factory overhead for the year
divided by total production cost — before anyone quotes from this. Everything else is
arithmetic; that one figure is a judgement.
