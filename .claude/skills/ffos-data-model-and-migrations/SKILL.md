---
name: ffos-data-model-and-migrations
description: >
  Complete catalog of Family Finance OS's persisted data model (the D store in
  family-finance.js) and the migration discipline that protects real family data.
  Load this skill when: adding, renaming, or removing ANY field on D; adding a new
  entity type (new top-level key / new modal); writing or reviewing a migration;
  touching load(), save(), or deepMerge(); authoring or interpreting seed/store
  JSON — the schema and content of test data (the MECHANICS of injecting it into
  localStorage → ffos-browser-verification); or interpreting the contents of the
  'family_finance_v1' localStorage key.
  Also covers the member model (MEMBERS, filterByMember, 'joint', 'all') and a
  canonical minimal seed JSON for browser tests.
---

# FFOS Data Model and Migrations

All user data for this app lives in **one localStorage key**: `family_finance_v1`,
held in memory as the global object `D` in `family-finance.js`. There is no server,
no IndexedDB, no build step. If you corrupt `D` or ship a schema change without a
migration, you destroy the family's real financial records. That is non-negotiable
rule #1 of this repo: **never break saved data**.

All line numbers below are **as of 2026-07-12** (family-finance.js = 5332 lines,
index.html = 1957 lines). Re-verify with the commands in "Provenance and
maintenance" at the bottom before trusting them.

## 1. Storage layout and lifecycle

| Piece | Location (2026-07-12) | Behavior |
|---|---|---|
| `KEY = 'family_finance_v1'` | family-finance.js:4 | The one key holding all financial data |
| `let D = {…}` | lines 20–43 | Default schema literal — the source of truth for top-level keys |
| `load()` | lines 45–60 | `D = deepMerge(D, JSON.parse(stored))`, then in-place migrations. Called once at line 5327 (script bottom), before `renderAll()` |
| `deepMerge(target, source)` | lines 62–74 | Recursive default-filling merge (semantics below) |
| `save()` | lines 76–81 | `localStorage.setItem(KEY, JSON.stringify(D))` + updates the "Saved HH:MM" label |
| `upsert(arr, item)` | line 1317 | Replace-by-`id` or push — how every `save*()` writes into array keys |

A second, unrelated localStorage key `numbers_hidden` (line 86) stores the
hide-balances UI toggle. It is not part of `D` and needs no migration care.

`load()` swallows all errors (`catch(e) {}`): a JSON parse failure silently leaves
the default empty `D`, and the next `save()` **overwrites the stored blob**. Never
hand-edit the stored JSON into an invalid state on a machine with real data.

### deepMerge semantics — read this before touching any schema

Verified by running the function standalone (node) on 2026-07-12:

1. **Objects merge recursively.** Keys present in the default but missing from
   storage keep their default. This is why adding a brand-new top-level key, or a
   new field inside an *object* key (e.g. a new `budgets` category, a new `epf`
   field), needs **no migration** — the default fills in automatically.
2. **Arrays are REPLACED, not merged.** `Array.isArray(source[key])` fails the
   object-recursion test, so the stored array is assigned wholesale (by reference,
   not cloned). Consequence: a new field on array *items* (accounts, loans, txns…)
   is NOT filled in by deepMerge — old items simply lack the field. That is
   exactly what caused the June 2026 member-segregation bug (see §4 and
   ffos-failure-archaeology). **New per-item fields always need a migration or
   tolerant readers.**
3. **`null` and scalars overwrite.** A stored `null` replaces a default object
   (`null` fails the `source[key] &&` truthiness check).
4. **A stored object overwrites a default array** by recursing into `{}` — the key
   becomes a plain object. This is how the legacy object-shaped `D.rewards`
   survives loading (then `migrateRewards()` fixes it lazily, §4).
5. **Prototype-pollution guard** (line 66): keys `__proto__`, `constructor`,
   `prototype` are skipped entirely (hardening added in commit 6534505). Don't
   remove it, and replicate it in any new merge/import code path.
6. Unknown stored keys are **preserved** (copied through). Migrations must keep
   this property: never delete keys you don't recognize.

## 2. Schema catalog — every top-level key of D

Confirmed against the `D` literal (lines 20–43) on 2026-07-12. 18 keys. "Written
by" names the functions that assign the fields; derive field lists from those
functions, never from memory.

**ID convention:** manual `save*()` uses `Date.now()` (integer ms). Import/auto
paths use `Date.now() + Math.random()` (non-integer float) — so never assume
integer ids; `upsert`/lookups compare with `===` on the stored value, and some
delete paths deliberately use `==` for string-vs-number onclick ids (deleteLoan,
line 699).

### Array keys (per-item records)

**`accounts`** — written by `saveAcc()` (line 552), auto-created by
`confirmImport()` (line 5235, ICICI/SC savings import). Read by nearly everything
(net worth, dashboards, txn account tags).

| Field | Type | Meaning |
|---|---|---|
| id | number | unique id |
| name | string | e.g. "ICICI Salary" |
| member | string | member key (§3) |
| type | string | "Salary" \| "Savings" \| "Current" \| "FD" \| "RD" (import writes lowercase `'savings'`) |
| balance | number | current balance ₹ |
| credits, debits | number | monthly in/out ₹ (manual entry) |
| updated | string | `todayStr()` — locale "DD Mmm YYYY" |

**`cards`** — written by `saveCard()` (591); upserted by `confirmImport()`
(5253) using `extractCardMetadata()` (4452) output (`{name, outstanding, limit,
dueDate, minDue}`; limit defaults 150000, minDue defaults 5% of outstanding).

| Field | Type | Meaning |
|---|---|---|
| id | number | unique id |
| name | string | card name |
| member | string | member key |
| outstanding | number | current dues ₹ (a liability in net worth) |
| limit | number | credit limit ₹ |
| dueDate | string | "YYYY-MM-DD" or "" |
| minDue | number | minimum due ₹ |

**`rewards`** — written by `saveReward()` (609), migrated by `migrateRewards()`
(4803). **No `member` field today**: the reward member select was removed in
commit 3c3ee4c and `renderRewards()` (2421) does not call `filterByMember()` —
rewards are global. (Items stamped `member:'madhu'` by the old migration may
still carry that field harmlessly.)

| Field | Type | Meaning |
|---|---|---|
| id | number | unique id |
| name | string | card/program name |
| program | string | key into `REWARD_PROGRAMS`, via `detectRewardProgram()` (4789), e.g. 'amex', 'icici-emeralde', 'default' |
| points | number | point balance |
| rate | number | ₹ per point (default 0.25) |
| expiry | string | "YYYY-MM-DD" or "" |
| tier | string | free text |

**`investments`** — written by `saveInv()` (757). Two variants by `type`
(`isEsopType()`: 'ESOP'/'RSU'). `cost`/`value` are ALWAYS INR (rounded); FX
originals are kept separately.

| Field | Type | Meaning |
|---|---|---|
| id, name, member | | as usual |
| type | string | "Mutual Fund" \| "Stock" \| "Fixed Deposit" \| "PPF" \| "SGB" \| "ESOP" \| "RSU" \| "Other" |
| currency | string | ISO code, default 'INR' |
| exchangeRate | number | rate to INR used at save (1 for INR); refreshed by `saveFxRates()` (1377) |
| cost, value | number | invested / current, in ₹ |
| *non-ESOP:* costFX, valueFX | number | amounts in native currency |
| *non-ESOP:* purchaseDate | string | "YYYY-MM-DD" or "" |
| *ESOP/RSU:* grantDate, totalUnits, grantPrice, currentPrice | | grant terms; prices in native currency |
| *ESOP/RSU:* vestingMonths (48), cliffMonths (12), vestingFrequency | | 'monthly'\|'quarterly'\|'annual'; `value` = vested units × currentPrice × fx (`calcVestedUnits`, 1326) |

**`insurance`** — written by `saveIns()` (809), `saveScannedTxns()` (888,
txn-scan import), `saveAIResults()` (1052, document scan). The two import paths
stamp `member: currentMember === 'all' ? 'madhu' : currentMember`.

| Field | Type | Meaning |
|---|---|---|
| id, name, member | | as usual |
| type | string | 'life' \| 'health' \| 'auto' \| 'other' |
| insurer, polno | string | insurer name, policy number |
| cover, premium | number | sum assured ₹, premium ₹ |
| startYear, endYear | number \| "" | policy years |
| dueDate | string | next premium due "YYYY-MM-DD" |
| freq | string | 'annual' \| 'half-yearly' \| 'quarterly' \| 'monthly' \| 'single' |
| nominee, nomineeRel | string | nominee details |
| covered | string[] | covered persons (comma-split) |
| vehicle, notes | string | free text |
| source | string | 'manual' \| 'txn' \| 'doc' |

**`properties`** — written by `saveProp()` (636).

| Field | Type | Meaning |
|---|---|---|
| id, name, member | | as usual |
| type | string | 'flat' \| 'house' \| 'plot' \| 'commercial' \| 'agri' |
| location | string | city/area |
| cost, value | number | purchase cost / current value ₹ |
| purchaseDate | string | "YYYY-MM-DD" |
| area | number | sq ft |
| propTax, propTaxDue | number, string | annual property tax ₹, due date |
| linkedLoans | number[] | loan ids (checkbox multi-select) |
| notes | string | free text |

**`loans`** — written by `saveLoan()` (665) and auto-created by
`syncLoansFromTxns()` (1662) from EMI-looking transactions (EMI = Equated
Monthly Installment, the fixed monthly loan payment). See
ffos-statement-parsing-reference for detection details.

| Field | Type | Meaning |
|---|---|---|
| id, name, member | | auto-created loans get float ids and `member` from currentMember (or 'madhu') |
| type | string | 'home' \| 'car' \| 'personal' \| 'education' \| 'other' |
| lender | string | bank/NBFC; auto = 'Auto-detected from bank' |
| principal, outstanding | number | original / remaining ₹ (outstanding is the net-worth liability) |
| emi | number | monthly payment ₹ |
| rate | number | interest % p.a. |
| emiDay | number | day of month (1–31) EMI debits |
| tenure | number | months |
| intPaid | number | cumulative interest paid ₹ (feeds 24b tax deduction) |
| startDate | string | "YYYY-MM-DD" |
| autoDetected | bool (optional) | true for detector-created loans; preserved on edit |
| autoKey | string (optional) | stable key `<baseName>_<amount>` from `autoLoanKey()` (1655) linking loan to source txn — prevents re-detection duplicates |

**`dismissedAutoLoans`** — string[] of tombstone keys, written by `deleteLoan()`
(697), read by `syncLoansFromTxns()`. Three key formats coexist: `autoKey`
format (`Name_12345`), `name_emi`, and `amt:<roundedAmount>`. Keeps deleted
auto-loans deleted. Never prune this array in a migration.

**`gold`** — written by `saveGold()` (733). Item value is *derived*, never
stored: `weight × (purity/24) × D.goldRate` (`calcGoldValue`, 1461).

| Field | Type | Meaning |
|---|---|---|
| id, name, member | | as usual |
| form | string | 'jewellery' \| 'coin' \| 'digital' |
| weight | number | grams |
| purity | number | karat, default 22 |
| cost | number | purchase cost ₹ |
| notes | string | free text |

**`transactions`** — written by `saveTxn()` (1279, unshift) and
`confirmImport()` (5215, unshift + sort desc by date). Deduped on import by the
composite key `date|desc|amount`. Also **mutated in place** by
`syncLoansFromTxns()` (recategorizes matching txns to cat 'EMI', forces
type 'debit').

| Field | Type | Meaning |
|---|---|---|
| id | number | unique id |
| desc | string | raw description — ALWAYS pass through `esc()` before innerHTML |
| amount | number | positive ₹ (sign carried by `type`) |
| type | string | 'debit' \| 'credit' |
| cat | string | category: Food & Dining, Travel, Shopping, Utilities, Entertainment, Healthcare, Education, Insurance, Investment, Salary, EMI, Family Transfer, Donation, Other (see `autoCategory()`, 4964) |
| member | string | member key |
| date | string | "YYYY-MM-DD" |
| account | number \| string | account/card `id`; `''` = cash/unassigned; LEGACY string keys ('icici-salary', 'icici-cc', 'sc', 'amex') still exist in old data — `getTransactionAccountName()` (126) tolerates all three forms. Don't "clean up" legacy values without a migration |

**`nwHistory`** — written only by `snapshotNW()` (1469), which most `save*()`
functions call. One entry per month label, capped at 12 (oldest shifted off).
Note: snapshot content depends on `currentMember` at save time (fields other
than `v` are member-filtered) — a known quirk, don't "fix" silently.

| Field | Type | Meaning |
|---|---|---|
| m | string | month label, en-IN "Mmm-YY" (e.g. "Jul-26") — the upsert key |
| v | number | total family net worth ₹ |
| assets, liabs | number | asset/liability totals (member-filtered) |
| inv | number | investments value |

### Object / scalar keys

**`goldRate`** — number, ₹ per gram of 24K gold, default 7500. Written by
`goldRateChanged()` (1308).

**`fxRates`** — `{ [currencyCode]: rateToINR }`, e.g. `{USD: 84.2}`. Written by
`saveFxRates()` (1377) and opportunistically by `saveInv()` (790).

**`epf`** — **FLAT single object** (EPF = Employees' Provident Fund, the
salary-deducted retirement corpus; see indian-finance-reference). Written whole
by `saveEPF()` (1117). NOT per-member: `calcNW()` (1455) reads `D.epf.balance`
directly, and the member dashboard counts EPF only in the 'all' view (line 1826).
⚠ History: commit 6e00172 (June 2026) briefly made epf per-member
(`D.epf = {madhu: {…}}`) with a load() migration; commit 3c3ee4c reverted it to
flat AND deleted that migration. If you ever see `D.epf.madhu` in stored data
(saved during that window), current code reads `balance` as 0 — the data is
preserved but invisible. Check for this shape before assuming epf is empty.

| Field | Type | Meaning |
|---|---|---|
| uan | string | Universal Account Number |
| balance | number | total corpus ₹ |
| empShare, erShare | number | employee / employer contributions ₹ |
| monthly | number | monthly contribution ₹ |
| updated | string \| null | `todayStr()` |
| birthYear, retireAge | number | for corpus projection (retireAge default 60) |

**`gratuity`** — **FLAT single object**, written whole by `saveGratuity()`
(1095). Value derived by `getGratuityValue()` (1437): `actualAccrued` if > 0,
else formula `basicDA × 15/26 × years since joiningDate`.

| Field | Type | Meaning |
|---|---|---|
| employer | string | employer name |
| joiningDate | string | "YYYY-MM-DD" |
| basicDA | number | monthly Basic + DA ₹ |
| actualAccrued | number | employer-stated accrued gratuity ₹ (overrides formula) |

**`nps`** — **PER-MEMBER map**: `{ [memberKey]: {…} }` (NPS = National Pension
System). Written by `saveNPS()` (1150) and the NPS-statement branch of
`confirmImport()` (5217). Aggregated across members by `getNpsData()` (3010).

| Field (per member) | Type | Meaning |
|---|---|---|
| pran | string | Permanent Retirement Account Number |
| tier1, tier2 | number | balances ₹ (tier1 is the locked retirement account) |
| fyContrib | number | this-FY contribution ₹ (drives the 80CCD(1B) ₹50k gauge) |
| monthly | number | monthly SIP ₹ |
| equityPct | number | equity allocation %, default 75 |

**`tax`** — **PER-MEMBER map**: `{ [memberKey]: {…} }`. Written by `saveTax()`
(1186) and `saveForm16()` (1262) — both do a *partial* `Object.assign` merge
over the member's existing record, so the two forms coexist. Defaults filled by
`currentTax()` (1167). Caps are enforced at save time (noted below). Field
meanings (80C, 24b, HRA…) are in indian-finance-reference.

| Field (per member) | Written by | Meaning |
|---|---|---|
| gross | both | gross salary ₹ |
| s80c (≤150000), s80ccd (≤50000), s24b (≤200000) | both | 80C / NPS 80CCD(1B) / home-loan-interest deductions |
| s80d | both | health premium deduction (saveTax caps 75000, saveForm16 caps 100000) |
| hra | both | HRA exemption ₹ |
| employer, tan, ay | saveForm16 | employer name, TAN, assessment year |
| exemptOther, profTax | saveForm16 | sec-10 exemptions, professional tax |
| s80ccd2, s80e, s80g, s80tta (≤10000), tds | saveForm16 | employer NPS, education-loan interest, donations, savings interest, tax deducted |

**`budgets`** — flat map `{ [categoryName]: monthlyBudget₹ }` over the 11
categories in the default literal (lines 37–41). Written by `saveBudget()`
(1298). New default categories propagate automatically via deepMerge (object
merge). Note: txn categories Salary / Family Transfer / Donation have no budget
row by design.

## 3. Member model

Defined at family-finance.js:6–10 (as of 2026-07-12):

- `MEMBERS = ['madhu','sailaja','parents','charan','himaja','joint']`
- `MEMBER_NAMES`, `MEMBER_COLORS` — display maps keyed the same.
- `'joint'` is a real, storable member value meaning "belongs to the family".
- `currentMember` (default `'all'`) is a **UI filter, never stored on items**.
  `'all'` is a pseudo-member: it is not in MEMBERS and must never be written to
  an item's `member` field.

`filterByMember(arr)` (line 200):

```js
if (currentMember === 'all') return arr;
return arr.filter(item => item.member === currentMember || item.member === 'joint');
```

Consequences you must design for:
- **'joint' items appear in every individual member's view** plus 'all'.
- **An item with a missing/unknown `member` field is visible ONLY in the 'all'
  view** and vanishes from every individual view. There is NO stamping fallback
  in load() anymore (the `member='madhu'` stamping shipped in commit 1006309 was
  removed in 3c3ee4c; whether the owner's real data had passed through it before
  removal is unverified — the store lives only in the owner's browser). So today:
  any new code path that creates items MUST set `member`, and seeds/fixtures
  MUST include it.
- Write paths active while viewing 'all' default the member to `'madhu'`
  (pattern `currentMember === 'all' ? 'madhu' : currentMember` — grep it; 8
  sites as of 2026-07-20).
- `rewards` and the flat `epf`/`gratuity`/`budgets`/`goldRate` are global (not
  member-filtered); `nps` and `tax` are per-member maps keyed by member.

## 4. Migration playbook

Migrations run **inside `load()`** (lines 45–60), after `deepMerge`, in place on
`D`, before any render. They are the ONLY sanctioned way to change the shape of
stored data.

### Existing migrations (worked examples — verify by reading load())

**1. NPS flat → per-member** (load(), lines 51–53):

```js
if (D.nps && D.nps.tier1 !== undefined) {
  D.nps = { 'madhu': Object.assign({}, D.nps) };
}
```

Anatomy: *detect the old shape by a sentinel field* (`tier1` only exists at the
top level in the flat shape) → *transform in place* → naturally **idempotent**
(after migrating, `D.nps.tier1` is undefined, so a second run is a no-op —
verified by running it twice standalone, 2026-07-12).

**2. Tax flat → per-member** (load(), lines 54–57): same pattern, sentinel is
`'gross' in D.tax`. Also idempotent (post-migration top level has member keys
only).

**3. Rewards object → array** — a *lazy* migration living OUTSIDE load():
`migrateRewards()` (4803), called at the top of `renderRewards()`,
`saveReward()`, and `openRewardModal()`. Sentinel: `Array.isArray(D.rewards)`
returns early. It converts the legacy `{amex: {...}, 'icici-cc': {...}}` map to
the array shape and calls `save()`. Prefer load()-based migrations for new work
— lazy migrations must be re-invoked at every touch point and are easy to miss.

**4. Removed migrations — a cautionary tale.** Commit 1006309 (June 2026)
stamped `member='madhu'` onto legacy items across 9 arrays in load(); commit
6e00172 migrated epf flat→per-member. Commit 3c3ee4c later DELETED both from
load() (and reverted epf to flat). What is verifiable (as of 2026-07-20): the
stamping migration is absent at HEAD, so any member-less legacy items in the
owner's store are invisible in individual member views today. Whether the
owner's real data had already been migrated and re-saved before the removal is
NOT verifiable from the repo — the store lives only in the owner's browser and
has never been audited for pre-rollback shapes (see the epf warning in §2).
**Do not remove a migration
from load() unless you can prove every real dataset has passed through it**; the
cost of leaving one in is a few lines, the cost of removing one early is silent
data invisibility (see the epf warning in §2, and ffos-failure-archaeology for
the full saga).

### Checklist: shipping a schema change with a migration

Every field rename/move/retype on stored data goes through this. (Brand-new
fields on *object* keys and brand-new top-level keys need no migration — §1
point 1. Brand-new fields on *array items* DO — §1 point 2 — unless every
reader tolerates their absence.)

1. **Design the detection.** Pick a sentinel that is true for the old shape and
   provably false for the new one (`'gross' in D.tax`, `!Array.isArray(...)`,
   `item.oldField !== undefined`). Never key off app version numbers — there
   are none.
2. **Transform in place inside load()**, after `deepMerge`, before return. Copy
   values; never drop keys you don't recognize (a user may be rolling back and
   forward between versions).
3. **Prove idempotency**: running load() twice on the same stored blob must
   yield the same D. (Trivial if step 1's sentinel is false post-migration.)
4. **Never delete unknown keys**, and never `localStorage.removeItem` anything.
5. **Update the default `D` literal** (lines 20–43) to the NEW shape, and every
   writer (`save*`, importers) and reader of the field.
6. **Verify in a real browser** (non-negotiable rule #2): serve the repo
   (`python3 -m http.server 7890 --directory .` from the repo root — file://
   fails under ESM+CSP; house port convention is 789x, see
   ffos-env-run-deploy), seed the OLD-shape JSON into localStorage via
   Playwright (§6 snippet; mechanics in ffos-browser-verification), reload, and
   assert the post-load in-memory shape AND that the UI shows the migrated
   values. Then perform one save-triggering action and assert the re-serialized
   localStorage blob is the new shape. Full proof recipe:
   ffos-proof-and-analysis-toolkit.
7. Run it twice (idempotency), and once with an empty/missing key (fresh-user
   path), and once with current-shape data (no-op path).
8. `npm run lint` — necessary, never sufficient.

## 5. Checklist: adding a new entity type end-to-end

Model it on an existing simple entity (gold is the cleanest; grep `saveGold`,
`renderGold`, `goldModal`). Steps:

1. **Default in `D`** (lines 20–43): add `myThings: []` (or `{}`). Because
   deepMerge fills missing keys from defaults, **existing users need NO
   migration for a brand-new key** — on their next load the default appears,
   and their next save persists it.
2. **Write path**: `saveMyThing()` building the full object literal —
   `id: id ? +id : Date.now()`, a **`member` field** (mandatory for anything
   member-filterable, else it vanishes from individual views, §3), then
   `upsert(D.myThings, item); snapshotNW(); save(); renderAll(); closeModal(...)`.
   Include `snapshotNW()` only if the entity affects net worth — and then also
   add it to `calcNW()` (1448) and the overview asset math (~1810).
3. **Delete path**: `deleteMyThing(id)` filtering by id, then
   `snapshotNW(); save(); renderAll()`.
4. **Render path**: `renderMyThings()` reading `filterByMember(D.myThings)`,
   registered inside `renderAll()` (1786). **Every user-entered string must go
   through `esc()`** (line 108) before landing in innerHTML; auto-detected
   strings additionally through `stripTags()` (110).
5. **Modal markup in index.html**: form inputs with `m-mt-*` ids, a member
   `<select>` copied from an existing one (e.g. `m-acc-member`, index.html:1381
   — six options madhu…joint), open/close via `openModal/closeModal`. Plus a nav
   entry and view section if it gets its own page (`PAGE_TITLES`, line 209).
6. **Verify in a real browser** (serve + Playwright), including: create, edit,
   delete, member filter on/off, reload persistence, and `<script>alert(1)</script>`
   as the name (must render inert).
7. Cross-check gates in ffos-change-control before committing.

## 6. Canonical minimal seed

A small, hand-derivable, schema-valid dataset lives at
`references/minimal-seed.json` (relative to this skill). It contains: 2 accounts
(madhu, sailaja), 1 card, 1 reward, 1 investment, 1 joint insurance policy,
1 joint property linked to 1 joint home loan, 1 gold item, flat epf/gratuity,
per-member `nps.madhu` and `tax.madhu`, and 2 transactions (one linked to an
account id, one to a card id). Every item carries a `member` field (§3). The
transaction descriptions deliberately avoid the EMI/loan keyword regex and the
magic amounts 23790/24999 so `syncLoansFromTxns()` won't spawn loan stubs.

Inject it with Playwright (server must already be running — see
ffos-env-run-deploy; full test patterns in ffos-browser-verification):

```js
// seed-check.mjs — run FROM THE REPO ROOT: node seed-check.mjs
// (playwright resolves from the repo's node_modules; if the script lives
//  outside the repo tree, set NODE_PATH=/Users/mponamgi/Documents/Personal-finance-tracker/node_modules
//  — see ffos-browser-verification.)
import { chromium } from 'playwright';
import { readFileSync } from 'fs';
const seed = readFileSync(
  '/Users/mponamgi/Documents/Personal-finance-tracker/.claude/skills/ffos-data-model-and-migrations/references/minimal-seed.json', 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage();
// Must be set BEFORE the app's scripts run — addInitScript, not evaluate:
await page.addInitScript(([k, v]) => localStorage.setItem(k, v),
  ['family_finance_v1', seed]);
await page.goto('http://localhost:7890/index.html');
// Post-load, post-migration in-memory state (D is a top-level `let`, still
// visible to evaluate because it shares the page's global scope):
const d = await page.evaluate(() => JSON.parse(JSON.stringify(D)));
console.log(Object.keys(d), d.nps, d.transactions.length);
await browser.close();
```

Browser-console equivalent (manual testing):
`localStorage.setItem('family_finance_v1', JSON.stringify(seed)); location.reload();`

To test a MIGRATION, seed the OLD shape instead (e.g. set `"nps": {"tier1": 400000, "pran": "X"}`
flat) and assert `d.nps.madhu.tier1 === 400000` after goto. Note load() itself
does not save: localStorage keeps the old shape until the first user action
triggers `save()` — assert both stages.

## When NOT to use this skill

- Why the architecture is localStorage-only / zero-build → **ffos-architecture-contract**
- What EPF/NPS/80C/HRA financially *mean*, slab math → **indian-finance-reference**
- How transactions get parsed out of bank statements → **ffos-statement-parsing-reference**
- Playwright/server mechanics for tests → **ffos-browser-verification**; proof recipes → **ffos-proof-and-analysis-toolkit**
- The full member-segregation post-mortem → **ffos-failure-archaeology**
- Pre-commit gates and review discipline → **ffos-change-control**
- A bug you're chasing right now → **ffos-debugging-playbook**

## Provenance and maintenance

All facts verified 2026-07-12 against working tree at commit 526c55f by reading
the code and empirically testing deepMerge/migrations in node. Re-verify with
(run from repo root):

- D's top-level shape: `sed -n '20,43p' family-finance.js`
- load()/deepMerge/save and current migrations: `sed -n '45,81p' family-finance.js`
- All writer functions: `grep -n "^function save\|^function delete\|function upsert\|function migrateRewards\|function confirmImport\|function syncLoansFromTxns\|function snapshotNW" family-finance.js`
- Member model: `grep -n "const MEMBERS\|function filterByMember" family-finance.js` and default-member sites: `grep -n "currentMember === 'all' ? 'madhu'" family-finance.js`
- Migration history: `git log --oneline -S "member = 'madhu'" -- family-finance.js` and `git show 1006309 3c3ee4c --stat`
- Enum values (selects): `grep -n 'id="m-prop-type"' -A3 index.html` (same pattern for other `m-*-type` selects)
- deepMerge array-replacement proof: extract lines 62–74 into a node script and run `deepMerge({a:[1,2]}, {a:[9]})` → `{a:[9]}`

If any grep result contradicts this file, the CODE wins — update this skill.
