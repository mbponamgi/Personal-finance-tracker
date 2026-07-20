#!/usr/bin/env node
// Migration-safety proof (Recipe 5): seed an OLD-shape 'family_finance_v1' store,
// load the real app in a real browser, and prove load()'s in-place migrations
// (family-finance.js load(), ~line 45):
//   1. flat D.nps {tier1,...}        → per-member D.nps.madhu.{tier1,...}
//   2. flat D.tax {gross,...}        → per-member D.tax.madhu.{gross,...}
// produce the NEW shape with ZERO data loss (every old leaf key+value survives),
// and that save() → reload round-trips without double-wrapping.
//
// Prereq:  python3 -m http.server 7902 --directory <repo-root>
// Usage:   node verify_migration_safety.cjs     (env FFOS_URL to override)
// Exit 0 = new shape present AND no key lost AND round-trip stable. Exit 1 = proof failed.

const { chromium } = require('playwright');

const URL = process.env.FFOS_URL || 'http://localhost:7902/index.html';

// OLD-shape store as it existed before the per-member refactors.
const OLD_STORE = {
  tax: { gross: 1800000, s80c: 150000, hra: 120000, tds: 150000 },       // flat: pre-migration
  nps: { pran: '110022334455', tier1: 1250000.5, tier2: 45000 },          // flat: pre-migration
  transactions: [{ id: 1, desc: 'Zomato', amount: 500, type: 'debit', cat: 'Food & Dining', member: 'madhu', date: '2026-05-01', account: '' }],
  accounts: [{ id: 2, name: 'ICICI Savings', member: 'madhu', type: 'savings', balance: 60301, credits: 0, debits: 0, updated: '2026-05-03' }]
};

// Flatten to leaf paths so "no key lost" is a mechanical count, not an eyeball.
function leaves(obj, prefix = '') {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const p = prefix ? prefix + '.' + k : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) Object.assign(out, leaves(v, p));
    else out[p] = JSON.stringify(v);
  }
  return out;
}

let fails = 0;
const assert = (label, cond, detail) => {
  console.log(`  ${label}: ${cond ? 'OK' : '*** FAIL ***'}${detail ? ' — ' + detail : ''}`);
  if (!cond) fails++;
};

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  await ctx.addInitScript(store => {
    localStorage.setItem('family_finance_v1', JSON.stringify(store));
  }, OLD_STORE);
  const page = await ctx.newPage();
  await page.goto(URL);

  const snap = () => page.evaluate(() => ({ tax: D.tax, nps: D.nps, txns: D.transactions, accounts: D.accounts, budgets: D.budgets, epf: D.epf }));
  const after = await snap();

  console.log('After load() with OLD-shape store:');
  // 1. New shape present
  assert('D.tax migrated to per-member', Object.keys(after.tax).join(',') === 'madhu', JSON.stringify(Object.keys(after.tax)));
  assert('D.nps migrated to per-member', Object.keys(after.nps).join(',') === 'madhu', JSON.stringify(Object.keys(after.nps)));

  // 2. No key lost: every old leaf must survive under the new location
  const oldTaxLeaves = leaves(OLD_STORE.tax), newTaxLeaves = leaves(after.tax.madhu || {});
  const oldNpsLeaves = leaves(OLD_STORE.nps), newNpsLeaves = leaves(after.nps.madhu || {});
  const lostTax = Object.entries(oldTaxLeaves).filter(([k, v]) => newTaxLeaves[k] !== v);
  const lostNps = Object.entries(oldNpsLeaves).filter(([k, v]) => newNpsLeaves[k] !== v);
  assert(`tax: ${Object.keys(oldTaxLeaves).length}/${Object.keys(oldTaxLeaves).length} leaves survive`, lostTax.length === 0, JSON.stringify(lostTax));
  assert(`nps: ${Object.keys(oldNpsLeaves).length}/${Object.keys(oldNpsLeaves).length} leaves survive`, lostNps.length === 0, JSON.stringify(lostNps));
  assert('nps.madhu.tier1 value exact', after.nps.madhu && after.nps.madhu.tier1 === 1250000.5, JSON.stringify(after.nps.madhu));

  // 3. Untouched collections pass through byte-identical
  assert('transactions untouched', JSON.stringify(after.txns) === JSON.stringify(OLD_STORE.transactions));
  assert('accounts untouched', JSON.stringify(after.accounts) === JSON.stringify(OLD_STORE.accounts));

  // 4. deepMerge filled defaults without clobbering (missing keys gain defaults)
  assert('defaults merged in (budgets present)', after.budgets && 'Food & Dining' in after.budgets);
  assert('defaults merged in (epf present)', after.epf && after.epf.retireAge === 60);

  // 5. Round-trip: save() writes NEW shape; reloading must not double-wrap or lose
  await page.evaluate(() => save());
  await page.reload();
  const again = await snap();
  assert('post-save reload: tax shape stable', Object.keys(again.tax).join(',') === 'madhu' && !('madhu' in (again.tax.madhu || {})),
    JSON.stringify(Object.keys(again.tax.madhu || {})));
  assert('post-save reload: values intact', again.tax.madhu.gross === 1800000 && again.nps.madhu.tier2 === 45000);

  await browser.close();
  if (fails) { console.error(`\nMIGRATION PROOF FAILED: ${fails} assertion(s). Do NOT ship this migration.`); process.exit(1); }
  console.log('\nMIGRATION SAFETY PROOF OK: new shape present, zero keys lost, save/load round-trip stable.');
})().catch(e => { console.error(e); process.exit(1); });
