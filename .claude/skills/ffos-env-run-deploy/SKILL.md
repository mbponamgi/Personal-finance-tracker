---
name: ffos-env-run-deploy
description: >
  Environment setup, running/serving, vendor contract, deploy story, and data
  backup for Family Finance OS (this repo). Load when: setting up the repo from
  scratch (npm install, playwright, prerequisites); running or serving the app
  locally; the app won't load / blank page / boot errors; CSP or ES-module
  loading errors in the console; "port already in use" or server won't start;
  the app suddenly "looks empty" (localStorage/port trap); deploying, hosting,
  static-site, IPFS, or Unstoppable Domains questions; changing anything under
  vendor/ (pdf.js, SheetJS, Chart.js, fonts) or upgrading a vendored library;
  backing up or restoring user data.
---

# Family Finance OS — environment, run, and deploy runbook

**What this is** (30 seconds of context): "Family Finance OS" is a privacy-first,
zero-build, single-page vanilla-JS web app. No framework, no bundler, no backend,
no external network requests. The entire live app is three things at the repo
root: `index.html` (1,957 lines), `family-finance.js` (5,332 lines), and
`vendor/` (all third-party JS + fonts, self-hosted). All user data lives in
`localStorage` under the key `family_finance_v1` (defined at
`family-finance.js:4`, written at `family-finance.js:77`; a second key
`numbers_hidden` at line 86 is a UI preference only).

**The two non-negotiables** (owner, 2026-07-12):
1. NEVER break saved data.
2. VERIFY IN A REAL BROWSER. `file://` does not work (see below). Serve over
   HTTP and drive the real UI.

Jargon used once: **ESM** = ECMAScript modules (`import`/`export`, loaded via
`<script type="module">`). **CSP** = Content-Security-Policy, a browser policy
restricting where scripts/styles/fonts may load from. **SPA** = single-page app.

---

## 1. Live files vs stale copies — check this FIRST

The repo contains full stale copies of the app. **Never edit them.** The live
app is ONLY root `index.html` + `family-finance.js` + `vendor/`.

| Path | Status |
|---|---|
| `index.html`, `family-finance.js`, `vendor/` (repo root) | **LIVE — the only editable app code** |
| `handoff/` | STALE COPY — never edit (5 tracked files) |
| `Documents/Personal-finance-tracker/` | STALE COPY — never edit (8 tracked files) |
| `code-from-github-June2026/` | STALE COPY — never edit (3 tracked files) |
| `personal-finance-tracker-handoff.zip` | STALE ARCHIVE — never edit |

Confirm you are looking at live files (verified 2026-07-19; 54 tracked files total):

```bash
cd /Users/mponamgi/Documents/Personal-finance-tracker
git ls-files | grep -vE '^(handoff/|Documents/|code-from-github-June2026/)'
# Live app files in that list: index.html, family-finance.js, vendor/**
```

If your editor search hits a path containing `handoff/`, `Documents/`, or
`code-from-github-June2026/`, you are in a stale copy. Stop and re-navigate.

---

## 2. From-scratch environment setup

### Prerequisites (versions observed working, 2026-07-19)

| Tool | Version observed | Needed for |
|---|---|---|
| node | v24.15.0 | eslint, Playwright verify scripts |
| npm | 11.12.1 | installing devDeps |
| python3 | 3.14.3 | `python3 -m http.server` (the canonical dev server) |
| git | 2.54.0 (Apple Git-156) | repo operations |

### Install

```bash
cd /Users/mponamgi/Documents/Personal-finance-tracker
npm install
```

What this installs and why (from `package.json`, verified 2026-07-19):
- devDependencies: `eslint` ^10.4.1 + `@eslint/js` ^10.0.1 — powers
  `npm run lint` / `npm run lint:fix` (lints `family-finance.js` only;
  config in root `eslint.config.js`).
- dependencies: `playwright` ^1.60.0 — used for throwaway browser
  verification scripts (`verify_*.cjs`) that drive the real UI.
- `"type": "module"` is set in package.json, which is why verify scripts use
  the `.cjs` extension (they are CommonJS `require()` scripts).
- `npm test` is a stub that exits 1 ("no test specified"). There is no test
  suite and no build/test CI — `.github/workflows/` contains only Claude-based
  PR review (claude.yml, claude-code-review.yml).

### Playwright browsers

```bash
npx playwright install chromium
```

Idempotent — safe to run even if already installed. On this machine
(2026-07-19) browsers were already present: `~/Library/Caches/ms-playwright/`
contains `chromium-1223`, `chromium_headless_shell-1223`, `ffmpeg-1011`
(Playwright 1.60.0). If `boot_check.cjs` fails with "Executable doesn't
exist", run the command above.

### Readiness check

```bash
npm run lint
```

Expected output as of 2026-07-19 (this is the **current baseline**, not a
regression you caused):

```
✖ 136 problems (46 errors, 90 warnings)
  0 errors and 5 warnings potentially fixable with the `--fix` option.
```

The command exits non-zero because of the 46 pre-existing errors (mostly
`no-undef` for browser globals like `setTimeout` and `no-unused-vars` for
functions called from inline HTML handlers). A successful setup = lint runs
and reports ~136 problems. If your change *increases* these counts, that is
on you.

---

## 3. Running the app

### Canonical serve command

House convention: ports **789x** (7890–7899). Check the port is free first.

```bash
lsof -iTCP:7894 -sTCP:LISTEN -P   # no output = free
python3 -m http.server 7894 --directory /Users/mponamgi/Documents/Personal-finance-tracker
```

From a Claude Code session, start it with `run_in_background: true` (never
foreground — it blocks forever). Then smoke-check:

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:7894/    # expect: 200
```

Fuller smoke check — every asset must be 200 with the right MIME type
(observed 2026-07-19 with python 3.14.3's http.server):

```bash
for f in family-finance.js vendor/pdf.min.js vendor/pdf.worker.min.js \
         vendor/xlsx.full.min.js vendor/chart.umd.js vendor/fonts/fonts.css; do
  printf "%s: " "$f"
  curl -s -o /dev/null -w "%{http_code} %{content_type}\n" "http://localhost:7894/$f"
done
# All .js -> 200 text/javascript ; fonts.css -> 200 text/css
```

Open `http://localhost:7894/` in a browser, or run the headless boot check
(section 4).

### ⚠️ TRAP: localStorage is PER-ORIGIN — changing ports makes the app "look empty"

`localhost:7894` and `localhost:7895` are **different origins** with
**completely separate localStorage**. If you serve on a different port than
last time, the app boots with NO data. This is not data loss — the data is
still under the old port's origin. Demonstrated live 2026-07-19 (one browser,
two servers on the same directory):

```json
{"on7904":"{\"demo\":\"data-on-7904\"}","on7905":null}
```

Rules: pick one port and stick to it for a working session; if the app looks
unexpectedly empty, FIRST check what port you're on before assuming a data
bug. The same applies to Playwright: every `chromium.launch()` gets a fresh
profile with empty localStorage — `storageKeyPresent: false` in a verify
script is normal, not data loss.

### Why file:// does NOT work

pdf.js 4.x is ESM, imported by a `<script type="module">` block at
`index.html:538–544` that sets `window.pdfjsLib`. Module imports are subject
to CORS, and a `file://` page has origin `null`. Reproduced 2026-07-19 in
headless Chromium — exact console error:

```
Access to script at 'file:///Users/mponamgi/Documents/Personal-finance-tracker/vendor/pdf.min.js'
from origin 'null' has been blocked by CORS policy: Cross origin requests are
only supported for protocol schemes: chrome, chrome-untrusted, data, http, https.
```

Extra-subtle failure mode (observed): the classic scripts (`xlsx.full.min.js`,
`chart.umd.js`) DO still load from `file://`, so the page renders and looks
half-alive — but `window.pdfjsLib` is undefined and PDF import is silently
broken. Always serve over HTTP.

### Server hygiene — always clean up

```bash
pkill -f "python3 -m http.server 7894"
# Verify, and escalate if the socket lingers:
lsof -iTCP:7894 -sTCP:LISTEN -P            # should print nothing
kill -9 $(lsof -tiTCP:7894 -sTCP:LISTEN)   # only if still listening
```

Observed 2026-07-19: after `pkill`, listeners can linger a second or two;
re-check with `lsof` and `kill -9` by PID if needed. To sweep all dev
servers: `pkill -f "python3 -m http.server"`.

---

## 4. Headless boot check (scripts/boot_check.cjs)

A verified-working (2026-07-19, exit 0) Playwright script ships with this
skill. Run it **from the repo root** (so `require('playwright')` resolves
from the repo's `node_modules` — from outside the repo it fails with
`Cannot find module 'playwright'` unless you set
`NODE_PATH=/Users/mponamgi/Documents/Personal-finance-tracker/node_modules`):

```bash
cd /Users/mponamgi/Documents/Personal-finance-tracker
node .claude/skills/ffos-env-run-deploy/scripts/boot_check.cjs http://localhost:7894/
```

Expected clean output (real run, 2026-07-19):

```json
{
  "libs": { "pdfjsVersion": "4.10.38", "xlsxVersion": "0.20.3",
            "chartVersion": "4.4.1", "storageKeyPresent": false,
            "title": "Family Finance OS" },
  "fonts": ["DM Mono", "DM Sans", "Lora"],
  "consoleErrors": [],
  "externalRequests": []
}
```

Exit 0 = clean boot. It also works against a deployed URL (section 6). This
script covers the SERVER/ENV layer only — for writing feature-level
`verify_*.cjs` scripts that drive the UI, load **ffos-browser-verification**.

---

## 5. The vendor contract

### Inventory (verified from file banners/contents, 2026-07-19)

| File | Library + exact version | Role | Size (bytes) |
|---|---|---|---|
| `vendor/pdf.min.js` | pdf.js **4.10.38** (Mozilla) | PDF statement parsing; ESM, exposed as `window.pdfjsLib` via module script at `index.html:538` | 352,645 |
| `vendor/pdf.worker.min.js` | pdf.js **4.10.38** worker | pdf.js parsing worker, set as `GlobalWorkerOptions.workerSrc` (`index.html:542`) | 1,375,838 |
| `vendor/xlsx.full.min.js` | SheetJS **0.20.3** | XLS/XLSX statement parsing (`window.XLSX`); classic script (`index.html:9`) | 951,904 |
| `vendor/chart.umd.js` | Chart.js **4.4.1** | Charts (`window.Chart`); classic script (`index.html:10`) | 205,125 |
| `vendor/fonts/` | DM Sans, DM Mono, Lora (20 woff2) + `fonts.css` | Self-hosted fonts (`index.html:8`) | ~0.4 MB total |

SHA-256 (2026-07-19 baseline — recompute after any vendor change):

```
27fc2a057a00f92a4334ad06e17dbd7259912954e9fb7f76400bcca5fd190a9c  vendor/pdf.min.js
1baa1844c89c80a5b2797c916e75ab29254be46d8e9cb53cb6364d7aad84be36  vendor/pdf.worker.min.js
cc015130aa8521e7f088f88898eba949ccdcbfb38df0bd129b44b7273c3a6f41  vendor/xlsx.full.min.js
74401d738dd3e03ee5dfb3b6841210fe2c4ead8a960c4011ca4ba0b78a9fd8f3  vendor/chart.umd.js
```

### Rules (non-negotiable)

1. **Never reintroduce CDN `<script>` tags.** The CSP meta at `index.html:6`
   is `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self'
   'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self';
   worker-src 'self' blob:;` — an external script is blocked at runtime AND
   violates the self-hosting/privacy requirement. (Why it's designed this way:
   load **ffos-architecture-contract**.)
2. **Keep the pdf.js module files named `.js`, not `.mjs`.** Deliberate
   (commit 6534505): IPFS gateways reliably serve `.js` as JavaScript; the
   browser treats them as modules via `type=module` / `{type:'module'}`
   worker — the extension is irrelevant to the browser but matters to
   gateway MIME mapping. A comment in `index.html:539–541` restates this.
3. **History** (verified in git log): `8a469f8` (2026-05-31, CSP + SRI hashes
   while scripts were still on CDNs) → `85307b3` (2026-06-30, vendored all
   third-party assets locally) → `6534505` (2026-06-30, pdf.js 2.16.105 →
   4.10.38 past CVE-2024-4367, SheetJS 0.18.5 → 0.20.3 past CVE-2023-30533 /
   CVE-2024-22363, `.js`-for-IPFS naming). Do not "simplify" any of this away.

### Upgrading a vendored library — checklist

1. Read **ffos-change-control** first; a vendor upgrade is a high-risk change.
2. Download the new minified build from the official source (Mozilla for
   pdf.js, cdn.sheetjs.com for SheetJS, chartjs.org for Chart.js). For pdf.js,
   rename module builds to `.js` (rule 2) and keep `pdf.min.js` +
   `pdf.worker.min.js` versions identical.
3. Replace the file(s) in `vendor/` only. No CDN references, no loader changes
   unless the library's module format changed.
4. Verify the version string is embedded: `grep -o '"4\.10\.38"' vendor/pdf.min.js`
   (adjust pattern), and update the inventory table + hashes above.
5. Full real-browser verification: serve on 789x, run `boot_check.cjs`
   (versions, zero console errors, zero external requests), then exercise
   **PDF import, XLS/XLSX import, and charts** with real files via
   Playwright (**ffos-browser-verification**) — these are the three features
   that consume vendored code.
6. Confirm existing localStorage data still loads (non-negotiable #1).

---

## 6. Deploy story

The deployable artifact is the static bundle: `index.html` +
`family-finance.js` + `vendor/` (everything self-contained, ~3.5 MB). Any
static file host works — no server-side code, no build step.

**IPFS / Unstoppable Domains compatibility is designed-in** via the `.js`
naming trick (section 5, rule 2). Per commit `6534505`'s message
(**commit-message-attested, not reproduced by me**): the app was "verified
offline with all external network blocked and .js served as text/javascript
(no .mjs MIME): real PDF parses through the v4 module worker, XLSX 0.20.3
reads, charts + fonts load, deepMerge stays clean; 0 CSP/MIME issues, 0 JS
errors, 0 external requests."

What I **did reproduce locally** (2026-07-19): the same properties over
plain HTTP — clean boot, all three libs at expected versions, all fonts
loaded, 0 console errors, 0 external requests (section 4 output).

**HONEST GAP (as of 2026-07-19): no deploy scripts exist in the repo, and
the actual publishing procedure (which host/gateway, how the bundle is
pinned/uploaded) is not recorded anywhere in the repo.** Do not invent one.
If you deploy, record the procedure via **ffos-docs-and-commits**.

Post-deploy checklist (all checked automatically by `boot_check.cjs <deployed-url>`):
- Zero external requests (privacy contract — also visible in DevTools Network
  tab: every request should be same-origin).
- `window.pdfjsLib` defined with version `4.10.38` (proves the module `<script>`
  and MIME handling survived the host).
- PDF worker loads (drive a real PDF import for full proof).
- Fonts loaded: DM Mono, DM Sans, Lora.
- Zero console errors.
- Remember: the deployed origin has its own empty localStorage (section 3 trap).

---

## 7. Data backup and restore

**KNOWN GAP: there is NO in-app export/backup/restore UI.** Verified
2026-07-19 by grepping `family-finance.js` and `index.html` for
export/backup/download/restore — the only hits are unrelated comments
(lines 414, 4845). Until that gap is closed, backup is manual.

All data = one localStorage string. Manual procedure in the browser that
actually holds the data (DevTools console on the app's exact origin —
right port!):

```js
// BACKUP: copies the full JSON state to the clipboard
copy(localStorage.getItem('family_finance_v1'))
// Paste into a file and keep it. (Optionally also: localStorage.getItem('numbers_hidden'))
```

```js
// RESTORE: paste the saved JSON string in place of <SAVED_JSON_STRING>
localStorage.setItem('family_finance_v1', <SAVED_JSON_STRING>); location.reload();
```

Cautions:
- Back up BEFORE any change that touches the data shape (non-negotiable #1;
  see **ffos-data-model-and-migrations** for the schema and migration rules).
- Playwright CANNOT back up the user's real browser data — `chromium.launch()`
  profiles are fresh and empty (observed: `storageKeyPresent: false`).
  Playwright localStorage manipulation only applies to profiles Playwright
  itself owns (e.g., seeding test data in a verify script via
  `page.evaluate(() => localStorage.setItem('family_finance_v1', ...))`).
- Restoring onto a different port/origin than you backed up from is fine —
  the data is just a string — but remember each origin is independent.

---

## 8. When NOT to use this skill

| You need... | Load instead |
|---|---|
| Approval gates / what changes are allowed | **ffos-change-control** |
| WHY the app is vendored/CSP'd/zero-build | **ffos-architecture-contract** |
| localStorage schema, migrations, data-shape changes | **ffos-data-model-and-migrations** |
| Triage of a bug once the app IS running | **ffos-debugging-playbook** |
| Past incidents and what broke before | **ffos-failure-archaeology** |
| Writing Playwright verify_*.cjs scripts that drive the UI | **ffos-browser-verification** (this skill covers only the server/env layer) |
| Bank/CC/PDF statement parsing specifics | **ffos-statement-parsing-reference** |
| Import robustness campaign | **ffos-import-hardening-campaign** |
| Indian tax/finance domain facts | **indian-finance-reference** |
| Proof artifacts / analysis tooling | **ffos-proof-and-analysis-toolkit** |
| Research process / open questions | **ffos-research-frontier**, **ffos-research-methodology** |
| Commit message / documentation conventions | **ffos-docs-and-commits** |

---

## Provenance and maintenance

All facts above verified 2026-07-19 on Darwin 25.6.0 (node v24.15.0,
python 3.14.3, Playwright 1.60.0/chromium-1223) unless labeled
"commit-message-attested" (the IPFS offline verification in section 6, from
commit `6534505`). One-line re-verification commands:

```bash
# Server up + assets served with correct MIME:
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:7894/                    # 200
curl -s -o /dev/null -w "%{content_type}\n" http://localhost:7894/vendor/pdf.min.js # text/javascript
# Vendor versions still as documented:
grep -c '"4\.10\.38"' vendor/pdf.min.js vendor/pdf.worker.min.js; grep -c '"0\.20\.3"' vendor/xlsx.full.min.js; grep -m1 -o 'Chart\.js v[0-9.]*' vendor/chart.umd.js
# Vendor integrity vs the 2026-07-19 baseline hashes in section 5:
shasum -a 256 vendor/pdf.min.js vendor/pdf.worker.min.js vendor/xlsx.full.min.js vendor/chart.umd.js
# Lint baseline (currently 136 problems: 46 errors, 90 warnings):
npm run lint 2>&1 | tail -2
# Full boot re-verification:
node .claude/skills/ffos-env-run-deploy/scripts/boot_check.cjs http://localhost:7894/
# Still no in-app backup UI? (expect 1 unrelated comment hit, family-finance.js:4845):
grep -in 'backup\|export' family-finance.js | grep -vi 'transport\|report' | wc -l
```
