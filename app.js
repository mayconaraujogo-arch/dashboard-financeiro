import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { getFirestore, doc, setDoc, onSnapshot, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';

const money = v => (Number(v)||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const uid = () => crypto.randomUUID();

const configured = firebaseConfig.apiKey && firebaseConfig.apiKey !== 'COLE_AQUI';
if(!configured){
  document.getElementById('topStatus').textContent = '⚠️ Firebase não configurado: preencha firebase-config.js';
}

let firebaseApp, db, auth, provider;
try{
  firebaseApp = initializeApp(firebaseConfig);
  db = getFirestore(firebaseApp);
  auth = getAuth(firebaseApp);
  provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
}catch(err){
  console.error(err);
  document.getElementById('topStatus').textContent = '⚠️ Erro ao iniciar Firebase. Confira firebase-config.js';
}

const emptyState = () => ({
  salario: 0,
  contas: [],
  gastos: [],
  parcelas: [],
  metas: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
});

let state = emptyState();
let currentUser = null;
let userRef = null;
let unsubscribeCloud = null;
let applyingCloud = false;
let chartCat = null;
let chartDist = null;

async function loginGoogle(){
  try{
    await signInWithPopup(auth, provider);
  }catch(err){
    console.warn('Popup falhou, tentando redirect:', err);
    await signInWithRedirect(auth, provider);
  }
}

document.getElementById('btnLogin').addEventListener('click', loginGoogle);
document.getElementById('btnLogout').addEventListener('click', () => signOut(auth));
document.getElementById('btnLogoutMobile').addEventListener('click', () => signOut(auth));
document.getElementById('menuToggle').addEventListener('click', () => document.getElementById('sidebar').classList.toggle('open'));

getRedirectResult(auth).catch(err => console.warn('Redirect result:', err));

onAuthStateChanged(auth, async (user) => {
  currentUser = user;

  if(!user){
    document.getElementById('loginScreen').classList.remove('hidden');
    document.getElementById('appScreen').classList.add('hidden');
    document.getElementById('topStatus').textContent = '🔐 Faça login com Google para sincronizar seus dados';
    if(unsubscribeCloud) unsubscribeCloud();
    return;
  }

  const firstName = (user.displayName || user.email || 'Usuário').split(' ')[0];
  const letter = firstName.charAt(0).toUpperCase() || 'U';

  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('appScreen').classList.remove('hidden');
  document.getElementById('topStatus').textContent = `☁️ Sincronizado com Google — ${firstName}`;
  document.getElementById('brandName').textContent = firstName;
  document.getElementById('mobileName').textContent = firstName;
  document.getElementById('userFirstName').textContent = firstName;
  document.getElementById('userEmail').textContent = user.email || '';
  document.getElementById('welcomeText').textContent = `Olá, ${firstName}!`;
  document.getElementById('avatarLetter').textContent = letter;
  document.getElementById('userPhoto').src = user.photoURL || '';

  userRef = doc(db, 'users', user.uid);
  const snap = await getDoc(userRef);

  if(!snap.exists()){
    state = emptyState();
    await setDoc(userRef, { owner: user.uid, data: state, updatedAt: state.updatedAt });
  }

  if(unsubscribeCloud) unsubscribeCloud();
  unsubscribeCloud = onSnapshot(userRef, (docSnap) => {
    if(!docSnap.exists()) return;
    applyingCloud = true;
    state = docSnap.data().data || emptyState();
    render();
    applyingCloud = false;
  }, (err) => {
    console.error('Firestore permission:', err);
    document.getElementById('topStatus').textContent = '⚠️ Erro de permissão no Firestore. Confira as regras.';
  });
});

async function save(){
  render();
  if(!userRef || !currentUser || applyingCloud) return;
  state.updatedAt = new Date().toISOString();
  await setDoc(userRef, { owner: currentUser.uid, data: state, updatedAt: state.updatedAt });
}

function totals(){
  const fixos = state.contas.reduce((a,b)=>a+Number(b.valor||0),0);
  const gastos = state.gastos.reduce((a,b)=>a+Number(b.valor||0),0);
  const dividas = state.parcelas.reduce((a,b)=>a+Number(b.valor||0),0);
  const sobra = Number(state.salario||0) - fixos - gastos - dividas;
  const reserva = state.metas.find(m => m.nome.toLowerCase().includes('reserva'))?.atual || 0;
  const economia = state.salario ? Math.max(0, Math.round((sobra/state.salario)*100)) : 0;
  return {fixos,gastos,dividas,sobra,reserva,economia};
}

function go(page){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav').forEach(n=>n.classList.remove('active'));
  document.getElementById(page).classList.add('active');
  document.querySelector(`[data-page="${page}"]`)?.classList.add('active');
  document.getElementById('pageTitle').textContent = document.querySelector(`[data-page="${page}"]`)?.textContent.replace(/[^\wÀ-ÿ ]/g,'').trim() || 'Dashboard';
  document.getElementById('sidebar').classList.remove('open');
}

document.querySelectorAll('.nav').forEach(btn => btn.addEventListener('click', () => go(btn.dataset.page)));
document.querySelectorAll('[data-go]').forEach(btn => btn.addEventListener('click', () => go(btn.dataset.go)));

document.getElementById('addConta').addEventListener('click', () => {
  if(!contaNome.value || !contaValor.value) return alert('Preencha nome e valor.');
  state.contas.push({id:uid(), nome:contaNome.value, valor:+contaValor.value, dia:+contaDia.value||5, status:contaStatus.value});
  contaNome.value = contaValor.value = contaDia.value = '';
  save();
});

document.getElementById('addGasto').addEventListener('click', () => {
  if(!gastoDesc.value || !gastoValor.value) return alert('Preencha descrição e valor.');
  state.gastos.unshift({id:uid(), desc:gastoDesc.value, valor:+gastoValor.value, cat:gastoCat.value, data:new Date().toISOString()});
  gastoDesc.value = gastoValor.value = '';
  save();
});

document.getElementById('addParcela').addEventListener('click', () => {
  if(!parcelaNome.value || !parcelaValor.value) return alert('Preencha nome e valor.');
  state.parcelas.push({id:uid(), nome:parcelaNome.value, valor:+parcelaValor.value, restam: parcelaRestam.value ? +parcelaRestam.value : null});
  parcelaNome.value = parcelaValor.value = parcelaRestam.value = '';
  save();
});

document.getElementById('addMeta').addEventListener('click', () => {
  if(!metaNome.value || !metaObjetivo.value) return alert('Preencha nome e objetivo.');
  state.metas.push({id:uid(), nome:metaNome.value, atual:+metaAtual.value||0, objetivo:+metaObjetivo.value});
  metaNome.value = metaAtual.value = metaObjetivo.value = '';
  save();
});

document.getElementById('saveSalario').addEventListener('click', () => {
  state.salario = +salarioInput.value || 0;
  save();
});

window.del = (type, itemId) => {
  state[type] = state[type].filter(x => x.id !== itemId);
  save();
};

window.statusConta = (itemId, val) => {
  const item = state.contas.find(x => x.id === itemId);
  if(item) item.status = val;
  save();
};

window.pagarParcela = (itemId) => {
  const item = state.parcelas.find(x => x.id === itemId);
  if(item && item.restam !== null && item.restam > 0) item.restam--;
  save();
};

window.updateGoal = (itemId) => {
  const item = state.metas.find(x => x.id === itemId);
  const input = document.getElementById('goal-' + itemId);
  if(item){
    item.atual = +input.value || 0;
    save();
  }
};

document.getElementById('exportar').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state,null,2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'backup-financas-v5.json';
  a.click();
});

document.getElementById('importar').addEventListener('change', async e => {
  const file = e.target.files[0];
  if(!file) return;
  try{
    state = JSON.parse(await file.text());
    await save();
    alert('Backup importado!');
  }catch{
    alert('Arquivo inválido.');
  }
});

document.getElementById('resetar').addEventListener('click', () => {
  if(confirm('Resetar somente seus dados?')){
    state = emptyState();
    save();
  }
});

function renderContas(){
  listaContas.innerHTML = state.contas.map(c => `<div class="row"><div><strong>${c.nome}</strong><small>${money(c.valor)} • vence dia ${c.dia}</small></div><select class="status ${c.status}" onchange="statusConta('${c.id}',this.value)">${['Pago','Pendente','Atrasado'].map(s=>`<option ${c.status===s?'selected':''}>${s}</option>`).join('')}</select><button class="icon" onclick="del('contas','${c.id}')">Excluir</button></div>`).join('') || '<p class="muted">Nenhuma conta cadastrada.</p>';

  dashContas.innerHTML = state.contas.slice().sort((a,b)=>a.dia-b.dia).slice(0,6).map(c => `<div class="row"><div><strong>${c.nome}</strong><small>${money(c.valor)} • dia ${c.dia}</small></div><span class="status ${c.status}">${c.status}</span><span></span></div>`).join('') || '<p class="muted">Adicione suas primeiras contas.</p>';

  const pagas = state.contas.filter(c => c.status === 'Pago').length;
  contasPagasResumo.textContent = `${pagas}/${state.contas.length} pagas`;
}

function renderGastos(){
  totalGastos.textContent = money(state.gastos.reduce((a,b)=>a+Number(b.valor||0),0));
  listaGastos.innerHTML = state.gastos.map(g => `<div class="row"><div><strong>${g.desc}</strong><small>${g.cat} • ${new Date(g.data).toLocaleDateString('pt-BR')}</small></div><strong>${money(g.valor)}</strong><button class="icon" onclick="del('gastos','${g.id}')">Excluir</button></div>`).join('') || '<p class="muted">Nenhum gasto lançado.</p>';
}

function renderParcelas(){
  totalParcelas.textContent = money(state.parcelas.reduce((a,b)=>a+Number(b.valor||0),0));
  listaParcelas.innerHTML = state.parcelas.map(p => `<div class="row"><div><strong>${p.nome}</strong><small>${money(p.valor)} por mês • ${p.restam===null?'restante não informado':p.restam+' parcelas restantes'}</small></div><button class="icon" onclick="pagarParcela('${p.id}')">Baixar 1</button><button class="icon" onclick="del('parcelas','${p.id}')">Excluir</button></div>`).join('') || '<p class="muted">Nenhum parcelamento.</p>';
}

function goalCard(m){
  const pct = m.objetivo ? Math.min(100, Math.round((m.atual/m.objetivo)*100)) : 0;
  return `<div class="goal"><div class="goal-top"><strong>${m.nome}</strong><span>${pct}%</span></div><div class="bar"><div style="width:${pct}%"></div></div><div class="goal-foot"><span>${money(m.atual)}</span><span>${money(m.objetivo)}</span></div><div class="goal-edit"><input id="goal-${m.id}" type="number" step="0.01" placeholder="Novo valor atual"><button class="btn glass" onclick="updateGoal('${m.id}')">Atualizar</button><button class="btn danger" onclick="del('metas','${m.id}')">Excluir</button></div></div>`;
}

function renderMetas(){
  listaMetas.innerHTML = state.metas.map(goalCard).join('') || '<p class="muted">Nenhuma meta cadastrada.</p>';
  dashMetas.innerHTML = state.metas.slice(0,3).map(goalCard).join('') || '<p class="muted">Adicione metas para acompanhar o progresso.</p>';
}

function renderAlerts(t){
  let alerts = [];
  state.contas.filter(c=>c.status==='Atrasado').forEach(c => alerts.push(`<div class="alert red"><strong>${c.nome}</strong><br><span>Conta marcada como atrasada.</span></div>`));
  state.contas.filter(c=>c.status==='Pendente' && c.dia<=10).slice(0,3).forEach(c => alerts.push(`<div class="alert yellow"><strong>${c.nome}</strong><br><span>Vence no início do mês.</span></div>`));
  if(t.sobra < 0) alerts.push(`<div class="alert red"><strong>Atenção</strong><br><span>Seu mês está negativo em ${money(Math.abs(t.sobra))}.</span></div>`);
  if(!alerts.length) alerts.push(`<div class="alert"><strong>Tudo certo</strong><br><span>Nenhum alerta crítico agora.</span></div>`);
  alertas.innerHTML = alerts.join('');
}

function renderCharts(t){
  const cats = {};
  state.gastos.forEach(g => cats[g.cat] = (cats[g.cat]||0) + Number(g.valor||0));

  if(chartCat) chartCat.destroy();
  chartCat = new Chart(chartCategorias, {
    type:'doughnut',
    data:{
      labels:Object.keys(cats).length ? Object.keys(cats) : ['Sem gastos'],
      datasets:[{data:Object.values(cats).length ? Object.values(cats) : [1], backgroundColor:['#820AD1','#a855f7','#c084fc','#22c55e','#facc15','#ef4444','#6d28d9'], borderWidth:0}]
    },
    options:{plugins:{legend:{labels:{color:'#fff',font:{weight:'bold'}}}}}
  });

  if(chartDist) chartDist.destroy();
  chartDist = new Chart(chartDistribuicao, {
    type:'bar',
    data:{labels:['Contas','Gastos','Dívidas','Sobra'],datasets:[{data:[t.fixos,t.gastos,t.dividas,Math.max(0,t.sobra)],backgroundColor:['#820AD1','#a855f7','#c084fc','#22c55e'],borderRadius:12}]},
    options:{plugins:{legend:{display:false}},scales:{x:{ticks:{color:'#fff'},grid:{display:false}},y:{ticks:{color:'#fff'},grid:{color:'rgba(255,255,255,.08)'}}}}
  });
}

function render(){
  const t = totals();

  sidebarSobra.textContent = money(t.sobra);
  sidebarStatus.textContent = t.sobra >= 0 ? 'Dentro do plano' : 'Mês negativo';
  saldoHero.textContent = money(t.sobra);
  economiaPct.textContent = t.economia + '%';
  ring.style.setProperty('--pct', t.economia + '%');
  fraseHero.textContent = t.sobra >= 0 ? 'Boa, você ainda tem saldo previsto no mês.' : 'Atenção: seus gastos passaram do salário.';

  kpiSalario.textContent = money(state.salario);
  kpiFixos.textContent = money(t.fixos);
  kpiExtras.textContent = money(t.gastos);
  kpiDividas.textContent = money(t.dividas);
  kpiReserva.textContent = money(t.reserva);
  salarioInput.value = state.salario;

  renderContas();
  renderGastos();
  renderParcelas();
  renderMetas();
  renderAlerts(t);
  renderCharts(t);
}
