#!/usr/bin/env node
// Tax-engine cross-check: lifts the PURE tax functions out of family-finance.js
// (OLD_SLABS, NEW_SLABS, slabTax, marginalRateOld, computeRegime, bestRegime),
// runs them in Node, and compares against an independently HAND-COMPUTED profile.
//
// Usage:  node check_tax_engine.cjs [path-to-family-finance.js]
// Exit 0 = engine matches the hand computation. Exit 1 = mismatch (engine or
// hand math changed — reconcile before trusting either). Exit 2 = extraction broke
// (function renamed/moved — update the names below).
//
// Extraction technique: find "function <name>(" / "const <name> =", then
// brace/semicolon-count to the end. Works because these functions are pure
// (no DOM, no globals except each other). Re-usable for any pure fn in the repo.

const fs = require('fs');
const path = require('path');

const srcPath = process.argv[2] || path.resolve(__dirname, '../../../..', 'family-finance.js');
const src = fs.readFileSync(srcPath, 'utf8');

function extractFunction(name) {
  const start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('function ' + name + ' not found in ' + srcPath);
  let i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  throw new Error('unbalanced braces extracting ' + name);
}
function extractConst(name) {
  const m = src.match(new RegExp('^const ' + name + ' = .*?;\\s*$', 'm'));
  if (!m) throw new Error('const ' + name + ' not found in ' + srcPath);
  return m[0];
}

let engine;
try {
  const code = [
    extractConst('OLD_SLABS'), extractConst('NEW_SLABS'),
    extractFunction('slabTax'), extractFunction('marginalRateOld'),
    extractFunction('computeRegime'), extractFunction('bestRegime'),
    'return { slabTax, computeRegime, bestRegime, OLD_SLABS, NEW_SLABS };'
  ].join('\n');
  engine = new Function(code)();
} catch (e) { console.error('EXTRACTION FAILED: ' + e.message); process.exit(2); }

// ── Synthetic profile (FY 2025-26 / AY 2026-27) ─────────────────────────────
// Gross salary 18,00,000 · HRA exemption 1,20,000 · professional tax 2,400
// 80C maxed 1,50,000 · 80CCD(1B) maxed 50,000 · TDS 1,50,000
const profile = { gross: 1800000, hra: 120000, profTax: 2400, s80c: 150000, s80ccd: 50000, tds: 150000 };

// ── HAND COMPUTATION (do this on paper BEFORE running; see SKILL.md) ────────
// OLD: 18,00,000 − 1,20,000 (HRA) − 50,000 (std) − 2,400 (PT) = 16,27,600 salary income
//      VI-A = 1,50,000 + 50,000 = 2,00,000  → taxable 14,27,600
//      slabs: 2.5–5L @5% = 12,500 · 5–10L @20% = 1,00,000 · 10–14.276L @30% = 1,28,280
//      base 2,40,780 · no 87A (taxable > 5L) · cess 4% = 9,631.2 → total round = 2,50,411
// NEW: 18,00,000 − 75,000 (std) = 17,25,000 taxable (no other deductions; 80CCD(2)=0)
//      slabs: 4–8L @5% = 20,000 · 8–12L @10% = 40,000 · 12–16L @15% = 60,000 · 16–17.25L @20% = 25,000
//      base 1,45,000 · no 87A (taxable > 12L) · cess 4% = 5,800 → total 1,50,800
// Best regime: NEW (1,50,800 < 2,50,411)
const hand = {
  old: { taxable: 1427600, base: 240780, cess: 9631, total: 250411, rebate: 0 },
  new: { taxable: 1725000, base: 145000, cess: 5800, total: 150800, rebate: 0 },
  best: 'new'
};

const R = engine.computeRegime(profile);
const best = engine.bestRegime(R);

let fails = 0;
function check(label, got, want) {
  const ok = got === want;
  console.log(`  ${label}: engine=${got} hand=${want} ${ok ? 'OK' : '*** MISMATCH ***'}`);
  if (!ok) fails++;
}
console.log('Profile: gross 18,00,000 · HRA 1,20,000 · PT 2,400 · 80C 1,50,000 · 80CCD(1B) 50,000');
console.log('OLD regime:');
check('taxable', R.old.taxable, hand.old.taxable);
check('base tax', R.old.base, hand.old.base);
check('rebate 87A', R.old.rebate, hand.old.rebate);
check('cess', R.old.cess, hand.old.cess);
check('total', R.old.total, hand.old.total);
console.log('NEW regime:');
check('taxable', R.new.taxable, hand.new.taxable);
check('base tax', R.new.base, hand.new.base);
check('rebate 87A', R.new.rebate, hand.new.rebate);
check('cess', R.new.cess, hand.new.cess);
check('total', R.new.total, hand.new.total);
check('bestRegime', best, hand.best);

if (fails) { console.error(`\nTAX ENGINE MISMATCH: ${fails} check(s) failed. Do NOT trust either side until reconciled.`); process.exit(1); }
console.log('\nTAX ENGINE OK: engine output matches the independent hand computation (11/11 checks).');
