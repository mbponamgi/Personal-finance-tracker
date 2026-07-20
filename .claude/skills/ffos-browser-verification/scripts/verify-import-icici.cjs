#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// verify-import-icici.cjs — golden-fixture regression for the ICICI Salary
// CSV import flow (test_icici.csv at repo root: Zomato 500 dr, Salary NEFT
// 50000 cr, Netflix 199 dr).
//
// PRECONDITION — serve the repo over http (file:// fails: ESM pdf.js + CSP):
//   python3 -m http.server 7899 --directory <repo-root>
//
// Usage: node verify-import-icici.cjs [port]
//
// Pass 1: empty store → Import Statement view → ICICI Salary tab →
//         upload test_icici.csv → Import All → assert exact transactions,
//         auto-created "ICICI Savings" account, and account linkage.
// Pass 2: reload (data persists in the throwaway context's localStorage) →
//         re-import the same file → assert 0 imported / 3 duplicates skipped.
//
// Expected values are derived from BANK_CONFIGS['icici-salary'].parse +
// autoCategory + confirmImport in family-finance.js, verified 2026-07-19.
// Dates: context is pinned to Asia/Kolkata, where parseDate('01/05/2026')
// yields '2026-04-30' — local midnight run through toISOString() shifts
// DD/MM dates back one day in UTC+ timezones. That is the app's real,
// persisted behavior; the fixture expectations below encode it.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const FIXTURE = path.join(REPO_ROOT, 'test_icici.csv');
const PORT = process.env.FFOS_PORT || process.argv[2] || 7899;
const URL = `http://localhost:${PORT}/index.html`;

// Golden expectations (transactions arrive sorted newest-first).
const EXPECTED_TXNS = [
  { date: '2026-05-02', desc: 'Netflix',     amount: 199,   type: 'debit',  cat: 'Entertainment', member: 'madhu' },
  { date: '2026-05-01', desc: 'Salary NEFT', amount: 50000, type: 'credit', cat: 'Salary',        member: 'madhu' },
  { date: '2026-04-30', desc: 'Zomato',      amount: 500,   type: 'debit',  cat: 'Food & Dining', member: 'madhu' },
];

const results = [];
function check(name, ok, expected, actual) {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}` + (ok ? '' : `\n      expected: ${expected}\n      actual:   ${actual}`));
}

async function runImport(page) {
  // Navigate to the import view through the real sidebar nav.
  await page.click('.nav-item:has-text("Import Statement")');
  // ICICI Salary is the default tab; click it anyway to exercise selectBank()
  // and to reset any previous parse state.
  await page.click('.bank-tab:has-text("ICICI Salary")');
  // The file input #csvFile is display:none — setInputFiles works regardless
  // and fires the change event that runs parseCSV(event).
  await page.setInputFiles('#csvFile', FIXTURE);
  // parseCSV reads the file async (FileReader) — wait for the preview badge.
  await page.waitForFunction(() =>
    (document.querySelector('#parse-status-badge') || {}).textContent.includes('transactions found'),
    { timeout: 10000 });
  const badge = (await page.textContent('#parse-status-badge')).trim();
  await page.click('#importConfirmBtn'); // confirmImport()
  await page.waitForFunction(() =>
    (document.querySelector('#parse-status-badge') || {}).textContent.includes('Imported'),
    { timeout: 10000 });
  const importMsg = (await page.textContent('#parse-status-badge')).trim();
  return { badge, importMsg };
}

(async () => {
  if (!fs.existsSync(FIXTURE)) {
    console.log(`FAIL  fixture missing: ${FIXTURE}`);
    process.exit(1);
  }
  const browser = await chromium.launch();
  const context = await browser.newContext({ timezoneId: 'Asia/Kolkata' });
  const page = await context.newPage();

  const consoleErrors = [], pageErrors = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => pageErrors.push(String(e)));

  // Seed an EMPTY store, exactly once. Init scripts run on EVERY navigation,
  // so guard with a marker key or the reload in pass 2 would wipe the data
  // pass 1 imported.
  await page.addInitScript(() => {
    if (!localStorage.getItem('__ffos_verify_seeded')) {
      localStorage.clear();
      localStorage.setItem('numbers_hidden', 'false');
      localStorage.setItem('__ffos_verify_seeded', '1');
    }
  });

  await page.goto(URL, { waitUntil: 'load', timeout: 15000 }).catch(e => {
    console.log(`FAIL  page load — server running? python3 -m http.server ${PORT} --directory ${REPO_ROOT}\n      ${e.message}`);
    process.exit(1);
  });

  // ── PASS 1: import into empty store ────────────────────────────────────────
  const p1 = await runImport(page);
  check('preview found 3 transactions', p1.badge.includes('3 transactions found'), '"✓ 3 transactions found"', p1.badge);
  check('import reported 3 added, 0 dupes', p1.importMsg.includes('Imported 3 txns') && p1.importMsg.includes('0 duplicates'),
    '"✓ Imported 3 txns · 0 duplicates skipped"', p1.importMsg);

  // Assert persisted state (localStorage — what save() actually wrote).
  const store = await page.evaluate(() => JSON.parse(localStorage.getItem('family_finance_v1')));
  check('store has exactly 3 transactions', store.transactions.length === 3, 3, store.transactions.length);

  EXPECTED_TXNS.forEach((exp, i) => {
    const got = store.transactions[i] || {};
    const ok = ['date', 'desc', 'amount', 'type', 'cat', 'member'].every(k => got[k] === exp[k]);
    check(`txn[${i}] ${exp.desc}`, ok, JSON.stringify(exp),
      JSON.stringify({ date: got.date, desc: got.desc, amount: got.amount, type: got.type, cat: got.cat, member: got.member }));
  });

  // confirmImport auto-creates an "ICICI Savings" account and links txns to it.
  check('auto-created 1 account', store.accounts.length === 1, 1, store.accounts.length);
  const acc = store.accounts[0] || {};
  check('account is ICICI Savings / madhu / savings', acc.name === 'ICICI Savings' && acc.member === 'madhu' && acc.type === 'savings',
    '{name:"ICICI Savings", member:"madhu", type:"savings"}', JSON.stringify({ name: acc.name, member: acc.member, type: acc.type }));
  check('all txns linked to that account', store.transactions.every(t => t.account === acc.id), `account=${acc.id} on all`,
    JSON.stringify(store.transactions.map(t => t.account)));

  // DOM evidence: transactions view renders the 3 rows.
  await page.click('.nav-item:has-text("Transactions")');
  const rows = await page.locator('#txn-list .txn-row').count();
  check('transactions view renders 3 rows', rows === 3, 3, rows);

  // ── PASS 2: reload + re-import same file → dedupe ──────────────────────────
  // (Reload also resets #importConfirmBtn, which the app leaves disabled
  // after an import — there is no in-page reset path.)
  await page.reload({ waitUntil: 'load' });
  const p2 = await runImport(page);
  check('re-import skipped all as duplicates', p2.importMsg.includes('Imported 0 txns') && p2.importMsg.includes('3 duplicates'),
    '"✓ Imported 0 txns · 3 duplicates skipped"', p2.importMsg);
  const store2 = await page.evaluate(() => JSON.parse(localStorage.getItem('family_finance_v1')));
  check('still exactly 3 transactions', store2.transactions.length === 3, 3, store2.transactions.length);
  check('still exactly 1 account (reused, not recreated)', store2.accounts.length === 1, 1, store2.accounts.length);

  check('no console errors', consoleErrors.length === 0, '[]', JSON.stringify(consoleErrors));
  check('no page errors', pageErrors.length === 0, '[]', JSON.stringify(pageErrors));

  await browser.close();
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'}: ${results.length - failed}/${results.length} checks passed (${URL})`);
  process.exit(failed === 0 ? 0 : 1);
})().catch(e => { console.error('FAIL  script crashed:', e); process.exit(1); });
