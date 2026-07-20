---
name: ffos-browser-verification
description: >
  MANDATORY pre-ship verification discipline for Family Finance OS. Load this
  skill when: about to commit ANY behavior change; asked to verify or test a
  change; writing a verify script; seeding test data into localStorage;
  simulating a statement import (CSV/XLS/PDF); testing a data migration; or
  whenever "how do I test this" comes up. Encodes the house rule: no change
  ships on "lint passes" alone — serve the app locally, drive the real UI with
  headless Playwright, and print PASS/FAIL evidence. Ships working scripts:
  smoke test, verify-script template, ICICI import regression, store dumper.
---

# FFOS Browser Verification

Family Finance OS is a zero-build vanilla-JS SPA (`index.html` + `family-finance.js`)
with all state in one localStorage key. There is no test framework and `npm test`
is a stub. **Verification here means: serve the repo, launch headless Playwright,
seed the store, drive the real UI, and assert outcomes with printed evidence.**

Owner's non-negotiables (2026-07-12, still in force — canonical statement:
`ffos-change-control`):

1. **Never break saved data.** Any change to the shape of `D` ships an
   in-place migration in `load()`, so data saved by the previous version loads
   correctly under the new one.
2. **Verify in a real browser; no change ships on "lint passes" alone.**
   Every behavior change gets a browser verification run before commit, and
   the script's printed output goes in your report.

House corollaries this skill adds on top of #2, for test hygiene specifically:
verify scripts run headless Playwright against localhost only; Playwright
launches a throwaway browser profile every time — never point any tool at a
real browser profile, and never load real bank statements or real financial
data into a test.

## Quick start

```bash
# 1. Serve the repo (ports 789x by convention). file:// DOES NOT WORK:
#    pdf.js is an ESM module and the CSP is default-src 'self'.
python3 -m http.server 7899 --directory /path/to/Personal-finance-tracker

# 2. Prove the app boots clean (run this after ANY change, before anything else):
node .claude/skills/ffos-browser-verification/scripts/smoke.cjs 7899

# 3. For a behavior change, copy the template and adapt SEED / DRIVE / ASSERT:
cp .claude/skills/ffos-browser-verification/scripts/verify-template.cjs /tmp/verify-mychange.cjs
node /tmp/verify-mychange.cjs 7899

# 4. Touched statement import? Run the golden-fixture regression:
node .claude/skills/ffos-browser-verification/scripts/verify-import-icici.cjs 7899

# 5. Kill the server when done:
lsof -ti :7899 | xargs kill
```

Playwright is a repo dependency (`playwright` in package.json). If Chromium
isn't installed: `npx playwright install chromium`. Scripts are `.cjs` because
package.json has `"type": "module"` — the house pattern is `verify_*.cjs` /
`verify-*.cjs`. Scripts resolve `require('playwright')` from the repo's
node_modules, so they must live inside the repo tree (or run with
`NODE_PATH=<repo>/node_modules`).

## What counts as evidence

Evidence is **script-printed assertions with expected vs actual values**, plus
captured console errors and page errors. Paste the real output into your report.

- PASS/FAIL lines with expected/actual on failure — yes.
- `page.on('pageerror')` and `page.on('console')` capture — yes, always. An
  uncaught exception is a FAIL even if every assertion passed.
- "The screenshot looks right" — **no**. Screenshots are supplementary only.
  Proof (verified 2026-07-19): with `#m-txn-date` removed, INIT crashes with
  `TypeError: Cannot set properties of null (setting 'value')` — yet the page
  still *looks* perfect, because the static HTML renders fine. Only the
  pageerror capture and post-INIT checks (`#import-hint` populated,
  `#lastUpdated`) catch it.
- Assert at three layers, strongest first: (1) app state — `D` /
  localStorage via `page.evaluate`; (2) DOM — rendered row counts and text;
  (3) zero console/page errors across the whole run.

## Verify-script lifecycle

1. **Write** `verify-<change>.cjs` from `scripts/verify-template.cjs`. Put
   throwaways in a scratch dir, or a git-ignored path inside the repo tree
   (with `NODE_PATH=<repo>/node_modules` if outside the repo tree) — never
   commit them.
2. **Run** it against your served copy. Iterate until honest PASS (fix the code
   or fix a wrong expectation — never weaken an assertion to pass).
3. **Paste the real output** (the PASS/FAIL block) into your report/commit
   summary.
4. **Delete** the throwaway.
5. Scripts of durable value (a new import format, a new golden fixture)
   **graduate into this skill's `scripts/` dir** — that is a change to ship via
   ffos-change-control like any other, and this SKILL.md's inventory table must
   be updated with the recorded output.

## Shipped scripts (all in `scripts/`, all take `[port]` arg or `FFOS_PORT`, default 7899)

| Script | What it does | When to run |
|---|---|---|
| `smoke.cjs` | Boots the app, asserts sidebar/logo, active view, INIT completion, `D`, `window.pdfjsLib`, vendor libs, zero console/page errors/failed requests | After every change; the minimum bar |
| `verify-template.cjs` | Annotated copy-me template: seed → navigate → click nav/chips/modals → assert D + DOM + errors. Runs green as-is | Starting point for every new verify script |
| `verify-import-icici.cjs` | Golden regression: imports `test_icici.csv` end-to-end, asserts exact transactions/account/linkage, then reloads and re-imports to assert dedupe | Any change touching parsing, import UI, categorization, or transactions |
| `dump-store.cjs` | Prints raw localStorage + live `D` after `load()`; optional seed-file arg shows what migrations do to old-shape data | Inspecting store shape; debugging migrations |

## Recipes

### Seeding data (the crucial trick)

`family-finance.js` runs `load()` **once**, at script end (INIT section,
~line 5327), reading localStorage key `family_finance_v1`. So the seed must be
in localStorage **before any page script executes**:

```js
await page.addInitScript(seed => {
  localStorage.clear();
  localStorage.setItem('family_finance_v1', JSON.stringify(seed));
  localStorage.setItem('numbers_hidden', 'false'); // see quirk below
}, SEED);
await page.goto(URL, { waitUntil: 'load' });
```

- Seeding **after** `goto` is the classic mistake: the app has already read the
  (empty) store into `D`; your seed does nothing until a reload.
- `load()` deep-merges the seed over the default `D`, so **partial seeds are
  fine** — set only the keys your test needs. Canonical full shape and seed
  data: see ffos-data-model-and-migrations, or run
  `node scripts/dump-store.cjs 7899` and read `D_after_load_and_migrations`.
- Init scripts re-run on **every navigation**. If your test reloads the page
  and needs data to survive, guard the seed with a marker key (see
  `verify-import-icici.cjs`).
- **Balances are masked by default**: `numbers_hidden` defaults to hidden and
  `fmt()` renders `₹ ••••`. Seed `numbers_hidden = 'false'` whenever you assert
  displayed amounts. Asserting `D` directly doesn't need it.

### Driving flows (real selectors, verified against index.html 2026-07-19)

Prefer real clicks over calling app functions — you're verifying the user path.

| Target | Selector / action |
|---|---|
| Navigate views | `page.click('.nav-item:has-text("Transactions")')` — nav items call `go('<id>')`; view ids: overview, accounts, cards, rewards, property, gold, investments, epf, nps, loans, insurance, budget, tax, transactions, import |
| Active view check | `page.getAttribute('.view.active', 'id')` → `'view-<id>'` |
| Member switch | `page.click('.member-chip[data-member="madhu"]')` (members: all, madhu, sailaja, parents, charan, himaja); assert via `#memberContext` text |
| Modals | Open via real buttons (e.g. `#view-accounts .btn-primary` → `openModal('accModal')`); open modal has `.modal-backdrop.open`; close via `#accModal .modal-close` |
| Import bank tabs | `page.click('.bank-tab:has-text("ICICI Salary")')` — tabs: ICICI Salary, ICICI Credit Card, Standard Chartered, American Express, NPS Statement |
| Save indicator | `#lastUpdated` — "Not yet saved" until a `save()` runs, then "Saved HH:MM" |

**Escape hatch:** app globals are callable from `page.evaluate` —
`page.evaluate(() => go('tax'))`, `openModal('taxModal')`, `renderAll()`. Use
sparingly; it skips the user path you claim to verify.

### Asserting

```js
// App state: top-level `let D` is reachable from evaluate (global lexical scope):
const txns = await page.evaluate(() => D.transactions);
// Persisted state (what save() actually wrote — null before first save()):
const store = await page.evaluate(() => JSON.parse(localStorage.getItem('family_finance_v1')));
// DOM: rendered rows
const rows = await page.locator('#txn-list .txn-row').count();
// Errors: register BEFORE goto, assert empty at the end
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', e => pageErrors.push(String(e)));
```

`D` is not a `window` property (it's a top-level `let`), so
`window.D` is undefined — but bare `D` inside `page.evaluate` works
(verified 2026-07-19).

### Simulating file uploads

```js
await page.click('.nav-item:has-text("Import Statement")');
await page.click('.bank-tab:has-text("ICICI Salary")');   // sets selectedBank
await page.setInputFiles('#csvFile', path.join(REPO_ROOT, 'test_icici.csv'));
// parseCSV uses async FileReader — wait for the preview badge, don't sleep:
await page.waitForFunction(() =>
  (document.querySelector('#parse-status-badge') || {}).textContent.includes('transactions found'));
await page.click('#importConfirmBtn');                    // confirmImport()
await page.waitForFunction(() =>
  (document.querySelector('#parse-status-badge') || {}).textContent.includes('Imported'));
```

- `#csvFile` is `display:none`; `setInputFiles` works anyway and fires the
  `change` → `parseCSV(event)`.
- **NEVER upload real bank statements.** Sanitized/fake fixtures only, and
  never commit real financial data (names, account numbers, real PRANs).
- Quirk (verified 2026-07-19): after one import, `#importConfirmBtn` stays
  disabled ("Done ✓") — nothing in the app re-enables it. To import a second
  file in one test, `page.reload()` first (localStorage persists within the
  context; mind the init-script guard).

### Testing migrations

Seed OLD-shape JSON, load, assert the new shape — `load()` runs migrations
(e.g. flat `nps: {tier1: ...}` → per-member `nps: {madhu: {...}}`; flat
`tax: {gross: ...}` → `tax: {madhu: {...}}`):

```bash
echo '{"nps": {"pran": "110022334455", "tier1": 1250000.5, "tier2": 45000}}' > /tmp/old-seed.json
node scripts/dump-store.cjs 7899 /tmp/old-seed.json
```

Verified 2026-07-19: raw localStorage keeps the flat shape (migration is
in-memory until the next `save()`), while `D_after_load_and_migrations.nps`
shows `{"madhu": {"pran": "110022334455", "tier1": 1250000.5, "tier2": 45000}}`.
In a scripted test, assert via `page.evaluate(() => D.nps.madhu.tier1)`.

## Golden fixture inventory (expected results verified by running, 2026-07-19)

Canonical expected values live in
`ffos-import-hardening-campaign/references/fixtures/` (`.expected.json` per
fixture) — if these ever disagree, that is the source of truth; re-point any
fix there first.

| Fixture | Location | Exercises | Verified expected result |
|---|---|---|---|
| `test_icici.csv` | repo root | ICICI Salary CSV parse → categorization → account auto-create → dedupe | 3 txns, member `madhu`, all linked to auto-created account `ICICI Savings` (member madhu, type savings): `2026-05-02 Netflix 199 debit Entertainment`, `2026-05-01 Salary NEFT 50000 credit Salary`, `2026-04-30 Zomato 500 debit Food & Dining` (sorted newest-first; see date quirk below). Re-import: `Imported 0 txns · 3 duplicates skipped`, account reused not recreated |
| `mock_nps.csv` | repo root | NPS statement text extraction (PRAN + tier balances) → `D.nps` update | Badge `✓ NPS Data Extracted`; after Import All: `D.nps.madhu = {pran:"110022334455", tier1:1250000.5, tier2:45000, fyContrib:0, monthly:0, equityPct:75}` (goes to `madhu` when member filter is `all`) |

**Date quirk (load-bearing, verified 2026-07-19):** `parseDate()` builds a
local-midnight `Date` and calls `.toISOString()`, so stored dates shift back
one day in UTC+ timezones: in Asia/Kolkata, `01/05/2026` is stored as
`2026-04-30`. This is the app's real persisted behavior. All shipped scripts
pin `timezoneId: 'Asia/Kolkata'` on the browser context so expected values are
deterministic on any machine — do the same in yours, and derive expectations
for that timezone. (Full mechanism and incident history: `ffos-debugging-playbook`
§2, `ffos-failure-archaeology` Incident 6.)

**Rule for adding fixtures:** sanitized/fake data only — invented merchants,
round numbers, fake 12-digit PRANs, no real names/account numbers. A new
fixture graduates via ffos-change-control together with a verify script that
encodes its expected results, and gets a row in this table with recorded output.

## Failure interpretation (real captured signatures, 2026-07-19)

- **CSP violation** — console errors like:
  `Connecting to 'https://example.com/x' violates the following Content
  Security Policy directive: "connect-src 'self'". The action has been blocked.`
  / `Fetch API cannot load ... Refused to connect because it violates the
  document's Content Security Policy.`
  Means the change introduced an external request (CDN script, remote font,
  fetch). The app is strictly self-hosted — vendor the asset instead.
- **INIT crash (missing element)** — pageerror
  `TypeError: Cannot set properties of null (setting 'value')` (or
  `Cannot read properties of null`), with **empty console.error** — you only
  see it via `page.on('pageerror')`. INIT runs
  `load(); (set #m-txn-date); selectBank('icici-salary',...); updateHideNumbersButton(); renderAll();`
  — everything after the throw is dead: `#import-hint` keeps its static text
  ("Select a bank above, then upload" instead of the ICICI hint), views won't
  render data, yet the page looks normal. Usual cause: an element id was
  renamed/removed in index.html while family-finance.js still references it.
- **Timeouts** — `waitForFunction`/`waitForSelector` timing out usually means
  the state you're waiting for never happened, not slowness: waiting for
  `#lastUpdated` to say "Saved" times out if `save()` never ran; waiting for
  "transactions found" times out if the parser rejected every row (check
  `#parse-status-badge` — the app prints a red debug block with the first rows)
  or if you forgot to select the right bank tab first. On timeout, print the
  current text of the awaited element before failing.
- **`page.goto` fails / ERR_CONNECTION_REFUSED** — server not running. Start:
  `python3 -m http.server <port> --directory <repo-root>`. If assets 404, you
  served the wrong directory (must be the repo root).

## Recorded outputs of shipped scripts (run 2026-07-19, server on :7899)

`smoke.cjs`:

```
PASS  sidebar logo rendered
PASS  default active view is overview
PASS  INIT completed (selectBank ran)
PASS  store D initialised
PASS  window.pdfjsLib loaded (ESM ok)
PASS  vendor XLSX + Chart loaded
PASS  no console errors
PASS  no page errors (uncaught exceptions)
PASS  no failed requests

PASS: 9/9 checks passed (http://localhost:7899/index.html)
```

`verify-template.cjs`:

```
PASS  seed reached D before INIT
PASS  nav click switched view
PASS  member chip updates context
PASS  modal opens
PASS  modal closes
PASS  D holds seeded transaction
PASS  transactions view renders 1 row
PASS  rendered amount unmasked and formatted
PASS  no console errors
PASS  no page errors

PASS: 10/10 checks passed (http://localhost:7899/index.html)
```

`verify-import-icici.cjs`:

```
PASS  preview found 3 transactions
PASS  import reported 3 added, 0 dupes
PASS  store has exactly 3 transactions
PASS  txn[0] Netflix
PASS  txn[1] Salary NEFT
PASS  txn[2] Zomato
PASS  auto-created 1 account
PASS  account is ICICI Savings / madhu / savings
PASS  all txns linked to that account
PASS  transactions view renders 3 rows
PASS  re-import skipped all as duplicates
PASS  still exactly 3 transactions
PASS  still exactly 1 account (reused, not recreated)
PASS  no console errors
PASS  no page errors

PASS: 15/15 checks passed (http://localhost:7899/index.html)
```

`dump-store.cjs` (with old-shape NPS seed; excerpt):

```
raw localStorage nps: {"pran": "110022334455", "tier1": 1250000.5, "tier2": 45000}
D.nps after load(): {"madhu": {"pran": "110022334455", "tier1": 1250000.5, "tier2": 45000}}
```

## When NOT to use this skill

- **Server/env setup details** (ports policy, IPFS deploy, serving options,
  how the app is run day-to-day) → **ffos-env-run-deploy**. This skill only
  needs "http.server on 789x, kill it after".
- **What to verify for each class of change** (which flows a parser change vs
  a render change vs a data-model change must exercise, and ship gates) →
  **ffos-change-control**. This skill is the *how*; that one is the *what*.
- **Proof-grade validation math** (recomputing tax/interest/XIRR numbers the
  app displays, cross-checking financial correctness) →
  **ffos-proof-and-analysis-toolkit**. Browser verification proves the app
  *behaves* as coded; it doesn't prove the finance math is right.
- **Store shape / canonical seed data / migration catalog** →
  **ffos-data-model-and-migrations**.
- **Diagnosing a bug you can already reproduce** → **ffos-debugging-playbook**
  (though verify scripts make excellent repro harnesses).

## Provenance and maintenance

All selectors, function names, flows, fixture expectations, and failure
signatures above were read from `index.html` / `family-finance.js` and verified
live against headless Chromium (Playwright 1.60.0) on 2026-07-19; volatile line
numbers (INIT ~5327) are as of that date. Re-verify with one command:
`python3 -m http.server 7899 --directory <repo-root> &` then
`node .claude/skills/ffos-browser-verification/scripts/smoke.cjs 7899` —
if it prints 9/9 PASS, this skill's ground truth still holds; if not, fix the
skill before trusting it.
