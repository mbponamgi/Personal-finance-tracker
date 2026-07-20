# FFOS Failure Archaeology — Extended Chronicle (evidence appendix)

Companion to `../SKILL.md`. Raw timestamps, diff excerpts, and the verification
transcript behind each incident. All commands were run read-only on 2026-07-19
at HEAD `526c55f` on branch `main` (linear first-parent history — every hash
below is an ancestor of HEAD; verified with `git merge-base --is-ancestor`).

## Master timeline (author timestamps, IST)

| Hash | Date/time | Subject (abridged) | Incident |
|---|---|---|---|
| baba712 | (repo start) | first commit | — |
| 3c98fac | 2026-05-03 23:04 | Add Sailaja Teaching OS dashboard (as root index.html + tweaks-panel.jsx) | 9 |
| 2f71af7 | 2026-05-12 20:10 | remove foreign files pulled in from previous bad push (−11,762 lines) | 9 |
| 5be7005 / 5795ee2 | — | Initial commit: Family Finance OS | — |
| 0d5d8d5 | 2026-05-17 14:15 | ICICI parsing logic for new CSV format | 10 |
| 55c3e72 | 2026-05-17 14:24 | index.html new ICICI parsing logic | 10 |
| 7e52a70 | 2026-05-17 15:21 | Fix ICICI parsing offset for Excel files (the `o` offset) | 10 |
| 9c19361 | 2026-05-17 17:12 | SC parser column mapping | 10 |
| d82f4cb | 2026-05-17 17:18 | Auto-populate EMIs into Loans during import | 2 |
| 961e224 | 2026-05-17 17:23 | Prevent overwriting distinct loans; expand EMI keywords | 2 |
| 34fb4aa | 2026-05-17 17:29 | Hardcode 23790 → Auto Loan (autoCategory gains amount param) | 2 |
| a379c08 | 2026-05-17 17:35 | Continuous syncLoansFromTxns | 2 |
| 8cfde95 | 2026-05-17 18:54 | Fix aggressive EMI merging (OR → AND match) | 2 |
| da80aaa | 2026-05-17 19:05 | Type casting, date normalization, _log | 2 |
| a92469f | 2026-05-17 19:15 | Self-healing loop: auto-correct categories to EMI | 2 |
| 3d9b198 | 2026-05-17 19:18 | Purge Apple entries from Loans/EMI | 2 |
| 1c8bdd8 | 2026-05-17 19:20 | Force EMI txns to debit | 2 |
| 990960d | 2026-05-17 19:42 | ICICI-CC exact new column mapping | 10 |
| 6188fdc | 2026-05-17 19:51 | bajaj electronics + 24,999 exclusions | 2 |
| 1cd78f5 | 2026-05-17 19:54 | AI Policy Document Scanner added | 11 |
| 446e8a2 | 2026-05-17 20:20 | AI scan fixed (live PDF.js parsing) | 11 |
| a781e8d | 2026-05-17 20:23 | "Completely remove" AI scanner (3 min after fix) | 11 |
| a965ef3 | 2026-05-17 20:40 | AI scanner rebuilt inside insurance enhancement | 11 |
| 8a469f8 | 2026-05-31 20:50 | CSP, SRI, esc(), ESLint | 8 |
| 3cfba21 | 2026-06-08 23:04 | playwright as runtime dependency | 12 |
| 633b7d6 | 2026-06-13 23:30 | Member filtering fixes + flat-tax migration | 4 |
| 6e00172 | 2026-06-14 11:48 | Per-member EPF, rewards member field | 4 (reverted) |
| 1006309 | 2026-06-14 12:43 | Stamp member='madhu' migration + renderer audit | 4 (reverted) |
| 9ebb1ed | 2026-06-14 13:11 | Amex PDF statement parser | 3 (reverted) |
| 71cf4a9 | 2026-06-14 13:51 | Amex metadata extraction (two-row credit-limit table) | 3 (reverted) |
| b8dfc8c | 2026-06-14 14:06 | Amex card update/matching/feedback (3 root causes) | 3 (reverted) |
| c8a1144 | 2026-06-14 14:27 | "credit limit = 23" fix + silent-failure fix | 3 (reverted) |
| 2eea333 | 2026-06-14 15:20 | Claude Code project settings (contains rollback evidence) | 1, 5 |
| 3c3ee4c | 2026-06-15 23:16 | Form 16 analyzer — THE GREAT ROLLBACK COMMIT; also deleteLoan tombstone fix | 1, 5 |
| 85307b3 | 2026-06-30 14:40 | Vendor third-party assets | 8 |
| 6534505 | 2026-06-30 15:21 | pdf.js 4.10.38, SheetJS 0.20.3, deepMerge guard, isEvalSupported:false | 8 |
| 526c55f | 2026-07-05 15:08 | GitHub source archive (code-from-github-June2026/) | 9 |

## Incident 1 — The Great Rollback: key evidence

`.claude/settings.json` (committed in `2eea333`) permissions.allow contains,
verbatim:

```
"Bash(git -C /Users/mponamgi/Documents/Personal-finance-tracker checkout 633b7d6 -- family-finance.js index.html)",
"Bash(rm -f /tmp/repro-loan-delete.mjs && echo \"cleaned up\")"
```

Proof the revert is real and silent:

- `git diff 2eea333 3c3ee4c --stat` → family-finance.js 742 changed lines
  (485+/257−) — the removals include (seen in the diff): the
  `['accounts','cards','loans',...]` member-stamping loop in `load()`, the
  flat-EPF migration, `getEpfData`, the rewards member field,
  `filterByMember(D.rewards)`, `amexDateReg`, the Amex "Return early — bypass
  generic patterns" block, and the `Credit Limit Rs / Available Credit Limit
  Rs` line-scan.
- `git show c8a1144:family-finance.js | grep -n "Available Credit"` → hits at
  ~4127–4134 (the fixed line-scan). Same grep against HEAD → empty.
- `git log -L :load:family-finance.js` → last commit to touch `load()` is
  `3c3ee4c`, and its hunk REMOVES the two migrations (shown as `-` lines).
- HEAD vs 633b7d6: `git diff 633b7d6 HEAD --stat -- family-finance.js` →
  +447/−50, i.e. HEAD = 633b7d6 + Form-16/deleteLoan/security work, NOT
  633b7d6 + June-14 work.
- 3c3ee4c's commit message (Form 16 + "loan/EMI delete + duplicate-on-edit
  fixes") mentions neither Amex nor member segregation.

## Incident 2 — EMI saga: load-bearing diff excerpts

`961e224` (overwrite fix — birth of the name_amount key):

```js
const key = base + '_' + t.amount; // Use amount to differentiate if names are similar
```

`8cfde95` (aggressive-merge fix; OR → AND):

```js
- const match = D.loans.find(l => Math.abs(l.emi - r.amount) < 10 || l.name.toLowerCase() === baseName.toLowerCase());
+ const match = D.loans.find(l => Math.abs(l.emi - r.amount) < 10 && (l.name.toLowerCase().includes(baseName.toLowerCase()) || baseName.toLowerCase().includes(l.name.toLowerCase())));
```

`34fb4aa` (first hardcode): `if (amount === 23790) return 'EMI';` in
`autoCategory`.

Wart inventory at HEAD (grep verified 2026-07-19), family-finance.js:

- `~1657`, `~1736`: `Math.abs(amtNum - 23790) < 1` → 'Auto Loan'
- `~1683–1685`: purge `/apple/i`, `/bajaj electronics/i`, `emi === 24999` loans
- `~1698`, `~1723–1724`: skip same patterns in txn scan and loan generation
- `~4970`: `bajaj electronics` → 'Shopping'; `~4972`: 23790 → 'EMI'

## Incident 3 — Amex: the two bug signatures

`71cf4a9` root cause note (from its own diff comments): credit-limit label and
value are in separate table rows; whitespace-collapsed text lost adjacency, so
`/Credit Limit Rs\s*(digits)/` never matched. Its "fix" introduced
`[^0-9]*` skipping — which `c8a1144` then diagnosed (commit message, verbatim
essence): the regex "stops at the first digit it encounters, which is '2' in
'May 23,' — so it captures '23', giving limit = 23". Final fix: find the header
line containing both "Credit Limit Rs" and "Available Credit Limit Rs", take
the first decimal number from the NEXT line; fallback = first amount ≥ 10000.

`b8dfc8c` three root causes (commit message): early return before card-update
block when 0 rows parsed; one-directional `c.name.includes(detected)` name
match creating duplicate cards; `existingCard.outstanding = detected.outstanding`
running even when extraction failed (0), wiping a correct balance.

HEAD today runs the pre-saga generic `extractCardMetadata` (~4452–4532) with
`\D*?`/`([\d,]+)\b` patterns and `if (limit === 0) limit = 150000;` — the
150000 default can silently overwrite nothing but will be reported as a real
limit; the digit-collision class is unguarded.

## Incident 4 — Member segregation: what 1006309 added (and HEAD lost)

From `git show 1006309` (removed again by 3c3ee4c; NOT in HEAD):

```js
// Migrate all data arrays: stamp member='madhu' on any item missing the field
['accounts','cards','loans','investments','properties','gold','insurance','rewards','transactions'].forEach(key => {
  if (Array.isArray(D[key])) {
    D[key].forEach(item => { if (!item.member) item.member = 'madhu'; });
  }
});
```

HEAD `load()` (verified 2026-07-19) contains only: nps flat→per-member wrap and
tax flat→per-member wrap. `filterByMember` at ~200 requires an exact member (or
'joint') — items with no member field are invisible in every per-member view.

## Incident 5 — deleteLoan: full function history

`git log -L :deleteLoan:family-finance.js` returns exactly two commits:

1. `5be7005` — `D.loans = D.loans.filter(l => l.id !== id);` (strict `!==`).
2. `3c3ee4c` — current design: loose `==` id match (inline-onclick string ids),
   confirm dialog, tombstone keys `loan.autoKey`, `name_emi`, `amt:<round>`,
   plus per-transaction `autoLoanKey(t.desc, t.amount)` for every txn matching
   by EMI amount (±10) or name overlap. Code comment in HEAD: "Decisive fix for
   'won't stay deleted'".

The repro (`/tmp/repro-loan-delete.mjs`) was deleted post-fix; its exact
scenario is unrecoverable → recorded as uncertain in SKILL.md.

## Incident 6 — parseDate: the exact broken pattern (HEAD ~4897)

```js
if (fmt === 'DD/MM/YYYY' || fmt === 'DD MMM YYYY') {
  const dt = new Date(y, m - 1, d);              // local midnight, IST = UTC+5:30
  return isNaN(dt) ? null : dt.toISOString().split('T')[0];  // → UTC = previous day
}
```

`new Date(2026, 0, 15)` on an IST machine = `2026-01-14T18:30:00.000Z` →
`"2026-01-14"`. Same pattern in the MM/DD branch, both fallback branches, and
the alphabetic `new Date(cleanStr)` branch. Present since `5be7005`
(`git log -S "toISOString" -- family-finance.js` bottoms out there). In-browser
confirmation was done by the statement-parsing verification pass (2026-07).

## Incident 7 — SC account duplication (HEAD ~5235)

```js
const bankName   = selectedBank === 'icici-salary' ? 'ICICI Savings' : 'SC Savings';
const bankKeyword = selectedBank === 'icici-salary' ? 'icici' : 'standard chartered';
let existingAcc = D.accounts.find(a => a.member === m && a.name.toLowerCase().includes(bankKeyword));
```

Creation writes `name: 'SC Savings'`; `'sc savings'.includes('standard
chartered')` is always false → a fresh account every import session. Origin:
`b040d13` era (`git log -S "bankKeyword"`). Transaction dedupe itself is fine:
`Set` keyed on `date+'|'+desc+'|'+amount` at ~5295.

## Incident 8 — Security: HEAD verification points

- index.html:6 CSP: `default-src 'self'; script-src 'self' 'unsafe-inline'; …`
  (no external hosts anywhere; `grep -c "cdn" index.html` → 0).
- family-finance.js ~65–66: deepMerge skips `__proto__`, `constructor`,
  `prototype`.
- `isEvalSupported: false` at ~977, ~1229, ~5018 (all three getDocument sites).
- vendor/: chart.umd.js, pdf.min.js, pdf.worker.min.js, xlsx.full.min.js, fonts/.

## Incident 9 — Stale copies: `2f71af7` removal list (abridged from --stat)

Removed 2026-05-12: nested `Documents/**/family-finance-os.html` (2,848 lines),
`Documents/**/family-finance.js` (1,599), `.../handoff/.../README.md`,
`.../project/*` (incl. two more app copies + tweaks-panel.jsx + uploads),
`personal-finance-tracker-handoff.zip`, root `index.html` (1,882 = the Sailaja
dashboard from 3c98fac), root `tweaks-panel.jsx`.

Present again at HEAD (verified 2026-07-19): `Documents/Personal-finance-tracker/`
(family-finance-os.html, family-finance.js, handoff/, zip), `handoff/`
(personal-finance-tracker, Personal-finance-tracker, Personal-finance-tracker-main,
Personal-finance-tracker-main.zip), `personal-finance-tracker-handoff.zip`,
`code-from-github-June2026/` (Personal-finance-tracker-main + .zip).

## Re-mining commands (copy-paste)

```sh
git log --all --format='%h %ci %s'                     # dated master list
git log --oneline --since=2026-07-19                    # anything new
git log -L :syncLoansFromTxns:family-finance.js         # any function's history
git log -L :deleteLoan:family-finance.js
git log -L :load:family-finance.js
git log -L :parseDate:family-finance.js
git show <hash> --stat && git show <hash>               # inspect one incident
git diff 2eea333 3c3ee4c -- family-finance.js           # the Great Rollback diff
git show c8a1144:family-finance.js                      # reference Amex impl
git show 1006309:family-finance.js                      # reference stamping impl
git log -S "toISOString" --oneline -- family-finance.js # trace a string's origin
grep -n "23790\|24999\|bajaj electronics\|apple" family-finance.js  # wart audit
```
