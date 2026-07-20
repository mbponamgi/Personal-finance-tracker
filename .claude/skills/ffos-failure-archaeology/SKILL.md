---
name: ffos-failure-archaeology
description: >
  Historical record of every fought-and-settled (or still-open) battle in Family
  Finance OS. Load this BEFORE you: "fix" EMI auto-detection, Amex/ICICI/SC/NPS
  parsing, member filtering, or anything import-related; investigate a regression
  ("this used to work"); wonder why odd code exists (hardcoded 23790 / "bajaj
  electronics" / 24,999 / Apple exclusions, column-offset `o` params, the 150000
  credit-limit fallback); trust a commit message as evidence of current behavior;
  or revert/redesign/delete existing behavior. Nobody re-fights a settled battle,
  and nobody assumes a battle was won just because a fix commit exists in git log.
---

# FFOS Failure Archaeology

The chronicle of incidents in this repo, mined from git history and verified
against code at HEAD. **All "current code" facts verified 2026-07-19 at HEAD
`526c55f`** (line numbers drift; re-grep before relying on them). Full
timestamps, diff excerpts, and the mining transcript: `references/chronicle.md`.

**The single most important lesson of this repo (see Incident 1): a fix commit
in `git log` does NOT mean the fix is in HEAD.** One mega-commit (`3c3ee4c`)
silently reverted an entire day of committed fixes. Always verify behavior
against current code, never against commit messages.

## Settled battles — do not reopen without new evidence

- **EMI auto-detection design**: `deriveEmiBaseName` + `autoLoanKey` +
  `syncLoansFromTxns` + `D.dismissedAutoLoans` tombstones. Ten commits of pain
  produced it (Incident 2). Do not rewrite the matching/merging logic.
- **Hardcoded EMI exclusions** (`23790`, `bajaj electronics`, `24,999`,
  `/apple/i`): deliberate, owner-specific heuristics. Keep them; NEVER
  generalize patterns from them (Incident 2).
- **Loan delete = tombstone, not just filter**: `deleteLoan` must keep writing
  `dismissedAutoLoans` keys or deleted loans resurrect (Incident 5).
- **Security posture**: vendored libs only, CSP with no CDN hosts,
  `isEvalSupported:false` on every `pdfjs.getDocument`, prototype-pollution
  guard in `deepMerge`, `.js` not `.mjs` filenames (Incident 8).
- **AI policy scanner exists on purpose** — it was removed and rebuilt the same
  evening; do not remove it again (Incident 11).
- **`playwright` under `dependencies`** is a known wart — leave it (Incident 12).

## Open wounds — verified still broken/absent at HEAD (2026-07-19)

1. Amex-specific PDF parsing and the "credit limit = 23" regex fix are NOT in
   HEAD — reverted by the Great Rollback (Incidents 1, 3).
2. Member-stamping migration and per-member EPF/rewards are NOT in HEAD —
   same rollback (Incidents 1, 4).
3. `parseDate` returns the previous calendar day for DD/MM dates on IST
   machines (Incident 6).
4. Every SC import session creates a duplicate "SC Savings" account
   (Incident 7).

Fixing any of these = go through ffos-change-control + ffos-browser-verification;
for 1–2 the reference implementations already exist in history (hashes below).

---

## Incident 1 — The Great Rollback: 3c3ee4c silently clobbered a day of fixes (2026-06-14 → 2026-06-15)

**Status: OPEN. The highest-cost incident in the chronicle.**

- **Symptom**: Code that commit messages say was fixed (Amex import, member
  segregation) is absent from HEAD. `git log` lies about current behavior.
- **Root cause**: During a 2026-06-14/15 session (chasing the loan-delete bug,
  Incident 5), the working tree was rolled back with
  `git checkout 633b7d6 -- family-finance.js index.html` — this command is
  preserved as an approved entry in `.claude/settings.json` (committed
  `2eea333`, 2026-06-14 15:20 IST), alongside `rm -f /tmp/repro-loan-delete.mjs`.
  That checkout reset both app files to their 2026-06-13 state, discarding the
  content of six already-committed commits (`6e00172`, `1006309`, `9ebb1ed`,
  `71cf4a9`, `b8dfc8c`, `c8a1144` — all ancestors of HEAD on the linear main
  branch). The next commit, `3c3ee4c` "feat: add Form 16 analyzer" (2026-06-15
  23:16), was built on the rolled-back tree, so its diff vs its parent silently
  REMOVES: the whole Amex PDF parser + line-scan credit-limit fix, the
  member-stamping migration, per-member EPF, and the rewards member field —
  while its commit message mentions none of this.
- **Evidence**: `git diff 2eea333 3c3ee4c -- family-finance.js` shows removals
  of `amexDateReg`, the "Available Credit Limit Rs" line-scan, the
  `['accounts','cards',...]` stamping loop, `getEpfData`. HEAD greps for
  `amexDateReg`, `Available Credit`, `stamp member` all come up empty.
  `git merge-base --is-ancestor c8a1144 HEAD` → true (the "fixes" are
  ancestors, yet their content is gone). Verified independently by the
  data-model and statement-parsing agents.
- **Resolution**: None yet. The reverted implementations survive in history:
  `git show c8a1144:family-finance.js` (Amex), `git show 1006309:family-finance.js`
  (stamping migration). Re-landing them is real work, not a cherry-pick — the
  file has since diverged (Form 16, security hardening).
- **Why the rollback happened**: uncertain — evidence limited to the two
  approved commands in `.claude/settings.json` and the `3c3ee4c` message's
  note that it "includes loan/EMI delete + duplicate-on-edit fixes". Plausibly
  an escape from a broken working state; no commit documents the intent.
- **Lesson**: never `git checkout <old> -- <files>` over a tree containing
  committed work, and never bundle a revert inside an unrelated feature commit.
  Encoded in **ffos-change-control** (small commits, honest messages) and
  **ffos-docs-and-commits**.

## Incident 2 — The EMI auto-detection saga (2026-05-17, ten commits in one evening)

**Status: settled** (design stable since; delete-path completed by Incident 5).

- **Symptom → arc** (all times IST, all commits touch `index.html` — the app
  was single-file then):
  1. `d82f4cb` 17:18 — auto-populate EMIs into Loans on statement import.
  2. `961e224` 17:23 — distinct loans were overwriting each other; group key
     became `base + '_' + amount`, with UPI/NEFT/IMPS/RTGS/BIL prefix stripping
     (the ancestor of today's `deriveEmiBaseName`).
  3. `34fb4aa` 17:29 — first hardcode: amount `23790` force-categorized as
     EMI/"Auto Loan" (`autoCategory` gained an `amount` param).
  4. `a379c08` 17:35 — one-shot import hook became continuous
     `syncLoansFromTxns()`.
  5. `8cfde95` 18:54 — "aggressive merging": loans matched on amount OR name,
     merging distinct loans; fixed to amount AND bidirectional name match.
  6. `da80aaa` 19:05 — type casting, date normalization, `_log` diagnostics.
  7. `a92469f` 19:15 — "self-healing loop": auto-correct txn categories to EMI
     when they match an active loan or mandate keywords.
  8. `3d9b198` 19:18 — purge all `/apple/i` loans (an Apple purchase kept
     resurrecting as a fake loan).
  9. `1c8bdd8` 19:20 — force EMI txns to `type:'debit'`.
  10. `6188fdc` 19:51 — exclude "bajaj electronics" and amount `24,999` (a
      consumer-durable purchase misdetected as a loan).
- **What survives in code today** (family-finance.js, 2026-07-19):
  `deriveEmiBaseName` (~line 1644), `autoLoanKey` (~1655, hardcodes 23790 →
  'Auto Loan'), `syncLoansFromTxns` (~1662) with apple/bajaj-electronics/24999
  purge filters (~1683–1698, ~1723–1724) and 23790 checks (~1657, ~1736);
  `autoCategory` (~4970–4983: "bajaj electronics"→Shopping, 23790→EMI).
- **THE WART, stated loudly**: `23790` is one specific family's car-loan EMI;
  "bajaj electronics"/`24,999` and Apple are one family's purchases. These are
  personal-data-specific heuristics that happen to live in code. They are
  intentional and settled — but they are NOT patterns to imitate. Never add new
  hardcoded amounts/merchants without owner sign-off, and never reason "the
  codebase does amount-equality matching, so it's fine".
- **Lesson**: recurring-payment detection needs a stable key
  (name+amount) and an explicit dismissal mechanism, not smarter merging.
  Encoded in **ffos-architecture-contract** (the settled design) and
  **ffos-import-hardening-campaign**.

## Incident 3 — The Amex import saga: four fixes in 76 minutes, then all reverted (2026-06-14)

**Status: OPEN** — fixed on 2026-06-14, silently reverted next day (Incident 1).
The buggy generic code is what runs at HEAD today.

- **Arc** (IST): `9ebb1ed` 13:11 parser added → `71cf4a9` 13:51 metadata
  extraction (credit limit label and value live in separate PDF table rows;
  text collapse destroyed adjacency) → `b8dfc8c` 14:06 three root causes
  (early `return` skipped card update when 0 txns parsed; one-directional
  `name.includes()` created duplicate cards; outstanding unconditionally
  zeroed) → `c8a1144` 14:27 the famous **"credit limit = 23"** bug: pattern
  `Credit Limit Rs\s+Available Credit Limit Rs[^0-9]*([\d,]+...)` — `[^0-9]*`
  stops at the FIRST digit in the flattened text, which was the "2" of
  "May 23," in an interleaved date. Fix was a line-by-line scan of the header
  row + next-line value. Same commit fixed silent import failure: `renderAll()`
  ran before the status badge update, so any render exception left a frozen
  "Import All" button with no feedback even though data was saved.
- **HEAD today** (verified 2026-07-19): none of this exists. The generic
  `extractCardMetadata` (~line 4452) uses the same fragile `\D*?` /
  `([\d,]+)\b` single-regex class over collapsed text, plus a hardcoded
  `if (limit === 0) limit = 150000;` fallback (~4528) — the collapsed-text
  digit-collision bug class is live again. `confirmImport` (~5215) does update
  the badge only after `save(); renderAll();` (~5313–5318), so a render throw
  can still mask feedback. Reference implementation: `git show
  c8a1144:family-finance.js` (metadata scan ~lines 4100–4230 in that version).
- **Lesson**: single-regex metadata extraction across flattened unknown PDF
  text is fragile — anchor to lines/coordinates; and parser fixes shipped
  without a repro corpus don't stay fixed. Encoded in
  **ffos-statement-parsing-reference** and **ffos-import-hardening-campaign**.

## Incident 4 — Member segregation: fixed twice, half of it lost (2026-06-13/14)

**Status: partially settled** — `633b7d6` survives; `6e00172` + `1006309`
content is NOT in HEAD (Incident 1).

- **Symptom**: individual member dashboards showed nothing or showed global
  data; legacy localStorage items predate the `member` field so
  `filterByMember` (`item.member === currentMember || 'joint'`, ~line 200)
  matched nothing; several renderers never filtered at all.
- **Arc**: `633b7d6` (2026-06-13 23:30) render-filter fixes + flat-tax
  migration → `6e00172` (2026-06-14 11:48) per-member EPF, rewards `member`
  field → `1006309` (2026-06-14 12:43) the real fix: stamp `member='madhu'` on
  every item missing the field across 9 arrays in `load()`, plus a full
  renderer audit.
- **HEAD today** (verified 2026-07-19): `load()` (~lines 45–60) contains ONLY
  the nps and tax migrations. **The stamping migration is NOT in load()** —
  contrary to what the commit history suggests. `renderRewards` uses unfiltered
  `D.rewards`; `D.epf` is flat again. New items DO get stamped at creation
  (`member: currentMember === 'all' ? 'madhu' : currentMember` at ~902, ~1059,
  ~1764, ~5305), so only pre-June-2026 legacy data is affected.
- **Lesson**: a migration that lives only in one commit is not a migration;
  it must be verified present in `load()` at HEAD. Encoded in
  **ffos-data-model-and-migrations**.

## Incident 5 — Loan delete resurrection ("it won't stay deleted") (~2026-06-14 → 2026-06-15)

**Status: settled.**

- **Symptom**: deleting an auto-detected loan didn't stick —
  `syncLoansFromTxns()` recreated it from the same transactions on next render;
  editing an auto-detected loan spawned a duplicate.
- **Root cause**: original `deleteLoan` (initial commit `5be7005`) was just
  `D.loans = D.loans.filter(l => l.id !== id)` — no memory of the deletion, and
  strict `!==` also missed string-vs-number id mismatches from inline onclick.
- **Evidence**: `git log -L :deleteLoan:family-finance.js` shows exactly two
  states: `5be7005` and the fix in `3c3ee4c`. A repro script existed at
  `/tmp/repro-loan-delete.mjs` (referenced by an approved `rm -f` in
  `.claude/settings.json`) but was deleted — exact failing scenario beyond the
  commit message is **uncertain — evidence limited to** the `3c3ee4c` message
  and code comments.
- **Resolution (in HEAD, ~lines 697–731)**: `deleteLoan` tombstones the loan's
  `autoKey`, `name_emi`, and `amt:` keys into `D.dismissedAutoLoans`, AND keys
  every matching source transaction via the same `autoLoanKey()` the detector
  uses; `saveLoan` preserves `autoDetected`/`autoKey` on edit (~684–690);
  `syncLoansFromTxns` consults `D.dismissedAutoLoans` (~1752).
- **Lesson**: deleting derived data requires tombstoning the derivation key,
  using the exact same key function the deriver uses. Encoded in
  **ffos-architecture-contract**.

## Incident 6 — parseDate IST off-by-one-day (since initial commit, live today)

**Status: OPEN** (verified in-browser by the statement-parsing agent; confirmed
by code inspection 2026-07-19).

- **Symptom**: imported DD/MM transactions land dated one day earlier.
- **Root cause**: `parseDate` (~line 4897) does `new Date(y, m - 1, d)` —
  local midnight IST (UTC+5:30) — then `dt.toISOString().split('T')[0]`, which
  converts to UTC (−5:30 → previous day 18:30Z) and keeps the UTC date. Every
  branch built on local-time construction + `toISOString()` (~4912–4917,
  ~4930–4931, and the alphabetic `new Date(cleanStr)` path ~4904) is affected.
  Present since `5be7005` (per `git log -S "toISOString"`).
- **Resolution**: none yet. Any fix must format from local components (or use
  `Date.UTC`), must go through ffos-browser-verification with an IST-timezone
  check, and must consider that all EXISTING stored dates were produced by the
  buggy path (see ffos-data-model-and-migrations before "correcting" them).
- **Lesson**: never round-trip a local-time Date through `toISOString()` for a
  calendar date. Encoded in **ffos-statement-parsing-reference**.

## Incident 7 — SC Savings account duplicated on every import (live today)

**Status: OPEN** (verified by code inspection 2026-07-19).

- **Symptom**: each SC statement import session creates another "SC Savings"
  account.
- **Root cause**: `confirmImport` (~5235–5251) creates the account with
  `name: 'SC Savings'` but looks up existing accounts with
  `a.name.toLowerCase().includes('standard chartered')` — `'sc savings'` never
  contains `'standard chartered'`, so the upsert never matches its own
  creation. (ICICI is fine: `'icici savings'.includes('icici')`.) Introduced in
  the account-association era (`git log -S "bankKeyword"` → `b040d13`).
- **Note**: txn-level dedupe DOES exist and works — key
  `date|desc|amount` (~5295–5299) — so transactions aren't duplicated, only
  the account row.
- **Lesson**: an upsert's lookup predicate must match what the insert writes —
  test the second import, not the first. Encoded in
  **ffos-import-hardening-campaign**.

## Incident 8 — Security hardening arc (2026-05-31 → 2026-06-30)

**Status: settled — the constraints it created are permanent.**

- **Arc**: `8a469f8` (2026-05-31) CSP + SRI-pinned CDN scripts + `esc()` XSS
  sanitization + ESLint → `85307b3` (2026-06-30 14:40) all third-party assets
  vendored into `vendor/` (chart.umd.js, pdf.min.js, pdf.worker.min.js,
  xlsx.full.min.js, fonts) → `6534505` (2026-06-30 15:21) pdf.js 2.16 →
  4.10.38 (CVE-2024-4367 arbitrary JS via malicious PDF), SheetJS → 0.20.3
  (CVE-2023-30533 prototype pollution, CVE-2024-22363 ReDoS), prototype-
  pollution guard in `deepMerge`, `isEvalSupported:false`, `.js`-not-`.mjs`
  filenames for IPFS gateway MIME compatibility.
- **Verified in HEAD 2026-07-19**: CSP at index.html:6 is `default-src 'self'`
  with no CDN hosts; zero cdn/jsdelivr references; `deepMerge` skips
  `__proto__`/`constructor`/`prototype` (~65–66); `isEvalSupported:false` on
  all three `pdfjs.getDocument` call sites (~977, ~1229, ~5018).
- **Constraints — do not regress**: never reintroduce CDN script tags; never
  widen the CSP; keep `isEvalSupported:false` on every new `getDocument` call;
  keep the deepMerge guard; keep vendored filenames `.js`.
- **Lesson**: encoded in **ffos-architecture-contract** and
  **ffos-env-run-deploy**.

## Incident 9 — Stale copies in-tree: the wrong-path hazard (chronic)

**Status: settled understanding; the hazard is permanent.**

- **THE LIVE APP IS ONLY** `/Users/mponamgi/Documents/Personal-finance-tracker/index.html`
  **and** `family-finance.js` **at repo root** (plus `vendor/`). Everything
  below is a dead snapshot; editing one silently does nothing:
  - `Documents/Personal-finance-tracker/…` (nested copy incl. its own
    `family-finance.js`, `handoff/`, zip)
  - `handoff/` (four variants incl. `Personal-finance-tracker-main.zip`)
  - `personal-finance-tracker-handoff.zip`
  - `code-from-github-June2026/` (GitHub archive, committed `526c55f`
    2026-07-05)
- **History**: this already went wrong once — `2f71af7` (2026-05-12) "remove
  foreign files pulled in from previous bad push" deleted 11,762 lines of
  duplicated copies… which later returned via handoff bundles and archives.
- **Sailaja Teaching OS**: `3c98fac` (2026-05-03) added an unrelated app AS
  `index.html` (1,882 lines) + `tweaks-panel.jsx`; `2f71af7` removed both. It
  does not exist anywhere in the tree today (`git ls-files | grep -i sailaja`
  empty, 2026-07-19); recoverable only via `git show 3c98fac:index.html`.
- **Lesson**: before editing, confirm you're at repo root, not in a snapshot.
  Encoded in **ffos-architecture-contract** and **ffos-env-run-deploy**.

## Incident 10 — ICICI/SC format drift (2026-05-17, five remappings in one day)

**Status: settled understanding** (the drift itself never ends).

- **Evidence**: `0d5d8d5` 14:15 new ICICI CSV mapping → `55c3e72` 14:24 again →
  `7e52a70` 15:21 Excel files need a column offset (the `o` param in the
  icici-salary parser — that's why it exists) → `9c19361` 17:12 SC remap →
  `990960d` 19:42 ICICI-CC "exact new column mapping". Five column-mapping
  commits in under six hours of importing real statements.
- **Lesson**: bank export formats drift between downloads of the same bank;
  hardcoded column indices are a treadmill. This is the founding evidence for
  **ffos-import-hardening-campaign**; per-bank details live in
  **ffos-statement-parsing-reference**.

## Incident 11 — AI policy scanner: added, fixed, removed, rebuilt — in 46 minutes (2026-05-17)

**Status: settled — the feature stays.**

- **True order by author timestamp** (`git show -s --format='%ci'`):
  `1cd78f5` 19:54 added → `446e8a2` 20:20 fixed (live PDF.js parsing +
  filename heuristics) → `a781e8d` 20:23 "Completely remove AI Policy Document
  Scanner" — three minutes after the fix → `a965ef3` 20:40 rebuilt inside the
  insurance enhancement. Why it was removed: **uncertain — evidence limited
  to** the commit subject; no rationale recorded.
- **Current design (HEAD 2026-07-19)**: `startAIScan()` at family-finance.js:952
  (async, PDF.js with `isEvalSupported:false`), scan-progress UI in index.html
  (~1735), button at index.html:1768.
- **Lesson**: features here get removed and re-demanded within the hour —
  don't delete working features to "clean up"; deprecate via
  **ffos-change-control**.

## Incident 12 — playwright as a runtime dependency (2026-06-08)

**Status: settled wart.**

- `3cfba21` added `"playwright": "^1.60.0"` under `dependencies` (verified in
  package.json today) though it is dev tooling for throwaway `verify_*.cjs`
  scripts. The app itself has no runtime deps — it's zero-build vanilla JS.
  Harmless (nothing imports it at runtime). Do not "fix" to devDependencies
  without going through ffos-change-control — not worth a diff on its own.

---

## When NOT to use this skill

- **Live triage of a bug happening now** → `ffos-debugging-playbook` (this
  skill is the historical record it cross-references).
- **How to make/commit a change safely** → `ffos-change-control`,
  `ffos-docs-and-commits`.
- **Current architecture rules and invariants** → `ffos-architecture-contract`.
- **Schema, `D`, `load()`/`save()`/migration mechanics** →
  `ffos-data-model-and-migrations`.
- **Per-bank parser formats/columns/regexes** →
  `ffos-statement-parsing-reference`; active hardening work →
  `ffos-import-hardening-campaign`.
- **Running the app / Playwright verification** → `ffos-env-run-deploy`,
  `ffos-browser-verification`.
- **Tax/EPF/NPS domain facts** → `indian-finance-reference`.
- **New investigation techniques / open research** →
  `ffos-proof-and-analysis-toolkit`, `ffos-research-frontier`,
  `ffos-research-methodology`.

## Provenance and maintenance

Everything above was derived from read-only git archaeology plus HEAD code
inspection on 2026-07-19 (HEAD `526c55f`). No narrative was invented; where
evidence ran out, the entry says "uncertain". Re-mine with:

- New incidents since this was written: `git log --oneline --since=2026-07-19`
- Full dated map: `git log --all --format='%h %ci %s'`
- Any function's battle history: `git log -L :syncLoansFromTxns:family-finance.js`
  (likewise `:deleteLoan:`, `:load:`, `:parseDate:`, `:confirmImport:`)
- Detect future silent reverts (the Incident-1 class): for a "fixed" commit F,
  check `git grep <distinctive-fix-string> HEAD -- family-finance.js` — if the
  fix's signature string is absent from HEAD while `git merge-base
  --is-ancestor F HEAD` succeeds, it was clobbered.
- Wart inventory still present: `grep -n "23790\|24999\|bajaj electronics\|apple" family-finance.js`
- Update line numbers by re-grepping the function names; update the "verified"
  date; append new incidents in the same format (Symptom → Root cause →
  Evidence → Resolution → Status → Lesson) ordered by cost, not chronology.
