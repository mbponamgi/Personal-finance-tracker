// ─────────────────────────────────────────────
// FAMILY FINANCE OS — DATA STORE
// ─────────────────────────────────────────────
const KEY = 'family_finance_v1';

const MEMBERS = ['madhu','sailaja','parents','charan','himaja','joint'];
const MEMBER_NAMES = {madhu:'Madhu',sailaja:'Sailaja',parents:'Parents',charan:'Charan',himaja:'Himaja',joint:'Joint'};
const MEMBER_COLORS = {madhu:'#b5813a',sailaja:'#4a7c6f',parents:'#7b5ea7',charan:'#3a7d54',himaja:'#c0692b',joint:'#4a6fa5'};

let currentMember = 'all';

let nwChartInstance = null;
let assetChartInstance = null;
let budgetChartInstance = null;
let taxChartInstance = null;
let invChartInstance = null;
const calendarDate = new Date();
let selectedCalDay = new Date().getDate();

let D = {
  accounts: [],
  cards: [],
  rewards: [],
  investments: [],
  insurance: [],
  properties: [],
  loans: [],
  gold: [],
  goldRate: 7500,
  fxRates: {},
  epf:  {},
  gratuity: {employer:'', joiningDate:'', basicDA:0, actualAccrued:0},
  nps:  {},
  tax:  {},
  transactions: [],
  budgets: {
    'Food & Dining':0, 'Travel':0, 'Shopping':0, 'Utilities':0,
    'Entertainment':0, 'Healthcare':0, 'Education':0, 'Insurance':0,
    'Investment':0, 'EMI':0, 'Other':0
  },
  nwHistory: []
};

function load() {
  try {
    const s = localStorage.getItem(KEY);
    if (s) {
      const parsed = JSON.parse(s);
      D = deepMerge(D, parsed);
      if (D.nps && D.nps.tier1 !== undefined) {
        D.nps = { 'madhu': Object.assign({}, D.nps) };
      }
      // Migrate flat D.tax to per-member structure
      if (D.tax && 'gross' in D.tax) {
        D.tax = { madhu: Object.assign({}, D.tax) };
      }
      // Migrate flat D.epf to per-member structure
      if (D.epf && 'balance' in D.epf) {
        D.epf = { madhu: Object.assign({}, D.epf) };
      }
      // Migrate all data arrays: stamp member='madhu' on any item missing the field
      ['accounts','cards','loans','investments','properties','gold','insurance','rewards','transactions'].forEach(key => {
        if (Array.isArray(D[key])) {
          D[key].forEach(item => { if (!item.member) item.member = 'madhu'; });
        }
      });
    }
  } catch(e) {}
}

function deepMerge(target, source) {
  const out = Object.assign({}, target);
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      out[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      out[key] = source[key];
    }
  }
  return out;
}

function save() {
  localStorage.setItem(KEY, JSON.stringify(D));
  const t = new Date();
  document.getElementById('lastUpdated').textContent =
    'Saved ' + t.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
let numbersHidden = localStorage.getItem('numbers_hidden') !== 'false';

function toggleHideNumbers() {
  numbersHidden = !numbersHidden;
  localStorage.setItem('numbers_hidden', numbersHidden ? 'true' : 'false');
  updateHideNumbersButton();
  renderAll();
}

function updateHideNumbersButton() {
  const btn = document.getElementById('toggleHideNumbersBtn');
  if (btn) {
    btn.innerHTML = numbersHidden ? '👁 Show Balances' : '🙈 Hide Balances';
  }
}

const fmt = n => numbersHidden ? '₹ ••••' : '₹' + Math.abs(n||0).toLocaleString('en-IN',{maximumFractionDigits:0});
const cr = n => numbersHidden ? '₹ •• Cr' : '₹' + (Math.abs(n||0)/1e7).toFixed(2) + ' Cr';
const lk = n => numbersHidden ? '₹ •• L' : '₹' + (Math.abs(n||0)/1e5).toFixed(1) + ' L';
const todayStr = () => new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});
const pf = (v, max) => Math.min(Math.round((v/max)*100), 100);
// Security: escape user-supplied strings before inserting into innerHTML
const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
// Security: strip HTML tags from auto-detected strings (e.g. loan names from CSV)
const stripTags = s => String(s||'').replace(/<[^>]*>/g, '');
// Debug flag — set to true only during local development, never in production
const _DBG = false;
const _log = (...a) => { if (_DBG) console.log(...a); };

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const diff = new Date(dateStr) - new Date();
  return Math.ceil(diff / (1000*60*60*24));
}

function memberTag(m) {
  const name = MEMBER_NAMES[m] || m;
  return `<span class="member-tag tag-${m}">${name}</span>`;
}

function getTransactionAccountName(t) {
  if (!t.account) return 'Cash / Unassigned';
  const acc = D.accounts.find(a => a.id === t.account || a.id === Number(t.account) || a.name === t.account);
  if (acc) return acc.name;
  const card = D.cards.find(c => c.id === t.account || c.id === Number(t.account) || c.name === t.account);
  if (card) return card.name;
  const importNames = {
    'icici-salary': 'ICICI Salary',
    'icici-cc': 'ICICI Credit Card',
    'sc-savings': 'SC Savings',
    'sc': 'SC Savings',
    'amex': 'Amex Credit Card'
  };
  return importNames[t.account] || t.account;
}

function getTransactionAccountBadge(t) {
  if (!t.account) return '';
  const name = getTransactionAccountName(t);
  if (name === 'Cash / Unassigned') return '';
  const acc = D.accounts.find(a => a.id === t.account || a.id === Number(t.account) || a.name === t.account);
  if (acc) return `<span class="txn-account-tag">🏦 ${esc(acc.name)}</span>`;
  const card = D.cards.find(c => c.id === t.account || c.id === Number(t.account) || c.name === t.account);
  if (card) return `<span class="txn-account-tag">💳 ${esc(card.name)}</span>`;
  const lower = name.toLowerCase();
  const isCard = lower.includes('card') || lower.includes('cc') || lower.includes('amex');
  return `<span class="txn-account-tag">${isCard ? '💳' : '🏦'} ${esc(name)}</span>`;
}

function populateTxnAccountFilter() {
  const sel = document.getElementById('txn-filter-account');
  if (!sel) return;
  const currentVal = sel.value;
  let html = '<option value="">All Accounts / Cards</option>';
  if (D.accounts && D.accounts.length > 0) {
    html += '<optgroup label="Bank Accounts">';
    D.accounts.forEach(a => {
      html += `<option value="${a.id}">${esc(a.name)} (${MEMBER_NAMES[a.member] || a.member})</option>`;
    });
    html += '</optgroup>';
  }
  if (D.cards && D.cards.length > 0) {
    html += '<optgroup label="Credit Cards">';
    D.cards.forEach(c => {
      html += `<option value="${c.id}">${esc(c.name)} (${MEMBER_NAMES[c.member] || c.member})</option>`;
    });
    html += '</optgroup>';
  }
  html += '<option value="unassigned">Cash / Unassigned</option>';
  sel.innerHTML = html;
  sel.value = currentVal;
}

function populateTxnModalAccounts() {
  const sel = document.getElementById('m-txn-account');
  if (!sel) return;
  let html = '<option value="">Cash / Unassigned</option>';
  if (D.accounts && D.accounts.length > 0) {
    html += '<optgroup label="Bank Accounts">';
    D.accounts.forEach(a => {
      html += `<option value="${a.id}">${esc(a.name)} (${MEMBER_NAMES[a.member] || a.member})</option>`;
    });
    html += '</optgroup>';
  }
  if (D.cards && D.cards.length > 0) {
    html += '<optgroup label="Credit Cards">';
    D.cards.forEach(c => {
      html += `<option value="${c.id}">${esc(c.name)} (${MEMBER_NAMES[c.member] || c.member})</option>`;
    });
    html += '</optgroup>';
  }
  sel.innerHTML = html;
}

function filterByMember(arr) {
  if (currentMember === 'all') return arr;
  return arr.filter(item => item.member === currentMember || item.member === 'joint');
}


// ─────────────────────────────────────────────
// NAV
// ─────────────────────────────────────────────
const PAGE_TITLES = {
  overview:'Dashboard', accounts:'Bank Accounts', cards:'Credit Cards',
  rewards:'Reward Points', property:'Property', gold:'Gold & Jewellery',
  investments:'Investments', epf:'EPF', nps:'NPS',
  loans:'Loans & EMI', insurance:'Insurance', budget:'Budget vs Actuals',
  tax:'Tax Tracker', transactions:'Transactions', import:'Import Statement'
};

let currentView = 'overview';

function go(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const view = document.getElementById('view-' + id);
  if (view) view.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => {
    if (n.getAttribute('onclick') && n.getAttribute('onclick').includes("'" + id + "'"))
      n.classList.add('active');
  });
  document.getElementById('pageTitle').textContent = PAGE_TITLES[id] || id;
  updateMemberContext();
  currentView = id;
  renderAll();
}

function setMember(m, el) {
  currentMember = m;
  document.querySelectorAll('.member-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  updateMemberContext();
  renderAll();
}

function updateMemberContext() {
  const ctx = document.getElementById('memberContext');
  if (currentMember === 'all') {
    ctx.textContent = 'Family — All Members';
  } else {
    ctx.textContent = MEMBER_NAMES[currentMember] || currentMember;
  }
}

function ctxAdd() {
  const map = {
    accounts:'accModal', cards:'cardModal', rewards:'rewardModal',
    property:'propModal', gold:'goldModal', investments:'invModal',
    loans:'loanModal', insurance:'insModal', epf:'epfModal',
    nps:'npsModal', tax:'taxModal', transactions:'txnModal', budget:'budgetModal'
  };
  openModal(map[currentView] || 'txnModal');
}

// ─────────────────────────────────────────────
// MODALS
// ─────────────────────────────────────────────
function openModal(id) {
  if (id === 'txnModal') {
    populateTxnModalAccounts();
  }
  document.getElementById(id).classList.add('open');
}
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

function openRewardModal(id) {
  migrateRewards();
  const r = id ? D.rewards.find(x => x.id === id) : null;
  const defaultMember = currentMember === 'all' ? 'madhu' : currentMember;
  document.getElementById('rewardModalTitle').textContent = r ? 'Edit Reward Program' : 'Add Reward Program';
  document.getElementById('m-rw-id').value = r ? r.id : '';
  document.getElementById('m-rw-name').value = r ? r.name : '';
  document.getElementById('m-rw-prog').value = r ? r.program : 'default';
  document.getElementById('m-rw-member').value = r ? (r.member || defaultMember) : defaultMember;
  document.getElementById('m-rw-pts').value = r ? r.points : '';
  document.getElementById('m-rw-rate').value = r ? r.rate : '0.25';
  document.getElementById('m-rw-exp').value = r ? r.expiry : '';
  document.getElementById('m-rw-tier').value = r ? r.tier : '';
  // Populate card name suggestions from D.cards
  const dl = document.getElementById('rw-card-names');
  if (dl) dl.innerHTML = D.cards.map(c => `<option value="${esc(c.name)}">`).join('');
  openModal('rewardModal');
}

function insTypeChanged() {
  const t = document.getElementById('m-ins-type').value;
  document.getElementById('ins-vehicle-wrap').style.display = t === 'auto' ? 'block' : 'none';
  document.getElementById('ins-covered-wrap').style.display = t !== 'auto' ? 'block' : 'none';
}

// City / type-based annual appreciation rates (%) for CAGR estimation
const PROPERTY_GROWTH_RATES = {
  // Tier-1 cities
  hyderabad: 11, 'hi-tech city': 12, gachibowli: 12, kondapur: 11, miyapur: 10,
  bengaluru: 10, bangalore: 10, whitefield: 11, sarjapur: 11, hebbal: 10,
  mumbai: 8, pune: 9, delhi: 7, noida: 7, gurugram: 8, gurgaon: 8,
  navi: 9, thane: 8, chennai: 8, kolkata: 6,
  // Tier-2 cities
  vijayawada: 8, visakhapatnam: 8, vizag: 8, coimbatore: 8, kochi: 9, cochin: 9,
  indore: 8, nagpur: 7, surat: 7, lucknow: 7, jaipur: 7, bhopal: 6,
  // Type-based fallbacks (used when city not matched)
  flat: 8, house: 7, plot: 9, commercial: 7, agri: 4
};

function estimatePropValue() {
  const cost = +document.getElementById('m-prop-cost').value || 0;
  const purchaseDate = document.getElementById('m-prop-date').value;
  const location = (document.getElementById('m-prop-location').value || '').toLowerCase();
  const type = document.getElementById('m-prop-type').value;
  const noteEl = document.getElementById('prop-val-note');

  if (!cost || !purchaseDate) {
    noteEl.textContent = 'Enter purchase price and purchase date first.';
    noteEl.style.color = 'var(--red)';
    return;
  }

  const years = (Date.now() - new Date(purchaseDate)) / (1000 * 60 * 60 * 24 * 365.25);
  if (years <= 0) {
    noteEl.textContent = 'Purchase date must be in the past.';
    noteEl.style.color = 'var(--red)';
    return;
  }

  // Find best matching rate — city keyword match first, then property type fallback
  let rate = PROPERTY_GROWTH_RATES[type] || 7;
  let matchedCity = '';
  for (const [key, r] of Object.entries(PROPERTY_GROWTH_RATES)) {
    if (['flat','house','plot','commercial','agri'].includes(key)) continue;
    if (location.includes(key)) { rate = r; matchedCity = key; break; }
  }

  const estimated = Math.round(cost * Math.pow(1 + rate / 100, years));
  document.getElementById('m-prop-val').value = estimated;
  noteEl.style.color = 'var(--muted)';
  noteEl.textContent = `Estimated at ${rate}% CAGR over ${years.toFixed(1)} yrs${matchedCity ? ' (' + matchedCity + ')' : ' (' + type + ' avg)'}. Verify with a local broker or Magicbricks / 99acres.`;
}

function openAddProp() {
  document.getElementById('propModalTitle').textContent = 'Add Property';
  document.getElementById('m-prop-id').value = '';
  document.getElementById('m-prop-name').value = '';
  document.getElementById('m-prop-type').value = 'flat';
  document.getElementById('m-prop-member').value = 'madhu';
  document.getElementById('m-prop-location').value = '';
  document.getElementById('m-prop-cost').value = '';
  document.getElementById('m-prop-val').value = '';
  document.getElementById('m-prop-date').value = '';
  document.getElementById('m-prop-area').value = '';
  document.getElementById('m-prop-tax').value = '';
  document.getElementById('m-prop-taxdue').value = '';
  document.getElementById('m-prop-notes').value = '';
  const noteEl = document.getElementById('prop-val-note');
  if (noteEl) noteEl.textContent = '';
  populateLoanSelect([]);
  openModal('propModal');
}

function openAddLoan() {
  document.getElementById('loanModalTitle').textContent = 'Add Loan';
  document.getElementById('m-loan-id').value = '';
  openModal('loanModal');
}

function openAddGold() {
  document.getElementById('goldModalTitle').textContent = 'Add Gold / Jewellery';
  document.getElementById('m-gold-id').value = '';
  openModal('goldModal');
}

function openAddIns() {
  document.getElementById('insModalTitle').textContent = 'Add Insurance Policy';
  document.getElementById('m-ins-id').value = '';
  openModal('insModal');
}

function openAddInv() {
  document.getElementById('invModalTitle').textContent = 'Add Investment';
  document.getElementById('m-inv-id').value = '';
  document.getElementById('m-inv-name').value = '';
  document.getElementById('m-inv-type').value = 'Mutual Fund';
  document.getElementById('m-inv-currency').value = 'INR';
  document.getElementById('m-inv-fx-rate').value = '';
  document.getElementById('m-inv-cost').value = '';
  document.getElementById('m-inv-val').value = '';
  document.getElementById('m-inv-purchase-date').value = '';
  toggleEsopFields();
  openModal('invModal');
}

function openEditInv(id) {
  const inv = D.investments.find(x => x.id === id);
  if (!inv) return;
  document.getElementById('invModalTitle').textContent = 'Edit Investment';
  document.getElementById('m-inv-id').value = inv.id;
  document.getElementById('m-inv-name').value = inv.name;
  document.getElementById('m-inv-type').value = inv.type;
  document.getElementById('m-inv-member').value = inv.member;
  document.getElementById('m-inv-currency').value = inv.currency || 'INR';
  document.getElementById('m-inv-fx-rate').value = (inv.exchangeRate && inv.exchangeRate !== 1) ? inv.exchangeRate : '';
  if (isEsopType(inv.type)) {
    document.getElementById('m-inv-grant-date').value = inv.grantDate || '';
    document.getElementById('m-inv-units').value = inv.totalUnits || '';
    document.getElementById('m-inv-grant-price').value = inv.grantPrice || '';
    document.getElementById('m-inv-cur-price').value = inv.currentPrice || '';
    document.getElementById('m-inv-vest-months').value = inv.vestingMonths || 48;
    document.getElementById('m-inv-cliff').value = inv.cliffMonths || 12;
    document.getElementById('m-inv-vest-freq').value = inv.vestingFrequency || 'quarterly';
  } else {
    // Restore the original foreign-currency amounts the user entered, not the converted INR
    document.getElementById('m-inv-cost').value = inv.costFX !== undefined ? inv.costFX : (inv.cost || 0);
    document.getElementById('m-inv-val').value = inv.valueFX !== undefined ? inv.valueFX : (inv.value || 0);
    document.getElementById('m-inv-purchase-date').value = inv.purchaseDate || '';
  }
  toggleEsopFields();
  openModal('invModal');
}

function openEditProp(id) {
  const p = D.properties.find(x => x.id === id);
  if (!p) return;
  document.getElementById('propModalTitle').textContent = 'Edit Property';
  document.getElementById('m-prop-id').value = id;
  document.getElementById('m-prop-name').value = p.name;
  document.getElementById('m-prop-type').value = p.type;
  document.getElementById('m-prop-member').value = p.member;
  document.getElementById('m-prop-location').value = p.location || '';
  document.getElementById('m-prop-cost').value = p.cost || 0;
  document.getElementById('m-prop-val').value = p.value || 0;
  document.getElementById('m-prop-date').value = p.purchaseDate || '';
  document.getElementById('m-prop-area').value = p.area || 0;
  document.getElementById('m-prop-tax').value = p.propTax || 0;
  document.getElementById('m-prop-taxdue').value = p.propTaxDue || '';
  document.getElementById('m-prop-notes').value = p.notes || '';
  const noteEl = document.getElementById('prop-val-note');
  if (noteEl) noteEl.textContent = '';
  // Migrate: old single linkedLoan → linkedLoans array
  const existingLoans = Array.isArray(p.linkedLoans) ? p.linkedLoans
    : (p.linkedLoan ? [+p.linkedLoan] : []);
  populateLoanSelect(existingLoans);
  openModal('propModal');
}

function openEditLoan(id) {
  const l = D.loans.find(x => x.id === id);
  if (!l) return;
  document.getElementById('loanModalTitle').textContent = 'Edit Loan';
  document.getElementById('m-loan-id').value = id;
  document.getElementById('m-loan-name').value = l.name;
  document.getElementById('m-loan-type').value = l.type;
  document.getElementById('m-loan-member').value = l.member;
  document.getElementById('m-loan-lender').value = l.lender || '';
  document.getElementById('m-loan-principal').value = l.principal || 0;
  document.getElementById('m-loan-outstanding').value = l.outstanding || 0;
  document.getElementById('m-loan-emi').value = l.emi || 0;
  document.getElementById('m-loan-rate').value = l.rate || 0;
  document.getElementById('m-loan-emiday').value = l.emiDay || '';
  document.getElementById('m-loan-tenure').value = l.tenure || 0;
  document.getElementById('m-loan-intpaid').value = l.intPaid || 0;
  document.getElementById('m-loan-start').value = l.startDate || '';
  openModal('loanModal');
}

function openEditGold(id) {
  const g = D.gold.find(x => x.id === id);
  if (!g) return;
  document.getElementById('goldModalTitle').textContent = 'Edit Gold Item';
  document.getElementById('m-gold-id').value = id;
  document.getElementById('m-gold-name').value = g.name;
  document.getElementById('m-gold-member').value = g.member;
  document.getElementById('m-gold-form').value = g.form;
  document.getElementById('m-gold-wt').value = g.weight || 0;
  document.getElementById('m-gold-purity').value = g.purity || 22;
  document.getElementById('m-gold-cost').value = g.cost || 0;
  document.getElementById('m-gold-notes').value = g.notes || '';
  openModal('goldModal');
}

function openEditIns(id) {
  const p = D.insurance.find(i => i.id === id);
  if (!p) return;
  document.getElementById('insModalTitle').textContent = 'Edit Policy';
  document.getElementById('m-ins-id').value = id;
  document.getElementById('m-ins-name').value = p.name;
  document.getElementById('m-ins-type').value = p.type;
  document.getElementById('m-ins-insurer').value = p.insurer;
  document.getElementById('m-ins-polno').value = p.polno || '';
  document.getElementById('m-ins-member').value = p.member || 'madhu';
  document.getElementById('m-ins-cover').value = p.cover || 0;
  document.getElementById('m-ins-premium').value = p.premium || 0;
  document.getElementById('m-ins-start').value = p.startYear || '';
  document.getElementById('m-ins-end').value = p.endYear || '';
  document.getElementById('m-ins-due').value = p.dueDate || '';
  document.getElementById('m-ins-freq').value = p.freq || 'annual';
  document.getElementById('m-ins-nominee').value = p.nominee || '';
  document.getElementById('m-ins-nom-rel').value = p.nomineeRel || '';
  document.getElementById('m-ins-covered').value = (p.covered||[]).join(', ');
  document.getElementById('m-ins-vehicle').value = p.vehicle || '';
  document.getElementById('m-ins-notes').value = p.notes || '';
  document.getElementById('m-ins-source').value = p.source || 'manual';
  insTypeChanged();
  openModal('insModal');
}

function populateLoanSelect(selectedIds) {
  const sel = Array.isArray(selectedIds) ? selectedIds.map(Number) : (selectedIds ? [+selectedIds] : []);
  const container = document.getElementById('m-prop-loans-list');
  if (!container) return;
  if (!D.loans.length) {
    container.innerHTML = '<div style="font-size:11px;color:var(--muted);padding:4px 2px">No loans found. Add loans in the Loans section first.</div>';
    return;
  }
  container.innerHTML = D.loans.map(l => {
    const checked = sel.includes(l.id) ? 'checked' : '';
    return `<label style="display:flex;align-items:center;gap:10px;cursor:pointer;padding:7px 8px;border-radius:7px;border:1px solid var(--border);background:var(--surface);transition:border-color .15s">
      <input type="checkbox" value="${l.id}" ${checked} style="width:14px;height:14px;accent-color:var(--accent);flex-shrink:0">
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:500;color:var(--text)">${esc(l.name)}</div>
        <div style="font-size:10px;color:var(--muted)">Outstanding: ${fmt(l.outstanding)} &nbsp;·&nbsp; EMI: ${fmt(l.emi)}/mo</div>
      </div>
    </label>`;
  }).join('');
}

// ─────────────────────────────────────────────
// SAVE HANDLERS
// ─────────────────────────────────────────────
function openEditAcc(id) {
  const a = D.accounts.find(x => x.id === id);
  if (!a) return;
  document.getElementById('accModalTitle').textContent = 'Edit Bank Account';
  document.getElementById('m-acc-id').value = a.id;
  document.getElementById('m-acc-name').value = a.name;
  document.getElementById('m-acc-member').value = a.member;
  document.getElementById('m-acc-type').value = a.type;
  document.getElementById('m-acc-bal').value = a.balance;
  document.getElementById('m-acc-in').value = a.credits || 0;
  document.getElementById('m-acc-out').value = a.debits || 0;
  openModal('accModal');
}

function deleteAcc(id) {
  if (!confirm('Delete this account? Transactions linked to it will remain but lose the account tag.')) return;
  D.accounts = D.accounts.filter(a => a.id !== id);
  snapshotNW(); save(); renderAll();
}

function saveAcc() {
  const id = document.getElementById('m-acc-id').value;
  const acc = {
    id: id ? +id : Date.now(),
    name: document.getElementById('m-acc-name').value,
    member: document.getElementById('m-acc-member').value,
    type: document.getElementById('m-acc-type').value,
    balance: +document.getElementById('m-acc-bal').value || 0,
    credits: +document.getElementById('m-acc-in').value || 0,
    debits: +document.getElementById('m-acc-out').value || 0,
    updated: todayStr()
  };
  if (!acc.name) return;
  upsert(D.accounts, acc);
  snapshotNW(); save(); renderAll(); closeModal('accModal');
  document.getElementById('m-acc-id').value = '';
  document.getElementById('m-acc-name').value = '';
}

function openEditCard(id) {
  const c = D.cards.find(x => x.id === id);
  if (!c) return;
  document.getElementById('cardModalTitle').textContent = 'Edit Credit Card';
  document.getElementById('m-card-id').value = c.id;
  document.getElementById('m-card-name').value = c.name;
  document.getElementById('m-card-member').value = c.member;
  document.getElementById('m-card-out').value = c.outstanding;
  document.getElementById('m-card-lim').value = c.limit;
  document.getElementById('m-card-due').value = c.dueDate || '';
  document.getElementById('m-card-min').value = c.minDue || 0;
  openModal('cardModal');
}

function deleteCard(id) {
  if (!confirm('Delete this card? Transactions linked to it will remain but lose the card tag.')) return;
  D.cards = D.cards.filter(c => c.id !== id);
  save(); renderAll();
}

function saveCard() {
  const id = document.getElementById('m-card-id').value;
  const card = {
    id: id ? +id : Date.now(),
    name: document.getElementById('m-card-name').value,
    member: document.getElementById('m-card-member').value,
    outstanding: +document.getElementById('m-card-out').value || 0,
    limit: +document.getElementById('m-card-lim').value || 0,
    dueDate: document.getElementById('m-card-due').value,
    minDue: +document.getElementById('m-card-min').value || 0
  };
  if (!card.name) return;
  upsert(D.cards, card);
  save(); renderAll(); closeModal('cardModal');
  document.getElementById('m-card-id').value = '';
  document.getElementById('cardModalTitle').textContent = 'Add Credit Card';
}

function saveReward() {
  migrateRewards();
  const id = document.getElementById('m-rw-id').value;
  const name = document.getElementById('m-rw-name').value.trim();
  if (!name) return;
  const prog = document.getElementById('m-rw-prog').value || detectRewardProgram(name);
  const entry = {
    id: id ? +id : Date.now(),
    name,
    program: prog,
    member: document.getElementById('m-rw-member').value || 'madhu',
    points: +document.getElementById('m-rw-pts').value || 0,
    rate: +document.getElementById('m-rw-rate').value || 0.25,
    expiry: document.getElementById('m-rw-exp').value,
    tier: document.getElementById('m-rw-tier').value
  };
  const idx = D.rewards.findIndex(x => x.id === entry.id);
  if (idx >= 0) D.rewards[idx] = entry;
  else D.rewards.push(entry);
  save(); renderAll(); closeModal('rewardModal');
}

function deleteReward(id) {
  if (!confirm('Remove this reward program?')) return;
  D.rewards = D.rewards.filter(r => r.id !== id);
  save(); renderAll();
}

function saveProp() {
  const id = document.getElementById('m-prop-id').value;
  const prop = {
    id: id ? +id : Date.now(),
    name: document.getElementById('m-prop-name').value,
    type: document.getElementById('m-prop-type').value,
    member: document.getElementById('m-prop-member').value,
    location: document.getElementById('m-prop-location').value,
    cost: +document.getElementById('m-prop-cost').value || 0,
    value: +document.getElementById('m-prop-val').value || 0,
    purchaseDate: document.getElementById('m-prop-date').value,
    area: +document.getElementById('m-prop-area').value || 0,
    propTax: +document.getElementById('m-prop-tax').value || 0,
    propTaxDue: document.getElementById('m-prop-taxdue').value,
    linkedLoans: [...document.querySelectorAll('#m-prop-loans-list input[type="checkbox"]:checked')].map(cb => +cb.value),
    notes: document.getElementById('m-prop-notes').value
  };
  if (!prop.name) return;
  upsert(D.properties, prop);
  snapshotNW(); save(); renderAll(); closeModal('propModal');
  document.getElementById('m-prop-id').value = '';
  document.getElementById('propModalTitle').textContent = 'Add Property';
}

function deleteProp(id) {
  D.properties = D.properties.filter(p => p.id !== id);
  snapshotNW(); save(); renderAll();
}

function saveLoan() {
  const id = document.getElementById('m-loan-id').value;
  const loan = {
    id: id ? +id : Date.now(),
    name: document.getElementById('m-loan-name').value,
    type: document.getElementById('m-loan-type').value,
    member: document.getElementById('m-loan-member').value,
    lender: document.getElementById('m-loan-lender').value,
    principal: +document.getElementById('m-loan-principal').value || 0,
    outstanding: +document.getElementById('m-loan-outstanding').value || 0,
    emi: +document.getElementById('m-loan-emi').value || 0,
    rate: +document.getElementById('m-loan-rate').value || 0,
    emiDay: +document.getElementById('m-loan-emiday').value || 1,
    tenure: +document.getElementById('m-loan-tenure').value || 0,
    intPaid: +document.getElementById('m-loan-intpaid').value || 0,
    startDate: document.getElementById('m-loan-start').value
  };
  if (!loan.name) return;
  upsert(D.loans, loan);
  snapshotNW(); save(); renderAll(); closeModal('loanModal');
  document.getElementById('m-loan-id').value = '';
  document.getElementById('loanModalTitle').textContent = 'Add Loan';
}

function deleteLoan(id) {
  D.loans = D.loans.filter(l => l.id !== id);
  snapshotNW(); save(); renderAll();
}

function saveGold() {
  const id = document.getElementById('m-gold-id').value;
  const item = {
    id: id ? +id : Date.now(),
    name: document.getElementById('m-gold-name').value,
    member: document.getElementById('m-gold-member').value,
    form: document.getElementById('m-gold-form').value,
    weight: +document.getElementById('m-gold-wt').value || 0,
    purity: +document.getElementById('m-gold-purity').value || 22,
    cost: +document.getElementById('m-gold-cost').value || 0,
    notes: document.getElementById('m-gold-notes').value
  };
  if (!item.name) return;
  upsert(D.gold, item);
  snapshotNW(); save(); renderAll(); closeModal('goldModal');
  document.getElementById('m-gold-id').value = '';
  document.getElementById('goldModalTitle').textContent = 'Add Gold / Jewellery';
}

function deleteGold(id) {
  D.gold = D.gold.filter(g => g.id !== id);
  save(); renderAll();
}

function saveInv() {
  const idVal = document.getElementById('m-inv-id').value;
  const type = document.getElementById('m-inv-type').value;
  const currency = document.getElementById('m-inv-currency').value || 'INR';
  const fxRate = (currency !== 'INR') ? (+document.getElementById('m-inv-fx-rate').value || 1) : 1;
  const inv = {
    id: idVal ? +idVal : Date.now(),
    name: document.getElementById('m-inv-name').value,
    type,
    member: document.getElementById('m-inv-member').value,
    currency,
    exchangeRate: fxRate,
  };
  if (!inv.name) return;
  if (isEsopType(type)) {
    inv.grantDate = document.getElementById('m-inv-grant-date').value;
    inv.totalUnits = +document.getElementById('m-inv-units').value || 0;
    inv.grantPrice = +document.getElementById('m-inv-grant-price').value || 0;
    inv.currentPrice = +document.getElementById('m-inv-cur-price').value || 0;
    inv.vestingMonths = +document.getElementById('m-inv-vest-months').value || 48;
    inv.cliffMonths = +document.getElementById('m-inv-cliff').value || 12;
    inv.vestingFrequency = document.getElementById('m-inv-vest-freq').value;
    inv.cost = Math.round(inv.grantPrice * inv.totalUnits * fxRate);
    inv.value = Math.round(calcVestedUnits(inv) * inv.currentPrice * fxRate);
  } else {
    const costFX = +document.getElementById('m-inv-cost').value || 0;
    const valueFX = +document.getElementById('m-inv-val').value || 0;
    inv.costFX = costFX;
    inv.valueFX = valueFX;
    inv.cost = Math.round(costFX * fxRate);
    inv.value = Math.round(valueFX * fxRate);
    inv.purchaseDate = document.getElementById('m-inv-purchase-date').value || '';
  }
  if (currency !== 'INR' && fxRate > 1) {
    if (!D.fxRates) D.fxRates = {};
    D.fxRates[currency] = fxRate;
  }
  upsert(D.investments, inv);
  snapshotNW(); save(); renderAll(); closeModal('invModal');
  document.getElementById('m-inv-id').value = '';
  document.getElementById('invModalTitle').textContent = 'Add Investment';
  document.getElementById('m-inv-name').value = '';
  document.getElementById('m-inv-cost').value = '';
  document.getElementById('m-inv-val').value = '';
  toggleEsopFields();
}

function deleteInv(id) {
  D.investments = D.investments.filter(i => i.id !== id);
  snapshotNW(); save(); renderAll();
}

function saveIns() {
  const id = document.getElementById('m-ins-id').value;
  const p = {
    id: id ? +id : Date.now(),
    name: document.getElementById('m-ins-name').value,
    type: document.getElementById('m-ins-type').value,
    insurer: document.getElementById('m-ins-insurer').value,
    polno: document.getElementById('m-ins-polno').value,
    member: document.getElementById('m-ins-member').value,
    cover: +document.getElementById('m-ins-cover').value || 0,
    premium: +document.getElementById('m-ins-premium').value || 0,
    startYear: +document.getElementById('m-ins-start').value || "",
    endYear: +document.getElementById('m-ins-end').value || "",
    dueDate: document.getElementById('m-ins-due').value,
    freq: document.getElementById('m-ins-freq').value,
    nominee: document.getElementById('m-ins-nominee').value,
    nomineeRel: document.getElementById('m-ins-nom-rel').value,
    covered: document.getElementById('m-ins-covered').value.split(',').map(s => s.trim()).filter(Boolean),
    vehicle: document.getElementById('m-ins-vehicle').value,
    notes: document.getElementById('m-ins-notes').value,
    source: document.getElementById('m-ins-source').value || "manual"
  };
  if (!p.name) return;
  upsert(D.insurance, p);
  save(); renderAll(); closeModal('insModal');
  document.getElementById('m-ins-id').value = '';
  document.getElementById('m-ins-source').value = '';
  document.getElementById('insModalTitle').textContent = 'Add Insurance Policy';
}

function deleteIns(id) {
  D.insurance = D.insurance.filter(i => i.id !== id);
  save(); renderAll();
}

// ─────────────────────────────────────────────
// TRANSACTION SCANNER (🔍)
// ─────────────────────────────────────────────
let scannedTxns = [];

function scanTxnsForInsurance() {
  const insurers = ["lic","hdfc life","icici pru","star health","care health","niva bupa","bajaj allianz","tata aia","sbi life","max life","acko","digit","kotak life","religare","max bupa"];
  
  scannedTxns = [];
  D.transactions.forEach(t => {
    if (t.type === 'debit') {
      const desc = t.desc.toLowerCase();
      let matched = insurers.find(ins => desc.includes(ins));
      if (matched) {
        const alreadyExists = D.insurance.some(p => p.insurer.toLowerCase().includes(matched) && p.premium === t.amount);
        if (!alreadyExists) {
          scannedTxns.push({ id: t.id, date: t.date, desc: t.desc, amount: t.amount, insurer: matched.toUpperCase() });
        }
      }
    }
  });
  
  const listEl = document.getElementById('txn-ins-list');
  if (scannedTxns.length === 0) {
    listEl.innerHTML = `<div class="empty-state">No new insurance payments found in transactions.</div>`;
  } else {
    listEl.innerHTML = scannedTxns.map((t, idx) => `
      <div style="border:1px solid var(--border);border-radius:8px;padding:12px;display:flex;align-items:center;gap:12px;background:var(--surface)">
        <input type="checkbox" id="scan-chk-${idx}" checked style="width:18px;height:18px;accent-color:var(--accent)">
        <div style="flex:1">
          <div style="font-weight:600;font-size:14px;color:var(--accent)">${t.insurer}</div>
          <div style="font-size:12px;color:var(--text);margin-bottom:6px">Txn: ${esc(t.desc)}</div>
          <div style="font-size:11px;color:var(--muted)">Date: ${t.date} | Amount: <span style="font-weight:600;color:var(--text)">₹${t.amount.toLocaleString()}</span></div>
          <div style="margin-top:8px;display:flex;gap:8px">
            <input type="text" id="scan-nominee-${idx}" placeholder="Nominee Name" style="padding:4px 8px;font-size:11px;border:1px solid var(--border);border-radius:4px;flex:1;background:var(--surface2);color:var(--text)">
            <input type="text" id="scan-rel-${idx}" placeholder="Relation (e.g. Wife)" style="padding:4px 8px;font-size:11px;border:1px solid var(--border);border-radius:4px;flex:1;background:var(--surface2);color:var(--text)">
          </div>
        </div>
      </div>
    `).join('');
  }
  openModal('txnScanModal');
}

function saveScannedTxns() {
  scannedTxns.forEach((t, idx) => {
    const isChecked = document.getElementById(`scan-chk-${idx}`)?.checked;
    if (isChecked) {
      const nominee = document.getElementById(`scan-nominee-${idx}`).value;
      const rel = document.getElementById(`scan-rel-${idx}`).value;
      const typeStr = t.insurer.toLowerCase().includes('health') || t.insurer.toLowerCase().includes('bupa') ? 'health' : 'life';
      
      D.insurance.push({
        id: Date.now() + idx,
        name: `${t.insurer} Policy`,
        type: typeStr,
        insurer: t.insurer,
        polno: '',
        member: currentMember === 'all' ? 'madhu' : currentMember,
        cover: 0,
        premium: t.amount,
        startYear: new Date(t.date).getFullYear(),
        endYear: "",
        dueDate: "",
        freq: "annual",
        nominee: nominee,
        nomineeRel: rel,
        covered: [],
        vehicle: "",
        notes: "Imported from transactions",
        source: "txn"
      });
    }
  });
  save(); renderAll(); closeModal('txnScanModal');
}

// ─────────────────────────────────────────────
// DOCUMENT AI SCANNER (📄)
// ─────────────────────────────────────────────
let selectedPolicyFile = null;

function loadPdfJS() {
  if (typeof pdfjsLib === 'undefined') {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js';
    script.integrity = 'sha384-uLiAv4VcjM5H2Jsqzl8EajEaxPugj1CIzQaCjQ8c5//vC+elhxO5pZfXGxoLQi1W';
    script.crossOrigin = 'anonymous';
    script.onload = () => {
      window.pdfjsLib = window['pdfjs-dist/build/pdf'] || pdfjsLib;
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
    };
    document.head.appendChild(script);
  }
}

function handlePolicyDrop(e) {
  e.preventDefault();
  document.getElementById('ai-drag-area').style.borderColor = 'var(--border)';
  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
    selectedPolicyFile = e.dataTransfer.files[0];
    document.getElementById('ai-file-name').textContent = "📄 " + selectedPolicyFile.name;
    document.getElementById('ai-file-name').style.display = 'block';
    if (selectedPolicyFile.name.endsWith('.pdf')) loadPdfJS();
  }
}

function handlePolicySelect(e) {
  if (e.target.files && e.target.files[0]) {
    selectedPolicyFile = e.target.files[0];
    document.getElementById('ai-file-name').textContent = "📄 " + selectedPolicyFile.name;
    document.getElementById('ai-file-name').style.display = 'block';
    if (selectedPolicyFile.name.endsWith('.pdf')) loadPdfJS();
  }
}

async function startAIScan() {
  const textInput = document.getElementById('ai-policy-text').value;
  const fileName = selectedPolicyFile ? selectedPolicyFile.name : "";
  if (!textInput && !selectedPolicyFile) {
    alert("Please upload a policy document or paste text first.");
    return;
  }
  
  document.getElementById('ai-drag-area').parentElement.style.display = 'none';
  document.getElementById('ai-policy-text').parentElement.style.display = 'none';
  document.getElementById('ai-scan-btn').style.display = 'none';
  document.getElementById('ai-scan-progress').style.display = 'block';
  
  let extractedText = textInput;
  if (selectedPolicyFile && selectedPolicyFile.type === 'application/pdf') {
    try {
      const pdfjs = await ensurePdfJS();
      const arrayBuffer = await selectedPolicyFile.arrayBuffer();
      
      let loadingTask;
      let pdf;
      let pdfPassword = '';
      
      while (true) {
        try {
          loadingTask = pdfjs.getDocument({ data: new Uint8Array(arrayBuffer), password: pdfPassword });
          pdf = await loadingTask.promise;
          break;
        } catch (err) {
          if (err.name === 'PasswordException') {
            pdfPassword = prompt("This policy document is password-protected. Please enter the password to decrypt:");
            if (pdfPassword === null) {
              throw new Error("Password decryption cancelled by user.");
            }
          } else {
            throw err;
          }
        }
      }
      
      const maxPages = Math.min(pdf.numPages, 3);
      for (let i = 1; i <= maxPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        extractedText += " " + (reconstructTextWithCoordinates(textContent) || textContent.items.map(item => item.str).join(" "));
      }
    } catch(e) {
      alert("Error reading policy PDF: " + e.message);
      document.getElementById('ai-drag-area').parentElement.style.display = 'block';
      document.getElementById('ai-policy-text').parentElement.style.display = 'block';
      document.getElementById('ai-scan-btn').style.display = 'inline-block';
      document.getElementById('ai-scan-progress').style.display = 'none';
      return;
    }
  }
  
  const combined = (fileName + " " + extractedText).toLowerCase();
  
  let insurer = "Other Insurer";
  const insurers = ["star health","hdfc life","hdfc ergo","lic","life insurance corporation","niva bupa","icici lombard","icici pru","care health","tata aia","bajaj allianz"];
  let matchedIns = insurers.find(i => combined.includes(i));
  if (matchedIns) insurer = matchedIns.toUpperCase();
  
  let type = "other";
  if (/health|optima|medical|bupa/i.test(combined)) type = "health";
  else if (/life|term|jeevan|pru/i.test(combined)) type = "life";
  else if (/auto|car|motor/i.test(combined)) type = "auto";
  
  let cover = 0;
  const coverMatch = combined.match(/\b(\d+)\s*(?:lakh|lakhs|cr|crore|crores|l)\b/i) || combined.match(/(?:sum\s+assured|cover)[^\d]*(\d+,?\d+)/i);
  if (coverMatch) cover = parseInt(coverMatch[1].replace(/,/g,'')) * (coverMatch[0].toLowerCase().includes('cr') ? 10000000 : (coverMatch[0].toLowerCase().includes('l') ? 100000 : 1));
  if (cover < 10000) cover = type==='life'?5000000:type==='health'?1000000:0;
  
  let premium = 0;
  const premMatch = combined.match(/(?:premium|installment)[^\d]*(\d+,?\d+)/i);
  if (premMatch) premium = parseInt(premMatch[1].replace(/,/g,''));
  
  let polno = "";
  const polMatch = combined.match(/(?:policy\s*no|pol\s*no)[^\w]*([a-z0-9-]+)/i);
  if (polMatch) polno = polMatch[1].toUpperCase();
  
  let nominee = ""; let nomRel = "";
  const nomMatch = combined.match(/nominee[^\w]+([a-z\s]+)(?:relation|relationship)?[^\w]+([a-z]+)/i);
  if (nomMatch) { nominee = nomMatch[1].trim(); nomRel = nomMatch[2].trim(); }

  setTimeout(() => {
    document.getElementById('ai-res-name').value = insurer + " Policy";
    document.getElementById('ai-res-insurer').value = insurer;
    document.getElementById('ai-res-type').value = type;
    document.getElementById('ai-res-cover').value = cover;
    document.getElementById('ai-res-premium').value = premium;
    document.getElementById('ai-res-polno').value = polno;
    document.getElementById('ai-res-nominee').value = nominee;
    document.getElementById('ai-res-nom-rel').value = nomRel;
    document.getElementById('ai-scan-progress').style.display = 'none';
    document.getElementById('ai-scan-results').style.display = 'block';
    document.getElementById('ai-save-btn').style.display = 'inline-block';
  }, 2000);
}

function saveAIResults() {
  D.insurance.push({
    id: Date.now(),
    name: document.getElementById('ai-res-name').value,
    type: document.getElementById('ai-res-type').value,
    insurer: document.getElementById('ai-res-insurer').value,
    polno: document.getElementById('ai-res-polno').value,
    member: currentMember === 'all' ? 'madhu' : currentMember,
    cover: +document.getElementById('ai-res-cover').value || 0,
    premium: +document.getElementById('ai-res-premium').value || 0,
    dueDate: document.getElementById('ai-res-due').value,
    startYear: "", endYear: "",
    freq: 'annual',
    nominee: document.getElementById('ai-res-nominee').value,
    nomineeRel: document.getElementById('ai-res-nom-rel').value,
    covered: document.getElementById('ai-res-extra').value.split(',').map(s=>s.trim()).filter(Boolean),
    vehicle: "",
    notes: "Imported via AI Document Scan",
    source: "doc"
  });
  save(); renderAll(); closeModal('aiInsModal');
  selectedPolicyFile = null;
  document.getElementById('ai-file-name').style.display = 'none';
  document.getElementById('ai-drag-area').parentElement.style.display = 'block';
  document.getElementById('ai-policy-text').parentElement.style.display = 'block';
  document.getElementById('ai-scan-btn').style.display = 'inline-block';
  document.getElementById('ai-scan-progress').style.display = 'none';
  document.getElementById('ai-scan-results').style.display = 'none';
  document.getElementById('ai-save-btn').style.display = 'none';
  document.getElementById('ai-policy-text').value = '';
}



function openGratuityModal() {
  const g = D.gratuity || {};
  document.getElementById('m-grat-employer').value = g.employer || '';
  document.getElementById('m-grat-date').value = g.joiningDate || '';
  document.getElementById('m-grat-basic').value = g.basicDA || '';
  document.getElementById('m-grat-actual').value = g.actualAccrued || '';
  openModal('gratModal');
}

function saveGratuity() {
  D.gratuity = {
    employer: document.getElementById('m-grat-employer').value,
    joiningDate: document.getElementById('m-grat-date').value,
    basicDA: +document.getElementById('m-grat-basic').value || 0,
    actualAccrued: +document.getElementById('m-grat-actual').value || 0
  };
  snapshotNW(); save(); renderAll(); closeModal('gratModal');
}

function openEPFModal() {
  const m = currentMember === 'all' ? 'madhu' : currentMember;
  const e = D.epf[m] || Object.assign({}, EPF_EMPTY);
  document.getElementById('epfModalTitle').textContent = 'Update EPF — ' + (MEMBER_NAMES[m] || m);
  document.getElementById('m-epf-uan').value = e.uan || '';
  document.getElementById('m-epf-bal').value = e.balance || '';
  document.getElementById('m-epf-emp').value = e.empShare || '';
  document.getElementById('m-epf-er').value = e.erShare || '';
  document.getElementById('m-epf-monthly').value = e.monthly || '';
  document.getElementById('m-epf-birthyear').value = e.birthYear || '';
  document.getElementById('m-epf-retire-age').value = e.retireAge || 60;
  openModal('epfModal');
}

function saveEPF() {
  const m = currentMember === 'all' ? 'madhu' : currentMember;
  D.epf[m] = {
    uan: document.getElementById('m-epf-uan').value,
    balance: +document.getElementById('m-epf-bal').value || 0,
    empShare: +document.getElementById('m-epf-emp').value || 0,
    erShare: +document.getElementById('m-epf-er').value || 0,
    monthly: +document.getElementById('m-epf-monthly').value || 0,
    updated: todayStr(),
    birthYear: +document.getElementById('m-epf-birthyear').value || 0,
    retireAge: +document.getElementById('m-epf-retire-age').value || 60
  };
  snapshotNW(); save(); renderAll(); closeModal('epfModal');
}

function openNpsModal() {
  const m = currentMember === 'all' ? 'madhu' : currentMember;
  const memSelect = document.getElementById('m-nps-member');
  if (memSelect) memSelect.value = m;
  populateNpsForm();
  openModal('npsModal');
}

function populateNpsForm() {
  const m = document.getElementById('m-nps-member') ? document.getElementById('m-nps-member').value : 'madhu';
  const n = D.nps[m] || {pran:'', tier1:0, tier2:0, fyContrib:0, monthly:0, equityPct:75};
  document.getElementById('m-nps-pran').value = n.pran;
  document.getElementById('m-nps-t1').value = n.tier1 || '';
  document.getElementById('m-nps-t2').value = n.tier2 || '';
  document.getElementById('m-nps-contrib').value = n.fyContrib || '';
  document.getElementById('m-nps-sip').value = n.monthly || '';
  document.getElementById('m-nps-eq').value = n.equityPct || 75;
}

function saveNPS() {
  const m = document.getElementById('m-nps-member') ? document.getElementById('m-nps-member').value : 'madhu';
  D.nps[m] = {
    pran: document.getElementById('m-nps-pran').value,
    tier1: +document.getElementById('m-nps-t1').value || 0,
    tier2: +document.getElementById('m-nps-t2').value || 0,
    fyContrib: +document.getElementById('m-nps-contrib').value || 0,
    monthly: +document.getElementById('m-nps-sip').value || 0,
    equityPct: +document.getElementById('m-nps-eq').value || 75
  };
  snapshotNW(); save(); renderAll(); closeModal('npsModal');
}

function getTaxMember() {
  return currentMember === 'all' ? 'madhu' : currentMember;
}

function currentTax() {
  const m = getTaxMember();
  return D.tax[m] || {gross:0, s80c:0, s80ccd:0, s24b:0, s80d:0, hra:0};
}

function openTaxModal() {
  const t = currentTax();
  document.getElementById('m-tax-gross').value = t.gross || '';
  document.getElementById('m-tax-80c').value   = t.s80c   || '';
  document.getElementById('m-tax-nps').value   = t.s80ccd || '';
  document.getElementById('m-tax-hl').value    = t.s24b   || '';
  document.getElementById('m-tax-80d').value   = t.s80d   || '';
  document.getElementById('m-tax-hra').value   = t.hra    || '';
  openModal('taxModal');
}

function saveTax() {
  const m = getTaxMember();
  if (!D.tax) D.tax = {};
  D.tax[m] = {
    gross: +document.getElementById('m-tax-gross').value || 0,
    s80c: Math.min(+document.getElementById('m-tax-80c').value || 0, 150000),
    s80ccd: Math.min(+document.getElementById('m-tax-nps').value || 0, 50000),
    s24b: Math.min(+document.getElementById('m-tax-hl').value || 0, 200000),
    s80d: Math.min(+document.getElementById('m-tax-80d').value || 0, 75000),
    hra: +document.getElementById('m-tax-hra').value || 0
  };
  save(); renderAll(); closeModal('taxModal');
}

function saveTxn() {
  const t = {
    id: Date.now(),
    desc: document.getElementById('m-txn-desc').value,
    amount: +document.getElementById('m-txn-amt').value || 0,
    type: document.getElementById('m-txn-type').value,
    cat: document.getElementById('m-txn-cat').value,
    member: document.getElementById('m-txn-member').value,
    date: document.getElementById('m-txn-date').value || new Date().toISOString().split('T')[0],
    account: document.getElementById('m-txn-account').value || ''
  };
  if (!t.desc || !t.amount) return;
  D.transactions.unshift(t);
  save(); renderAll(); closeModal('txnModal');
  document.getElementById('m-txn-desc').value = '';
  document.getElementById('m-txn-amt').value = '';
  document.getElementById('m-txn-account').value = '';
}

function saveBudget() {
  const rows = document.querySelectorAll('#budget-form-rows .budget-form-row');
  rows.forEach(row => {
    const cat = row.dataset.cat;
    const val = +row.querySelector('input').value || 0;
    D.budgets[cat] = val;
  });
  save(); renderAll(); closeModal('budgetModal');
}

function goldRateChanged() {
  const rate = +document.getElementById('gold-rate-input').value || 7500;
  D.goldRate = rate;
  save(); renderGold(); renderOv();
}

// ─────────────────────────────────────────────
// UPSERT HELPER
// ─────────────────────────────────────────────
function upsert(arr, item) {
  const i = arr.findIndex(x => x.id === item.id);
  if (i >= 0) arr[i] = item;
  else arr.push(item);
}

// ─────────────────────────────────────────────
// ESOP / RSU HELPERS
// ─────────────────────────────────────────────
function calcVestedUnits(inv) {
  if (!inv.grantDate || !inv.totalUnits) return 0;
  const now = new Date();
  const grantDate = new Date(inv.grantDate);
  const monthsElapsed = Math.max(0,
    (now.getFullYear() - grantDate.getFullYear()) * 12 + (now.getMonth() - grantDate.getMonth())
  );
  const cliff = inv.cliffMonths || 0;
  if (monthsElapsed < cliff) return 0;
  const vestMonths = inv.vestingMonths || 48;
  const freqMap = { monthly: 1, quarterly: 3, annual: 12 };
  const freqMonths = freqMap[inv.vestingFrequency] || 3;
  const totalCycles = Math.round(vestMonths / freqMonths);
  const completedCycles = Math.min(totalCycles, Math.floor(monthsElapsed / freqMonths));
  return Math.floor((completedCycles / totalCycles) * inv.totalUnits);
}

const CURRENCY_SYMBOLS = {INR:'₹',USD:'$',EUR:'€',GBP:'£',SGD:'S$',AED:'AED ',JPY:'¥',AUD:'A$',CAD:'C$'};
function getCurrSymbol(c) { return CURRENCY_SYMBOLS[c] || '₹'; }

let invDisplayCurrency = 'USD';

function getPortfolioCurrencies() {
  const seen = new Set(['INR']);
  D.investments.forEach(inv => { if (inv.currency && inv.currency !== 'INR') seen.add(inv.currency); });
  return [...seen];
}

function getInvDisplayRate(targetCurrency) {
  if (targetCurrency === 'INR') return 1;
  if (D.fxRates && D.fxRates[targetCurrency] > 0) return D.fxRates[targetCurrency];
  const match = [...D.investments]
    .filter(i => i.currency === targetCurrency && i.exchangeRate > 0)
    .sort((a, b) => b.id - a.id)[0];
  return match ? match.exchangeRate : 1;
}

function openFxModal() {
  const currencies = [...new Set(D.investments.filter(i => i.currency && i.currency !== 'INR').map(i => i.currency))];
  const form = document.getElementById('fx-rates-form');
  if (!currencies.length) {
    form.innerHTML = '<div class="alert alert-info" style="grid-column:1/-1;margin:0"><span>ℹ</span><span>No non-INR investments found. Add global investments first.</span></div>';
  } else {
    form.innerHTML = currencies.map(c => {
      const current = (D.fxRates && D.fxRates[c]) ? D.fxRates[c] : getInvDisplayRate(c);
      return `<div class="form-group"><label class="form-label">${getCurrSymbol(c)} ${c} → ₹ (1 ${c} = ₹)</label><input class="form-input" id="fx-rate-${c}" type="number" step="0.01" value="${current || ''}" placeholder="e.g. 85"></div>`;
    }).join('');
  }
  openModal('fxModal');
}

function saveFxRates() {
  const currencies = [...new Set(D.investments.filter(i => i.currency && i.currency !== 'INR').map(i => i.currency))];
  if (!D.fxRates) D.fxRates = {};
  currencies.forEach(c => {
    const val = +document.getElementById(`fx-rate-${c}`).value || 0;
    if (val > 0) {
      D.fxRates[c] = val;
      D.investments.forEach(inv => { if (inv.currency === c) inv.exchangeRate = val; });
    }
  });
  snapshotNW(); save(); renderAll(); closeModal('fxModal');
}

function setInvDisplayCurrency(currency) {
  invDisplayCurrency = currency;
  renderInv();
}

function isEsopType(type) {
  return type === 'ESOP' || type === 'RSU';
}

function toggleCurrencyFields() {
  const currency = document.getElementById('m-inv-currency').value || 'INR';
  const isNonINR = currency !== 'INR';
  const sym = getCurrSymbol(currency);
  document.getElementById('inv-fx-rate-group').style.display = isNonINR ? '' : 'none';
  if (isNonINR) {
    const fxInput = document.getElementById('m-inv-fx-rate');
    if (!fxInput.value && D.fxRates && D.fxRates[currency] > 0) fxInput.value = D.fxRates[currency];
  }
  document.getElementById('inv-cost-label').textContent = `Invested (${sym})`;
  document.getElementById('inv-val-label').textContent = `Current Value (${sym})`;
  document.getElementById('inv-grant-price-label').textContent = `Grant / Strike Price (${sym}/unit)`;
  document.getElementById('inv-cur-price-label').textContent = `Current Price (${sym}/unit)`;
}

function toggleEsopFields() {
  const type = document.getElementById('m-inv-type').value;
  const esop = isEsopType(type);
  document.getElementById('esop-fields').style.display = esop ? '' : 'none';
  document.getElementById('inv-cost-group').style.display = esop ? 'none' : '';
  document.getElementById('inv-val-group').style.display = esop ? 'none' : '';
  document.getElementById('inv-purchase-date-group').style.display = esop ? 'none' : '';
  toggleCurrencyFields();
}

// ─────────────────────────────────────────────
// GRATUITY HELPERS
// ─────────────────────────────────────────────
function calcGratuityYears(joiningDate) {
  if (!joiningDate) return 0;
  const joined = new Date(joiningDate);
  const now = new Date();
  const totalMonths = (now.getFullYear() - joined.getFullYear()) * 12 + (now.getMonth() - joined.getMonth());
  if (totalMonths <= 0) return 0;
  const fullYears = Math.floor(totalMonths / 12);
  return (totalMonths % 12) >= 6 ? fullYears + 1 : fullYears;
}

function getGratuityValue() {
  const g = D.gratuity || {};
  if (g.actualAccrued > 0) return g.actualAccrued;
  if (!g.basicDA || !g.joiningDate) return 0;
  const years = calcGratuityYears(g.joiningDate);
  return Math.round((g.basicDA * 15 / 26) * years);
}

// ─────────────────────────────────────────────
// NET WORTH
// ─────────────────────────────────────────────
function calcNW() {
  const liq = D.accounts.reduce((s, a) => s + a.balance, 0);
  const inv = D.investments.reduce((s, i) => s + i.value, 0);
  const prop = D.properties.reduce((s, p) => s + p.value, 0);
  const goldVal = calcGoldValue();
  let npsTotal = 0;
  Object.values(D.nps).forEach(n => { npsTotal += (n.tier1||0) + (n.tier2||0); });
  let epfTotal = 0;
  Object.values(D.epf).forEach(e => { epfTotal += (e.balance||0); });
  const ret = epfTotal + npsTotal + getGratuityValue();
  const loanLiab = D.loans.reduce((s, l) => s + l.outstanding, 0);
  const cardLiab = D.cards.reduce((s, c) => s + c.outstanding, 0);
  return liq + inv + prop + goldVal + ret - loanLiab - cardLiab;
}

function calcGoldValue() {
  const rate = D.goldRate || 7500;
  return D.gold.reduce((s, g) => {
    const purityFactor = (g.purity || 22) / 24;
    return s + g.weight * purityFactor * rate;
  }, 0);
}

function snapshotNW() {
  const nw = calcNW();
  const accs = filterByMember(D.accounts);
  const liq = accs.reduce((s, a) => s + a.balance, 0);
  const props = filterByMember(D.properties);
  const propVal = props.reduce((s, p) => s + p.value, 0);
  const invs = filterByMember(D.investments);
  const inv = invs.reduce((s, i) => s + i.value, 0);
  const goldVal = filterByMember(D.gold).reduce((s, g) => s + g.weight * ((g.purity||22)/24) * (D.goldRate||7500), 0);
  const npsData = getNpsData();
  const npsTotal = npsData.tier1 + npsData.tier2;
  let epfTotalSnap = 0;
  Object.values(D.epf).forEach(e => { epfTotalSnap += (e.balance||0); });
  const assetsVal = liq + propVal + inv + goldVal + epfTotalSnap + npsTotal + getGratuityValue();
  const loanLiab = filterByMember(D.loans).reduce((s, l) => s + l.outstanding, 0);
  const cardLiab = filterByMember(D.cards).reduce((s, c) => s + c.outstanding, 0);
  const liabsVal = loanLiab + cardLiab;

  const month = new Date().toLocaleDateString('en-IN',{month:'short',year:'2-digit'});
  const i = D.nwHistory.findIndex(h => h.m === month);
  const entry = { m: month, v: nw, assets: assetsVal, liabs: liabsVal, inv };
  if (i >= 0) D.nwHistory[i] = entry;
  else D.nwHistory.push(entry);
  if (D.nwHistory.length > 12) D.nwHistory.shift();
}

// ─────────────────────────────────────────────
// TAX CALC
// ─────────────────────────────────────────────
function oldTax(txbl) {
  if (txbl <= 250000) return 0;
  let t = 0;
  if (txbl > 1000000) t += (txbl - 1000000) * 0.3;
  if (txbl > 500000) t += (Math.min(txbl, 1000000) - 500000) * 0.2;
  if (txbl > 250000) t += (Math.min(txbl, 500000) - 250000) * 0.05;
  return Math.round(t * 1.04);
}

function newTax(inc) {
  const txbl = Math.max(0, inc - 75000);
  if (txbl <= 400000) return 0;
  let t = 0;
  [[400000,800000,.05],[800000,1200000,.1],[1200000,1600000,.15],[1600000,2000000,.2],[2000000,2400000,.25],[2400000,Infinity,.3]]
    .forEach(([lo,hi,r]) => { if (txbl > lo) t += (Math.min(txbl, hi) - lo) * r; });
  return Math.round(t * 1.04);
}

// ─────────────────────────────────────────────
// RENDER ALL
// ─────────────────────────────────────────────
function syncLoansFromTxns() {
  _log("Running syncLoansFromTxns...");
  _log("Current D.loans:", D.loans);
  _log("Current D.transactions count:", D.transactions.length);
  let changed = false;
  
  // Remove any existing apple, bajaj electronics, or family-transfer related loans
  const familyTransferTxnDescs = new Set(
    D.transactions
      .filter(t => t.cat === 'Family Transfer')
      .map(t => {
        let base = t.desc || '';
        if (base.includes('/')) {
          const parts = base.split('/');
          base = ['UPI','NEFT','IMPS','RTGS','BIL'].includes(parts[0]) ? (parts[1] || base) : parts[0];
        }
        return (base.trim() + '_' + t.amount).toLowerCase();
      })
  );
  const initialCount = D.loans.length;
  D.loans = D.loans.filter(l => {
    if (/apple/i.test(l.name) || /apple/i.test(l.lender || '')) return false;
    if (/bajaj electronics/i.test(l.name) || /bajaj electronics/i.test(l.lender || '')) return false;
    if (Math.abs(Number(l.emi) - 24999) < 1) return false;
    if (l.autoDetected && familyTransferTxnDescs.has((l.name + '_' + l.emi).toLowerCase())) return false;
    return true;
  });
  if (D.loans.length !== initialCount) {
    _log("Removed Apple/Bajaj Electronics related loans from D.loans");
    changed = true;
  }
  
  // 1. Self-healing loop: Dynamically correct transaction categories to "EMI" if they match any active loan in D.loans
  let txnsUpdated = false;
  D.transactions.forEach(t => {
    // Skip apple, bajaj electronics, and family transfer transactions
    if (/apple/i.test(t.desc) || /bajaj electronics/i.test(t.desc) || Math.abs(Number(t.amount) - 24999) < 1) return;
    if (t.cat === 'Family Transfer') return;
    if (t.type === 'debit' && t.cat !== 'EMI') {
      const tAmt = Number(t.amount);
      const matchingLoan = D.loans.find(l => {
        const loanEmi = Number(l.emi);
        const emiMatch = Math.abs(loanEmi - tAmt) < 10;
        const nameMatch = t.desc.toLowerCase().includes(l.name.toLowerCase()) || 
                          l.name.toLowerCase().includes(t.desc.toLowerCase()) ||
                          (l.lender && (t.desc.toLowerCase().includes(l.lender.toLowerCase()) || 
                                       l.lender.toLowerCase().includes(t.desc.toLowerCase())));
        return emiMatch && nameMatch;
      });
      if (matchingLoan) {
        _log(`Dynamically corrected transaction category to "EMI" for: "${t.desc}" (₹${t.amount}) to match active loan "${matchingLoan.name}"`);
        t.cat = 'EMI';
        t.type = 'debit'; // Always force EMI to be a debit transaction
        txnsUpdated = true;
      }
    }
  });
  if (txnsUpdated) changed = true;

  const uniqueNewEmis = {};
  D.transactions.forEach(r => {
    // Completely exclude Apple, Bajaj Electronics, and family transfers from generating loans
    if (/apple/i.test(r.desc) || /bajaj electronics/i.test(r.desc) || Math.abs(Number(r.amount) - 24999) < 1) return;
    if (r.cat === 'Family Transfer') return;
    if (r.cat === 'EMI' || /emi|loan|finance|bajaj|muthoot|cholamandalam|chola|hdb|home credit|ach debit|nach debit|ecs debit|auto debit|mandate/i.test(r.desc)) {
      let base = r.desc || '';
      if (base.includes('/')) {
        const parts = base.split('/');
        base = ['UPI','NEFT','IMPS','RTGS','BIL'].includes(parts[0]) ? (parts[1] || base) : parts[0];
      }
      base = stripTags(base.trim()) || 'Auto-Detected Loan';
      const key = base + '_' + r.amount;
      uniqueNewEmis[key] = { ...r, baseName: base };
    }
  });
  _log("Detected EMIs from transactions:", uniqueNewEmis);

  Object.values(uniqueNewEmis).forEach(r => {
    const amtNum = Number(r.amount);
    const isAutoLoan = (!isNaN(amtNum) && Math.abs(amtNum - 23790) < 1);
    const baseName = isAutoLoan ? 'Auto Loan' : r.baseName;
    _log(`Checking match for ${baseName} with EMI ${amtNum}`);
    const match = D.loans.find(l => {
      const loanEmi = Number(l.emi);
      const rowAmt = Number(r.amount);
      const emiMatch = Math.abs(loanEmi - rowAmt) < 10;
      const nameMatch = l.name.toLowerCase().includes(baseName.toLowerCase()) || 
                          baseName.toLowerCase().includes(l.name.toLowerCase());
      _log(`Comparing with existing loan "${l.name}" (EMI: ${loanEmi}): emiMatch=${emiMatch}, nameMatch=${nameMatch}`);
      return emiMatch && nameMatch;
    });
    if (!match) {
      _log(`No match found! Auto-populating loan stub for "${baseName}" (${amtNum})`);
      D.loans.push({
        id: Date.now() + Math.random(),
        type: isAutoLoan ? 'car' : 'other',
        name: baseName,
        lender: isAutoLoan ? 'Standard Chartered' : 'Auto-detected from bank',
        member: currentMember === 'all' ? 'madhu' : currentMember,
        principal: amtNum * 24, // Stub data (2 years)
        outstanding: amtNum * 24,
        emi: amtNum,
        rate: 10,
        tenure: 24,
        emiDay: parseInt((r.date||'').split('-')[2], 10) || 1,
        intPaid: 0
      });
      changed = true;
    } else {
      _log(`Match found for "${baseName}"! Skipping auto-population.`);
    }
  });
  if (changed) {
    _log("D.loans updated, saving to local storage...");
    save();
  }
}

function renderAll() {
  syncLoansFromTxns();
  renderOv();
  renderAccounts();
  renderCards();
  renderRewards();
  renderProperty();
  renderGold();
  renderInv();
  renderEPF();
  renderNPS();
  renderLoans();
  renderIns();
  renderBudget();
  renderTax();
  renderTxns();
  renderWidgets();
  renderCalendar();
}

// ─────────────────────────────────────────────
// OVERVIEW
// ─────────────────────────────────────────────
function renderOv() {
  const accs = filterByMember(D.accounts);
  const liq = accs.reduce((s, a) => s + a.balance, 0);
  const props = filterByMember(D.properties);
  const propVal = props.reduce((s, p) => s + p.value, 0);
  const invs = filterByMember(D.investments);
  const inv = invs.reduce((s, i) => s + i.value, 0);
  const goldVal = filterByMember(D.gold).reduce((s, g) => {
    return s + g.weight * ((g.purity||22)/24) * (D.goldRate||7500);
  }, 0);
  const loans = filterByMember(D.loans);
  const cards = filterByMember(D.cards);
  const loanLiab = loans.reduce((s, l) => s + l.outstanding, 0);
  const cardLiab = cards.reduce((s, c) => s + c.outstanding, 0);
  const totalLiab = loanLiab + cardLiab;
  const npsData = getNpsData();
  const npsTotal = npsData.tier1 + npsData.tier2;
  const epfBalance = currentMember === 'all'
    ? Object.values(D.epf).reduce((s, e) => s + (e.balance||0), 0)
    : (D.epf[currentMember] ? (D.epf[currentMember].balance || 0) : 0);
  const epfGratuity = epfBalance + (currentMember === 'all' ? getGratuityValue() : 0);
  const nw = liq + propVal + inv + goldVal + epfGratuity + npsTotal - totalLiab;

  document.getElementById('ov-nw').textContent = fmt(nw);
  document.getElementById('ov-liquid').textContent = fmt(liq);
  document.getElementById('ov-prop').textContent = fmt(propVal);
  document.getElementById('ov-inv').textContent = fmt(inv + goldVal);
  document.getElementById('ov-liab').textContent = '−' + fmt(totalLiab);

  // NW delta
  const hist = D.nwHistory;
  if (hist.length >= 2) {
    const prev = hist[hist.length - 2].v;
    const fullNw = calcNW();
    const pct = prev ? ((fullNw - prev) / Math.abs(prev) * 100).toFixed(1) : 0;
    const el = document.getElementById('ov-nw-delta');
    el.style.display = 'inline-flex';
    el.textContent = (pct >= 0 ? '↑' : '↓') + ' ' + Math.abs(pct) + '% vs last month';
    el.className = 'card-delta ' + (pct >= 0 ? 'delta-up' : 'delta-down');
  }

  // Asset breakdown
  renderAssetsDoughnut(liq, propVal, inv, goldVal, npsTotal);

  // Loans mini
  const loanEl = document.getElementById('ov-loans-mini');
  const activeLoans = filterByMember(D.loans);
  if (!activeLoans.length) {
    loanEl.innerHTML = '<div class="empty-state"><div class="empty-icon">≈</div>No loans</div>';
  } else {
    loanEl.innerHTML = activeLoans.slice(0, 3).map(l => {
      const typeColors = {home:'var(--accent)',car:'var(--accent2)',personal:'var(--accent3)',education:'var(--green)',other:'var(--muted)'};
      return `<div class="data-row">
        <div class="row-left">
          <div class="row-icon" style="background:rgba(181,129,58,.1)">≈</div>
          <div><div class="row-name">${esc(l.name)}</div><div class="row-sub">${memberTag(l.member)} · EMI ${fmt(l.emi)}/mo</div></div>
        </div>
        <div class="row-right"><div class="row-val negative">${fmt(l.outstanding)}</div></div>
      </div>`;
    }).join('');
  }

  // Insurance due
  const insEl = document.getElementById('ov-insurance');
  const upcoming = filterByMember(D.insurance).filter(p => {
    const d = daysUntil(p.dueDate); return d !== null && d <= 45;
  }).sort((a, b) => daysUntil(a.dueDate) - daysUntil(b.dueDate));
  if (!upcoming.length) {
    insEl.innerHTML = '<div style="font-size:12px;color:var(--muted);padding:8px 0">No renewals in next 45 days ✓</div>';
  } else {
    insEl.innerHTML = upcoming.map(p => {
      const d = daysUntil(p.dueDate);
      return `<div class="data-row">
        <div class="row-left">
          <span style="font-size:16px">${{life:'🛡',health:'❤️',auto:'🚗',other:'📋'}[p.type]||'📋'}</span>
          <div><div class="row-name">${esc(p.name)}</div><div class="row-sub">${esc(p.insurer)}</div></div>
        </div>
        <div class="row-right">
          <div class="row-val ${d<=7?'negative':''}" style="font-size:12px">${d<=0?'OVERDUE':d+' days'}</div>
          <div style="font-size:10px;color:var(--muted)">${fmt(p.premium)}</div>
        </div>
      </div>`;
    }).join('');
  }

  renderSpend();
  renderNWChart();
  renderAlerts();
  renderMemberNW();
  renderTxnIntel();
}

function renderTxnIntel() {
  const txns = filterByMember(D.transactions);
  
  // 1. Active EMIs (Sync'd from both sides)
  const emiEl = document.getElementById('ov-txn-emis');
  const panelTitle = emiEl ? emiEl.previousElementSibling.querySelector('.panel-title') : null;
  if (panelTitle) panelTitle.innerHTML = '&#x1F4CB; Active EMIs';
  
  // Create a unified list of EMIs
  const unifiedEmis = [];
  filterByMember(D.loans).forEach(l => {
    // find latest payment for this exact loan (match by amount AND name)
    const latestTxn = txns.filter(t => {
      const tAmt = Number(t.amount);
      const lEmi = Number(l.emi);
      return Math.abs(tAmt - lEmi) < 10 && t.desc.toLowerCase().includes(l.name.toLowerCase());
    }).sort((a,b)=>new Date(b.date)-new Date(a.date))[0];
    unifiedEmis.push({
      name: l.name,
      amount: l.emi,
      date: latestTxn ? latestTxn.date : 'Manual Entry'
    });
  });

  if (!unifiedEmis.length) {
    if(emiEl) emiEl.innerHTML = '<div class="empty-state"><div class="empty-icon">≈</div>No active EMIs</div>';
  } else {
    if(emiEl) emiEl.innerHTML = unifiedEmis.sort((a,b)=>b.amount-a.amount).map(t => `
      <div class="data-row" style="padding:6px 0">
        <div><div style="font-size:12px;font-weight:500">${esc(t.name.slice(0, 30))}</div><div style="font-size:10px;color:var(--muted)">Last paid: ${t.date}</div></div>
        <div class="row-val negative">−${fmt(t.amount)}</div>
      </div>
    `).join('');
  }

  // 2. Income & Credits
  const incEl = document.getElementById('ov-txn-income');
  const credits = txns.filter(t => t.type === 'credit');
  const incGroups = {};
  credits.forEach(t => {
    const cat = t.cat === 'Salary' ? 'Salary' : t.cat === 'Investment' ? 'Investment Return' : 'Other Income';
    incGroups[cat] = (incGroups[cat] || 0) + t.amount;
  });
  if (!credits.length) {
    if(incEl) incEl.innerHTML = '<div class="empty-state"><div class="empty-icon">↑</div>Import transactions to see income</div>';
  } else {
    if(incEl) incEl.innerHTML = Object.entries(incGroups).sort((a,b)=>b[1]-a[1]).map(([cat, amt]) => `
      <div class="data-row" style="padding:6px 0">
        <div style="font-size:12px;color:var(--text2)">${cat}</div>
        <div class="row-val positive">+${fmt(amt)}</div>
      </div>
    `).join('') + `<div style="font-size:10px;color:var(--muted);margin-top:8px;text-align:right">Total Credits: ${fmt(credits.reduce((s,t)=>s+t.amount,0))}</div>`;
  }

  // 3. Spend Breakdown (All Time)
  const catEl = document.getElementById('ov-txn-cats');
  const debits = txns.filter(t => t.type === 'debit' && t.cat !== 'Investment'); // Exclude investments from spend
  const catTotals = {};
  debits.forEach(t => { catTotals[t.cat] = (catTotals[t.cat]||0) + t.amount; });
  if (!debits.length) {
    if(catEl) catEl.innerHTML = '<div class="empty-state"><div class="empty-icon">≋</div>Import transactions to see breakdown</div>';
  } else {
    const sorted = Object.entries(catTotals).sort((a,b)=>b[1]-a[1]);
    const total = debits.reduce((s,t)=>s+t.amount,0);
    if(catEl) catEl.innerHTML = sorted.slice(0, 5).map(([cat, amt]) => `
      <div class="spend-row" style="margin-bottom:6px">
        <div class="spend-label" style="width:100px">${cat}</div>
        <div class="spend-bar-wrap"><div class="spend-bar-fill" style="width:${(amt/total*100).toFixed(1)}%;background:var(--accent2)"></div></div>
        <div class="spend-val">${fmt(amt)}</div>
      </div>
    `).join('') + `<div style="font-size:10px;color:var(--muted);margin-top:8px;text-align:right">All-time spend: ${fmt(total)}</div>`;
  }
}

function renderMemberNW() {
  const el = document.getElementById('ov-member-nw');
  const members = ['madhu','sailaja','parents','charan','himaja'];
  const memberData = members.map(m => {
    const liq = D.accounts.filter(a => a.member === m || a.member === 'joint').reduce((s,a) => s+a.balance,0);
    const propV = D.properties.filter(p => p.member === m || p.member === 'joint').reduce((s,p) => s+p.value,0);
    const inv = D.investments.filter(i => i.member === m || i.member === 'joint').reduce((s,i) => s+i.value,0);
    const goldV = D.gold.filter(g => g.member === m || g.member === 'joint').reduce((s,g) => s+g.weight*((g.purity||22)/24)*(D.goldRate||7500),0);
    const loans = D.loans.filter(l => l.member === m || l.member === 'joint').reduce((s,l) => s+l.outstanding,0);
    const cards = D.cards.filter(c => c.member === m || c.member === 'joint').reduce((s,c) => s+c.outstanding,0);
    return {m, nw: liq + propV + inv + goldV - loans - cards};
  }).filter(x => x.nw !== 0);

  if (!memberData.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">◈</div>Add data to see member breakdown</div>';
    return;
  }
  const max = Math.max(...memberData.map(x => Math.abs(x.nw)));
  el.innerHTML = memberData.map(x => `
    <div class="spend-row">
      <div class="spend-label" style="display:flex;align-items:center;gap:6px">
        <span style="width:8px;height:8px;border-radius:50%;background:${MEMBER_COLORS[x.m]};display:inline-block;flex-shrink:0"></span>
        ${MEMBER_NAMES[x.m]}
      </div>
      <div class="spend-bar-wrap"><div class="spend-bar-fill" style="width:${(Math.abs(x.nw)/max*100).toFixed(0)}%;background:${MEMBER_COLORS[x.m]}"></div></div>
      <div class="spend-val">${lk(x.nw)}</div>
    </div>`).join('');
}

function renderSpend() {
  const cats = {};
  const txns = filterByMember(D.transactions).filter(t => t.type === 'debit');
  const el = document.getElementById('ov-spend');
  if (!txns.length) {
    if (el) el.innerHTML = '<div class="empty-state"><div class="empty-icon">≋</div>No transactions found</div>';
    return;
  }
  
  // Dynamically use the month and year of the latest transaction in the database
  const sortedTxns = [...txns].sort((a, b) => new Date(b.date) - new Date(a.date));
  const latestDate = new Date(sortedTxns[0].date);
  const cm = latestDate.getMonth();
  const cy = latestDate.getFullYear();
  
  const monthName = latestDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const titleContainer = el ? el.previousElementSibling : null;
  const titleEl = titleContainer ? titleContainer.querySelector('.panel-title') : null;
  if (titleEl) titleEl.innerHTML = `&#x224B; Monthly Spend (${monthName})`;

  txns.filter(t =>
    new Date(t.date).getMonth() === cm &&
    new Date(t.date).getFullYear() === cy
  ).forEach(t => { cats[t.cat] = (cats[t.cat]||0) + t.amount; });

  if (!Object.keys(cats).length) {
    if (el) el.innerHTML = '<div class="empty-state"><div class="empty-icon">≋</div>No transactions this month</div>';
    return;
  }
  const total = Object.values(cats).reduce((a,b)=>a+b,0);
  const colors = ['#b5813a','#4a7c6f','#7b5ea7','#3a7d54','#c0692b','#4a6fa5','#7ab8a0','#b8a07e'];
  if (el) el.innerHTML = Object.entries(cats).sort((a,b)=>b[1]-a[1]).map(([cat,amt],i) =>
    `<div class="spend-row">
      <div class="spend-label">${cat}</div>
      <div class="spend-bar-wrap"><div class="spend-bar-fill" style="width:${(amt/total*100).toFixed(0)}%;background:${colors[i%colors.length]}"></div></div>
      <div class="spend-val">${fmt(amt)}</div>
    </div>`
  ).join('');
}

function renderNWChart() {
  const canvas = document.getElementById('nwChartCanvas');
  if (!canvas) return;
  
  let hist = D.nwHistory || [];
  if (hist.length === 0) return;
  
  // Filter by range select
  const rangeSelect = document.getElementById('nw-chart-range');
  const range = rangeSelect ? rangeSelect.value : '12';
  if (range !== 'all') {
    const num = parseInt(range, 10);
    hist = hist.slice(-num);
  }
  
  const labels = hist.map(h => h.m);
  const nwData = hist.map(h => h.v);
  const assetData = hist.map(h => h.assets !== undefined ? h.assets : h.v);
  const liabData = hist.map(h => h.liabs !== undefined ? h.liabs : 0);
  
  // Destroy existing chart if it exists
  if (nwChartInstance) {
    nwChartInstance.destroy();
  }
  
  const ctx = canvas.getContext('2d');
  
  // Create gradient background for Net Worth line
  const gradient = ctx.createLinearGradient(0, 0, 0, 120);
  gradient.addColorStop(0, 'rgba(181, 129, 58, 0.2)');
  gradient.addColorStop(1, 'rgba(181, 129, 58, 0.0)');
  
  nwChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Net Worth',
          data: nwData,
          borderColor: '#b5813a',
          backgroundColor: gradient,
          borderWidth: 2.5,
          fill: true,
          tension: 0.35,
          pointRadius: 3.5,
          pointBackgroundColor: '#b5813a',
          pointBorderColor: '#fff',
          pointHoverRadius: 5.5,
          pointHoverBackgroundColor: '#b5813a',
          pointHoverBorderColor: '#fff',
          pointHoverBorderWidth: 1.5,
          order: 1
        },
        {
          label: 'Total Assets',
          data: assetData,
          borderColor: 'rgba(58, 125, 84, 0.65)',
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          borderDash: [4, 4],
          fill: false,
          tension: 0.35,
          pointRadius: 2.5,
          pointBackgroundColor: '#3a7d54',
          pointBorderColor: '#fff',
          order: 2
        },
        {
          label: 'Total Liabilities',
          data: liabData,
          borderColor: 'rgba(192, 57, 43, 0.65)',
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          borderDash: [4, 4],
          fill: false,
          tension: 0.35,
          pointRadius: 2.5,
          pointBackgroundColor: '#c0392b',
          pointBorderColor: '#fff',
          order: 3
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'top',
          align: 'end',
          labels: {
            boxWidth: 12,
            boxHeight: 2,
            padding: 8,
            font: {
              family: "'DM Sans', sans-serif",
              size: 9,
              weight: '500'
            },
            color: 'var(--muted)'
          }
        },
        tooltip: {
          backgroundColor: 'var(--surface)',
          titleColor: 'var(--text)',
          bodyColor: 'var(--text2)',
          borderColor: 'var(--border)',
          borderWidth: 1,
          padding: 8,
          titleFont: {
            family: "'DM Sans', sans-serif",
            size: 10,
            weight: '600'
          },
          bodyFont: {
            family: "'DM Mono', monospace",
            size: 10
          },
          callbacks: {
            label: function(context) {
              let label = context.dataset.label || '';
              if (label) {
                label += ': ';
              }
              if (context.parsed.y !== null) {
                label += numbersHidden ? '₹ ••••' : '₹' + Math.abs(context.parsed.y).toLocaleString('en-IN');
              }
              return label;
            }
          }
        }
      },
      scales: {
        x: {
          grid: {
            display: false
          },
          ticks: {
            color: 'var(--muted)',
            font: {
              family: "'DM Mono', monospace",
              size: 8.5
            }
          }
        },
        y: {
          grid: {
            color: 'rgba(200, 192, 182, 0.25)',
            lineWidth: 0.75
          },
          ticks: {
            color: 'var(--muted)',
            font: {
              family: "'DM Mono', monospace",
              size: 8.5
            },
            callback: function(value) {
              if (numbersHidden) return '••';
              if (value >= 1e7) return '₹' + (value/1e7).toFixed(1) + 'Cr';
              if (value >= 1e5) return '₹' + (value/1e5).toFixed(0) + 'L';
              return '₹' + value.toLocaleString('en-IN');
            }
          }
        }
      }
    }
  });
}

function renderAssetsDoughnut(liq, propVal, inv, goldVal, npsTotal) {
  const epfForDoughnut = Object.values(D.epf).reduce((s, e) => s + (e.balance||0), 0);
  const totalAssets = liq + propVal + inv + goldVal + epfForDoughnut + npsTotal + getGratuityValue();
  const assetEl = document.getElementById('ov-assets-breakdown');
  const canvas = document.getElementById('assetDoughnutCanvas');
  
  if (totalAssets === 0) {
    if (assetEl) assetEl.innerHTML = '<div class="empty-state"><div class="empty-icon">◈</div>Add assets to see breakdown</div>';
    if (canvas) canvas.style.display = 'none';
    return;
  }
  
  if (canvas) canvas.style.display = 'block';
  
  if (assetChartInstance) {
    assetChartInstance.destroy();
  }
  
  const ctx = canvas.getContext('2d');
  
  const epfNps = epfForDoughnut + npsTotal + getGratuityValue();
  const innerGroups = [liq + inv + goldVal, propVal, epfNps];
  const outerClasses = [liq, inv, goldVal, propVal, epfNps];

  assetChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Liquid Cash', 'Investments', 'Gold', 'Property', 'EPF / NPS / Gratuity'],
      datasets: [
        {
          data: innerGroups,
          backgroundColor: [
            'rgba(74, 124, 111, 0.6)',
            'rgba(74, 111, 165, 0.6)',
            'rgba(58, 125, 84, 0.6)'
          ],
          borderWidth: 1.5,
          borderColor: 'var(--surface)',
          weight: 0.6,
          tooltip: {
            callbacks: {
              label: function(context) {
                const labels = ['Liquid/Investments/Gold', 'Real Estate / Property', 'Retirement (EPF/NPS/Gratuity)'];
                return labels[context.dataIndex] + ': ' + (numbersHidden ? '₹ ••••' : '₹' + context.raw.toLocaleString('en-IN'));
              }
            }
          }
        },
        {
          data: outerClasses,
          backgroundColor: [
            'var(--accent2)',
            'var(--accent3)',
            'var(--accent)',
            '#4a6fa5',
            'var(--green)'
          ],
          borderWidth: 1.5,
          borderColor: 'var(--surface)',
          weight: 1.0,
          tooltip: {
            callbacks: {
              label: function(context) {
                return context.label + ': ' + (numbersHidden ? '₹ ••••' : '₹' + context.raw.toLocaleString('en-IN'));
              }
            }
          }
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '45%',
      plugins: {
        legend: {
          display: false
        }
      }
    }
  });
  
  const segments = [
    {label:'Liquid Cash', val:liq, color:'var(--accent2)'},
    {label:'Investments', val:inv, color:'var(--accent3)'},
    {label:'Gold', val:goldVal, color:'var(--accent)'},
    {label:'Property', val:propVal, color:'#4a6fa5'},
    {label:'EPF / NPS / Gratuity', val:epfNps, color:'var(--green)'},
  ].filter(s => s.val > 0);
  
  assetEl.innerHTML = segments.map(s => {
    const pct = (s.val / totalAssets * 100).toFixed(1);
    return `<div class="spend-row" style="margin-bottom:6px; font-size:11px;">
      <div style="display:flex;align-items:center;gap:6px;">
        <span style="width:7px;height:7px;border-radius:50%;background:${s.color};display:inline-block;"></span>
        <span class="spend-label" style="font-weight:500;">${s.label}</span>
      </div>
      <div style="display:flex;gap:10px;align-items:center;">
        <span style="color:var(--muted);font-size:10px;">${pct}%</span>
        <span class="spend-val" style="font-family:'DM Mono',monospace;font-weight:500;">${lk(s.val)}</span>
      </div>
    </div>`;
  }).join('');
}

function renderAlerts() {
  const alerts = [];
  const cardOut = filterByMember(D.cards).reduce((s,c)=>s+c.outstanding,0);
  if (cardOut > 0) alerts.push({type:'warn', msg:`Card outstanding of ${fmt(cardOut)} — clear before interest kicks in.`});
  const t = currentTax();
  if (t.gross > 0 && t.s80c < 150000) alerts.push({type:'info', msg:`Section 80C: ${fmt(150000-t.s80c)} headroom remaining.`});
  const npsData = getNpsData();
  if (npsData.fyContrib < 50000 && t.gross > 0) alerts.push({type:'info', msg:`NPS 80CCD(1B): ${fmt(50000-npsData.fyContrib)} unused — worth ${fmt((50000-npsData.fyContrib)*.312)} in tax savings.`});
  filterByMember(D.insurance).filter(p => { const d=daysUntil(p.dueDate); return d!==null&&d<=30; }).forEach(p => {
    const d = daysUntil(p.dueDate);
    alerts.push({type:d<=0?'danger':'warn', msg:`${esc(p.name)} premium ${d<=0?'OVERDUE':'due in '+d+' days'} — ${fmt(p.premium)}`});
  });
  filterByMember(D.properties).filter(p => { const d=daysUntil(p.propTaxDue); return d!==null&&d<=30&&d>0; }).forEach(p => {
    alerts.push({type:'warn', msg:`Property tax for ${esc(p.name)} due in ${daysUntil(p.propTaxDue)} days — ${fmt(p.propTax)}`});
  });
  const el = document.getElementById('ov-alerts');
  if (!alerts.length) {
    el.innerHTML = '<div class="alert alert-success"><span>✓</span><span>All clear — no immediate action items.</span></div>';
    return;
  }
  const icons = {warn:'⚡',info:'ℹ',danger:'🔴',success:'✓'};
  el.innerHTML = alerts.slice(0,4).map(a =>
    `<div class="alert alert-${a.type}"><span>${icons[a.type]}</span><span>${a.msg}</span></div>`
  ).join('');
}

// ─────────────────────────────────────────────
// ACCOUNTS
// ─────────────────────────────────────────────
function renderAccounts() {
  const list = filterByMember(D.accounts);
  const el = document.getElementById('acc-list');
  if (!list.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">⬡</div>No accounts added</div>';
    return;
  }
  el.innerHTML = list.map(a => `
    <div class="data-row">
      <div class="row-left">
        <div class="row-icon" style="background:var(--accent2-light);font-size:16px">⬡</div>
        <div>
          <div class="row-name">${esc(a.name)} ${memberTag(a.member)}</div>
          <div class="row-sub">${esc(a.type)} · Updated ${a.updated||'—'}</div>
        </div>
      </div>
      <div class="row-right">
        <div class="row-val">${fmt(a.balance)}</div>
        <div style="font-size:10px;color:var(--green)">+${fmt(a.credits)} &nbsp;<span style="color:var(--red)">−${fmt(a.debits)}</span>/mo</div>
        <div style="display:flex;gap:6px;margin-top:6px">
          <button class="btn btn-sm" onclick="openEditAcc(${a.id})">Edit</button>
          <button class="btn btn-danger btn-sm" onclick="deleteAcc(${a.id})">Delete</button>
        </div>
      </div>
    </div>`
  ).join('');
}

// ─────────────────────────────────────────────
// CARDS
// ─────────────────────────────────────────────
function renderCards() {
  const list = filterByMember(D.cards);
  const total = list.reduce((s,c)=>s+c.outstanding,0);
  const limit = list.reduce((s,c)=>s+c.limit,0);
  const cm = new Date().getMonth();
  const mtd = filterByMember(D.transactions).filter(t=>t.type==='debit'&&new Date(t.date).getMonth()===cm).reduce((s,t)=>s+t.amount,0);
  document.getElementById('cards-total').textContent = '−'+fmt(total);
  document.getElementById('cards-mtd').textContent = fmt(mtd);
  document.getElementById('cards-limit').textContent = fmt(limit);
  const el = document.getElementById('card-list');
  if (!list.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">▭</div>No cards added</div>';
    return;
  }
  el.innerHTML = list.map(c => {
    const util = c.limit ? Math.round(c.outstanding/c.limit*100) : 0;
    const utilColor = util > 50 ? 'var(--red)' : util > 30 ? 'var(--orange)' : 'var(--green)';
    return `<div style="margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid var(--border)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <div>
          <div style="font-size:13px;font-weight:500">${esc(c.name)} ${memberTag(c.member)}</div>
          <div style="font-size:10px;color:var(--muted);margin-top:2px">Due: ${c.dueDate||'—'} · Min: ${fmt(c.minDue)}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <div style="text-align:right">
            <div class="row-val negative">−${fmt(c.outstanding)}</div>
            <div style="font-size:10px;color:var(--muted)">of ${fmt(c.limit)} limit</div>
          </div>
          <div style="display:flex;flex-direction:column;gap:4px">
            <button class="btn btn-sm" onclick="openEditCard(${c.id})">Edit</button>
            <button class="btn btn-danger btn-sm" onclick="deleteCard(${c.id})">Delete</button>
          </div>
        </div>
      </div>
      <div class="progress-wrap" style="margin:0">
        <div class="progress-label"><span>Utilization</span><span>${util}%</span></div>
        <div class="progress-bar"><div class="progress-fill" style="width:${Math.min(util,100)}%;background:${utilColor}"></div></div>
      </div>
    </div>`;
  }).join('');
}

// ─────────────────────────────────────────────
// REWARDS
// ─────────────────────────────────────────────
function renderRewards() {
  migrateRewards();
  const list = filterByMember(D.rewards);
  const now = new Date();
  const totalVal = list.reduce((s, r) => s + r.points * r.rate, 0);
  const expiringSoon = list.filter(r => {
    if (!r.expiry) return false;
    const days = Math.ceil((new Date(r.expiry) - now) / 86400000);
    return days > 0 && days <= 90;
  }).length;

  document.getElementById('rw-total-val').textContent = numbersHidden ? '••••' : fmt(totalVal);
  document.getElementById('rw-programs-count').textContent = list.length;
  document.getElementById('rw-expiring-count').textContent = expiringSoon || '—';

  const el = document.getElementById('reward-list');
  if (!list.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">◇</div>No reward programs added — click "+ Add Program" to start</div>';
    return;
  }

  const cards = list.map(r => {
    const prog = REWARD_PROGRAMS[r.program] || REWARD_PROGRAMS.default;
    const bestVal = r.points * r.rate;
    const expiryDays = r.expiry ? Math.ceil((new Date(r.expiry) - now) / 86400000) : null;

    const expiryBadge = expiryDays !== null
      ? (expiryDays <= 0
          ? `<span style="color:var(--red);font-size:10px;font-weight:600">⚠ Expired</span>`
          : expiryDays <= 30
            ? `<span style="color:var(--red);font-size:10px;font-weight:600">⚠ ${expiryDays}d left</span>`
            : expiryDays <= 90
              ? `<span style="color:var(--orange);font-size:10px">Exp in ${expiryDays}d</span>`
              : `<span style="font-size:10px;color:var(--muted)">Exp: ${r.expiry}</span>`)
      : `<span style="font-size:10px;color:var(--muted)">No expiry set</span>`;

    // Earn rates section
    let earnSection = '';
    if (prog.earnRates && prog.earnRates.length) {
      const earnRows = prog.earnRates.map((er, i) => {
        const effPct = (er.ptsPerRs100 * r.rate).toFixed(1);
        const isTop = i === 0;
        const barW = Math.round((er.ptsPerRs100 / prog.earnRates[0].ptsPerRs100) * 100);
        return `<div style="display:flex;align-items:center;gap:8px;padding:5px 0;${i < prog.earnRates.length - 1 ? 'border-bottom:1px solid var(--border)' : ''}">
          <div style="flex:1;min-width:0">
            <div style="font-size:11px;color:var(--text);font-weight:${isTop ? 600 : 400};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(er.category)}</div>
            <div style="height:3px;background:var(--border);border-radius:2px;margin-top:3px;overflow:hidden">
              <div style="height:100%;width:${barW}%;background:${isTop ? prog.color : 'var(--muted)'};border-radius:2px"></div>
            </div>
          </div>
          <div style="text-align:right;white-space:nowrap">
            <div style="font-size:10px;color:var(--muted)">${esc(er.note)}</div>
            <div style="font-size:11px;font-family:'DM Mono',monospace;font-weight:600;color:${isTop ? prog.color : 'var(--text)'}">₹${effPct}/₹100</div>
          </div>
        </div>`;
      }).join('');
      earnSection = `<div style="margin-bottom:14px">
        <div style="font-size:10px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:0.6px;margin-bottom:6px">Earn Rates (effective return per ₹100 spent)</div>
        ${earnRows}
      </div>`;
    }

    // Find best redemption option for highlighting
    const optVals = prog.options.map(opt =>
      opt.cashValue != null ? opt.cashValue : (opt.multiplier != null ? opt.multiplier * r.rate : 0)
    );
    const maxOptVal = Math.max(...optVals);

    const redeemRows = prog.options.map((opt, i) => {
      let earnedStr;
      const optVal = optVals[i];
      const isBest = optVal === maxOptVal && i === optVals.indexOf(maxOptVal);
      const barW = maxOptVal > 0 ? Math.round((optVal / maxOptVal) * 100) : 0;

      if (opt.cashValue != null) {
        earnedStr = `≈ ${numbersHidden ? '••••' : fmt(Math.round(r.points * opt.cashValue))}`;
      } else if (opt.multiplier != null) {
        earnedStr = `${numbersHidden ? '••••' : Math.round(r.points * opt.multiplier).toLocaleString('en-IN')} miles`;
      } else {
        earnedStr = '—';
      }

      return `<div style="padding:7px 0;${i < prog.options.length - 1 ? 'border-bottom:1px solid var(--border)' : ''}">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px">
          <div>
            <span style="font-size:12px;font-weight:${isBest ? 600 : 400};color:var(--text)">${isBest ? '★ ' : ''}${esc(opt.label)}</span>
            <span style="font-size:10px;color:var(--muted);margin-left:4px">${esc(opt.ratio)}</span>
          </div>
          <div style="font-size:12px;font-weight:600;font-family:'DM Mono',monospace;color:${isBest ? prog.color : 'var(--muted)'}">${earnedStr}</div>
        </div>
        <div style="height:3px;background:var(--border);border-radius:2px;overflow:hidden">
          <div style="height:100%;width:${barW}%;background:${isBest ? prog.color : 'var(--border)'};border-radius:2px;transition:width .3s"></div>
        </div>
        <div style="font-size:10px;color:var(--muted);margin-top:2px">${esc(opt.tag)}</div>
      </div>`;
    }).join('');

    return `<div class="panel" style="border-top:3px solid ${prog.color};margin-bottom:0">
      <div class="panel-header">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span class="panel-title">${esc(r.name)}</span>
          ${r.tier ? `<span style="font-size:10px;background:${prog.color}22;padding:2px 8px;border-radius:10px;color:${prog.color};font-weight:600">${esc(r.tier)}</span>` : ''}
        </div>
        <div style="display:flex;gap:6px">
          <button class="btn btn-sm" onclick="openRewardModal(${r.id})">Edit</button>
          <button class="btn btn-danger btn-sm" onclick="deleteReward(${r.id})">Delete</button>
        </div>
      </div>
      <div class="panel-body">
        <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:12px">
          <div>
            <div style="font-size:26px;font-weight:700;font-family:'DM Mono',monospace;color:${prog.color};line-height:1">${numbersHidden ? '••••' : r.points.toLocaleString('en-IN')}</div>
            <div style="font-size:10px;color:var(--muted);margin-top:3px">points &nbsp;·&nbsp; ${expiryBadge}</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:18px;font-weight:700;font-family:'DM Mono',monospace;color:var(--green)">≈ ${numbersHidden ? '••••' : fmt(Math.round(bestVal))}</div>
            <div style="font-size:10px;color:var(--muted)">best value &nbsp;·&nbsp; ₹${r.rate}/pt</div>
          </div>
        </div>
        ${prog.note ? `<div style="font-size:10px;color:${prog.color};background:${prog.color}14;padding:7px 10px;border-radius:6px;line-height:1.6;margin-bottom:12px">${esc(prog.note)}</div>` : ''}
        ${earnSection}
        <div class="divider" style="margin:10px 0 8px"></div>
        <div style="font-size:10px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:0.6px;margin-bottom:4px">Redemption Options</div>
        ${redeemRows}
      </div>
    </div>`;
  });

  const gridStyle = cards.length >= 2
    ? 'display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start'
    : '';
  el.innerHTML = `<div style="${gridStyle}">${cards.join('')}</div>`;
}

// ─────────────────────────────────────────────
// PROPERTY
// ─────────────────────────────────────────────
function renderProperty() {
  const list = filterByMember(D.properties);
  const totalVal = list.reduce((s,p)=>s+p.value,0);
  const totalCost = list.reduce((s,p)=>s+p.cost,0);
  const totalGain = totalVal - totalCost;
  document.getElementById('prop-total-val').textContent = fmt(totalVal);
  document.getElementById('prop-total-cost').textContent = fmt(totalCost);
  document.getElementById('prop-total-gain').textContent = (totalGain >= 0 ? '+' : '−') + fmt(totalGain);
  document.getElementById('prop-total-gain').className = 'card-value ' + (totalGain >= 0 ? 'positive' : 'negative');
  document.getElementById('prop-count').textContent = list.length;
  document.getElementById('prop-cap-gain').textContent = (totalGain >= 0 ? '+' : '−') + fmt(Math.abs(totalGain));

  // Property type summary
  const byType = {};
  list.forEach(p => { byType[p.type] = (byType[p.type]||0) + 1; });
  document.getElementById('prop-summary-flat').textContent = byType['flat'] ? byType['flat'] + ' property/ies' : '—';
  document.getElementById('prop-summary-house').textContent = byType['house'] ? byType['house'] + ' property/ies' : '—';
  document.getElementById('prop-summary-plot').textContent = byType['plot'] ? byType['plot'] + ' property/ies' : '—';

  // Property tax due
  const taxDue = list.filter(p => { const d=daysUntil(p.propTaxDue); return d!==null&&d<=90&&d>0; });
  document.getElementById('prop-tax-due').textContent = taxDue.length ? taxDue.length + ' due soon' : '—';

  // Tax calendar
  const taxListEl = document.getElementById('prop-tax-list');
  const withTax = list.filter(p => p.propTaxDue);
  if (!withTax.length) {
    taxListEl.innerHTML = '<div class="empty-state"><div class="empty-icon">≋</div>No property tax dates set</div>';
  } else {
    taxListEl.innerHTML = withTax.sort((a,b)=>new Date(a.propTaxDue)-new Date(b.propTaxDue)).map(p => {
      const d = daysUntil(p.propTaxDue);
      return `<div class="data-row">
        <div><div style="font-size:12px;font-weight:500">${esc(p.name)}</div><div style="font-size:10px;color:var(--muted)">${esc(p.propTaxDue)}</div></div>
        <div style="text-align:right">
          <div class="${d<=0?'row-val negative':d<=30?'':'row-val'}" style="font-size:12px;color:${d<=0?'var(--red)':d<=30?'var(--accent)':'var(--text2)'}">${d<=0?'OVERDUE':d+' days'}</div>
          <div style="font-size:10px;color:var(--muted)">${fmt(p.propTax)}/yr</div>
        </div>
      </div>`;
    }).join('');
  }

  // Property list
  const listEl = document.getElementById('prop-list');
  if (!list.length) {
    listEl.innerHTML = '<div class="empty-state"><div class="empty-icon">⌂</div>No properties added yet</div>';
    return;
  }

  const typeLabels = {flat:'Residential Flat',house:'House / Villa',plot:'Plot / Land',commercial:'Commercial',agri:'Agricultural'};
  const typeClasses = {flat:'prop-flat',house:'prop-house',plot:'prop-plot',commercial:'prop-commercial',agri:'prop-agri'};
  const typeIcons = {flat:'🏢',house:'🏠',plot:'🌿',commercial:'🏗',agri:'🌾'};

  listEl.innerHTML = list.map(p => {
    const gain = p.value - p.cost;
    const gainPct = p.cost ? (gain/p.cost*100).toFixed(1) : 0;
    const d = daysUntil(p.propTaxDue);
    const taxUrgent = d !== null && d <= 30 && d > 0;
    const linkedLoanIds = Array.isArray(p.linkedLoans) ? p.linkedLoans
      : (p.linkedLoan ? [+p.linkedLoan] : []);
    const linkedLoans = linkedLoanIds.map(id => D.loans.find(l => l.id === id)).filter(Boolean);
    return `<div class="prop-card">
      <div class="prop-card-header">
        <div>
          <span class="prop-type-badge ${typeClasses[p.type]}">${typeIcons[p.type]} ${typeLabels[p.type]}</span>
          <div class="prop-name" style="margin-top:6px">${esc(p.name)}</div>
          <div class="prop-location">${esc(p.location||'')} ${memberTag(p.member)}</div>
          ${p.notes ? `<div style="font-size:10px;color:var(--muted);margin-top:4px">${esc(p.notes)}</div>` : ''}
        </div>
        <div style="text-align:right">
          <div style="font-family:'DM Mono',monospace;font-size:16px;font-weight:500;color:var(--text)">${fmt(p.value)}</div>
          <div style="font-family:'DM Mono',monospace;font-size:10px;color:var(--muted)">Market value</div>
          ${gain !== 0 ? `<div style="font-family:'DM Mono',monospace;font-size:11px;color:${gain>=0?'var(--green)':'var(--red)'};margin-top:3px">${gain>=0?'+':''}${gainPct}% gain</div>` : ''}
        </div>
      </div>
      <div class="prop-meta">
        <div class="prop-meta-item"><div class="prop-meta-label">Purchase Price</div><div class="prop-meta-val">${fmt(p.cost)}</div></div>
        <div class="prop-meta-item"><div class="prop-meta-label">Unrealised Gain</div><div class="prop-meta-val ${gain>=0?'prop-gain':'prop-loss'}">${gain>=0?'+':''}${fmt(Math.abs(gain))}</div></div>
        <div class="prop-meta-item"><div class="prop-meta-label">Area</div><div class="prop-meta-val">${p.area ? p.area.toLocaleString()+' sq.ft' : '—'}</div></div>
        <div class="prop-meta-item"><div class="prop-meta-label">Purchased</div><div class="prop-meta-val">${p.purchaseDate||'—'}</div></div>
      </div>
      ${linkedLoans.length ? `<div style="margin-top:10px;padding:8px 10px;background:var(--surface2);border-radius:7px">
        ${linkedLoans.map(l => `<div style="font-size:11px;color:var(--muted);padding:2px 0">Linked loan: <strong style="color:var(--text)">${esc(l.name)}</strong> — Outstanding ${fmt(l.outstanding)}, EMI ${fmt(l.emi)}/mo</div>`).join('')}
      </div>` : ''}
      ${taxUrgent ? `<div style="margin-top:8px;" class="alert alert-warn" style="padding:6px 10px"><span>⚡</span><span>Property tax due in ${d} days — ${fmt(p.propTax)}</span></div>` : ''}
      <div class="prop-actions">
        <button class="btn btn-sm" onclick="openEditProp(${p.id})">Edit</button>
        <button class="btn btn-danger btn-sm" onclick="deleteProp(${p.id})">Delete</button>
      </div>
    </div>`;
  }).join('');
}

// ─────────────────────────────────────────────
// GOLD
// ─────────────────────────────────────────────
function renderGold() {
  const rate = D.goldRate || 7500;
  document.getElementById('gold-rate-input').value = rate;
  const list = filterByMember(D.gold);
  const totalWt = list.reduce((s,g)=>s+g.weight,0);
  const totalVal = list.reduce((s,g)=>s+g.weight*((g.purity||22)/24)*rate,0);
  const totalCost = list.reduce((s,g)=>s+g.cost,0);
  const totalGain = totalVal - totalCost;
  document.getElementById('gold-total-val').textContent = fmt(totalVal);
  document.getElementById('gold-total-wt').textContent = numbersHidden ? '•••• g' : totalWt.toFixed(1) + ' g';
  document.getElementById('gold-total-gain').textContent = (totalGain>=0?'+':'−') + fmt(Math.abs(totalGain));
  document.getElementById('gold-total-gain').className = 'card-value ' + (totalGain >= 0 ? 'positive' : 'negative');

  const el = document.getElementById('gold-list');
  if (!list.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">◎</div>No gold holdings added</div>';
  } else {
    el.innerHTML = list.map(g => {
      const val = g.weight * ((g.purity||22)/24) * rate;
      const gain = val - g.cost;
      return `<div class="gold-item">
        <div class="gold-item-left">
          <div class="row-icon" style="background:var(--accent-light);color:var(--accent)">◎</div>
          <div>
            <div class="row-name">${esc(g.name)} ${memberTag(g.member)}</div>
            <div class="row-sub">${numbersHidden ? '••' : g.weight}g · ${g.purity}K · ${g.form}</div>
          </div>
        </div>
        <div style="text-align:right">
          <div class="row-val">${fmt(val)}</div>
          <div style="font-size:10px;color:${gain>=0?'var(--green)':'var(--red)'}">${gain>=0?'+':'−'}${fmt(Math.abs(gain))} gain</div>
          <div style="display:flex;gap:5px;justify-content:flex-end;margin-top:5px">
            <button class="btn btn-sm" style="padding:3px 7px;font-size:10px" onclick="openEditGold(${g.id})">Edit</button>
            <button class="btn btn-danger btn-sm" style="padding:3px 7px;font-size:10px" onclick="deleteGold(${g.id})">✕</button>
          </div>
        </div>
      </div>`;
    }).join('');
  }

  // By member
  const byMember = document.getElementById('gold-by-member');
  const memberTotals = {};
  D.gold.forEach(g => {
    const v = g.weight * ((g.purity||22)/24) * rate;
    memberTotals[g.member] = (memberTotals[g.member]||0) + v;
  });
  if (!Object.keys(memberTotals).length) {
    byMember.innerHTML = '<div style="font-size:12px;color:var(--muted)">No data yet</div>';
  } else {
    byMember.innerHTML = Object.entries(memberTotals).map(([m,v]) =>
      `<div class="data-row" style="padding:6px 0">
        <div style="display:flex;align-items:center;gap:7px">
          <span style="width:8px;height:8px;border-radius:50%;background:${MEMBER_COLORS[m]||'#999'};display:inline-block"></span>
          <span style="font-size:12px">${MEMBER_NAMES[m]||m}</span>
        </div>
        <span style="font-family:'DM Mono',monospace;font-size:12px">${fmt(v)}</span>
      </div>`
    ).join('');
  }
}

// ─────────────────────────────────────────────
// INVESTMENTS
// ─────────────────────────────────────────────
function renderInv() {
  // Recompute cost+value in INR for ESOP/RSU (vesting changes over time)
  // and for any non-INR regular investments (keeps FX conversion consistent)
  D.investments.forEach(inv => {
    const rate = inv.exchangeRate || 1;
    if (isEsopType(inv.type)) {
      inv.cost = Math.round((inv.grantPrice || 0) * (inv.totalUnits || 0) * rate);
      inv.value = Math.round(calcVestedUnits(inv) * (inv.currentPrice || 0) * rate);
    } else if (inv.currency && inv.currency !== 'INR' && inv.valueFX !== undefined) {
      inv.cost = Math.round((inv.costFX || 0) * rate);
      inv.value = Math.round(inv.valueFX * rate);
    }
  });

  const list   = filterByMember(D.investments);
  const india  = list.filter(i => !i.currency || i.currency === 'INR');
  const global = list.filter(i => i.currency && i.currency !== 'INR');

  const inCost    = india.reduce((s,i)=>s+i.cost,0);
  const inVal     = india.reduce((s,i)=>s+i.value,0);
  const inPnl     = inVal - inCost;
  const glCostINR = global.reduce((s,i)=>s+i.cost,0);
  const glValINR  = global.reduce((s,i)=>s+i.value,0);
  const totalVal  = inVal + glValINR;

  // India / Global split bar
  const indiaPct  = totalVal > 0 ? Math.round(inVal / totalVal * 100) : 0;
  const globalPct = 100 - indiaPct;
  const indiaBar = document.getElementById('inv-india-pct-bar');
  const globalBar = document.getElementById('inv-global-pct-bar');
  if (indiaBar)  indiaBar.style.width  = indiaPct + '%';
  if (globalBar) globalBar.style.width = globalPct + '%';
  const inLabel = document.getElementById('inv-india-pct-label');
  const glLabel = document.getElementById('inv-global-pct-label');
  if (inLabel) inLabel.textContent = totalVal > 0 ? `🇮🇳 ${indiaPct}%` : '🇮🇳 —';
  if (glLabel) glLabel.textContent = totalVal > 0 ? `🌐 ${globalPct}%` : '🌐 —';

  // Indian compact stats
  document.getElementById('inv-in-cost').textContent = fmt(inCost);
  document.getElementById('inv-in-val').textContent  = fmt(inVal);
  const inPnlEl = document.getElementById('inv-in-pnl');
  inPnlEl.textContent    = (inPnl >= 0 ? '+' : '−') + fmt(Math.abs(inPnl));
  inPnlEl.style.color    = inPnl >= 0 ? 'var(--green)' : 'var(--red)';

  // Global "View in" selector — non-INR currencies present + INR option
  const globalCurrencies = ['INR', ...new Set(global.map(i => i.currency).filter(Boolean))];
  const currSelect = document.getElementById('inv-display-currency');
  if (currSelect) {
    if (!globalCurrencies.includes(invDisplayCurrency))
      invDisplayCurrency = globalCurrencies.includes('USD') ? 'USD' : globalCurrencies[0];
    currSelect.innerHTML = globalCurrencies.map(c =>
      `<option value="${c}" ${c === invDisplayCurrency ? 'selected' : ''}>${getCurrSymbol(c)} ${c}</option>`
    ).join('');
  }

  // Global compact stats (converted to display currency)
  const displayRate = getInvDisplayRate(invDisplayCurrency);
  const displaySym  = getCurrSymbol(invDisplayCurrency);
  const isINR       = invDisplayCurrency === 'INR';
  const fmtD = n => numbersHidden ? `${displaySym}••••` : displaySym + Math.abs(n||0).toLocaleString('en-IN',{maximumFractionDigits:0});
  const dGlCost = isINR ? glCostINR : Math.round(glCostINR / displayRate);
  const dGlVal  = isINR ? glValINR  : Math.round(glValINR  / displayRate);
  const dGlPnl  = dGlVal - dGlCost;

  const glCostLbl = document.getElementById('inv-gl-cost-label');
  const glValLbl  = document.getElementById('inv-gl-val-label');
  const glPnlLbl  = document.getElementById('inv-gl-pnl-label');
  if (glCostLbl) glCostLbl.textContent = isINR ? 'Invested (INR)' : `Invested (${invDisplayCurrency})`;
  if (glValLbl)  glValLbl.textContent  = isINR ? 'Value (INR)'    : `Value (${invDisplayCurrency})`;
  if (glPnlLbl)  glPnlLbl.textContent  = isINR ? 'P&L (INR)'      : `P&L (${invDisplayCurrency})`;

  document.getElementById('inv-gl-cost').textContent = fmtD(dGlCost);
  document.getElementById('inv-gl-val').textContent  = fmtD(dGlVal);
  const glPnlEl = document.getElementById('inv-gl-pnl');
  glPnlEl.textContent  = (dGlPnl >= 0 ? '+' : '−') + fmtD(Math.abs(dGlPnl));
  glPnlEl.style.color  = dGlPnl >= 0 ? 'var(--green)' : 'var(--red)';

  // Shared row renderer for both panels
  function makeRowHTML(inv) {
    const isNonINR = inv.currency && inv.currency !== 'INR';
    const sym  = getCurrSymbol(inv.currency);
    const rate = inv.exchangeRate || 1;
    if (isEsopType(inv.type)) {
      const vested   = calcVestedUnits(inv);
      const total    = inv.totalUnits || 0;
      const unvested = total - vested;
      const vestPct  = total ? Math.round(vested / total * 100) : 0;
      const vestedVal      = Math.round(vested * (inv.currentPrice || 0) * rate);
      const totalPotential = Math.round(total  * (inv.currentPrice || 0) * rate);
      const priceGain = inv.grantPrice && inv.currentPrice
        ? (((inv.currentPrice - inv.grantPrice) / inv.grantPrice) * 100).toFixed(1) : null;
      const priceDisplay = isNonINR
        ? `${sym}${(inv.currentPrice||0).toLocaleString('en-IN')}/unit`
        : `${fmt(inv.currentPrice||0)}/unit`;
      const grantDisplay = inv.grantPrice
        ? (isNonINR ? `${sym}${inv.grantPrice.toLocaleString('en-IN')}/u` : fmt(inv.grantPrice)+'/u')
        : 'Free';
      return `<tr>
        <td>
          <div style="font-size:12px;font-weight:500">${esc(inv.name)}</div>
          <div style="font-size:10px;color:var(--muted);margin-top:2px">${vested.toLocaleString('en-IN')} / ${total.toLocaleString('en-IN')} units vested · ${priceDisplay}</div>
          <div style="margin-top:5px;background:var(--surface2);border-radius:3px;height:4px;width:120px">
            <div style="width:${vestPct}%;height:100%;background:var(--accent);border-radius:3px;transition:width .3s"></div>
          </div>
        </td>
        <td><span class="badge badge-teal" style="font-size:9px;padding:2px 6px">${inv.type}</span>${isNonINR ? `<div style="font-size:9px;color:var(--muted);margin-top:2px">${inv.currency}</div>` : ''}</td>
        <td>${memberTag(inv.member)}</td>
        <td style="font-family:'DM Mono',monospace;font-size:12px">${grantDisplay}<div style="font-size:10px;color:var(--muted)">${total.toLocaleString('en-IN')} granted</div></td>
        <td style="font-family:'DM Mono',monospace;font-size:12px">${fmt(vestedVal)}${unvested > 0 ? `<div style="font-size:10px;color:var(--muted)">+${fmt(totalPotential - vestedVal)} unvested</div>` : ''}</td>
        <td style="font-family:'DM Mono',monospace;font-size:12px;text-align:right;color:${vestPct>=100?'var(--green)':'var(--accent)'}">${vestPct}% vested
          ${priceGain !== null ? `<div style="font-size:10px;color:${priceGain>=0?'var(--green)':'var(--red)'}">${priceGain>=0?'+':''}${priceGain}% price</div>` : ''}
          <div style="margin-top:2px">
            <button onclick="openEditInv(${inv.id})" style="background:none;border:none;cursor:pointer;color:var(--accent);font-size:11px">✎</button>
            <button onclick="deleteInv(${inv.id})" style="margin-left:4px;background:none;border:none;cursor:pointer;color:var(--muted);font-size:11px">✕</button>
          </div>
        </td>
      </tr>`;
    }
    const r = inv.cost ? (((inv.value-inv.cost)/inv.cost)*100).toFixed(1) : 0;
    const costDisplay = isNonINR && inv.costFX ? `${fmt(inv.cost)}<div style="font-size:10px;color:var(--muted)">${sym}${inv.costFX.toLocaleString('en-IN')}</div>` : fmt(inv.cost);
    const valDisplay  = isNonINR && inv.valueFX ? `${fmt(inv.value)}<div style="font-size:10px;color:var(--muted)">${sym}${inv.valueFX.toLocaleString('en-IN')}</div>` : fmt(inv.value);
    return `<tr>
      <td>
        <div style="font-size:12px;font-weight:500">${esc(inv.name)}</div>
        ${isNonINR ? `<div style="font-size:10px;color:var(--muted);margin-top:2px">${inv.currency} @ ₹${(rate).toLocaleString('en-IN')}</div>` : ''}
      </td>
      <td><span style="font-family:'DM Mono',monospace;font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em">${inv.type}</span></td>
      <td>${memberTag(inv.member)}</td>
      <td style="font-family:'DM Mono',monospace;font-size:12px">${costDisplay}</td>
      <td style="font-family:'DM Mono',monospace;font-size:12px">${valDisplay}</td>
      <td style="font-family:'DM Mono',monospace;font-size:12px;text-align:right;color:${r>=0?'var(--green)':'var(--red)'}">${r>=0?'+':''}${r}%
        <button onclick="openEditInv(${inv.id})" style="margin-left:8px;background:none;border:none;cursor:pointer;color:var(--accent);font-size:11px">✎</button>
        <button onclick="deleteInv(${inv.id})" style="margin-left:4px;background:none;border:none;cursor:pointer;color:var(--muted);font-size:11px">✕</button>
      </td>
    </tr>`;
  }

  // Render Indian table
  const indiaBody = document.getElementById('inv-rows-india');
  indiaBody.innerHTML = india.length
    ? india.map(makeRowHTML).join('')
    : '<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">↗</div>No Indian investments</div></td></tr>';

  // Render Global table
  const globalBody = document.getElementById('inv-rows-global');
  globalBody.innerHTML = global.length
    ? global.map(makeRowHTML).join('')
    : '<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">🌐</div>No global investments</div></td></tr>';

  // Portfolio value history chart
  const hist = (D.nwHistory || []).filter(h => h.inv !== undefined);
  const chartCanvas = document.getElementById('inv-chart-canvas');
  const chartEmpty = document.getElementById('inv-chart-empty');
  if (chartCanvas) {
    if (hist.length < 2) {
      if (chartEmpty) chartEmpty.style.display = '';
      if (invChartInstance) { invChartInstance.destroy(); invChartInstance = null; }
    } else {
      if (chartEmpty) chartEmpty.style.display = 'none';
      if (invChartInstance) invChartInstance.destroy();
      const isDark = document.body.classList.contains('dark') || window.matchMedia('(prefers-color-scheme: dark)').matches;
      const textMuted = isDark ? 'rgba(200,190,175,0.5)' : 'rgba(100,90,80,0.5)';
      invChartInstance = new Chart(chartCanvas.getContext('2d'), {
        type: 'line',
        data: {
          labels: hist.map(h => h.m),
          datasets: [{
            data: hist.map(h => h.inv || 0),
            borderColor: 'rgba(181,129,58,0.9)',
            backgroundColor: 'rgba(181,129,58,0.12)',
            fill: true, tension: 0.35, pointRadius: 3, pointHoverRadius: 5, borderWidth: 2
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: {
            callbacks: { label: ctx => ' ' + fmt(ctx.parsed.y) }
          }},
          scales: {
            x: { grid: { display: false }, ticks: { font: { size: 9 }, color: textMuted } },
            y: { grid: { color: 'rgba(138,130,121,0.12)' }, ticks: { font: { size: 9 }, color: textMuted,
              callback: v => v >= 1e7 ? '₹'+(v/1e7).toFixed(1)+'Cr' : v >= 1e5 ? '₹'+(v/1e5).toFixed(0)+'L' : '₹'+v.toLocaleString('en-IN')
            }}
          }
        }
      });
    }
  }

  // India/Global value labels below split bar
  const indiaValLbl = document.getElementById('inv-india-val-label');
  const globalValLbl = document.getElementById('inv-global-val-label');
  if (indiaValLbl) indiaValLbl.textContent = fmt(inVal);
  if (globalValLbl) globalValLbl.textContent = fmt(glValINR);
}

// ─────────────────────────────────────────────
// EPF
// ─────────────────────────────────────────────
function renderEPF() {
  const e = getEpfData();
  document.getElementById('epf-bal-display').textContent = fmt(e.balance);
  document.getElementById('epf-monthly-display').textContent = fmt(e.monthly);
  document.getElementById('epf-uan-d').textContent = e.uan || '—';
  document.getElementById('epf-emp-d').textContent = fmt(e.empShare);
  document.getElementById('epf-er-d').textContent = fmt(e.erShare);
  document.getElementById('epf-int-d').textContent = fmt(Math.max(0,e.balance-e.empShare-e.erShare));
  document.getElementById('epf-upd-d').textContent = e.updated || '—';
  const annual = e.monthly * 12;
  const pct = pf(annual, 150000);
  document.getElementById('epf-80c-d').textContent = fmt(Math.min(annual,150000));
  document.getElementById('epf-80c-pct').textContent = pct + '%';
  document.getElementById('epf-80c-bar').style.width = pct + '%';

  // Gratuity
  const g = D.gratuity || {};
  const years = calcGratuityYears(g.joiningDate);
  const computed = (g.basicDA && g.joiningDate) ? Math.round((g.basicDA * 15 / 26) * years) : 0;
  const effective = g.actualAccrued > 0 ? g.actualAccrued : computed;

  document.getElementById('grat-amount-display').textContent = fmt(effective);
  document.getElementById('grat-years-display').textContent = years > 0 ? years + (years === 1 ? ' yr' : ' yrs') + ' service' : 'Enter joining date';
  document.getElementById('grat-employer-d').textContent = g.employer || '—';
  document.getElementById('grat-joined-d').textContent = g.joiningDate || '—';
  document.getElementById('grat-basic-d').textContent = g.basicDA ? fmt(g.basicDA) + '/mo' : '—';
  document.getElementById('grat-computed-d').textContent = computed > 0 ? fmt(computed) : '—';
  document.getElementById('grat-actual-d').textContent = g.actualAccrued > 0 ? fmt(g.actualAccrued) : 'Using computed';

  const eligEl = document.getElementById('grat-eligibility');
  if (!g.joiningDate) {
    eligEl.textContent = 'Enter joining date to check';
    eligEl.style.color = 'var(--muted)';
  } else if (years >= 5) {
    eligEl.textContent = '✓ Eligible — ' + years + ' yrs completed';
    eligEl.style.color = 'var(--green)';
  } else {
    const needed = 5 - Math.floor((new Date() - new Date(g.joiningDate)) / (365.25 * 24 * 3600 * 1000));
    eligEl.textContent = `Building — ~${Math.max(1, needed)} yr${needed > 1 ? 's' : ''} to eligibility`;
    eligEl.style.color = 'var(--accent)';
  }

  const taxFreePct = Math.min(100, Math.round((effective / 2000000) * 100));
  document.getElementById('grat-taxfree-bar').style.width = taxFreePct + '%';
  document.getElementById('grat-taxfree-pct').textContent = taxFreePct + '%';

  // Retirement Projection
  const projEl = document.getElementById('epf-projection-body');
  if (projEl) {
    if (currentMember === 'all') {
      projEl.innerHTML = '<div class="alert alert-info" style="margin:0"><span>ℹ</span><span>Select a specific family member to see their EPF retirement projection.</span></div>';
    } else {
    const birthYear = e.birthYear || 0;
    const retireAge = e.retireAge || 60;
    if (!birthYear) {
      projEl.innerHTML = '<div class="alert alert-info" style="margin:0"><span>ℹ</span><span>Add your birth year via Update to see EPF corpus projection at retirement.</span></div>';
    } else {
      const currentAge = new Date().getFullYear() - birthYear;
      const yearsLeft   = Math.max(0, retireAge - currentAge);
      const n = yearsLeft * 12;
      const r = 0.0825 / 12;
      const P = e.balance || 0;
      const C = e.monthly || 0;
      const fvBal    = P * Math.pow(1 + r, n);
      const fvContrib = n > 0 ? C * (Math.pow(1 + r, n) - 1) / r : 0;
      const corpus   = Math.round(fvBal + fvContrib);
      const corpusStr = corpus >= 1e7 ? cr(corpus) : lk(corpus);
      projEl.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:12px">
          <div>
            <div class="card-label">Current Age</div>
            <div class="card-value gold" style="font-size:17px">${currentAge} yrs</div>
          </div>
          <div>
            <div class="card-label">Years to Retire</div>
            <div class="card-value teal" style="font-size:17px">${yearsLeft} yrs</div>
            <div style="font-size:10px;color:var(--muted)">Age ${retireAge} target</div>
          </div>
          <div>
            <div class="card-label">Monthly Contribution</div>
            <div class="card-value" style="font-size:17px">${fmt(C)}</div>
          </div>
          <div>
            <div class="card-label">Projected Corpus</div>
            <div class="card-value positive" style="font-size:17px">${yearsLeft > 0 ? corpusStr : fmt(P)}</div>
            <div style="font-size:10px;color:var(--muted)">@ 8.25% p.a. EPF rate</div>
          </div>
        </div>
        <div class="alert alert-info" style="margin:0"><span>ℹ</span><span>Projection assumes current balance of ${fmt(P)} + ${fmt(C)}/mo contributions compounding at 8.25% p.a. Does not account for future salary increments.</span></div>`;
    }
    } // end else (specific member)
  }
}

// ─────────────────────────────────────────────
// NPS
// ─────────────────────────────────────────────
function getNpsData() {
  if (currentMember === 'all') {
    let t1=0, t2=0, fyc=0, mo=0;
    Object.values(D.nps).forEach(n => { t1+=(n.tier1||0); t2+=(n.tier2||0); fyc+=(n.fyContrib||0); mo+=(n.monthly||0); });
    return { pran:Object.keys(D.nps).length > 1 ? 'Multiple' : (Object.values(D.nps)[0]?.pran || ''), tier1:t1, tier2:t2, fyContrib:fyc, monthly:mo, equityPct:'-' };
  }
  return D.nps[currentMember] || {pran:'', tier1:0, tier2:0, fyContrib:0, monthly:0, equityPct:75};
}

const EPF_EMPTY = {uan:'', balance:0, empShare:0, erShare:0, monthly:0, updated:null, birthYear:0, retireAge:60};
function getEpfData() {
  if (currentMember === 'all') {
    let bal=0, emp=0, er=0, mo=0;
    Object.values(D.epf).forEach(e => { bal+=(e.balance||0); emp+=(e.empShare||0); er+=(e.erShare||0); mo+=(e.monthly||0); });
    return Object.assign({}, EPF_EMPTY, { balance:bal, empShare:emp, erShare:er, monthly:mo });
  }
  return D.epf[currentMember] || Object.assign({}, EPF_EMPTY);
}

function renderNPS() {
  const n = getNpsData(), tot = n.tier1 + n.tier2;
  document.getElementById('nps-bal-d').textContent = fmt(tot);
  document.getElementById('nps-sip-d').textContent = fmt(n.monthly);
  document.getElementById('nps-tax-d').textContent = fmt(Math.min(n.fyContrib,50000)*.312);
  document.getElementById('nps-pran-d').textContent = n.pran || '—';
  document.getElementById('nps-t1-d').textContent = fmt(n.tier1);
  document.getElementById('nps-t2-d').textContent = fmt(n.tier2);
  document.getElementById('nps-contrib-d').textContent = fmt(n.fyContrib);
  document.getElementById('nps-eq-d').textContent = n.equityPct === '-' ? '-' : (n.equityPct||75) + '%';
  const pct = pf(n.fyContrib, 50000);
  document.getElementById('nps-80ccd-pct').textContent = pct + '%';
  document.getElementById('nps-80ccd-bar').style.width = pct + '%';
  document.getElementById('nps-ctb-d').textContent = fmt(Math.min(n.fyContrib,50000));
  document.getElementById('nps-rem-d').textContent = fmt(Math.max(0,50000-n.fyContrib));
}

// ─────────────────────────────────────────────
// FINANCIAL CALENDAR
// ─────────────────────────────────────────────
function normalizeRecurDesc(desc) {
  return (desc || '')
    .toLowerCase()
    .replace(/^(upi|neft|imps|rtgs|ach|ecs|nach|si|bil|clg|int)\s*[\/-]?\s*/i, '')
    .replace(/\b\d{6,}\b/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ').slice(0, 4).join(' ');
}

function detectRecurringFromTxns(memberFilter) {
  const txns = (memberFilter ? filterByMember(D.transactions) : D.transactions)
    .filter(t => t.type === 'debit' && t.cat !== 'Family Transfer');

  // Group by normalized description
  const groups = {};
  txns.forEach(t => {
    const key = normalizeRecurDesc(t.desc);
    if (!key || key.length < 3) return;
    if (!groups[key]) groups[key] = [];
    groups[key].push(t);
  });

  const results = [];
  Object.entries(groups).forEach(([key, hits]) => {
    if (hits.length < 2) return;

    // Must appear in at least 2 distinct calendar months
    const months = new Set(hits.map(t => t.date.slice(0, 7)));
    if (months.size < 2) return;

    // Amount consistency: coefficient of variation < 20%
    const amounts = hits.map(t => t.amount);
    const mean = amounts.reduce((s, a) => s + a, 0) / amounts.length;
    if (mean < 10) return;
    const stdDev = Math.sqrt(amounts.reduce((s, a) => s + (a - mean) ** 2, 0) / amounts.length);
    if (mean > 0 && stdDev / mean > 0.20) return;

    hits.sort((a, b) => new Date(b.date) - new Date(a.date));
    const latest = hits[0];
    const avgDay = Math.round(hits.reduce((s, t) => s + new Date(t.date).getDate(), 0) / hits.length);

    // Derive a clean display name from the most recent description
    const displayName = (latest.desc || key)
      .replace(/^(upi|neft|imps|rtgs|ach|ecs|nach|si|bil)\s*[\/-]?\s*/i, '')
      .replace(/\b\d{8,}\b/g, '')
      .trim()
      .split(/[\/\-_]/)[0]
      .trim()
      .slice(0, 32);

    results.push({
      name: displayName,
      key,
      amount: Math.round(mean),
      day: avgDay,
      lastDate: latest.date,
      count: hits.length,
      months: months.size,
      member: latest.member,
      cat: latest.cat
    });
  });

  // Sort by amount descending
  return results.sort((a, b) => b.amount - a.amount);
}

function getCalendarEvents(year, month) {
  const events = [];
  
  // 1. EMIs
  filterByMember(D.loans).forEach(l => {
    events.push({
      type: 'emi',
      name: l.name,
      day: l.emiDay || 1,
      amount: l.emi,
      meta: l.lender || 'EMI',
      member: l.member
    });
  });
  
  // 2. Insurance Renewals
  filterByMember(D.insurance).forEach(p => {
    if (!p.dueDate) return;
    const d = new Date(p.dueDate);
    const dueMonth = d.getMonth();
    const dueYear = d.getFullYear();
    const dueDay = d.getDate();
    
    let isDue = false;
    const freq = (p.freq || 'yearly').toLowerCase();
    
    if (freq === 'monthly') {
      isDue = true;
    } else if (freq === 'quarterly') {
      const diffMonths = (year - dueYear) * 12 + (month - dueMonth);
      if (diffMonths >= 0 && diffMonths % 3 === 0) isDue = true;
    } else if (freq === 'half-yearly' || freq === 'half yearly') {
      const diffMonths = (year - dueYear) * 12 + (month - dueMonth);
      if (diffMonths >= 0 && diffMonths % 6 === 0) isDue = true;
    } else {
      if (dueMonth === month) isDue = true;
    }
    
    if (isDue) {
      events.push({
        type: 'ins',
        name: p.name,
        day: dueDay,
        amount: p.premium,
        meta: p.insurer || 'Insurance',
        member: p.member
      });
    }
  });
  
  // 3. Recurring transactions (auto-detected from history)
  detectRecurringFromTxns(true).forEach(s => {
    events.push({
      type: 'sub',
      name: s.name,
      day: s.day,
      amount: s.amount,
      meta: 'Recurring',
      member: s.member
    });
  });
  
  return events;
}

function renderCalendar() {
  const gridEl = document.getElementById('calendar-grid');
  const monthYearEl = document.getElementById('calendar-month-year');
  if (!gridEl || !monthYearEl) return;
  
  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();
  
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  monthYearEl.textContent = monthNames[month] + ' ' + year;
  
  const events = getCalendarEvents(year, month);
  
  const accs = filterByMember(D.accounts);
  const liquidBal = accs.reduce((s, a) => s + a.balance, 0);
  
  const today = new Date();
  const isCurrentMonth = (year === today.getFullYear() && month === today.getMonth());
  const todayDay = today.getDate();
  
  let runningBalance = liquidBal;
  const lowBalanceDays = new Set();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  
  for (let d = 1; d <= daysInMonth; d++) {
    if (!isCurrentMonth || d >= todayDay) {
      const dayEvents = events.filter(e => e.day === d);
      const dayOutflow = dayEvents.reduce((s, e) => s + e.amount, 0);
      runningBalance -= dayOutflow;
      if (runningBalance < 0) {
        lowBalanceDays.add(d);
      }
    }
  }
  
  let html = '';
  const dayHeaders = ['Su','Mo','Tu','We','Th','Fr','Sa'];
  dayHeaders.forEach(h => {
    html += `<div class="calendar-day-header">${h}</div>`;
  });
  
  const firstDayIndex = new Date(year, month, 1).getDay();
  const prevDaysInMonth = new Date(year, month, 0).getDate();
  for (let i = firstDayIndex - 1; i >= 0; i--) {
    const prevDay = prevDaysInMonth - i;
    html += `<div class="calendar-day-cell other-month">
      <span class="day-number">${prevDay}</span>
    </div>`;
  }
  
  for (let d = 1; d <= daysInMonth; d++) {
    const isToday = isCurrentMonth && d === todayDay;
    const isSelected = selectedCalDay === d;
    const dayEvents = events.filter(e => e.day === d);
    const hasLowBalance = lowBalanceDays.has(d);
    
    let cellClass = 'calendar-day-cell';
    if (isToday) cellClass += ' today';
    if (isSelected) cellClass += ' selected';
    if (hasLowBalance) cellClass += ' low-balance-warning';
    
    let dotsHtml = '<div class="calendar-events-dots">';
    if (dayEvents.length > 0) {
      const uniqueTypes = [...new Set(dayEvents.map(e => e.type))];
      uniqueTypes.slice(0, 3).forEach(type => {
        dotsHtml += `<span class="cal-dot ${type}"></span>`;
      });
    }
    dotsHtml += '</div>';
    
    html += `<div class="${cellClass}" onclick="selectCalDay(${d})">
      <span class="day-number">${d}</span>
      ${dotsHtml}
    </div>`;
  }
  
  const totalCells = firstDayIndex + daysInMonth;
  const remainingCells = (7 - (totalCells % 7)) % 7;
  for (let d = 1; d <= remainingCells; d++) {
    html += `<div class="calendar-day-cell other-month">
      <span class="day-number">${d}</span>
    </div>`;
  }
  
  gridEl.innerHTML = html;
  renderCalendarDetails(events, lowBalanceDays, liquidBal);
}

function renderCalendarDetails(events, lowBalanceDays, liquidBal) {
  const detailsEl = document.getElementById('calendar-details');
  if (!detailsEl) return;
  
  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();
  
  const selectedEvents = events.filter(e => e.day === selectedCalDay);
  const monthOutflow = events.reduce((s, e) => s + e.amount, 0);
  
  let html = '';
  
  html += `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid var(--border);">
    <div>
      <div style="font-size:8.5px;color:var(--muted);text-transform:uppercase;font-family:'DM Mono',monospace;letter-spacing:0.05em;">Monthly Outflow</div>
      <div style="font-size:14px;font-weight:600;color:var(--text);margin-top:2px;">${fmt(monthOutflow)}</div>
    </div>
    <div style="text-align:right;">
      <div style="font-size:8.5px;color:var(--muted);text-transform:uppercase;font-family:'DM Mono',monospace;letter-spacing:0.05em;">Available Cash</div>
      <div style="font-size:14px;font-weight:600;color:var(--green);margin-top:2px;">${fmt(liquidBal)}</div>
    </div>
  </div>`;
  
  if (lowBalanceDays.size > 0) {
    const firstLowDay = Math.min(...Array.from(lowBalanceDays));
    const dayEvents = events.filter(e => e.day === firstLowDay);
    const lowEventNames = dayEvents.map(e => esc(e.name)).join(', ');
    
    html += `<div class="alert alert-danger" style="margin-bottom:12px;padding:10px;border-radius:6px;font-size:11px;line-height:1.4;">
      <span>⚠️</span>
      <span><strong>Low Balance Alert!</strong> Projected balance falls negative on the <strong>${firstLowDay}th</strong> due to payments for: <em>${lowEventNames}</em>. Total available liquid balance is insufficient.</span>
    </div>`;
  }
  
  const monthNamesShort = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const displayDateStr = `${selectedCalDay} ${monthNamesShort[month]} ${year}`;
  
  html += `<div style="font-weight:600;font-size:12px;margin-bottom:8px;color:var(--text);">Due on ${displayDateStr}</div>`;
  
  if (selectedEvents.length === 0) {
    html += `<div class="empty-state" style="padding:20px 0;">
      <div style="font-size:16px;opacity:0.4;">☀️</div>
      <div style="margin-top:4px;font-size:11px;">No bills due on this day</div>
    </div>`;
  } else {
    selectedEvents.forEach(e => {
      let icon = '💵';
      if (e.type === 'emi') icon = '≈';
      if (e.type === 'ins') icon = '🛡️';
      if (e.type === 'sub') icon = '🔄';
      
      html += `<div class="timeline-item ${e.type}">
        <div class="timeline-icon">${icon}</div>
        <div class="timeline-details">
          <div class="timeline-title">${esc(e.name)}</div>
          <div class="timeline-meta">${esc(e.meta)} &middot; ${memberTag(e.member)}</div>
        </div>
        <div class="timeline-amount" style="color:${e.type==='emi'?'var(--accent)':e.type==='ins'?'var(--green)':'var(--orange)'}">${fmt(e.amount)}</div>
      </div>`;
    });
  }
  
  detailsEl.innerHTML = html;
}

function prevMonth() {
  calendarDate.setMonth(calendarDate.getMonth() - 1);
  selectedCalDay = 1;
  renderCalendar();
}

function nextMonth() {
  calendarDate.setMonth(calendarDate.getMonth() + 1);
  selectedCalDay = 1;
  renderCalendar();
}

function selectCalDay(day) {
  selectedCalDay = day;
  renderCalendar();
}

// ─────────────────────────────────────────────
// LOANS
// ─────────────────────────────────────────────
function renderLoans() {
  const list = filterByMember(D.loans);
  const totalOut = list.reduce((s,l)=>s+l.outstanding,0);
  const totalEmi = list.reduce((s,l)=>s+l.emi,0);
  const totalIntPaid = list.reduce((s,l)=>s+l.intPaid,0);
  document.getElementById('loan-total').textContent = fmt(totalOut);
  document.getElementById('loan-emi-total').textContent = fmt(totalEmi);
  document.getElementById('loan-int-paid').textContent = fmt(totalIntPaid);
  document.getElementById('loan-count').textContent = list.length;

  const el = document.getElementById('loan-list');
  if (!list.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">≈</div>No loans added</div>';
  } else {
    const typeClasses = {home:'loan-home',car:'loan-car',personal:'loan-personal',education:'loan-education',other:'loan-other'};
    const typeLabels = {home:'Home Loan',car:'Car Loan',personal:'Personal',education:'Education',other:'Other'};
    el.innerHTML = list.map(l => {
      const paidPct = l.principal ? Math.round((1-(l.outstanding/l.principal))*100) : 0;
      return `<div class="loan-card">
        <div class="loan-card-header">
          <div>
            <span class="loan-type ${typeClasses[l.type]}">${typeLabels[l.type]||l.type}</span>
            <div style="font-size:14px;font-weight:500;margin-top:5px">${esc(l.name)} ${memberTag(l.member)}</div>
            <div style="font-size:11px;color:var(--muted)">${esc(l.lender||'')}</div>
          </div>
          <div style="text-align:right">
            <div style="font-family:'DM Mono',monospace;font-size:16px;font-weight:500;color:var(--red)">−${fmt(l.outstanding)}</div>
            <div style="font-size:10px;color:var(--muted)">outstanding</div>
          </div>
        </div>
        <div class="loan-meta">
          <div><div class="loan-meta-label">EMI</div><div class="loan-meta-val" style="color:var(--accent)">${fmt(l.emi)}/mo</div></div>
          <div><div class="loan-meta-label">Rate</div><div class="loan-meta-val">${l.rate||0}% p.a.</div></div>
          <div><div class="loan-meta-label">Tenure Left</div><div class="loan-meta-val">${l.tenure||0} mo</div></div>
          <div><div class="loan-meta-label">EMI Day</div><div class="loan-meta-val">${l.emiDay ? l.emiDay+'th' : '—'}</div></div>
        </div>
        <div class="emi-bar">
          <div class="progress-wrap" style="margin-top:10px">
            <div class="progress-label"><span>Principal repaid</span><span>${paidPct}%</span></div>
            <div class="progress-bar"><div class="progress-fill" style="width:${paidPct}%;background:var(--green)"></div></div>
          </div>
        </div>
        <div style="border-top:1px solid var(--border);margin-top:10px;padding-top:10px">
          <div style="font-size:10px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">Prepayment Simulator</div>
          <div style="display:flex;gap:8px;align-items:center">
            <input type="number" id="prepay-extra-${l.id}" placeholder="Extra ₹/month"
              style="flex:1;padding:5px 8px;border:1px solid var(--border);border-radius:6px;background:var(--surface2);color:var(--text);font-size:12px;font-family:'DM Mono',monospace"
              oninput="runPrepay(${l.id})">
          </div>
          <div id="prepay-result-${l.id}" style="font-size:11px;color:var(--muted);margin-top:6px;min-height:16px"></div>
        </div>
        <div class="prop-actions" style="margin-top:10px">
          <button class="btn btn-sm" onclick="openEditLoan(${l.id})">Edit</button>
          <button class="btn btn-danger btn-sm" onclick="deleteLoan(${l.id})">Delete</button>
        </div>
      </div>`;
    }).join('');
  }

  // EMI calendar
  const calEl = document.getElementById('loan-calendar');
  if (!list.length) {
    calEl.innerHTML = '<div class="empty-state"><div class="empty-icon">≋</div>No upcoming EMIs</div>';
  } else {
    calEl.innerHTML = list.map(l => `
      <div class="data-row">
        <div><div style="font-size:12px;font-weight:500">${esc(l.name)}</div><div style="font-size:10px;color:var(--muted)">${esc(l.lender||'')} · Day ${esc(l.emiDay||'—')}</div></div>
        <div style="font-family:'DM Mono',monospace;font-size:13px;color:var(--accent)">${fmt(l.emi)}</div>
      </div>`).join('');
  }

  // 24b home loan deduction
  const homeLoanInt = filterByMember(D.loans).filter(l=>l.type==='home').reduce((s,l)=>s+l.intPaid,0);
  const capped = Math.min(homeLoanInt, 200000);
  document.getElementById('loan-24b-val').textContent = fmt(capped);
  document.getElementById('loan-24b-pct').textContent = pf(homeLoanInt,200000) + '%';
  document.getElementById('loan-24b-bar').style.width = pf(homeLoanInt,200000) + '%';
}

function runPrepay(id) {
  const l = D.loans.find(x => x.id === id);
  const el = document.getElementById(`prepay-result-${id}`);
  if (!el) return;
  const extra = +document.getElementById(`prepay-extra-${id}`).value || 0;
  if (!extra) { el.textContent = ''; return; }
  if (!l.outstanding || !l.rate || !l.tenure) {
    el.textContent = 'Enter outstanding balance, rate and tenure to simulate.';
    return;
  }
  const r = l.rate / 100 / 12;
  const P = l.outstanding;
  const emi = l.emi > 0 ? l.emi : Math.round(P * r * Math.pow(1+r, l.tenure) / (Math.pow(1+r, l.tenure) - 1));
  const stdInterest = (emi * l.tenure) - P;
  // Simulate month-by-month with extra payment
  let bal = P, months = 0;
  while (bal > 0.01 && months < l.tenure * 3) {
    const interest = bal * r;
    const principal = Math.min(bal, emi + extra - interest);
    if (principal <= 0) break;
    bal -= principal;
    months++;
  }
  const newInterest = Math.max(0, ((emi + extra) * months) - P);
  const monthsSaved = l.tenure - months;
  const interestSaved = Math.round(stdInterest - newInterest);
  if (monthsSaved <= 0) {
    el.innerHTML = `<span style="color:var(--muted)">Loan closes in ${months} months — try a higher extra amount.</span>`;
  } else {
    el.innerHTML = `Close in <span style="font-weight:600;color:var(--text)">${months} months</span> `
      + `<span style="color:var(--muted)">(saves ${monthsSaved} month${monthsSaved>1?'s':''})</span> · `
      + `Interest saved: <span style="font-weight:600;color:var(--green)">${fmt(interestSaved)}</span>`;
  }
}

// ─────────────────────────────────────────────
// INSURANCE
// ─────────────────────────────────────────────
function renderIns() {
  const list = filterByMember(D.insurance);
  const totalPremium = list.reduce((s,p)=>s+p.premium,0);
  const lifeCover = list.filter(p=>p.type==='life').reduce((s,p)=>s+p.cover,0);
  const healthCover = list.filter(p=>p.type==='health').reduce((s,p)=>s+p.cover,0);
  document.getElementById('ins-total-premium').textContent = fmt(totalPremium);
  document.getElementById('ins-life-cover').textContent = lifeCover >= 1e7 ? cr(lifeCover) : lk(lifeCover);
  document.getElementById('ins-health-cover').textContent = lk(healthCover);
  document.getElementById('ins-count').textContent = list.length;

  const listEl = document.getElementById('ins-list');
  if (!list.length) {
    listEl.innerHTML = '<div class="empty-state"><div class="empty-icon">⛨</div>No policies added</div>';
  } else {
    const typeIcons = {life:'🛡',health:'❤️',auto:'🚗',other:'📋'};
    const typeClasses = {life:'ins-life',health:'ins-health',auto:'ins-auto',other:'ins-life'};
    const typeLabels = {life:'Life',health:'Health',auto:'Auto',other:'Other'};
    listEl.innerHTML = list.map(p => {
      const d = daysUntil(p.dueDate);
      const urgent = d !== null ? (d <= 0 ? 'ins-overdue' : d <= 30 ? 'ins-due-soon' : '') : '';
      const dueTxt = d === null ? '—' : d <= 0 ? `<span style="color:var(--red)">OVERDUE</span>` : d <= 30 ? `<span style="color:var(--accent)">${d} days</span>` : `${d} days`;
      
      const sourceBadge = p.source === 'doc' ? `<span style="font-size:10px;background:rgba(123,94,167,0.1);color:#7b5ea7;padding:2px 6px;border-radius:4px;margin-left:6px">📄 Doc Scan</span>` : 
                          p.source === 'txn' ? `<span style="font-size:10px;background:rgba(74,111,165,0.1);color:#4a6fa5;padding:2px 6px;border-radius:4px;margin-left:6px">🔍 Txn Scan</span>` : '';
      
      const tenure = (p.startYear && p.endYear) ? `${p.startYear} – ${p.endYear}` : (p.startYear ? `Since ${p.startYear}` : '—');
      const nomDisplay = p.nominee ? `<span style="color:var(--text)">${esc(p.nominee)}${p.nomineeRel ? ' ('+esc(p.nomineeRel)+')' : ''}</span>` : `<span style="color:var(--red)">⚠ Not set</span>`;

      return `<div class="ins-card ${urgent}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div>
            <span class="ins-type-badge ${typeClasses[p.type]}">${typeIcons[p.type]} ${typeLabels[p.type]}</span>${sourceBadge}
            <div style="font-size:13px;font-weight:500;margin-top:5px">${esc(p.name)} ${memberTag(p.member)}</div>
            <div style="font-size:11px;color:var(--muted)">${esc(p.insurer)}${p.polno?' · '+esc(p.polno):''}</div>
          </div>
          <div style="text-align:right;font-family:'DM Mono',monospace;font-size:13px;color:var(--accent)">${fmt(p.premium)}<div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em">${p.freq||'annual'}</div></div>
        </div>
        <div class="ins-meta" style="grid-template-columns:1fr 1fr 1fr">
          <div><div class="ins-meta-label">Cover</div><div class="ins-meta-val" style="color:var(--green)">${p.cover>=1e7?cr(p.cover):lk(p.cover)}</div></div>
          <div><div class="ins-meta-label">Tenure</div><div class="ins-meta-val">${tenure}</div></div>
          <div><div class="ins-meta-label">Renewal In</div><div class="ins-meta-val">${dueTxt}</div></div>
        </div>
        <div class="ins-meta" style="margin-top:8px;border-top:1px solid var(--border);padding-top:8px">
           <div><div class="ins-meta-label">Nominee</div><div class="ins-meta-val">${nomDisplay}</div></div>
           <div style="grid-column: span 2"><div class="ins-meta-label">Covered</div><div class="ins-meta-val">${p.covered && p.covered.length ? p.covered.map(esc).join(', ') : 'Self'}</div></div>
        </div>
        <div class="prop-actions" style="margin-top:8px">
          <button class="btn btn-sm" onclick="openEditIns(${p.id})">Edit</button>
          <button class="btn btn-danger btn-sm" onclick="deleteIns(${p.id})">Delete</button>
        </div>
      </div>`;
    }).join('');
  }

  // GAP DETECTOR
  const gaps = [];
  const noLife = !list.some(p => p.type === 'life' && p.cover >= 5000000);
  const noHealth = !list.some(p => p.type === 'health');
  const missingNominee = list.filter(p => !p.nominee && (p.type==='life'||p.type==='health')).length;
  if (noLife) gaps.push("No sufficient Life Cover (Term Insurance) detected.");
  if (noHealth) gaps.push("No Health Cover detected.");
  if (missingNominee > 0) gaps.push(`${missingNominee} policies missing nominee details.`);
  
  const gapEl = document.getElementById('ins-gap-detector');
  if (gaps.length > 0) {
    gapEl.style.display = 'block';
    gapEl.innerHTML = `<strong>Coverage Gaps Detected:</strong><ul style="margin-top:4px;padding-left:20px">` + gaps.map(g => `<li>${g}</li>`).join('') + `</ul>`;
  } else {
    gapEl.style.display = 'none';
  }

  // FAMILY COVERAGE GRID
  const fam = ["Madhu", "Sailaja", "Charan", "Himaja"];
  const gridHTML = fam.map(person => {
    // Check if person is covered under any life/health
    const hasLife = list.some(p => p.type === 'life' && (p.member.toLowerCase() === person.toLowerCase() || (p.covered && p.covered.some(c => c.toLowerCase() === person.toLowerCase()))));
    const hasHealth = list.some(p => p.type === 'health' && (p.member.toLowerCase() === person.toLowerCase() || (p.covered && p.covered.some(c => c.toLowerCase() === person.toLowerCase())) || p.member === 'joint' || p.member === 'parents'));
    
    return `<div style="background:var(--surface2);border-radius:6px;padding:8px;border:1px solid var(--border)">
       <div style="font-weight:600;font-size:12px;margin-bottom:6px">${person}</div>
       <div style="display:flex;justify-content:space-between;font-size:11px">
         <span style="color:var(--muted)">Life</span> <span>${hasLife ? '✅' : '❌'}</span>
       </div>
       <div style="display:flex;justify-content:space-between;font-size:11px;margin-top:2px">
         <span style="color:var(--muted)">Health</span> <span>${hasHealth ? '✅' : '❌'}</span>
       </div>
    </div>`;
  }).join('');
  document.getElementById('ins-coverage-grid').innerHTML = gridHTML;

  // 80D Tax Summary
  const healthPremium = list.filter(p=>p.type==='health').reduce((s,p)=>s+p.premium,0);
  const d80 = Math.min(healthPremium, 75000);
  document.getElementById('ins-80d-val').textContent = fmt(d80);
  document.getElementById('ins-80d-pct').textContent = pf(healthPremium,75000) + '%';
  document.getElementById('ins-80d-bar').style.width = pf(healthPremium,75000) + '%';
}

// ─────────────────────────────────────────────
// BUDGET
// ─────────────────────────────────────────────
function renderBudget() {
  const cm = new Date().getMonth(), cy = new Date().getFullYear();
  const pm = cm === 0 ? 11 : cm - 1, py = cm === 0 ? cy - 1 : cy;

  const curSpend = {};
  const prevSpend = {};
  filterByMember(D.transactions).filter(t => t.type === 'debit').forEach(t => {
    const d = new Date(t.date);
    if (d.getMonth() === cm && d.getFullYear() === cy) curSpend[t.cat] = (curSpend[t.cat]||0) + t.amount;
    if (d.getMonth() === pm && d.getFullYear() === py) prevSpend[t.cat] = (prevSpend[t.cat]||0) + t.amount;
  });

  const totalBudget = Object.values(D.budgets).reduce((s,v)=>s+v,0);
  const totalActual = Object.values(curSpend).reduce((s,v)=>s+v,0);
  const remaining = totalBudget - totalActual;

  document.getElementById('bud-total').textContent = fmt(totalBudget);
  document.getElementById('bud-actual').textContent = fmt(totalActual);
  document.getElementById('bud-remaining').textContent = remaining >= 0 ? fmt(remaining) : '−'+fmt(Math.abs(remaining));
  document.getElementById('bud-remaining').className = 'card-value ' + (remaining >= 0 ? 'positive' : 'negative');
  document.getElementById('bud-pct').textContent = totalBudget ? Math.round(totalActual/totalBudget*100)+'%' : '0%';

  // Budget Comparison Chart
  const budgetCanvas = document.getElementById('budgetChartCanvas');
  if (budgetCanvas) {
    const cats = Object.keys(D.budgets);
    const activeCats = cats.filter(cat => D.budgets[cat] > 0 || curSpend[cat] > 0);
    
    if (budgetChartInstance) {
      budgetChartInstance.destroy();
    }
    
    if (activeCats.length === 0) {
      const ctx = budgetCanvas.getContext('2d');
      ctx.clearRect(0, 0, budgetCanvas.width, budgetCanvas.height);
    } else {
      const budgetData = activeCats.map(cat => D.budgets[cat] || 0);
      const actualData = activeCats.map(cat => curSpend[cat] || 0);
      const spendColors = activeCats.map(cat => {
        const b = D.budgets[cat] || 0;
        const s = curSpend[cat] || 0;
        if (b > 0 && s > b) return 'rgba(192, 57, 43, 0.8)';
        if (b > 0 && s > b * 0.75) return 'rgba(192, 105, 43, 0.8)';
        return 'rgba(58, 125, 84, 0.8)';
      });
      const ctx = budgetCanvas.getContext('2d');
      budgetChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: activeCats,
          datasets: [
            {
              label: 'Budget Limit',
              data: budgetData,
              backgroundColor: 'rgba(138, 130, 121, 0.3)',
              borderColor: 'rgba(138, 130, 121, 0.45)',
              borderWidth: 1,
              borderRadius: 4
            },
            {
              label: 'Actual Spent',
              data: actualData,
              backgroundColor: spendColors,
              borderColor: spendColors.map(c => c.replace('0.8', '1.0')),
              borderWidth: 1,
              borderRadius: 4
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: true,
              position: 'top',
              labels: {
                boxWidth: 12,
                boxHeight: 12,
                font: { family: "'DM Sans', sans-serif", size: 10 },
                color: 'var(--muted)'
              }
            },
            tooltip: {
              backgroundColor: 'var(--surface)',
              titleColor: 'var(--text)',
              bodyColor: 'var(--text2)',
              borderColor: 'var(--border)',
              borderWidth: 1,
              titleFont: { family: "'DM Sans', sans-serif", size: 10, weight: '600' },
              bodyFont: { family: "'DM Mono', monospace", size: 10 },
              callbacks: {
                label: function(context) {
                  let label = context.dataset.label || '';
                  if (label) label += ': ';
                  label += numbersHidden ? '₹ ••••' : '₹' + context.raw.toLocaleString('en-IN');
                  return label;
                }
              }
            }
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { color: 'var(--muted)', font: { family: "'DM Sans', sans-serif", size: 9 } }
            },
            y: {
              grid: { color: 'rgba(200, 192, 182, 0.25)', lineWidth: 0.75 },
              ticks: {
                color: 'var(--muted)',
                font: { family: "'DM Mono', monospace", size: 9 },
                callback: function(value) {
                  if (numbersHidden) return '••';
                  return '₹' + value.toLocaleString('en-IN');
                }
              }
            }
          }
        }
      });
    }
  }

  // Budget bars
  const barsEl = document.getElementById('budget-bars');
  const cats = Object.keys(D.budgets);
  const activeCats = cats.filter(cat => D.budgets[cat] > 0 || curSpend[cat] > 0);
  if (!activeCats.length) {
    barsEl.innerHTML = '<div class="empty-state"><div class="empty-icon">⊞</div>Click "Edit Budgets" to set monthly limits</div>';
  } else {
    barsEl.innerHTML = activeCats.map(cat => {
      const budget = D.budgets[cat] || 0;
      const actual = curSpend[cat] || 0;
      const pct = budget ? Math.min(Math.round(actual/budget*100),100) : 100;
      const overBudget = budget > 0 && actual > budget;
      const barColor = overBudget ? 'var(--red)' : pct > 75 ? 'var(--orange)' : 'var(--green)';
      return `<div class="budget-row">
        <div class="budget-label">${esc(cat)}</div>
        <div class="budget-bars">
          <div class="budget-bar-wrap">
            ${budget > 0 ? `<div class="budget-bar-budget" style="width:100%"></div>` : ''}
            <div class="budget-bar-actual" style="width:${budget?pct:100}%;background:${barColor}"></div>
          </div>
          <div class="budget-vals">
            <span>${fmt(actual)} spent</span>
            <span>${budget > 0 ? fmt(budget)+' budget' : 'no budget set'}</span>
          </div>
        </div>
        <div class="budget-pct" style="color:${overBudget?'var(--red)':pct>75?'var(--orange)':'var(--muted)'}">${budget?pct+'%':'—'}</div>
      </div>`;
    }).join('');
  }

  // Compare
  const compareEl = document.getElementById('budget-compare');
  const allCats = new Set([...Object.keys(curSpend), ...Object.keys(prevSpend)]);
  if (!allCats.size) {
    compareEl.innerHTML = '<div class="empty-state"><div class="empty-icon">⊞</div>Not enough data yet</div>';
  } else {
    compareEl.innerHTML = [...allCats].map(cat => {
      const cur = curSpend[cat]||0;
      const prev = prevSpend[cat]||0;
      const delta = cur - prev;
      return `<div class="data-row" style="padding:7px 0">
        <div style="font-size:12px;color:var(--text2)">${esc(cat)}</div>
        <div style="text-align:right">
          <div style="font-family:'DM Mono',monospace;font-size:12px">${fmt(cur)}</div>
          <div style="font-size:10px;color:${delta>0?'var(--red)':delta<0?'var(--green)':'var(--muted)'}">
            ${delta>0?'▲ +'+fmt(delta):delta<0?'▼ '+fmt(Math.abs(delta)):'same'} vs last mo
          </div>
        </div>
      </div>`;
    }).join('');
  }

  // Build budget form
  const formEl = document.getElementById('budget-form-rows');
  formEl.innerHTML = Object.keys(D.budgets).map(cat =>
    `<div class="budget-form-row form-group" data-cat="${esc(cat)}">
      <label class="form-label">${esc(cat)}</label>
      <input class="form-input" type="number" placeholder="0" value="${D.budgets[cat]||''}">
    </div>`
  ).join('');
}

// ─────────────────────────────────────────────
// TAX
// ─────────────────────────────────────────────
function renderTax() {
  const t = currentTax();
  const totalDed = t.s80c + t.s80ccd + t.s24b + t.s80d + t.hra + 75000;
  const taxable = Math.max(0, t.gross - totalDed);
  const ot = oldTax(taxable), nt = newTax(t.gross);
  const saving = nt - ot;
  document.getElementById('tax-gross-d').textContent = fmt(t.gross);
  document.getElementById('tax-ded-d').textContent = fmt(totalDed);
  document.getElementById('tax-txbl-d').textContent = fmt(taxable);
  document.getElementById('tax-best-d').textContent = fmt(Math.min(ot,nt));
  document.getElementById('t-80c').textContent = fmt(t.s80c)+' / ₹1,50,000';
  document.getElementById('t-80ccd').textContent = fmt(t.s80ccd)+' / ₹50,000';
  document.getElementById('t-24b').textContent = fmt(t.s24b)+' / ₹2,00,000';
  document.getElementById('t-80d').textContent = fmt(t.s80d)+' / ₹25,000';
  document.getElementById('t-hra').textContent = fmt(t.hra);
  document.getElementById('bar-80c').style.width = pf(t.s80c,150000)+'%';
  document.getElementById('bar-80ccd').style.width = pf(t.s80ccd,50000)+'%';
  document.getElementById('bar-24b').style.width = pf(t.s24b,200000)+'%';
  document.getElementById('bar-80d').style.width = pf(t.s80d,25000)+'%';
  document.getElementById('old-tax').textContent = fmt(ot);
  document.getElementById('new-tax').textContent = fmt(nt);
  const vEl = document.getElementById('tax-verdict');
  const rEl = document.getElementById('old-rec');
  if (t.gross > 0) {
    if (saving > 0) {
      vEl.className = 'alert alert-success';
      vEl.innerHTML = `<span>✓</span><span>Old Regime saves ${fmt(saving)} vs New Regime. Keep maximizing deductions.</span>`;
      rEl.innerHTML = '<span class="badge badge-success">RECOMMENDED</span>';
    } else {
      vEl.className = 'alert alert-warn';
      vEl.innerHTML = `<span>⚡</span><span>New Regime is ${fmt(Math.abs(saving))} cheaper. Consider switching.</span>`;
      rEl.innerHTML = '';
    }
  }

  // Tax Comparison Chart
  const taxCanvas = document.getElementById('taxChartCanvas');
  if (taxCanvas) {
    if (taxChartInstance) {
      taxChartInstance.destroy();
    }
    
    if (t.gross === 0) {
      const ctx = taxCanvas.getContext('2d');
      ctx.clearRect(0, 0, taxCanvas.width, taxCanvas.height);
    } else {
      const ntTaxable = Math.max(0, t.gross - 75000);
      const ctx = taxCanvas.getContext('2d');
      taxChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: ['Old Regime', 'New Regime'],
          datasets: [
            {
              label: 'Deductions',
              data: [totalDed, 75000],
              backgroundColor: 'rgba(58, 125, 84, 0.75)',
              borderColor: 'rgba(58, 125, 84, 0.95)',
              borderWidth: 1,
              borderRadius: 4
            },
            {
              label: 'Taxable Income',
              data: [taxable, ntTaxable],
              backgroundColor: 'rgba(74, 111, 165, 0.75)',
              borderColor: 'rgba(74, 111, 165, 0.95)',
              borderWidth: 1,
              borderRadius: 4
            },
            {
              label: 'Est. Tax Payable',
              data: [ot, nt],
              backgroundColor: 'rgba(192, 57, 43, 0.75)',
              borderColor: 'rgba(192, 57, 43, 0.95)',
              borderWidth: 1,
              borderRadius: 4
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: {
              grid: { display: false },
              ticks: { color: 'var(--muted)', font: { family: "'DM Sans', sans-serif", size: 10 } }
            },
            y: {
              grid: { color: 'rgba(200, 192, 182, 0.25)', lineWidth: 0.75 },
              ticks: {
                color: 'var(--muted)',
                font: { family: "'DM Mono', monospace", size: 9 },
                callback: function(value) {
                  if (numbersHidden) return '••';
                  if (value >= 1e5) return '₹' + (value/1e5).toFixed(1) + 'L';
                  return '₹' + value.toLocaleString('en-IN');
                }
              }
            }
          },
          plugins: {
            legend: {
              display: true,
              position: 'top',
              labels: {
                boxWidth: 10,
                boxHeight: 10,
                font: { family: "'DM Sans', sans-serif", size: 9 },
                color: 'var(--muted)'
              }
            },
            tooltip: {
              backgroundColor: 'var(--surface)',
              titleColor: 'var(--text)',
              bodyColor: 'var(--text2)',
              borderColor: 'var(--border)',
              borderWidth: 1,
              titleFont: { family: "'DM Sans', sans-serif", size: 10, weight: '600' },
              bodyFont: { family: "'DM Mono', monospace", size: 10 },
              callbacks: {
                label: function(context) {
                  let label = context.dataset.label || '';
                  if (label) label += ': ';
                  label += numbersHidden ? '₹ ••••' : '₹' + context.raw.toLocaleString('en-IN');
                  return label;
                }
              }
            }
          }
        }
      });
    }
  }

  // Capital Gains from Investments
  const equityTypes = new Set(['Mutual Fund', 'Stock', 'ESOP', 'RSU']);
  const now = new Date();
  let ltcgGain = 0, stcgGain = 0, debtGain = 0, noDatesCount = 0;
  filterByMember(D.investments).forEach(inv => {
    const pnl = (inv.value || 0) - (inv.cost || 0);
    if (pnl <= 0) return;
    const dateStr = isEsopType(inv.type) ? inv.grantDate : inv.purchaseDate;
    if (!dateStr) { noDatesCount++; return; }
    const purchDate = new Date(dateStr);
    const monthsHeld = (now.getFullYear() - purchDate.getFullYear()) * 12 + (now.getMonth() - purchDate.getMonth());
    if (equityTypes.has(inv.type)) {
      if (monthsHeld > 12) ltcgGain += pnl;
      else stcgGain += pnl;
    } else {
      debtGain += pnl;
    }
  });
  const ltcgExempt = 125000;
  const ltcgTax  = Math.max(0, (ltcgGain - ltcgExempt) * 0.125);
  const stcgTax  = stcgGain * 0.20;
  const cgTotal  = ltcgTax + stcgTax;
  const cgEl = document.getElementById('tax-capgains-body');
  if (cgEl) {
    if (ltcgGain === 0 && stcgGain === 0 && debtGain === 0) {
      cgEl.innerHTML = `<div class="alert alert-info" style="margin:0"><span>ℹ</span><span>Add purchase dates to investments to see LTCG/STCG estimates.${noDatesCount > 0 ? ` ${noDatesCount} investment(s) with gains have no purchase date.` : ''}</span></div>`;
    } else {
      cgEl.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:12px">
          <div>
            <div class="card-label">LTCG — Equity (&gt;12 mo)</div>
            <div class="card-value gold" style="font-size:17px">${fmt(ltcgGain)}</div>
            <div style="font-size:10px;color:var(--muted)">Exempt ₹1.25L → Tax: ${fmt(Math.round(ltcgTax))}</div>
          </div>
          <div>
            <div class="card-label">STCG — Equity (≤12 mo)</div>
            <div class="card-value orange" style="font-size:17px">${fmt(stcgGain)}</div>
            <div style="font-size:10px;color:var(--muted)">Tax @ 20%: ${fmt(Math.round(stcgTax))}</div>
          </div>
          <div>
            <div class="card-label">Est. Capital Gains Tax</div>
            <div class="card-value negative" style="font-size:17px">${fmt(Math.round(cgTotal))}</div>
            <div style="font-size:10px;color:var(--muted)">LTCG 12.5% + STCG 20%</div>
          </div>
        </div>
        ${debtGain > 0 ? `<div class="alert alert-warn" style="margin-bottom:8px"><span>⚡</span><span>Non-equity gains of ${fmt(debtGain)} (Debt / FD / Other) are taxed at your income slab rate — not included above.</span></div>` : ''}
        ${noDatesCount > 0 ? `<div class="alert alert-warn" style="margin-bottom:8px"><span>⚡</span><span>${noDatesCount} investment(s) with unrealised gains have no purchase date — add dates for full accuracy.</span></div>` : ''}
        <div class="alert alert-info" style="margin:0"><span>ℹ</span><span>Equity LTCG (held &gt;12 months): 12.5% above ₹1.25L exemption. Equity STCG (≤12 months): 20%. Per Finance Act 2024.</span></div>`;
    }
  }
}

// ─────────────────────────────────────────────
// TRANSACTIONS
// ─────────────────────────────────────────────
function renderTxns() {
  populateTxnAccountFilter();
  const search  = (document.getElementById('txn-search')||{}).value||'';
  const catF    = (document.getElementById('txn-filter-cat')||{}).value||'';
  const typeF   = (document.getElementById('txn-filter-type')||{}).value||'';
  const memF    = (document.getElementById('txn-filter-member')||{}).value||'';
  const dateFrom = (document.getElementById('txn-date-from')||{}).value||'';
  const dateTo   = (document.getElementById('txn-date-to')||{}).value||'';
  const accF    = (document.getElementById('txn-filter-account')||{}).value||'';
  
  let list = filterByMember(D.transactions);
  if (search)   list = list.filter(t => (t.desc||'').toLowerCase().includes(search.toLowerCase()));
  if (catF)     list = list.filter(t => t.cat === catF);
  if (typeF)    list = list.filter(t => t.type === typeF);
  if (memF)     list = list.filter(t => t.member === memF);
  if (dateFrom) list = list.filter(t => t.date >= dateFrom);
  if (dateTo)   list = list.filter(t => t.date <= dateTo);
  if (accF) {
    if (accF === 'unassigned') {
      list = list.filter(t => !t.account);
    } else {
      list = list.filter(t => t.account && (t.account.toString() === accF.toString()));
    }
  }
  
  const el = document.getElementById('txn-list');
  const countEl = document.getElementById('txn-count');
  const delBtn = document.getElementById('del-all-txns-btn');
  if (!list.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">&#8801;</div>No transactions match your filters</div>';
    if (countEl) countEl.textContent = '';
    if (delBtn) delBtn.style.display = 'none';
    return;
  }
  if (delBtn) delBtn.style.display = '';
  const catColors = {
    'Food & Dining':'#b5813a','Travel':'#4a7c6f','Shopping':'#7b5ea7','Utilities':'#3a7d54',
    'Entertainment':'#c0392b','Healthcare':'#4a6fa5','Education':'#c0692b','Insurance':'#7ab8a0',
    'Investment':'#3a7d54','Salary':'#3a7d54','EMI':'#7b5ea7','Other':'#8a8279'
  };
  const shown = list.slice(0,100);
  el.innerHTML = shown.map(t =>
    `<div class="txn-row">
      <div class="txn-left">
        <div class="txn-dot" style="background:${catColors[t.cat]||'#8a8279'}"></div>
        <div>
          <div class="txn-name">${esc(t.desc)} ${memberTag(t.member)}</div>
          <div class="txn-cat">${esc(t.cat)} &middot; ${t.date}${getTransactionAccountBadge(t)}</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:10px">
        <div class="txn-amount ${esc(t.type)}">${t.type==='debit'?'&minus;':'+'}${fmt(t.amount)}</div>
        <button onclick="deleteTxn(${t.id})" title="Delete" style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:13px;padding:2px 4px;line-height:1" onmouseover="this.style.color='var(--red)'" onmouseout="this.style.color='var(--muted)'">&#x2715;</button>
      </div>
    </div>`
  ).join('');
  if (countEl) countEl.textContent = `Showing ${shown.length} of ${list.length} transactions`;
}

function deleteTxn(id) {
  D.transactions = D.transactions.filter(t => t.id !== id);
  save(); renderAll();
}

function deleteAllTxns() {
  const count = D.transactions.length;
  if (!count) return;
  if (!window.confirm(`Delete all ${count} transactions? This cannot be undone.`)) return;
  D.transactions = [];
  save(); renderAll();
}

function resetTxnFilters() {
  const ids = ['txn-search','txn-filter-cat','txn-filter-type','txn-filter-member','txn-date-from','txn-date-to','txn-filter-account'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  renderTxns();
}

function renderWidgets() {
  if (!document.getElementById('w-salary')) return;
  const txns = filterByMember(D.transactions);
  const now = new Date();
  const cm = now.getMonth(), cy = now.getFullYear();
  const pm = cm===0?11:cm-1, py = cm===0?cy-1:cy;
  const txnMonth = (t,mo,yr) => { const d=new Date(t.date); return d.getMonth()===mo&&d.getFullYear()===yr; };
  const debits  = (mo,yr) => txns.filter(t=>t.type==='debit'&&txnMonth(t,mo,yr));
  const credits = (mo,yr) => txns.filter(t=>t.type==='credit'&&txnMonth(t,mo,yr));
  const sum = arr => arr.reduce((s,t)=>s+t.amount,0);

  // 1. SALARY CREDIT TRACKER
  const salTxns = txns.filter(t=>t.type==='credit' && (t.cat === 'Salary' || /salary|salaries|neft.*cr|salary.*credit|inward.*salary/i.test(t.desc||'')));
  const lastSal = [...salTxns].sort((a,b)=>new Date(b.date)-new Date(a.date))[0];
  const salAmt = lastSal?lastSal.amount:0;
  const prevSal = sum(salTxns.filter(t=>txnMonth(t,pm,py)));
  const salD = salAmt-prevSal;
  document.getElementById('w-salary').innerHTML = `
    <div class="widget-label">&#x1F4B0; Salary Credit Tracker</div>
    <div class="widget-value" style="color:var(--green)">${fmt(salAmt)}</div>
    <div class="widget-sub">${lastSal?'Last credited '+lastSal.date:'No salary detected yet'}</div>
    ${salD!==0?`<div class="widget-chip ${salD>0?'wchip-up':'wchip-down'}">${salD>0?'&#8593;':'&#8595;'} ${fmt(Math.abs(salD))} vs prev</div>`:''}`;

  // 2. RECURRING SPEND TRACKER (auto-detected from history)
  const recurDetected = detectRecurringFromTxns(true);
  const recurTotal = recurDetected.reduce((s, r) => s + r.amount, 0);
  document.getElementById('w-recurring').innerHTML = `
    <div class="widget-label">&#x1F504; Recurring Spends</div>
    <div class="widget-value" style="color:var(--orange)">${fmt(recurTotal)}</div>
    <div class="widget-sub">${recurDetected.length} recurring detected</div>
    ${recurDetected.slice(0,2).map(r=>`<div style="font-size:10px;color:var(--muted);margin-top:3px">&rarr; ${esc(r.name.slice(0,28))} &middot; ${fmt(r.amount)}</div>`).join('')}`;

  // 3. CASH FLOW FORECAST
  const avg3Debit = [0,1,2].reduce((s,i)=>{
    const mo=(cm-i+12)%12, yr=cy-(cm-i<0?1:0);
    return s+sum(debits(mo,yr));
  },0)/3;
  const curIncome = sum(credits(cm,cy));
  const surplus = curIncome-avg3Debit;
  document.getElementById('w-cashflow').innerHTML = `
    <div class="widget-label">&#x1F4C8; Cash Flow Forecast</div>
    <div class="widget-value" style="color:${surplus>=0?'var(--accent2)':'var(--red)'}">${surplus>=0?'+':''}${fmt(surplus)}</div>
    <div class="widget-sub">Est. month-end surplus<br>Avg spend: ${fmt(avg3Debit)} &middot; Income: ${fmt(curIncome)}</div>`;

  // 4. NET WORTH VELOCITY
  const hist = D.nwHistory;
  let vel=0, velTxt='Not enough data';
  if (hist.length>=2) {
    vel = hist[hist.length-1].v - hist[hist.length-2].v;
    const rate3 = hist.length>=3 ? (hist[hist.length-1].v-hist[hist.length-3].v)/2 : vel;
    velTxt = (rate3>=0?'+':'')+fmt(Math.abs(rate3))+'/mo avg (3mo)';
  }
  document.getElementById('w-nw-velocity').innerHTML = `
    <div class="widget-label">&#x26A1; NW Velocity</div>
    <div class="widget-value" style="color:${vel>=0?'var(--accent)':'var(--red)'}">${vel>=0?'+':''}${fmt(vel)}</div>
    <div class="widget-sub">${velTxt}</div>
    <div class="widget-chip ${vel>=0?'wchip-up':'wchip-down'}">${vel>=0?'&#8593; Growing':'&#8595; Shrinking'}</div>`;

  // 5. TAX HARVEST INTELLIGENCE
  const investGains = filterByMember(D.investments).reduce((s,i)=>s+(i.value-i.cost),0);
  const harvestRoom = Math.max(0,100000-Math.max(0,investGains));
  const npsDataW = getNpsData();
  const npsRoom = Math.max(0,50000-(npsDataW.fyContrib||0));
  const s80cLeft = Math.max(0,150000-(currentTax().s80c||0));
  document.getElementById('w-tax-harvest').innerHTML = `
    <div class="widget-label">&#x1F9E0; Tax-Harvest Intel</div>
    <div class="widget-value" style="color:var(--accent3)">${fmt(harvestRoom)}</div>
    <div class="widget-sub">LTCG tax-free headroom</div>
    ${npsRoom>0?`<div class="widget-chip wchip-warn">NPS: ${fmt(npsRoom)} left</div>`:''}
    ${s80cLeft>0?`<div class="widget-chip wchip-neutral" style="margin-left:4px">80C: ${fmt(s80cLeft)} left</div>`:''}`;

  // 6. CREDIT CARD OPTIMISATION SCORE
  const memberCards = filterByMember(D.cards);
  const totLim = memberCards.reduce((s,c)=>s+c.limit,0);
  const totOut = memberCards.reduce((s,c)=>s+c.outstanding,0);
  const utilPct = totLim?Math.round(totOut/totLim*100):0;
  const score = Math.max(0,Math.min(100,100-utilPct*1.5));
  const scColor = score>=75?'var(--green)':score>=50?'var(--accent)':'var(--red)';
  document.getElementById('w-cc-score').innerHTML = `
    <div class="widget-label">&#x1F4B3; CC Optimisation Score</div>
    <div class="widget-value" style="color:${scColor}">${Math.round(score)}<span style="font-size:12px;color:var(--muted)">/100</span></div>
    <div class="widget-bar-row"><div class="widget-bar-bg"><div class="widget-bar-fill" style="width:${score}%;background:${scColor}"></div></div></div>
    <div class="widget-sub">Utilization ${utilPct}% &middot; ${fmt(Math.max(0,totLim-totOut))} available</div>`;

  // 7. DEBT PAYDOWN VISUALISER
  const memberLoans = filterByMember(D.loans);
  const totDebt = memberLoans.reduce((s,l)=>s+l.outstanding,0);
  const totPrinc = memberLoans.reduce((s,l)=>s+l.principal,0);
  const paidPct = totPrinc?Math.round((1-totDebt/totPrinc)*100):0;
  const totEMI  = memberLoans.reduce((s,l)=>s+l.emi,0);
  document.getElementById('w-debt-paydown').innerHTML = `
    <div class="widget-label">&#x1F3AF; Debt Paydown</div>
    <div class="widget-value" style="color:var(--red)">${fmt(totDebt)}</div>
    <div class="widget-bar-row"><div class="widget-bar-bg"><div class="widget-bar-fill" style="width:${paidPct}%;background:var(--green)"></div></div><span style="font-size:10px;color:var(--muted);margin-left:4px">${paidPct}% paid</span></div>
    <div class="widget-sub">EMI: ${fmt(totEMI)}/mo &middot; ${memberLoans.length} loan(s)</div>`;

  // 8. LIFESTYLE INFLATION DETECTOR
  const skip = ['Salary','Investment','EMI'];
  const curSp  = sum(debits(cm,cy).filter(t=>!skip.includes(t.cat)));
  const prevSp = sum(debits(pm,py).filter(t=>!skip.includes(t.cat)));
  const infl = prevSp?((curSp-prevSp)/prevSp*100).toFixed(1):0;
  const inflC = infl>10?'var(--red)':infl>0?'var(--orange)':'var(--green)';
  document.getElementById('w-lifestyle').innerHTML = `
    <div class="widget-label">&#x1F4C8; Lifestyle Inflation</div>
    <div class="widget-value" style="color:${inflC}">${infl>0?'+':''}${infl}%</div>
    <div class="widget-sub">vs last month &middot; This mo: ${fmt(curSp)}<br>Last mo: ${fmt(prevSp)}</div>
    <div class="widget-chip ${infl>10?'wchip-down':infl>0?'wchip-warn':'wchip-up'}">${infl>10?'&#x26A0;&#xFE0F; Inflating':infl>0?'&#x26A1; Mild rise':'&#x2713; Stable'}</div>`;
}

function openSalaryHistory() {
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const now = new Date();
  const salTxns = filterByMember(D.transactions).filter(t =>
    t.type === 'credit' && (t.cat === 'Salary' || /salary|salaries|neft.*cr|salary.*credit|inward.*salary/i.test(t.desc || ''))
  );

  // Build last 3 months in reverse order
  const rows = [];
  for (let i = 0; i < 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const mo = d.getMonth(), yr = d.getFullYear();
    const monthTxns = salTxns
      .filter(t => { const td = new Date(t.date); return td.getMonth() === mo && td.getFullYear() === yr; })
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    const total = monthTxns.reduce((s, t) => s + t.amount, 0);
    rows.push({ label: `${MONTHS[mo]} ${yr}`, total, txns: monthTxns });
  }

  const prevTotal = rows[1].total;
  const html = rows.map((r, i) => {
    const delta = i === 0 && prevTotal ? r.total - prevTotal : null;
    const deltaHtml = delta !== null && delta !== 0
      ? `<span style="font-size:10px;color:${delta>0?'var(--green)':'var(--red)'};margin-left:6px">${delta>0?'▲':'▼'} ${fmt(Math.abs(delta))}</span>`
      : '';
    const txnRows = r.txns.length
      ? r.txns.map(t => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0 5px 12px;border-left:2px solid var(--border)">
            <div>
              <div style="font-size:11px;color:var(--text2)">${esc(t.desc.slice(0, 40))}${t.desc.length > 40 ? '…' : ''}</div>
              <div style="font-size:10px;color:var(--muted)">${t.date}</div>
            </div>
            <div style="font-family:'DM Mono',monospace;font-size:12px;color:var(--green);white-space:nowrap;margin-left:12px">${fmt(t.amount)}</div>
          </div>`).join('')
      : `<div style="font-size:11px;color:var(--muted);padding:6px 0 6px 12px">No salary credit found</div>`;

    return `
      <div style="margin-bottom:16px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <div style="font-size:12px;font-weight:600;color:var(--text2);text-transform:uppercase;letter-spacing:.06em">${r.label}</div>
          <div style="font-family:'DM Mono',monospace;font-size:14px;font-weight:500;color:${r.total?'var(--green)':'var(--muted)'}">${r.total ? fmt(r.total) : '—'}${deltaHtml}</div>
        </div>
        ${txnRows}
      </div>`;
  }).join('<div style="border-top:1px solid var(--border);margin:4px 0 16px"></div>');

  document.getElementById('salary-history-content').innerHTML = html || '<div class="empty-state">No salary transactions found.</div>';
  openModal('salaryHistoryModal');
}

function openRecurringDetail() {
  const recurring = detectRecurringFromTxns(true);
  const totalMonthly = recurring.reduce((s, r) => s + r.amount, 0);

  if (!recurring.length) {
    document.getElementById('recurring-detail-content').innerHTML =
      '<div class="empty-state">No recurring transactions detected yet.<br><small style="color:var(--muted)">Import at least 2 months of statements to enable auto-detection.</small></div>';
    openModal('recurringDetailModal');
    return;
  }

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const rows = recurring.map(r => {
    const nextDate = (() => {
      const now = new Date();
      const d = new Date(now.getFullYear(), now.getMonth(), r.day);
      if (d < now) d.setMonth(d.getMonth() + 1);
      return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
    })();
    return `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid var(--border)">
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;font-weight:500;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(r.name)}</div>
          <div style="font-size:10px;color:var(--muted);margin-top:2px">
            ~${r.day}th every month &middot; seen ${r.months} months &middot; ${esc(r.cat||'Other')}
          </div>
        </div>
        <div style="text-align:right;margin-left:12px;flex-shrink:0">
          <div style="font-family:'DM Mono',monospace;font-size:13px;color:var(--orange)">${fmt(r.amount)}</div>
          <div style="font-size:10px;color:var(--muted)">next ~${nextDate}</div>
        </div>
      </div>`;
  }).join('');

  const summary = `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:var(--surface2);border-radius:8px;margin-bottom:14px">
      <div style="font-size:11px;color:var(--text2)">${recurring.length} recurring detected</div>
      <div style="font-family:'DM Mono',monospace;font-size:14px;font-weight:600;color:var(--orange)">${fmt(totalMonthly)}<span style="font-size:10px;font-weight:400;color:var(--muted)">/mo</span></div>
    </div>`;

  document.getElementById('recurring-detail-content').innerHTML = summary + rows;
  openModal('recurringDetailModal');
}

// ─────────────────────────────────────────────
// CSV IMPORT
// ─────────────────────────────────────────────
let selectedBank = 'icici-salary';
let parsedRows = [];
let pendingPdfFile = null;

async function ensurePdfJS() {
  if (typeof window !== 'undefined' && window.pdfjsLib) return window.pdfjsLib;
  if (typeof window !== 'undefined' && window['pdfjs-dist/build/pdf']) {
    window.pdfjsLib = window['pdfjs-dist/build/pdf'];
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
    return window.pdfjsLib;
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js';
    script.integrity = 'sha384-uLiAv4VcjM5H2Jsqzl8EajEaxPugj1CIzQaCjQ8c5//vC+elhxO5pZfXGxoLQi1W';
    script.crossOrigin = 'anonymous';
    script.onload = () => {
      window.pdfjsLib = window['pdfjs-dist/build/pdf'] || window.pdfjsLib;
      if (window.pdfjsLib) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
        resolve(window.pdfjsLib);
      } else {
        reject(new Error("PDF.js loaded but is undefined on window"));
      }
    };
    script.onerror = () => reject(new Error("Failed to load PDF.js from CDN. Verify internet connectivity."));
    document.head.appendChild(script);
  });
}

function reconstructTextWithCoordinates(textContent) {
  const items = textContent.items;
  if (!items || items.length === 0) return '';
  
  const positionedItems = items.map(item => {
    const matrix = item.transform || [1, 0, 0, 1, 0, 0];
    return {
      text: item.str,
      x: matrix[4],
      y: matrix[5],
      width: item.width || 0,
      height: item.height || 0
    };
  });
  
  positionedItems.sort((a, b) => b.y - a.y);
  
  const lines = [];
  let currentLineY = null;
  let currentLineItems = [];
  const lineTolerance = 4; // Tolerance for grouping items physically on the same row
  
  for (const item of positionedItems) {
    if (currentLineY === null) {
      currentLineY = item.y;
      currentLineItems.push(item);
    } else if (Math.abs(item.y - currentLineY) <= lineTolerance) {
      currentLineItems.push(item);
    } else {
      currentLineItems.sort((a, b) => a.x - b.x);
      lines.push(currentLineItems);
      currentLineY = item.y;
      currentLineItems = [item];
    }
  }
  if (currentLineItems.length > 0) {
    currentLineItems.sort((a, b) => a.x - b.x);
    lines.push(currentLineItems);
  }
  
  let reconstructed = '';
  for (const line of lines) {
    let lineStr = '';
    let lastX = null;
    
    for (const item of line) {
      if (lastX !== null) {
        const gap = item.x - lastX;
        // Inject physical tab delimiters when column separations exceed standard margins
        if (gap > 12) {
          lineStr += '\t';
        } else {
          lineStr += ' ';
        }
      }
      lineStr += item.text;
      lastX = item.x + item.width;
    }
    reconstructed += lineStr + '\n';
  }
  
  return reconstructed;
}

let detectedCardData = null;

function extractCardMetadata(text, bankType) {
  const cleanText = text.replace(/\s+/g, ' ');
  
  let outstanding = 0;
  let limit = 0;
  let dueDate = '';
  let minDue = 0;
  let name = '';
  
  if (bankType === 'icici-cc') {
    name = "ICICI Credit Card";
  } else if (bankType === 'amex') {
    // Extract card product name (e.g. "American Express Platinum Reserve Credit Card")
    const cnMatch = text.match(/American Express[®\s\w™℠]*?Credit Card/i);
    name = cnMatch ? cnMatch[0].replace(/[®℠™]/g,'').replace(/\s+/g,' ').trim() : 'American Express';

    // OUTSTANDING: balance formula row "open [–/-] credits + debits = CLOSING [mindue]"
    // [–\-−] covers en-dash (–), ASCII hyphen (-), and Unicode minus sign (−)
    const balM = cleanText.match(/([\d,]+\.\d{2})\s*[–\-−]\s*([\d,]+\.\d{2})\s*\+\s*([\d,]+\.\d{2})\s*=\s*([\d,]+\.\d{2})(?:\s+([\d,]+\.\d{2}))?/);
    if (balM) {
      outstanding = parseFloat(balM[4].replace(/,/g,''));
      if (balM[5]) minDue = parseFloat(balM[5].replace(/,/g,''));
    }

    // MIN DUE + DUE DATE: "receiving your payment of Rs. 20,896.12 by 15/06/2026"
    const payM = cleanText.match(/payment\s+of\s+Rs\.?\s*([\d,]+\.\d{2})\s+by\s+(\d{2}\/\d{2}\/\d{4})/i);
    if (payM) {
      if (!minDue) minDue = parseFloat(payM[1].replace(/,/g,''));
      dueDate = parseDate(payM[2], 'DD/MM/YYYY') || '';
    }

    // CREDIT LIMIT: statement has a two-row table — header row "Credit Limit Rs  Available Credit Limit Rs"
    // then value row "At May 23, 2026  480,000.00  318,809.32". cleanText merges both rows into one string
    // so the number is NOT adjacent to the label; skip over all non-digit text to reach the first value.
    const limM = cleanText.match(/Credit Limit Rs\s+Available Credit Limit Rs[^0-9]*([\d,]+(?:\.\d{2})?)/i)
      || cleanText.match(/Credit Limit[^0-9]{1,80}?([\d]{3,}(?:,\d{3})*(?:\.\d{2})?)/i);
    if (limM) limit = parseFloat(limM[1].replace(/,/g,''));

    // Fallback: closing balance from "= amount mindue" when formula match fails
    if (outstanding === 0) {
      const eqM = cleanText.match(/=\s*([\d,]+\.\d{2})\s+([\d,]+\.\d{2})/);
      if (eqM) outstanding = parseFloat(eqM[1].replace(/,/g,''));
    }
    if (limit === 0) limit = 150000;
    if (minDue === 0 && outstanding > 0) minDue = Math.round(outstanding * 0.05);

    // Return early — bypass generic patterns which would corrupt correct Amex values.
    // The generic duePattern matches the statement date (23/05/2026) before the due date (15/06/2026),
    // and generic outPatterns match "payment due" in "Min Payment Due Rs" giving the opening balance.
    return { name, outstanding, limit, dueDate, minDue };
  } else if (bankType === 'sc') {
    name = "Standard Chartered Card";
  } else {
    name = "Credit Card";
  }

  // Generic fallback patterns (run for non-Amex or when Amex-specific didn't find values)
  const outPatterns = [
    /(?:total\s+amount\s+due|total\s+due|amount\s+due|outstanding\s+balance|total\s+outstanding)\D*?([\d,]+\.\d{2})/i,
    /(?:payment\s+due|due\s+amount)\D*?([\d,]+\.\d{2})/i
  ];
  for (const pattern of outPatterns) {
    const match = cleanText.match(pattern);
    if (match) {
      outstanding = parseFloat(match[1].replace(/,/g, ''));
      break;
    }
  }
  
  const limitPatterns = [
    /(?:credit\s+limit|card\s+limit|credit\s+limit\s+rs)\D*?([\d,]+\.\d{2})/i,
    /(?:credit\s+limit|card\s+limit|limit)\D*?([\d,]+)\b/i
  ];
  for (const pattern of limitPatterns) {
    const match = cleanText.match(pattern);
    if (match) {
      limit = parseFloat(match[1].replace(/,/g, ''));
      break;
    }
  }
  
  const duePatterns = [
    /(?:payment\s+due\s+date|due\s+date|pay\s+by)\s*[:=-]?\s*([a-zA-Z0-9\s,\/-]{8,15})/i,
    /\b\d{2}[-\/\.]\d{2}[-\/\.]\d{4}\b/
  ];
  for (const pattern of duePatterns) {
    const match = cleanText.match(pattern);
    if (match) {
      const dt = parseDate(match[1] || match[0], 'DD/MM/YYYY') || parseDate(match[1] || match[0], 'DD MMM YYYY') || parseDate(match[1] || match[0], 'YYYY-MM-DD');
      if (dt) {
        dueDate = dt;
        break;
      }
    }
  }
  
  const minPatterns = [
    /(?:minimum\s+amount\s+due|minimum\s+due|min\s+due)\D*?([\d,]+\.\d{2})/i,
    /(?:minimum\s+due|min\s+due)\D*?([\d,]+)\b/i
  ];
  for (const pattern of minPatterns) {
    const match = cleanText.match(pattern);
    if (match) {
      minDue = parseFloat(match[1].replace(/,/g, ''));
      break;
    }
  }
  
  if (outstanding === 0) {
    const numbers = cleanText.replace(/,/g, '').match(/\b\d{4,6}\.\d{2}\b/g);
    if (numbers) {
      outstanding = Math.max(...numbers.map(Number));
    }
  }
  if (limit === 0) limit = 150000;
  if (minDue === 0 && outstanding > 0) minDue = Math.round(outstanding * 0.05);
  
  return { name, outstanding, limit, dueDate, minDue };
}

function extractNpsBalances(text) {
  const cleanText = text.replace(/\s+/g, ' ');
  
  let pran = '';
  const pranPatterns = [
    /pran\s*[:=-]?\s*(\d{12})\b/i,
    /permanent\s*retirement\s*account\s*number\s*[:=-]?\s*(\d{12})\b/i,
    /pran\D*?(\d{12})\b/i,
    /\b(\d{12})\b/
  ];
  for (const pattern of pranPatterns) {
    const match = cleanText.match(pattern);
    if (match) { pran = match[1]; break; }
  }

  let tier1 = 0;
  const t1Patterns = [
    /tier\s*i\s*(?:account|holding|investment|valuation|portfolio)?\s*(?:value|balance|worth)\D*?([\d,]+\.\d{2})/i,
    /tier\s*i\s*.*?(?:value|balance|holding)\D*?([\d,]+\.\d{2})/i,
    /tier\s*1\s*.*?(?:value|balance|holding)\D*?([\d,]+\.\d{2})/i,
    /tier\s*i\D*?([\d,]+\.\d{2})/i,
    /tier\s*1\D*?([\d,]+\.\d{2})/i
  ];
  for (const pattern of t1Patterns) {
    const match = cleanText.match(pattern);
    if (match) {
      const val = parseFloat(match[1].replace(/,/g, ''));
      if (val > 0) { tier1 = val; break; }
    }
  }

  let tier2 = 0;
  const t2Patterns = [
    /tier\s*ii\s*(?:account|holding|investment|valuation|portfolio)?\s*(?:value|balance|worth)\D*?([\d,]+\.\d{2})/i,
    /tier\s*ii\s*.*?(?:value|balance|holding)\D*?([\d,]+\.\d{2})/i,
    /tier\s*2\s*.*?(?:value|balance|holding)\D*?([\d,]+\.\d{2})/i,
    /tier\s*ii\D*?([\d,]+\.\d{2})/i,
    /tier\s*2\D*?([\d,]+\.\d{2})/i
  ];
  for (const pattern of t2Patterns) {
    const match = cleanText.match(pattern);
    if (match) {
      const val = parseFloat(match[1].replace(/,/g, ''));
      if (val > 0) { tier2 = val; break; }
    }
  }

  return { pran, tier1, tier2 };
}

function parseBankStatementPdf(text, bankType) {
  const lines = text.split('\n');
  const txns = [];

  // ── AMEX PDF: dates use "May 03" / "May 9" (MMM D, no year) ──────────────────
  if (bankType === 'amex') {
    const amexDateReg = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})\b/i;
    const MON = {jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11};
    // Infer year from any 4-digit year in the statement text
    const yrM = text.match(/\b(20\d{2})\b/);
    const yr = yrM ? +yrM[1] : new Date().getFullYear();

    // Lines to skip: section headers, summaries, footnotes, metadata
    const skipReg = /^(total\s+of|new\s+domestic|summary\b|card\s+number|page\s+\d|\d+\s+of\s+\d+|prepared\s+for|statement\s+(period|date)|credit\s+summary|current\s+rates|details\b|foreign\s+spending|amount\s+rs|installment\s+plan\s+(summary|transactions)|other\s+account\s+transactions|payment\s+(information|methods|faq|advice)|national\s+electronic|payee|ifsc|drop\s+box|upi\b|permanent\s+account|gstin\b|category:|grievances|nodal\s+officer|banking\s+ombudsman|making\s+only|note:|sample\s+interest|insurance\s+cover|coverages\b|disclaimer\b|mitc\b|date\s+of\s+activation|nac\s+terms|contact\s+details|email|icici\s+lombard|please\b|opening\s+balance|cardmember\s+offer|we\s+have\s+made|missing\s+payment|procedure\s+to\s+be|annual\s+fee|interest\s+free|for\s+further|telephone|address:|head\s+of\s+customer|incorporated\s+with|minimum\s+payment\s+due$|minimum\s+payment\s+every|statement\s+includes|making\s+only|due\s+date|send\s+payment)/i;

    let i = 0;
    while (i < lines.length) {
      const raw = lines[i].trim();
      i++;
      if (!raw || skipReg.test(raw)) continue;

      const dm = raw.match(amexDateReg);
      if (!dm) continue;

      const mon = MON[dm[1].toLowerCase()];
      const day = +dm[2];
      const date = `${yr}-${String(mon+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;

      // Everything after the date token on this line
      const rest = raw.substring(dm[0].length).trim();

      // CR already on this line?
      let isCR = /\bCR\s*$/i.test(rest);

      // Peek at the following lines for the CR marker
      while (!isCR && i < lines.length) {
        const peek = lines[i].trim();
        if (/^CR\s*$/i.test(peek)) { isCR = true; i++; break; }
        if (/^Card Number/i.test(peek)) {
          if (/\bCR\b/i.test(peek)) isCR = true;
          i++; // consume "Card Number…" line then keep peeking
          continue;
        }
        break; // unrelated line → stop peeking
      }

      // Amount: last decimal number on the rest-of-line
      const amtMatches = [...rest.matchAll(/[\d,]+\.\d{2}/g)];
      if (!amtMatches.length) continue;
      const amount = parseFloat(amtMatches[amtMatches.length-1][0].replace(/,/g,''));

      // Description: text before the first number
      const firstNumIdx = rest.search(/[\d,]+\.\d{2}/);
      let desc = (firstNumIdx > 0 ? rest.substring(0, firstNumIdx) : rest)
        .replace(/\bCR\s*$/i,'').replace(/\t/g,' ').trim();
      desc = desc.replace(/^[\s\-,|\/\t]+/,'').replace(/[\s\-,|\/\t]+$/,'');
      if (!desc || desc.length < 2) desc = 'Transaction';

      const type = (isCR || /payment|refund|reversal|cashback/i.test(desc)) ? 'credit' : 'debit';

      if (amount > 0) {
        txns.push({ date, desc, amount, type, cat: autoCategory(desc, amount) });
      }
    }
    return txns;
  }

  // ── Generic parser (ICICI Savings, ICICI CC, SC) ──────────────────────────────
  // Matches DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY AND DD MMM YYYY (e.g. "05 Jun 2026")
  const dateReg = /\b(\d{2}[\/\-\.]\d{2}[\/\-\.]\d{4}|\d{2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4})\b/i;
  // Finds all monetary amounts: optional ₹, digits with commas, mandatory 2-decimal
  const amtReg = /(?:₹\s*)?([\d,]+\.\d{2})/g;

  for (let line of lines) {
    line = line.trim();
    if (!line) continue;

    const dateMatch = line.match(dateReg);
    if (!dateMatch) continue;

    const dateStr = parseDate(dateMatch[1], 'DD/MM/YYYY') ||
                    parseDate(dateMatch[1], 'YYYY-MM-DD') ||
                    parseDate(dateMatch[1], 'DD MMM YYYY') ||
                    parseDate(dateMatch[1], 'MM/DD/YYYY');
    if (!dateStr) continue;

    const allAmts = [...line.matchAll(amtReg)].map(m => ({
      raw: m[0], val: parseFloat(m[1].replace(/,/g, '')), idx: m.index
    }));
    if (allAmts.length === 0) continue;

    let amount = 0, type = 'debit', desc = '';

    if (bankType === 'icici-salary' && allAmts.length >= 3) {
      // Savings statement: [withdrawal, deposit, balance] — use whichever of first two is non-zero
      const withdrawal = allAmts[allAmts.length - 3]?.val || 0;
      const deposit = allAmts[allAmts.length - 2]?.val || 0;
      if (deposit > 0) { amount = deposit; type = 'credit'; }
      else { amount = withdrawal; type = 'debit'; }
      // Description: from second date (value date) to first amount
      const dates2 = [...line.matchAll(/\b(\d{2}[\/\-\.]\d{2}[\/\-\.]\d{4})/g)];
      const afterDate = dates2.length >= 2
        ? line.indexOf(dates2[1][0]) + dates2[1][0].length
        : dateMatch.index + dateMatch[0].length;
      desc = line.substring(afterDate, allAmts[0].idx).trim();
    } else {
      // Universal credit card / savings fallback:
      // Prefer amount with explicit Dr/Cr suffix; otherwise use first amount on line
      const drCrMatch = line.match(/([\d,]+\.\d{2})\s*(Dr\.?|Cr\.?)\b/i);
      if (drCrMatch) {
        amount = parseFloat(drCrMatch[1].replace(/,/g, ''));
        type = /cr/i.test(drCrMatch[2]) ? 'credit' : 'debit';
      } else {
        // Negative sign = payment/refund (Amex style); otherwise first amount = spend
        const signedMatch = line.match(/(-)([\d,]+\.\d{2})/);
        if (signedMatch) {
          amount = parseFloat(signedMatch[2].replace(/,/g, ''));
          type = 'credit';
        } else {
          amount = allAmts[0].val;
          type = /payment|refund|cashback|reversal|\bcr\b/i.test(line) ? 'credit' : 'debit';
        }
      }
      // Description: text between end of date and the first numeric amount
      const dateEndIdx = dateMatch.index + dateMatch[0].length;
      const firstAmtIdx = allAmts[0].idx;
      desc = dateEndIdx < firstAmtIdx
        ? line.substring(dateEndIdx, firstAmtIdx).trim()
        : line.substring(dateEndIdx).replace(/(?:₹\s*)?[\d,]+\.\d{2}.*/g, '').trim();
    }

    desc = desc.replace(/^[\s\-,|\/]+/, '').replace(/[\s\-,|\/]+$/, '');
    if (!desc || desc.length < 2) desc = 'Transaction';

    if (amount > 0) {
      txns.push({ date: dateStr, desc, amount, type, cat: autoCategory(desc, amount) });
    }
  }
  return txns;
}

// ─────────────────────────────────────────────
// REWARD PROGRAMS LOOKUP
// ─────────────────────────────────────────────
const REWARD_PROGRAMS = {
  'amex-platinum-reserve': {
    label: 'Amex Platinum Reserve MR',
    color: '#1a3a6e',
    defaultRate: 0.50,
    note: '1 MR pt/₹50 base · 5X promo active till Jan 2027 · 3X at Reward Multiplier merchants · Fee ₹10,000 (waived at ₹10L annual spend)',
    earnRates: [
      { category: '5X Promo (till Jan 2027)',         ptsPerRs100: 10, note: '5X — 5 pts/₹50' },
      { category: 'Reward Multiplier merchants (3X)', ptsPerRs100: 6,  note: '3X — 3 pts/₹50' },
      { category: 'All other spends (base)',          ptsPerRs100: 2,  note: '1X — 1 pt/₹50'  },
    ],
    options: [
      { label: 'Air India Miles (transfer)',       ratio: '1:1',       tag: 'Best for long-haul',       multiplier: 1.0 },
      { label: 'Vistara Club Vistara',             ratio: '1:1',       tag: 'Premium domestic flights', multiplier: 1.0 },
      { label: 'InterMiles',                       ratio: '1:1',       tag: 'Domestic + Middle East',   multiplier: 1.0 },
      { label: 'Singapore KrisFlyer',              ratio: '2:1',       tag: 'International luxury',     multiplier: 0.5 },
      { label: 'Amazon / Myntra vouchers',         ratio: '₹0.25/pt',  tag: 'Easy cashout',             cashValue: 0.25 },
      { label: 'Select & Pay (statement credit)',  ratio: '₹0.25/pt',  tag: 'Direct credit',            cashValue: 0.25 },
    ]
  },
  amex: {
    label: 'Amex Membership Rewards',
    color: '#2c6fad',
    defaultRate: 0.50,
    options: [
      { label: 'Air India Miles',            ratio: '1:1',       tag: 'Best for long-haul',  multiplier: 1.0 },
      { label: 'InterMiles',                 ratio: '1:1',       tag: 'Domestic travel',      multiplier: 1.0 },
      { label: 'Vistara Club Vistara',       ratio: '1:1',       tag: 'Premium flights',      multiplier: 1.0 },
      { label: 'Singapore KrisFlyer',        ratio: '2:1',       tag: 'International luxury', multiplier: 0.5 },
      { label: 'Marriott Bonvoy',            ratio: '1:1',       tag: 'Hotel stays',          multiplier: 1.0 },
      { label: 'Amazon / Flipkart voucher',  ratio: '₹0.25/pt',  tag: 'Easy cashout',         cashValue: 0.25 },
    ]
  },
  'icici-emeralde': {
    label: 'ICICI Emeralde Private Metal',
    color: '#b8860b',
    defaultRate: 1.0,
    note: 'Base 6 pts/₹200 · 6X on flights · 12X on hotels via iShop · Pts expire 2 yrs from earn date',
    earnRates: [
      { category: 'Hotels via iShop',   ptsPerRs100: 36, note: '12X' },
      { category: 'Flights via iShop',  ptsPerRs100: 18, note: '6X'  },
      { category: 'All other spends',   ptsPerRs100: 3,  note: '1X (base)' },
    ],
    options: [
      { label: 'Flights / Hotels (iShop)',         ratio: '₹1.00/pt',  tag: 'Best value',     cashValue: 1.00 },
      { label: 'Apple, Tanishq, Tumi vouchers',    ratio: '₹1.00/pt',  tag: 'Premium brands', cashValue: 1.00 },
      { label: 'Taj Epicure / EazyDiner',          ratio: '₹1.00/pt',  tag: 'Dining & stays', cashValue: 1.00 },
      { label: 'Reward catalogue (general)',       ratio: '₹0.60/pt',  tag: 'Catalogue',      cashValue: 0.60 },
      { label: 'Statement balance credit',         ratio: '₹0.40/pt',  tag: 'Cashback',       cashValue: 0.40 },
    ]
  },
  icici: {
    label: 'ICICI Reward Points',
    color: '#e85d04',
    defaultRate: 0.25,
    options: [
      { label: 'Flipkart vouchers',          ratio: '₹0.25/pt',  tag: 'Best value',      cashValue: 0.25 },
      { label: 'Flight bookings via ICICI',  ratio: '₹0.25/pt',  tag: 'Travel',          cashValue: 0.25 },
      { label: 'BookMyShow',                 ratio: '₹0.20/pt',  tag: 'Entertainment',   cashValue: 0.20 },
      { label: 'Statement cashback',         ratio: '₹0.15/pt',  tag: 'Direct credit',   cashValue: 0.15 },
    ]
  },
  hdfc: {
    label: 'HDFC Reward Points',
    color: '#004c8f',
    defaultRate: 0.20,
    options: [
      { label: 'SmartBuy — Gold / vouchers', ratio: '₹0.20/pt',  tag: 'Best value',      cashValue: 0.20 },
      { label: 'InterMiles / Air India',     ratio: '5:4',        tag: 'Travel miles',    multiplier: 0.80 },
      { label: 'Amazon / Flipkart',          ratio: '₹0.20/pt',  tag: 'Shopping',        cashValue: 0.20 },
      { label: 'Statement cashback',         ratio: '₹0.15/pt',  tag: 'Direct credit',   cashValue: 0.15 },
    ]
  },
  sc: {
    label: 'Standard Chartered Rewards',
    color: '#1d8348',
    defaultRate: 0.20,
    options: [
      { label: 'AirAsia BIG Points',         ratio: '2:1',        tag: 'Budget travel',   multiplier: 0.50 },
      { label: 'Shopping gift vouchers',     ratio: '₹0.20/pt',  tag: 'Shopping',        cashValue: 0.20 },
      { label: 'Statement credit',           ratio: '₹0.15/pt',  tag: 'Direct credit',   cashValue: 0.15 },
    ]
  },
  axis: {
    label: 'Axis Edge Rewards',
    color: '#8e0707',
    defaultRate: 0.20,
    options: [
      { label: 'Air India / Vistara miles',  ratio: '5:4',        tag: 'Frequent flyers', multiplier: 0.80 },
      { label: 'Hotel points transfer',      ratio: '5:4',        tag: 'Stays',           multiplier: 0.80 },
      { label: 'Amazon vouchers',            ratio: '₹0.20/pt',  tag: 'Shopping',        cashValue: 0.20 },
    ]
  },
  sbi: {
    label: 'SBI Reward Points',
    color: '#1a5276',
    defaultRate: 0.25,
    options: [
      { label: 'Gift vouchers',              ratio: '₹0.25/pt',  tag: 'Shopping',        cashValue: 0.25 },
      { label: 'Air Miles transfer',         ratio: '4:1',        tag: 'Travel',          multiplier: 0.25 },
      { label: 'Cashback',                   ratio: '₹0.20/pt',  tag: 'Direct credit',   cashValue: 0.20 },
    ]
  },
  kotak: {
    label: 'Kotak Reward Points',
    color: '#ed1c24',
    defaultRate: 0.25,
    options: [
      { label: 'PVR movie tickets',          ratio: '₹0.25/pt',  tag: 'Entertainment',   cashValue: 0.25 },
      { label: 'Swiggy / Zomato vouchers',   ratio: '₹0.25/pt',  tag: 'Dining',          cashValue: 0.25 },
      { label: 'Cashback',                   ratio: '₹0.20/pt',  tag: 'Direct credit',   cashValue: 0.20 },
    ]
  },
  default: {
    label: 'Reward Points',
    color: '#6b7280',
    defaultRate: 0.25,
    options: [
      { label: 'Vouchers / Gift cards',      ratio: '₹0.20-0.25/pt', tag: 'Shopping',    cashValue: 0.22 },
      { label: 'Cashback / Statement credit',ratio: '₹0.15-0.20/pt', tag: 'Direct credit',cashValue: 0.18 },
      { label: 'Miles transfer (if avail.)', ratio: 'Varies',         tag: 'Travel',      cashValue: 0.25 },
    ]
  }
};

function detectRewardProgram(name) {
  const n = (name || '').toLowerCase();
  if (/emeralde/i.test(n))                                          return 'icici-emeralde';
  if (/platinum.{0,10}reserve|reserve.{0,10}platinum/i.test(n))    return 'amex-platinum-reserve';
  if (/amex|american express/i.test(n))                             return 'amex';
  if (/icici/i.test(n))                                             return 'icici';
  if (/hdfc/i.test(n))                                              return 'hdfc';
  if (/standard chartered|stanchart/i.test(n))                      return 'sc';
  if (/axis/i.test(n))                                              return 'axis';
  if (/sbi/i.test(n))                                               return 'sbi';
  if (/kotak/i.test(n))                                             return 'kotak';
  return 'default';
}

function migrateRewards() {
  if (Array.isArray(D.rewards)) return;
  const keyToName = { 'amex': 'American Express', 'icici-cc': 'ICICI Credit Card' };
  const arr = [];
  let t = 1;
  for (const k in D.rewards) {
    const r = D.rewards[k];
    const name = keyToName[k] || k;
    arr.push({
      id: Date.now() + t++,
      name,
      program: detectRewardProgram(name),
      points: r.points || 0,
      rate: r.rate || 0.25,
      expiry: r.expiry || '',
      tier: r.tier || ''
    });
  }
  D.rewards = arr;
  save();
}

const BANK_CONFIGS = {
  'icici-salary': {
    label:'ICICI Bank (Savings/Salary)', account:'icici-salary',
    hint:'ICICI CSV: S No., Value Date, Transaction Date, Cheque Number, Transaction Remarks, Withdrawal Amount(INR), Deposit Amount(INR), Balance(INR)',
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
    label:'ICICI Credit Card', account:'icici-cc',
    hint:'ICICI CC XLS: Transaction Date, Details, Amount (INR), Reference Number',
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
    label:'Standard Chartered', account:'sc-savings',
    hint:'SC CSV: Date, Transaction, Currency, Deposit, Withdrawal, Running Balance',
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
    label:'American Express', account:'amex',
    hint:'Amex CSV: Date, Description, Amount, extended details, APPEARS on your statement as, reference',
    skipRows:1,
    parse(row) {
      // Columns: 0=Date, 1=Description, 2=Amount, 3=extended details, 4=APPEARS on your statement as, 5=reference
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
  },
  'nps': {
    label:'NPS Statement', account:'nps',
    hint:'NPS Excel/CSV: Auto-detects PRAN and Tier I / Tier II balances.',
    skipRows:0,
    parse(row) { return null; }
  }
};

function parseDate(str, fmt) {
  if (!str) return null;
  str = str.trim().replace(/"/g,'');
  try {
    // Robust parsing for dash/dot/slash formats
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
  // Fallback to basic string splitting if everything else fails
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
  return isNaN(n)||n<0?0:n;
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
  
  // Specific exclusions
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

function selectBank(bank, btn) {
  selectedBank = bank;
  document.querySelectorAll('.bank-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const cfg = BANK_CONFIGS[bank];
  document.getElementById('import-hint').textContent = cfg.hint;
  document.getElementById('bank-format-info').innerHTML =
    `<div class="alert alert-info"><span>ℹ</span><span><strong>${cfg.label}</strong> — ${cfg.hint}</span></div>`;
  document.getElementById('parse-result').style.display = 'none';
  parsedRows = [];
}

async function processPdfParsing(file, pwd) {
  try {
    const pdfjs = await ensurePdfJS();
    const arrayBuffer = await file.arrayBuffer();
    
    const loadingTask = pdfjs.getDocument({ data: new Uint8Array(arrayBuffer), password: pwd });
    const pdf = await loadingTask.promise;
    
    let textAll = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      textAll += (reconstructTextWithCoordinates(textContent) || textContent.items.map(s => s.str).join(' ')) + '\n';
    }
    
    pendingPdfFile = null;
    
    const importBtn = document.getElementById('importConfirmBtn');
    if (importBtn) importBtn.style.display = 'inline-block';
    
    if (selectedBank === 'nps') {
      const { pran, tier1, tier2 } = extractNpsBalances(textAll);
      parsedRows = [{ pran, tier1, tier2 }];
      
      document.getElementById('parse-result').style.display = 'block';
      document.getElementById('parse-status-badge').innerHTML = `<span class="parse-status parse-ok">✓ NPS Data Extracted from PDF</span>`;
      document.getElementById('parse-preview-table').innerHTML = 
        `<div class="parse-row"><div class="parse-cell parse-header val">PRAN</div><div class="parse-cell val">${esc(pran || 'Not found')}</div></div>` +
        `<div class="parse-row"><div class="parse-cell parse-header val">Tier I Balance</div><div class="parse-cell val" style="color:var(--green)">₹${(tier1||0).toLocaleString('en-IN')}</div></div>` +
        `<div class="parse-row"><div class="parse-cell parse-header val">Tier II Balance</div><div class="parse-cell val" style="color:var(--green)">₹${(tier2||0).toLocaleString('en-IN')}</div></div>`;
      document.getElementById('parse-summary').textContent = `File: ${file.name} (PDF)`;
      
    } else {
      const txns = parseBankStatementPdf(textAll, selectedBank);
      parsedRows = txns;
      
      const isCreditCard = selectedBank === 'icici-cc' || selectedBank === 'amex' || (selectedBank === 'sc' && textAll.toLowerCase().includes('credit card'));
      if (isCreditCard) {
        detectedCardData = extractCardMetadata(textAll, selectedBank);
      } else {
        detectedCardData = null;
      }
      
      const resultEl = document.getElementById('parse-result');
      resultEl.style.display = 'block';
      const statusEl = document.getElementById('parse-status-badge');
      
      if (parsedRows.length > 0) {
        let badgeHtml = `<span class="parse-status parse-ok">✓ ${parsedRows.length} transactions extracted from PDF</span>`;
        if (detectedCardData) {
          badgeHtml += ` <span class="parse-status parse-ok" style="background:rgba(123,94,167,0.1);color:#7b5ea7">💳 Detected ${esc(detectedCardData.name)}</span>`;
        }
        statusEl.innerHTML = badgeHtml;
        const previewRows = parsedRows.slice(0, 8);
        document.getElementById('parse-preview-table').innerHTML = 
          `<div class="parse-row"><div class="parse-cell parse-header val">Date</div><div class="parse-cell parse-header val">Description</div><div class="parse-cell parse-header val">Amount</div><div class="parse-cell parse-header val">Type</div><div class="parse-cell parse-header val">Category</div></div>` +
          previewRows.map(t =>
            `<div class="parse-row"><div class="parse-cell val">${t.date}</div><div class="parse-cell val">${esc(t.desc)}</div><div class="parse-cell val" style="color:var(--accent)">₹${t.amount.toLocaleString('en-IN')}</div><div class="parse-cell val" style="color:${t.type==='debit'?'var(--red)':'var(--green)'}">${t.type}</div><div class="parse-cell val">${t.cat}</div></div>`
          ).join('');
      } else {
        const escapeHtml = (str) => String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const sampleText = textAll.substring(0, 300);
        statusEl.innerHTML = `<span class="parse-status" style="background:var(--red-light);color:var(--red);white-space:normal;display:block;padding:8px">✗ No transactions extracted. Check bank/card format matches statement.<br><br>Extracted Sample:<br>${escapeHtml(sampleText)}</span>`;
        document.getElementById('parse-preview-table').innerHTML = '';
      }
      
      document.getElementById('parse-summary').textContent = `File: ${file.name} (PDF) · ${parsedRows.length} valid rows`;
    }
  } catch (err) {
    if (err.name === 'PasswordException') {
      pendingPdfFile = file;
      
      document.getElementById('parse-result').style.display = 'block';
      document.getElementById('parse-status-badge').innerHTML = 
        `<span class="parse-status" style="background:var(--red-light);color:var(--red)">🔒 Password Protected</span>`;
      document.getElementById('parse-preview-table').innerHTML = `
        <div style="padding:16px;background:var(--surface2);border-radius:6px;border:1px dashed var(--red);text-align:center">
          <div style="font-weight:600;font-size:13px;margin-bottom:8px;color:var(--text)">⚠️ Password Required for ${esc(file.name)}</div>
          <div style="font-size:11px;color:var(--muted);margin-bottom:12px">${pwd ? 'Incorrect password. ' : ''}This statement is encrypted. Enter the correct password below to parse it:</div>
          <div style="display:flex;gap:8px;justify-content:center;max-width:320px;margin:0 auto">
            <input class="form-input" type="password" id="inline-pdf-password" placeholder="Enter PDF Password" style="font-size:12px;padding:6px 10px;height:auto">
            <button class="btn btn-primary btn-sm" onclick="retryPdfUnlock()" style="white-space:nowrap;padding:6px 12px">Unlock & Parse</button>
          </div>
        </div>
      `;
      document.getElementById('parse-summary').textContent = `File: ${file.name} is encrypted.`;
      document.getElementById('importConfirmBtn').style.display = 'none';
      
      setTimeout(() => {
        const inlineInput = document.getElementById('inline-pdf-password');
        if (inlineInput) inlineInput.focus();
      }, 100);
    } else {
      alert("Error parsing PDF: " + err.message);
      pendingPdfFile = null;
    }
  }
}

async function retryPdfUnlock() {
  if (!pendingPdfFile) return;
  const inlinePwdInput = document.getElementById('inline-pdf-password');
  const pwd = inlinePwdInput ? inlinePwdInput.value : '';
  await processPdfParsing(pendingPdfFile, pwd);
}

async function parseCSV(event) {
  const file = event.target.files[0];
  if (!file) return;
  const cfg = BANK_CONFIGS[selectedBank];

  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    const pwd = document.getElementById('import-pdf-password') ? document.getElementById('import-pdf-password').value : '';
    await processPdfParsing(file, pwd);
    event.target.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    let rows = [];
    if (typeof XLSX !== 'undefined') {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, {type: 'array'});
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(firstSheet, {header: 1, raw: false, defval: ''});
        rows = json.map(r => r.map(c => c ? c.toString().trim() : ''));
        rows = rows.filter(r => r.length > 0 && r.some(c => c !== ''));
      } catch (err) {
        console.error("XLSX parse error", err);
      }
    }
    if (!rows.length) {
      const text = new TextDecoder().decode(e.target.result);
      rows = text.split('\n').filter(l => l.trim()).map(parseCSVLine);
    }

    parsedRows = [];
    if (selectedBank === 'nps') {
      let pran = '', tier1 = 0, tier2 = 0;
      const textAll = rows.map(r => r.join(' ')).join('\n').toLowerCase();
      const pranMatch = textAll.match(/pran.*?\b(\d{12})\b/i) || textAll.match(/\b(\d{12})\b/);
      if (pranMatch) pran = pranMatch[1];
      const t1Match = textAll.match(/tier\s*i\s*.*?balance.*?([\d,]+(\.\d{1,2})?)/i) 
                   || textAll.match(/tier\s*i.*?holding.*?([\d,]+(\.\d{1,2})?)/i)
                   || textAll.match(/tier\s*i.*?value.*?([\d,]+(\.\d{1,2})?)/i);
      if (t1Match) tier1 = parseFloat(t1Match[1].replace(/,/g, ''));
      const t2Match = textAll.match(/tier\s*ii\s*.*?balance.*?([\d,]+(\.\d{1,2})?)/i) 
                   || textAll.match(/tier\s*ii.*?holding.*?([\d,]+(\.\d{1,2})?)/i)
                   || textAll.match(/tier\s*ii.*?value.*?([\d,]+(\.\d{1,2})?)/i);
      if (t2Match) tier2 = parseFloat(t2Match[1].replace(/,/g, ''));
      parsedRows = [{ pran, tier1: tier1||0, tier2: tier2||0 }];
      document.getElementById('parse-result').style.display = 'block';
      document.getElementById('parse-status-badge').innerHTML = `<span class="parse-status parse-ok">✓ NPS Data Extracted</span>`;
      document.getElementById('parse-preview-table').innerHTML = `<div class="parse-row"><div class="parse-cell parse-header val">PRAN</div><div class="parse-cell val">${pran || 'Not found'}</div></div>` +
                        `<div class="parse-row"><div class="parse-cell parse-header val">Tier I Balance</div><div class="parse-cell val" style="color:var(--green)">₹${(tier1||0).toLocaleString('en-IN')}</div></div>` +
                        `<div class="parse-row"><div class="parse-cell parse-header val">Tier II Balance</div><div class="parse-cell val" style="color:var(--green)">₹${(tier2||0).toLocaleString('en-IN')}</div></div>`;
      document.getElementById('parse-summary').textContent = `File: ${file.name} · Parsed NPS balances.`;
      event.target.value = '';
      return;
    }
    const previewRows = [];
    const skipped = cfg.skipRows || 1;
    let firstFailed = null;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (i < skipped) { previewRows.push({header:true,row}); continue; }
      try {
        const parsed = cfg.parse(row);
        if (parsed) { 
          parsedRows.push(parsed); 
          if (previewRows.length < 8) previewRows.push({header:false,row:parsed}); 
        } else {
          if (!firstFailed && row.some(c => c && c.toString().trim())) firstFailed = row;
        }
      } catch(ex) {
        if (!firstFailed) firstFailed = row;
      }
    }
    const resultEl = document.getElementById('parse-result');
    resultEl.style.display = 'block';
    const statusEl = document.getElementById('parse-status-badge');
    
    const escapeHtml = (str) => String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const debugText = `Row 0: ${rows[0] ? escapeHtml(JSON.stringify(rows[0])) : 'None'}<br>Row 1: ${rows[1] ? escapeHtml(JSON.stringify(rows[1])) : 'None'}<br>Row 2: ${rows[2] ? escapeHtml(JSON.stringify(rows[2])) : 'None'}`;
    
    statusEl.innerHTML = parsedRows.length > 0
      ? `<span class="parse-status parse-ok">✓ ${parsedRows.length} transactions found</span>`
      : `<span class="parse-status" style="background:var(--red-light);color:var(--red);white-space:normal;display:block;padding:8px">✗ No transactions parsed.<br><br>Debug Info:<br>${debugText}</span>`;
    const table = document.getElementById('parse-preview-table');
    table.innerHTML = `<div class="parse-row"><div class="parse-cell parse-header val">Date</div><div class="parse-cell parse-header val">Description</div><div class="parse-cell parse-header val">Amount</div><div class="parse-cell parse-header val">Type</div><div class="parse-cell parse-header val">Category</div></div>` +
      previewRows.filter(r=>!r.header).slice(0,8).map(r =>
        `<div class="parse-row"><div class="parse-cell val">${esc(r.row.date)}</div><div class="parse-cell val">${esc(r.row.desc)}</div><div class="parse-cell val" style="color:var(--accent)">₹${r.row.amount.toLocaleString('en-IN')}</div><div class="parse-cell val" style="color:${r.row.type==='debit'?'var(--red)':'var(--green)'}">${esc(r.row.type)}</div><div class="parse-cell val">${esc(r.row.cat)}</div></div>`
      ).join('');
    document.getElementById('parse-summary').textContent =
      `File: ${file.name} · ${rows.length-skipped} rows read · ${parsedRows.length} valid · ${rows.length-skipped-parsedRows.length} skipped`;
    event.target.value = '';
  };
  reader.readAsArrayBuffer(file);
}

function confirmImport() {
  if (!parsedRows.length) return;
  if (selectedBank === 'nps') {
    const m = currentMember === 'all' ? 'madhu' : currentMember;
    if (!D.nps[m]) D.nps[m] = {pran:'', tier1:0, tier2:0, fyContrib:0, monthly:0, equityPct:75};
    const data = parsedRows[0];
    if (data.pran) D.nps[m].pran = data.pran;
    if (data.tier1) D.nps[m].tier1 = data.tier1;
    if (data.tier2) D.nps[m].tier2 = data.tier2;
    snapshotNW(); save(); renderAll();
    document.getElementById('parse-status-badge').innerHTML = `<span class="parse-status parse-ok">✓ Updated NPS Holdings</span>`;
    document.getElementById('importConfirmBtn').textContent = 'Done ✓'; 
    document.getElementById('importConfirmBtn').disabled = true;
    parsedRows = [];
    return;
  }
  const cfg = BANK_CONFIGS[selectedBank];
  const m = currentMember === 'all' ? 'madhu' : currentMember;
  let txnAccountId = '';

  if (selectedBank === 'icici-salary' || selectedBank === 'sc') {
    const bankName = selectedBank === 'icici-salary' ? 'ICICI Savings' : 'SC Savings';
    const bankKeyword = selectedBank === 'icici-salary' ? 'icici' : 'standard chartered';
    let existingAcc = D.accounts.find(a => a.member === m && a.name.toLowerCase().includes(bankKeyword));
    if (!existingAcc) {
      existingAcc = {
        id: Date.now() + Math.random(),
        name: bankName,
        member: m,
        type: 'savings',
        balance: 0,
        credits: 0,
        debits: 0,
        updated: todayStr()
      };
      D.accounts.push(existingAcc);
    }
    txnAccountId = existingAcc.id;
  } else if (selectedBank === 'icici-cc' || selectedBank === 'amex') {
    if (detectedCardData) {
      let existingCard = D.cards.find(c => c.member === m && c.name.toLowerCase().includes(detectedCardData.name.toLowerCase()));
      if (existingCard) {
        existingCard.outstanding = detectedCardData.outstanding;
        if (detectedCardData.limit > 0) existingCard.limit = detectedCardData.limit;
        if (detectedCardData.dueDate) existingCard.dueDate = detectedCardData.dueDate;
        if (detectedCardData.minDue > 0) existingCard.minDue = detectedCardData.minDue;
        txnAccountId = existingCard.id;
      } else {
        const newCard = {
          id: Date.now() + Math.random(),
          name: detectedCardData.name,
          member: m,
          outstanding: detectedCardData.outstanding,
          limit: detectedCardData.limit || 150000,
          dueDate: detectedCardData.dueDate || '',
          minDue: detectedCardData.minDue || 0
        };
        D.cards.push(newCard);
        txnAccountId = newCard.id;
      }
      detectedCardData = null; // Clear state
    } else {
      const defaultName = selectedBank === 'icici-cc' ? 'ICICI Credit Card' : 'American Express';
      let existingCard = D.cards.find(c => c.member === m && c.name.toLowerCase().includes(defaultName.toLowerCase()));
      if (!existingCard) {
        existingCard = {
          id: Date.now() + Math.random(),
          name: defaultName,
          member: m,
          outstanding: 0,
          limit: 150000,
          dueDate: '',
          minDue: 0
        };
        D.cards.push(existingCard);
      }
      txnAccountId = existingCard.id;
    }
  }

  const existing = new Set(D.transactions.map(t => t.date+'|'+t.desc+'|'+t.amount));
  let added = 0, dupes = 0;
  parsedRows.forEach(r => {
    const key = r.date+'|'+r.desc+'|'+r.amount;
    if (existing.has(key)) { dupes++; return; }
    const cat = r.cat;
    const type = cat === 'EMI' ? 'debit' : r.type; // Force EMI to always be debit
    D.transactions.unshift({
      id: Date.now()+Math.random(),
      desc: r.desc, amount: r.amount, type: type,
      cat: cat, member: currentMember === 'all' ? 'madhu' : currentMember,
      date: r.date,
      account: txnAccountId
    });
    added++;
  });
  D.transactions.sort((a,b) => new Date(b.date) - new Date(a.date));

  save(); renderAll();
  let msg = `✓ Imported ${added} txns`;
  msg += ` · ${dupes} duplicates skipped`;
  
  document.getElementById('parse-status-badge').innerHTML =
    `<span class="parse-status parse-ok">${msg}</span>`;
  const btn = document.getElementById('importConfirmBtn');
  btn.textContent = 'Done ✓'; btn.disabled = true;
  parsedRows = [];
}

// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────
load();
document.getElementById('m-txn-date').value = new Date().toISOString().split('T')[0];
selectBank('icici-salary', document.querySelector('.bank-tab'));
updateHideNumbersButton();
renderAll();

