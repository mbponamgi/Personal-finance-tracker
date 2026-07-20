#!/usr/bin/env node
// runPrepay() math check. runPrepay (family-finance.js ~line 3426) is DOM-coupled,
// so this script (a) DRIFT-GUARDS the exact arithmetic lines still exist in the
// source, then (b) mirrors that arithmetic and cross-checks it against a fully
// tracked amortization schedule and the closed-form EMI formula.
//
// What runPrepay ACTUALLY does (verified 2026-07-19):
//   - EMI: uses stored l.emi if > 0, else closed-form round(P*r*(1+r)^n/((1+r)^n-1))
//   - Baseline interest: stdInterest = emi*tenure - P   (assumes stored emi/tenure consistent)
//   - Prepay simulation: month loop  interest = bal*r; principal = min(bal, emi+extra-interest)
//   - newInterest = max(0, (emi+extra)*months - P)  — assumes a FULL final payment,
//     so it OVERSTATES interest paid (understates savings) by up to one payment.
//
// Usage:  node check_prepay_math.cjs [path-to-family-finance.js]
// Exit 0 = all checks pass. Exit 1 = math disagreement. Exit 2 = drift guard tripped.

const fs = require('fs');
const path = require('path');

const srcPath = process.argv[2] || path.resolve(__dirname, '../../../..', 'family-finance.js');
const src = fs.readFileSync(srcPath, 'utf8');

// ── (a) drift guard: these exact expressions are what we mirror below ──────
const guards = [
  'const emi = l.emi > 0 ? l.emi : Math.round(P * r * Math.pow(1+r, l.tenure) / (Math.pow(1+r, l.tenure) - 1));',
  'const stdInterest = (emi * l.tenure) - P;',
  'const principal = Math.min(bal, emi + extra - interest);',
  'const newInterest = Math.max(0, ((emi + extra) * months) - P);'
];
for (const g of guards) {
  if (!src.includes(g)) {
    console.error('DRIFT GUARD TRIPPED — runPrepay changed. Missing line:\n  ' + g);
    console.error('Re-read runPrepay in ' + srcPath + ' and update this script before trusting it.');
    process.exit(2);
  }
}
console.log('Drift guard OK: all 4 runPrepay arithmetic lines present verbatim in source.');

// ── (b) mirror of runPrepay's math ─────────────────────────────────────────
function prepayMirror(l, extra) {
  const r = l.rate / 100 / 12;
  const P = l.outstanding;
  const emi = l.emi > 0 ? l.emi : Math.round(P * r * Math.pow(1 + r, l.tenure) / (Math.pow(1 + r, l.tenure) - 1));
  const stdInterest = (emi * l.tenure) - P;
  let bal = P, months = 0;
  while (bal > 0.01 && months < l.tenure * 3) {
    const interest = bal * r;
    const principal = Math.min(bal, emi + extra - interest);
    if (principal <= 0) break;
    bal -= principal;
    months++;
  }
  const newInterest = Math.max(0, ((emi + extra) * months) - P);
  return { emi, stdInterest, months, interestSaved: Math.round(stdInterest - newInterest), newInterest };
}

// Independent exact amortization: tracks every rupee of interest actually accrued.
function exactAmortization(P, annualRatePct, payment) {
  const r = annualRatePct / 100 / 12;
  let bal = P, months = 0, totalInterest = 0;
  while (bal > 0.01 && months < 10000) {
    const interest = bal * r;
    const principal = Math.min(bal, payment - interest);
    if (principal <= 0) return null; // payment doesn't cover interest
    totalInterest += interest;
    bal -= principal;
    months++;
  }
  return { months, totalInterest };
}

let fails = 0;
const assert = (label, cond, detail) => {
  console.log(`  ${label}: ${cond ? 'OK' : '*** FAIL ***'}${detail ? ' — ' + detail : ''}`);
  if (!cond) fails++;
};

// Example loan: ₹30,00,000 @ 8.5% p.a., 240 months remaining, no stored EMI.
const loan = { outstanding: 3000000, rate: 8.5, tenure: 240, emi: 0 };
const r = loan.rate / 100 / 12;

// 1. Closed-form EMI (the formula the code claims to use when l.emi is absent)
const closedForm = loan.outstanding * r * Math.pow(1 + r, loan.tenure) / (Math.pow(1 + r, loan.tenure) - 1);
const sim0 = prepayMirror(loan, 0.0001); // ~zero extra: pure-EMI schedule through the sim loop
console.log(`\nLoan: P=30,00,000 · 8.5% p.a. · 240 mo · closed-form EMI = ${closedForm.toFixed(2)} → code rounds to ${sim0.emi}`);
assert('EMI matches closed form (rounded)', sim0.emi === Math.round(closedForm), `${sim0.emi} vs ${closedForm.toFixed(2)}`);
assert('EMI amortizes to ~tenure months', Math.abs(sim0.months - loan.tenure) <= 1,
  `simulated payoff in ${sim0.months} months vs tenure 240 (±1 for EMI rounding)`);

// 2. Prepay with extra ₹10,000/month — mirror vs exact schedule
const extra = 10000;
const sim = prepayMirror(loan, extra);
const exact = exactAmortization(loan.outstanding, loan.rate, sim.emi + extra);
console.log(`\nExtra ₹10,000/mo: closes in ${sim.months} months (vs 240) · code says interest saved ₹${sim.interestSaved.toLocaleString('en-IN')}`);
assert('payoff months match exact schedule', sim.months === exact.months, `${sim.months} vs ${exact.months}`);

// 3. Quantify the known approximation: newInterest assumes a full final payment.
const overstatement = sim.newInterest - exact.totalInterest;
console.log(`  code newInterest = ${sim.newInterest.toFixed(2)} · exact accrued interest = ${exact.totalInterest.toFixed(2)}`);
assert('interest overstatement bounded by one payment', overstatement >= 0 && overstatement < sim.emi + extra,
  `overstates by ${overstatement.toFixed(2)} (< one payment ${(sim.emi + extra)})`);
const exactSaved = sim.stdInterest - exact.totalInterest;
console.log(`  displayed savings ₹${sim.interestSaved.toLocaleString('en-IN')} vs exact savings ₹${Math.round(exactSaved).toLocaleString('en-IN')} (display is CONSERVATIVE)`);

if (fails) { console.error(`\nPREPAY MATH FAILED: ${fails} check(s).`); process.exit(1); }
console.log('\nPREPAY MATH OK: mirror = closed form = exact schedule; approximation direction understood.');
