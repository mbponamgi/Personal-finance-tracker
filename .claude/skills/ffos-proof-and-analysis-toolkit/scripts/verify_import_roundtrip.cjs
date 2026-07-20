#!/usr/bin/env node
// Import round-trip accounting + idempotency proof (Recipes 3 & 4).
//
//   PART A (round-trip): lines-in-file == header + imported + rejected, proven
//           via the app's own counters AND independent file line count.
//   PART B (idempotency): import the SAME file twice (page reload in between,
//           which also proves localStorage persistence). confirmImport dedupes
//           on key date|desc|amount → second import must add 0, skip 3.
//   PART C (known weak point): duplicates WITHIN one file are NOT deduped —
//           the `existing` Set is snapshotted before the loop and never updated.
//
// Prereq:  python3 -m http.server 7902 --directory <repo-root>   (file:// fails: ESM+CSP)
// Usage:   node verify_import_roundtrip.cjs
// Env:     FFOS_URL (default http://localhost:7902/index.html)
// Exit 0 = all assertions hold. Exit 1 = a proof failed.

const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO = path.resolve(__dirname, '../../../..');
const URL = process.env.FFOS_URL || 'http://localhost:7902/index.html';
const CSV = path.join(REPO, 'test_icici.csv');

let fails = 0;
const assert = (label, cond, detail) => {
  console.log(`  ${label}: ${cond ? 'OK' : '*** FAIL ***'}${detail ? ' — ' + detail : ''}`);
  if (!cond) fails++;
};

async function importFile(page, file) {
  await page.evaluate(() => go('import')); // Import Statement page is hidden by default nav
  await page.setInputFiles('#csvFile', file);
  await page.waitForFunction(() =>
    document.getElementById('parse-summary').textContent.includes('rows read'));
  return page.evaluate(() => ({
    summary: document.getElementById('parse-summary').textContent,
    parsed: parsedRows.length            // app global (classic script, not a module)
  }));
}
async function clickImport(page) {
  await page.click('#importConfirmBtn');
  return page.evaluate(() => ({
    badge: document.getElementById('parse-status-badge').textContent,
    txnCount: D.transactions.length,
    perMember: D.transactions.reduce((m, t) => (m[t.member] = (m[t.member] || 0) + 1, m), {})
  }));
}

(async () => {
  const browser = await chromium.launch();

  // ── PART A: round-trip accounting with test_icici.csv ──────────────────
  const fileLines = fs.readFileSync(CSV, 'utf8').split('\n').filter(l => l.trim()).length;
  const HEADER_ROWS = 1; // BANK_CONFIGS['icici-salary'].skipRows
  console.log(`PART A — round-trip accounting (${path.basename(CSV)}: ${fileLines} non-blank lines)`);

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(URL);

  const a = await importFile(page, CSV);
  console.log('  parse summary: "' + a.summary.trim() + '"');
  const m = a.summary.match(/(\d+) rows read · (\d+) valid · (\d+) skipped/);
  assert('summary counters present', !!m, a.summary);
  const [rowsRead, valid, skipped] = m ? [+m[1], +m[2], +m[3]] : [NaN, NaN, NaN];
  assert('rows read == file lines - header', rowsRead === fileLines - HEADER_ROWS, `${rowsRead} vs ${fileLines}-${HEADER_ROWS}`);
  assert('rows read == valid + skipped', rowsRead === valid + skipped, `${rowsRead} == ${valid}+${skipped}`);
  assert('file lines == header + imported + rejected', fileLines === HEADER_ROWS + valid + skipped);
  assert('parsedRows matches valid', a.parsed === valid);

  const r1 = await clickImport(page);
  console.log('  import badge: "' + r1.badge.trim() + '"');
  assert('imported all valid rows', r1.badge.includes(`Imported ${valid} txns`) && r1.txnCount === valid,
    `store has ${r1.txnCount}`);
  assert('per-member accounting (1006309 lesson)', (r1.perMember.madhu || 0) === valid,
    JSON.stringify(r1.perMember));

  // ── PART B: idempotency across a reload ────────────────────────────────
  console.log('PART B — same file, second import (after reload; store persisted)');
  await page.reload(); // "Import All" button stays disabled after Done ✓ — reload is the honest re-import path
  const persisted = await page.evaluate(() => D.transactions.length);
  assert('store survived reload', persisted === valid, `${persisted}`);

  await importFile(page, CSV);
  const r2 = await clickImport(page);
  console.log('  import badge: "' + r2.badge.trim() + '"');
  assert('second import added 0', r2.badge.includes('Imported 0 txns'), r2.badge.trim());
  assert(`second import skipped ${valid} duplicates`, r2.badge.includes(`${valid} duplicates skipped`), r2.badge.trim());
  assert('count unchanged (3, not 6)', r2.txnCount === valid, `${r2.txnCount}`);

  // ── PART C: intra-file duplicates are NOT deduped (known weak point) ───
  console.log('PART C — duplicate rows INSIDE one file (fresh store)');
  const dupCsv = path.join(os.tmpdir(), 'ffos_dup_probe.csv');
  fs.writeFileSync(dupCsv, [
    'S No., Value Date, Transaction Date, Cheque Number, Transaction Remarks, Withdrawal Amount(INR), Deposit Amount(INR), Balance(INR)',
    '1, 01/05/2026, 01/05/2026, , Zomato, 500.00, , 10500.00',
    '2, 01/05/2026, 01/05/2026, , Zomato, 500.00, , 10000.00', // same date|desc|amount
    '3, 03/05/2026, 03/05/2026, , Netflix, 199.00, , 9801.00'
  ].join('\n') + '\n');
  const ctx2 = await browser.newContext();
  const page2 = await ctx2.newPage();
  await page2.goto(URL);
  await importFile(page2, dupCsv);
  const r3 = await clickImport(page2);
  console.log('  import badge: "' + r3.badge.trim() + '"');
  const zomatoCopies = await page2.evaluate(() => D.transactions.filter(t => t.desc === 'Zomato').length);
  assert('BOTH intra-file copies imported (no in-batch dedupe)', r3.txnCount === 3 && zomatoCopies === 2,
    `store=${r3.txnCount}, Zomato copies=${zomatoCopies} — dedupe Set is pre-loop snapshot only`);
  fs.unlinkSync(dupCsv);

  await browser.close();
  if (fails) { console.error(`\nROUND-TRIP PROOF FAILED: ${fails} assertion(s).`); process.exit(1); }
  console.log('\nROUND-TRIP + IDEMPOTENCY PROOF OK (cross-import dedupe real; intra-file dedupe absent — see ffos-import-hardening-campaign).');
})().catch(e => { console.error(e); process.exit(1); });
