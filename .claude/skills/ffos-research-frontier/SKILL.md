---
name: ffos-research-frontier
description: >
  Frontier project catalog for the Family Finance OS repo: "AI-native insights"
  that run entirely in the browser. Load this when asked for new feature ideas
  or a roadmap; when the user wants "smart"/AI/insights features — anomaly
  detection, cash-flow forecasting, spending intelligence, tax optimization
  advice, learned categorization, natural-language summaries; when evaluating
  whether an ambitious idea fits this project's privacy and no-build
  constraints; or when scoping what "add ML/an LLM to the app" could honestly
  mean here. Contains per-project first steps, falsifiable milestones, and the
  experimental-flag convention.
---

# FFOS Research Frontier: Local-Only AI-Native Insights

**Owner's frontier pick (2026-07-12):** deep automated financial advice —
anomaly detection, cash-flow forecasting, tax optimization — computed from the
family's local data. **The constraint that makes it research:** everything
runs locally in the browser. No data leaves the device. No cloud API calls
with financial data. Ever. The CSP (`index.html` line 6) enforces
`connect-src 'self'` and the app makes zero external requests by design.

Everything in this file is **open / candidate work**. Nothing here is
promised, proven, or scheduled. Each project states why current
state-of-the-art tools fail for this repo, what asset this repo uniquely has,
the first three concrete steps *in this repo*, and a falsifiable
"you have a result when…" milestone with a number. If you cannot hit the
milestone, the honest outcome is "we tried X, here is why it failed" —
see `ffos-research-methodology` for how to write that up.

All repo facts below verified 2026-07-19 against HEAD `526c55f`
(`family-finance.js` 5332 lines, `index.html` 1957 lines). Line numbers will
drift; the Provenance section gives re-verification commands.

## Hard constraints every candidate design must respect

1. **Privacy hard line.** No financial data off-device. No cloud inference.
   `connect-src 'self'` stays unless the owner explicitly signs off
   (see `ffos-change-control`, owner sign-off list).
2. **In-browser compute, vanilla JS, no build step.** The app is one HTML file
   plus one 5.3k-line JS file with vendored libs, deployable to IPFS. Heavy ML
   libraries (TF.js, ONNX runtime, transformers.js) are a hard sell: they add
   megabytes, a vendor-upgrade surface, and usually a WASM/worker story.
   **Statistical methods first** — median/MAD, naive Bayes, exponential
   smoothing all fit in plain JS and are inspectable.
3. **Never break saved data.** Any new field on `D` ships with load-safety
   (see flag convention below and `ffos-data-model-and-migrations`).
4. **Verify in a real browser.** Every milestone below is measured by a
   throwaway Playwright script against `python3 -m http.server` — numbers,
   not vibes (`ffos-browser-verification` has the templates).
5. **Experimental features stay labeled.** Insight cards from these projects
   render with a visible "EXPERIMENTAL" badge and disappear entirely when
   their flag is off.
6. **Real transaction data never leaves the device, in any form.** Descriptions
   in the owner's actual transactions contain family names (autoCategory rule
   12 hardcodes `charan|himaja|nageswara|nagamma|ponamgi` because those names
   appear in real descriptions) — this makes real txn data PII, not just
   financial data. Real-data exports (hand-labeled sets, backtest seeds,
   console-dumped snippets) live ONLY in the owner's browser or an untracked
   scratch path — never committed, never exported off-device. Every number
   published in a write-up must be reproduced by a **committed, synthetic**
   fixture + script pair (per External Positioning below); results measured
   against real data are reported as numbers only, never as the underlying
   data.



## The experimental-flag convention (proposal — none exists today)

**Honest status:** as of 2026-07-19 the codebase has **no** settings or
feature-flag mechanism. `D` (defined at `family-finance.js` ~line 20) has no
`settings` key. The only flag-ish things are a `numbers_hidden` localStorage
side-key (line 86) and a hardcoded `const _DBG = false` (line 112).

**Proposed convention** (use this consistently across all projects here):

- Add `settings: { experiments: {} }` to the `D` defaults object. Because
  `load()` does `D = deepMerge(defaults, parsed)` (lines 45–74), old saved
  data that lacks the key simply keeps the default — adding a new top-level
  default is backward-safe by construction. It is still a class-(a)
  D-schema change under `ffos-change-control`: seed old-shape localStorage in
  Playwright and assert clean load.
- One boolean per experiment: `D.settings.experiments.anomalyCards`,
  `.cashflowForecast`, `.taxAdvisor`, `.learnedCategories`. Default `false`.
- Gate at the render site: `if (!D.settings?.experiments?.anomalyCards) return;`
  at the top of the experimental render function, so flag-off is a strict
  no-op (no DOM, no writes).
- A plain checkbox list in an existing settings/modal area toggles them; each
  rendered card carries the badge text `EXPERIMENTAL`.

First session to need a flag builds this once; later projects reuse it.

## What exists today (the seeds — verified, cite these, don't rebuild them)

| Seed | Where | What it actually does (and its limits) |
|---|---|---|
| `detectRecurringFromTxns(memberFilter)` | line 3050 | Groups debit txns (excl. 'Family Transfer') by `normalizeRecurDesc` (line 3039: strips UPI/NEFT/… prefixes, 6+-digit runs, keeps first 4 tokens). Keeps groups with ≥2 hits in ≥2 distinct calendar months and amount coefficient-of-variation < 20%, mean ≥ ₹10. Returns `{name, key, amount(mean), day(avg day-of-month), lastDate, count, months, member, cat}`. **Assumes monthly cadence** — no interval estimation, no weekly/quarterly detection. |
| `autoCategory(desc, amount)` | line 4964 | Ordered keyword regexes over ~14 categories. Contains a hardcoded amount hack (`|amt−23790|<1 → 'EMI'`) and an over-broad Salary rule (`/salary|salaries|credit|neft cr|upi cr|rtgs cr/` — any description containing "credit" becomes Salary). Applied **only at parse time** (5 call sites in the BANK_CONFIGS row mappers, ~4655–4886). **No learning; no manual re-categorization UI exists** — txns can be added with a category (`m-txn-cat` modal, line 1285) or deleted (`deleteTxn` line 4131), but never edited. |
| `D.nwHistory` | `snapshotNW()` line 1469 | Monthly entries `{m, v, assets, liabs, inv}` where `m` is a locale string like `'Jul 25'` (not ISO, not sortable), **capped at 12 entries** (`shift()` at line 1490). Too few points for time-series ML; fine as a sanity anchor. |
| Calendar low-balance alert | `renderCalendar` lines 3193–3206, `renderCalendarDetails` line 3284 | Day-by-day scan of the displayed month: liquid balance (sum of `D.accounts[].balance` — **manually maintained; imports never update balances**) minus that day's event outflows; flags days where the running balance < 0; one alert names the first such day. **Models no inflows** (salary is ignored), single month horizon, no confidence notion. Events come from `getCalendarEvents` (3108): loan EMIs (`emiDay`), insurance renewals (freq logic), recurring detections. |
| Tax insight engine | `computeRegime` line 1535, `renderForm16Analysis` lines 4002–4067, `renderAlerts` line 2316 | `computeRegime(t)` computes both regimes FY 2025-26 with caps (80C 1.5L, 80CCD(1B) 50k, 24b 2L, 80D 1L, 80TTA 10k; std ded 50k/75k; §87A at 5L/12L; 4% cess) and returns `old.marginalRate` via `marginalRateOld` (1527). `renderForm16Analysis` already emits **nine rule-based insights**: regime pick with ₹ difference, refund/payable, 80C headroom valued at `gap × marginalRate × 1.04`, 80CCD(1B) gap, 80D unclaimed, missing HRA, §87A proximity (₹12L–₹12.8L), missing TDS, filing deadline. `renderAlerts` duplicates 80C/NPS headroom with a hardcoded `× 0.312`. |
| Spend intel | `renderSpend` 2001, `renderTxnIntel` 1898, lifestyle-inflation widget ~4250 | Latest-month category totals, all-time breakdown, month-over-month spend % — sums and means only, nothing statistical. |

Import path detail that matters for several projects (`importParsed` commit
block ~5295–5310): imported txns are deduped by `date|desc|amount`, stamped
`member` (current member or `'madhu'`) and an `account` id. The real family
dataset lives in the **owner's browser localStorage**, not in the repo — the
repo only has tiny fixtures (`test_icici.csv`, `mock_nps.csv`).

---

## Project 1 — Transaction anomaly detection (open candidate)

**Why current SOTA fails here.** Mint/CRED/ET Money-class tools do "unusual
spend" alerts only after uploading the family's complete transaction history
to their cloud — a non-starter under this project's privacy line. Generic
LLM advice ("your food spend looks high") has no access to the actual local
data and cannot produce per-merchant baselines. Academic anomaly detectors
assume big data; here the whole point is that months of one family's
categorized transactions are *enough* for robust statistics if you use
robust statistics.

**This repo's asset.** Months of categorized, member-attributed transactions
in `D.transactions` (`{date, desc, amount, type, cat, member, account}`),
plus `normalizeRecurDesc` as a ready-made merchant key.

**First three steps.**
1. **Measure what data you actually have.** Have the owner paste this in the
   app's console (their browser has the real data; yours doesn't):
   ```js
   (d=>({txns:d.transactions.length,cats:[...new Set(d.transactions.map(t=>t.cat))],
     from:d.transactions.map(t=>t.date).sort()[0],
     to:d.transactions.map(t=>t.date).sort().at(-1)}))
   (JSON.parse(localStorage.getItem('family_finance_v1')))
   ```
   If it's under ~3 months or ~200 txns, per-merchant baselines won't be
   defensible — say so and scope down to per-category only.
2. **Prototype scoring as a throwaway verify script** (`verify_anomaly.cjs`,
   scratch space): seed localStorage with 12 months of synthetic txns plus
   K injected anomalies; score each month's per-category totals and each
   individual txn against median/MAD of its category (robust z = 0.6745·|x−median|/MAD,
   flag at z ≥ 3.5) — no app changes yet, just the math and the metric.
3. **Only after step 2 hits the milestone**, add an insights card: a
   `renderAnomalyCard()` gated on `D.settings.experiments.anomalyCards`,
   called from the end of `renderOv()` (line 1809, alongside
   `renderTxnIntel()`), rendering into a new panel in the overview grid in
   `index.html`. Every interpolated description goes through `esc()`.

**You have a result when…** on seeded synthetic data (12 months, ~40
txns/month) with 12 injected anomalies (one per month, each ≥3× its
category's typical amount), the detector flags **≥10 of 12 (≥80%)** with
**≤12 false positives total (≤1/month average)**, measured by the Playwright
script, and the numbers on the rendered card match the script's computation
exactly. If real-data step 1 shows <3 months of history, the milestone is
per-category only and you must state that.

**Gates.** Flag mechanism = class (a) (migration + old-shape seed test);
card = class (c) (esc() audit, no accidental `save()`); lint no-new-problems.

---

## Project 2 — Cash-flow forecasting with confidence band (open candidate)

**Why current SOTA fails here.** Bank-app "balance forecasts" see one bank;
this family's picture spans multiple accounts, cards, EMIs across members.
Cloud PFM tools need aggregator access (India: Account Aggregator consent
flows, still cloud-side). A generic LLM cannot forecast a balance it cannot
see. The existing in-repo alert (verified above) is the honest baseline to
beat: it is outflow-only, current-month-only, and ignores salary entirely.

**This repo's asset.** `detectRecurringFromTxns` (amount + day-of-month per
recurring debit), loan EMI schedules (`D.loans[].emi`, `emiDay` — populated
by `syncLoansFromTxns`, line 1662), insurance renewals, and a detectable
salary signal (`t.cat === 'Salary'` or the regex used at lines 4165/4264 —
note `autoCategory`'s Salary rule is over-broad, so validate salary txns by
amount stability before trusting them).

**First three steps.**
1. **Extract, don't rewrite:** factor the day-scan inside `renderCalendar`
   (lines 3193–3206) into a pure function
   `projectBalance(startBalance, events, days)` returning
   `[{day, balance}]`, and make `renderCalendar` consume it — behavior
   identical, verified by Playwright before anything new is added.
2. **Add inflows:** build `detectSalaryEvents()` from credit txns (median
   amount + modal credit day across the last 3+ months; reuse the
   `openSalaryHistory` grouping logic at line 4260 as reference), and extend
   the projection to N=30/60/90 days across month boundaries.
3. **Backtest as a throwaway script:** seed localStorage with history
   truncated to exclude the last full calendar month, run the projection for
   that month, compare day-by-day and month-end against what actually
   happened (actual = start balance + net actual txns; account balances are
   manual, so the backtest must be run txn-relative, not against
   `a.balance`). Add a simple band: ± the median absolute month-over-month
   variation of non-recurring spend.

**You have a result when…** over **3 held-out synthetic months plus the last
real month** of the owner's history, projected month-end balance has
**mean absolute error ≤ 10% of actual month-end net position**, and every
actually-negative day in the held-out real month falls inside the projected
low-balance band. Backtest protocol (truncation point, error formula) is
written in the verify script itself so anyone can re-run it.

**Hard line (constraint 6 above):** the real-month backtest runs and is
measured in the owner's browser only; the published number is the MAE
percentage, never the underlying real-month transaction data. Any committed
fixture backing the write-up must be synthetic.

**Gates.** Step 1 refactor = class (c) with a calendar-regression Playwright
run; forecast card behind `D.settings.experiments.cashflowForecast`; any new
persisted field (e.g. cached salary profile) = class (a).

---

## Project 3 — Tax optimization advisor (open candidate)

**Why current SOTA fails here.** Cleartax-class tools require uploading Form
16 and salary data to their servers. A generic LLM will happily emit Indian
tax advice but cannot see this user's actual 80C utilization, employer NPS,
or regime break-even — and hallucinated slab math is worse than none. The
differentiator here is not tax knowledge, it's that **the engine and the
user's full picture are already co-located locally**.

**This repo's asset.** `computeRegime` (line 1535) is a complete two-regime
FY 2025-26 computation, and `renderForm16Analysis` (insights at 4002–4067)
already ships nine quantified rule-based insights — **cite these as the
seed; the frontier is ranking and validating, not inventing.** Frontier =
personalized moves ranked by ₹ saved (80C headroom → ELSS/PPF,
80CCD(1B), 80D, regime-switch break-even), every ₹ figure produced by
*re-running `computeRegime` with the move applied*, never by shortcut
multiplication (the existing `gap × marginalRate × 1.04` shortcuts at 4030/4036
and the hardcoded `× 0.312` in `renderAlerts` line 2323 are exactly what
this project replaces — they're wrong near slab boundaries and §87A cliffs).

**First three steps.**
1. Write `simulateMove(t, delta)`: clone the tax record `t`, apply a delta
   (e.g. `s80c: +50000`), return
   `computeRegime(clone).old.total − computeRegime(t).old.total` (and same
   for new/best regime). Pure function next to `computeRegime`; no UI.
2. Build the move catalog as data: each move = `{id, label, applicable(t,A),
   delta(t,A), section}` covering 80C headroom, 80CCD(1B), 80D, §87A
   proximity, regime switch. Rank by `simulateMove` output, descending.
3. Verify with a synthetic-profile battery (throwaway script): ≥20 profiles
   spanning gross ₹4L–₹60L, both regimes best, §87A edge cases (old ₹5L,
   new ₹12L cliffs), maxed vs empty deductions. Only then render an
   "Advisor" card in the tax tab (near `tax-ca-insights`,
   `renderForm16Analysis`) behind `D.settings.experiments.taxAdvisor`.

**You have a result when…** for a battery of **≥20 synthetic profiles**,
**100% of surfaced suggestions** are self-consistent: applying the suggested
delta and re-running `computeRegime` changes the tax total by exactly the
promised ₹ (tolerance ±₹10 for rounding), including the cliff cases where
the shortcut formulas give wrong answers — the script must include at least
2 profiles where `gap × marginalRate` and `simulateMove` disagree by >₹1,000
and the advisor shows the simulated number.

**Gates.** Class (d) tax-math under `ffos-change-control`: hand-computed
expected values for ≥2 scenarios before coding, cross-checked against
`indian-finance-reference`; Playwright asserts rendered ₹ equals the hand
computation. Advice wording stays "estimated, verify with your CA" — see
External positioning.

---

## Project 4 — Self-improving categorization (open candidate)

**Why current SOTA fails here.** Cloud PFMs learn categorization from
millions of users' uploaded transactions — unavailable here by principle.
Generic embeddings/LLM classifiers need model downloads incompatible with
the no-build, vendored-lib architecture. But this user's merchants are
highly repetitive, so tiny local learners (per-merchant memory, naive Bayes
over description tokens) can plausibly beat the static keyword list.

**This repo's asset — and its missing piece.** `autoCategory` (line 4964) is
a fixed keyword cascade with known failure modes (over-broad Salary rule;
hardcoded ₹23,790 hack; everything else → 'Other'). The asset is the user's
own history; the **missing piece is that no correction signal exists**:
verified 2026-07-19, there is no edit-category UI anywhere — so the
learning loop cannot start until corrections can be captured.

**First three steps.**
1. **Measure the baseline first.** Export ~200 real txns (owner runs a
   console snippet dumping `{desc, amount, cat}`), hand-label the true
   category, and compute keyword-baseline accuracy overall and per category.
   If baseline is already ≥90%, this project is low-value — write that down
   and stop. **Hard line (constraint 6 above): the exported dump and the
   hand-labeled set are real transaction data — they stay in the owner's
   browser or an untracked scratch path, are never committed and never leave
   the device. Only the accuracy numbers get written up; any committed
   fixture is synthetic.**
2. **Build the correction capture path:** make the category chip in
   `renderTxns` (the `.txn-cat` div, ~line 4119) an editable `<select>`;
   on change, update `t.cat` and append `{key: normalizeRecurDesc(desc),
   cat, ts}` to a new `D.catCorrections` array (new top-level default —
   class (a), old-shape seed test). This is useful on its own even if
   learning never ships.
3. **Learn the cheapest thing first:** exact per-merchant override
   (`catCorrections` newest-wins by normalized key) consulted by
   `autoCategory` before the keyword cascade, behind
   `D.settings.experiments.learnedCategories`. Naive Bayes over tokens is
   step 4, only if per-merchant memory leaves measurable headroom.

**You have a result when…** on a **held-out 30% split of ≥200 hand-labeled
real txns**, learned categorization beats the measured keyword baseline by
**≥10 percentage points overall**, with **no category regressing by more
than 2 points** — measured by a script that prints the confusion matrix for
both. (Baseline number comes from step 1; do not promise the 10 points
until the baseline is measured. The hand-labeled set stays local per the hard
line in step 1 — publish the confusion-matrix numbers, not the labeled data.)

**Gates.** Step 2 = class (a) + (c); changes touching `autoCategory` itself
are class (b) — golden fixtures `test_icici.csv` / `mock_nps.csv` must
still import with identical counts and categories (parser-adjacent; see
`ffos-import-hardening-campaign` before touching the import path).

---

## Project 5 — Natural-language insights / local LLM (speculative — not near-term)

**Flagged speculative. Do not start this without explicit owner sign-off in
the conversation.** A user-supplied local endpoint (e.g. Ollama at
`http://localhost:11434`) is a **different origin**, so `connect-src 'self'`
blocks it: this tier requires loosening the CSP, which is on the
owner-sign-off list in `ffos-change-control`, and arguably adds the app's
first-ever network egress path (even if loopback). Vendoring an in-browser
model (transformers.js + weights) conflicts with the no-build, small-vendor
architecture and is likewise sign-off territory.

**What is buildable without sign-off:** template-based natural-language
insights — plain-JS sentence templates over numbers the other four projects
compute ("Dining spend in June was ₹18,400, 2.1× your 6-month median").
This is the graceful-degradation floor: the LLM tier, if it ever exists,
must only *rephrase* numbers computed locally by deterministic code, never
*compute* them, so everything still works (and says the same numbers) with
no model present.

**First three steps (template tier only).** (1) Define an `Insight` object
`{id, severity, template, values}` produced by projects 1–3's scoring
functions; (2) render them through one `renderInsightsFeed()` card behind
an experiments flag; (3) verify-script asserts every number in every
rendered sentence equals the value recomputed independently from seeded
data. **Result when:** ≥10 distinct insight templates render on seeded
data with **100% of displayed numbers exactly reproduced** by the script.
The LLM tier has no milestone here — it gets one only after owner sign-off
defines its scope.

---

## External positioning — what this project may honestly claim

Anything public (README, write-up, HN/show-and-tell) must respect these:

**Genuinely differentiating, claimable now:** a fully-local,
Indian-tax-aware family finance OS — both-regime FY 2025-26 computation,
EPF/NPS/gratuity, ESOP/FX, multi-member, single HTML+JS deployable to IPFS,
zero external requests enforced by CSP. "Your data never leaves your
browser" is verifiable from the CSP line and is the honest headline.

**NOT claimable without proof:**
- Parsing or categorization **accuracy** — no benchmark exists.
  `autoCategory` has never been measured (Project 4 step 1 creates the first
  number). Form 16 parsing is best-effort regex (`parseForm16`, line 1607)
  with a user-review step; say "best-effort, review before use".
- **"CA-grade."** The phrase appears in internal code comments (line 1515)
  as an aspiration. Any public use of it requires a published benchmark
  against professionally-prepared computations.
- Any "AI" claim ahead of a shipped, measured project from this file.

**Reproducibility bar for any public write-up:** every number in the
write-up is reproduced by a committed fixture + script pair (synthetic
seed data + the verify script that computes the number). If a reader cannot
re-run it, the number does not go in the write-up. Methodology details:
`ffos-research-methodology`; proof tooling: `ffos-proof-and-analysis-toolkit`.

## When NOT to use this skill

- **Evidence standards, experiment write-ups, what counts as "proven"** →
  `ffos-research-methodology`.
- **Making statement parsing/import more robust** (fixtures, PDF pipeline,
  BANK_CONFIGS) → `ffos-import-hardening-campaign` and
  `ffos-statement-parsing-reference`.
- **Actually shipping any change from here** — gates, sign-off, commit style
  → `ffos-change-control`; migration mechanics →
  `ffos-data-model-and-migrations`; browser verification →
  `ffos-browser-verification`.
- **Indian tax/EPF/NPS domain facts** → `indian-finance-reference`.
- **Something is broken** → `ffos-debugging-playbook`.

## Provenance and maintenance

All code facts verified 2026-07-19 against HEAD `526c55f`. Re-verify before
building on any of them:

- Seed functions and lines:
  `grep -n "function detectRecurringFromTxns\|function autoCategory\|function snapshotNW\|function computeRegime\|function renderForm16Analysis\|function getCalendarEvents\|function normalizeRecurDesc" family-finance.js`
- No settings/flag mechanism exists: `grep -n "D.settings\|experiments" family-finance.js` (empty as of 2026-07-19)
- No txn-edit UI (delete only): `grep -n "deleteTxn\|editTxn" family-finance.js index.html`
- nwHistory 12-entry cap: `sed -n '1485,1491p' family-finance.js`
- Low-balance scan models no inflows: `sed -n '3193,3206p' family-finance.js`
- Existing tax insights (nine rules): `sed -n '4002,4067p' family-finance.js`
- Shortcut headroom math this catalog says to replace: lines ~4030, ~4036, ~2323
- CSP: `grep -n "Content-Security-Policy" index.html`
- Recurring-detection thresholds (≥2 months, CV<20%): `sed -n '3064,3076p' family-finance.js`
- Import commit shape / dedupe key: `sed -n '5295,5310p' family-finance.js`
- Account balances are manual (imports don't touch them):
  `grep -n "balance +=\|balance -=" family-finance.js` (no import-path hits)

**Maintenance:** when a project here ships or is abandoned, move its entry
to a short "Resolved" note (outcome + link to the write-up) rather than
deleting it — the SOTA-failure reasoning stays useful. Milestone numbers
(80%, 10%, 10 points, ≥20 profiles) are proposals set 2026-07-19; a session
may renegotiate them *before* starting a project, never after seeing
results. Tax figures are FY 2025-26 — re-check `indian-finance-reference`
after each Union Budget.
