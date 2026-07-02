import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { getFirestore, doc, setDoc, onSnapshot, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged, setPersistence, browserLocalPersistence } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';

const $ = (id) => document.getElementById(id);
const on = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };
const setText = (id, val) => { const el = $(id); if (el) el.textContent = val; };
const val = (id) => $(id)?.value ?? '';
const num = (id) => Number(val(id) || 0);
const clear = (...ids) => ids.forEach(id => { const el = $(id); if (el) el.value = ''; });
const money = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const uid = () => crypto.randomUUID();
const monthNames = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

let selectedYear = new Date().getFullYear();
let selectedMonth = new Date().getMonth() + 1;
let state = emptyState();
let currentUser = null;
let userRef = null;
let unsubscribeCloud = null;
let applyingCloud = false;
let chartCategories = null;
let chartDistribution = null;
let chartAnnual = null;
let firebaseReady = false;
let app, db, auth, provider;

function showLoginError(message) {
  const box = $('loginError');
  if (!box) return;
  box.textContent = message;
  box.classList.remove('hidden');
}

function hideLoginError() {
  $('loginError')?.classList.add('hidden');
}

function firebaseConfigOk() {
  return firebaseConfig
    && firebaseConfig.apiKey
    && firebaseConfig.apiKey !== 'COLE_AQUI'
    && firebaseConfig.projectId
    && firebaseConfig.projectId !== 'COLE_AQUI';
}

async function initFirebase() {
  try {
    if (!firebaseConfigOk()) {
      setText('topStatus', '⚠️ Firebase não configurado. Preencha firebase-config.js.');
      showLoginError('Firebase não configurado. Preencha o arquivo firebase-config.js com suas chaves antes de usar o login.');
      return;
    }

    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
    auth.useDeviceLanguage();
    await setPersistence(auth, browserLocalPersistence);

    provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    firebaseReady = true;

    await handleRedirectResult();
    listenAuth();

  } catch (err) {
    console.error('Erro iniciando Firebase:', err);
    showLoginError('Erro ao iniciar Firebase: ' + (err.code || err.message || err));
    setText('topStatus', '⚠️ Erro ao iniciar Firebase.');
  }
}

function emptyState() {
  return {
    version: 8,
    settings: { salaryDefault: 0, theme: 'purple', onboardingDone: false },
    baseBills: [],
    months: {},
    installments: [],
    cards: [],
    purchases: [],
    goals: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastSync: null
  };
}

function monthKey(y = selectedYear, m = selectedMonth) {
  return `${y}-${String(m).padStart(2, '0')}`;
}

function parseMonthKey(key) {
  const [y, m] = key.split('-').map(Number);
  return { year: y, month: m };
}

function monthsDiff(startKey, targetKey) {
  const a = parseMonthKey(startKey);
  const b = parseMonthKey(targetKey);
  return (b.year - a.year) * 12 + (b.month - a.month);
}

function emptyMonth(y, m) {
  return {
    key: monthKey(y, m),
    year: y,
    month: m,
    salary: 0,
    bills: [],
    expenses: [],
    incomes: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function ensureMonth(y = selectedYear, m = selectedMonth) {
  const key = monthKey(y, m);
  if (!state.months[key]) {
    const month = emptyMonth(y, m);
    month.salary = Number(state.settings.salaryDefault || 0);
    month.bills = state.baseBills.map(b => ({
      id: uid(),
      baseId: b.id,
      name: b.name,
      value: Number(b.value || 0),
      day: Number(b.day || 5),
      status: 'Pendente'
    }));
    state.months[key] = month;
  }
  return state.months[key];
}

function currentMonth() {
  return ensureMonth();
}

function applyTheme(theme) {
  const allowed = ['purple', 'dark', 'blue', 'green', 'light'];
  const t = allowed.includes(theme) ? theme : 'purple';
  document.body.classList.remove('theme-purple','theme-dark','theme-blue','theme-green','theme-light');
  document.body.classList.add('theme-' + t);
  if ($('themeSelect')) $('themeSelect').value = t;
}

function migrate(data) {
  if (!data || typeof data !== 'object') return emptyState();
  if (data.version === 8) {
    data.settings = data.settings || { salaryDefault: 0, theme: 'purple' };
    data.baseBills = data.baseBills || [];
    data.months = data.months || {};
    data.installments = data.installments || [];
    data.cards = data.cards || [];
    data.purchases = data.purchases || [];
    data.goals = data.goals || [];
    Object.values(data.months).forEach(m => {
      m.bills = m.bills || [];
      m.expenses = m.expenses || [];
      m.incomes = m.incomes || [];
    });
    return data;
  }

  const next = emptyState();
  next.settings.salaryDefault = data.settings?.salaryDefault || data.settings?.salarioPadrao || data.base?.salarioPadrao || data.salario || 0;
  next.settings.theme = data.settings?.theme || 'purple';
  next.baseBills = (data.baseBills || data.base?.contasFixas || data.contas || []).map(x => ({
    id: uid(),
    name: x.name || x.nome || 'Conta',
    value: Number(x.value || x.valor || 0),
    day: Number(x.day || x.dia || 5)
  }));
  next.goals = (data.goals || data.metas || []).map(x => ({
    id: x.id || uid(),
    name: x.name || x.nome || 'Meta',
    current: Number(x.current ?? x.atual ?? 0),
    target: Number(x.target ?? x.objetivo ?? 0)
  }));
  return next;
}

async function save() {
  render();
  if (!userRef || !currentUser || applyingCloud) return;
  state.updatedAt = new Date().toISOString();
  state.lastSync = new Date().toISOString();
  await setDoc(userRef, { owner: currentUser.uid, data: state, updatedAt: state.updatedAt });
}

function totalsForKey(key = monthKey()) {
  const { year, month } = parseMonthKey(key);
  const oldY = selectedYear;
  const oldM = selectedMonth;
  selectedYear = year;
  selectedMonth = month;
  const t = totals();
  selectedYear = oldY;
  selectedMonth = oldM;
  return t;
}

function activeInstallments(key = monthKey()) {
  return state.installments.filter(item => {
    const start = item.startKey || key;
    const diff = monthsDiff(start, key);
    return diff >= 0 && diff < Number(item.total || 1);
  }).map(item => ({
    ...item,
    current: monthsDiff(item.startKey || key, key) + 1,
    total: Number(item.total || 1)
  }));
}

function purchaseValueForMonth(item, key = monthKey()) {
  const diff = monthsDiff(item.startKey, key);
  const parts = Number(item.installments || 1);
  if (diff < 0 || diff >= parts) return 0;
  return Number(item.value || 0) / parts;
}

function cardsTotal(key = monthKey()) {
  return state.purchases.reduce((sum, item) => sum + purchaseValueForMonth(item, key), 0);
}

function totals() {
  const m = currentMonth();
  const salary = Number(m.salary || 0);
  const incomes = m.incomes.reduce((a, b) => a + Number(b.value || 0), 0);
  const entry = salary + incomes;
  const bills = m.bills.reduce((a, b) => a + Number(b.value || 0), 0);
  const expenses = m.expenses.reduce((a, b) => a + Number(b.value || 0), 0);
  const installments = activeInstallments().reduce((a, b) => a + Number(b.value || 0), 0);
  const cards = cardsTotal();
  const out = bills + expenses + installments + cards;
  const balance = entry - out;
  const reserve = state.goals.find(g => String(g.name || '').toLowerCase().includes('reserva'))?.current || 0;
  const economy = entry > 0 ? Math.max(0, Math.round((balance / entry) * 100)) : 0;
  return { salary, incomes, entry, bills, expenses, installments, cards, debt: installments + cards, out, balance, reserve, economy };
}

function setupMonthSelectors() {
  const month = $('monthSelect');
  const year = $('yearSelect');
  if (!month || !year) return;
  month.innerHTML = monthNames.map((name, i) => `<option value="${i + 1}">${name}</option>`).join('');
  const currentYear = new Date().getFullYear();
  year.innerHTML = Array.from({ length: 9 }, (_, i) => currentYear - 3 + i).map(y => `<option value="${y}">${y}</option>`).join('');
  month.value = selectedMonth;
  year.value = selectedYear;
}

async function loginGoogle() {
  hideLoginError();

  if (!firebaseReady || !auth || !provider) {
    showLoginError('Firebase não está pronto. Confira o firebase-config.js.');
    return;
  }

  const btn = $('btnLogin');

  try {
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Abrindo Google...';
    }

    setText('topStatus', '🔄 Abrindo login do Google...');

    // Primeiro tenta popup, que costuma manter a sessão melhor no GitHub Pages.
    await signInWithPopup(auth, provider);

  } catch (err) {
    console.warn('Popup falhou:', err);

    const popupErrors = [
      'auth/popup-blocked',
      'auth/popup-closed-by-user',
      'auth/cancelled-popup-request'
    ];

    if (popupErrors.includes(err.code)) {
      try {
        setText('topStatus', '🔄 Popup bloqueado. Redirecionando para o Google...');
        await signInWithRedirect(auth, provider);
        return;
      } catch (redirectErr) {
        console.error('Redirect também falhou:', redirectErr);
        showLoginError('Erro no redirect do Google: ' + (redirectErr.code || redirectErr.message || redirectErr));
      }
    } else {
      let msg = 'Erro ao abrir login Google: ' + (err.code || err.message || err);
      if (err.code === 'auth/unauthorized-domain') msg = 'Domínio não autorizado no Firebase. Adicione o domínio do GitHub Pages em Authentication > Settings > Authorized domains.';
      if (err.code === 'auth/operation-not-allowed') msg = 'Google não está ativado. Ative em Firebase > Authentication > Sign-in method > Google.';
      if (err.code === 'auth/network-request-failed') msg = 'Falha de rede no login Google. Tente de novo.';
      showLoginError(msg);
    }

    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Entrar com Google';
    }

    setText('topStatus', '⚠️ Erro no login Google.');
  }
}

async function handleRedirectResult() {
  if (!auth) return;
  try {
    const result = await getRedirectResult(auth);
    if (result?.user) {
      hideLoginError();
      setText('topStatus', '✅ Login Google realizado.');
    }
  } catch (err) {
    console.error('Erro no retorno do Google:', err);
    let msg = 'Erro no retorno do login Google: ' + (err.code || err.message || err);
    if (err.code === 'auth/unauthorized-domain') msg = 'Domínio não autorizado no Firebase. Adicione seu domínio GitHub Pages nos domínios autorizados.';
    if (err.code === 'auth/operation-not-allowed') msg = 'Google não está ativado no Firebase Authentication.';
    if (err.code === 'auth/network-request-failed') msg = 'Falha de rede no login Google. Tente de novo.';
    showLoginError(msg);
    setText('topStatus', '⚠️ Erro no retorno do login Google.');
  }
}

function listenAuth() {
  if (!auth) return;

  onAuthStateChanged(auth, async user => {
    currentUser = user;

    const btn = $('btnLogin');
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Entrar com Google';
    }

    if (!user) {
      $('loginScreen')?.classList.remove('hidden');
      $('appScreen')?.classList.add('hidden');
      setText('topStatus', '🔐 Faça login com Google para sincronizar seus dados');
      return;
    }

    hideLoginError();

    const firstName = (user.displayName || user.email || 'Usuário').split(' ')[0];
    $('loginScreen')?.classList.add('hidden');
    $('appScreen')?.classList.remove('hidden');

    setText('topStatus', `☁️ Sincronizado com Google — ${firstName}`);
    setText('brandName', firstName);
    setText('mobileName', firstName);
    setText('userFirstName', firstName);
    setText('userEmail', user.email || '');
    setText('welcomeText', `Olá, ${firstName}!`);
    setText('avatarLetter', (firstName[0] || 'U').toUpperCase());
    if ($('userPhoto')) $('userPhoto').src = user.photoURL || '';

    try {
      userRef = doc(db, 'users', user.uid);
      const snap = await getDoc(userRef);

      if (!snap.exists()) {
        state = emptyState();
        await setDoc(userRef, { owner: user.uid, data: state, updatedAt: state.updatedAt });
      }

      if (unsubscribeCloud) unsubscribeCloud();
      unsubscribeCloud = onSnapshot(userRef, docSnap => {
        if (!docSnap.exists()) return;
        applyingCloud = true;
        state = migrate(docSnap.data().data);
        ensureMonth();
        render();
        applyingCloud = false;
      }, err => {
        console.error('Erro Firestore:', err);
        setText('topStatus', '⚠️ Erro no Firestore. Confira as regras.');
        showLoginError('Login funcionou, mas o Firestore bloqueou os dados. Confira as regras do Firestore.');
      });
    } catch (err) {
      console.error('Erro carregando dados:', err);
      showLoginError('Login funcionou, mas houve erro ao carregar seus dados: ' + (err.code || err.message || err));
    }
  });
}

function openPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav').forEach(n => n.classList.remove('active'));
  $(page)?.classList.add('active');
  document.querySelector(`[data-page="${page}"]`)?.classList.add('active');
  setText('pageTitle', document.querySelector(`[data-page="${page}"]`)?.textContent.replace(/[^\wÀ-ÿ ]/g, '').trim() || 'Dashboard');
  $('sidebar')?.classList.remove('open');
}

function addBill() {
  if (!val('billName') || !num('billValue')) return alert('Preencha nome e valor.');
  currentMonth().bills.push({ id: uid(), name: val('billName'), value: num('billValue'), day: num('billDay') || 5, status: val('billStatus') || 'Pendente' });
  clear('billName','billValue','billDay');
  save();
}

function addBase() {
  if (!val('baseName') || !num('baseValue')) return alert('Preencha nome e valor.');
  state.baseBills.push({ id: uid(), name: val('baseName'), value: num('baseValue'), day: num('baseDay') || 5 });
  clear('baseName','baseValue','baseDay');
  save();
}

function addExpense() {
  if (!val('expenseDesc') || !num('expenseValue')) return alert('Preencha descrição e valor.');
  currentMonth().expenses.unshift({ id: uid(), desc: val('expenseDesc'), value: num('expenseValue'), cat: val('expenseCat'), date: new Date().toISOString() });
  clear('expenseDesc','expenseValue');
  save();
}

function addIncome() {
  if (!val('incomeDesc') || !num('incomeValue')) return alert('Preencha descrição e valor.');
  currentMonth().incomes.unshift({ id: uid(), desc: val('incomeDesc'), value: num('incomeValue'), cat: val('incomeCat'), date: new Date().toISOString() });
  clear('incomeDesc','incomeValue');
  save();
}

function addInstallment() {
  if (!val('installName') || !num('installValue') || !num('installTotal')) return alert('Preencha nome, valor e total de parcelas.');
  state.installments.push({ id: uid(), name: val('installName'), value: num('installValue'), total: num('installTotal'), startKey: val('installStart') || monthKey() });
  clear('installName','installValue','installTotal','installStart');
  save();
}

function addCard() {
  if (!val('cardName') || !num('cardLimit')) return alert('Preencha nome e limite.');
  state.cards.push({ id: uid(), name: val('cardName'), limit: num('cardLimit'), due: num('cardDue') || 10 });
  clear('cardName','cardLimit','cardDue');
  save();
}

function addPurchase() {
  if (!val('purchaseCard') || !val('purchaseDesc') || !num('purchaseValue')) return alert('Preencha cartão, descrição e valor.');
  state.purchases.push({ id: uid(), cardId: val('purchaseCard'), desc: val('purchaseDesc'), value: num('purchaseValue'), installments: num('purchaseInstallments') || 1, startKey: monthKey() });
  clear('purchaseDesc','purchaseValue','purchaseInstallments');
  save();
}

function addGoal() {
  if (!val('goalName') || !num('goalTarget')) return alert('Preencha nome e objetivo.');
  state.goals.push({ id: uid(), name: val('goalName'), current: num('goalCurrent'), target: num('goalTarget') });
  clear('goalName','goalCurrent','goalTarget');
  save();
}

function applySetup(demo = false) {
  if (demo) {
    $('setupSalary').value = 3062;
    $('setupReserve').value = 7500;
    $('setupCollege').value = 10000;
    return;
  }

  state.settings.salaryDefault = num('setupSalary');
  currentMonth().salary = num('setupSalary');

  if (num('setupReserve')) state.goals.push({ id: uid(), name: 'Reserva de emergência', current: 0, target: num('setupReserve') });
  if (num('setupCollege')) state.goals.push({ id: uid(), name: 'Faculdade', current: 0, target: num('setupCollege') });

  state.settings.onboardingDone = true;
  save();
}

function resetStatus() {
  if (!confirm('Resetar todas as contas deste mês para Pendente?')) return;
  currentMonth().bills.forEach(b => b.status = 'Pendente');
  save();
}

function resetMonth() {
  if (!confirm('Resetar o mês inteiro? Isso apaga gastos/receitas do mês e recria as contas fixas como Pendente.')) return;
  const key = monthKey();
  const fresh = emptyMonth(selectedYear, selectedMonth);
  fresh.salary = Number(state.settings.salaryDefault || 0);
  fresh.bills = state.baseBills.map(b => ({ id: uid(), baseId: b.id, name: b.name, value: Number(b.value || 0), day: Number(b.day || 5), status: 'Pendente' }));
  state.months[key] = fresh;
  save();
}

function nextMonth() {
  selectedMonth++;
  if (selectedMonth > 12) {
    selectedMonth = 1;
    selectedYear++;
  }
  if ($('monthSelect')) $('monthSelect').value = selectedMonth;
  if ($('yearSelect')) $('yearSelect').value = selectedYear;
  ensureMonth();
  save();
}

function openSelectedMonth() {
  selectedMonth = Number(val('monthSelect')) || selectedMonth;
  selectedYear = Number(val('yearSelect')) || selectedYear;
  ensureMonth();
  save();
}

function saveConfig() {
  state.settings.salaryDefault = num('configSalary');
  state.settings.theme = val('themeSelect') || 'purple';
  currentMonth().salary = num('configSalary');
  applyTheme(state.settings.theme);
  save();
}

function exportBackup() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'backup-financas-v8.json';
  a.click();
}

async function importBackup(file) {
  if (!file) return;
  try {
    state = migrate(JSON.parse(await file.text()));
    await save();
    alert('Backup importado.');
  } catch {
    alert('Arquivo inválido.');
  }
}

function resetAccount() {
  if (!confirm('Resetar a conta completa deste usuário? Isso apaga tudo.')) return;
  state = emptyState();
  save();
}

function editMonthBill(id) {
  const item = currentMonth().bills.find(x => x.id === id);
  if (!item) return;
  const name = prompt('Nome:', item.name);
  if (name === null) return;
  const value = prompt('Valor:', item.value);
  if (value === null) return;
  const day = prompt('Dia:', item.day);
  if (day === null) return;
  item.name = name;
  item.value = Number(value || 0);
  item.day = Number(day || 5);
  save();
}

function editBaseBill(id) {
  const item = state.baseBills.find(x => x.id === id);
  if (!item) return;
  const name = prompt('Nome:', item.name);
  if (name === null) return;
  const value = prompt('Valor:', item.value);
  if (value === null) return;
  const day = prompt('Dia:', item.day);
  if (day === null) return;
  item.name = name;
  item.value = Number(value || 0);
  item.day = Number(day || 5);
  save();
}

function updateGoal(id) {
  const item = state.goals.find(x => x.id === id);
  const input = $(`goal-${id}`);
  if (!item || !input) return;
  item.current = Number(input.value || 0);
  save();
}

function removeItem(scope, type, id) {
  if (scope === 'month') currentMonth()[type] = currentMonth()[type].filter(x => x.id !== id);
  if (scope === 'state') state[type] = state[type].filter(x => x.id !== id);
  save();
}

function setBillStatus(id, status) {
  const item = currentMonth().bills.find(x => x.id === id);
  if (item) item.status = status;
  save();
}

function openHistory(key) {
  const parsed = parseMonthKey(key);
  selectedYear = parsed.year;
  selectedMonth = parsed.month;
  if ($('monthSelect')) $('monthSelect').value = selectedMonth;
  if ($('yearSelect')) $('yearSelect').value = selectedYear;
  ensureMonth();
  openPage('dashboard');
  render();
}

document.addEventListener('click', e => {
  const page = e.target.dataset.openPage || e.target.dataset.page;
  if (page) openPage(page);

  const action = e.target.dataset.action;
  if (!action) return;

  if (action === 'add-bill') addBill();
  if (action === 'add-base') addBase();
  if (action === 'add-expense') addExpense();
  if (action === 'add-income') addIncome();
  if (action === 'add-installment') addInstallment();
  if (action === 'add-card') addCard();
  if (action === 'add-purchase') addPurchase();
  if (action === 'add-goal') addGoal();
  if (action === 'apply-setup') applySetup(false);
  if (action === 'demo-maycon') applySetup(true);
  if (action === 'reset-status') resetStatus();
  if (action === 'reset-month') resetMonth();
  if (action === 'next-month') nextMonth();
  if (action === 'save-config') saveConfig();
  if (action === 'export') exportBackup();
  if (action === 'reset-account') resetAccount();
  if (action === 'logout') signOut(auth);
});

document.addEventListener('change', e => {
  const statusId = e.target.dataset.statusId;
  if (statusId) setBillStatus(statusId, e.target.value);
});

function rowActions(actions) {
  return actions.map(a => `<button class="icon" ${a.attrs || ''}>${a.text}</button>`).join('');
}

function renderBills() {
  const m = currentMonth();
  const html = m.bills.map(b => `
    <div class="row">
      <div><strong>${esc(b.name)}</strong><small>${money(b.value)} • vence dia ${b.day}</small></div>
      <select class="status ${b.status}" data-status-id="${b.id}">
        ${['Pago','Pendente','Atrasado'].map(s => `<option ${b.status === s ? 'selected' : ''}>${s}</option>`).join('')}
      </select>
      ${rowActions([
        { text: 'Editar', attrs: `onclick="window.editMonthBill('${b.id}')"` },
        { text: 'Excluir', attrs: `onclick="window.removeItem('month','bills','${b.id}')"` }
      ])}
    </div>`).join('') || '<p class="muted">Nenhuma conta neste mês.</p>';

  $('monthBills').innerHTML = html;
  $('dashBills').innerHTML = m.bills.slice().sort((a,b) => a.day - b.day).slice(0, 6).map(b => `
    <div class="row">
      <div><strong>${esc(b.name)}</strong><small>${money(b.value)} • dia ${b.day}</small></div>
      <span class="status ${b.status}">${b.status}</span><span></span><span></span>
    </div>`).join('') || '<p class="muted">Cadastre fixas ou contas do mês.</p>';

  const paid = m.bills.filter(b => b.status === 'Pago').length;
  setText('paidSummary', `${paid}/${m.bills.length} pagas`);
}

function renderBaseBills() {
  $('baseBills').innerHTML = state.baseBills.map(b => `
    <div class="row">
      <div><strong>${esc(b.name)}</strong><small>${money(b.value)} • vence dia ${b.day}</small></div>
      <span class="badge">Base</span>
      ${rowActions([
        { text: 'Editar', attrs: `onclick="window.editBaseBill('${b.id}')"` },
        { text: 'Excluir', attrs: `onclick="window.removeItem('state','baseBills','${b.id}')"` }
      ])}
    </div>`).join('') || '<p class="muted">Nenhuma fixa cadastrada.</p>';
}

function renderExpenses() {
  const m = currentMonth();
  setText('expensesTotal', money(m.expenses.reduce((a,b) => a + Number(b.value || 0), 0)));
  $('expensesList').innerHTML = m.expenses.map(x => `
    <div class="row">
      <div><strong>${esc(x.desc)}</strong><small>${esc(x.cat)} • ${new Date(x.date).toLocaleDateString('pt-BR')}</small></div>
      <strong>${money(x.value)}</strong>
      ${rowActions([{ text: 'Excluir', attrs: `onclick="window.removeItem('month','expenses','${x.id}')"` }])}
      <span></span>
    </div>`).join('') || '<p class="muted">Nenhum gasto neste mês.</p>';
}

function renderIncomes() {
  const m = currentMonth();
  setText('incomesTotal', money(m.incomes.reduce((a,b) => a + Number(b.value || 0), 0)));
  $('incomesList').innerHTML = m.incomes.map(x => `
    <div class="row">
      <div><strong>${esc(x.desc)}</strong><small>${esc(x.cat)} • ${new Date(x.date).toLocaleDateString('pt-BR')}</small></div>
      <strong>${money(x.value)}</strong>
      ${rowActions([{ text: 'Excluir', attrs: `onclick="window.removeItem('month','incomes','${x.id}')"` }])}
      <span></span>
    </div>`).join('') || '<p class="muted">Nenhuma receita extra neste mês.</p>';
}

function renderInstallments() {
  const active = activeInstallments();
  setText('installmentsTotal', money(active.reduce((a,b) => a + Number(b.value || 0), 0)));
  $('installmentsList').innerHTML = state.installments.map(x => {
    const a = active.find(i => i.id === x.id);
    return `
      <div class="row">
        <div><strong>${esc(x.name)}</strong><small>${money(x.value)} • ${x.total}x • início ${x.startKey}</small></div>
        <span class="badge">${a ? `ativa ${a.current}/${a.total}` : 'fora do mês'}</span>
        ${rowActions([{ text: 'Excluir', attrs: `onclick="window.removeItem('state','installments','${x.id}')"` }])}
        <span></span>
      </div>`;
  }).join('') || '<p class="muted">Nenhum parcelamento.</p>';
}

function renderCards() {
  $('purchaseCard').innerHTML = state.cards.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  setText('cardsTotal', money(cardsTotal()));

  const cardsHtml = state.cards.map(c => {
    const spent = state.purchases.filter(p => p.cardId === c.id).reduce((a,b) => a + Number(b.value || 0), 0);
    return `
      <div class="row">
        <div><strong>${esc(c.name)}</strong><small>Limite ${money(c.limit)} • vence dia ${c.due}</small></div>
        <span class="badge">${money(Number(c.limit || 0) - spent)} livre</span>
        ${rowActions([{ text: 'Excluir', attrs: `onclick="window.removeItem('state','cards','${c.id}')"` }])}
        <span></span>
      </div>`;
  }).join('');

  const purchasesHtml = state.purchases.map(p => `
    <div class="row">
      <div><strong>${esc(p.desc)}</strong><small>${money(p.value)} em ${p.installments}x • início ${p.startKey}</small></div>
      <span class="badge">${money(purchaseValueForMonth(p))} este mês</span>
      ${rowActions([{ text: 'Excluir', attrs: `onclick="window.removeItem('state','purchases','${p.id}')"` }])}
      <span></span>
    </div>`).join('');

  $('cardsList').innerHTML = (cardsHtml + purchasesHtml) || '<p class="muted">Nenhum cartão cadastrado.</p>';
}

function goalCard(g) {
  const pct = g.target ? Math.min(100, Math.round((g.current / g.target) * 100)) : 0;
  return `
    <div class="goal">
      <div class="goal-top"><strong>${esc(g.name)}</strong><span>${pct}%</span></div>
      <div class="bar"><div style="width:${pct}%"></div></div>
      <div class="goal-foot"><span>${money(g.current)}</span><span>${money(g.target)}</span></div>
      <div class="goal-edit">
        <input id="goal-${g.id}" type="number" step="0.01" placeholder="Novo valor atual">
        <button class="btn glass" onclick="window.updateGoal('${g.id}')">Atualizar</button>
        <button class="btn danger" onclick="window.removeItem('state','goals','${g.id}')">Excluir</button>
      </div>
    </div>`;
}

function renderGoals() {
  $('goalsList').innerHTML = state.goals.map(goalCard).join('') || '<p class="muted">Nenhuma meta cadastrada.</p>';
  $('dashGoals').innerHTML = state.goals.slice(0,3).map(goalCard).join('') || '<p class="muted">Adicione metas para acompanhar.</p>';
}

function renderHistory() {
  const keys = Object.keys(state.months).sort().reverse();
  $('historyList').innerHTML = keys.map(key => {
    const m = state.months[key];
    const t = totalsForKey(key);
    const paid = m.bills.filter(b => b.status === 'Pago').length;
    return `
      <div class="history-card">
        <strong>${monthNames[m.month - 1]} ${m.year}</strong>
        <small>Entrada: ${money(t.entry)}<br>Saída: ${money(t.out)}<br>Sobra: ${money(t.balance)}<br>Pagas: ${paid}/${m.bills.length}</small>
        <button class="btn glass" onclick="window.openHistory('${key}')">Abrir mês</button>
      </div>`;
  }).join('') || '<p class="muted">Nenhum mês criado ainda.</p>';
}

function renderAlerts(t) {
  const m = currentMonth();
  const alerts = [];
  m.bills.filter(b => b.status === 'Atrasado').forEach(b => alerts.push(`<div class="alert red"><strong>${esc(b.name)}</strong><br><span>Está atrasada neste mês.</span></div>`));
  m.bills.filter(b => b.status === 'Pendente' && Number(b.day) <= 10).slice(0,3).forEach(b => alerts.push(`<div class="alert yellow"><strong>${esc(b.name)}</strong><br><span>Vence no início do mês.</span></div>`));
  if (t.balance < 0) alerts.push(`<div class="alert red"><strong>Atenção</strong><br><span>Mês negativo em ${money(Math.abs(t.balance))}.</span></div>`);
  if (!alerts.length) alerts.push(`<div class="alert"><strong>Tudo certo</strong><br><span>Nenhum alerta crítico neste mês.</span></div>`);
  $('alerts').innerHTML = alerts.join('');
}

function renderCharts(t) {
  if (!window.Chart) return;
  const m = currentMonth();
  const cats = {};
  m.expenses.forEach(x => cats[x.cat] = (cats[x.cat] || 0) + Number(x.value || 0));

  if (chartCategories) chartCategories.destroy();
  if ($('chartCategories')) {
    chartCategories = new Chart($('chartCategories'), {
      type: 'doughnut',
      data: {
        labels: Object.keys(cats).length ? Object.keys(cats) : ['Sem gastos'],
        datasets: [{ data: Object.values(cats).length ? Object.values(cats) : [1], backgroundColor: ['#820AD1','#a855f7','#c084fc','#22c55e','#facc15','#ef4444','#2563eb'], borderWidth: 0 }]
      },
      options: { plugins: { legend: { labels: { color: getComputedStyle(document.body).getPropertyValue('--text'), font: { weight: 'bold' } } } } }
    });
  }

  if (chartDistribution) chartDistribution.destroy();
  if ($('chartDistribution')) {
    chartDistribution = new Chart($('chartDistribution'), {
      type: 'bar',
      data: {
        labels: ['Contas','Gastos','Parcelas','Cartões','Sobra'],
        datasets: [{ data: [t.bills, t.expenses, t.installments, t.cards, Math.max(0,t.balance)], backgroundColor: ['#820AD1','#a855f7','#c084fc','#facc15','#22c55e'], borderRadius: 12 }]
      },
      options: { plugins: { legend: { display: false } }, scales: { x: { ticks: { color: getComputedStyle(document.body).getPropertyValue('--text') }, grid: { display:false } }, y: { ticks: { color: getComputedStyle(document.body).getPropertyValue('--text') }, grid: { color:'rgba(255,255,255,.08)' } } } }
    });
  }
}

function renderAnnual() {
  const keys = Array.from({length:12}, (_,i) => `${selectedYear}-${String(i+1).padStart(2,'0')}`);
  const values = keys.map(k => state.months[k] ? totalsForKey(k) : { entry:0, out:0, balance:0 });
  const entry = values.reduce((a,b) => a + b.entry, 0);
  const out = values.reduce((a,b) => a + b.out, 0);
  const balance = values.reduce((a,b) => a + b.balance, 0);

  setText('annualLabel', String(selectedYear));
  setText('annualIn', money(entry));
  setText('annualOut', money(out));
  setText('annualBalance', money(balance));

  const ranked = values.map((v,i) => ({ i, balance:v.balance }));
  ranked.sort((a,b) => b.balance - a.balance);
  setText('annualBest', ranked[0] ? monthNames[ranked[0].i] : '-');
  ranked.sort((a,b) => a.balance - b.balance);
  setText('annualWorst', ranked[0] ? monthNames[ranked[0].i] : '-');

  if (!window.Chart || !$('chartAnnual')) return;
  if (chartAnnual) chartAnnual.destroy();
  chartAnnual = new Chart($('chartAnnual'), {
    type: 'line',
    data: {
      labels: monthNames,
      datasets: [{ label:'Sobra', data:values.map(v => v.balance), borderColor:'#c084fc', backgroundColor:'rgba(192,132,252,.18)', fill:true, tension:.35 }]
    },
    options: { plugins:{ legend:{ labels:{ color:getComputedStyle(document.body).getPropertyValue('--text') } } }, scales:{ x:{ ticks:{ color:getComputedStyle(document.body).getPropertyValue('--text') }, grid:{ display:false } }, y:{ ticks:{ color:getComputedStyle(document.body).getPropertyValue('--text') }, grid:{ color:'rgba(255,255,255,.08)' } } } }
  });
}

function render() {
  ensureMonth();
  applyTheme(state.settings.theme || 'purple');

  const t = totals();
  const m = currentMonth();

  if ($('monthSelect')) $('monthSelect').value = selectedMonth;
  if ($('yearSelect')) $('yearSelect').value = selectedYear;
  setText('currentMonthLabel', `${monthNames[selectedMonth - 1]} de ${selectedYear}`);

  setText('sidebarSobra', money(t.balance));
  setText('sidebarStatus', t.balance >= 0 ? 'Dentro do plano' : 'Mês negativo');
  setText('saldoHero', money(t.balance));
  setText('economiaPct', `${t.economy}%`);
  $('ring')?.style.setProperty('--pct', `${t.economy}%`);
  setText('fraseHero', t.balance >= 0 ? 'Boa, você ainda tem saldo previsto neste mês.' : 'Atenção: seus gastos passaram da entrada deste mês.');

  setText('kpiEntrada', money(t.entry));
  setText('kpiContas', money(t.bills));
  setText('kpiGastos', money(t.expenses));
  setText('kpiDividas', money(t.debt));
  setText('kpiReserva', money(t.reserve));

  if ($('configSalary')) $('configSalary').value = m.salary || state.settings.salaryDefault || 0;
  if ($('themeSelect')) $('themeSelect').value = state.settings.theme || 'purple';
  setText('syncLabel', state.lastSync ? 'Última sincronização: ' + new Date(state.lastSync).toLocaleString('pt-BR') : 'Aguardando sincronização...');

  renderBills();
  renderBaseBills();
  renderExpenses();
  renderIncomes();
  renderInstallments();
  renderCards();
  renderGoals();
  renderHistory();
  renderAlerts(t);
  renderCharts(t);
  renderAnnual();
}

window.editMonthBill = editMonthBill;
window.editBaseBill = editBaseBill;
window.updateGoal = updateGoal;
window.removeItem = removeItem;
window.openHistory = openHistory;

on('btnLogin', 'click', loginGoogle);
on('btnOpenMonth', 'click', openSelectedMonth);
on('menuToggle', 'click', () => $('sidebar')?.classList.toggle('open'));
on('btnLogoutMobile', 'click', () => auth && signOut(auth));
on('importBackup', 'change', e => importBackup(e.target.files[0]));

setupMonthSelectors();
ensureMonth();
render();
initFirebase();
