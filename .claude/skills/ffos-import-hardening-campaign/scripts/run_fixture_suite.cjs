#!/usr/bin/env node
/**
 * PHASE 1 REGRESSION SUITE RUNNER — ffos-import-hardening-campaign
 *
 * For every fixture in ../references/fixtures/<bank>/<case>.csv, drives the
 * REAL import UI (Playwright chromium, timezone pinned to Asia/Kolkata) from
 * a clean localStorage, imports the file, and diffs the resulting
 * localStorage state byte-exactly against <case>.expected.json.
 *
 * Output: a table  bank | fixture | rows in | imported | expected | result
 * Exit code: 0 iff every fixture PASSes (and selfcheck detects mutation).
 *
 * Usage (server must already be running):
 *   python3 -m http.server 7901 --directory <repo-root>   # separate shell
 *   node .claude/skills/ffos-import-hardening-campaign/scripts/run_fixture_suite.cjs [flags]
 *
 * Flags:
 *   --record     write/overwrite .expected.json from ACTUAL behavior.
 *                ONLY use when intentionally promoting new behavior; the
 *                resulting diff must be reviewed line-by-line and go through
 *                ffos-change-control before commit.
 *   --selfcheck  also run the intentional-mutation test: import a doctored
 *                copy of icici-salary/basic.csv (one amount changed) against
 *                the unchanged expected file and REQUIRE a FAIL. Proves the
 *                differ is not vacuously green.
 *
 * Env: PORT (default 7901)
 *
 * Expected-JSON schema:
 *   transactions banks: { "kind": "transactions",
 *     "summary": {"rowsIn": N, "valid": N, "skipped": N},
 *     "transactions": [ {date, desc, amount, type, cat}, ... ] }  // store order
 *   nps: { "kind": "nps", "nps": {"pran": "...", "tier1": N, "tier2": N} }
 */
const path = require('path');
const fs = require('fs');
const os = require('os');

const REPO = path.resolve(__dirname, '..', '..', '..', '..');
const FIXROOT = path.resolve(__dirname, '..', 'references', 'fixtures');
const PORT = process.env.PORT || 7901;
const URL = `http://localhost:${PORT}/index.html`;
const RECORD = process.argv.includes('--record');
const SELFCHECK = process.argv.includes('--selfcheck');

const BANK_LABELS = {
  'icici-salary': 'ICICI Salary',
  'icici-cc': 'ICICI Credit Card',
  'sc': 'Standard Chartered',
  'amex': 'American Express',
  'nps': 'NPS Statement',
};

const { chromium } = require(path.join(REPO, 'node_modules', 'playwright'));

async function runFixture(browser, bank, csvPath) {
  const ctx = await browser.newContext({ timezoneId: 'Asia/Kolkata' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL, { waitUntil: 'load' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'load' });
  await page.evaluate(() => go('import'));
  await page.click(`.bank-tab:has-text("${BANK_LABELS[bank]}")`);
  await page.setInputFiles('#csvFile', csvPath);
  await page.waitForSelector('#parse-result', { state: 'visible' });
  await page.waitForFunction(() =>
    document.getElementById('parse-status-badge').textContent.trim().length > 0);

  const summaryText = (await page.textContent('#parse-summary')).trim();
  const m = summaryText.match(/(\d+) rows read · (\d+) valid · (-?\d+) skipped/);
  const summary = m
    ? { rowsIn: +m[1], valid: +m[2], skipped: +m[3] }
    : { rowsIn: null, valid: null, skipped: null };

  let actual;
  if (bank === 'nps') {
    await page.click('#importConfirmBtn');
    await page.waitForFunction(() =>
      document.getElementById('importConfirmBtn').textContent.includes('Done'));
    const nps = await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('family_finance_v1'));
      const n = (s.nps && s.nps.madhu) || {};
      return { pran: n.pran || '', tier1: n.tier1 || 0, tier2: n.tier2 || 0 };
    });
    actual = { kind: 'nps', nps };
  } else {
    let transactions = [];
    if (summary.valid > 0) {
      await page.click('#importConfirmBtn');
      await page.waitForFunction(() =>
        document.getElementById('importConfirmBtn').textContent.includes('Done'));
      transactions = await page.evaluate(() => {
        const s = JSON.parse(localStorage.getItem('family_finance_v1'));
        return s.transactions.map(t => ({
          date: t.date, desc: t.desc, amount: t.amount, type: t.type, cat: t.cat,
        }));
      });
    }
    actual = { kind: 'transactions', summary, transactions };
  }
  await ctx.close();
  return { actual, errors, summaryText };
}

function diffJson(expected, actual) {
  const e = JSON.stringify(expected, null, 2), a = JSON.stringify(actual, null, 2);
  if (e === a) return null;
  const el = e.split('\n'), al = a.split('\n');
  for (let i = 0; i < Math.max(el.length, al.length); i++) {
    if (el[i] !== al[i]) {
      return `first divergence at line ${i + 1}:\n  expected: ${el[i]}\n  actual:   ${al[i]}`;
    }
  }
  return 'differs (length)';
}

(async () => {
  const browser = await chromium.launch();
  const rows = [];
  let failures = 0;

  const banks = fs.readdirSync(FIXROOT).filter(d =>
    fs.statSync(path.join(FIXROOT, d)).isDirectory());
  for (const bank of banks) {
    if (!BANK_LABELS[bank]) { console.error(`SKIP unknown bank dir: ${bank}`); continue; }
    const dir = path.join(FIXROOT, bank);
    for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.csv')).sort()) {
      const csvPath = path.join(dir, f);
      const expPath = csvPath.replace(/\.csv$/, '.expected.json');
      const { actual, errors } = await runFixture(browser, bank, csvPath);
      if (RECORD) {
        fs.writeFileSync(expPath, JSON.stringify(actual, null, 2) + '\n');
        rows.push([bank, f, sumRowsIn(actual), sumImported(actual), '(recorded)', 'RECORDED']);
        continue;
      }
      if (!fs.existsSync(expPath)) {
        rows.push([bank, f, sumRowsIn(actual), sumImported(actual), 'MISSING', 'NO-EXPECTED']);
        failures++;
        continue;
      }
      const expected = JSON.parse(fs.readFileSync(expPath, 'utf8'));
      const diff = diffJson(expected, actual);
      const pageErr = errors.length ? ` [pageerror: ${errors[0]}]` : '';
      if (diff || errors.length) {
        failures++;
        rows.push([bank, f, sumRowsIn(actual), sumImported(actual), sumImported(expected), 'FAIL' + pageErr]);
        console.error(`\nFAIL ${bank}/${f}: ${diff || ''}${pageErr}`);
      } else {
        rows.push([bank, f, sumRowsIn(actual), sumImported(actual), sumImported(expected), 'PASS']);
      }
    }
  }

  // Intentional-mutation selfcheck: differ must catch a broken parse.
  if (SELFCHECK && !RECORD) {
    const src = path.join(FIXROOT, 'icici-salary', 'basic.csv');
    const exp = JSON.parse(fs.readFileSync(
      path.join(FIXROOT, 'icici-salary', 'basic.expected.json'), 'utf8'));
    const tmp = path.join(os.tmpdir(), 'ffos_selfcheck_mutated.csv');
    fs.writeFileSync(tmp, fs.readFileSync(src, 'utf8').replace('500.00', '501.00'));
    const { actual } = await runFixture(browser, 'icici-salary', tmp);
    fs.unlinkSync(tmp);
    const caught = diffJson(exp, actual) !== null;
    rows.push(['(selfcheck)', 'mutated basic.csv', sumRowsIn(actual), sumImported(actual),
      'must FAIL', caught ? 'PASS (mutation caught)' : 'FAIL (mutation NOT caught)']);
    if (!caught) failures++;
  }

  await browser.close();

  const header = ['bank', 'fixture', 'rows in', 'imported', 'expected', 'result'];
  const widths = header.map((h, i) =>
    Math.max(h.length, ...rows.map(r => String(r[i]).length)));
  const fmt = r => r.map((c, i) => String(c).padEnd(widths[i])).join(' | ');
  console.log('\n' + fmt(header));
  console.log(widths.map(w => '-'.repeat(w)).join('-|-'));
  rows.forEach(r => console.log(fmt(r)));
  console.log(`\n${failures === 0 ? 'SUITE GREEN' : `SUITE RED — ${failures} failure(s)`}`);
  process.exit(failures === 0 ? 0 : 1);

  function sumImported(o) {
    return o.kind === 'nps' ? 'nps-balances' : o.transactions.length;
  }
  function sumRowsIn(o) {
    return o.kind === 'nps' ? '-' : (o.summary.rowsIn ?? '-');
  }
})().catch(e => { console.error('FATAL:', e); process.exit(2); });
