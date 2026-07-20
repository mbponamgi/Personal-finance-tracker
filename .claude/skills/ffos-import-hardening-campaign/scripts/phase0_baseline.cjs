#!/usr/bin/env node
/**
 * PHASE 0 BASELINE PROBE — ffos-import-hardening-campaign
 *
 * Drives the REAL import UI (Playwright + chromium) against a live http server
 * and prints ground-truth JSON about what the pipeline actually does today:
 *   1. Import test_icici.csv (repo root) via bank tab "ICICI Salary"
 *      -> preview badge text, summary line, and the exact D.transactions
 *         written to localStorage after clicking "Import All".
 *   2. Import a malformed ICICI CSV (bad date row + zero-amount row)
 *      -> proves rows die silently (summary counts only, no reasons).
 *   3. Import a wrong-format CSV (Amex-shaped file while ICICI selected)
 *      -> records the 0-rows-parsed failure surface (red badge + debug rows).
 *
 * Usage:
 *   node .claude/skills/ffos-import-hardening-campaign/scripts/phase0_baseline.cjs
 * Env:
 *   PORT (default 7901) — an http server must ALREADY be serving the repo root:
 *   python3 -m http.server 7901 --directory <repo-root>
 *
 * Read-only with respect to the repo: writes only to os.tmpdir() and touches
 * only the browser's localStorage (cleared at start, never your real profile).
 */
const path = require('path');
const fs = require('fs');
const os = require('os');

const REPO = path.resolve(__dirname, '..', '..', '..', '..');
const PORT = process.env.PORT || 7901;
const URL = `http://localhost:${PORT}/index.html`;

const { chromium } = require(path.join(REPO, 'node_modules', 'playwright'));

// TZ pinned to the owner's real timezone. parseDate() builds local-midnight
// Dates then serializes via toISOString() (UTC), so imported dates DEPEND on
// the machine timezone. All expected numbers in this campaign assume IST.
async function freshImportPage(browser) {
  const ctx = await browser.newContext({ timezoneId: 'Asia/Kolkata' });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.error('PAGEERROR:', e.message));
  await page.goto(URL, { waitUntil: 'load' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'load' });
  await page.evaluate(() => go('import'));
  return page;
}

async function importFile(page, bankLabel, filePath) {
  if (bankLabel) {
    await page.click(`.bank-tab:has-text("${bankLabel}")`);
  }
  await page.setInputFiles('#csvFile', filePath);
  await page.waitForSelector('#parse-result', { state: 'visible' });
  // parse happens in FileReader.onload; wait until badge is non-empty
  await page.waitForFunction(() =>
    document.getElementById('parse-status-badge').textContent.trim().length > 0);
  return {
    badge: (await page.textContent('#parse-status-badge')).trim(),
    summary: (await page.textContent('#parse-summary')).trim(),
    previewRowCount: await page.evaluate(() =>
      document.querySelectorAll('#parse-preview-table .parse-row').length),
  };
}

async function confirmAndDump(page) {
  await page.click('#importConfirmBtn');
  await page.waitForFunction(() =>
    document.getElementById('importConfirmBtn').textContent.includes('Done'));
  const badgeAfter = (await page.textContent('#parse-status-badge')).trim();
  const store = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('family_finance_v1')));
  return { badgeAfter, store };
}

(async () => {
  const browser = await chromium.launch();
  const out = { date: new Date().toISOString().slice(0, 10), url: URL };

  // ── Probe 1: golden file test_icici.csv ────────────────────────────────
  {
    const page = await freshImportPage(browser);
    const pre = await importFile(page, null /* ICICI Salary is default */,
      path.join(REPO, 'test_icici.csv'));
    const { badgeAfter, store } = await confirmAndDump(page);
    out.golden = {
      preview: pre,
      badgeAfterImport: badgeAfter,
      transactions: store.transactions.map(t => ({
        date: t.date, desc: t.desc, amount: t.amount,
        type: t.type, cat: t.cat, member: t.member,
        accountResolved: (store.accounts.find(a => a.id === t.account) || {}).name || null,
      })),
      accountsCreated: store.accounts.map(a =>
        ({ name: a.name, member: a.member, type: a.type, balance: a.balance })),
      loansAutoDetected: (store.loans || []).length,
    };
    await page.close();
  }

  // ── Probe 2: malformed rows (bad date + zero amount) ───────────────────
  {
    const tmp = path.join(os.tmpdir(), 'ffos_phase0_malformed.csv');
    fs.writeFileSync(tmp, [
      'S No., Value Date, Transaction Date, Cheque Number, Transaction Remarks, Withdrawal Amount(INR), Deposit Amount(INR), Balance(INR)',
      '1, 01/05/2026, 01/05/2026, , Zomato, 500.00, , 10500.00',
      '2, notadate, notadate, , Broken Date Row, 100.00, , 10400.00',
      '3, 03/05/2026, 03/05/2026, , Zero Amount Row, , , 10400.00',
      '4, 04/05/2026, 04/05/2026, , Uber, 250.00, , 10150.00',
    ].join('\n'));
    const page = await freshImportPage(browser);
    const pre = await importFile(page, null, tmp);
    out.malformed = { preview: pre };
    await page.close();
    fs.unlinkSync(tmp);
  }

  // ── Probe 3: wrong bank format -> 0 rows parsed ────────────────────────
  {
    const tmp = path.join(os.tmpdir(), 'ffos_phase0_wrongbank.csv');
    fs.writeFileSync(tmp, [
      'Date,Description,Amount',
      '01/05/2026,AMAZON PURCHASE,1250.00',
    ].join('\n'));
    const page = await freshImportPage(browser);
    const pre = await importFile(page, null, tmp); // still ICICI Salary selected
    const importBtnVisible = await page.isVisible('#importConfirmBtn');
    out.zeroRows = { preview: pre, importBtnStillVisible: importBtnVisible };
    await page.close();
    fs.unlinkSync(tmp);
  }

  await browser.close();
  console.log(JSON.stringify(out, null, 2));
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
