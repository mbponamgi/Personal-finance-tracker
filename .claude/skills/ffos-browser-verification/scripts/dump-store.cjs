#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// dump-store.cjs — inspect the Family Finance OS store as the app sees it.
//
// PRECONDITION — serve the repo over http (file:// fails: ESM pdf.js + CSP):
//   python3 -m http.server 7899 --directory <repo-root>
//
// Usage:
//   node dump-store.cjs [port]                  # dump default (empty) store
//   node dump-store.cjs [port] path/to/seed.json  # seed first, then dump
//
// IMPORTANT: headless Playwright launches a THROWAWAY browser profile, so
// there is no pre-existing data to dump — that is by design (owner rule #1:
// never touch a real profile). What this script is actually for:
//   1. With a seed file: shows what load() + its migrations turn your JSON
//      into — i.e. the in-memory D after deepMerge and shape migrations
//      (e.g. flat nps {tier1:...} becomes {madhu:{tier1:...}}).
//   2. Without a seed: prints the canonical default shape of D — useful as a
//      starting point when writing seeds.
// It prints both the raw localStorage value (what save() persisted, null
// until a save() runs) and the live D object.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const args = process.argv.slice(2);
const PORT = process.env.FFOS_PORT || (args[0] && /^\d+$/.test(args[0]) ? args[0] : 7899);
const seedPath = args.find(a => !/^\d+$/.test(a));
const URL = `http://localhost:${PORT}/index.html`;

(async () => {
  let seed = null;
  if (seedPath) {
    seed = JSON.parse(fs.readFileSync(path.resolve(seedPath), 'utf8'));
    console.error(`# seeding family_finance_v1 from ${seedPath}`);
  }

  const browser = await chromium.launch();
  const context = await browser.newContext({ timezoneId: 'Asia/Kolkata' });
  const page = await context.newPage();
  page.on('pageerror', e => console.error('# pageerror:', String(e)));

  if (seed) {
    await page.addInitScript(s => {
      localStorage.setItem('family_finance_v1', JSON.stringify(s));
    }, seed);
  }

  await page.goto(URL, { waitUntil: 'load', timeout: 15000 }).catch(e => {
    console.error(`# FAIL page load — server running? python3 -m http.server ${PORT} --directory ${REPO_ROOT}\n# ${e.message}`);
    process.exit(1);
  });

  const dump = await page.evaluate(() => ({
    rawLocalStorage: localStorage.getItem('family_finance_v1'),
    numbersHidden: localStorage.getItem('numbers_hidden'),
    D: JSON.parse(JSON.stringify(D)), // live store after load() + migrations
  }));
  await browser.close();

  console.log(JSON.stringify({
    url: URL,
    localStorage_family_finance_v1: dump.rawLocalStorage ? JSON.parse(dump.rawLocalStorage) : null,
    localStorage_numbers_hidden: dump.numbersHidden,
    D_after_load_and_migrations: dump.D,
  }, null, 2));
})().catch(e => { console.error('# FAIL script crashed:', e); process.exit(1); });
