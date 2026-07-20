#!/usr/bin/env node
// Balance-continuity reconciliation for ICICI-style CSVs with a running Balance column.
// Proves a parsed statement is COMPLETE and CORRECTLY SIGNED:
//   balance[i] === balance[i-1] - debit[i] + credit[i]   (within 0.005 float tolerance)
//
// Usage:  node check_balance_continuity.js <path-to-icici-csv>
// Exit 0 = every consecutive pair reconciles. Exit 1 = continuity break (missing row,
// wrong sign, or mis-mapped column). Exit 2 = could not read/parse the file.
//
// Column layout (matches BANK_CONFIGS['icici-salary'] in family-finance.js):
//   S No., Value Date, Transaction Date, Cheque Number, Transaction Remarks,
//   Withdrawal Amount(INR), Deposit Amount(INR), Balance(INR)
// Like the app's parser, tolerates one leading empty column (offset o).

const fs = require('fs');

function parseCSVLine(line) { // same algorithm as family-finance.js parseCSVLine
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

const num = s => {
  if (s === undefined || s === null || String(s).trim() === '') return 0;
  const n = parseFloat(String(s).replace(/[₹,"\s]/g, ''));
  return isNaN(n) ? 0 : n;
};

const file = process.argv[2];
if (!file) { console.error('Usage: node check_balance_continuity.js <icici-csv>'); process.exit(2); }
let text;
try { text = fs.readFileSync(file, 'utf8'); } catch (e) { console.error('Cannot read ' + file + ': ' + e.message); process.exit(2); }

const lines = text.split('\n').filter(l => l.trim());
if (lines.length < 2) { console.error('File has no data rows'); process.exit(2); }

const rows = [];
for (let i = 1; i < lines.length; i++) { // skip 1 header row (BANK_CONFIGS skipRows: 1)
  const row = parseCSVLine(lines[i]);
  const o = row[0] === '' ? 1 : 0;              // same offset trick as the app's parser
  const debit = num(row[5 + o]), credit = num(row[6 + o]), balance = num(row[7 + o]);
  if (debit === 0 && credit === 0 && balance === 0) continue; // blank/junk line
  rows.push({ line: i + 1, desc: row[4 + o] || '?', debit, credit, balance });
}
if (!rows.length) { console.error('No parseable data rows'); process.exit(2); }

console.log('Rows parsed: ' + rows.length);
const opening = rows[0].balance + rows[0].debit - rows[0].credit;
console.log('Implied opening balance (before row 1): ' + opening.toFixed(2));

let breaks = 0, checks = 0;
for (let i = 1; i < rows.length; i++) {
  const prev = rows[i - 1], cur = rows[i];
  const expect = prev.balance - cur.debit + cur.credit;
  const ok = Math.abs(expect - cur.balance) < 0.005;
  checks++;
  console.log(
    `  line ${cur.line} "${cur.desc}": ${prev.balance.toFixed(2)} - ${cur.debit.toFixed(2)} + ${cur.credit.toFixed(2)}` +
    ` = ${expect.toFixed(2)} vs stated ${cur.balance.toFixed(2)} ${ok ? 'OK' : '*** BREAK ***'}`
  );
  if (!ok) breaks++;
}

if (breaks) {
  console.error(`\nCONTINUITY BROKEN: ${breaks}/${checks} pair(s) failed.`);
  console.error('Meaning: a transaction is missing, a debit/credit is swapped, or a column is mis-mapped.');
  process.exit(1);
}
console.log(`\nCONTINUITY OK: ${checks}/${checks} consecutive pairs reconcile (${rows.length} data rows).`);
