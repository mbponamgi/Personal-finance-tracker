---
name: indian-finance-reference
description: >-
  Indian personal-finance domain theory as implemented in this codebase. Load
  when touching tax, EPF, NPS, gratuity, Form 16, HRA, or 80C code; when
  interpreting fields like s80ccd2, PRAN, UAN, basicDA, goldRate, fxRates;
  when working out what a tax number SHOULD MEAN or whether a regime-comparison
  is computed correctly (numeric proof / verification scripts →
  ffos-proof-and-analysis-toolkit); or for any task
  mentioning Indian finance terms — regime (old/new), cess, lakh, crore,
  FY/AY, Chapter VI-A, TDS, 87A rebate, 24(b), 80D, LTCG/STCG, EMI,
  prepayment, ESOP/RSU vesting, Tier I/Tier II.
---

# Indian Finance Reference (as implemented in Family Finance OS)

Domain-theory pack for engineers who know JavaScript but not Indian personal
finance. Every concept below is tied to the exact function/field implementing
it in `family-finance.js`. Line numbers are approximate as of 2026-07-12 —
navigate by function name, not line.

**Two markers used throughout:**
- **[CODE]** = verified behavior of this codebase (ground truth: the code).
- **[LAW]** = the underlying statutory rule (domain knowledge). Where the code
  simplifies or diverges from law, it is called out explicitly.

**When NOT to use this skill:** PDF/CSV parsing mechanics (regexes, pdf.js,
text reconstruction) → `ffos-statement-parsing-reference`. Proving/verifying a
computation numerically → `ffos-proof-and-analysis-toolkit`. Field shapes and
migrations of `D` → `ffos-data-model-and-migrations` (they catalog SHAPE; this
skill explains MEANING). Changing any finance math → `ffos-change-control`
gates apply, and verify in a real browser (`python3 -m http.server` +
Playwright; `file://` fails).

---

## 0. Vocabulary (every term used below)

| Term | Meaning |
|---|---|
| **FY** (Financial Year) | India's tax year: **Apr 1 – Mar 31**. "FY 2025-26" = Apr 2025 – Mar 2026. |
| **AY** (Assessment Year) | The year the FY's income is assessed/filed: **AY = FY + 1**. FY 2025-26 → AY 2026-27. |
| **lakh (L)** | ₹1,00,000 = 100,000. **crore (Cr)** = ₹1,00,00,000 = 10,000,000 = 100 lakh. |
| **Indian digit grouping** | Last 3 digits, then groups of 2: 15,00,000 (not 1,500,000). |
| **Regime** | A taxpayer's choice of slab schedule: **old regime** (lower exemption threshold, many deductions allowed) vs **new regime** (wider slabs, almost no deductions; the statutory default since FY 2023-24). Chosen per person, per year. |
| **Slab** | Progressive tax bracket. Only income *within* a slab is taxed at that slab's rate. |
| **Cess** | Health & Education Cess: flat **4% surcharge on the tax amount** (not on income), after rebate. |
| **TDS** | Tax Deducted at Source — the employer withholds tax from salary monthly and remits it. At filing, TDS − actual liability = refund (or balance payable). |
| **Form 16** | The employer's annual TDS certificate. Part A: employer TAN, TDS deposited. Part B: salary breakup, exemptions, Chapter VI-A deductions, tax computation. |
| **TAN** | Tax Deduction Account Number of the employer — format 4 letters + 5 digits + 1 letter. |
| **§10(13A) HRA** | House Rent Allowance exemption — part of salary exempt if you pay rent. |
| **§10(5) LTA** | Leave Travel Allowance exemption — domestic travel fare, conditions apply. |
| **Chapter VI-A** | The block of the Income-tax Act containing deductions 80C…80U, subtracted from gross income (old regime, mostly). |
| **80C** | Deduction up to **₹1.5L** for EPF, PPF, ELSS, life-insurance premium, home-loan principal, etc. |
| **80CCD(1B)** | *Extra* ₹50,000 deduction for own NPS contribution, over and above 80C. |
| **80CCD(2)** | Deduction for **employer's** NPS contribution — the one deduction allowed in **both** regimes. |
| **24(b)** | Home-loan **interest** deduction, capped ₹2L for self-occupied property (old regime). |
| **80D** | Health-insurance premium deduction: ₹25k self/family + ₹25k parents (₹50k each if senior citizen). |
| **80E** | Education-loan interest — **no cap**. |
| **80G** | Donations to approved charities. |
| **80TTA** | Savings-account interest, up to ₹10,000. |
| **Professional tax** | Small state-level tax on employment, deductible u/s 16(iii); constitutional cap **₹2,500/yr**. |
| **Standard deduction §16(ia)** | Flat deduction from salary: **₹50,000 old / ₹75,000 new** regime (FY 2025-26). |
| **§87A rebate** | Tax rebate that zeroes out tax for low/middle incomes (thresholds differ per regime — see §2). |
| **EPF** | Employees' Provident Fund — mandatory salaried retirement fund; employee + employer each contribute ~12% of basic. **UAN** = Universal Account Number (portable EPF ID). **EPS** = Employees' Pension Scheme (a slice of the employer share diverted to pension). |
| **NPS** | National Pension System — voluntary market-linked retirement account. **PRAN** = Permanent Retirement Account Number (12 digits). **Tier I** = locked until 60, tax-advantaged. **Tier II** = liquid add-on, **no** tax benefit for private-sector subscribers. |
| **Gratuity** | Statutory lump sum from employer on exit after **≥5 years** of service: `(15/26) × last monthly Basic+DA × years of service`. Tax-free up to ₹20L. **Basic+DA** = basic salary + dearness allowance component. |
| **EMI** | Equated Monthly Installment — fixed monthly loan payment covering interest + principal. |
| **ESOP/RSU** | Employee stock options / restricted stock units. **Cliff** = initial period with zero vesting; after it, units vest on a schedule. |
| **LTCG/STCG** | Long/short-term capital gains — gains on investments held beyond/within a holding-period threshold. |
| **26AS / AIS** | Government portals' statements of your TDS and reported financial activity — what you reconcile Form 16 against. |

---

## 1. Where the tax code lives

**[CODE]** Two generations coexist in `family-finance.js`:

1. `oldTax(txbl)` (~line 1496) and `newTax(inc)` (~1505) — the original quick
   estimator. **Dead code as of 2026-07-12: defined but never called** (grep
   confirms no call sites in `family-finance.js` or `index.html`). The live
   path is the section the code itself calls the "CA-GRADE TAX ENGINE" (below).
   Don't extend these; if slab law changes they
   will silently drift from `OLD_SLABS`/`NEW_SLABS` since `newTax` embeds its
   own slab literal.

2. The section the code calls **"CA-GRADE TAX ENGINE (FY 2025-26 · AY 2026-27)"**
   (~1514, comment banner verified at family-finance.js:1515):
   `OLD_SLABS`, `NEW_SLABS`, `slabTax()`, `marginalRateOld()`,
   `computeRegime(t)`, `bestRegime(A)`, `f16grab()`, `parseForm16()`.
   Consumed by `renderTax()` (~3753) and `renderForm16Analysis(t, A)` (~3942).
   **"CA-grade" is the code's own internal name for this section, not a
   validated accuracy claim** — per `ffos-research-frontier` External
   Positioning, the phrase is an aspiration with no published benchmark behind
   it anywhere in the repo, and §2 below documents real divergences from law
   (missing surcharge, missing ₹12L marginal relief, uncapped 80G, conflicting
   80D caps). Use the phrase only in quotes, as the code's own section name.

Tax input state: `D.tax` is **per-member** — `D.tax.madhu = {gross, s80c, …}`.
`load()` migrates a legacy flat `D.tax` (detected by `'gross' in D.tax`) into
`{madhu: …}`. `getTaxMember()` maps the 'all' view to `'madhu'`.
`currentTax()` (~1167) supplies defaults for every field.

`D.tax[m]` fields and meaning: `gross` (gross salary u/s 17), `hra` (§10(13A)
exempt HRA), `exemptOther` (other §10 exemptions, e.g. LTA), `profTax`,
`s80c`, `s80ccd` (**this is 80CCD(1B)**, the ₹50k own-NPS top-up — naming
trap), `s80ccd2` (employer NPS), `s24b`, `s80d`, `s80e`, `s80g`, `s80tta`,
`tds`, plus metadata `employer`, `tan`, `ay`. All amounts everywhere in the
app are **whole rupees** (never paise; `f16grab` rounds to integer rupees).

---

## 2. The two regimes as implemented

### Slabs **[CODE, verified against `OLD_SLABS`/`NEW_SLABS` ~1517-1518]**

Each slab entry is `[lower, upper, rate]`; `slabTax(taxable, slabs)` taxes
only the portion of income inside each band:
`if (taxable > lo) t += (Math.min(taxable, hi) - lo) * r`.

Old regime (`OLD_SLABS`) — first ₹2.5L implicitly tax-free:

| Taxable income | Rate |
|---|---|
| 0 – 2,50,000 | 0% |
| 2,50,001 – 5,00,000 | 5% |
| 5,00,001 – 10,00,000 | 20% |
| above 10,00,000 | 30% |

New regime (`NEW_SLABS`) — first ₹4L tax-free:

| Taxable income | Rate |
|---|---|
| 0 – 4,00,000 | 0% |
| 4L – 8L | 5% |
| 8L – 12L | 10% |
| 12L – 16L | 15% |
| 16L – 20L | 20% |
| 20L – 24L | 25% |
| above 24L | 30% |

**[LAW]** These match Finance Act 2025 rates for FY 2025-26 (AY 2026-27) for a
resident individual **under 60**. Old-regime senior-citizen thresholds (₹3L /
₹5L basic exemption) are **not modeled**.

### Worked example, by hand (verified with node replicating `slabTax`)

Old regime, taxable ₹12,00,000:
```
(5,00,000 − 2,50,000) × 5%  =  12,500
(10,00,000 − 5,00,000) × 20% = 1,00,000
(12,00,000 − 10,00,000) × 30% =  60,000
base = 1,72,500 ; rebate = 0 (taxable > 5L)
cess = 1,72,500 × 4% = 6,900 → total = ₹1,79,400
```

New regime, gross salary ₹24,00,000 → std deduction ₹75,000 → taxable
₹23,25,000:
```
4L–8L ×5% = 20,000 ; 8–12L ×10% = 40,000 ; 12–16L ×15% = 60,000
16–20L ×20% = 80,000 ; 20L–23.25L ×25% = 81,250
base = 2,81,250 ; cess 4% = 11,250 → total = ₹2,92,500
```

### `computeRegime(t)` (~1535) — full pipeline **[CODE]**

Old-regime column:
```
salaryIncome = max(0, gross − (hra + exemptOther) − 50,000 std − min(profTax, 2500))
VIA = 80C(≤1.5L) + 80CCD(1B)(≤50k) + 80CCD(2)(uncapped) + 24b(≤2L)
      + 80D(≤1L) + 80E + 80G + 80TTA(≤10k)
taxable = max(0, salaryIncome − VIA)
base = slabTax(taxable, OLD_SLABS)
rebate = (taxable ≤ 5,00,000) ? base : 0      // §87A
total = round(max(0, base − rebate) × 1.04)   // +4% cess after rebate
refund = tds − total
```

New-regime column: only **₹75,000 standard deduction** and **80CCD(2)** are
allowed (`newVIA = c80ccd2`); HRA, prof tax and all other Chapter VI-A items
are ignored. Rebate: `(taxable ≤ 12,00,000) ? base : 0`.

`bestRegime(A)` (~1591): `A.old.total <= A.new.total ? 'old' : 'new'` —
ties go to old.

### What the engine implements vs real law — verified precisely

- **§87A rebate: IMPLEMENTED**, as "full base tax rebated if taxable ≤
  threshold" (₹5L old / ₹12L new). **[LAW]** The statutory caps are ₹12,500
  (old) / ₹60,000 (new); the code's all-or-nothing form is numerically
  identical at the thresholds for slab-rate salary income (base at exactly ₹5L
  old = 12,500; at ₹12L new = 60,000), so for this app's inputs it matches.
  It does not model 87A's exclusion of special-rate income (e.g. LTCG).
- **Marginal relief at the ₹12L cliff: NOT implemented.** [CODE] taxable
  ₹12,00,000 → ₹0 tax; taxable ₹12,00,001 → ₹62,400. **[LAW]** Finance Act
  2025 grants marginal relief so tax just above ₹12L cannot exceed the income
  above ₹12L (≈₹1 here). The one-rupee-over case is overstated by ~₹62k.
  `renderForm16Analysis` insight #7 partially compensates by warning when new
  taxable is in (₹12L, ₹12.8L].
- **Surcharge: NOT implemented.** **[LAW]** 10% of tax above ₹50L total
  income, 15% above ₹1Cr, etc. (new-regime max 25%). Above ₹50L this engine
  understates tax.
- **Cess 4%: implemented**, correctly applied after rebate.
- **Salary income only.** No other-income heads (interest, rental, capital
  gains) enter `computeRegime`; capital gains get a separate estimator (§7).
- **80D cap inconsistency [CODE]:** `computeRegime` and `saveForm16` cap 80D
  at **₹1,00,000** (the true statutory max: senior self + senior parents);
  `saveTax` (quick tax modal) caps at **₹75,000**; the `renderTax` progress
  bar displays against **₹25,000**. Three different caps in three places —
  know this before "fixing" any one of them.
- **80G [CODE] uncapped.** **[LAW]** really limited to 50%/100% of donation
  with a 10%-of-adjusted-gross-total-income ceiling — simplification, can
  overstate the deduction.
- **HRA is taken as entered.** **[LAW]** exempt HRA = least of (actual HRA
  received, rent paid − 10% of basic+DA, 50% of basic+DA metro / 40%
  non-metro). The app does **not** compute this least-of-three; the user (or
  Form 16) supplies the final exempt figure.
- **24(b) [CODE]** is summed into `oldVIA` alongside Chapter VI-A items.
  **[LAW]** it is technically a house-property loss set off against salary,
  not a VI-A deduction — arithmetic is equivalent under the ₹2L cap.
- **80TTA old-regime only [CODE]** — correct. **[LAW]** 80TTB (₹50k, seniors)
  not modeled.

### Marginal rate & deduction "headroom" valuation

`marginalRateOld(taxable)` (~1527) returns 0 / .05 / .20 / .30 — the rate the
*next rupee* of old-regime taxable income is taxed at. Insights #3 and #4 in
`renderForm16Analysis` value unused 80C / 80CCD(1B) headroom as
`gap × marginalRate × 1.04`: a rupee of extra deduction saves tax at the
**marginal** slab rate (plus cess), not the average rate, because deductions
come off the top slab. This is why filling ₹50k of NPS headroom "saves"
₹15,600 for a 30%-slab member but only ₹2,600 at the 5% slab.

### Regime-choice gotcha

**[LAW]** New regime is the **default**; a salaried person must actively opt
for old each year (business income has stickier rules — not modeled). The
choice is **per member per year**: never assume the family shares one regime.
[CODE] `renderForm16Analysis` insight #1 states this in its recommendation
text. The app stores no "chosen regime" field — it always computes both and
recommends.

---

## 3. Deductions table (statute vs code)

| Section | What it is | Statutory cap (FY 2025-26) | Cap in `computeRegime` | `D.tax[m]` field | Regimes |
|---|---|---|---|---|---|
| 80C | EPF/PPF/ELSS/LIC/home-loan principal | ₹1,50,000 | `min(…,150000)` | `s80c` | old only |
| 80CCD(1B) | Own NPS top-up | ₹50,000 | `min(…,50000)` | `s80ccd` ⚠ name | old only |
| 80CCD(2) | **Employer** NPS | 10% of basic+DA (14% new regime / govt) | **uncapped** | `s80ccd2` | **BOTH** |
| 24(b) | Home-loan interest (self-occupied) | ₹2,00,000 | `min(…,200000)` | `s24b` | old only |
| 80D | Health-insurance premium | ₹25k+₹25k (₹50k each if senior) → max ₹1L | `min(…,100000)` | `s80d` | old only |
| 80E | Education-loan interest | none | uncapped | `s80e` | old only |
| 80G | Donations | 50/100% + 10%-of-AGTI ceiling | **uncapped (simplified)** | `s80g` | old only |
| 80TTA | Savings interest | ₹10,000 | `min(…,10000)` | `s80tta` | old only |
| §10(13A) HRA | Rent exemption | least-of-three formula | as entered, uncapped | `hra` | old only |
| §10(5) LTA + other §10 | Travel etc. exemptions | fare-based conditions | as entered, uncapped | `exemptOther` | old only |
| §16(iii) Prof. tax | State employment tax | ₹2,500 | `min(…,2500)` | `profTax` | old only |
| §16(ia) Std deduction | Flat salary deduction | ₹50k old / ₹75k new | `gross>0 ? 50000/75000 : 0` | (derived) | both, different amounts |

**The one everyone gets wrong: 80CCD(2) is allowed in BOTH regimes.** [CODE]
`newVIA = c80ccd2` is the *only* deduction in the new-regime column besides
std deduction, and it is deliberately uncapped (the 10%/14%-of-basic cap needs
basic salary, which the app doesn't collect for tax).

⚠ Field-name trap: `s80ccd` = 80CCD(**1B**) (own ₹50k top-up); `s80ccd2` =
80CCD(2) (employer). Related but different: `D.nps[m].fyContrib` drives the
NPS page's 80CCD(1B) progress bar; it is **not** automatically copied into
`D.tax[m].s80ccd`.

Related caps elsewhere: `renderEPF` shows EPF annual contribution vs the
₹1.5L 80C cap; `renderLoans` (~3419) sums home-loan `intPaid` vs the ₹2L 24(b)
cap. These are informational displays — they do **not** feed `computeRegime`;
only `D.tax[m]` does.

---

## 4. Form 16 handling

**[LAW]** Form 16 is the employer's annual TDS certificate, issued by ~June 15
after FY end. Part A (from the TRACES portal): employer TAN/PAN, quarterly TDS
deposited. Part B: salary u/s 17(1)/(2)/(3), §10 exemptions, §16 deductions,
Chapter VI-A claims, computed tax. Often PDF-password-protected (commonly PAN
lowercase + DOB — the upload prompt says so).

**[CODE]** Flow: `handleForm16Upload` (~1216) extracts PDF text (pdf.js —
`ffos-statement-parsing-reference` covers pdf.js/coordinate-reconstruction
mechanics for BANK statements only; it does not document `parseForm16`.
Form-16 extraction detail (the `f16grab` regex table below) is kept in THIS
skill; `parseForm16` itself lives in the tax section of `family-finance.js`,
~line 1607) →
`parseForm16(text)` (~1607) → prefills the Form 16 modal → user reviews →
`saveForm16()` (~1262) writes `D.tax[m]` with caps applied.

`parseForm16` extraction targets (each via `f16grab`, first-matching regex
wins, commas stripped, rounded to whole rupees, `null` if not found):

| Result key | Anchored on | Lands in |
|---|---|---|
| `gross` | "Gross Salary … Total", "17(1)" | `f16-gross` → `gross` |
| `exemptU10` | "exemption under section 10 … Total" (anchors the literal "10" so it isn't captured as the amount) | `f16-exempt` → `exemptOther` |
| `profTax` | "section 16(iii)", "Tax on employment" | `profTax` |
| `s80c` | "80C … Deductible amount" | `s80c` |
| `s80ccd1b` | "80CCD(1B)" | `s80ccd` |
| `s80ccd2` | "80CCD(2)" | `s80ccd2` |
| `s80d` | "80D" | `s80d` |
| `s24b` | "24(b)" / "Income from house property" / "interest on housing" | `s24b` |
| `tds` | "Total amount of tax deducted", "Net tax payable" | `tds` |
| `ay` | "Assessment Year 2026-27" | `ay` |
| `employer` | "Name and address of the Employer" | `employer` |
| `tan` | `[A-Z]{4}[0-9]{5}[A-Z]` | `tan` |

**Not parsed:** HRA (no separate `hra` extraction — Form 16 usually reports
only the aggregate §10 figure), 80E/80G/80TTA. HRA stays a manual field.
⚠ **Double-count hazard:** the parsed §10 *total* (which may already include
HRA) lands in `exemptOther`, and `computeRegime` adds `hra + exemptOther`. If
a user also types HRA manually, the exemption is counted twice. When
validating numbers, check both fields.

**Design stance (explicit in the code, comment at ~1595):** "best-effort;
user reviews & corrects." The status badge reports how many of 9 key fields
parsed and tells the user to review; <3 fields → "fill the rest manually."
Do not "harden" parsing toward silent auto-accept — human review is the
correctness backstop.

---

## 5. Retirement instruments

### EPF — `D.epf`, `renderEPF()` (~2917)

**[LAW]** Employee and employer each put ~12% of basic+DA into EPF monthly;
8.33% of the *employer* share (capped on ₹15k wage, ≈₹1,250/mo) is diverted to
EPS (pension). Interest is government-declared yearly (8.25% for FY 2024-25).
Employee contributions count toward 80C. UAN is the lifetime portable account
number.

**[CODE]** `D.epf = {uan, balance, empShare, erShare, monthly, updated,
birthYear, retireAge:60}` — a **single family-level object** (not
per-member, unlike NPS/tax). `renderEPF`:
- Displays derived interest as `max(0, balance − empShare − erShare)` — i.e.
  "interest" is just the residual, not tracked separately.
- 80C bar: `monthly × 12` vs ₹1.5L.
- **Projection assumptions (exact):** monthly compounding at
  **8.25% p.a. fixed** (`r = 0.0825/12`), `n = (retireAge − currentAge) × 12`
  months where `currentAge = currentYear − birthYear`;
  corpus = `balance×(1+r)^n + monthly×((1+r)^n − 1)/r` (ordinary annuity).
  The rendered note says it too: constant contributions, **no salary
  increments**, no EPS split, no rate changes, no tax on withdrawal. This is
  a simplification and labeled as such in the UI.

### NPS — `D.nps[member]`, `getNpsData()` (~3010), `renderNPS()` (~3019)

**[LAW]** PRAN = 12-digit permanent account number. **Tier I**: locked until
60 (partial-withdrawal exceptions); contributions earn 80CCD(1)/(1B)/(2)
benefits; at exit 60% lump sum tax-free, 40% must buy an annuity. **Tier II**:
optional liquid account, withdraw anytime, **no tax deduction** for
private-sector subscribers and gains taxable — do not treat Tier II as
tax-advantaged.

**[CODE]** Per-member: `D.nps[m] = {pran, tier1, tier2, fyContrib, monthly,
equityPct}` (`load()` migrates a legacy flat `D.nps`). `tier1`/`tier2` are
current balances in rupees; `fyContrib` = this FY's own contribution, tracked
against the ₹50k 80CCD(1B) cap. Net worth counts **tier1 + tier2** equally
(`calcNW` ~1448) — fine for net worth, but Tier I is illiquid until 60.
⚠ `renderNPS` shows "tax saved" as `min(fyContrib, 50000) × 0.312` —
hardcoded 30% slab + 4% cess (31.2%). Overstates savings for members below
the 30% slab and is old-regime-only relief; it ignores the member's actual
marginal rate. `extractNpsBalances` (~4534) pulls PRAN/Tier I/Tier II from
statement text (mechanics → sibling skill).

### Gratuity — `D.gratuity`, `calcGratuityYears()` (~1427), `getGratuityValue()` (~1437)

**[LAW]** Payment of Gratuity Act 1972: payable on leaving after **≥5 years'
continuous service**; amount = `(15/26) × last drawn monthly Basic+DA × years
of service` (15 days' wages per year, month = 26 working days); service of >6
months in the final year rounds **up** to a full year; tax-free up to **₹20
lakh** (private sector).

**[CODE]** `D.gratuity = {employer, joiningDate, basicDA, actualAccrued}` —
single object, family-level. `basicDA` is **monthly** Basic+DA in rupees.
- `calcGratuityYears`: whole months since joining; `fullYears + (remainder
  months ≥ 6 ? 1 : 0)` — matches the statutory ≥6-months-rounds-up rule
  (applied to every year, computed from total months).
- `getGratuityValue`: **if `actualAccrued > 0` it wins outright**; else
  `round((basicDA × 15/26) × years)`.
- Divergences: the formula uses *current* `basicDA` as a proxy for
  last-drawn; `getGratuityValue` accrues value into net worth **even before
  the 5-year eligibility cliff** (renderEPF shows an eligibility badge at
  `years >= 5`, but `calcNW` includes gratuity regardless); the ₹20L bar in
  `renderEPF` (`effective/2000000`) is an informational tax-free-limit
  meter, not a cap on the value.

### ESOP/RSU vesting — `calcVestedUnits(inv)` (~1326)

**[LAW]** Grants vest over a schedule; nothing vests before the **cliff**.
**[CODE]** months elapsed since `grantDate` (calendar-month granularity); if
`< cliffMonths` → 0. Otherwise vest in discrete cycles:
`freqMonths` from `vestingFrequency` (monthly=1, quarterly=3 **default**,
annual=12), `totalCycles = round(vestingMonths/freqMonths)` (default
vestingMonths 48), `completedCycles = min(totalCycles,
floor(monthsElapsed/freqMonths))`, vested =
`floor(completedCycles/totalCycles × totalUnits)`. Note: after the cliff it
credits all cycles elapsed since *grant* (standard for RSUs where the cliff
tranche vests retroactively). Value: `vestedUnits × currentPrice × fxRate`,
rounded to whole rupees.

---

## 6. Money conventions in the app

- **Units:** whole rupees everywhere in `D`. No paise. Foreign-currency
  investments keep `costFX`/`valueFX` in the foreign unit and store
  INR-converted `cost`/`value`.
- **Formatting (~102-104):** `fmt(n)` → `'₹' + |n|.toLocaleString('en-IN')`
  → Indian grouping (₹15,00,000). `lk(n)` → `₹X.X L` (÷1e5); `cr(n)` →
  `₹X.XX Cr` (÷1e7). All three respect the `numbersHidden` privacy mask.
  ⚠ `fmt` uses `Math.abs` — it **drops the sign**; negative values must carry
  their sign in surrounding markup (see `sgn` in `renderForm16Analysis`).
- **Gold:** `D.goldRate` (default **7500**) = **₹ per gram of pure 24-karat
  gold**. `calcGoldValue` (~1461): `weight(g) × (purity/24) × rate`, purity
  in karats, **default 22k** — so an entry with no purity is valued at 22/24
  of the 24k rate. Verified: the rate is the 24k benchmark, purity scales it.
- **FX:** `D.fxRates = {USD: 85, …}` — **INR per 1 unit of foreign
  currency** ("1 USD = ₹85", per the modal label). `getInvDisplayRate(c)`
  (~1354): INR→1; else `D.fxRates[c]`; else falls back to the most recent
  investment's stored `exchangeRate`; else 1 (⚠ a missing rate silently
  values foreign assets at 1:1). `saveFxRates` back-propagates the new rate
  onto every investment in that currency and snapshots net worth. Rates are
  **manual** — no live feed (privacy-first, zero network).
- **EMI / prepayment — `runPrepay(id)` (~3426):** with monthly rate
  `r = rate/100/12`, principal `P = outstanding`, `n = tenure` (months,
  treated as *remaining* term): if no EMI stored it derives the standard
  annuity EMI `P·r·(1+r)ⁿ / ((1+r)ⁿ − 1)`. Baseline interest =
  `emi×n − P`. Then simulates month by month with `emi + extra`: interest =
  `bal×r`, principal = `min(bal, emi+extra−interest)`, until balance ≈ 0.
  Reports months saved and interest saved (`stdInterest − ((emi+extra)×months
  − P)`). Simplifications: final-month payment treated as full-size in the
  interest-saved arithmetic (small overstatement of the new interest, i.e.
  conservative on savings); no prepayment penalty; fixed rate.
- **Capital-gains estimator (inside `renderTax`, ~3889):** unrealized
  `value − cost` on gainers only; equity-ish types (Mutual Fund, Stock,
  ESOP, RSU) split by holding **> 12 months** (ESOP/RSU dated from
  `grantDate`, others `purchaseDate`) → LTCG taxed **12.5% above a ₹1.25L
  exemption**, STCG **20%** — the Finance Act 2024 (post-23-Jul-2024)
  listed-equity rates. **[LAW]** Simplifications: these are *unrealized*
  gains (no tax due until sale); unlisted shares/ESOPs really use a 24-month
  threshold and different rates; debt/other gains are flagged as
  slab-taxable but excluded from the total; the ₹1.25L exemption is per
  member per FY, applied here once across the whole list.

---

## 7. Domain gotchas for engineers (checklist)

1. **FY runs Apr 1 – Mar 31; AY = FY + 1.** A "2025-26" label is a fiscal
   year, not a calendar year. Form 16 for FY 2025-26 says AY 2026-27.
2. **Amounts are rupees, not paise.** No fixed-point scaling anywhere.
3. **80CCD(2) is deductible in BOTH regimes** — the only VI-A item in the
   new-regime column. Removing it from `newVIA` is a correctness bug, not a
   cleanup.
4. **`s80ccd` ≠ `s80ccd2`.** `s80ccd` is 80CCD(1B) (own ₹50k); `s80ccd2` is
   employer NPS.
5. **NPS Tier II is not tax-advantaged** — don't extend 80CCD math to
   `tier2`.
6. **Gratuity rounding:** ≥6 leftover months = +1 year
   (`calcGratuityYears`); `actualAccrued > 0` overrides the formula
   entirely; value accrues in net worth even pre-5-year eligibility.
7. **Regime choice is per member per year**; new regime is the statutory
   default. The app recomputes both every render — there is no persisted
   choice.
8. **No surcharge, no marginal relief** in `computeRegime`: numbers are
   wrong above ₹50L income and just above the ₹12L new-regime rebate cliff.
9. **§10 double count:** parsed Form 16 §10 total → `exemptOther`; manual
   HRA → `hra`; `computeRegime` sums both.
10. **80D has three different caps in the code** (₹1L engine/Form 16 modal,
    ₹75k quick modal, ₹25k display bar) — reconcile deliberately, with
    change-control, not in passing.
11. **`fmt()` strips the sign** (`Math.abs`).
12. **A missing FX rate silently means 1:1** (`getInvDisplayRate` fallback).
13. **EPF is one family-level object; NPS and tax are per-member maps** —
    `load()` contains the migrations; never assume symmetric shapes.
14. **`oldTax`/`newTax` are dead** — the live engine is
    `computeRegime`/`slabTax`.
15. **Lakh/crore in UI strings:** `lk`/`cr` and chart tick callbacks render
    `₹…L` / `₹…Cr`; 1L = 1e5, 1Cr = 1e7.

---

## 8. Provenance & law-drift warning

- **Encodes FY 2025-26 (AY 2026-27) law, verified against the code on
  2026-07-12.** Indian slabs/caps/rebates change with **every Union Budget
  (annually, presented ~Feb 1, effective the following Apr 1)**. Anything in
  this file marked [LAW] can be stale the moment a new Finance Act passes.
- **To re-verify what the engine currently encodes:** read `OLD_SLABS`,
  `NEW_SLABS`, and the body of `computeRegime()` (std-deduction amounts,
  §87A thresholds, per-section caps) plus the capital-gains block in
  `renderTax` (LTCG/STCG rates, exemption) and the hardcoded filing-deadline
  string in `renderForm16Analysis` insight #9 ("31 July 2026").
- **Updating slabs/caps/rates is a finance-math change**: it goes through the
  `ffos-change-control` gates, must NEVER break saved data (`D.tax`
  per-member shape, `load()` migrations), and must be verified in a real
  browser (`python3 -m http.server` + Playwright — `file://` fails). Verify
  computed totals with a hand-worked slab example (as in §2) or via
  `ffos-proof-and-analysis-toolkit` before shipping.
- Line numbers cited here drift; anchor on function names.
