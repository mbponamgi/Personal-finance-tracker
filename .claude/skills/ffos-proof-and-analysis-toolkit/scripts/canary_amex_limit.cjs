#!/usr/bin/env node
// CANARY for the Amex "credit limit = 23" bug (commit c8a1144, 2026-06-14).
// Extracts the REAL extractCardMetadata() (+ its dependency parseDate) from
// family-finance.js, feeds it the exact two-row statement fragment from the
// original bug report, and applies the discriminating check that would have
// caught the bug in one commit:
//
//   DISCRIMINATING CHECK: an extracted credit limit must be a currency-shaped
//   amount >= a sane floor (₹10,000). "23" is a date fragment, not a limit.
//
// Usage:  node canary_amex_limit.cjs [path-to-family-finance.js]
// Exit 0 = extraction returns a sane limit (fix present).
// Exit 1 = REGRESSION: limit extraction returns a date fragment again.
// Exit 2 = extraction plumbing broke (function renamed/moved).
//
// STATUS 2026-07-19: this canary FAILS at HEAD (extracted limit = 23).
// Commit 3c3ee4c replaced family-finance.js with a lineage that lost the
// c8a1144 line-scan fix; extractCardMetadata is back to generic patterns.
// Keep this script failing-red until the fix is reinstated, then it turns green.

const fs = require('fs');
const path = require('path');

const srcPath = process.argv[2] || path.resolve(__dirname, '../../../..', 'family-finance.js');
const src = fs.readFileSync(srcPath, 'utf8');

function extractFunction(name) {
  const start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('function ' + name + ' not found');
  let i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  throw new Error('unbalanced braces extracting ' + name);
}

let extractCardMetadata;
try {
  extractCardMetadata = new Function(
    extractFunction('parseDate') + '\n' + extractFunction('extractCardMetadata') +
    '\nreturn extractCardMetadata;'
  )();
} catch (e) { console.error('EXTRACTION PLUMBING BROKE: ' + e.message); process.exit(2); }

// The exact two-row table from a real Amex statement (per c8a1144 commit message):
//   header line, then values line. Real limit: 480,000.00.
const fragment = [
  'Credit Limit Rs  Available Credit Limit Rs',
  'At May 23, 2026  480,000.00  318,809.32'
].join('\n');

const KNOWN_TRUE_LIMIT = 480000;
const SANE_FLOOR = 10000; // no Indian card has a limit below ₹10,000

const meta = extractCardMetadata(fragment, 'amex');
console.log('extractCardMetadata(amex fragment) →', JSON.stringify(meta));

// Discriminating check 1: sane floor.
const saneFloor = meta.limit >= SANE_FLOOR;
// Discriminating check 2: cross-check against the known-true value from the document.
const matchesKnown = Math.abs(meta.limit - KNOWN_TRUE_LIMIT) < 0.01;

console.log(`  sane-floor check   (limit >= ${SANE_FLOOR}): ${saneFloor ? 'PASS' : 'FAIL (limit=' + meta.limit + ')'}`);
console.log(`  known-true check   (limit == ${KNOWN_TRUE_LIMIT}): ${matchesKnown ? 'PASS' : 'FAIL (limit=' + meta.limit + ')'}`);

if (!saneFloor || !matchesKnown) {
  console.error('\nCANARY RED: the "credit limit = 23" failure mode is reproducible at HEAD.');
  console.error('The regex fallback /(?:credit\\s+limit|card\\s+limit|limit)\\D*?([\\d,]+)\\b/i captures');
  console.error('the day-of-month from "At May 23, 2026" because the real values sit on the NEXT line.');
  console.error('Fix shape that worked before (c8a1144): find the header line containing BOTH');
  console.error('"Credit Limit Rs" and "Available Credit Limit Rs", take the first \\d+\\.\\d{2} number');
  console.error('from the NEXT line; fallback = first decimal amount >= 10000 after "Credit Limit".');
  process.exit(1);
}
console.log('\nCANARY GREEN: credit-limit extraction survives the two-row Amex table.');
