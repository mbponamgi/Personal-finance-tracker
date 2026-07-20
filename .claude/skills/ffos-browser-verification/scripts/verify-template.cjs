#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// verify-template.cjs — ANNOTATED TEMPLATE for Family Finance OS verify scripts.
// Copy this file, rename it verify-<change>.cjs, edit the SEED / DRIVE / ASSERT
// sections. It runs as-is (it verifies seeding + nav + render end-to-end), so
// you can execute it first to confirm your environment works.
//
// PRECONDITION — serve the repo over http (file:// fails: ESM pdf.js + CSP):
//   python3 -m http.server 7899 --directory <repo-root>
//   (ports 789x by convention; pass a different port as argv[1] or FFOS_PORT)
//
// Usage: node verify-template.cjs [port]
//
// HOUSE RULES this template encodes:
// - Headless Playwright, throwaway profile, localhost only. NEVER a real
//   browser profile, NEVER real bank statements.
// - Evidence = printed assertions with expected vs actual, plus captured
//   console/page errors. Screenshots are supplementary, never the evidence.
// - Seed localStorage via addInitScript BEFORE page.goto. family-finance.js
//   runs load() at script-end (INIT, family-finance.js ~line 5327) which reads
//   localStorage ONCE. Seeding after the page loads does nothing until you
//   reload — that is the classic mistake.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';
const { chromium } = require('playwright');
const path = require('path');

// Repo root, computed from this script's location:
// <repo>/.claude/skills/ffos-browser-verification/scripts/ -> up 4 levels.
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const PORT = process.env.FFOS_PORT || process.argv[2] || 7899;
const URL = `http://localhost:${PORT}/index.html`;

// ── SEED ─────────────────────────────────────────────────────────────────────
// Whole store lives in ONE localStorage key 'family_finance_v1'. load() deep-
// merges your seed over the default D, so a PARTIAL object is fine — only set
// the keys your test needs. (Canonical full shape: ffos-data-model-and-migrations.)
const SEED = {
  accounts: [
    { id: 1001, name: 'ICICI Salary Account', member: 'madhu', type: 'Salary',
      balance: 250000, credits: 0, debits: 0, updated: '01 Jul 2026' }
  ],
  transactions: [
    { id: 2001, desc: 'Zomato Order', amount: 500, type: 'debit',
      cat: 'Food & Dining', member: 'madhu', date: '2026-07-01', account: 1001 }
  ]
};

const results = [];
function check(name, ok, expected, actual) {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}` + (ok ? '' : `\n      expected: ${expected}\n      actual:   ${actual}`));
}

(async () => {
  const browser = await chromium.launch(); // headless is the default
  const context = await browser.newContext({
    // Pin the timezone: parseDate()/toISOString() in family-finance.js make
    // dates timezone-dependent (IST shifts DD/MM dates back one day). Pinning
    // makes expected values deterministic on any machine.
    timezoneId: 'Asia/Kolkata',
  });
  const page = await context.newPage();

  // Always capture errors — a verify run with uncaught exceptions is a FAIL
  // even if the assertions pass.
  const consoleErrors = [], pageErrors = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => pageErrors.push(String(e)));

  // THE CRUCIAL TRICK: install the seed before any page script runs.
  // addInitScript executes in the page before index.html's scripts, so when
  // load() runs at INIT, it finds your seed already in localStorage.
  await page.addInitScript(seed => {
    localStorage.clear(); // fresh profile is already empty; explicit anyway
    localStorage.setItem('family_finance_v1', JSON.stringify(seed));
    // Balances are MASKED by default ('₹ ••••'). If you assert displayed
    // amounts, unhide them; asserting D directly does not need this.
    localStorage.setItem('numbers_hidden', 'false');
  }, SEED);

  await page.goto(URL, { waitUntil: 'load', timeout: 15000 }).catch(e => {
    console.log(`FAIL  page load — server running? python3 -m http.server ${PORT} --directory ${REPO_ROOT}\n      ${e.message}`);
    process.exit(1);
  });

  // Sanity: seed survived load()'s deepMerge into D.
  const seeded = await page.evaluate(() => ({
    accounts: D.accounts.length, txns: D.transactions.length, accName: (D.accounts[0] || {}).name,
  }));
  check('seed reached D before INIT', seeded.accounts === 1 && seeded.txns === 1 && seeded.accName === 'ICICI Salary Account',
    '{accounts:1, txns:1, accName:"ICICI Salary Account"}', JSON.stringify(seeded));

  // ── DRIVE ──────────────────────────────────────────────────────────────────
  // Prefer real UI interaction (clicks) over calling app functions directly —
  // it exercises the same path the user does. Real selectors (index.html):
  //   nav:          .nav-item          (onclick="go('<viewId>')")
  //   member chips: .member-chip[data-member="madhu"]  (onclick="setMember(...)")
  //   views:        #view-<id>, active one has .view.active
  //   modals:       .modal-backdrop#<id>, open one has .open
  await page.click('.nav-item:has-text("Transactions")');
  const activeView = await page.getAttribute('.view.active', 'id');
  check('nav click switched view', activeView === 'view-transactions', 'view-transactions', activeView);

  // Member chip: filter to Madhu (drives setMember + renderAll)
  await page.click('.member-chip[data-member="madhu"]');
  const memberCtx = await page.textContent('#memberContext');
  check('member chip updates context', memberCtx.trim() === 'Madhu', 'Madhu', memberCtx.trim());

  // Modal round-trip (openModal/closeModal via real buttons)
  await page.click('.nav-item:has-text("Bank Accounts")');
  await page.click('#view-accounts .btn-primary'); // "+ Add Account" → openModal('accModal')
  check('modal opens', await page.evaluate(() => document.getElementById('accModal').classList.contains('open')), 'accModal has .open', 'missing');
  await page.click('#accModal .modal-close');
  check('modal closes', await page.evaluate(() => !document.getElementById('accModal').classList.contains('open')), 'accModal lost .open', 'still open');

  // ESCAPE HATCH: when no clickable element exists for a state you need,
  // page.evaluate can call app globals directly — go('tax'), openModal('taxModal'),
  // renderAll(), etc. Use sparingly; it skips the user path you claim to verify.
  await page.evaluate(() => go('transactions'));

  // ── ASSERT ─────────────────────────────────────────────────────────────────
  // Three layers of evidence, strongest first:
  // 1. App state: read D (or localStorage after a save()) via page.evaluate.
  const txn = await page.evaluate(() => D.transactions[0]);
  check('D holds seeded transaction', txn && txn.desc === 'Zomato Order' && txn.amount === 500,
    '{desc:"Zomato Order", amount:500}', JSON.stringify(txn));

  // 2. DOM: count rendered rows / read rendered text.
  const rows = await page.locator('#txn-list .txn-row').count();
  check('transactions view renders 1 row', rows === 1, 1, rows);
  const amountText = await page.textContent('#txn-list .txn-amount');
  check('rendered amount unmasked and formatted', amountText.includes('₹500'), 'contains ₹500 (needs numbers_hidden=false)', JSON.stringify(amountText));

  // 3. No errors during the whole run.
  check('no console errors', consoleErrors.length === 0, '[]', JSON.stringify(consoleErrors));
  check('no page errors', pageErrors.length === 0, '[]', JSON.stringify(pageErrors));

  // Screenshots are SUPPLEMENTARY evidence only — never the assertion:
  // await page.screenshot({ path: '/tmp/verify.png', fullPage: true });

  await browser.close();
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'}: ${results.length - failed}/${results.length} checks passed (${URL})`);
  process.exit(failed === 0 ? 0 : 1);
})().catch(e => { console.error('FAIL  script crashed:', e); process.exit(1); });
