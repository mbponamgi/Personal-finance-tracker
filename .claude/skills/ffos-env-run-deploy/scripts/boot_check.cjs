// Family Finance OS — headless boot check.
// Verifies the app boots clean at a URL: all three vendored libs present with
// expected versions, fonts loaded, zero console errors, zero external requests.
//
// Usage (run from repo root so require('playwright') resolves from ./node_modules):
//   node .claude/skills/ffos-env-run-deploy/scripts/boot_check.cjs http://localhost:7894/
//
// Exit code 0 = clean boot; 1 = console errors or external requests seen.
// Works against a deployed URL too (post-deploy check).
//
// NOTE: Playwright launches a FRESH browser profile — its localStorage is empty,
// so "storageKeyPresent": false is normal and does NOT mean the user's data is gone.
const { chromium } = require('playwright');

(async () => {
  const url = process.argv[2] || 'http://localhost:7894/';
  const browser = await chromium.launch();
  const page = await browser.newPage();

  const errors = [];
  const external = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('request', r => {
    const u = r.url();
    const sameOrigin = url.startsWith('file:') ? 'file:' : new URL(url).origin;
    if (!u.startsWith(sameOrigin) && !u.startsWith('data:') && !u.startsWith('blob:')) {
      external.push(u);
    }
  });

  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  const libs = await page.evaluate(() => ({
    pdfjsLib: !!window.pdfjsLib,
    pdfjsVersion: window.pdfjsLib ? window.pdfjsLib.version : null,   // expect "4.10.38"
    XLSX: !!window.XLSX,
    xlsxVersion: window.XLSX ? window.XLSX.version : null,            // expect "0.20.3"
    Chart: !!window.Chart,
    chartVersion: window.Chart ? window.Chart.version : null,         // expect "4.4.1"
    storageKeyPresent: localStorage.getItem('family_finance_v1') !== null,
    title: document.title,                                            // expect "Family Finance OS"
  }));
  const fonts = await page.evaluate(async () => {
    await document.fonts.ready;
    return [...new Set([...document.fonts].filter(f => f.status === 'loaded').map(f => f.family))];
  }); // expect DM Mono, DM Sans, Lora

  console.log(JSON.stringify({ url, libs, fonts, consoleErrors: errors, externalRequests: external }, null, 2));
  await browser.close();
  process.exit(errors.length || external.length ? 1 : 0);
})();
