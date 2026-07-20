#!/usr/bin/env node
// parse-one-row.mjs — run a BANK_CONFIGS parse() on ONE statement line, outside the browser.
//
// Why this exists: BANK_CONFIGS in family-finance.js is a top-level const, not exported.
// To debug "import found 0 transactions" you copy (a) the helpers below and (b) the ONE
// config you are debugging, then feed it the exact failing line from the user's file.
//
// Usage:
//   node parse-one-row.mjs                                  # runs built-in icici-salary demo row
//   node parse-one-row.mjs '02/06/2026, AMAZON, 1,499.00'   # your failing CSV line
//   node parse-one-row.mjs --bank amex '01/06/2026,PAYMENT RECEIVED,-5000.00'
//
// Helpers below are copied VERBATIM from family-finance.js as of 2026-07-19 (HEAD 526c55f).
// If family-finance.js has changed since, re-copy parseDate/cleanAmt/cleanAmtSigned/
// autoCategory/parseCSVLine and the config's parse() before trusting the output.
//
// KNOWN QUIRK (verified 2026-07-19 on an IST machine): parseDate builds a local-midnight
// Date then calls toISOString(), which converts to UTC — so on any timezone ahead of UTC
// (IST = UTC+5:30) every date comes back ONE DAY EARLY: '01/05/2026' -> '2026-04-30'.
// The browser import has the same behavior, so harness and app agree. Do not "fix" it
// here while diagnosing; if you fix it in the app, remember existing stored transactions
// keep their old shifted dates (dedup keys include the date).

// ── helpers (family-finance.js:4897-4999 as of 2026-07-19) ──────────────────
function parseDate(str, fmt) {
  if (!str) return null;
  str = str.trim().replace(/"/g,'');
  try {
    const cleanStr = str.replace(/[-\.]/g, '/');
    if (/[a-zA-Z]/.test(cleanStr)) {
      const dt = new Date(cleanStr);
      if (!isNaN(dt)) return dt.toISOString().split('T')[0];
    }
    const parts = cleanStr.split('/');
    if (parts.length === 3) {
      let [d, m, y] = parts.map(Number);
      if (y < 100) y += 2000;
      if (fmt === 'DD/MM/YYYY' || fmt === 'DD MMM YYYY') {
        const dt = new Date(y, m - 1, d);
        return isNaN(dt) ? null : dt.toISOString().split('T')[0];
      }
      if (fmt === 'MM/DD/YYYY') {
        const dt = new Date(y, d - 1, m);
        return isNaN(dt) ? null : dt.toISOString().split('T')[0];
      }
      if (fmt === 'YYYY-MM-DD') {
        const dt = new Date(cleanStr);
        return isNaN(dt) ? null : dt.toISOString().split('T')[0];
      }
    }
  } catch(e) {}
  try {
    if (fmt==='DD/MM/YYYY') {
      const [d,m,y] = str.split('/');
      if (!d||!m||!y) return null;
      const dt = new Date(y,m-1,d);
      return isNaN(dt)?null:dt.toISOString().split('T')[0];
    }
    if (fmt==='YYYY-MM-DD') {
      const dt = new Date(str);
      return isNaN(dt)?null:dt.toISOString().split('T')[0];
    }
    if (fmt==='DD MMM YYYY') {
      const dt = new Date(str);
      return isNaN(dt)?null:dt.toISOString().split('T')[0];
    }
    if (fmt==='MM/DD/YYYY') {
      const [m,d,y] = str.split('/');
      if (!d||!m||!y) return null;
      const dt = new Date(y,m-1,d);
      return isNaN(dt)?null:dt.toISOString().split('T')[0];
    }
  } catch(ex) {}
  const dt = new Date(str);
  return isNaN(dt)?null:dt.toISOString().split('T')[0];
}
function cleanAmt(s) {
  if (!s) return 0;
  const n = parseFloat(String(s).replace(/[₹,"\s]/g,''));
  return isNaN(n)||n<0?0:n;   // NOTE: clamps negatives to 0 — a "negative debit" bank drops to 0 and the row is skipped
}
function cleanAmtSigned(s) {
  if (!s) return 0;
  const n = parseFloat(String(s).replace(/[₹,"\s]/g,''));
  return isNaN(n)?0:n;
}
function autoCategory(desc, amount) {
  if (!desc) return 'Other';
  const d = desc.toLowerCase();
  const amtNum = Number(amount);
  if (/bajaj electronics/i.test(d)) return 'Shopping';
  if (!isNaN(amtNum) && Math.abs(amtNum - 23790) < 1) return 'EMI';
  if (/swiggy|zomato|dominos|food|restaurant|cafe|biryani|pizza/i.test(d)) return 'Food & Dining';
  if (/uber|ola|rapido|redbus|irctc|flight|airways|airline|train|makemytrip/i.test(d)) return 'Travel';
  if (/amazon|flipkart|myntra|meesho|nykaa|blinkit|zepto|shopping/i.test(d)) return 'Shopping';
  if (/electricity|water|gas|broadband|airtel|jio|bsnl|recharge|utility/i.test(d)) return 'Utilities';
  if (/netflix|prime|hotstar|spotify|youtube|bookmyshow|pvr|inox/i.test(d)) return 'Entertainment';
  if (/pharmacy|hospital|doctor|clinic|medplus|apollo|health|medical/i.test(d)) return 'Healthcare';
  if (/school|college|udemy|coursera|education|tuition|fees/i.test(d)) return 'Education';
  if (/insurance|lic|hdfc life|bajaj|star health/i.test(d)) return 'Insurance';
  if (/mutual fund|sip|zerodha|groww|upstox|nse|bse|dividend/i.test(d)) return 'Investment';
  if (/\b(charan|himaja|parents|nageswara|nagamma|ponamgi)\b/i.test(d)) return 'Family Transfer';
  if (/emi|loan|home loan|car loan|finance|bajaj|muthoot|cholamandalam|chola|hdb|home credit|ach debit|nach debit|ecs debit|auto debit|mandate|auto-debit/i.test(d)) return 'EMI';
  if (/donation|charity|ngo|relief|temple|church|mosque|foundation/i.test(d)) return 'Donation';
  if (/salary|salaries|credit|neft cr|upi cr|rtgs cr/i.test(d)) return 'Salary';
  return 'Other';
}
function parseCSVLine(line) {
  const result = []; let current = ''; let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
    else { current += ch; }
  }
  result.push(current.trim());
  return result;
}

// ── configs (family-finance.js:4825-4895 as of 2026-07-19, parse() bodies verbatim) ──
const BANK_CONFIGS = {
  'icici-salary': {
    skipRows:1,
    parse(row) {
      const o = row[0] === "" ? 1 : 0;
      const desc = row[4+o] || "Transaction";
      const date = parseDate(row[2+o],'DD/MM/YYYY') || parseDate(row[2+o],'YYYY-MM-DD') || parseDate(row[2+o],'MM/DD/YYYY');
      if (!date) return null;
      const debit = cleanAmt(row[5+o]), credit = cleanAmt(row[6+o]);
      if (debit===0 && credit===0) return null;
      return {date, desc:desc.toString().trim(), amount:debit||credit, type:debit>0?'debit':'credit', cat:autoCategory(desc.toString(), debit||credit)};
    }
  },
  'icici-cc': {
    skipRows:1,
    parse(row) {
      // XLS export has merged cells — data lands at cols 0, 4, 8, 12
      const desc = (row[4] || row[1] || '').toString().trim();
      if (!desc) return null;
      const date = parseDate(row[0],'DD/MM/YYYY') || parseDate(row[0],'YYYY-MM-DD') || parseDate(row[0],'DD-MM-YYYY');
      if (!date) return null;
      const amtStr = (row[8] || row[2] || '').toString().trim();
      if (!amtStr) return null;
      const isCredit = /\bcr\.?\s*$/i.test(amtStr) || /payment|refund|cashback/i.test(desc);
      const rawAmt = parseFloat(amtStr.replace(/[₹,\s]/g, ''));
      if (!rawAmt || rawAmt === 0) return null;
      const amount = Math.abs(rawAmt);
      return {date, desc, amount, type:isCredit?'credit':'debit', cat:autoCategory(desc, amount)};
    }
  },
  'sc': {
    skipRows:1,
    parse(row) {
      if (!row[1]) return null;
      const date = parseDate(row[0],'DD MMM YYYY') || parseDate(row[0],'DD/MM/YYYY') || parseDate(row[0],'YYYY-MM-DD');
      if (!date) return null;
      const credit = cleanAmt(row[3]), debit = cleanAmt(row[4]);
      if (debit===0&&credit===0) return null;
      return {date, desc:row[1].trim(), amount:debit||credit, type:debit>0?'debit':'credit', cat:autoCategory(row[1], debit||credit)};
    }
  },
  'amex': {
    skipRows:1,
    parse(row) {
      const desc = (row[1] || row[4] || '').toString().trim();
      if (!desc) return null;
      const date = parseDate(row[0],'DD/MM/YYYY') || parseDate(row[0],'YYYY-MM-DD') || parseDate(row[0],'MM/DD/YYYY');
      if (!date) return null;
      const rawAmt = cleanAmtSigned(row[2]);
      if (rawAmt === 0) return null;
      // Amex: positive = spend (debit), negative = payment/refund (credit)
      const isCredit = rawAmt < 0 || /payment|refund|cashback|cr/i.test(desc);
      return {date, desc, amount:Math.abs(rawAmt), type:isCredit?'credit':'debit', cat:autoCategory(desc, Math.abs(rawAmt))};
    }
  }
};

// ── driver ───────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
let bank = 'icici-salary';
const bi = args.indexOf('--bank');
if (bi !== -1) { bank = args[bi+1]; args.splice(bi, 2); }
const line = args[0] || '1, 01/05/2026, 01/05/2026, , Zomato, 500.00, , 10500.00';
const cfg = BANK_CONFIGS[bank];
if (!cfg) { console.error('Unknown bank. One of: ' + Object.keys(BANK_CONFIGS).join(', ')); process.exit(1); }
const row = parseCSVLine(line);
console.log('bank      :', bank);
console.log('row cells :', JSON.stringify(row));
row.forEach((c, i) => console.log('   [' + i + '] = ' + JSON.stringify(c)));
const out = cfg.parse(row);
console.log('parse() ->', JSON.stringify(out, null, 2));
if (out === null) {
  console.log('\nnull means the row was SILENTLY SKIPPED. Walk the parse() body above:');
  console.log('  - date null?   parseDate failed on the date cell (check which column index it reads)');
  console.log('  - amounts 0?   cleanAmt clamps negatives and non-numerics to 0; both 0 -> skip');
  console.log('  - desc empty?  icici-cc/amex bail out when the description cell is blank');
}
