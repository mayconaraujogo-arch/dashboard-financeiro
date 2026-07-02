import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { getFirestore, doc, setDoc, onSnapshot, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';

const money = v => (Number(v)||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const uid = () => crypto.randomUUID();
const monthNames = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const now = new Date();
let selectedYear = now.getFullYear();
let selectedMonth = now.getMonth()+1;

const firebaseConfigured = firebaseConfig && firebaseConfig.apiKey && firebaseConfig.apiKey !== 'COLE_AQUI';
if(!firebaseConfigured){
  topStatus.textContent = '⚠️ Firebase não configurado. Preencha firebase-config.js antes de publicar.';
}

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
const auth = getAuth(firebaseApp);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });

let state = emptyState();
let currentUser = null;
let userRef = null;
let unsubscribeCloud = null;
let applyingCloud = false;
let chartCat = null, chartDist = null, chartYear = null;
let editContext = null;

function monthKey(y=selectedYear,m=selectedMonth){ return `${y}-${String(m).padStart(2,'0')}`; }
function addMonths(key, add){
  const [y,m] = key.split('-').map(Number);
  const d = new Date(y, m-1+add, 1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}
function monthsDiff(startKey, targetKey){
  const [sy,sm]=startKey.split('-').map(Number);
  const [ty,tm]=targetKey.split('-').map(Number);
  return (ty-sy)*12 + (tm-sm);
}
function emptyMonth(y,m){ return { key:monthKey(y,m), year:y, month:m, salario:0, contas:[], gastos:[], receitas:[], createdAt:new Date().toISOString(), updatedAt:new Date().toISOString() }; }
function emptyState(){
  return { version:7, settings:{salarioPadrao:0,diaPagamento:5,onboardingDone:false}, baseBills:[], months:{}, installments:[], cards:[], cardPurchases:[], goals:[], createdAt:new Date().toISOString(), updatedAt:new Date().toISOString(), lastSync:null };
}
function ensureMonth(y=selectedYear,m=selectedMonth){
  const key = monthKey(y,m);
  if(!state.months[key]){
    state.months[key]=emptyMonth(y,m);
    state.months[key].salario = state.settings.salarioPadrao || 0;
    state.months[key].contas = (state.baseBills||[]).map(f=>({ id:uid(), baseId:f.id, nome:f.nome, valor:Number(f.valor||0), dia:Number(f.dia||5), status:'Pendente' }));
  }
  return state.months[key];
}
function currentMonthData(){ return ensureMonth(); }

async function loginGoogle(){
  try{ await signInWithPopup(auth, provider); }
  catch(err){ console.warn('Popup falhou, tentando redirect:', err); await signInWithRedirect(auth, provider); }
}
btnLogin.onclick=loginGoogle;
btnLogout.onclick=()=>signOut(auth);
btnLogoutMobile.onclick=()=>signOut(auth);
menuToggle.onclick=()=>sidebar.classList.toggle('open');
getRedirectResult(auth).catch(err=>console.warn('Redirect:',err));

onAuthStateChanged(auth, async user=>{
  currentUser=user;
  if(!user){
    loginScreen.classList.remove('hidden'); appScreen.classList.add('hidden');
    topStatus.textContent='🔐 Faça login com Google para sincronizar seus dados';
    if(unsubscribeCloud) unsubscribeCloud();
    return;
  }
  const firstName=(user.displayName||user.email||'Usuário').split(' ')[0];
  loginScreen.classList.add('hidden'); appScreen.classList.remove('hidden');
  topStatus.textContent=`☁️ Sincronizado com Google — ${firstName}`;
  brandName.textContent=firstName; mobileName.textContent=firstName; userFirstName.textContent=firstName; userEmail.textContent=user.email||''; welcomeText.textContent=`Olá, ${firstName}!`; avatarLetter.textContent=(firstName[0]||'U').toUpperCase(); userPhoto.src=user.photoURL||'';
  userRef=doc(db,'users',user.uid);
  const snap=await getDoc(userRef);
  if(!snap.exists()){ state=emptyState(); await setDoc(userRef,{owner:user.uid,data:state,updatedAt:state.updatedAt}); }
  if(unsubscribeCloud) unsubscribeCloud();
  unsubscribeCloud=onSnapshot(userRef,docSnap=>{
    if(!docSnap.exists()) return;
    applyingCloud=true;
    state=migrateState(docSnap.data().data || emptyState());
    ensureMonth(); render();
    applyingCloud=false;
  },err=>{ console.error(err); topStatus.textContent='⚠️ Erro de permissão no Firestore. Confira as regras.'; });
});

function migrateState(data){
  if(data.version===7) return data;
  const n=emptyState();
  n.settings.salarioPadrao = data.settings?.salarioPadrao || data.base?.salarioPadrao || data.salario || 0;
  n.baseBills = (data.baseBills || data.base?.contasFixas || data.contas || []).map(c=>({id:uid(),nome:c.nome,valor:Number(c.valor||0),dia:Number(c.dia||5)}));
  n.goals = data.goals || data.metas || [];
  n.installments = data.installments || data.parcelas || [];
  n.months = data.months || {};
  Object.values(n.months).forEach(m=>{ if(!m.receitas) m.receitas=[]; });
  return n;
}
async function save(){
  render();
  if(!userRef || !currentUser || applyingCloud) return;
  state.updatedAt=new Date().toISOString(); state.lastSync=new Date().toISOString();
  await setDoc(userRef,{owner:currentUser.uid,data:state,updatedAt:state.updatedAt});
}

function activeInstallmentsForMonth(key=monthKey()){
  return (state.installments||[]).filter(p=>{
    const start=p.startMonth || monthKey();
    const diff=monthsDiff(start,key);
    return diff>=0 && diff<Number(p.total||p.restam||1);
  }).map(p=>({...p, parcelaAtual:monthsDiff(p.startMonth||key,key)+1, total:Number(p.total||p.restam||1)}));
}
function cardPurchaseValueForMonth(p,key=monthKey()){
  const diff=monthsDiff(p.monthKey,key);
  const total=Number(p.installments||1);
  if(diff<0 || diff>=total) return 0;
  return Number(p.value||0)/total;
}
function cardTotalForMonth(key=monthKey()){
  return (state.cardPurchases||[]).reduce((sum,p)=>sum+cardPurchaseValueForMonth(p,key),0);
}
function totals(){
  const m=currentMonthData(); const key=monthKey();
  const contas=m.contas.reduce((a,b)=>a+Number(b.valor||0),0);
  const gastos=m.gastos.reduce((a,b)=>a+Number(b.valor||0),0);
  const receitas=m.receitas.reduce((a,b)=>a+Number(b.valor||0),0);
  const parcelas=activeInstallmentsForMonth(key).reduce((a,b)=>a+Number(b.valor||0),0);
  const cartoes=cardTotalForMonth(key);
  const salario=Number(m.salario||0);
  const entrada=salario+receitas;
  const saida=contas+gastos+parcelas+cartoes;
  const sobra=entrada-saida;
  const reserva=(state.goals||[]).find(x=>x.nome?.toLowerCase().includes('reserva'))?.atual||0;
  const economia=entrada?Math.max(0,Math.round((sobra/entrada)*100)):0;
  return {salario,receitas,entrada,contas,gastos,parcelas,cartoes,dividas:parcelas+cartoes,saida,sobra,reserva,economia};
}
function setupMonthSelectors(){
  monthSelect.innerHTML=monthNames.map((n,i)=>`<option value="${i+1}">${n}</option>`).join('');
  const y=new Date().getFullYear();
  yearSelect.innerHTML=Array.from({length:9},(_,i)=>y-3+i).map(v=>`<option value="${v}">${v}</option>`).join('');
  monthSelect.value=selectedMonth; yearSelect.value=selectedYear;
}
function openSelectedMonth(){ selectedMonth=Number(monthSelect.value); selectedYear=Number(yearSelect.value); ensureMonth(); save(); }
btnGoMonth.onclick=openSelectedMonth;
btnNextMonth.onclick=()=>{ selectedMonth++; if(selectedMonth>12){selectedMonth=1; selectedYear++;} monthSelect.value=selectedMonth; yearSelect.value=selectedYear; ensureMonth(); save(); };
btnResetStatus.onclick=()=>{ if(confirm('Resetar todos os status deste mês para Pendente?')){ currentMonthData().contas.forEach(c=>c.status='Pendente'); save(); } };
btnResetMonth.onclick=()=>{ if(confirm('Resetar o mês inteiro? Apaga gastos/receitas extras e recria contas pela base fixa.')){ const key=monthKey(); state.months[key]=emptyMonth(selectedYear,selectedMonth); state.months[key].salario=state.settings.salarioPadrao||0; state.months[key].contas=(state.baseBills||[]).map(f=>({id:uid(),baseId:f.id,nome:f.nome,valor:Number(f.valor||0),dia:Number(f.dia||5),status:'Pendente'})); save(); } };
btnNotify.onclick=async()=>{ if(!('Notification' in window)) return alert('Seu navegador não suporta notificações.'); const p=await Notification.requestPermission(); alert(p==='granted'?'Lembretes permitidos.':'Permissão negada.'); };

function go(page){ document.querySelectorAll('.page').forEach(p=>p.classList.remove('active')); document.querySelectorAll('.nav').forEach(n=>n.classList.remove('active')); document.getElementById(page).classList.add('active'); document.querySelector(`[data-page="${page}"]`)?.classList.add('active'); pageTitle.textContent=document.querySelector(`[data-page="${page}"]`)?.textContent.replace(/[^\wÀ-ÿ ]/g,'').trim()||'Dashboard'; sidebar.classList.remove('open'); }
document.querySelectorAll('.nav').forEach(btn=>btn.onclick=()=>go(btn.dataset.page));
document.querySelectorAll('[data-go]').forEach(btn=>btn.onclick=()=>go(btn.dataset.go));

btnSetupDemo.onclick=()=>{ setupSalario.value=3062; setupDiaPagamento.value=5; setupReserva.value=7500; setupFaculdade.value=10000; };
btnSetupApply.onclick=()=>{
  state.settings.salarioPadrao=Number(setupSalario.value||0);
  state.settings.diaPagamento=Number(setupDiaPagamento.value||5);
  if(setupReserva.value) state.goals.push({id:uid(),nome:'Reserva de emergência',atual:0,objetivo:Number(setupReserva.value)});
  if(setupFaculdade.value) state.goals.push({id:uid(),nome:'Faculdade',atual:0,objetivo:Number(setupFaculdade.value)});
  state.settings.onboardingDone=true; currentMonthData().salario=state.settings.salarioPadrao; save();
};

addConta.onclick=()=>{ if(!contaNome.value||!contaValor.value)return alert('Preencha nome e valor.'); currentMonthData().contas.push({id:uid(),nome:contaNome.value,valor:+contaValor.value,dia:+contaDia.value||5,status:contaStatus.value}); contaNome.value=contaValor.value=contaDia.value=''; save(); };
addFixa.onclick=()=>{ if(!fixaNome.value||!fixaValor.value)return alert('Preencha nome e valor.'); state.baseBills.push({id:uid(),nome:fixaNome.value,valor:+fixaValor.value,dia:+fixaDia.value||5}); fixaNome.value=fixaValor.value=fixaDia.value=''; save(); };
addGasto.onclick=()=>{ if(!gastoDesc.value||!gastoValor.value)return alert('Preencha descrição e valor.'); currentMonthData().gastos.unshift({id:uid(),desc:gastoDesc.value,valor:+gastoValor.value,cat:gastoCat.value,data:new Date().toISOString()}); gastoDesc.value=gastoValor.value=''; save(); };
addReceita.onclick=()=>{ if(!receitaDesc.value||!receitaValor.value)return alert('Preencha descrição e valor.'); currentMonthData().receitas.unshift({id:uid(),desc:receitaDesc.value,valor:+receitaValor.value,cat:receitaCat.value,data:new Date().toISOString()}); receitaDesc.value=receitaValor.value=''; save(); };
addParcela.onclick=()=>{ if(!parcelaNome.value||!parcelaValor.value||!parcelaTotal.value)return alert('Preencha nome, valor e total.'); state.installments.push({id:uid(),nome:parcelaNome.value,valor:+parcelaValor.value,total:+parcelaTotal.value,startMonth:parcelaInicio.value||monthKey()}); parcelaNome.value=parcelaValor.value=parcelaTotal.value=parcelaInicio.value=''; save(); };
addCard.onclick=()=>{ if(!cardNome.value||!cardLimite.value)return alert('Preencha nome e limite.'); state.cards.push({id:uid(),nome:cardNome.value,limite:+cardLimite.value,vencimento:+cardVencimento.value||10}); cardNome.value=cardLimite.value=cardVencimento.value=''; save(); };
addCardCompra.onclick=()=>{ if(!cardCompraId.value||!cardCompraDesc.value||!cardCompraValor.value)return alert('Preencha cartão, descrição e valor.'); state.cardPurchases.push({id:uid(),cardId:cardCompraId.value,desc:cardCompraDesc.value,value:+cardCompraValor.value,installments:+cardCompraParcelas.value||1,monthKey:monthKey(),createdAt:new Date().toISOString()}); cardCompraDesc.value=cardCompraValor.value=cardCompraParcelas.value=''; save(); };
addMeta.onclick=()=>{ if(!metaNome.value||!metaObjetivo.value)return alert('Preencha nome e objetivo.'); state.goals.push({id:uid(),nome:metaNome.value,atual:+metaAtual.value||0,objetivo:+metaObjetivo.value}); metaNome.value=metaAtual.value=metaObjetivo.value=''; save(); };
saveSalario.onclick=()=>{ const v=+salarioInput.value||0; currentMonthData().salario=v; state.settings.salarioPadrao=v; save(); };

window.statusConta=(id,val)=>{ const c=currentMonthData().contas.find(x=>x.id===id); if(c)c.status=val; save(); };
window.delMonthItem=(type,id)=>{ currentMonthData()[type]=currentMonthData()[type].filter(x=>x.id!==id); save(); };
window.delGlobal=(type,id)=>{ if(type==='baseBills')state.baseBills=state.baseBills.filter(x=>x.id!==id); else state[type]=state[type].filter(x=>x.id!==id); save(); };
window.delCardPurchase=id=>{ state.cardPurchases=state.cardPurchases.filter(x=>x.id!==id); save(); };
window.updateGoal=id=>{ const g=state.goals.find(x=>x.id===id); const input=document.getElementById('goal-'+id); if(g){g.atual=+input.value||0; save();} };
window.openHistoryMonth=key=>{ const [y,m]=key.split('-').map(Number); selectedYear=y; selectedMonth=m; monthSelect.value=m; yearSelect.value=y; ensureMonth(); go('dashboard'); render(); };

function openEdit(title, fields, onSave){
  editTitle.textContent=title; editFields.innerHTML='';
  fields.forEach(f=>{
    const wrap=document.createElement('div');
    wrap.innerHTML=`<label>${f.label}</label><input id="edit-${f.key}" type="${f.type||'text'}" step="0.01" value="${f.value??''}">`;
    editFields.appendChild(wrap);
  });
  editContext={fields,onSave}; editDialog.showModal();
}
btnEditSave.onclick=e=>{
  e.preventDefault();
  if(!editContext)return;
  const values={};
  editContext.fields.forEach(f=>{ values[f.key]=document.getElementById('edit-'+f.key).value; });
  editContext.onSave(values); editDialog.close(); editContext=null; save();
};
window.editBaseBill=id=>{ const f=state.baseBills.find(x=>x.id===id); openEdit('Editar fixa base',[{key:'nome',label:'Nome',value:f.nome},{key:'valor',label:'Valor',type:'number',value:f.valor},{key:'dia',label:'Dia vencimento',type:'number',value:f.dia}],v=>{f.nome=v.nome;f.valor=+v.valor;f.dia=+v.dia||5;}); };
window.editMonthBill=id=>{ const c=currentMonthData().contas.find(x=>x.id===id); openEdit('Editar conta do mês',[{key:'nome',label:'Nome',value:c.nome},{key:'valor',label:'Valor',type:'number',value:c.valor},{key:'dia',label:'Dia vencimento',type:'number',value:c.dia}],v=>{c.nome=v.nome;c.valor=+v.valor;c.dia=+v.dia||5;}); };
window.editSimple=(type,id)=>{ const arr=currentMonthData()[type]; const it=arr.find(x=>x.id===id); openEdit('Editar item',[{key:'desc',label:'Descrição',value:it.desc},{key:'valor',label:'Valor',type:'number',value:it.valor}],v=>{it.desc=v.desc;it.valor=+v.valor;}); };

exportar.onclick=()=>{ const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='backup-financas-v7.json'; a.click(); };
importar.onchange=async e=>{ const f=e.target.files[0]; if(!f)return; try{ state=migrateState(JSON.parse(await f.text())); await save(); alert('Backup importado!'); }catch{ alert('Arquivo inválido.'); } };
resetar.onclick=()=>{ if(confirm('Resetar a conta completa deste usuário?')){ state=emptyState(); save(); } };

function renderContas(){
  const m=currentMonthData();
  listaContas.innerHTML=m.contas.map(c=>`<div class="row"><div><strong>${c.nome}</strong><small>${money(c.valor)} • vence dia ${c.dia}</small></div><select class="status ${c.status}" onchange="statusConta('${c.id}',this.value)">${['Pago','Pendente','Atrasado'].map(s=>`<option ${c.status===s?'selected':''}>${s}</option>`).join('')}</select><button class="icon" onclick="editMonthBill('${c.id}')">Editar</button><button class="icon" onclick="delMonthItem('contas','${c.id}')">Excluir</button></div>`).join('')||'<p class="muted">Nenhuma conta neste mês.</p>';
  dashContas.innerHTML=m.contas.slice().sort((a,b)=>a.dia-b.dia).slice(0,6).map(c=>`<div class="row"><div><strong>${c.nome}</strong><small>${money(c.valor)} • dia ${c.dia}</small></div><span class="status ${c.status}">${c.status}</span><span></span><span></span></div>`).join('')||'<p class="muted">Adicione contas ou fixas base.</p>';
  const pagas=m.contas.filter(c=>c.status==='Pago').length; contasPagasResumo.textContent=`${pagas}/${m.contas.length} pagas`;
}
function renderFixas(){
  listaFixas.innerHTML=state.baseBills.map(f=>`<div class="row"><div><strong>${f.nome}</strong><small>${money(f.valor)} • vence dia ${f.dia}</small></div><span class="badge">Base</span><button class="icon" onclick="editBaseBill('${f.id}')">Editar</button><button class="icon" onclick="delGlobal('baseBills','${f.id}')">Excluir</button></div>`).join('')||'<p class="muted">Nenhuma fixa base cadastrada.</p>';
}
function renderGastos(){
  const m=currentMonthData(); totalGastos.textContent=money(m.gastos.reduce((a,b)=>a+Number(b.valor||0),0));
  listaGastos.innerHTML=m.gastos.map(g=>`<div class="row"><div><strong>${g.desc}</strong><small>${g.cat} • ${new Date(g.data).toLocaleDateString('pt-BR')}</small></div><strong>${money(g.valor)}</strong><button class="icon" onclick="editSimple('gastos','${g.id}')">Editar</button><button class="icon" onclick="delMonthItem('gastos','${g.id}')">Excluir</button></div>`).join('')||'<p class="muted">Nenhum gasto extra neste mês.</p>';
}
function renderReceitas(){
  const m=currentMonthData(); totalReceitas.textContent=money(m.receitas.reduce((a,b)=>a+Number(b.valor||0),0));
  listaReceitas.innerHTML=m.receitas.map(r=>`<div class="row"><div><strong>${r.desc}</strong><small>${r.cat} • ${new Date(r.data).toLocaleDateString('pt-BR')}</small></div><strong>${money(r.valor)}</strong><button class="icon" onclick="editSimple('receitas','${r.id}')">Editar</button><button class="icon" onclick="delMonthItem('receitas','${r.id}')">Excluir</button></div>`).join('')||'<p class="muted">Nenhuma receita extra neste mês.</p>';
}
function renderParcelas(){
  totalParcelas.textContent=money(activeInstallmentsForMonth().reduce((a,b)=>a+Number(b.valor||0),0));
  listaParcelas.innerHTML=state.installments.map(p=>{ const active=activeInstallmentsForMonth().find(x=>x.id===p.id); return `<div class="row"><div><strong>${p.nome}</strong><small>${money(p.valor)} • ${p.total}x • início ${p.startMonth}</small></div><span class="badge">${active?'ativa '+active.parcelaAtual+'/'+active.total:'fora do mês'}</span><button class="icon" onclick="delGlobal('installments','${p.id}')">Excluir</button><span></span></div>`; }).join('')||'<p class="muted">Nenhum parcelamento.</p>';
}
function renderCards(){
  cardCompraId.innerHTML=(state.cards||[]).map(c=>`<option value="${c.id}">${c.nome}</option>`).join('');
  totalCartoes.textContent=money(cardTotalForMonth());
  const cardsHtml = (state.cards||[]).map(c=>{ const purchases=state.cardPurchases.filter(p=>p.cardId===c.id); const monthTotal=purchases.reduce((s,p)=>s+cardPurchaseValueForMonth(p),0); const usedAll=purchases.reduce((s,p)=>s+Number(p.value||0),0); return `<div class="row"><div><strong>${c.nome}</strong><small>Limite ${money(c.limite)} • vence dia ${c.vencimento}<br>Fatura do mês: ${money(monthTotal)} • comprado total: ${money(usedAll)}</small></div><span class="badge">${money((c.limite||0)-usedAll)} livre</span><button class="icon" onclick="delGlobal('cards','${c.id}')">Excluir</button><span></span></div>`; }).join('');
  const purchasesHtml = (state.cardPurchases||[]).map(p=>`<div class="row"><div><strong>${p.desc}</strong><small>Compra cartão • ${money(p.value)} em ${p.installments}x • mês inicial ${p.monthKey}</small></div><span class="badge">${money(cardPurchaseValueForMonth(p))} este mês</span><button class="icon" onclick="delCardPurchase('${p.id}')">Excluir</button><span></span></div>`).join('');
  listaCartoes.innerHTML = (cardsHtml + purchasesHtml) || '<p class="muted">Nenhum cartão cadastrado.</p>';
}
function goalCard(g){ const pct=g.objetivo?Math.min(100,Math.round((g.atual/g.objetivo)*100)):0; return `<div class="goal"><div class="goal-top"><strong>${g.nome}</strong><span>${pct}%</span></div><div class="bar"><div style="width:${pct}%"></div></div><div class="goal-foot"><span>${money(g.atual)}</span><span>${money(g.objetivo)}</span></div><div class="goal-edit"><input id="goal-${g.id}" type="number" step="0.01" placeholder="Novo valor atual"><button class="btn glass" onclick="updateGoal('${g.id}')">Atualizar</button><button class="btn danger" onclick="delGlobal('goals','${g.id}')">Excluir</button></div></div>`; }
function renderMetas(){ listaMetas.innerHTML=state.goals.map(goalCard).join('')||'<p class="muted">Nenhuma meta cadastrada.</p>'; dashMetas.innerHTML=state.goals.slice(0,3).map(goalCard).join('')||'<p class="muted">Adicione metas.</p>'; }
function renderHistory(){
  const keys=Object.keys(state.months).sort().reverse();
  listaHistorico.innerHTML=keys.map(k=>{ const m=state.months[k]; const t=totalsForKey(k); const pagas=m.contas.filter(c=>c.status==='Pago').length; return `<div class="history-card"><strong>${monthNames[m.month-1]} ${m.year}</strong><small>Entrada: ${money(t.entrada)}<br>Saída: ${money(t.saida)}<br>Sobra: ${money(t.sobra)}<br>Pagas: ${pagas}/${m.contas.length}</small><button class="btn glass" onclick="openHistoryMonth('${k}')">Abrir mês</button></div>`; }).join('')||'<p class="muted">Nenhum mês criado ainda.</p>';
}
function totalsForKey(key){
  const oldY=selectedYear, oldM=selectedMonth; const [y,m]=key.split('-').map(Number); selectedYear=y; selectedMonth=m; const t=totals(); selectedYear=oldY; selectedMonth=oldM; return t;
}
function renderAlerts(t){
  const m=currentMonthData(); let arr=[];
  m.contas.filter(c=>c.status==='Atrasado').forEach(c=>arr.push(`<div class="alert red"><strong>${c.nome}</strong><br><span>Está atrasada neste mês.</span></div>`));
  m.contas.filter(c=>c.status==='Pendente'&&c.dia<=10).slice(0,3).forEach(c=>arr.push(`<div class="alert yellow"><strong>${c.nome}</strong><br><span>Vence no início do mês.</span></div>`));
  if(t.sobra<0)arr.push(`<div class="alert red"><strong>Atenção</strong><br><span>Mês negativo em ${money(Math.abs(t.sobra))}.</span></div>`);
  if(!arr.length)arr.push(`<div class="alert"><strong>Tudo certo</strong><br><span>Nenhum alerta crítico neste mês.</span></div>`);
  alertas.innerHTML=arr.join('');
}
function renderCharts(t){
  const cats={}; currentMonthData().gastos.forEach(g=>cats[g.cat]=(cats[g.cat]||0)+Number(g.valor||0));
  if(chartCat)chartCat.destroy(); chartCat=new Chart(chartCategorias,{type:'doughnut',data:{labels:Object.keys(cats).length?Object.keys(cats):['Sem gastos'],datasets:[{data:Object.values(cats).length?Object.values(cats):[1],backgroundColor:['#820AD1','#a855f7','#c084fc','#22c55e','#facc15','#ef4444','#6d28d9'],borderWidth:0}]},options:{plugins:{legend:{labels:{color:'#fff',font:{weight:'bold'}}}}}});
  if(chartDist)chartDist.destroy(); chartDist=new Chart(chartDistribuicao,{type:'bar',data:{labels:['Contas','Gastos','Parcelas','Cartões','Sobra'],datasets:[{data:[t.contas,t.gastos,t.parcelas,t.cartoes,Math.max(0,t.sobra)],backgroundColor:['#820AD1','#a855f7','#c084fc','#facc15','#22c55e'],borderRadius:12}]},options:{plugins:{legend:{display:false}},scales:{x:{ticks:{color:'#fff'},grid:{display:false}},y:{ticks:{color:'#fff'},grid:{color:'rgba(255,255,255,.08)'}}}}});
}
function renderAnnual(){
  const year=selectedYear; anoResumoLabel.textContent=String(year);
  const keys=Array.from({length:12},(_,i)=>`${year}-${String(i+1).padStart(2,'0')}`);
  const values=keys.map(k=>state.months[k]?totalsForKey(k):{entrada:0,saida:0,sobra:0});
  const rec=values.reduce((a,b)=>a+b.entrada,0), out=values.reduce((a,b)=>a+b.saida,0), saldo=values.reduce((a,b)=>a+b.sobra,0);
  anoReceitas.textContent=money(rec); anoGastos.textContent=money(out); anoSaldo.textContent=money(saldo);
  let best=values.map((v,i)=>({i,v:v.sobra})).sort((a,b)=>b.v-a.v)[0], worst=values.map((v,i)=>({i,v:v.sobra})).sort((a,b)=>a.v-b.v)[0];
  anoMelhor.textContent=best?monthNames[best.i]:'-'; anoPior.textContent=worst?monthNames[worst.i]:'-';
  if(chartYear)chartYear.destroy();
  chartYear=new Chart(chartAnual,{type:'line',data:{labels:monthNames,datasets:[{label:'Sobra',data:values.map(v=>v.sobra),borderColor:'#c084fc',backgroundColor:'rgba(192,132,252,.18)',fill:true,tension:.35}]},options:{plugins:{legend:{labels:{color:'#fff'}}},scales:{x:{ticks:{color:'#fff'},grid:{display:false}},y:{ticks:{color:'#fff'},grid:{color:'rgba(255,255,255,.08)'}}}}});
}
function render(){
  ensureMonth(); const t=totals(); const m=currentMonthData();
  currentMonthLabel.textContent=`${monthNames[selectedMonth-1]} de ${selectedYear}`; monthSelect.value=selectedMonth; yearSelect.value=selectedYear;
  sidebarSobra.textContent=money(t.sobra); sidebarStatus.textContent=t.sobra>=0?'Dentro do plano':'Mês negativo';
  saldoHero.textContent=money(t.sobra); economiaPct.textContent=t.economia+'%'; ring.style.setProperty('--pct',t.economia+'%'); fraseHero.textContent=t.sobra>=0?'Boa, você ainda tem saldo previsto neste mês.':'Atenção: seus gastos passaram da entrada deste mês.';
  kpiSalario.textContent=money(t.salario); kpiFixos.textContent=money(t.contas); kpiExtras.textContent=money(t.gastos); kpiDividas.textContent=money(t.dividas); kpiReserva.textContent=money(t.reserva);
  salarioInput.value=m.salario||state.settings.salarioPadrao||0; lastSyncLabel.textContent=state.lastSync?'Última sincronização: '+new Date(state.lastSync).toLocaleString('pt-BR'):'Aguardando sincronização...';
  renderContas(); renderFixas(); renderGastos(); renderReceitas(); renderParcelas(); renderCards(); renderMetas(); renderHistory(); renderAlerts(t); renderCharts(t); renderAnnual();
}
setupMonthSelectors(); ensureMonth();
