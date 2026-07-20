#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// smoke.cjs — Family Finance OS boot smoke test.
//
// PRECONDITION — serve the repo over http (file:// fails: ESM pdf.js + CSP):
//   python3 -m http.server 7899 --directory <repo-root>
//
// Usage:
//   node smoke.cjs [port]          # or FFOS_PORT=7899 node smoke.cjs
//
// Asserts the app boots clean in headless Chromium: sidebar/logo rendered,
// default view active, pdf.js ESM shim loaded, store object D initialised,
// zero console errors / page errors / failed requests.
// Never touches a real browser profile: Playwright launches a throwaway one.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';
const { chromium } = require('playwright');

const PORT = process.env.FFOS_PORT || process.argv[2] || 7899;
const URL = `http://localhost:${PORT}/index.html`;

const results = [];
function check(name, ok, expected, actual) {
  results.push({ name, ok, expected, actual });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}` + (ok ? '' : `\n      expected: ${expected}\n      actual:   ${actual}`));
}

(async () => {
  const browser = await chromium.launch();
  // Pin timezone: parseDate() in family-finance.js converts local-midnight
  // Dates via toISOString(), so rendered/stored dates are timezone-dependent.
  const context = await browser.newContext({ timezoneId: 'Asia/Kolkata' });
  const page = await context.newPage();

  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => pageErrors.push(String(err)));
  page.on('requestfailed', req => failedRequests.push(`${req.url()} :: ${req.failure() && req.failure().errorText}`));

  try {
    await page.goto(URL, { waitUntil: 'load', timeout: 15000 });
  } catch (e) {
    console.log(`FAIL  page load — is the server running? Start it with:\n      python3 -m http.server ${PORT} --directory <repo-root>\n      ${e.message}`);
    await browser.close();
    process.exit(1);
  }

  // Sidebar rendered
  const logo = await page.textContent('.logo-name').catch(() => null);
  check('sidebar logo rendered', logo === 'Family Finance OS', 'Family Finance OS', JSON.stringify(logo));

  // Default view is the dashboard
  const activeView = await page.getAttribute('.view.active', 'id').catch(() => null);
  check('default active view is overview', activeView === 'view-overview', 'view-overview', activeView);

  // INIT reached its last lines: selectBank() ran, so the import hint is populated
  const hint = await page.textContent('#import-hint').catch(() => null);
  check('INIT completed (selectBank ran)', !!hint && hint.includes('ICICI'), 'hint mentioning ICICI', JSON.stringify(hint));

  // Store object D exists in page global scope (top-level `let`, reachable via evaluate)
  const dShape = await page.evaluate(() => {
    try { return { ok: typeof D === 'object', keys: Object.keys(D).length, txns: D.transactions.length }; }
    catch (e) { return { ok: false, err: String(e) }; }
  });
  check('store D initialised', dShape.ok === true, 'typeof D === object', JSON.stringify(dShape));

  // pdf.js ESM module executed (proves type=module + CSP allow it)
  const pdfjs = await page.evaluate(() => typeof window.pdfjsLib);
  check('window.pdfjsLib loaded (ESM ok)', pdfjs === 'object', 'object', pdfjs);

  // Vendored classic scripts loaded
  const vendors = await page.evaluate(() => ({ xlsx: typeof XLSX, chart: typeof Chart }));
  check('vendor XLSX + Chart loaded', vendors.xlsx === 'object' && vendors.chart === 'function', 'XLSX object, Chart function', JSON.stringify(vendors));

  // Give late async errors a moment to surface
  await page.waitForTimeout(500);
  check('no console errors', consoleErrors.length === 0, '[]', JSON.stringify(consoleErrors));
  check('no page errors (uncaught exceptions)', pageErrors.length === 0, '[]', JSON.stringify(pageErrors));
  check('no failed requests', failedRequests.length === 0, '[]', JSON.stringify(failedRequests));

  await browser.close();

  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'}: ${results.length - failed}/${results.length} checks passed (${URL})`);
  process.exit(failed === 0 ? 0 : 1);
})().catch(e => { console.error('FAIL  script crashed:', e); process.exit(1); });
