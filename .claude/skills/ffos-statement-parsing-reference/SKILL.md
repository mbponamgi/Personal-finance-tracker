---
name: ffos-statement-parsing-reference
description: >
  Ground-truth reference for Family Finance OS's statement-import pipeline. Load when
  touching BANK_CONFIGS, parseCSV, confirmImport, or any PDF parsing code
  (processPdfParsing, reconstructTextWithCoordinates, parseBankStatementPdf,
  extractCardMetadata, extractNpsBalances); when adding a new bank; when you need
  the pipeline map/column mappings/regexes to UNDERSTAND how a statement import
  misbehaves (0 rows parsed, wrong dates/amounts/categories, duplicates,
  password-locked PDF); or when the task mentions ICICI / Amex / American Express /
  Standard Chartered / SC / NPS statements, XLS/XLSX/CSV import, SheetJS, pdf.js,
  or PDF passwords. NOT for live triage of one specific failure right now
  (→ ffos-debugging-playbook) or for the multi-session hardening campaign/fixture
  suite (→ ffos-import-hardening-campaign).
---

# FFOS Statement Parsing Reference

Everything in this file was re-verified against the live code on **2026-07-19** at
commit `526c55f` (HEAD of `main`). Line numbers are "as of 2026-07-19" and drift with
edits — trust function names over line numbers. Bank export formats drift too (see the
quirk table's commit refs); re-verify a bank's columns against a fresh export before
touching its parser.

All code lives in two files:

- `/Users/mponamgi/Documents/Personal-finance-tracker/family-finance.js` (~5332 lines) — all logic
- `/Users/mponamgi/Documents/Personal-finance-tracker/index.html` (~1957 lines) — markup, CSP, module script for pdf.js

Definitions used below:

- **`D`** — the global app-state object, persisted to `localStorage['family_finance_v1']` by `save()`.
- **row** — an array of trimmed strings, one per cell, as produced by SheetJS (see pipeline step 3).
- **member** — a family-member key (`'madhu'`, etc.). `currentMember === 'all'` collapses to `'madhu'` on import.

## 1. Pipeline map (file-drop → D.transactions)

```
Import Statement page (index.html:1335-1360)
│  bank tabs .bank-tab → onclick selectBank(bank, btn)        [ff.js:5001]
│    sets `selectedBank` (ff.js:4357), shows cfg.hint, clears parsedRows
│  optional #import-pdf-password input (index.html:1345)
│
▼ <input id="csvFile" accept=".csv,.CSV,.xls,.xlsx,.pdf" onchange="parseCSV(event)"> (index.html:1352)
│
parseCSV(event)                                               [ff.js:5119]
│
├─ PDF? (mime application/pdf OR name ends .pdf)
│   └─ processPdfParsing(file, pwd)                           [ff.js:5013]
│       ├─ ensurePdfJS()                                      [ff.js:4367]
│       │    polls for window.pdfjsLib (set by the <script type="module"> at
│       │    index.html:538-543: pdf.js 4.10.38 ESM, workerSrc vendor/pdf.worker.min.js)
│       │    every 50 ms, rejects after 10 s
│       ├─ pdfjs.getDocument({data, password: pwd, isEvalSupported: false})
│       │    PasswordException → inline unlock UI → retryPdfUnlock() [ff.js:5112]
│       ├─ per page: getTextContent → reconstructTextWithCoordinates(textContent) [ff.js:4386]
│       │    (coordinate-based visual-line rebuild — see §4)
│       ├─ selectedBank === 'nps' → extractNpsBalances(textAll) [ff.js:4534]
│       └─ else → parseBankStatementPdf(textAll, selectedBank)  [ff.js:4584]
│                 + extractCardMetadata(textAll, bank) → module-level `detectedCardData`
│                   (only when bank is icici-cc, amex, or sc with "credit card" in text)
│
└─ CSV / Excel path: FileReader.readAsArrayBuffer, then
    ├─ XLSX.read(bytes, {type:'array'}) — SheetJS 0.20.3 parses BOTH Excel AND CSV.
    │    sheet_to_json(first sheet, {header:1, raw:false, defval:''})
    │    → rows of formatted strings, trimmed, empty rows filtered out.
    │    parseCSVLine (ff.js:4989) is only the FALLBACK when XLSX is missing or throws.
    ├─ selectedBank === 'nps' → inline regex scan of all cell text (NOT cfg.parse; see §2)
    └─ else: for each row after cfg.skipRows: cfg.parse(row) from BANK_CONFIGS [ff.js:4825]
         non-null results → `parsedRows` (ff.js:4358) + preview table (first 8)
         0 results → red debug badge dumping rows 0-2 as JSON (your first debugging tool)
│
▼ user clicks #importConfirmBtn "Import All" (index.html:1359)
confirmImport()                                               [ff.js:5215]
│  ├─ nps → writes D.nps[member], snapshotNW(), save(), renderAll(), returns
│  ├─ icici-salary / sc → upsert a D.accounts entry (by name keyword) → txnAccountId
│  ├─ icici-cc / amex   → upsert a D.cards entry (from detectedCardData if PDF) → txnAccountId
│  ├─ dedupe against ALL existing D.transactions on key `date|desc|amount` (see §5)
│  ├─ stamp {id, member, account} on each new txn, force cat==='EMI' → type 'debit'
│  └─ save(); renderAll()
│                └─ renderAll() (ff.js:1786) calls syncLoansFromTxns() (ff.js:1662) FIRST
│                   → EMI auto-detection / loan-stub creation is a renderAll side effect,
│                     not a direct call inside confirmImport
▼
D.transactions (unshifted, then sorted date-desc) → localStorage 'family_finance_v1'
```

**Excel rows vs CSV rows.** Both go through SheetJS, so both arrive as string arrays.
The difference: ICICI's credit-card **XLS** export uses merged cells, and SheetJS puts a
merged region's value only in its anchor cell — the row arrives *sparse*, with data at
columns 0, 4, 8, 12 and `''` (from `defval:''`) in between. That is why `icici-cc`'s
parse reads `row[4] || row[1]` and `row[8] || row[2]`: XLS hits 4/8, a plain CSV of the
same data hits 1/2. Column 12 (Reference Number) is read by neither. Also note
`raw:false` means SheetJS hands you *formatted* strings; for `test_icici.csv` I verified
(2026-07-19, real browser) that dates pass through byte-identical (`"01/05/2026"`), but
a true Excel file with date-typed cells can come out reformatted — check the red debug
badge's row dump before blaming the parser.

## 2. Per-bank quirk table

Verified against `BANK_CONFIGS` (ff.js:4825-4895) on 2026-07-19. "Hint" is the
`cfg.hint` string shown in the UI — it documents the expected header signature.

| key | file types | expected columns (hint) | skipRows | column mapping in parse() | date formats tried (in order) | sign convention | quirks |
|---|---|---|---|---|---|---|---|
| `icici-salary` | CSV, XLS(X), PDF | S No., Value Date, Transaction Date, Cheque Number, Transaction Remarks, Withdrawal Amount(INR), Deposit Amount(INR), Balance(INR) | 1 | offset `o = (row[0]==='' ? 1 : 0)`; desc=`row[4+o]`, date=`row[2+o]`, debit=`row[5+o]`, credit=`row[6+o]` | DD/MM/YYYY, YYYY-MM-DD, MM/DD/YYYY | separate withdrawal/deposit columns; debit wins if both (`debit||credit`, `type: debit>0?'debit':'credit'`) | Real portal exports sometimes have a leading empty column — that's the `o` offset (7e52a70, 2026-05-17). Format has drifted twice before (0d5d8d5, 55c3e72, both 2026-05-17). Rows with both amounts 0 are skipped. |
| `icici-cc` | XLS (portal export), CSV, PDF | Transaction Date, Details, Amount (INR), Reference Number | 1 | desc=`row[4]||row[1]`, date=`row[0]`, amount=`row[8]||row[2]` (merged-cell sparse rows; see §1) | DD/MM/YYYY, YYYY-MM-DD, DD-MM-YYYY | single amount column; credit iff amount string ends `cr`/`cr.` (`/\bcr\.?\s*$/i`) OR desc matches `/payment|refund|cashback/i`; amount = `Math.abs(parseFloat(...))` | Column mapping 0/4/8/12 comes from 990960d (2026-05-17). Amount cleaning here is `parseFloat(amtStr.replace(/[₹,\s]/g,''))`, NOT cleanAmt — a leading `-` survives but is then abs'd. |
| `sc` | CSV, PDF | Date, Transaction, Currency, Deposit, Withdrawal, Running Balance | 1 | desc=`row[1]`, date=`row[0]`, credit=`row[3]`, debit=`row[4]` | DD MMM YYYY, DD/MM/YYYY, YYYY-MM-DD | Deposit column BEFORE Withdrawal (opposite of ICICI); debit wins if both | Mapping from 9c19361 (2026-05-17). Rows with empty `row[1]` skipped. SC PDFs containing the words "credit card" also trigger extractCardMetadata. |
| `amex` | CSV, PDF | Date, Description, Amount, extended details, APPEARS on your statement as, reference | 1 | desc=`row[1]||row[4]`, date=`row[0]`, amount=`cleanAmtSigned(row[2])` | DD/MM/YYYY, YYYY-MM-DD, MM/DD/YYYY | **positive = spend (debit), negative = payment/refund (credit)** — opposite of intuition; also credit if desc matches `/payment|refund|cashback|cr/i` (note: bare `cr` substring — "Concrete Supplies" would be miscategorized as credit) | Amex saga: 9ebb1ed → 71cf4a9 → b8dfc8c → c8a1144 (all 2026-06-14). **WARNING (verified 2026-07-19): commit 3c3ee4c (2026-06-15) accidentally removed the Amex-specific PDF parser and metadata extractor added by that saga — see §4.** |
| `nps` | CSV, XLS(X), PDF | free-form; auto-detects PRAN + Tier I/II balances | 0 | `parse(row) { return null; }` — **never used.** parseCSV short-circuits for `selectedBank==='nps'` before the parse loop and regex-scans the joined cell text for `PRAN` (12 digits) and `tier i/ii ... balance|holding|value` amounts. PDF path uses extractNpsBalances (§4). | n/a | n/a — produces balances, not transactions | Added 2c1fbe6 (2026-05-31). `parsedRows` becomes `[{pran, tier1, tier2}]`; confirmImport's nps branch writes `D.nps[member]` (only non-zero/non-empty fields overwrite). Fixture: `mock_nps.csv`. |

Adding a bank whose CSV needs 0 header rows: `skipRows: 0` works, but note the parse
loop treats the first `skipRows` rows as headers for preview only — parsing correctness
depends solely on `cfg.parse` returning null for junk rows.

## 3. Helper reference (ff.js:4897-4999)

### parseDate(str, fmt) — ff.js:4897

Supported `fmt` tokens (these exact strings, nothing else): `'DD/MM/YYYY'`,
`'MM/DD/YYYY'`, `'YYYY-MM-DD'`, `'DD MMM YYYY'`. Behavior:

1. Trims, strips `"`. Replaces every `-` and `.` with `/` (so `01-05-2026` and
   `01.05.2026` are handled by the DD/MM branch).
2. If the string contains letters (e.g. `05 Jun 2026`), tries `new Date(str)` directly
   — the `fmt` argument is effectively ignored for alphabetic dates.
3. Otherwise splits on `/`; 2-digit years get `+2000`. `DD/MM/YYYY` and `DD MMM YYYY`
   both take the day-first branch; `MM/DD/YYYY` swaps; `YYYY-MM-DD` re-parses with
   `new Date(cleanStr)`.
4. Returns `dt.toISOString().split('T')[0]` or null. Falls through to a second
   string-split attempt and finally bare `new Date(str)`.

**KNOWN BUG (verified in a real browser 2026-07-19, TZ +05:30): every date built via
`new Date(y, m-1, d)` is local midnight, but `toISOString()` converts to UTC — in any
UTC-positive timezone (IST!) the result is the PREVIOUS day.** `parseDate('01/05/2026',
'DD/MM/YYYY')` → `'2026-04-30'`. Every CSV/Excel/PDF import on the owner's machine
stores dates one day early. Dedupe still works (the shift is deterministic), but do not
"fix" this casually: existing saved transactions carry shifted dates, so a fix must ship
with a migration decision — route through ffos-change-control and
ffos-data-model-and-migrations first. (Full incident narrative and triage steps:
ffos-debugging-playbook §2, ffos-failure-archaeology Incident 6 — if the fix
ever lands, all cross-references to this bug across the library need updating.)

### cleanAmt(s) vs cleanAmtSigned(s) — ff.js:4952 / 4958

Both do `parseFloat(String(s).replace(/[₹,"\s]/g,''))` — strip rupee signs, commas,
double-quotes, whitespace, then parseFloat (which tolerates trailing junk like `cr`).

- `cleanAmt`: NaN **or negative** → `0`. Use for unsigned deposit/withdrawal columns.
- `cleanAmtSigned`: NaN → `0`, negatives preserved. Used only by the Amex parser, where
  the sign carries meaning.

### parseCSVLine(line) — ff.js:4989

Character scan: `"` toggles `inQuotes` (no support for RFC-4180 escaped `""` — an
embedded quote is silently dropped), `,` outside quotes splits, every cell is trimmed.
Remember: this runs **only** when SheetJS is unavailable or threw; normally SheetJS
parses even plain CSVs.

### autoCategory(desc, amount) — ff.js:4964

First matching rule wins, in this order (case-insensitive substring regexes on desc):

| order | rule | category |
|---|---|---|
| 1 | `bajaj electronics` | Shopping *(personal-data wart)* |
| 2 | **amount** within ±1 of **23790** | EMI *(personal-data wart — the owner's car EMI, hardcoded; see 34fb4aa and ffos-failure-archaeology)* |
| 3 | swiggy, zomato, dominos, food, restaurant, cafe, biryani, pizza | Food & Dining |
| 4 | uber, ola, rapido, redbus, irctc, flight, airways, airline, train, makemytrip | Travel |
| 5 | amazon, flipkart, myntra, meesho, nykaa, blinkit, zepto, shopping | Shopping |
| 6 | electricity, water, gas, broadband, airtel, jio, bsnl, recharge, utility | Utilities |
| 7 | netflix, prime, hotstar, spotify, youtube, bookmyshow, pvr, inox | Entertainment |
| 8 | pharmacy, hospital, doctor, clinic, medplus, apollo, health, medical | Healthcare |
| 9 | school, college, udemy, coursera, education, tuition, fees | Education |
| 10 | insurance, lic, **bajaj**, hdfc life, star health | Insurance — note `bajaj` here fires BEFORE the EMI rule, so "BAJAJ FINANCE EMI" → Insurance; and `lic` has no word boundary ("CLICK" → Insurance) |
| 11 | mutual fund, sip, zerodha, groww, upstox, nse, bse, dividend | Investment |
| 12 | `\b(charan|himaja|parents|nageswara|nagamma|ponamgi)\b` | Family Transfer *(personal-data wart — the owner's family names, hardcoded)* |
| 13 | emi, loan, finance, bajaj, muthoot, cholamandalam, chola, hdb, home credit, ach/nach/ecs debit, auto debit, mandate, auto-debit | EMI |
| 14 | donation, charity, ngo, relief, temple, church, mosque, foundation | Donation |
| 15 | salary, salaries, **credit**, neft cr, upi cr, rtgs cr | Salary — bare `credit` is very loose ("CREDIT CARD PAYMENT" → Salary if it survives rules 1-14) |
| 16 | (nothing matched) | Other |

The personal-data warts (rules 1, 2, 12, plus the 24999-amount and "apple" exclusions
inside `syncLoansFromTxns`, ff.js:1682-1698) exist because of the 2026-05-17 EMI saga
(~10 commits, d82f4cb → 6188fdc). They are load-bearing for the owner's data; do not
delete them to "clean up", and do not replicate the pattern for new cases — see
ffos-failure-archaeology for the story and ffos-import-hardening-campaign for the
sanctioned way out.

### deriveEmiBaseName / autoLoanKey — ff.js:1644 / 1655

`deriveEmiBaseName` strips UPI/NEFT/IMPS/RTGS/BIL prefixes from slash-delimited
descriptions to get a loan display name. `autoLoanKey(desc, amount)` = that base (or
`'Auto Loan'` for amount≈23790) + `'_'` + amount — the canonical key that matches
auto-created loans to their dismissal tombstones in `D.dismissedAutoLoans`. If you
change one, change both (the comment above autoLoanKey says so; believe it).

## 4. PDF sub-pipeline

### Module loading — ensurePdfJS (ff.js:4367), loadPdfJS (ff.js:926)

pdf.js 4.10.38 is ESM-only; `index.html:538-543` imports `./vendor/pdf.min.js` in a
`<script type="module">` and assigns `window.pdfjsLib` (files deliberately named `.js`
not `.mjs` so IPFS gateways serve them as JS). `ensurePdfJS()` resolves immediately if
`window.pdfjsLib` exists, else polls every 50 ms up to 10 s, and backfills
`GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js'` if unset. `loadPdfJS()` is
just a warm-up wrapper used by the insurance-policy scanner. Because of ESM + strict
CSP, **none of this works from `file://`** — always serve over HTTP
(`python3 -m http.server <port> --directory /Users/mponamgi/Documents/Personal-finance-tracker`).

### Password flow

`processPdfParsing(file, pwd)` passes `pwd` (from `#import-pdf-password`) to
`getDocument`. A `PasswordException` stores the file in `pendingPdfFile` (ff.js:4359)
and renders an inline unlock box with `#inline-pdf-password` + a button calling
`retryPdfUnlock()` (ff.js:5112), which re-invokes processPdfParsing with the typed
password. Wrong password loops back to the same UI with an "Incorrect password" note.

### getDocument options — NEVER remove `isEvalSupported: false`

`getDocument({ data, password, isEvalSupported: false })` — the flag disables pdf.js's
`eval`-based PostScript/font paths and is the defense hardened in commit 6534505
(2026-06-30, pdf.js CVE response). Removing it silently re-enables eval in a
strict-CSP app that parses untrusted bank PDFs. It is a one-line change that will pass
every test; do not let it happen in a refactor.

### reconstructTextWithCoordinates(textContent) — ff.js:4386

Why it exists (commit b3dbc5a, 2026-06-02): `getTextContent()` returns items in
*content-stream order*, not visual order. Bank statements are tables; naive
`items.join(' ')` interleaves cells from different rows, so date, description and
amounts of one transaction never land on the same text line. The algorithm rebuilds
visual lines:

1. Map each item to `{text, x: transform[4], y: transform[5], width}` (PDF user-space
   coordinates; y grows upward).
2. Sort all items by y **descending** (top of page first).
3. Group into lines: an item joins the current line if `|item.y − currentLineY| ≤ 4`
   (the y-tolerance; note `currentLineY` is the *first* item's y of that line, not a
   running mean — slightly slanted scans can split lines).
4. Sort each line by x **ascending**, concatenate left-to-right; a gap
   `item.x − (prev.x + prev.width) > 12` emits `\t` (a column boundary), else a space.
5. Join lines with `\n`.

processPdfParsing falls back to the naive join per page if reconstruction returns ''.

### parseBankStatementPdf(text, bankType) — ff.js:4584

Line-oriented over the reconstructed text. A line is a transaction candidate iff it
matches `dateReg` (`DD/MM/YYYY`, `DD-MM-YYYY`, `DD.MM.YYYY`, or `DD MMM YYYY`) AND
contains ≥1 amount matching `(?:₹\s*)?([\d,]+\.\d{2})` (two decimals mandatory).

- **icici-salary** with ≥3 amounts on the line: last three are assumed
  `[withdrawal, deposit, balance]`; deposit>0 → credit else debit. Description = text
  between the second date (value date) and the first amount.
- **everything else** (generic branch): explicit `Dr/Cr` suffix on an amount decides
  type; else a `-123.45` signed amount → credit (Amex payment style); else first amount
  is the value and `/payment|refund|cashback|reversal|\bcr\b/i` on the whole line →
  credit. Description = text between date-end and first amount.

Rows with amount 0 or unparseable dates are dropped silently; category via
`autoCategory`.

**REGRESSION WARNING (verified by diffing c8a1144 → HEAD on 2026-07-19):** commit
3c3ee4c ("feat: add Form 16 analyzer", 2026-06-15) rewrote family-finance.js from a
stale base and **removed** the Amex-specific PDF branch added in the Amex saga — the
`^(Jan|Feb|...)\s+\d{1,2}` no-year date parser plus its section-header skip-list. At
HEAD, Amex PDF lines like `May 03  UBER INDIA  450.00` match neither dateReg pattern,
so **Amex PDF import almost certainly extracts 0 transactions again**. If you are
asked to fix Amex PDFs, recover the deleted branch with
`git show c8a1144:family-finance.js` (search `amexDateReg`) instead of rewriting from
scratch, and see ffos-failure-archaeology for the full saga.

### extractCardMetadata(text, bankType) — ff.js:4452

Extracts `{name, outstanding, limit, dueDate, minDue}` for the card upsert. Current
HEAD implementation collapses the text (`text.replace(/\s+/g,' ')`) and runs generic
lazy label→number regexes (`total amount due`, `credit limit`, `minimum due`,
`due date`...), with fallbacks: outstanding = max 4-6-digit decimal in the document,
limit defaults to **150000**, minDue defaults to 5% of outstanding.

**THE c8a1144 RULE — never regex across line boundaries for metadata.** The original
"credit limit = 23" bug: Amex prints a two-row table (`Credit Limit Rs  Available
Credit Limit Rs` / `At May 23, 2026  480,000.00 ...`); a regex over collapsed text
stops at the first digit after the label, which is the "23" in "May 23," → limit 23.
The c8a1144 fix (2026-06-14) scanned line-by-line: find the header LINE containing both
labels, take the first decimal number from the NEXT line, with a `>= 10000`
plausibility floor as fallback. **That fix was also clobbered by 3c3ee4c** — HEAD is
back to collapsed-text regexes with the same failure mode. When you touch this
function: work on the multi-line reconstructed text, anchor label and value to lines,
and sanity-floor monetary values. Never widen a `\D*?` gap to make a match work.

### extractNpsBalances(text) — ff.js:4534

Collapsed-text regex cascade: PRAN = first 12-digit number near "PRAN"/"permanent
retirement account number" (last resort: ANY bare 12-digit number — a card number can
false-positive); Tier I / Tier II = first `[\d,]+\.\d{2}` near
`tier i|1` / `tier ii|2` + value/balance/holding keywords, requiring value > 0.
Returns `{pran, tier1, tier2}`; flows into `parsedRows[0]` and then confirmImport's
nps branch.

## 5. confirmImport() exact semantics — ff.js:5215

Verified by driving the real UI with Playwright on 2026-07-19 (script in
`references/verify-import-playwright.cjs`).

**Guard:** `if (!parsedRows.length) return;` — silently does nothing. Consequence at
HEAD: a card PDF that yields metadata but 0 transactions imports NOTHING, not even the
card metadata (another c8a1144 hardening lost in 3c3ee4c — that version imported the
card alone with a "Card details updated" badge).

**NPS branch:** member = `currentMember`, `'all'` → `'madhu'`. Creates
`D.nps[m]` if absent; overwrites only truthy fields (pran/tier1/tier2 — a parsed 0
never wipes a saved balance). Calls `snapshotNW(); save(); renderAll()`.

**Account/card linking (before txn insert):**

- `icici-salary` / `sc`: find `D.accounts` where `member === m` and name contains
  `'icici'` / `'standard chartered'` (lowercased). Missing → push a new account named
  `'ICICI Savings'` / `'SC Savings'` (type savings, balance 0). `txnAccountId` = its id.
  Note the SC keyword is `'standard chartered'` but the created name is `'SC Savings'`
  — a **second** SC import matches neither, so re-import creates... nothing wrong
  actually: the keyword search runs against existing names; `'SC Savings'` does NOT
  contain `'standard chartered'`, so **every SC import session creates a duplicate
  'SC Savings' account**. (ICICI is fine: 'ICICI Savings' contains 'icici'.) Verified
  by reading; treat as a known wart.
- `icici-cc` / `amex`: if `detectedCardData` (PDF imports only), upsert `D.cards` by
  name-substring match on member, updating outstanding/limit/dueDate/minDue; else
  upsert a default card (`'ICICI Credit Card'` / `'American Express'`, limit 150000).
  `txnAccountId` = card id. `detectedCardData` is cleared after use.
- `nps` handled above; any hypothetical other bank leaves `txnAccountId = ''`.

**Dedupe: YES, it exists.** `new Set(D.transactions.map(t => t.date+'|'+t.desc+'|'+t.amount))`;
a parsed row whose `date|desc|amount` key is already present is counted as a dupe and
skipped. Verified live: importing `test_icici.csv` twice (across a page reload) gives
"✓ Imported 0 txns · 3 duplicates skipped" and the count stays 3. Weaknesses: (a) two
*legitimate* identical same-day transactions (two ₹150 coffees) collapse to one; (b)
the key uses the parsed desc verbatim, so any future change to desc extraction
re-imports history as "new"; (c) no per-account scoping — the same txn imported under
two banks dedupes across them.

**Stamping per inserted txn:** `id: Date.now()+Math.random()`, `desc/amount/type/cat`
from the parsed row, `member: m` (`'all'` → `'madhu'`), `date` (already ISO from
parseDate — with the §3 timezone shift), `account: txnAccountId`. `cat==='EMI'` forces
`type:'debit'` (commit 1c8bdd8). Rows are `unshift`ed then the whole array is re-sorted
date-descending.

**Side effects and ordering:** `save()` then `renderAll()` then badge/button update.
`renderAll()` runs `syncLoansFromTxns()` first (ff.js:1786-1787) — that is where EMI
transactions spawn auto-detected loan stubs (principal = EMI×24, rate 10, tenure 24,
`autoDetected:true`, `autoKey`), existing txn categories self-heal to EMI, and the
apple/bajaj-electronics/24999 purges run. `snapshotNW()` is NOT called in the
transaction branch at HEAD (it was in c8a1144's version; lost in 3c3ee4c). Because the
badge updates AFTER renderAll, any exception inside a render function reproduces the
"silent import" bug c8a1144 fixed: data saved but the button freezes on "Import All".

**Post-import UI state:** button becomes "Done ✓" and `disabled=true`, and nothing
re-enables it — parseCSV does not reset it for CSVs. Verified live: selecting a second
file in the same session shows a fresh preview but the button stays dead. **Reload the
page between imports.** (PDF imports do reset visibility via processPdfParsing but not
`disabled`/text either.)

## 6. How to add a new bank — checklist

1. **Read a real export first.** Get the actual header row and 2-3 rows (values
   redacted). Bank portals drift (this repo has 5 ICICI drift commits); never trust a
   format doc from memory.
2. **Build a sanitized fixture CSV** at repo root, modeled on `test_icici.csv`:
   fabricated merchants and amounts, plausible dates. **NEVER commit a real statement
   or real account numbers — real financial data must not enter git.** If the source is
   XLS with merged cells, keep an XLS fixture too (sparse-row behavior differs, §1).
3. **Write expected-results JSON by hand** (in your scratchpad or the fixture dir):
   for each fixture row the exact `{date, desc, amount, type, cat}` you expect —
   including the current −1-day date shift (§3) if you're not fixing it. Decide before
   running, not after.
4. **Add the `BANK_CONFIGS` entry** (ff.js:4825): `label`, `account` key, `hint`
   (paste the real header signature — it's the user-facing debugging aid), `skipRows`,
   `parse(row)`. In `parse`: try date formats in likelihood order via `parseDate`
   chains; use `cleanAmt` for unsigned columns or `cleanAmtSigned` when sign is
   meaningful; return `null` for non-transaction rows (totals, blanks) — null rows are
   counted as "skipped", never errors.
5. **Add the bank tab** in `index.html` inside `<div class="bank-tabs">`
   (index.html:1335-1340): `<button class="bank-tab" onclick="selectBank('your-key',this)">Label</button>`.
6. **Wire confirmImport linking** (ff.js:5235-5293): decide whether the new bank
   upserts a `D.accounts` savings entry or a `D.cards` entry, and extend the
   corresponding branch — otherwise txns land with `account: ''` and never show under
   any account filter. Watch the SC keyword-mismatch wart (§5) — make the created
   account's name contain your search keyword.
7. **If PDFs are in scope**: extend `parseBankStatementPdf` with a bank branch only if
   the generic branch fails on the reconstructed text; obey the c8a1144 rule (§4) for
   any metadata extraction.
8. **Verify in a real browser** — file:// will not work (ESM + CSP):
   ```bash
   python3 -m http.server 7903 --directory /Users/mponamgi/Documents/Personal-finance-tracker
   node .claude/skills/ffos-statement-parsing-reference/references/verify-import-playwright.cjs
   ```
   Adapt the script's bank key / fixture path; diff the dumped `parsedRows` and
   `D.transactions` against your expected JSON. Import the fixture TWICE to prove
   dedupe. Full browser methodology: ffos-browser-verification.
9. **Route the change through change-control gates** (ffos-change-control): the two
   non-negotiables apply — never break saved data (`load()` migrations if you touch txn
   shape) and verify in a real browser before claiming done.

## 7. Worked example: test_icici.csv row 1, end to end

(Canonical expected values for the whole fixture — all 3 rows — live in
`ffos-import-hardening-campaign/references/fixtures/icici-salary/*.expected.json`;
this section teaches the row-by-row MECHANISM, not a second source of truth.)

Fixture row (repo root `test_icici.csv`, line 2):
`1, 01/05/2026, 01/05/2026, , Zomato, 500.00, , 10500.00`

| step | function | what happens |
|---|---|---|
| 1 | parseCSV → SheetJS | Row becomes `["1","01/05/2026","01/05/2026","","Zomato","500.00","","10500.00"]` (verified byte-identical passthrough in-browser 2026-07-19). Header row skipped (`skipRows:1`). |
| 2 | `BANK_CONFIGS['icici-salary'].parse` | `row[0]==='1'` ≠ `''` → offset `o=0`. desc=`row[4]`='Zomato'; date=`parseDate('01/05/2026','DD/MM/YYYY')`. |
| 3 | parseDate | day-first branch → `new Date(2026,4,1)` local midnight IST → `toISOString()` → **`'2026-04-30'`** (the §3 timezone bug, live-verified — statement says 1 May). |
| 4 | cleanAmt | debit=`cleanAmt('500.00')`=500; credit=`cleanAmt('')`=0 → amount 500, type 'debit'. |
| 5 | autoCategory('Zomato', 500) | rule 3 (`zomato`) → `'Food & Dining'`. |
| 6 | parsedRows | `{"date":"2026-04-30","desc":"Zomato","amount":500,"type":"debit","cat":"Food & Dining"}` |
| 7 | confirmImport | No existing ICICI account → creates `{name:'ICICI Savings', member:'madhu', type:'savings', balance:0, ...}`; dedupe key `2026-04-30|Zomato|500` unseen → insert. |

Actual object observed in `localStorage['family_finance_v1'].transactions` after
clicking Import All in the real UI (Playwright, 2026-07-19):

```json
{
  "id": 1784444155300.2175,
  "desc": "Zomato",
  "amount": 500,
  "type": "debit",
  "cat": "Food & Dining",
  "member": "madhu",
  "date": "2026-04-30",
  "account": 1784444155299.597
}
```

(`account` points at the auto-created 'ICICI Savings' entry. Badge read "✓ Imported 3
txns · 0 duplicates skipped"; a second import of the same file reported 3 duplicates
skipped and left the count at 3. `D.loans` stayed empty — no EMI-shaped rows in the
fixture.)

## When NOT to use this skill

- **An import is misbehaving right now and you're debugging live** → start with
  ffos-debugging-playbook (this file is the map, that one is the method).
- **Systematically hardening the import pipeline** (dedupe scoping, timezone fix,
  removing personal-data warts) → ffos-import-hardening-campaign owns the roadmap.
- **What a field means financially** (PRAN, Tier I/II, NEFT vs IMPS, Dr/Cr, EMI) →
  indian-finance-reference.
- **Why the warts exist / the incident stories** (EMI saga, Amex saga) →
  ffos-failure-archaeology.
- **Running the app / server / Playwright environment details** → ffos-env-run-deploy
  and ffos-browser-verification.

## Provenance and maintenance

- All function line numbers: re-verify with
  `grep -n "function parseCSV\|function confirmImport\|BANK_CONFIGS = " family-finance.js` — stated as of 2026-07-19, commit 526c55f.
- Bank column mappings (§2): re-verify against `BANK_CONFIGS` in code AND a fresh
  portal export before editing any parser — formats drifted 2026-05-17 (×3 banks) and
  can drift again.
- Timezone −1-day bug (§3) and the worked-example object (§7): re-run
  `references/verify-import-playwright.cjs` against a live `python3 -m http.server`.
- The 3c3ee4c regression claims (§4, §5): re-verify with
  `git diff c8a1144 HEAD -- family-finance.js | grep -i amex` — if someone has since
  restored the Amex branches, strike those warnings.
- Dedupe behavior (§5): re-verify by importing `test_icici.csv` twice via the
  reference script.
- `isEvalSupported: false` (§4): confirm still present with
  `grep -n "isEvalSupported" family-finance.js` after ANY pdf.js upgrade.
