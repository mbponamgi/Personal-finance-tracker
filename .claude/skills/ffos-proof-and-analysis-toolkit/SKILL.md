---
name: ffos-proof-and-analysis-toolkit
description: First-principles verification recipes for Family Finance OS. Load when validating tax, EMI, or net-worth math; checking that a statement import was complete and correctly signed; proving a data migration is safe before shipping it; reconciling two numbers that disagree; verifying extracted metadata (credit limit, balances) against known-true values; or whenever any claim needs evidence stronger than "looks right". Covers balance-continuity reconciliation, tax-engine cross-checks, import round-trip accounting, dedupe/idempotency truth, migration-safety proofs, EMI amortization checks, and the calcNW sum-of-parts invariant.
---

# FFOS Proof and Analysis Toolkit

Every number this app shows is someone's actual money. The house rules are:

1. **NEVER break saved data** (`localStorage['family_finance_v1']`).
2. **VERIFY IN A REAL BROWSER; success must be measurable, never judged by eye.**

This skill is the "measurable" part: seven executable proof recipes, each run for real
on 2026-07-19 against this repo. History says eyeballing fails here — the Amex
"credit limit = 23" bug (c8a1144) took **four fix commits in one day** because
extracted metadata was never cross-checked against a known-true value, and the
member-segregation bug (1006309) was invisible because nobody asserted per-member
counts. Every recipe below exists to make that class of failure impossible.

## Prerequisites (verified 2026-07-19)

- **All helper scripts are `.cjs`** — the repo's `package.json` has `"type": "module"`,
  so a `.js` script using `require()` dies with `ReferenceError: require is not defined`.
- Browser recipes need the house server (file:// fails — ESM `<script type="module">`
  at index.html:538 + CSP):
  ```bash
  python3 -m http.server 7902 --directory /path/to/repo &   # kill it when done
  ```
  Scripts default to `http://localhost:7902/index.html`; override with `FFOS_URL`.
- Playwright resolves from the repo's `node_modules` (dependency `playwright ^1.60.0`);
  run scripts from anywhere — they locate the repo via their own path.
- `family-finance.js` is a **classic script** (index.html:1955, not a module), so its
  top-level bindings (`D`, `parsedRows`, `calcNW`, `go`, `save`…) are reachable from
  `page.evaluate()` and the DevTools console.
- The Import page is hidden behind nav: call `go('import')` before touching `#csvFile`
  or `#importConfirmBtn` (clicking the invisible button times out — learned the hard way).

Line numbers cited below were verified 2026-07-19: `load()` 45, `deepMerge` 62,
`calcNW` 1448, `OLD_SLABS/NEW_SLABS` 1517–1518, `slabTax` 1520, `computeRegime` 1535,
`bestRegime` 1591, `runPrepay` 3426, `extractCardMetadata` 4452, `BANK_CONFIGS` 4825,
`parseCSV` 5119, `confirmImport` 5215.

---

## Recipe 1 — Balance-continuity reconciliation

**WHEN**: Any time you parse (or change the parser for) a statement that carries a
running balance column — ICICI savings (`icici-salary`), SC. This is the strongest
completeness proof available: it catches missing rows, swapped debit/credit signs,
and mis-mapped columns in one shot.

**METHOD**: For every consecutive pair of rows, assert
`balance[i] == balance[i-1] − debit[i] + credit[i]`. One equation per row; if all
hold, the parse is complete and correctly signed between the first and last row.

**EXACT COMMANDS**:
```bash
node .claude/skills/ffos-proof-and-analysis-toolkit/scripts/check_balance_continuity.cjs test_icici.csv
```

(Canonical expected values for this fixture: `ffos-import-hardening-campaign/references/fixtures/icici-salary/*.expected.json`.)

**WORKED EXAMPLE** (hand math first — always): `test_icici.csv` at repo root:
```
1, 01/05/2026, …, Zomato,      500.00,          , 10500.00
2, 02/05/2026, …, Salary NEFT,        , 50000.00, 60500.00
3, 03/05/2026, …, Netflix,     199.00,          , 60301.00
```
- Row 1's 10500.00 is the balance *after* the ₹500 Zomato debit → implied opening
  balance = 10500 + 500 − 0 = **11000** (not checkable without the prior statement).
- Row 2: 10500 − 0 + 50000 = **60500** ✓
- Row 3: 60500 − 199 + 0 = **60301** ✓

Script output (executed 2026-07-19):
```
Rows parsed: 3
Implied opening balance (before row 1): 11000.00
  line 3 "Salary NEFT": 10500.00 - 0.00 + 50000.00 = 60500.00 vs stated 60500.00 OK
  line 4 "Netflix": 60500.00 - 199.00 + 0.00 = 60301.00 vs stated 60301.00 OK

CONTINUITY OK: 2/2 consecutive pairs reconcile (3 data rows).
```

**WHAT A FAILURE MEANS**: A break at row *i* means one of: a transaction between
*i−1* and *i* was dropped by the parser (check `parse()` returning null), a
debit/credit column swap (sign error), or the offset trick (`o = row[0]==='' ? 1 : 0`,
family-finance.js:4831) mis-fired for this file. A statement can also legitimately
break at page boundaries of PDF exports — but *never* inside a clean CSV.

---

## Recipe 2 — Tax-engine cross-check

**WHEN**: Before AND after touching anything in the FY 2025-26 tax engine
(`OLD_SLABS`, `NEW_SLABS`, `slabTax`, `computeRegime`, `bestRegime`), or when a
displayed tax number is questioned.

**THE RULE (non-negotiable)**: Any change to tax code requires one hand-computed
case proving the new behavior **BEFORE coding** — predict-then-run, per
ffos-research-methodology. If you cannot compute the expected number on paper, you
do not understand the change well enough to make it.

**METHOD**: The tax functions are pure (verified: they touch only their arguments,
`Math`, and each other) — so lift them out of `family-finance.js` into Node and
compare against independent hand math. The shipped script extracts them by
brace-counting from `function <name>(` (technique reusable for any pure function
in this repo; manual alternative: `sed -n '1517,1593p' family-finance.js` and paste
into a Node REPL — re-check line numbers first).

**EXACT COMMANDS**:
```bash
node .claude/skills/ffos-proof-and-analysis-toolkit/scripts/check_tax_engine.cjs
```

**WORKED EXAMPLE** — profile: gross ₹18,00,000, HRA exemption ₹1,20,000,
professional tax ₹2,400, 80C maxed ₹1,50,000, 80CCD(1B) maxed ₹50,000. Hand math:

| Step | OLD regime | NEW regime |
|---|---|---|
| Standard deduction | 50,000 | 75,000 |
| Salary income | 18,00,000−1,20,000−50,000−2,400 = 16,27,600 | 18,00,000−75,000 = 17,25,000 |
| Chapter VI-A | 1,50,000+50,000 = 2,00,000 | 0 (only 80CCD(2) survives; it's 0 here) |
| Taxable | **14,27,600** | **17,25,000** |
| Slab-by-slab | 2.5–5L@5%=12,500 · 5–10L@20%=1,00,000 · rest@30%=1,28,280 | 4–8L@5%=20,000 · 8–12L@10%=40,000 · 12–16L@15%=60,000 · 16–17.25L@20%=25,000 |
| Base tax | 2,40,780 | 1,45,000 |
| §87A rebate | 0 (taxable > 5L) | 0 (taxable > 12L) |
| +4% cess | 9,631.2 | 5,800 |
| **Total** | **2,50,411** | **1,50,800** |

Best regime: NEW. Script output (executed 2026-07-19): all 11 checks OK, ending
`TAX ENGINE OK: engine output matches the independent hand computation (11/11 checks).`

**WHAT A FAILURE MEANS**: Either the engine or your hand math is wrong — and you
must find out *which* before trusting anything. Common engine-side causes: a cap
constant changed (80C 1.5L, 80CCD(1B) 50k, 24b 2L, 80D 1L, PT 2.5k — see
computeRegime:1540-1549), rebate thresholds (5L old / 12L new), or rounding moved
(cess is computed on un-rounded base, then rounded per-field). Domain meaning of
these sections lives in **indian-finance-reference**, not here.

---

## Recipe 3 — Import round-trip accounting

**WHEN**: After any change to `parseCSV`, a `BANK_CONFIGS` parser, or
`confirmImport`; or whenever "did everything import?" is asked.

**METHOD**: Rows-in must equal rows-out:
`file lines == header rows + imported + rejected`. Prove it with the app's own
counters (`#parse-summary` prints "N rows read · N valid · N skipped") crossed
against an *independent* line count of the file, then assert the store count and
per-member counts after import. Browser mechanics (server, launch pattern) follow
**ffos-browser-verification** — this recipe only adds the accounting identities.

**EXACT COMMANDS**:
```bash
python3 -m http.server 7902 --directory "$(git rev-parse --show-toplevel)" &
node .claude/skills/ffos-proof-and-analysis-toolkit/scripts/verify_import_roundtrip.cjs
kill %1
```

**WORKED EXAMPLE** — `test_icici.csv`: 4 non-blank lines = 1 header + 3 imported +
0 rejected. Executed 2026-07-19:
```
PART A — round-trip accounting (test_icici.csv: 4 non-blank lines)
  parse summary: "File: test_icici.csv · 3 rows read · 3 valid · 0 skipped"
  rows read == file lines - header: OK — 3 vs 4-1
  rows read == valid + skipped: OK — 3 == 3+0
  file lines == header + imported + rejected: OK
  import badge: "✓ Imported 3 txns · 0 duplicates skipped"
  imported all valid rows: OK — store has 3
  per-member accounting (1006309 lesson): OK — {"madhu":3}
```

**VERIFIED PITFALL — dates import one day early (live bug, proven 2026-07-19)**:
`parseDate` (family-finance.js:4897) builds `new Date(y, m-1, d)` at *local*
midnight, then serializes with `.toISOString()` — which converts to UTC. In any
timezone ahead of UTC (IST = UTC+5:30) the date part rolls back a day. Proven in
Node AND in headless Chromium (TZ Asia/Calcutta) importing `test_icici.csv`:
```
Zomato 01/05/2026      -> stored date 2026-04-30
Salary NEFT 02/05/2026 -> stored date 2026-05-01
Netflix 03/05/2026     -> stored date 2026-05-02
```
Consequences for proofs: any assertion on imported dates must encode the shift
(expect `2026-04-30` for the Zomato row) until the bug is fixed; dedupe (Recipe 4)
is *unaffected* because the shifted date is used consistently on both sides of the
key. Fixing it is **ffos-import-hardening-campaign** territory — when fixed, this
block and any shifted expectations must be updated in the same commit.

**WHAT A FAILURE MEANS**: `rows read != valid + skipped` means rows are vanishing
silently (parser exception swallowed at parseCSV:5189). `valid` imported but store
count lower means dedupe fired unexpectedly (see Recipe 4) or a render error
interrupted `confirmImport` mid-way. Per-member count wrong = the 1006309 bug class:
transactions landing under the wrong member (`currentMember === 'all'` maps to
`'madhu'` — confirmImport:5232).

---

## Recipe 4 — Idempotency / dedupe check

**WHEN**: Before assuming re-importing a statement is safe (users re-download
overlapping statements constantly), and after any change near confirmImport's
duplicate handling.

**THE TRUTH (determined by reading confirmImport:5295-5299 AND executing, 2026-07-19)**:
- **Cross-import dedupe EXISTS.** `confirmImport` builds
  `existing = new Set(D.transactions.map(t => t.date+'|'+t.desc+'|'+t.amount))`
  and skips matches. Importing `test_icici.csv` twice yields **3 transactions, not 6**.
- **Intra-file dedupe DOES NOT EXIST.** The Set is snapshotted *before* the loop and
  never updated inside it — two identical rows in the *same file* both import.
  Proven: a probe CSV with the Zomato row twice imported both copies
  (`store=3, Zomato copies=2`).
- The dedupe key is `date|desc|amount` — two *genuinely different* same-day purchases
  of the same amount at the same merchant (two ₹500 Zomato orders on one day) are
  silently dropped on a later overlapping import. **Known weak point** — flagged to
  **ffos-import-hardening-campaign**.
- UI note: after "Done ✓" the Import All button stays disabled; the honest re-import
  path in a test is a page reload (which doubles as a persistence check).

**EXACT COMMANDS**: Same script as Recipe 3 (Parts B and C). Executed 2026-07-19:
```
PART B — same file, second import (after reload; store persisted)
  store survived reload: OK — 3
  import badge: "✓ Imported 0 txns · 3 duplicates skipped"
  count unchanged (3, not 6): OK — 3
PART C — duplicate rows INSIDE one file (fresh store)
  import badge: "✓ Imported 3 txns · 0 duplicates skipped"
  BOTH intra-file copies imported (no in-batch dedupe): OK — store=3, Zomato copies=2
```

**WHAT A FAILURE MEANS**: Second import adding rows (6 not 3) = the dedupe key
changed or the Set snapshot moved — every user with overlapping statements gets
double-counted spending. Second import adding *fewer than expected new* rows on a
*partially* overlapping file = key collisions eating real transactions.

---

## Recipe 5 — Migration-safety proof

**WHEN**: Before shipping ANY change to `load()`, `deepMerge`, the default `D`
shape, or a new in-load migration. This is non-negotiable #1 in executable form.

**METHOD**: Seed an OLD-shape store via Playwright `addInitScript` (runs before the
app's classic script), load the real app, read back `D`, and assert **both**
directions: (a) the new shape is present; (b) zero leaf keys/values lost — by
mechanical flatten-and-compare, not eyeballing. Then `save()` + reload to prove the
migration doesn't double-wrap its own output. Current migrations (load():51-57):
flat `D.nps` (has `tier1`) → `D.nps.madhu`; flat `D.tax` (has `gross`) → `D.tax.madhu`.

**EXACT COMMANDS**:
```bash
python3 -m http.server 7902 --directory "$(git rev-parse --show-toplevel)" &
node .claude/skills/ffos-proof-and-analysis-toolkit/scripts/verify_migration_safety.cjs
kill %1
```
For a NEW migration: copy the script, change `OLD_STORE` to the pre-migration shape
and the shape assertions to your new location. Keep the leaf-survival comparison —
it is the part that catches silent loss.

**WORKED EXAMPLE** (executed 2026-07-19) — seeded flat
`tax:{gross:1800000,s80c:150000,hra:120000,tds:150000}` and flat
`nps:{pran,tier1:1250000.5,tier2:45000}` plus 1 transaction + 1 account:
```
  D.tax migrated to per-member: OK — ["madhu"]
  D.nps migrated to per-member: OK — ["madhu"]
  tax: 4/4 leaves survive: OK
  nps: 3/3 leaves survive: OK
  transactions untouched: OK
  defaults merged in (budgets present): OK
  post-save reload: tax shape stable: OK — ["gross","s80c","hra","tds"]
MIGRATION SAFETY PROOF OK: new shape present, zero keys lost, save/load round-trip stable.
```

**WHAT A FAILURE MEANS**: Leaf lost = the migration or `deepMerge` dropped user
data — **do not ship**; there is no undo for a clobbered localStorage. Double-wrap
on reload (`D.tax.madhu.madhu`) = migration predicate matches its own output.
Remember `load()` migrates **in memory only** — localStorage keeps the old shape
until the first `save()`, so both old and new code must tolerate the old shape.
Store schema details: **ffos-data-model-and-migrations**.

---

## Recipe 6 — EMI / loan prepayment math check

**WHEN**: Touching `runPrepay` (family-finance.js:3426) or doubting its output.

**WHAT runPrepay ACTUALLY DOES** (read + executed 2026-07-19 — it is a hybrid, not
pure closed-form):
- EMI: uses stored `l.emi` if > 0; **only otherwise** computes closed-form
  `Math.round(P·r·(1+r)^n / ((1+r)^n − 1))` with `r = rate/100/12`. It never checks
  the stored EMI against the formula — a stale `l.emi` silently skews everything.
- Baseline interest: `stdInterest = emi·tenure − P` (assumes stored emi/tenure are
  mutually consistent).
- Prepay: month-by-month loop — `interest = bal·r; principal = min(bal, emi+extra−interest)`,
  capped at `tenure×3` iterations; bails if `principal <= 0`.
- `newInterest = (emi+extra)·months − P` assumes a **full final payment**, so it
  overstates interest paid by up to one payment → displayed savings are
  **conservative (understated)**. That direction is fine; the reverse would not be.

**EXACT COMMANDS**:
```bash
node .claude/skills/ffos-proof-and-analysis-toolkit/scripts/check_prepay_math.cjs
```
The script drift-guards the four arithmetic lines verbatim (exits 2 if runPrepay
changed — update the mirror before trusting it), then checks the mirror against
the closed-form formula and an exact rupee-by-rupee amortization schedule.

**WORKED EXAMPLE** (executed 2026-07-19) — ₹30,00,000 @ 8.5% p.a., 240 months:
```
Loan: P=30,00,000 · 8.5% p.a. · 240 mo · closed-form EMI = 26034.70 → code rounds to 26035
  EMI amortizes to ~tenure months: OK — simulated payoff in 240 months vs tenure 240
Extra ₹10,000/mo: closes in 127 months (vs 240) · code says interest saved ₹16,71,955
  payoff months match exact schedule: OK — 127 vs 127
  code newInterest = 1576445.00 · exact accrued interest = 1548210.09
  interest overstatement bounded by one payment: OK — overstates by 28234.91 (< 36035)
  displayed savings ₹16,71,955 vs exact savings ₹17,00,190 (display is CONSERVATIVE)
```

**WHAT A FAILURE MEANS**: Drift guard trip = runPrepay's arithmetic changed;
re-derive by hand before updating the mirror. Payoff-months mismatch = loop logic
diverged from a true amortization (off-by-one month compounds into lakhs over a
20-year loan). Savings overstated (not understated) = users making prepayment
decisions on inflated numbers — treat as a data-integrity bug.

---

## Recipe 7 — Net-worth sum-of-parts invariant

**WHEN**: Touching `calcNW` (family-finance.js:1448), adding any new asset/liability
class, or reconciling a "net worth looks wrong" report.

**THE TRUE FORMULA** (read from calcNW, 2026-07-19):
```
NW = Σ accounts.balance + Σ investments.value + Σ properties.value
   + Σ gold(weight × purity/24 × goldRate)          ← calcGoldValue, default rate 7500
   + epf.balance + Σ nps[member](tier1+tier2) + getGratuityValue()
   − Σ loans.outstanding − Σ cards.outstanding
```
Notes: calcNW is **global** — it ignores the member filter (unlike `snapshotNW`,
which filters by member for history entries). Gratuity accrual
(`basicDA × 15/26 × years`) counts as an asset.

**EXACT COMMANDS**:
```bash
python3 -m http.server 7902 --directory "$(git rev-parse --show-toplevel)" &
node .claude/skills/ffos-proof-and-analysis-toolkit/scripts/verify_networth_invariant.cjs
kill %1
```
Or on **real data**, paste this in the DevTools console — it must print `0`:
```js
calcNW() - (D.accounts.reduce((s,a)=>s+a.balance,0) + D.investments.reduce((s,i)=>s+i.value,0)
 + D.properties.reduce((s,p)=>s+p.value,0) + calcGoldValue() + D.epf.balance
 + Object.values(D.nps).reduce((s,n)=>s+(n.tier1||0)+(n.tier2||0),0) + getGratuityValue()
 - D.loans.reduce((s,l)=>s+l.outstanding,0) - D.cards.reduce((s,c)=>s+c.outstanding,0))
```

**WORKED EXAMPLE** (executed 2026-07-19) — seeded 1,00,000 acct + 2,00,000 inv +
50,00,000 prop + 68,750 gold (10g × 22/24 × 7500) + 3,00,000 EPF + 1,00,000 NPS −
20,00,000 loan − 50,000 card:
```
Expected (Node, independent): 3718750
calcNW() (browser, app code): 3718750
In-page residual one-liner  : 0
NET-WORTH INVARIANT OK: calcNW === independent sum of parts (exact integer match).
```

**WHAT A FAILURE MEANS**: A non-zero residual means calcNW and the parts list have
diverged — a term was added to one and not the other (this is exactly how a new
asset class silently vanishes from, or double-counts in, the headline number).
Update BOTH calcNW and this recipe's formula in the same commit, with the residual
check re-run as the proof.

---

## CASE STUDY — "Credit limit = 23", retold as a proof failure

**What happened (June 2026)**: The Amex PDF statement renders its limits as a
two-row table — header `Credit Limit Rs  Available Credit Limit Rs`, values on the
NEXT line `At May 23, 2026  480,000.00  318,809.32`. A regex that lazily skipped
non-digits after "Credit Limit" hit the first digit available — the **day of the
month** — and stored `limit = 23`. It shipped because the extracted value was never
cross-checked against anything, and it took FOUR commits in one day
(9ebb1ed → 71cf4a9 → b8dfc8c → c8a1144) to converge on the line-scan fix.

**The discriminating check that catches it in one commit**: an extracted credit
limit must (a) be a currency-shaped amount **≥ a sane floor (₹10,000)** — no Indian
card has a smaller limit, but every date fragment is smaller — and (b) when a
known-true value exists (you are holding the statement), **equal it**. That is a
two-line assertion. Eyeballing the parsed preview cannot catch it, because "23"
scrolls by in a wall of plausible numbers.

**The kicker (discovered by this canary, 2026-07-19)**: the c8a1144 fix is **gone
at HEAD**. Commit 3c3ee4c (Form 16 analyzer) replaced `family-finance.js` with a
lineage whose `extractCardMetadata` (now at :4452) is back to the generic weak
patterns. Executing the REAL function against the exact fragment from the bug
report reproduces the bug — and reveals `outstanding` is wrong too (the
max-decimal-number fallback at :4523 grabs the limit):
```
extractCardMetadata(amex fragment) → {"name":"American Express Card","outstanding":480000,"limit":23,"dueDate":"","minDue":24000}
  sane-floor check   (limit >= 10000): FAIL (limit=23)
  known-true check   (limit == 480000): FAIL (limit=23)
CANARY RED: the "credit limit = 23" failure mode is reproducible at HEAD.
```
Run it yourself:
```bash
node .claude/skills/ffos-proof-and-analysis-toolkit/scripts/canary_amex_limit.cjs
```
This canary is **intentionally red** until the fix is reinstated (fix shape that
worked: find the header line containing both labels, take the first `\d+\.\d{2}`
from the next line; fallback = first decimal amount ≥ 10000). Reinstating it is
campaign work — see **ffos-import-hardening-campaign**. The lesson for THIS skill:
*metadata extraction without a sane-floor + known-true cross-check is not done.*

---

## When NOT to use this skill

- **Broad browser-testing discipline** (launch patterns, screenshots, selector
  strategy, the verify_*.cjs house template) → **ffos-browser-verification**.
  Recipes 3–5 and 7 reuse its mechanics and only add the assertions.
- **Campaign-scale import hardening** (fixing the weak points these proofs expose:
  intra-file dedupe, the Amex canary, parser fuzzing across banks) →
  **ffos-import-hardening-campaign**. This skill *measures*; that one *fixes*.
- **Domain meaning** of 80C/87A/HRA/EPF/NPS/gratuity rules → **indian-finance-reference**.
  This skill proves the code matches the math; that one explains why the math is
  what it is.
- Store schema and writing migrations → **ffos-data-model-and-migrations** (Recipe 5
  here is the proof gate for what you build there).

---

## Provenance and maintenance

- Authored 2026-07-19 against commit `526c55f` (branch `main`, clean tree).
  Original investigation began 2026-07-12; **every fact and output above was
  re-executed on 2026-07-19** — nothing is carried forward unverified.
- All seven recipes and the canary were run end-to-end this date: Recipes 1, 2, 6
  and the canary in Node; Recipes 3, 4, 5, 7 in headless Chromium (Playwright
  1.60) against `python3 -m http.server 7902`. Outputs quoted are verbatim
  (trimmed for width only). The parseDate day-shift and the Amex canary regression
  were both discovered/confirmed by executing these proofs — evidence the method works.
- Scripts live in `scripts/` beside this file; all are `.cjs` (repo is
  `"type": "module"`); all exit non-zero on proof failure so they can gate commits.
- **Maintenance**: cited line numbers drift with every edit to `family-finance.js` —
  the extraction-based scripts (tax, canary) survive drift by searching for names;
  `check_prepay_math.cjs` has an explicit verbatim drift guard and will exit 2 when
  runPrepay changes (that is your cue to re-derive, not to delete the guard).
  When `canary_amex_limit.cjs` turns green, update the CASE STUDY status line.
  If a recipe's worked example ever disagrees with a fresh run, the *disagreement
  itself* is the finding — investigate before editing this file.
