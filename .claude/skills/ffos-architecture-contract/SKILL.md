---
name: ffos-architecture-contract
description: >
  The architecture contract for Family Finance OS (this repo): the load-bearing design
  decisions with their WHY, the invariants every change must preserve, a section map of
  the two big files, and the honest weak points. Load this skill when: planning any
  feature; deciding where new code goes; tempted to add a framework, build step, backend,
  npm runtime dependency, or any external network request; questioning why the app is a
  zero-build single-page vanilla-JS app; or before any refactor of family-finance.js or
  index.html. Pairs with ffos-change-control (gates) and ffos-data-model-and-migrations
  (D schema).
---

# FFOS Architecture Contract

Family Finance OS is a privacy-first, zero-build, single-page vanilla-JS web app that
tracks one Indian family's finances (members: madhu, sailaja, parents, charan, himaja,
joint). The entire app is two files — `index.html` (~1957 lines) and
`family-finance.js` (~5332 lines) — plus vendored libraries in `vendor/`. No framework,
no bundler, no backend, no network. All line numbers below are **as of 2026-07-12**;
re-verify with the commands in "Provenance and maintenance" before relying on them.

**The two owner non-negotiables (2026-07-12):**

1. **NEVER break saved data.** Real family data lives in localStorage. Any change to the
   `D` schema ships an in-place migration inside `load()` in the same commit.
2. **VERIFY IN A REAL BROWSER.** `python3 -m http.server <port> --directory <repo>` and
   drive the UI with Playwright. `file://` fails (ESM module + CSP). Lint alone never
   suffices. See ffos-browser-verification for the runbook.

## 1. Decision table — what was decided, why, and what it forbids

| # | Decision | Why | What it forbids |
|---|----------|-----|-----------------|
| a | Single-file, zero-build vanilla JS. All logic in `family-finance.js`, all markup/CSS in `index.html`. `package.json` has only `lint`/`lint:fix`; `test` is a stub. | Auditable by reading two files; deploys to any static host including IPFS/Unstoppable Domains; no toolchain to rot; owner can inspect every line that touches family money. | Frameworks (React/Vue/etc.), bundlers, TypeScript, transpilers, a build step of any kind — unless the owner explicitly decides otherwise. New npm deps are dev/verification-only (Playwright, ESLint). |
| b | localStorage-only persistence; no backend, no network. Strict CSP meta in `index.html` line 6: `default-src 'self'; ... connect-src 'self'`. | Privacy: financial data never leaves the device. There is no server to breach and no account to phish. | Any external network request — analytics, CDNs, APIs, telemetry, remote fonts, cloud sync. Verified 2026-07-12: `grep -n "fetch(\|XMLHttpRequest\|WebSocket\|sendBeacon\|EventSource" family-finance.js index.html` returns zero hits. Keep it that way. |
| c | One global store object `D` (line 20) persisted as JSON under localStorage key `'family_finance_v1'` (`KEY`, line 4), with `load()` (45), `deepMerge()` (62), `save()` (76). Update idiom: **mutate `D` → `save()` → `renderAll()`** (or a targeted `render*()`). | Simplicity over performance: one source of truth, no state library, no reactivity system, trivially debuggable (`JSON.parse(localStorage.getItem('family_finance_v1'))` in DevTools). | Parallel stores, per-view caches of `D` data, or writes to localStorage that bypass `save()`. Verified in `saveAcc()`/`saveCard()`/`deleteCard()`/`deleteAcc()` (lines 546–605): every handler ends `save(); renderAll();`. 30 occurrences of the literal `save(); renderAll()` in the file. |
| d | Rendering = `render*()` functions rebuilding DOM via `innerHTML` template literals; **every user-supplied string passes through `esc()`** (line 108) before interpolation (`stripTags()`, line 110, for auto-detected strings). Discipline introduced in commit `8a469f8` ("security: Add CSP, ... XSS sanitization via esc()"). | No virtual DOM needed; XSS is contained by one auditable rule instead of a framework. | Interpolating any string a user typed, imported, or parsed from a statement into HTML without `esc()`. Audit grep: `grep -nE '\$\{[a-zA-Z]+\.(name|desc|notes|insurer|nominee)' family-finance.js \| grep -v 'esc('` — triage the hits: e.g. line 874 `${t.insurer}` is safe because `insurer` comes from the hard-coded allowlist in `scanTxnsForInsurance()` (line 850), not user input. |
| e | Dependencies vendored in `vendor/` (pdf.min.js + pdf.worker.min.js = pdf.js 4.10.38 ESM, xlsx.full.min.js = SheetJS 0.20.3, chart.umd.js, fonts/), loaded with `<script src="vendor/...">` and one `type=module` loader. Files named `.js` not `.mjs`. Commits `85307b3` (vendoring) and `6534505` (upgrades + `.js` rename). | Self-hosting on IPFS gateways: no CDN dependency, no SRI drift; the `.js`-not-`.mjs` rationale (gateway MIME handling) is per the `6534505` commit message — commit-message-attested, not reproduced in-repo (see ffos-env-run-deploy §6). The browser keys ESM off `type=module`, not the extension (comment at index.html ~538). | CDN `<script>` tags, `import` from URLs, renaming vendor files to `.mjs`, or "upgrading" libs without re-testing PDF import in a real browser. |
| f | Per-member data model: member-filterable list items carry a `member` field; `currentMember` (line 10, default `'all'`) + `filterByMember()` (line 200) scope every view. `'all'` is a pseudo-member (whole family); `'joint'` items appear in **every** individual member's view (`item.member === currentMember \|\| item.member === 'joint'`). **Exception (as of 2026-07-20): `D.rewards` items have NO `member` field** — per-member rewards were reverted by `3c3ee4c` (ffos-failure-archaeology Incident 1; ffos-data-model-and-migrations §2), and `renderRewards()` reads `D.rewards` unfiltered. Do not "fix" rewards by re-adding `member` — that is an owner-gated behavior change, not a cleanup. | One household, one dataset, per-person lenses without duplicating data. | New member-scoped item types without a `member` field; views that read a member-scoped `D.<list>` directly instead of `filterByMember(D.<list>)`; treating `'all'` or `'joint'` as ordinary members (`MEMBERS`, line 6, lists the six real members). |

## 2. Invariants — must hold after every change

Each with a one-line check (run from repo root).

1. **Every user-data interpolation passes `esc()`.**
   `grep -nE '\$\{[a-zA-Z]+\.(name|desc|notes|insurer|nominee)' family-finance.js | grep -v 'esc('` — every hit must be traceable to an app-controlled constant, or it is a bug.
2. **Every `D`-schema change has a migration in `load()`.**
   `sed -n '/^function load/,/^}/p' family-finance.js` — new/renamed/re-shaped fields must be migrated there (existing examples: flat `D.nps` and flat `D.tax` → per-member maps). Detail in ffos-data-model-and-migrations.
3. **`deepMerge()` blocks prototype pollution.**
   `grep -n "__proto__" family-finance.js` — the guard `if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;` must remain (line 66, hardened in commit `6534505`).
4. **Every Chart.js instance is destroyed before re-create.**
   `grep -n "ChartInstance\|new Chart(" family-finance.js` — five module-level vars (`nwChartInstance`, `assetChartInstance`, `budgetChartInstance`, `taxChartInstance`, `invChartInstance`, lines 12–16); each `new Chart(` (5 total) is preceded by an `if (xChartInstance) xChartInstance.destroy()` (verified at 2062, 2225, 2874–2880, 3593, 3793). A sixth var means a sixth destroy.
5. **Every list item has `id`; every list item EXCEPT rewards has `member`.**
   `grep -n "id: id ? +id : Date.now()" family-finance.js` — 7 save handlers use this idiom; `upsert()` (line 1317) matches on `id`. New item types must follow it. (As of 2026-07-20: `saveReward()` writes no `member` — rewards are global since the `3c3ee4c` revert; see decision (f). Also note legacy pre-June-2026 items in the owner's store may lack `member`, since no stamping migration exists in `load()` at HEAD.)
6. **`save()` is called after every mutation of `D`.**
   `grep -n "save();" family-finance.js` (33 hits) — any code path that pushes/filters/assigns into `D` and returns without `save()` silently loses data on reload. Spot-check the handler you touched, then verify in the browser (reload, data still there).
7. **No off-origin request, ever.**
   `grep -rn "https://\|http://" family-finance.js index.html | grep -v "^.*//.*comment"` then confirm hits are comments/metadata only; and the CSP meta at index.html line 6 stays `default-src 'self'`.

## 3. Section map — navigating 7,300 lines fast

### family-finance.js (section banners are `// ─────` comment blocks; list them with `grep -n "^// [A-Z]" family-finance.js`)

| Line (2026-07-12) | Section | Key symbols |
|---|---|---|
| 2 | DATA STORE | `KEY`, `MEMBERS`, `D`, `load()`, `deepMerge()`, `save()` |
| 84 | HELPERS | `esc()`, `stripTags()`, `fmt`/`cr`/`lk`, `filterByMember()`, `numbersHidden` |
| 207 | NAV | `go()`, `setMember()`, `PAGE_TITLES`, `ctxAdd()` |
| 262 | MODALS | open/close + city appreciation rates |
| 530 | SAVE HANDLERS | `saveAcc`, `saveCard`, `saveGold`, ... + `delete*` — the update idiom lives here |
| 845 | TRANSACTION SCANNER | `scanTxnsForInsurance()` |
| 922 | DOCUMENT AI SCANNER | Form 16 analyzer entry at 1200 |
| 1315 | UPSERT HELPER | `upsert()` |
| 1324–1445 | ESOP/RSU, GRATUITY helpers | |
| 1446 | NET WORTH | `snapshotNW` etc. |
| 1494 | TAX CALC / FORM 16 ENGINE (FY 2025-26) | `OLD_SLABS` (1517), `NEW_SLABS` (1518), `computeRegime()` (1535), `parseForm16()` (1607) — domain detail in indian-finance-reference |
| 1639 | RENDER ALL | `renderAll()` (1786) calls `syncLoansFromTxns()` (1662) then all 15+ renderers |
| 1807–4353 | Per-view renderers | OVERVIEW 1807, ACCOUNTS 2343, CARDS 2374, REWARDS 2419, PROPERTY 2556, GOLD 2651, INVESTMENTS 2716, EPF 2915, NPS 3008, CALENDAR 3037, LOANS 3344, INSURANCE 3462, BUDGET 3563, TAX 3751 (Form 16 sheet 3941), TRANSACTIONS 4070 |
| 4355 | CSV IMPORT / PDF parsing | `reconstructTextWithCoordinates()` (4386), `extractCardMetadata()` (4452), `parseBankStatementPdf()` (4584), `BANK_CONFIGS` (4825: `icici-salary`, `icici-cc`, `sc`, `amex`, `nps`), `parseDate()`, `cleanAmt()` — pipeline detail in ffos-statement-parsing-reference |
| 4662 | REWARD PROGRAMS LOOKUP | |
| 5325 | INIT | `load(); ... renderAll();` — runs at script parse time, so the script tag must stay at the end of `<body>` |

### index.html

| Line (2026-07-12) | What |
|---|---|
| 6 | CSP meta tag (`default-src 'self'`) |
| 9–10 | `<script src="vendor/xlsx.full.min.js">`, `vendor/chart.umd.js` (classic scripts, head) |
| 11–537 | All CSS (inline `<style>`) |
| 538–544 | `type=module` pdf.js loader: imports `./vendor/pdf.min.js`, sets `GlobalWorkerOptions.workerSrc`, exposes `window.pdfjsLib` |
| 548+ | Sidebar with member chips (`setMember`) and nav |
| 623–1373 | The 15 views: `view-overview` (623) ... `view-import` (1328); one `<div class="view">` each, toggled by `go()` |
| 1374–1953 | The 20 modals: `accModal` (1374) ... `fxModal` (1945), each a `.modal-backdrop` with an id |
| 1955 | `<script src="family-finance.js">` — last element; INIT depends on the DOM existing |

## 4. Known weak points — stated plainly (all verified 2026-07-12)

- **No automated test suite.** `package.json` `"test"` is the npm stub (`exit 1`). Playwright is a dependency for throwaway browser-verification scripts, not a harness. Golden fixtures `test_icici.csv` and `mock_nps.csv` sit at repo root but nothing runs them automatically.
- **One 5,332-line file.** Everything shares one global scope; name collisions and accidental shadowing are real risks. Do not "fix" this by splitting into modules without an owner decision (decision (a) above).
- **`renderAll()` is a full redraw.** Every save, delete, nav click, and member switch re-renders all views via innerHTML (and re-runs `syncLoansFromTxns()`). Fine at current data sizes; will degrade with thousands of transactions. Targeted `render*()` calls are the sanctioned optimization, not a reactivity layer.
- **No quota-exceeded handling in `save()`.** `save()` (line 76) calls `localStorage.setItem` bare — no try/catch. At the ~5MB origin quota, `setItem` throws, the mutation is silently unpersisted, and the UI still shows the new data until reload. There is no warning to the user.
- **Silent catch in `load()`.** `catch(e) {}` (line 58): corrupted JSON in storage means the app silently starts with the empty default `D` — indistinguishable from first run. It does not overwrite storage until the next `save()`, but any save after a failed load clobbers the stored blob.
- **No data export/backup UI.** Verified: `grep -in "export\|backup\|download" family-finance.js index.html` finds no such feature (only a comment about XLS parsing at line 4845). The only backup is manually copying the localStorage value from DevTools. Combined with the two points above, this is the single biggest data-loss exposure.
- **One shared localStorage key per browser origin.** Two family members using the same browser profile see and edit the same data; there is no auth, no profiles, no encryption at rest. (A second key, `'numbers_hidden'`, holds only the hide-balances UI preference.)
- **Float money, lossy amount parsing.** Amounts are JS floats (no paise-integer convention); coercion is `+input || 0`; `cleanAmt()` (line 4952) strips `₹`, commas, whitespace and **clamps negatives and NaN to 0** (parsers encode direction via a separate debit/credit column, so a negative-signed amount in an unexpected column silently becomes 0 — use `cleanAmtSigned()` when sign matters). Display rounding: `fmt` shows 0 decimals, `lk`/`cr` use `toFixed`. Never compare stored floats for equality without a tolerance.
- **The XSS audit is a grep + human triage, not a machine guarantee.** The audit grep in decision (d) produces hits that must be classified by provenance (see the line-874 example). Any new renderer re-opens the question.

## When NOT to use this skill

- Full `D` schema, field-by-field, and how to write a migration → **ffos-data-model-and-migrations**
- Pre-merge gates, checklists, what a change must prove → **ffos-change-control**
- Bank/NPS parser internals, coordinate-based PDF reconstruction → **ffos-statement-parsing-reference**
- Indian tax/EPF/NPS domain rules behind the tax engine → **indian-finance-reference**
- Serving the app, ports, IPFS/Unstoppable deploy mechanics → **ffos-env-run-deploy**
- Driving the real UI with Playwright → **ffos-browser-verification**
- Something is broken and you're diagnosing → **ffos-debugging-playbook**; past incidents → **ffos-failure-archaeology**

## Provenance and maintenance

All claims verified against the working tree at commit `526c55f` on 2026-07-12. Re-verify before trusting line numbers:

- Section banners / line drift: `grep -n "^// [A-Z]" family-finance.js` and `grep -n 'id="view-\|class="modal-backdrop"' index.html`
- Store & idiom: `grep -n "family_finance_v1\|function load\|function save\|function deepMerge\|save(); renderAll()" family-finance.js`
- No-network invariant: `grep -n "fetch(\|XMLHttpRequest\|WebSocket\|sendBeacon" family-finance.js index.html` (must be empty) and `sed -n 6p index.html` (CSP)
- XSS audit: `grep -nE '\$\{[a-zA-Z]+\.(name|desc|notes|insurer|nominee)' family-finance.js | grep -v 'esc('`
- Charts: `grep -n "ChartInstance\|new Chart(" family-finance.js`
- Cited commits: `git log --oneline | grep -E "8a469f8|85307b3|6534505"`
