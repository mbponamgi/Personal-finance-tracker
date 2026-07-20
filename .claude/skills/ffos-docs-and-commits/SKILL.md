---
name: ffos-docs-and-commits
description: >
  House style for documentation and commit messages in Family Finance OS.
  Load when: writing or reviewing a commit message; documenting an incident,
  bug investigation, or root-cause finding; adding or updating a skill in
  .claude/skills/; or asked where the docs live, what to do about README.md,
  what the commit-message format is, or how knowledge is preserved in this
  repo. Provides the commit body template (Root cause / Fix / Verified /
  Data-safety), the incident write-up template for ffos-failure-archaeology,
  and the skills-library maintenance rules.
---

# FFOS docs and commits

This skill defines how knowledge is recorded in this repo: where the docs of
record actually live, how to write a commit message, how to write up an
incident, and how to keep the skills library from rotting.

Two owner non-negotiables (stated 2026-07-12) shape everything below:

1. **Never break saved data.** Any commit touching the `D` schema must say so
   and say what migration shipped.
2. **Verify in a real browser** — and the commit body must *state* what was
   verified, not just that "it works".

## 1. Docs-of-record map

There is no `docs/` directory. Do not go looking for one, and do not create
one. As of 2026-07-12 the documentation of record is exactly two places:

| Where | What it records | Format |
|---|---|---|
| `git log` (commit bodies) | Changelog + root-cause record. What changed, why, how it was verified. | Conventional commit + narrative body (template in §2) |
| `.claude/skills/` | Operating knowledge: how the system works, how to run/verify/debug it, domain reference. | 14-skill library, house format in §4 |
| `README.md` | **Nothing.** It is a stub — its entire content is `# friendly-robot`. | Honest gap. Improving it is a nice-to-have and the owner's call; do not rewrite it unasked. |

Everything else that looks like documentation is not:

- `handoff/`, `Documents/`, `code-from-github-June2026/`, and
  `personal-finance-tracker-handoff.zip` are **stale historical snapshots**,
  not docs. Never cite them as current; never update them.
- CI (`.github/workflows/claude-code-review.yml`, `claude.yml`) runs Claude
  Code PR review and an `@claude` responder — review comments there are
  ephemeral, not a record.

**The survival rule.** Chat transcripts, scratchpads, and PR comment threads
do not survive. Knowledge that must survive goes in:

1. a **commit body** (always — it is the permanent record of the change), and
2. a **skill update in the same change** if the knowledge is operational
   (a procedure, a gotcha, a schema fact someone will need again).

If you learned something the hard way and it lives only in the conversation,
it is already lost. Write it down before you finish.

## 2. Commit message template

### Format

```
type(scope): imperative subject, ≤72 chars

Root cause: the MECHANISM of the problem, not just its location.
  Quote the failing code/regex/value if short. Explain WHY it failed.

Fix: why THIS approach; alternatives considered and rejected if any.

Verified: exactly what was run and observed — the real-browser /
  Playwright evidence (non-negotiable #2). Name the inputs, name the
  observed outputs, name the error counts.

Data-safety: REQUIRED whenever the D schema is touched (non-negotiable
  #1). What happens to existing localStorage data? What migration
  shipped, and where (usually load())?
```

Section labels are a discipline, not a rigid syntax — the exemplars below use
prose paragraphs that *cover* these sections. Cover all that apply; for a
pure feat, "Root cause" becomes "Why" (the motivation).

Types actually in use (verified against `git log`, 2026-07-12): `feat`,
`fix`, `chore`, `security` — plus scoped forms like `fix(security)`. Counts
to date: feat×15, fix×6 (one scoped), chore×5, security×1. Do not invent new
types; if none fits, `chore` with a clear subject.

### The three house exemplars — study these

**`6534505` — fix(security), the What/Why/How-verified model.** Every claim
is specific: which CVEs, which versions, and a verification paragraph that
names conditions and observations:

> Verified offline with all external network blocked and .js served as
> text/javascript (no .mjs MIME): real PDF parses through the v4 module
> worker, XLSX 0.20.3 reads, charts + fonts load, deepMerge stays clean;
> 0 CSP/MIME issues, 0 JS errors, 0 external requests.

That is the bar for a "Verified" section: conditions, actions, observed
results, counted zeros. Read the full body with `git show -s 6534505`.

**`c8a1144` — bug anatomy: quote the failing code, explain WHY.**

> The regex pattern `Credit Limit Rs\s+Available Credit Limit Rs[^0-9]*`
> stops at the first digit it encounters, which is "2" in "May 23," — so it
> captures "23," giving limit = 23.

It quotes the exact regex, walks the failure mechanism to the absurd result
(credit limit = ₹23), then describes the fix *pattern* (line-by-line scan +
fallback threshold) — not just "fixed the regex". Its second section does the
same for a silent-failure ordering bug (save/render/badge reordering).

**Style exemplar only:** the fix `c8a1144` describes was reverted by the
`3c3ee4c` rollback (2026-06-15) and is absent at HEAD — the credit-limit-₹23
bug it fixed is live again (`ffos-failure-archaeology` Incident 1). Cite this
commit body for how to WRITE a bug-anatomy paragraph, never as evidence of
current behavior — commit message quality does not imply the code survived.

**`1006309` — root cause + migration description (data-safety model).**

> Root cause: items loaded from localStorage had no member field, so
> filterByMember() returned nothing for individual members.
>
> Migration fix (load()):
> - Stamp member='madhu' on any existing item that lacks the field across
>   all data arrays: accounts, cards, loans, investments, properties, gold,
>   insurance, rewards, transactions

This is what non-negotiable #1 looks like in a commit body: the schema
change is named, the migration is named, its location (`load()`) is named,
and the affected arrays are enumerated.

**Style exemplar only:** the migration `1006309` describes was itself
silently removed by the `3c3ee4c` rollback (2026-06-15) — at HEAD, `load()`
contains no member-stamping migration (`ffos-failure-archaeology` Incident 1;
`ffos-data-model-and-migrations` §4). Cite this commit body for how to WRITE a
data-safety migration paragraph, never as evidence that the migration is
present in the code today.

### Anti-exemplars — the early history, quoted so you never repeat it

From 2026-05-12, before discipline arrived:

- `082b82c` — subject: `commited by Madhu` (says who, not what; git already
  records the author)
- `bf78914` — subject: `made corrections on some files` (says nothing:
  which files? what corrections? why?)

Test your subject: if it would be equally true of 50 other commits, rewrite
it. Also avoid the mid-period style of subject-only commits with real content
but no body (e.g. `961e224 Fix EMI auto-detection to prevent overwriting
distinct loans...`) — a good subject with no root cause is half a record.

### Mechanics

- Subject: imperative mood, ≤72 chars, no trailing period.
- Body: wrap at ~74 chars; blank line between subject and body.
- Co-author trailer per current tooling convention (see recent history:
  `Co-Authored-By: Claude ... <noreply@anthropic.com>`).
- One logical change per commit. If the body needs two unrelated "Root
  cause" sections, it is two commits.

## 3. Incident write-up template (for ffos-failure-archaeology)

When an investigation is worth remembering, the entry lands in the
**ffos-failure-archaeology** skill. Use this exact structure:

```markdown
## <Incident name> (<start date> – <end date or "ongoing">)

Symptom: what the user/dev observed, verbatim where possible.

Root cause: the mechanism. Quote the failing code if short.

Evidence: commit hashes, file:line refs, the reproducing input
  (sanitized — no real account numbers/PII).

Resolution: what fixed it, with the fixing commit hash. Or "none yet".

Status: settled | open | uncertain
  ("settled" requires real-browser verification evidence; otherwise
   "uncertain" at best.)

Lesson: the one-sentence takeaway, and WHICH SKILL now encodes it
  (name the skill and the section you added/updated).
```

Rules: every claim traceable to a hash or a file ref; date-stamp the entry;
if the lesson changed a procedure, the same change must update the relevant
skill — an archaeology entry whose lesson lives nowhere operational is a
tombstone, not a record.

## 4. Skills-library maintenance

The 14-skill library in `.claude/skills/` is living documentation. The core
rule: **when a code change invalidates a skill claim, the SAME change updates
the skill.** Not a follow-up, not a TODO — the same commit.

### Rot map — skills most likely to go stale, and their triggers

| Skill | Update it when… |
|---|---|
| ffos-statement-parsing-reference | `BANK_CONFIGS` or any parser changes; a bank changes statement format |
| ffos-data-model-and-migrations | the `D` schema changes in any way; a migration ships in `load()` |
| indian-finance-reference | every Union Budget (~February) and any mid-year tax/regulatory change |
| ffos-env-run-deploy | vendored library upgrades (`vendor/`), CSP changes, hosting changes |
| ffos-architecture-contract | new top-level module, storage mechanism, or build step (there should never be a build step) |

### Re-verification

Each skill ends with a "Provenance and maintenance" section containing
re-verification one-liners — copy-pasteable commands that check the skill's
volatile claims. When you doubt a skill's claim, run its one-liners before
trusting or citing it. When you author or update a skill, add/refresh them.

### Change-control class of skill edits

Per **ffos-change-control**: edits under `.claude/skills/` are **docs-only**
— no browser verification required — EXCEPT changes to any scripts a skill
ships (a skill's `scripts/` directory or embedded commands presented as
runnable): those must be re-run before committing, and the commit body's
Verified section says so.

### New skills follow the house format

- Frontmatter with `name:` and a trigger-rich `description:` ("Load when: …")
  — the description is what makes the skill load; write triggers, not a
  synopsis.
- A "When NOT to use" section pointing at sibling skills.
- Date-stamped volatile facts (versions, tax rules, bank formats, counts).
- A closing "Provenance and maintenance" section with re-verification
  one-liners.
- No oversell: label anything unproven as *candidate* or *open*.

## 5. House style (skills and any long-form doc)

- **Imperative runbook voice.** "Run X, check Y" — not "one could consider".
- **Define jargon once**, at first use (`D` = the app's single localStorage
  state object; define it where you first say it).
- **Tables over prose** for enumerable facts (formats, versions, mappings).
- **Copy-pasteable commands.** Full commands with absolute or repo-rooted
  paths; never pseudo-commands.
- **Never state a command you didn't run or a number you didn't measure.**
  If you must include an unrun command, label it *candidate*.
- **Label uncertainty**: settled / candidate / open / uncertain. No silent
  guessing.
- **Date-stamp anything that drifts**: bank statement formats, tax law,
  library versions, commit-type counts. "As of 2026-07-12, …".

## When NOT to use this skill

- **What must be TRUE before you commit** (verification gates, change
  classes, pre-commit checklist) → **ffos-change-control**. This skill only
  covers how to *write up* what you did.
- **How to actually run the browser verification** you'll cite in the
  Verified section → **ffos-browser-verification**.
- **Reading or adding incident entries** → the entries themselves live in
  **ffos-failure-archaeology**; this skill only supplies their template.
- **Schema/migration mechanics** (what `D` contains, how to migrate) →
  **ffos-data-model-and-migrations**.
- **Debugging an active problem** → **ffos-debugging-playbook**; come back
  here when it's time to write the commit or incident entry.
- **Architecture rules** (zero-build, CSP, vendoring) →
  **ffos-architecture-contract**.

## Provenance and maintenance

Authored 2026-07-12 against the live repo (owner non-negotiables and the
14-skill roster stated by the retiring lead that day). All hashes, quotes,
and counts verified directly from `git log` / `git show` during authoring
(2026-07-12 to 2026-07-19); every one-liner below was actually run.

Re-verification one-liners:

```bash
# The three exemplar commit bodies still read as described:
git -C /Users/mponamgi/Documents/Personal-finance-tracker show -s 6534505 c8a1144 1006309

# The anti-exemplars are quoted accurately:
git -C /Users/mponamgi/Documents/Personal-finance-tracker show -s --format='%h %s' 082b82c bf78914

# Commit-type counts (feat/fix/chore/security) — refresh §2 if new types appear:
git -C /Users/mponamgi/Documents/Personal-finance-tracker log --format='%s' | grep -oE '^[a-z]+(\([a-z0-9-]+\))?:' | sort | uniq -c | sort -rn

# README is still a stub (update §1 the day someone writes a real one):
cat /Users/mponamgi/Documents/Personal-finance-tracker/README.md

# No docs/ directory has appeared; stale handoff artifacts still present:
ls /Users/mponamgi/Documents/Personal-finance-tracker
```

Volatile facts to re-check when citing this skill later: commit-type counts
(dated 2026-07-12), README stub status, the list of sibling skills (library
was being authored in parallel on 2026-07-12 — only some siblings existed on
disk at authoring time; the 14-skill roster comes from the project brief).
