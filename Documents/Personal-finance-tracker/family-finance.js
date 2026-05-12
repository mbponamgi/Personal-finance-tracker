// ─────────────────────────────────────────────
// FAMILY FINANCE OS — DATA STORE
// ─────────────────────────────────────────────
const KEY = 'family_finance_v1';

const MEMBERS = ['madhu','sailaja','parents','charan','himaja','joint'];
const MEMBER_NAMES = {madhu:'Madhu',sailaja:'Sailaja',parents:'Parents',charan:'Charan',himaja:'Himaja',joint:'Joint'};
const MEMBER_COLORS = {madhu:'#b5813a',sailaja:'#4a7c6f',parents:'#7b5ea7',charan:'#3a7d54',himaja:'#c0692b',joint:'#4a6fa5'};

let currentMember = 'all';

let D = {
  accounts: [],
  cards: [],
  rewards: {
    'amex':    {points:0, rate:0.5,  expiry:'', tier:'Green'},
    'icici-cc':{points:0, rate:0.25, expiry:'', tier:''}
  },
  investments: [],
  insurance: [],
  properties: [],
  loans: [],
  gold: [],
  goldRate: 7500,
  epf:  {uan:'', balance:0, empShare:0, erShare:0, monthly:0, updated:null},
  nps:  {pran:'', tier1:0, tier2:0, fyContrib:0, monthly:0, equityPct:75},
  tax:  {gross:0, s80c:0, s80ccd:0, s24b:0, s80d:0, hra:0},
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
const fmt = n => '₹' + Math.abs(n||0).toLocaleString('en-IN',{maximumFractionDigits:0});
const cr = n => '₹' + (Math.abs(n||0)/1e7).toFixed(2) + ' Cr';
const lk = n => '₹' + (Math.abs(n||0)/1e5).toFixed(1) + ' L';
const todayStr = () => new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});
const pf = (v, max) => Math.min(Math.round((v/max)*100), 100);

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const diff = new Date(dateStr) - new Date();
  return Math.ceil(diff / (1000*60*60*24));
}

function memberTag(m) {
  const name = MEMBER_NAMES[m] || m;
  return `<span class="member-tag tag-${m}">${name}</span>`;
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
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

function openRewardModal(key) {
  const names = {'amex':'Amex MR Points','icici-cc':'ICICI Reward Points'};
  document.getElementById('rewardModalTitle').textContent = 'Update — ' + names[key];
  const r = D.rewards[key];
  document.getElementById('m-rw-pts').value = r.points || '';
  document.getElementById('m-rw-rate').value = r.rate || '';
  document.getElementById('m-rw-exp').value = r.expiry || '';
  document.getElementById('m-rw-tier').value = r.tier || '';
  document.getElementById('m-rw-key').value = key;
  openModal('rewardModal');
}

function insTypeChanged() {
  const t = document.getElementById('m-ins-type').value;
  document.getElementById('ins-vehicle-wrap').style.display = t === 'auto' ? 'block' : 'none';
  document.getElementById('ins-covered-wrap').style.display = t !== 'auto' ? 'block' : 'none';
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
  populateLoanSelect(p.linkedLoan);
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
  document.getElementById('m-ins-due').value = p.dueDate || '';
  document.getElementById('m-ins-freq').value = p.freq || 'annual';
  document.getElementById('m-ins-covered').value = (p.covered||[]).join(', ');
  document.getElementById('m-ins-vehicle').value = p.vehicle || '';
  insTypeChanged();
  openModal('insModal');
}

function populateLoanSelect(selected) {
  const sel = document.getElementById('m-prop-loan');
  sel.innerHTML = '<option value="">None</option>' +
    D.loans.map(l => `<option value="${l.id}" ${l.id === selected ? 'selected' : ''}>${l.name}</option>`).join('');
}

// ─────────────────────────────────────────────
// SAVE HANDLERS
// ─────────────────────────────────────────────
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
}

function saveReward() {
  const k = document.getElementById('m-rw-key').value;
  D.rewards[k] = {
    points: +document.getElementById('m-rw-pts').value || 0,
    rate: +document.getElementById('m-rw-rate').value || 0.25,
    expiry: document.getElementById('m-rw-exp').value,
    tier: document.getElementById('m-rw-tier').value
  };
  save(); renderAll(); closeModal('rewardModal');
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
    linkedLoan: document.getElementById('m-prop-loan').value || null,
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
  const inv = {
    id: Date.now(),
    name: document.getElementById('m-inv-name').value,
    type: document.getElementById('m-inv-type').value,
    member: document.getElementById('m-inv-member').value,
    cost: +document.getElementById('m-inv-cost').value || 0,
    value: +document.getElementById('m-inv-val').value || 0
  };
  if (!inv.name) return;
  D.investments.push(inv);
  snapshotNW(); save(); renderAll(); closeModal('invModal');
  document.getElementById('m-inv-name').value = '';
  document.getElementById('m-inv-cost').value = '';
  document.getElementById('m-inv-val').value = '';
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
    dueDate: document.getElementById('m-ins-due').value,
    freq: document.getElementById('m-ins-freq').value,
    covered: document.getElementById('m-ins-covered').value.split(',').map(s => s.trim()).filter(Boolean),
    vehicle: document.getElementById('m-ins-vehicle').value
  };
  if (!p.name) return;
  upsert(D.insurance, p);
  save(); renderAll(); closeModal('insModal');
  document.getElementById('m-ins-id').value = '';
  document.getElementById('insModalTitle').textContent = 'Add Insurance Policy';
}

function deleteIns(id) {
  D.insurance = D.insurance.filter(i => i.id !== id);
  save(); renderAll();
}

function saveEPF() {
  D.epf = {
    uan: document.getElementById('m-epf-uan').value,
    balance: +document.getElementById('m-epf-bal').value || 0,
    empShare: +document.getElementById('m-epf-emp').value || 0,
    erShare: +document.getElementById('m-epf-er').value || 0,
    monthly: +document.getElementById('m-epf-monthly').value || 0,
    updated: todayStr()
  };
  snapshotNW(); save(); renderAll(); closeModal('epfModal');
}

function saveNPS() {
  D.nps = {
    pran: document.getElementById('m-nps-pran').value,
    tier1: +document.getElementById('m-nps-t1').value || 0,
    tier2: +document.getElementById('m-nps-t2').value || 0,
    fyContrib: +document.getElementById('m-nps-contrib').value || 0,
    monthly: +document.getElementById('m-nps-sip').value || 0,
    equityPct: +document.getElementById('m-nps-eq').value || 75
  };
  snapshotNW(); save(); renderAll(); closeModal('npsModal');
}

function saveTax() {
  D.tax = {
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
    date: document.getElementById('m-txn-date').value || new Date().toISOString().split('T')[0]
  };
  if (!t.desc || !t.amount) return;
  D.transactions.unshift(t);
  save(); renderAll(); closeModal('txnModal');
  document.getElementById('m-txn-desc').value = '';
  document.getElementById('m-txn-amt').value = '';
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
// NET WORTH
// ─────────────────────────────────────────────
function calcNW() {
  const liq = D.accounts.reduce((s, a) => s + a.balance, 0);
  const inv = D.investments.reduce((s, i) => s + i.value, 0);
  const prop = D.properties.reduce((s, p) => s + p.value, 0);
  const goldVal = calcGoldValue();
  const ret = D.epf.balance + D.nps.tier1 + D.nps.tier2;
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
  const month = new Date().toLocaleDateString('en-IN',{month:'short',year:'2-digit'});
  const i = D.nwHistory.findIndex(h => h.m === month);
  if (i >= 0) D.nwHistory[i].v = nw;
  else D.nwHistory.push({m: month, v: nw});
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
function renderAll() {
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
  const nw = liq + propVal + inv + goldVal + D.epf.balance + D.nps.tier1 + D.nps.tier2 - totalLiab;

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
  const totalAssets = liq + propVal + inv + goldVal + D.epf.balance + D.nps.tier1 + D.nps.tier2;
  const assetEl = document.getElementById('ov-assets-breakdown');
  if (totalAssets === 0) {
    assetEl.innerHTML = '<div class="empty-state"><div class="empty-icon">◈</div>Add assets to see breakdown</div>';
  } else {
    const segments = [
      {label:'Liquid', val:liq, color:'var(--accent2)'},
      {label:'Property', val:propVal, color:'#4a6fa5'},
      {label:'Investments', val:inv, color:'var(--accent3)'},
      {label:'Gold', val:goldVal, color:'var(--accent)'},
      {label:'EPF/NPS', val:D.epf.balance+D.nps.tier1+D.nps.tier2, color:'var(--green)'},
    ].filter(s => s.val > 0);
    assetEl.innerHTML = segments.map(s => {
      const pct = (s.val / totalAssets * 100).toFixed(1);
      return `<div class="spend-row">
        <div class="spend-label">${s.label}</div>
        <div class="spend-bar-wrap"><div class="spend-bar-fill" style="width:${pct}%;background:${s.color}"></div></div>
        <div class="spend-val">${lk(s.val)}</div>
      </div>`;
    }).join('');
  }

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
          <div><div class="row-name">${l.name}</div><div class="row-sub">${memberTag(l.member)} · EMI ${fmt(l.emi)}/mo</div></div>
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
          <div><div class="row-name">${p.name}</div><div class="row-sub">${p.insurer}</div></div>
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
  const cm = new Date().getMonth();
  const cy = new Date().getFullYear();
  filterByMember(D.transactions).filter(t =>
    t.type === 'debit' &&
    new Date(t.date).getMonth() === cm &&
    new Date(t.date).getFullYear() === cy
  ).forEach(t => { cats[t.cat] = (cats[t.cat]||0) + t.amount; });
  const el = document.getElementById('ov-spend');
  if (!Object.keys(cats).length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">≋</div>No transactions this month</div>';
    return;
  }
  const total = Object.values(cats).reduce((a,b)=>a+b,0);
  const colors = ['#b5813a','#4a7c6f','#7b5ea7','#3a7d54','#c0692b','#4a6fa5','#7ab8a0','#b8a07e'];
  el.innerHTML = Object.entries(cats).sort((a,b)=>b[1]-a[1]).map(([cat,amt],i) =>
    `<div class="spend-row">
      <div class="spend-label">${cat}</div>
      <div class="spend-bar-wrap"><div class="spend-bar-fill" style="width:${(amt/total*100).toFixed(0)}%;background:${colors[i%colors.length]}"></div></div>
      <div class="spend-val">${fmt(amt)}</div>
    </div>`
  ).join('');
}

function renderNWChart() {
  const hist = D.nwHistory;
  if (hist.length < 2) return;
  const vals = hist.map(h => h.v);
  const min = Math.min(...vals) * .95, max = Math.max(...vals) * 1.05 || 1;
  const W = 400, H = 100;
  const pts = vals.map((v,i) => [(i/(vals.length-1))*W, H - ((v-min)/(max-min))*H]);
  const line = pts.map((p,i) => (i?'L':'M')+p[0]+','+p[1]).join(' ');
  document.getElementById('nwLine').setAttribute('d', line);
  document.getElementById('nwFill').setAttribute('d', line + ` L${pts[pts.length-1][0]},${H} L0,${H} Z`);
  document.getElementById('nwDots').innerHTML = pts.map(p =>
    `<circle cx="${p[0]}" cy="${p[1]}" r="3" fill="#b5813a" stroke="#fff" stroke-width="1.5"/>`
  ).join('');
  document.getElementById('nwLabels').innerHTML = hist.map(h =>
    `<span style="font-family:'DM Mono',monospace;font-size:9px;color:var(--muted)">${h.m}</span>`
  ).join('');
}

function renderAlerts() {
  const alerts = [];
  const cardOut = filterByMember(D.cards).reduce((s,c)=>s+c.outstanding,0);
  if (cardOut > 0) alerts.push({type:'warn', msg:`Card outstanding of ${fmt(cardOut)} — clear before interest kicks in.`});
  const t = D.tax;
  if (t.gross > 0 && t.s80c < 150000) alerts.push({type:'info', msg:`Section 80C: ${fmt(150000-t.s80c)} headroom remaining.`});
  if (D.nps.fyContrib < 50000 && t.gross > 0) alerts.push({type:'info', msg:`NPS 80CCD(1B): ${fmt(50000-D.nps.fyContrib)} unused — worth ${fmt((50000-D.nps.fyContrib)*.312)} in tax savings.`});
  D.insurance.filter(p => { const d=daysUntil(p.dueDate); return d!==null&&d<=30; }).forEach(p => {
    const d = daysUntil(p.dueDate);
    alerts.push({type:d<=0?'danger':'warn', msg:`${p.name} premium ${d<=0?'OVERDUE':'due in '+d+' days'} — ${fmt(p.premium)}`});
  });
  D.properties.filter(p => { const d=daysUntil(p.propTaxDue); return d!==null&&d<=30&&d>0; }).forEach(p => {
    alerts.push({type:'warn', msg:`Property tax for ${p.name} due in ${daysUntil(p.propTaxDue)} days — ${fmt(p.propTax)}`});
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
          <div class="row-name">${a.name} ${memberTag(a.member)}</div>
          <div class="row-sub">${a.type} · Updated ${a.updated||'—'}</div>
        </div>
      </div>
      <div class="row-right">
        <div class="row-val">${fmt(a.balance)}</div>
        <div style="font-size:10px;color:var(--green)">+${fmt(a.credits)} &nbsp;<span style="color:var(--red)">−${fmt(a.debits)}</span>/mo</div>
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
          <div style="font-size:13px;font-weight:500">${c.name} ${memberTag(c.member)}</div>
          <div style="font-size:10px;color:var(--muted);margin-top:2px">Due: ${c.dueDate||'—'} · Min: ${fmt(c.minDue)}</div>
        </div>
        <div style="text-align:right">
          <div class="row-val negative">−${fmt(c.outstanding)}</div>
          <div style="font-size:10px;color:var(--muted)">of ${fmt(c.limit)} limit</div>
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
  const a = D.rewards['amex'], ic = D.rewards['icici-cc'];
  document.getElementById('rw-amex-pts').textContent = a.points.toLocaleString('en-IN');
  document.getElementById('rw-icici-pts').textContent = ic.points.toLocaleString('en-IN');
  document.getElementById('rw-amex-big').textContent = a.points.toLocaleString('en-IN');
  document.getElementById('rw-icici-big').textContent = ic.points.toLocaleString('en-IN');
  const av = a.points * a.rate, iv = ic.points * ic.rate;
  document.getElementById('rw-total-val').textContent = fmt(av+iv);
  document.getElementById('rw-amex-val').textContent = '≈ '+fmt(av)+' value';
  document.getElementById('rw-icici-val').textContent = '≈ '+fmt(iv)+' value';
  document.getElementById('rw-amex-tier').textContent = a.tier || '—';
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
        <div><div style="font-size:12px;font-weight:500">${p.name}</div><div style="font-size:10px;color:var(--muted)">${p.propTaxDue}</div></div>
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
    const linkedLoan = p.linkedLoan ? D.loans.find(l => l.id === +p.linkedLoan) : null;
    return `<div class="prop-card">
      <div class="prop-card-header">
        <div>
          <span class="prop-type-badge ${typeClasses[p.type]}">${typeIcons[p.type]} ${typeLabels[p.type]}</span>
          <div class="prop-name" style="margin-top:6px">${p.name}</div>
          <div class="prop-location">${p.location||''} ${memberTag(p.member)}</div>
          ${p.notes ? `<div style="font-size:10px;color:var(--muted);margin-top:4px">${p.notes}</div>` : ''}
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
      ${linkedLoan ? `<div style="margin-top:10px;padding:8px 10px;background:var(--surface2);border-radius:7px;font-size:11px;color:var(--muted)">Linked loan: <strong style="color:var(--text)">${linkedLoan.name}</strong> — Outstanding ${fmt(linkedLoan.outstanding)}, EMI ${fmt(linkedLoan.emi)}/mo</div>` : ''}
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
  document.getElementById('gold-total-wt').textContent = totalWt.toFixed(1) + ' g';
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
            <div class="row-name">${g.name} ${memberTag(g.member)}</div>
            <div class="row-sub">${g.weight}g · ${g.purity}K · ${g.form}</div>
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
  const list = filterByMember(D.investments);
  const cost = list.reduce((s,i)=>s+i.cost,0);
  const val = list.reduce((s,i)=>s+i.value,0);
  const pnl = val - cost;
  document.getElementById('inv-cost').textContent = fmt(cost);
  document.getElementById('inv-val').textContent = fmt(val);
  const el = document.getElementById('inv-pnl');
  el.textContent = (pnl>=0?'+':'−') + fmt(Math.abs(pnl));
  el.className = 'card-value ' + (pnl >= 0 ? 'positive' : 'negative');
  const tbody = document.getElementById('inv-rows');
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">↗</div>No investments</div></td></tr>';
    return;
  }
  tbody.innerHTML = list.map(inv => {
    const r = inv.cost ? (((inv.value-inv.cost)/inv.cost)*100).toFixed(1) : 0;
    return `<tr>
      <td><div style="font-size:12px;font-weight:500">${inv.name}</div></td>
      <td><span style="font-family:'DM Mono',monospace;font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em">${inv.type}</span></td>
      <td>${memberTag(inv.member)}</td>
      <td style="font-family:'DM Mono',monospace;font-size:12px">${fmt(inv.cost)}</td>
      <td style="font-family:'DM Mono',monospace;font-size:12px">${fmt(inv.value)}</td>
      <td style="font-family:'DM Mono',monospace;font-size:12px;text-align:right;color:${r>=0?'var(--green)':'var(--red)'}">${r>=0?'+':''}${r}%
        <button onclick="deleteInv(${inv.id})" style="margin-left:8px;background:none;border:none;cursor:pointer;color:var(--muted);font-size:11px">✕</button>
      </td>
    </tr>`;
  }).join('');
}

// ─────────────────────────────────────────────
// EPF
// ─────────────────────────────────────────────
function renderEPF() {
  const e = D.epf;
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
}

// ─────────────────────────────────────────────
// NPS
// ─────────────────────────────────────────────
function renderNPS() {
  const n = D.nps, tot = n.tier1 + n.tier2;
  document.getElementById('nps-bal-d').textContent = fmt(tot);
  document.getElementById('nps-sip-d').textContent = fmt(n.monthly);
  document.getElementById('nps-tax-d').textContent = fmt(Math.min(n.fyContrib,50000)*.312);
  document.getElementById('nps-pran-d').textContent = n.pran || '—';
  document.getElementById('nps-t1-d').textContent = fmt(n.tier1);
  document.getElementById('nps-t2-d').textContent = fmt(n.tier2);
  document.getElementById('nps-contrib-d').textContent = fmt(n.fyContrib);
  document.getElementById('nps-eq-d').textContent = (n.equityPct||75) + '%';
  const pct = pf(n.fyContrib, 50000);
  document.getElementById('nps-80ccd-pct').textContent = pct + '%';
  document.getElementById('nps-80ccd-bar').style.width = pct + '%';
  document.getElementById('nps-ctb-d').textContent = fmt(Math.min(n.fyContrib,50000));
  document.getElementById('nps-rem-d').textContent = fmt(Math.max(0,50000-n.fyContrib));
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
            <div style="font-size:14px;font-weight:500;margin-top:5px">${l.name} ${memberTag(l.member)}</div>
            <div style="font-size:11px;color:var(--muted)">${l.lender||''}</div>
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
        <div><div style="font-size:12px;font-weight:500">${l.name}</div><div style="font-size:10px;color:var(--muted)">${l.lender||''} · Day ${l.emiDay||'—'}</div></div>
        <div style="font-family:'DM Mono',monospace;font-size:13px;color:var(--accent)">${fmt(l.emi)}</div>
      </div>`).join('');
  }

  // 24b home loan deduction
  const homeLoanInt = D.loans.filter(l=>l.type==='home').reduce((s,l)=>s+l.intPaid,0);
  const capped = Math.min(homeLoanInt, 200000);
  document.getElementById('loan-24b-val').textContent = fmt(capped);
  document.getElementById('loan-24b-pct').textContent = pf(homeLoanInt,200000) + '%';
  document.getElementById('loan-24b-bar').style.width = pf(homeLoanInt,200000) + '%';
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
      return `<div class="ins-card ${urgent}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div>
            <span class="ins-type-badge ${typeClasses[p.type]}">${typeIcons[p.type]} ${typeLabels[p.type]}</span>
            <div style="font-size:13px;font-weight:500;margin-top:5px">${p.name} ${memberTag(p.member)}</div>
            <div style="font-size:11px;color:var(--muted)">${p.insurer}${p.polno?' · '+p.polno:''}</div>
          </div>
          <div style="text-align:right;font-family:'DM Mono',monospace;font-size:13px;color:var(--accent)">${fmt(p.premium)}<div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em">${p.freq||'annual'}</div></div>
        </div>
        <div class="ins-meta">
          <div><div class="ins-meta-label">Cover</div><div class="ins-meta-val" style="color:var(--green)">${p.cover>=1e7?cr(p.cover):lk(p.cover)}</div></div>
          <div><div class="ins-meta-label">Due Date</div><div class="ins-meta-val">${p.dueDate||'—'}</div></div>
          <div><div class="ins-meta-label">Renewal In</div><div class="ins-meta-val">${dueTxt}</div></div>
        </div>
        <div class="prop-actions" style="margin-top:8px">
          <button class="btn btn-sm" onclick="openEditIns(${p.id})">Edit</button>
          <button class="btn btn-danger btn-sm" onclick="deleteIns(${p.id})">Delete</button>
        </div>
      </div>`;
    }).join('');
  }

  // Summary
  const lifeEl = list.filter(p=>p.type==='life');
  const healthSelf = list.filter(p=>p.type==='health'&&p.covered&&p.covered.some(c=>c.toLowerCase().includes('self')));
  const healthFam = list.filter(p=>p.type==='health');
  const autoEl = list.filter(p=>p.type==='auto');
  document.getElementById('ins-life-summary').textContent = lifeEl.length ? lifeEl.length+' policy/ies · '+cr(lifeCover) : '—';
  document.getElementById('ins-health-self').textContent = healthSelf.length ? fmt(healthSelf.reduce((s,p)=>s+p.cover,0)) : '—';
  document.getElementById('ins-health-family').textContent = healthFam.length ? fmt(healthCover)+' total' : '—';
  document.getElementById('ins-auto-summary').textContent = autoEl.length ? autoEl.length+' vehicle(s)' : '—';
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
        <div class="budget-label">${cat}</div>
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
        <div style="font-size:12px;color:var(--text2)">${cat}</div>
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
    `<div class="budget-form-row form-group" data-cat="${cat}">
      <label class="form-label">${cat}</label>
      <input class="form-input" type="number" placeholder="0" value="${D.budgets[cat]||''}">
    </div>`
  ).join('');
}

// ─────────────────────────────────────────────
// TAX
// ─────────────────────────────────────────────
function renderTax() {
  const t = D.tax;
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
}

// ─────────────────────────────────────────────
// TRANSACTIONS
// ─────────────────────────────────────────────
function renderTxns() {
  const list = filterByMember(D.transactions);
  const el = document.getElementById('txn-list');
  if (!list.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">≡</div>No transactions</div>';
    return;
  }
  const catColors = {
    'Food & Dining':'#b5813a','Travel':'#4a7c6f','Shopping':'#7b5ea7','Utilities':'#3a7d54',
    'Entertainment':'#c0392b','Healthcare':'#4a6fa5','Education':'#c0692b','Insurance':'#7ab8a0',
    'Investment':'#3a7d54','Salary':'#3a7d54','EMI':'#7b5ea7','Other':'#8a8279'
  };
  el.innerHTML = list.slice(0,60).map(t =>
    `<div class="txn-row">
      <div class="txn-left">
        <div class="txn-dot" style="background:${catColors[t.cat]||'#8a8279'}"></div>
        <div>
          <div class="txn-name">${t.desc} ${memberTag(t.member)}</div>
          <div class="txn-cat">${t.cat} · ${t.date}</div>
        </div>
      </div>
      <div class="txn-amount ${t.type}">${t.type==='debit'?'−':'+'}${fmt(t.amount)}</div>
    </div>`
  ).join('');
}

// ─────────────────────────────────────────────
// CSV IMPORT
// ─────────────────────────────────────────────
let selectedBank = 'icici-salary';
let parsedRows = [];

const BANK_CONFIGS = {
  'icici-salary': {
    label:'ICICI Bank (Savings/Salary)', account:'icici-salary',
    hint:'ICICI CSV: Date, Description, Debit, Credit, Balance',
    skipRows:1,
    parse(row) {
      if (!row[1]) return null;
      const date = parseDate(row[0],'DD/MM/YYYY') || parseDate(row[0],'YYYY-MM-DD');
      if (!date) return null;
      const debit = cleanAmt(row[2]), credit = cleanAmt(row[3]);
      if (debit===0 && credit===0) return null;
      return {date, desc:row[1].trim(), amount:debit||credit, type:debit>0?'debit':'credit', cat:autoCategory(row[1])};
    }
  },
  'icici-cc': {
    label:'ICICI Credit Card', account:'icici-cc',
    hint:'ICICI CC CSV: Date, Description, Amount',
    skipRows:1,
    parse(row) {
      if (!row[1]) return null;
      const date = parseDate(row[0],'DD/MM/YYYY') || parseDate(row[0],'YYYY-MM-DD');
      if (!date) return null;
      const amt = cleanAmt(row[2]||row[3]);
      if (amt===0) return null;
      const isCredit = (row[2]||'').trim()===''&&cleanAmt(row[3])>0;
      return {date, desc:row[1].trim(), amount:Math.abs(amt), type:isCredit?'credit':'debit', cat:autoCategory(row[1])};
    }
  },
  'sc': {
    label:'Standard Chartered', account:'sc-savings',
    hint:'SC CSV: Transaction Date, Description, Debit Amount, Credit Amount',
    skipRows:1,
    parse(row) {
      if (!row[1]) return null;
      const date = parseDate(row[0],'DD MMM YYYY') || parseDate(row[0],'DD/MM/YYYY') || parseDate(row[0],'YYYY-MM-DD');
      if (!date) return null;
      const debit = cleanAmt(row[2]), credit = cleanAmt(row[3]);
      if (debit===0&&credit===0) return null;
      return {date, desc:row[1].trim(), amount:debit||credit, type:debit>0?'debit':'credit', cat:autoCategory(row[1])};
    }
  },
  'amex': {
    label:'American Express', account:'amex',
    hint:'Amex CSV: Date, Description, Amount (positive=spend)',
    skipRows:1,
    parse(row) {
      if (!row[1]) return null;
      const date = parseDate(row[0],'DD/MM/YYYY') || parseDate(row[0],'YYYY-MM-DD') || parseDate(row[0],'MM/DD/YYYY');
      if (!date) return null;
      const rawAmt = cleanAmtSigned(row[2]);
      if (rawAmt===0) return null;
      return {date, desc:row[1].trim(), amount:Math.abs(rawAmt), type:rawAmt>0?'debit':'credit', cat:autoCategory(row[1])};
    }
  }
};

function parseDate(str, fmt) {
  if (!str) return null;
  str = str.trim().replace(/"/g,'');
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
  } catch(e) {}
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

function autoCategory(desc) {
  if (!desc) return 'Other';
  const d = desc.toLowerCase();
  if (/swiggy|zomato|dominos|food|restaurant|cafe|biryani|pizza/i.test(d)) return 'Food & Dining';
  if (/uber|ola|rapido|redbus|irctc|flight|airways|airline|train|makemytrip/i.test(d)) return 'Travel';
  if (/amazon|flipkart|myntra|meesho|nykaa|blinkit|zepto|shopping/i.test(d)) return 'Shopping';
  if (/electricity|water|gas|broadband|airtel|jio|bsnl|recharge|utility/i.test(d)) return 'Utilities';
  if (/netflix|prime|hotstar|spotify|youtube|bookmyshow|pvr|inox/i.test(d)) return 'Entertainment';
  if (/pharmacy|hospital|doctor|clinic|medplus|apollo|health|medical/i.test(d)) return 'Healthcare';
  if (/school|college|udemy|coursera|education|tuition|fees/i.test(d)) return 'Education';
  if (/insurance|lic|hdfc life|bajaj|star health/i.test(d)) return 'Insurance';
  if (/mutual fund|sip|zerodha|groww|upstox|nse|bse|dividend/i.test(d)) return 'Investment';
  if (/emi|loan|home loan|car loan/i.test(d)) return 'EMI';
  if (/salary|credit|neft cr|upi cr|rtgs cr/i.test(d)) return 'Salary';
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

function parseCSV(event) {
  const file = event.target.files[0];
  if (!file) return;
  const cfg = BANK_CONFIGS[selectedBank];
  const reader = new FileReader();
  reader.onload = function(e) {
    const lines = e.target.result.split('\n').filter(l => l.trim());
    parsedRows = [];
    const previewRows = [];
    const skipped = cfg.skipRows || 1;
    for (let i = 0; i < lines.length; i++) {
      const row = parseCSVLine(lines[i]);
      if (i < skipped) { previewRows.push({header:true,row}); continue; }
      try {
        const parsed = cfg.parse(row);
        if (parsed) { parsedRows.push(parsed); if (previewRows.length < 8) previewRows.push({header:false,row:parsed}); }
      } catch(ex) {}
    }
    const resultEl = document.getElementById('parse-result');
    resultEl.style.display = 'block';
    const statusEl = document.getElementById('parse-status-badge');
    statusEl.innerHTML = parsedRows.length > 0
      ? `<span class="parse-status parse-ok">✓ ${parsedRows.length} transactions found</span>`
      : `<span class="parse-status" style="background:var(--red-light);color:var(--red)">✗ No transactions parsed</span>`;
    const table = document.getElementById('parse-preview-table');
    table.innerHTML = `<div class="parse-row"><div class="parse-cell parse-header val">Date</div><div class="parse-cell parse-header val">Description</div><div class="parse-cell parse-header val">Amount</div><div class="parse-cell parse-header val">Type</div><div class="parse-cell parse-header val">Category</div></div>` +
      previewRows.filter(r=>!r.header).slice(0,8).map(r =>
        `<div class="parse-row"><div class="parse-cell val">${r.row.date}</div><div class="parse-cell val">${r.row.desc}</div><div class="parse-cell val" style="color:var(--accent)">₹${r.row.amount.toLocaleString('en-IN')}</div><div class="parse-cell val" style="color:${r.row.type==='debit'?'var(--red)':'var(--green)'}">${r.row.type}</div><div class="parse-cell val">${r.row.cat}</div></div>`
      ).join('');
    document.getElementById('parse-summary').textContent =
      `File: ${file.name} · ${lines.length-skipped} rows read · ${parsedRows.length} valid · ${lines.length-skipped-parsedRows.length} skipped`;
    event.target.value = '';
  };
  reader.readAsText(file);
}

function confirmImport() {
  if (!parsedRows.length) return;
  const cfg = BANK_CONFIGS[selectedBank];
  const existing = new Set(D.transactions.map(t => t.date+'|'+t.desc+'|'+t.amount));
  let added = 0, dupes = 0;
  parsedRows.forEach(r => {
    const key = r.date+'|'+r.desc+'|'+r.amount;
    if (existing.has(key)) { dupes++; return; }
    D.transactions.unshift({
      id: Date.now()+Math.random(),
      desc: r.desc, amount: r.amount, type: r.type,
      cat: r.cat, member: currentMember === 'all' ? 'madhu' : currentMember,
      date: r.date
    });
    added++;
  });
  D.transactions.sort((a,b) => new Date(b.date) - new Date(a.date));
  save(); renderAll();
  document.getElementById('parse-status-badge').innerHTML =
    `<span class="parse-status parse-ok">✓ Imported ${added} · ${dupes} duplicates skipped</span>`;
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
renderAll();
