---
name: ffos-research-methodology
description: >
  How a hunch becomes an accepted result in the Family Finance OS repo: the
  evidence bar for root-cause and new-mechanism claims, the hypothesis
  template, the idea lifecycle (hunch -> throwaway verify -> candidate ->
  adopted or retired), and the anti-patterns this repo has already paid for.
  Load this skill when: forming a hypothesis about a bug's cause; proposing a
  new heuristic, detector, or algorithm (EMI detection, statement parsing,
  categorization); deciding whether an experimental idea should be adopted or
  retired; asked "how do we know this is true / better?"; or tempted to ship
  a fix for a symptom you have not yet explained. Pairs with
  ffos-browser-verification (evidence mechanics), ffos-proof-and-analysis-toolkit
  (proof recipes), and ffos-research-frontier (what to work on — this skill
  defines HOW).
---

# FFOS Research Methodology

How to turn a hunch into an accepted result in THIS repo. Every rule below was
paid for by a real incident in this repo's history; hashes are cited so you can
re-read the receipts with `git show <hash>` (read-only). All historical claims
verified against git history on 2026-07-19.

The owner's two non-negotiables (2026-07-12) frame everything here:

1. NEVER break saved data (one localStorage key, a real family's books, no undo).
2. VERIFY IN REAL BROWSER; success must be measurable, never judged by eye.

This skill is the doctrine for #2 applied to *claims*: a root cause you assert,
a heuristic you propose, an idea you want adopted.

---

## 1. The Evidence Bar (core doctrine)

A root-cause claim or new-mechanism claim is ACCEPTED only when it passes all
three tests. Not two. All three.

### (a) One mechanism explains ALL observations — including the negatives

Your hypothesis must account for every symptom AND for everything that did
NOT break. If you cannot explain why the working parts still work, you have a
correlation, not a mechanism.

**Worked example (member segregation, verified via `git show 1006309`,
2026-06-14):** Symptoms: individual member dashboards showed empty assets,
several widgets ignored the member filter — but the "All" view worked
perfectly, and newly added items behaved correctly in every view. Two rounds of
symptom-by-symptom patching came first (`633b7d6` fixed four render functions,
`6e00172` segregated four more features). The accepted claim arrived in
`1006309`, whose commit body states the mechanism: *"items loaded from
localStorage had no member field, so filterByMember() returned nothing for
individual members."* One missing field explains everything:

- Individual views empty → legacy items have no `member`, filter drops them. ✓
- All view fine → 'all' skips the filter entirely. ✓
- New items fine → the modal stamps `member` at creation. ✓

The fix was then obvious and singular: a `load()` migration stamping
`member='madhu'` on every legacy item across all data arrays. When one
mechanism explains all three observations including the two negatives, you are
done hunting. Before that point, you are not.

**Checklist before asserting a root cause:**

- [ ] List EVERY observed symptom (not just the one in the bug report).
- [ ] List at least two things that still WORK and should, under your mechanism.
- [ ] Confirm the mechanism predicts each item on both lists.
- [ ] If any observation needs a second mechanism to explain it, say so
      explicitly — two mechanisms means two hypotheses, each needing its own pass.

### (b) It survives an assigned adversarial-refutation pass

Before adopting, spend one explicit pass trying to BREAK the hypothesis. Do not
skip this because the mechanism "feels right" — the EMI saga (section 5) is
eight commits of mechanisms that felt right. Run the standard attacks:

- [ ] **Alternative mechanism, same symptom.** Name at least one rival
      hypothesis that would produce the identical observation. Design the
      discriminating experiment (section 2) to separate them. Example: "field
      is missing" vs. "filter function is broken" both yield empty views —
      but only the first predicts that NEW items work (they did).
- [ ] **Coincidence in the test data.** Would this hold on data you have not
      looked at? The `credit limit = 23` bug (`c8a1144`, 2026-06-14) was a
      regex that stopped at the first digit it met — which happened to be the
      "2" in "May 23,". A pattern tuned on one statement is a coincidence
      until it survives a second statement.
- [ ] **Environment artifact.** In this repo, specifically rule out:
      - Wrong port → different origin → EMPTY localStorage → everything looks
        broken. Check `localStorage.getItem('family_finance_v1')` is non-null
        before believing any "data is gone" symptom.
      - Stale `python3 -m http.server` still serving old file contents →
        your fix "does nothing". Restart the server; hard-reload.
      - `file://` opening → ESM + strict CSP fail → app half-dead. Never
        conclude anything from a `file://` load (see ffos-env-run-deploy).
- [ ] **Order-of-operations masking.** Amex `71cf4a9`: the Amex-specific
      extraction was CORRECT, but generic fallback patterns ran afterwards and
      overwrote the right answers. Ask: does later code overwrite what I fixed?

If the hypothesis survives all attacks you could design, record which attacks
you ran (in the hypothesis block, section 2). "It survived attacks I didn't
think of" is worth nothing; "it survived these four named attacks" is evidence.

### (c) Numbers were PREDICTED BEFORE RUNNING

Write the expected counts/values down FIRST, then execute the experiment. If
you look at the output and then decide it looks right, you have judged by eye —
the exact failure the owner's non-negotiable exists to prevent.

**The anti-Amex rule.** On 2026-06-14, the Amex parser shipped at 13:11
(`9ebb1ed`) and was re-fixed at 13:51 (`71cf4a9`), 14:06 (`b8dfc8c`), and
14:27 (`c8a1144`) — four same-day fixes because each version shipped without
predicted numbers checked against a repro corpus. Four fixes = four unpredicted
outcomes. Had the first commit been preceded by "this fixture must yield
N transactions, outstanding = X, min due = Y, due date = Z, credit limit = W",
bugs 2 through 4 would have been caught before commit 1 landed: all four
metadata fields were wrong the whole time.

Contrast the arc that worked: the security/vendoring work (`85307b3`,
`6534505`, 2026-06-30) declared its acceptance numbers up front and reported
them in the commit body: *"0 external requests, 0 CSP violations, 0 JS errors"*
with all external network blocked. Zero is a predicted number too.

**Rule:** every experiment log contains a "Predicts" section written before
the "Result" section. If your Result surprised you, the hypothesis is wrong or
incomplete — do NOT patch the code to make the surprise go away; revise the
hypothesis and re-run.

---

## 2. Hypothesis Template (copy-paste)

Use this block verbatim for any non-trivial bug or mechanism claim. Keep it in
your working notes or the scratchpad; paste the completed block into the
commit body or the failure-archaeology entry.

```
## Hypothesis: <one-line name>
Date: YYYY-MM-DD

SYMPTOM(S):
  1. <observable fact, with the number: "individual view shows 0 loans">
  2. ...

HYPOTHESIS (mechanism, not location):
  <WHY it happens, not WHERE. Bad: "bug in filterByMember". Good: "legacy
  items lack a member field, so the member filter drops all of them".>

PREDICTS (written BEFORE running anything):
  1. <quantitative: "importing test_icici.csv yields exactly 12 txns">
  2. <quantitative: "D.loans gains exactly 1 entry, emi=23790">
  3. NEGATIVE: <"X should STILL work / be unchanged: All-view totals
     identical before and after"> (at least one required)

DISCRIMINATING EXPERIMENT:
  <The CHEAPEST experiment that separates this hypothesis from its best
  rival. Name the rival. Usually: a verify_*.cjs Playwright script against
  http.server with a synthetic fixture, asserting the predicted numbers.>

REFUTATION PASS (attacks attempted):
  - alternative mechanism: <named rival + why the experiment rules it out>
  - test-data coincidence: <second fixture / held-out data used>
  - environment artifact: <port checked, server fresh, localStorage non-null>

RESULT:
  <actual numbers, pasted from the script output — not paraphrased>

VERDICT: CONFIRMED | REFUTED | INCONCLUSIVE (-> new hypothesis: ...)
```

Rules of use:

- "Mechanism, not location." A file/line is where you look; a mechanism is a
  sentence with a *because* in it that generates predictions.
- Every prediction gets a number or an exact string. "Should work better" is
  not a prediction.
- At least one NEGATIVE prediction ("X should still work") is mandatory —
  it is what catches the fix that breaks something else, and it is the test
  the member-segregation mechanism passed and the EMI patches never faced.
- If Result ≠ Predicts, the verdict is REFUTED or INCONCLUSIVE. Never edit
  the Predicts section after running. Start a new block.

---

## 3. The Idea Lifecycle Here

Every mechanism-level idea (new heuristic, detector, parser branch, algorithm)
moves through these stages. Skipping a stage is how this repo got its scars.

```
hunch
  -> throwaway probe (verify_*.cjs + SYNTHETIC fixture)
    -> predicted-numbers experiment (section 2 block)
      -> candidate implementation (labeled, gated, acceptance criterion pre-declared)
        -> ADOPTED (root-cause commit; skills updated)
        or RETIRED (recorded in ffos-failure-archaeology)
```

**Stage 1 — Hunch.** Free. Write it as one sentence with a *because*.

**Stage 2 — Throwaway probe.** A `verify_*.cjs` Playwright script driving the
real UI via `python3 -m http.server` (never `file://` — ESM + CSP make it lie;
see ffos-env-run-deploy and ffos-browser-verification for mechanics). Build a
SYNTHETIC fixture in the scratchpad, modeled on `test_icici.csv` /
`mock_nps.csv` — never a real family statement: real statements are private,
irreproducible, and tuning against them is anti-pattern #4 (section 4).
The probe's only job is to make the phenomenon reproducible on demand. No
repro, no next stage — this is the lesson of the Amex saga.

**Stage 3 — Predicted-numbers experiment.** Fill the section-2 block. Run the
discriminating experiment. Numbers first, execution second.

**Stage 4 — Candidate implementation.** Only if the experiment confirmed the
mechanism:

- [ ] Label it a candidate (comment header naming this stage + date), so a
      later session knows it is on probation, not settled doctrine.
- [ ] Gate it behind ffos-change-control — parser/heuristic/schema changes are
      full-gate territory there.
- [ ] Declare the measurable acceptance criterion BEFORE building: "adopted
      when it produces exactly the expected loans on fixtures A and B, and
      zero spurious loans on held-out fixture C, with All-view totals
      unchanged." If you cannot state the criterion, you are not ready to
      build — this is precisely what the EMI auto-detection never had, which
      is why "done" was undefined and the tuning never converged.
- [ ] Data-shape changes go through ffos-data-model-and-migrations
      (non-negotiable #1: never break saved data).

**Stage 5a — Adopted.** Commit with a root-cause body (mechanism + predicted
vs. actual numbers — see the exemplary bodies of `1006309`, `b8dfc8c`,
`6534505`; format per ffos-docs-and-commits conventions used in this repo).
Update any skill whose doctrine the result changes.

**Stage 5b — Retired.** A documented dead end is a DELIVERABLE, not a failure.
The AI Policy Scanner (section 4, #3) cost a same-day remove-and-rebuild partly
because nothing recorded what the first version got wrong. Record the
retirement in ffos-failure-archaeology using this template:

```
## Retired idea: <name>
Date: YYYY-MM-DD
Stage reached: hunch | probe | experiment | candidate
Hypothesis block: <paste the section-2 block, including REFUTED verdict>
Why retired:
  <mechanism that killed it, with the numbers that showed it>
What it cost: <time / commits / any code left behind (list the warts)>
What would revive it: <the observation or new data that would justify retry;
  "nothing" is a valid answer>
Do NOT retry without: <the missing prerequisite, e.g. "a corpus of 3+ real
  statement formats" or "a held-out fixture">
```

---

## 4. Anti-Patterns (each one paid for here)

Verified against git history 2026-07-19. When you catch yourself in one of
these, stop and go back to section 2.

**1. Fix-by-hardcode.** Patching the *instance* instead of the *mechanism*.
The EMI auto-detector misclassified specific transactions, and the fixes were
literal value exclusions: `34fb4aa` added "specific auto-detection rule for
23790 EMI as Auto Loan"; `3d9b198` "Completely exclude and purge Apple-related
entries"; `6188fdc` "Exposed bajaj electronics and 24,999 exclusions". Those
warts are STILL in `family-finance.js` today (2026-07-19): `23790` at lines
~1657/1736/4972, `bajaj electronics` at ~1684/1698/1724/4970, `24999` at
~1685/1698/1724. Each hardcode is an admission that the mechanism was never
understood: the detector that needed "23790 means Auto Loan" will misfire on
the next family's numbers. Test: if your fix contains a merchant name or a
rupee amount as a literal, you have patched a symptom.

**2. Fix-without-repro.** Shipping a fix you cannot demonstrate failing first.
The Amex saga: `9ebb1ed` -> `71cf4a9` -> `b8dfc8c` -> `c8a1144`, four commits
between 13:11 and 14:27 on 2026-06-14. Each fix was real (the commit bodies
correctly diagnose regex adjacency, pattern-ordering overwrites, an early
return, a `> 0` guard) — but each shipped without a repro corpus asserting all
the fields at once, so each fix revealed the next latent bug in production
use. One synthetic Amex fixture with predicted values for all four metadata
fields would have collapsed four commits into one.

**3. Big-bang-remove-then-rebuild.** `1cd78f5` implemented the "Intelligent AI
Policy Document Scanner" at 19:54 on 2026-05-17; `446e8a2` patched it at
20:20; `a781e8d` "Completely remove[d]" it at 20:23; `a965ef3` rebuilt a
scanner at 20:40. Four states in 46 minutes. The idea was never staged as a
candidate with an acceptance criterion, so when it disappointed, the only
moves available were total removal and total rebuild. Contrast the security
arc (`8a469f8` 2026-05-31 -> `85307b3` -> `6534505` 2026-06-30): finding, then
staged fixes, each verified against declared measurable outcomes — an idea
lifecycle that worked, spread over weeks, with zero reverts.

**4. Tuning the heuristic against the data you're fitting.** `961e224`
"expand[ed] EMI keywords" in direct response to the statement being imported
that afternoon; the whole 2026-05-17 EMI day (8 commits, `d82f4cb` through
`6188fdc`, 17:18–19:51) is one session of fitting a heuristic to a single
family's single statement with no held-out check. Rule: any heuristic
(keywords, regexes, thresholds) must be validated on at least one fixture that
was NOT consulted while writing it. If you only have one fixture, split it, or
synthesize a second — otherwise you cannot distinguish "learned the mechanism"
from "memorized the data" (see the coincidence attack, section 1b).

**5. Declaring success by eye.** The origin of non-negotiable #2. Looking at
the rendered page and thinking "seems right" is how `9ebb1ed` shipped with all
four metadata fields wrong and how `b8dfc8c` discovered users were getting
silent no-op imports. Success is a script asserting predicted numbers
(ffos-browser-verification has the mechanics; ffos-proof-and-analysis-toolkit
has recipes). If your verification story is a screenshot, it is not
verification.

---

## 5. Where Good Ideas Came From Here

Verified from history, 2026-07-19 — the pattern behind this repo's *successful*
work:

- **Real family usage pain.** Member segregation (`633b7d6` -> `1006309`) came
  from a family member seeing an empty dashboard. Import drift fixes
  (`990960d`, `9c19361`, `7e52a70`) came from real statements failing to
  parse. These stuck because the pain recurred every time the family used the
  app.
- **Security-audit findings.** `8a469f8` (CSP/SRI/esc) and the HIGH findings
  driving `6534505` (pdf.js CVE-2024-4367, SheetJS CVE-2023-30533/2024-22363)
  — systematic examination of an attack surface the app genuinely has (it
  parses untrusted PDFs and spreadsheets).
- **Statement-format archaeology.** Studying what real bank statements
  actually look like — Amex's "May 03" dates, CR-on-next-line, label/value in
  separate table rows (`9ebb1ed`, `71cf4a9` bodies) — before writing the
  parser branch.

The generalization: **ideas earn priority by observed pain frequency, not
novelty.** The one idea in this history that led with novelty — the
"Intelligent AI" scanner with "NLP metadata heuristics and micro-animations"
(`1cd78f5`) — was removed the same evening. When choosing what to research,
ask "how often has this actually hurt someone using the app?" first
(ffos-research-frontier maintains the ranked list; this skill only defines
how to attack whatever you pick).

---

## 6. Minimum Viable Rigor — Calibrate Ceremony to Blast Radius

Do not run the full protocol on a typo. Do not skip it on a parser. Blast
radius, not effort spent, decides the tier.

**FULL PROTOCOL (sections 1–3, complete hypothesis block):**
anything touching the D schema / localStorage / `load()` migrations;
`BANK_CONFIGS` or any statement-parsing path; tax math (`computeRegime`,
EPF/NPS/gratuity); EMI/loan detection (`syncLoansFromTxns`); any new
heuristic, detector, or algorithm; anything with CSP/security implications.
These are the areas where this repo's every scar lives.

**MINIMUM VIABLE RIGOR (small fixes — a copy change, a CSS tweak, a label,
a widget rendering detail with no data-shape or parsing impact):**

- [ ] One sentence: what changes, and why nothing else can be affected.
      If you cannot write that sentence, escalate to full protocol.
- [ ] `npm run lint` passes (note: `npm test` is a stub — it proves nothing).
- [ ] Quick real-browser check via `python3 -m http.server` (never `file://`),
      with ONE concrete thing you looked for, stated before loading the page
      ("the label now reads 'FY 2025-26'") — prediction-before-observation
      scales all the way down.
- [ ] Confirm localStorage untouched: no code path near `save()`, `load()`,
      or any `D.` shape change. If yes -> full protocol, no exceptions
      (non-negotiable #1).

When unsure which tier applies, ffos-change-control owns the classification;
its gates are the authority. This section only exists so juniors do not
perform a refutation pass on a spelling fix — or skip one on a regex.

---

## When NOT to Use This Skill

- **Committing / classifying a change, gates, sign-off** -> ffos-change-control.
- **Where code should live, invariants, refactors** -> ffos-architecture-contract.
- **D schema details, writing a migration** -> ffos-data-model-and-migrations.
- **Actively debugging (you have no hypothesis yet, need triage steps)** ->
  ffos-debugging-playbook; come back here once you have a candidate mechanism.
- **The incident stories in full narrative detail** -> ffos-failure-archaeology
  (this skill extracts the discipline; that one keeps the chronicle — and
  receives your retirement records).
- **Indian tax/EPF/NPS domain facts** -> indian-finance-reference.
- **Bank statement formats and parser specifics** -> ffos-statement-parsing-reference.
- **How to run the server / environment setup** -> ffos-env-run-deploy.
- **Playwright script mechanics, evidence capture** -> ffos-browser-verification.
- **Import robustness campaign specifics** -> ffos-import-hardening-campaign.
- **Ready-made proof recipes (invariant checks, counts)** ->
  ffos-proof-and-analysis-toolkit.
- **Choosing WHAT to work on next** -> ffos-research-frontier.

---

## Provenance and Maintenance

- Authored 2026-07-19 for the FFOS skill library. All historical claims were
  verified against read-only git history on 2026-07-19 via `git show` /
  `git log`; commit quotes are from the actual commit bodies. Key evidence:
  EMI saga `d82f4cb`, `961e224`, `34fb4aa`, `a379c08`, `8cfde95`, `a92469f`,
  `3d9b198`, `6188fdc` (all 2026-05-17); Amex saga `9ebb1ed`, `71cf4a9`,
  `b8dfc8c`, `c8a1144` (all 2026-06-14); member segregation `633b7d6`,
  `6e00172`, `1006309` (2026-06-13/14); AI Policy Scanner `1cd78f5`,
  `446e8a2`, `a781e8d`, `a965ef3` (2026-05-17); security arc `8a469f8`
  (2026-05-31), `85307b3`, `6534505` (2026-06-30).
- Hardcoded-exclusion line numbers in `family-finance.js` (section 4, #1) are
  as of 2026-07-19 and will drift; re-grep for `23790`, `bajaj electronics`,
  `24999` before citing them. If those warts are ever properly removed
  (mechanism-level fix), update anti-pattern #1 to past tense and record the
  fix as a worked example.
- Update this skill when: an idea is adopted or retired via the section-3
  lifecycle (add it as an example if it teaches something new); a new
  anti-pattern is paid for (anchor it to the hash); the owner's
  non-negotiables change; or `npm test` stops being a stub (revise section 6).
- Non-negotiables quoted from the owner, 2026-07-12. Project facts
  (file sizes, fixtures, tooling) verified 2026-07-19.
