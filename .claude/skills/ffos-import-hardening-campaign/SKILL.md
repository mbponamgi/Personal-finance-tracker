---
name: ffos-import-hardening-campaign
description: >
  Executable, decision-gated campaign to harden Family Finance OS statement
  import — the repo's #1 live problem (owner, 2026-07-12). Load this when:
  asked to fix or harden statement import "properly"/robustly across sessions;
  import bugs keep recurring (ICICI drift, Amex metadata, silent 0-row imports,
  EMI misdetection) and need a regression suite, not a one-off patch;
  building an import regression/test suite or golden fixtures; adding a new
  bank/parser; or planning multi-session work on BANK_CONFIGS, parseCSV,
  parseDate, confirmImport, or the PDF branch. Contains a real-browser
  fixture harness (scripts/) with measured baseline numbers. NOT for diagnosing
  ONE specific broken import right now — load ffos-debugging-playbook for that
  (this skill is the systematic/multi-session gate, not first-response triage).
---

# FFOS Import Hardening Campaign

You are executing a multi-session campaign against statement-parsing
fragility in `/Users/mponamgi/Documents/Personal-finance-tracker`
(single-page vanilla-JS app: `index.html` + `family-finance.js`, all data in
localStorage key `family_finance_v1`). The git history shows why this
campaign exists: 5 ICICI format-drift commits (0d5d8d5, 55c3e72, 7e52a70,
990960d, 9c19361), a 4-commit same-day Amex firefight (9ebb1ed → 71cf4a9 →
b8dfc8c → c8a1144, the "credit limit = 23" bug), parseCSV debug patches
(e56ced3, faccc7c), and a ~10-commit EMI-heuristic whack-a-mole whose
hardcoded exclusions are still in the code. Every one of those fires burned
because there was **no regression harness**. This skill ships one.

**Campaign success metric (measurable, never judged by eye):**

1. Every supported bank has sanitized fixtures + expected-output JSON in
   `references/fixtures/`.
2. `run_fixture_suite.cjs` is green in one command, and `--selfcheck`
   proves the differ catches an intentional mutation.
3. For any import, every input row is accounted for as
   imported / rejected-with-reason / header-skipped — zero silent drops.
4. A renamed/added bank column produces a **named drift warning**, not a
   silent 0-row import.

## When NOT to use this skill

- One specific import bug to diagnose right now → `ffos-debugging-playbook`.
- You just need to understand how the pipeline works → 
  `ffos-statement-parsing-reference`.
- Verify-script mechanics (Playwright patterns, selectors, server setup)
  → `ffos-browser-verification`; this skill only adds the campaign-specific
  runners.
- Balance-continuity math and proof tooling → `ffos-proof-and-analysis-toolkit`.
- Anything touching the shape of `D` → read `ffos-data-model-and-migrations`
  first, and **every** behavior change routes through `ffos-change-control`.

## Non-negotiables (owner, 2026-07-12 — no exceptions)

1. **NEVER break saved data.** Schema changes ship migrations in `load()`
   (`family-finance.js` line ~45). Import code writes the family's real
   books; a bad parse silently corrupts them.
2. **VERIFY IN REAL BROWSER.** `file://` fails (ESM + CSP). Serve with
   `python3 -m http.server <port> --directory <repo-root>` and drive the real
   UI with Playwright. Lint alone never counts as verification.

No phase below may route around `ffos-change-control` gating. The harness in
this skill is the *evidence generator* for those gates, not a replacement.

## Pipeline map (orient before touching anything)

All in `family-finance.js` (line numbers at commit 526c55f, 2026-07-19 —
re-grep if the file changed):

- `selectBank()` 5001 → `parseCSV(event)` 5119. **Quirk:** even `.csv` files
  go through SheetJS first (`XLSX.read`, 5134-5145); `parseCSVLine` (4989)
  is only the fallback when XLSX yields 0 rows.
- Per-row: `BANK_CONFIGS[bank].parse(row)` 4825 — banks `icici-salary`,
  `icici-cc`, `sc`, `amex`, `nps` (nps `parse()` always returns null; NPS is
  a dedicated branch at 5152).
- Helpers: `parseDate` 4897, `cleanAmt`/`cleanAmtSigned` 4952/4958,
  `autoCategory` 4964.
- `confirmImport()` 5215 → dedupe by `date|desc|amount` key (5295), forces
  `cat==='EMI'` → type debit (5301), unshifts into `D.transactions`,
  upserts accounts/cards, `save(); renderAll()` →
  `syncLoansFromTxns()` (1662, EMI auto-detection with hardcoded
  ₹23790/₹24999/"bajaj electronics"/"apple" exclusions).
- PDF branch: `processPdfParsing` 5013 → `reconstructTextWithCoordinates`
  4386 → `parseBankStatementPdf` 4584 / `extractCardMetadata` 4452 /
  `extractNpsBalances` 4534.

---

# PHASE 0 — BASELINE

Establish that the environment and pipeline behave exactly as measured on
**2026-07-19**. Run this at the START of every campaign session — it is your
"has anything drifted since last session?" check.

```bash
cd /Users/mponamgi/Documents/Personal-finance-tracker
python3 -m http.server 7901 --directory "$PWD" &   # note the PID; kill it when done
node .claude/skills/ffos-import-hardening-campaign/scripts/phase0_baseline.cjs
```

- Port busy → `lsof -ti tcp:7901` and either reuse that server (if it serves
  this repo) or pick another port and pass `PORT=<n>` to the script.
- `Executable doesn't exist` from Playwright → `npx playwright install chromium`
  (repo has playwright 1.60.0 as a dependency).
- Page fails to load / `go is not defined` → environment problem, branch to
  `ffos-env-run-deploy`.

The script pins the browser timezone to `Asia/Kolkata` — **required**:
`parseDate` serializes local-midnight Dates via `toISOString()` (UTC), so
results are timezone-dependent (see Defect A below).

## Expected output (measured 2026-07-19, clean localStorage)

**Probe 1 — golden `test_icici.csv` (repo root, 3 data rows):**

- Preview badge: `✓ 3 transactions found`
- Summary: `File: test_icici.csv · 3 rows read · 3 valid · 0 skipped`
- After Import All: badge `✓ Imported 3 txns · 0 duplicates skipped`
- `D.transactions` (exact, in stored order — note dates are one day EARLIER
  than the statement; that is Defect A, currently baseline behavior):

| date | desc | amount | type | cat | member | account |
|---|---|---|---|---|---|---|
| 2026-05-02 | Netflix | 199 | debit | Entertainment | madhu | ICICI Savings |
| 2026-05-01 | Salary NEFT | 50000 | credit | Salary | madhu | ICICI Savings |
| 2026-04-30 | Zomato | 500 | debit | Food & Dining | madhu | ICICI Savings |

- Exactly 1 account auto-created: `{name:"ICICI Savings", member:"madhu",
  type:"savings", balance:0}`. 0 loans auto-detected.

**Probe 2 — malformed ICICI file (bad-date row + zero-amount row + 2 good):**
badge `✓ 2 transactions found`; summary `4 rows read · 2 valid · 2 skipped`.
The two dead rows produce **no reason anywhere** — counted only.

**Probe 3 — wrong-format file (Amex-shaped CSV while ICICI tab selected):**
red badge `✗ No transactions parsed.` + `Debug Info:` echoing raw rows 0-2;
summary `1 rows read · 0 valid · 1 skipped`; **the "Import All" button is
still visible** (clicking it is a silent no-op — `confirmImport` returns
early on empty `parsedRows`).

## GATE 0

You should see exactly the numbers above.

- **Fewer rows / page errors / blank page** → the environment is broken;
  branch to `ffos-env-run-deploy`. Do not proceed.
- **Values differ** (different dates, categories, counts) → STOP. The
  pipeline changed since 2026-07-19. Re-derive the baseline: read the diff
  (`git log -p family-finance.js`), re-run the probe, and update this
  skill's baseline section (and `references/fixtures/*.expected.json` via
  the `--record` protocol in Phase 1) as a change-controlled edit.
- **Match** → proceed.

## Known live defects at baseline (campaign targets, NOT yet fixed)

These are measured/verified facts as of 2026-07-19. They are the campaign's
work queue; every fix routes through `ffos-change-control`.

**A. IST off-by-one-day date bug (live, systemic).** `parseDate` builds
`new Date(y, m-1, d)` (local midnight) then returns
`dt.toISOString().split('T')[0]`. Local midnight IST = 18:30 UTC the
*previous* day, so **every numeric DD/MM date imports one day early** in the
owner's timezone (verified: `new Date(2026,4,1).toISOString()` →
`2026-04-30T18:30:00.000Z`; all five banks' fixtures show the shift).
Manual transaction entry uses the date-input string directly, so imported
and manual entries disagree by a day. Fixing it changes every fixture's
expected dates (+1 day) — use the `--record` promotion protocol — and
raises an owner-sign-off question: whether to migrate already-stored
shifted dates (data migration → `ffos-data-model-and-migrations`). (Full
mechanism and incident history: `ffos-debugging-playbook` §2,
`ffos-failure-archaeology` Incident 6.)

**B. Commit 3c3ee4c clobbered the c8a1144 Amex fixes (regression at HEAD).**
Verified by diffing `git show c8a1144:family-finance.js` against HEAD:

- The entire Amex PDF transaction branch of `parseBankStatementPdf`
  (~64 lines: `MMM D` date regex, year inference, section skip-list) is
  **gone** — Amex PDF transaction import has regressed to broken.
- `extractCardMetadata` (4452) is back to collapsed-text regexes
  (`text.replace(/\s+/g,' ')` + `/(?:credit\s+limit...)\D*?([\d,]+\.\d{2})/`)
  — the exact "credit limit = 23" bug class c8a1144's line-scan fixed.
- `confirmImport` again calls `save(); renderAll();` BEFORE updating the
  status badge (5313-5318) — the silent-import-failure ordering c8a1144
  fixed ("a render error hides Done ✓"), and `snapshotNW()` was dropped
  from the transaction-import path.

Recovery reference: `git show c8a1144:family-finance.js` (function bodies at
lines ~4095+ in that revision). Restoring these behaviors — now protected by
the Phase 1 harness — is the campaign's first fix candidate.

**C. Dead instrumentation.** `firstFailed` in `parseCSV` (5177, 5187, 5190)
is write-only — captured for every dropped row, displayed nowhere.

**D. Zero-row imports leave a live no-op "Import All" button** (Probe 3).

**E. Personal-data warts in shared code paths:** hardcoded ₹23790 → EMI in
`autoCategory` (4972) and `syncLoansFromTxns` (1657/1736); ₹24999, "apple",
"bajaj electronics" exclusions (1684, 1698, 1724, 4970). Fence: never add
more of these (see Fenced Wrong Paths).

---

# PHASE 1 — REGRESSION HARNESS (shipped; keep it green)

The harness lives in this skill and already passes. It drives the REAL UI
per fixture from a clean localStorage, imports, and byte-exact-diffs the
resulting store against `<case>.expected.json`.

```bash
# server on 7901 already running (Phase 0)
node .claude/skills/ffos-import-hardening-campaign/scripts/run_fixture_suite.cjs --selfcheck
```

Expected output (measured 2026-07-19):

```
bank         | fixture           | rows in | imported     | expected     | result
-------------|-------------------|---------|--------------|--------------|------
amex         | basic.csv         | 3       | 3            | 3            | PASS
icici-cc     | basic.csv         | 3       | 3            | 3            | PASS
icici-salary | basic.csv         | 3       | 3            | 3            | PASS
icici-salary | malformed.csv     | 4       | 2            | 2            | PASS
nps          | basic.csv         | -       | nps-balances | nps-balances | PASS
sc           | basic.csv         | 3       | 3            | 3            | PASS
(selfcheck)  | mutated basic.csv | 3       | 3            | must FAIL    | PASS (mutation caught)

SUITE GREEN
```

Exit code 0 iff green. If a fixture FAILs, the runner prints the first
diverging line of the expected-vs-actual JSON.

**Fixture rules (hard lines):**

- Fixtures are **sanitized/fake only**. NEVER copy a real bank statement —
  not one row, not one merchant string that identifies the family. If you
  need to reproduce a real-statement bug, re-type an equivalent fake row.
- One directory per bank id under `references/fixtures/` (dir name must be
  the `BANK_CONFIGS` key). `<case>.csv` + `<case>.expected.json` pairs.
- `--record` regenerates expected files from ACTUAL behavior. It is a
  promotion tool, not a fix tool: run it only when a behavior change was
  approved via `ffos-change-control`, then review the `git diff` of every
  expected file line-by-line before committing.

**Gates:**

- Before ANY parser change: suite must be green (baseline intact).
- After ANY parser change: suite re-run; intentional changes promoted via
  `--record` + diff review; unintentional diffs are regressions — fix or
  revert. This is the promotion requirement; no exceptions.
- When you fix a bug: FIRST add a fixture that fails (reproduces it), THEN
  fix, THEN show the suite green. A fix without a fixture is fenced.

**Coverage debt (state at 2026-07-19):** each bank has a happy-path fixture;
only icici-salary has a malformed-row fixture. Phase 3(a) closes this.

---

# PHASE 2 — ACCOUNTING FOR EVERY ROW

Goal: for any input file, classify every row as **imported /
rejected(reason) / header-skipped**. First instrument understanding; code
changes come via the Phase 3 menu.

Where rows die today (enumerated from HEAD, 2026-07-19 — re-verify line
numbers before citing):

**Pre-parse (parseCSV 5119-5150):** XLSX empty-row filter (5141); blank-line
filter in the CSV fallback (5148); `skipRows` header skip (5180, counted as
header).

**Per-bank `parse()` null returns:**

| bank | null condition | line |
|---|---|---|
| icici-salary | date unparseable in all 3 formats | 4834 |
| icici-salary | debit===0 && credit===0 (cleanAmt maps negative/NaN → 0!) | 4836 |
| icici-cc | empty desc (`row[4] || row[1]`) | 4847 |
| icici-cc | date unparseable | 4849 |
| icici-cc | empty amount string (`row[8] || row[2]`) | 4851 |
| icici-cc | amount falsy/NaN/0 | 4854 |
| sc | `!row[1]` (no description) | 4864 |
| sc | date unparseable | 4866 |
| sc | deposit and withdrawal both 0 | 4868 |
| amex | empty desc (`row[1] || row[4]`) | 4879 |
| amex | date unparseable | 4881 |
| amex | signed amount === 0 | 4883 |
| nps | `parse()` unconditionally null (real path is the NPS branch, 5152) | 4893 |

**Silent swallow points:** the per-row `catch(ex)` (5189-5191) hides parser
exceptions entirely; `firstFailed` (Defect C) is captured but never shown;
`confirmImport` dedupe (5295-5299) drops `date|desc|amount` duplicates —
counted in the badge, but legitimately distinct same-day same-amount
same-desc transactions are silently merged.

Deliverable of this phase: when proposing any Phase 3 item, you can state
for a given fixture exactly which rows die at which condition above, and the
suite's `rows in / imported` columns corroborate it.

---

# PHASE 3 — SOLUTION MENU (ranked)

Work top-down; each item is independently shippable and independently
gated. For each: theory obligation → implement → acceptance test → Phase 4
promotion. Never batch multiple menu items into one commit.

**(a) Complete the golden-fixture suite per bank.** *Effort: low. Risk:
none (no app change).* Obligation: every null-return branch in the Phase 2
table is exercised by at least one fixture row; every `autoCategory` family
of the fixtures' merchants is asserted. Acceptance: suite green AND
`--selfcheck` mutation caught (already demonstrated 2026-07-19); breaking
any single `parse()` branch by hand must turn the suite red.

**(b) Row-level reject-reason surfacing in the import preview.** *Effort:
medium. Risk: low-medium (UI + parseCSV change → change control + Playwright
UI verification).* Replace the dead `firstFailed` with a per-row rejection
list: each dropped row records `{rowIndex, reason}` (reasons = the Phase 2
table conditions, plus "exception: <msg>"). Preview shows them; summary
becomes `N rows read · V imported · K rejected (reasons shown) · H header`.
Acceptance (measured, not eyeballed): importing
`icici-salary/malformed.csv` shows exactly 2 reasons ("unparseable date",
"no debit or credit amount"); Probe 3 file shows a reason per row and hides
or disables Import All when 0 valid rows.

**(c) Balance-continuity validation** for banks exposing a running balance
(icici-salary `Balance(INR)` col 7; sc `Running Balance` col 5). *Effort:
medium. Risk: low (warning-only first — do not block import without owner
sign-off).* Theory obligation (see `ffos-proof-and-analysis-toolkit`):
for consecutive rows, `balance[i] == balance[i-1] ± amount[i]` (sign by
debit/credit; first row unchecked). The icici-salary basic fixture already
satisfies it: 10500 → 60500 (=10500+50000) → 60301 (=60500−199).
Acceptance: a new fixture with one deliberately inconsistent balance row is
flagged (named row + expected-vs-actual balance) while consistent fixtures
import warning-free. Note: continuity math must use statement-row order,
which survives Defect A (dates shift uniformly).

**(d) Header-fingerprint drift detection.** *Effort: low-medium. Risk:
low.* Store an expected header signature per bank (normalized column names
from the real formats — the `hint` strings at 4828/4842/4861/4874 are the
starting point). On import, compare row 0; on mismatch, warn naming the
changed/missing/extra columns BEFORE showing "0 transactions". Acceptance:
a fixture with one renamed column (e.g. `Withdrawal Amount(INR)` →
`Debit Amount(INR)`) triggers a warning naming exactly that column; the
five ICICI drift commits are the incident record this prevents.

**(e) PDF metadata extraction hardening.** *Effort: medium-high (PDF text
fixtures are harder; drive `extractCardMetadata` via `page.evaluate` with
captured-then-sanitized text blocks). Risk: medium.* Restore the c8a1144
line-scan approach (find the header line, take values from the NEXT line)
for Amex limit/outstanding, and re-instate the Amex `parseBankStatementPdf`
branch (Defect B). **Fenced obligation: any metadata regex must be anchored
to a single line — never run `\D*?` or `.*?` captures across collapsed
whole-document text.** Acceptance: a sanitized text fixture containing
`"...May 23, ... Credit Limit Rs Available Credit Limit Rs"` header with
values on the following line yields the real limit, not 23; suite +
Playwright UI verification green.

Priority note: Defect B recovery (via (e) and the confirmImport ordering
fix) and Defect A (date bug) are the highest-value fixes, but (a) and (b)
come first because they are the safety net the fixes will be judged by.

---

# PHASE 4 — VALIDATION & PROMOTION PROTOCOL

Every adopted change, in order, no skipping:

1. **Suite green before** (`run_fixture_suite.cjs --selfcheck`).
2. **New fixtures first** — a failing fixture (or expected-JSON change via
   `--record`) that captures the new intended behavior, reviewed
   line-by-line.
3. **Implement** the change (smallest coherent diff; one menu item per
   commit).
4. **Suite green after**, including selfcheck.
5. **Playwright UI verification** for any UI-visible change
   (→ `ffos-browser-verification` for mechanics): drive the real import
   page, assert the exact badge/summary/preview strings.
6. **`ffos-change-control` checklist**: classify the change (parser / UI /
   schema); schema-touching changes ship a `load()` migration and get
   owner sign-off where required (e.g. migrating already-shifted dates
   under Defect A).
7. **Commit** with a root-cause body (`ffos-docs-and-commits` style —
   c8a1144's message is the house example), including the suite table
   output in the body or verification notes.

Session hygiene: kill your http server when done
(`lsof -ti tcp:7901 | xargs kill`). Multi-session resumption = re-run
Phase 0 + Phase 1 first; GATE 0 decides whether you may continue.

---

# FENCED WRONG PATHS (each fence has a scar behind it)

- **Multi-line / collapsed-text greedy regex for PDF metadata.** Incident:
  "credit limit = 23" — `Credit Limit Rs...\D*?` stopped at the "2" in
  "May 23," (fixed in c8a1144, regressed by 3c3ee4c). Anchor every metadata
  regex to a single line.
- **Fix-by-adding-merchant-exclusion.** Incident: the EMI saga (~10 commits)
  left `₹23790`, `₹24999`, "apple", "bajaj electronics" hardcodes in shared
  code. These are personal-data warts — never generalize the pattern, never
  add a new one. If a heuristic misfires, surface it for user decision
  (menu (b)) instead of encoding the family's shopping history.
- **Adding a date format blindly, without a fixture.** Incident class: the
  five ICICI drift commits — each "supported the new format" untested and
  broke later. Any `parseDate` format addition ships with a fixture whose
  expected JSON proves the exact stored date (Defect A makes guessed dates
  wrong by one day — measure, don't assume).
- **Catch-and-continue that hides row loss.** Incident: the e56ced3-era
  debug patches exist because rows vanished with no trace; the `catch(ex)`
  at 5189 and dead `firstFailed` are the residue. Never add another silent
  swallow; every drop gets a reason (Phase 2/menu (b)).
- **"Rewrite the import pipeline" big-bang.** Violates the incremental
  gates: no rewrite can pass Phase 4 step 2 (fixtures first) in one hop,
  and a rewrite of the code that writes `D.transactions` is an uncontrolled
  risk to non-negotiable 1. Menu items only, one at a time.
- **Committing real bank statements as fixtures.** Privacy hard line. The
  repo is the family's financial identity; fixtures are fake by
  construction (see Phase 1 fixture rules).
- **Trusting `npm test` or lint as verification.** `npm test` is a stub;
  only the real-browser suite counts (non-negotiable 2).

---

# Files shipped with this skill

- `scripts/phase0_baseline.cjs` — Phase 0 probe (3 probes, JSON output;
  TZ pinned Asia/Kolkata). Run against a live server, default port 7901.
- `scripts/run_fixture_suite.cjs` — Phase 1 runner; flags `--record`
  (promotion) and `--selfcheck` (mutation test). Exit 0 iff green.
- `references/fixtures/<bank>/<case>.csv|.expected.json` — sanitized golden
  fixtures: icici-salary (basic + malformed), icici-cc, sc, amex, nps.

# Provenance and maintenance

- Authored 2026-07-19 against commit 526c55f (branch main, clean tree).
  All "expected" numbers, table outputs, and line numbers in this file come
  from actual execution on that date: Playwright 1.60.0 + chromium-1223,
  server `python3 -m http.server 7901`, browser timezone pinned to
  Asia/Kolkata (machine local TZ was also IST; the pin makes results
  machine-independent).
- Defect B evidence derives from `git diff c8a1144 3c3ee4c -- family-finance.js`
  and `git show c8a1144:family-finance.js`, executed 2026-07-19.
- Owner directives (two non-negotiables, campaign priority) dated 2026-07-12.
- Maintenance: if GATE 0 fails on values (pipeline changed), update the
  Phase 0 tables, re-record fixtures via the `--record` protocol, and
  refresh cited line numbers (`grep -n` the function names). If a bank is
  added to `BANK_CONFIGS`, add its label to `BANK_LABELS` in
  `run_fixture_suite.cjs`, a fixture directory, and a Phase 2 null-condition
  row. When Defect A or B is fixed, move it from "Known live defects" to a
  dated "Resolved" note and update every affected expected JSON in the same
  change-controlled commit.
