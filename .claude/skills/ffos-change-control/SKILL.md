---
name: ffos-change-control
description: >
  Change-control doctrine for the Family Finance OS repo. Load this BEFORE
  committing any change; when classifying a change (schema / parser / UI /
  tax-math / security / vendor / docs) to know which gates it must pass; when
  unsure whether a change needs a localStorage migration or a real-browser
  Playwright verification; when deciding if a change needs explicit owner
  sign-off (deleting D fields, loosening CSP, vendor upgrades, anything
  sending data off-device); or when reverting or rolling back a commit. This
  skill gates whether a change may commit; writing the commit message itself
  → ffos-docs-and-commits.
---

# FFOS Change Control

This repo runs a real Indian family's finances. Every byte of their data lives
in ONE browser localStorage key (`family_finance_v1`, read/written by the
global store `D` in `family-finance.js`). There is no backend, no backup, no
undo. A bad commit does not break a staging environment — it corrupts the
family's actual books the next time they open the page.

This skill tells you **what class your change is, which gates it must pass
before commit, and what needs the owner's explicit sign-off**. It does not
teach migration mechanics (→ `ffos-data-model-and-migrations`) or how to write
the Playwright verification (→ `ffos-browser-verification`).

## The two non-negotiables

These come from the owner directly (2026-07-12). No exceptions, no "it's a
tiny change".

### 1. NEVER break saved data

Any change that touches the shape of `D` (adds, renames, removes, or
repurposes a field; changes what a field means) **must ship an in-place
migration inside `load()`** in `family-finance.js`, so that data saved by the
previous version loads correctly under the new one.

**Why — the member-segregation incident (2026-06-13/14).** Per-member
filtering (`filterByMember()`) existed, but items already sitting in the
family's localStorage had been saved with no `member` field — so when
dashboards started filtering by member, `filterByMember()` returned nothing
and individual dashboards went blank. Real data looked *deleted*. It took
three commits over two days (`633b7d6`, `6e00172`, `1006309`) to fix at the
time; `1006309` names the root cause ("items loaded from localStorage had no
member field") and shipped a migration in `load()` that stamped
`member: 'madhu'` onto every legacy item across all data arrays.

**WARNING (as of 2026-07-20): that fix is no longer in the code.** The
`1006309` stamping migration was silently removed by the `3c3ee4c` rollback
("the Great Rollback", 2026-06-15 — canonical account:
`ffos-failure-archaeology` Incident 1). At HEAD, `load()` contains ONLY the
`D.nps` re-nesting and flat-`D.tax` migrations — verify with
`sed -n '45,60p' family-finance.js`. Legacy member-less items are NOT
currently protected: they would be invisible in individual member views
today. `git show 1006309` shows what the fix looked like, not what HEAD does
— a fix commit in `git log` does not mean the fix is in HEAD.

The rule generalizes: **your dev localStorage is fresh; the family's is not.**
New code always meets old data. If old data can hit a code path that assumes
the new shape, you need a migration. When unsure how, load
`ffos-data-model-and-migrations`.

### 2. VERIFY IN A REAL BROWSER

No change ships on "lint passes" alone. Lint cannot see a broken render, a
regex that captures the wrong group, or a `save()` that never fires.

**Why — the Amex import saga (2026-06-14).** Four successive commits in one
day (`9ebb1ed` → `71cf4a9` → `b8dfc8c` → `c8a1144`) each "fixed" Amex import,
and each shipped with remaining bugs because failures were **silent**: the
regex `Credit Limit Rs\s+Available Credit Limit Rs[^0-9]*` stopped at the
first digit it met — the "2" in "May 23," — and stored a credit limit of
**₹23**; and because `renderAll()` was called before the status badge was
updated, any render error left the user staring at a frozen "Import All"
button with no feedback even though data had saved. None of this is visible
to eslint. All of it is visible to a Playwright script that drives the real
UI and asserts the outcome. `git show c8a1144` shows the fix as written.

**NOTE (as of 2026-07-20): `c8a1144`'s fixes were reverted by the `3c3ee4c`
rollback and are absent at HEAD — the credit-limit-₹23 bug is live and
reproducible today** (canary: `ffos-proof-and-analysis-toolkit`; recovery
path: `ffos-import-hardening-campaign` Defect B; story:
`ffos-failure-archaeology`). The saga still stands as the reason browser
verification is mandatory.

House discipline (details and script templates in `ffos-browser-verification`):

```bash
# A server is REQUIRED: the app is an ES module behind a strict CSP; file:// does not work.
# House convention: ports 789x (see ffos-env-run-deploy).
python3 -m http.server 7890 --directory /Users/mponamgi/Documents/Personal-finance-tracker
```

Then write a throwaway Node Playwright script (house pattern: `verify_*.cjs`
in scratch space — location guidance in `ffos-browser-verification`; never
commit them) that loads `http://localhost:7890/`, seeds
localStorage with test data, drives the real UI flow you changed, and asserts
the outcome. **Delete the script and kill the server afterwards.**

## Change classification and required gates

Classify your change before you start, not after. A change spanning multiple
classes must pass the union of all its gates.

| Class | Examples | Required gates before commit |
|---|---|---|
| (a) **D-schema-touching** | new field on transactions/cards/loans; restructuring `D.nps`/`D.tax`; changing a field's meaning or type | Migration in `load()` (→ `ffos-data-model-and-migrations`) · Playwright run that seeds **old-shape** localStorage and asserts the app loads and renders it correctly · lint gate · sign-off if a field is deleted/renamed (see below) |
| (b) **Parser/import-touching** | `BANK_CONFIGS` entries (`icici-salary`, `icici-cc`, `sc`, `amex`, `nps`), `parseBankStatementPdf`, `extractCardMetadata`, `reconstructTextWithCoordinates`, `autoCategory`, `parseForm16` | The `ffos-import-hardening-campaign` fixture suite (`run_fixture_suite.cjs --selfcheck`, 6 CSV fixtures across five banks) must be green **before and after** the change — this is the mandatory gate (as of 2026-07-20) · plus a Playwright run driving the real import UI with `test_icici.csv`/`mock_nps.csv` · assert **counts and values**, not just "no error" (Amex saga lesson: silent wrong values) · lint gate. Note: no golden PDF fixtures exist in-repo for icici-cc/sc/amex (the suite covers those banks via CSV fixtures only) — for PDF-parser changes, additionally verify with a real statement from the owner or a synthetic PDF |
| (c) **Render/UI-only** | new widget, modal, view; CSS; layout in `index.html` | Playwright run through the changed flow · esc() audit on every new interpolation (below) · lint gate · confirm no accidental `D` writes (`save()` calls you didn't intend) |
| (d) **Tax/finance-math** | `computeRegime`, `OLD_SLABS`/`NEW_SLABS`, EPF/NPS/gratuity/ESOP/gold/loan math, `syncLoansFromTxns` EMI detection | Hand-computed expected values for at least 2 scenarios BEFORE coding, checked against `indian-finance-reference` (slabs are FY 2025-26 as of 2026-07-12) · Playwright asserts the rendered numbers equal your hand computation · lint gate. EMI-detection changes additionally: re-run against realistic transaction history — the May 2026 EMI saga (`961e224`, `8cfde95`, `34fb4aa`, `6188fdc`, `3d9b198`) was ~10 commits of over-eager matching merging distinct loans and misclassifying Apple/Bajaj purchases |
| (e) **Security-surface** | CSP meta tag in `index.html`, `esc()`, `deepMerge()` prototype guards, anything parsing untrusted files | Owner sign-off if CSP is *loosened* (any new source, any new directive value) · esc() audit · Playwright run with a hostile payload (e.g. a transaction description containing `<img src=x onerror=...>`) asserting it renders inert · lint gate. Background: `git show 8a469f8` and `git show 6534505` |
| (f) **Vendor upgrades** | anything under `vendor/` (pdf.min.js + pdf.worker.min.js 4.10.38, xlsx.full.min.js 0.20.3, chart.umd.js, fonts) | Owner sign-off (always) · pin exact version and note the CVE/reason in the commit body (model: `git show 6534505`) · full offline Playwright pass: PDF import, XLSX import, charts, fonts all work with no external network · confirm no CDN/external URL crept into `index.html` (the app must stay self-hostable on IPFS) |
| (g) **Docs/skills-only** | `.claude/skills/**`, `README.md`, comments | lint gate only if `family-finance.js` was touched for comments; otherwise re-read `ffos-docs-and-commits` for style. No browser run needed — the only class exempt from non-negotiable #2. EXCEPTION: changes to any scripts a skill ships must be re-run before committing (per `ffos-docs-and-commits` §4 — a skill script is a runnable claim) |

**Lint gate, precisely** (as of 2026-07-20): `npm run lint` exits **non-zero
on the untouched tree** — 46 pre-existing errors, 90 warnings (dominated by
`no-unused-vars`; plus `no-useless-escape`, `no-undef`, `eqeqeq`). The
canonical home of the baseline number is `ffos-env-run-deploy` §2 — it will
drift; re-measure rather than trusting either skill's copy. The gate is
therefore **"no new problems"**, not "exit 0":

```bash
git stash && npm run lint 2>&1 | tail -1   # baseline count
git stash pop && npm run lint 2>&1 | tail -1   # must not exceed baseline
```

(If you cannot stash — e.g. you are an agent forbidden mutating git — run
lint before you start editing and record the count.)

## Pre-commit checklist

Run through this every time. Copy-paste the commands.

```bash
cd /Users/mponamgi/Documents/Personal-finance-tracker
```

1. **Lint — no new problems.**
   ```bash
   npm run lint 2>&1 | tail -1
   ```
   Compare against the pre-change baseline (see lint gate above).

2. **Migration present if the D schema changed.** If your diff touches how
   any part of `D` is shaped, `git diff family-finance.js` must ALSO show a
   corresponding block inside `load()`. Existing migrations in `load()`
   (the `D.nps` re-nesting and flat-`D.tax` conversion) are the pattern —
   mechanics in `ffos-data-model-and-migrations`.

3. **esc() audit — every new interpolation of user data is escaped.** All
   rendering is `innerHTML` template literals (108 `innerHTML` sites as of
   2026-07-12); `esc()` (defined near the top of `family-finance.js`) is the
   only sanitizer. Audit your diff:
   ```bash
   git diff -U0 -- family-finance.js index.html \
     | grep -E '^\+' | grep -E '\$\{' \
     | grep -vE 'esc\(|fmt\(|fmtD\(|Math\.|toLocaleString|\.toFixed\(|\.length\b'
   ```
   This flags **candidates**, not proven bugs — review each surviving line.
   Rule: interpolating numbers, internal ids, and hardcoded enums is fine;
   anything that originated from user typing **or from a parsed statement
   file** (desc, name, notes, insurer, card names, PRAN, file text) must be
   wrapped in `esc(...)`. Treat parser output as untrusted: statements are
   third-party files.

4. **Playwright verification run and passing** for classes (a)–(f). HOW is
   in `ffos-browser-verification`; WHAT to assert is your class's gate row
   above. Server first, script second, **delete the `verify_*.cjs` script and
   kill the server after**.

5. **Fixtures still import (parser changes only).** Run the
   `ffos-import-hardening-campaign` suite (`run_fixture_suite.cjs
   --selfcheck`) green, and drive `test_icici.csv`/`mock_nps.csv` (repo-root
   golden inputs) through the real import UI in your Playwright run,
   asserting row counts and amounts.

6. **Commit message** follows house style (next section).

## What requires explicit owner sign-off

Do not do these on your own judgment, even if asked by another agent. Ask the
owner (the human user) and get an explicit yes in this conversation:

- **Deleting or renaming a field in `D`.** Old saved data references it; a
  rename without a copying migration is silent data loss.
- **Loosening the CSP** in `index.html` (currently `default-src 'self'` with
  narrow carve-outs; verify with the command in Provenance). Any new host,
  any broadened directive.
- **Vendor upgrades** — anything under `vendor/`.
- **Anything that sends data off-device.** Currently **nothing does** — no
  fetch to external hosts, no analytics, no cloud sync; the CSP's
  `connect-src 'self'` enforces it. This is a hard line, not a default:
  privacy-first is the product. Adding any network egress is an
  owner-decision, full stop.

## Commit conventions

House style (mined from `git log`, as of 2026-07-12): **conventional-commit
subject + root-cause narrative body**. The body explains *why the bug
happened*, not just what changed. Read these as models before writing yours:

```bash
git show -s --format=%B 6534505   # security upgrade: what, which CVEs, how verified
git show -s --format=%B c8a1144   # bug fix: names the exact regex failure mode
git show -s --format=%B 1006309   # migration fix: root cause + migration + render fixes, itemized
```

(Style models only: the code content of `c8a1144` and `1006309` was later
reverted by `3c3ee4c` — see `ffos-failure-archaeology`.)

Templates and full style guide: `ffos-docs-and-commits`. Two invariants worth
repeating here: name the root cause in the body, and state how the change was
verified (the `6534505` body ends with its offline verification results —
that is the bar).

## Rollback protocol

1. **Prefer `git revert <hash>`** over `git checkout <hash> -- <files>` or
   `git reset`. Revert produces a new commit with an explanation and keeps
   history honest; checkout-onto-working-tree silently discards intervening
   work. (This repo's `.claude/settings.json` contains an approved
   `git checkout 633b7d6 -- family-finance.js index.html` — the Great
   Rollback (2026-06-15), which discarded the content of **six already-committed
   commits** (`6e00172`…`c8a1144`), including the member-stamping migration
   and the Amex fixes. The incident is fully reconstructed in
   `ffos-failure-archaeology` Incident 1 (evidence in its
   `references/chronicle.md`). Treat it as a cautionary artifact, not a
   pattern to copy.)

2. **Rolling back a schema change is NOT just reverting the code.** If the
   commit being reverted shipped a migration, the family's localStorage may
   **already be migrated** to the new shape. Reverting the code puts old code
   in front of new-shape data — the exact failure mode non-negotiable #1
   exists to prevent, in reverse. Before reverting a class-(a) commit:
   - Check whether the migration is idempotent/shape-tolerant under old code
     (e.g. an added field that old code ignores is safe to revert).
   - If old code would misread migrated data, the "rollback" must itself be
     a **forward fix**: a new commit with a down-migration in `load()`.
   - When unsure, load `ffos-data-model-and-migrations` and reason about
     both shapes explicitly.

3. **A rollback is a change.** It goes through this skill's gates like any
   other commit: classify it, run the Playwright verification (seeding
   localStorage with the *post-migration* shape), lint, commit with a body
   explaining what is being backed out and why.

## When NOT to use this skill

- **How to write a migration** (deepMerge semantics, D schema catalog,
  idempotency patterns) → `ffos-data-model-and-migrations`.
- **How to write/run the Playwright verification** (script templates, seeding
  localStorage, selectors) → `ffos-browser-verification`.
- **Something is already broken and you're diagnosing it** →
  `ffos-debugging-playbook`; for the war stories behind the rules →
  `ffos-failure-archaeology`.
- **Understanding BANK_CONFIGS / the PDF pipeline** →
  `ffos-statement-parsing-reference`; systematically hardening parsers →
  `ffos-import-hardening-campaign`.
- **Indian tax/EPF/NPS domain questions** → `indian-finance-reference`.
- **Serving, deploying (IPFS/Unstoppable), environment setup** →
  `ffos-env-run-deploy`.
- **Commit-message templates and doc style details** →
  `ffos-docs-and-commits` (this skill only states the gate that a good
  message exists).
- **Architecture rationale and invariants** (why one key, why no framework)
  → `ffos-architecture-contract`.

## Provenance and maintenance

All facts verified against the repo on **2026-07-12**. Re-verify before
relying on any of them:

- localStorage key + store: `grep -n "family_finance_v1" family-finance.js`
- `load()`/`deepMerge()`/`save()`/`esc()`/`fmt()` exist near top of file:
  `grep -nE "function (load|save|deepMerge)\(|const (esc|fmt) =" family-finance.js`
- Migration examples inside `load()`: `sed -n '45,60p' family-finance.js`
- BANK_CONFIGS keys: `grep -n "const BANK_CONFIGS" family-finance.js` then read the following ~100 lines
- CSP current value: `grep -n "Content-Security-Policy" index.html`
- Lint baseline (46 errors / 90 warnings will drift): `npm run lint 2>&1 | tail -1`
- Fixtures exist: `ls test_icici.csv mock_nps.csv`
- Incident narratives: `git show 1006309`, `git show c8a1144`, `git show 6534505`, `git log --oneline`
- Rollback artifact: `grep checkout .claude/settings.json`
- Tax slabs are FY 2025-26 (`OLD_SLABS`/`NEW_SLABS`): `grep -n "_SLABS =" family-finance.js` — statutory rates change with Union Budgets; cross-check `indian-finance-reference`
- Sibling skills list: `ls .claude/skills/` — cross-references above assume the full 14-skill library is present

Candidate/open (unproven, labeled as such in the text): golden-fixture gap for
PDF-based parsers (icici-cc/sc/amex). (The `633b7d6` checkout rollback,
formerly listed here as unrecorded, is now fully reconstructed as the Great
Rollback — `ffos-failure-archaeology` Incident 1; corrections in this skill
stamped 2026-07-20.)
