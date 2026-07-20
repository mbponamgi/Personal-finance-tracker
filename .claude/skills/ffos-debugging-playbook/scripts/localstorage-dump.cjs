#!/usr/bin/env node
// localstorage-dump.cjs — dump + summarize the app's localStorage state ('family_finance_v1')
// from a real Chromium via Playwright. Use during verify-script debugging sessions.
//
// Usage (app must already be served over http — file:// cannot boot the app):
//   python3 -m http.server 7899 --directory /Users/mponamgi/Documents/Personal-finance-tracker &
//   node localstorage-dump.cjs http://localhost:7899/index.html [--profile /path/to/profile-dir] [--raw]
//
// THE TRAP THIS SCRIPT EXISTS TO TEACH (verified 2026-07-19):
//   localStorage is per-ORIGIN and per-BROWSER-PROFILE.
//   - A fresh Playwright launch has an EMPTY profile: this prints "EMPTY" even though the
//     family's real browser is full of data. You cannot read the family's real data here.
//   - Same app on a different port (7894 vs 7895) is a DIFFERENT origin: also empty.
//   Pass --profile <dir> (launchPersistentContext) so state persists across YOUR OWN
//   debugging runs; seed it once, then re-run this dump between experiments.
const { chromium } = require('/Users/mponamgi/Documents/Personal-finance-tracker/node_modules/playwright');

(async () => {
  const args = process.argv.slice(2);
  const url = args.find(a => a.startsWith('http')) || 'http://localhost:7899/index.html';
  const raw = args.includes('--raw');
  const pi = args.indexOf('--profile');
  const profile = pi !== -1 ? args[pi + 1] : null;

  const context = profile
    ? await chromium.launchPersistentContext(profile)
    : await (await chromium.launch()).newContext();
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'load' });

  const dump = await page.evaluate(() => {
    const s = localStorage.getItem('family_finance_v1');
    if (!s) return { empty: true, origin: location.origin, allKeys: Object.keys(localStorage) };
    const d = JSON.parse(s);
    const colls = ['accounts','cards','rewards','investments','insurance','properties','loans','gold','transactions','nwHistory','dismissedAutoLoans'];
    const summary = {};
    for (const k of colls) summary[k] = Array.isArray(d[k]) ? d[k].length : 'n/a';
    const noMember = {};
    for (const k of ['accounts','cards','investments','insurance','properties','loans','gold','transactions'])
      noMember[k] = (Array.isArray(d[k]) ? d[k] : []).filter(x => !x.member).length;
    const byMember = {};
    (d.transactions || []).forEach(t => { byMember[t.member || '(none)'] = (byMember[t.member || '(none)'] || 0) + 1; });
    return { empty: false, origin: location.origin, bytes: s.length, counts: summary,
             itemsMissingMemberField: noMember, txnsByMember: byMember,
             npsMembers: Object.keys(d.nps || {}), taxMembers: Object.keys(d.tax || {}),
             raw: s };
  });

  console.log('origin        :', dump.origin);
  if (dump.empty) {
    console.log('family_finance_v1: EMPTY on this origin+profile.');
    console.log('localStorage keys present:', JSON.stringify(dump.allKeys));
    console.log('Remember: fresh Playwright profile and/or a new port both start empty.');
  } else {
    console.log('size (bytes)  :', dump.bytes);
    console.log('counts        :', JSON.stringify(dump.counts));
    console.log('missing member:', JSON.stringify(dump.itemsMissingMemberField), ' <- nonzero = blank individual views');
    console.log('txns by member:', JSON.stringify(dump.txnsByMember));
    console.log('nps members   :', JSON.stringify(dump.npsMembers), ' tax members:', JSON.stringify(dump.taxMembers));
    if (raw) console.log(dump.raw);
  }
  await context.close();
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
