// Verify a statement import end-to-end against the REAL app (last verified working 2026-07-19).
//
// Usage:
//   1. python3 -m http.server 7903 --directory /Users/mponamgi/Documents/Personal-finance-tracker
//   2. node verify-import-playwright.cjs [bankKey] [fixturePath]
//      defaults: icici-salary /Users/mponamgi/Documents/Personal-finance-tracker/test_icici.csv
//   3. Kill the server when done.
//
// Notes learned the hard way:
//   - file:// does NOT work (pdf.js ESM module + strict CSP) — HTTP server is mandatory.
//   - You MUST go('import') before clicking #importConfirmBtn: the button exists on every
//     page but is hidden until the Import page is active, and Playwright's click waits
//     forever on an invisible element. setInputFiles works regardless (hidden input).
//   - After one import the button becomes "Done ✓" disabled and nothing re-enables it;
//     reload the page (page.goto again) between imports.
//   - Playwright ships in the repo's node_modules (runtime dependency since 3cfba21).

const REPO = '/Users/mponamgi/Documents/Personal-finance-tracker';
const { chromium } = require(REPO + '/node_modules/playwright');

const bankKey = process.argv[2] || 'icici-salary';
const fixture = process.argv[3] || REPO + '/test_icici.csv';
const URL = 'http://127.0.0.1:7903/index.html';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('pageerror', e => console.log('PAGEERROR:', e.message));

  const runImport = async () => {
    await page.goto(URL);
    await page.waitForTimeout(1200);
    await page.evaluate(() => go('import'));
    await page.evaluate((k) => {
      // Click the matching bank tab so selectBank() runs exactly as a user would trigger it.
      const btn = [...document.querySelectorAll('.bank-tab')]
        .find(b => (b.getAttribute('onclick') || '').includes(`'${k}'`));
      if (btn) btn.click();
    }, bankKey);
    await page.setInputFiles('#csvFile', fixture);
    await page.waitForTimeout(1200); // FileReader + SheetJS (or pdf.js) is async

    const preview = await page.evaluate(() => ({
      parsedRows,
      badge: document.getElementById('parse-status-badge').innerText,
      summary: document.getElementById('parse-summary').innerText,
    }));
    console.log('parsedRows:', JSON.stringify(preview.parsedRows, null, 2));
    console.log('badge:', preview.badge, '| summary:', preview.summary);

    await page.click('#importConfirmBtn');
    await page.waitForTimeout(800);

    return page.evaluate(() => {
      const D = JSON.parse(localStorage.getItem('family_finance_v1'));
      return {
        badge: document.getElementById('parse-status-badge').innerText,
        txnCount: D.transactions.length,
        firstTxns: D.transactions.slice(0, 5),
        accounts: D.accounts,
        cards: D.cards,
        loans: D.loans,
        nps: D.nps,
      };
    });
  };

  console.log('=== 1st import ===');
  const first = await runImport();
  console.log(JSON.stringify(first, null, 2));

  console.log('=== 2nd import (same file, fresh page load) — proves dedupe ===');
  const second = await runImport();
  console.log('badge:', second.badge, '| txnCount:', second.txnCount);
  if (second.txnCount !== first.txnCount) {
    console.log('!!! DEDUPE FAILED: count grew from', first.txnCount, 'to', second.txnCount);
    process.exitCode = 1;
  }

  await browser.close();
})();
