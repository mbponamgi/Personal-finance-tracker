#!/usr/bin/env node
// Net-worth invariant proof (Recipe 7): calcNW() must equal the sum of parts.
// True formula (read from family-finance.js calcNW, ~line 1448, verified 2026-07-19):
//   NW = Σ accounts.balance + Σ investments.value + Σ properties.value
//      + Σ gold(weight × purity/24 × goldRate)            [calcGoldValue]
//      + epf.balance + Σ nps[member](tier1+tier2) + gratuity accrual
//      − Σ loans.outstanding − Σ cards.outstanding
// Note: calcNW is GLOBAL (ignores the member filter); gratuity uses
// getGratuityValue() = basicDA×15/26×years — seeded empty here → 0.
//
// This script seeds a known store, computes the expected NW INDEPENDENTLY in
// Node from the same seed, then asserts the app's calcNW() in a real browser
// returns exactly that number.
//
// Prereq:  python3 -m http.server 7902 --directory <repo-root>
// Usage:   node verify_networth_invariant.cjs     (env FFOS_URL to override)
// Exit 0 = invariant holds. Exit 1 = calcNW disagrees with the sum of parts.

const { chromium } = require('playwright');

const URL = process.env.FFOS_URL || 'http://localhost:7902/index.html';

const STORE = {
  accounts:    [{ id: 1, name: 'ICICI Savings', member: 'madhu', type: 'savings', balance: 100000, credits: 0, debits: 0, updated: '2026-07-19' }],
  investments: [{ id: 2, name: 'Index Fund', member: 'madhu', value: 200000 }],
  properties:  [{ id: 3, name: 'Flat', member: 'joint', value: 5000000 }],
  gold:        [{ id: 4, name: 'Chain', member: 'sailaja', weight: 10, purity: 22 }],
  goldRate:    7500,
  epf:         { uan: '', balance: 300000, empShare: 0, erShare: 0, monthly: 0, updated: null, birthYear: 0, retireAge: 60 },
  nps:         { madhu: { pran: '', tier1: 100000, tier2: 0, fyContrib: 0, monthly: 0, equityPct: 75 } },
  loans:       [{ id: 5, name: 'Home Loan', member: 'madhu', type: 'home', outstanding: 2000000, rate: 8.5, tenure: 240, emi: 26035, intPaid: 0 }],
  cards:       [{ id: 6, name: 'Amex', member: 'madhu', outstanding: 50000, limit: 480000, dueDate: '', minDue: 0 }]
};

// ── Independent recomputation (no app code) ────────────────────────────────
const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
const expected =
    sum(STORE.accounts, a => a.balance)
  + sum(STORE.investments, i => i.value)
  + sum(STORE.properties, p => p.value)
  + sum(STORE.gold, g => g.weight * ((g.purity || 22) / 24) * STORE.goldRate)
  + STORE.epf.balance
  + Object.values(STORE.nps).reduce((s, n) => s + (n.tier1 || 0) + (n.tier2 || 0), 0)
  + 0 // gratuity: no basicDA/joiningDate seeded
  - sum(STORE.loans, l => l.outstanding)
  - sum(STORE.cards, c => c.outstanding);

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  await ctx.addInitScript(store => {
    localStorage.setItem('family_finance_v1', JSON.stringify(store));
  }, STORE);
  const page = await ctx.newPage();
  await page.goto(URL);

  // The same recomputation, done in the live page against live D — this is the
  // console one-liner to paste in DevTools on REAL data:
  const oneLiner = `calcNW() - (D.accounts.reduce((s,a)=>s+a.balance,0) + D.investments.reduce((s,i)=>s+i.value,0) + D.properties.reduce((s,p)=>s+p.value,0) + calcGoldValue() + D.epf.balance + Object.values(D.nps).reduce((s,n)=>s+(n.tier1||0)+(n.tier2||0),0) + getGratuityValue() - D.loans.reduce((s,l)=>s+l.outstanding,0) - D.cards.reduce((s,c)=>s+c.outstanding,0))`;
  const { appNW, residual } = await page.evaluate(ol => ({ appNW: calcNW(), residual: eval(ol) }), oneLiner);

  console.log('Seeded parts: 1,00,000 acct + 2,00,000 inv + 50,00,000 prop + 68,750 gold(10g·22k·7500)');
  console.log('            + 3,00,000 EPF + 1,00,000 NPS + 0 gratuity − 20,00,000 loan − 50,000 card');
  console.log(`Expected (Node, independent): ${expected}`);
  console.log(`calcNW() (browser, app code): ${appNW}`);
  console.log(`In-page residual one-liner  : ${residual}`);

  await browser.close();
  const ok = appNW === expected && residual === 0;
  if (!ok) { console.error('\nNET-WORTH INVARIANT BROKEN: calcNW no longer equals the sum of parts — re-read calcNW, a term was added/dropped.'); process.exit(1); }
  console.log('\nNET-WORTH INVARIANT OK: calcNW === independent sum of parts (exact integer match).');
  console.log('\nConsole one-liner for REAL data (must print 0):\n  ' + oneLiner);
})().catch(e => { console.error(e); process.exit(1); });
