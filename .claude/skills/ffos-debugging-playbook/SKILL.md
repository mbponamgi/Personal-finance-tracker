---
name: ffos-debugging-playbook
description: Symptom-to-triage playbook for Family Finance OS (index.html + family-finance.js). Load when something is BROKEN right now and you need to diagnose THIS ONE failure — import finds 0 transactions or silently does nothing, wrong amounts or flipped credit/debit, absurd card metadata (credit limit = 23), an individual member view is blank while "All" works, data disappeared or looks reset, charts blank or duplicated, a modal will not open or close, console errors or CSP violations, pdf.js worker failures, or the app will not boot at all. NOT for systematic multi-session parser hardening (→ ffos-import-hardening-campaign) or for understanding the import pipeline's architecture/BANK_CONFIGS shape (→ ffos-statement-parsing-reference).
---

# FFOS Debugging Playbook

Symptom -> first check -> discriminating experiment. All line numbers are for
`family-finance.js` (5332 lines) and `index.html` (1957 lines) **as of 2026-07-19,
HEAD `526c55f`** — re-grep the function name if lines have drifted.

## Rules before you touch anything

1. **Never break saved data.** All family data lives in ONE localStorage key,
   `family_finance_v1` (defined `family-finance.js:4`), loaded by `load()` (line 45)
   through `deepMerge()` with in-place migrations. Before experimenting on real data,
   copy the JSON out (console: `copy(localStorage.getItem('family_finance_v1'))`).
   Schema details: see sibling **ffos-data-model-and-migrations**.
2. **Verify in a real browser, not by reading code.** The app cannot run from `file://`
   (verified 2026-07-19: the ESM pdf.js import is blocked — `"Access to script at
   'file:///.../vendor/pdf.min.js' from origin 'null' has been blocked by CORS policy"`).
   Serve it:
   ```bash
   python3 -m http.server 7899 --directory /Users/mponamgi/Documents/Personal-finance-tracker
   ```
   Then drive it with Playwright (`node_modules` ships playwright 1.60.0). See sibling
   **ffos-browser-verification** for writing verify scripts.
3. **THE PORT TRAP (top cause of "my data is gone").** localStorage is **per-origin**:
   `http://localhost:7894` and `http://localhost:7895` are different origins with
   *separate, initially empty* stores. This repo's house habit is rotating ports per
   session — `.claude/settings.local.json` shows 7892, 7894, 7895, 7896, 7897 all used.
   Serving on a new port and seeing an empty app is **expected**, not data loss.
4. `npm run lint` = `eslint family-finance.js`. It is the only tooling; run it first
   whenever the whole app is dead (one syntax error kills the entire 5332-line file).

Jargon, once: **EMI** = Equated Monthly Installment (a loan's fixed monthly payment —
the app auto-detects loans from EMI-looking transactions). **PRAN** = NPS pension
account number. **D** = the single global state object; `save()` persists it,
`renderAll()` (line 1786) redraws everything. More Indian-finance terms: sibling
**indian-finance-reference**.

## Master triage table

| # | Symptom | First check | Likely causes (ranked) | Discriminating experiment | Deep dive |
|---|---------|------------|------------------------|---------------------------|-----------|
| 1 | Import finds 0 rows / does nothing | The red "Debug Info: Row 0/1/2" panel the app itself prints | Wrong bank tab; skipRows/column drift; `parse()` returning null per row (date format, empty amounts); XLS merged-cell offsets | `scripts/parse-one-row.mjs` on one failing line | §1, ffos-statement-parsing-reference |
| 2 | Wrong amounts / flipped credit-debit | Which config parsed it; sign convention of that bank | Amex negative=credit missed; `cleanAmt` clamped a negative to 0; `cr` suffix regex missed; `autoCategory` forced EMI->debit | Same harness; compare `cleanAmt` vs `cleanAmtSigned` on the raw cell | §2 |
| 3 | Card metadata absurd (limit = 23) | `extractCardMetadata` regex capture on the PDF text | Digits (a date) between "Credit Limit" label and value — pattern 2 captures them; c8a1144's line-scan fix is NOT at HEAD | Node repro in §3 (tested; reproduces 23) | §3, ffos-failure-archaeology |
| 4 | Individual member view blank, "All" works | Count items missing `member` field | Legacy pre-segregation items; a code path that forgot to stamp `member` | One-liner in §4, or `scripts/localstorage-dump.cjs` ("missing member" row) | §4 |
| 5 | Data disappeared / app looks reset | `location.origin` + does the key exist? | **New port = new origin** (see rule 3); private window; different browser/profile; exception inside `load()` (silent catch); `deepMerge` surprise | Console: `JSON.parse(localStorage.getItem('family_finance_v1'))` | §5, ffos-data-model-and-migrations |
| 6 | Charts blank or duplicated | Console for "Canvas is already in use" | Instance not destroyed before recreate; canvas hidden/`display:none`; empty `nwHistory` | §6 checklist | §6 |
| 7 | Modal won't open/close | Does the element get class `open`? | Wrong/duplicated element id; JS exception before `classList` call; inline `onclick` broken by unescaped quote | Duplicate-id audit one-liner in §7 | §7 |
| 8 | Console/CSP errors, PDF parse dead | Exact console message | External request blocked by CSP; pdf.js worker path/MIME; script order (`XLSX`/`Chart` undefined) | §8 message table | §8, ffos-env-run-deploy |
| 9 | App won't boot at all | Served over http? `npm run lint` clean? | `file://`; syntax error anywhere in the file; missing element id at init (`m-txn-date`) | §9 checklist | §9, ffos-env-run-deploy |

## §1 Import produces 0 rows or silently does nothing

Pipeline (as of 2026-07-19): file input -> `parseCSV(event)` (line 5119). PDFs branch to
`processPdfParsing()` (5013). Everything else is read as an ArrayBuffer and tried through
**SheetJS first** (`XLSX.read`, line 5134-5145 — yes, even for .csv files), falling back to
`parseCSVLine()` text splitting only if SheetJS yields no rows. Rows then go through
`BANK_CONFIGS[selectedBank].parse(row)` (configs at 4825); each `parse()` returns an object
or `null`, and **null rows are silently skipped**.

Ranked causes:

1. **Wrong bank tab.** `selectBank()` (5001) sets the global `selectedBank`; the page
   boots on `icici-salary` (init, line 5329). An Amex CSV fed through the ICICI config
   parses ~0 rows without an error.
2. **Date format miss.** Every config bails with `null` when `parseDate` fails
   (e.g. 4834). `parseDate` (4897) tries the config's listed formats only.
3. **Empty/zero amounts.** `cleanAmt` (4952) returns 0 for negatives and non-numerics;
   `debit===0 && credit===0` -> null (4836).
4. **Column offset drift.** icici-salary handles a leading blank column via
   `const o = row[0] === "" ? 1 : 0` (4831) — a second blank column defeats it.
   **icici-cc XLS merged cells**: data lands at cols 0/4/8/12, so the config reads
   `row[4] || row[1]` (desc) and `row[8] || row[2]` (amount) (4846, 4850).
5. **NPS tab on a transaction file**: the `nps` config's `parse()` is `return null`
   always (4893) — NPS import only extracts PRAN/Tier balances, never transactions.

First check — the app already tells you: on 0 parsed rows it renders
"Debug Info: Row 0 / Row 1 / Row 2" with the raw cell arrays (5198-5202), plus a summary
"N rows read · M valid · K skipped" (5208). Read that before anything else.

Discriminating experiment — run the failing line through the real `parse()` in node.
`BANK_CONFIGS` is a top-level `const`, not exported, so you have two techniques:

**Technique A (offline, tested):** `scripts/parse-one-row.mjs` in this skill contains the
helpers and all four bank `parse()` bodies copied verbatim (re-copy if the app changed):
```bash
node .claude/skills/ffos-debugging-playbook/scripts/parse-one-row.mjs \
  --bank icici-cc '05/06/2026,,,,AMAZON PAY INDIA,,,,"1,499.00",,,,12345'
```
It prints each indexed cell and the `parse()` result, and explains the three `null` exits.
(Tested 2026-07-19 against `test_icici.csv` fixture rows and merged-cell/Amex-negative
cases — all produce correct output.)

**Technique B (live app, tested):** top-level `const`s live in the global lexical scope,
so Playwright's `page.evaluate` can reach them directly:
```js
await page.evaluate(() =>
  BANK_CONFIGS['icici-salary'].parse(['1','01/05/2026','01/05/2026','','Zomato','500.00','','10500.00']));
// verified 2026-07-19 -> {date:'2026-04-30', desc:'Zomato', amount:500, type:'debit', cat:'Food & Dining'}
```

Also know: `confirmImport()` (5215) dedupes on `date+'|'+desc+'|'+amount` (5295) — a
re-import of the same file correctly reports "N duplicates skipped", which looks like
"import did nothing" but is by design. And the Import button is **never re-enabled**:
after one import it becomes "Done ✓" + `disabled = true` (5320) and no code path resets
it (verified: only `style.display` is ever touched elsewhere), so importing a second file
requires a page reload. That is a known wart, not your bug.

Origin story: the Amex import saga (9ebb1ed -> 71cf4a9 -> b8dfc8c -> c8a1144) was largely
silent-null failures like these — full story in **ffos-failure-archaeology**. For parser
anatomy see **ffos-statement-parsing-reference**; for systematic hardening (not one-off
fixes) see **ffos-import-hardening-campaign**.

## §2 Wrong amounts / flipped credit-debit / wrong dates

Sign conventions differ per bank (all verified in code 2026-07-19):

| Bank | Amount handling | Credit detection |
|------|-----------------|------------------|
| icici-salary | separate debit col `row[5+o]`, credit col `row[6+o]`, via `cleanAmt` | whichever column is non-zero |
| icici-cc | single column, `Math.abs` | `\bcr\.?\s*$` suffix on the amount, or `/payment|refund|cashback/` in desc (4852) |
| sc | credit col `row[3]`, debit col `row[4]` — note credit comes FIRST | non-zero column |
| amex | single **signed** column via `cleanAmtSigned` (4882) | **negative = payment/credit** (4885), or `/payment|refund|cashback|cr/i` in desc |

Traps:

- `cleanAmt` (4952) clamps negatives to **0** — feed a signed-amount bank through a
  two-column config and every payment row vanishes (0+0 -> null).
- Amex's desc regex `/…|cr/i` matches the substring "cr" anywhere ("Crossword",
  "Sacred…") and flips a spend to credit. Test the desc against that regex first.
- `autoCategory` (4964) has EMI-saga scar tissue: any amount within 1 of the hardcoded
  `23790` is forced to category EMI (4972), and `confirmImport` forces every
  EMI-categorized row to `type:'debit'` (5301). A credit that trips the EMI regex
  (`/emi|loan|…|ach debit|mandate/`, 4983) will be stored as a debit.
- **Dates land one day early on IST machines (live bug, verified by repro 2026-07-19).**
  `parseDate` builds a local-midnight `Date` then formats via `toISOString()` (UTC):
  on IST (UTC+5:30) `'01/05/2026'` -> `'2026-04-30'`. Consistent everywhere (dedup keys
  agree with themselves), so fix deliberately and beware stored data keeps old shifted
  dates — that is a migration decision, see **ffos-change-control** before touching it.

## §3 Card metadata absurd — the "credit limit = 23" class

`extractCardMetadata(text, bankType)` (4452) collapses the whole PDF text to one line
(`text.replace(/\s+/g,' ')`) and runs bounded regexes. The limit patterns (4483-4485):

```js
/(?:credit\s+limit|card\s+limit|credit\s+limit\s+rs)\D*?([\d,]+\.\d{2})/i,   // needs decimals
/(?:credit\s+limit|card\s+limit|limit)\D*?([\d,]+)\b/i                        // any integer!
```

`\D*?` cannot skip **over** digits. If any digits (typically a date: "May 23, 2026")
sit between the "Credit Limit" label and the actual value, pattern 1 fails and pattern 2
captures the date fragment -> `limit = 23`. **Reproduced at HEAD 2026-07-19** with:

```bash
node -e 'console.log("Credit Limit Rs May 23, 2026 6,00,000.00".match(/(?:credit\s+limit|card\s+limit|limit)\D*?([\d,]+)\b/i)[1])'
# -> 23
```

History you must know: commit c8a1144 (2026-06-14) fixed exactly this with a
line-by-line scan — find the header line containing "Credit Limit Rs", extract the first
decimal from the NEXT line, fallback = first amount >= 10000. **That fix was removed in
3c3ee4c** (the Form 16 rework replaced the Amex-specific extractor with today's generic
regexes; `grep "Available Credit Limit" family-finance.js` finds nothing at HEAD). If you
see this bug, re-apply the c8a1144 pattern (line-scan + next-line extraction + magnitude
floor) via **ffos-import-hardening-campaign** menu (e) — this is a gated
parser change (class (b), ffos-change-control), not a drive-by patch. Don't
invent a cleverer regex. Full saga: **ffos-failure-archaeology**.

Related absurd-value sources in the same function: outstanding falls back to "largest
4-6-digit decimal in the document" (4522-4527), limit falls back to hardcoded 150000
(4528), minDue is synthesized as 5% of outstanding (4529). If a user reports a weird but
plausible number, check whether it is a fallback, not an extraction.

## §4 Individual member view blank while "All" works

Members are `['madhu','sailaja','parents','charan','himaja','joint']` (line 6). Views
filter on each item's `member` field; items **without** the field match no individual
view but still show under "All". Root cause historically: pre-segregation data written
before commits 633b7d6/6e00172/1006309 lacked `member` entirely — the 1006309 lesson is
that segregation must be completed for *every* collection and *every* write path, or
individual dashboards silently blank out. (Story: **ffos-failure-archaeology**.)

First check — console one-liner (tested 2026-07-19 via the dump script's identical logic):

```js
(d=>Object.fromEntries(['accounts','cards','investments','insurance','properties','loans','gold','transactions']
  .map(k=>[k,(d[k]||[]).filter(x=>!x.member).length])))(JSON.parse(localStorage.getItem('family_finance_v1')))
```

Any non-zero count = items invisible to individual views. Then decide: legacy data (fix =
a migration in `load()`, see **ffos-data-model-and-migrations** and get sign-off per
**ffos-change-control**) vs a live write path missing the stamp (fix the code; note
`confirmImport` stamps `member: currentMember === 'all' ? 'madhu' : currentMember`, 5305 —
importing while on "All" silently assigns everything to madhu, which reads as "charan's
import went to the wrong person").

## §5 Data disappeared / app looks reset

Work this list IN ORDER — cause 1 explains most reports:

1. **Wrong origin.** New port = fresh empty store (rule 3 above). Console:
   `location.origin` — does it match where the data was created? Playwright browsers have
   their own empty profile too: a verify script seeing `null` is normal, not data loss
   (observed 2026-07-19: fresh Playwright profile -> key absent; same profile after
   `save()` + reload -> data intact).
2. **Key inspection.** `JSON.parse(localStorage.getItem('family_finance_v1'))` in the
   console, or `scripts/localstorage-dump.cjs` (prints size, per-collection counts,
   missing-member audit, txns-by-member). `null` = nothing ever saved on THIS
   origin+profile. Present-but-small = partial loss, act carefully.
3. **Private window / different browser profile.** Same as 1, different disguise.
4. **Exception mid-`load()`.** `load()` (45-60) wraps everything in `try { } catch(e) {}`
   — **silent**. Corrupt JSON or a throwing migration leaves `D` at its empty defaults
   while the stored JSON is actually intact. Check: does the raw string exist and
   `JSON.parse` cleanly in the console? If yes but the app shows empty, set a breakpoint
   in `load()`.
5. **`deepMerge` surprises.** (62-74) Arrays are NOT merged — `out[key] = source[key]`
   replaces them wholesale (correct for load, but means a partial stored object silently
   keeps defaults for missing keys). It also skips `__proto__`/`constructor`/`prototype`
   keys since 6534505.

Recovery: if the raw string exists, you have everything — copy it out BEFORE running any
code. If truly gone on that origin, check other ports/origins the family may have used
(the settings.local.json port list is your search space). Never `localStorage.clear()`
or overwrite the key during diagnosis.

## §6 Charts blank or duplicated

Five Chart.js instances: `nwChartInstance`, `assetChartInstance`, `budgetChartInstance`,
`taxChartInstance`, `invChartInstance` (lines 12-16). Verified 2026-07-19: **all five
render paths destroy before recreating** (2062, 2225, 2874-2880, 3593, 3793), so the
classic "Canvas is already in use" error means either (a) new chart code was added
without the destroy guard, or (b) an exception fired between `destroy()` and the
re-assignment, leaving a live chart with a null variable. Check the console error's stack.

Checklist:
- Console shows `Chart is not defined` -> `vendor/chart.umd.js` failed to load (§8).
- Chart area empty, no error -> canvas missing or hidden: `renderNWChart` bails silently
  if `getElementById('nwChartCanvas')` is null (2042-2043); asset chart sets the canvas
  `display:none` when there is no data (2219).
- Net-worth chart flat/empty with data present -> `D.nwHistory` is empty; it only grows
  via `snapshotNW()` on saves.
- Duplicated/ghost charts stacking on each redraw -> a destroy guard was removed; diff
  the render function against the pattern at 2062.

## §7 Modal won't open / close

Mechanics (264-270): `openModal(id)` = `document.getElementById(id).classList.add('open')`;
`closeModal(id)` removes it. CSS does the rest. So there are only four failure shapes:

1. **JS exception before the classList call** — e.g. `openModal('txnModal')` first runs
   `populateTxnModalAccounts()` (265-267); if that throws, the modal never opens. Console
   first, always.
2. **Wrong id** — `getElementById(id)` null -> TypeError in console.
3. **Duplicate ids** — `getElementById` returns the FIRST match; in a 1957-line HTML file
   collisions are a real risk: the visible modal never gets the class because its twin
   got it. Audit one-liner (tested 2026-07-19 — currently returns `[]`, i.e. clean):
   ```js
   (m=>{document.querySelectorAll('[id]').forEach(e=>m[e.id]=(m[e.id]||0)+1);
        return Object.entries(m).filter(([,c])=>c>1)})({})
   ```
4. **Broken inline handler** — buttons use inline `onclick="deleteLoan(123)"` built via
   template strings. An unescaped quote in interpolated user data (a loan name with `'`)
   truncates the attribute; the button then does nothing and the console shows a syntax
   error on click. `esc()` (108) exists for exactly this — check the template used
   escaped values. Related: ids interpolated into inline onclick arrive as **strings**;
   `deleteLoan` deliberately uses loose `==` (697-699) because strict `!==` once made
   loans undeletable (see §deleteLoan story below).

## §8 Console / CSP errors

CSP meta (index.html:6, verified):
`default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; worker-src 'self' blob:`

| Console message | Meaning | Fix direction |
|---|---|---|
| "Refused to load … because it violates … Content Security Policy" | Something references an external host (CDN, fonts.googleapis, an API) | Vendor the asset into `vendor/` — this repo is deliberately self-hosted (commits 85307b3, 6534505). Never widen the CSP without **ffos-change-control** |
| "Access to script … from origin 'null' … blocked by CORS" | You opened `file://` — ESM import cannot load | Serve over http (rule 2; exact error text captured 2026-07-19) |
| `XLSX is not defined` / `Chart is not defined` | Script order or a failed vendor load. Order (verified): `vendor/xlsx.full.min.js` (index.html:9), `vendor/chart.umd.js` (:10), pdf.js module loader (:538-543), `family-finance.js` (:1955) | Check DevTools Network for a 404 on the vendor file |
| "PDF.js failed to load from vendor/pdf.min.js (check the module script in index.html)" | `ensurePdfJS()` (4367) polled `window.pdfjsLib` for 10 s and gave up — the `<script type="module">` at index.html:538 never ran or failed | Check console for the module's own error; check `vendor/pdf.min.js` + `vendor/pdf.worker.min.js` exist and are served as JS (files use `.js` not `.mjs` deliberately, for IPFS gateway MIME) |
| Worker errors / "Setting up fake worker" | `GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js'` (index.html:542, re-defaulted in `ensurePdfJSReady` 4361) wrong or worker blocked | `worker-src 'self' blob:` allows it; verify the worker file 200s |

## §9 App won't boot at all

In order:

1. **Served over http?** `file://` cannot work (rule 2).
2. **`npm run lint`.** All logic is one classic script: a single syntax error anywhere in
   `family-finance.js` prevents EVERY function from being defined — every button dies
   with `... is not defined`. Lint catches it in seconds.
3. **Console at load.** The init block runs at top level at the file end (5327-5331):
   `load(); document.getElementById('m-txn-date').value = …; selectBank('icici-salary',
   document.querySelector('.bank-tab')); updateHideNumbersButton(); renderAll();`
   If `m-txn-date` (or the first `.bank-tab`) is missing — e.g. someone edited the HTML —
   the TypeError kills everything after it: no bank selected, nothing rendered. The boot
   canary (verified 2026-07-19): `document.getElementById('m-txn-date').value` equals
   today's date when init completed.
4. Blank page, zero console errors -> view CSS/HTML issue, not JS; check the page source
   actually served (wrong `--directory` on the server serves a directory listing or the
   wrong repo).

## The deleteLoan / EMI auto-detect story (one paragraph you need)

`syncLoansFromTxns()` (1662) auto-creates loans from EMI-looking transactions and
self-heals categories — it is why loans "appear from nowhere" and why deleted loans once
resurrected on every render. The original `deleteLoan` was
`D.loans = D.loans.filter(l => l.id !== id)`: strict `!==` against a **string** id from an
inline onclick never matched the numeric stored id (delete did nothing), and even when it
matched, auto-detect re-created the loan. Fixed in 3c3ee4c with loose `==` plus
`D.dismissedAutoLoans` tombstones keyed the same way the detector keys candidates
(697-729; verified via `git log -L :deleteLoan:family-finance.js`). The bug was originally
reproduced with a throwaway `/tmp/repro-loan-delete.mjs` (cleanup evidence in
`.claude/settings.json`). Also note `syncLoansFromTxns` carries hardcoded exclusions
(apple, "bajaj electronics", amount 24999 — lines 1683-1685, 1698, 1724) from the EMI
over-merging saga of 2026-05-17 (961e224…3d9b198); do not "clean up" these magic values
without reading **ffos-failure-archaeology** first.

## Shipped diagnostics (both tested end-to-end 2026-07-19)

- `scripts/parse-one-row.mjs` — run any bank's `parse()` on one statement line in node;
  prints indexed cells, result, and why-null hints. Tested against the `test_icici.csv`
  fixture row (debit), a credit row, an Amex negative-amount row, and an icici-cc
  merged-cell row.
- `scripts/localstorage-dump.cjs` — Playwright dump of `family_finance_v1`: origin, size,
  per-collection counts, items-missing-member audit, txns-by-member. Supports
  `--profile <dir>` (persistent context) so state survives across your own runs, and
  `--raw` to print the full JSON. Tested: fresh profile correctly reports EMPTY; after
  seeding + reload it reported 2 txns, 1 missing member — and 1 auto-created loan,
  because the seeded desc contained "EMI" (live proof of §deleteLoan behavior).

Golden fixtures at repo root: `test_icici.csv` (ICICI savings format), `mock_nps.csv`.

## When NOT to use this skill

- Writing or structuring a Playwright verify script -> **ffos-browser-verification**
- Understanding parser/format anatomy when nothing is broken -> **ffos-statement-parsing-reference**
- Schema, migrations, deepMerge semantics in depth -> **ffos-data-model-and-migrations**
- The full narrative of a past incident -> **ffos-failure-archaeology** (this playbook only carries the lesson)
- Systematic hardening of the import path -> **ffos-import-hardening-campaign**
- Deciding whether/how to make a risky change -> **ffos-change-control**
- Server setup, ports, deploy traps -> **ffos-env-run-deploy**
- Indian finance domain terms -> **indian-finance-reference**

## Provenance and maintenance

Authored 2026-07-19 against HEAD `526c55f` (working tree clean apart from `.claude/skills/`).
Every line number, function behavior, and console message above was verified on that date
by reading `family-finance.js`/`index.html`, mining git history read-only
(`git log -L :deleteLoan:family-finance.js`, `git show c8a1144`, `git log -S`), and
driving the real app: `python3 -m http.server 7899` + Playwright 1.60.0 (boot canary,
`page.evaluate` access to `BANK_CONFIGS`, live `parse()` call, duplicate-id audit -> `[]`,
fresh-profile localStorage -> null, seed/save/reload round-trip, `file://` failure capture).
The limit=23 recurrence and the IST date shift were reproduced with the exact commands
shown inline. Volatile facts to re-verify when the file changes: all line numbers; whether
3c3ee4c-era regressions (extractCardMetadata regexes, `save(); renderAll();` before the
badge in `confirmImport` 5313-5320, never-re-enabled Import button) have since been fixed;
the duplicate-id audit result; the port list in `.claude/settings.local.json`. If
`parse-one-row.mjs` disagrees with in-browser behavior, the copied code has drifted —
re-copy from `family-finance.js` and update the "as of" stamps.
